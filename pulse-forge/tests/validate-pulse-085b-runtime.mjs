import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const client=read('apps-script/hoy-driver-os-writer/Pulse085BClient.html');
const server=read('apps-script/hoy-driver-os-writer/Pulse085B.gs');
const foreground=read('apps-script/hoy-driver-os-writer/ForegroundPickup.html');
const driver=read('apps-script/hoy-driver-os-writer/Index.html');
const patch=read('pulse-forge/tasks/PULSE-085B/production-patch.md');
const task=JSON.parse(read('pulse-agent/tasks/PULSE-085B.json'));
const failures=[];const check=(ok,msg)=>{if(!ok)failures.push(msg)};

check(task.status==='STAGED_FOR_REVIEW','task not staged for review');
for(const marker of [
  'navTo=function(address){return p085bShowRoute_',
  "riderActionButton_('Route to pickup'",
  "riderActionButton_('Start ride'",
  "riderActionButton_('Route to destination'",
  "riderActionButton_('Complete ride'",
  "return 'Heading to pickup'",
  "return 'Near pickup'",
  "return 'At pickup'",
  'p085bShowRoute_(s.pickup||ride.pickup',
  'L.polyline(pts',
  'map.fitBounds',
  '.inbox-fare{font-size:1.35rem'
]) check(client.includes(marker),'client marker missing: '+marker);

check(!client.includes('window.open('),'PULSE-085B client must not open external map windows');
for(const marker of [
  'function pulse085bRoutePreview(',
  'Maps.newDirectionFinder()',
  '.setMode(Maps.DirectionFinder.Mode.DRIVING)',
  'Maps.decodePolyline(encoded)',
  'writesPerformed: false'
]) check(server.includes(marker),'route server marker missing: '+marker);

// Existing foreground automation remains the rider-status engine.
for(const marker of [
  "p069Publish_('On the way')",
  "p069Publish_('Arriving soon')",
  "p069Publish_('Arrived')"
]) check(foreground.includes(marker),'foreground automatic status marker missing: '+marker);

check(driver.includes('.inbox-fare'),'existing Inbox fare surface missing');
check(patch.includes("foreground + '\\n' + pulse085b"),'production injection patch missing');
check(patch.includes('Do not replace the whole `Code.gs`'),'surgical production rule missing');

if(failures.length){console.error('PULSE-085B FAIL');failures.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('PULSE-085B PASS');
