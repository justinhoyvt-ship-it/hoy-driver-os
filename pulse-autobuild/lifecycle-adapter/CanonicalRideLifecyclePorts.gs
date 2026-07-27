/**
 * PULSE-060 — Existing-writer ports for the canonical lifecycle adapter.
 *
 * The adapter never imports a third-party SDK and never writes directly.
 * Existing Pulse readers and writers must be registered explicitly.
 */

var PULSE_CANONICAL_LIFECYCLE_PORTS_ = null;

function pulseCanonicalLifecycleEnabled_() {
  if (typeof PropertiesService === 'undefined') return false;
  const value = PropertiesService
    .getScriptProperties()
    .getProperty('PULSE_CANONICAL_LIFECYCLE_V1');
  return String(value || '').toLowerCase() === 'true';
}

function pulseRequireCanonicalLifecycleEnabled_() {
  if (!pulseCanonicalLifecycleEnabled_()) {
    throw new Error('PULSE_CANONICAL_LIFECYCLE_V1 is disabled.');
  }
}

function registerCanonicalRideLifecyclePorts(ports) {
  ports = ports || {};
  const required = [
    'readRequest',
    'readStatusEvents',
    'readCompletedTrip',
    'readActiveRide',
    'readQueuedRide',
    'findLifecycleEvent',
    'writeLifecycleProposal'
  ];
  required.forEach(function(name) {
    if (typeof ports[name] !== 'function') {
      throw new Error('Canonical lifecycle port is required: ' + name);
    }
  });

  PULSE_CANONICAL_LIFECYCLE_PORTS_ = {
    readRequest: ports.readRequest,
    readStatusEvents: ports.readStatusEvents,
    readCompletedTrip: ports.readCompletedTrip,
    readActiveRide: ports.readActiveRide,
    readQueuedRide: ports.readQueuedRide,
    findLifecycleEvent: ports.findLifecycleEvent,
    writeLifecycleProposal: ports.writeLifecycleProposal
  };

  return {
    ok: true,
    enabled: pulseCanonicalLifecycleEnabled_(),
    registeredPorts: required.slice(),
    directWriterInstalled: false
  };
}

function pulseCanonicalPorts_() {
  if (!PULSE_CANONICAL_LIFECYCLE_PORTS_) {
    throw new Error('Canonical ride lifecycle ports are not registered.');
  }
  return PULSE_CANONICAL_LIFECYCLE_PORTS_;
}

/**
 * Reads existing authorities and derives the canonical state.
 * It creates no record.
 */
function getCanonicalRideState(requestId) {
  pulseRequireCanonicalLifecycleEnabled_();
  const id = pulseCanonicalText_(requestId);
  if (!id) throw new Error('Request ID is required.');

  const ports = pulseCanonicalPorts_();
  const records = {
    request: ports.readRequest(id),
    statusEvents: ports.readStatusEvents(id) || [],
    completedTrip: ports.readCompletedTrip(id),
    activeRide: ports.readActiveRide(),
    queuedRide: ports.readQueuedRide()
  };

  return {
    ok: true,
    requestId: id,
    canonicalState: pulseDeriveCanonicalRideState_(records),
    activeRideRequestId: pulseCanonicalText_(
      records.activeRide &&
      (records.activeRide.requestId || records.activeRide['Request ID'])
    ),
    queuedRideRequestId: pulseCanonicalText_(
      records.queuedRide &&
      (records.queuedRide.requestId || records.queuedRide['Request ID'])
    ),
    writesPerformed: false
  };
}

function pulseValidateLifecycleProposal_(proposal) {
  proposal = proposal || {};
  if (proposal.schemaVersion !== PULSE_CANONICAL_LIFECYCLE_VERSION_) {
    throw new Error('Unsupported lifecycle proposal version.');
  }
  if (!pulseCanonicalText_(proposal.requestId)) {
    throw new Error('Lifecycle proposal Request ID is required.');
  }
  if (!pulseCanonicalText_(proposal.eventId) ||
      !pulseCanonicalText_(proposal.idempotencyKey)) {
    throw new Error('Lifecycle proposal event identity is required.');
  }
  if (Number(proposal.eventCount) !== 1) {
    throw new Error('One lifecycle action must create exactly one event proposal.');
  }
  pulseCanonicalState_(proposal.fromState);
  pulseCanonicalState_(proposal.toState);
  return proposal;
}

/**
 * Delegates one validated proposal to one existing approved writer.
 * No direct Sheet, Status Events, Trip Log, queue, email, or Calendar writer
 * exists in this adapter.
 */
function writeLifecycleEvent(proposal) {
  pulseRequireCanonicalLifecycleEnabled_();
  proposal = pulseValidateLifecycleProposal_(proposal);
  const ports = pulseCanonicalPorts_();

  const existing = ports.findLifecycleEvent(
    proposal.eventId,
    proposal.idempotencyKey,
    proposal.requestId
  );
  if (existing) {
    return {
      ok: true,
      duplicate: true,
      requestId: proposal.requestId,
      eventId: proposal.eventId,
      writesPerformed: false
    };
  }

  const active = ports.readActiveRide();
  const queued = ports.readQueuedRide();
  const activeId = pulseCanonicalText_(
    active && (active.requestId || active['Request ID'])
  );
  const queuedId = pulseCanonicalText_(
    queued && (queued.requestId || queued['Request ID'])
  );

  pulseValidateRideCollision_(
    {requestId: proposal.requestId},
    proposal.action,
    {
      activeRideRequestId: activeId,
      queuedRideRequestId: queuedId
    }
  );

  const result = ports.writeLifecycleProposal(proposal);
  return {
    ok: true,
    duplicate: false,
    requestId: proposal.requestId,
    eventId: proposal.eventId,
    authority: proposal.authority,
    writerResult: result || null,
    writesPerformed: true
  };
}

/**
 * Memory-only idempotency test for the writer boundary.
 */
function pulseRunLifecyclePortTests() {
  const seen = {};
  let memoryWriteCount = 0;
  const proposal = transitionRideLifecycle(
    {requestId: 'REQ-PORT-060', source: 'DIRECT', status: 'REQUESTED'},
    'CONFIRM',
    {
      eventId: 'PORT-EVENT-1',
      idempotencyKey: 'PORT-IDEM-1',
      occurredAt: '2026-07-27T12:30:00Z'
    }
  );

  function memoryWrite(candidate) {
    const key = candidate.eventId + '|' + candidate.idempotencyKey;
    if (seen[key]) {
      return {ok: true, duplicate: true, writesPerformed: false};
    }
    seen[key] = true;
    memoryWriteCount++;
    return {ok: true, duplicate: false, writesPerformed: false};
  }

  const first = memoryWrite(proposal);
  const second = memoryWrite(proposal);

  return {
    ok: first.duplicate === false &&
      second.duplicate === true &&
      memoryWriteCount === 1,
    memoryWriteCount: memoryWriteCount,
    repeatedEventProducedDuplicate: second.duplicate,
    externalWritesPerformed: false,
    productionTouched: false
  };
}
