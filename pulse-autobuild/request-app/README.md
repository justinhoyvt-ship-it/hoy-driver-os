# Pulse Vermont Private Ride Request App

This standalone Apps Script project remains the only writer for ride requests, rider status events, rider email, and ride Calendar events.

## PULSE-041 rider status progression

The rider-facing sequence is exactly:

`Confirmed → Leaving → On the way → Arriving soon → Arrived → Ride in progress → Complete`

Cancellation is separate.

The app creates or verifies an append-only `Ride Status Events` tab with these columns:

- Event ID
- Request ID
- Status
- Occurred At
- Source
- Idempotency Key

The existing `REQUEST_TOKEN` authenticates server-to-server calls from Hoy Driver. No second secret is introduced.

## Endpoints

- `GET action=driver-actions` returns signed Accept and Decline links for REQUESTED rides.
- `POST action=driver-status` appends one authenticated status event.
- `GET action=driver-status-state` returns only rider-safe current statuses for requested IDs.
- `GET action=status` renders a signed rider-safe status page. PULSE-042 will add Ride ID and PIN access and control delivery of the private link.

Repeated status taps are idempotent. The same Request ID and status cannot be appended twice, and the same idempotency key cannot be reused for another status. Statuses cannot skip the approved sequence.

## Rider-safe page

The status page displays only the approved progression and last update time. It does not display customer contact information, pickup or destination details, driver notes, shift data, earnings, API keys, other rides, or a live GPS claim.

## Existing lifecycle

- `REQUESTED` → `CONFIRMED`, `DECLINED`, or `CANCELLED`
- `CONFIRMED` → rider status progression or `CANCELLED`
- `Complete` updates the main request row to `COMPLETED`

Confirmation still creates the Calendar event and sends the existing confirmation email. PULSE-041 does not automatically send the status-page link; PULSE-042 owns Ride ID, PIN, and private-link delivery.

## Validation

Run `testRideStatusProgressionPackage()` before review. It performs no Sheet, Mail, Calendar, deployment, or production operation.
