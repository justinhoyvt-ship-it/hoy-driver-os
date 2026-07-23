# Hoy Driver OS writer

Canonical source for the owner-only Hoy Driver console.

## PULSE-041 scope

PULSE-041 adds rider-safe status progression for confirmed private rides while preserving the PULSE-050 waffle, Inbox, Scheduled lane, map, shift, and app-ride controls.

The exact rider-facing sequence is:

`Confirmed → Leaving → On the way → Arriving soon → Arrived → Ride in progress → Complete`

Cancellation remains a separate path.

## Driver controls

For a confirmed rider ride only:

1. `Start` records `Leaving`.
2. `Navigate pickup` records `On the way` and opens navigation.
3. `Arriving soon` records that exact status.
4. `Arrived` records arrival.
5. `Start ride` records `Ride in progress` and starts the existing local route trace.
6. `Navigate destination` opens navigation without changing status.
7. `Complete ride` records `Complete` and runs the existing drop-off flow.

Generic `Accept ride`, `Picked up`, and `Drop off` behavior remains available for app rides.

## Status write boundary

Hoy never writes the shared rider sheets. It sends an authenticated server-to-server request to the existing request app using the existing `PULSE_REQUEST_APP_URL` and `PULSE_REQUEST_TOKEN` properties.

The request app is the sole writer to the append-only `Ride Status Events` tab. Each event has a Request ID, exact rider-safe status, timestamp, source, and idempotency key. Repeated taps return the existing event instead of appending a duplicate.

## Guardrails

- PR only; no automatic deployment.
- No status event is written during package validation.
- No rider email or Calendar event is sent during package validation.
- No live GPS claim is added to the rider status page.
- No shift, earnings, private notes, API keys, or other-ride data is exposed.
- Do not press Start on Gina's confirmed ride during validation.
