# PULSE-086 — Live test findings lock

Source: August 11, 2026 end-to-end rider/driver live test.

## Driver console
- Remove expired opportunity/event card from live driving view.
- Hide TEST T-001 / closed target/debug lane from normal view.
- Keep Uber trip mirroring as a clearly secondary mode; do not let idle Uber controls compete with Pulse rider rides.
- Incoming request card hierarchy: rider/time, route, quoted fare, Accept / Decline.
- Scheduled card hierarchy: pickup time / due state, route, fare, one dominant Start action. No yellow DUE label without a numeric/time context.
- Active rider ride hierarchy: current route/status, fare, map/route, one dominant next action.
- Remove manual rider-status choreography from primary controls. Driver actions are Start pickup -> Start ride -> Complete ride, with rider statuses generated automatically where possible.
- Navigation stays inside the Pulse map; no normal external-map window.
- Add immediate busy/disabled state and idempotent handling so Arrived/Start/Complete are one-tap operations rather than repeated taps.
- Refresh ride/request state without requiring full-page reload after every action. Preserve safe polling/reload fallback.
- End Shift ends the shift directly. Remove save-shift / close-test interaction from live flow; persistence/totals continue independently.

## Same-day rider QR
- Compact the form; reduce instructional/backend language.
- Keep `Use my location`, but make it visually secondary to address entry.
- Address entry should support address/place + city or ZIP, with Vermont as the default state context.
- Improve time picker contrast / affordance.
- Remove obvious labels such as `calculated automatically` and `Fare ready` when the fare is already visible.
- Normal flow remains auto-fare; Retry is failure-only.
- NOW requests should use a fast notification/accept/start path; email remains background receipt/safety record rather than the primary interaction.

## Rider communications / status
- Replace static Ride Confirmed transition pages with useful app/status transitions.
- Confirmation/status visual language uses the existing car hero treatment.
- Confirmation email adds `What's Next?` guidance, pickup punctuality/grace-period language, and plan-change guidance.
- Accepted-driver card: first name, circular photo, vehicle, plate, compact trust/profile information.
- Rider actions: Track my ride, Cancel ride, Reschedule where eligible.
- Track My Ride must not depend on a Google login and must never resolve to a blank page.
- Driver unavailable / rider cancel emails use the same branded visual language and include a clear next action / rebook path.

## Cancellation / wait/payment follow-on
- Stage cancellation state and fee policy separately from this console-only build: >=30 min no fee target; <30 min partial-fee path; <=5 min/full-charge path subject to legal/payment review.
- Wait-time fee target `.50/min` remains future configurable behavior, not activated here.
- Payment state and PayPal/Venmo checkout remain PULSE-089; do not couple payment activation to PULSE-086.

## Fare comparison
- Do not promise or enforce `always cheaper than Uber` using scraped/public estimates.
- Preserve deterministic Pulse fare as authority; competitor comparison may be informational only in a later verified source layer.

## Acceptance
- Console looks and behaves like a purpose-built driver app, not an admin/debug surface.
- Incoming, Scheduled, pickup, on-trip, and completion states are visually distinct.
- One clear next action per active ride state.
- No expired/test/debug chrome in normal live driving view.
- No required external map window for Pulse lifecycle.
- One tap per lifecycle transition; repeated taps do not create duplicate writes/events.
- End Shift has no extra close-test/save modal.
- No regression to working QR, fare, request writer, Inbox, Scheduled, rider emails, or Uber mirroring.
