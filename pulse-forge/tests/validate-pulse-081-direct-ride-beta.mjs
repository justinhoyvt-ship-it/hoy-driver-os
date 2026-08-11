import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const task=JSON.parse(read('pulse-agent/tasks/PULSE-081.json'));
const foreground=read('apps-script/hoy-driver-os-writer/ForegroundPickup.html');
const index=read('apps-script/hoy-driver-os-writer/Index.html');
const code=read('apps-script/hoy-driver-os-writer/Code.gs');
const request=read('pulse-autobuild/request-app/Code.gs');
const form=read('pulse-autobuild/request-app/RequestForm.html');
const fare=read('pulse-autobuild/request-app/FareQuote.gs');
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg);};

check(task.taskId==='PULSE-081','PULSE-081 contract missing');
check(task.status==='STAGED_FOR_REVIEW','PULSE-081 must be staged for review');
check(task.productionDeployment===false&&task.productionMutation===false&&task.automaticMerge===false,'release safety flags changed');
check(task.scope?.farePhoneValidationBlocksBuild===false,'fare phone validation became a build blocker');
check(fare.includes('pulseGetFareQuote(input)')&&fare.includes('quote.quoteToken = pulseFareQuoteToken_(quote);'),'signed fare quote path missing');
check(/\.submitRideRequest\s*\(\s*requestPayload\s*\)/.test(form),'fare-to-request handoff missing');
check(request.includes("'Quoted Fare': fareQuote.fare"),'authoritative Ride Requests fare missing');
check(index.includes("Pulse fare $'+money(r.quotedFare)"),'driver Inbox fare display missing');
check(foreground.includes("PULSE081_FARE_KEY='pulse-direct-ride-fares-v1'"),'direct-ride fare cache missing');
check(foreground.includes('requestsFromServer=function(payload){p081RememberRequests_(payload);'),'Inbox fare capture missing');
check(foreground.includes("raw===null||raw===''||raw===undefined"),'absent quoted fares must not become zero-dollar fares');
check(foreground.includes('scheduledTripState=function(s){'),'active rider ride fare restoration missing');
check(foreground.includes("payload.fare===''||payload.fare==null"),'Trip Log fare injection missing');
check(index.includes("advanceRiderStatus_('Ride in progress'")||foreground.includes("advanceRiderStatus_('Ride in progress'"),'pickup-to-trip lifecycle missing');
check(index.includes("advanceRiderStatus_('Complete',function(){dropOff()})")||foreground.includes("advanceRiderStatus_('Complete',function(){dropOff()})"),'completion-to-dropoff lifecycle missing');
check(index.includes("if(!S.pendingTrips.some(function(x){return x.rideId===payload.rideId}))"),'client Trip Log dedupe missing');
check(code.includes('function logCompletedTrip(payload)'),'Trip Log writer missing');
check(code.includes('tripRowMatchesRideId_')&&code.includes('findTripRowByRideId_'),'server Trip Log idempotency missing');
check(index.includes('function requestReviewLocked_(){return !!(S.active&&S.active.state===\'ON_TRIP\');}'),'mid-ride request hold missing');

if(failures.length){
  console.error('PULSE-081 direct-ride integration FAIL');
  failures.forEach(f=>console.error('- '+f));
  process.exit(1);
}
console.log('PULSE-081 direct-ride integration PASS');
