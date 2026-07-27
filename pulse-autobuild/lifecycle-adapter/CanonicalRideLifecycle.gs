/**
 * PULSE-060 — Canonical ride lifecycle adapter
 *
 * Service-neutral, deterministic lifecycle rules for existing Pulse ride sources.
 * This file performs no Sheet, Mail, Calendar, network, payment, merge, deployment,
 * or production-data operation.
 */

const PULSE_CANONICAL_LIFECYCLE_VERSION_ = 'pulse-canonical-lifecycle-v1';

const PULSE_CANONICAL_STATES_ = Object.freeze([
  'REQUESTED',
  'CONFIRMED',
  'LEAVING',
  'EN_ROUTE',
  'ARRIVING',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'DECLINED',
  'CANCELLED'
]);

const PULSE_CANONICAL_TERMINAL_STATES_ = Object.freeze([
  'COMPLETED',
  'DECLINED',
  'CANCELLED'
]);

const PULSE_CANONICAL_ACTION_ALIASES_ = Object.freeze({
  ACCEPT: 'CONFIRM',
  CONFIRM: 'CONFIRM',
  LEAVE: 'LEAVE',
  DEPART: 'LEAVE',
  PROMOTE_QUEUE: 'PROMOTE_QUEUE',
  START_ROUTE: 'EN_ROUTE',
  ON_THE_WAY: 'EN_ROUTE',
  EN_ROUTE: 'EN_ROUTE',
  APPROACH: 'ARRIVING',
  ARRIVING: 'ARRIVING',
  ARRIVE: 'ARRIVE',
  ARRIVED: 'ARRIVE',
  PICKUP: 'PICKUP',
  START_TRIP: 'PICKUP',
  IN_PROGRESS: 'PICKUP',
  DROPOFF: 'COMPLETE',
  DROP_OFF: 'COMPLETE',
  COMPLETE: 'COMPLETE',
  COMPLETED: 'COMPLETE',
  DECLINE: 'DECLINE',
  DECLINED: 'DECLINE',
  CANCEL: 'CANCEL',
  CANCELLED: 'CANCEL'
});

const PULSE_CANONICAL_TRANSITIONS_ = Object.freeze({
  REQUESTED: Object.freeze({CONFIRM: 'CONFIRMED', DECLINE: 'DECLINED', CANCEL: 'CANCELLED'}),
  CONFIRMED: Object.freeze({LEAVE: 'LEAVING', PROMOTE_QUEUE: 'LEAVING', CANCEL: 'CANCELLED'}),
  LEAVING: Object.freeze({EN_ROUTE: 'EN_ROUTE', CANCEL: 'CANCELLED'}),
  EN_ROUTE: Object.freeze({ARRIVING: 'ARRIVING', CANCEL: 'CANCELLED'}),
  ARRIVING: Object.freeze({ARRIVE: 'ARRIVED', CANCEL: 'CANCELLED'}),
  ARRIVED: Object.freeze({PICKUP: 'IN_PROGRESS', CANCEL: 'CANCELLED'}),
  IN_PROGRESS: Object.freeze({COMPLETE: 'COMPLETED', CANCEL: 'CANCELLED'}),
  COMPLETED: Object.freeze({}),
  DECLINED: Object.freeze({}),
  CANCELLED: Object.freeze({})
});

function pulseCanonicalText_(value) {
  return String(value == null ? '' : value).trim();
}

function pulseCanonicalUpper_(value) {
  return pulseCanonicalText_(value)
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function pulseCanonicalState_(value) {
  const raw = pulseCanonicalUpper_(
    value && typeof value === 'object'
      ? (value.canonicalState || value.state || value.status || value.Status)
      : value
  );
  const aliases = {
    ON_THE_WAY: 'EN_ROUTE',
    ARRIVING_SOON: 'ARRIVING',
    RIDE_IN_PROGRESS: 'IN_PROGRESS',
    COMPLETE: 'COMPLETED',
    CANCELED: 'CANCELLED'
  };
  const state = aliases[raw] || raw;
  if (PULSE_CANONICAL_STATES_.indexOf(state) < 0) {
    throw new Error('Unsupported canonical ride state: ' + raw);
  }
  return state;
}

function pulseCanonicalAction_(value) {
  const raw = pulseCanonicalUpper_(value);
  const action = PULSE_CANONICAL_ACTION_ALIASES_[raw] || '';
  if (!action) throw new Error('Unsupported ride lifecycle action: ' + raw);
  return action;
}

function pulseCanonicalSource_(value, input) {
  const raw = pulseCanonicalUpper_(value);
  if (raw === 'UBER') return 'UBER';
  if (raw === 'QR' || raw === 'QR_CODE') return 'QR';
  if (raw === 'SCHEDULED' || raw === 'RESERVATION') return 'SCHEDULED';
  if (raw === 'PULSE' || raw === 'PULSE_VERMONT') return 'PULSE';
  if (raw === 'DIRECT' || raw === 'ORGANIC' || raw === 'PRIVATE') return 'DIRECT';
  if (input && input.isScheduled === true) return 'SCHEDULED';
  if (input && (input.requestToken || input.qr === true)) return 'QR';
  return 'DIRECT';
}

/**
 * Maps an existing source record into a shared internal shape.
 * The source record is read, not rewritten.
 */
function normalizeRideSource(input) {
  input = input || {};
  const requestId = pulseCanonicalText_(
    input.requestId ||
    input.rideRequestId ||
    input['Request ID'] ||
    input.id
  );
  if (!requestId) throw new Error('Request ID is required.');

  const source = pulseCanonicalSource_(
    input.source || input.channel || input.originType || input.Source,
    input
  );
  const state = pulseCanonicalState_(
    input.canonicalState ||
    input.state ||
    input.status ||
    input.Status ||
    'REQUESTED'
  );

  return {
    schemaVersion: PULSE_CANONICAL_LIFECYCLE_VERSION_,
    requestId: requestId,
    source: source,
    canonicalState: state,
    rawStatus: pulseCanonicalText_(input.status || input.Status || state),
    sourceRecordId: pulseCanonicalText_(input.sourceRecordId || input.externalId || ''),
    pickup: pulseCanonicalText_(input.pickup || input.pickupAddress || input['Pickup Address'] || ''),
    destination: pulseCanonicalText_(input.destination || input.destinationAddress || input['Destination Address'] || ''),
    scheduledAt: pulseCanonicalText_(input.scheduledAt || input.pickupAt || input['Pickup At'] || ''),
    isScheduled: source === 'SCHEDULED' || input.isScheduled === true,
    queuePosition: Number(input.queuePosition || 0) || 0,
    sourceDataMutated: false
  };
}

function pulseLifecycleAuthority_(fromState, toState) {
  if (fromState === 'REQUESTED' &&
      (toState === 'CONFIRMED' || toState === 'DECLINED' || toState === 'CANCELLED')) {
    return 'RIDE_REQUESTS';
  }
  if (toState === 'COMPLETED') return 'TRIP_LOG';
  return 'STATUS_EVENTS';
}

function pulseRequireEventIdentity_(context) {
  context = context || {};
  const eventId = pulseCanonicalText_(context.eventId || context.idempotencyKey);
  const idempotencyKey = pulseCanonicalText_(context.idempotencyKey || context.eventId);
  if (!eventId || !idempotencyKey) {
    throw new Error('A stable event ID or idempotency key is required.');
  }
  return {eventId: eventId, idempotencyKey: idempotencyKey};
}

function pulseValidateRideCollision_(ride, action, context) {
  context = context || {};
  const activeRideRequestId = pulseCanonicalText_(context.activeRideRequestId);
  const queuedRideRequestId = pulseCanonicalText_(context.queuedRideRequestId);

  if (action === 'LEAVE' && activeRideRequestId && activeRideRequestId !== ride.requestId) {
    throw new Error('Another ride is active. The new ride cannot overwrite it.');
  }

  if (action === 'PROMOTE_QUEUE') {
    if (activeRideRequestId && activeRideRequestId !== ride.requestId) {
      throw new Error('A queued ride cannot promote while another ride is active.');
    }
    if (!queuedRideRequestId || queuedRideRequestId !== ride.requestId) {
      throw new Error('Queue promotion must target the queued Request ID.');
    }
  }
}

/**
 * Validates one transition and returns one deterministic event proposal.
 * It does not call a writer.
 */
function transitionRideLifecycle(current, action, context) {
  const ride = normalizeRideSource(
    typeof current === 'string'
      ? {requestId: pulseCanonicalText_(context && context.requestId), status: current, source: context && context.source}
      : current
  );
  const fromState = ride.canonicalState;
  const normalizedAction = pulseCanonicalAction_(action);
  const nextMap = PULSE_CANONICAL_TRANSITIONS_[fromState] || {};
  const toState = nextMap[normalizedAction];

  if (!toState) {
    throw new Error(
      'Invalid ride lifecycle transition: ' +
      fromState + ' + ' + normalizedAction
    );
  }

  pulseValidateRideCollision_(ride, normalizedAction, context);
  const identity = pulseRequireEventIdentity_(context);
  const occurredAt = pulseCanonicalText_(context && context.occurredAt) ||
    'CALLER_TIMESTAMP_REQUIRED';

  return {
    schemaVersion: PULSE_CANONICAL_LIFECYCLE_VERSION_,
    eventId: identity.eventId,
    idempotencyKey: identity.idempotencyKey,
    requestId: ride.requestId,
    source: ride.source,
    action: normalizedAction,
    fromState: fromState,
    toState: toState,
    authority: pulseLifecycleAuthority_(fromState, toState),
    occurredAt: occurredAt,
    queuePromotion: normalizedAction === 'PROMOTE_QUEUE',
    pickupRecorded: fromState === 'ARRIVED' && toState === 'IN_PROGRESS',
    dropoffRecorded: fromState === 'IN_PROGRESS' && toState === 'COMPLETED',
    eventCount: 1,
    sourceDataMutated: false,
    writesPerformed: false
  };
}

function pulseLatestCanonicalEventState_(events) {
  events = Array.isArray(events) ? events : [];
  if (!events.length) return '';
  const sorted = events.slice().sort(function(a, b) {
    const left = Date.parse(a.occurredAt || a['Occurred At'] || '') || 0;
    const right = Date.parse(b.occurredAt || b['Occurred At'] || '') || 0;
    return left - right;
  });
  const latest = sorted[sorted.length - 1];
  return pulseCanonicalState_(
    latest.toState ||
    latest.canonicalState ||
    latest.status ||
    latest.Status
  );
}

function pulseDeriveCanonicalRideState_(records) {
  records = records || {};
  if (records.completedTrip) return 'COMPLETED';

  const eventState = pulseLatestCanonicalEventState_(records.statusEvents);
  if (eventState) return eventState;

  if (records.request) {
    return pulseCanonicalState_(
      records.request.canonicalState ||
      records.request.status ||
      records.request.Status ||
      'REQUESTED'
    );
  }

  throw new Error('No ride records were found for the Request ID.');
}

function pulseExpectLifecycleError_(fn, marker) {
  try {
    fn();
  } catch (error) {
    return String(error && error.message || error).indexOf(marker) >= 0;
  }
  return false;
}

/**
 * Deterministic, memory-only validation.
 */
function pulseRunCanonicalLifecycleTests() {
  const requestId = 'REQ-060-FIXTURE';
  const sequence = [
    ['REQUESTED', 'CONFIRM', 'CONFIRMED'],
    ['CONFIRMED', 'LEAVE', 'LEAVING'],
    ['LEAVING', 'EN_ROUTE', 'EN_ROUTE'],
    ['EN_ROUTE', 'ARRIVING', 'ARRIVING'],
    ['ARRIVING', 'ARRIVE', 'ARRIVED'],
    ['ARRIVED', 'PICKUP', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'COMPLETE', 'COMPLETED']
  ];

  const allowedChecks = sequence.map(function(step, index) {
    const proposal = transitionRideLifecycle(
      {requestId: requestId, source: 'QR', status: step[0]},
      step[1],
      {
        eventId: 'EVT-' + index,
        idempotencyKey: 'IDEM-' + index,
        activeRideRequestId: step[1] === 'LEAVE' ? requestId : '',
        occurredAt: '2026-07-27T12:00:0' + index + 'Z'
      }
    );
    return proposal.toState === step[2] && proposal.eventCount === 1;
  });

  const invalidChecks = [
    pulseExpectLifecycleError_(function() {
      transitionRideLifecycle(
        {requestId: requestId, source: 'DIRECT', status: 'REQUESTED'},
        'PICKUP',
        {eventId: 'BAD-1', idempotencyKey: 'BAD-1'}
      );
    }, 'Invalid ride lifecycle transition'),
    pulseExpectLifecycleError_(function() {
      transitionRideLifecycle(
        {requestId: requestId, source: 'DIRECT', status: 'CONFIRMED'},
        'COMPLETE',
        {eventId: 'BAD-2', idempotencyKey: 'BAD-2'}
      );
    }, 'Invalid ride lifecycle transition'),
    pulseExpectLifecycleError_(function() {
      transitionRideLifecycle(
        {requestId: requestId, source: 'DIRECT', status: 'COMPLETED'},
        'COMPLETE',
        {eventId: 'BAD-3', idempotencyKey: 'BAD-3'}
      );
    }, 'Invalid ride lifecycle transition')
  ];

  const collisionChecks = [
    pulseExpectLifecycleError_(function() {
      transitionRideLifecycle(
        {requestId: requestId, source: 'SCHEDULED', status: 'CONFIRMED'},
        'LEAVE',
        {
          eventId: 'COLLISION-1',
          idempotencyKey: 'COLLISION-1',
          activeRideRequestId: 'REQ-OTHER'
        }
      );
    }, 'Another ride is active'),
    transitionRideLifecycle(
      {requestId: requestId, source: 'SCHEDULED', status: 'CONFIRMED'},
      'PROMOTE_QUEUE',
      {
        eventId: 'QUEUE-1',
        idempotencyKey: 'QUEUE-1',
        activeRideRequestId: '',
        queuedRideRequestId: requestId
      }
    ).queuePromotion === true
  ];

  const derivedChecks = [
    pulseDeriveCanonicalRideState_({
      request: {status: 'CONFIRMED'},
      statusEvents: [{status: 'Arrived', occurredAt: '2026-07-27T12:00:00Z'}],
      completedTrip: null
    }) === 'ARRIVED',
    pulseDeriveCanonicalRideState_({
      request: {status: 'CONFIRMED'},
      statusEvents: [],
      completedTrip: {requestId: requestId}
    }) === 'COMPLETED'
  ];

  return {
    ok: allowedChecks.concat(invalidChecks, collisionChecks, derivedChecks).every(Boolean),
    allowedTransitionChecks: allowedChecks,
    invalidTransitionChecks: invalidChecks,
    collisionChecks: collisionChecks,
    derivedStateChecks: derivedChecks,
    externalWritesPerformed: false,
    productionTouched: false
  };
}
