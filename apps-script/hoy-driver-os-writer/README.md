# Hoy Driver OS writer

Canonical source for the owner-only Hoy Driver console.

## PULSE-050 scope

This package preserves the working console layout and ride/shift behavior while adding:

- one upper-right waffle with exactly `Inbox`, `Live`, and `Settings`
- an Inbox that shows only `REQUESTED` rider rows
- secure Accept and Decline links issued by the existing request app
- the existing live-information page behind `Live`
- an intentionally blank Settings panel
- a restrained visual polish pass without section reordering

## Locked driver behavior

- `GO ONLINE` starts the shift.
- `Accept ride` remains the app-ride action.
- Confirmed private rides remain in Scheduled.
- Scheduled and queued sections render only when a ride exists.
- Going online does not leave a Stand by card on screen.
- Drop off does not force per-ride fare entry.
- Total earnings and tips remain reconcilable at end shift.
- Map, GPS trace, Picked up, Drop off, queue, shift timer, and Sheet writes remain unchanged.

## Request decision boundary

Hoy reads the shared `Ride Requests` sheet but never updates it.

Accept and Decline remain request-app operations:

1. The Hoy server reads REQUESTED rows.
2. It calls the request app's authenticated `driver-actions` endpoint.
3. The endpoint returns signed Accept and Decline URLs.
4. Opening a signed URL runs the existing request-app transition.
5. The request app remains the only writer, email sender, and Calendar owner.

Required Hoy Script Properties after review, before deployment:

- `PULSE_REQUEST_APP_URL` — request app `/exec` URL
- `PULSE_REQUEST_TOKEN` — the request app's existing `REQUEST_TOKEN`
- `PULSE_LIVE_URL` — optional override for the existing Live page

No new decision secret is introduced.

## Guardrails

- PR only. No automatic merge or deployment.
- No direct Hoy writes to `Ride Requests`.
- No automatic rider email or Calendar changes during package validation.
- Do not touch Gina's confirmed ride or press Start during validation.
- No additional waffle items, earnings settings, theme settings, GPS settings, or navigation settings.
