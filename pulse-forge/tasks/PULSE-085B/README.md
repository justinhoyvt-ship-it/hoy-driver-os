# PULSE-085B — Driver lifecycle simplification + first console visual pass

This build keeps the working foreground GPS automation but removes its intermediate rider statuses from the driver's required tapping flow.

## Driver flow

- Accept request
- Start pickup
- Pulse automatically advances rider-facing Leaving / On the way / Arriving soon / Arrived from the existing foreground GPS logic
- Driver sees a simplified phase label: Heading to pickup / Near pickup / At pickup
- Start ride
- Complete ride

## In-console routing

`Pulse085BClient.html` overrides the old external `navTo()` behavior. Pickup and destination routing uses `pulse085bRoutePreview()` in `Pulse085B.gs`, which calls Apps Script Maps DirectionFinder and returns decoded route points to the existing Leaflet map.

No Sheet write occurs during routing.

## First visual pass

- fare is visually dominant on incoming request cards
- larger, cleaner Accept / Decline controls
- Scheduled cards emphasize time + route + fare + one action
- rider flow panel uses one dominant action rather than status choreography

The full console redesign remains PULSE-086 after this interaction model is proven live.
