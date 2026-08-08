/**
 * PULSE-059 — QR instant fare quote
 *
 * Adds a no-write fare estimate to the existing private request app.
 * This file does not create or update Ride Requests, send email, create
 * Calendar events, merge code, or deploy the Apps Script project.
 */

const PULSE_FARE_VERSION_ = 'pulse-fare-v1';

function pulseFareNumber_(name) {
  const raw = PropertiesService.getScriptProperties().getProperty(name);
  const value = Number(raw);
  if (raw === null || raw === '' || !Number.isFinite(value) || value < 0) {
    throw new Error(name + ' is required in Script Properties.');
  }
  return value;
}

function pulseFarePricing_() {
  return {
    base: pulseFareNumber_('PULSE_FARE_BASE'),
    perMile: pulseFareNumber_('PULSE_FARE_PER_MILE'),
    perMinute: pulseFareNumber_('PULSE_FARE_PER_MINUTE'),
    minimum: pulseFareNumber_('PULSE_FARE_MINIMUM'),
    bookingBuffer: pulseFareNumber_('PULSE_FARE_BOOKING_BUFFER'),
    roundingIncrement: Math.max(
      0.01,
      pulseFareNumber_('PULSE_FARE_ROUNDING_INCREMENT')
    )
  };
}

function pulseFareTestPricing_() {
  return {
    base: 3,
    perMile: 2,
    perMinute: 0.5,
    minimum: 12,
    bookingBuffer: 1,
    roundingIncrement: 0.5
  };
}

function pulseValidateFareQuoteInput_(input) {
  input = input || {};
  const origin = String(input.pickup || input.origin || '').trim();
  const destination = String(input.destination || '').trim();
  const pickupAt = new Date(String(input.pickupAt || ''));

  if (!origin) throw new Error('Pickup location is required.');
  if (!destination) throw new Error('Destination is required.');
  if (isNaN(pickupAt.getTime())) {
    throw new Error('Pickup date and time are required.');
  }

  return {
    origin: origin,
    destination: destination,
    pickupAt: pickupAt
  };
}

function pulseRequireFareAccess_(input) {
  if (input && input.testMode === true) return;
  const cfg = rideCfg_();
  const supplied = String((input && input.requestToken) || '');
  if (!supplied || !secureEqual_(supplied, cfg.requestToken)) {
    throw new Error('This private ride-request link is not valid.');
  }
}

function pulseFareRoute_(origin, destination) {
  const result = Maps.newDirectionFinder()
    .setOrigin(origin)
    .setDestination(destination)
    .setMode(Maps.DirectionFinder.Mode.DRIVING)
    .getDirections();

  const route = result && result.routes && result.routes[0];
  const leg = route && route.legs && route.legs[0];
  if (!leg || !leg.distance || !leg.duration) {
    throw new Error('A driving route could not be calculated.');
  }

  return {
    distanceMiles: Number(leg.distance.value || 0) / 1609.344,
    durationMinutes: Number(leg.duration.value || 0) / 60
  };
}

function pulseRoundFare_(amount, increment) {
  return Math.round(Number(amount) / increment) * increment;
}

function pulseCalculateFare_(route, pricing) {
  const raw =
    pricing.base +
    route.distanceMiles * pricing.perMile +
    route.durationMinutes * pricing.perMinute +
    pricing.bookingBuffer;

  return Math.max(
    pricing.minimum,
    pulseRoundFare_(raw, pricing.roundingIncrement)
  );
}

function pulseFareCanonicalText_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function pulseFareQuoteToken_(quote) {
  const secret = String(rideCfg_().confirmSecret || '');
  if (!secret) throw new Error('CONFIRM_SECRET is required for fare quote handoff.');
  const message = [
    String(quote.quoteId || ''),
    pulseFareCanonicalText_(quote.origin),
    pulseFareCanonicalText_(quote.destination),
    String(quote.pickupAt || ''),
    Number(quote.fare).toFixed(2),
    String(quote.pricingVersion || ''),
    String(quote.expiresAt || '')
  ].join('|');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(message, secret)).replace(/=+$/, '');
}

function pulseValidateSubmittedFareQuote_(payload, customer) {
  payload = payload || {};
  customer = customer || {};
  const quote = {
    quoteId: String(payload.quoteId || ''),
    origin: String(payload.quoteOrigin || ''),
    destination: String(payload.quoteDestination || ''),
    pickupAt: String(payload.quotePickupAt || ''),
    fare: Number(payload.quotedFare),
    pricingVersion: String(payload.quotePricingVersion || ''),
    expiresAt: String(payload.quoteExpiresAt || '')
  };
  const supplied = String(payload.quoteToken || '');
  if (!quote.quoteId || !supplied || !Number.isFinite(quote.fare) || quote.fare < 0) throw new Error('A current Pulse fare is required before sending the request.');
  if (!quote.expiresAt || Date.parse(quote.expiresAt) <= Date.now()) throw new Error('Your Pulse fare expired. Recalculate the fare before confirming the ride.');
  if (!secureEqual_(supplied, pulseFareQuoteToken_(quote))) throw new Error('The Pulse fare could not be verified. Recalculate and try again.');
  if (pulseFareCanonicalText_(quote.origin) !== pulseFareCanonicalText_(customer.pickup) || pulseFareCanonicalText_(quote.destination) !== pulseFareCanonicalText_(customer.destination)) throw new Error('The route changed after the fare was calculated. Recalculate the Pulse fare.');
  const quotePickup = Date.parse(quote.pickupAt);
  const customerPickup = customer.pickupAt instanceof Date ? customer.pickupAt.getTime() : Date.parse(customer.pickupAt);
  if (!Number.isFinite(quotePickup) || !Number.isFinite(customerPickup) || Math.abs(quotePickup - customerPickup) > 60000) throw new Error('The pickup time changed after the fare was calculated. Recalculate the Pulse fare.');
  return quote;
}

/**
 * Returns a fare quote and performs no writes.
 */
function pulseGetFareQuote(input) {
  input = input || {};
  pulseRequireFareAccess_(input);
  const valid = pulseValidateFareQuoteInput_(input);
  const testMode = input.testMode === true;
  const pricing = testMode ? pulseFareTestPricing_() : pulseFarePricing_();
  const route = testMode
    ? { distanceMiles: 8.2, durationMinutes: 19 }
    : pulseFareRoute_(valid.origin, valid.destination);
  const fare = pulseCalculateFare_(route, pricing);
  const now = Date.now();

  const quote = {
    ok: true,
    quoteId: 'QUOTE-' + Utilities.getUuid().slice(0, 12).toUpperCase(),
    currency: 'USD',
    fare: Math.round(fare * 100) / 100,
    distanceMiles: Math.round(route.distanceMiles * 10) / 10,
    durationMinutes: Math.round(route.durationMinutes),
    origin: valid.origin,
    destination: valid.destination,
    pickupAt: valid.pickupAt.toISOString(),
    pricingVersion: PULSE_FARE_VERSION_,
    comparisonStatus: 'UNAVAILABLE',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
    writesPerformed: false
  };
  quote.quoteToken = pulseFareQuoteToken_(quote);
  return quote;
}

/**
 * Deterministic no-write test.
 */
function pulseRunFareQuoteTests() {
  const pricing = pulseFareTestPricing_();
  const shortFare = pulseCalculateFare_(
    { distanceMiles: 1, durationMinutes: 3 },
    pricing
  );
  const standardFare = pulseCalculateFare_(
    { distanceMiles: 8.2, durationMinutes: 19 },
    pricing
  );
  const checks = [
    shortFare === 12,
    standardFare === 30,
    pulseRoundFare_(29.9, 0.5) === 30
  ];

  return {
    ok: checks.every(Boolean),
    checks: checks,
    shortFare: shortFare,
    standardFare: standardFare,
    writesPerformed: false
  };
}
