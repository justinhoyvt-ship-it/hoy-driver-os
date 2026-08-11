import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const json=(p)=>JSON.parse(read(p));
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg);};

const task=json('pulse-agent/tasks/PULSE-058.json');
const fare=read('pulse-autobuild/request-app/FareQuote.gs');
const form=read('pulse-autobuild/request-app/RequestForm.html');
const request=read('pulse-autobuild/request-app/Code.gs');
const driver=read('apps-script/hoy-driver-os-writer/Code.gs');
const index=read('apps-script/hoy-driver-os-writer/Index.html');
const pkg=json('pulse-forge/package.json');

check(task.taskId==='PULSE-058','PULSE-058 contract missing');
check(task.scope?.signedFareHandoff===true,'Signed fare handoff must remain required');
check(task.scope?.standaloneRequestAppSoleWriter===true,'Request-app writer boundary changed');
check(task.productionDeployment===false&&task.productionMutation===false&&task.automaticMerge===false,'Release safety flags changed');

for(const marker of [
  'function pulseFareQuoteToken_(quote)',
  'computeHmacSha256Signature',
  'function pulseValidateSubmittedFareQuote_(payload, customer)',
  'Date.parse(quote.expiresAt) <= Date.now()',
  'pulseFareCanonicalText_(quote.origin)',
  'Math.abs(quotePickup - customerPickup) > 60000',
  'quote.quoteToken = pulseFareQuoteToken_(quote)',
  'origin: valid.origin',
  'destination: valid.destination',
  'writesPerformed: false'
]) check(fare.includes(marker),`Fare handoff marker missing: ${marker}`);
check(!fare.includes('appendRow(')&&!fare.includes('MailApp.')&&!fare.includes('CalendarApp.'),'Fare quote engine must remain no-write');

for(const marker of [
  'var requestPayload=Object.assign({},data,{',
  'quotedFare:submittedQuote.fare',
  'quoteToken:submittedQuote.quoteToken',
  'if(!quoteIsCurrent_())'
]) check(form.includes(marker),`Request form fare handoff marker missing: ${marker}`);
check(/\.submitRideRequest\s*\(\s*requestPayload\s*\)/.test(form),'Request form fare handoff marker missing: submitRideRequest(requestPayload)');

for(const marker of [
  "'Quoted Fare','Quote ID','Quote Expires At','Pricing Version'",
  'const fareQuote = pulseValidateSubmittedFareQuote_(payload, customer);',
  "'Quoted Fare': fareQuote.fare",
  "'Quote ID': fareQuote.quoteId",
  "'Quote Expires At': new Date(fareQuote.expiresAt)",
  'sh.appendRow(RIDE.HEADERS.map',
  'function submitRideRequest(payload)'
]) check(request.includes(marker),`Request writer fare marker missing: ${marker}`);

for(const marker of [
  'quotedFare: r.quotedFare',
  "quotedFare: at('Quoted Fare') >= 0 ? numOrNull_(row[at('Quoted Fare')]) : null"
]) check(driver.includes(marker),`Hoy Driver fare read marker missing: ${marker}`);
for(const marker of ['inbox-qr','heldRequests','class="inbox-fare"','Pulse fare $']){
  check(index.includes(marker),`Hoy Driver protected/visible marker missing: ${marker}`);
}

check(String(pkg.scripts?.validate||'').includes('validate-pulse-058-fare-to-inbox.mjs'),'PULSE-058 validator not chained into Forge validation');

if(failures.length){
  console.error('PULSE-058 validation failed:');
  failures.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('PULSE-058 validation passed: signed rider fare is stored once and surfaced in the existing Hoy Driver Inbox.');
