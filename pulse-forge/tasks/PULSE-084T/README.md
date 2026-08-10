# PULSE-084T — recover the QR same-day lane + fare

The rider request app has **two deliberately separate HTML surfaces in the same Apps Script project**:

- Hoy Driver QR (`view=qr&source=qr_live`) → `QrLiveRequest.html` → **NOW / LATER TODAY, today only**.
- Future booking, Request Again, and the QR popup's share/open-form link → `RequestForm.html`.

Both surfaces write through the same Friend Request app-Main backend and the same `Ride Requests` lifecycle.

## What broke

PULSE-084S replaced the whole `Code.gs` and `RequestForm.html`. The replacement Code lost the known-good `requestPageFile_` router and the QR-specific server functions such as `submitQrLiveRide`, so the QR URL fell through to the future form.

PULSE-057 also exposed a packaging gap: it declared fare integration for the QR lane but validated the fare UI in `RequestForm.html`; it never put that UI into the actual `QrLiveRequest.html` surface.

## Repair

- Capture the actual `QrLiveRequest.html` as canonical repository source.
- Restore the known-good QR_LIVE server boundary in a dedicated `QrLiveServer.gs` file.
- Preserve NOW/LATER TODAY rules, expiry behavior, driver decisions, and the shared request writer.
- Add the existing PULSE-059 `pulseGetFareQuote` UI directly to `QrLiveRequest.html`.
- Require and validate the existing signed quote before `submitQrLiveRide` writes a request.
- Store the exact fare/quote metadata so PULSE-058/084 can carry the same dollar value into driver, email, Scheduled, and receipt surfaces.
- Keep `RequestForm.html` unchanged; it remains the future-capable booking form and already has its own fare step.

## Production recovery rule

Do not replace the whole `Code.gs` again. In Friend Request app-Main, add/replace `QrLiveServer.gs`, `QrLiveRequest.html`, and `FareQuote.gs`; add `requestPageFile_` and replace only `doGet(e)` and `doPost(e)` using `production-router-patch.gs.txt`; leave `RequestForm.html` and `RiderExperience.gs` untouched; then update the existing production deployment.
