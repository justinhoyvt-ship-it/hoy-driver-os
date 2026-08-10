# PULSE-084T — protected QR router repair

Field test on 2026-08-10 proved the working rider architecture has two separate HTML surfaces:

- Hoy Driver QR (`view=qr&source=qr_live`) → `QRLiveRequest.html` → same-day quick request.
- Default/future booking and Request Again → `RequestForm.html`.

The PULSE-084S sync instruction incorrectly replaced the whole `Code.gs` and `RequestForm.html`, which preserved the QR file but removed the router that selected it.

## Repair rule

For production recovery, do not replace either rider HTML file and do not replace the whole `Code.gs` again. Replace only the existing `doGet(e)` function with `pulse-autobuild/request-app/production-router-patch.gs.txt`.

The patch preserves driver action, rider status, confirm/decline/cancel routing; catches `view=qr` or `source=qr_live` before the default route; renders `QRLiveRequest.html` for QR traffic; and keeps `RequestForm.html` as the normal/future form.

After the QR page is restored and phone-tested, reconcile fare submission into the dedicated QR surface separately. Do not use `RequestForm.html` as a substitute for the QR lane.
