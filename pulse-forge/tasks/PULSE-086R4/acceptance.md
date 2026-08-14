# PULSE-086R4 acceptance

The repair passes only if all of these hold:

- A client startup error cannot hide the legacy working controls. `pulse-r4-mounted` is applied only after the replacement shell is inserted.
- Opening the console offline shows Start shift. Starting the shift changes that control to End shift.
- End shift never opens the old Save Shift / T-001 form and does not delete accepted future Scheduled rides.
- Inbox Accept/Decline calls `decideRequestedRide()` directly and never opens the signed driver confirmation page.
- NOW accepted while idle becomes Active Pickup; NOW accepted while active becomes Next Ride without interrupting the current ride.
- Active pickup progresses to Start ride only when the rider status reaches Arrived; Ride in progress exposes Route to destination and Complete ride.
- Complete ride clears the active ride and promotes the first queued ride.
- LATER/future accepted rides remain server-backed in Scheduled and do not start pickup automatically.
- Scheduled cards expose Start pickup while idle or Queue next while another ride is active; the legacy Start / Pickup / Drop triple is absent.
- Inbox, Active and Scheduled show fare and Pay now / Pay after ride without exposing `[QR_LIVE:*]` or `[PAY:*]` markers to the driver UI.
- Rider request and confirmation email HTML contains a Payment row.
- Driver LATER email has no CONFIRM/DECLINE links and directs review to Pulse driver Inbox.
- New Track my ride links use `ScriptApp.getService().getUrl()`; after deployment `pulseR4SyncWebAppUrl()` is run once to align the status form POST target.
- `testPulse086r4RequestBridgeNoWrite()` returns `ok:true` before live request testing.
- A fresh post-deploy request is used for Track-link testing; previously sent emails are not used as proof because they may contain an older deployment URL.
