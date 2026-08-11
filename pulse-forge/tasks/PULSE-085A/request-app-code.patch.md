# PULSE-085A request-app Code.gs patch

Target: Friend Request app-Main `Code.gs` captured live source.

1. `rideStatusAccessUrl_`: add signed 90-day status token (`action=status`, `ride`, `exp`, `t`).
2. `rideStatusAccessPage_`: valid signed link renders the ride directly; Ride ID + PIN form remains fallback.
3. `riderStatusAccessSubmitPage_`: authenticated PIN fallback renders the same branded page.
4. `renderRiderStatusPage_`: use car hero + Pulse Vermont visual language; show current state, When / From / To / Fare, progress rail, and 20-second refresh.
5. `submitRideRequest`: hold ScriptLock only for duplicate detection and row append. Send driver/customer mail after releasing the lock. Use rider-safe contention copy instead of raw Apps Script lock text.
6. `notifyDriverOfRequest_`: subject/body/HTML prominently show the quoted fare plus Accept / Decline.

Production sync must patch only these functions against the captured live `Code.gs`; preserve QR router, fare engine, request/rebook form and lifecycle functions.