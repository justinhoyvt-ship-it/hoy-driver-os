# PULSE-086 — Console visual + interaction cleanup

This build is the next live-driver pass after PULSE-085B/085C.

It intentionally uses a late-loaded client layer (`Pulse086Client.html`) so the working request, fare, map, rider lifecycle, and Uber-mirroring code remain intact.

## Runtime goals

- hide expired/test/debug chrome from the normal driving surface
- strengthen incoming request / Scheduled / active ride hierarchy
- make fare, route, status, and next action visually dominant
- keep Pulse rider routing in the existing map
- disable repeat lifecycle taps while an action is processing
- shorten the active rider flow to one clear next action
- reduce full-page feeling by tightening spacing and cards

## Not activated here

- PayPal/Venmo capture (PULSE-089)
- cancellation fee enforcement
- wait-time billing
- competitor-price promises
- public rider shell migration (PULSE-087)
