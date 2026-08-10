import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), '..');
const req = path.join(root, 'pulse-autobuild/request-app');
const manifest = JSON.parse(fs.readFileSync(path.join(req, 'production-sync-manifest.json'), 'utf8'));
const problems = [];
const need = (cond, msg) => { if (!cond) problems.push(msg); };

need(manifest.targetScriptId === '1IMkq0QRzfOdhtMkefk65eN9ceOdxtNG2YgzGBCd15IAUK0u8bnisi0b0', 'wrong live rider project');
need(!(JSON.stringify(manifest).includes('1pxF-tqlu-NrINv0QD-sQZEXMGUoc408YhHOuKccoU_URCtCyOmTiaVSm')), 'stale rider project returned');

// PULSE-084T supersedes the unsafe PULSE-084S live-only QR assumption.
need(manifest.architecture?.qrSameDayHtml === 'QrLiveRequest.html', 'canonical QR same-day HTML mapping missing');
need(manifest.architecture?.futureBookingHtml === 'RequestForm.html', 'future booking HTML mapping missing');
need(manifest.preserveUnchanged?.includes('RequestForm.html'), 'RequestForm.html must remain protected during QR recovery');

for (const file of ['Code.gs','RequestForm.html','QrLiveRequest.html','QrLiveServer.gs','FareQuote.gs','RiderExperience.gs','appsscript.json']) {
  need(fs.existsSync(path.join(req, file)), `missing ${file}`);
}
const code = fs.readFileSync(path.join(req, 'Code.gs'), 'utf8');
const form = fs.readFileSync(path.join(req, 'RequestForm.html'), 'utf8');
const qr = fs.readFileSync(path.join(req, 'QrLiveRequest.html'), 'utf8');
for (const marker of ['Quoted Fare','Quote ID','Quote Expires At','Pricing Version','Receipt Email Sent At']) need(code.includes(marker), `Code.gs missing ${marker}`);
need(form.includes('Request sent to your Pulse driver'), 'future request success copy missing');
need(form.includes('Watch your inbox for confirmation'), 'future request confirmation copy missing');
need(qr.includes('submitQrLiveRide'), 'QR submission path missing');
need(qr.includes('pulseGetFareQuote'), 'QR fare call missing');
need(manifest.safety?.automaticProductionWrite === false, 'automatic production write must remain false');
need(manifest.safety?.automaticDeployment === false, 'automatic deployment must remain false');

console.log(JSON.stringify({ ok: problems.length === 0, problems }, null, 2));
if (problems.length) process.exit(1);
