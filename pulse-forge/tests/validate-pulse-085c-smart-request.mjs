import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const smart=read('pulse-autobuild/request-app/SmartRequest.gs');
const qr=read('pulse-autobuild/request-app/QrLiveRequest.html');
const future=read('pulse-autobuild/request-app/RequestForm.html');
const fare=read('pulse-autobuild/request-app/FareQuote.gs');
const task=JSON.parse(read('pulse-agent/tasks/PULSE-085C.json'));
const failures=[];const check=(ok,msg)=>{if(!ok)failures.push(msg)};

check(task.status==='STAGED_FOR_REVIEW','task not staged for review');
check(task.runtime?.qr===true,'QR runtime flag missing');
check(task.runtime?.futureForm===true,'future-form runtime flag missing');

for(const marker of [
  'function pulseSmartAddressSuggestions(input)',
  'function pulseSmartResolveAddress(input)',
  'function pulseSmartReverseGeocode(input)',
  '.setBounds(',
  "setRegion('us')",
  'writesPerformed: false'
]) check(smart.includes(marker),'smart address marker missing: '+marker);

for(const [name,html] of [['QR',qr],['Future',future]]){
  for(const marker of [
    'pulseSmartAddressSuggestions',
    'scheduleFare_',
    'calculating fare',
    'pulseGetFareQuote',
    'Includes base fare',
    'route miles',
    'drive minutes'
  ]) check(html.toLowerCase().includes(marker.toLowerCase()),name+' marker missing: '+marker);
  check(html.includes('datalist'),name+' address suggestions datalist missing');
}

check(qr.includes('pulseSmartReverseGeocode'),'QR phone-location reverse geocode did not move to Apps Script Maps');
check(!qr.includes('nominatim.openstreetmap.org'),'QR must not use public Nominatim runtime endpoint');
check(qr.includes("$('quoteBtn').classList.add('retry')"),'QR manual fare control must be failure-only retry');
check(future.includes("$('quoteBtn').classList.add('retry')"),'future manual fare control must be failure-only retry');

// Existing signed quote remains the authority; 085C changes UX, not pricing/writer security.
for(const marker of [
  'function pulseGetFareQuote(input)',
  'function pulseValidateSubmittedFareQuote_(payload, customer)',
  'quote.quoteToken = pulseFareQuoteToken_(quote)'
]) check(fare.includes(marker),'signed fare authority missing: '+marker);

if(failures.length){console.error('PULSE-085C FAIL');failures.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('PULSE-085C PASS');
