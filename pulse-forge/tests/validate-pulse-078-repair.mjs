import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const repoRoot = path.resolve('..');
const codePath = path.join(repoRoot, 'pulse-autobuild', 'request-app', 'Code.gs');
const formPath = path.join(repoRoot, 'pulse-autobuild', 'request-app', 'RequestForm.html');

const code = fs.readFileSync(codePath, 'utf8');
const form = fs.readFileSync(formPath, 'utf8');

for (const marker of [
  "STATUS_EVENTS_SHEET_NAME: 'Ride Status Events'",
  "STATUS_PAGE_TTL_DAYS: 90",
  "function doPost(e)",
  "function driverStatusUpdateResponse_(params)",
  "function ensureConfirmedAccessDeliveryUnlocked_(found)",
  "function testRideIdPinAccessPackage()",
  "function testRideStatusProgressionPackage()",
  "'Ride ID','PIN Salt','PIN Verifier','Access Issued At','Access Email Sent At'"
]) {
  assert.ok(code.includes(marker), `PULSE-078 repair server marker missing: ${marker}`);
}

for (const marker of [
  'data-rider-experience="off"',
  'id="quoteBtn"',
  'pulseGetRiderExperienceConfig',
  'id="confirmRideBtn"',
  'Confirm Ride',
  'Pulse fare',
  'function submitExistingWriter_(data,button)'
]) {
  assert.ok(form.includes(marker), `PULSE-078 repair form marker missing: ${marker}`);
}
assert.ok(/function\s+requestFareQuote_\s*\(/.test(form), 'PULSE-078 repair fare quote function missing');

for (const regression of [
  "This is Justin’s ride-booking portal.",
  "btn.textContent=testMode?'Test ride request':'Send ride request';"
]) {
  assert.ok(!form.includes(regression), `PULSE-078 merged regression remains: ${regression}`);
}

console.log(JSON.stringify({
  ok: true,
  taskId: 'PULSE-078-REPAIR',
  restored: [
    'fare quote and staged request flow',
    'rider experience',
    'private Ride ID and salted PIN access',
    'rider status progression'
  ],
  canonicalFilesChecked: 2,
  productionTouched: false
}, null, 2));
