# PULSE-086R5 acceptance

R5 passes only if all of these are true:

- Hoy Driver opens with explicit Start shift / End shift.
- Route to pickup renders through `pulse085bRoutePreview` inside the existing Pulse map and never calls `navTo` or `window.open`.
- A confirmed active pickup exposes Route to pickup, Start ride, and Cancel ride at the same time.
- Start ride is driver-controlled and advances any missing rider status steps before `Ride in progress`; foreground GPS cannot block it forever.
- An in-progress ride exposes Route to destination and Complete ride.
- Complete ride clears Active and promotes the first queued NOW request.
- Cancel ride uses the request app `CANCEL` decision, which calls the real `cancelRide()` transition rather than appending only a status event.
- End shift is available once Active/Queue are cleared.
- LATER/future accepted rides remain Scheduled until deliberate Start pickup.
- QR request has no Pay Now choice. It states Tap to Pay in car and writes `[PAY:AFTER]` for compatibility.
- Request/confirmation email payment presentation is Tap to Pay in car; no unimplemented online-payment promise remains.
- Cancellation/no-show fee collection is not claimed without a real payment authorization/deposit rail.
- All staged deployment artifacts reconstruct to their locked SHA-256 hashes and parse successfully.
- Merge and Apps Script deployment remain manual.
