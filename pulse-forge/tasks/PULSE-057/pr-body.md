## PULSE-057 — QR fare estimate integration

Reuses the already-merged PULSE-059 fare engine and current request-form quote UI for the existing same-day QR lane. This PR intentionally does not create another QR form, fare calculator, Inbox, queue, lifecycle, or request writer.

### Preserved
- Owner-verified QR behavior: same-day only, NOW/LATER
- Separate future-date rider scheduling form
- Existing PULSE-050 Inbox
- Existing PULSE-079 held-request behavior
- Existing PULSE-080Q QR entry point
- Standalone request app as sole Ride Requests writer

### Validation
- Fare calculation remains no-write
- Quote UI calls `pulseGetFareQuote`
- Quote freshness/invalidation is protected
- Competitor pricing remains out of scope
- Forge CI required

### Safety
- Manual merge only
- No Apps Script production deployment
- No production mutation
- No engine activation
