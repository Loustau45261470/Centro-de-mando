/* ══════════════════════════════════════════════════════
   PALETA DE COMANDOS (Ctrl+K) — ejecutor instantáneo del centro de mando.
   Comandos estructurados + cualquier texto libre enrutado al cerebro de JARVIS.
   ══════════════════════════════════════════════════════ */
(function () {
  const style = document.createElement('style');
  style.textContent = `
    #agent-fab{display:none!important}
    #cmdk-overlay{position:fixed;inset:0;z-index:9990;display:none;align-items:flex-start;justify-content:center;
      padding:12vh 14px 0;background:radial-gradient(ellipse at 50% 28%, rgba(6,14,24,0.62), rgba(2,5,10,0.86));
      -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
    #cmdk-overlay.open{display:flex}
    #cmdk-panel{position:relative;width:min(620px,94vw);max-height:72vh;display:flex;flex-direction:column;
      background:linear-gradient(180deg,rgba(10,16,26,0.97),rgba(6,10,18,0.98));
      border:1px solid var(--hud-dim);border-radius:14px;overflow:hidden;
      box-shadow:0 0 50px rgba(56,189,248,0.18), 0 30px 80px rgba(0,0,0,0.6);animation:cmdk-in .16s ease-out}
    @keyframes cmdk-in{from{opacity:0;transform:translateY(-10px) scale(.985)}to{opacity:1;transform:none}}
    .cmdk-top{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(56,189,248,0.18)}
    .cmdk-prompt{color:var(--hud);font-family:var(--mono);font-weight:800;font-size:16px;text-shadow:0 0 10px var(--hud-dim)}
    #cmdk-input{flex:1;background:none;border:none;outline:none;color:var(--tp);font-family:var(--mono);font-size:16px;letter-spacing:.02em;min-width:0}
    #cmdk-input::placeholder{color:var(--tt)}
    .cmdk-hint{font-family:var(--mono);font-size:9px;color:var(--tt);letter-spacing:.1em;border:1px solid var(--border);border-radius:5px;padding:2px 6px}
    #cmdk-list{overflow-y:auto;padding:6px}
    .cmdk-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:9px;cursor:pointer;border:1px solid transparent}
    .cmdk-item .ci-ic{width:22px;text-align:center;color:var(--hud);font-family:var(--mono);font-size:13px;flex-shrink:0}
    .cmdk-item .ci-lbl{flex:1;font-size:14px;color:var(--ts);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cmdk-item .ci-cat{font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--tt);flex-shrink:0}
    .cmdk-item.sel{background:rgba(56,189,248,0.10);border-color:var(--hud-dim);box-shadow:inset 0 0 14px rgba(56,189,248,0.08)}
    .cmdk-item.sel .ci-lbl{color:var(--tp)}
    .cmdk-empty{padding:22px;text-align:center;color:var(--tt);font-family:var(--mono);font-size:12px}`;
  document.head.appendChild(style);

  const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const esc  = s => (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const nav  = tab => { const b=document.querySelector('.nav-btn[data-tab="'+tab+'"]'); if(b) b.click(); };
  const M    = id => { if (typeof openModal==='function') openModal(id); };
  const has  = f => typeof window[f]==='function';

  const CMDS = [
    {ic:'◢', lbl:'Ir a Vida', cat:'Navegar', kw:'vida metas dia', run:()=>nav('vida')},
    {ic:'◢', lbl:'Ir a Finanzas', cat:'Navegar', kw:'finanzas plata dinero gastos', run:()=>nav('finanzas')},
    {ic:'◢', lbl:'Ir a Salud', cat:'Navegar', kw:'salud gym peso agua', run:()=>nav('salud')},
    {ic:'◢', lbl:'Ir a Conocimiento', cat:'Navegar', kw:'conocimiento facultad estudio derecho', run:()=>nav('conocimiento')},
    {ic:'◢', lbl:'Ir a Inteligencia', cat:'Navegar', kw:'ia inteligencia', run:()=>nav('ia')},
    {ic:'＋', lbl:'Nueva meta — Hoy', cat:'Crear', kw:'meta objetivo dia tarea nueva', run:()=>M('modal-add-goal')},
    {ic:'＋', lbl:'Nueva meta — Mañana', cat:'Crear', kw:'meta manana tarea', run:()=>M('modal-add-goal-tom')},
    {ic:'＋', lbl:'Registrar movimiento', cat:'Finanzas', kw:'gasto ingreso transaccion movimiento plata', run:()=>{nav('finanzas');M('modal-add-txn');}},
    {ic:'＋', lbl:'Nueva cuenta', cat:'Finanzas', kw:'cuenta banco', run:()=>{nav('finanzas');M('modal-add-account');}},
    {ic:'＋', lbl:'Nueva suscripción', cat:'Finanzas', kw:'suscripcion sub pago', run:()=>{nav('finanzas');M('modal-add-sub');}},
    {ic:'＋', lbl:'Nuevo objetivo de adquisición', cat:'Finanzas', kw:'deseo comprar wishlist objetivo', run:()=>{nav('finanzas');M('modal-add-wish');}},
    {ic:'＋', lbl:'Nuevo hábito — Vida', cat:'Hábitos', kw:'habito vida', run:()=>{ if(has('openAddHabitFor')) openAddHabitFor('vida'); }},
    {ic:'＋', lbl:'Nuevo hábito — Salud', cat:'Hábitos', kw:'habito salud', run:()=>{ if(has('openAddHabitFor')) openAddHabitFor('salud'); }},
    {ic:'＋', lbl:'Nuevo hábito — Conocimiento', cat:'Hábitos', kw:'habito estudio', run:()=>{ if(has('openAddHabitFor')) openAddHabitFor('conocimiento'); }},
    {ic:'⚡', lbl:'Briefing del sistema', cat:'INTEL', kw:'briefing informe resumen analisis intel como voy proyeccion', run:()=>{ nav('vida'); if(window.JARVIS_INTEL){ JARVIS_INTEL.renderCard(); setTimeout(()=>{ const c=document.querySelector('.intel-card'); if(c) c.scrollIntoView({behavior:'smooth',block:'start'}); },120); if(window.JARVIS_EARS_sayEN) JARVIS_EARS_sayEN(JARVIS_INTEL.briefing()); else if(window.JARVIS&&JARVIS.speak) JARVIS.speak(JARVIS_INTEL.briefing(),{dynamic:true}); } }},
    {ic:'🎙', lbl:'Activar / silenciar "Hey Jarvis"', cat:'JARVIS', kw:'jarvis voz wake escuchar microfono', run:()=>{ if(window.JARVIS_EARS) JARVIS_EARS.toggleWake(); }},
    {ic:'◑', lbl:'Tema: Bloomberg', cat:'Tema', kw:'tema bloomberg', run:()=>{ if(has('applyTheme')) applyTheme('bloomberg'); }},
    {ic:'◑', lbl:'Tema: Ámbar', cat:'Tema', kw:'tema ambar amber', run:()=>{ if(has('applyTheme')) applyTheme('amber'); }},
    {ic:'◑', lbl:'Tema: Radar', cat:'Tema', kw:'tema radar', run:()=>{ if(has('applyTheme')) applyTheme('radar'); }},
    {ic:'◑', lbl:'Tema: Infrarrojo', cat:'Tema', kw:'tema infrarrojo infrared', run:()=>{ if(has('applyTheme')) applyTheme('infrared'); }},
    {ic:'◑', lbl:'Tema: Original', cat:'Tema', kw:'tema original normal clasico', run:()=>{ if(has('applyTheme')) applyTheme(''); }}
  ];

  let open=false, sel=0, results=[];
  const overlay=document.createElement('div'); overlay.id='cmdk-overlay';
  overlay.innerHTML =
    '<div id="cmdk-panel">'+
      '<div class="cmdk-top"><span class="cmdk-prompt">⌁</span>'+
        '<input id="cmdk-input" placeholder="Comando o pedido a JARVIS…" autocomplete="off" spellcheck="false">'+
        '<span class="cmdk-hint">ESC</span></div>'+
      '<div id="cmdk-list"></div></div>';
  document.body.appendChild(overlay);
  const input=overlay.querySelector('#cmdk-input');
  const list=overlay.querySelector('#cmdk-list');

  overlay.addEventListener('click', e=>{ if(e.target===overlay) closePalette(); });

  function build(q){
    const nq=norm(q).trim(); results=[];
    if(nq) results.push({ic:'⌁', lbl:'Ejecutar: “'+esc(q.trim())+'”', cat:'JARVIS', run:()=>{ if(window.JARVIS_EARS) JARVIS_EARS.handleCommand(q.trim()); }});
    CMDS.map(c=>{
      if(!nq) return {c,s:0};
      const hay=norm(c.lbl+' '+c.cat+' '+(c.kw||''));
      if(hay.includes(nq)) return {c,s:2};
      return {c, s: nq.split(/\s+/).every(w=>hay.includes(w)) ? 1 : -1};
    }).filter(x=>x.s>=0).sort((a,b)=>b.s-a.s).forEach(x=>results.push(x.c));
    sel=0; renderList();
  }
  function renderList(){
    if(!results.length){ list.innerHTML='<div class="cmdk-empty">Sin coincidencias</div>'; return; }
    list.innerHTML=results.map((c,i)=>
      '<div class="cmdk-item'+(i===sel?' sel':'')+'" data-i="'+i+'">'+
        '<span class="ci-ic">'+c.ic+'</span><span class="ci-lbl">'+c.lbl+'</span><span class="ci-cat">'+c.cat+'</span></div>').join('');
    list.querySelectorAll('.cmdk-item').forEach(el=>{
      el.onmousemove=()=>{ const i=+el.dataset.i; if(i!==sel){ sel=i; paint(); } };
      el.onclick=()=>{ sel=+el.dataset.i; runSel(); };
    });
    paint();
  }
  function paint(){
    const items=list.querySelectorAll('.cmdk-item');
    items.forEach((el,i)=>el.classList.toggle('sel', i===sel));
    if(items[sel]) items[sel].scrollIntoView({block:'nearest'});
  }
  function runSel(){ const c=results[sel]; if(!c) return; closePalette(); try { c.run(); } catch(e){ console.warn('cmdk', e); } }
  function openPalette(){ open=true; overlay.classList.add('open'); input.value=''; build(''); setTimeout(()=>input.focus(), 30); }
  function closePalette(){ open=false; overlay.classList.remove('open'); }

  input.addEventListener('input', ()=>build(input.value));
  input.addEventListener('keydown', e=>{
    if(e.key==='ArrowDown'){ e.preventDefault(); sel=Math.min(results.length-1, sel+1); paint(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); sel=Math.max(0, sel-1); paint(); }
    else if(e.key==='Enter'){ e.preventDefault(); runSel(); }
    else if(e.key==='Escape'){ e.preventDefault(); closePalette(); }
  });
  document.addEventListener('keydown', e=>{
    if((e.ctrlKey||e.metaKey) && (e.key==='k'||e.key==='K')){ e.preventDefault(); open?closePalette():openPalette(); }
    else if(e.key==='Escape' && open){ closePalette(); }
  });
})();
