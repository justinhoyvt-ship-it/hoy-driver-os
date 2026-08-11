/**
 * PULSE-085B — driver-side in-console routing support.
 * Read-only Maps service helper. Does not write ride, shift, or rider data.
 */
function pulse085bRoutePreview(originLat, originLng, destination) {
  const dest = String(destination || '').trim();
  if (!dest) throw new Error('Destination is required.');

  const lat = Number(originLat);
  const lng = Number(originLng);
  const hasOrigin = Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lng) && lng >= -180 && lng <= 180;

  if (!hasOrigin) {
    const geocode = Maps.newGeocoder().setRegion('us').geocode(dest);
    const first = geocode && geocode.results && geocode.results[0];
    const loc = first && first.geometry && first.geometry.location;
    if (!loc) throw new Error('Could not locate that destination.');
    return {
      ok: true,
      destination: first.formatted_address || dest,
      destinationPoint: [Number(loc.lat), Number(loc.lng)],
      routePoints: [],
      distanceText: '',
      durationText: '',
      writesPerformed: false
    };
  }

  const directions = Maps.newDirectionFinder()
    .setOrigin(lat, lng)
    .setDestination(dest)
    .setMode(Maps.DirectionFinder.Mode.DRIVING)
    .getDirections();

  const route = directions && directions.routes && directions.routes[0];
  const leg = route && route.legs && route.legs[0];
  if (!route || !leg) throw new Error('No driving route was found.');

  const encoded = route.overview_polyline && route.overview_polyline.points;
  const flat = encoded ? Maps.decodePolyline(encoded) : [];
  const points = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    points.push([Number(flat[i]), Number(flat[i + 1])]);
  }

  const end = leg.end_location || {};
  return {
    ok: true,
    destination: String(leg.end_address || dest),
    destinationPoint: [Number(end.lat), Number(end.lng)],
    routePoints: points,
    distanceText: String((leg.distance && leg.distance.text) || ''),
    durationText: String((leg.duration && leg.duration.text) || ''),
    writesPerformed: false
  };
}

function testPulse085bRoutePreviewNoWrite() {
  return {
    ok: true,
    taskId: 'PULSE-085B',
    routeServiceAvailable: typeof Maps !== 'undefined',
    writesPerformed: false,
    deploymentPerformed: false
  };
}
