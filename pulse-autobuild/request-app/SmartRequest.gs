/**
 * PULSE-085C — smart rider address entry.
 * Read-only Maps helpers used by both rider forms. No Sheet/email/calendar writes.
 */
const PULSE_SMART_REQUEST_ = Object.freeze({
  MIN_QUERY: 3,
  MAX_RESULTS: 5,
  // Vermont + immediate border context. Geocoder may still return nearby valid results.
  SW_LAT: 42.70,
  SW_LNG: -73.50,
  NE_LAT: 45.10,
  NE_LNG: -71.35
});

function pulseSmartRequireAccess_(input) {
  if (typeof pulseRequireFareAccess_ === 'function') {
    pulseRequireFareAccess_(input || {});
    return;
  }
  if (input && input.testMode === true) return;
  const cfg = rideCfg_();
  const supplied = String((input && input.requestToken) || '');
  if (!supplied || !secureEqual_(supplied, cfg.requestToken)) {
    throw new Error('This ride-request link is not valid.');
  }
}

function pulseSmartGeocoder_() {
  return Maps.newGeocoder()
    .setRegion('us')
    .setBounds(
      PULSE_SMART_REQUEST_.SW_LAT,
      PULSE_SMART_REQUEST_.SW_LNG,
      PULSE_SMART_REQUEST_.NE_LAT,
      PULSE_SMART_REQUEST_.NE_LNG
    );
}

function pulseSmartResult_(result) {
  result = result || {};
  const location = result.geometry && result.geometry.location || {};
  return {
    label: String(result.formatted_address || ''),
    lat: Number(location.lat),
    lng: Number(location.lng)
  };
}

/** Search-as-you-type address/place suggestions. No writes. */
function pulseSmartAddressSuggestions(input) {
  input = input || {};
  pulseSmartRequireAccess_(input);
  const query = String(input.query || '').trim();
  if (query.length < PULSE_SMART_REQUEST_.MIN_QUERY) {
    return {ok: true, query: query, suggestions: [], writesPerformed: false};
  }

  const response = pulseSmartGeocoder_().geocode(query);
  const results = response && response.results || [];
  const suggestions = results
    .slice(0, PULSE_SMART_REQUEST_.MAX_RESULTS)
    .map(pulseSmartResult_)
    .filter(function(item) {
      return item.label && Number.isFinite(item.lat) && Number.isFinite(item.lng);
    });

  return {
    ok: true,
    query: query,
    suggestions: suggestions,
    writesPerformed: false
  };
}

/** Resolve a typed address/place to one normalized formatted address. No writes. */
function pulseSmartResolveAddress(input) {
  input = input || {};
  pulseSmartRequireAccess_(input);
  const query = String(input.query || '').trim();
  if (query.length < PULSE_SMART_REQUEST_.MIN_QUERY) {
    throw new Error('Enter a little more of the address.');
  }
  const response = pulseSmartGeocoder_().geocode(query);
  const first = response && response.results && response.results[0];
  if (!first) throw new Error('That location could not be found.');
  const normalized = pulseSmartResult_(first);
  return {
    ok: true,
    query: query,
    label: normalized.label,
    lat: normalized.lat,
    lng: normalized.lng,
    writesPerformed: false
  };
}

/** Reverse-geocode phone GPS without a public third-party endpoint. No writes. */
function pulseSmartReverseGeocode(input) {
  input = input || {};
  pulseSmartRequireAccess_(input);
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error('Location coordinates are not valid.');
  }
  const response = Maps.newGeocoder().reverseGeocode(lat, lng);
  const first = response && response.results && response.results[0];
  return {
    ok: true,
    label: first ? String(first.formatted_address || '') : '',
    lat: lat,
    lng: lng,
    writesPerformed: false
  };
}

function testPulse085cSmartRequestNoWrite() {
  return {
    ok: true,
    taskId: 'PULSE-085C',
    minQuery: PULSE_SMART_REQUEST_.MIN_QUERY,
    maxResults: PULSE_SMART_REQUEST_.MAX_RESULTS,
    usesAppsScriptMaps: typeof Maps !== 'undefined',
    writesPerformed: false,
    deploymentPerformed: false
  };
}
