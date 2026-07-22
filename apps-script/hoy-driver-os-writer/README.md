# Hoy Driver OS writer — canonical main-app source

This directory captures the phone-verified Hoy Driver OS writer source used by the owner-only main deployment.

## Production identity

- Apps Script project: `Hoy Driver OS writer`
- Script ID: `1sN7MFrzEOD0GMIOc10XoA8j5IPzZwQynowIuZpXDCWuLbF2wqIDf8Zj0`
- Verified deployment: `https://script.google.com/macros/s/AKfycbxyLcruVHrkxLBGkLcP3kxoE2EhILlJS_0SK5ybj1l5BMGPDrKIPiK_jO4P4EudXXYuBQ/exec`
- Build marker: `hoy-rider-lane-2026-07-22.2`

## Data boundaries

- Hoy shift/test writes: `1Byk7-bwjhSeZQEqKemi0RxGagD_2RuYw94A8qu48tnY`
- Rider-request reads: `1Hd46iUY84N2bvxdaIS4lf6l-uExxbXGIbUjxJzMF-No`, tab `Ride Requests`
- Uber signals/engine remains separate: `13m_9QDnIgXSdMBdtSYMjmyIdo55wh8F5Fl3_1JaYl-w`
- Manual reservations remain in Script Properties key `PULSE_RESERVATIONS`.
- Started rider-request markers remain in Script Properties key `PULSE_STARTED_RIDER_REQUESTS`.

The Hoy Driver app reads confirmed rider requests but does not write the `Ride Requests` sheet, send rider email, or create/modify rider calendar events.

## Verified behavior

- The blue/pink Hoy Driver console remains the main app.
- Confirmed request `FR-0D6EBEB5` appeared once in Scheduled during validation.
- `debugRiderLane()` returned no rider-read error, no started marker, and `writesToRideRequests: false`.
- Start, Pickup navigation, and Drop navigation controls rendered on phone.
- Runtime Lite is a separate reference implementation and is not this app.

## Release guardrails

This source-lock commit does not merge, deploy, change Script Properties, modify the rider sheet, send email, alter Calendar, or start a scheduled ride. Future changes must preserve the current deployment as a rollback target.
