# PULSE-084T acceptance

- [x] Hoy Driver QR continues to emit `view=qr&source=qr_live`.
- [x] QR traffic maps to exact Apps Script file `QrLiveRequest.html`.
- [x] `view=form` and default/future traffic remain on `RequestForm.html`.
- [x] `RequestForm.html` is not replaced by this QR recovery.
- [x] `QrLiveRequest.html` is captured as canonical source instead of remaining live-only.
- [x] QR keeps NOW and LATER TODAY and rejects future dates.
- [x] QR keeps its existing `submitQrLiveRide` request path and shared Ride Requests writer.
- [x] Driver decision POST routing is restored alongside rider-status POST routes.
- [x] QR directly calls the existing PULSE-059 `pulseGetFareQuote`; no second calculator is created.
- [x] Changing QR route/timing invalidates the prior quote.
- [x] QR cannot submit without a current signed quote.
- [x] `submitQrLiveRide` verifies the signed quote and persists Quoted Fare / Quote ID / expiry / pricing version.
- [x] Request success copy says the request was sent to the Pulse driver and points the rider to email confirmation.
- [x] QR repair forbids replacing the whole `Code.gs`.
- [x] Production write/deployment remains manual.
