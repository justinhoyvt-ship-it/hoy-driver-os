import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const task=path.join(root,'pulse-forge/tasks/PULSE-086R5');
const stage=path.join(task,'staging');
const read=p=>fs.readFileSync(p,'utf8');
const cat=(base,n)=>Array.from({length:n},(_,i)=>read(path.join(stage,`${base}.part${i+1}.txt`))).join('');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const failures=[]; const check=(ok,msg)=>{if(!ok)failures.push(msg)};

const client=cat('Pulse086Client',5);
const qr=cat('QrLiveRequest',4);
const qrServer=cat('QrLiveServer',5);
const hoyServer=read(path.join(root,'apps-script/hoy-driver-os-writer/Pulse086R5Server.gs'));
const readme=read(path.join(task,'README.md'));

const expected={
  client:'e07803fae1ec8522941e5b84566c6d52dc6de9973e6db41090f934a358ffd68e',
  qr:'62bb4ea32f9fe9ca9f841dab6f4906a9fae7f4d996c5562d89f92429d7941c67',
  qrServer:'40de50b6c619edbd93f7c8cd01cd4fbda38b4e4d7ac890d1eeeca014f78dd3da',
  hoyServer:'a49e9cdab6362cf645f6d1dd9d014be14a3dc37ed8f66c6444d288ca8c8c5f28'
};
check(sha(client)===expected.client,'driver client artifact hash mismatch');
check(sha(qr)===expected.qr,'QR form artifact hash mismatch');
check(sha(qrServer)===expected.qrServer,'QR server artifact hash mismatch');
check(sha(hoyServer)===expected.hoyServer,'Hoy R5 server hash mismatch');
for(const h of Object.values(expected)) check(readme.includes(h),'README missing artifact hash '+h);

function inlineScripts(html){return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(x=>x.trim())}
for(const [name,html] of [['driver',client],['QR form',qr]]) inlineScripts(html).forEach((s,i)=>{try{new vm.Script(s,{filename:`${name}-${i+1}.js`})}catch(e){failures.push(`${name} script syntax: ${e.message}`)}});
for(const [name,gs] of [['QR server',qrServer],['Hoy server',hoyServer]]){try{new vm.Script(gs,{filename:name+'.gs'})}catch(e){failures.push(`${name} syntax: ${e.message}`)}}

for(const marker of [
  'PULSE-086R5-2026-08-14.1','pulse085bRoutePreview','Start ride','Complete ride','Cancel ride',
  'advanceToRideStart','cancelPulseRide','Tap to Pay in car','pulse-hoy-driver-state-v4','function route(a,label)'
]) check(client.includes(marker),'driver marker missing: '+marker);
check(!client.includes("W('navTo')"),'R5 must not route through navTo/external navigation');
check(!client.includes('window.open('),'R5 must not open external navigation windows');
check(client.includes("srv('pulse085bRoutePreview'"),'internal route preview bridge missing');
check(client.includes("srv('cancelPulseRide'"),'Cancel ride server bridge missing');

for(const marker of [
  'Pay in the car with Tap to Pay',"payment='AFTER'","marker='[PAY:'+payment+']'",'Payment: Tap to Pay in car',
  '>Now</button>','>Later today</button>','pulseGetFareQuote','submitQrLiveRide(data)'
]) check(qr.includes(marker),'QR form marker missing: '+marker);
check(!qr.includes('Pay now'),'QR form must not advertise Pay Now');
check(!qr.includes('payNowBtn'),'QR form must not contain Pay Now control');

for(const marker of [
  "decision !== 'DECLINE' && decision !== 'CONFIRM' && decision !== 'CANCEL'",
  "decision === 'CANCEL' ? 'CANCELLED'",
  "decision === 'CANCEL' ? cancelRide(id)",
  "paymentMode: 'Tap to Pay in car'",
  'onlinePayAdvertised: false',
  'function testPulse086r5RequestBridgeNoWrite()'
]) check(qrServer.includes(marker),'QR server marker missing: '+marker);
for(const marker of ["action=driver-decision","action: 'driver-decision'","decision: 'CANCEL'",'function testPulse086r5ServerNoWrite()']) check(hoyServer.includes(marker),'Hoy server marker missing: '+marker);
check(!hoyServer.includes("status: 'Cancelled'"),'Hoy cancellation must use request decision CANCEL, not status-only Cancelled');

if(failures.length){console.error('PULSE-086R5 FAIL');failures.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('PULSE-086R5 PASS');
console.log(JSON.stringify({clientSha256:sha(client),qrSha256:sha(qr),qrServerSha256:sha(qrServer),hoyServerSha256:sha(hoyServer),externalNavigation:false,payment:'Tap to Pay in car',cancelTransition:'CANCELLED'},null,2));
