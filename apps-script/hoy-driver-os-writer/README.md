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

The Scheduled action is **Begin pickup**.

One tap:

1. records `Leaving`;
2. records `On the way`;
3. opens phone navigation to the pickup address; and
4. creates the active pickup ride only when no other active or queued ride exists.

`Arriving soon` and `Arrived` remain the temporary manual fallback until the foreground distance/ETA monitor is installed in the next rider-alert task. Begin pickup is blocked while another ride is active or queued, so a waiting rider is never told the driver is on the way while the driver is still completing another ride. The request app remains the only writer to rider-status events.

## Guardrails

- Existing Inbox, Scheduled, request-app writer, Ride ID/PIN, rider-status sequence, map, queue, and completion behavior remain in place.
- No second request writer or trip lifecycle is created.
- No automatic merge or Apps Script deployment occurs.
- Repository validation checks the current dashboard ID, optional earnings, idempotent Trip Log writes, removal of Test T-001 controls, and preserved rider-writer boundary.
