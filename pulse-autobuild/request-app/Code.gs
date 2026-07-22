/**
 * Pulse Vermont — Private Ride Request App
 * ----------------------------------------
 * Separate least-privilege Apps Script project for invite-only ride requests.
 * Writes only to the configured DEV spreadsheet. Sends receipt/decision emails
 * and creates a calendar event only after the driver explicitly confirms.
 */

const RIDE = Object.freeze({
  SHEET_NAME: 'Ride Requests',
  TIMEZONE: 'America/New_York',
  DEFAULT_RIDE_MINUTES: 60,
  ACTION_TTL_DAYS: 30,
  STATUSES: Object.freeze(['REQUESTED','CONFIRMED','DECLINED','CANCELLED','COMPLETED']),
  HEADERS: Object.freeze([
    'Request ID','Received At','Updated At','Status','Source',
    'Customer Name','Customer Phone','Customer Email',
    'Pickup Address','Destination','Pickup At','Passengers','Notes','Consent',
    'Confirmed At','Cancelled At','Completed At','Calendar Event ID','Driver Notes','Dedup Key'
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
  const existing = sh.getLastColumn()
    ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), RIDE.HEADERS.length)).getValues()[0].map(String)
    : [];
  const ok = RIDE.HEADERS.every(function(header, index) { return existing[index] === header; });
  if (!ok && sh.getLastRow() > 1) {
    throw new Error('Ride Requests headers do not match the expected schema. Back up the sheet before repairing it.');
  }
  if (!ok) {
    sh.getRange(1, 1, 1, RIDE.HEADERS.length).setValues([RIDE.HEADERS]).setFontWeight('bold');
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
  return {
    ok: true,
    sheet: sh.getName(),
    spreadsheetId: cfg.spreadsheetId,
    requestUrl: requestUrl_(),
    driverEmail: cfg.driverEmail
  };
}

function doGet(e) {
  e = e || {};
  const params = e.parameter || {};
  const action = String(params.action || '').toLowerCase();
  if (action === 'driver-actions') {
    return driverActionLinksResponse_(params);
  }
  if (action === 'confirm' || action === 'decline' || action === 'cancel') {
    return rideActionPage_(action, params);
  }
  return HtmlService.createHtmlOutputFromFile('RequestForm')
    .setTitle('Pulse Vermont — Request a ride')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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

    if (nextStatus === 'CONFIRMED') notifyCustomerConfirmed_(found.obj);
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

function notifyCustomerConfirmed_(obj) {
  const cfg = rideCfg_();
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

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Rides')
    .addItem('Confirm selected request', 'menuConfirmSelected_')
    .addItem('Decline selected request', 'menuDeclineSelected_')
    .addItem('Cancel selected ride', 'menuCancelSelected_')
    .addItem('Complete selected ride', 'menuCompleteSelected_')
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

