import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

function patch(path, pattern, replacement, label) {
  const before = fs.readFileSync(path, 'utf8');
  if (!pattern.test(before)) throw new Error(`PULSE-058 marker missing: ${label} in ${path}`);
  pattern.lastIndex = 0;
  const after = before.replace(pattern, typeof replacement === 'function' ? replacement : () => replacement);
  if (after === before) throw new Error(`PULSE-058 patch made no change: ${label} in ${path}`);
  fs.writeFileSync(path, after);
}

const fare='pulse-autobuild/request-app/FareQuote.gs';
patch(fare,
  /(function pulseCalculateFare_\(route, pricing\) \{[\s\S]*?\n\})\n\n\/\*\*\n \* Returns a fare quote/,
  (m, fn) => `${fn}\n\nfunction pulseFareCanonicalText_(value) {\n  return String(value || '').trim().replace(/\\s+/g, ' ').toLowerCase();\n}\n\nfunction pulseFareQuoteToken_(quote) {\n  const secret = String(rideCfg_().confirmSecret || '');\n  if (!secret) throw new Error('CONFIRM_SECRET is required for fare quote handoff.');\n  const message = [\n    String(quote.quoteId || ''),\n    pulseFareCanonicalText_(quote.origin),\n    pulseFareCanonicalText_(quote.destination),\n    String(quote.pickupAt || ''),\n    Number(quote.fare).toFixed(2),\n    String(quote.pricingVersion || ''),\n    String(quote.expiresAt || '')\n  ].join('|');\n  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(message, secret)).replace(/=+$/, '');\n}\n\nfunction pulseValidateSubmittedFareQuote_(payload, customer) {\n  payload = payload || {};\n  customer = customer || {};\n  const quote = {\n    quoteId: String(payload.quoteId || ''),\n    origin: String(payload.quoteOrigin || ''),\n    destination: String(payload.quoteDestination || ''),\n    pickupAt: String(payload.quotePickupAt || ''),\n    fare: Number(payload.quotedFare),\n    pricingVersion: String(payload.quotePricingVersion || ''),\n    expiresAt: String(payload.quoteExpiresAt || '')\n  };\n  const supplied = String(payload.quoteToken || '');\n  if (!quote.quoteId || !supplied || !Number.isFinite(quote.fare) || quote.fare < 0) throw new Error('A current Pulse fare is required before sending the request.');\n  if (!quote.expiresAt || Date.parse(quote.expiresAt) <= Date.now()) throw new Error('Your Pulse fare expired. Recalculate the fare before confirming the ride.');\n  if (!secureEqual_(supplied, pulseFareQuoteToken_(quote))) throw new Error('The Pulse fare could not be verified. Recalculate and try again.');\n  if (pulseFareCanonicalText_(quote.origin) !== pulseFareCanonicalText_(customer.pickup) || pulseFareCanonicalText_(quote.destination) !== pulseFareCanonicalText_(customer.destination)) throw new Error('The route changed after the fare was calculated. Recalculate the Pulse fare.');\n  const quotePickup = Date.parse(quote.pickupAt);\n  const customerPickup = customer.pickupAt instanceof Date ? customer.pickupAt.getTime() : Date.parse(customer.pickupAt);\n  if (!Number.isFinite(quotePickup) || !Number.isFinite(customerPickup) || Math.abs(quotePickup - customerPickup) > 60000) throw new Error('The pickup time changed after the fare was calculated. Recalculate the Pulse fare.');\n  return quote;\n}\n\n/**\n * Returns a fare quote`,
  'fare token helpers');

patch(fare,
  /  return \{\n    ok: true,\n    quoteId: 'QUOTE-' \+ Utilities\.getUuid\(\)\.slice\(0, 12\)\.toUpperCase\(\),\n    currency: 'USD',\n    fare: Math\.round\(fare \* 100\) \/ 100,\n    distanceMiles: Math\.round\(route\.distanceMiles \* 10\) \/ 10,\n    durationMinutes: Math\.round\(route\.durationMinutes\),\n    pickupAt: valid\.pickupAt\.toISOString\(\),\n    pricingVersion: PULSE_FARE_VERSION_,\n    comparisonStatus: 'UNAVAILABLE',\n    createdAt: new Date\(now\)\.toISOString\(\),\n    expiresAt: new Date\(now \+ 15 \* 60 \* 1000\)\.toISOString\(\),\n    writesPerformed: false\n  \};/,
  `  const quote = {\n    ok: true,\n    quoteId: 'QUOTE-' + Utilities.getUuid().slice(0, 12).toUpperCase(),\n    currency: 'USD',\n    fare: Math.round(fare * 100) / 100,\n    distanceMiles: Math.round(route.distanceMiles * 10) / 10,\n    durationMinutes: Math.round(route.durationMinutes),\n    origin: valid.origin,\n    destination: valid.destination,\n    pickupAt: valid.pickupAt.toISOString(),\n    pricingVersion: PULSE_FARE_VERSION_,\n    comparisonStatus: 'UNAVAILABLE',\n    createdAt: new Date(now).toISOString(),\n    expiresAt: new Date(now + 15 * 60 * 1000).toISOString(),\n    writesPerformed: false\n  };\n  quote.quoteToken = pulseFareQuoteToken_(quote);\n  return quote;`,
  'signed fare response');

const form='pulse-autobuild/request-app/RequestForm.html';
patch(form,
  /      submittedQuote=Object\.assign\(\{\},activeQuote\);\n      submissionState='submitting';/,
  `      submittedQuote=Object.assign({},activeQuote);\n      var requestPayload=Object.assign({},data,{\n        quoteId:submittedQuote.quoteId||'',\n        quotedFare:submittedQuote.fare,\n        quoteOrigin:submittedQuote.origin||data.pickup,\n        quoteDestination:submittedQuote.destination||data.destination,\n        quotePickupAt:submittedQuote.pickupAt||'',\n        quoteExpiresAt:submittedQuote.expiresAt||'',\n        quotePricingVersion:submittedQuote.pricingVersion||'',\n        quoteToken:submittedQuote.quoteToken||''\n      });\n      submissionState='submitting';`,
  'request quote payload');
patch(form,/\.submitRideRequest\(data\);/,'.submitRideRequest(requestPayload);','submit signed quote payload');

const req='pulse-autobuild/request-app/Code.gs';
patch(req,
  /    'Ride ID','PIN Salt','PIN Verifier','Access Issued At','Access Email Sent At'\n/,
  `    'Ride ID','PIN Salt','PIN Verifier','Access Issued At','Access Email Sent At',\n    'Quoted Fare','Quote ID','Quote Expires At','Pricing Version'\n`,
  'quote headers');
patch(req,
  /  const customer = normalizeRidePayload_\(payload\);\n  const lock = LockService\.getScriptLock\(\);/,
  `  const customer = normalizeRidePayload_(payload);\n  const fareQuote = pulseValidateSubmittedFareQuote_(payload, customer);\n  const lock = LockService.getScriptLock();`,
  'server quote validation');
patch(req,
  /        status: duplicate\.obj\.Status,\n        driverName: cfg\.driverName\n/,
  `        status: duplicate.obj.Status,\n        driverName: cfg.driverName,\n        quotedFare: Number(duplicate.obj['Quoted Fare'] || fareQuote.fare)\n`,
  'duplicate fare response');
patch(req,
  /      'Driver Notes': '',\n      'Dedup Key': customer\.dedupKey\n    \};/,
  `      'Driver Notes': '',\n      'Dedup Key': customer.dedupKey,\n      'Quoted Fare': fareQuote.fare,\n      'Quote ID': fareQuote.quoteId,\n      'Quote Expires At': new Date(fareQuote.expiresAt),\n      'Pricing Version': fareQuote.pricingVersion\n    };`,
  'authoritative quote row');
patch(req,
  /    return \{ ok: true, requestId: requestId, status: 'REQUESTED', driverName: cfg\.driverName \};/,
  `    return { ok: true, requestId: requestId, status: 'REQUESTED', driverName: cfg.driverName, quotedFare: fareQuote.fare, quoteId: fareQuote.quoteId };`,
  'request result fare');

const driver='apps-script/hoy-driver-os-writer/Code.gs';
patch(driver,
  /      notes: r\.notes \|\| '',\n      status: 'REQUESTED'/,
  `      notes: r.notes || '',\n      quotedFare: r.quotedFare,\n      status: 'REQUESTED'`,
  'inbox fare mapping');
patch(driver,
  /    notes: at\('Notes'\) >= 0 \? String\(row\[at\('Notes'\)\] \|\| ''\)\.trim\(\) : ''\n/,
  `    notes: at('Notes') >= 0 ? String(row[at('Notes')] || '').trim() : '',\n    quotedFare: at('Quoted Fare') >= 0 ? numOrNull_(row[at('Quoted Fare')]) : null\n`,
  'sheet fare read');

const index='apps-script/hoy-driver-os-writer/Index.html';
patch(index,
  /    \.inbox-notes\{font-size:\.74rem;color:var\(--muted\);margin-top:7px\}\n/,
  `    .inbox-notes{font-size:.74rem;color:var(--muted);margin-top:7px}\n    .inbox-fare{font-family:var(--display);font-size:1.05rem;font-weight:700;color:var(--green);margin-top:8px}\n`,
  'inbox fare style');
patch(index,
  /        '<div class="inbox-route">'\+esc\(r\.pickup\|\|''\)\+\(r\.destination\?' → '\+esc\(r\.destination\):''\)\+'<\/div>'\+\n        \(r\.notes\?'<div class="inbox-notes">'\+esc\(r\.notes\)\+'<\/div>':''\);/,
  `        '<div class="inbox-route">'+esc(r.pickup||'')+(r.destination?' → '+esc(r.destination):'')+'</div>'+\n        (r.quotedFare!=null?'<div class="inbox-fare">Pulse fare $'+money(r.quotedFare)+'</div>':'')+\n        (r.notes?'<div class="inbox-notes">'+esc(r.notes)+'</div>':'');`,
  'inbox fare render');

fs.rmSync('pulse-forge/tasks/PULSE-058/apply-patch.mjs');
fs.rmSync('.github/workflows/pulse-058-apply.yml');
execFileSync('git',['config','user.name','Pulse Forge Builder']);
execFileSync('git',['config','user.email','pulse-forge@users.noreply.github.com']);
execFileSync('git',['add','-A']);
execFileSync('git',['commit','-m','PULSE-058: Carry signed fare quote into driver Inbox']);
execFileSync('git',['push','origin','HEAD:pulse/pulse-058-fare-to-inbox'],{stdio:'inherit'});
