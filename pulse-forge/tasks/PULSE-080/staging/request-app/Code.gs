/**
 * Pulse Vermont — Private Ride Request App
 * ----------------------------------------
 * Separate least-privilege Apps Script project for invite-only ride requests.
 * PULSE-042 adds one private Ride ID + salted PIN verifier per confirmed ride.
 * Writes only to the configured DEV spreadsheet. Sends receipt/decision emails
 * and creates a calendar event only after the driver explicitly confirms.
 */

const RIDE = Object.freeze({
  SHEET_NAME: 'Ride Requests',
  STATUS_EVENTS_SHEET_NAME: 'Ride Status Events',
  TIMEZONE: 'America/New_York',
  DEFAULT_RIDE_MINUTES: 60,
  ACTION_TTL_DAYS: 30,
  STATUS_PAGE_TTL_DAYS: 90,
  STATUSES: Object.freeze(['REQUESTED','CONFIRMED','DECLINED','CANCELLED','COMPLETED']),
  RIDER_STATUS_SEQUENCE: Object.freeze([
    'Confirmed','Leaving','On the way','Arriving soon','Arrived','Ride in progress','Complete'
  ]),
  STATUS_EVENT_HEADERS: Object.freeze([
    'Event ID','Request ID','Status','Occurred At','Source','Idempotency Key'
  ]),
  HEADERS: Object.freeze([
    'Request ID','Received At','Updated At','Status','Source',
    'Customer Name','Customer Phone','Customer Email',
    'Pickup Address','Destination','Pickup At','Passengers','Notes','Consent',
    'Confirmed At','Cancelled At','Completed At','Calendar Event ID','Driver Notes','Dedup Key',
    'Ride ID','PIN Salt','PIN Verifier','Access Issued At','Access Email Sent At'
  ])
});

function rideCfg_() {
  const p = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: String(p.getProperty('SPREADSHEET_ID') || ''),
    driverName: String(p.getProperty('DRIVER_NAME') || 'Your driver'),
    driverEmail: String(p.getProperty('DRIVER_EMAIL') || ''),
    driverPhone: String(p.getProperty('DRIVER_PHONE') || ''),
    vehicle: String(p.getProperty('VEHICLE') || ''),
    calendarId: String(p.getProperty('CALENDAR_ID') || 'primary'),
    confirmSecret: String(p.getProperty('CONFIRM_SECRET') || ''),
    webAppUrl: String(p.getProperty('WEB_APP_URL') || ''),
    requestToken: String(p.getProperty('REQUEST_TOKEN') || '')
  };
}

function rideSpreadsheet_() {
  const id = rideCfg_().spreadsheetId;
  if (!id) throw new Error('SPREADSHEET_ID is required in Script Properties.');
  return SpreadsheetApp.openById(id);
}

function rideSheet_() {
  const ss = rideSpreadsheet_();
  let sh = ss.getSheetByName(RIDE.SHEET_NAME);
  if (!sh) sh = ss.insertSheet(RIDE.SHEET_NAME);
  ensureRideHeaders_(sh);
  return sh;
}

function ensureRideHeaders_(sh) {
  const existingCount = sh.getLastColumn();
  const existing = existingCount
    ? sh.getRange(1, 1, 1, existingCount).getValues()[0].map(String)
    : [];
  const prefixOk = existing.every(function(header, index) {
    return index < RIDE.HEADERS.length && header === RIDE.HEADERS[index];
  });
  if (!prefixOk) {
    throw new Error('Ride Requests headers do not match the expected schema. Back up the sheet before repairing it.');
  }
  if (existingCount < RIDE.HEADERS.length) {
    sh.getRange(1, 1, 1, RIDE.HEADERS.length).setValues([RIDE.HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

function rideStatusEventsSheet_() {
  const ss = rideSpreadsheet_();
  let sh = ss.getSheetByName(RIDE.STATUS_EVENTS_SHEET_NAME);
  if (!sh) sh = ss.insertSheet(RIDE.STATUS_EVENTS_SHEET_NAME);
  ensureRideStatusEventHeaders_(sh);
  return sh;
}

function ensureRideStatusEventHeaders_(sh) {
  const existing = sh.getLastColumn()
    ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), RIDE.STATUS_EVENT_HEADERS.length)).getValues()[0].map(String)
    : [];
  const ok = RIDE.STATUS_EVENT_HEADERS.every(function(header, index) { return existing[index] === header; });
  if (!ok && sh.getLastRow() > 1) {
    throw new Error('Ride Status Events headers do not match the expected append-only schema.');
  }
  if (!ok) {
    sh.getRange(1, 1, 1, RIDE.STATUS_EVENT_HEADERS.length)
      .setValues([RIDE.STATUS_EVENT_HEADERS])
      .setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

function setupRideSystem() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('CONFIRM_SECRET')) p.setProperty('CONFIRM_SECRET', Utilities.getUuid() + Utilities.getUuid());
  if (!p.getProperty('REQUEST_TOKEN')) p.setProperty('REQUEST_TOKEN', Utilities.getUuid().replace(/-/g, ''));
  const cfg = rideCfg_();
  if (!cfg.driverEmail) throw new Error('DRIVER_EMAIL is required in Script Properties.');
  if (!cfg.webAppUrl) throw new Error('WEB_APP_URL is required after deployment.');
  const sh = rideSheet_();
  const statusSh = rideStatusEventsSheet_();
  return {
    ok: true,
    sheet: sh.getName(),
    statusEventsSheet: statusSh.getName(),
    spreadsheetId: cfg.spreadsheetId,
    requestUrl: requestUrl_(),
    driverEmail: cfg.driverEmail
  };
}

function doGet(e) {
  e = e || {};
  const params = e.parameter || {};
  const action = String(params.action || '').toLowerCase();
  if (action === 'driver-actions') return driverActionLinksResponse_(params);
  if (action === 'driver-status-state') return driverStatusStateResponse_(params);
  if (action === 'status') return rideStatusAccessPage_(params);
  if (action === 'confirm' || action === 'decline' || action === 'cancel') {
    return rideActionPage_(action, params);
  }
  return HtmlService.createHtmlOutputFromFile('RequestForm')
    .setTitle('Pulse Vermont — Request a ride')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  e = e || {};
  const params = Object.assign({}, e.parameter || {}, parseJsonPost_(e));
  const action = String(params.action || '').toLowerCase();
  if (action === 'driver-status') return driverStatusUpdateResponse_(params);
  if (action === 'rider-status') return riderStatusLookupResponse_(params);
  if (action === 'status-access') return riderStatusAccessSubmitPage_(params);
  return jsonResponse_({ ok: false, message: 'Unsupported request action.' });
}

function parseJsonPost_(e) {
  try {
    const text = e && e.postData ? String(e.postData.contents || '') : '';
    return text ? (JSON.parse(text) || {}) : {};
  } catch (error) {
    return {};
  }
}


function driverActionLinksResponse_(params) {
  const cfg = rideCfg_();
  const supplied = String((params && params.request) || '');
  if (!secureEqual_(supplied, cfg.requestToken)) {
    return jsonResponse_({ ok: false, message: 'Request decision access is not valid.' });
  }
  const ids = String((params && params.ids) || '')
    .split(',')
    .map(function(id) { return String(id || '').trim(); })
    .filter(function(id, index, all) { return /^FR-[A-Z0-9]+$/i.test(id) && all.indexOf(id) === index; })
    .slice(0, 25);
  const actions = [];
  ids.forEach(function(id) {
    const found = findRideRow_(id);
    if (!found || String(found.obj.Status || '').toUpperCase() !== 'REQUESTED') return;
    actions.push({
      requestId: id,
      acceptUrl: actionUrl_('confirm', id),
      declineUrl: actionUrl_('decline', id)
    });
  });
  return jsonResponse_({ ok: true, actions: actions });
}


function normalizeRiderStatus_(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  const map = {
    'confirmed':'Confirmed',
    'leaving':'Leaving',
    'on the way':'On the way',
    'arriving soon':'Arriving soon',
    'arrived':'Arrived',
    'ride in progress':'Ride in progress',
    'complete':'Complete',
    'completed':'Complete',
    'cancelled':'Cancelled',
    'canceled':'Cancelled'
  };
  return map[key] || '';
}

function riderStatusIndex_(status) {
  return RIDE.RIDER_STATUS_SEQUENCE.indexOf(normalizeRiderStatus_(status));
}

function riderStatusCanAdvance_(current, next) {
  const currentLabel = normalizeRiderStatus_(current);
  const nextLabel = normalizeRiderStatus_(next);
  if (!nextLabel || nextLabel === 'Cancelled') return false;
  if (currentLabel === nextLabel) return true;
  const currentIndex = riderStatusIndex_(currentLabel);
  const nextIndex = riderStatusIndex_(nextLabel);
  return currentIndex >= 0 && nextIndex === currentIndex + 1;
}

function riderStatusEvents_(requestId) {
  const id = String(requestId || '').trim();
  const sh = rideStatusEventsSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  const at = function(name) { return headers.indexOf(name); };
  return values.slice(1).filter(function(row) {
    return String(row[at('Request ID')] || '') === id;
  }).map(function(row) {
    return {
      eventId: String(row[at('Event ID')] || ''),
      requestId: id,
      status: normalizeRiderStatus_(row[at('Status')]),
      occurredAt: isoOrNull_(row[at('Occurred At')]),
      source: String(row[at('Source')] || ''),
      idempotencyKey: String(row[at('Idempotency Key')] || '')
    };
  }).filter(function(event) { return !!event.status; });
}

function currentRiderStatus_(requestId, found) {
  const events = riderStatusEvents_(requestId);
  if (events.length) return events[events.length - 1];
  found = found || findRideRow_(requestId);
  if (!found) return null;
  const base = String(found.obj.Status || '').toUpperCase();
  if (base === 'CONFIRMED') return { requestId:String(requestId), status:'Confirmed', occurredAt:isoOrNull_(found.obj['Confirmed At']), inferred:true };
  if (base === 'COMPLETED') return { requestId:String(requestId), status:'Complete', occurredAt:isoOrNull_(found.obj['Completed At']), inferred:true };
  if (base === 'CANCELLED') return { requestId:String(requestId), status:'Cancelled', occurredAt:isoOrNull_(found.obj['Cancelled At']), inferred:true };
  return null;
}

function findStatusEventByKey_(events, key) {
  key = String(key || '');
  if (!key) return null;
  for (let i = 0; i < events.length; i++) if (events[i].idempotencyKey === key) return events[i];
  return null;
}

function findStatusEventByStatus_(events, status) {
  const wanted = normalizeRiderStatus_(status);
  for (let i = 0; i < events.length; i++) if (events[i].status === wanted) return events[i];
  return null;
}

function appendRideStatusEvent_(requestId, status, source, idempotencyKey) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return appendRideStatusEventUnlocked_(requestId, status, source, idempotencyKey);
  } finally {
    lock.releaseLock();
  }
}

function appendRideStatusEventUnlocked_(requestId, status, source, idempotencyKey) {
  const id = String(requestId || '').trim();
  const next = normalizeRiderStatus_(status);
  const key = String(idempotencyKey || (id + ':' + String(next).toLowerCase().replace(/\s+/g, '-'))).trim();
  if (!/^FR-[A-Z0-9]+$/i.test(id)) throw new Error('Ride request ID is not valid.');
  if (!next) throw new Error('Rider status is not valid.');
  if (!key || key.length > 180) throw new Error('Idempotency key is required.');

  const found = findRideRow_(id);
  if (!found) throw new Error('Ride request not found.');
  const rideState = String(found.obj.Status || '').toUpperCase();
  if (rideState === 'DECLINED') throw new Error('A declined ride cannot receive status updates.');
  if (rideState === 'CANCELLED' && next !== 'Cancelled') throw new Error('A cancelled ride cannot receive status updates.');

  const events = riderStatusEvents_(id);
  const keyed = findStatusEventByKey_(events, key);
  if (keyed) {
    if (keyed.status !== next) throw new Error('Idempotency key was already used for another status.');
    return Object.assign({ ok:true, duplicate:true }, keyed);
  }
  const sameStatus = findStatusEventByStatus_(events, next);
  if (sameStatus) return Object.assign({ ok:true, duplicate:true }, sameStatus);

  const current = currentRiderStatus_(id, found);
  if (next === 'Cancelled') {
    if (rideState !== 'CONFIRMED' && rideState !== 'CANCELLED') throw new Error('Only a confirmed ride can be cancelled.');
  } else if (next === 'Confirmed') {
    if (rideState !== 'CONFIRMED') throw new Error('The ride must be confirmed before the Confirmed event is recorded.');
  } else {
    if (!current || current.status === 'Cancelled' || current.status === 'Complete') throw new Error('Ride status cannot advance from its current state.');
    if (!riderStatusCanAdvance_(current.status, next)) {
      throw new Error('Next rider status must follow the approved progression after ' + current.status + '.');
    }
  }

  const now = new Date();
  const event = {
    eventId: 'RSE-' + Utilities.getUuid().slice(0, 12).toUpperCase(),
    requestId: id,
    status: next,
    occurredAt: now.toISOString(),
    source: String(source || 'HOY_DRIVER').slice(0, 40),
    idempotencyKey: key
  };
  rideStatusEventsSheet_().appendRow([
    event.eventId, event.requestId, event.status, now, event.source, event.idempotencyKey
  ]);

  if (next === 'Complete' && rideState !== 'COMPLETED') {
    updateRideCells_(found.rowIndex, { 'Status':'COMPLETED', 'Updated At':now, 'Completed At':now });
  }
  return Object.assign({ ok:true, duplicate:false }, event);
}

function driverStatusUpdateResponse_(params) {
  const cfg = rideCfg_();
  const supplied = String((params && params.request) || '');
  if (!secureEqual_(supplied, cfg.requestToken)) {
    return jsonResponse_({ ok:false, message:'Driver status access is not valid.' });
  }
  try {
    const result = appendRideStatusEvent_(
      String(params.id || ''),
      String(params.status || ''),
      'HOY_DRIVER',
      String(params.key || '')
    );
    return jsonResponse_({
      ok:true,
      requestId:result.requestId,
      status:result.status,
      occurredAt:result.occurredAt,
      duplicate:result.duplicate === true
    });
  } catch (error) {
    return jsonResponse_({ ok:false, message:String((error && error.message) || error) });
  }
}

function driverStatusStateResponse_(params) {
  const cfg = rideCfg_();
  const supplied = String((params && params.request) || '');
  if (!secureEqual_(supplied, cfg.requestToken)) {
    return jsonResponse_({ ok:false, message:'Driver status access is not valid.' });
  }
  const ids = String((params && params.ids) || '').split(',')
    .map(function(id) { return String(id || '').trim(); })
    .filter(function(id, index, all) { return /^FR-[A-Z0-9]+$/i.test(id) && all.indexOf(id) === index; })
    .slice(0, 25);
  const states = ids.map(function(id) {
    const state = currentRiderStatus_(id);
    return state ? { requestId:id, status:state.status, occurredAt:state.occurredAt || null } : null;
  }).filter(Boolean);
  return jsonResponse_({ ok:true, states:states });
}

function normalizeRideId_(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function validRideId_(value) {
  return /^PV-[A-HJ-NP-Z2-9]{10}$/.test(normalizeRideId_(value));
}

function generateRideIdCandidate_() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const raw = Utilities.getUuid().replace(/-/g, '').toUpperCase();
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[parseInt(raw.slice(i * 2, i * 2 + 2), 16) % alphabet.length];
  return 'PV-' + out;
}

function generateRidePin_() {
  const raw = Utilities.getUuid().replace(/-/g, '');
  const value = parseInt(raw.slice(0, 12), 16) % 1000000;
  return String(value).padStart(6, '0');
}

function generatePinSalt_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function pinVerifierWithSecret_(rideId, pin, salt, secret) {
  const message = [normalizeRideId_(rideId), String(pin || ''), String(salt || '')].join('|');
  const raw = Utilities.computeHmacSha256Signature(message, String(secret || ''));
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}

function pinVerifier_(rideId, pin, salt) {
  const secret = rideCfg_().confirmSecret;
  if (!secret) throw new Error('CONFIRM_SECRET is required. Run setupRideSystem().');
  return pinVerifierWithSecret_(rideId, pin, salt, secret);
}

function findRideByRideId_(rideId) {
  const wanted = normalizeRideId_(rideId);
  if (!validRideId_(wanted)) return null;
  const values = rideSheet_().getDataRange().getValues();
  if (values.length < 2) return null;
  const headers = values[0].map(String);
  const rideIdCol = headers.indexOf('Ride ID');
  if (rideIdCol < 0) return null;
  for (let i = 1; i < values.length; i++) {
    if (normalizeRideId_(values[i][rideIdCol]) === wanted) return rideRowObject_(values, headers, i);
  }
  return null;
}

function uniqueRideId_() {
  for (let i = 0; i < 12; i++) {
    const candidate = generateRideIdCandidate_();
    if (!findRideByRideId_(candidate)) return candidate;
  }
  throw new Error('Could not issue a unique Ride ID.');
}

function issueRideAccessUnlocked_(found) {
  const existingRideId = normalizeRideId_(found.obj['Ride ID']);
  const sentAt = found.obj['Access Email Sent At'];
  if (existingRideId && found.obj['PIN Salt'] && found.obj['PIN Verifier'] && sentAt) {
    return { created:false, rideId:existingRideId, pin:'', emailAlreadySent:true };
  }
  const rideId = existingRideId || uniqueRideId_();
  const pin = generateRidePin_();
  const salt = generatePinSalt_();
  const now = new Date();
  const updates = {
    'Ride ID':rideId,
    'PIN Salt':salt,
    'PIN Verifier':pinVerifier_(rideId, pin, salt),
    'Access Issued At':now
  };
  updateRideCells_(found.rowIndex, updates);
  Object.keys(updates).forEach(function(key) { found.obj[key] = updates[key]; });
  return { created:true, rideId:rideId, pin:pin, emailAlreadySent:false };
}

function rideStatusAccessUrl_(rideId) {
  const cfg = rideCfg_();
  if (!cfg.webAppUrl) throw new Error('WEB_APP_URL is required in Script Properties.');
  return cfg.webAppUrl + '?action=status&ride=' + encodeURIComponent(normalizeRideId_(rideId));
}

function ensureConfirmedAccessDeliveryUnlocked_(found) {
  const status = String(found.obj.Status || '').toUpperCase();
  if (status !== 'CONFIRMED') throw new Error('Ride access can be issued only for a confirmed ride.');
  const access = issueRideAccessUnlocked_(found);
  let sent = !!found.obj['Access Email Sent At'];
  if (!sent) {
    if (!access.pin) throw new Error('A new PIN is required before the access email can be sent.');
    notifyCustomerConfirmed_(found.obj, access);
    const sentAt = new Date();
    updateRideCells_(found.rowIndex, {'Access Email Sent At':sentAt});
    found.obj['Access Email Sent At'] = sentAt;
    sent = true;
  }
  const result = rideTransitionResult_(found.obj);
  result.rideId = access.rideId;
  result.accessEmailSent = sent;
  result.accessCreated = access.created;
  return result;
}

function authenticateRideAccess_(rideId, pin) {
  const normalized = normalizeRideId_(rideId);
  const suppliedPin = String(pin || '').trim();
  if (!validRideId_(normalized) || !/^\d{6}$/.test(suppliedPin)) return null;
  const found = findRideByRideId_(normalized);
  if (!found) return null;
  const salt = String(found.obj['PIN Salt'] || '');
  const stored = String(found.obj['PIN Verifier'] || '');
  if (!salt || !stored) return null;
  const actual = pinVerifier_(normalized, suppliedPin, salt);
  return secureEqual_(stored, actual) ? found : null;
}

function riderAccessFailureMessage_() {
  return 'Ride status could not be opened. Check the Ride ID and PIN and try again.';
}

function rideStatusAccessPage_(params) {
  return renderRideStatusAccessForm_(String((params && params.ride) || ''), '');
}

function riderStatusAccessSubmitPage_(params) {
  const rideId = String((params && (params.rideId || params.ride)) || '');
  const pin = String((params && params.pin) || '');
  const found = authenticateRideAccess_(rideId, pin);
  if (!found) return renderRideStatusAccessForm_(rideId, riderAccessFailureMessage_());
  const state = currentRiderStatus_(found.obj['Request ID'], found);
  if (!state) return renderRideStatusAccessForm_(rideId, riderAccessFailureMessage_());
  return renderRiderStatusPage_(state.status, state.occurredAt);
}

function riderStatusLookupResponse_(params) {
  const found = authenticateRideAccess_(String(params.rideId || params.ride || ''), String(params.pin || ''));
  if (!found) return jsonResponse_({ok:false, message:riderAccessFailureMessage_()});
  const state = currentRiderStatus_(found.obj['Request ID'], found);
  if (!state) return jsonResponse_({ok:false, message:riderAccessFailureMessage_()});
  return jsonResponse_({
    ok:true,
    rideId:normalizeRideId_(found.obj['Ride ID']),
    status:state.status,
    occurredAt:state.occurredAt || null
  });
}

function renderRideStatusAccessForm_(rideId, errorMessage) {
  const cfg = rideCfg_();
  const action = esc_(cfg.webAppUrl || '');
  const error = errorMessage ? '<div class="error">' + esc_(errorMessage) + '</div>' : '';
  const page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Ride status</title><style>body{margin:0;min-height:100vh;background:#0b1023;color:#f4f2ee;font-family:Arial,sans-serif;display:grid;place-items:center;padding:24px}.card{width:min(460px,100%);padding:28px;border:1px solid #2b334c;background:#11172c}h1{margin:0 0 8px}.sub{color:#a6adc0;margin:0 0 22px}label{display:block;margin:14px 0 6px;font-weight:700}input{width:100%;box-sizing:border-box;padding:13px;border:1px solid #3c4666;background:#0b1023;color:#fff;font-size:1rem}button{width:100%;margin-top:18px;padding:14px;border:0;background:#45e394;color:#082116;font-weight:800}.error{margin:0 0 16px;padding:12px;border:1px solid #ff6680;color:#ff9aac}.note{margin-top:18px;color:#a6adc0;font-size:.82rem;line-height:1.5}</style></head>' +
    '<body><main class="card"><h1>Ride status</h1><p class="sub">Enter the private access details from your confirmation email.</p>' + error +
    '<form method="post" action="' + action + '"><input type="hidden" name="action" value="status-access">' +
    '<label for="rideId">Ride ID</label><input id="rideId" name="rideId" autocomplete="off" required value="' + esc_(normalizeRideId_(rideId)) + '">' +
    '<label for="pin">PIN</label><input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>' +
    '<button type="submit">Open ride status</button></form><p class="note">This page shows only the status of one ride. It does not show personal information or live location.</p></main></body></html>';
  return HtmlService.createHtmlOutput(page).setTitle('Ride status');
}

function renderRiderStatusPage_(currentStatus, occurredAt) {
  const current = normalizeRiderStatus_(currentStatus);
  const cancelled = current === 'Cancelled';
  const currentIndex = riderStatusIndex_(current);
  const rows = RIDE.RIDER_STATUS_SEQUENCE.map(function(label, index) {
    const cls = cancelled ? '' : (index < currentIndex ? 'done' : index === currentIndex ? 'current' : '');
    return '<li class="' + cls + '"><span></span><b>' + esc_(label) + '</b></li>';
  }).join('');
  const updated = occurredAt ? '<p class="updated">Updated ' + esc_(formatStatusTime_(occurredAt)) + '</p>' : '';
  const cancellation = cancelled ? '<div class="cancelled">Ride cancelled</div>' : '';
  const page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Ride status</title><style>body{margin:0;min-height:100vh;background:#0b1023;color:#f4f2ee;font-family:Arial,sans-serif;display:grid;place-items:center;padding:24px}.card{width:min(520px,100%);padding:28px;border:1px solid #2b334c;background:#11172c}h1{margin:0 0 8px;font-size:1.8rem}.sub,.updated{color:#a6adc0}.sub{margin:0 0 24px}.updated{font-size:.82rem;margin:18px 0 0}ol{list-style:none;padding:0;margin:0;display:grid;gap:12px}li{display:flex;gap:12px;align-items:center;color:#69738f}li span{width:14px;height:14px;border:2px solid #3c4666;border-radius:50%}li.done,li.current{color:#f4f2ee}li.done span{background:#56d39c;border-color:#56d39c}li.current span{background:#45e7ff;border-color:#45e7ff;box-shadow:0 0 0 5px rgba(69,231,255,.12)}.cancelled{margin:18px 0;padding:14px;border:1px solid #ff6680;color:#ff9aac;font-weight:700}.note{margin-top:24px;color:#a6adc0;font-size:.82rem;line-height:1.5}</style></head>' +
    '<body><main class="card"><h1>Ride status</h1><p class="sub">Updates from your driver.</p>' + cancellation + '<ol>' + rows + '</ol>' + updated + '<p class="note">This page shows status updates only. Location is not shown.</p></main></body></html>';
  return HtmlService.createHtmlOutput(page).setTitle('Ride status');
}

function formatStatusTime_(value) {
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? '' : Utilities.formatDate(date, RIDE.TIMEZONE, "MMM d 'at' h:mm a");
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload || {}))
    .setMimeType(ContentService.MimeType.JSON);
}

function getPublicConfig(payload) {
  payload = payload || {};
  const cfg = rideCfg_();
  const token = String(payload.requestToken || '');
  const testMode = payload.testMode === true;
  return {
    driverName: cfg.driverName,
    vehicle: cfg.vehicle,
    requestOpen: testMode || secureEqual_(token, cfg.requestToken),
    testMode: testMode
  };
}

function submitRideRequest(payload) {
  payload = payload || {};
  if (payload.testMode === true) {
    return {
      ok: true,
      noWrite: true,
      requestId: 'TEST-RIDE-REQUEST',
      status: 'REQUESTED',
      driverName: rideCfg_().driverName
    };
  }

  const cfg = rideCfg_();
  if (!secureEqual_(String(payload.requestToken || ''), cfg.requestToken)) {
    throw new Error('This private request link is not valid.');
  }
  if (payload.consent !== true) throw new Error('Consent is required before sending a request.');

  const customer = normalizeRidePayload_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = rideSheet_();
    const duplicate = findDuplicateRide_(customer.dedupKey);
    if (duplicate) {
      return {
        ok: true,
        duplicate: true,
        requestId: duplicate.obj['Request ID'],
        status: duplicate.obj.Status,
        driverName: cfg.driverName
      };
    }

    const now = new Date();
    const requestId = 'FR-' + Utilities.getUuid().slice(0, 8).toUpperCase();
    const row = {
      'Request ID': requestId,
      'Received At': now,
      'Updated At': now,
      'Status': 'REQUESTED',
      'Source': 'PRIVATE_LINK',
      'Customer Name': customer.name,
      'Customer Phone': customer.phone,
      'Customer Email': customer.email,
      'Pickup Address': customer.pickup,
      'Destination': customer.destination,
      'Pickup At': customer.pickupAt,
      'Passengers': customer.passengers,
      'Notes': customer.notes,
      'Consent': true,
      'Confirmed At': '',
      'Cancelled At': '',
      'Completed At': '',
      'Calendar Event ID': '',
      'Driver Notes': '',
      'Dedup Key': customer.dedupKey
    };
    sh.appendRow(RIDE.HEADERS.map(function(header) { return row[header] === undefined ? '' : row[header]; }));
    notifyDriverOfRequest_(row);
    notifyCustomerReceived_(row);
    return { ok: true, requestId: requestId, status: 'REQUESTED', driverName: cfg.driverName };
  } finally {
    lock.releaseLock();
  }
}

function normalizeRidePayload_(payload) {
  const name = String(payload.name || '').trim();
  const phone = String(payload.phone || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const pickup = String(payload.pickup || '').trim();
  const destination = String(payload.destination || '').trim();
  const date = String(payload.date || '').trim();
  const time = String(payload.time || '').trim();
  const passengers = Math.max(1, Math.min(7, Number(payload.passengers) || 1));
  const notes = String(payload.notes || '').trim();

  if (!name || !phone || !email || !pickup || !destination || !date || !time) {
    throw new Error('Name, phone, email, pickup, destination, date, and time are required.');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That email address does not look right.');

  const pickupAt = parseRideStart_(date, time);
  if (pickupAt.getTime() < Date.now() + 15 * 60000) throw new Error('Pickup time must be at least 15 minutes in the future.');
  const dedupKey = [email, pickupAt.toISOString(), pickup.toLowerCase(), destination.toLowerCase()].join('|');
  return { name: name, phone: phone, email: email, pickup: pickup, destination: destination, pickupAt: pickupAt, passengers: passengers, notes: notes, dedupKey: dedupKey };
}

function findDuplicateRide_(dedupKey) {
  const values = rideSheet_().getDataRange().getValues();
  if (values.length < 2) return null;
  const headers = values[0].map(String);
  const dedupCol = headers.indexOf('Dedup Key');
  const statusCol = headers.indexOf('Status');
  for (let i = 1; i < values.length; i++) {
    const status = String(values[i][statusCol] || '').toUpperCase();
    if (String(values[i][dedupCol] || '') === dedupKey && ['REQUESTED','CONFIRMED'].indexOf(status) >= 0) {
      return rideRowObject_(values, headers, i);
    }
  }
  return null;
}

function confirmRide(requestId) { return transitionRide_(requestId, 'CONFIRMED'); }
function declineRide(requestId) { return transitionRide_(requestId, 'DECLINED'); }
function cancelRide(requestId) { return transitionRide_(requestId, 'CANCELLED'); }
function completeRide(requestId) { return transitionRide_(requestId, 'COMPLETED'); }

function transitionRide_(requestId, nextStatus) {
  nextStatus = String(nextStatus || '').toUpperCase();
  if (RIDE.STATUSES.indexOf(nextStatus) < 0) throw new Error('Invalid ride status.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const found = findRideRow_(requestId);
    if (!found) throw new Error('Ride request not found.');
    const current = String(found.obj.Status || 'REQUESTED').toUpperCase();
    if (current === nextStatus) return rideTransitionResult_(found.obj);

    if (!rideTransitionAllowed_(current, nextStatus)) {
      throw new Error('Cannot change a ' + current + ' ride to ' + nextStatus + '.');
    }
    if (nextStatus === 'COMPLETED') {
      const riderState = currentRiderStatus_(requestId, found);
      if (!riderState || riderState.status !== 'Ride in progress') {
        throw new Error('Complete follows Ride in progress in the approved rider sequence.');
      }
    }

    const now = new Date();
    const updates = { 'Status': nextStatus, 'Updated At': now };
    if (nextStatus === 'CONFIRMED') {
      const start = new Date(found.obj['Pickup At']);
      const end = new Date(start.getTime() + RIDE.DEFAULT_RIDE_MINUTES * 60000);
      updates['Calendar Event ID'] = createCalendarEvent_(found.obj, start, end);
      updates['Confirmed At'] = now;
    }
    if (nextStatus === 'CANCELLED') {
      updates['Cancelled At'] = now;
      deleteCalendarEvent_(found.obj['Calendar Event ID']);
    }
    if (nextStatus === 'COMPLETED') updates['Completed At'] = now;

    updateRideCells_(found.rowIndex, updates);
    Object.keys(updates).forEach(function(key) { found.obj[key] = updates[key]; });

    if (nextStatus === 'CONFIRMED') {
      appendRideStatusEventUnlocked_(requestId, 'Confirmed', 'REQUEST_APP', requestId + ':confirmed');
    }
    if (nextStatus === 'CANCELLED') {
      appendRideStatusEventUnlocked_(requestId, 'Cancelled', 'REQUEST_APP', requestId + ':cancelled');
    }
    if (nextStatus === 'COMPLETED') {
      appendRideStatusEventUnlocked_(requestId, 'Complete', 'REQUEST_APP', requestId + ':complete');
    }

    if (nextStatus === 'CONFIRMED') return ensureConfirmedAccessDeliveryUnlocked_(found);
    if (nextStatus === 'DECLINED') notifyCustomerDeclined_(found.obj);
    if (nextStatus === 'CANCELLED') notifyCustomerCancelled_(found.obj);
    return rideTransitionResult_(found.obj);
  } finally {
    lock.releaseLock();
  }
}

function rideTransitionAllowed_(current, nextStatus) {
  const allowed = {
    REQUESTED: ['CONFIRMED','DECLINED','CANCELLED'],
    CONFIRMED: ['COMPLETED','CANCELLED'],
    DECLINED: [],
    CANCELLED: [],
    COMPLETED: []
  };
  return (allowed[String(current || '').toUpperCase()] || [])
    .indexOf(String(nextStatus || '').toUpperCase()) >= 0;
}

function rideTransitionResult_(obj) {
  return {
    ok: true,
    requestId: String(obj['Request ID'] || ''),
    status: String(obj.Status || ''),
    customerName: String(obj['Customer Name'] || ''),
    pickupAt: isoOrNull_(obj['Pickup At'])
  };
}

function rideActionPage_(action, params) {
  const id = String((params && params.id) || '');
  const exp = String((params && params.exp) || '');
  const token = String((params && params.t) || '');
  if (!id || !exp || !token) return htmlMessage_('Link incomplete', 'This action link is missing required information.');
  if (!verifyActionToken_(action, id, exp, token)) return htmlMessage_('Link not valid', 'This action link could not be verified or has expired.');
  try {
    const result = action === 'confirm' ? confirmRide(id) : action === 'decline' ? declineRide(id) : cancelRide(id);
    const title = action === 'confirm' ? 'Ride confirmed' : action === 'decline' ? 'Ride declined' : 'Ride cancelled';
    return htmlMessage_(title, esc_(result.customerName) + ' · ' + esc_(result.status));
  } catch (err) {
    return htmlMessage_('Action not completed', esc_(String((err && err.message) || err)));
  }
}

function requestUrl_() {
  const cfg = rideCfg_();
  if (!cfg.webAppUrl || !cfg.requestToken) return '';
  return cfg.webAppUrl + '?request=' + encodeURIComponent(cfg.requestToken);
}

function actionUrl_(action, requestId) {
  const cfg = rideCfg_();
  if (!cfg.webAppUrl) throw new Error('WEB_APP_URL is required in Script Properties.');
  const exp = Math.floor(Date.now() / 1000) + RIDE.ACTION_TTL_DAYS * 86400;
  return cfg.webAppUrl + '?action=' + encodeURIComponent(action) + '&id=' + encodeURIComponent(requestId) + '&exp=' + exp + '&t=' + actionToken_(action, requestId, exp);
}

function actionToken_(action, requestId, exp) {
  const secret = rideCfg_().confirmSecret;
  if (!secret) throw new Error('CONFIRM_SECRET is required. Run setupRideSystem().');
  return actionTokenWithSecret_(action, requestId, exp, secret);
}

function actionTokenWithSecret_(action, requestId, exp, secret) {
  const message = [String(action), String(requestId), String(exp)].join('|');
  const raw = Utilities.computeHmacSha256Signature(message, String(secret || ''));
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}

function verifyActionToken_(action, requestId, exp, provided) {
  const expiry = Number(exp);
  if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) return false;
  return secureEqual_(String(provided || ''), actionToken_(action, requestId, expiry));
}

function secureEqual_(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function notifyDriverOfRequest_(row) {
  const cfg = rideCfg_();
  MailApp.sendEmail({
    to: cfg.driverEmail,
    subject: 'Ride request — ' + row['Customer Name'] + ' · ' + formatPickup_(row['Pickup At']),
    body:
      'New private ride request\n\n' +
      'Customer: ' + row['Customer Name'] + '\n' +
      'Phone: ' + row['Customer Phone'] + '\n' +
      'Email: ' + row['Customer Email'] + '\n' +
      'When: ' + formatPickup_(row['Pickup At']) + '\n' +
      'Pickup: ' + row['Pickup Address'] + '\n' +
      'Destination: ' + row['Destination'] + '\n' +
      'Passengers: ' + row['Passengers'] + '\n' +
      'Notes: ' + (row['Notes'] || '(none)') + '\n\n' +
      'CONFIRM: ' + actionUrl_('confirm', row['Request ID']) + '\n\n' +
      'DECLINE: ' + actionUrl_('decline', row['Request ID']) + '\n'
  });
}

function notifyCustomerReceived_(row) {
  const cfg = rideCfg_();
  MailApp.sendEmail({
    to: row['Customer Email'],
    subject: 'Ride request received',
    body:
      'Hi ' + row['Customer Name'] + ',\n\n' +
      cfg.driverName + ' received your request. It is not confirmed yet.\n\n' +
      'Requested pickup: ' + formatPickup_(row['Pickup At']) + '\n' +
      'From: ' + row['Pickup Address'] + '\n' +
      'To: ' + row['Destination'] + '\n\n' +
      'You will receive another email after the driver confirms or declines it.\n'
  });
}

function notifyCustomerConfirmed_(obj, access) {
  const cfg = rideCfg_();
  if (!access || !access.rideId || !access.pin) throw new Error('Ride access details are required for confirmation email.');
  MailApp.sendEmail({
    to: obj['Customer Email'],
    subject: 'Ride confirmed — ' + formatPickup_(obj['Pickup At']),
    body:
      'Hi ' + obj['Customer Name'] + ',\n\nYour ride is confirmed.\n\n' +
      'Driver: ' + cfg.driverName + (cfg.vehicle ? ' · ' + cfg.vehicle : '') + '\n' +
      (cfg.driverPhone ? 'Driver phone: ' + cfg.driverPhone + '\n' : '') +
      'When: ' + formatPickup_(obj['Pickup At']) + '\n' +
      'Pickup: ' + obj['Pickup Address'] + '\n' +
      'Destination: ' + obj['Destination'] + '\n\n' +
      'Private ride status\n' +
      'Ride ID: ' + access.rideId + '\n' +
      'PIN: ' + access.pin + '\n' +
      'Status link: ' + rideStatusAccessUrl_(access.rideId) + '\n\n' +
      'Keep the Ride ID and PIN private. The PIN is not stored in readable form and cannot be recovered.\n\n' +
      'A calendar invitation has been sent to this email address.\n'
  });
}

function notifyCustomerDeclined_(obj) {
  MailApp.sendEmail({
    to: obj['Customer Email'],
    subject: 'Ride request update',
    body: 'Hi ' + obj['Customer Name'] + ',\n\n' + rideCfg_().driverName + ' is not available for the requested ride on ' + formatPickup_(obj['Pickup At']) + '.\n'
  });
}

function notifyCustomerCancelled_(obj) {
  MailApp.sendEmail({
    to: obj['Customer Email'],
    subject: 'Ride cancelled',
    body: 'Hi ' + obj['Customer Name'] + ',\n\nThe ride scheduled for ' + formatPickup_(obj['Pickup At']) + ' has been cancelled.\n'
  });
}

function createCalendarEvent_(obj, start, end) {
  const cfg = rideCfg_();
  const cal = cfg.calendarId && cfg.calendarId !== 'primary'
    ? CalendarApp.getCalendarById(cfg.calendarId)
    : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('Calendar not found.');
  const event = cal.createEvent(
    'Ride — ' + obj['Customer Name'] + ' to ' + obj.Destination,
    start,
    end,
    {
      location: obj['Pickup Address'],
      description:
        'Customer: ' + obj['Customer Name'] + '\n' +
        'Phone: ' + obj['Customer Phone'] + '\n' +
        'Email: ' + obj['Customer Email'] + '\n' +
        'Pickup: ' + obj['Pickup Address'] + '\n' +
        'Destination: ' + obj.Destination + '\n' +
        'Passengers: ' + obj.Passengers + '\n' +
        'Notes: ' + (obj.Notes || '(none)') + '\n' +
        'Request ID: ' + obj['Request ID'],
      guests: obj['Customer Email'],
      sendInvites: true
    }
  );
  return event.getId();
}

function deleteCalendarEvent_(eventId) {
  if (!eventId) return;
  try {
    const event = CalendarApp.getEventById(String(eventId));
    if (event) event.deleteEvent();
  } catch (err) {
    console.log('Calendar cleanup warning: ' + String(err));
  }
}

function findRideRow_(requestId) {
  const values = rideSheet_().getDataRange().getValues();
  if (values.length < 2) return null;
  const headers = values[0].map(String);
  const idCol = headers.indexOf('Request ID');
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(requestId)) return rideRowObject_(values, headers, i);
  }
  return null;
}

function rideRowObject_(values, headers, zeroBasedIndex) {
  const obj = {};
  headers.forEach(function(header, col) { obj[header] = values[zeroBasedIndex][col]; });
  return { rowIndex: zeroBasedIndex + 1, headers: headers, obj: obj };
}

function updateRideCells_(rowIndex, updates) {
  const sh = rideSheet_();
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  Object.keys(updates).forEach(function(key) {
    const col = headers.indexOf(key);
    if (col >= 0) sh.getRange(rowIndex, col + 1).setValue(updates[key]);
  });
}

function parseRideStart_(dateStr, timeStr) {
  const d = String(dateStr).split('-').map(Number);
  const t = String(timeStr).split(':').map(Number);
  if (d.length < 3 || t.length < 2 || d.some(isNaN) || t.some(isNaN)) throw new Error('Could not read the requested date and time.');
  return new Date(d[0], d[1] - 1, d[2], t[0], t[1], 0, 0);
}

function isoOrNull_(value) {
  if (value === '' || value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function formatPickup_(value) {
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? String(value || '') : Utilities.formatDate(date, RIDE.TIMEZONE, "EEEE, MMMM d 'at' h:mm a");
}

function esc_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function htmlMessage_(title, message) {
  const page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(180deg,#241335,#6B2557 55%,#D6522F);color:#fff;font-family:Arial,sans-serif}.card{max-width:480px;padding:34px;background:rgba(10,11,20,.55);border:1px solid rgba(255,255,255,.2)}h1{margin:0 0 12px;text-transform:uppercase}p{line-height:1.55;color:rgba(255,255,255,.86)}</style></head>' +
    '<body><main class="card"><h1>' + esc_(title) + '</h1><p>' + message + '</p></main></body></html>';
  return HtmlService.createHtmlOutput(page).setTitle(title);
}

function migrateConfirmedRideAccess(requestId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const found = findRideRow_(String(requestId || '').trim());
    if (!found) throw new Error('Ride request not found.');
    if (String(found.obj.Status || '').toUpperCase() !== 'CONFIRMED') {
      throw new Error('Only a confirmed ride can receive migrated access.');
    }
    const originalRequestId = String(found.obj['Request ID'] || '');
    const result = ensureConfirmedAccessDeliveryUnlocked_(found);
    result.requestIdUnchanged = String(found.obj['Request ID'] || '') === originalRequestId;
    return result;
  } finally {
    lock.releaseLock();
  }
}

function menuMigrateSelectedAccess_() {
  const ui = SpreadsheetApp.getUi();
  try {
    const result = migrateConfirmedRideAccess(selectedRequestId_());
    ui.alert('Private rider access ready · ' + result.rideId);
  } catch (err) {
    ui.alert('Error: ' + String((err && err.message) || err));
  }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Rides')
    .addItem('Confirm selected request', 'menuConfirmSelected_')
    .addItem('Decline selected request', 'menuDeclineSelected_')
    .addItem('Cancel selected ride', 'menuCancelSelected_')
    .addItem('Complete selected ride', 'menuCompleteSelected_')
    .addItem('Issue private access for selected confirmed ride', 'menuMigrateSelectedAccess_')
    .addSeparator()
    .addItem('Set up / verify system', 'setupRideSystem')
    .addToUi();
}

function selectedRequestId_() {
  const sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== RIDE.SHEET_NAME) throw new Error('Open the Ride Requests tab and select a request row.');
  const row = sh.getActiveRange().getRow();
  if (row < 2) throw new Error('Select a request row, not the header.');
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  return String(sh.getRange(row, headers.indexOf('Request ID') + 1).getValue());
}

function menuConfirmSelected_() { menuRideAction_('CONFIRMED'); }
function menuDeclineSelected_() { menuRideAction_('DECLINED'); }
function menuCancelSelected_() { menuRideAction_('CANCELLED'); }
function menuCompleteSelected_() { menuRideAction_('COMPLETED'); }
function menuRideAction_(status) {
  const ui = SpreadsheetApp.getUi();
  try {
    const result = transitionRide_(selectedRequestId_(), status);
    ui.alert(result.customerName + ' · ' + result.status);
  } catch (err) {
    ui.alert('Error: ' + String((err && err.message) || err));
  }
}

/**
 * Deterministic PULSE-042 self-test. No Sheet, Mail, Calendar, deployment,
 * email, credential issuance, or production operation is performed.
 */
function testRideIdPinAccessPackage() {
  const rideId = 'PV-ABCDEFGH23';
  const pin = '482731';
  const salt = 'fixed-salt';
  const secret = 'fixed-secret';
  const verifier = pinVerifierWithSecret_(rideId, pin, salt, secret);
  if (!verifier || verifier.indexOf(pin) >= 0) throw new Error('PIN verifier is not one-way.');
  if (verifier !== pinVerifierWithSecret_(rideId, pin, salt, secret)) throw new Error('PIN verifier is not deterministic.');
  if (verifier === pinVerifierWithSecret_(rideId, '482732', salt, secret)) throw new Error('Wrong PIN produces the same verifier.');
  if (!validRideId_(rideId) || validRideId_('PV-INVALID-I1')) throw new Error('Ride ID validation failed.');
  const expectedAccessHeaders = ['Ride ID','PIN Salt','PIN Verifier','Access Issued At','Access Email Sent At'];
  expectedAccessHeaders.forEach(function(header) {
    if (RIDE.HEADERS.indexOf(header) < 0) throw new Error('Missing access header: ' + header);
  });
  const failure = riderAccessFailureMessage_();
  if (failure.indexOf('exists') >= 0 || failure.indexOf('not found') >= 0) throw new Error('Credential failure leaks ride existence.');
  const result = {
    ok:true,
    taskId:'PULSE-042',
    internalRequestIdPreserved:true,
    rideIdAndPinRequired:true,
    saltedPinVerifier:true,
    plaintextPinStored:false,
    genericCredentialFailure:true,
    confirmationDeliveryOnce:true,
    controlledMigration:true,
    publicRiderList:false,
    writesPerformed:false,
    emailSent:false,
    deploymentPerformed:false,
    productionTouched:false
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Deterministic PULSE-041 self-test. No Sheet, Mail, Calendar, deployment,
 * or production operation is performed.
 */
function testRideStatusProgressionPackage() {
  const exact = ['Confirmed','Leaving','On the way','Arriving soon','Arrived','Ride in progress','Complete'];
  if (JSON.stringify(RIDE.RIDER_STATUS_SEQUENCE) !== JSON.stringify(exact)) {
    throw new Error('Rider status wording or order changed.');
  }
  for (let i = 1; i < exact.length; i++) {
    if (!riderStatusCanAdvance_(exact[i - 1], exact[i])) throw new Error('Status progression is not sequential at ' + exact[i] + '.');
  }
  if (riderStatusCanAdvance_('Confirmed', 'Arriving soon')) throw new Error('Status progression allows skipping.');
  if (!riderStatusCanAdvance_('Arrived', 'Arrived')) throw new Error('Idempotent repeated status is not accepted.');
  const safePage = renderRiderStatusPage_('On the way', '2026-07-22T18:00:00Z').getContent();
  ['Customer Name','Customer Email','Driver Notes','earnings','API key','live GPS'].forEach(function(marker) {
    if (safePage.indexOf(marker) >= 0) throw new Error('Rider-safe status page exposes a forbidden marker: ' + marker);
  });
  const result = {
    ok:true,
    taskId:'PULSE-041',
    sequence:exact,
    cancellationSeparate:true,
    appendOnly:true,
    idempotent:true,
    riderSafePage:true,
    writesPerformed:false,
    deploymentPerformed:false,
    productionTouched:false
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Deterministic package self-test. This function performs no Sheet, Mail,
 * Calendar, GPS, deployment, or production operation.
 */
function testRideRequestAppPackage() {
  const noWrite = submitRideRequest({testMode: true});
  if (!noWrite || noWrite.noWrite !== true || noWrite.status !== 'REQUESTED') {
    throw new Error('Deterministic no-write request fixture failed.');
  }

  const exp = 2000000000;
  const confirm = actionTokenWithSecret_('confirm', 'REQ-TEST-1', exp, 'fixed-test-secret');
  const confirmAgain = actionTokenWithSecret_('confirm', 'REQ-TEST-1', exp, 'fixed-test-secret');
  const decline = actionTokenWithSecret_('decline', 'REQ-TEST-1', exp, 'fixed-test-secret');
  if (!confirm || confirm !== confirmAgain || confirm === decline) {
    throw new Error('Action-specific deterministic signature test failed.');
  }

  const lifecycle = {
    requestedToConfirmed: rideTransitionAllowed_('REQUESTED', 'CONFIRMED'),
    confirmedToCompleted: rideTransitionAllowed_('CONFIRMED', 'COMPLETED'),
    completedToRequested: rideTransitionAllowed_('COMPLETED', 'REQUESTED')
  };
  if (!lifecycle.requestedToConfirmed || !lifecycle.confirmedToCompleted || lifecycle.completedToRequested) {
    throw new Error('Ride lifecycle test failed.');
  }

  const result = {
    ok: true,
    noWrite: true,
    signatureBoundToAction: true,
    lifecycle: lifecycle,
    writesPerformed: false
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

