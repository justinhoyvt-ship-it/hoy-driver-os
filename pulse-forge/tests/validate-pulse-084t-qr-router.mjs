import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const driver=read('apps-script/hoy-driver-os-writer/Code.gs');
const patch=read('pulse-autobuild/request-app/production-router-patch.gs.txt');
const qr=read('pulse-autobuild/request-app/QrLiveRequest.html');
const qrServer=read('pulse-autobuild/request-app/QrLiveServer.gs');
const future=read('pulse-autobuild/request-app/RequestForm.html');
const fare=read('pulse-autobuild/request-app/FareQuote.gs');
const manifest=JSON.parse(read('pulse-autobuild/request-app/production-sync-manifest.json'));
const task=JSON.parse(read('pulse-agent/tasks/PULSE-084T.json'));
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg);};

check(task.routes?.qr==='QrLiveRequest.html','QR route contract changed');
check(task.routes?.future==='RequestForm.html','future route contract changed');
check(task.baseline?.qrSameDayOnly===true,'QR same-day baseline missing');
check(task.baseline?.qrNowLater===true,'QR NOW/LATER baseline missing');
check(task.delta?.newFareCalculator===false,'QR recovery must not create a second fare calculator');

const routeChecks=[
  [/function\s+requestPageFile_\s*\(\s*params\s*\)/,'requestPageFile_ helper missing'],
  [/view\s*===\s*['"]qr['"][\s\S]*source\s*===\s*['"]qr_live['"]/,'QR selector route missing'],
  [/return\s+['"]QrLiveRequest['"]/,'QR route target missing'],
  [/return\s+['"]RequestForm['"]/,'future/default route target missing'],
  [/createHtmlOutputFromFile\s*\(\s*pageFile\s*\)/,'selected page is not rendered'],
  [/action\s*===\s*['"]driver-decision['"][\s\S]*driverDecisionResponse_\s*\(\s*params\s*\)/,'driver decision POST route missing']
];
for(const [pattern,msg] of routeChecks) check(pattern.test(patch),msg);

check(driver.includes("'&view=qr&source=qr_live'"),'Hoy Driver QR URL selectors changed');
check(driver.includes("'&view=form'"),'Hoy Driver future-form URL selector changed');

for(const marker of [
  '<title>Pulse Vermont — Quick ride request</title>',
  '>Now</button>',
  '>Later today</button>',
  'id="quotePanel"',
  'id="quoteBtn"',
  '.pulseGetFareQuote({',
  'quoteIsCurrent_()',
  'quotedFare:quote&&quote.fare',
  'quoteToken:quote&&quote.quoteToken',
  '.submitQrLiveRide(data)',
  'Request sent to your Pulse driver. Watch your email for confirmation.'
]) check(qr.includes(marker),`QrLiveRequest marker missing: ${marker}`);

for(const marker of [
  "SOURCE: 'QR_LIVE'",
  "throw new Error('QR rides are available for today only.')",
  "timing !== 'NOW' && timing !== 'LATER'",
  'function submitQrLiveRide(payload)',
  'if (payload.testMode === true)',
  'noWrite: true',
  'pulseValidateSubmittedFareQuote_(payload, qrLiveFareCustomer_(payload, customer))',
  "'Quoted Fare': fareQuote.fare",
  "'Quote ID': fareQuote.quoteId",
  "'Quote Expires At': new Date(fareQuote.expiresAt)",
  "'Pricing Version': fareQuote.pricingVersion",
  "if (customer.timing === 'LATER') notifyDriverOfRequest_(row)",
  'notifyCustomerReceived_(row)',
  'function driverDecisionResponse_(params)',
  'function expireQrLiveRequests()'
]) check(qrServer.includes(marker),`QR server marker missing: ${marker}`);
check(!qrServer.includes("payload.testMode === true &&"),'QR test mode must never fall through to a write path');

// Canonical fare engine still exists in repo, but exact captured live state already
// contains these functions in RiderExperience.gs. Phase A must therefore NOT add
// FareQuote.gs until that live file is split back to canonical naming.
for(const marker of [
  'function pulseGetFareQuote(input)',
  'function pulseValidateSubmittedFareQuote_(payload, customer)',
  'writesPerformed: false'
]) check(fare.includes(marker),`canonical fare engine marker missing: ${marker}`);
check(!qrServer.includes('PULSE_FARE_BASE')&&!qr.includes('PULSE_FARE_BASE'),'QR lane must reuse the existing fare engine rather than duplicate pricing');

check(future.includes('<title>Pulse Vermont — Request a ride</title>'),'RequestForm future surface missing');
check(future.includes('id="quotePanel"'),'RequestForm must retain its existing fare panel');
check(future.includes('pulseGetFareQuote'),'RequestForm must retain its existing fare engine call');

check(manifest.taskId==='PULSE-084U','captured-live recovery manifest task ID missing');
check(manifest.targetScriptId==='1IMkq0QRzfOdhtMkefk65eN9ceOdxtNG2YgzGBCd15IAUK0u8bnisi0b0','wrong live rider project');
check(manifest.capturedLiveState?.captureMethod==='authenticated Safari webarchive','live capture method missing');
check(manifest.capturedLiveState?.liveFareEngineFile==='RiderExperience.gs','captured live fare-engine file not recorded');
check(manifest.capturedLiveState?.missingFromLive?.includes('submitQrLiveRide'),'captured missing QR writer not recorded');
check(manifest.architecture?.futureBookingHtml==='RequestForm.html','manifest future form mapping changed');
check(manifest.architecture?.qrSameDayHtml==='QrLiveRequest.html','manifest QR form mapping changed');
check(manifest.architecture?.qrDateScope==='TODAY_ONLY','manifest same-day contract missing');
check(manifest.phaseARecovery?.preserveUnchanged?.includes('RequestForm.html'),'RequestForm must remain untouched during Phase A');
check(manifest.phaseARecovery?.preserveUnchanged?.includes('RiderExperience.gs'),'captured live fare-engine file must remain untouched during Phase A');
check(manifest.phaseARecovery?.addOrReplace?.includes('QrLiveRequest.html'),'fare-enabled QR HTML must be deployed in Phase A');
check(manifest.phaseARecovery?.addOrReplace?.includes('QrLiveServer.gs'),'QR server must be restored in Phase A');
check(manifest.phaseARecovery?.doNotAddYet?.includes('FareQuote.gs'),'Phase A must explicitly defer FareQuote.gs to prevent duplicate functions');
check(manifest.safety?.replaceRequestFormDuringQrRepair===false,'QR repair must not replace RequestForm.html');
check(manifest.safety?.replaceWholeCodeDuringQrRepair===false,'QR repair must not replace whole Code.gs');
check(manifest.safety?.addFareQuoteDuringPhaseA===false,'Phase A must not add FareQuote.gs');
check(manifest.safety?.touchRiderExperienceDuringPhaseA===false,'Phase A must not touch captured RiderExperience.gs');

if(failures.length){console.error('PULSE-084U captured-live QR recovery FAIL');failures.forEach(x=>console.error('- '+x));process.exit(1);}
console.log('PULSE-084U captured-live QR recovery PASS');
