import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const json=(p)=>JSON.parse(read(p));
const failures=[];
const check=(ok,message)=>{if(!ok)failures.push(message);};

const task=json('pulse-agent/tasks/PULSE-057.json');
const integration=json('pulse-forge/tasks/PULSE-057/qr-fare-integration.json');
const fare=read('pulse-autobuild/request-app/FareQuote.gs');
const form=read('pulse-autobuild/request-app/RequestForm.html');
const requestCode=read('pulse-autobuild/request-app/Code.gs');
const driver=read('apps-script/hoy-driver-os-writer/Index.html');
const pkg=json('pulse-forge/package.json');
const validateChain=String(pkg.scripts?.validate||'');

check(task.taskId==='PULSE-057','PULSE-057 task contract missing');
check(task.scope?.reusePulse059FareEngine===true,'PULSE-057 must reuse the PULSE-059 fare engine');
check(task.scope?.newFareCalculator===false,'PULSE-057 must not add another fare calculator');
check(task.scope?.preserveSameDayQrRule===true,'PULSE-057 must preserve the working same-day QR rule');
check(task.scope?.preserveSeparateFutureSchedulingForm===true,'Future scheduling must remain separate');

check(integration.reuse?.pulse059FareEngine===true,'Integration package lost PULSE-059 reuse');
check(integration.reuse?.pulse050Inbox===true,'Integration package must preserve the existing Inbox');
check(integration.reuse?.pulse079HeldRequests===true,'Integration package must preserve held requests');
check(integration.reuse?.pulse080qQrEntry===true,'Integration package must preserve the existing QR entry point');
check(integration.protectedBehavior?.standaloneRequestAppSoleWriter===true,'Request writer boundary must remain protected');

for(const marker of [
  'function pulseGetFareQuote(input)',
  'writesPerformed: false',
  "comparisonStatus: 'UNAVAILABLE'",
  "PULSE_FARE_BASE",
  "PULSE_FARE_PER_MILE",
  "PULSE_FARE_PER_MINUTE",
  "PULSE_FARE_MINIMUM"
]) check(fare.includes(marker),`PULSE-059 fare engine marker missing: ${marker}`);

for(const marker of integration.requiredFareUiMarkers||[]){
  check(form.includes(marker),`QR fare UI marker missing: ${marker}`);
}

// PULSE-085C supersedes the old single array listener with smart-input + date/time invalidation.
check(form.includes('function resetQuote_()')&&form.includes("smartInput_('pickup')")&&form.includes("smartInput_('destination')")&&form.includes("['date','time'].forEach"),'Fare quote must be invalidated when route/time inputs change');
check(form.includes("if(!quoteIsCurrent_())")||form.includes("quoteIsCurrent_()"),'Submission flow must check quote freshness');
check(form.includes('submitRideRequest'),'Existing request submission path must remain present');
check(!fare.includes('MailApp.')&&!fare.includes('CalendarApp.')&&!fare.includes('appendRow('),'Fare engine must remain no-write');
check(requestCode.includes('submitRideRequest'),'Standalone request writer missing');

check(driver.includes('inbox-qr'),'Existing Inbox QR entry point regressed');
check(driver.includes('heldRequests'),'PULSE-079 held-request behavior regressed');
check(!/uber|lyft/i.test(fare),'PULSE-057 must not invent competitor fares');
check(validateChain.includes('validate-pulse-057-qr-fare.mjs'),'PULSE-057 validator is not chained into Forge validation');

check(task.automaticMerge===false,'PULSE-057 must remain manual merge');
check(task.productionDeployment===false,'PULSE-057 must not deploy production');
check(task.productionMutation===false,'PULSE-057 must not mutate production');
check(task.engineActivation===false,'PULSE-057 must not activate an engine');

if(failures.length){
  console.error('PULSE-057 QR fare integration validation failed:');
  failures.forEach(item=>console.error('- '+item));
  process.exit(1);
}
console.log('PULSE-057 validation passed: existing fare engine remains authoritative while PULSE-085C auto-fare UX supersedes the manual gate.');
