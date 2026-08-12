# PULSE-086R Hoy Driver OS Apps Script deployment manifest

Runtime Apps Script project must contain exactly these files for the PULSE-085B / PULSE-086 activation path:

- appsscript.json
- Code.gs
- Index.html
- PulseUiControls.html
- ForegroundPickup.gs
- ForegroundPickup.html
- Pulse085B.gs
- Pulse085BClient.html
- Pulse086Client.html

Dependency notes:
- Index.html uses the PulseUiControls template include.
- Code.gs evaluates Index.html as a template and injects ForegroundPickup.html, Pulse085BClient.html, then Pulse086Client.html.
- Pulse085BClient.html calls beginForegroundPickup(), provided by ForegroundPickup.gs.
- Pulse085BClient.html calls pulse085bRoutePreview(), provided by Pulse085B.gs.
- Pulse086Client.html is a late-loaded visual/interaction layer and must load after Pulse085BClient.html.

Production rule: do not deploy if any of the nine runtime files are missing. Do not treat README.md or validation.json as Apps Script runtime files.

Source-control reconciliation note: PulseUiControls.html exists in the PULSE-078 captured live source but was missing from the canonical apps-script/hoy-driver-os-writer folder when this manifest was created. That gap must be repaired before treating the canonical folder as a complete deployable mirror.
