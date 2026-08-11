# PULSE-085A request-app Code.gs patch

Target: Friend Request app-Main `Code.gs`.

Apply these replacements to the captured/verified live file. Do not replace unrelated functions.

## 1. One-click signed Track My Ride URL

Replace `rideStatusAccessUrl_` so the confirmation email carries a signed 90-day status token:

```js
function rideStatusAccessUrl_(rideId) {
  const cfg = rideCfg_();
  if (!cfg.webAppUrl) throw new Error('WEB_APP_URL is required in Script Properties.');
  const normalized = normalizeRideId_(rideId);
  const exp = Math.floor(Date.now() / 1000) + RIDE.STATUS_PAGE_TTL_DAYS * 86400;
  return cfg.webAppUrl + '?action=status&ride=' + encodeURIComponent(normalized) +
    '&exp=' + exp + '&t=' + actionToken_('status', normalized, exp);
}
```

## 2. Direct signed status render, PIN remains fallback

```js
function rideStatusAccessPage_(params) {
  params = params || {};
  const rideId = normalizeRideId_(String(params.ride || ''));
  const exp = String(params.exp || '');
  const token = String(params.t || '');
  if (rideId && exp && token && verifyActionToken_('status', rideId, exp, token)) {
    const found = findRideByRideId_(rideId);
    if (found) {
      const state = currentRiderStatus_(found.obj['Request ID'], found);
      if (state) return renderRiderStatusPage_(state.status, state.occurredAt, found.obj);
    }
  }
  return renderRideStatusAccessForm_(rideId, '');
}

function riderStatusAccessSubmitPage_(params) {
  const rideId = String((params && (params.rideId || params.ride)) || '');
  const pin = String((params && params.pin) || '');
  const found = authenticateRideAccess_(rideId, pin);
  if (!found) return renderRideStatusAccessForm_(rideId, riderAccessFailureMessage_());
  const state = currentRiderStatus_(found.obj['Request ID'], found);
  if (!state) return renderRideStatusAccessForm_(rideId, riderAccessFailureMessage_());
  return renderRiderStatusPage_(state.status, state.occurredAt, found.obj);
}
```

## 3. Rider status page contract

`renderRiderStatusPage_` now receives the Ride Requests row and must render:
- existing car hero image,
- Pulse Vermont / MY RIDE header,
- current status headline,
- When / From / To / Fare,
- progress rail,
- 20-second refresh,
- no raw backend/debug language.

Exact full patched Code.gs is generated from the captured live source during production sync; validator markers are in `validate-pulse-085a-runtime.mjs`.

## 4. Future-form request lock

`submitRideRequest` must hold ScriptLock only for duplicate detection + row append. Driver/customer email sends occur after `releaseLock()`. Use `tryLock(5000)` and rider-facing contention copy:

`Your request is being processed. Please try once more in a moment.`

## 5. Driver request alert

`notifyDriverOfRequest_` must include `rideFareText_(row)` in subject/body/HTML and show Accept / Decline actions. Every future-form request sends the driver alert.
