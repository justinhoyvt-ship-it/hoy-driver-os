# PULSE-060 Canonical Ride Lifecycle Adapter

This package introduces one service-neutral lifecycle contract around the existing Pulse ride systems. It does not replace any current reader, writer, status wording, queue control, scheduled-ride control, email, Calendar operation, Ride ID/PIN flow, or request intake path.

## Canonical states

`REQUESTED → CONFIRMED → LEAVING → EN_ROUTE → ARRIVING → ARRIVED → IN_PROGRESS → COMPLETED`

Separate terminal states:

- `DECLINED`
- `CANCELLED`

The adapter maps existing rider wording without changing it:

- `On the way` → `EN_ROUTE`
- `Arriving soon` → `ARRIVING`
- `Ride in progress` → `IN_PROGRESS`
- `Complete` → `COMPLETED`

## Existing authorities remain authoritative

| Existing authority | Adapter use |
|---|---|
| Ride Requests | Intake, confirmation, decline, and cancellation authority |
| Status Events | Rider-status audit authority |
| Trip Log | Completed-trip authority |
| Existing scheduled-ride controls | Scheduled start and navigation authority |
| Existing active and queued ride state | Collision and idempotent queue-promotion checks |

`normalizeRideSource(input)` reads Uber, direct, QR, scheduled, and future Pulse records into a shared internal shape. It does not rewrite the source record.

`transitionRideLifecycle(current, action, context)` validates one transition and returns exactly one deterministic event proposal. It does not call a writer.

`getCanonicalRideState(requestId)` reads registered existing authorities and derives the current state without creating data.

`writeLifecycleEvent(proposal)` delegates one validated proposal to one registered existing writer. The adapter contains no direct Sheet, Status Events, Trip Log, queue, email, Calendar, network, payment, merge, or deployment writer.

## Feature flag

The adapter is disabled unless this Script Property is explicitly set:

```text
PULSE_CANONICAL_LIFECYCLE_V1=true
```

The default is off. Merely adding these source files does not register a writer or activate the adapter.

## Registration boundary

The host project must register explicit functions for:

- `readRequest`
- `readStatusEvents`
- `readCompletedTrip`
- `readActiveRide`
- `readQueuedRide`
- `findLifecycleEvent`
- `writeLifecycleProposal`

The final callback must wrap one existing approved writer. It must not create a second request, status, queue, or trip writer.

## Rules enforced

- Pickup cannot be skipped: `ARRIVED → IN_PROGRESS`.
- Drop-off cannot be skipped: `IN_PROGRESS → COMPLETED`.
- A new request cannot overwrite another active ride.
- Queue promotion must target the queued Request ID and is idempotent through event identity.
- One action returns exactly one event proposal.
- Repeated event IDs do not create a second event.
- Terminal states do not transition again.
- No third-party SDK is included.

## Validation

Run both deterministic tests:

```text
pulseRunCanonicalLifecycleTests
pulseRunLifecyclePortTests
```

They use fixed memory-only fixtures and perform no external write.

The fixtures cover:

- every allowed sequential transition;
- `REQUESTED → IN_PROGRESS` rejection;
- `CONFIRMED → COMPLETED` rejection;
- duplicate completion rejection;
- active-ride collision rejection;
- valid queued-ride promotion;
- repeated event identity;
- current-state derivation from Request, Status Events, and Trip Log records.

## Rollback

1. Keep `PULSE_CANONICAL_LIFECYCLE_V1` absent or set it to `false`.
2. Remove the port registration call.
3. Remove these adapter files if desired.

Existing Ride Requests, Status Events, Trip Log, queue, scheduled-ride, QR, direct, email, Calendar, Ride ID/PIN, and rider-status behavior continues unchanged.
