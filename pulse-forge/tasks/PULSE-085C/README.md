# PULSE-085C — Smart address entry + automatic fare

## Runtime change

Both rider request surfaces keep their existing writers and signed fare verification, but the normal rider path no longer requires a **Get fare** tap.

- `QrLiveRequest.html` — same-day NOW / LATER TODAY QR lane.
- `RequestForm.html` — future/rebook form.
- `SmartRequest.gs` — read-only Apps Script Maps helpers shared by both forms.

### Rider flow

`type From -> suggestions -> type To -> suggestions -> route/time ready -> fare calculates automatically -> rider sees fare + miles + minutes + explanation -> request`

If routing/fare fails, a **Retry fare** control appears. It is fallback only.

### Location behavior

QR `Use my location` remains. Reverse geocoding now uses the same Apps Script Maps boundary rather than calling the public Nominatim endpoint from the phone.

### Safety

PULSE-085C does not change the request writer, fare formula, signed quote token, Ride Requests schema, driver decision flow, or lifecycle. `SmartRequest.gs` performs no writes.
