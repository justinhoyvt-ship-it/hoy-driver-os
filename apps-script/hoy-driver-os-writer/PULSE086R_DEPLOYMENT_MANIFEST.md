# PULSE-086R2 Hoy Driver OS Apps Script deployment manifest

Runtime Apps Script project must contain exactly these files for the PULSE-085B / PULSE-086 activation path:

- appsscript.json
- Code.gs
- Index.html
- PulseUiControls.html
- ForegroundPickupServer.gs
- ForegroundPickup.html
- Pulse085B.gs
- Pulse085BClient.html
- Pulse086Client.html

Dependency notes:
- Apps Script requires unique base names, so the server file is `ForegroundPickupServer.gs` while the client file is `ForegroundPickup.html`.
- Index.html uses the PulseUiControls template include.
- Code.gs evaluates Index.html as a template and injects ForegroundPickup.html, Pulse085BClient.html, then Pulse086Client.html.
- Pulse085BClient.html calls beginForegroundPickup(), provided by ForegroundPickupServer.gs.
- Pulse085BClient.html calls pulse085bRoutePreview(), provided by Pulse085B.gs.
- Pulse086Client.html is the late-loaded visual/interaction layer and now also contains the PULSE-086R2 production repair.

PULSE-086R2 repair contract, based on the first production test after PULSE-086 activation:
- Discard the stale legacy `pulse-hoy-driver-state-v1` browser state that reopened the console as a 41-hour shift with a stacked ride.
- Persist only the stale-guarded `pulse-hoy-driver-state-v2` state going forward.
- Opening the console must be offline and show `Start shift` unless a valid v2 shift exists.
- Accepting an Uber-mirror ride must never implicitly start a shift; the driver starts the shift first.
- After Accept, Picked up is enabled. After Picked up, Drop off is enabled.
- End shift is a direct one-tap Shift Log write with earnings left pending; the legacy Save shift / T-001 modal is retired.
- An active or queued ride blocks End shift until the ride is completed or cancelled.
- Completed rides are queued to the idempotent Trip Log bridge when the older Index does not already provide that queue.

Validation performed before staging:
- JavaScript syntax parse passed for the combined Pulse086Client runtime.
- State-transition harness passed: stale shift clears -> Start shift -> Accept -> Picked up -> Drop off -> End shift.

Production rule: do not deploy if any of the nine runtime files are missing. Do not treat README.md, validation.json, or this manifest as Apps Script runtime files.

Source-control reconciliation note: PulseUiControls.html was recovered from the captured live PULSE-078 source because the canonical folder referenced it but did not contain it.
