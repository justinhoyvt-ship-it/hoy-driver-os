/**
 * PULSE-084T — canonical QR_LIVE same-day request lane.
 *
 * Restores the owner-verified NOW / LATER TODAY flow without changing
 * RequestForm.html. Uses the existing PULSE-059 signed fare quote and the
 * existing Ride Requests writer/lifecycle in Code.gs.
 */

const PULSE_QR_LIVE = Object.freeze({
  SOURCE: 'QR_LIVE',
  NOW_RESPONSE_MINUTES_PROPERTY: 'QR_NOW_RESPONSE_MINUTES',
  NOW_RESPONSE_MINUTES_DEFAULT: 15,
  LATER_CUTOFF_MINUTES: 30,
  EXPIRY_HANDLER: 'expireQrLiveRequests',
  TIMING_MARKER: '[QR_LIVE:'
});

function qrLiveNowResponseMinutes_() {
  const raw = Number(
    PropertiesService.getScriptProperties()
      .getProperty(PULSE_QR_LIVE.NOW_RESPONSE_MINUTES_PROPERTY)
  );
  if (!Number.isFinite(raw)) return PULSE_QR_LIVE.NOW_RESPONSE_MINUTES_DEFAULT;
  return Math.max(5, Math.min(60, Math.round(raw)));
}

function qrLiveToday_() {
  return Utilities.formatDate(new Date(), RIDE.TIMEZONE, 'yyyy-MM-dd');
}

function qrLiveTiming_(value) {
  const timing = String(value || '').trim().toUpperCase();
  if (timing !== 'NOW' && timing !== 'LATER') throw new Error('Choose Now or Later.');
  return timing;
}

function qrLiveTimingFromNotes_(notes) {
  const match = String(notes || '').match(/\[QR_LIVE:(NOW|LATER)\]/i);
  return match ? String(match[1]).toUpperCase() : '';
}

function qrLiveNotes_(timing, notes) {
  const marker = '[QR_LIVE:' + timing + ']';
  const clean = String(notes || '').trim();
  return clean ? marker + ' ' + clean : marker;
}

function normalizeQrLivePayload_(payload) {
  payload = payload || {};
  const name = String(payload.name || '').trim();
  const phone = String(payload.phone || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const pickup = String(payload.pickup || '').trim();
  const destination = String(payload.destination || '').trim();
  const passengers = Math.max(1, Math.min(7, Number(payload.passengers) || 1));
  const notes = String(payload.notes || '').trim();
  const timing = qrLiveTiming_(payload.timing);
  const today = qrLiveToday_();
  const submittedDate = String(payload.date || today).trim();
  const pickupLatNumber = Number(payload.pickupLat);
  const pickupLngNumber = Number(payload.pickupLng);
  const hasPickupCoordinates =
    Number.isFinite(pickupLatNumber) && pickupLatNumber >= -90 && pickupLatNumber <= 90 &&
    Number.isFinite(pickupLngNumber) && pickupLngNumber >= -180 && pickupLngNumber <= 180;

  if (!name || !phone || !email || !pickup || !destination) {
    throw new Error('Name, phone, email, pickup, and destination are required.');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('That email address does not look right.');
  }
  if (submittedDate !== today) throw new Error('QR rides are available for today only.');

  const now = new Date();
  let pickupAt;
  if (timing === 'NOW') {
    pickupAt = now;
  } else {
    const time = String(payload.time || '').trim();
    if (!time) throw new Error('Choose a time later today.');
    pickupAt = parseRideStart_(today, time);
    if (pickupAt.getTime() < now.getTime() + 35 * 60000) {
      throw new Error('For a ride within 35 minutes, choose Now.');
    }
  }

  const dedupKey = [
    PULSE_QR_LIVE.SOURCE,
    email,
    timing,
    timing === 'NOW'
      ? Utilities.formatDate(now, RIDE.TIMEZONE, 'yyyy-MM-dd-HH-mm')
      : pickupAt.toISOString(),
    hasPickupCoordinates
      ? pickupLatNumber.toFixed(6) + ',' + pickupLngNumber.toFixed(6)
      : pickup.toLowerCase(),
    destination.toLowerCase()
  ].join('|');

  return {
    name: name,
    phone: phone,
    email: email,
    pickup: pickup,
    pickupLat: hasPickupCoordinates ? pickupLatNumber : '',
    pickupLng: hasPickupCoordinates ? pickupLngNumber : '',
    destination: destination,
    pickupAt: pickupAt,
    passengers: passengers,
    notes: qrLiveNotes_(timing, notes),
    timing: timing,
    dedupKey: dedupKey
  };
}

function qrLiveFareCustomer_(payload, customer) {
  if (customer.timing !== 'NOW') return customer;
  const signedPickup = new Date(String(payload.quotePickupAt || ''));
  if (isNaN(signedPickup.getTime())) return customer;
  return Object.assign({}, customer, { pickupAt: signedPickup });
}

/** Called only by QrLiveRequest.html. */
function submitQrLiveRide(payload) {
  payload = payload || {};
  if (payload.testMode === true && !payload.quoteToken) {
    return {
      ok: true,
      noWrite: true,
      requestId: 'TEST-QR-LIVE',
      status: 'REQUESTED',
      source: PULSE_QR_LIVE.SOURCE,
      timing: qrLiveTiming_(payload.timing || 'NOW'),
      driverName: rideCfg_().driverName
    };
  }

  const cfg = rideCfg_();
  if (!secureEqual_(String(payload.requestToken || ''), cfg.requestToken)) {
    throw new Error('This QR request link is not valid.');
  }
  if (payload.consent !== true) throw new Error('Consent is required before sending a request.');

  const customer = normalizeQrLivePayload_(payload);
  const fareQuote = pulseValidateSubmittedFareQuote_(payload, qrLiveFareCustomer_(payload, customer));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const duplicate = findDuplicateRide_(customer.dedupKey);
    if (duplicate) {
      return {
        ok: true,
        duplicate: true,
        requestId: String(duplicate.obj['Request ID'] || ''),
        status: String(duplicate.obj.Status || ''),
        source: PULSE_QR_LIVE.SOURCE,
        timing: customer.timing,
        driverName: cfg.driverName,
        quotedFare: Number(duplicate.obj['Quoted Fare'] || fareQuote.fare)
      };
    }

    const now = new Date();
    const requestId = 'FR-' + Utilities.getUuid().slice(0, 8).toUpperCase();
    const row = {
      'Request ID': requestId,
      'Received At': now,
      'Updated At': now,
      'Status': 'REQUESTED',
      'Source': PULSE_QR_LIVE.SOURCE,
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
      'Dedup Key': customer.dedupKey,
      'Quoted Fare': fareQuote.fare,
      'Quote ID': fareQuote.quoteId,
      'Quote Expires At': new Date(fareQuote.expiresAt),
      'Pricing Version': fareQuote.pricingVersion
    };

    rideSheet_().appendRow(
      RIDE.HEADERS.map(function(header) {
        return row[header] === undefined ? '' : row[header];
      })
    );

    // Preserve the working behavior: LATER emails the driver; NOW lands in Inbox.
    if (customer.timing === 'LATER') notifyDriverOfRequest_(row);
    notifyCustomerReceived_(row);

    return {
      ok: true,
      requestId: requestId,
      status: 'REQUESTED',
      source: PULSE_QR_LIVE.SOURCE,
      timing: customer.timing,
      driverEmailSent: customer.timing === 'LATER',
      driverName: cfg.driverName,
      quotedFare: fareQuote.fare,
      quoteId: fareQuote.quoteId
    };
  } finally {
    lock.releaseLock();
  }
}

function appendQrLiveDriverNote_(found, note) {
  const old = String(found.obj['Driver Notes'] || '').trim();
  const next = old ? old + '\n' + note : note;
  updateRideCells_(found.rowIndex, {'Driver Notes': next, 'Updated At': new Date()});
}

function driverDecisionResponse_(params) {
  const cfg = rideCfg_();
  const supplied = String((params && params.request) || '');
  if (!secureEqual_(supplied, cfg.requestToken)) {
    return jsonResponse_({ok:false, message:'Driver decision access is not valid.'});
  }

  const id = String((params && params.id) || '').trim();
  const decision = String((params && params.decision) || '').trim().toUpperCase();
  if (!/^FR-[A-Z0-9]+$/i.test(id)) return jsonResponse_({ok:false, message:'Ride request ID is not valid.'});
  if (decision !== 'DECLINE' && decision !== 'CONFIRM') return jsonResponse_({ok:false, message:'Decision is not valid.'});

  try {
    const before = findRideRow_(id);
    if (!before) throw new Error('Ride request not found.');
    const target = decision === 'DECLINE' ? 'DECLINED' : 'CONFIRMED';
    const duplicate = String(before.obj.Status || '').toUpperCase() === target;
    const result = decision === 'DECLINE' ? declineRide(id) : confirmRide(id);
    const after = findRideRow_(id);
    if (after && !duplicate) {
      appendQrLiveDriverNote_(
        after,
        (decision === 'DECLINE' ? 'Declined in Hoy Driver' : 'Confirmed in Hoy Driver') +
          ' at ' + new Date().toISOString()
      );
    }
    return jsonResponse_({
      ok:true,
      requestId:String(result.requestId || id),
      status:String(result.status || target),
      duplicate:duplicate
    });
  } catch (error) {
    return jsonResponse_({ok:false, message:String((error && error.message) || error)});
  }
}

function qrLiveExpiryDeadline_(obj) {
  const timing = qrLiveTimingFromNotes_(obj.Notes);
  if (!timing) return null;
  if (timing === 'NOW') {
    const received = obj['Received At'] instanceof Date ? obj['Received At'] : new Date(obj['Received At']);
    if (isNaN(received.getTime())) return null;
    return new Date(received.getTime() + qrLiveNowResponseMinutes_() * 60000);
  }
  const pickup = obj['Pickup At'] instanceof Date ? obj['Pickup At'] : new Date(obj['Pickup At']);
  if (isNaN(pickup.getTime())) return null;
  return new Date(pickup.getTime() - PULSE_QR_LIVE.LATER_CUTOFF_MINUTES * 60000);
}

function expireQrLiveRequests() {
  const sh = rideSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return {ok:true, checked:0, expired:0, errors:[], writesPerformed:false};

  const headers = values[0].map(String);
  const now = new Date();
  let checked = 0;
  let expired = 0;
  const errors = [];

  for (let i = 1; i < values.length; i++) {
    const obj = {};
    headers.forEach(function(header, col) { obj[header] = values[i][col]; });
    if (String(obj.Source || '').toUpperCase() !== PULSE_QR_LIVE.SOURCE) continue;
    if (String(obj.Status || '').toUpperCase() !== 'REQUESTED') continue;
    checked++;

    const deadline = qrLiveExpiryDeadline_(obj);
    if (!deadline || now.getTime() < deadline.getTime()) continue;
    const requestId = String(obj['Request ID'] || '');
    try {
      declineRide(requestId);
      const found = findRideRow_(requestId);
      if (found) appendQrLiveDriverNote_(found, 'AUTO_DECLINED at ' + now.toISOString());
      expired++;
    } catch (error) {
      errors.push({requestId:requestId, message:String((error && error.message) || error)});
    }
  }
  return {ok:errors.length === 0, checked:checked, expired:expired, errors:errors, writesPerformed:expired > 0};
}

function installQrLiveExpiryTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === PULSE_QR_LIVE.EXPIRY_HANDLER) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger(PULSE_QR_LIVE.EXPIRY_HANDLER).timeBased().everyMinutes(5).create();
  return {
    ok:true,
    handler:PULSE_QR_LIVE.EXPIRY_HANDLER,
    everyMinutes:5,
    laterCutoffMinutes:PULSE_QR_LIVE.LATER_CUTOFF_MINUTES,
    nowResponseMinutes:qrLiveNowResponseMinutes_(),
    productionDeploymentPerformed:false
  };
}

function testPulse084tQrLiveNoWrite() {
  const today = qrLiveToday_();
  const later = new Date(Date.now() + 2 * 60 * 60000);
  const normalized = normalizeQrLivePayload_({
    name:'Test Rider', phone:'802-555-0100', email:'test@example.com',
    pickup:'44.475000, -73.212000', destination:'BTV Airport', date:today,
    time:Utilities.formatDate(later, RIDE.TIMEZONE, 'HH:mm'), timing:'LATER',
    passengers:1, notes:'', consent:true
  });
  return {
    ok:true,
    source:PULSE_QR_LIVE.SOURCE,
    todayOnly:today,
    timing:normalized.timing,
    fareValidatorRequired:typeof pulseValidateSubmittedFareQuote_ === 'function',
    requestAppSoleWriter:true,
    writesPerformed:false,
    deploymentPerformed:false
  };
}
