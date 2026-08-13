# PULSE-086R3 Hoy Driver OS Apps Script deployment manifest

Runtime Hoy Driver Apps Script project must contain these nine files:

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
- Pulse085BClient.html calls `beginForegroundPickup()`, provided by ForegroundPickupServer.gs, and `pulse085bRoutePreview()`, provided by Pulse085B.gs.
- Pulse086Client.html is the final authoritative driver interaction layer.

## PULSE-086R3 locked driver contract

- Pulse-only ride workflow. The legacy generic mirrored `Accept ride / Picked up / Drop off` bottom rail is retired.
- Opening the console does not create a shift. Offline state shows an explicit `Start shift` control.
- Legacy v1/v2 browser state is retired; current state is stored under `pulse-hoy-driver-state-v3` with stale-state guards.
- Inbox remains reviewable during an active ride.
- Accept/Decline uses the authenticated `decideRequestedRide()` server bridge.
- NOW accepted while idle -> active pickup.
- NOW accepted while another ride is active -> append to the multi-request Next Ride queue without interrupting the current ride.
- LATER accepted -> Scheduled.
- Scheduled ride while idle -> `Route to pickup`; while another ride is active -> `Queue next`.
- Scheduled rides do not jump directly into trip state. Pickup routing comes before `Start ride`.
- Active ride lifecycle: Route to pickup -> Start ride -> Route to destination -> Complete ride.
- Completing a ride logs it and promotes the first queued ride into pickup flow.
- End shift is a direct Shift Log write, does not open the legacy earnings/T-001 form, and is blocked until active/queued rides are cleared.
- Accepted future Scheduled rides are server-backed and are not erased by ending a driver session.
- Inbox refreshes during the shift for back-to-back request handling.
- The driver console uses distinct mobile-first hierarchy for session, Inbox, Active Ride, Next Ride, map, fare, and Scheduled.

## Rider payment preference companion artifact

The PULSE-086R3 build also prepares a full replacement QR request form that captures `Pay now` or `Pay after ride` as a preference only. No payment credentials are collected and no charge is represented as completed until the payment backend is connected. The preference is carried in existing Notes metadata as `[PAY:NOW]` or `[PAY:AFTER]`, which Pulse086Client.html can display.

The GitHub connector safety classifier blocked committing the full rider HTML because the existing form contains rider contact fields together with payment-language. Therefore the driver PR must not claim that the rider form source is committed. The validated rider form is a separate deployment artifact for the request Apps Script project.

## Validation

- Generated PULSE-086R3 driver JavaScript passed `node --check` before commit.
- Local regression contract passed for: old rail removal, direct decision bridge, multi-queue, NOW queueing during active ride, LATER scheduling, scheduled pickup routing, Start Ride after arrival, automatic queue promotion, explicit Start Shift, direct End Shift, v1/v2 retirement, and Inbox polling.
- Production still requires one live phone/computer lifecycle test after Apps Script deployment.

Do not deploy if any of the nine Hoy Driver runtime files are missing. README, validation files, and this manifest are not Apps Script runtime files.
