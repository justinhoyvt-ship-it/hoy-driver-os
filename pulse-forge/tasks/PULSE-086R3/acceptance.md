# PULSE-086R3 driver acceptance

The driver console is passable only if all of these hold:

- Opening the console does not create a shift. A visible `Start shift` control is present while offline.
- Legacy `pulse-hoy-driver-state-v1` and `v2` browser state cannot reopen a stale shift or stale ride.
- The legacy generic `Accept ride / Picked up / Drop off` bottom rail is hidden.
- New Pulse requests remain reviewable while another ride is active.
- Request Accept/Decline uses the authenticated `decideRequestedRide` server bridge rather than opening a decision tab.
- A NOW request accepted while idle becomes the active pickup.
- A NOW request accepted while another ride is active is appended to a multi-ride queue without interrupting the current ride.
- A LATER request accepted from Inbox becomes a Scheduled ride.
- Scheduled ride action is `Route to pickup` while idle and `Queue next` while another ride is active.
- A scheduled ride never jumps directly to in-trip state. Pickup routing occurs before `Start ride`.
- Active Pulse lifecycle is Route to pickup -> Start ride -> Route to destination -> Complete ride.
- Completing a ride logs the trip and automatically promotes the first queued ride into pickup flow.
- End shift is direct, does not open the legacy shift form, and is blocked while an active/queued ride remains.
- Inbox refreshes while the shift is active so back-to-back requests can be accepted without leaving the current ride.
- Active, Next Ride, Scheduled, Inbox, fare, route, and session state have distinct mobile-first visual hierarchy.
