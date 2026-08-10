import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const code=read('pulse-autobuild/request-app/Code.gs');
const driver=read('apps-script/hoy-driver-os-writer/Code.gs');
const task=JSON.parse(read('pulse-agent/tasks/PULSE-084T.json'));
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg);};

check(task.routes?.qr==='QRLiveRequest.html','QR route contract changed');
check(task.routes?.future==='RequestForm.html','future route contract changed');
check(code.includes("const view = String(params.view || '').toLowerCase();"),'request router must read view');
check(code.includes("const source = String(params.source || '').toLowerCase();"),'request router must read source');
check(code.includes("if (view === 'qr' || source === 'qr_live')"),'QR selector route missing');
check(code.includes("createHtmlOutputFromFile('QRLiveRequest')"),'QR must render QRLiveRequest.html');
check(code.includes("createHtmlOutputFromFile('RequestForm')"),'future/default must render RequestForm.html');
check(code.indexOf("createHtmlOutputFromFile('QRLiveRequest')") < code.indexOf("createHtmlOutputFromFile('RequestForm')"),'QR route must be checked before default future form');
check(driver.includes("'&view=qr&source=qr_live'"),'Hoy Driver QR URL selectors changed');
check(!code.includes("createHtmlOutputFromFile('RequestForm')\n    .setTitle('Pulse Vermont — Request a ride')\n    .addMetaTag") || code.includes("createHtmlOutputFromFile('QRLiveRequest')"),'RequestForm cannot be the only rider GET surface');

if(failures.length){console.error('PULSE-084T QR router FAIL');failures.forEach(x=>console.error('- '+x));process.exit(1);} 
console.log('PULSE-084T QR router PASS');
