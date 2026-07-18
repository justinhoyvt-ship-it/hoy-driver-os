
(function(){
  const root=document.documentElement;
  const buttons=[...document.querySelectorAll('[data-theme-choice]')];
  let timer=null;
  function liveTheme(){const h=new Date().getHours();if(h<7)return'sunrise';if(h<17)return'day';if(h<21)return'sunset';return'night'}
  function setTheme(theme,pressed){root.dataset.theme=theme;buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===pressed)));const meta=document.querySelector('meta[name="theme-color"]');const colors={sunrise:'#241335',day:'#77b7d8',sunset:'#30214d',night:'#070b1d'};if(meta)meta.content=colors[theme]||colors.sunrise;localStorage.setItem('pulse-theme',pressed)}
  function startLive(){clearInterval(timer);setTheme(liveTheme(),'live');timer=setInterval(()=>setTheme(liveTheme(),'live'),60000)}
  buttons.forEach(b=>b.addEventListener('click',()=>{clearInterval(timer);b.dataset.themeChoice==='live'?startLive():setTheme(b.dataset.themeChoice,b.dataset.themeChoice)}));
  const saved=localStorage.getItem('pulse-theme')||'live';saved==='live'?startLive():setTheme(saved,saved);
  document.querySelectorAll('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());
  const params=new URLSearchParams(location.search);if(params.get('submitted')==='1'){const n=document.querySelector('[data-success]');if(n)n.hidden=false}
  const access=document.querySelector('[data-access-form]');
  if(access){access.addEventListener('submit',async e=>{e.preventDefault();const code=(new FormData(access).get('code')||'').toString().trim().toUpperCase();const out=document.querySelector('[data-access-message]');const validator=(window.PULSE_CONFIG&&window.PULSE_CONFIG.accessValidationUrl)||'';if(!code){out.textContent='Enter the code you received.';return}if(!validator){out.textContent='Access screen ready. Connect the production code-validation endpoint in assets/site-config.js before launch.';return}out.textContent='Checking access…';try{const r=await fetch(validator,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code}),cache:'no-store'});const d=await r.json();if(!r.ok||!d.ok||!d.redirectUrl)throw new Error(d.message||'Access was not accepted.');location.assign(d.redirectUrl)}catch(err){out.textContent=err.message||'Access could not be checked. Contact Pulse for help.'}})}
  const track=document.querySelector('[data-tracking]');
  if(track){const endpoint=(window.PULSE_CONFIG&&window.PULSE_CONFIG.statusEndpointUrl)||'';const code=params.get('code')||'';const msg=document.querySelector('[data-track-message]');async function poll(){if(!endpoint){msg.textContent='Tracking shell ready. Connect the confirmed-trip status endpoint to begin live updates.';return}try{const r=await fetch(endpoint+'?code='+encodeURIComponent(code),{cache:'no-store'});if(!r.ok)throw new Error('status '+r.status);const d=await r.json();document.querySelector('[data-eta]').textContent=d.etaText||'Updating';document.querySelector('[data-distance]').textContent=d.distanceText||'—';msg.textContent=d.message||'Driver status updated.'}catch(err){msg.textContent='Live update unavailable. Your confirmed trip details remain visible.'}}poll();if(endpoint)setInterval(poll,15000)}
})();

(function(){
  const cfg=window.PULSE_SITE_CONFIG||{};
  const weather=document.querySelector('[data-weather-link]');
  if(weather&&cfg.weatherEmbedUrl){weather.href=cfg.weatherEmbedUrl;weather.removeAttribute('aria-disabled');weather.textContent='Open live weather →';}
})();
