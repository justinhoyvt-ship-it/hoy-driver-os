from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
foreground_path = root / 'apps-script/hoy-driver-os-writer/ForegroundPickup.html'
package_path = root / 'pulse-forge/package.json'
task_path = root / 'pulse-agent/tasks/PULSE-082.json'
validator_path = root / 'pulse-forge/tests/validate-pulse-082-driver-upcoming.mjs'
workflow_path = root / '.github/workflows/pulse-082-apply.yml'
script_path = Path(__file__).resolve()

text = foreground_path.read_text()

STYLE = '''<style id="pulse082-style">
  .sched-card.p082-card{display:block;padding:12px;border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025));overflow:hidden}
  .sched-card.p082-card.p082-featured{border-color:rgba(43,212,229,.48);background:linear-gradient(145deg,rgba(43,212,229,.12),rgba(76,147,255,.07) 55%,rgba(255,255,255,.025));box-shadow:0 10px 28px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.08)}
  .p082-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
  .p082-badges{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap}
  .p082-badge{font-family:var(--mono);font-size:.58rem;letter-spacing:.06em;padding:4px 7px;border-radius:999px;border:1px solid var(--line);color:var(--muted);background:rgba(255,255,255,.04)}
  .p082-badge.pulse{color:var(--cyan);border-color:rgba(43,212,229,.4);background:rgba(43,212,229,.08)}
  .p082-badge.status{color:var(--green);border-color:rgba(69,227,148,.3);background:rgba(69,227,148,.06)}
  .p082-badge.next{color:#061325;background:linear-gradient(180deg,#7eeaf3,var(--cyan));border:0;font-weight:700}
  .p082-time{font-family:var(--mono);font-size:.74rem;color:var(--sun);white-space:nowrap;text-align:right}
  .p082-name{font-family:var(--display);font-size:1.05rem;font-weight:700;letter-spacing:-.01em;margin-bottom:9px}
  .p082-route{display:grid;grid-template-columns:14px 1fr;column-gap:9px;row-gap:0;margin:5px 0 10px}
  .p082-route-rail{grid-row:1 / span 2;position:relative;min-height:46px}
  .p082-route-rail:before{content:"";position:absolute;left:6px;top:8px;bottom:8px;width:2px;background:linear-gradient(180deg,var(--cyan),var(--blue));opacity:.7}
  .p082-dot{position:absolute;left:2px;width:10px;height:10px;border-radius:50%;background:var(--ink);border:2px solid var(--cyan);box-shadow:0 0 0 3px rgba(43,212,229,.08)}
  .p082-dot.pick{top:2px}.p082-dot.drop{bottom:2px;border-color:var(--blue);box-shadow:0 0 0 3px rgba(76,147,255,.08)}
  .p082-route-line{font-size:.78rem;line-height:1.35;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:1px 0 6px}
  .p082-route-line small{display:block;font-family:var(--mono);font-size:.56rem;letter-spacing:.05em;color:var(--muted);text-transform:uppercase;margin-bottom:1px}
  .p082-meta{display:flex;align-items:center;justify-content:space-between;gap:9px;padding-top:9px;border-top:1px solid var(--line)}
  .p082-fare{font-family:var(--display);font-size:1.04rem;font-weight:700;color:var(--green)}
  .p082-fare small{display:block;font-family:var(--mono);font-size:.55rem;font-weight:500;color:var(--muted);letter-spacing:.04em;text-transform:uppercase}
  .p082-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}
  .p082-actions button{min-height:38px;padding:0 11px;border-radius:9px;border:1px solid var(--line);background:rgba(255,255,255,.045);font-family:var(--display);font-size:.7rem;font-weight:700}
  .p082-actions button.p082-start{background:linear-gradient(180deg,#8ff5c1,var(--green) 55%,#1f9c63);color:#04220f;border:0}
  .p082-actions button:disabled{opacity:.42;cursor:default}
  .p082-empty{font-size:.76rem;color:var(--muted);padding:2px 1px}
</style>'''

if 'id="pulse082-style"' not in text:
    text = STYLE + '\n' + text

anchor = "  var p081BaseQueueTripLog=queueTripLog_;\n"
if 'var p082BaseRenderSched=renderSched;' not in text:
    if anchor not in text:
        raise SystemExit('PULSE-082 base render anchor missing')
    text = text.replace(anchor, anchor + "  var p082BaseRenderSched=renderSched;\n", 1)

BLOCK = r'''
  function p082When_(s){
    var diff=(Number(s.whenTS)||0)-now(),mins=Math.round(diff/60000);
    if(!isFinite(diff))return '';
    if(mins>90)return new Date(s.whenTS).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'});
    if(mins>=0)return 'in '+mins+'m';
    return Math.abs(mins)+'m ago';
  }
  function p082Due_(s){var diff=(Number(s.whenTS)||0)-now();return isFinite(diff)&&diff<=30*60000&&diff>-60*60000;}
  function p082Fare_(s){var raw=s&&s.quotedFare;if(raw===null||raw===''||raw===undefined)return null;var fare=Number(raw);return isFinite(fare)&&fare>=0?fare:null;}
  function p082Button_(label,cls,disabled,handler){var b=document.createElement('button');b.type='button';b.textContent=label;b.className=cls||'';b.disabled=!!disabled;b.onclick=handler;return b;}

  renderSched=function(){
    var lane=$('schedList');if(!lane)return;lane.innerHTML='';
    var rides=(S.scheduled||[]).slice().sort(function(a,b){return (a.whenTS||0)-(b.whenTS||0)});
    if(!rides.length){var empty=document.createElement('div');empty.className='p082-empty';empty.textContent='No upcoming rides';lane.appendChild(empty);return;}
    var nextPulse='';
    rides.some(function(x){if(x&&x.source==='rider'){nextPulse=x.id;return true;}return false;});
    rides.forEach(function(s){
      var pulse=s.source==='rider',featured=pulse&&s.id===nextPulse,due=p082Due_(s),fare=p082Fare_(s);
      var card=document.createElement('div');card.className='sched-card p082-card'+(featured?' p082-featured':'')+(due?' due':'');
      var top=document.createElement('div');top.className='p082-top';
      var badges=document.createElement('div');badges.className='p082-badges';
      if(featured){var next=document.createElement('span');next.className='p082-badge next';next.textContent='NEXT PULSE RIDE';badges.appendChild(next);}
      var source=document.createElement('span');source.className='p082-badge'+(pulse?' pulse':'');source.textContent=pulse?'PULSE DIRECT':'SCHEDULED';badges.appendChild(source);
      if(pulse){var status=document.createElement('span');status.className='p082-badge status';status.textContent=s.riderStatus||'Confirmed';badges.appendChild(status);}
      top.appendChild(badges);
      var time=document.createElement('div');time.className='p082-time';time.textContent=(due?'DUE · ':'')+p082When_(s);top.appendChild(time);card.appendChild(top);

      var name=document.createElement('div');name.className='p082-name';name.textContent=s.name||'Ride';card.appendChild(name);
      var route=document.createElement('div');route.className='p082-route';
      var rail=document.createElement('div');rail.className='p082-route-rail';rail.innerHTML='<i class="p082-dot pick"></i><i class="p082-dot drop"></i>';route.appendChild(rail);
      var pick=document.createElement('div');pick.className='p082-route-line';pick.innerHTML='<small>Pickup</small>'+esc(s.pickup||'Pickup not set');route.appendChild(pick);
      var drop=document.createElement('div');drop.className='p082-route-line';drop.innerHTML='<small>Destination</small>'+esc(s.dest||'Destination not set');route.appendChild(drop);card.appendChild(route);

      var meta=document.createElement('div');meta.className='p082-meta';
      var fareBox=document.createElement('div');fareBox.className='p082-fare';fareBox.innerHTML=fare!=null?('<small>Pulse fare</small>$'+money(fare)):('<small>Ride</small>'+esc(pulse?'Direct':'Scheduled'));meta.appendChild(fareBox);
      var acts=document.createElement('div');acts.className='p082-actions';
      if(s.pickup)acts.appendChild(p082Button_('Pickup','',false,function(){navTo(s.pickup)}));
      if(s.dest)acts.appendChild(p082Button_('Drop','',false,function(){navTo(s.dest)}));
      acts.appendChild(p082Button_('Begin pickup','p082-start',!!scheduledStartBusy[s.id]||!!S.active||!!S.queued,function(){startScheduled(s.id)}));
      if(!pulse)acts.appendChild(p082Button_('×','',false,function(){srv('removeReservation',s.id).then(function(list){schedFromServer(list)}).catch(function(){});}));
      meta.appendChild(acts);card.appendChild(meta);lane.appendChild(card);
    });
  };
'''

insert_marker = "\n  startScheduled=function(id){\n"
if 'function p082When_(s)' not in text:
    if insert_marker not in text:
        raise SystemExit('PULSE-082 startScheduled marker missing')
    text = text.replace(insert_marker, '\n' + BLOCK + insert_marker, 1)

foreground_path.write_text(text)

# Task contract
task_path.parent.mkdir(parents=True, exist_ok=True)
task_path.write_text(json.dumps({
  'schemaVersion': 1,
  'taskId': 'PULSE-082',
  'title': 'Driver upcoming Pulse ride surface',
  'status': 'STAGED_FOR_REVIEW',
  'automaticMerge': False,
  'productionDeployment': False,
  'productionMutation': False,
  'engineActivation': False,
  'scope': {
    'reuseScheduledLane': True,
    'reuseGinaProvenPersistence': True,
    'showPulseSource': True,
    'showQuotedFare': True,
    'showRiderStatus': True,
    'showPickupDestination': True,
    'oneTapBeginPickup': True,
    'noNewRideStore': True,
    'noRequestWriterChange': True,
    'noQrChange': True
  },
  'acceptanceCriteria': [
    'The next confirmed Pulse rider ride is visually prominent in the existing Scheduled lane.',
    'A Pulse Direct ride card shows rider, requested time, pickup, destination, rider status, and quoted fare when available.',
    'Pickup navigation, destination navigation, and Begin pickup remain available from the card.',
    'Manual scheduled rides remain visible and removable.',
    'Existing QR, request writer, fare engine, Inbox, held-request behavior, lifecycle, and Trip Log are unchanged.',
    'No new reservation or ride data store is introduced.',
    'No production deployment or automatic merge occurs.'
  ]
}, indent=2) + '\n')

validator = r'''import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const task=JSON.parse(read('pulse-agent/tasks/PULSE-082.json'));
const foreground=read('apps-script/hoy-driver-os-writer/ForegroundPickup.html');
const code=read('apps-script/hoy-driver-os-writer/Code.gs');
const index=read('apps-script/hoy-driver-os-writer/Index.html');
const failures=[];const check=(ok,msg)=>{if(!ok)failures.push(msg);};
check(task.taskId==='PULSE-082'&&task.status==='STAGED_FOR_REVIEW','PULSE-082 contract missing');
check(task.productionDeployment===false&&task.productionMutation===false&&task.automaticMerge===false,'PULSE-082 safety flags changed');
check(foreground.includes('id="pulse082-style"'),'PULSE-082 visual layer missing');
check(foreground.includes("next.textContent='NEXT PULSE RIDE'"),'next Pulse ride treatment missing');
check(foreground.includes("source.textContent=pulse?'PULSE DIRECT':'SCHEDULED'"),'ride source badge missing');
check(foreground.includes("status.textContent=s.riderStatus||'Confirmed'"),'rider status badge missing');
check(foreground.includes("'<small>Pulse fare</small>$'+money(fare)"),'quoted fare display missing');
check(foreground.includes("p082Button_('Begin pickup'"),'Begin pickup action missing');
check(foreground.includes("p082Button_('Pickup'" )&&foreground.includes("p082Button_('Drop'"),'navigation actions missing');
check(code.includes(".filter(r => r.status === 'CONFIRMED' && !started[r.requestId])"),'existing confirmed-request Scheduled projection missing');
check(index.includes('function startScheduled(id)'),'existing Scheduled lifecycle missing');
check(index.includes('function openQr()'),'QR lane changed or missing');
if(failures.length){console.error('PULSE-082 driver upcoming surface FAIL');failures.forEach(f=>console.error('- '+f));process.exit(1);}console.log('PULSE-082 driver upcoming surface PASS');
'''
validator_path.parent.mkdir(parents=True, exist_ok=True)
validator_path.write_text(validator)

pkg = json.loads(package_path.read_text())
cmd = pkg['scripts']['validate']
needle = 'node tests/validate-pulse-082-driver-upcoming.mjs'
if needle not in cmd:
    pkg['scripts']['validate'] = cmd + ' && ' + needle
package_path.write_text(json.dumps(pkg, indent=2) + '\n')

# Remove staging machinery from the final branch diff.
if workflow_path.exists(): workflow_path.unlink()
if script_path.exists(): script_path.unlink()
