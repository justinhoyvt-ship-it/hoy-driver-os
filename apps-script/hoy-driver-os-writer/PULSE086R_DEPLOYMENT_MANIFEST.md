# PULSE-086R3.1 Hoy Driver OS deployment manifest

## Production Apps Script project

The live Hoy Driver Apps Script project must continue to contain these nine runtime files:

- appsscript.json
- Code.gs
- Index.html
- PulseUiControls.html
- ForegroundPickupServer.gs
- ForegroundPickup.html
- Pulse085B.gs
- Pulse085BClient.html
- Pulse086Client.html

Apps Script requires unique base names, so the server file is `ForegroundPickupServer.gs` while the client file is `ForegroundPickup.html`.

## Important source-of-truth boundary

The **current production Apps Script Code.gs / Index.html pair is not replaced by this PR**. Production is using the reconciled template-based pair already deployed by the owner. The captured production Index is preserved at:

`pulse-forge/reconciliation/PULSE-078/20260804-183219/HOY_DRIVER/live/Index.html`

That captured production Index contains the `PulseUiControls` template include. The canonical writer `Index.html` on main does not contain that include, so it must not be treated as a byte-for-byte production mirror for this deployment.

For PULSE-086R3.1, the production update is intentionally limited to the late-loaded client files:

1. replace `PulseUiControls.html`
2. replace `Pulse086Client.html`
3. keep the already-working production `Code.gs`, `Index.html`, `ForegroundPickupServer.gs`, `ForegroundPickup.html`, `Pulse085B.gs`, and `Pulse085BClient.html` in place
4. update the existing web-app deployment to a new version without changing the `/exec` URL

A later reconciliation task can normalize the canonical base Code/Index pair after the live lifecycle is proven; it is not safe to swap that base during this repair.

## Locked driver contract

- Pulse-only ride workflow. The legacy generic mirrored `Accept ride / Picked up / Drop off` bottom rail is retired.
- Opening the console does not create a shift. Offline state shows an explicit `Start shift` control.
- Legacy v1/v2 browser state is retired; current state is stored under `pulse-hoy-driver-state-v3` with stale-state guards.
- Inbox remains reviewable during an active ride.
- Accept/Decline uses the authenticated `decideRequestedRide()` server bridge.
- NOW accepted while idle -> active pickup.
- NOW accepted while another ride is active -> append to the multi-request Next Ride queue without interrupting the current ride.
- Queued accepted rides remain server-backed as confirmed Scheduled rides until they are actually promoted into pickup, so loss of browser state does not make an accepted ride disappear.
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

A separate replacement `QrLiveRequest.html` has been built for the Friend Request app. It captures `Pay now` or `Pay after ride` as a preference only; it does not collect payment credentials or represent a completed charge. The preference is carried in existing Notes metadata as `[PAY:NOW]` or `[PAY:AFTER]`, which `Pulse086Client.html` can display.

The GitHub connector safety classifier blocked committing the full rider contact-form HTML together with payment-language, so the rider replacement is a separate deployment artifact rather than committed source in this PR.

## Validation

- The exact committed `Pulse086Client.html` blob matches the locally validated build and passed JavaScript syntax checking.
- The exact committed `PulseUiControls.html` blob matches the locally validated build and passed JavaScript syntax checking.
- Driver regression checks cover old-rail removal, direct decision bridge, multi-queue, server-backed queued rides, NOW queueing during active ride, LATER scheduling, scheduled pickup routing, Start Ride ordering, automatic queue promotion, explicit Start Shift, direct End Shift, v1/v2 retirement, foreground pickup resume, and Inbox polling.
- Pulse Forge CI must be green at the PR head before merge.
- Production still requires one live phone/computer lifecycle test after Apps Script deployment.
