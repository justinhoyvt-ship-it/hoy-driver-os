# PULSE-085C production package

Target: **Friend Request app-Main** — Script ID `1IMkq0QRzfOdhtMkefk65eN9ceOdxtNG2YgzGBCd15IAUK0u8bnisi0b0`.

After merge, production activation is limited to:

1. Add `SmartRequest.gs`.
2. Replace `QrLiveRequest.html` with the merged PULSE-085C version.
3. Replace `RequestForm.html` with the merged PULSE-085C version.
4. Leave `Code.gs`, `QrLiveServer.gs`, current fare engine, `RiderExperience.gs`, and `appsscript.json` unchanged.
5. Save, update the existing production deployment to a new version, and retain the existing `/exec` URL.

Do not add a second fare engine. Do not replace the whole Apps Script project.

First production test:

`QR -> type From/To -> suggestions -> fare appears automatically -> send request`

Second production test:

`Request another ride -> future form -> type From/To/date/time -> fare appears automatically -> submit`
