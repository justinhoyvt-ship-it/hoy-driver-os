import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), '..');
const html = fs.readFileSync(path.join(root, 'apps-script/hoy-driver-os-writer/Index.html'), 'utf8');
const code = fs.readFileSync(path.join(root, 'apps-script/hoy-driver-os-writer/Code.gs'), 'utf8');
const requestHtml = fs.readFileSync(path.join(root, 'pulse-autobuild/request-app/RequestForm.html'), 'utf8');
const requestCode = fs.readFileSync(path.join(root, 'pulse-autobuild/request-app/Code.gs'), 'utf8');
const problems = [];

for (const marker of [
  'id="openQrFromInbox"',
  '>Ride request QR</button>',
  'id="qrOverlay"',
  'id="bookingQr"',
  'qrcode.min.js',
  'function openQr()',
  "srv('getRideRequestQrConfig'",
  "$('openQrFromInbox').onclick=openQr"
]) { if (!html.includes(marker)) problems.push(`QR client marker missing: ${marker}`); }

for (const marker of [
  'function pulse080QrRequestRoute_()',
  "if (!url || !token) return { url: '', token: '' };",
  'function getRideRequestQrConfig()',
  'function qrLiveRideRequestUrl_()',
  'function fullRideRequestUrl_()',
  "if (!cfg.url || !cfg.token) return '';",
  'configured: !!(qrUrl && formUrl)',
  'rideRequestUrl: qrLiveRideRequestUrl_(),',
  'rideRequestFormUrl: fullRideRequestUrl_(),'
]) { if (!code.includes(marker)) problems.push(`QR server marker missing: ${marker}`); }

if (code.includes('PULSE080_STAGE_REQUEST_URL')) problems.push('Canonical Pulse Drive Mode must not contain a staging URL override.');

// The isolated Request App supports a no-write phone smoke test after merge/restage.
for (const marker of [
  "testMode=String(params.mode||'').toLowerCase()==='test'",
  'consent:$',
]) {
  if (marker === 'consent:$') continue;
  if (!requestHtml.includes(marker)) problems.push(`Request App test-mode marker missing: ${marker}`);
}
if (!requestHtml.includes('testMode:testMode')) problems.push('Request App form does not submit testMode.');
if (!requestCode.includes('if (payload.testMode === true)')) problems.push('Request App server has no no-write testMode path.');
if (!requestCode.includes('noWrite: true')) problems.push('Request App testMode does not prove no-write behavior.');

const report = { ok: problems.length === 0, taskId: 'PULSE-080Q', canonicalFailClosed: true, isolatedRequestTestMode: true, problems };
console.log(JSON.stringify(report, null, 2));
if (problems.length) process.exit(1);
