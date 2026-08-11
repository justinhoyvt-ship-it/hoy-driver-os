# PULSE-085C acceptance

- [x] QR and future/rebook remain separate rider surfaces.
- [x] Both surfaces call `pulseSmartAddressSuggestions` while the rider types.
- [x] Suggestions are biased to Vermont/local context through Apps Script Maps bounds.
- [x] QR keeps `Use my location` and no longer depends on public Nominatim reverse geocoding.
- [x] Both surfaces debounce and call the existing `pulseGetFareQuote` automatically once route/time inputs are ready.
- [x] Changing pickup, destination, date, or time invalidates/recalculates the fare.
- [x] Manual fare button is failure retry, not a required normal step.
- [x] Rider sees fare, route miles, drive minutes, and a short explanation of included fare inputs.
- [x] Existing signed quote verification remains the authoritative write guard.
- [x] Smart-address service performs no Sheet/email/calendar/request writes.
- [x] No automatic production deployment or merge.
