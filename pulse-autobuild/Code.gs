/**
 * Pulse OS Runtime Lite v1.4.2
 * Generated from the validated v1.4 release.
 * No Apps Script REST API, no self-modifying source, no Drive access.
 */

/* ===== Config.gs ===== */
const PULSE = Object.freeze({
  APP_NAME: 'Pulse OS Rebuild',
  VERSION: '1.4.2-runtime-lite',
  TIMEZONE: 'America/New_York',
  SPREADSHEET_ID: '1Hd46iUY84N2bvxdaIS4lf6l-uExxbXGIbUjxJzMF-No',
  SHEETS: Object.freeze({
    SETTINGS:'Settings', ZONES:'Zones', ZONE_PRIORS:'Zone Priors', EVENTS:'Events',
    FLIGHTS:'Flights', WEATHER:'Weather', PINGS:'Pings', SHIFTS:'Shifts', TRIPS:'Trips',
    PREDICTIONS:'Predictions', ALERT_LEDGER:'Alert Ledger', RAW_UBER_SIGNALS:'RAW_UBER_SIGNALS', LOG:'System Log'
  }),
  ACTIONS:Object.freeze(['GO_ONLINE','MOVE','STAY','HOLD','STOP','LOW_CONFIDENCE']),
  PING_TYPES:Object.freeze(['PING','ACCEPTED','DECLINED','NO_RIDE']),
  OUTCOMES:Object.freeze(['WORKED','DID_NOT_WORK','PARTIAL','SKIPPED','EXPIRED','NOT_GRADED']),
  DEFAULTS:Object.freeze({COST_PER_MILE:.35,MIN_NET_HOURLY:22,MOVE_ADVANTAGE_HOURLY:4,PRIOR_WEIGHT:10,MIN_PERSONAL_OBSERVATIONS:8,GUIDANCE_TTL_MINUTES:30,ACTIVE_TTL_MINUTES:20})
});

const REQUIRED_HEADERS = Object.freeze({
  'Settings':['Key','Value','Notes'],
  'Zones':['Zone ID','Zone Name','Latitude','Longitude','Radius Miles','Enabled','Notes'],
  'Zone Priors':['Zone ID','Day Type','Start Hour','End Hour','Prior Gross Per Hour','Prior Trips Per Hour','Prior Idle Minutes','Prior Weight'],
  'Events':['Event ID','Venue','Event Name','Event Date','Start Time','Expected End','Expected Attendance','Primary Zone ID','Release Window Minutes','Demand Multiplier','Status','Notes'],
  'Flights':['Flight ID','Airport','Scheduled Arrival','Estimated Arrival','Status','Passengers Estimate','Source','Updated At'],
  'Weather':['Observed At','Temperature F','Precipitation','Snowfall','Wind MPH','Weather Code','Source'],
  'Pings':['Ping ID','Logged At','Date','Time','Hour','Day','Type','Latitude','Longitude','Nearest Zone ID','Staged Zone ID','On Shift','Shift Minutes','GPS Accuracy M','Context JSON'],
  'Shifts':['Shift ID','Started At','Ended At','Online Minutes','Gross','Miles','Expenses','Net','Net Per Hour','Notes'],
  'Trips':['Trip ID','Shift ID','Started At','Ended At','Pickup Zone ID','Dropoff Zone ID','Gross','Tip','Tolls','Miles','Minutes','Platform','Notes'],
  'Predictions':['Prediction ID','Generated At','Action','Current Zone ID','Recommended Zone ID','Projected Gross Per Hour','Projected Cost Per Hour','Projected Net Per Hour','Reposition Minutes','Reposition Miles','Confidence','Valid Until','Reasons JSON','Outcome','Outcome At','Actual Net Per Hour','Notes'],
  'Alert Ledger':['Alert ID','Created At','Type','Title','Body','Sent At','Status','Error'],
  'RAW_UBER_SIGNALS':['Received At','Event ID','Event Type','Payload JSON','Dedup Key','Processed'],
  'System Log':['Logged At','Level','Function','Message','Context JSON']
});

/* ===== Data.gs ===== */
function pulseSpreadsheet_(){return SpreadsheetApp.openById(PULSE.SPREADSHEET_ID);}
function sheet_(name){const sh=pulseSpreadsheet_().getSheetByName(name);if(!sh)throw new Error('Missing required sheet: '+name);return sh;}
function now_(){return new Date();}
function tzFormat_(d,p){return Utilities.formatDate(d,PULSE.TIMEZONE,p);}
function uuid_(){return Utilities.getUuid();}
function safeJson_(v){try{return JSON.stringify(v===undefined?null:v);}catch(e){return JSON.stringify({serializationError:String(e)});}}
function appendObject_(name,headers,obj){const lock=LockService.getScriptLock();lock.waitLock(10000);try{sheet_(name).appendRow(headers.map(h=>obj[h]===undefined?'':obj[h]));}finally{lock.releaseLock();}}
function rowsAsObjects_(name){const v=sheet_(name).getDataRange().getValues();if(v.length<2)return[];const h=v[0].map(String);return v.slice(1).filter(r=>r.some(x=>x!==''&&x!==null)).map(r=>h.reduce((o,k,i)=>(o[k]=r[i],o),{}));}
function setting_(key,fallback){const r=rowsAsObjects_(PULSE.SHEETS.SETTINGS).find(x=>String(x.Key).trim()===key);return r&&r.Value!==''?r.Value:fallback;}
function numberSetting_(key,fallback){const n=Number(setting_(key,fallback));return Number.isFinite(n)?n:fallback;}
function normalizeBoolean_(v){if(v===true||v===false)return v;return['true','yes','1','y'].includes(String(v).toLowerCase());}
function clamp_(v,min,max){return Math.max(min,Math.min(max,v));}
function minutesBetween_(a,b){return Math.max(0,(new Date(b)-new Date(a))/60000);}
function round2_(n){return Math.round(Number(n||0)*100)/100;}
function haversineMiles_(lat1,lon1,lat2,lon2){const n=[lat1,lon1,lat2,lon2].map(Number);if(!n.every(Number.isFinite))return null;const r=n.map(v=>v*Math.PI/180),dLat=r[2]-r[0],dLon=r[3]-r[1];const h=Math.sin(dLat/2)**2+Math.cos(r[0])*Math.cos(r[2])*Math.sin(dLon/2)**2;return 3958.8*2*Math.asin(Math.sqrt(h));}

/* ===== Setup.gs ===== */
function setupPulseRebuild(){const ss=pulseSpreadsheet_();Object.keys(REQUIRED_HEADERS).forEach(name=>{let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);ensureHeaders_(sh,REQUIRED_HEADERS[name]);sh.setFrozenRows(1);});seedSettings_();seedZones_();seedZonePriors_();
  if (typeof setupStatewideRegions === 'function') setupStatewideRegions();return doctorPulseRebuild();}
function ensureHeaders_(sh,headers){const existing=sh.getLastColumn()?sh.getRange(1,1,1,Math.max(sh.getLastColumn(),headers.length)).getValues()[0]:[];if(!headers.every((h,i)=>String(existing[i]||'')===h)){sh.clear();sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');}}
function seedSettings_(){const sh=sheet_(PULSE.SHEETS.SETTINGS);if(sh.getLastRow()>1)return;sh.getRange(2,1,8,3).setValues([
['costPerMile',.35,'Estimated operating cost per mile'],['minNetHourly',22,'Below this, STOP may be recommended'],['moveAdvantageHourly',4,'Required advantage before MOVE'],['priorWeight',10,'Cold-start shrinkage weight'],['dailyGoal',250,'Gross daily goal'],['currentStagedZoneId','BTV_DOWNTOWN','Manual zone fallback'],['defaultRepositionMph',22,'Fallback estimate'],['weatherApiEnabled',true,'Open-Meteo public endpoint']]);}
function seedZones_(){const sh=sheet_(PULSE.SHEETS.ZONES);if(sh.getLastRow()>1)return;sh.getRange(2,1,7,7).setValues([
['BTV_AIRPORT','Burlington International Airport',44.4719,-73.1533,2,true,'Airport and hotel corridor'],['BTV_DOWNTOWN','Downtown Burlington',44.4762,-73.2129,1.6,true,'Church Street and waterfront'],['UVM','UVM / Medical Center',44.4778,-73.1965,1.5,true,'Campus and hospital'],['SOUTH_BURLINGTON','South Burlington',44.4669,-73.1709,2.5,true,'Retail and hotels'],['WINOOSKI','Winooski',44.4906,-73.1866,1.4,true,'Downtown'],['ESSEX','Essex Junction',44.4908,-73.1107,2.4,true,'Five Corners and Expo'],['WILLISTON','Williston',44.4454,-73.0999,2.8,true,'Retail and interstate']]);}
function seedZonePriors_(){const sh=sheet_(PULSE.SHEETS.ZONE_PRIORS);if(sh.getLastRow()>1)return;const rows=[];rowsAsObjects_(PULSE.SHEETS.ZONES).forEach(z=>{rows.push([z['Zone ID'],'WEEKDAY',15,19,30,1.4,18,10]);rows.push([z['Zone ID'],'WEEKDAY',19,24,34,1.6,15,10]);rows.push([z['Zone ID'],'WEEKEND',16,24,36,1.7,14,10]);});sh.getRange(2,1,rows.length,8).setValues(rows);}
function doctorPulseRebuild(){const ss=pulseSpreadsheet_(),results=[];Object.keys(REQUIRED_HEADERS).forEach(name=>{const sh=ss.getSheetByName(name);if(!sh)return results.push({check:name,status:'FAIL',detail:'Missing sheet'});const a=sh.getRange(1,1,1,REQUIRED_HEADERS[name].length).getValues()[0].map(String);const ok=REQUIRED_HEADERS[name].every((h,i)=>a[i]===h);results.push({check:name,status:ok?'PASS':'FAIL',detail:ok?'Headers valid':'Header mismatch'});});results.push({check:'Public server functions',status:[doGet,getCockpitState,logPing,logTrip,startShift,endShift,gradePrediction].every(x=>typeof x==='function')?'PASS':'FAIL',detail:'Function inventory checked'});return{app:PULSE.APP_NAME,version:PULSE.VERSION,checkedAt:new Date().toISOString(),results,overall:results.every(r=>r.status==='PASS')?'PASS':'FAIL'};}

/* ===== Signals.gs ===== */
function getSignalContext_(){return{weather:latestWeather_(),events:upcomingEvents_(180),flights:upcomingFlights_(120)};}
function latestWeather_(){const r=rowsAsObjects_(PULSE.SHEETS.WEATHER);if(!r.length)return{available:false};const x=r.sort((a,b)=>new Date(b['Observed At'])-new Date(a['Observed At']))[0];return{available:true,observedAt:x['Observed At'],temperatureF:Number(x['Temperature F'])||null,precipitation:Number(x.Precipitation)||0,snowfall:Number(x.Snowfall)||0,windMph:Number(x['Wind MPH'])||0};}
function upcomingEvents_(mins){const now=now_(),max=new Date(now.getTime()+mins*60000);return rowsAsObjects_(PULSE.SHEETS.EVENTS).map(r=>{const d=new Date(r['Event Date']);if(r['Expected End'] instanceof Date)d.setHours(r['Expected End'].getHours(),r['Expected End'].getMinutes(),0,0);return Object.assign({},r,{_end:d});}).filter(r=>r._end>=now&&r._end<=max&&String(r.Status||'ACTIVE').toUpperCase()!=='CANCELLED').map(r=>({eventId:String(r['Event ID']),venue:String(r.Venue||''),name:String(r['Event Name']||''),expectedEnd:r._end.toISOString(),zoneId:String(r['Primary Zone ID']||''),multiplier:Number(r['Demand Multiplier'])||1}));}
function upcomingFlights_(mins){const now=now_(),max=new Date(now.getTime()+mins*60000);return rowsAsObjects_(PULSE.SHEETS.FLIGHTS).map(r=>Object.assign({},r,{_arrival:new Date(r['Estimated Arrival']||r['Scheduled Arrival'])})).filter(r=>!isNaN(r._arrival)&&r._arrival>=now&&r._arrival<=max).map(r=>({flightId:String(r['Flight ID']||''),arrival:r._arrival.toISOString(),status:String(r.Status||'')}));}
function refreshWeatherNow(){if(!normalizeBoolean_(setting_('weatherApiEnabled',true)))return{ok:false,message:'Weather disabled'};const url='https://api.open-meteo.com/v1/forecast?latitude=44.4759&longitude=-73.2121&current=temperature_2m,precipitation,snowfall,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph';const res=UrlFetchApp.fetch(url,{muteHttpExceptions:true});if(res.getResponseCode()!==200)throw new Error('Open-Meteo '+res.getResponseCode());const c=(JSON.parse(res.getContentText()).current||{});appendObject_(PULSE.SHEETS.WEATHER,REQUIRED_HEADERS[PULSE.SHEETS.WEATHER],{'Observed At':c.time?new Date(c.time):now_(),'Temperature F':c.temperature_2m,'Precipitation':c.precipitation,'Snowfall':c.snowfall,'Wind MPH':c.wind_speed_10m,'Weather Code':c.weather_code,'Source':'Open-Meteo'});return{ok:true,weather:latestWeather_()};}

/* ===== Pings.gs ===== */
function logPing(e){e=e||{};const type=String(e.type||'PING').toUpperCase();if(!PULSE.PING_TYPES.includes(type))throw new Error('Invalid ping type');const t=e.iso?new Date(e.iso):now_(),lat=Number(e.lat),lng=Number(e.lng),nearest=Number.isFinite(lat)&&Number.isFinite(lng)?nearestZone_(lat,lng):null,staged=String(e.stagedZone||setting_('currentStagedZoneId',''));const row={'Ping ID':uuid_(),'Logged At':t,'Date':tzFormat_(t,'yyyy-MM-dd'),'Time':tzFormat_(t,'HH:mm:ss'),'Hour':Number(tzFormat_(t,'H')),'Day':tzFormat_(t,'EEE'),'Type':type,'Latitude':Number.isFinite(lat)?lat:'','Longitude':Number.isFinite(lng)?lng:'','Nearest Zone ID':nearest?nearest.zoneId:'','Staged Zone ID':staged,'On Shift':normalizeBoolean_(e.onShift),'Shift Minutes':Number(e.shiftMins)||0,'GPS Accuracy M':Number(e.accuracy)||'','Context JSON':safeJson_(getSignalContext_())};appendObject_(PULSE.SHEETS.PINGS,REQUIRED_HEADERS[PULSE.SHEETS.PINGS],row);return{ok:true,pingId:row['Ping ID'],type,zoneId:row['Nearest Zone ID']||staged||null,loggedAt:t.toISOString()};}
function getPingStats(){const rows=rowsAsObjects_(PULSE.SHEETS.PINGS),byType={},byZone={};rows.forEach(r=>{const t=String(r.Type||'UNKNOWN'),z=String(r['Nearest Zone ID']||r['Staged Zone ID']||'UNKNOWN');byType[t]=(byType[t]||0)+1;byZone[z]=(byZone[z]||0)+1;});return{total:rows.length,byType,byZone};}
function nearestZone_(lat,lng){let best=null;rowsAsObjects_(PULSE.SHEETS.ZONES).filter(z=>normalizeBoolean_(z.Enabled)).forEach(z=>{const d=haversineMiles_(lat,lng,z.Latitude,z.Longitude);if(d!==null&&(!best||d<best.distanceMiles))best={zoneId:String(z['Zone ID']),zoneName:String(z['Zone Name']),latitude:Number(z.Latitude),longitude:Number(z.Longitude),distanceMiles:d};});return best;}

/* ===== Trips.gs ===== */
function startShift(payload){const id=uuid_(),started=now_();appendObject_(PULSE.SHEETS.SHIFTS,REQUIRED_HEADERS[PULSE.SHEETS.SHIFTS],{'Shift ID':id,'Started At':started,'Ended At':'','Online Minutes':'','Gross':'','Miles':'','Expenses':'','Net':'','Net Per Hour':'','Notes':String((payload||{}).notes||'')});PropertiesService.getUserProperties().setProperties({activeShiftId:id,activeShiftStartedAt:started.toISOString()});return{ok:true,shiftId:id,startedAt:started.toISOString()};}
function getActiveShift(){const p=PropertiesService.getUserProperties(),id=p.getProperty('activeShiftId'),startedAt=p.getProperty('activeShiftStartedAt');return id&&startedAt?{shiftId:id,startedAt,elapsedMinutes:minutesBetween_(startedAt,now_())}:null;}
function endShift(payload){payload=payload||{};const a=getActiveShift();if(!a)throw new Error('No active shift');const ended=now_(),mins=Number(payload.onlineMinutes)||a.elapsedMinutes,gross=Number(payload.gross)||0,miles=Number(payload.miles)||0,cost=miles*numberSetting_('costPerMile',.35),net=gross-cost,nph=mins>0?net/(mins/60):0,sh=sheet_(PULSE.SHEETS.SHIFTS),v=sh.getDataRange().getValues(),col=REQUIRED_HEADERS[PULSE.SHEETS.SHIFTS].indexOf('Shift ID'),idx=v.findIndex((r,i)=>i>0&&String(r[col])===a.shiftId);if(idx<0)throw new Error('Shift row not found');sh.getRange(idx+1,1,1,10).setValues([[a.shiftId,new Date(a.startedAt),ended,mins,gross,miles,cost,net,nph,String(payload.notes||'')]]);PropertiesService.getUserProperties().deleteAllProperties();return{ok:true,shiftId:a.shiftId,net,netPerHour:nph};}
function logTrip(p){p=p||{};const started=p.startedAt?new Date(p.startedAt):now_(),ended=p.endedAt?new Date(p.endedAt):now_(),a=getActiveShift();const row={'Trip ID':uuid_(),'Shift ID':String(p.shiftId||(a&&a.shiftId)||''),'Started At':started,'Ended At':ended,'Pickup Zone ID':String(p.pickupZoneId||''),'Dropoff Zone ID':String(p.dropoffZoneId||''),'Gross':Number(p.gross)||0,'Tip':Number(p.tip)||0,'Tolls':Number(p.tolls)||0,'Miles':Number(p.miles)||0,'Minutes':Number(p.minutes)||minutesBetween_(started,ended),'Platform':String(p.platform||'Uber'),'Notes':String(p.notes||'')};appendObject_(PULSE.SHEETS.TRIPS,REQUIRED_HEADERS[PULSE.SHEETS.TRIPS],row);return{ok:true,tripId:row['Trip ID']};}

/* ===== Scoring.gs ===== */
function getCockpitState(c){c=c||{};const lat=Number(c.lat),lng=Number(c.lng),near=Number.isFinite(lat)&&Number.isFinite(lng)?nearestZone_(lat,lng):null,current=String(c.currentZoneId||(near&&near.zoneId)||setting_('currentStagedZoneId','BTV_DOWNTOWN'));return{app:PULSE.APP_NAME,version:PULSE.VERSION,generatedAt:new Date().toISOString(),activeShift:getActiveShift(),currentZone:zoneById_(current),recommendation:buildRecommendation_(current),pingStats:getPingStats(),signals:getSignalContext_(),daily:dailySummary_()};}
function buildRecommendation_(current){const zones=rowsAsObjects_(PULSE.SHEETS.ZONES).filter(z=>normalizeBoolean_(z.Enabled));if(!zones.length)return lowConfidence_('No enabled zones');const scored=zones.map(scoreZoneNetHourly_).sort((a,b)=>(b.projectedNetPerHour||-999)-(a.projectedNetPerHour||-999)),best=scored[0],cur=scored.find(x=>x.zoneId===current)||best,min=numberSetting_('minNetHourly',22),adv=numberSetting_('moveAdvantageHourly',4),count=getPingStats().total;let action=count<PULSE.DEFAULTS.MIN_PERSONAL_OBSERVATIONS&&best.confidence<.4?'LOW_CONFIDENCE':(best.projectedNetPerHour<min?'STOP':(!getActiveShift()?'GO_ONLINE':(best.zoneId===cur.zoneId?'STAY':(best.projectedNetPerHour-cur.projectedNetPerHour>=adv?'MOVE':'HOLD'))));const reposition=estimateReposition_(current,best.zoneId),ttl=action==='LOW_CONFIDENCE'?30:20,p={predictionId:uuid_(),generatedAt:new Date().toISOString(),action,currentZoneId:current,recommendedZoneId:best.zoneId,recommendedZoneName:best.zoneName,projectedGrossPerHour:action==='LOW_CONFIDENCE'?null:best.projectedGrossPerHour,projectedCostPerHour:action==='LOW_CONFIDENCE'?null:best.projectedCostPerHour,projectedNetPerHour:action==='LOW_CONFIDENCE'?null:best.projectedNetPerHour,repositionMinutes:reposition.minutes,repositionMiles:reposition.miles,confidence:best.confidence,validUntil:new Date(Date.now()+ttl*60000).toISOString(),reasons:best.reasons,mode:action==='LOW_CONFIDENCE'?'GUIDANCE':'EVIDENCE'};savePrediction_(p);return p;}
function scoreZoneNetHourly_(z){const id=String(z['Zone ID']),prior=matchingPrior_(id),obs=zoneObservations_(id),pw=Number(prior&&prior['Prior Weight'])||10,pg=Number(prior&&prior['Prior Gross Per Hour'])||30,shrunk=(pg*pw+obs.completedGrossPerHour*obs.completedCount)/Math.max(1,pw+obs.completedCount),signals=getSignalContext_();let mult=1,reasons=[];const ev=signals.events.filter(e=>e.zoneId===id);if(ev.length){mult*=Math.max(...ev.map(e=>clamp_(e.multiplier||1,1,2)));reasons.push(ev[0].name+' release window approaching');}if(id==='BTV_AIRPORT'&&signals.flights.length>=3){mult*=1.18;reasons.push(signals.flights.length+' arrivals within two hours');}if(signals.weather.available&&(signals.weather.precipitation>0||signals.weather.snowfall>0)){mult*=1.08;reasons.push('Precipitation may increase demand');}if(obs.noRideCount>obs.requestCount&&obs.totalCount>=4){mult*=.9;reasons.push('Recent no-ride observations reduce confidence');}const gross=shrunk*mult,trips=Number(prior&&prior['Prior Trips Per Hour'])||1.4,cost=(obs.avgTripMiles||8)*trips*numberSetting_('costPerMile',.35),confidence=clamp_(.22+obs.totalCount/(obs.totalCount+pw)*.65,.15,.92);if(!reasons.length)reasons.push('Baseline prior adjusted by personal observations');return{zoneId:id,zoneName:String(z['Zone Name']),projectedGrossPerHour:round2_(gross),projectedCostPerHour:round2_(cost),projectedNetPerHour:round2_(gross-cost),confidence:round2_(confidence),reasons};}
function matchingPrior_(id){const h=Number(tzFormat_(now_(),'H')),day=Number(tzFormat_(now_(),'u'))>=6?'WEEKEND':'WEEKDAY';return rowsAsObjects_(PULSE.SHEETS.ZONE_PRIORS).find(r=>String(r['Zone ID'])===id&&String(r['Day Type']).toUpperCase()===day&&h>=Number(r['Start Hour'])&&h<Number(r['End Hour']))||null;}
function zoneObservations_(id){const p=rowsAsObjects_(PULSE.SHEETS.PINGS).filter(r=>String(r['Nearest Zone ID']||r['Staged Zone ID'])===id),t=rowsAsObjects_(PULSE.SHEETS.TRIPS).filter(r=>String(r['Pickup Zone ID'])===id),rates=t.map(x=>{const m=Number(x.Minutes)||0,g=Number(x.Gross)+Number(x.Tip||0);return m>0?g/(m/60):null;}).filter(Number.isFinite);return{totalCount:p.length,requestCount:p.filter(x=>['PING','ACCEPTED','DECLINED'].includes(String(x.Type))).length,noRideCount:p.filter(x=>String(x.Type)==='NO_RIDE').length,completedCount:rates.length,completedGrossPerHour:rates.length?rates.reduce((a,b)=>a+b,0)/rates.length:0,avgTripMiles:t.length?t.reduce((s,x)=>s+Number(x.Miles||0),0)/t.length:0};}
function estimateReposition_(from,to){if(!from||!to||from===to)return{miles:0,minutes:0};const a=zoneById_(from),b=zoneById_(to);if(!a||!b)return{miles:null,minutes:null};const miles=haversineMiles_(a.latitude,a.longitude,b.latitude,b.longitude)*1.18;return{miles:round2_(miles),minutes:Math.round(miles/numberSetting_('defaultRepositionMph',22)*60)};}
function zoneById_(id){const z=rowsAsObjects_(PULSE.SHEETS.ZONES).find(x=>String(x['Zone ID'])===String(id));return z?{zoneId:String(z['Zone ID']),zoneName:String(z['Zone Name']),latitude:Number(z.Latitude),longitude:Number(z.Longitude)}:null;}
function savePrediction_(p){appendObject_(PULSE.SHEETS.PREDICTIONS,REQUIRED_HEADERS[PULSE.SHEETS.PREDICTIONS],{'Prediction ID':p.predictionId,'Generated At':new Date(p.generatedAt),'Action':p.action,'Current Zone ID':p.currentZoneId,'Recommended Zone ID':p.recommendedZoneId,'Projected Gross Per Hour':p.projectedGrossPerHour,'Projected Cost Per Hour':p.projectedCostPerHour,'Projected Net Per Hour':p.projectedNetPerHour,'Reposition Minutes':p.repositionMinutes,'Reposition Miles':p.repositionMiles,'Confidence':p.confidence,'Valid Until':new Date(p.validUntil),'Reasons JSON':safeJson_(p.reasons),'Outcome':'NOT_GRADED','Outcome At':'','Actual Net Per Hour':'','Notes':''});}
function gradePrediction(p){p=p||{};const id=String(p.predictionId||''),out=String(p.outcome||'').toUpperCase();if(!PULSE.OUTCOMES.includes(out))throw new Error('Invalid outcome');const sh=sheet_(PULSE.SHEETS.PREDICTIONS),v=sh.getDataRange().getValues(),h=v[0].map(String),row=v.findIndex((r,i)=>i>0&&String(r[h.indexOf('Prediction ID')])===id);if(row<0)throw new Error('Prediction not found');sh.getRange(row+1,h.indexOf('Outcome')+1).setValue(out);sh.getRange(row+1,h.indexOf('Outcome At')+1).setValue(now_());return{ok:true,predictionId:id,outcome:out};}
function lowConfidence_(reason){return{predictionId:uuid_(),generatedAt:new Date().toISOString(),action:'LOW_CONFIDENCE',projectedNetPerHour:null,confidence:0,validUntil:new Date(Date.now()+30*60000).toISOString(),reasons:[reason],mode:'GUIDANCE'};}
function dailySummary_(){const today=tzFormat_(now_(),'yyyy-MM-dd');return rowsAsObjects_(PULSE.SHEETS.SHIFTS).filter(s=>s['Started At']&&tzFormat_(new Date(s['Started At']),'yyyy-MM-dd')===today).reduce((o,s)=>(o.gross+=Number(s.Gross||0),o.net+=Number(s.Net||0),o.onlineMinutes+=Number(s['Online Minutes']||0),o),{gross:0,net:0,onlineMinutes:0});}

/* ===== StatewideRegions.gs ===== */
/**
 * Pulse OS Rebuild — Vermont Statewide Region Layer
 * Add this file to the separate rebuild project only.
 */

const PULSE_STATEWIDE_REGIONS = Object.freeze([
  {
    "regionId": "BURLINGTON_CHITTENDEN",
    "regionName": "Burlington / Chittenden",
    "hub": "Burlington",
    "latitude": 44.4759,
    "longitude": -73.2121,
    "radiusMiles": 18,
    "type": "Metro",
    "airport": "BTV",
    "corridors": "UVM; Waterfront; South Burlington; Winooski; Essex",
    "seedPriority": 1
  },
  {
    "regionId": "MONTPELIER_MANSFIELD",
    "regionName": "Montpelier / Mount Mansfield",
    "hub": "Montpelier",
    "latitude": 44.2601,
    "longitude": -72.5754,
    "radiusMiles": 24,
    "type": "Capital / Resort Corridor",
    "airport": "",
    "corridors": "Barre; Waterbury; Stowe; Mad River Valley",
    "seedPriority": 2
  },
  {
    "regionId": "RUTLAND_CENTRAL",
    "regionName": "Rutland / Central Vermont",
    "hub": "Rutland",
    "latitude": 43.6106,
    "longitude": -72.9726,
    "radiusMiles": 28,
    "type": "Regional Hub",
    "airport": "RUT",
    "corridors": "Killington; Pico; Castleton; Fair Haven",
    "seedPriority": 3
  },
  {
    "regionId": "BENNINGTON_GREEN_MOUNTAIN",
    "regionName": "Bennington / Green Mountain",
    "hub": "Bennington",
    "latitude": 42.8781,
    "longitude": -73.1968,
    "radiusMiles": 30,
    "type": "Regional / Tourist",
    "airport": "",
    "corridors": "Manchester; Dorset; Stratton access",
    "seedPriority": 4
  },
  {
    "regionId": "BRATTLEBORO_WINDHAM",
    "regionName": "Brattleboro / Windham",
    "hub": "Brattleboro",
    "latitude": 42.8509,
    "longitude": -72.5579,
    "radiusMiles": 24,
    "type": "Regional / Interstate",
    "airport": "",
    "corridors": "Putney; Wilmington; Mount Snow access",
    "seedPriority": 5
  },
  {
    "regionId": "UPPER_VALLEY",
    "regionName": "Upper Valley",
    "hub": "White River Junction",
    "latitude": 43.6489,
    "longitude": -72.3193,
    "radiusMiles": 25,
    "type": "Bi-state Hub",
    "airport": "LEB",
    "corridors": "Hanover; Dartmouth; Lebanon; Woodstock",
    "seedPriority": 6
  },
  {
    "regionId": "ST_ALBANS_FRANKLIN",
    "regionName": "St. Albans / Franklin",
    "hub": "St. Albans",
    "latitude": 44.8107,
    "longitude": -73.0836,
    "radiusMiles": 24,
    "type": "Regional / Border",
    "airport": "",
    "corridors": "Swanton; Georgia; Highgate",
    "seedPriority": 7
  },
  {
    "regionId": "MIDDLEBURY_ADDISON",
    "regionName": "Middlebury / Addison",
    "hub": "Middlebury",
    "latitude": 44.0153,
    "longitude": -73.1673,
    "radiusMiles": 23,
    "type": "College / Regional",
    "airport": "",
    "corridors": "Middlebury College; Vergennes; Bristol",
    "seedPriority": 8
  },
  {
    "regionId": "STOWE_LAMOILLE",
    "regionName": "Stowe / Lamoille",
    "hub": "Stowe",
    "latitude": 44.4654,
    "longitude": -72.6874,
    "radiusMiles": 22,
    "type": "Resort",
    "airport": "",
    "corridors": "Stowe Mountain; Morrisville; Smugglers access",
    "seedPriority": 9
  },
  {
    "regionId": "MAD_RIVER_WATERBURY",
    "regionName": "Waterbury / Mad River Valley",
    "hub": "Waterbury",
    "latitude": 44.3378,
    "longitude": -72.7562,
    "radiusMiles": 20,
    "type": "Resort / Interstate",
    "airport": "",
    "corridors": "Sugarbush; Mad River Glen; Waitsfield",
    "seedPriority": 10
  },
  {
    "regionId": "NEK_SOUTH",
    "regionName": "Northeast Kingdom South",
    "hub": "St. Johnsbury",
    "latitude": 44.4192,
    "longitude": -72.0151,
    "radiusMiles": 30,
    "type": "Rural / Regional",
    "airport": "",
    "corridors": "Lyndon; Burke; Danville",
    "seedPriority": 11
  },
  {
    "regionId": "NEK_NORTH",
    "regionName": "Northeast Kingdom North",
    "hub": "Newport",
    "latitude": 44.9364,
    "longitude": -72.2051,
    "radiusMiles": 32,
    "type": "Rural / Border",
    "airport": "",
    "corridors": "Jay Peak; Derby; Lake Memphremagog",
    "seedPriority": 12
  },
  {
    "regionId": "KILLINGTON_PICO",
    "regionName": "Killington / Pico",
    "hub": "Killington",
    "latitude": 43.6045,
    "longitude": -72.8201,
    "radiusMiles": 16,
    "type": "Resort",
    "airport": "",
    "corridors": "Killington Resort; Pico; Access Road",
    "seedPriority": 13
  },
  {
    "regionId": "MANCHESTER_DORSET",
    "regionName": "Manchester / Dorset",
    "hub": "Manchester Center",
    "latitude": 43.177,
    "longitude": -73.0571,
    "radiusMiles": 18,
    "type": "Tourist / Resort",
    "airport": "",
    "corridors": "Dorset; Bromley; Stratton access",
    "seedPriority": 14
  },
  {
    "regionId": "SPRINGFIELD_BELLOWS",
    "regionName": "Springfield / Bellows Falls",
    "hub": "Springfield",
    "latitude": 43.2984,
    "longitude": -72.4823,
    "radiusMiles": 22,
    "type": "Regional / Interstate",
    "airport": "",
    "corridors": "Bellows Falls; Okemo access; Claremont",
    "seedPriority": 15
  },
  {
    "regionId": "OKEMO_LUDLOW",
    "regionName": "Okemo / Ludlow",
    "hub": "Ludlow",
    "latitude": 43.3959,
    "longitude": -72.7007,
    "radiusMiles": 16,
    "type": "Resort",
    "airport": "",
    "corridors": "Okemo; Cavendish; Proctorsville",
    "seedPriority": 16
  },
  {
    "regionId": "VERGENNES_SHELBURNE",
    "regionName": "Vergennes / Shelburne",
    "hub": "Vergennes",
    "latitude": 44.1673,
    "longitude": -73.254,
    "radiusMiles": 20,
    "type": "Route 7 Corridor",
    "airport": "",
    "corridors": "Shelburne; Charlotte; Ferrisburgh",
    "seedPriority": 17
  },
  {
    "regionId": "MILTON_GEORGIA",
    "regionName": "Milton / Georgia",
    "hub": "Milton",
    "latitude": 44.6398,
    "longitude": -73.1104,
    "radiusMiles": 18,
    "type": "Commuter Corridor",
    "airport": "",
    "corridors": "Georgia; Colchester north; I-89",
    "seedPriority": 18
  }
]);

function setupStatewideRegions() {
  const ss = SpreadsheetApp.openById('1Hd46iUY84N2bvxdaIS4lf6l-uExxbXGIbUjxJzMF-No');
  const sh = ss.getSheetByName('Regions') || ss.insertSheet('Regions');
  const headers = ['Region ID','Region Name','Primary Hub','Latitude','Longitude','Radius Miles','Region Type','Airport','Resort/Event Corridors','Enabled','Seed Priority','Notes'];
  sh.clear();
  sh.getRange(1,1,1,headers.length).setValues([headers]);
  const rows = PULSE_STATEWIDE_REGIONS.map(r => [
    r.regionId, r.regionName, r.hub, r.latitude, r.longitude,
    r.radiusMiles, r.type, r.airport, r.corridors, true, r.seedPriority, ''
  ]);
  sh.getRange(2,1,rows.length,headers.length).setValues(rows);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, headers.length);
  seedStatewideRegionPriors_();
  return {ok:true, regions:rows.length, spreadsheetUrl:ss.getUrl()};
}

function getAllRegions(clientContext) {
  clientContext = clientContext || {};
  const lat = Number(clientContext.lat);
  const lng = Number(clientContext.lng);
  const currentHour = Number(Utilities.formatDate(new Date(), 'America/New_York', 'H'));
  const currentDow = Number(Utilities.formatDate(new Date(), 'America/New_York', 'u'));

  return PULSE_STATEWIDE_REGIONS.map(r => {
    const distance = Number.isFinite(lat) && Number.isFinite(lng)
      ? haversineStatewide_(lat, lng, r.latitude, r.longitude)
      : null;
    return {
      ...r,
      distanceMiles: distance == null ? null : Math.round(distance * 10) / 10,
      current: distance != null && distance <= r.radiusMiles,
      liveHour: currentHour,
      trend: buildRegionTrendSeries_(r.regionId, currentDow)
    };
  }).sort((a,b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    if (a.distanceMiles == null) return a.seedPriority - b.seedPriority;
    return a.distanceMiles - b.distanceMiles;
  });
}

function getRegionTrendState(clientContext) {
  const regions = getAllRegions(clientContext || {});
  const now = new Date();
  return {
    generatedAt: now.toISOString(),
    dayName: Utilities.formatDate(now, 'America/New_York', 'EEEE'),
    liveHour: Number(Utilities.formatDate(now, 'America/New_York', 'H')),
    regions: regions,
    disclaimer: 'Seed bars are planning priors until replaced by real Pulse observations.'
  };
}

function seedStatewideRegionPriors_() {
  const ss = SpreadsheetApp.openById('1Hd46iUY84N2bvxdaIS4lf6l-uExxbXGIbUjxJzMF-No');
  const sh = ss.getSheetByName('Region Priors') || ss.insertSheet('Region Priors');
  const headers = ['Region ID','Day Type','Start Hour','End Hour','Trend Index','Prior Gross Per Hour','Prior Trips Per Hour','Prior Idle Minutes','Prior Weight','Source Type','Notes'];
  sh.clear();
  sh.getRange(1,1,1,headers.length).setValues([headers]);
  const blocks = [
    [4,8,1],[8,12,1.3],[12,16,1.7],[16,20,2.4],[20,24,2.0],[0,4,1.1]
  ];
  const rows = [];
  PULSE_STATEWIDE_REGIONS.forEach(r => {
    ['WEEKDAY','WEEKEND'].forEach(dayType => {
      blocks.forEach(b => {
        const resortBoost = /Resort|Tourist/.test(r.type) && dayType === 'WEEKEND' ? 0.5 : 0;
        const metroBoost = r.regionId === 'BURLINGTON_CHITTENDEN' ? 0.7 : 0;
        const index = Math.min(4, b[2] + resortBoost + metroBoost);
        rows.push([r.regionId,dayType,b[0],b[1],index,'','','',10,'SEED_PRIOR','Editable planning prior; not actual Uber earnings']);
      });
    });
  });
  sh.getRange(2,1,rows.length,headers.length).setValues(rows);
  sh.setFrozenRows(1);
}

function buildRegionTrendSeries_(regionId, dow) {
  const isWeekend = dow >= 6;
  const base = [
    0.5,0.4,0.4,0.5,0.6,0.7,0.9,1.2,1.4,1.6,1.8,1.7,
    1.5,1.6,1.8,2.1,2.5,2.9,3.1,2.8,2.4,2.0,1.5,1.0
  ];
  let factor = 1;
  if (regionId === 'BURLINGTON_CHITTENDEN') factor = 1.25;
  if (['STOWE_LAMOILLE','KILLINGTON_PICO','OKEMO_LUDLOW','MANCHESTER_DORSET','MAD_RIVER_WATERBURY','NEK_NORTH'].includes(regionId)) factor = isWeekend ? 1.35 : 0.95;
  if (['NEK_SOUTH','NEK_NORTH','SPRINGFIELD_BELLOWS'].includes(regionId)) factor *= 0.8;
  return base.map((v,h) => Math.round(Math.min(4, v * factor + deterministicJitter_(regionId,h)) * 100) / 100);
}

function deterministicJitter_(key, hour) {
  let hash = 0;
  const text = key + ':' + hour;
  for (let i=0;i<text.length;i++) hash = ((hash<<5)-hash) + text.charCodeAt(i);
  return ((Math.abs(hash)%7)-3) / 20;
}

function haversineStatewide_(lat1,lon1,lat2,lon2) {
  const R = 3958.8;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

/* ===== Replay.gs ===== */
/**
 * Pulse Replay — reconstructs a shift timeline from shifts, pings, trips, and predictions.
 */
function getShiftReplay(shiftId) {
  const shifts = rowsAsObjects_(PULSE.SHEETS.SHIFTS);
  const shift = shifts.find(s => String(s['Shift ID']) === String(shiftId));
  if (!shift) throw new Error('Shift not found: ' + shiftId);

  const startedAt = new Date(shift['Started At']);
  const endedAt = shift['Ended At'] ? new Date(shift['Ended At']) : now_();
  const items = [];

  rowsAsObjects_(PULSE.SHEETS.PINGS)
    .filter(p => {
      const t = new Date(p['Logged At']);
      return t >= startedAt && t <= endedAt;
    })
    .forEach(p => items.push({
      type: 'PING',
      subtype: String(p.Type || ''),
      at: new Date(p['Logged At']).toISOString(),
      zoneId: String(p['Nearest Zone ID'] || p['Staged Zone ID'] || ''),
      label: String(p.Type || 'PING').replace('_', ' ')
    }));

  rowsAsObjects_(PULSE.SHEETS.TRIPS)
    .filter(t => String(t['Shift ID']) === String(shiftId))
    .forEach(t => {
      items.push({
        type: 'TRIP_START',
        at: new Date(t['Started At']).toISOString(),
        zoneId: String(t['Pickup Zone ID'] || ''),
        label: 'Trip started'
      });
      items.push({
        type: 'TRIP_END',
        at: new Date(t['Ended At']).toISOString(),
        zoneId: String(t['Dropoff Zone ID'] || ''),
        label: 'Trip completed',
        gross: Number(t.Gross || 0) + Number(t.Tip || 0),
        miles: Number(t.Miles || 0),
        minutes: Number(t.Minutes || 0)
      });
    });

  rowsAsObjects_(PULSE.SHEETS.PREDICTIONS)
    .filter(p => {
      const t = new Date(p['Generated At']);
      return t >= startedAt && t <= endedAt;
    })
    .forEach(p => items.push({
      type: 'PREDICTION',
      at: new Date(p['Generated At']).toISOString(),
      action: String(p.Action || ''),
      zoneId: String(p['Recommended Zone ID'] || ''),
      label: String(p.Action || '').replaceAll('_', ' '),
      projectedNetPerHour: p['Projected Net Per Hour'] === '' ? null : Number(p['Projected Net Per Hour']),
      confidence: Number(p.Confidence || 0),
      outcome: String(p.Outcome || 'NOT_GRADED')
    }));

  items.sort((a, b) => new Date(a.at) - new Date(b.at));
  return {
    shiftId: String(shiftId),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    gross: Number(shift.Gross || 0),
    net: Number(shift.Net || 0),
    netPerHour: Number(shift['Net Per Hour'] || 0),
    items: items,
    summary: buildReplaySummary_(items, shift)
  };
}

function listRecentShiftReplays(limit) {
  limit = Math.max(1, Math.min(Number(limit) || 10, 30));
  return rowsAsObjects_(PULSE.SHEETS.SHIFTS)
    .filter(s => s['Shift ID'])
    .sort((a, b) => new Date(b['Started At']) - new Date(a['Started At']))
    .slice(0, limit)
    .map(s => ({
      shiftId: String(s['Shift ID']),
      startedAt: new Date(s['Started At']).toISOString(),
      endedAt: s['Ended At'] ? new Date(s['Ended At']).toISOString() : null,
      gross: Number(s.Gross || 0),
      net: Number(s.Net || 0),
      netPerHour: Number(s['Net Per Hour'] || 0)
    }));
}

function buildReplaySummary_(items, shift) {
  const accepted = items.filter(i => i.type === 'PING' && i.subtype === 'ACCEPTED').length;
  const declined = items.filter(i => i.type === 'PING' && i.subtype === 'DECLINED').length;
  const noRide = items.filter(i => i.type === 'PING' && i.subtype === 'NO_RIDE').length;
  const trips = items.filter(i => i.type === 'TRIP_END').length;
  const predictions = items.filter(i => i.type === 'PREDICTION');
  const graded = predictions.filter(i => !['', 'NOT_GRADED', 'SKIPPED', 'EXPIRED'].includes(i.outcome));
  const worked = graded.filter(i => i.outcome === 'WORKED').length;
  return {
    accepted: accepted,
    declined: declined,
    noRide: noRide,
    completedTrips: trips,
    predictions: predictions.length,
    predictionHitRate: graded.length ? worked / graded.length : null,
    gross: Number(shift.Gross || 0),
    net: Number(shift.Net || 0),
    netPerHour: Number(shift['Net Per Hour'] || 0)
  };
}

/* ===== Embedded Index.html ===== */
const PULSE_INDEX_HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <base target=\"_top\">\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n  <meta name=\"theme-color\" content=\"#111318\">\n  <title>Pulse OS Driver</title>\n  <link rel=\"stylesheet\" href=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css\">\n  <style>\n    :root{\n      --bg:#07101c;--panel:#101d31;--panel2:#172844;--line:rgba(255,255,255,.13);\n      --text:#f7fbff;--muted:#9fb0c8;--green:#40e38d;--amber:#ffbf4b;--orange:#ff7a3d;\n      --blue:#4da3ff;--cyan:#39d9ff;--purple:#a879ff;--danger:#ff5d74;--shadow:0 18px 50px rgba(0,0,0,.45)\n    }\n    *{box-sizing:border-box}\n    html,body{margin:0;height:100%;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;overflow:hidden}\n    button{font:inherit;-webkit-tap-highlight-color:transparent}\n    #map{position:fixed;inset:0 0 176px 0;background:radial-gradient(circle at 30% 20%,rgba(77,163,255,.22),transparent 24%),linear-gradient(145deg,#0b1b34,#07101c 58%,#16132d)}\n    .leaflet-tile{filter:saturate(.8) brightness(.78) contrast(1.12) hue-rotate(4deg)}\n    .leaflet-control-attribution{font-size:8px!important;background:rgba(0,0,0,.45)!important;color:#ddd!important}\n    .leaflet-control-attribution a{color:#fff!important}\n    .top{position:fixed;z-index:500;top:calc(14px + env(safe-area-inset-top));left:18px;right:18px;display:flex;justify-content:space-between;align-items:center;pointer-events:none}\n    .round,.earnings{pointer-events:auto;border:1px solid rgba(255,255,255,.16);background:linear-gradient(180deg,rgba(17,31,53,.94),rgba(7,15,27,.9));color:#fff;box-shadow:var(--shadow);backdrop-filter:blur(18px)}\n    .round{width:56px;height:56px;border-radius:19px;display:grid;place-items:center;font-size:25px}\n    .earnings{border-radius:21px;padding:10px 20px;font-weight:900;font-size:25px;letter-spacing:-.02em}\n    .earnings .currency{color:var(--green)}\n    .right-stack{position:fixed;z-index:500;right:18px;bottom:205px;display:grid;gap:12px}\n    .tool{width:56px;height:56px;border-radius:19px;border:1px solid rgba(255,255,255,.14);color:#fff;box-shadow:var(--shadow);font-size:21px}\n    #signalsBtn{background:linear-gradient(145deg,var(--purple),#6741c2)}\n    #trendsBtn{background:linear-gradient(145deg,var(--orange),#c93d1d)}\n    #locateBtn{background:linear-gradient(145deg,var(--blue),#285cc1)}\n    .go-wrap{position:fixed;z-index:550;left:50%;bottom:139px;transform:translateX(-50%)}\n    .go{width:116px;height:116px;border-radius:50%;border:8px solid rgba(57,217,255,.42);background:radial-gradient(circle at 35% 25%,#56a8ff,#2858bd 60%,#173c91);color:#fff;box-shadow:var(--shadow),inset 0 0 0 3px rgba(255,255,255,.2),0 0 34px rgba(77,163,255,.45);font-size:34px;font-weight:950}\n    .recommend{position:fixed;z-index:520;left:18px;bottom:285px;max-width:min(390px,calc(100vw - 110px));background:linear-gradient(155deg,rgba(17,31,53,.95),rgba(8,17,29,.93));border:1px solid rgba(57,217,255,.25);border-radius:22px;padding:14px 16px;box-shadow:var(--shadow);backdrop-filter:blur(18px)}\n    .recommend .action{font-size:12px;font-weight:950;letter-spacing:.13em;color:var(--cyan)}\n    .recommend .zone{font-size:20px;font-weight:850;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n    .recommend .detail{font-size:12px;color:var(--muted);margin-top:5px}\n    .bottom{position:fixed;z-index:600;left:0;right:0;bottom:0;height:176px;background:linear-gradient(180deg,rgba(10,18,31,.98),rgba(5,10,18,.99));border-radius:27px 27px 0 0;padding:20px 18px calc(14px + env(safe-area-inset-bottom));box-shadow:0 -16px 42px rgba(0,0,0,.42);border-top:1px solid var(--line)}\n    .status-row{display:flex;align-items:center;justify-content:space-between}\n    .status{font-size:27px;font-weight:850;letter-spacing:-.02em}\n    .icon-btn{border:0;background:none;color:#ddd;font-size:27px}\n    .ping-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:15px}\n    .ping{min-height:49px;border-radius:15px;border:1px solid var(--line);color:#fff;font-size:10px;font-weight:950;letter-spacing:.03em}\n    .ping[data-type=\"PING\"]{background:linear-gradient(145deg,rgba(57,217,255,.28),rgba(31,78,123,.5));border-color:rgba(57,217,255,.45)}\n    .ping[data-type=\"ACCEPTED\"]{background:linear-gradient(145deg,rgba(64,227,141,.28),rgba(27,101,65,.5));border-color:rgba(64,227,141,.45)}\n    .ping[data-type=\"DECLINED\"]{background:linear-gradient(145deg,rgba(255,93,116,.26),rgba(116,35,58,.52));border-color:rgba(255,93,116,.45)}\n    .ping[data-type=\"NO_RIDE\"]{background:linear-gradient(145deg,rgba(255,191,75,.28),rgba(117,77,20,.52));border-color:rgba(255,191,75,.45)}\n    .sheet{position:fixed;z-index:800;inset:0;background:#111318;transform:translateY(100%);transition:transform .25s ease;overflow:auto;padding:calc(18px + env(safe-area-inset-top)) 18px calc(30px + env(safe-area-inset-bottom))}\n    .sheet.open{transform:translateY(0)}\n    .sheet-head{display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#111318;padding-bottom:12px;z-index:2}\n    .sheet h1{margin:0;font-size:28px}\n    .close{width:44px;height:44px;border-radius:50%;border:1px solid var(--line);background:#20242a;color:#fff;font-size:22px}\n    .region-card{border:1px solid var(--line);background:linear-gradient(155deg,rgba(21,33,54,.96),rgba(10,18,31,.95));border-radius:24px;margin-bottom:14px;padding:16px;box-shadow:var(--shadow)}\n    .region-title{display:flex;justify-content:space-between;gap:10px}\n    .region-card h2{margin:0;font-size:24px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n    .region-sub{color:#ccc;margin-top:4px}\n    .heat{width:50px;height:50px;border-radius:17px;display:grid;place-items:center;background:linear-gradient(145deg,#ffd46d,#ff8b3d);color:#3a2100;font-weight:950;font-size:18px}\n    .heat.current{background:linear-gradient(145deg,var(--blue),#645cff);color:white}\n    .bars{height:120px;display:flex;align-items:flex-end;gap:4px;padding:16px 2px 22px}\n    .bar{flex:1;min-width:5px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,var(--cyan),#2679c7)}\n    .bar.mid{background:linear-gradient(180deg,var(--purple),#6741c2)}\n    .bar.high{background:linear-gradient(180deg,var(--amber),var(--orange))}\n    .bar.live{box-shadow:0 0 15px rgba(255,255,255,.74);filter:brightness(1.25)}\n    .axis{display:flex;justify-content:space-between;color:#aaa;margin-top:-18px}\n    .toast{position:fixed;z-index:1000;left:50%;bottom:190px;transform:translate(-50%,16px);opacity:0;background:#f7f7f7;color:#111;border-radius:999px;padding:10px 15px;font-weight:850;transition:.18s}\n    .toast.show{opacity:1;transform:translate(-50%,0)}\n    @media(prefers-reduced-motion:reduce){.sheet,.toast{transition:none}}\n  </style>\n</head>\n<body>\n<div id=\"map\"></div>\n<div class=\"top\">\n  <button class=\"round\" id=\"homeBtn\" aria-label=\"Home\">\u2302</button>\n  <div class=\"earnings\"><span class=\"currency\">$</span><span id=\"netHourly\">\u2014</span></div>\n  <button class=\"round\" id=\"searchBtn\" aria-label=\"Regions\">\u2315</button>\n</div>\n\n<div class=\"recommend\" id=\"recommend\">\n  <div class=\"action\" id=\"action\">LOADING</div>\n  <div class=\"zone\" id=\"zone\">Reading conditions\u2026</div>\n  <div class=\"detail\" id=\"detail\">GPS is optional.</div>\n</div>\n\n<div class=\"right-stack\">\n  <button class=\"tool\" id=\"signalsBtn\" aria-label=\"Signals\">\u2726</button>\n  <button class=\"tool\" id=\"trendsBtn\" aria-label=\"Trends\">\u25a5</button>\n  <button class=\"tool\" id=\"locateBtn\" aria-label=\"Locate\">\u25ce</button>\n</div>\n\n<div class=\"go-wrap\"><button class=\"go\" id=\"goBtn\">GO</button></div>\n\n<div class=\"bottom\">\n  <div class=\"status-row\">\n    <button class=\"icon-btn\" id=\"settingsBtn\">\u2637</button>\n    <div class=\"status\" id=\"shiftStatus\">You're offline</div>\n    <button class=\"icon-btn\" id=\"logBtn\">\u2630</button>\n  </div>\n  <div class=\"ping-row\">\n    <button class=\"ping\" data-type=\"PING\">PING</button>\n    <button class=\"ping\" data-type=\"ACCEPTED\">ACCEPTED</button>\n    <button class=\"ping\" data-type=\"DECLINED\">DECLINED</button>\n    <button class=\"ping\" data-type=\"NO_RIDE\">NO RIDE</button>\n  </div>\n</div>\n\n<section class=\"sheet\" id=\"regionsSheet\">\n  <div class=\"sheet-head\"><h1>Vermont trends</h1><button class=\"close\" data-close=\"regionsSheet\">\u00d7</button></div>\n  <p style=\"color:#aaa\">Planning priors become personal evidence as Pulse records your shifts.</p>\n  <div id=\"regionList\"></div>\n</section>\n\n<div class=\"toast\" id=\"toast\"></div>\n\n<script src=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\"></script>\n<script>\nconst app={map:null,pos:null,data:null,markers:[],shiftTimer:null};\nconst $=id=>document.getElementById(id);\nfunction server(fn,...args){return new Promise((resolve,reject)=>google.script.run.withSuccessHandler(resolve).withFailureHandler(e=>reject(new Error(e&&e.message?e.message:String(e))))[fn](...args))}\nfunction toast(m){const e=$('toast');e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1500)}\nfunction locate(){return new Promise(resolve=>navigator.geolocation?navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy}),()=>resolve({}),{enableHighAccuracy:true,timeout:6000,maximumAge:30000}):resolve({}))}\nfunction initMap(){app.map=L.map('map',{zoomControl:false,attributionControl:true}).setView([44.25,-72.65],8);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'\u00a9 OpenStreetMap'}).addTo(app.map)}\nfunction clearMarkers(){app.markers.forEach(m=>app.map.removeLayer(m));app.markers=[]}\nfunction renderMap(regions){clearMarkers();regions.forEach(r=>{const score=Math.max(...r.trend);const color=r.current?'#4da3ff':score>3?'#ff7a3d':score>2?'#a879ff':'#39d9ff';const circle=L.circle([r.latitude,r.longitude],{radius:r.radiusMiles*1609.34,color,weight:2,fillColor:color,fillOpacity:r.current?.28:.13}).addTo(app.map).bindPopup(`<b>${r.regionName}</b><br>${r.distanceMiles==null?'':r.distanceMiles+' mi'}`);app.markers.push(circle)});if(app.pos&&app.pos.lat){const m=L.circleMarker([app.pos.lat,app.pos.lng],{radius:9,color:'#fff',weight:3,fillColor:'#5b8def',fillOpacity:1}).addTo(app.map);app.markers.push(m);app.map.setView([app.pos.lat,app.pos.lng],10)}}\nfunction render(data){app.data=data;const c=data.cockpit,r=c.recommendation||{};$('action').textContent=String(r.action||'LOW_CONFIDENCE').replaceAll('_',' ');$('zone').textContent=r.recommendedZoneName||'Drive your judgment';$('netHourly').textContent=r.projectedNetPerHour==null?'\u2014':Number(r.projectedNetPerHour).toFixed(2);$('detail').textContent=r.projectedNetPerHour==null?`${Math.round((r.confidence||0)*100)}% confidence \u00b7 limited evidence`:`${Math.round((r.confidence||0)*100)}% confidence \u00b7 ${r.repositionMinutes||0} min reposition`;$('shiftStatus').textContent=c.activeShift?\"You're online\":\"You're offline\";$('goBtn').textContent=c.activeShift?'STOP':'GO';renderMap(data.regionState.regions||[]);renderRegions(data.regionState)}\nfunction renderRegions(rs){$('regionList').innerHTML=(rs.regions||[]).map(r=>`<article class=\"region-card\"><div class=\"region-title\"><div><h2>${esc(r.regionName)}</h2><div class=\"region-sub\">${r.current?'Current area':(r.distanceMiles==null?r.hub:r.distanceMiles+' mi.')}</div></div><div class=\"heat ${r.current?'current':''}\">\u2303</div></div><div class=\"bars\">${r.trend.map((v,h)=>`<div class=\"bar ${v>=2.8?'high':v>=1.5?'mid':''} ${h===rs.liveHour?'live':''}\" style=\"height:${Math.max(7,v/4*100)}%\"></div>`).join('')}</div><div class=\"axis\"><span>4 AM</span><span>Live</span><span>8 PM</span><span>3 AM</span></div></article>`).join('')}\nfunction esc(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]))}\nasync function load(){try{app.pos=await locate();const data=await server('getMapCockpitState',app.pos||{});render(data)}catch(e){toast(e.message)}}\nasync function toggleShift(){try{const active=app.data&&app.data.cockpit.activeShift;if(active){const gross=prompt('Shift gross (optional)','');const miles=prompt('Shift miles (optional)','');await server('endShift',{gross:Number(gross||0),miles:Number(miles||0)});toast('Shift ended')}else{await server('startShift',{});toast('Shift started')}await load()}catch(e){toast(e.message)}}\nasync function logPing(type,btn){btn.disabled=true;try{const p=await locate();const active=app.data&&app.data.cockpit.activeShift;await server('logPing',{iso:new Date().toISOString(),type,lat:p.lat,lng:p.lng,accuracy:p.accuracy,onShift:!!active,shiftMins:active?Math.floor((Date.now()-new Date(active.startedAt))/60000):0,stagedZone:app.data&&app.data.cockpit.currentZone&&app.data.cockpit.currentZone.zoneId});toast(type.replace('_',' ')+' logged');await load()}catch(e){toast(e.message)}finally{btn.disabled=false}}\n$('goBtn').onclick=toggleShift;$('trendsBtn').onclick=$('searchBtn').onclick=()=>$('regionsSheet').classList.add('open');document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$($(b).dataset.close));\ndocument.querySelectorAll('.ping').forEach(b=>b.onclick=()=>logPing(b.dataset.type,b));$('locateBtn').onclick=load;$('homeBtn').onclick=()=>app.map&&app.map.setView([44.25,-72.65],8);\nwindow.addEventListener('error',e=>toast('UI error: '+(e.message||'unknown')));\nwindow.addEventListener('unhandledrejection',e=>toast('App error: '+((e.reason&&e.reason.message)||e.reason||'unknown')));\ntry{initMap();load();}catch(e){document.getElementById('action').textContent='APP ERROR';document.getElementById('zone').textContent=e.message||String(e);}\n</script>\n</body>\n</html>";

/* ===== Code.gs ===== */
function doGet(){return HtmlService.createHtmlOutput(PULSE_INDEX_HTML).setTitle(PULSE.APP_NAME).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');}
function refreshPulseDataNow(){const r={checkedAt:new Date().toISOString()};try{r.weather=refreshWeatherNow();}catch(e){r.weather={ok:false,error:String(e)};}return r;}
function getBootstrapState(c){return{doctor:doctorPulseRebuild(),cockpit:getCockpitState(c||{})};}

function getMapCockpitState(clientContext) {
  const cockpit = getCockpitState(clientContext || {});
  const regionState = typeof getRegionTrendState === 'function'
    ? getRegionTrendState(clientContext || {})
    : {regions: []};
  return {cockpit: cockpit, regionState: regionState};
}
