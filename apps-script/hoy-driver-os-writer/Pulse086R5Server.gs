/**
 * PULSE-086R5 — small Hoy Driver server bridge.
 * Adds a driver-side cancellation path without replacing Code.gs.
 */
function cancelPulseRide(requestId) {
  const id = String(requestId || '').trim();
  if (!/^FR-[A-Z0-9]+$/i.test(id)) throw new Error('Rider request ID is not valid.');

  const cfg = requestDecisionBridge_();
  if (!cfg || !cfg.url || !cfg.token) throw new Error('Request decision bridge is not configured.');
  const sep = cfg.url.indexOf('?') >= 0 ? '&' : '?';
  const response = UrlFetchApp.fetch(cfg.url + sep + 'action=driver-decision', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      action: 'driver-decision',
      request: cfg.token,
      id: id,
      decision: 'CANCEL'
    }),
    muteHttpExceptions: true,
    followRedirects: true
  });
  const http = response.getResponseCode();
  let payload = {};
  try { payload = JSON.parse(response.getContentText() || '{}'); } catch (error) {}
  if (http < 200 || http >= 300 || payload.ok !== true) {
    throw new Error(String(payload.message || ('Ride cancellation returned HTTP ' + http + '.')));
  }
  return {
    ok: true,
    requestId: id,
    status: String(payload.status || 'Cancelled'),
    duplicate: payload.duplicate === true
  };
}

function testPulse086r5ServerNoWrite() {
  const cfg = requestDecisionBridge_();
  return {
    ok: !!(cfg && cfg.url && cfg.token),
    cancellationBridgeConfigured: !!(cfg && cfg.url && cfg.token),
    routePreviewAvailable: typeof pulse085bRoutePreview === 'function',
    writesPerformed: false,
    deploymentPerformed: false
  };
}
