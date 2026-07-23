# Pulse Vermont Private Ride Request App

This standalone Apps Script project remains the only writer for ride requests, rider status events, rider email, and ride Calendar events.

## PULSE-042 private rider access

A confirmed ride receives one public-facing **Ride ID** and one six-digit **PIN**. The original `Request ID` remains the internal key and is never replaced.

The `Ride Requests` schema is extended in place with:

- Ride ID
- PIN Salt
- PIN Verifier
- Access Issued At
- Access Email Sent At

The PIN itself is never written to the Sheet or Script Properties. Only a salted, secret-peppered HMAC verifier is stored. The plaintext PIN exists only long enough to place it in the first confirmation email.

## Confirmation delivery

The first successful confirmation creates the Calendar event, records `Confirmed`, issues access credentials, and sends one confirmation email containing:

- trip details
- Ride ID
- PIN
- private status link

A repeated confirmation does not send another access email once `Access Email Sent At` is present.

## Private status access

- `GET action=status&ride=<Ride ID>` opens the private access form and may prefill only the Ride ID.
- `POST action=status-access` requires the correct Ride ID and PIN and renders only that ride's approved status progression.
- `POST action=rider-status` provides the same one-ride, credential-protected rider-safe status as JSON for later site wiring.

Unknown Ride IDs and wrong PINs return the same generic failure. No response confirms whether another ride exists. There is no public rider list, search, or lookup endpoint.

The rider-facing sequence remains exactly:

`Confirmed → Leaving → On the way → Arriving soon → Arrived → Ride in progress → Complete`

Cancellation remains separate. No customer contact information, pickup or destination details, driver notes, shift data, earnings, API keys, other rides, or live GPS claim is returned by the status endpoint.

## Existing confirmed rides

`migrateConfirmedRideAccess(requestId)` is the controlled migration path. It:

1. requires a specific existing internal Request ID;
2. requires that ride to be `CONFIRMED`;
3. preserves the Request ID;
4. issues or safely rotates a Ride ID/PIN verifier when needed; and
5. sends the private access email once.

The Sheet menu item **Issue private access for selected confirmed ride** calls this function for the selected row. Migration is never automatic.

## Existing writer boundary

Hoy Driver continues to read rider rows but never writes them. The request app remains the sole writer for request decisions, append-only rider status events, access credentials, email, and Calendar changes.

## Validation

Run `testRideIdPinAccessPackage()` before review. It performs no Sheet, Mail, Calendar, credential issuance, deployment, or production operation.
