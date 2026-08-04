/**
 * Pulse Drive Mode -> current Pulse Driver Dashboard writer
 * ------------------------------------------------------------
 * Serves the owner-only driving console and writes normal field activity to:
 *   1. Shift Log — one row when the driver ends a shift.
 *   2. Trip Log — one idempotent row when a ride is completed.
 *
 * PULSE-068 removes the legacy test-workbook write path. The historical workbook is
 * preserved as an audit artifact but is no longer a runtime target.
 */

const HOY_SHEET_ID = '13m_9QDnIgXSdMBdtSYMjmyIdo55wh8F5Fl3_1JaYl-w';
const HOY_TZ = 'America/New_York';
const HOY_DEFAULT_COST = Object.freeze({ fuelPerGal: 3.5, mpg: 25, maintPerMile: 0.10, taxRate: 0.22 });
const HOY_BUILD = 'hoy-normal-flow-2026-07-29.5';
const RIDER_SHEET_ID = '1Hd46iUY84N2bvxdaIS4lf6l-uExxbXGIbUjxJzMF-No';
const RIDER_SHEET_NAME = 'Ride Requests';
const PULSE_LIVE_URL_DEFAULT = 'https://script.google.com/macros/s/AKfycbyde9C6y6iIoJO8AfWxt5z-D2FxwKXXMonpypmW8xaI7BZaAwChYBXM4JO7zqYvmw7Y/exec';
const REQUEST_APP_URL_PROPERTY = 'PULSE_REQUEST_APP_URL';
const REQUEST_APP_TOKEN_PROPERTY = 'PULSE_REQUEST_TOKEN';
const LIVE_URL_PROPERTY = 'PULSE_LIVE_URL';
const TRIP_LEDGER_KEY = 'PULSE_COMPLETED_TRIP_IDS_V1';
const TRIP_LEDGER_TTL_MS = 90 * 24 * 3600000;
const TRIP_NOTE_PREFIX = 'PULSE_RIDE_ID:';

/* ===== Entry points ===== */
function pulse069InjectForeground_(base, foreground) {
  const html = String(base || '');
  const client = String(foreground || '').trim();
  if (!client) throw new Error('ForegroundPickup client is empty.');
  const closingBody = /<\/body\s*>/gi;
  let match = null;
  let insertion = null;
  let count = 0;
  while ((match = closingBody.exec(html)) !== null) {
    insertion = match.index;
    count++;
    if (count > 1) break;
  }
  if (count !== 1 || insertion === null) {
    throw new Error('Index.html must contain exactly one closing body tag for ForegroundPickup injection; found ' + count + '.');
  }
  return html.slice(0, insertion) + client + '\n' + html.slice(insertion);
}

function doGet() {
  const base = HtmlService.createHtmlOutputFromFile('Index').getContent();
  const foreground = HtmlService.createHtmlOutputFromFile('ForegroundPickup').getContent();
  const html = pulse069InjectForeground_(base, foreground);
  return HtmlService.createHtmlOutput(html)
    .setTitle('Pulse Drive Mode')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Run this once to confirm everything resolves before a real shift. Writes nothing.
function checkWiring() {
  const ss = openHoy_();
  const sl = shiftLogSheet_(ss);
  const tl = tripLogSheet_(ss);
  const er = findSheetByHeaders_(ss, ['Event', 'Best Driver Window']);
  const cost = readCost_(ss);
  const rider = readRiderRequestsSafe_();
  return {
    ok: !!(sl && tl && !rider.error),
    hoySheetId: HOY_SHEET_ID,
    riderSheetId: RIDER_SHEET_ID,
    shiftLogTab: sl ? sl.getName() : 'NOT FOUND',
    tripLogTab: tl ? tl.getName() : 'NOT FOUND',
    eventRadarTab: er ? er.getName() : 'NOT FOUND',
    riderRequestsTab: rider.error ? 'NOT AVAILABLE' : RIDER_SHEET_NAME,
    riderReadError: rider.error || null,
    requestedRides: rider.items.filter(r => r.status === 'REQUESTED').length,
    confirmedRides: rider.items.filter(r => r.status === 'CONFIRMED').length,
    requestDecisionBridgeConfigured: requestDecisionBridgeConfigured_(),
    nextShiftRow: sl ? firstEmptyShiftRow_(sl) : null,
    nextTripRow: tl ? firstEmptyTripRow_(tl) : null,
    nextOpportunity: getNextOpportunity_(ss),
    costModel: cost,
    testWorkbookTargeted: false,
    writesPerformed: false
  };
}

// Called by the cockpit on load to show the live test target.
function getCockpitBootstrap() {
  const ss = openHoy_();
  const rider = readRiderRequestsSafe_();
  const requested = listRequestedRides_(rider.items);
  const linked = attachRequestDecisionLinksSafe_(requested);
  const reservations = attachRiderStatusStatesSafe_(listReservations_(rider.items));
  return {
    ok: true,
    build: HOY_BUILD,
    cost: readCost_(ss),
    opportunity: getNextOpportunity_(ss),
    reservations: reservations.items,
    riderStatusError: reservations.error || '',
    requests: linked.items,
    requestDecisionError: linked.error || '',
    liveUrl: pulseLiveUrl_(),
    riderReadError: rider.error || null,
    normalFlow: true,
    testWorkbookTargeted: false
  };
}

// Reads your curated Event Radar and returns the soonest upcoming event.
function getNextOpportunity() { return getNextOpportunity_(openHoy_()); }
function getNextOpportunity_(ss) {
  const sh = findSheetByHeaders_(ss, ['Event', 'Best Driver Window']);
  if (!sh) return null;
  const last = sh.getLastRow();
  if (last < 2) return null;
  const vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const ci = {
    date: colByHeader_(sh, 'Date'), event: colByHeader_(sh, 'Event'), loc: colByHeader_(sh, 'Location'),
    dem: colByHeader_(sh, 'Expected Demand'), win: colByHeader_(sh, 'Best Driver Window'),
    move: colByHeader_(sh, 'Driver Move'), url: colByHeader_(sh, 'Source URL')
  };
  if (ci.event < 1) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let pick = null, pickD = null, first = null;
  for (let i = 0; i < vals.length; i++) {
    const r = vals[i];
    if (!r[ci.event - 1]) continue;
    if (!first) first = r;
    const d = parseEventDate_(r[ci.date - 1]);
    if (d && d >= today && (pickD == null || d < pickD)) { pickD = d; pick = r; }
  }
  const r = pick || first;
  if (!r) return null;
  const g = c => (c > 0 ? String(r[c - 1] || '') : '');
  return { date: fmtEventDate_(r[ci.date - 1]), event: g(ci.event), location: g(ci.loc), demand: g(ci.dem), window: g(ci.win), move: g(ci.move), url: g(ci.url) };
}
function fmtEventDate_(v) {
  return (v instanceof Date && !isNaN(v.getTime())) ? Utilities.formatDate(v, HOY_TZ, 'EEE MMM d') : String(v || '');
}
function parseEventDate_(s) {
  const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  const parts = String(s).toLowerCase().split(/[\s,]+/);
  let mo = null, day = null;
  parts.forEach(p => { const k = p.slice(0, 3); if (months[k] != null) mo = months[k]; else if (/^\d{1,2}$/.test(p)) day = parseInt(p, 10); });
  if (mo == null || day == null) return null;
  return new Date(new Date().getFullYear(), mo, day);
}

/**
 * Save one normal field shift. Earnings may be blank when platform totals have
 * not settled yet; the Shift Log row is still created with time and mileage.
 */
function endShiftToSheet(payload) {
  const p = payload || {};
  const online = Number(p.onlineHours);
  const miles = Number(p.miles);
  const earningsProvided = p.earnings !== '' && p.earnings !== null &&
    p.earnings !== undefined && isFinite(Number(p.earnings));
  if (!isFinite(online) || online <= 0) throw new Error('Online hours must be a positive number.');
  if (!isFinite(miles) || miles < 0) throw new Error('Miles must be zero or more.');
  if (earningsProvided && Number(p.earnings) < 0) throw new Error('Earnings must be zero or more.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = openHoy_();
    const cost = readCost_(ss);
    const shift = writeShiftRow_(ss, p, cost, earningsProvided);
    SpreadsheetApp.flush();
    return {
      ok: true,
      shift: shift,
      earningsPending: !earningsProvided,
      testWorkbookTargeted: false,
      cost: cost,
      at: new Date().toISOString()
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Append one completed ride to the current Trip Log.
 *
 * The ride ID is persisted twice:
 * - Script Properties keeps the fast lookup ledger.
 * - A cell note on the Trip Log row is the durable recovery marker.
 *
 * The row note is written before any row values. If a request is interrupted after
 * a partial Sheet write or before the ledger is saved, the retry finds and repairs
 * the same reserved row instead of appending another one.
 */
function logCompletedTrip(payload) {
  const p = payload || {};
  const rideId = String(p.rideId || '').trim().slice(0, 120);
  if (!rideId) throw new Error('Completed trip needs a ride ID.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = openHoy_();
    const sh = tripLogSheet_(ss);
    if (!sh) throw new Error('Could not find the Trip Log tab.');

    const ledger = loadTripLedger_();
    let row = Number(ledger[rideId] && ledger[rideId].row) || 0;
    if (row > 0 && !tripRowMatchesRideId_(sh, row, rideId)) row = 0;
    if (!row) row = findTripRowByRideId_(sh, rideId);

    if (row > 0 && tripRowComplete_(sh, row)) {
      ledger[rideId] = {row:row, at:Date.now()};
      saveTripLedger_(ledger);
      return {ok:true, duplicate:true, repaired:false, rideId:rideId, row:row};
    }

    if (!row) row = firstEmptyTripRow_(sh);
    reserveTripRow_(sh, row, rideId);
    writeTripRow_(sh, p, row, rideId);
    SpreadsheetApp.flush();

    ledger[rideId] = {row:row, at:Date.now()};
    saveTripLedger_(ledger);
    return {
      ok:true,
      duplicate:false,
      repaired:findTripRowByRideId_(sh, rideId) === row,
      rideId:rideId,
      row:row
    };
  } finally {
    lock.releaseLock();
  }
}

function loadTripLedger_() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(TRIP_LEDGER_KEY);
  let map = {};
  let changed = false;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) map = parsed;
      else changed = true;
    } catch (error) {
      changed = true;
    }
  }
  const cutoff = Date.now() - TRIP_LEDGER_TTL_MS;
  Object.keys(map).forEach(function(id) {
    const at = Number(map[id] && map[id].at);
    if (!isFinite(at) || at < cutoff) { delete map[id]; changed = true; }
  });
  if (changed) props.setProperty(TRIP_LEDGER_KEY, JSON.stringify(map));
  return map;
}

function saveTripLedger_(map) {
  PropertiesService.getScriptProperties().setProperty(TRIP_LEDGER_KEY, JSON.stringify(map || {}));
}

function tripAnchorColumn_(sh) {
  return colByHeader_(sh, 'Logged At') || colByHeader_(sh, 'Date');
}

function tripRideNote_(rideId) {
  return TRIP_NOTE_PREFIX + String(rideId || '').trim();
}

function reserveTripRow_(sh, row, rideId) {
  const col = tripAnchorColumn_(sh);
  if (!col) throw new Error('Trip Log needs Logged At or Date for durable ride IDs.');
  const cell = sh.getRange(row, col);
  cell.setNote(tripRideNote_(rideId));
  if (cell.getValue() === '' || cell.getValue() === null) cell.setValue(new Date());
  SpreadsheetApp.flush();
}

function tripRowMatchesRideId_(sh, row, rideId) {
  const col = tripAnchorColumn_(sh);
  if (!col || row < 2 || row > sh.getMaxRows()) return false;
  return String(sh.getRange(row, col).getNote() || '') === tripRideNote_(rideId);
}

function findTripRowByRideId_(sh, rideId) {
  const col = tripAnchorColumn_(sh);
  const last = sh.getLastRow();
  if (!col || last < 2) return 0;
  const expected = tripRideNote_(rideId);
  const notes = sh.getRange(2, col, last - 1, 1).getNotes();
  for (let i = 0; i < notes.length; i++) {
    if (String(notes[i][0] || '') === expected) return i + 2;
  }
  return 0;
}

function tripRowComplete_(sh, row) {
  const names = ['Pickup Time', 'Dropoff Time', 'Miles'];
  for (let i = 0; i < names.length; i++) {
    const col = colByHeader_(sh, names[i]);
    if (!col) return false;
    const value = sh.getRange(row, col).getValue();
    if (value === '' || value === null) return false;
  }
  return true;
}

function firstEmptyTripRow_(sh) {
  const col = tripAnchorColumn_(sh);
  const last = sh.getLastRow();
  if (!col || last < 2) return Math.max(last + 1, 2);
  const values = sh.getRange(2, col, last - 1, 1).getValues();
  const notes = sh.getRange(2, col, last - 1, 1).getNotes();
  for (let i = 0; i < values.length; i++) {
    const emptyValue = values[i][0] === '' || values[i][0] === null;
    const emptyNote = String(notes[i][0] || '') === '';
    if (emptyValue && emptyNote) return i + 2;
  }
  return last + 1;
}

function writeTripRow_(sh, p, row, rideId) {
  row = Number(row) || firstEmptyTripRow_(sh);
  reserveTripRow_(sh, row, rideId);

  const pickup = validDate_(p.pickedUpISO || p.acceptedISO) || new Date();
  const dropoff = validDate_(p.completedISO) || new Date();
  const minutes = Math.max(0, (dropoff.getTime() - pickup.getTime()) / 60000);
  const miles = Math.max(0, num_(p.miles, 0));
  const fareProvided = p.fare !== '' && p.fare !== null &&
    p.fare !== undefined && isFinite(Number(p.fare));
  const tipProvided = p.tip !== '' && p.tip !== null &&
    p.tip !== undefined && isFinite(Number(p.tip));
  const fare = fareProvided ? Math.max(0, Number(p.fare)) : null;
  const tip = tipProvided ? Math.max(0, Number(p.tip)) : null;

  function set(name, value) {
    const col = colByHeader_(sh, name);
    if (col > 0) sh.getRange(row, col).setValue(value);
  }

  set('Logged At', new Date());
  set('Date', new Date(Utilities.formatDate(pickup, HOY_TZ, 'yyyy/MM/dd')));
  set('Pickup Time', pickup);
  set('Pickup Zone', String(p.pickup || p.source || 'Ride').slice(0, 160));
  set('Dropoff Time', dropoff);
  set('Dropoff Zone', String(p.destination || '').slice(0, 160));
  set('Minutes', round2_(minutes));
  set('Miles', round2_(miles));
  set('Fare', fareProvided ? round2_(fare) : '');
  set('Tip', tipProvided ? round2_(tip) : '');

  const rateCol = colByHeader_(sh, '$/Hr');
  if (rateCol > 0 && String(sh.getRange(row, rateCol).getFormula()) === '') {
    const rate = fareProvided && minutes > 0 ? ((fare + (tip || 0)) / minutes) * 60 : '';
    sh.getRange(row, rateCol).setValue(rate === '' ? '' : round2_(rate));
  }
  return row;
}

function validDate_(value) {
  const date = value instanceof Date ? value : new Date(value || '');
  return isNaN(date.getTime()) ? null : date;
}


/* ===== Driver Inbox (read-only in Hoy; decisions stay in request app) ===== */
function listRequestedRides() {
  const rider = readRiderRequestsSafe_();
  const linked = attachRequestDecisionLinksSafe_(listRequestedRides_(rider.items));
  return { items: linked.items, error: rider.error || linked.error || '' };
}
function listRequestedRides_(knownRiderRows) {
  const riderRows = Array.isArray(knownRiderRows) ? knownRiderRows : readRiderRequestsSafe_().items;
  return riderRows
    .filter(r => r.status === 'REQUESTED')
    .map(r => ({
      requestId: r.requestId,
      name: r.name || 'Ride request',
      pickup: r.pickup || '',
      destination: r.destination || '',
      whenISO: r.whenISO,
      notes: r.notes || '',
      status: 'REQUESTED'
    }))
    .sort((a, b) => (Date.parse(a.whenISO) || 0) - (Date.parse(b.whenISO) || 0));
}
function requestDecisionBridgeConfigured_() {
  const p = PropertiesService.getScriptProperties();
  return !!(String(p.getProperty(REQUEST_APP_URL_PROPERTY) || '').trim() &&
    String(p.getProperty(REQUEST_APP_TOKEN_PROPERTY) || '').trim());
}
function requestDecisionBridge_() {
  const p = PropertiesService.getScriptProperties();
  return {
    url: String(p.getProperty(REQUEST_APP_URL_PROPERTY) || '').trim(),
    token: String(p.getProperty(REQUEST_APP_TOKEN_PROPERTY) || '').trim()
  };
}
function attachRequestDecisionLinksSafe_(items) {
  try { return { items: attachRequestDecisionLinks_(items), error: '' }; }
  catch (err) {
    return {
      items: (items || []).map(item => Object.assign({}, item, { acceptUrl: '', declineUrl: '' })),
      error: String(err && err.message ? err.message : err)
    };
  }
}
function attachRequestDecisionLinks_(items) {
  items = Array.isArray(items) ? items : [];
  if (!items.length) return [];
  const cfg = requestDecisionBridge_();
  if (!cfg.url || !cfg.token) throw new Error('Request decision bridge is not configured.');
  const ids = items.map(item => item.requestId).filter(Boolean).slice(0, 25);
  const sep = cfg.url.indexOf('?') >= 0 ? '&' : '?';
  const endpoint = cfg.url + sep +
    'action=driver-actions&request=' + encodeURIComponent(cfg.token) +
    '&ids=' + encodeURIComponent(ids.join(','));
  const response = UrlFetchApp.fetch(endpoint, { method: 'get', muteHttpExceptions: true, followRedirects: true });
  const status = response.getResponseCode();
  let payload = {};
  try { payload = JSON.parse(response.getContentText() || '{}'); } catch (err) {}
  if (status < 200 || status >= 300 || payload.ok !== true) {
    throw new Error(String(payload.message || ('Request decision bridge returned HTTP ' + status + '.')));
  }
  const byId = {};
  (payload.actions || []).forEach(action => { if (action && action.requestId) byId[String(action.requestId)] = action; });
  return items.map(item => {
    const action = byId[String(item.requestId)] || {};
    return Object.assign({}, item, {
      acceptUrl: String(action.acceptUrl || ''),
      declineUrl: String(action.declineUrl || '')
    });
  });
}
function pulseLiveUrl_() {
  return String(PropertiesService.getScriptProperties().getProperty(LIVE_URL_PROPERTY) || PULSE_LIVE_URL_DEFAULT).trim();
}


/* ===== PULSE-041 rider-safe status bridge ===== */
const RIDER_STATUS_SEQUENCE = Object.freeze([
  'Confirmed','Leaving','On the way','Arriving soon','Arrived','Ride in progress','Complete'
]);
function normalizeRiderStatus_(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  const map = {'confirmed':'Confirmed','leaving':'Leaving','on the way':'On the way','arriving soon':'Arriving soon','arrived':'Arrived','ride in progress':'Ride in progress','complete':'Complete','completed':'Complete'};
  return map[key] || '';
}
function riderStatusKey_(requestId, status) {
  return String(requestId || '') + ':' + normalizeRiderStatus_(status).toLowerCase().replace(/\s+/g, '-');
}
function updateRiderStatus(requestId, status, idempotencyKey) {
  const id = String(requestId || '').trim();
  const label = normalizeRiderStatus_(status);
  if (!/^FR-[A-Z0-9]+$/i.test(id)) throw new Error('Rider request ID is not valid.');
  if (RIDER_STATUS_SEQUENCE.indexOf(label) < 0) throw new Error('Rider status is not valid.');
  const cfg = requestDecisionBridge_();
  if (!cfg.url || !cfg.token) throw new Error('Request decision bridge is not configured.');
  const sep = cfg.url.indexOf('?') >= 0 ? '&' : '?';
  const response = UrlFetchApp.fetch(cfg.url + sep + 'action=driver-status', {
    method:'post',
    contentType:'application/json',
    payload:JSON.stringify({action:'driver-status',request:cfg.token,id:id,status:label,key:String(idempotencyKey || riderStatusKey_(id, label))}),
    muteHttpExceptions:true,
    followRedirects:true
  });
  const http = response.getResponseCode();
  let payload = {};
  try { payload = JSON.parse(response.getContentText() || '{}'); } catch (error) {}
  if (http < 200 || http >= 300 || payload.ok !== true) {
    throw new Error(String(payload.message || ('Rider status endpoint returned HTTP ' + http + '.')));
  }
  return payload;
}

function beginPickupRiderStatus(requestId) {
  const id = String(requestId || '').trim();
  if (!/^FR-[A-Z0-9]+$/i.test(id)) throw new Error('Rider request ID is not valid.');
  const leaving = updateRiderStatus(id, 'Leaving', id + ':leaving');
  const onTheWay = updateRiderStatus(id, 'On the way', id + ':on-the-way');
  return {
    ok:true,
    requestId:id,
    status:String((onTheWay && onTheWay.status) || 'On the way'),
    leaving:leaving,
    onTheWay:onTheWay
  };
}

function beginScheduledPickup(requestId, reservationId) {
  const id = String(requestId || '').trim();
  const status = id ? beginPickupRiderStatus(id) : null;
  const reservations = startReservation(String(reservationId || '').trim());
  return {
    ok:true,
    requestId:id,
    status:status ? status.status : '',
    reservations:reservations
  };
}
function attachRiderStatusStatesSafe_(items) {
  try { return {items:attachRiderStatusStates_(items), error:''}; }
  catch (error) { return {items:(items || []).map(function(item){return Object.assign({}, item, {riderStatus:item.riderStatus || 'Confirmed'});}), error:String((error && error.message) || error)}; }
}
function attachRiderStatusStates_(items) {
  items = Array.isArray(items) ? items : [];
  const ids = items.filter(function(item){return item && item.source === 'rider' && item.requestId;}).map(function(item){return item.requestId;}).slice(0,25);
  if (!ids.length) return items;
  const cfg = requestDecisionBridge_();
  if (!cfg.url || !cfg.token) throw new Error('Request decision bridge is not configured.');
  const sep = cfg.url.indexOf('?') >= 0 ? '&' : '?';
  const url = cfg.url + sep + 'action=driver-status-state&request=' + encodeURIComponent(cfg.token) + '&ids=' + encodeURIComponent(ids.join(','));
  const response = UrlFetchApp.fetch(url, {method:'get',muteHttpExceptions:true,followRedirects:true});
  const http = response.getResponseCode();
  let payload = {};
  try { payload = JSON.parse(response.getContentText() || '{}'); } catch (error) {}
  if (http < 200 || http >= 300 || payload.ok !== true) throw new Error(String(payload.message || ('Rider status endpoint returned HTTP ' + http + '.')));
  const byId = {};
  (payload.states || []).forEach(function(state){if(state && state.requestId) byId[String(state.requestId)] = state;});
  return items.map(function(item){
    const state = byId[String(item.requestId)] || {};
    return Object.assign({}, item, {riderStatus:normalizeRiderStatus_(state.status) || item.riderStatus || 'Confirmed', riderStatusAt:state.occurredAt || ''});
  });
}
function testRiderStatusBridgePackage() {
  const expected = ['Confirmed','Leaving','On the way','Arriving soon','Arrived','Ride in progress','Complete'];
  if (JSON.stringify(RIDER_STATUS_SEQUENCE) !== JSON.stringify(expected)) throw new Error('Rider status sequence changed.');
  if (riderStatusKey_('FR-TEST','On the way') !== 'FR-TEST:on-the-way') throw new Error('Rider status idempotency key is not deterministic.');
  return {ok:true,taskId:'PULSE-041',sequence:expected,idempotent:true,writesPerformed:false,deploymentPerformed:false,productionTouched:false};
}

/* ===== Reservations (Scheduled lane) =====
 * Manual reservations remain in Script Properties.
 * Confirmed rider requests are read directly from the rider sheet and projected
 * into the same lane without copying or mutating the Ride Requests row.
 */
const RES_KEY = 'PULSE_RESERVATIONS';
const RES_STARTED_KEY = 'PULSE_STARTED_RIDER_REQUESTS';
const RES_CUTOFF_MS = 6 * 3600000;
const RES_STARTED_TTL_MS = 14 * 24 * 3600000;

function listReservations() { return attachRiderStatusStatesSafe_(listReservations_()).items; }
function listReservations_(knownRiderRows) {
  const manual = loadManualReservations_();
  const riderRows = Array.isArray(knownRiderRows) ? knownRiderRows : readRiderRequestsSafe_().items;
  const started = loadStartedRiderIds_();
  const cutoff = Date.now() - RES_CUTOFF_MS;

  const confirmed = riderRows
    .filter(r => r.status === 'CONFIRMED' && !started[r.requestId])
    .map(r => ({
      id: r.requestId,
      requestId: r.requestId,
      name: r.name || 'Ride',
      pickup: r.pickup || '',
      dest: r.destination || '',
      phone: '',
      notes: r.notes || '',
      whenISO: r.whenISO,
      source: 'rider',
      status: r.status
    }));

  const merged = manual.concat(confirmed).filter(r => {
    const t = Date.parse(r.whenISO);
    return !isFinite(t) || t >= cutoff;
  });

  const byId = {};
  merged.forEach(r => {
    const id = String(r.id || '').trim();
    if (id) byId[id] = r;
  });
  return Object.keys(byId)
    .map(id => byId[id])
    .sort((a, b) => (Date.parse(a.whenISO) || 0) - (Date.parse(b.whenISO) || 0));
}

function loadManualReservations_() {
  const raw = PropertiesService.getScriptProperties().getProperty(RES_KEY);
  let arr = [];
  if (raw) { try { arr = JSON.parse(raw) || []; } catch (e) { arr = []; } }
  return Array.isArray(arr) ? arr : [];
}
function saveReservations_(arr) {
  PropertiesService.getScriptProperties().setProperty(RES_KEY, JSON.stringify(arr));
}
function addReservation(res) {
  const r = res || {};
  const whenISO = r.whenISO || (r.date && r.time ? new Date(r.date + ' ' + r.time).toISOString() : null);
  if (!whenISO || !isFinite(Date.parse(whenISO))) throw new Error('Reservation needs a valid date/time.');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const arr = loadManualReservations_();
    arr.push({
      id: 'r' + Date.now() + Math.floor(Math.random() * 1000),
      name: String(r.name || 'Ride').slice(0, 80),
      pickup: String(r.pickup || '').slice(0, 120),
      dest: String(r.dest || r.destination || '').slice(0, 120),
      phone: String(r.phone || '').slice(0, 40),
      notes: String(r.notes || '').slice(0, 200),
      whenISO: whenISO,
      source: String(r.source || 'manual').slice(0, 24)
    });
    saveReservations_(arr);
    return listReservations_();
  } finally { lock.releaseLock(); }
}
function removeReservation(id) {
  const key = String(id || '');
  if (isRiderRequestId_(key)) throw new Error('Confirmed rider requests cannot be deleted from the driver console.');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const arr = loadManualReservations_().filter(r => r.id !== key);
    saveReservations_(arr);
    return listReservations_();
  } finally { lock.releaseLock(); }
}
function startReservation(id) {
  const key = String(id || '');
  if (!key) throw new Error('Reservation ID is required.');
  if (!isRiderRequestId_(key)) return removeReservation(key);
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const rider = readRiderRequestsSafe_();
    const row = rider.items.find(r => r.requestId === key);
    if (!row) throw new Error('Rider request was not found.');
    if (row.status !== 'CONFIRMED') throw new Error('Only confirmed rider requests can be started.');
    markRiderStarted_(key);
    return attachRiderStatusStatesSafe_(listReservations_(rider.items)).items;
  } finally { lock.releaseLock(); }
}

function debugRiderLane() {
  const rider = readRiderRequestsSafe_();
  let started = {};
  const raw = PropertiesService.getScriptProperties().getProperty(RES_STARTED_KEY);
  if (raw) { try { started = JSON.parse(raw) || {}; } catch (e) { started = { parseError: String(e) }; } }
  const result = {
    build: HOY_BUILD,
    riderReadError: rider.error || null,
    riderRows: rider.items,
    startedRiderIds: Object.keys(started).filter(id => id !== 'parseError'),
    projectedReservations: listReservations_(rider.items),
    projectedInbox: listRequestedRides_(rider.items),
    requestDecisionBridgeConfigured: requestDecisionBridgeConfigured_(),
    writesToRideRequests: false
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function readRiderRequestsSafe_() {
  try { return { items: readRiderRequests_(), error: '' }; }
  catch (err) { return { items: [], error: String(err && err.message ? err.message : err) }; }
}
function readRiderRequests_() {
  const ss = SpreadsheetApp.openById(RIDER_SHEET_ID);
  const sh = ss.getSheetByName(RIDER_SHEET_NAME);
  if (!sh) throw new Error('Missing rider sheet: ' + RIDER_SHEET_NAME);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(v => String(v).trim());
  const at = name => headers.indexOf(name);
  const required = ['Request ID', 'Status', 'Customer Name', 'Pickup Address', 'Destination', 'Pickup At'];
  required.forEach(name => { if (at(name) < 0) throw new Error('Ride Requests is missing header: ' + name); });
  return values.slice(1).filter(row => row.some(v => v !== '' && v !== null)).map(row => ({
    requestId: String(row[at('Request ID')] || '').trim(),
    status: String(row[at('Status')] || '').trim().toUpperCase(),
    name: String(row[at('Customer Name')] || '').trim(),
    pickup: String(row[at('Pickup Address')] || '').trim(),
    destination: String(row[at('Destination')] || '').trim(),
    whenISO: isoValue_(row[at('Pickup At')]),
    notes: at('Notes') >= 0 ? String(row[at('Notes')] || '').trim() : ''
  })).filter(r => r.requestId && r.whenISO && (r.status === 'REQUESTED' || r.status === 'CONFIRMED'));
}
function isoValue_(value) {
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}
function isRiderRequestId_(id) { return /^FR-[A-Z0-9]+$/i.test(String(id || '')); }
function loadStartedRiderIds_() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(RES_STARTED_KEY);
  let map = {};
  if (raw) { try { map = JSON.parse(raw) || {}; } catch (e) { map = {}; } }
  const cutoff = Date.now() - RES_STARTED_TTL_MS;
  let changed = false;
  Object.keys(map).forEach(id => {
    if (!isFinite(Number(map[id])) || Number(map[id]) < cutoff) { delete map[id]; changed = true; }
  });
  if (changed) props.setProperty(RES_STARTED_KEY, JSON.stringify(map));
  return map;
}
function markRiderStarted_(requestId) {
  const props = PropertiesService.getScriptProperties();
  const map = loadStartedRiderIds_();
  map[String(requestId)] = Date.now();
  props.setProperty(RES_STARTED_KEY, JSON.stringify(map));
}

/* ===== Sheet resolution (by header signature) ===== */
function openHoy_() { return SpreadsheetApp.openById(HOY_SHEET_ID); }

function findSheetByHeaders_(ss, needed) {
  const want = needed.map(n => String(n).trim().toLowerCase());
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sh = sheets[i];
    const lastCol = sh.getLastColumn();
    if (!lastCol) continue;
    const hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v).trim().toLowerCase());
    if (want.every(w => hdr.indexOf(w) >= 0)) return sh;
  }
  return null;
}
function shiftLogSheet_(ss) { return findSheetByHeaders_(ss, ['Online Hrs', 'Primary Zone']); }
function tripLogSheet_(ss)  { return findSheetByHeaders_(ss, ['Pickup Time', 'Dropoff Time', 'Miles', 'Fare']); }

function colByHeader_(sh, name) {
  const lastCol = sh.getLastColumn();
  if (!lastCol) return 0;
  const hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v).trim().toLowerCase());
  return hdr.indexOf(String(name).trim().toLowerCase()) + 1; // 1-based; 0 = not found
}

function readCost_(ss) {
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sh = sheets[i];
    const rows = Math.min(sh.getLastRow(), 40);
    if (rows < 1) continue;
    const vals = sh.getRange(1, 1, rows, 2).getValues();
    const map = {};
    let hit = false;
    vals.forEach(r => {
      const k = String(r[0]).trim().toLowerCase();
      if (k) { map[k] = r[1]; if (k === 'fuel $/gallon') hit = true; }
    });
    if (hit) return {
      fuelPerGal:   num_(map['fuel $/gallon'], HOY_DEFAULT_COST.fuelPerGal),
      mpg:          num_(map['mpg'], HOY_DEFAULT_COST.mpg),
      maintPerMile: num_(map['maintenance $/mile'], HOY_DEFAULT_COST.maintPerMile),
      taxRate:      num_(map['tax set-aside %'], HOY_DEFAULT_COST.taxRate)
    };
  }
  return Object.assign({}, HOY_DEFAULT_COST);
}

/* ===== Shift Log write ===== */
function firstEmptyShiftRow_(sh) {
  const colDate = colByHeader_(sh, 'Date');
  const last = sh.getLastRow();
  if (!colDate || last < 2) return Math.max(last + 1, 2);
  const col = sh.getRange(2, colDate, last - 1, 1).getValues();
  for (let i = 0; i < col.length; i++) {
    if (col[i][0] === '' || col[i][0] === null) return 2 + i;
  }
  return last + 1;
}

function writeShiftRow_(ss, p, cost, earningsProvided) {
  const sh = shiftLogSheet_(ss);
  if (!sh) throw new Error('Could not find the Shift Log tab (looked for Online Hrs + Primary Zone headers).');
  const row = firstEmptyShiftRow_(sh);

  const start = new Date(p.startISO || (Date.now() - Number(p.onlineHours) * 3600000));
  const end = new Date(p.endISO || Date.now());
  const total = earningsProvided ? Math.max(0, Number(p.earnings)) : null;
  const tips = earningsProvided ? Math.max(0, num_(p.tips, 0)) : null;
  const promo = earningsProvided ? Math.max(0, num_(p.promo, 0)) : null;
  const miles = num_(p.miles, 0);
  const online = num_(p.onlineHours, 0);

  const gas = cost.mpg > 0 ? (miles / cost.mpg) * cost.fuelPerGal : 0;
  const maint = miles * cost.maintPerMile;
  const tax = earningsProvided ? total * cost.taxRate : null;
  const net = earningsProvided ? total - gas - maint - tax : null;
  const netPerHr = earningsProvided && online > 0 ? net / online : null;

  function set(name, val) {
    const c = colByHeader_(sh, name);
    if (c > 0) sh.getRange(row, c).setValue(val);
  }

  set('Date', new Date(Utilities.formatDate(start, HOY_TZ, 'yyyy/MM/dd')));
  set('Day', Utilities.formatDate(start, HOY_TZ, 'EEE'));
  set('Start', start);
  set('End', end);
  set('Online Hrs', round2_(online));
  set('Active Hrs', p.activeHours != null ? round2_(num_(p.activeHours, 0)) : '');
  set('Gross', earningsProvided ? round2_(total) : '');
  set('Tips', earningsProvided ? round2_(tips) : '');
  set('Promo/Surge', earningsProvided ? round2_(promo) : '');
  set('Miles', round2_(miles));
  set('Primary Zone', p.zone || '');
  set('Airport Queue', p.airportQueue || '');
  set('Weather', p.weather || '');
  set('Notes', p.notes || '');

  const netCol = colByHeader_(sh, 'Net Profit');
  const hasFormula = netCol > 0 && String(sh.getRange(row, netCol).getFormula()) !== '';
  if (!hasFormula) {
    set('Gas Cost', round2_(gas));
    set('Maint.', round2_(maint));
    set('Tax Set Aside', earningsProvided ? round2_(tax) : '');
    set('Net Profit', earningsProvided ? round2_(net) : '');
    set('Net $/Online Hr', earningsProvided ? round2_(netPerHr) : '');
  }

  return {
    row: row,
    earningsPending: !earningsProvided,
    grossPerHr: earningsProvided && online > 0 ? round2_(total / online) : null,
    gas: round2_(gas),
    maint: round2_(maint),
    tax: earningsProvided ? round2_(tax) : null,
    net: earningsProvided ? round2_(net) : null,
    netPerHr: earningsProvided ? round2_(netPerHr) : null,
    formulaColumnsLeftAlone: hasFormula
  };
}

/* ===== Small helpers ===== */
function num_(v, d) { const n = Number(v); return isFinite(n) ? n : d; }
function numOrNull_(v) { const n = Number(v); return isFinite(n) ? n : null; }
function round2_(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

function showWiring() {
  console.log(JSON.stringify(checkWiring(), null, 2));
}