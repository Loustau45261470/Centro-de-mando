// ════════════════════════════════════════════════════════
// SGC — Sistema de Gestión de Calidad
// Métricas de desempeño sobre 2 procesos: inversiones (precisión de
// proyecciones) y entrenamiento (progresión mensual de peso, sobre el
// log del gym existente).
// Datos en S.sgc (clave aislada del estado; no toca el sync).
// S.sgc.estudio puede seguir existiendo en documentos viejos (feature
// de sesiones de estudio/quiz dada de baja) — ya no se lee ni se
// escribe, no confundir con estado vivo.
// ════════════════════════════════════════════════════════
const SGC = (() => {

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const hoy = () => (typeof getActiveDate === 'function' ? getActiveDate() : new Date().toISOString().slice(0, 10));
  const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const addMeses = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
  const diasEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  const fmtF = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—';

  const STD = { inv: 85, gym: 5 };   // estándares del SGC
  const WARN = { inv: 80, gym: 4 };  // umbral ⚠️

  function ensureState() {
    if (!S.sgc) S.sgc = { proyecciones: [] };
    if (!Array.isArray(S.sgc.proyecciones)) S.sgc.proyecciones = [];
  }

  const badge = (val, std, warn) => val == null ? '<span class="text-ter">—</span>'
    : val >= std ? '✅' : val >= warn ? '⚠️' : '❌';

  // ── Cartera (precios reales para auto-resolver proyecciones) ──
  let _cartera = null, _carteraP = null;
  function fetchCartera() {
    if (_carteraP) return _carteraP;
    _carteraP = fetch('data/cartera/latest.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(d => { _cartera = d; return d; })
      .catch(() => null);
    return _carteraP;
  }
  function precioCartera(simbolo) {
    const c = (_cartera?.cedears || []).find(x => (x.simbolo || '').toUpperCase() === simbolo.toUpperCase());
    return c ? { precio: c.precio, mes: _cartera.mes } : null;
  }

  // ══════════ MÉTRICAS ══════════

  // proyección porcentual: varProy (%) vs variación real desde precioBase.
  // precisión = 100 - error RELATIVO a la proyección (proy 5% / real 4% → 20% error → 80%).
  // Soporta legacy (precioProy absoluto, error relativo al precio real).
  const varRealDe = p => (p.precioReal - p.precioBase) / p.precioBase * 100;
  const precisionDe = p => {
    if (p.varProy != null) {
      const err = Math.abs(p.varProy - varRealDe(p));
      if (p.varProy === 0) return err < 0.05 ? 100 : 0;   // proyección plana: evita /0
      return Math.max(0, 100 - err / Math.abs(p.varProy) * 100);
    }
    return Math.max(0, 100 - Math.abs(p.precioProy - p.precioReal) / p.precioReal * 100);
  };
  const fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

  function resolverProyecciones() {
    // proyecciones vencidas sin precio real → intentar resolver con el JSON del agente IOL
    let cambio = false;
    (S.sgc.proyecciones || []).forEach(p => {
      if (p.precioReal == null && hoy() >= p.fechaVence) {
        const c = precioCartera(p.simbolo);
        if (c) { p.precioReal = c.precio; p.fuente = 'IOL ' + c.mes; cambio = true; }
      }
    });
    if (cambio) saveState();
  }

  function metricInv() {
    const yr = hoy().slice(0, 4);
    const res = (S.sgc.proyecciones || []).filter(p => p.precioReal != null && p.fechaVence.slice(0, 4) === yr);
    const val = res.length ? res.reduce((a, p) => a + precisionDe(p), 0) / res.length : null;
    return { val, n: res.length, resueltas: res };
  }

  function volMes(mes) {
    // { exId: volumen total (Σ peso×reps) } para un 'YYYY-MM' sobre S.routineLog
    const out = {};
    Object.values(S.routineLog || {}).forEach(hist => (hist || []).forEach(e => {
      if (!e.date || e.date.slice(0, 7) !== mes || !e.exSets) return;
      Object.entries(e.exSets).forEach(([exId, sets]) => (sets || []).forEach(s => {
        out[exId] = (out[exId] || 0) + (s.weight || 0) * (s.reps || 0);
      }));
    }));
    return out;
  }

  function metricGym() {
    const mesAct = hoy().slice(0, 7);
    const mesAnt = addMeses(hoy().slice(0, 8) + '01', -1).slice(0, 7);
    const act = volMes(mesAct), ant = volMes(mesAnt);
    const nombres = {};
    (S.routines || []).forEach(r => (r.exercises || []).forEach(ex => { nombres[ex.id] = ex.name; }));
    const items = Object.keys(ant).filter(id => act[id] != null && ant[id] > 0)
      .map(id => ({ id, nombre: nombres[id] || id, ant: ant[id], act: act[id], prog: (act[id] - ant[id]) / ant[id] * 100 }))
      .sort((a, b) => a.prog - b.prog);
    // valor global: volumen total del mes vs mes anterior (no promedio por ejercicio)
    const totAnt = Object.values(ant).reduce((a, b) => a + b, 0);
    const totAct = Object.keys(ant).reduce((a, id) => a + (act[id] || 0), 0);
    const val = totAnt > 0 ? (totAct - totAnt) / totAnt * 100 : null;
    return { val, items, mesAct, mesAnt, totAnt, totAct };
  }

  function tendencia4Sem(items, fechaFn, valFn) {
    // promedio semanal (4 semanas hacia atrás desde hoy); null si sin datos
    const out = [];
    for (let w = 3; w >= 0; w--) {
      const desde = addDias(hoy(), -7 * (w + 1) + 1), hasta = addDias(hoy(), -7 * w);
      const arr = items.filter(x => fechaFn(x) >= desde && fechaFn(x) <= hasta).map(valFn);
      out.push(arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    }
    return out;
  }

  function barras(tend, std) {
    const max = Math.max(std, ...tend.filter(v => v != null), 1);
    return `<div style="display:flex;gap:5px;align-items:flex-end;height:34px;margin:6px 0 2px">` + tend.map((v, i) => {
      const h = v == null ? 3 : Math.max(4, v / max * 34);
      const col = v == null ? 'var(--tt)' : v >= std ? 'var(--ok, #22C55E)' : '#F43F5E';
      return `<div title="Semana -${3 - i}: ${v == null ? 'sin datos' : v.toFixed(1)}" style="flex:1;height:${h}px;border-radius:2px;background:${col};opacity:${v == null ? .25 : .8}"></div>`;
    }).join('') + `</div><div style="font-size:var(--fs-12);color:var(--tt);letter-spacing:.08em">TENDENCIA 4 SEMANAS · línea de estándar ${std}${std === STD.gym ? '%' : '%'}</div>`;
  }

  // ══════════ INFORME EN CARDS DE ANÁLISIS ══════════

  function bloque(titulo, m, std, warn, unidad, alerta, extra, csvKey) {
    const semana = `Semana del ${fmtF(addDias(hoy(), -6))} al ${fmtF(hoy())}`;
    const valTxt = m.val == null ? 'Sin datos aún' : (m.val >= 0 && std === STD.gym ? '+' : '') + m.val.toFixed(1) + unidad;
    const alertHtml = (m.val != null && m.val < warn) ? `<div style="font-size:var(--fs-12-5);color:#F43F5E;margin-top:4px">🔔 ${alerta}</div>` : '';
    return `<div style="border-top:1px solid rgba(255,255,255,.06);margin-top:10px;padding-top:8px">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <span style="font-size:var(--fs-12-5);font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--tt)">🛡️ SGC · ${titulo}</span>
        <span style="font-size:var(--fs-12);color:var(--tt)">${semana}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
        <span style="font-family:var(--mono);font-size:var(--fs-16);font-weight:800">${valTxt} <span style="font-size:var(--fs-12-5)">${badge(m.val, std, warn)}</span></span>
        <span style="font-size:var(--fs-12-5);color:var(--tt)">estándar ${std === STD.gym ? '+' + std + '% mensual' : std + '%'}</span>
      </div>
      ${extra || ''}${alertHtml}
      <div style="text-align:right;margin-top:4px"><button class="btn btn-ghost btn-sm" style="font-size:var(--fs-12-5);padding:2px 8px" onclick="SGC.exportCSV('${csvKey}')">⬇ CSV</button></div>
    </div>`;
  }

  function renderAnalisis(sec) {
    ensureState();
    const el = document.getElementById('sgc-analisis-' + sec); if (!el) return;
    if (sec === 'finanzas') {
      resolverProyecciones();
      const m = metricInv();
      const pend = (S.sgc.proyecciones || []).filter(p => p.precioReal == null).length;
      const tend = tendencia4Sem(m.resueltas, p => p.fechaVence, precisionDe);
      el.innerHTML = bloque('Precisión de proyecciones (YTD)', m, STD.inv, WARN.inv, '%',
        'Revisar análisis fundamental',
        `${barras(tend, STD.inv)}<div style="font-size:var(--fs-12-5);color:var(--tt);margin-top:3px">${m.n} resueltas · ${pend} pendientes — registro en la <b>Cartera de inversión</b></div>`, 'inv');
    }
    if (sec === 'salud') {
      const m = metricGym();
      const peores = m.items.slice(0, 2).map(x => `<b>${esc(x.nombre)}</b> ${fmtPct(x.prog)}`).join(' · ');
      el.innerHTML = bloque(`Progresión de volumen (${m.mesAnt} → ${m.mesAct})`, m, STD.gym, WARN.gym, '%',
        'Revisar descanso/nutrición',
        `<div style="font-size:var(--fs-12-5);color:var(--tt);margin-top:3px">${m.items.length
          ? `${(m.totAct / 1000).toFixed(1)}t vs ${(m.totAnt / 1000).toFixed(1)}t · ${m.items.length} ejercicios comparados` + (peores ? ' · rezagados: ' + peores : '')
          : 'Se necesitan registros en dos meses consecutivos'}</div>`, 'gym');
    }
  }

  function renderTodo() { ['finanzas', 'salud'].forEach(renderAnalisis); }

  // ══════════ PROYECCIONES — overlay de cartera ══════════

  function renderProyecciones(el, carteraData) {
    ensureState();
    if (!el) return;
    if (carteraData) _cartera = carteraData;
    resolverProyecciones();
    const pend = (S.sgc.proyecciones || []).filter(p => p.precioReal == null).sort((a, b) => a.fechaVence.localeCompare(b.fechaVence));
    const res = (S.sgc.proyecciones || []).filter(p => p.precioReal != null).sort((a, b) => b.fechaVence.localeCompare(a.fechaVence));
    const m = metricInv();
    const inp = 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:6px 8px;font-size:var(--fs-12-5);color:inherit';
    const activos = (_cartera?.cedears || []).slice().sort((a, b) => (a.simbolo || '').localeCompare(b.simbolo || ''));

    const proyTxt = p => p.varProy != null ? fmtPct(p.varProy) : '$' + (p.precioProy || 0).toLocaleString('es-AR');
    const realTxt = p => p.varProy != null ? fmtPct(varRealDe(p)) : '$' + (p.precioReal || 0).toLocaleString('es-AR');

    const filaPend = p => {
      const vencida = hoy() >= p.fechaVence;
      return `<div class="ci-row" style="grid-template-columns:1fr .9fr 1fr 1.3fr">
        <span><b>${esc(p.simbolo)}</b></span>
        <span class="${p.varProy >= 0 ? 'text-ok' : 'text-danger'}" style="font-weight:700">${proyTxt(p)}</span>
        <span style="font-size:var(--fs-12-5);color:var(--text-ter,#8b93a7)">${fmtF(p.fechaCreada)} → ${fmtF(p.fechaVence)}</span>
        <span style="text-align:right">${vencida
          ? `<input id="sgc-pr-${p.id}" type="number" step="any" placeholder="precio real $" style="${inp};width:100px"> <button class="btn btn-ghost btn-sm" onclick="SGC.cargarReal('${p.id}')">✓</button>`
          : `<span style="font-size:var(--fs-12-5);color:var(--text-ter,#8b93a7)">en ${diasEntre(hoy(), p.fechaVence)} días</span>`}
          <button class="btn btn-ghost btn-sm" style="opacity:.6" onclick="SGC.borrarProyeccion('${p.id}')">🗑</button></span>
      </div>`;
    };

    const filaHist = p => { const prec = precisionDe(p); return `<div class="ci-row" style="grid-template-columns:1fr .9fr .9fr .9fr .6fr">
      <span><b>${esc(p.simbolo)}</b> <span style="font-size:var(--fs-12-5);color:var(--text-ter,#8b93a7)">${fmtF(p.fechaVence)}</span></span>
      <span>${proyTxt(p)}</span>
      <span>${realTxt(p)}</span>
      <span style="font-size:var(--fs-12-5);color:var(--text-ter,#8b93a7)">${esc(p.fuente || 'manual')}</span>
      <span class="ci-est ${prec >= STD.inv ? 'text-ok' : 'text-danger'}">${prec.toFixed(1)}%</span>
    </div>`; };

    el.innerHTML = `
      <div class="ci-sub" style="margin-top:16px">🎯 Mis proyecciones (SGC)</div>
      <div class="ci-kpis" style="grid-template-columns:repeat(3,1fr)">
        <div class="ci-kpi"><div class="ci-kpi-num ${m.val == null ? '' : m.val >= STD.inv ? 'text-ok' : 'text-danger'}">${m.val == null ? '—' : m.val.toFixed(1) + '%'} ${badge(m.val, STD.inv, WARN.inv)}</div><div class="ci-kpi-lbl">Precisión YTD · estándar 85%</div></div>
        <div class="ci-kpi"><div class="ci-kpi-num">${res.length}</div><div class="ci-kpi-lbl">Resueltas</div></div>
        <div class="ci-kpi"><div class="ci-kpi-num">${pend.length}</div><div class="ci-kpi-lbl">Pendientes</div></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:12px 0">
        ${activos.length
          ? `<select id="sgc-p-sim" style="${inp};min-width:110px">${activos.map(a => `<option value="${esc(a.simbolo)}" data-precio="${a.precio}">${esc(a.simbolo)} · $${(a.precio || 0).toLocaleString('es-AR')}</option>`).join('')}</select>`
          : `<span style="font-size:var(--fs-12-5);color:var(--text-ter,#8b93a7)">Sin datos de cartera para elegir activo (reabrí el overlay con conexión)</span>`}
        <input id="sgc-p-var" type="number" step="any" placeholder="Variación proyectada %" style="${inp};width:160px">
        <select id="sgc-p-hor" style="${inp}"><option value="1">1 mes</option><option value="3" selected>3 meses</option><option value="6">6 meses</option></select>
        <button class="btn btn-sm" onclick="SGC.guardarProyeccion()" ${activos.length ? '' : 'disabled'}>+ Proyectar</button>
      </div>
      <div class="ci-hdr ci-row" style="grid-template-columns:1fr .9fr 1fr 1.3fr"><span>Activo</span><span>Proyección</span><span>Período</span><span style="text-align:right">Estado</span></div>
      ${pend.length ? pend.map(filaPend).join('') : '<div style="font-size:var(--fs-12-5);color:var(--text-ter,#8b93a7);padding:6px 2px">Sin proyecciones pendientes — cargá la primera arriba.</div>'}
      ${res.length ? `
        <div class="ci-sub">Historial (${res.length})</div>
        <div class="ci-hdr ci-row" style="grid-template-columns:1fr .9fr .9fr .9fr .6fr"><span>Activo</span><span>Proyectado</span><span>Real</span><span>Fuente</span><span style="text-align:right">Precisión</span></div>
        <div style="max-height:220px;overflow-y:auto">${res.map(filaHist).join('')}</div>` : ''}`;
  }

  function guardarProyeccion() {
    const sel = document.getElementById('sgc-p-sim');
    const sim = (sel?.value || '').trim().toUpperCase();
    const precioBase = parseFloat(sel?.selectedOptions?.[0]?.dataset?.precio);
    const varProy = parseFloat(document.getElementById('sgc-p-var')?.value);
    const hor = parseInt(document.getElementById('sgc-p-hor')?.value, 10) || 3;
    if (!sim || !precioBase) { showToast('Elegí un activo de la cartera'); return; }
    if (isNaN(varProy)) { showToast('Cargá la variación proyectada en %'); return; }
    ensureState();
    S.sgc.proyecciones.push({ id: uid(), simbolo: sim, varProy, precioBase, fechaCreada: hoy(), fechaVence: addMeses(hoy(), hor), precioReal: null, fuente: null });
    saveState();
    showToast(`🎯 ${sim} ${fmtPct(varProy)} a ${hor} ${hor === 1 ? 'mes' : 'meses'} — vence ${fmtF(addMeses(hoy(), hor))}`);
    renderProyecciones(document.getElementById('sgc-proyecciones'));
    renderAnalisis('finanzas');
  }

  function cargarReal(id) {
    const p = S.sgc.proyecciones.find(x => x.id === id); if (!p) return;
    const val = parseFloat(document.getElementById('sgc-pr-' + id)?.value);
    if (!val || val <= 0) { showToast('Cargá el precio real'); return; }
    p.precioReal = val; p.fuente = 'manual';
    saveState();
    showToast(`Precisión de ${p.simbolo}: ${precisionDe(p).toFixed(1)}%`);
    renderProyecciones(document.getElementById('sgc-proyecciones'));
    renderAnalisis('finanzas');
  }

  function borrarProyeccion(id) {
    if (!confirm('¿Borrar esta proyección?')) return;
    S.sgc.proyecciones = S.sgc.proyecciones.filter(x => x.id !== id);
    saveState();
    renderProyecciones(document.getElementById('sgc-proyecciones'));
    renderAnalisis('finanzas');
  }

  // ══════════ EXPORT CSV ══════════

  function exportCSV(que) {
    ensureState();
    let rows, nombre;
    if (que === 'inv') {
      nombre = 'sgc-inversiones';
      rows = [['simbolo', 'var_proyectada_pct', 'precio_base', 'precio_real', 'var_real_pct', 'fecha_creada', 'fecha_vence', 'fuente', 'precision_pct'],
        ...S.sgc.proyecciones.map(p => [p.simbolo, p.varProy ?? '', p.precioBase ?? '', p.precioReal ?? '', (p.varProy != null && p.precioReal != null) ? varRealDe(p).toFixed(2) : '', p.fechaCreada, p.fechaVence, p.fuente ?? '', p.precioReal != null ? precisionDe(p).toFixed(2) : ''])];
    } else {
      nombre = 'sgc-entrenamiento';
      const m = metricGym();
      rows = [['ejercicio', 'volumen_' + m.mesAnt, 'volumen_' + m.mesAct, 'progresion_pct'],
        ...m.items.map(x => [x.nombre, x.ant, x.act, x.prog.toFixed(2)])];
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${nombre}-${hoy()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ══════════ INIT ══════════

  function init() {
    // esperar a que loadState() haya poblado S (habitTrackers existe tras las migraciones)
    const t = setInterval(() => {
      if (typeof S === 'object' && S && S.habitTrackers) {
        clearInterval(t);
        ensureState();
        fetchCartera().then(() => { resolverProyecciones(); renderAnalisis('finanzas'); });
        renderTodo();
        // re-render al cambiar de pestaña (app.js re-pinta las cards)
        if (typeof window.switchTab === 'function' && !window._sgcTabHook) {
          window._sgcTabHook = true;
          const orig = window.switchTab;
          window.switchTab = function (tab, btn) { orig(tab, btn); try { renderTodo(); } catch (e) {} };
        }
      }
    }, 400);
  }
  init();

  return { renderAnalisis, renderTodo, renderProyecciones, guardarProyeccion, cargarReal, borrarProyeccion, exportCSV };
})();
window.SGC = SGC;
