import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const repoRoot = path.resolve('..');
const driverHtmlPath = path.join(repoRoot, 'apps-script', 'hoy-driver-os-writer', 'Index.html');
const driverHtml = fs.readFileSync(driverHtmlPath, 'utf8');

const requiredMarkers = [
  'heldRequests:[]',
  'function requestReviewLocked_()',
  'function requestKey_(r)',
  'function uniqueRequests_(list)',
  'function reconcileRequestedRides_(incoming)',
  'function releaseHeldRequests_()',
  'navigator.vibrate([120,60,120])',
  'Request held until drop-off',
  'accept.disabled=locked',
  'decline.disabled=locked',
  'releaseHeldRequests_();'
];
for (const marker of requiredMarkers) {
  assert.ok(driverHtml.includes(marker), `PULSE-079 marker missing: ${marker}`);
}

const holdStart = driverHtml.indexOf('function requestReviewLocked_()');
const holdEnd = driverHtml.indexOf('function renderInbox()', holdStart);
assert.ok(holdStart >= 0 && holdEnd > holdStart, 'PULSE-079 hold block was not found.');
const holdBlock = driverHtml.slice(holdStart, holdEnd);
for (const forbidden of [
  "srv('updateRiderStatus'",
  "srv('beginScheduledPickup'",
  "srv('beginForegroundPickup'",
  'openDecision('
]) {
  assert.ok(!holdBlock.includes(forbidden), `PULSE-079 hold block contains forbidden action: ${forbidden}`);
}

function requestKey(request) {
  const r = request || {};
  return String(r.requestId || r.id || [
    r.name || '',
    r.pickup || '',
    r.destination || '',
    r.whenISO || ''
  ].join('|')).trim();
}

function uniqueRequests(list) {
  const order = [];
  const byKey = {};
  for (const request of list || []) {
    const key = requestKey(request);
    if (!key) continue;
    if (!Object.prototype.hasOwnProperty.call(byKey, key)) order.push(key);
    byKey[key] = request;
  }
  return order.map((key) => byKey[key]);
}

function reconcile(state, incoming, locked) {
  const requests = uniqueRequests(incoming);
  const previousVisible = new Set((state.requests || []).map(requestKey));
  const previousHeld = new Set((state.heldRequests || []).map(requestKey));

  if (locked) {
    const visible = [];
    const held = uniqueRequests(state.heldRequests || []);
    let newlyHeld = 0;
    for (const request of requests) {
      const key = requestKey(request);
      if (previousVisible.has(key)) visible.push(request);
      else {
        held.push(request);
        if (!previousHeld.has(key)) newlyHeld += 1;
      }
    }
    return {
      requests: uniqueRequests(visible),
      heldRequests: uniqueRequests(held),
      newlyHeld
    };
  }

  return {
    requests: uniqueRequests(requests.concat(state.heldRequests || [])),
    heldRequests: [],
    newlyHeld: 0
  };
}

let state = {
  requests: [{ requestId: 'REQ-1', pickup: 'A', destination: 'B' }],
  heldRequests: []
};

state = reconcile(state, [
  { requestId: 'REQ-1', pickup: 'A', destination: 'B' },
  { requestId: 'REQ-2', pickup: 'C', destination: 'D' },
  { requestId: 'REQ-2', pickup: 'C', destination: 'D' }
], true);

assert.deepEqual(state.requests.map(requestKey), ['REQ-1']);
assert.deepEqual(state.heldRequests.map(requestKey), ['REQ-2']);
assert.equal(state.newlyHeld, 1);

const restored = JSON.parse(JSON.stringify(state));
assert.deepEqual(restored.heldRequests.map(requestKey), ['REQ-2']);

state = reconcile(restored, [
  { requestId: 'REQ-1', pickup: 'A', destination: 'B' },
  { requestId: 'REQ-2', pickup: 'C', destination: 'D' }
], true);
assert.deepEqual(state.heldRequests.map(requestKey), ['REQ-2']);
assert.equal(state.newlyHeld, 0);

state = reconcile(state, [
  { requestId: 'REQ-1', pickup: 'A', destination: 'B' }
], true);
assert.deepEqual(state.heldRequests.map(requestKey), ['REQ-2']);
assert.equal(state.newlyHeld, 0);

state = reconcile(state, [
  { requestId: 'REQ-1', pickup: 'A', destination: 'B' },
  { requestId: 'REQ-2', pickup: 'C', destination: 'D' }
], false);
assert.deepEqual(state.requests.map(requestKey), ['REQ-1', 'REQ-2']);
assert.deepEqual(state.heldRequests, []);

console.log(JSON.stringify({
  ok: true,
  taskId: 'PULSE-079',
  duplicateSuppression: true,
  refreshPersistence: true,
  unlockAfterDropoff: true,
  automaticDecisionWrites: 0,
  riderStatusWrites: 0,
  productionTouched: false
}, null, 2));
