import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const forgeRoot = path.basename(cwd) === 'pulse-forge' ? cwd : path.resolve(cwd, 'pulse-forge');
const repoRoot = path.resolve(forgeRoot, '..');
const problems = [];
let html = '';
let code = '';
try { html = fs.readFileSync(path.join(repoRoot, 'apps-script/hoy-driver-os-writer/Index.html'), 'utf8'); } catch (e) { problems.push('Unable to read Pulse Drive Mode Index.html: ' + e.message); }
try { code = fs.readFileSync(path.join(repoRoot, 'apps-script/hoy-driver-os-writer/Code.gs'), 'utf8'); } catch (e) { problems.push('Unable to read Pulse Drive Mode Code.gs: ' + e.message); }

if (html) {
  for (const marker of [
    'id="map"',
    'id="pulse053RouteLayer"',
    'window.PulseRouteLayer={sync:syncRide,clearTrip:clearTrip}',
    'srv("getDriveRoutePreview",pickup,destination)',
    'dashArray:"8 8"',
    'color:"#45e394"',
    'PULSE053_MIN_TRACE_MILES=0.00497097',
    'if(lastTracePoint&&stepMiles<PULSE053_MIN_TRACE_MILES)return;',
    'function syncTrace(active)',
    'syncTrace(false)',
    'syncTrace(true)',
    'color:"#42dcff",weight:5,opacity:.9',
    'failKey:"",failures:0,nextRetryAt:0',
    'Math.min(300000,15000*Math.pow(2,routeState.failures-1))',
    'if(routeState.failKey===key&&Date.now()<routeState.nextRetryAt)return;',
    'if(!drawRoute(res,key))markRouteFailure(key);',
    'markRouteFailure(key);',
    'id="openQrFromInbox"',
    "if(S.active||S.queued){toast('Finish current ride first');return;}"
  ]) if (!html.includes(marker)) problems.push(`PULSE-053 client marker missing: ${marker}`);
  if ((html.match(/L\.map\('map'/g) || []).length !== 1) problems.push('PULSE-053 must preserve exactly one Leaflet map creation.');
  if (html.includes('mapboxgl.')) problems.push('PULSE-053 must not replace Leaflet with MapLibre/Mapbox.');
  const ridePos = html.indexOf('var ride=activeRide();');
  const idleTracePos = html.indexOf('syncTrace(false)', ridePos);
  const activeTracePos = html.indexOf('syncTrace(true)', ridePos);
  if (ridePos < 0 || idleTracePos < ridePos || activeTracePos < ridePos || idleTracePos > activeTracePos) problems.push('PULSE-053 must reset the trace while idle before applying active-trip styling.');
}

if (code) {
  for (const marker of [
    'function getDriveRoutePreview(pickupAddress, destinationAddress)',
    'Maps.newDirectionFinder()',
    '.setMode(Maps.DirectionFinder.Mode.DRIVING)',
    "reason: 'ROUTE_LOOKUP_FAILED'",
    'writesPerformed: false',
    'function pulse080QrRequestRoute_()'
  ]) if (!code.includes(marker)) problems.push(`PULSE-053 server/preserved marker missing: ${marker}`);
  if (code.includes('SpreadsheetApp.openById(RIDER_SHEET_ID).getSheetByName(RIDER_SHEET_NAME).appendRow')) problems.push('Pulse Drive Mode must remain read-only toward Ride Requests.');
}

const report = { ok: problems.length === 0, taskId: 'PULSE-053', map: 'Leaflet', routePreviewWrites: false, reviewRepair: 'idle-trace-reset-and-route-backoff', problems };
console.log(JSON.stringify(report, null, 2));
if (problems.length) process.exit(1);
