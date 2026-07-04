'use strict';
// ════════════════════════════════════════════════════════════════════════
// CARTERA DE INVERSIÓN — overlay de solo lectura sobre CMOverlay.
// Muestra el análisis mensual de CEDEARs que genera la routine cloud
// (agente IOL) el 1° de cada mes commiteando data/cartera/latest.json.
// No escribe estado: la única fuente es ese JSON servido por GitHub Pages.
// ════════════════════════════════════════════════════════════════════════

const CarteraInversion = (() => {
  const URL_JSON = 'data/cartera/latest.json';
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const num = v => (v == null || isNaN(v)) ? null : Number(v);
  const pct = v => { const n = num(v); return n == null ? '—' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; };
  const money = v => { const n = num(v); return n == null ? '—' : '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 }); };
  const varCls = v => { const n = num(v); return n == null ? 'text-ter' : n > 0 ? 'text-ok' : n < 0 ? 'text-danger' : 'text-ter'; };
  const mesLabel = ym => {
    const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
    return m ? MESES[+m[2] - 1] + ' ' + m[1] : (ym || '—');
  };

  function kpis(d) {
    const vars = (d.cedears || []).map(c => num(c.variacionPct)).filter(v => v != null);
    const prom = vars.length ? vars.reduce((a, b) => a + b, 0) / vars.length : null;
    const ev = d.evaluacion;
    return `<div class="ci-kpis">
      <div class="ci-kpi"><div class="ci-kpi-num mono">${(d.cedears || []).length}</div><div class="ci-kpi-lbl">CEDEARs</div></div>
      <div class="ci-kpi"><div class="ci-kpi-num mono ${varCls(prom)}">${pct(prom)}</div><div class="ci-kpi-lbl">Var. prom. del mes</div></div>
      <div class="ci-kpi"><div class="ci-kpi-num mono">${ev ? esc(ev.scorePicks) : '—'}</div><div class="ci-kpi-lbl">Picks acertados</div></div>
      <div class="ci-kpi"><div class="ci-kpi-num mono">${ev ? esc(ev.scoreMejores) + ' · ' + esc(ev.scorePeores) : '—'}</div><div class="ci-kpi-lbl">Mejores · Peores</div></div>
    </div>`;
  }

  function tablaActivos(d) {
    const rows = (d.cedears || []).slice()
      .sort((a, b) => (num(b.variacionPct) ?? -Infinity) - (num(a.variacionPct) ?? -Infinity))
      .map(c => `<div class="ci-row">
        <span class="mono bold">${esc(c.simbolo)}</span>
        <span class="mono col-r ${varCls(c.variacionPct)}">${pct(c.variacionPct)}</span>
        <span class="mono col-r ${varCls(c.rend3m)}">${pct(c.rend3m)}</span>
        <span class="mono col-r ${varCls(c.rend6m)}">${pct(c.rend6m)}</span>
        <span class="mono col-r ${varCls(c.rend12m)}">${pct(c.rend12m)}</span>
      </div>`).join('');
    return `<div class="card ci-card">
      <div class="card-title">📊 Activos · variación intermensual</div>
      <div class="ci-row ci-hdr"><span>Símbolo</span><span class="col-r">Mes</span><span class="col-r">3M</span><span class="col-r">6M</span><span class="col-r">12M</span></div>
      ${rows || '<div class="empty-state">Sin CEDEARs en cartera</div>'}
    </div>`;
  }

  function topRendimiento(d) {
    const t = d.top || {};
    const col = (lbl, arr) => `<div class="ci-top-col"><div class="ci-top-lbl">${lbl}</div>${(arr || []).map((s, i) =>
      `<div class="ci-top-item"><span class="ci-top-rank">${i + 1}</span><span class="mono bold">${esc(s)}</span></div>`).join('') || '<div class="text-ter">—</div>'}</div>`;
    return `<div class="card ci-card">
      <div class="card-title">🏆 Top 3 · rendimiento</div>
      <div class="ci-top-grid">${col('3 meses', t['3m'])}${col('6 meses', t['6m'])}${col('12 meses', t['12m'])}</div>
    </div>`;
  }

  function prediccion(d) {
    const p = d.prediccion || {};
    const lista = (arr, ico, cl) => (arr || []).map(x =>
      `<div class="ci-pred"><span class="${cl}">${ico}</span><span class="mono bold">${esc(x.simbolo)}</span><span class="mono ci-est ${varCls(x.estPct)}">${pct(x.estPct)}</span><span class="ci-razon">${esc(x.razon)}</span></div>`).join('') || '<div class="text-ter">—</div>';
    const picks = (p.picks || []).map(x =>
      `<div class="ci-pred"><span class="mono bold">${esc(x.simbolo)}</span><span class="mono text-ter">${money(x.precio)}</span><span class="mono ci-est ${varCls(x.estPct)}">${pct(x.estPct)}</span><span class="ci-razon">${esc(x.razon)}</span></div>`).join('') || '<div class="text-ter">—</div>';
    return `<div class="card ci-card">
      <div class="card-title">🔮 Predicción · ${mesLabel(d.mes)}</div>
      <div class="ci-sub">Mejores 3 esperadas · % estimado</div>${lista(p.mejores, '▲', 'text-ok')}
      <div class="ci-sub">Peores 3 esperadas · % estimado</div>${lista(p.peores, '▼', 'text-danger')}
      <div class="ci-sub">5 picks del mes (paper trading — no se compra) · % estimado</div>${picks}
    </div>`;
  }

  function evaluacion(d) {
    const ev = d.evaluacion;
    if (!ev) return `<div class="card ci-card"><div class="card-title">🎯 Aciertos del agente</div>
      <div class="empty-state">Primera corrida: la evaluación de aciertos aparece a partir del próximo mes.</div></div>`;
    const mark = ok => ok ? '<span class="text-ok">✓</span>' : '<span class="text-danger">✗</span>';
    const predRows = (arr) => (arr || []).map(x =>
      `<div class="ci-row ci-row-3"><span class="mono bold">${esc(x.simbolo)}</span><span class="mono col-r ${varCls(x.variacionReal)}">${pct(x.variacionReal)}</span><span class="col-r">${mark(x.acerto)}</span></div>`).join('');
    const pickRows = (ev.picks || []).map(x =>
      `<div class="ci-row"><span class="mono bold">${esc(x.simbolo)}</span><span class="mono col-r text-ter">${money(x.precioInicial)}</span><span class="mono col-r text-ter">${money(x.precioFinal)}</span><span class="mono col-r ${varCls(x.variacionPct)}">${pct(x.variacionPct)}</span><span class="col-r">${mark(x.subio)}</span></div>`).join('');
    const hist = (ev.historicoScores || []).slice().reverse().map(h =>
      `<div class="ci-hist"><span class="mono">${mesLabel(h.mes)}</span><span>Picks <b class="mono">${esc(h.picks)}</b></span><span>Mejores <b class="mono">${esc(h.mejores)}</b></span><span>Peores <b class="mono">${esc(h.peores)}</b></span></div>`).join('');
    return `<div class="card ci-card">
      <div class="card-title">🎯 Aciertos del agente · ${mesLabel(ev.mesEvaluado)}</div>
      <div class="ci-sub">Predicción "mejores" (${esc(ev.scoreMejores)})</div>${predRows(ev.mejoresPredichas)}
      <div class="ci-sub">Predicción "peores" (${esc(ev.scorePeores)})</div>${predRows(ev.peoresPredichas)}
      <div class="ci-sub">Picks del mes anterior (${esc(ev.scorePicks)} subieron)</div>
      <div class="ci-row ci-hdr"><span>Símbolo</span><span class="col-r">Inicial</span><span class="col-r">Final</span><span class="col-r">Var %</span><span class="col-r">OK</span></div>
      ${pickRows || '<div class="text-ter">—</div>'}
      ${hist ? `<div class="ci-sub">Histórico de scores</div>${hist}` : ''}
    </div>`;
  }

  function render(body, d) {
    const gen = d.generado ? new Date(d.generado) : null;
    const meta = `Análisis de ${mesLabel(d.mes)}${gen ? ' · generado el ' + gen.toLocaleDateString('es-AR') : ''} · agente IOL (routine mensual)`;
    body.innerHTML = `<div class="ci-meta">${meta}</div>
      ${kpis(d)}
      <div class="ci-grid">
        <div>${tablaActivos(d)}${topRendimiento(d)}</div>
        <div>${prediccion(d)}${evaluacion(d)}</div>
      </div>
      <div id="sgc-proyecciones"></div>`;
    if (window.SGC) SGC.renderProyecciones(document.getElementById('sgc-proyecciones'), d);
  }

  function open() {
    if (typeof CMOverlay === 'undefined') return;
    const { overlay, body } = CMOverlay.build({ id: 'ov-cartera', accent: '#22C55E' });
    body.innerHTML = `<div class="cm-ov-head"><div class="cm-ov-eyebrow">FINANZAS · CARTERA</div><div class="cm-ov-title">Cartera de inversión</div></div><div class="ci-body" id="ci-body"><div class="empty-state">Cargando análisis…</div></div>`;
    CMOverlay.open(overlay);
    const bx = body.querySelector('#ci-body');
    fetch(URL_JSON, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => render(bx, d))
      .catch(() => {
        bx.innerHTML = `<div class="empty-state">Todavía no hay análisis disponible.<br>
          La routine corre el 1° de cada mes a las 8:00 y publica el informe acá automáticamente.</div>
          <div id="sgc-proyecciones"></div>`;
        if (window.SGC) SGC.renderProyecciones(document.getElementById('sgc-proyecciones'));
      });
  }

  return { open };
})();
window.CarteraInversion = CarteraInversion;
