# PULSE-061 Rider Quote and Request Experience

This package refines the existing private/QR rider phone experience. It does not create a second form, second request writer, second lifecycle, payment flow, or competitor-fare source.

## Locked rider sequence

1. From where
2. Where to
3. Pickup time
4. Pulse fare
5. Request
6. Confirm Ride

When `PULSE_RIDER_EXPERIENCE_V1` is absent or `false`, the existing presentation remains the default. The enhanced sequence activates only when the property is explicitly `true`. Test mode may preview it with `&mode=test&experience=1`; test submission remains no-write.

## Behavior

- Route inputs and fare come first in keyboard and screen-reader order when enabled.
- Fare calculation has explicit calculating, unavailable, retry, and ready states.
- A failed quote leaves every route input usable.
- Quote generation continues to call `pulseGetFareQuote()` and performs no request write.
- The Request step validates contact, route, time, and consent, then opens a review screen without writing.
- Confirm Ride is the only final action and calls the existing `submitRideRequest(data)` writer.
- A `submissionState` guard blocks double taps while submitting and after success.
- Failure returns the rider to a visible Retry Confirm Ride state.
- Success shows the existing request status and email-confirmation expectation.
- No Uber or Lyft price is displayed or invented.

## Accessibility

The enhanced experience includes labeled fields, `aria-describedby` help, assertive validation errors, a polite status region, visible focus, non-color-only state text, and DOM reordering that follows the locked sequence when the feature is enabled.

## Deterministic validation

Run:

```text
pulseRunRiderExperienceTests
```

The Builder also validates the complete HTML package for the locked sequence, no-write quote statement, feature flag default, single existing writer call, double-tap guard, retry state, accessible labels, and no competitor-fare claims.

## Rollback

Set `PULSE_RIDER_EXPERIENCE_V1=false` or remove the property. The existing quote/request presentation remains available, and the standalone `submitRideRequest()` writer and downstream email, Calendar, Inbox, Scheduled, Ride ID/PIN, status, and lifecycle behavior remain unchanged.
