import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const qrServer=read('pulse-autobuild/request-app/QrLiveServer.gs');
const reliable=read('pulse-autobuild/request-app/Pulse085ARequestReliability.gs');
const qr=read('pulse-autobuild/request-app/QrLiveRequest.html');
const driverCode=read('apps-script/hoy-driver-os-writer/Code.gs');
const driverUi=read('apps-script/hoy-driver-os-writer/Index.html');
const patch=read('pulse-forge/tasks/PULSE-085A/request-app-code.patch.md');
const qrPatch=read('pulse-forge/tasks/PULSE-085A/qr-live-html.patch.md');
const task=JSON.parse(read('pulse-agent/tasks/PULSE-085A.json'));
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg)};

for(const marker of ['submitQrLiveRideReliable','Utilities.sleep(350)','notifyDriverOfRequest_','result.driverEmailSent = true','noWrite !== true']) check(reliable.includes(marker),'reliability marker missing: '+marker);
check(qrPatch.includes('submitQrLiveRideReliable(data)'),'QR submit handoff not staged');
check(qrServer.includes("if (customer.timing === 'LATER') notifyDriverOfRequest_(row)"),'existing LATER driver alert contract changed');

for(const marker of ['actionToken_(\'status\'','verifyActionToken_(\'status\'','renderRiderStatusPage_(state.status, state.occurredAt, found.obj)','20-second','car hero','email sends occur after']) check(patch.includes(marker),'request-app patch marker missing: '+marker);

check(driverCode.includes("'Quoted Fare'"),'Hoy Driver reader does not recognize Quoted Fare');
check(driverCode.includes('quotedFare:'),'Hoy Driver request projection does not carry quotedFare');
check(driverUi.includes('inbox-fare'),'Hoy Driver UI lacks fare styling');
check(driverUi.includes('r.quotedFare!=null'),'Hoy Driver Inbox does not render request fare');

check(task.acceptance?.nowQrAlertsDriver===true,'NOW driver alert acceptance missing');
check(task.acceptance?.trackMyRideOneClick===true,'one-click rider status acceptance missing');
check(task.acceptance?.automaticProductionDeployment===false,'production deployment guard missing');

if(failures.length){console.error('PULSE-085A FAIL');failures.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('PULSE-085A PASS');
