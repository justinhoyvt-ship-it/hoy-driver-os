# Pulse weekend build sequence

## PULSE-076 — Permanent Forge controller

Bootstrap the stable controller once, create its source-control PR, merge after CI, then create Engine A and Engine B automatically.

## PULSE-077 — Forge Engine and package generator

Add task-package assembly, Drive/Sheet artifact adapters, deterministic fixtures, maximum-three repair loop, test receipt storage, and reusable project templates.

## PULSE-078 — Import and reconcile Pulse projects

Read the complete live source for the request app, Hoy Driver, and rider-status components. Compare every file with GitHub, preserve live-only work, repair drift through PRs, and establish one canonical source.

## PULSE-079 — Mid-ride request hold

Create the first product PR: hold newly observed requests while a ride is active and surface them in Inbox after drop-off without interrupting navigation or creating another request writer.

## PULSE-080 — Phase 2A installation and controlled ride

Build complete release candidates, create rollback versions and isolated deployments, run the full phone flow, repair failures, and prepare the owner-controlled production release.

## Definition of fully working

- Request form calculates a truthful Pulse fare.
- One confirmation creates one request.
- Driver can accept or decline safely.
- Confirmed rides appear in Scheduled.
- Ride ID and PIN expose only the correct rider-safe record.
- Pickup statuses follow the approved foreground sequence.
- New requests received during a ride wait for safe review.
- Start Ride and Complete Ride remain intentional.
- One completed ride creates one Trip Log row.
- End Shift reconciles earnings.
- Rollback versions and source hashes are recorded.
- No automatic GitHub merge or production deployment occurs.
