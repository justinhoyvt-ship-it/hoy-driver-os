# Open-source layering note

PULSE-085B intentionally keeps the current Leaflet map and uses the existing Apps Script Maps service for route geometry so this build can ship without introducing another routing dependency.

Future layers already staged:

- MapLibre GL JS: PULSE-086 visual/map upgrade candidate.
- Photon: PULSE-085C address autocomplete candidate.
- OSRM: optional future independent route engine / route-preview source.

No new third-party runtime dependency is introduced by PULSE-085B.
