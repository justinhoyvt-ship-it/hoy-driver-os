# PULSE-084U — exact live-capture recovery

On 2026-08-10 at 16:40 EDT, the authenticated **Friend Request app-Main** Apps Script editor was captured as a Safari `.webarchive` and parsed. This replaces assumption-based recovery with an exact current-editor source snapshot.

## Captured project

- Script ID: `1IMkq0QRzfOdhtMkefk65eN9ceOdxtNG2YgzGBCd15IAUK0u8bnisi0b0`
- `appsscript.json` — SHA-256 `2801829018a46e58275687c3c6d58114ce8b2795f82f260a61563af666d60be0`
- `Code.gs` — SHA-256 `67dc3134de29af6f4bc8db7c0b448ccc7f1343605f2468b2a934deafbc7fc945`
- `QrLiveRequest.html` — SHA-256 `818491195e324b90f9e89f77d7b9283f3d8b88a28f85c89fce778a7642c7b960`
- `RequestForm.html` — SHA-256 `79e2d750ebd4c991f49a1f396bcea2330f2870be6a1f99dc20355649886f456d`
- `RiderExperience.gs` — SHA-256 `2f814820a169f124a3e3ccfd6877550652aaea09cadec8bd9d5a19fcea8a5fbf`

## What the capture proves

1. `Code.gs` already contains the PULSE-084 fare columns, signed-fare handoff for the future form, branded email/receipt work, and completion receipt safety.
2. Its current `doGet(e)` still falls through to `RequestForm` for all rider page requests.
3. It does **not** contain `requestPageFile_`, `submitQrLiveRide`, or `driverDecisionResponse_`.
4. The current `QrLiveRequest.html` is the older working NOW/LATER TODAY surface. It calls `submitQrLiveRide`, has no fare UI, and retains old success messaging.
5. The current `RequestForm.html` is the newer future-capable form with the fare UI. It should not be touched during QR recovery.
6. The file currently named `RiderExperience.gs` actually contains the PULSE-059 fare-quote engine (`pulseGetFareQuote`, `pulseValidateSubmittedFareQuote_`, etc.).
7. No separate `FareQuote.gs` or `QrLiveServer.gs` exists in the captured editor.

## Phase A — minimal recovery

Do only this:

- add `QrLiveServer.gs` from canonical main;
- replace `QrLiveRequest.html` with the fare-enabled canonical QR version;
- patch only `requestPageFile_`, `doGet(e)`, and `doPost(e)` in `Code.gs` using `production-router-patch.gs.txt`;
- leave `RequestForm.html`, `RiderExperience.gs`, and `appsscript.json` untouched;
- **do not add `FareQuote.gs` yet**, because the current live `RiderExperience.gs` already contains those fare functions and adding both would create duplicate definitions.

Then update the existing production deployment and prove only this lane first:

`scan QR -> QrLiveRequest -> NOW/LATER TODAY -> fare -> request`

## Phase B — cleanup after the QR lane passes

Only after the live QR+fare test passes:

- add canonical `FareQuote.gs`;
- replace the misnamed live `RiderExperience.gs` fare contents with canonical PULSE-061 rider-experience contents;
- rerun future-form and QR tests.

This split keeps the recovery minimal and makes canonical file cleanup a separate, reversible step.
