# Hoy Driver OS writer

Canonical source for the owner-only Pulse Vermont driver console.

## PULSE-068 normal-flow cutover

PULSE-068 moves the working console out of the historical Test 001 workbook and into the current **Pulse Core OS — Driver Dashboard**.

Runtime writes now target:

- `Shift Log` when the driver ends a shift;
- `Trip Log` when a ride is completed;
- the existing standalone request app for rider-status events.

The historical workbook remains unchanged as an audit artifact and is no longer a runtime target.

## Shift behavior

Ending a shift always preserves time, mileage, ride count, request IDs, zone, and notes.

Earnings are optional. When platform totals have not settled, the console saves the shift with blank earnings rather than writing a false `$0`. Earnings can be reconciled later in the current dashboard.

The console no longer displays a Test T-001 strip, offers a Close Test checkbox, reads Test Runs during boot, or writes test actuals.

## Trip behavior

Each completed ride sends one idempotent `logCompletedTrip` payload to the current `Trip Log`.

The client keeps a pending-trip queue in local storage. A failed or interrupted write is retried when the console returns to the foreground. A Script Properties ledger provides the fast lookup, while a durable ride-ID note on the Trip Log row lets an interrupted or partial write resume on the same row without appending a duplicate.

Trip rows preserve pickup/drop-off timestamps, available route labels, duration, traced mileage, and fare/tip when known. Unknown earnings remain blank.

## Scheduled rider pickup

The Scheduled action remains **Begin pickup**.

One tap:

1. records `Leaving` through the existing standalone request app;
2. starts one active pickup only when no active or queued ride exists;
3. captures the best available foreground departure point;
4. opens phone navigation to the pickup address; and
5. resumes truthful foreground automation when the console is visible.

PULSE-069 removes the routine `Leaving`, `On the way`, `Arriving soon`, and `Arrived` buttons from the normal driving surface. `On the way` publishes only after at least `0.08 mi` of observed movement. `Arriving soon` publishes at or inside `0.60 mi`. `Arrived` publishes only at or inside `0.08 mi` after the vehicle remains stopped for `20 seconds`. The stopped test uses device speed at or below `0.8 m/s`; when device speed is unavailable, a foreground sample step at or below `0.015 mi` is the reviewed fallback. Automatic transitions require GPS accuracy of `100 meters` or better.

The web console pauses its location watcher whenever the document is hidden. It resumes only after the driver returns to the foreground. It does not claim background or locked-screen tracking. If GPS, geocoding, or the rider-status bridge is unavailable, the console shows a readable failure and does not guess the next status. `Start ride` and `Complete ride` remain intentional controls. The request app remains the only writer to rider-status events.

## Guardrails

- Existing Inbox, Scheduled, request-app writer, Ride ID/PIN, rider-status sequence, map, queue, and completion behavior remain in place.
- No second request writer or trip lifecycle is created.
- No automatic merge or Apps Script deployment occurs.
- Repository validation checks the current dashboard ID, optional earnings, idempotent Trip Log writes, removal of Test T-001 controls, and preserved rider-writer boundary.

### Review repair v0.6.2.3
- Corrupt or non-object Trip Log ledgers self-heal to a valid empty JSON object; durable row notes remain the recovery source.
- A reserved Trip Log row receives an anchor value and is flushed before row fields are written, so note-only reservations cannot disappear from the scan boundary.
- Begin pickup starts one server-side pickup transaction before opening phone navigation. That transaction publishes Leaving through the existing request app, marks the scheduled ride started, and leaves On the way to the reviewed foreground movement gate.


### PULSE-069 foreground automation review
- Foreground-only watcher; hidden-page tracking is explicitly paused.
- Stable rider-status idempotency keys remain owned by the existing bridge.
- Straight-line pickup distance is used only for reviewed status thresholds; phone navigation remains the route authority.
- Reviewed stopped policy: speed `≤ 0.8 m/s`; fallback sample movement `≤ 0.015 mi` only when device speed is unavailable.
- Automated publish failures display the attempted status and the underlying bridge/API message.
- No automatic merge or Apps Script deployment occurs.

### Review repair v0.6.2.4
- Foreground client injection fails closed unless `Index.html` contains exactly one closing body tag.
- Documentation, task snapshot, runtime policy, PR body, and CI use the same stopped-vehicle thresholds.
- Begin pickup publishes `Leaving`; `On the way` waits for observed foreground movement.

## PULSE-079 — mid-ride request hold

When the active ride is `ON_TRIP`, newly observed direct requests are held by Request ID instead of demanding a decision while the driver is transporting a rider.

- Held requests survive a page refresh in local state.
- Repeated refreshes do not duplicate the same request.
- Inbox decision buttons are locked while the rider is aboard.
- A supported foreground device may vibrate once when a new request is held.
- Drop-off releases held requests for safe Inbox review and refreshes the server list.
- The driver does not accept, decline, or change rider status as part of the hold.
- The standalone request app remains the only Ride Requests writer.
- No automatic merge or Apps Script deployment occurs.
