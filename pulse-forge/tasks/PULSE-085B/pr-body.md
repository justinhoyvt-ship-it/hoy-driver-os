## PULSE-085B — Driver lifecycle simplification + first console visual pass

Runtime package:
- add `Pulse085B.gs` read-only route preview service
- add `Pulse085BClient.html` lifecycle/navigation override
- keep automatic foreground GPS rider statuses
- remove external map-window requirement from Pulse ride flow
- render pickup/destination route on existing Leaflet map
- driver controls reduce to route pickup / Start ride / route destination / Complete
- strengthen request/Scheduled fare hierarchy
- production activation is a surgical one-line `doGet()` injection; no whole `Code.gs` replacement

No automatic production deployment or merge.
