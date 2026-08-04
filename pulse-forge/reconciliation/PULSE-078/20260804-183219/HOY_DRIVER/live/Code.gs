/**
 * Pulse Drive Mode -> Hoy Driver OS writer
 * ------------------------------------------------------------
 * Serves the drive-mode cockpit and, on end-shift, writes into your
 * "Hoy Driver OS - v1.2 Baseline + Test 001" sheet:
 *   1. Appends one row to the Shift Log (raw inputs; leaves formula columns alone).
 *   2. Closes a test (default T-001) by writing Actual Online Hrs / Earnings / Miles.
 *
 * Safe-by-design:
 *   - Finds tabs by their header signatures, not fixed names.
 *   - Finds the test row by matching the Test ID, and columns by header name.
 *   - Writes ONLY input cells; never overwrites your Gross/hr, Net/hr, Result formulas.
 *   - Refuses to overwrite a test that already has actuals unless force:true.
 */

const HOY_SHEET_ID = '1Byk7-bwjhSeZQEqKemi0RxGagD_2RuYw94A8qu48tnY';
const HOY_TZ = 'America/New_York';
const HOY_DEFAULT_COST = Object.freeze({ fuelPerGal: 3.5, mpg: 25, maintPerMile: 0.10, taxRate: 0.22 });
const HOY_DEFAULT_TEST = 'T-001';
const HOY_BUILD = 'hoy-pulse-057-hard-qr-route-2026-07-25.4';
const RIDER_SHEET_ID = '1Hd46iUY84N2bvxdaIS4lf6l-uExxbXGIbUjxJzMF-No';
const RIDER_SHEET_NAME = 'Ride Requests';
const PULSE_LIVE_URL_DEFAULT = 'https://pulse-core-os.netlify.app/';
const REQUEST_APP_URL_PROPERTY = 'PULSE_REQUEST_APP_URL';
const REQUEST_APP_TOKEN_PROPERTY = 'PULSE_REQUEST_TOKEN';
const LIVE_URL_PROPERTY = 'PULSE_LIVE_URL';

/* ===== Entry points ===== */
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (String(params.rideRequest || '') === '1') return renderRideRequestPortal_();

  const template = HtmlService.createTemplateFromFile('Index');
  template.FEATURE_NEW_CONTROLS = featureNewControlsEnabled_();

  return template.evaluate()
    .setTitle('Pulse Drive Mode')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Escapes text for safe insertion into HTML text and attribute values.
 * Required by renderRideRequestPortal_().
 */
function esc_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function featureNewControlsEnabled_() {
  return String(
    PropertiesService.getScriptProperties().getProperty('FEATURE_NEW_CONTROLS') || 'false'
  ).trim().toLowerCase() === 'true';
}

/**
 * Run only in the copied/staged Hoy Driver project.
 * Production remains OFF unless its Script Property is intentionally changed.
 */
function setFeatureNewControlsForTest(enabled) {
  PropertiesService.getScriptProperties().setProperty(
    'FEATURE_NEW_CONTROLS',
    enabled === true ? 'true' : 'false'
  );
  return {
    ok: true,
    feature: 'FEATURE_NEW_CONTROLS',
    enabled: featureNewControlsEnabled_(),
    productionDeploymentPerformed: false
  };
}

function rideRequestPortalUrl_() {
  const base = String(ScriptApp.getService().getUrl() || '').trim();
  if (!base) return '';
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'rideRequest=1';
}

function fullRideRequestUrl_() {
  const cfg = requestDecisionBridge_();
  if (!cfg.url || !cfg.token) throw new Error('Request app URL and token are not configured.');
  const sep = cfg.url.indexOf('?') >= 0 ? '&' : '?';
  return cfg.url + sep +
    'action=request-form' +
    '&request=' + encodeURIComponent(cfg.token) +
    '&view=form' +
    '&v=0574';
}

function privateRideRequestUrl_() {
  return fullRideRequestUrl_();
}

function qrLiveRideRequestUrl_() {
  const cfg = requestDecisionBridge_();
  if (!cfg.url || !cfg.token) throw new Error('Request app URL and token are not configured.');
  const sep = cfg.url.indexOf('?') >= 0 ? '&' : '?';
  return cfg.url + sep +
    'action=qr-request' +
    '&request=' + encodeURIComponent(cfg.token) +
    '&view=qr' +
    '&source=qr_live' +
    '&v=0574';
}

function renderRideRequestPortal_() {
  let privateUrl = '';
  try { privateUrl = privateRideRequestUrl_(); }
  catch (error) {
    return HtmlService.createHtmlOutput(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050813;color:#eaf2ff;font-family:Arial,sans-serif;padding:24px}.card{max-width:440px;padding:24px;border:1px solid rgba(255,255,255,.14);border-radius:18px;background:#0a0f24}h1{margin-top:0}p{color:#9fb2d6;line-height:1.5}</style></head>' +
      '<body><main class="card"><h1>Ride request unavailable</h1><p>' + esc_(String((error && error.message) || error)) + '</p></main></body></html>'
    ).setTitle('Ride request').addMetaTag('viewport','width=device-width,initial-scale=1');
  }
  const page = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>Request a ride</title><style>html,body{margin:0;width:100%;height:100%;background:#050813}iframe{display:block;width:100%;height:100%;border:0;background:#fff}</style></head>' +
    '<body><iframe src="' + esc_(privateUrl) + '" title="Pulse Vermont ride request" allow="geolocation"></iframe></body></html>';
  return HtmlService.createHtmlOutput(page)
    .setTitle('Request a ride')
    .addMetaTag('viewport','width=device-width,initial-scale=1,viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getRideRequestQrConfig() {
  return {
    ok: requestDecisionBridgeConfigured_(),
    url: qrLiveRideRequestUrl_(),
    formUrl: fullRideRequestUrl_(),
    configured: requestDecisionBridgeConfigured_(),
    qrTarget: 'QrLiveRequest.html',
    buttonTarget: 'RequestForm.html',
    explicitQrView: qrLiveRideRequestUrl_().indexOf('view=qr') >= 0,
    explicitFormView: fullRideRequestUrl_().indexOf('view=form') >= 0,
    writesPerformed: false
  };
}

function testRideRequestQrPackage() {
  const configured = requestDecisionBridgeConfigured_();
  const qrUrl = qrLiveRideRequestUrl_();
  const formUrl = fullRideRequestUrl_();
  if (!configured) throw new Error('PULSE_REQUEST_APP_URL and PULSE_REQUEST_TOKEN are required.');
  if (!qrUrl || qrUrl.indexOf('action=qr-request') < 0 || qrUrl.indexOf('source=qr_live') < 0) throw new Error('Hard QR request URL is unavailable.');
  if (!formUrl || formUrl.indexOf('action=request-form') < 0 || formUrl.indexOf('view=form') < 0) throw new Error('Hard RequestForm route is unavailable.');
  return {
    ok:true,
    taskId:'PULSE-QR',
    qrTarget:'QrLiveRequest.html',
    buttonTarget:'RequestForm.html',
    routesSeparated:true,
    writesPerformed:false,
    deploymentPerformed:false,
    productionTouched:false
  };
}

// Run this once to confirm everything resolves before a real shift. Writes nothing.
function checkWiring() {
  const ss = openHoy_();
  const sl = shiftLogSheet_(ss);
  const ts = testsSheet_(ss);
  const er = findSheetByHeaders_(ss, ['Event', 'Best Driver Window']);
  const cost = readCost_(ss);
  const t = ts ? readTestSummary_(ts, HOY_DEFAULT_TEST) : null;
  const rider = readRiderRequestsSafe_();
  return {
    ok: !!(sl && ts && t && !rider.error),
    hoySheetId: HOY_SHEET_ID,
    riderSheetId: RIDER_SHEET_ID,
    shiftLogTab: sl ? sl.getName() : 'NOT FOUND',
    testsTab: ts ? ts.getName() : 'NOT FOUND',
    eventRadarTab: er ? er.getName() : 'NOT FOUND',
    riderRequestsTab: rider.error ? 'NOT AVAILABLE' : RIDER_SHEET_NAME,
    riderReadError: rider.error || null,
    requestedRides: rider.items.filter(r => r.status === 'REQUESTED').length,
    confirmedRides: rider.items.filter(r => r.status === 'CONFIRMED').length,
    requestDecisionBridgeConfigured: requestDecisionBridgeConfigured_(),
    nextShiftRow: sl ? firstEmptyShiftRow_(sl) : null,
    t001: t,
    nextOpportunity: getNextOpportunity_(ss),
    costModel: cost,
    writesPerformed: false
  };
}

// Called by the cockpit on load to show the live test target.
function getCockpitBootstrap() {
  const ss = openHoy_();
  const ts = testsSheet_(ss);
  const rider = readRiderRequestsSafe_();
  const requested = listRequestedRides_(rider.items);
  const linked = attachRequestDecisionLinksSafe_(requested);
  const reservations = attachRiderStatusStatesSafe_(listReservations_(rider.items));
  return {
    ok: true,
    build: HOY_BUILD,
    test: ts ? readTestSummary_(ts, HOY_DEFAULT_TEST) : null,
    cost: readCost_(ss),
    opportunity: getNextOpportunity_(ss),
    reservations: reservations.items,
    riderStatusError: reservations.error || '',
    requests: linked.items,
    requestDecisionError: linked.error || '',
    liveUrl: pulseLiveUrl_(),
    rideRequestUrl: qrLiveRideRequestUrl_(),
    rideRequestFormUrl: fullRideRequestUrl_(),
    riderReadError: rider.error || null
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
 * The main write. Payload from the cockpit:
 *   { startISO, endISO, onlineHours, miles, earnings, tips?, promo?,
 *     zone?, airportQueue?, weather?, notes?, closeTest?, force? }
 * earnings = total for the shift including tips.
 */
function endShiftToSheet(payload) {
  const p = payload || {};
  const online = Number(p.onlineHours), miles = Number(p.miles), earn = Number(p.earnings);
  if (!isFinite(online) || online <= 0) throw new Error('Online hours must be a positive number.');
  if (!isFinite(miles) || miles < 0) throw new Error('Miles must be zero or more.');
  if (!isFinite(earn) || earn < 0) throw new Error('Enter total earnings (0 or more).');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = openHoy_();
    const cost = readCost_(ss);
    const shift = writeShiftRow_(ss, p, cost);
    let test = null;
    if (p.closeTest) test = closeTest_(ss, String(p.closeTest), p, !!p.force);
    SpreadsheetApp.flush();
    return { ok: true, shift: shift, test: test, cost: cost, at: new Date().toISOString() };
  } finally {
    lock.releaseLock();
  }
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

/**
 * PULSE-057 authenticated server-to-server decision.
 * Hoy Driver never writes the Ride Requests sheet directly.
 */
function decideRequestedRide(requestId, decision) {
  const id = String(requestId || '').trim();
  const action = String(decision || '').trim().toUpperCase();
  if (!/^FR-[A-Z0-9]+$/i.test(id)) throw new Error('Ride request ID is not valid.');
  if (action !== 'DECLINE' && action !== 'CONFIRM') throw new Error('Decision is not valid.');

  const cfg = requestDecisionBridge_();
  if (!cfg.url || !cfg.token) throw new Error('Request decision bridge is not configured.');

  const sep = cfg.url.indexOf('?') >= 0 ? '&' : '?';
  const response = UrlFetchApp.fetch(cfg.url + sep + 'action=driver-decision', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      action: 'driver-decision',
      request: cfg.token,
      id: id,
      decision: action,
      key: id + ':' + action.toLowerCase()
    }),
    muteHttpExceptions: true,
    followRedirects: true
  });

  const http = response.getResponseCode();
  let payload = {};
  try { payload = JSON.parse(response.getContentText() || '{}'); } catch (error) {}
  if (http < 200 || http >= 300 || payload.ok !== true) {
    throw new Error(String(payload.message || ('Driver decision endpoint returned HTTP ' + http + '.')));
  }
  return payload;
}

function testPulse057DriverBridge() {
  const cfg = requestDecisionBridge_();
  return {
    ok: !!(cfg.url && cfg.token),
    requestAppConfigured: !!(cfg.url && cfg.token),
    qrPortal: qrLiveRideRequestUrl_(),
    fullFormPortal: fullRideRequestUrl_(),
    qrSource: 'QR_LIVE',
    qrTarget: 'QrLiveRequest.html',
    buttonTarget: 'RequestForm.html',
    directRideRequestsWrite: false,
    writesPerformed: false,
    deploymentPerformed: false
  };
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
function testsSheet_(ss)    { return findSheetByHeaders_(ss, ['Test ID', 'Actual Online Hrs']); }

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

function writeShiftRow_(ss, p, cost) {
  const sh = shiftLogSheet_(ss);
  if (!sh) throw new Error('Could not find the Shift Log tab (looked for Online Hrs + Primary Zone headers).');
  const row = firstEmptyShiftRow_(sh);

  const start = new Date(p.startISO || (Date.now() - Number(p.onlineHours) * 3600000));
  const end = new Date(p.endISO || Date.now());
  const total = num_(p.earnings, 0);
  const tips = num_(p.tips, 0);
  const promo = num_(p.promo, 0);
  const fares = Math.max(0, total - tips - promo);
  const miles = num_(p.miles, 0);
  const online = num_(p.onlineHours, 0);

  const gas = cost.mpg > 0 ? (miles / cost.mpg) * cost.fuelPerGal : 0;
  const maint = miles * cost.maintPerMile;
  const tax = total * cost.taxRate;
  const net = total - gas - maint - tax;
  const netPerHr = online > 0 ? net / online : 0;

  function set(name, val) { const c = colByHeader_(sh, name); if (c > 0) sh.getRange(row, c).setValue(val); }

  set('Date', new Date(Utilities.formatDate(start, HOY_TZ, 'yyyy/MM/dd')));
  set('Day', Utilities.formatDate(start, HOY_TZ, 'EEE'));
  set('Start', start);
  set('End', end);
  set('Online Hrs', round2_(online));
  set('Active Hrs', p.activeHours != null ? round2_(num_(p.activeHours, 0)) : '');
  set('Gross', round2_(fares));
  set('Tips', round2_(tips));
  set('Promo/Surge', round2_(promo));
  set('Miles', round2_(miles));
  set('Primary Zone', p.zone || '');
  set('Airport Queue', p.airportQueue || '');
  set('Weather', p.weather || '');
  set('Notes', p.notes || '');

  // Computed columns: only fill if the sheet has no formula there (don't fight a formula).
  const netCol = colByHeader_(sh, 'Net Profit');
  const hasFormula = netCol > 0 && String(sh.getRange(row, netCol).getFormula()) !== '';
  if (!hasFormula) {
    set('Gas Cost', round2_(gas));
    set('Maint.', round2_(maint));
    set('Tax Set Aside', round2_(tax));
    set('Net Profit', round2_(net));
    set('Net $/Online Hr', round2_(netPerHr));
  }

  return {
    row: row,
    grossPerHr: online > 0 ? round2_(total / online) : 0,
    gas: round2_(gas), maint: round2_(maint), tax: round2_(tax),
    net: round2_(net), netPerHr: round2_(netPerHr),
    formulaColumnsLeftAlone: hasFormula
  };
}

/* ===== Test close ===== */
function readTestRow_(sh, testId) {
  const colId = colByHeader_(sh, 'Test ID');
  if (!colId) return -1;
  const last = sh.getLastRow();
  const ids = sh.getRange(1, colId, last, 1).getValues();
  const want = String(testId).trim().toLowerCase();
  for (let r = 2; r <= last; r++) {
    if (String(ids[r - 1][0]).trim().toLowerCase() === want) return r;
  }
  return -1;
}

function readTestSummary_(sh, testId) {
  const row = readTestRow_(sh, testId);
  if (row < 0) return null;
  const get = name => { const c = colByHeader_(sh, name); return c ? sh.getRange(row, c).getValue() : ''; };
  const actualOnline = get('Actual Online Hrs');
  return {
    id: String(get('Test ID')),
    status: String(get('Status')),
    hypothesis: String(get('Hypothesis')),
    baseline: numOrNull_(get('Baseline Obs Gross/Hr')),
    green: numOrNull_(get('Green Gross Target')),
    red: numOrNull_(get('Red Gross Floor')),
    alreadyClosed: !(actualOnline === '' || actualOnline === null)
  };
}

function closeTest_(ss, testId, p, force) {
  const sh = testsSheet_(ss);
  if (!sh) return { closed: false, reason: 'Tests tab not found' };
  const row = readTestRow_(sh, testId);
  if (row < 0) return { closed: false, reason: testId + ' row not found' };

  const cOnline = colByHeader_(sh, 'Actual Online Hrs');
  const cEarn = colByHeader_(sh, 'Actual Earnings');
  const cMiles = colByHeader_(sh, 'Actual Miles');
  if (!cOnline || !cEarn || !cMiles) return { closed: false, reason: 'Actual Online Hrs / Earnings / Miles columns not found' };

  const existing = sh.getRange(row, cOnline).getValue();
  if (existing !== '' && existing !== null && !force) {
    return { closed: false, reason: testId + ' already has actuals; resend with force:true to overwrite', existingOnline: existing };
  }

  const online = num_(p.onlineHours, 0);
  const earn = num_(p.earnings, 0);
  sh.getRange(row, cOnline).setValue(round2_(online));
  sh.getRange(row, cEarn).setValue(round2_(earn));
  sh.getRange(row, cMiles).setValue(round2_(num_(p.miles, 0)));

  const cStatus = colByHeader_(sh, 'Status');
  if (cStatus && String(sh.getRange(row, cStatus).getFormula()) === '') sh.getRange(row, cStatus).setValue('COMPLETE');

  const green = numOrNull_(sh.getRange(row, colByHeader_(sh, 'Green Gross Target')).getValue());
  const red = numOrNull_(sh.getRange(row, colByHeader_(sh, 'Red Gross Floor')).getValue());
  const grossPerHr = online > 0 ? earn / online : 0;
  let verdict = 'IN RANGE';
  if (green != null && grossPerHr >= green) verdict = 'ABOVE TARGET';
  else if (red != null && grossPerHr < red) verdict = 'BELOW FLOOR';

  return {
    closed: true, testId: testId, row: row,
    grossPerHr: round2_(grossPerHr), green: green, red: red, verdict: verdict
  };
}

/* ===== Small helpers ===== */
function num_(v, d) { const n = Number(v); return isFinite(n) ? n : d; }
function numOrNull_(v) { const n = Number(v); return isFinite(n) ? n : null; }
function round2_(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

function showWiring() {
  console.log(JSON.stringify(checkWiring(), null, 2));
}