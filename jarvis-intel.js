/* ══════════════════════════════════════════════════════
   JARVIS INTEL — motor de inteligencia POR SECCIÓN: cada tab
   (vida, finanzas, salud, conocimiento, ia) tiene su propia tarjeta
   ⚡ INTEL con KPIs y análisis usando únicamente los datos de esa
   sección. El seguimiento de objetivos usa las metas MENSUALES.
   Alimenta el briefing por voz / Ctrl+K.
   ══════════════════════════════════════════════════════ */
(function () {
  const style = document.createElement('style');
  style.textContent = `
    .intel-body{display:flex;flex-direction:column;gap:12px}
    .intel-insights{display:flex;flex-direction:column;gap:7px}
    .intel-row{display:flex;align-items:flex-start;gap:9px;font-size:12.5px;line-height:1.42;color:var(--ts)}
    .intel-row .ii-ic{flex-shrink:0;font-size:13px;width:16px;text-align:center;line-height:1.4}
    .intel-row.ok .ii-ic{color:var(--ok)} .intel-row.warn .ii-ic{color:var(--warn)} .intel-row.bad .ii-ic{color:var(--danger)} .intel-row.info .ii-ic{color:var(--hud)}
    .intel-row b{color:var(--tp);font-weight:700}
    .intel-var{display:flex;flex-direction:column;gap:5px;margin-top:2px}
    .intel-var-h{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--tt);margin-top:6px}
    .intel-var-h::after{content:'';flex:1;height:1px;background:var(--border)}
    .intel-var-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;line-height:1.3}
    .intel-var-row .vr-lbl{color:var(--ts);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .intel-var-row .vr-r{display:flex;align-items:center;gap:9px;flex-shrink:0;font-family:var(--mono)}
    .intel-var-row .vr-val{color:var(--tp);font-weight:700}
    .intel-var-row .vr-d{font-size:11px;font-weight:700;min-width:48px;text-align:right}
    .intel-var-row .vr-d.good{color:var(--ok)} .intel-var-row .vr-d.bad{color:var(--danger)} .intel-var-row .vr-d.flat{color:var(--tt)}`;
  document.head.appendChild(style);

  const SECTIONS = ['vida','finanzas','salud','conocimiento','ia'];
  const SEC_LABEL = { vida:'Vida', finanzas:'Finanzas', salud:'Salud', conocimiento:'Conocimiento', ia:'IA' };
  const _today = () => (typeof getActiveDate === 'function') ? getActiveDate() : new Date().toISOString().slice(0,10);
  const _ls = d => (typeof localStr === 'function') ? localStr(d) : d.toISOString().slice(0,10);
  const _money = () => (typeof fmtMoney === 'function');
  function _compact(n){
    const a = Math.abs(n), s = n < 0 ? '-' : '+';
    if (a >= 1e6) return s + (a/1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
    if (a >= 1e3) return s + Math.round(a/1e3) + 'k';
    return s + Math.round(a);
  }

  // ── Actividad de una sección (hábitos; vida suma metas del día) ──
  function habCount(sec, ds){
    const hs = (S.habitTrackers && S.habitTrackers[sec]) || []; let done = 0, tot = 0;
    hs.forEach(h => { const v = (h.days||{})[ds]; if (v==='rest') return; tot++; if (v==='done' || v==='partial') done++; });
    return { done, tot };
  }
  function taskStats(sec){
    try { if (window.PROY_VOICE && PROY_VOICE.statsFor) return PROY_VOICE.statsFor(sec); } catch(e) {}
    return { pending:0, overdue:0 };
  }

  // ── Objetivos MENSUALES de la sección ──
  function _monthGoals(sec){
    const mk = _today().slice(0,7);
    if (typeof getMonthlyGoals === 'function') return getMonthlyGoals(sec, mk);
    return ((S.monthlyGoals || {})[sec] || {})[mk] || [];
  }
  function _monthPace(sec){
    try {
      const goals = _monthGoals(sec); if (!goals.length) return null;
      const done = goals.filter(g => g.done).length, pct = done/goals.length*100;
      const now = new Date(_today()+'T00:00:00');
      const dim = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      const elapsed = Math.min(100, now.getDate()/dim*100);
      return { done, total: goals.length, pct, elapsed };
    } catch(e) { return null; }
  }
  function _monthObjInsight(sec, out){
    const mp = _monthPace(sec); if (!mp) return;
    const gap = mp.pct - mp.elapsed;
    const lvl = gap>=5 ? 'ok' : gap<=-12 ? 'bad' : gap<=-5 ? 'warn' : 'info';
    const word = gap>=5 ? 'adelantado' : gap<=-5 ? 'atrasado' : 'en ritmo';
    out.push({lvl, ic:'◎', html:`Objetivos del mes: <b>${mp.done}/${mp.total}</b> (${Math.round(mp.pct)}%) con ${Math.round(mp.elapsed)}% del mes transcurrido — <b>${word}</b>.`});
  }
  function _habitInsight(sec, out){
    const today = _today(), { done, tot } = habCount(sec, today); if (!tot) return;
    const pend = tot - done;
    if (pend === 0) out.push({lvl:'ok', ic:'✓', html:`Todos los hábitos de ${SEC_LABEL[sec]} de hoy registrados.`});
    else out.push({lvl: pend>tot/2 ? 'warn':'info', ic:'◷', html:`Te faltan <b>${pend}</b> de ${tot} hábitos de ${SEC_LABEL[sec]} hoy.`});
  }
  function _taskInsight(sec, out){
    const s = taskStats(sec);
    if (s.overdue > 0) out.push({lvl:'bad', ic:'!', html:`<b>${s.overdue}</b> tareas vencidas · ${s.pending} pendientes en ${SEC_LABEL[sec]}.`});
    else if (s.pending > 0) out.push({lvl:'info', ic:'▤', html:`<b>${s.pending}</b> tareas pendientes en ${SEC_LABEL[sec]}.`});
  }

  // ── Finanzas ──
  function _spendAnomaly(){
    try {
      const bm = {};
      (S.transactions||[]).forEach(t => { if (t.type!=='expense') return; const m = (t.date||'').slice(0,7); if (m) bm[m] = (bm[m]||0)+(+t.amount||0); });
      const ms = Object.keys(bm).sort(); const cur = bm[_today().slice(0,7)]; if (cur == null) return null;
      const prev = ms.filter(m => m < _today().slice(0,7)).slice(-3); if (!prev.length) return null;
      const avg = prev.reduce((s,m)=>s+bm[m],0)/prev.length; if (avg <= 0) return null;
      return { cur, avg, diff: (cur-avg)/avg*100 };
    } catch(e) { return null; }
  }
  function _monthlyFin(mk, maxDay){
    let inc = 0, exp = 0;
    (S.transactions||[]).forEach(t => { if (!_inMonthUpToDay(t.date||'', mk, maxDay)) return; const a = +t.amount||0; if (t.type==='expense') exp+=a; else if (t.type==='income') inc+=a; });
    return { inc, exp, bal: inc-exp };
  }
  function _monthBalance(){ try { return _monthlyFin(_today().slice(0,7)); } catch(e) { return null; } }
  function _prevMonth(mk){ const [y,m] = mk.split('-').map(Number); const d = new Date(y, m-2, 1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  function _inMonthUpToDay(ds, mk, maxDay){ // maxDay: nulo = mes completo; si no, solo días <= maxDay (comparación fecha con fecha)
    if (ds.slice(0,7) !== mk) return false;
    return maxDay == null || (+ds.slice(8,10)) <= maxDay;
  }
  function _habitMonthCount(habit, mk, maxDay){
    const days = habit.days || {}; let c = 0;
    for (const ds in days){ if (_inMonthUpToDay(ds, mk, maxDay)){ const v = days[ds]; if (v==='done') c+=1; else if (v==='partial') c+=0.5; } }
    return c;
  }
  function _monthWellnessAvg(mk, metric, maxDay){ // metric: 'energy' | 'hours'
    const sl = S.sleepLog || {}; let sum = 0, n = 0;
    for (const ds in sl){ if (!_inMonthUpToDay(ds, mk, maxDay)) continue; const e = sl[ds]; const v = metric==='hours' ? (e && e.hours) : (e && e.wellness && e.wellness[metric]); if (v){ sum += v; n++; } }
    return n ? sum/n : null;
  }
  function _monthGoalsDone(mk, maxDay){
    const goals = S.goals || {}; let c = 0;
    for (const ds in goals){ if (_inMonthUpToDay(ds, mk, maxDay)) c += (goals[ds]||[]).filter(x => x.done).length; }
    return c;
  }

  // ── Salud (bienestar / sueño) ──
  function _avgEnergy(){
    try {
      const today = new Date(_today()+'T00:00:00'); let sum = 0, n = 0;
      for (let i=0;i<7;i++){ const d=new Date(today); d.setDate(d.getDate()-i); const w=S.sleepLog && S.sleepLog[_ls(d)] && S.sleepLog[_ls(d)].wellness; if (w && w.energy){ sum+=w.energy; n++; } }
      return n ? { avg: sum/n, n } : null;
    } catch(e) { return null; }
  }
  function _lastSleep(){
    try {
      const today = new Date(_today()+'T00:00:00');
      for (let i=0;i<3;i++){ const d=new Date(today); d.setDate(d.getDate()-i); const e=S.sleepLog && S.sleepLog[_ls(d)]; if (e && e.hours) return { h: e.hours, ago: i }; }
    } catch(e) {}
    return null;
  }

  // ── Bloque de variación mensual (mes actual vs mes anterior) ──
  function _fmtM(v){ return _money() ? fmtMoney(Math.round(v),'ARS') : ('$'+Math.round(v)); }
  function _fmtCount(c){ return Number.isInteger(c) ? String(c) : c.toFixed(1); }
  function _delta(cur, prev, goodWhenUp, kind){
    if (prev == null) return `<span class="vr-d flat">—</span>`;
    const diff = cur - prev;
    if (Math.abs(diff) < 1e-9) return `<span class="vr-d flat">=</span>`;
    const up = diff > 0, good = up === goodWhenUp, cls = good ? 'good' : 'bad', arrow = up ? '▲' : '▼';
    let txt;
    if (kind === 'pct') txt = (prev === 0) ? 'nuevo' : Math.round(Math.abs(diff/prev*100)) + '%';
    else txt = _fmtCount(Math.abs(diff));
    return `<span class="vr-d ${cls}">${arrow} ${txt}</span>`;
  }
  function _varRow(label, val, deltaHtml){
    return `<div class="intel-var-row"><div class="vr-lbl">${label}</div><div class="vr-r"><span class="vr-val">${val}</span>${deltaHtml}</div></div>`;
  }
  function variationBlock(sec){
    const cur = _today().slice(0,7), prev = _prevMonth(cur);
    const day = +_today().slice(8,10); // comparación fecha con fecha: ambos meses solo hasta el día de hoy
    const metricRows = [];
    if (sec === 'finanzas') {
      const c = _monthlyFin(cur, day), p = _monthlyFin(prev, day);
      metricRows.push(_varRow('Gasto',   _fmtM(c.exp), _delta(c.exp, p.exp, false, 'pct')));
      metricRows.push(_varRow('Ingreso', _fmtM(c.inc), _delta(c.inc, p.inc, true,  'pct')));
      metricRows.push(_varRow('Balance', _fmtM(c.bal), _delta(c.bal, p.bal, true,  'pct')));
    } else if (sec === 'salud') {
      const ce = _monthWellnessAvg(cur,'energy',day), pe = _monthWellnessAvg(prev,'energy',day);
      if (ce != null) metricRows.push(_varRow('Energía prom', ce.toFixed(1)+'/5', _delta(ce, pe, true, 'abs')));
      const ch = _monthWellnessAvg(cur,'hours',day), ph = _monthWellnessAvg(prev,'hours',day);
      if (ch != null) metricRows.push(_varRow('Sueño prom', ch.toFixed(1)+'h', _delta(ch, ph, true, 'abs')));
    } else if (sec === 'vida') {
      const cg = _monthGoalsDone(cur, day), pg = _monthGoalsDone(prev, day);
      metricRows.push(_varRow('Metas cumplidas', String(cg), _delta(cg, pg, true, 'abs')));
    }
    const habits = (S.habitTrackers && S.habitTrackers[sec]) || [];
    const habitRows = habits.map(h => {
      const cc = _habitMonthCount(h, cur, day), pc = _habitMonthCount(h, prev, day);
      const name = (h.emoji ? h.emoji + ' ' : '') + (h.name || 'Hábito');
      return _varRow(name, _fmtCount(cc)+'×', _delta(cc, pc, true, 'abs'));
    });
    if (!metricRows.length && !habitRows.length) return '';
    let html = '<div class="intel-var">';
    if (metricRows.length) html += '<div class="intel-var-h">Variación mensual</div>' + metricRows.join('');
    if (habitRows.length)  html += '<div class="intel-var-h">Hábitos del mes</div>' + habitRows.join('');
    return html + '</div>';
  }

  function insights(sec){
    const out = [], today = _today();
    _monthObjInsight(sec, out);
    if (sec === 'vida') {
      try { const g=(S.goals&&S.goals[today])||[]; if (g.length){ const d=g.filter(x=>x.done).length; out.push({lvl:d===g.length?'ok':'info', ic:'▮', html:`Metas de hoy: <b>${d}/${g.length}</b> completadas.`}); } } catch(e) {}
      const st = (S.streak && S.streak.count) || 0;
      if (st > 0) out.push({lvl: st>=7?'ok':'info', ic:'🔥', html:`Racha de <b>${st}</b> día${st!==1?'s':''} cumpliendo metas.`});
    } else if (sec === 'finanzas') {
      const sa = _spendAnomaly();
      if (sa && _money()) {
        if (sa.diff >= 20) out.push({lvl:'warn', ic:'⚠', html:`Gasto del mes <b>${Math.round(sa.diff)}% sobre</b> tu promedio (${fmtMoney(Math.round(sa.cur),'ARS')} vs ${fmtMoney(Math.round(sa.avg),'ARS')}).`});
        else if (sa.diff <= -15) out.push({lvl:'ok', ic:'✓', html:`Gasto del mes <b>${Math.round(-sa.diff)}% bajo</b> tu promedio. Bien controlado.`});
      }
    } else if (sec === 'salud') {
      const ae = _avgEnergy();
      if (ae) out.push({lvl: ae.avg>=3.5?'ok':ae.avg<=2?'warn':'info', ic:'⚡', html:`Energía promedio <b>${ae.avg.toFixed(1)}/5</b> (últimos ${ae.n}d).`});
      const sl = _lastSleep();
      if (sl) out.push({lvl: sl.h>=7?'ok':sl.h<6?'warn':'info', ic:'☾', html:`${sl.ago===0?'Anoche':'Última noche'} dormiste <b>${sl.h}h</b>.`});
    }
    _habitInsight(sec, out);
    _taskInsight(sec, out);
    if (!out.length) out.push({lvl:'info', ic:'◇', html:`Cargá datos de ${SEC_LABEL[sec]} para empezar a recibir análisis.`});
    return out;
  }

  function briefing(){
    const seen = new Set(), lines = [];
    ['vida','finanzas','salud'].forEach(sec => {
      const i = insights(sec)[0];
      if (i){ const t = i.html.replace(/<[^>]+>/g,''); if (!seen.has(t)){ seen.add(t); lines.push(t); } }
    });
    return lines.slice(0,3).join(' ');
  }

  const _SEC_HUE = { vida:'#00D4FF', finanzas:'#22C55E', salud:'#F43F5E', conocimiento:'#6B8EFF', ia:'#C4D0E4' };

  // Serie de 14 días de % de hábitos cumplidos (para sparkline real)
  function _kSeries(sec){
    const base = new Date(_today()+'T00:00:00'); const out = [];
    for (let i=13;i>=0;i--){
      const d = new Date(base); d.setDate(d.getDate()-i);
      const ds = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      const c = habCount(sec, ds);
      out.push(c.tot ? (c.done/c.tot*100) : 0);
    }
    return out;
  }

  // Sparkline SVG inline (línea + área tenue + punto final luminoso)
  function _sparkSVG(vals, color){
    if (!vals || vals.length < 2) return '';
    const min = Math.min(...vals), max = Math.max(...vals), rng = (max-min)||1, n = vals.length;
    const pts = vals.map((y,i)=>{
      const px = (i/(n-1))*100;
      const py = 22 - ((y-min)/rng)*18;
      return px.toFixed(1)+','+py.toFixed(1);
    });
    const last = pts[pts.length-1].split(',');
    return `<svg class="k-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">`
      + `<polygon points="0,24 ${pts.join(' ')} 100,24" fill="${color}" fill-opacity="0.1"/>`
      + `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`
      + `<circle cx="${last[0]}" cy="${last[1]}" r="2" fill="${color}"/></svg>`;
  }

  // Count-up + flash de actualización sobre los valores de KPI
  function _animateKVals(container, firstPaint){
    container.querySelectorAll('.k-val').forEach(el=>{
      const txt = el.textContent;
      if (!firstPaint){ el.classList.remove('k-flash'); void el.offsetWidth; el.classList.add('k-flash'); return; }
      if (txt.includes('/')) { el.classList.add('k-pop'); return; }
      const m = txt.match(/-?\d[\d.]*/);
      if (!m || !isFinite(parseFloat(m[0]))) { el.classList.add('k-pop'); return; }
      const target = parseFloat(m[0]);
      const dec = (m[0].split('.')[1]||'').length;
      const pre = txt.slice(0, m.index), suf = txt.slice(m.index + m[0].length);
      const dur = 720, t0 = performance.now();
      el.classList.add('k-pop');
      (function step(t){
        const p = Math.min(1,(t-t0)/dur), e = 1-Math.pow(1-p,3);
        el.textContent = pre + (target*e).toFixed(dec) + suf;
        if (p<1) requestAnimationFrame(step); else el.textContent = txt;
      })(performance.now());
    });
  }

  function renderKPIs(sec){
    const el = document.getElementById('kpi-' + sec); if (!el) return;
    const firstPaint = !el.dataset.kpiInit;
    const today = _today();
    const { done:hd, tot:ht } = habCount(sec, today);
    const mp = _monthPace(sec); const mpct = mp ? Math.round(mp.pct) : 0;
    const hue = _SEC_HUE[sec] || '#38BDF8';
    const tile = (val, lbl, bar, spark) => `<div class="kpi-tile"><div class="k-val">${val}</div><div class="k-lbl">${lbl}</div>${spark||''}${bar!=null?`<div class="k-bar"><i style="width:${bar}%"></i></div>`:''}</div>`;
    const hb = tile(hd+'/'+ht, 'Hábitos', ht?Math.round(hd/ht*100):0, _sparkSVG(_kSeries(sec), hue));
    const ms = tile(mp ? (mp.done+'/'+mp.total) : '0/0', 'Mes', mpct);
    let html = '';
    if (sec === 'vida') {
      const g = (S.goals && S.goals[today]) || [];
      const dpct = g.length ? Math.round(g.filter(x => x.done).length / g.length * 100) : 0;
      const st = (S.streak && S.streak.count) || 0;
      html = tile(dpct+'%','Día',dpct) + tile('🔥 '+st,'Racha',null) + hb + ms;
    } else if (sec === 'finanzas') {
      const mb = _monthBalance(), sa = _spendAnomaly();
      const balV = mb ? _compact(mb.bal) : '—';
      const gastoV = sa ? (sa.diff>=0?'+':'') + Math.round(sa.diff) + '%' : '—';
      html = tile(balV,'Balance',null) + tile(gastoV,'Gasto/prom',null) + hb + ms;
    } else if (sec === 'salud') {
      const ae = _avgEnergy(), sl = _lastSleep();
      const enV = ae ? ae.avg.toFixed(1) : '—';
      const slV = sl ? sl.h+'h' : '—';
      html = tile(enV,'Energía',ae?Math.round(ae.avg/5*100):0) + tile(slV,'Sueño',sl?Math.min(100,Math.round(sl.h/8*100)):0) + hb + ms;
    } else {
      const ts = taskStats(sec);
      html = hb + tile(ts.pending,'Tareas',null) + tile(ts.overdue,'Vencidas',null) + ms;
    }
    el.innerHTML = html;
    try { _animateKVals(el, firstPaint); } catch(e){}
    el.dataset.kpiInit = '1';
  }

  function renderSection(sec){
    try { renderKPIs(sec); } catch(e) {}
    const body = document.getElementById('intel-body-' + sec); if (!body) return;
    try {
      const ins = insights(sec).map(i => `<div class="intel-row ${i.lvl}"><span class="ii-ic">${i.ic}</span><span>${i.html}</span></div>`).join('');
      body.innerHTML = `<div class="intel-insights">${ins}</div>` + variationBlock(sec);
    } catch(e) { body.innerHTML = '<div class="intel-row info"><span class="ii-ic">◇</span><span>Análisis no disponible por ahora.</span></div>'; }
  }

  function renderCard(sec){
    if (sec && SECTIONS.includes(sec)) renderSection(sec);
    else SECTIONS.forEach(renderSection);
  }

  // ── Briefing matinal automático ──
  // Primera vez que se abre la app cada día, entre las 07:00 y las 12:59, si JARVIS está
  // habilitado y hay algo que decir: lo saluda y le lee el briefing. Guard total: cualquier
  // pieza ausente (JARVIS, EARS, showToast) → no habla, no rompe el resto de la app.
  function _pendingGoalsLine() {
    try {
      const g = (S.goals && S.goals[_today()]) || [];
      const pend = g.filter(x => !x.done).length;
      if (!pend) return '';
      return pend === 1 ? "You still have 1 goal left for today." : `You still have ${pend} goals left for today.`;
    } catch(e) { return ''; }
  }
  function _speakBriefingText(text) {
    try {
      if (window.JARVIS_EARS && typeof JARVIS_EARS.sayEN === 'function') { JARVIS_EARS.sayEN(text); return; }
      if (typeof window.JARVIS_EARS_sayEN === 'function') { window.JARVIS_EARS_sayEN(text); return; }
      if (window.JARVIS && typeof JARVIS.speak === 'function') JARVIS.speak(text);
    } catch(e) {}
  }
  function _maybeMorningBriefing() {
    try {
      const h = new Date().getHours();
      if (h < 7 || h >= 13) return;                                      // fuera de la ventana 07:00-12:59
      if (localStorage.getItem('jarvis_enabled') !== '1') return;        // JARVIS no habilitado
      if (!window.JARVIS || typeof JARVIS.speak !== 'function') return;  // JARVIS no cargó
      const today = _today();
      if (localStorage.getItem('jarvis_last_briefing') === today) return; // ya se dio hoy
      const b = briefing();
      if (!b) return;                                                    // nada que decir
      localStorage.setItem('jarvis_last_briefing', today);
      let text = 'Good morning, sir. ' + b;
      const gl = _pendingGoalsLine();
      if (gl) text += ' ' + gl;
      _speakBriefingText(text);
      if (typeof showToast === 'function') showToast('☀️ ' + text, 15000);
    } catch(e) {}
  }

  window.JARVIS_INTEL = { insights, briefing, renderCard, renderKPIs: renderCard };
  setTimeout(_maybeMorningBriefing, 10000);
  setTimeout(() => renderCard(), 1200);
  setInterval(() => {
    const t = (typeof currentTab !== 'undefined' && currentTab) || 'vida';
    const p = document.getElementById('tab-' + t);
    if (p && p.classList.contains('active')) renderCard(t);
  }, 60000);
})();
