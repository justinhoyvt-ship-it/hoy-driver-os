import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const sandboxPath=path.join(root,'pulse-forge/sandboxes/pulse-055-maplibre/MapLibreSandbox.html');
const taskPath=path.join(root,'pulse-agent/tasks/PULSE-055.json');
const driverPath=path.join(root,'apps-script/hoy-driver-os-writer/Index.html');
const pkgPath=path.join(root,'pulse-forge/package.json');

const sandbox=fs.readFileSync(sandboxPath,'utf8');
const task=JSON.parse(fs.readFileSync(taskPath,'utf8'));
const driver=fs.readFileSync(driverPath,'utf8');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
const failures=[];
const requireCheck=(ok,message)=>{if(!ok)failures.push(message);};

requireCheck(sandbox.includes('maplibre-gl@4.7.1'),'sandbox must pin MapLibre GL JS 4.7.1');
requireCheck(sandbox.includes('demotiles.maplibre.org/style.json'),'sandbox must use the reviewed demo tile style');
requireCheck(sandbox.includes('FIXTURE_ROUTE'),'sandbox must render deterministic copied route geometry');
requireCheck(sandbox.includes('requestAnimationFrame(sample)'),'sandbox must expose an approximate FPS sample');
requireCheck(sandbox.includes('cancelAnimationFrame'),'sandbox must stop its metric loop on destroy');
requireCheck(sandbox.includes('map.on(\'error\''),'sandbox must expose truthful map failure state');
requireCheck(!/script\.google\.com|SpreadsheetApp|openById|HOY_SHEET_ID|RIDER_SHEET_ID|submitRideRequest|Ride Requests/i.test(sandbox),'sandbox must contain no production endpoint, Sheet writer, or rider-request path');
requireCheck(!/maplibre/i.test(driver),'working Hoy Driver Index must remain MapLibre-free');
requireCheck(/leaflet/i.test(driver),'working Hoy Driver Index must retain the Leaflet baseline');
requireCheck(task.taskId==='PULSE-055','task id must be PULSE-055');
requireCheck(task.featureFlag==='FEATURE_MAPLIBRE=false','feature flag must remain false outside the sandbox');
requireCheck(task.productionDeployment===false,'production deployment must remain false');
requireCheck(task.leafletBaselinePreserved===true,'task must preserve Leaflet baseline');
requireCheck(task.liveRiderData===false,'task must prohibit live rider data');
requireCheck(String(pkg.scripts?.validate||'').includes('validate-pulse-055-maplibre.mjs'),'PULSE-055 validator must be chained into Forge validation');

if(failures.length){
  console.error('PULSE-055 validation failed:');
  failures.forEach(item=>console.error('- '+item));
  process.exit(1);
}
console.log('PULSE-055 MapLibre sandbox validation passed.');
