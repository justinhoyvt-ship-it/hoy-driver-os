import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const driver=read('apps-script/hoy-driver-os-writer/Pulse086Client.html');
const request=read('pulse-autobuild/request-app/QrLiveServer.gs');
const requestCode=read('pulse-autobuild/request-app/Code.gs');
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg)};

const scripts=[...driver.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
check(scripts.length===1,'driver client must have exactly one inline script');
scripts.forEach((script,i)=>{try{new Function(script)}catch(e){failures.push('driver script '+(i+1)+' syntax error: '+e.message)}});
try{new Function(request)}catch(e){failures.push('QrLiveServer syntax error: '+e.message)}

// Fail-safe: legacy controls are hidden only after the replacement shell mounts.
check(driver.includes('body.pulse-r4-mounted #actionbar'),'legacy actionbar is not mount-gated');
check(driver.includes("document.body.classList.add('pulse-r4-mounted')"),'successful mount flag missing');
check(driver.includes("document.body.classList.remove('pulse-r4-mounted')"),'mount failure fallback missing');

for(const marker of [
  'Start shift','End shift','Complete ride','Start pickup','Queue next',
  "srv('decideRequestedRide'",'Pay now requested','Pay after ride',
  "window.openDecision=function(){say('Use Inbox Accept / Decline')"
]) check(driver.includes(marker),'driver marker missing: '+marker);
check(!driver.includes('Picked up<small'),'legacy Picked up rail leaked into R4');
check(!driver.includes('Drop off<small'),'legacy Drop off rail leaked into R4');
check(driver.includes("if(timing(r)==='LATER'){say('Ride accepted · Scheduled')"),'LATER acceptance must remain Scheduled');
check(driver.includes("a.requestId?riderStatus('Complete',done):done()"),'Complete must advance rider status before clearing active ride');

for(const marker of [
  'function pulseR4ServiceUrl_()',
  'ScriptApp.getService().getUrl()',
  'function pulseR4SyncWebAppUrl()',
  'function pulseR4NotifyCustomerConfirmed_',
  'function pulseR4ConfirmRide_',
  "decision === 'DECLINE' ? declineRide(id) : pulseR4ConfirmRide_(id)",
  '<td style="padding:9px 0;color:#8199aa">Payment</td>',
  'Review this request in the Pulse driver Inbox.',
  'statusLinksUseCurrentServiceUrl:true'
]) check(request.includes(marker),'request bridge marker missing: '+marker);
check(!request.includes("'CONFIRM: ' + actionUrl_"),'R4 driver email must not send old confirmation links');
check(!requestCode.includes('function driverDecisionResponse_('),'driver decision function unexpectedly duplicated in Code.gs');

if(failures.length){console.error('PULSE-086R4 FAIL');failures.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('PULSE-086R4 PASS');
