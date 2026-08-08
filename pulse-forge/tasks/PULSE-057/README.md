# PULSE-057 — QR fare estimate integration

This task does **not** create a new QR form or a new fare calculator.

The working live QR lane is owner-verified as same-day only with NOW/LATER choices. Future-date scheduling remains on the separate rider form. PULSE-057 preserves that split.

The repository already contains the PULSE-059 no-write fare engine and the request-form fare UI. PULSE-057 packages and validates those existing components as the fare source for the QR lane rather than duplicating them.

## Reused work

- PULSE-059: `pulseGetFareQuote` no-write fare engine.
- PULSE-061: rider request/quote UI and double-submit protections.
- PULSE-050: Hoy Driver Inbox.
- PULSE-079: held requests during an active ride.
- PULSE-080Q: restored QR entry point.

## Locked behavior

- QR scan continues to use the existing same-day booking lane.
- The separate future scheduling form remains separate.
- Pickup, destination, and same-day pickup time produce a Pulse fare before request confirmation.
- A fare calculation performs no Ride Requests, Mail, Calendar, or Trip Log write.
- Route/time changes invalidate the quote.
- The standalone request app remains the only Ride Requests writer.
- Competitor pricing is not part of this task.
- Merge remains manual and no production deployment is performed by this repository change.
