import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const driver=read('apps-script/hoy-driver-os-writer/Code.gs');
const patch=read('pulse-autobuild/request-app/production-router-patch.gs.txt');
const manifest=JSON.parse(read('pulse-autobuild/request-app/production-sync-manifest.json'));
const task=JSON.parse(read('pulse-agent/tasks/PULSE-084T.json'));
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg);};

check(task.routes?.qr==='QRLiveRequest.html','QR route contract changed');
check(task.routes?.future==='RequestForm.html','future route contract changed');
check(patch.includes("const view = String(params.view || '').toLowerCase();"),'router patch must read view');
check(patch.includes("const source = String(params.source || '').toLowerCase();"),'router patch must read source');
check(patch.includes("if (view === 'qr' || source === 'qr_live')"),'QR selector route missing');
check(patch.includes("createHtmlOutputFromFile('QRLiveRequest')"),'QR must render QRLiveRequest.html');
check(patch.includes("createHtmlOutputFromFile('RequestForm')"),'future/default must render RequestForm.html');
check(patch.indexOf("createHtmlOutputFromFile('QRLiveRequest')") < patch.indexOf("createHtmlOutputFromFile('RequestForm')"),'QR route must be checked before default future form');
check(driver.includes("'&view=qr&source=qr_live'"),'Hoy Driver QR URL selectors changed');
check(manifest.patchOnly?.includes('Code.gs'),'Code.gs must be patch-only during QR repair');
check(manifest.preserveLiveOnly?.includes('QRLiveRequest.html'),'QRLiveRequest.html must be preserved');
check(manifest.preserveUnchanged?.includes('RequestForm.html'),'RequestForm.html must remain unchanged during QR repair');
check(manifest.safety?.replaceRequestFormDuringQrRepair===false,'QR repair must not replace RequestForm.html');
check(manifest.safety?.replaceWholeCodeDuringQrRepair===false,'QR repair must not replace whole Code.gs');

if(failures.length){console.error('PULSE-084T QR router FAIL');failures.forEach(x=>console.error('- '+x));process.exit(1);} 
console.log('PULSE-084T QR router PASS');
