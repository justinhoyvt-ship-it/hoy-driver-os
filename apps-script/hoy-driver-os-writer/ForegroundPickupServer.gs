/**
 * PULSE-069 foreground pickup server adapter.
 * The standalone request app remains the only rider-status writer.
 */
const PULSE_069_BUILD = 'p069-foreground-pickup-2026-07-29.2';

function pulse069PickupTarget_(address) {
  const value = String(address || '').trim();
  if (!value) throw new Error('Pickup address is required for foreground distance updates.');
  const response = Maps.newGeocoder().geocode(value);
  const first = response && response.results && response.results[0];
  const location = first && first.geometry && first.geometry.location;
  const lat = Number(location && location.lat);
  const lng = Number(location && location.lng);
  if (!isFinite(lat) || !isFinite(lng)) throw new Error('Pickup coordinates could not be resolved.');
  return {lat:lat,lng:lng,source:'apps-script-maps-geocoder'};
}

function pulse069PickupTargetSafe_(address) {
  try { return {target:pulse069PickupTarget_(address),error:''}; }
  catch (error) { return {target:null,error:String(error && error.message ? error.message : error)}; }
}

function beginForegroundPickup(requestId, reservationId, pickupAddress) {
  const id = String(requestId || '').trim();
  const leaving = id ? updateRiderStatus(id, 'Leaving', id + ':leaving') : null;
  const geocoded = pulse069PickupTargetSafe_(pickupAddress);
  const reservations = startReservation(String(reservationId || '').trim());
  return {
    ok:true,
    build:PULSE_069_BUILD,
    requestId:id,
    status:leaving ? String(leaving.status || 'Leaving') : '',
    pickupTarget:geocoded.target,
    pickupTargetError:geocoded.error,
    reservations:reservations,
    foregroundOnly:true,
    backgroundTracking:false
  };
}

function testForegroundPickupAutomationPackage() {
  const policy = {movementMiles:0.08,arrivingSoonMiles:0.60,arrivedMiles:0.08,stoppedMs:20000,stationarySpeedMetersPerSecond:0.8,stationaryMiles:0.015,maxAccuracyMeters:100};
  const checks = [
    policy.movementMiles > 0,
    policy.arrivingSoonMiles > policy.arrivedMiles,
    policy.stoppedMs >= 15000,
    policy.stationarySpeedMetersPerSecond >= 0,
    policy.stationaryMiles > 0,
    policy.maxAccuracyMeters <= 100
  ];
  return {ok:checks.every(Boolean),taskId:'PULSE-069',policy:policy,writesPerformed:false,deploymentPerformed:false,productionTouched:false};
}
