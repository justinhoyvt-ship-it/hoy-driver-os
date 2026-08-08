import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), '..');
const html = fs.readFileSync(path.join(root, 'apps-script/hoy-driver-os-writer/Index.html'), 'utf8');
const code = fs.readFileSync(path.join(root, 'apps-script/hoy-driver-os-writer/Code.gs'), 'utf8');
const problems = [];
for (const marker of [
  'id="openQrFromInbox"',
  '>Ride request QR</button>',
  'id="qrOverlay"',
  'qrcode.min.js',
  'function openQr()',
  "srv('getRideRequestQrConfig'",
  "$('openQrFromInbox').onclick=openQr"
]) { if (!html.includes(marker)) problems.push(`QR client marker missing: ${marker}`); }
for (const marker of [
  'function getRideRequestQrConfig()',
  'function qrLiveRideRequestUrl_()',
  'function fullRideRequestUrl_()',
  'rideRequestUrl: qrLiveRideRequestUrl_(),',
  'rideRequestFormUrl: fullRideRequestUrl_(),'
]) { if (!code.includes(marker)) problems.push(`QR server marker missing: ${marker}`); }
const report = { ok: problems.length === 0, taskId: 'PULSE-080Q', problems };
console.log(JSON.stringify(report, null, 2));
if (problems.length) process.exit(1);
