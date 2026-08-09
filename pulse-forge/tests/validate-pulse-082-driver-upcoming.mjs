import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const task=JSON.parse(read('pulse-agent/tasks/PULSE-082.json'));
const foreground=read('apps-script/hoy-driver-os-writer/ForegroundPickup.html');
const code=read('apps-script/hoy-driver-os-writer/Code.gs');
const index=read('apps-script/hoy-driver-os-writer/Index.html');
const failures=[];const check=(ok,msg)=>{if(!ok)failures.push(msg);};
check(task.taskId==='PULSE-082'&&task.status==='STAGED_FOR_REVIEW','PULSE-082 contract missing');
check(task.productionDeployment===false&&task.productionMutation===false&&task.automaticMerge===false,'PULSE-082 safety flags changed');
check(foreground.includes('id="pulse082-style"'),'Scheduled visual layer missing');

const legacyPresentation =
  foreground.includes("next.textContent='NEXT PULSE RIDE'") &&
  foreground.includes("source.textContent=pulse?'PULSE DIRECT':'SCHEDULED'") &&
  foreground.includes("status.textContent=s.riderStatus||'Confirmed'") &&
  foreground.includes("'<small>Pulse fare</small>$'+money(fare)") &&
  foreground.includes("p082Button_('Begin pickup'") &&
  foreground.includes("p082Button_('Pickup'") && foreground.includes("p082Button_('Drop'");

const simplifiedPresentation =
  foreground.includes('p084-timefare') &&
  foreground.includes('p084-route') &&
  foreground.includes('p084-fare') &&
  foreground.includes("p082Button_('Start ride'") &&
  foreground.includes('function p082Fare_');

check(legacyPresentation || simplifiedPresentation,'neither legacy nor simplified Scheduled presentation is intact');
check(code.includes(".filter(r => r.status === 'CONFIRMED' && !started[r.requestId])"),'existing confirmed-request Scheduled projection missing');
if(simplifiedPresentation) check(code.includes('quotedFare: r.quotedFare'),'simplified Scheduled projection must carry quoted fare');
check(index.includes('function startScheduled(id)'),'existing Scheduled lifecycle missing');
check(index.includes('function openQr()'),'QR lane changed or missing');
if(failures.length){console.error('PULSE-082 driver upcoming surface FAIL');failures.forEach(f=>console.error('- '+f));process.exit(1);}console.log('PULSE-082 driver upcoming surface PASS');
