/**
 * Pulse OS Runtime Lite v1.4.2
 * Generated from the validated v1.4 release.
 * No Apps Script REST API, no self-modifying source, no Drive access.
 */

/* ===== Config.gs ===== */
const PULSE = Object.freeze({
  APP_NAME: 'Pulse OS Rebuild',
  VERSION: '1.4.4-runtime-lite',
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
function latestWeather_(){
  const r=rowsAsObjects_(PULSE.SHEETS.WEATHER);
  if(!r.length)return{available:false};
  const x=r.sort((a,b)=>new Date(b['Observed At'])-new Date(a['Observed At']))[0];
  const observed=x['Observed At'];
  const observedAt=observed
    ?(observed instanceof Date?observed.toISOString():String(observed))
    :null;
  return{
    available:true,
    observedAt:observedAt,
    temperatureF:Number(x['Temperature F'])||null,
    precipitation:Number(x.Precipitation)||0,
    snowfall:Number(x.Snowfall)||0,
    windMph:Number(x['Wind MPH'])||0
  };
}
function upcomingEvents_(mins){const now=now_(),max=new Date(now.getTime()+mins*60000);return rowsAsObjects_(PULSE.SHEETS.EVENTS).map(r=>{const d=new Date(r['Event Date']);if(r['Expected End'] instanceof Date)d.setHours(r['Expected End'].getHours(),r['Expected End'].getMinutes(),0,0);return Object.assign({},r,{_end:d});}).filter(r=>r._end>=now&&r._end<=max&&String(r.Status||'ACTIVE').toUpperCase()!=='CANCELLED').map(r=>({eventId:String(r['Event ID']),venue:String(r.Venue||''),name:String(r['Event Name']||''),expectedEnd:r._end.toISOString(),zoneId:String(r['Primary Zone ID']||''),multiplier:Number(r['Demand Multiplier'])||1}));}
function upcomingFlights_(mins){const now=now_(),max=new Date(now.getTime()+mins*60000);return rowsAsObjects_(PULSE.SHEETS.FLIGHTS).map(r=>Object.assign({},r,{_arrival:new Date(r['Estimated Arrival']||r['Scheduled Arrival'])})).filter(r=>!isNaN(r._arrival)&&r._arrival>=now&&r._arrival<=max).map(r=>({flightId:String(r['Flight ID']||''),arrival:r._arrival.toISOString(),status:String(r.Status||'')}));}
function refreshWeatherNow(){if(!normalizeBoolean_(setting_('weatherApiEnabled',true)))return{ok:false,message:'Weather disabled'};const url='https://api.open-meteo.com/v1/forecast?latitude=44.4759&longitude=-73.2121&current=temperature_2m,precipitation,snowfall,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph';const res=UrlFetchApp.fetch(url,{muteHttpExceptions:true});if(res.getResponseCode()!==200)throw new Error('Open-Meteo '+res.getResponseCode());const c=(JSON.parse(res.getContentText()).current||{});appendObject_(PULSE.SHEETS.WEATHER,REQUIRED_HEADERS[PULSE.SHEETS.WEATHER],{'Observed At':c.time?new Date(c.time):now_(),'Temperature F':c.temperature_2m,'Precipitation':c.precipitation,'Snowfall':c.snowfall,'Wind MPH':c.wind_speed_10m,'Weather Code':c.weather_code,'Source':'Open-Meteo'});return{ok:true,weather:latestWeather_()};}

/* ===== Pings.gs ===== */
function logPing(e){
  e=e||{};
  const type=String(e.type||'PING').toUpperCase();
  if(!PULSE.PING_TYPES.includes(type))throw new Error('Invalid ping type');

  const t=e.iso?new Date(e.iso):now_();
  const lat=e.lat===''||e.lat===null||e.lat===undefined?NaN:Number(e.lat);
  const lng=e.lng===''||e.lng===null||e.lng===undefined?NaN:Number(e.lng);
  const accuracy=e.accuracy===''||e.accuracy===null||e.accuracy===undefined?NaN:Number(e.accuracy);
  const nearest=Number.isFinite(lat)&&Number.isFinite(lng)?nearestZone_(lat,lng):null;
  const staged=String(e.stagedZone||setting_('currentStagedZoneId',''));
  const clientEventId=String(e.clientEventId||'').trim();
  const gpsStatus=String(e.gpsStatus||(Number.isFinite(lat)&&Number.isFinite(lng)?'legacy':'unavailable')).toLowerCase();
  const gpsAgeValue=e.gpsAgeMs===''||e.gpsAgeMs===null||e.gpsAgeMs===undefined?NaN:Number(e.gpsAgeMs);
  const gpsAgeMs=Number.isFinite(gpsAgeValue)?Math.max(0,gpsAgeValue):null;
  const captureSource=String(e.captureSource||'unknown');

  const context=Object.assign({},getSignalContext_(),{
    _event:{
      clientEventId:clientEventId||null,
      gpsStatus:gpsStatus,
      gpsAgeMs:gpsAgeMs,
      captureSource:captureSource
    }
  });
  const row={
    'Ping ID':uuid_(),
    'Logged At':t,
    'Date':tzFormat_(t,'yyyy-MM-dd'),
    'Time':tzFormat_(t,'HH:mm:ss'),
    'Hour':Number(tzFormat_(t,'H')),
    'Day':tzFormat_(t,'EEE'),
    'Type':type,
    'Latitude':Number.isFinite(lat)?lat:'',
    'Longitude':Number.isFinite(lng)?lng:'',
    'Nearest Zone ID':nearest?nearest.zoneId:'',
    'Staged Zone ID':staged,
    'On Shift':normalizeBoolean_(e.onShift),
    'Shift Minutes':Number(e.shiftMins)||0,
    'GPS Accuracy M':Number.isFinite(accuracy)?accuracy:'',
    'Context JSON':safeJson_(context)
  };

  const cache=CacheService.getScriptCache();
  const eventKey=clientEventId?'pulse-event:'+clientEventId:'';
  const rapidKey='pulse-rapid:'+type+':'+String(normalizeBoolean_(e.onShift))+':'+staged;
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try{
    if(eventKey&&cache.get(eventKey)){
      return{ok:true,duplicate:true,reason:'client_event_id',clientEventId:clientEventId,type:type};
    }
    const lastMs=Number(cache.get(rapidKey)||0);
    if(lastMs&&Math.abs(t.getTime()-lastMs)<1600){
      return{ok:true,duplicate:true,reason:'rapid_duplicate',clientEventId:clientEventId||null,type:type};
    }
    sheet_(PULSE.SHEETS.PINGS).appendRow(REQUIRED_HEADERS[PULSE.SHEETS.PINGS].map(h=>row[h]===undefined?'':row[h]));
    if(eventKey)cache.put(eventKey,'1',21600);
    cache.put(rapidKey,String(t.getTime()),10);
  }finally{
    lock.releaseLock();
  }
  return{
    ok:true,
    duplicate:false,
    pingId:row['Ping ID'],
    clientEventId:clientEventId||null,
    type:type,
    zoneId:row['Nearest Zone ID']||staged||null,
    gpsStatus:gpsStatus,
    loggedAt:t.toISOString()
  };
}
function getPingStats(){const rows=rowsAsObjects_(PULSE.SHEETS.PINGS),byType={},byZone={};rows.forEach(r=>{const t=String(r.Type||'UNKNOWN'),z=String(r['Nearest Zone ID']||r['Staged Zone ID']||'UNKNOWN');byType[t]=(byType[t]||0)+1;byZone[z]=(byZone[z]||0)+1;});return{total:rows.length,byType,byZone};}
function nearestZone_(lat,lng){let best=null;rowsAsObjects_(PULSE.SHEETS.ZONES).filter(z=>normalizeBoolean_(z.Enabled)).forEach(z=>{const d=haversineMiles_(lat,lng,z.Latitude,z.Longitude);if(d!==null&&(!best||d<best.distanceMiles))best={zoneId:String(z['Zone ID']),zoneName:String(z['Zone Name']),latitude:Number(z.Latitude),longitude:Number(z.Longitude),distanceMiles:d};});return best;}

/* ===== Trips.gs ===== */
function startShift(payload){const id=uuid_(),started=now_();appendObject_(PULSE.SHEETS.SHIFTS,REQUIRED_HEADERS[PULSE.SHEETS.SHIFTS],{'Shift ID':id,'Started At':started,'Ended At':'','Online Minutes':'','Gross':'','Miles':'','Expenses':'','Net':'','Net Per Hour':'','Notes':String((payload||{}).notes||'')});PropertiesService.getUserProperties().setProperties({activeShiftId:id,activeShiftStartedAt:started.toISOString()});return{ok:true,shiftId:id,startedAt:started.toISOString()};}
function getActiveShift(){const p=PropertiesService.getUserProperties(),id=p.getProperty('activeShiftId'),startedAt=p.getProperty('activeShiftStartedAt');return id&&startedAt?{shiftId:id,startedAt,elapsedMinutes:minutesBetween_(startedAt,now_())}:null;}
function endShift(payload){payload=payload||{};const a=getActiveShift();if(!a)throw new Error('No active shift');const ended=now_(),mins=Number(payload.onlineMinutes)||a.elapsedMinutes,gross=Number(payload.gross)||0,miles=Number(payload.miles)||0,cost=miles*numberSetting_('costPerMile',.35),net=gross-cost,nph=mins>0?net/(mins/60):0,sh=sheet_(PULSE.SHEETS.SHIFTS),v=sh.getDataRange().getValues(),col=REQUIRED_HEADERS[PULSE.SHEETS.SHIFTS].indexOf('Shift ID'),idx=v.findIndex((r,i)=>i>0&&String(r[col])===a.shiftId);if(idx<0)throw new Error('Shift row not found');sh.getRange(idx+1,1,1,10).setValues([[a.shiftId,new Date(a.startedAt),ended,mins,gross,miles,cost,net,nph,String(payload.notes||'')]]);const props=PropertiesService.getUserProperties();props.deleteProperty('activeShiftId');props.deleteProperty('activeShiftStartedAt');return{ok:true,shiftId:a.shiftId,net,netPerHour:nph,tripState:tripStateSnapshot_()};}
const PULSE_TRIP_STATES=Object.freeze(['OFFER_RECEIVED','ACCEPTED','QUEUED_ACCEPTED','EN_ROUTE_PICKUP','PICKED_UP','ON_TRIP','DROPPED_OFF','COMPLETED','CANCELLED','NEEDS_RECONCILIATION']);
function tripProps_(){return PropertiesService.getUserProperties();}
function readTripState_(key){try{return JSON.parse(tripProps_().getProperty(key)||'null')}catch(e){return null}}
function writeTripState_(key,value){if(value)tripProps_().setProperty(key,JSON.stringify(value));else tripProps_().deleteProperty(key);return value;}
function activeTripState_(){return readTripState_('pulseActiveTrip');}
function queuedTripState_(){return readTripState_('pulseQueuedTrip');}
function tripStateSnapshot_(){return{active:activeTripState_(),queued:queuedTripState_()};}
function auditTrip_(state,action,p){const observed=p.observedAt?new Date(p.observedAt):now_();const effective=p.effectiveAt?new Date(p.effectiveAt):observed;state.history=Array.isArray(state.history)?state.history:[];state.history.push({action:action,observedAt:observed.toISOString(),effectiveAt:effective.toISOString(),source:String(p.source||'driver'),clientEventId:String(p.clientEventId||''),gpsStatus:String(p.gpsStatus||'unavailable'),gpsAgeMs:p.gpsAgeMs==null?null:Number(p.gpsAgeMs),accuracy:p.accuracy==null?null:Number(p.accuracy),lat:p.lat==null?null:Number(p.lat),lng:p.lng==null?null:Number(p.lng)});state.state=action;state.observedAt=observed.toISOString();state.effectiveAt=effective.toISOString();return state;}
function newTripState_(p,action){const shift=getActiveShift();return auditTrip_({reconciliationId:String(p.reconciliationId||uuid_()),tripId:String(p.tripId||uuid_()),shiftId:String(p.shiftId||(shift&&shift.shiftId)||''),reservation:normalizeBoolean_(p.reservation),platform:String(p.platform||'Uber'),pickupZoneId:String(p.pickupZoneId||''),dropoffZoneId:String(p.dropoffZoneId||''),startedAt:String(p.startedAt||p.effectiveAt||p.observedAt||now_().toISOString()),gross:Number(p.gross)||0,tip:Number(p.tip)||0,tolls:Number(p.tolls)||0,miles:Number(p.miles)||0,notes:String(p.notes||''),history:[]},action,p);}
function promoteQueuedTrip_(){const queued=queuedTripState_();if(!queued)return null;queued.state='ACCEPTED';queued.promotedAt=now_().toISOString();writeTripState_('pulseQueuedTrip',null);writeTripState_('pulseActiveTrip',queued);return queued;}
function completeTripState_(state,p){const ended=p.effectiveAt?new Date(p.effectiveAt):now_();const started=new Date(state.startedAt||ended);const minutes=Number(p.minutes)||minutesBetween_(started,ended);const miles=Number(p.miles!=null?p.miles:state.miles)||0;if(minutes<1&&miles<=0&&!state.reservation)return{ok:false,needsReconciliation:true,reason:'zero_distance_artifact_blocked',state:auditTrip_(state,'NEEDS_RECONCILIATION',p)};const row={'Trip ID':String(state.tripId||uuid_()),'Shift ID':String(state.shiftId||''),'Started At':started,'Ended At':ended,'Pickup Zone ID':String(p.pickupZoneId||state.pickupZoneId||''),'Dropoff Zone ID':String(p.dropoffZoneId||state.dropoffZoneId||''),'Gross':Number(p.gross!=null?p.gross:state.gross)||0,'Tip':Number(p.tip!=null?p.tip:state.tip)||0,'Tolls':Number(p.tolls!=null?p.tolls:state.tolls)||0,'Miles':miles,'Minutes':minutes,'Platform':String(p.platform||state.platform||'Uber'),'Notes':safeJson_({reservation:!!state.reservation,reconciliationId:state.reconciliationId,observedAt:p.observedAt||null,effectiveAt:p.effectiveAt||null,history:state.history,notes:String(p.notes||state.notes||'')})};appendObject_(PULSE.SHEETS.TRIPS,REQUIRED_HEADERS[PULSE.SHEETS.TRIPS],row);return{ok:true,tripId:row['Trip ID']};}
function tripEventLedger_(){try{const value=JSON.parse(tripProps_().getProperty('pulseTripEventLedger')||'[]');return Array.isArray(value)?value:[]}catch(e){return[]}}
function tripEventSeen_(clientEventId){const id=String(clientEventId||'').trim();return!!id&&tripEventLedger_().indexOf(id)>=0;}
function rememberTripEvent_(clientEventId){const id=String(clientEventId||'').trim();if(!id)return;const ledger=tripEventLedger_().filter(function(x){return x!==id;});ledger.push(id);tripProps_().setProperty('pulseTripEventLedger',JSON.stringify(ledger.slice(-100)));}
function transitionTrip(p){
  p=p||{};
  const action=String(p.action||'').toUpperCase();
  if(!PULSE_TRIP_STATES.includes(action))throw new Error('Invalid trip action');
  const clientEventId=String(p.clientEventId||'').trim();
  const target=String(p.target||'active').toLowerCase();
  const lock=LockService.getUserLock();
  lock.waitLock(10000);
  try{
    if(tripEventSeen_(clientEventId))return{ok:true,duplicate:true,reason:'client_event_id',clientEventId:clientEventId,state:tripStateSnapshot_()};
    const finish=function(result){if(result&&result.ok&&!result.duplicate)rememberTripEvent_(clientEventId);return result;};
    let active=activeTripState_(),queued=queuedTripState_();
    if(action==='OFFER_RECEIVED')return finish({ok:true,state:tripStateSnapshot_()});
    if(action==='ACCEPTED'){
      if(active){
        if(queued)return{ok:true,duplicate:true,reason:'queue_occupied',state:tripStateSnapshot_()};
        queued=newTripState_(p,'QUEUED_ACCEPTED');
        writeTripState_('pulseQueuedTrip',queued);
        return finish({ok:true,queued:true,state:tripStateSnapshot_()});
      }
      active=newTripState_(p,'ACCEPTED');
      writeTripState_('pulseActiveTrip',active);
      return finish({ok:true,queued:false,state:tripStateSnapshot_()});
    }
    if(action==='CANCELLED'){
      if(target==='queued'){
        if(!queued)return finish({ok:false,needsReconciliation:true,reason:'no_queued_trip',state:tripStateSnapshot_()});
        auditTrip_(queued,'CANCELLED',p);
        writeTripState_('pulseQueuedTrip',null);
        return finish({ok:true,cancelledTarget:'queued',state:tripStateSnapshot_()});
      }
      if(!active)return finish({ok:false,needsReconciliation:true,reason:'no_active_trip',state:tripStateSnapshot_()});
      auditTrip_(active,'CANCELLED',p);
      writeTripState_('pulseActiveTrip',null);
      const promotedAfterCancel=promoteQueuedTrip_();
      return finish({ok:true,cancelledTarget:'active',promoted:!!promotedAfterCancel,state:tripStateSnapshot_()});
    }
    if(!active){
      if(normalizeBoolean_(p.reservation)){
        active=newTripState_(p,'ACCEPTED');
        writeTripState_('pulseActiveTrip',active);
      }else return finish({ok:false,needsReconciliation:true,reason:'no_active_trip',state:tripStateSnapshot_()});
    }
    auditTrip_(active,action,p);
    if(action==='PICKED_UP'||action==='ON_TRIP'){
      if(p.pickupZoneId)active.pickupZoneId=String(p.pickupZoneId);
      if(p.effectiveAt)active.startedAt=String(p.effectiveAt);
      if(Number.isFinite(Number(p.miles)))active.miles=Math.max(Number(active.miles)||0,Number(p.miles));
      writeTripState_('pulseActiveTrip',active);
      return finish({ok:true,state:tripStateSnapshot_()});
    }
    if(action==='DROPPED_OFF'||action==='COMPLETED'){
      const result=completeTripState_(active,p);
      if(!result.ok){writeTripState_('pulseActiveTrip',result.state);return finish(result);}
      writeTripState_('pulseActiveTrip',null);
      const promoted=promoteQueuedTrip_();
      return finish({ok:true,completed:true,tripId:result.tripId,promoted:!!promoted,state:tripStateSnapshot_()});
    }
    writeTripState_('pulseActiveTrip',active);
    return finish({ok:true,state:tripStateSnapshot_()});
  }finally{lock.releaseLock();}
}
function logTrip(p){p=p||{};if(p.action)return transitionTrip(p);const started=p.startedAt?new Date(p.startedAt):now_(),ended=p.endedAt?new Date(p.endedAt):now_(),a=getActiveShift();const row={'Trip ID':uuid_(),'Shift ID':String(p.shiftId||(a&&a.shiftId)||''),'Started At':started,'Ended At':ended,'Pickup Zone ID':String(p.pickupZoneId||''),'Dropoff Zone ID':String(p.dropoffZoneId||''),'Gross':Number(p.gross)||0,'Tip':Number(p.tip)||0,'Tolls':Number(p.tolls)||0,'Miles':Number(p.miles)||0,'Minutes':Number(p.minutes)||minutesBetween_(started,ended),'Platform':String(p.platform||'Uber'),'Notes':String(p.notes||'')};appendObject_(PULSE.SHEETS.TRIPS,REQUIRED_HEADERS[PULSE.SHEETS.TRIPS],row);return{ok:true,tripId:row['Trip ID']};}

/* ===== Scoring.gs ===== */
function getCockpitState(c){
  c=c||{};
  const lat=Number(c.lat),lng=Number(c.lng);
  const near=Number.isFinite(lat)&&Number.isFinite(lng)?nearestZone_(lat,lng):null;
  const current=String(c.currentZoneId||(near&&near.zoneId)||setting_('currentStagedZoneId','BTV_DOWNTOWN'));
  const checkedAt=new Date().toISOString();
  const currentZone=zoneById_(current);
  const recommendation=buildRecommendation_(current);
  const signals=getSignalContext_();
  const pings=getPingStats();
  const shift=getActiveShift();
  const dataHealth=buildCockpitDataHealth_(signals,pings,checkedAt);
  const plan=buildCockpitPlan_(recommendation,signals,checkedAt);
  const warnings=buildCockpitWarnings_(dataHealth,recommendation);
  return{
    app:PULSE.APP_NAME,
    version:PULSE.VERSION,
    checkedAt:checkedAt,
    generatedAt:checkedAt,
    recommendation:recommendation,
    currentZone:currentZone,
    dataHealth:dataHealth,
    weather:signals.weather,
    events:signals.events,
    flights:signals.flights,
    plan:plan,
    pings:pings,
    shift:shift,
    warnings:warnings,
    activeShift:shift,
    pingStats:pings,
    signals:signals,
    daily:dailySummary_()
  };
}
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
function cockpitLatestDate_(sheetName,fields){
  let latest=null;
  rowsAsObjects_(sheetName).forEach(function(row){
    fields.forEach(function(field){
      const value=row[field];
      if(value===''||value===null||value===undefined)return;
      const date=value instanceof Date?value:new Date(value);
      if(!isNaN(date.getTime())&&(!latest||date>latest))latest=date;
    });
  });
  return latest;
}
function cockpitSourceState_(name,available,observedAt,staleMinutes,detail){
  let status=available?'available':'unavailable',iso=null,ageMinutes=null;
  if(observedAt){
    const date=observedAt instanceof Date?observedAt:new Date(observedAt);
    if(!isNaN(date.getTime())){
      iso=date.toISOString();
      ageMinutes=Math.max(0,Math.round(((Date.now()-date.getTime())/60000)*10)/10);
      status=ageMinutes>staleMinutes?'stale':'fresh';
      available=true;
    }
  }
  return{source:name,available:!!available,status:status,observedAt:iso,ageMinutes:ageMinutes,detail:String(detail||'')};
}
function buildCockpitDataHealth_(signals,pings,checkedAt){
  signals=signals||{weather:{available:false},events:[],flights:[]};
  pings=pings||{total:0};
  const eventRows=rowsAsObjects_(PULSE.SHEETS.EVENTS);
  const flightRows=rowsAsObjects_(PULSE.SHEETS.FLIGHTS);
  const pingRows=rowsAsObjects_(PULSE.SHEETS.PINGS);
  const weather=cockpitSourceState_('weather',!!(signals.weather&&signals.weather.available),signals.weather&&signals.weather.observedAt,90,signals.weather&&signals.weather.available?'Weather observation loaded':'No weather observation');
  const events={source:'events',available:eventRows.length>0,status:(signals.events||[]).length?'active':eventRows.length?'empty':'unavailable',observedAt:null,ageMinutes:null,detail:(signals.events||[]).length+' upcoming of '+eventRows.length+' stored'};
  const flights=cockpitSourceState_('flights',flightRows.length>0,cockpitLatestDate_(PULSE.SHEETS.FLIGHTS,['Updated At','Estimated Arrival','Scheduled Arrival']),180,(signals.flights||[]).length+' arrivals in active window');
  if(flightRows.length&&!signals.flights.length&&flights.status==='fresh')flights.status='empty';
  const pingState=cockpitSourceState_('pings',pingRows.length>0,cockpitLatestDate_(PULSE.SHEETS.PINGS,['Logged At']),360,Number(pings.total||0)+' driver observations');
  if(!pingRows.length)pingState.status='empty';
  const sources={weather:weather,events:events,flights:flights,pings:pingState};
  const states=Object.keys(sources).map(function(key){return sources[key].status;});
  const overall=states.some(function(s){return s==='unavailable'||s==='stale';})?'degraded':states.some(function(s){return s==='empty';})?'partial':'healthy';
  return{overall:overall,checkedAt:checkedAt,sources:sources};
}
function buildCockpitPlan_(recommendation,signals,checkedAt){
  const plan=[{kind:'DRIVER_ACTION',startsAt:checkedAt,endsAt:recommendation.validUntil||null,action:recommendation.action||'LOW_CONFIDENCE',zoneId:recommendation.recommendedZoneId||null,zoneName:recommendation.recommendedZoneName||null,confidence:Number(recommendation.confidence||0),reason:(recommendation.reasons||[]).join(' · ')}];
  (signals.events||[]).slice(0,3).forEach(function(event){plan.push({kind:'EVENT_RELEASE',startsAt:null,endsAt:event.expectedEnd||null,action:'WATCH',zoneId:event.zoneId||null,zoneName:event.venue||null,confidence:null,reason:event.name||'Upcoming event'});});
  (signals.flights||[]).slice(0,3).forEach(function(flight){plan.push({kind:'AIRPORT_ARRIVAL',startsAt:flight.arrival||null,endsAt:null,action:'WATCH',zoneId:'BTV_AIRPORT',zoneName:'BTV Airport',confidence:null,reason:String(flight.flightId||'Flight')+' · '+String(flight.status||'scheduled')});});
  return plan;
}
function buildCockpitWarnings_(dataHealth,recommendation){
  const warnings=[];
  Object.keys(dataHealth.sources||{}).forEach(function(key){const source=dataHealth.sources[key];if(source.status==='unavailable'||source.status==='stale')warnings.push({code:key.toUpperCase()+'_'+source.status.toUpperCase(),source:key,severity:source.status==='unavailable'?'warning':'info',message:source.detail||key+' '+source.status});});
  if(!recommendation||recommendation.action==='LOW_CONFIDENCE')warnings.push({code:'LOW_CONFIDENCE',source:'recommendation',severity:'info',message:'Use driver judgment while Pulse gathers more evidence.'});
  return warnings;
}

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
function doGet(){return HtmlService.createHtmlOutput(PULSE_INDEX_HTML_V144).setTitle('Pulse OS Driver').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');}
function refreshPulseDataNow(){const r={checkedAt:new Date().toISOString()};try{r.weather=refreshWeatherNow();}catch(e){r.weather={ok:false,error:String(e)};}return r;}
function getBootstrapState(c){return{doctor:doctorPulseRebuild(),cockpit:getCockpitState(c||{})};}

function getMapCockpitState(clientContext) {
  const cockpit = getCockpitState(clientContext || {});
  const regionState = typeof getRegionTrendState === 'function'
    ? getRegionTrendState(clientContext || {})
    : {regions: []};
  return {cockpit: cockpit, regionState: regionState};
}


/**
 * Pulse OS Runtime Lite v1.4.3 mobile UI patch.
 * Appended by the GitHub autobuild. No Apps Script API or Drive access.
 */
const PULSE_INDEX_HTML_V144 = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <base target=\"_top\">\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n  <meta name=\"theme-color\" content=\"#07101c\">\n  <title>Pulse OS Driver</title>\n  <link rel=\"stylesheet\" href=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css\">\n  <style>\n    :root{\n      --bg:#07101c;--panel:#0d1a2d;--panel2:#142640;--line:rgba(255,255,255,.14);\n      --text:#f7fbff;--muted:#a8b8cd;--green:#45e394;--amber:#ffc85a;--orange:#ff7b43;\n      --blue:#4fa5ff;--cyan:#42dcff;--purple:#a77bff;--danger:#ff6680;\n      --dock:clamp(326px,40dvh,344px);--shadow:0 16px 44px rgba(0,0,0,.42)\n    }\n    *{box-sizing:border-box}\n    html,body{margin:0;width:100%;height:100%;min-height:100%;background:var(--bg);color:var(--text);\n      font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;overflow:hidden}\n    button,input{font:inherit}\n    button{cursor:pointer;-webkit-tap-highlight-color:transparent}\n    button:disabled{opacity:.55;cursor:wait}\n    #app{position:fixed;inset:0;height:100dvh;min-height:100svh;overflow:hidden;background:var(--bg)}\n    #map{position:absolute;inset:0 0 var(--dock) 0;background:#0c1a2d}\n    .leaflet-container{font:inherit;background:#0c1a2d}\n    .leaflet-tile{filter:saturate(.8) brightness(.8) contrast(1.08)}\n    .leaflet-control-attribution{font-size:8px!important;background:rgba(0,0,0,.48)!important;color:#ddd!important}\n    .leaflet-control-attribution a{color:#fff!important}\n    .topbar{position:absolute;z-index:550;top:calc(10px + env(safe-area-inset-top));left:10px;right:10px;\n      display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;pointer-events:none}\n    .glass{background:linear-gradient(180deg,rgba(16,31,53,.95),rgba(7,15,27,.92));\n      border:1px solid var(--line);box-shadow:var(--shadow);backdrop-filter:blur(16px)}\n    .icon{pointer-events:auto;width:46px;height:46px;border-radius:15px;border:1px solid var(--line);\n      background:rgba(8,17,30,.94);color:#fff;font-size:21px}\n    .metric{justify-self:center;min-width:132px;padding:8px 14px;border-radius:17px;text-align:center;line-height:1.1}\n    .metric strong{font-size:21px}.metric small{display:block;color:var(--muted);font-size:10px;margin-top:3px}\n    .metric .money{color:var(--green)}\n    .recommend{position:absolute;z-index:540;left:10px;right:72px;bottom:calc(var(--dock) + 12px);\n      border-radius:20px;padding:13px 14px;max-width:430px}\n    .eyebrow{font-size:11px;font-weight:900;letter-spacing:.12em;color:var(--cyan)}\n    .recommend h2{font-size:19px;margin:3px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n    .recommend p{margin:5px 0 0;color:var(--muted);font-size:12px}\n    .map-tools{position:absolute;z-index:545;right:10px;bottom:calc(var(--dock) + 12px);display:grid;gap:8px}\n    .tool{width:58px;height:50px;border-radius:16px;border:1px solid var(--line);color:#fff;font-size:10px;font-weight:950;letter-spacing:.05em;box-shadow:var(--shadow)}\n    #signalsBtn{background:linear-gradient(145deg,var(--purple),#6440c1)}\n    #trendsBtn{background:linear-gradient(145deg,var(--orange),#c84325)}\n    #locateBtn{background:linear-gradient(145deg,var(--blue),#285dc4)}\n    .dock{position:absolute;z-index:600;left:0;right:0;bottom:0;height:var(--dock);overflow:hidden;\n      padding:8px 10px calc(10px + env(safe-area-inset-bottom));\n      background:linear-gradient(180deg,rgba(10,19,33,.98),rgba(5,10,18,.995));\n      border-radius:25px 25px 0 0;border-top:1px solid var(--line);box-shadow:0 -14px 40px rgba(0,0,0,.38)}\n    .shift-row{display:grid;grid-template-columns:46px 1fr 46px;gap:8px;align-items:center}\n    .status{text-align:center}.status strong{display:block;font-size:20px}.status small{color:var(--muted);font-size:11px}\n    .go{height:48px;border-radius:15px;border:1px solid rgba(77,163,255,.55);\n      background:linear-gradient(145deg,#398ef0,#1f4fae);color:white;font-size:18px;font-weight:900;\n      margin-top:7px;width:100%;box-shadow:0 10px 28px rgba(38,105,220,.28)}\n    .go.online{background:linear-gradient(145deg,#e24f69,#8b233d);border-color:rgba(255,102,128,.6)}\n    .ping-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:6px}\n    .ping{height:42px;min-width:0;padding:0 4px;border-radius:12px;border:1px solid var(--line);color:#fff;font-size:9px;font-weight:900;line-height:1.05}\n    .ping[data-type=\"PING\"]{background:rgba(57,217,255,.20);border-color:rgba(57,217,255,.42)}\n    .ping[data-type=\"ACCEPTED\"]{background:rgba(64,227,141,.20);border-color:rgba(64,227,141,.42)}\n    .ping[data-type=\"DECLINED\"]{background:rgba(255,93,116,.20);border-color:rgba(255,93,116,.42)}\n    .ping[data-type=\"NO_RIDE\"]{background:rgba(255,191,75,.22);border-color:rgba(255,191,75,.45)}\n    .sheet{position:fixed;z-index:900;inset:0;background:#0b1320;transform:translateY(102%);\n      transition:transform .22s ease;overflow:auto;padding:calc(14px + env(safe-area-inset-top)) 14px calc(28px + env(safe-area-inset-bottom))}\n    .sheet.open{transform:translateY(0)}\n    .sheet-head{display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:2;\n      background:#0b1320;padding:0 0 12px}\n    .sheet h1{font-size:26px;margin:0}.close{width:44px;height:44px;border-radius:50%;border:1px solid var(--line);background:#1a2636;color:white;font-size:22px}\n    .cards{display:grid;gap:10px}\n    .card{border:1px solid var(--line);background:linear-gradient(155deg,#14243b,#0d1828);border-radius:19px;padding:14px}\n    .card h3{margin:0 0 5px;font-size:17px}.card p{margin:4px 0;color:var(--muted);font-size:13px}\n    .value{font-size:27px;font-weight:900}.muted{color:var(--muted)}\n    .region{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}\n    .region-name{font-size:17px;font-weight:800}.region-meta{color:var(--muted);font-size:12px;margin-top:3px}\n    .spark{display:flex;align-items:flex-end;gap:2px;height:34px;width:90px}\n    .spark i{display:block;flex:1;min-width:2px;border-radius:2px 2px 0 0;background:var(--blue)}\n    .form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.field label{display:block;color:var(--muted);font-size:12px;margin-bottom:5px}\n    .field input{width:100%;height:44px;border-radius:12px;border:1px solid var(--line);background:#0a1422;color:white;padding:0 11px}\n    .primary{width:100%;height:46px;border:0;border-radius:13px;background:linear-gradient(145deg,var(--blue),#275cc5);color:#fff;font-weight:900;margin-top:12px}\n    .secondary{width:100%;height:44px;border:1px solid var(--line);border-radius:13px;background:#162338;color:#fff;font-weight:800;margin-top:8px}\n    .toast{position:fixed;z-index:1100;left:50%;bottom:calc(var(--dock) + 12px);transform:translate(-50%,15px);\n      opacity:0;pointer-events:none;background:#f8fbff;color:#101722;border-radius:999px;padding:10px 15px;font-weight:850;\n      transition:.18s;max-width:90%;text-align:center}\n    .toast.show{opacity:1;transform:translate(-50%,0)}\n    .loading-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--amber);margin-right:6px}\n\n    .friend-form{display:grid;gap:12px}\n.friend-form label{display:grid;gap:6px;color:var(--muted);font-size:12px;font-weight:800}\n.friend-form input,.friend-form textarea{width:100%;border:1px solid var(--line);border-radius:13px;background:#0a1422;color:#fff;padding:11px}\n.friend-form input{height:46px}.friend-form textarea{min-height:88px;resize:vertical}\n.friend-consent{grid-template-columns:auto 1fr!important;align-items:start;color:var(--text)!important;font-weight:700!important}\n.friend-consent input{width:20px!important;height:20px!important;margin:0}\n.friend-status{margin-top:10px;padding:11px;border:1px solid var(--line);border-radius:13px;background:#091525;color:var(--muted);font-size:12px;line-height:1.45}\n.friend-link{word-break:break-all;color:var(--cyan);font-size:11px}\n.friend-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:10px}\n.friend-action{min-height:40px;border:1px solid var(--line);border-radius:12px;background:#162338;color:#fff;font-size:10px;font-weight:900}\n.friend-action[data-status=\"CONFIRMED\"]{border-color:rgba(69,227,148,.5);background:rgba(69,227,148,.12)}\n.friend-action[data-status=\"DECLINED\"],.friend-action[data-status=\"CANCELLED\"]{border-color:rgba(255,102,128,.5);background:rgba(255,102,128,.12)}\n.sheet-kicker{font-size:10px;font-weight:950;letter-spacing:.15em;color:var(--cyan);margin-bottom:2px}\n    .cockpit-status{margin:2px 0 12px;padding:9px 11px;border:1px solid var(--line);border-radius:12px;background:#0d1b2e;color:var(--muted);font-size:11px;font-weight:750}\n    .cockpit-tabs{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;position:sticky;top:57px;z-index:3;padding:7px 0 10px;background:#0b1320}\n    .cockpit-tab{min-width:0;height:39px;border:1px solid var(--line);border-radius:11px;background:#101d31;color:var(--muted);font-size:9px;font-weight:950;letter-spacing:.04em}\n    .cockpit-tab.active{background:linear-gradient(145deg,var(--blue),#285dc4);border-color:rgba(79,165,255,.8);color:#fff}\n    .cockpit-panel{display:grid;gap:10px;min-height:280px}\n    .state-card{border:1px solid var(--line);background:linear-gradient(155deg,#14243b,#0d1828);border-radius:18px;padding:14px}\n    .state-card h3{margin:0;font-size:17px}.state-card p{margin:5px 0 0;color:var(--muted);font-size:13px}\n    .summary-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}\n    .summary-box{border:1px solid var(--line);border-radius:15px;background:#0d192a;padding:12px}\n    .summary-box strong{display:block;font-size:22px;line-height:1.05}\n    .summary-box small{display:block;margin-top:5px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}\n    .card-headline{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}\n    .source-chip{flex:none;padding:4px 8px;border-radius:999px;border:1px solid var(--line);font-size:9px;font-weight:950;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}\n    .source-chip.fresh,.source-chip.active,.source-chip.healthy{color:var(--green);border-color:rgba(69,227,148,.45);background:rgba(69,227,148,.08)}\n    .source-chip.stale,.source-chip.partial,.source-chip.empty{color:var(--amber);border-color:rgba(255,200,90,.48);background:rgba(255,200,90,.08)}\n    .source-chip.unavailable,.source-chip.degraded,.source-chip.error{color:var(--danger);border-color:rgba(255,102,128,.48);background:rgba(255,102,128,.08)}\n    .cockpit-item{border:1px solid var(--line);background:#0d192a;border-radius:16px;padding:13px}\n    .item-title{font-size:15px;font-weight:850}.item-meta{margin-top:3px;color:var(--cyan);font-size:11px;font-weight:800}.item-detail{margin-top:6px;color:var(--muted);font-size:12px}\n    .warning-card{border:1px solid rgba(255,200,90,.35);background:rgba(255,200,90,.07);border-radius:15px;padding:12px;color:#ffe4a5;font-size:12px}\n    .evidence-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line)}\n    .evidence-row:first-child{border-top:0}.evidence-row span{color:var(--muted);font-size:12px}.evidence-row strong{text-align:right;font-size:12px}\n    .tab-note{color:var(--muted);font-size:11px;line-height:1.45}\n    .field-status{margin-top:6px;padding:6px 8px;border:1px solid var(--line);border-radius:11px;background:#091525;color:var(--muted);font-size:9px;font-weight:850;line-height:1.25;letter-spacing:.01em;white-space:normal;overflow:hidden}\n    .field-status::-webkit-scrollbar{display:none}\n    .field-status[data-state=\"live\"]{color:var(--green);border-color:rgba(69,227,148,.38)}\n    .field-status[data-state=\"warning\"]{color:var(--amber);border-color:rgba(255,200,90,.42)}\n    .field-status[data-state=\"test\"]{color:#16100a;background:var(--amber);border-color:var(--amber)}\n    .preflight-result{margin-top:8px;padding:10px;border:1px solid var(--line);border-radius:12px;background:#091525;color:var(--muted);font-size:11px;line-height:1.45;white-space:pre-wrap}\n    .more-toggle{height:42px;min-width:0;padding:0 4px;border-radius:12px;border:1px solid rgba(255,200,90,.48);background:rgba(255,200,90,.12);color:var(--amber);font-size:9px;font-weight:950}\n    .more-toggle.active{background:var(--amber);color:#16100a}\n    .more-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:6px}\n    .more-actions[hidden]{display:none}\n    #pickupBtn{background:rgba(79,165,255,.22);border-color:rgba(79,165,255,.48)}\n    #dropoffBtn{background:rgba(69,227,148,.22);border-color:rgba(69,227,148,.48)}\n    #cancelTripBtn,#cancelQueuedBtn{background:rgba(255,102,128,.20);border-color:rgba(255,102,128,.48)}\n    #reservationBtn{background:rgba(167,123,255,.20);border-color:rgba(167,123,255,.48)}\n    @media(max-width:380px){.cockpit-tab{font-size:8px}.cockpit-tabs{gap:3px}.summary-grid{grid-template-columns:1fr 1fr}}\n    @media(min-width:760px){\n      :root{--dock:326px}\n      .dock{left:50%;right:auto;width:min(720px,calc(100% - 24px));transform:translateX(-50%);border-radius:25px 25px 0 0}\n      .recommend{left:18px;bottom:calc(var(--dock) + 18px)}\n      .map-tools{right:18px;bottom:calc(var(--dock) + 18px)}\n      .topbar{left:18px;right:18px}\n      .sheet{left:50%;right:auto;width:min(620px,100%);transform:translate(-50%,102%)}\n      .sheet.open{transform:translate(-50%,0)}\n      .cards.two{grid-template-columns:1fr 1fr}\n    }\n    @media(prefers-reduced-motion:reduce){.sheet,.toast{transition:none}}\n  </style>\n</head>\n<body>\n<div id=\"app\">\n  <div id=\"map\"></div>\n\n  <div class=\"topbar\">\n    <button class=\"icon\" id=\"homeBtn\" aria-label=\"Home\">⌂</button>\n    <div class=\"metric glass\"><strong><span class=\"money\">$</span><span id=\"netHourly\">—</span></strong><small id=\"metricLabel\">projected net/hour</small></div>\n    <button class=\"icon\" id=\"refreshBtn\" aria-label=\"Refresh\">↻</button>\n  </div>\n\n  <section class=\"recommend glass\">\n    <div class=\"eyebrow\" id=\"action\"><span class=\"loading-dot\"></span>LOADING</div>\n    <h2 id=\"zone\">Opening Pulse…</h2>\n    <p id=\"detail\">The controls are ready while data loads.</p>\n  </section>\n\n  <div class=\"map-tools\">\n    <button class=\"tool\" id=\"signalsBtn\" aria-label=\"Pulse cockpit\">PULSE</button>\n    <button class=\"tool\" id=\"trendsBtn\" aria-label=\"Nearby trends\">TRENDS</button>\n    <button class=\"tool\" id=\"locateBtn\" aria-label=\"Update location\">GPS</button>\n  </div>\n\n  <section class=\"dock\">\n    <div class=\"shift-row\">\n      <button class=\"icon\" id=\"settingsBtn\" aria-label=\"Settings\">☷</button>\n      <div class=\"status\"><strong id=\"shiftStatus\">You're offline</strong><small id=\"shiftDetail\">Tap GO to begin a shift</small></div>\n      <button class=\"icon\" id=\"logBtn\" aria-label=\"History\">☰</button>\n    </div>\n    <button class=\"go\" id=\"goBtn\">GO ONLINE</button>\n    <div id=\"tripContext\" style=\"margin-top:6px;padding:6px 8px;border:1px solid rgba(255,255,255,.13);border-radius:11px;color:#a8b8cd;font-size:10px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">No active or queued trip</div>\n    <div class=\"field-status\" id=\"fieldStatus\" data-state=\"warning\">GPS CHECKING · TRACE OFF · 0 PTS · 0.00 MI</div>\n    <div class=\"ping-row\" id=\"primaryActions\">\n      <button class=\"ping\" data-type=\"PING\">PING</button>\n      <button class=\"ping\" data-type=\"ACCEPTED\">ACCEPT</button>\n      <button class=\"ping\" id=\"pickupBtn\" data-trip-action=\"PICKED_UP\">PICKUP</button>\n      <button class=\"ping\" id=\"dropoffBtn\" data-trip-action=\"DROPPED_OFF\">DROP OFF</button>\n    </div>\n    <div class=\"ping-row\" id=\"secondaryActions\">\n      <button class=\"ping\" data-type=\"DECLINED\">DECLINE</button>\n      <button class=\"ping\" data-type=\"NO_RIDE\">NO RIDE</button>\n      <button class=\"ping\" id=\"cancelTripBtn\" data-trip-action=\"CANCELLED\" data-trip-target=\"active\">CANCEL</button>\n      <button class=\"more-toggle\" id=\"moreActionsBtn\" type=\"button\" aria-expanded=\"false\">MORE</button>\n    </div>\n    <div class=\"more-actions\" id=\"moreActions\" hidden>\n      <button class=\"ping\" id=\"reservationBtn\" data-trip-action=\"ACCEPTED\" data-reservation=\"true\">RESERVATION</button>\n      <button class=\"ping\" id=\"cancelQueuedBtn\" data-trip-action=\"CANCELLED\" data-trip-target=\"queued\">CANCEL NEXT</button>\n    </div>\n  </section>\n</div>\n\n<section class=\"sheet\" id=\"cockpitSheet\">\n  <div class=\"sheet-head\">\n    <div><div class=\"sheet-kicker\">PULSE COCKPIT</div><h1 id=\"cockpitTitle\">Now</h1></div>\n    <button class=\"close\" data-close=\"cockpitSheet\" aria-label=\"Close cockpit\">×</button>\n  </div>\n  <div class=\"cockpit-status\" id=\"cockpitStatus\">Loading current Pulse state…</div>\n  <div class=\"cockpit-tabs\" role=\"tablist\" aria-label=\"Pulse cockpit views\">\n    <button class=\"cockpit-tab active\" data-cockpit-tab=\"now\" role=\"tab\" aria-selected=\"true\">NOW</button>\n    <button class=\"cockpit-tab\" data-cockpit-tab=\"events\" role=\"tab\" aria-selected=\"false\">EVENTS</button>\n    <button class=\"cockpit-tab\" data-cockpit-tab=\"flights\" role=\"tab\" aria-selected=\"false\">FLIGHTS</button>\n    <button class=\"cockpit-tab\" data-cockpit-tab=\"plan\" role=\"tab\" aria-selected=\"false\">PLAN</button>\n    <button class=\"cockpit-tab\" data-cockpit-tab=\"log\" role=\"tab\" aria-selected=\"false\">LOG</button>\n    <button class=\"cockpit-tab\" data-cockpit-tab=\"rides\" role=\"tab\" aria-selected=\"false\">RIDES</button>\n  </div>\n  <div class=\"cockpit-panel\" id=\"cockpitPanel\">\n    <div class=\"state-card\"><h3>Loading…</h3><p>Pulse is reading the normalized cockpit contract.</p></div>\n  </div>\n  <button class=\"secondary\" id=\"refreshCockpitBtn\">Refresh current view</button>\n  <button id=\"refreshSignalsBtn\" type=\"button\" hidden aria-hidden=\"true\"></button>\n</section>\n\n<section class=\"sheet\" id=\"friendRequestSheet\">\n  <div class=\"sheet-head\">\n    <div><div class=\"sheet-kicker\">PRIVATE FRIEND REQUEST</div><h1>Request a ride</h1></div>\n    <button class=\"close\" data-close=\"friendRequestSheet\" aria-label=\"Close request form\">×</button>\n  </div>\n  <p class=\"muted\">Send a request for a known adult. A request is not confirmed until the driver confirms it directly.</p>\n  <form class=\"friend-form\" id=\"friendRideForm\">\n    <label>Your name<input id=\"friendRequesterName\" autocomplete=\"name\" required></label>\n    <label>Phone or email<input id=\"friendContactMethod\" autocomplete=\"tel\" required></label>\n    <label>Requested pickup date and time<input id=\"friendPickupAt\" type=\"datetime-local\" required></label>\n    <label>Pickup location<input id=\"friendPickupLocation\" autocomplete=\"street-address\" required></label>\n    <label>Destination<input id=\"friendDestination\" required></label>\n    <label>Passenger count<input id=\"friendPassengerCount\" type=\"number\" min=\"1\" max=\"8\" value=\"1\" required></label>\n    <label>Notes<textarea id=\"friendNotes\" placeholder=\"Flight time, luggage, accessibility needs, or other details\"></textarea></label>\n    <label class=\"friend-consent\"><input id=\"friendConsent\" type=\"checkbox\" required><span>I consent to sharing these details with the driver for this private ride request.</span></label>\n    <button class=\"primary friend-write\" id=\"friendSubmitBtn\" type=\"submit\">SEND RIDE REQUEST</button>\n    <div class=\"friend-status\" id=\"friendRequestStatus\">This form creates a request only. It does not create a shift, trip record, fare, payment, or automatic dispatch.</div>\n  </form>\n</section>\n\n<section class=\"sheet\" id=\"trendsSheet\">\n  <div class=\"sheet-head\"><h1>Nearby trends</h1><button class=\"close\" data-close=\"trendsSheet\">×</button></div>\n  <p class=\"muted\">Planning priors become personal evidence as Pulse records your shifts.</p>\n  <div class=\"cards\" id=\"regionList\"></div>\n</section>\n\n\n<section class=\"sheet\" id=\"settingsSheet\">\n  <div class=\"sheet-head\"><h1>Pulse settings</h1><button class=\"close\" data-close=\"settingsSheet\">×</button></div>\n  <div class=\"cards\">\n    <div class=\"card\"><h3>Runtime</h3><p id=\"runtimeVersion\">Pulse OS Runtime Lite 1.4.4</p><p>Manual Apps Script deployment. Spreadsheet-backed evidence.</p></div>\n    <div class=\"card\"><h3>Map display</h3><p>Only the nearest six regions are shown to keep the map readable and fast.</p><button class=\"secondary\" id=\"fitBtn\">Fit nearby regions</button></div>\n    <div class=\"card\"><h3>Data refresh</h3><p>Refresh recommendations, weather, events, and flights.</p><button class=\"primary\" id=\"refreshDataBtn\">Refresh Pulse data</button></div>\n    <div class=\"card\"><h3>Live field preflight</h3><p>Read-only check of DEV headers, endpoints, Signals, shift state, and trip state.</p><button class=\"secondary\" id=\"fieldPreflightBtn\">Run live preflight</button><div class=\"preflight-result\" id=\"fieldPreflightResult\">Not run yet. This check performs no writes.</div></div>\n  </div>\n</section>\n\n<section class=\"sheet\" id=\"stopSheet\">\n  <div class=\"sheet-head\"><h1>End shift</h1><button class=\"close\" data-close=\"stopSheet\">×</button></div>\n  <div class=\"card\">\n    <div class=\"form-row\">\n      <div class=\"field\"><label for=\"grossInput\">Gross earnings</label><input id=\"grossInput\" inputmode=\"decimal\" placeholder=\"0.00\"></div>\n      <div class=\"field\"><label for=\"milesInput\">Shift miles</label><input id=\"milesInput\" inputmode=\"decimal\" placeholder=\"0.0\"></div>\n    </div>\n    <button class=\"primary\" id=\"endShiftBtn\">Save and end shift</button>\n  </div>\n</section>\n\n<div class=\"toast\" id=\"toast\"></div>\n<script src=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\"></script>\n<script>\nlet TEST_MODE=false;\nconst TEST_POSITION=Object.freeze({lat:44.4759,lng:-73.2121,accuracy:12});\nconst TEST_FIXTURE=Object.freeze({\n  uiVersion:'1.4.4-test-harness',\n  generatedAt:'2026-07-15T11:45:00.000Z',\n  cockpit:{\n    version:'1.4.4-runtime-lite',\n    checkedAt:'2026-07-15T11:45:00.000Z',\n    recommendation:{\n      action:'LOW_CONFIDENCE',\n      recommendedZoneId:'BTV_DOWNTOWN',\n      recommendedZoneName:'Downtown Burlington',\n      projectedNetPerHour:null,\n      confidence:.34,\n      repositionMinutes:0,\n      reasons:['More local evidence is needed before Pulse gives positioning guidance.']\n    },\n    currentZone:{zoneId:'BTV_DOWNTOWN',zoneName:'Downtown Burlington'},\n    dataHealth:{\n      overall:'partial',\n      checkedAt:'2026-07-15T11:45:00.000Z',\n      sources:{\n        weather:{source:'weather',available:true,status:'fresh',observedAt:'2026-07-15T11:40:00.000Z',ageMinutes:5,detail:'Weather observation loaded'},\n        events:{source:'events',available:true,status:'active',observedAt:null,ageMinutes:null,detail:'2 upcoming of 5 stored'},\n        flights:{source:'flights',available:true,status:'fresh',observedAt:'2026-07-15T11:42:00.000Z',ageMinutes:3,detail:'3 arrivals in active window'},\n        pings:{source:'pings',available:true,status:'fresh',observedAt:'2026-07-15T11:44:00.000Z',ageMinutes:1,detail:'12 driver observations'}\n      }\n    },\n    weather:{available:true,temperatureF:72,precipitation:0,snowfall:0,windMph:7,observedAt:'2026-07-15T11:40:00.000Z'},\n    events:[\n      {eventId:'TEST-EVENT-1',name:'Waterfront concert release',venue:'Burlington Waterfront',expectedEnd:'2026-07-15T13:15:00.000Z',zoneId:'BTV_DOWNTOWN',multiplier:1.35},\n      {eventId:'TEST-EVENT-2',name:'Conference checkout',venue:'South Burlington',expectedEnd:'2026-07-15T12:45:00.000Z',zoneId:'SOUTH_BURLINGTON',multiplier:1.2}\n    ],\n    flights:[\n      {flightId:'TEST101',arrival:'2026-07-15T12:05:00.000Z',status:'scheduled'},\n      {flightId:'TEST202',arrival:'2026-07-15T12:35:00.000Z',status:'scheduled'},\n      {flightId:'TEST303',arrival:'2026-07-15T13:00:00.000Z',status:'active'}\n    ],\n    plan:[\n      {kind:'DRIVER_ACTION',startsAt:'2026-07-15T11:45:00.000Z',endsAt:'2026-07-15T12:15:00.000Z',action:'LOW_CONFIDENCE',zoneId:'BTV_DOWNTOWN',zoneName:'Downtown Burlington',confidence:.34,reason:'Use driver judgment while Pulse gathers more evidence.'},\n      {kind:'EVENT_RELEASE',startsAt:null,endsAt:'2026-07-15T12:45:00.000Z',action:'WATCH',zoneId:'SOUTH_BURLINGTON',zoneName:'South Burlington',confidence:null,reason:'Conference checkout'},\n      {kind:'AIRPORT_ARRIVAL',startsAt:'2026-07-15T12:05:00.000Z',endsAt:null,action:'WATCH',zoneId:'BTV_AIRPORT',zoneName:'BTV Airport',confidence:null,reason:'TEST101 · scheduled'}\n    ],\n    pings:{total:12,byType:{PING:5,ACCEPTED:4,DECLINED:2,NO_RIDE:1},byZone:{BTV_DOWNTOWN:5,SOUTH_BURLINGTON:4,BTV_AIRPORT:3}},\n    shift:{shiftId:'TEST-SHIFT-001',startedAt:'2026-07-15T10:30:00.000Z',elapsedMinutes:75},\n    warnings:[\n      {code:'LOW_CONFIDENCE',source:'recommendation',severity:'info',message:'Use driver judgment while Pulse gathers more evidence.'}\n    ],\n    activeShift:{shiftId:'TEST-SHIFT-001',startedAt:'2026-07-15T10:30:00.000Z',elapsedMinutes:75},\n    signals:{\n      weather:{available:true,temperatureF:72,precipitation:0,snowfall:0,windMph:7,observedAt:'2026-07-15T11:40:00.000Z'},\n      events:[\n        {eventId:'TEST-EVENT-1',name:'Waterfront concert release',venue:'Burlington Waterfront',expectedEnd:'2026-07-15T13:15:00.000Z',zoneId:'BTV_DOWNTOWN',multiplier:1.35},\n        {eventId:'TEST-EVENT-2',name:'Conference checkout',venue:'South Burlington',expectedEnd:'2026-07-15T12:45:00.000Z',zoneId:'SOUTH_BURLINGTON',multiplier:1.2}\n      ],\n      flights:[\n        {flightId:'TEST101',arrival:'2026-07-15T12:05:00.000Z',status:'scheduled'},\n        {flightId:'TEST202',arrival:'2026-07-15T12:35:00.000Z',status:'scheduled'},\n        {flightId:'TEST303',arrival:'2026-07-15T13:00:00.000Z',status:'active'}\n      ]\n    },\n    daily:{gross:96.5,expenses:18.4,net:78.1,onlineMinutes:165},\n    pingStats:{total:12,byType:{PING:5,ACCEPTED:4,DECLINED:2,NO_RIDE:1},byZone:{BTV_DOWNTOWN:5,SOUTH_BURLINGTON:4,BTV_AIRPORT:3}}\n  },\n  regionState:{\n    liveHour:11,\n    regions:[\n      {regionId:'BTV_DOWNTOWN',regionName:'Downtown Burlington',hub:'Burlington',latitude:44.4762,longitude:-73.2129,distanceMiles:0,current:true,trend:[1,1,1,1,1,1,1,1,2,2,3,4,4,3,2,2,3,4,4,3,2,2,1,1]},\n      {regionId:'SOUTH_BURLINGTON',regionName:'South Burlington',hub:'Chittenden',latitude:44.4669,longitude:-73.1709,distanceMiles:2.3,current:false,trend:[1,1,1,1,1,1,2,2,3,3,4,4,4,3,2,2,3,4,4,4,3,2,1,1]},\n      {regionId:'BTV_AIRPORT',regionName:'BTV Airport',hub:'Chittenden',latitude:44.4719,longitude:-73.1533,distanceMiles:3.4,current:false,trend:[1,1,1,1,1,1,1,2,2,3,3,4,4,4,3,2,2,3,4,4,3,2,1,1]},\n      {regionId:'WINOOSKI',regionName:'Winooski',hub:'Chittenden',latitude:44.4906,longitude:-73.1866,distanceMiles:2.1,current:false,trend:[1,1,1,1,1,1,2,2,2,3,3,3,3,3,2,2,3,3,4,4,3,2,2,1]},\n      {regionId:'ESSEX',regionName:'Essex Junction',hub:'Chittenden',latitude:44.4908,longitude:-73.1107,distanceMiles:5.3,current:false,trend:[1,1,1,1,1,1,1,2,2,2,3,3,3,3,2,2,2,3,3,4,3,2,1,1]},\n      {regionId:'WILLISTON',regionName:'Williston',hub:'Chittenden',latitude:44.4454,longitude:-73.0999,distanceMiles:6.2,current:false,trend:[1,1,1,1,1,1,1,2,2,3,3,3,3,2,2,2,3,4,4,4,3,2,1,1]}\n    ]\n  }\n});\nconst TEST_HISTORY=Object.freeze({\n  pingStats:{total:12},\n  shifts:[\n    {shiftId:'TEST-SHIFT-001',startedAt:'2026-07-15T10:30:00.000Z',endedAt:null,gross:96.5,net:78.1,netPerHour:28.4},\n    {shiftId:'TEST-SHIFT-000',startedAt:'2026-07-14T13:00:00.000Z',endedAt:'2026-07-14T16:00:00.000Z',gross:118.4,net:91.2,netPerHour:30.4}\n  ]\n});\nlet FRIEND_REQUEST_VIEW=false,FRIEND_REQUEST_TOKEN='';\nlet TEST_FRIEND_RIDES=[\n  {\n    requestId:'TEST-FRIEND-1',source:'FRIEND_LINK',createdAt:'2026-07-17T11:30:00.000Z',updatedAt:'2026-07-17T11:45:00.000Z',\n    requesterName:'Airport friend',contactMethod:'Private contact',pickupAt:'2026-07-18T04:00:00-04:00',\n    pickupLocation:'Friend pickup location',destination:'Burlington International Airport',passengerCount:1,\n    notes:'Confirmed early airport ride',consent:true,status:'CONFIRMED',statusNote:'Confirmed directly with driver'\n  },\n  {\n    requestId:'TEST-FRIEND-2',source:'FRIEND_LINK',createdAt:'2026-07-17T12:00:00.000Z',updatedAt:'2026-07-17T12:00:00.000Z',\n    requesterName:'Known adult',contactMethod:'Private contact',pickupAt:'2026-07-19T14:30:00-04:00',\n    pickupLocation:'Burlington',destination:'Montpelier',passengerCount:2,\n    notes:'Fixture request awaiting review',consent:true,status:'REQUESTED',statusNote:''\n  }\n];\nconst app={map:null,pos:null,data:null,markers:[],busy:false,historyLoaded:false,startedAt:null,lastActionAt:{},trip:{active:null,queued:null},routeWatchId:null,routePoints:[],routeLayer:null,routeMiles:0,cockpitTab:'now',history:null,historyLoading:false,historyError:'',friendRides:null,friendRidesLoading:false,friendRidesError:''};\nlet TEST_TRIP_STATE={active:null,queued:null};\nconst $=id=>document.getElementById(id);\nconst cloneTest_=value=>JSON.parse(JSON.stringify(value));\nfunction testTripSnapshot_(){return cloneTest_(TEST_TRIP_STATE)}\nfunction testTripAction_(payload){\n  payload=payload||{};\n  const action=String(payload.action||'').toUpperCase();\n  const target=String(payload.target||'active').toLowerCase();\n  const makeTrip=function(state){\n    return{\n      tripId:String(payload.tripId||clientEventId_()),\n      state:state,\n      reservation:!!payload.reservation,\n      startedAt:String(payload.effectiveAt||payload.observedAt||new Date().toISOString()),\n      pickupZoneId:String(payload.pickupZoneId||'TEST_PICKUP'),\n      dropoffZoneId:String(payload.dropoffZoneId||''),\n      miles:Number(payload.miles)||0\n    };\n  };\n  if(action==='ACCEPTED'){\n    if(TEST_TRIP_STATE.active){\n      if(TEST_TRIP_STATE.queued)return{ok:true,duplicate:true,reason:'queue_occupied',state:testTripSnapshot_()};\n      TEST_TRIP_STATE.queued=makeTrip('QUEUED_ACCEPTED');\n      return{ok:true,queued:true,state:testTripSnapshot_()};\n    }\n    TEST_TRIP_STATE.active=makeTrip('ACCEPTED');\n    return{ok:true,queued:false,state:testTripSnapshot_()};\n  }\n  if(action==='PICKED_UP'||action==='ON_TRIP'){\n    if(!TEST_TRIP_STATE.active)return{ok:false,needsReconciliation:true,reason:'no_active_trip',state:testTripSnapshot_()};\n    TEST_TRIP_STATE.active.state=action;\n    return{ok:true,state:testTripSnapshot_()};\n  }\n  if(action==='CANCELLED'){\n    if(target==='queued'){\n      TEST_TRIP_STATE.queued=null;\n      return{ok:true,cancelledTarget:'queued',state:testTripSnapshot_()};\n    }\n    TEST_TRIP_STATE.active=null;\n    if(TEST_TRIP_STATE.queued){\n      TEST_TRIP_STATE.active=TEST_TRIP_STATE.queued;\n      TEST_TRIP_STATE.active.state='ACCEPTED';\n      TEST_TRIP_STATE.queued=null;\n      return{ok:true,cancelledTarget:'active',promoted:true,state:testTripSnapshot_()};\n    }\n    return{ok:true,cancelledTarget:'active',state:testTripSnapshot_()};\n  }\n  if(action==='DROPPED_OFF'||action==='COMPLETED'){\n    if(!TEST_TRIP_STATE.active)return{ok:false,needsReconciliation:true,reason:'no_active_trip',state:testTripSnapshot_()};\n    TEST_TRIP_STATE.active=null;\n    let promoted=false;\n    if(TEST_TRIP_STATE.queued){\n      TEST_TRIP_STATE.active=TEST_TRIP_STATE.queued;\n      TEST_TRIP_STATE.active.state='ACCEPTED';\n      TEST_TRIP_STATE.queued=null;\n      promoted=true;\n    }\n    return{ok:true,completed:true,promoted:promoted,state:testTripSnapshot_()};\n  }\n  return{ok:true,state:testTripSnapshot_()};\n}\nfunction runTestTripScenario_(){\n  TEST_TRIP_STATE={active:null,queued:null};\n  const accept=testTripAction_({action:'ACCEPTED',clientEventId:'TEST-A'});\n  const pickup=testTripAction_({action:'PICKED_UP',clientEventId:'TEST-B'});\n  const queued=testTripAction_({action:'ACCEPTED',clientEventId:'TEST-C'});\n  const dropoff=testTripAction_({action:'DROPPED_OFF',clientEventId:'TEST-D',miles:4.25});\n  const promoted=!!(dropoff.promoted&&dropoff.state&&dropoff.state.active);\n  const cancelQueuedSetup=testTripAction_({action:'ACCEPTED',clientEventId:'TEST-E'});\n  const cancelQueued=testTripAction_({action:'CANCELLED',target:'queued',clientEventId:'TEST-F'});\n  const cancelActive=testTripAction_({action:'CANCELLED',target:'active',clientEventId:'TEST-G'});\n  const reservation=testTripAction_({action:'ACCEPTED',reservation:true,clientEventId:'TEST-H'});\n  const reservationCancel=testTripAction_({action:'CANCELLED',target:'active',clientEventId:'TEST-I'});\n  return{\n    ok:!!(accept.ok&&pickup.ok&&queued.queued&&dropoff.completed&&promoted&&cancelQueuedSetup.queued&&cancelQueued.cancelledTarget==='queued'&&cancelActive.cancelledTarget==='active'&&reservation.ok&&reservationCancel.ok),\n    promoted:promoted,\n    routeMiles:4.25\n  };\n}\nfunction testResponse_(fn,args){\n  if(fn==='pulseGetMobileState')return cloneTest_(TEST_FIXTURE);\n  if(fn==='pulseGetLiveSignals')return cloneTest_(TEST_FIXTURE.cockpit);\n  if(fn==='pulseGetMobileHistory')return cloneTest_(TEST_HISTORY);\n  if(fn==='pulseGetTripState')return testTripSnapshot_();\n  if(fn==='pulseTripAction')return testTripAction_(args&&args[0]||{});\n  if(fn==='pulseGetFriendRides'){\n    const rides=cloneTest_(TEST_FRIEND_RIDES);\n    const nextConfirmed=rides.find(ride=>ride.status==='CONFIRMED')||null;\n    return{checkedAt:TEST_FIXTURE.generatedAt,requestUrl:'?request=TEST_TOKEN&mode=test',rides:rides,nextConfirmed:nextConfirmed,writesPerformed:false};\n  }\n  if(fn==='pulseSubmitFriendRide')return{ok:true,noWrite:true,requestId:'TEST-FRIEND-NEW',status:'REQUESTED',tripRecordCreated:false};\n  if(fn==='pulseUpdateFriendRideStatus'){\n    const payload=args&&args[0]||{},ride=TEST_FRIEND_RIDES.find(item=>item.requestId===payload.requestId);\n    if(ride){ride.status=String(payload.status||ride.status).toUpperCase();ride.updatedAt=new Date().toISOString();}\n    return{ok:true,noWrite:true,requestId:String(payload.requestId||''),status:String(payload.status||''),tripRecordCreated:false};\n  }\n  throw new Error('TEST MODE blocks runtime action: '+fn);\n}\nconst server=(fn,...args)=>TEST_MODE\n  ?Promise.resolve().then(()=>testResponse_(fn,args))\n  :new Promise((resolve,reject)=>google.script.run\n    .withSuccessHandler(resolve).withFailureHandler(e=>reject(new Error(e&&e.message?e.message:String(e))))[fn](...args));\nfunction installTestMode_(){\n  const style=document.createElement('style');\n  style.textContent='.pulse-test-badge{position:fixed;z-index:1500;top:calc(62px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);padding:7px 12px;border-radius:999px;background:#ffc85a;color:#16100a;font-size:11px;font-weight:950;letter-spacing:.08em;box-shadow:0 8px 24px rgba(0,0,0,.35)}.pulse-test-locked{opacity:.48!important;filter:saturate(.35)}.pulse-test-mode #cockpitSheet.open .cockpit-status{margin-top:38px}';\n  document.head.appendChild(style);\n  const badge=document.createElement('div');\n  badge.className='pulse-test-badge';\n  badge.textContent='TEST MODE · NO WRITES';\n  document.body.appendChild(badge);\n  document.body.classList.add('pulse-test-mode');\n  ['goBtn','endShiftBtn','locateBtn','refreshBtn','refreshDataBtn','refreshCockpitBtn'].forEach(id=>{\n    const el=$(id);if(el){el.disabled=true;el.classList.add('pulse-test-locked');el.setAttribute('aria-disabled','true')}\n  });\n  document.querySelectorAll('.ping,input').forEach(el=>{el.disabled=true;el.classList.add('pulse-test-locked')});\n  const integrity=testEventIntegrity_();\n  const lifecycle=runTestTripScenario_();\n  app.trip=testTripSnapshot_();\n  app.history=cloneTest_(TEST_HISTORY);\n  app.historyLoaded=true;\n  renderTripContext_();\n  renderCockpit();\n  const status=$('cockpitStatus');\n  if(status)status.textContent=`Fixture integrity · ${integrity.duplicates} duplicate suppressed · ${integrity.staleGps} stale GPS flagged · lifecycle ${lifecycle.ok?'passed':'failed'} · ${lifecycle.routeMiles.toFixed(2)} route mi · no writes`;\n  $('runtimeVersion').textContent='Pulse OS 1.4.4 · TEST HARNESS';\n}\nfunction toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(app.toastTimer);app.toastTimer=setTimeout(()=>el.classList.remove('show'),1900)}\nfunction setBusy(flag){app.busy=flag;$('refreshBtn').disabled=flag;$('goBtn').disabled=flag}\nfunction openSheet(id){$(id).classList.add('open')}\nfunction closeSheet(id){$(id).classList.remove('open')}\nfunction esc(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]))}\nfunction number(v,digits=0){const n=Number(v);return Number.isFinite(n)?n.toFixed(digits):'—'}\nconst GPS_CACHE_MAX_AGE_MS=30000;\nconst ACTION_LOCK_MS=1600;\nconst TEST_EVENT_INTEGRITY=Object.freeze([\n  {clientEventId:'TEST-DUP-1',gpsStatus:'fresh',gpsAgeMs:0},\n  {clientEventId:'TEST-DUP-1',gpsStatus:'fresh',gpsAgeMs:0},\n  {clientEventId:'TEST-STALE-1',gpsStatus:'unavailable',gpsAgeMs:360000}\n]);\nfunction testEventIntegrity_(){\n  const seen=new Set();\n  let duplicates=0,staleGps=0;\n  TEST_EVENT_INTEGRITY.forEach(e=>{\n    if(seen.has(e.clientEventId))duplicates+=1;\n    else seen.add(e.clientEventId);\n    if(e.gpsStatus==='unavailable'||Number(e.gpsAgeMs)>GPS_CACHE_MAX_AGE_MS)staleGps+=1;\n  });\n  return{duplicates:duplicates,staleGps:staleGps,unique:seen.size};\n}\nfunction clientEventId_(){\n  if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID();\n  return'pulse-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);\n}\nfunction getCachedPosition(){\n  try{\n    const p=JSON.parse(localStorage.getItem('pulse.lastPosition')||'null');\n    if(!p||!Number.isFinite(Number(p.lat))||!Number.isFinite(Number(p.lng)))return null;\n    const capturedAt=Number(p.capturedAt)||0;\n    return Object.assign({},p,{\n      capturedAt:capturedAt||null,\n      gpsAgeMs:capturedAt?Math.max(0,Date.now()-capturedAt):null\n    });\n  }catch(e){return null}\n}\nfunction savePosition(p){\n  if(!p||!Number.isFinite(Number(p.lat))||!Number.isFinite(Number(p.lng)))return;\n  try{localStorage.setItem('pulse.lastPosition',JSON.stringify(p))}catch(e){}\n}\nfunction positionResult_(coords,status,source){\n  const out={\n    lat:Number(coords.latitude),\n    lng:Number(coords.longitude),\n    accuracy:Number.isFinite(Number(coords.accuracy))?Number(coords.accuracy):null,\n    capturedAt:Date.now(),\n    gpsStatus:status,\n    gpsAgeMs:0,\n    captureSource:source\n  };\n  savePosition(out);\n  return out;\n}\nfunction requestPosition_(options,status,source){\n  return new Promise((resolve,reject)=>{\n    if(!navigator.geolocation)return reject(new Error('Geolocation unavailable'));\n    navigator.geolocation.getCurrentPosition(\n      p=>resolve(positionResult_(p.coords,status,source)),\n      e=>reject(e||new Error('Position unavailable')),\n      options\n    );\n  });\n}\nasync function capturePosition_(){\n  try{\n    return await requestPosition_(\n      {enableHighAccuracy:true,timeout:5500,maximumAge:0},\n      'fresh',\n      'navigator-high-accuracy'\n    );\n  }catch(e){}\n  try{\n    return await requestPosition_(\n      {enableHighAccuracy:false,timeout:3000,maximumAge:0},\n      'fallback',\n      'navigator-low-accuracy'\n    );\n  }catch(e){}\n  const cached=getCachedPosition();\n  if(cached&&cached.gpsAgeMs!==null&&cached.gpsAgeMs<=GPS_CACHE_MAX_AGE_MS){\n    return Object.assign({},cached,{gpsStatus:'cached',captureSource:'localStorage'});\n  }\n  return{\n    lat:null,lng:null,accuracy:null,capturedAt:null,\n    gpsStatus:'unavailable',gpsAgeMs:null,captureSource:'none'\n  };\n}\nfunction locateQuick(){return capturePosition_()}\nfunction initMap(){\n  app.map=L.map('map',{zoomControl:false,attributionControl:true,preferCanvas:true}).setView([44.4759,-73.16],10);\n  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{\n    maxZoom:18,updateWhenIdle:true,keepBuffer:2,attribution:'© OpenStreetMap'\n  }).addTo(app.map);\n  requestAnimationFrame(()=>app.map.invalidateSize(true));\n}\nfunction clearMarkers(){app.markers.forEach(m=>app.map.removeLayer(m));app.markers=[]}\nfunction nearbyRegions(){\n  const regions=((app.data||{}).regionState||{}).regions||[];\n  return regions.slice(0,6);\n}\nfunction renderMap(){\n  if(!app.map)return;\n  clearMarkers();\n  const bounds=[];\n  nearbyRegions().forEach(r=>{\n    const value=Math.max(...(r.trend||[0]));\n    const color=r.current?'#4fa5ff':value>=3?'#ff7b43':value>=2?'#a77bff':'#42dcff';\n    const marker=L.circleMarker([r.latitude,r.longitude],{\n      radius:r.current?12:8,color:'#ffffff',weight:r.current?3:1,fillColor:color,fillOpacity:.92\n    }).addTo(app.map).bindPopup(`<b>${esc(r.regionName)}</b><br>${r.distanceMiles==null?esc(r.hub):number(r.distanceMiles,1)+' mi away'}`);\n    app.markers.push(marker);bounds.push([r.latitude,r.longitude]);\n  });\n  if(app.pos&&Number.isFinite(Number(app.pos.lat))){\n    const me=L.circleMarker([app.pos.lat,app.pos.lng],{radius:9,color:'#fff',weight:3,fillColor:'#2477ff',fillOpacity:1})\n      .addTo(app.map).bindPopup('Your location');\n    app.markers.push(me);bounds.push([app.pos.lat,app.pos.lng]);\n  }\n  if(bounds.length){\n    app.map.fitBounds(bounds,{paddingTopLeft:[55,85],paddingBottomRight:[55,210],maxZoom:11,animate:false});\n  }\n  setTimeout(()=>app.map.invalidateSize(true),80);\n}\nfunction contractFrom_(source){\n  const root=source||{},c=root.cockpit||root,signals=c.signals||{};\n  const weather=c.weather||signals.weather||{};\n  const events=Array.isArray(c.events)?c.events:(Array.isArray(signals.events)?signals.events:[]);\n  const flights=Array.isArray(c.flights)?c.flights:(Array.isArray(signals.flights)?signals.flights:[]);\n  return{\n    version:c.version||root.uiVersion||'Runtime Lite',\n    checkedAt:c.checkedAt||c.generatedAt||root.generatedAt||new Date().toISOString(),\n    recommendation:c.recommendation||{},\n    currentZone:c.currentZone||null,\n    dataHealth:c.dataHealth||{overall:'unknown',sources:{}},\n    weather:weather,\n    events:events,\n    flights:flights,\n    plan:Array.isArray(c.plan)?c.plan:[],\n    pings:c.pings||c.pingStats||{},\n    shift:c.shift||c.activeShift||null,\n    warnings:Array.isArray(c.warnings)?c.warnings:[],\n    daily:c.daily||{}\n  };\n}\nfunction mergeContract_(payload){\n  if(!app.data)app.data={regionState:{regions:[]},cockpit:{}};\n  if(!app.data.cockpit)app.data.cockpit={};\n  const contract=contractFrom_(payload);\n  const c=app.data.cockpit;\n  Object.assign(c,contract);\n  c.activeShift=contract.shift;\n  c.pingStats=contract.pings;\n  c.signals={weather:contract.weather,events:contract.events,flights:contract.flights};\n  return contract;\n}\nfunction statusClass_(status){\n  const value=String(status||'unknown').toLowerCase();\n  return['fresh','active','healthy','stale','partial','empty','unavailable','degraded','error'].includes(value)?value:'';\n}\nfunction chip_(status,label){\n  const value=String(status||'unknown');\n  return`<span class=\"source-chip ${statusClass_(value)}\">${esc(label||value)}</span>`;\n}\nfunction displayTime_(value){\n  if(!value)return'—';\n  const date=new Date(value);\n  return isNaN(date.getTime())?'—':date.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});\n}\nfunction displayDateTime_(value){\n  if(!value)return'—';\n  const date=new Date(value);\n  return isNaN(date.getTime())?'—':`${date.toLocaleDateString()} · ${date.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;\n}\nfunction sourceState_(contract,key){\n  return((contract.dataHealth||{}).sources||{})[key]||{source:key,status:'unknown',available:false,detail:'No source status returned'};\n}\nfunction recommendationReason_(r,warnings){\n  const reason=Array.isArray(r.reasons)&&r.reasons.length?r.reasons[0]:'';\n  const warning=(warnings||[]).find(w=>String(w.source||'')==='recommendation');\n  return reason||String((warning||{}).message||'Use driver judgment while Pulse gathers more evidence.');\n}\nfunction render(data){\n  app.data=data||app.data||{cockpit:{},regionState:{regions:[]}};\n  const c=contractFrom_(app.data),r=c.recommendation||{},active=c.shift;\n  const low=String(r.action||'LOW_CONFIDENCE').toUpperCase()==='LOW_CONFIDENCE'||r.projectedNetPerHour==null;\n  $('action').textContent=low?'DRIVER JUDGMENT':String(r.action||'').replaceAll('_',' ');\n  $('zone').textContent=low?((c.currentZone||{}).zoneName||'Use your judgment'):(r.recommendedZoneName||((c.currentZone||{}).zoneName)||'Use your judgment');\n  $('netHourly').textContent=low?'—':number(r.projectedNetPerHour,2);\n  $('metricLabel').textContent=low?'evidence building':'projected net/hour';\n  $('detail').textContent=low\n    ?recommendationReason_(r,c.warnings)\n    :`${Math.round(Number(r.confidence||0)*100)}% confidence${Number.isFinite(Number(r.repositionMinutes))?' · '+Number(r.repositionMinutes)+' min reposition':''}`;\n  $('shiftStatus').textContent=active?\"You're online\":\"You're offline\";\n  $('shiftDetail').textContent=active?`Started ${displayTime_(active.startedAt)}`:'Tap GO to begin a shift';\n  $('goBtn').textContent=active?'END SHIFT':'GO ONLINE';\n  $('goBtn').classList.toggle('online',!!active);\n  $('runtimeVersion').textContent=`Pulse OS ${app.data.uiVersion||c.version||'Runtime Lite'}`;\n  renderMap();renderRegions();renderCockpit();\n  if(!TEST_MODE)try{localStorage.setItem('pulse.lastState',JSON.stringify(app.data))}catch(e){}\n}\nfunction renderNow_(contract){\n  const r=contract.recommendation||{},health=contract.dataHealth||{},weather=contract.weather||{},pings=contract.pings||{},daily=contract.daily||{};\n  const low=String(r.action||'LOW_CONFIDENCE').toUpperCase()==='LOW_CONFIDENCE'||r.projectedNetPerHour==null;\n  const sourceKeys=['weather','events','flights','pings'];\n  const sources=sourceKeys.map(key=>{\n    const source=sourceState_(contract,key);\n    return`<div class=\"evidence-row\"><span>${esc(key.charAt(0).toUpperCase()+key.slice(1))}</span><strong>${chip_(source.status,source.status)}</strong></div>`;\n  }).join('');\n  const warnings=(contract.warnings||[]).map(w=>`<div class=\"warning-card\">${esc(w.message||w.code||'Pulse warning')}</div>`).join('');\n  return[\n    `<div class=\"state-card\"><div class=\"card-headline\"><div><h3>${low?'Driver judgment':esc(String(r.action||'Current guidance').replaceAll('_',' '))}</h3><p>${esc(low?recommendationReason_(r,contract.warnings):(r.recommendedZoneName||((contract.currentZone||{}).zoneName)||'Current area'))}</p></div>${chip_(health.overall,health.overall)}</div></div>`,\n    `<div class=\"summary-grid\"><div class=\"summary-box\"><strong>${weather.available?number(weather.temperatureF,0)+'°':'—'}</strong><small>Weather</small></div><div class=\"summary-box\"><strong>${Number(contract.events.length||0)}</strong><small>Events</small></div><div class=\"summary-box\"><strong>${Number(contract.flights.length||0)}</strong><small>Flights</small></div><div class=\"summary-box\"><strong>${Number(pings.total||0)}</strong><small>Observations</small></div></div>`,\n    `<div class=\"state-card\"><h3>Data health</h3>${sources}</div>`,\n    `<div class=\"state-card\"><h3>Today</h3><div class=\"evidence-row\"><span>Net recorded</span><strong>$${number(daily.net,2)}</strong></div><div class=\"evidence-row\"><span>Online minutes</span><strong>${Math.round(Number(daily.onlineMinutes||0))}</strong></div><div class=\"evidence-row\"><span>Current area</span><strong>${esc((contract.currentZone||{}).zoneName||'Unknown')}</strong></div></div>`,\n    warnings\n  ].join('');\n}\nfunction renderEvents_(contract){\n  const source=sourceState_(contract,'events'),events=contract.events||[];\n  if(source.status==='unavailable')return`<div class=\"state-card\"><div class=\"card-headline\"><h3>Events unavailable</h3>${chip_(source.status)}</div><p>${esc(source.detail||'No event source is available.')}</p></div>`;\n  if(!events.length)return`<div class=\"state-card\"><div class=\"card-headline\"><h3>No active event windows</h3>${chip_(source.status||'empty')}</div><p>${esc(source.detail||'No upcoming event releases are currently loaded.')}</p></div>`;\n  return events.map(event=>`<article class=\"cockpit-item\"><div class=\"card-headline\"><div><div class=\"item-title\">${esc(event.name||'Event')}</div><div class=\"item-meta\">${esc(event.venue||event.zoneId||'Local area')}</div></div>${chip_(source.status)}</div><div class=\"item-detail\">Expected end ${displayTime_(event.expectedEnd)}${Number(event.multiplier)>1?' · signal '+number(event.multiplier,2)+'×':''}</div></article>`).join('');\n}\nfunction renderFlights_(contract){\n  const source=sourceState_(contract,'flights'),flights=contract.flights||[];\n  if(source.status==='unavailable')return`<div class=\"state-card\"><div class=\"card-headline\"><h3>Flights unavailable</h3>${chip_(source.status)}</div><p>${esc(source.detail||'No flight source is available.')}</p></div>`;\n  if(!flights.length)return`<div class=\"state-card\"><div class=\"card-headline\"><h3>No arrivals in the active window</h3>${chip_(source.status||'empty')}</div><p>${esc(source.detail||'No upcoming arrivals are currently loaded.')}</p></div>`;\n  return flights.map(flight=>`<article class=\"cockpit-item\"><div class=\"card-headline\"><div><div class=\"item-title\">${esc(flight.flightId||'Arrival')}</div><div class=\"item-meta\">${displayTime_(flight.arrival)}</div></div>${chip_(String(flight.status||source.status),flight.status||source.status)}</div><div class=\"item-detail\">Arrival record from the normalized flight source.</div></article>`).join('');\n}\nfunction renderPlan_(contract){\n  const plan=contract.plan||[];\n  if(!plan.length)return'<div class=\"state-card\"><h3>No plan items</h3><p>Pulse has not returned a current plan.</p></div>';\n  return plan.map(item=>{\n    const low=String(item.action||'').toUpperCase()==='LOW_CONFIDENCE';\n    const title=low?'Driver judgment':String(item.action||item.kind||'Plan item').replaceAll('_',' ');\n    const when=item.startsAt?displayTime_(item.startsAt):(item.endsAt?'Ends '+displayTime_(item.endsAt):'Current window');\n    return`<article class=\"cockpit-item\"><div class=\"card-headline\"><div><div class=\"item-title\">${esc(title)}</div><div class=\"item-meta\">${esc(item.zoneName||item.zoneId||item.kind||'Pulse')}</div></div>${chip_(low?'partial':(item.kind==='DRIVER_ACTION'?'active':'fresh'),when)}</div><div class=\"item-detail\">${esc(item.reason||'No additional detail returned.')}</div></article>`;\n  }).join('');\n}\nfunction renderFriendRides_(){\n  if(app.friendRidesLoading)return'<div class=\"state-card\"><h3>Loading friend rides…</h3><p>Reading private requests and confirmed rides.</p></div>';\n  if(app.friendRidesError)return`<div class=\"state-card\"><div class=\"card-headline\"><h3>Friend rides unavailable</h3>${chip_('error')}</div><p>${esc(app.friendRidesError)}</p></div>`;\n  if(!app.friendRides)return'<div class=\"state-card\"><h3>Friend rides not loaded</h3><p>Open this tab to load private requests.</p></div>';\n  const rides=app.friendRides.rides||[],next=app.friendRides.nextConfirmed,requestUrl=String(app.friendRides.requestUrl||'');\n  const cards=[\n    `<div class=\"state-card\"><div class=\"card-headline\"><div><h3>Next confirmed ride</h3><p>${next?esc(next.requesterName+' · '+displayDateTime_(next.pickupAt)):'No confirmed ride scheduled'}</p></div>${chip_(next?'fresh':'empty',next?'confirmed':'none')}</div>${next?`<div class=\"item-detail\">${esc(next.pickupLocation)} → ${esc(next.destination)} · ${Number(next.passengerCount||1)} passenger${Number(next.passengerCount||1)===1?'':'s'}</div>`:''}</div>`,\n    `<div class=\"state-card\"><h3>Private request link</h3><p>Share only with a known adult. Requests require direct driver confirmation.</p><div class=\"friend-link\">${esc(requestUrl||'Link unavailable until deployed')}</div><button class=\"secondary\" id=\"copyFriendRideLinkBtn\" type=\"button\">COPY REQUEST LINK</button></div>`\n  ];\n  if(!rides.length)cards.push('<div class=\"state-card\"><h3>No active requests</h3><p>Requested and confirmed rides will appear here.</p></div>');\n  rides.forEach(ride=>{\n    const status=String(ride.status||'REQUESTED').toUpperCase();\n    const actions=status==='REQUESTED'\n      ?`<div class=\"friend-actions\"><button class=\"friend-action friend-write\" data-friend-id=\"${esc(ride.requestId)}\" data-friend-status=\"CONFIRMED\">CONFIRM</button><button class=\"friend-action friend-write\" data-friend-id=\"${esc(ride.requestId)}\" data-friend-status=\"DECLINED\">DECLINE</button></div>`\n      :`<div class=\"friend-actions\"><button class=\"friend-action friend-write\" data-friend-id=\"${esc(ride.requestId)}\" data-friend-status=\"COMPLETED\">COMPLETE</button><button class=\"friend-action friend-write\" data-friend-id=\"${esc(ride.requestId)}\" data-friend-status=\"CANCELLED\">CANCEL</button></div>`;\n    cards.push(`<article class=\"cockpit-item\"><div class=\"card-headline\"><div><div class=\"item-title\">${esc(ride.requesterName||'Friend request')}</div><div class=\"item-meta\">${displayDateTime_(ride.pickupAt)} · ${esc(status)}</div></div>${chip_(status==='CONFIRMED'?'fresh':'partial',status)}</div><div class=\"item-detail\">${esc(ride.pickupLocation)} → ${esc(ride.destination)} · ${Number(ride.passengerCount||1)} passenger${Number(ride.passengerCount||1)===1?'':'s'}<br>${esc(ride.contactMethod||'No contact provided')}${ride.notes?'<br>'+esc(ride.notes):''}</div>${actions}</article>`);\n  });\n  return cards.join('');\n}\nfunction renderLog_(){\n  if(app.historyLoading)return'<div class=\"state-card\"><h3>Loading log…</h3><p>Reading recent shift and evidence history.</p></div>';\n  if(app.historyError)return`<div class=\"state-card\"><div class=\"card-headline\"><h3>Log unavailable</h3>${chip_('error')}</div><p>${esc(app.historyError)}</p></div>`;\n  if(!app.history)return'<div class=\"state-card\"><h3>Log not loaded</h3><p>Open this tab to load recent shift history.</p></div>';\n  const shifts=app.history.shifts||[],pings=app.history.pingStats||{};\n  const cards=[`<div class=\"summary-grid\"><div class=\"summary-box\"><strong>${Number(pings.total||0)}</strong><small>Observations</small></div><div class=\"summary-box\"><strong>${shifts.length}</strong><small>Recent shifts</small></div></div>`];\n  if(!shifts.length)cards.push('<div class=\"state-card\"><h3>No shifts recorded</h3><p>The log will populate after completed or active shifts are available.</p></div>');\n  shifts.forEach(shift=>cards.push(`<article class=\"cockpit-item\"><div class=\"item-title\">${displayDateTime_(shift.startedAt)}</div><div class=\"item-meta\">${shift.endedAt?'Completed':'Active shift'}</div><div class=\"item-detail\">$${number(shift.net,2)} net · $${number(shift.netPerHour,2)}/hr</div></article>`));\n  return cards.join('');\n}\nfunction renderCockpit(){\n  const panel=$('cockpitPanel');if(!panel)return;\n  const contract=contractFrom_(app.data||{});\n  const tab=app.cockpitTab||'now';\n  const titles={now:'Now',events:'Events',flights:'Flights',plan:'Plan',log:'Log',rides:'Friend rides'};\n  $('cockpitTitle').textContent=titles[tab]||'Now';\n  document.querySelectorAll('[data-cockpit-tab]').forEach(btn=>{\n    const active=btn.dataset.cockpitTab===tab;\n    btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active));\n  });\n  const status=$('cockpitStatus'),health=(contract.dataHealth||{}).overall||'unknown';\n  status.textContent=tab==='rides'?'PRIVATE REQUESTS · separate from shift and trip records':`${String(health).toUpperCase()} · checked ${displayTime_(contract.checkedAt)}`;\n  panel.innerHTML=tab==='events'?renderEvents_(contract):tab==='flights'?renderFlights_(contract):tab==='plan'?renderPlan_(contract):tab==='log'?renderLog_():tab==='rides'?renderFriendRides_():renderNow_(contract);\n  if(tab==='rides'){\n    const copy=$('copyFriendRideLinkBtn');if(copy)copy.onclick=copyFriendRideLink_;\n    document.querySelectorAll('[data-friend-status]').forEach(btn=>btn.onclick=()=>updateFriendRideStatus_(btn.dataset.friendId,btn.dataset.friendStatus,btn));\n  }\n}\nfunction renderLegacy(data){\n  app.data=data;\n  const c=data.cockpit||{},r=c.recommendation||{},active=c.activeShift;\n  $('action').innerHTML=esc(String(r.action||'LOW_CONFIDENCE').replaceAll('_',' '));\n  $('zone').textContent=r.recommendedZoneName||((c.currentZone||{}).zoneName)||'Use your judgment';\n  $('netHourly').textContent=r.projectedNetPerHour==null?'—':number(r.projectedNetPerHour,2);\n  $('detail').textContent=r.projectedNetPerHour==null\n    ?`${Math.round(Number(r.confidence||0)*100)}% confidence · more ride evidence needed`\n    :`${Math.round(Number(r.confidence||0)*100)}% confidence · ${Number(r.repositionMinutes||0)} min reposition`;\n  $('shiftStatus').textContent=active?\"You're online\":\"You're offline\";\n  $('shiftDetail').textContent=active?`Started ${new Date(active.startedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`:'Tap GO to begin a shift';\n  $('goBtn').textContent=active?'END SHIFT':'GO ONLINE';\n  $('goBtn').classList.toggle('online',!!active);\n  $('runtimeVersion').textContent=`Pulse OS ${data.uiVersion||c.version||'Runtime Lite'}`;\n  renderMap();renderSignals();renderRegions();\n  if(!TEST_MODE)try{localStorage.setItem('pulse.lastState',JSON.stringify(data))}catch(e){}\n}\nfunction renderSignals(source){\n  const root=source||app.data||{},c=root.cockpit||root||{},s=c.signals||{},w=s.weather||{},daily=c.daily||{},p=c.pingStats||{};\n  const events=Array.isArray(s.events)?s.events:[],flights=Array.isArray(s.flights)?s.flights:[];\n  const weatherDetail=w.available\n    ? `${Number(w.precipitation||0)>0?'Precipitation active':'No precipitation reported'}${w.windMph!=null?' · '+number(w.windMph,0)+' mph wind':''}`\n    : 'No weather record yet — tap refresh below';\n  const flightDetail=flights.length\n    ? `${flights.length} arrival${flights.length===1?'':'s'} inside the next two hours`\n    : 'No upcoming airport arrivals are currently loaded';\n  const eventDetail=events.length\n    ? esc(events[0].name||events[0].venue||'Upcoming event')\n    : 'No active event release windows are currently loaded';\n  $('signalsCards').innerHTML=[\n    `<div class=\"card\"><h3>Weather</h3><div class=\"value\">${w.available?number(w.temperatureF,0)+'°':'—'}</div><p>${weatherDetail}</p></div>`,\n    `<div class=\"card\"><h3>Airport arrivals</h3><div class=\"value\">${flights.length}</div><p>${flightDetail}</p></div>`,\n    `<div class=\"card\"><h3>Events</h3><div class=\"value\">${events.length}</div><p>${eventDetail}</p></div>`,\n    `<div class=\"card\"><h3>Your evidence</h3><div class=\"value\">${Number(p.total||0)}</div><p>${number(daily.net,2)} net today · ${Math.round(Number(daily.onlineMinutes||0))} online minutes</p></div>`\n  ].join('');\n}\nfunction renderRegions(){\n  const regions=nearbyRegions(),live=Number((((app.data||{}).regionState||{}).liveHour)||new Date().getHours());\n  $('regionList').innerHTML=regions.map(r=>{\n    const bars=(r.trend||[]).map((v,h)=>`<i style=\"height:${Math.max(10,Math.min(100,Number(v||0)/4*100))}%;opacity:${h===live?1:.55}\"></i>`).join('');\n    return `<div class=\"card region\"><div><div class=\"region-name\">${esc(r.regionName)}</div><div class=\"region-meta\">${r.current?'Current area':(r.distanceMiles==null?esc(r.hub):number(r.distanceMiles,1)+' miles away')}</div></div><div class=\"spark\">${bars}</div></div>`;\n  }).join('')||'<div class=\"card\"><p>No region data available.</p></div>';\n}\nfunction renderFieldStatus_(){\n  const el=$('fieldStatus');if(!el)return;\n  if(TEST_MODE){\n    el.dataset.state='test';\n    el.textContent='TEST FIXTURE · NO WRITES · GPS FIXTURE · TRACE LOCKED';\n    return;\n  }\n  const p=app.pos||getCachedPosition()||{};\n  const hasPosition=Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng));\n  const gps=String(p.gpsStatus||(hasPosition?'cached':'unavailable')).replaceAll('_',' ').toUpperCase();\n  const accuracy=Number.isFinite(Number(p.accuracy))?' ±'+Math.round(Number(p.accuracy))+'M':'';\n  const tracing=app.routeWatchId!==null;\n  const points=Array.isArray(app.routePoints)?app.routePoints.length:0;\n  const miles=Number(app.routeMiles||0).toFixed(2);\n  const current=app.trip&&app.trip.active?tripLabel_(app.trip.active):'NONE';\n  const next=app.trip&&app.trip.queued?tripLabel_(app.trip.queued):'NONE';\n  el.dataset.state=hasPosition?(tracing?'live':'warning'):'warning';\n  el.textContent=`GPS ${gps}${accuracy} · TRACE ${tracing?'ON':'OFF'} · ${points} PTS · ${miles} MI · CURRENT ${current} · NEXT ${next}`;\n}\nasync function runFieldPreflight_(){\n  const resultEl=$('fieldPreflightResult'),btn=$('fieldPreflightBtn');\n  if(!resultEl||!btn)return;\n  if(TEST_MODE){\n    resultEl.textContent='TEST FIXTURE · NO SERVER CALLS · NO WRITES';\n    return;\n  }\n  btn.disabled=true;resultEl.textContent='Checking live DEV runtime…';\n  try{\n    const result=await server('pulseFieldPreflight');\n    if(!result||typeof result!=='object')throw new Error('pulseFieldPreflight returned no result. Redeploy the current Runtime Lite version.');\n    const endpointCount=Object.values(result.endpoints||{}).filter(Boolean).length;\n    const endpointTotal=Object.keys(result.endpoints||{}).length;\n    const trip=result.trip||{},signals=result.signals||{};\n    resultEl.textContent=[\n      `${result.ok?'READY':'NOT READY'} · ${String(result.environment||'DEV')}`,\n      `Headers ${String(((result.doctor||{}).overall)||'UNKNOWN')} · endpoints ${endpointCount}/${endpointTotal}`,\n      `GPS target ${String(result.spreadsheetId||'unknown')}`,\n      `Signals: weather ${signals.weatherAvailable?'yes':'no'} · events ${Number(signals.eventCount||0)} · flights ${Number(signals.flightCount||0)} · pings ${Number(signals.pingCount||0)}`,\n      `Shift ${result.shift?'active':'inactive'} · current trip ${trip.active?tripLabel_(trip.active):'none'} · next trip ${trip.queued?tripLabel_(trip.queued):'none'}`,\n      `Writes performed: ${result.writesPerformed?'YES':'NO'}`\n    ].join('\\n');\n    toast(result.ok?'Live preflight ready':'Live preflight needs review');\n  }catch(e){\n    resultEl.textContent='NOT READY · '+String(e.message||e);\n    toast('Live preflight failed');\n  }finally{btn.disabled=false}\n}\nfunction toggleMoreActions_(){\n  const panel=$('moreActions'),btn=$('moreActionsBtn');\n  if(!panel||!btn)return;\n  const opening=panel.hasAttribute('hidden');\n  if(opening)panel.removeAttribute('hidden');else panel.setAttribute('hidden','');\n  btn.classList.toggle('active',opening);\n  btn.setAttribute('aria-expanded',String(opening));\n  btn.textContent=opening?'LESS':'MORE';\n}\nfunction fitNearby(){renderMap();closeSheet('settingsSheet')}\nasync function refresh(force=false){\n  if(app.busy)return;setBusy(true);\n  try{\n    const pos=app.pos||getCachedPosition()||{};\n    const data=await server('pulseGetMobileState',pos,force);\n    render(data);\n    if(force)toast('Pulse refreshed');\n  }catch(e){toast(e.message||'Refresh failed')}\n  finally{setBusy(false)}\n}\nasync function updateLocation(){\n  $('locateBtn').disabled=true;\n  try{\n    app.pos=await locateQuick();\n    if(app.pos&&app.pos.lat){renderMap();await refresh(true);toast(`Location updated${app.pos.accuracy?' · ±'+Math.round(app.pos.accuracy)+'m':''}`)}\n    else toast('Location unavailable');\n  }finally{$('locateBtn').disabled=false}\n}\nasync function toggleShift(){\n  const active=contractFrom_(app.data||{}).shift;\n  if(active){openSheet('stopSheet');return}\n  if(app.busy)return;setBusy(true);\n  try{\n    const result=await server('pulseStartMobileShift',{});\n    if(!app.data)app.data={cockpit:{},regionState:{regions:[]}};\n    if(!app.data.cockpit)app.data.cockpit={};\n    const nextShift={shiftId:result.shiftId,startedAt:result.startedAt,elapsedMinutes:0};\n    app.data.cockpit.shift=nextShift;app.data.cockpit.activeShift=nextShift;\n    render(app.data);toast('Shift started');refresh(true);\n  }catch(e){toast(e.message||'Could not start shift')}\n  finally{setBusy(false)}\n}\nasync function toggleShiftLegacy(){\n  const active=app.data&&app.data.cockpit&&app.data.cockpit.activeShift;\n  if(active){openSheet('stopSheet');return}\n  if(app.busy)return;setBusy(true);\n  try{\n    const result=await server('pulseStartMobileShift',{});\n    if(!app.data)app.data={cockpit:{}};\n    app.data.cockpit.activeShift={shiftId:result.shiftId,startedAt:result.startedAt,elapsedMinutes:0};\n    render(app.data);toast('Shift started');refresh(true);\n  }catch(e){toast(e.message||'Could not start shift')}\n  finally{setBusy(false)}\n}\nasync function endShift(){\n  const btn=$('endShiftBtn');btn.disabled=true;\n  try{\n    const gross=Number($('grossInput').value||0),miles=Number($('milesInput').value||0);\n    const result=await server('pulseEndMobileShift',{gross,miles});\n    closeSheet('stopSheet');$('grossInput').value='';$('milesInput').value='';\n    app.data.cockpit.shift=null;app.data.cockpit.activeShift=null;\n    if(result.tripState)app.trip=result.tripState;\n    renderTripContext_();render(app.data);\n    toast(`Shift saved · $${number(result.net,2)} net`);refresh(true);\n  }catch(e){toast(e.message||'Could not end shift')}\n  finally{btn.disabled=false}\n}\nasync function loadCockpitHistory_(force=false){\n  if(app.historyLoaded&&!force)return app.history;\n  app.historyLoading=true;app.historyError='';renderCockpit();\n  try{\n    app.history=await server('pulseGetMobileHistory',10);\n    app.historyLoaded=true;\n    return app.history;\n  }catch(e){\n    app.historyError=e.message||'Could not load recent history';\n    return null;\n  }finally{\n    app.historyLoading=false;\n    renderCockpit();\n  }\n}\nasync function loadFriendRides_(force=false){\n  if(app.friendRides&&!force)return app.friendRides;\n  app.friendRidesLoading=true;app.friendRidesError='';renderCockpit();\n  try{\n    const payload=await server('pulseGetFriendRides');\n    if(!payload||typeof payload!=='object')throw new Error('Friend ride data returned no result.');\n    app.friendRides=payload;\n    return payload;\n  }catch(e){\n    app.friendRidesError=e.message||'Could not load friend ride requests';\n    return null;\n  }finally{\n    app.friendRidesLoading=false;\n    renderCockpit();\n  }\n}\nasync function updateFriendRideStatus_(requestId,status,btn){\n  if(btn)btn.disabled=true;\n  try{\n    await server('pulseUpdateFriendRideStatus',{requestId:requestId,status:status,note:'Updated from driver cockpit'});\n    app.friendRides=null;\n    await loadFriendRides_(true);\n    toast(String(status||'UPDATED').replaceAll('_',' '));\n  }catch(e){toast(e.message||'Could not update friend ride')}\n  finally{if(btn)btn.disabled=false}\n}\nasync function submitFriendRide_(event){\n  event.preventDefault();\n  const btn=$('friendSubmitBtn'),status=$('friendRequestStatus');\n  btn.disabled=true;status.textContent='Sending private ride request…';\n  try{\n    const result=await server('pulseSubmitFriendRide',{\n      token:FRIEND_REQUEST_TOKEN,\n      requesterName:$('friendRequesterName').value,\n      contactMethod:$('friendContactMethod').value,\n      pickupAt:$('friendPickupAt').value,\n      pickupLocation:$('friendPickupLocation').value,\n      destination:$('friendDestination').value,\n      passengerCount:Number($('friendPassengerCount').value||1),\n      notes:$('friendNotes').value,\n      consent:$('friendConsent').checked\n    });\n    status.textContent=`REQUESTED · ${result.requestId} · The driver must confirm this ride directly.`;\n    event.target.reset();\n  }catch(e){status.textContent='NOT SENT · '+String(e.message||e)}\n  finally{btn.disabled=false}\n}\nasync function copyFriendRideLink_(){\n  const link=String(app.friendRides&&app.friendRides.requestUrl||'');\n  if(!link){toast('Request link unavailable');return}\n  try{await navigator.clipboard.writeText(link);toast('Private request link copied')}\n  catch(e){prompt('Copy private request link',link)}\n}\nfunction openFriendRequestView_(){\n  document.body.classList.add('request-mode');\n  openSheet('friendRequestSheet');\n  const close=$('friendRequestSheet').querySelector('[data-close]');\n  if(close)close.hidden=true;\n}\nasync function selectCockpitTab_(tab){\n  app.cockpitTab=String(tab||'now');\n  renderCockpit();\n  if(app.cockpitTab==='log'&&!app.historyLoaded)await loadCockpitHistory_(false);\n  if(app.cockpitTab==='rides'&&!app.friendRides)await loadFriendRides_(false);\n}\nasync function openCockpit(tab='now',force=false){\n  openSheet('cockpitSheet');\n  app.cockpitTab=String(tab||'now');\n  renderCockpit();\n  const status=$('cockpitStatus');\n  status.textContent=force?'Refreshing normalized cockpit state…':'Checking normalized cockpit state…';\n  try{\n    const payload=await server('pulseGetLiveSignals',!!force);\n    if(!payload||typeof payload!=='object')throw new Error('Pulse returned no current state. Refresh once or redeploy the current Runtime Lite version.');\n    mergeContract_(payload);\n    render(app.data);\n    if(app.cockpitTab==='log')await loadCockpitHistory_(force);\n    if(app.cockpitTab==='rides')await loadFriendRides_(force);\n    status.textContent=app.cockpitTab==='rides'\n      ?'PRIVATE REQUESTS · separate from shift and trip records'\n      :`${String((contractFrom_(app.data).dataHealth||{}).overall||'unknown').toUpperCase()} · updated ${displayTime_(payload.checkedAt||Date.now())}`;\n  }catch(e){\n    $('cockpitPanel').innerHTML=`<div class=\"state-card\"><div class=\"card-headline\"><h3>Pulse view unavailable</h3>${chip_('error')}</div><p>${esc(e.message||'Could not load the normalized cockpit state')}</p></div>`;\n    status.textContent='ERROR · current view could not refresh';\n  }\n}\nasync function endShiftLegacy(){\n  const btn=$('endShiftBtn');btn.disabled=true;\n  try{\n    const gross=Number($('grossInput').value||0),miles=Number($('milesInput').value||0);\n    const result=await server('pulseEndMobileShift',{gross,miles});\n    closeSheet('stopSheet');$('grossInput').value='';$('milesInput').value='';\n    app.data.cockpit.activeShift=null;render(app.data);\n    toast(`Shift saved · ${number(result.net,2)} net`);refresh(true);\n  }catch(e){toast(e.message||'Could not end shift')}\n  finally{btn.disabled=false}\n}\nasync function logPing(type,btn){\n  const actionAt=Date.now();\n  if(btn.disabled||actionAt-Number(app.lastActionAt[type]||0)<ACTION_LOCK_MS){\n    toast('Duplicate tap ignored');\n    return;\n  }\n  app.lastActionAt[type]=actionAt;\n  btn.disabled=true;\n  const observedAt=new Date(actionAt).toISOString();\n  const clientEventId=clientEventId_();\n  try{\n    const active=app.data&&app.data.cockpit&&app.data.cockpit.activeShift;\n    const p=await capturePosition_();\n    if(Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)))app.pos=p;\n    const result=await server('pulseLogMobilePing',{\n      iso:observedAt,\n      type:type,\n      clientEventId:clientEventId,\n      lat:p.lat,\n      lng:p.lng,\n      accuracy:p.accuracy,\n      gpsStatus:p.gpsStatus,\n      gpsAgeMs:p.gpsAgeMs,\n      captureSource:p.captureSource,\n      onShift:!!active,\n      shiftMins:active?Math.max(0,Math.floor((Date.now()-new Date(active.startedAt))/60000)):0,\n      stagedZone:app.data&&app.data.cockpit&&app.data.cockpit.currentZone&&app.data.cockpit.currentZone.zoneId\n    });\n    if(result&&result.duplicate){\n      toast('Duplicate event ignored');\n      return result;\n    }\n    const cockpit=app.data.cockpit||(app.data.cockpit={});\n    const stats=cockpit.pings||cockpit.pingStats||{total:0,byType:{},byZone:{}};\n    stats.total=Number(stats.total||0)+1;\n    stats.byType=stats.byType||{};stats.byType[type]=Number(stats.byType[type]||0)+1;\n    cockpit.pings=stats;cockpit.pingStats=stats;\n    renderCockpit();\n    toast(type.replace('_',' ')+' saved · '+String(p.gpsStatus||'unavailable').replaceAll('_',' '));\n    return result;\n  }catch(e){toast(e.message||'Could not save observation');throw e;}\n  finally{btn.disabled=false}\n}\nasync function logPingLegacy(type,btn){\n  const actionAt=Date.now();\n  if(btn.disabled||actionAt-Number(app.lastActionAt[type]||0)<ACTION_LOCK_MS){\n    toast('Duplicate tap ignored');\n    return;\n  }\n  app.lastActionAt[type]=actionAt;\n  btn.disabled=true;\n  const observedAt=new Date(actionAt).toISOString();\n  const clientEventId=clientEventId_();\n  try{\n    const active=app.data&&app.data.cockpit&&app.data.cockpit.activeShift;\n    const p=await capturePosition_();\n    if(Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)))app.pos=p;\n    const result=await server('pulseLogMobilePing',{\n      iso:observedAt,\n      type:type,\n      clientEventId:clientEventId,\n      lat:p.lat,\n      lng:p.lng,\n      accuracy:p.accuracy,\n      gpsStatus:p.gpsStatus,\n      gpsAgeMs:p.gpsAgeMs,\n      captureSource:p.captureSource,\n      onShift:!!active,\n      shiftMins:active?Math.max(0,Math.floor((Date.now()-new Date(active.startedAt))/60000)):0,\n      stagedZone:app.data&&app.data.cockpit&&app.data.cockpit.currentZone&&app.data.cockpit.currentZone.zoneId\n    });\n    if(result&&result.duplicate){\n      toast('Duplicate event ignored');\n      return result;\n    }\n    const stats=app.data.cockpit.pingStats||(app.data.cockpit.pingStats={total:0,byType:{},byZone:{}});\n    stats.total=Number(stats.total||0)+1;\n    stats.byType[type]=Number(stats.byType[type]||0)+1;\n    renderSignals();\n    toast(type.replace('_',' ')+' saved · '+String(p.gpsStatus||'unavailable').replaceAll('_',' '));\n    return result;\n  }catch(e){toast(e.message||'Could not save observation');throw e;}\n  finally{btn.disabled=false}\n}\nfunction routeDistanceMiles_(){\n  if(!Array.isArray(app.routePoints)||app.routePoints.length<2)return Number(app.routeMiles)||0;\n  let miles=0;\n  for(let i=1;i<app.routePoints.length;i++){\n    const a=app.routePoints[i-1],b=app.routePoints[i];\n    const lat1=Number(a[0])*Math.PI/180,lat2=Number(b[0])*Math.PI/180;\n    const dLat=lat2-lat1,dLng=(Number(b[1])-Number(a[1]))*Math.PI/180;\n    const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;\n    miles+=3958.8*2*Math.asin(Math.sqrt(Math.min(1,h)));\n  }\n  app.routeMiles=Math.round(miles*100)/100;\n  return app.routeMiles;\n}\nfunction stopRouteTrail_(){\n  if(app.routeWatchId!==null&&navigator.geolocation){navigator.geolocation.clearWatch(app.routeWatchId);app.routeWatchId=null;}\n  if(app.routeLayer&&app.map){app.map.removeLayer(app.routeLayer);app.routeLayer=null;}\n  app.routePoints=[];\n  app.routeMiles=0;\n}\nfunction startRouteTrail_(){\n  if(TEST_MODE||app.routeWatchId!==null||!navigator.geolocation)return;\n  app.routePoints=[];\n  app.routeMiles=0;\n  if(app.pos&&Number.isFinite(Number(app.pos.lat))&&Number.isFinite(Number(app.pos.lng)))app.routePoints.push([Number(app.pos.lat),Number(app.pos.lng)]);\n  app.routeWatchId=navigator.geolocation.watchPosition(pos=>{\n    const point=[pos.coords.latitude,pos.coords.longitude];\n    app.routePoints.push(point);\n    if(app.routePoints.length>500)app.routePoints.shift();\n    routeDistanceMiles_();\n    if(!app.routeLayer)app.routeLayer=L.polyline(app.routePoints,{weight:5,opacity:.85}).addTo(app.map);\n    else app.routeLayer.setLatLngs(app.routePoints);\n    app.pos=positionResult_(pos.coords,'fresh','navigator-watch');\n  },()=>toast('Route GPS unavailable'),{enableHighAccuracy:true,maximumAge:3000,timeout:10000});\n}\nfunction tripLabel_(trip){\n  if(!trip)return'None';\n  const reservation=trip.reservation?'Reservation · ':'';\n  return reservation+String(trip.state||'ACCEPTED').replaceAll('_',' ');\n}\nfunction renderTripContext_(){\n  const el=$('tripContext');\n  if(!el)return;\n  const current=app.trip&&app.trip.active;\n  const next=app.trip&&app.trip.queued;\n  el.textContent='CURRENT: '+tripLabel_(current)+' · NEXT: '+tripLabel_(next);\n}\nasync function restoreTripState_(){\n  try{\n    const state=await server('pulseGetTripState');\n    app.trip=state||{active:null,queued:null};\n    renderTripContext_();\n    const active=app.trip&&app.trip.active;\n    if(active&&['PICKED_UP','ON_TRIP'].includes(String(active.state||'').toUpperCase()))startRouteTrail_();\n    return app.trip;\n  }catch(e){\n    app.trip=app.trip||{active:null,queued:null};\n    renderTripContext_();\n    return app.trip;\n  }\n}\nasync function tripAction_(action,btn){\n  if(btn&&btn.disabled)return;\n  if(btn)btn.disabled=true;\n  try{\n    const p=await capturePosition_();\n    const target=btn&&btn.dataset.tripTarget||'active';\n    const finishing=action==='DROPPED_OFF'||action==='COMPLETED';\n    const payload={\n      action:action,\n      target:target,\n      observedAt:new Date().toISOString(),\n      effectiveAt:new Date().toISOString(),\n      clientEventId:clientEventId_(),\n      reservation:btn&&btn.dataset.reservation==='true',\n      miles:finishing?routeDistanceMiles_():Number(app.routeMiles)||0,\n      lat:p.lat,lng:p.lng,accuracy:p.accuracy,gpsStatus:p.gpsStatus,gpsAgeMs:p.gpsAgeMs,captureSource:p.captureSource,\n      pickupZoneId:app.data&&app.data.cockpit&&app.data.cockpit.currentZone&&app.data.cockpit.currentZone.zoneId,\n      dropoffZoneId:app.data&&app.data.cockpit&&app.data.cockpit.currentZone&&app.data.cockpit.currentZone.zoneId\n    };\n    const result=await server('pulseTripAction',payload);\n    if(result&&result.duplicate){toast('Duplicate trip action ignored');return result;}\n    app.trip=result.state||app.trip;\n    renderTripContext_();\n    if(action==='PICKED_UP'||action==='ON_TRIP')startRouteTrail_();\n    if(finishing||(action==='CANCELLED'&&target!=='queued'))stopRouteTrail_();\n    toast(result.queued?'Trip queued':result.promoted?'Next trip promoted':result.completed?'Trip completed':action.replaceAll('_',' ')+' saved');\n    return result;\n  }catch(e){toast(e.message||'Trip action failed');throw e;}\n  finally{if(btn)btn.disabled=false;}\n}\nasync function openLiveSignals(force=false){\n  openSheet('signalsSheet');\n  renderSignals();\n  $('signalsStatus').textContent=force?'Refreshing live signals…':'Checking live signals…';\n  try{\n    const payload=await server('pulseGetLiveSignals',!!force);\n    if(!app.data)app.data={cockpit:{}};\n    if(!app.data.cockpit)app.data.cockpit={};\n    app.data.cockpit.signals=payload.signals||{};\n    app.data.cockpit.daily=payload.daily||{};\n    app.data.cockpit.pingStats=payload.pingStats||{};\n    renderSignals(payload);\n    $('signalsStatus').textContent=`Updated ${new Date(payload.checkedAt||Date.now()).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;\n  }catch(e){\n    $('signalsCards').innerHTML=`<div class=\"card\"><h3>Signals unavailable</h3><p>${esc(e.message||'Could not load live signals')}</p></div>`;\n    $('signalsStatus').textContent='Pulse could not refresh this panel.';\n  }\n}\nasync function openHistory(){\n  openSheet('historySheet');\n  $('historyCards').innerHTML='<div class=\"card\"><p>Loading history…</p></div>';\n  try{\n    const h=await server('pulseGetMobileHistory',10);\n    const shifts=h.shifts||[];\n    $('historyCards').innerHTML=[\n      `<div class=\"card\"><h3>Evidence</h3><div class=\"value\">${Number((h.pingStats||{}).total||0)}</div><p>Total driver observations recorded</p></div>`,\n      ...shifts.map(s=>`<div class=\"card\"><h3>${new Date(s.startedAt).toLocaleDateString()} · ${new Date(s.startedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</h3><p>${number(s.net,2)} net · ${number(s.netPerHour,2)}/hr${s.endedAt?'':' · active'}</p></div>`)\n    ].join('')||'<div class=\"card\"><p>No shifts recorded yet.</p></div>';\n  }catch(e){$('historyCards').innerHTML=`<div class=\"card\"><p>${esc(e.message)}</p></div>`}\n}\nasync function refreshPulseData(){\n  const btn=$('refreshDataBtn');btn.disabled=true;\n  try{await server('pulseRefreshMobileData');await refresh(true);toast('Weather and Pulse data refreshed')}\n  catch(e){toast(e.message||'Data refresh failed')}\n  finally{btn.disabled=false}\n}\ndocument.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>closeSheet(btn.dataset.close)));\ndocument.querySelectorAll('.ping[data-type]').forEach(btn=>btn.addEventListener('click',async()=>{const result=await logPing(btn.dataset.type,btn);if(btn.dataset.type==='ACCEPTED'&&!(result&&result.duplicate))await tripAction_('ACCEPTED',btn);}));\ndocument.querySelectorAll('[data-trip-action]').forEach(btn=>btn.addEventListener('click',()=>tripAction_(btn.dataset.tripAction,btn)));\n$('goBtn').onclick=toggleShift;$('endShiftBtn').onclick=endShift;\n$('signalsBtn').onclick=()=>openLiveSignals(false);$('trendsBtn').onclick=()=>openSheet('trendsSheet');\n$('settingsBtn').onclick=()=>openSheet('settingsSheet');$('logBtn').onclick=openHistory;\n$('locateBtn').onclick=updateLocation;$('refreshBtn').onclick=()=>refresh(true);\n$('homeBtn').onclick=fitNearby;$('fitBtn').onclick=fitNearby;$('refreshDataBtn').onclick=refreshPulseData;$('refreshSignalsBtn').onclick=()=>openLiveSignals(true);\nwindow.addEventListener('resize',()=>app.map&&setTimeout(()=>app.map.invalidateSize(true),100));\nwindow.addEventListener('orientationchange',()=>app.map&&setTimeout(()=>app.map.invalidateSize(true),250));\nwindow.addEventListener('error',e=>toast('UI error: '+(e.message||'unknown')));\nwindow.addEventListener('unhandledrejection',e=>toast('App error: '+((e.reason&&e.reason.message)||e.reason||'unknown')));\ndocument.querySelectorAll('[data-cockpit-tab]').forEach(btn=>btn.addEventListener('click',()=>selectCockpitTab_(btn.dataset.cockpitTab)));\n$('signalsBtn').onclick=()=>openCockpit('now',false);\n$('logBtn').onclick=()=>openCockpit('log',false);\n$('refreshCockpitBtn').onclick=()=>openCockpit(app.cockpitTab||'now',true);\n$('refreshSignalsBtn').onclick=()=>openCockpit(app.cockpitTab||'now',true);\n$('fieldPreflightBtn').onclick=runFieldPreflight_;\n$('moreActionsBtn').onclick=toggleMoreActions_;\n$('friendRideForm').addEventListener('submit',submitFriendRide_);\nrenderFieldStatus_();\nsetInterval(renderFieldStatus_,1500);\nasync function boot(){\n  if(FRIEND_REQUEST_VIEW){\n    openFriendRequestView_();\n    if(TEST_MODE)installTestMode_();\n    return;\n  }\n  initMap();\n  if(TEST_MODE){\n    app.pos=cloneTest_(TEST_POSITION);\n    render(cloneTest_(TEST_FIXTURE));\n    installTestMode_();\n    return;\n  }\n  try{\n    const cached=JSON.parse(localStorage.getItem('pulse.lastState')||'null');\n    if(cached)render(cached);\n  }catch(e){}\n  app.pos=getCachedPosition()||{};\n  const quick=await locateQuick();if(quick&&quick.lat)app.pos=quick;\n  await refresh(false);\n  await restoreTripState_();\n}\nfunction startPulse_(){\n  if(typeof google!=='undefined'&&google.script&&google.script.url&&google.script.url.getLocation){\n    google.script.url.getLocation(route=>{\n      const params=route&&route.parameter||{};\n      TEST_MODE=String(params.mode||'').toLowerCase()==='test';\n      FRIEND_REQUEST_TOKEN=String(params.request||'');\n      FRIEND_REQUEST_VIEW=!!FRIEND_REQUEST_TOKEN;\n      boot();\n    });\n    return;\n  }\n  boot();\n}\nstartPulse_();\n</script>\n</body>\n</html>";

function pulseMobileCache_() {
  return CacheService.getUserCache();
}

function pulseClearMobileCache_() {
  pulseMobileCache_().remove('pulse-mobile-state-v144');
}

function pulseGetMobileState(clientContext, forceRefresh) {
  const cache = pulseMobileCache_();
  if (!forceRefresh) {
    const cached = cache.get('pulse-mobile-state-v144');
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {}
    }
  }
  const state = getMapCockpitState(clientContext || {});
  state.uiVersion = '1.4.4-mobile';
  try { cache.put('pulse-mobile-state-v144', JSON.stringify(state), 45); } catch (e) {}
  return state;
}

function pulseStartMobileShift(payload) {
  const result = startShift(payload || {});
  pulseClearMobileCache_();
  return result;
}

function pulseEndMobileShift(payload) {
  const result = endShift(payload || {});
  pulseClearMobileCache_();
  return result;
}

function pulseLogMobilePing(payload) {
  const result = logPing(payload || {});
  pulseClearMobileCache_();
  return result;
}
function pulseTripAction(payload) {
  const result = transitionTrip(payload || {});
  pulseClearMobileCache_();
  return result;
}
function pulseGetTripState() {
  return tripStateSnapshot_();
}

const PULSE_FRIEND_RIDE_SHEET_='Friend Ride Requests';
const PULSE_FRIEND_RIDE_HEADERS_=Object.freeze([
  'Request ID','Source','Created At','Updated At','Requester Name','Contact Method',
  'Pickup At','Pickup Location','Destination','Passenger Count','Notes','Consent','Status','Status Note'
]);
const PULSE_FRIEND_RIDE_STATUSES_=Object.freeze(['REQUESTED','CONFIRMED','DECLINED','CANCELLED','COMPLETED']);

function friendRideSheet_(){
  const ss=pulseSpreadsheet_();
  let sh=ss.getSheetByName(PULSE_FRIEND_RIDE_SHEET_);
  if(!sh){
    sh=ss.insertSheet(PULSE_FRIEND_RIDE_SHEET_);
    sh.getRange(1,1,1,PULSE_FRIEND_RIDE_HEADERS_.length).setValues([PULSE_FRIEND_RIDE_HEADERS_]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  }
  const existing=sh.getLastColumn()?sh.getRange(1,1,1,PULSE_FRIEND_RIDE_HEADERS_.length).getValues()[0].map(String):[];
  if(!PULSE_FRIEND_RIDE_HEADERS_.every(function(h,i){return existing[i]===h;})){
    throw new Error('Friend Ride Requests headers do not match the expected DEV schema.');
  }
  return sh;
}
function friendRideToken_(){
  const props=PropertiesService.getScriptProperties();
  let token=String(props.getProperty('PULSE_FRIEND_REQUEST_TOKEN')||'');
  if(!token){
    token=Utilities.getUuid().replace(/-/g,'');
    props.setProperty('PULSE_FRIEND_REQUEST_TOKEN',token);
  }
  return token;
}
function friendRideIso_(value){
  if(value===''||value===null||value===undefined)return null;
  const date=value instanceof Date?value:new Date(value);
  return isNaN(date.getTime())?null:date.toISOString();
}
function friendRideRows_(){
  const sh=friendRideSheet_(),values=sh.getDataRange().getValues();
  if(values.length<2)return[];
  const headers=values[0].map(String);
  return values.slice(1).filter(function(row){return row.some(function(v){return v!==''&&v!==null;});}).map(function(row){
    const item=headers.reduce(function(out,key,index){out[key]=row[index];return out;},{});
    return{
      requestId:String(item['Request ID']||''),
      source:String(item.Source||'FRIEND_LINK'),
      createdAt:friendRideIso_(item['Created At']),
      updatedAt:friendRideIso_(item['Updated At']),
      requesterName:String(item['Requester Name']||''),
      contactMethod:String(item['Contact Method']||''),
      pickupAt:friendRideIso_(item['Pickup At']),
      pickupLocation:String(item['Pickup Location']||''),
      destination:String(item.Destination||''),
      passengerCount:Math.max(1,Number(item['Passenger Count'])||1),
      notes:String(item.Notes||''),
      consent:normalizeBoolean_(item.Consent),
      status:String(item.Status||'REQUESTED').toUpperCase(),
      statusNote:String(item['Status Note']||'')
    };
  });
}
function pulseGetFriendRides(){
  const rides=friendRideRows_()
    .filter(function(ride){return ride.status==='REQUESTED'||ride.status==='CONFIRMED';})
    .sort(function(a,b){return new Date(a.pickupAt)-new Date(b.pickupAt);});
  const nextConfirmed=rides.find(function(ride){return ride.status==='CONFIRMED'&&new Date(ride.pickupAt)>=new Date();})||null;
  const base=String(PropertiesService.getScriptProperties().getProperty('PULSE_FRIEND_REQUEST_BASE_URL')||'');
  return{
    checkedAt:new Date().toISOString(),
    requestUrl:base?base+'?request='+encodeURIComponent(friendRideToken_()):'',
    rides:rides,
    nextConfirmed:nextConfirmed,
    writesPerformed:false
  };
}
function pulseSubmitFriendRide(payload){
  payload=payload||{};
  if(String(payload.token||'')!==friendRideToken_())throw new Error('This private request link is not valid.');
  if(!normalizeBoolean_(payload.consent))throw new Error('Consent is required before sending a request.');
  const requesterName=String(payload.requesterName||'').trim();
  const contactMethod=String(payload.contactMethod||'').trim();
  const pickupLocation=String(payload.pickupLocation||'').trim();
  const destination=String(payload.destination||'').trim();
  const pickupAt=new Date(payload.pickupAt||'');
  if(!requesterName||!contactMethod||!pickupLocation||!destination||isNaN(pickupAt.getTime())){
    throw new Error('Name, contact, pickup time, pickup location, and destination are required.');
  }
  const now=new Date(),requestId='FR-'+Utilities.getUuid().slice(0,8).toUpperCase();
  friendRideSheet_().appendRow([
    requestId,'FRIEND_LINK',now,now,requesterName,contactMethod,pickupAt,pickupLocation,destination,
    Math.max(1,Number(payload.passengerCount)||1),String(payload.notes||''),true,'REQUESTED',''
  ]);
  return{ok:true,requestId:requestId,status:'REQUESTED',createdAt:now.toISOString(),tripRecordCreated:false};
}
function pulseUpdateFriendRideStatus(payload){
  payload=payload||{};
  const requestId=String(payload.requestId||'').trim();
  const status=String(payload.status||'').toUpperCase();
  if(!requestId||PULSE_FRIEND_RIDE_STATUSES_.indexOf(status)<0)throw new Error('Invalid friend ride status update.');
  const sh=friendRideSheet_(),values=sh.getDataRange().getValues(),headers=values[0].map(String);
  const idCol=headers.indexOf('Request ID'),statusCol=headers.indexOf('Status'),updatedCol=headers.indexOf('Updated At'),noteCol=headers.indexOf('Status Note');
  const row=values.findIndex(function(item,index){return index>0&&String(item[idCol])===requestId;});
  if(row<0)throw new Error('Friend ride request not found.');
  sh.getRange(row+1,statusCol+1).setValue(status);
  sh.getRange(row+1,updatedCol+1).setValue(new Date());
  sh.getRange(row+1,noteCol+1).setValue(String(payload.note||''));
  return{ok:true,requestId:requestId,status:status,tripRecordCreated:false};
}

function pulseFieldPreflight() {
  const doctor=doctorPulseRebuild();
  const endpoints={
    mobileState:typeof pulseGetMobileState==='function',
    liveSignals:typeof pulseGetLiveSignals==='function',
    pingWrite:typeof pulseLogMobilePing==='function',
    tripAction:typeof pulseTripAction==='function',
    shiftStart:typeof pulseStartMobileShift==='function',
    shiftEnd:typeof pulseEndMobileShift==='function'
  };
  const endpointReady=Object.keys(endpoints).every(function(key){return endpoints[key]===true;});
  const weather=latestWeather_();
  const events=upcomingEvents_(180);
  const flights=upcomingFlights_(120);
  const pings=getPingStats();
  return{
    ok:doctor.overall==='PASS'&&endpointReady,
    checkedAt:new Date().toISOString(),
    environment:'DEV',
    spreadsheetId:PULSE.SPREADSHEET_ID,
    doctor:doctor,
    endpoints:endpoints,
    shift:getActiveShift(),
    trip:tripStateSnapshot_(),
    signals:{
      weatherAvailable:!!weather.available,
      weatherObservedAt:weather.observedAt||null,
      eventCount:events.length,
      flightCount:flights.length,
      pingCount:Number(pings.total||0)
    },
    writesPerformed:false
  };
}

function pulseGetMobileHistory(limit) {
  return {
    shifts: listRecentShiftReplays(limit || 10),
    pingStats: getPingStats(),
    activeShift: getActiveShift()
  };
}

function pulseRefreshMobileData() {
  const checkedAt=new Date().toISOString();
  const refresh={weather:null,events:{status:'sheet-backed'},flights:{status:'sheet-backed'}};
  try{refresh.weather=refreshWeatherNow();}catch(e){refresh.weather={ok:false,status:'unavailable',error:String(e)};}
  pulseClearMobileCache_();
  return{ok:true,checkedAt:checkedAt,refresh:refresh,state:getCockpitState({})};
}


function pulseGetLiveSignals(forceRefresh) {
  if(forceRefresh||!latestWeather_().available){try{refreshWeatherNow();}catch(e){}}
  const state=getCockpitState({});
  return{
    checkedAt:state.checkedAt,
    recommendation:state.recommendation,
    currentZone:state.currentZone,
    dataHealth:state.dataHealth,
    weather:state.weather,
    events:state.events,
    flights:state.flights,
    plan:state.plan,
    pings:state.pings,
    shift:state.shift,
    warnings:state.warnings,
    signals:{weather:state.weather,events:state.events,flights:state.flights},
    daily:state.daily,
    pingStats:state.pings
  };
}

function showPulseDoctorResult(){console.log(JSON.stringify(doctorPulseRebuild(),null,2));}
