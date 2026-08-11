# PULSE-085B acceptance

- [x] Driver no longer has separate required Leaving / On the way / Arriving soon / Arrived buttons.
- [x] Existing foreground GPS still publishes those rider-facing statuses automatically.
- [x] Starting a Pulse pickup does not call `window.open()`.
- [x] Pickup route can render on the existing Leaflet map.
- [x] Destination route can render on the existing Leaflet map.
- [x] Route preview is read-only and performs no Sheet writes.
- [x] Incoming request fare remains visible and receives stronger hierarchy.
- [x] Scheduled card remains time + route + fare + one primary action.
- [x] Driver ride actions reduce to route to pickup, Start ride, route to destination, Complete ride.
- [x] Full visual redesign remains isolated to PULSE-086.
- [x] Production deploy remains manual.
