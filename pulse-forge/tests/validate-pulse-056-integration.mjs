import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const json=(p)=>JSON.parse(read(p));
const exists=(p)=>fs.existsSync(path.join(root,p));
const failures=[];
const check=(ok,message)=>{if(!ok)failures.push(message);};

const driverIndex=read('apps-script/hoy-driver-os-writer/Index.html');
const driverCode=read('apps-script/hoy-driver-os-writer/Code.gs');
const driverReadme=read('apps-script/hoy-driver-os-writer/README.md');
const p053=json('pulse-agent/tasks/PULSE-053.json');
const p055=json('pulse-agent/tasks/PULSE-055.json');
const p056=json('pulse-agent/tasks/PULSE-056.json');
const pkg=json('pulse-forge/package.json');
const sandbox=read('pulse-forge/sandboxes/pulse-055-maplibre/MapLibreSandbox.html');
const validate053=read('pulse-forge/tests/validate-pulse-053-map-route.mjs');
const validate055=read('pulse-forge/tests/validate-pulse-055-maplibre.mjs');
const validateChain=String(pkg.scripts?.validate||'');

// PULSE-052 intent mapped to the current mobile control surface.
for(const marker of ['GO ONLINE','id="acceptBtn"','id="pickupBtn"','id="dropoffBtn"','safe-area-inset-bottom','prefers-reduced-motion']){
  check(driverIndex.includes(marker),`PULSE-052 current control marker missing: ${marker}`);
}

// PULSE-053 must remain the active Leaflet route implementation and regression guard.
check(p053.taskId==='PULSE-053','PULSE-053 task contract missing or mismatched');
check(p053.scope?.mapEngine==='Leaflet','PULSE-053 must retain Leaflet as the driver map engine');
check(p053.scope?.duplicateGpsThresholdMeters===8,'PULSE-053 8 meter trace threshold changed');
for(const marker of ['function getDriveRoutePreview()','PULSE053_MIN_TRACE_MILES','shouldAddTracePoint','map.setView(pt,Math.max(map.getZoom(),15))']){
  check(driverCode.includes(marker)||driverIndex.includes(marker),`PULSE-053 runtime marker missing: ${marker}`);
}
check(validate053.includes('shouldAddTracePoint'),'PULSE-053 GPS regression validator no longer protects live position updates');
check(validateChain.includes('validate-pulse-053-map-route.mjs'),'PULSE-053 validator is not chained into Forge validation');

// PULSE-054 intent is already embodied by the current authoritative rider lifecycle UI.
for(const marker of ['class="rider-flow"','Start ride','Complete ride','advanceRiderStatus_','Ride in progress']){
  check(driverIndex.includes(marker),`PULSE-054 current lifecycle marker missing: ${marker}`);
}
check(driverCode.includes('function logCompletedTrip(payload)'),'PULSE-054/current lifecycle lost idempotent completed-trip server path');

// Cross-build protections that must survive the sequence.
check(driverIndex.includes('inbox-qr'),'Inbox QR regressed during 052-055 integration');
check(driverIndex.includes('heldRequests'),'PULSE-079 held-request behavior regressed during 052-055 integration');
check(driverReadme.includes('request app remains the only')||driverReadme.includes('request app remains the only Ride Requests writer'),'Request-app writer boundary documentation is missing');

// PULSE-055 must stay sandbox-only and never replace Leaflet in Hoy Driver.
check(p055.taskId==='PULSE-055','PULSE-055 task contract missing or mismatched');
check(p055.featureFlag==='FEATURE_MAPLIBRE=false','PULSE-055 feature flag must remain false');
check(p055.scope?.fixtureCoordinatesOnly===true,'PULSE-055 must use fixture coordinates only');
check(p055.leafletBaselinePreserved===true,'PULSE-055 must preserve the Leaflet baseline');
check(exists('pulse-forge/sandboxes/pulse-055-maplibre/MapLibreSandbox.html'),'PULSE-055 sandbox file missing');
check(sandbox.includes('FIXTURE_ROUTE'),'PULSE-055 deterministic route fixture missing');
check(!/maplibre/i.test(driverIndex),'MapLibre leaked into Hoy Driver Index.html');
check(/leaflet/i.test(driverIndex),'Leaflet baseline missing from Hoy Driver Index.html');
check(validate055.includes('working Hoy Driver Index must remain MapLibre-free'),'PULSE-055 regression validator was weakened');
check(validateChain.includes('validate-pulse-055-maplibre.mjs'),'PULSE-055 validator is not chained into Forge validation');

// PULSE-056 itself is a validation-only release gate.
check(p056.taskId==='PULSE-056','PULSE-056 task contract mismatch');
check(p056.featureFlag==='FEATURE_INTEGRATION_VALIDATOR=false','PULSE-056 feature flag must remain false');
check(p056.productionDeployment===false,'PULSE-056 must not deploy production');
check(p056.productionMutation===false,'PULSE-056 must not mutate production');
check(p056.engineActivation===false,'PULSE-056 must not activate an engine');
check(p056.automaticMerge===false,'PULSE-056 must not auto-merge');
check(validateChain.includes('validate-pulse-056-integration.mjs'),'PULSE-056 validator must be chained into Forge validation');

if(failures.length){
  console.error('PULSE-056 integration validation failed:');
  failures.forEach(item=>console.error('- '+item));
  process.exit(1);
}
console.log('PULSE-056 integration validation passed: 052-055 current mappings coexist and release remains manual.');
