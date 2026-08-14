# PULSE-086R5 — pickup flow recovery

This task repairs the live failures found during the 2026-08-14 R4 road test.

Locked behavior:
- pickup and destination routing stay inside the Pulse map; no external map app is opened
- a confirmed pickup always has explicit **Route to pickup**, **Start ride**, and **Cancel ride** controls
- Start ride is a driver action and cannot be blocked forever waiting for foreground GPS to reach `Arrived`
- Start ride advances any missing rider-status steps sequentially before entering `Ride in progress`
- an in-progress ride always has **Route to destination** and **Complete ride**
- Complete ride clears Active and promotes the next queued NOW request
- Cancel ride cancels the confirmed request server-side, clears Active, and allows End shift
- scheduled rides remain Scheduled until **Start pickup** is deliberately pressed
- accepted future rides do not auto-start or block End shift
- Pay Now is removed until a real payment rail exists; current production payment mode is **Tap to Pay in car**
- cancellation/no-show fee collection is deferred until a real payment authorization/deposit rail exists

Deployment artifacts are reconstructed from the staged text chunks and must match these SHA-256 values:
- `Pulse086Client.html`: `e07803fae1ec8522941e5b84566c6d52dc6de9973e6db41090f934a358ffd68e`
- `QrLiveRequest.html`: `62bb4ea32f9fe9ca9f841dab6f4906a9fae7f4d996c5562d89f92429d7941c67`
- `Pulse086R5Server.gs`: `09a815f1ab2df253086e3e248388f6b57455328efad9bb33e6823b24891aeb94`

No automatic deployment or merge is permitted. Production remains a manual Apps Script deployment after review.
