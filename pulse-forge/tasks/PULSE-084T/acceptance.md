# PULSE-084T acceptance

- [x] Hoy Driver QR continues to emit `view=qr&source=qr_live`.
- [x] QR traffic is mapped to `QRLiveRequest.html` in the surgical router patch.
- [x] Default/future traffic remains mapped to `RequestForm.html`.
- [x] Driver-actions, driver-status-state, rider status, confirm, decline, and cancel routes are preserved.
- [x] QR repair explicitly forbids replacing `RequestForm.html`.
- [x] QR repair explicitly forbids replacing the whole `Code.gs`.
- [x] `QRLiveRequest.html` remains protected and undeleted.
- [x] Production write/deployment remains manual.
