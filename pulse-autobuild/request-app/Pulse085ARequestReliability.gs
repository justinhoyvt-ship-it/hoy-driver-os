/**
 * PULSE-085A — QR request reliability shim.
 *
 * Keeps the existing QrLiveServer.gs contract intact while adding:
 * - one retry for transient Apps Script lock contention,
 * - driver email for NOW QR requests (LATER already emails in QrLiveServer),
 * - no duplicate email on LATER or duplicate requests,
 * - no writes in test mode.
 */

function submitQrLiveRideReliable(payload) {
  payload = payload || {};
  let result = null;
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = submitQrLiveRide(payload);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      const message = String((error && error.message) || error || '');
      if (!/lock timeout|holding the lock|could not obtain lock/i.test(message) || attempt > 0) throw error;
      Utilities.sleep(350);
    }
  }

  if (lastError) throw lastError;
  if (!result || result.ok !== true || result.noWrite === true || result.duplicate === true) return result;

  const timing = String(result.timing || payload.timing || '').toUpperCase();
  if (timing === 'NOW' && result.requestId) {
    try {
      const found = findRideRow_(String(result.requestId));
      if (found && found.obj) notifyDriverOfRequest_(found.obj);
      result.driverEmailSent = true;
    } catch (error) {
      console.log('PULSE-085A driver alert warning: ' + String((error && error.message) || error));
      result.driverEmailSent = false;
    }
  }
  return result;
}

function testPulse085aQrReliabilityNoWrite() {
  const result = submitQrLiveRideReliable({testMode:true,timing:'NOW',quotedFare:27.5});
  if (!result || result.noWrite !== true) throw new Error('PULSE-085A test path must remain no-write.');
  return {ok:true,taskId:'PULSE-085A',writesPerformed:false,deploymentPerformed:false};
}
