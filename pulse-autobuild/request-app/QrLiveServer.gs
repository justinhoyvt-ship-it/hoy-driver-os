/**
 * PULSE-086R4 — canonical QR_LIVE same-day request lane + direct Pulse driver decision bridge.
 *
 * Keeps NOW / LATER TODAY, signed fare validation, and the existing Ride Requests schema.
 * R4 adds payment-preference presentation, current-deployment status links, and a
 * direct confirmation path for Hoy Driver so Accept never opens a driver confirmation page.
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
  const raw = Number(PropertiesService.getScriptProperties().getProperty(PULSE_QR_LIVE.NOW_RESPONSE_MINUTES_PROPERTY));
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

function pulseR4PaymentCodeFromNotes_(notes) {
  const match = String(notes || '').match(/\[PAY:(NOW|AFTER)\]/i);
  return match ? String(match[1]).toUpperCase() : '';
}

function pulseR4PaymentTextFromNotes_(notes) {
  const code = pulseR4PaymentCodeFromNotes_(notes);
  return code === 'NOW' ? 'Pay now' : code === 'AFTER' ? 'Pay after ride' : 'Not selected';
}

function pulseR4CleanNotes_(notes) {
  return String(notes || '')
    .replace(/\[QR_LIVE:(NOW|LATER)\]/ig, '')
    .replace(/\[PAY:(NOW|AFTER)\]/ig, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pulseR4ServiceUrl_() {
  let live = '';
  try { live = String(ScriptApp.getService().getUrl() || '').trim(); } catch (error) {}
  return live || String(rideCfg_().webAppUrl || '').trim();
}

function pulseR4StatusUrl_(rideId) {
  const base = pulseR4ServiceUrl_();
  if (!base) throw new Error('The request web app URL is unavailable.');
  return base + '?action=status&ride=' + encodeURIComponent(normalizeRideId_(rideId));
}

/** One-time production helper after deploying a new Friend Request version. */
function pulseR4SyncWebAppUrl() {
  const live = String(ScriptApp.getService().getUrl() || '').trim();
  if (!live) throw new Error('Deploy the Friend Request project as a web app before syncing WEB_APP_URL.');
  PropertiesService.getScriptProperties().setProperty('WEB_APP_URL', live);
  return {ok:true, webAppUrl:live, writesPerformed:true, deploymentPerformed:false};
}

function pulseR4EmailHtml_(title, lead, obj, options) {
  options = options || {};
  const cfg = rideCfg_();
  const image = cfg.emailHeroImageUrl
    ? '<img src="' + esc_(cfg.emailHeroImageUrl) + '" alt="Pulse Vermont ride" style="display:block;width:100%;max-height:250px;object-fit:cover;border:0">'
    : '';
  const button = options.buttonUrl
    ? '<p style="margin:26px 0 6px"><a href="' + esc_(options.buttonUrl) + '" style="display:inline-block;background:#45e394;color:#062718;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:10px">' + esc_(options.buttonLabel || 'Open') + '</a></p>'
    : '';
  const payment = pulseR4PaymentTextFromNotes_(obj['Notes']);
  const payNote = pulseR4PaymentCodeFromNotes_(obj['Notes']) === 'NOW'
    ? 'Payment step follows after confirmation.'
    : pulseR4PaymentCodeFromNotes_(obj['Notes']) === 'AFTER'
      ? 'Pay when the ride is complete.'
      : '';
  return '<div style="margin:0;background:#08111f;padding:24px 10px;font-family:Arial,sans-serif;color:#f7f9fb"><div style="max-width:620px;margin:0 auto;background:#101b2c;border:1px solid #29465c;border-radius:20px;overflow:hidden">' + image +
    '<div style="padding:26px"><div style="font-size:12px;letter-spacing:2px;color:#59d8ff;font-weight:800">PULSE VERMONT</div><h1 style="margin:8px 0;font-size:30px">' + esc_(title) + '</h1><p style="color:#bdd0de;font-size:16px">' + esc_(lead) + '</p>' +
    '<table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px">' +
    '<tr><td style="padding:9px 0;color:#8199aa">When</td><td style="padding:9px 0;text-align:right;font-weight:700">' + esc_(formatPickup_(obj['Pickup At'])) + '</td></tr>' +
    '<tr><td style="padding:9px 0;color:#8199aa">From</td><td style="padding:9px 0;text-align:right;font-weight:700">' + esc_(obj['Pickup Address']) + '</td></tr>' +
    '<tr><td style="padding:9px 0;color:#8199aa">To</td><td style="padding:9px 0;text-align:right;font-weight:700">' + esc_(obj['Destination']) + '</td></tr>' +
    '<tr><td style="padding:9px 0;color:#8199aa">Payment</td><td style="padding:9px 0;text-align:right;font-weight:800;color:#ffc45d">' + esc_(payment) + (payNote ? '<br><span style="font-size:12px;color:#8199aa;font-weight:400">' + esc_(payNote) + '</span>' : '') + '</td></tr>' +
    '<tr><td style="padding:14px 0;color:#8199aa;border-top:1px solid #29465c">Fare</td><td style="padding:14px 0;text-align:right;font-size:26px;font-weight:800;color:#6ee7b7;border-top:1px solid #29465c">' + esc_(rideFareText_(obj)) + '</td></tr></table>' +
    button + (options.securityHtml || '') + '<p style="margin:24px 0 0;color:#688092;font-size:12px">Local rides · Pulse Vermont</p></div></div></div>';
}

function pulseR4NotifyCustomerReceived_(row) {
  const payment = pulseR4PaymentTextFromNotes_(row['Notes']);
  MailApp.sendEmail({
    to: row['Customer Email'],
    subject: 'Ride request received',
    body: 'Hi ' + row['Customer Name'] + ',\n\nRequest sent to your Pulse driver. It is not confirmed yet.\n\nWhen: ' + formatPickup_(row['Pickup At']) + '\nFrom: ' + row['Pickup Address'] + '\nTo: ' + row['Destination'] + '\nFare: ' + rideFareText_(row) + '\nPayment: ' + payment + '\n',
    htmlBody: pulseR4EmailHtml_('Request received', 'Request sent to your Pulse driver. It is not confirmed yet.', row, {})
  });
}

function pulseR4NotifyDriverRequest_(row) {
  const clean = pulseR4CleanNotes_(row['Notes']);
  MailApp.sendEmail({
    to: rideCfg_().driverEmail,
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
      'Fare: ' + rideFareText_(row) + '\n' +
      'Payment: ' + pulseR4PaymentTextFromNotes_(row['Notes']) + '\n' +
      'Notes: ' + (clean || '(none)') + '\n\n' +
      'Review this request in the Pulse driver Inbox.\n'
  });
}

function pulseR4NotifyCustomerConfirmed_(obj, access) {
  const cfg = rideCfg_();
  if (!access || !access.rideId || !access.pin) throw new Error('Ride access details are required for confirmation email.');
  const url = pulseR4StatusUrl_(access.rideId);
  const security = '<div style="margin-top:22px;padding:14px;border-radius:10px;background:#0a1423;color:#9db0c1;font-size:12px;line-height:1.55">Ride ID: <b style="color:#fff">' + esc_(access.rideId) + '</b><br>PIN: <b style="color:#fff">' + esc_(access.pin) + '</b><br>Keep these private as fallback access details.</div>';
  const payment = pulseR4PaymentTextFromNotes_(obj['Notes']);
  MailApp.sendEmail({
    to: obj['Customer Email'],
    subject: 'Ride confirmed — ' + formatPickup_(obj['Pickup At']),
    body: 'Your ride is confirmed.\nFare: ' + rideFareText_(obj) + '\nPayment: ' + payment + '\nStatus: ' + url + '\nRide ID: ' + access.rideId + '\nPIN: ' + access.pin,
    htmlBody: pulseR4EmailHtml_('Ride confirmed', cfg.driverName + (cfg.vehicle ? ' · ' + cfg.vehicle : '') + ' will be your driver.', obj, {buttonUrl:url, buttonLabel:'Track my ride', securityHtml:security})
  });
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
  const pickupLatRaw = String(payload.pickupLat == null ? '' : payload.pickupLat).trim();
  const pickupLngRaw = String(payload.pickupLng == null ? '' : payload.pickupLng).trim();
  const pickupLatNumber = Number(pickupLatRaw);
  const pickupLngNumber = Number(pickupLngRaw);
  const hasPickupCoordinates = !!pickupLatRaw && !!pickupLngRaw && Number.isFinite(pickupLatNumber) && pickupLatNumber >= -90 && pickupLatNumber <= 90 && Number.isFinite(pickupLngNumber) && pickupLngNumber >= -180 && pickupLngNumber <= 180;
  if (!name || !phone || !email || !pickup || !destination) throw new Error('Name, phone, email, pickup, and destination are required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That email address does not look right.');
  if (submittedDate !== today) throw new Error('QR rides are available for today only.');
  const now = new Date();
  let pickupAt;
  if (timing === 'NOW') pickupAt = now;
  else {
    const time = String(payload.time || '').trim();
    if (!time) throw new Error('Choose a time later today.');
    pickupAt = parseRideStart_(today, time);
    if (pickupAt.getTime() < now.getTime() + 35 * 60000) throw new Error('For a ride within 35 minutes, choose Now.');
  }
  const dedupKey = [PULSE_QR_LIVE.SOURCE,email,timing,timing === 'NOW' ? Utilities.formatDate(now, RIDE.TIMEZONE, 'yyyy-MM-dd-HH-mm') : pickupAt.toISOString(),hasPickupCoordinates ? pickupLatNumber.toFixed(6) + ',' + pickupLngNumber.toFixed(6) : pickup.toLowerCase(),destination.toLowerCase()].join('|');
  return {name:name,phone:phone,email:email,pickup:pickup,pickupLat:hasPickupCoordinates?pickupLatNumber:'',pickupLng:hasPickupCoordinates?pickupLngNumber:'',destination:destination,pickupAt:pickupAt,passengers:passengers,notes:qrLiveNotes_(timing,notes),timing:timing,dedupKey:dedupKey};
}

function qrLiveFareCustomer_(payload, customer) {
  if (customer.timing !== 'NOW') return customer;
  const signedPickup = new Date(String(payload.quotePickupAt || ''));
  if (isNaN(signedPickup.getTime())) return customer;
  return Object.assign({}, customer, { pickupAt: signedPickup });
}

function submitQrLiveRide(payload) {
  payload = payload || {};
  if (payload.testMode === true) return {ok:true,noWrite:true,requestId:'TEST-QR-LIVE',status:'REQUESTED',source:PULSE_QR_LIVE.SOURCE,timing:qrLiveTiming_(payload.timing||'NOW'),driverName:rideCfg_().driverName,quotedFare:Number.isFinite(Number(payload.quotedFare))?Number(payload.quotedFare):null};
  const cfg = rideCfg_();
  if (!secureEqual_(String(payload.requestToken || ''), cfg.requestToken)) throw new Error('This QR request link is not valid.');
  if (payload.consent !== true) throw new Error('Consent is required before sending a request.');
  const customer = normalizeQrLivePayload_(payload);
  const fareQuote = pulseValidateSubmittedFareQuote_(payload, qrLiveFareCustomer_(payload, customer));
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const duplicate = findDuplicateRide_(customer.dedupKey);
    if (duplicate) return {ok:true,duplicate:true,requestId:String(duplicate.obj['Request ID']||''),status:String(duplicate.obj.Status||''),source:PULSE_QR_LIVE.SOURCE,timing:customer.timing,driverName:cfg.driverName,quotedFare:Number(duplicate.obj['Quoted Fare']||fareQuote.fare)};
    const now = new Date(), requestId = 'FR-' + Utilities.getUuid().slice(0, 8).toUpperCase();
    const row = {'Request ID':requestId,'Received At':now,'Updated At':now,'Status':'REQUESTED','Source':PULSE_QR_LIVE.SOURCE,'Customer Name':customer.name,'Customer Phone':customer.phone,'Customer Email':customer.email,'Pickup Address':customer.pickup,'Destination':customer.destination,'Pickup At':customer.pickupAt,'Passengers':customer.passengers,'Notes':customer.notes,'Consent':true,'Confirmed At':'','Cancelled At':'','Completed At':'','Calendar Event ID':'','Driver Notes':'','Dedup Key':customer.dedupKey,'Quoted Fare':fareQuote.fare,'Quote ID':fareQuote.quoteId,'Quote Expires At':new Date(fareQuote.expiresAt),'Pricing Version':fareQuote.pricingVersion};
    rideSheet_().appendRow(RIDE.HEADERS.map(function(header){return row[header]===undefined?'':row[header];}));
    if (customer.timing === 'LATER') pulseR4NotifyDriverRequest_(row);
    pulseR4NotifyCustomerReceived_(row);
    return {ok:true,requestId:requestId,status:'REQUESTED',source:PULSE_QR_LIVE.SOURCE,timing:customer.timing,driverEmailSent:customer.timing==='LATER',driverName:cfg.driverName,quotedFare:fareQuote.fare,quoteId:fareQuote.quoteId,paymentPreference:pulseR4PaymentCodeFromNotes_(row['Notes'])};
  } finally { lock.releaseLock(); }
}

function appendQrLiveDriverNote_(found, note) {
  const old = String(found.obj['Driver Notes'] || '').trim();
  const next = old ? old + '\n' + note : note;
  updateRideCells_(found.rowIndex, {'Driver Notes': next, 'Updated At': new Date()});
}

function pulseR4ConfirmRide_(requestId) {
  const id = String(requestId || '').trim();
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const found = findRideRow_(id);
    if (!found) throw new Error('Ride request not found.');
    const current = String(found.obj.Status || 'REQUESTED').toUpperCase();
    if (current === 'CONFIRMED') {
      if (!found.obj['Access Email Sent At']) {
        const existingAccess = issueRideAccessUnlocked_(found);
        pulseR4NotifyCustomerConfirmed_(found.obj, existingAccess);
        const sentAt = new Date();
        updateRideCells_(found.rowIndex, {'Access Email Sent At':sentAt});
        found.obj['Access Email Sent At'] = sentAt;
      }
      const duplicateResult = rideTransitionResult_(found.obj);
      duplicateResult.duplicate = true;
      return duplicateResult;
    }
    if (current !== 'REQUESTED') throw new Error('Only a requested ride can be confirmed.');
    const now = new Date();
    const start = new Date(found.obj['Pickup At']);
    const end = new Date(start.getTime() + RIDE.DEFAULT_RIDE_MINUTES * 60000);
    const updates = {'Status':'CONFIRMED','Updated At':now,'Confirmed At':now,'Calendar Event ID':createCalendarEvent_(found.obj,start,end)};
    updateRideCells_(found.rowIndex, updates);
    Object.keys(updates).forEach(function(key){found.obj[key]=updates[key];});
    appendRideStatusEventUnlocked_(id,'Confirmed','REQUEST_APP',id+':confirmed');
    const access = issueRideAccessUnlocked_(found);
    pulseR4NotifyCustomerConfirmed_(found.obj, access);
    const sentAt = new Date();
    updateRideCells_(found.rowIndex, {'Access Email Sent At':sentAt});
    found.obj['Access Email Sent At'] = sentAt;
    const result = rideTransitionResult_(found.obj);
    result.rideId = access.rideId;
    result.accessEmailSent = true;
    result.duplicate = false;
    return result;
  } finally { lock.releaseLock(); }
}

function driverDecisionResponse_(params) {
  const cfg = rideCfg_();
  const supplied = String((params && params.request) || '');
  if (!secureEqual_(supplied, cfg.requestToken)) return jsonResponse_({ok:false,message:'Driver decision access is not valid.'});
  const id = String((params && params.id) || '').trim();
  const decision = String((params && params.decision) || '').trim().toUpperCase();
  if (!/^FR-[A-Z0-9]+$/i.test(id)) return jsonResponse_({ok:false,message:'Ride request ID is not valid.'});
  if (decision !== 'DECLINE' && decision !== 'CONFIRM') return jsonResponse_({ok:false,message:'Decision is not valid.'});
  try {
    const before = findRideRow_(id);
    if (!before) throw new Error('Ride request not found.');
    const target = decision === 'DECLINE' ? 'DECLINED' : 'CONFIRMED';
    const duplicate = String(before.obj.Status || '').toUpperCase() === target;
    const result = decision === 'DECLINE' ? declineRide(id) : pulseR4ConfirmRide_(id);
    const after = findRideRow_(id);
    if (after && !duplicate) appendQrLiveDriverNote_(after,(decision==='DECLINE'?'Declined in Pulse Driver':'Confirmed in Pulse Driver')+' at '+new Date().toISOString());
    return jsonResponse_({ok:true,requestId:String(result.requestId||id),status:String(result.status||target),duplicate:duplicate,payment:pulseR4PaymentTextFromNotes_(after&&after.obj&&after.obj['Notes'])});
  } catch (error) { return jsonResponse_({ok:false,message:String((error&&error.message)||error)}); }
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
  const headers = values[0].map(String), now = new Date();
  let checked = 0, expired = 0; const errors = [];
  for (let i = 1; i < values.length; i++) {
    const obj = {}; headers.forEach(function(header,col){obj[header]=values[i][col];});
    if (String(obj.Source||'').toUpperCase() !== PULSE_QR_LIVE.SOURCE || String(obj.Status||'').toUpperCase() !== 'REQUESTED') continue;
    checked++;
    const deadline = qrLiveExpiryDeadline_(obj);
    if (!deadline || now.getTime() < deadline.getTime()) continue;
    const requestId = String(obj['Request ID'] || '');
    try { declineRide(requestId); const found=findRideRow_(requestId); if(found)appendQrLiveDriverNote_(found,'AUTO_DECLINED at '+now.toISOString()); expired++; }
    catch(error){ errors.push({requestId:requestId,message:String((error&&error.message)||error)}); }
  }
  return {ok:errors.length===0,checked:checked,expired:expired,errors:errors,writesPerformed:expired>0};
}

function installQrLiveExpiryTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger){if(trigger.getHandlerFunction()===PULSE_QR_LIVE.EXPIRY_HANDLER)ScriptApp.deleteTrigger(trigger);});
  ScriptApp.newTrigger(PULSE_QR_LIVE.EXPIRY_HANDLER).timeBased().everyMinutes(5).create();
  return {ok:true,handler:PULSE_QR_LIVE.EXPIRY_HANDLER,everyMinutes:5,laterCutoffMinutes:PULSE_QR_LIVE.LATER_CUTOFF_MINUTES,nowResponseMinutes:qrLiveNowResponseMinutes_(),productionDeploymentPerformed:false};
}

function testPulse084tQrLiveNoWrite() {
  const today=qrLiveToday_(),later=new Date(Date.now()+2*60*60000);
  const normalized=normalizeQrLivePayload_({name:'Test Rider',phone:'802-555-0100',email:'test@example.com',pickup:'44.475000, -73.212000',destination:'BTV Airport',date:today,time:Utilities.formatDate(later,RIDE.TIMEZONE,'HH:mm'),timing:'LATER',passengers:1,notes:'[PAY:AFTER]',consent:true});
  const noWrite=submitQrLiveRide({testMode:true,timing:'NOW',quotedFare:30});
  if(!noWrite||noWrite.noWrite!==true)throw new Error('QR test mode must never write.');
  return {ok:true,source:PULSE_QR_LIVE.SOURCE,todayOnly:today,timing:normalized.timing,fareValidatorRequired:typeof pulseValidateSubmittedFareQuote_==='function',requestAppSoleWriter:true,writesPerformed:false,deploymentPerformed:false};
}

function testPulse086r4RequestBridgeNoWrite() {
  const paymentChecks = [
    pulseR4PaymentTextFromNotes_('[QR_LIVE:NOW] [PAY:NOW]') === 'Pay now',
    pulseR4PaymentTextFromNotes_('[QR_LIVE:LATER] [PAY:AFTER]') === 'Pay after ride',
    pulseR4CleanNotes_('[QR_LIVE:NOW] [PAY:AFTER] hello rider') === 'hello rider'
  ];
  return {
    ok: paymentChecks.every(Boolean) && typeof driverDecisionResponse_ === 'function',
    build:'PULSE-086R4-2026-08-14.1',
    serviceUrl:pulseR4ServiceUrl_(),
    configuredWebAppUrl:String(rideCfg_().webAppUrl || ''),
    paymentChecks:paymentChecks,
    directDriverDecision:true,
    statusLinksUseCurrentServiceUrl:true,
    writesPerformed:false,
    deploymentPerformed:false
  };
}
