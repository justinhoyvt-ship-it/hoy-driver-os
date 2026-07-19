(async()=>{
  const cfg=await fetch('content/site-links.json',{cache:'no-store'}).then(r=>r.json()).catch(()=>({links:{}}));
  document.querySelectorAll('[data-link-key]').forEach(el=>{
    const key=el.dataset.linkKey; const href=cfg.links&&cfg.links[key];
    if(href) el.href=href;
  });
  const roads=document.querySelector('[data-road-link]');
  if(roads&&cfg.links&&cfg.links.vtRoads) roads.href=cfg.links.vtRoads;
  const form=document.querySelector('[data-booking-form]');
  if(form){
    form.addEventListener('submit',e=>{
      e.preventDefault();
      const msg=document.querySelector('[data-form-message]');
      const endpoint=cfg.links&&cfg.links.bookingEndpoint;
      if(!endpoint){if(msg)msg.textContent='Request saved for review in this preview.';return;}
      if(msg)msg.textContent='Opening the request form…';
      location.href=endpoint;
    });
  }
})();
