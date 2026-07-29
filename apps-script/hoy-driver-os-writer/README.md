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

PULSE-069 removes the routine `Leaving`, `On the way`, `Arriving soon`, and `Arrived` buttons from the normal driving surface. `On the way` publishes only after at least `0.08 mi` of observed movement. `Arriving soon` publishes at or inside `0.60 mi`. `Arrived` publishes only at or inside `0.08 mi` after the vehicle remains stopped for `20 seconds`. Automatic transitions require GPS accuracy of `100 meters` or better.

The web console pauses its location watcher whenever the document is hidden. It resumes only after the driver returns to the foreground. It does not claim background or locked-screen tracking. If GPS, geocoding, or the rider-status bridge is unavailable, the console shows a readable failure and does not guess the next status. `Start ride` and `Complete ride` remain intentional controls. The request app remains the only writer to rider-status events.

## Guardrails

- Existing Inbox, Scheduled, request-app writer, Ride ID/PIN, rider-status sequence, map, queue, and completion behavior remain in place.
- No second request writer or trip lifecycle is created.
- No automatic merge or Apps Script deployment occurs.
- Repository validation checks the current dashboard ID, optional earnings, idempotent Trip Log writes, removal of Test T-001 controls, and preserved rider-writer boundary.

### Review repair v0.6.2.3
- Corrupt or non-object Trip Log ledgers self-heal to a valid empty JSON object; durable row notes remain the recovery source.
- A reserved Trip Log row receives an anchor value and is flushed before row fields are written, so note-only reservations cannot disappear from the scan boundary.
- Begin pickup starts one server-side pickup transaction before opening phone navigation. That transaction publishes Leaving then On the way through the existing request app and marks the scheduled ride started.


### PULSE-069 foreground automation review
- Foreground-only watcher; hidden-page tracking is explicitly paused.
- Stable rider-status idempotency keys remain owned by the existing bridge.
- Straight-line pickup distance is used only for reviewed status thresholds; phone navigation remains the route authority.
- No automatic merge or Apps Script deployment occurs.
