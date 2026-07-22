# Pulse Vermont Private Ride Request App

This is a separate Apps Script web app from Pulse Runtime Lite. The separation is intentional: the request app needs email and calendar permissions, while the driver dashboard keeps its narrower runtime permissions.

## Files

- `Code.gs` — request intake, signed driver actions, email, calendar, lifecycle, and Sheet menu
- `RequestForm.html` — private customer-facing request page
- `appsscript.json` — project manifest and required scopes
- `testRideRequestAppPackage()` — deterministic no-write, action-signature, and lifecycle self-test

## DEV configuration

Create a new standalone Apps Script project and add the three files. In **Project Settings → Script properties**, add:

| Property | Value |
|---|---|
| `SPREADSHEET_ID` | `1Hd46iUY84N2bvxdaIS4lf6l-uExxbXGIbUjxJzMF-No` |
| `DRIVER_NAME` | Your public driver name |
| `DRIVER_EMAIL` | Email that receives requests |
| `DRIVER_PHONE` | Optional confirmation contact |
| `VEHICLE` | Optional vehicle description |
| `CALENDAR_ID` | `primary` or a specific calendar ID |
| `WEB_APP_URL` | Add after the first deployment |

Do not manually create `CONFIRM_SECRET` or `REQUEST_TOKEN`; `setupRideSystem()` generates them.

## First deployment

1. Save all files.
2. Deploy as a web app, executing as you, with access set to anyone.
3. Copy the `/exec` URL into the `WEB_APP_URL` Script Property.
4. Run `setupRideSystem()` once and approve spreadsheet, email, and calendar permissions.
5. Run `setupRideSystem()` again. Its result includes the private request URL.
6. Share only the URL containing `?request=...`.

## Driver Inbox decision bridge

The Hoy Driver app may read REQUESTED rides directly from the shared Sheet, but it must not update those rows. To surface the existing signed decision flow inside the driver Inbox:

1. Keep the request app's existing `REQUEST_TOKEN`.
2. In the Hoy Driver Apps Script project, set `PULSE_REQUEST_APP_URL` to this request app's `/exec` URL.
3. Set `PULSE_REQUEST_TOKEN` to the same existing request-app `REQUEST_TOKEN`.
4. The Hoy server calls the request app's `driver-actions` endpoint and receives short-lived signed Accept and Decline URLs.
5. Accept and Decline still execute inside this request app. The Hoy app never writes Ride Requests directly.

No new decision secret is created for this bridge.

## Lifecycle

- `REQUESTED` → `CONFIRMED`, `DECLINED`, or `CANCELLED`
- `CONFIRMED` → `COMPLETED` or `CANCELLED`
- `DECLINED`, `CANCELLED`, and `COMPLETED` are terminal

Driver action links are signed over the action, request ID, and expiration. A confirmation link cannot be altered into a decline link.

## Test mode

Append `&mode=test` to the private request URL. The form displays `TEST MODE · NO WRITES` and returns a deterministic request result without sending email, creating a calendar event, or writing to the Sheet.

## Separation from Pulse telemetry

The app writes only to the `Ride Requests` tab in the DEV spreadsheet. It does not create shift, trip, ping, or earnings records. A later Runtime Lite dashboard patch may read the tab to show upcoming confirmed rides.


## Repository validation

Before deployment, run `testRideRequestAppPackage()` in the isolated request-app project. A passing result reports `writesPerformed: false`. The test uses a fixed in-memory secret and does not access Sheets, Mail, Calendar, Script Properties, or production.
