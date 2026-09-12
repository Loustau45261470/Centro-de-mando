// ════════════════════════════════════════════════════════
// PROYECCIÓN DE FIN DE MES (Finanzas) — ver ticket T7
// Módulo autocontenido: crea su propio <style>, se auto-monta como hermano de
// #budget-summary-card en la pestaña Finanzas y se refresca cuando cambia el
// estado relevante (no en cada tick). No toca ningún archivo existente.
//
// Método:
//   proyección al cierre = gasto real acumulado + comprometido + variable proyectado
//   - "comprometido": gastos que van a caer sí o sí este mes y todavía no generaron
//     transacción (gastos fijos sin marcar en fixedExpenseLog, suscripciones sin
//     facturar, pedidos con llegada este mes). Es determinístico, no se proyecta.
//   - "variable proyectado": ritmo diario de gasto variable × días que faltan.
//     El ritmo se calcula sobre DÍAS TRANSCURRIDOS (no días con movimiento): un día
//     sin ninguna transacción cuenta como gasto 0 ese día, porque la ausencia de
//     registro en una cuenta ya reconciliada es gasto que no ocurrió.
//   - Para no contar dos veces lo comprometido: las transacciones generadas por
//     autoDeductSubscriptions() (nombre "Sub: <nombre>") se excluyen del pool de
//     "gasto variable" — ya están contadas como comprometido-caído, no son un ritmo
//     que deba extrapolarse hacia los días que faltan. Los gastos fijos (S.fixedExpenses)
//     y los pedidos (S.orders) nunca generan una transacción en este código, así que
//     no hay riesgo de que aparezcan también en el pool variable.
//   - Antes del día 5 del mes no se proyecta (3-4 días de datos es ruido): se muestra
//     solo lo comprometido.
//   - Moneda: igual criterio que _spentMonth()/renderBudget() en finanzas.js
//     (finanzas.js:1285 y :1363) — solo transacciones/ítems en ARS entran a la suma.
(function () {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    #proyeccion-card .proy-hero-row { display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:4px; }
    #proyeccion-card .proy-hero { font-family:var(--mono); font-size:26px; font-weight:700; letter-spacing:-.02em; line-height:1; }
    #proyeccion-card .proy-hero.over { color:var(--danger); }
    #proyeccion-card .proy-hero.under { color:var(--ok); }
    #proyeccion-card .proy-hero.neutral { color:var(--hud-bright); }
    #proyeccion-card .proy-hero-lbl { font-size:var(--fs-12-5); color:var(--ts); text-transform:uppercase; letter-spacing:.06em; }
    #proyeccion-card .proy-range { font-size:var(--fs-12-5); color:var(--tt); margin-bottom:12px; }
    #proyeccion-card .proy-breakdown { display:flex; flex-wrap:wrap; align-items:center; gap:6px; font-size:var(--fs-13); color:var(--ts); background:rgba(120,180,230,.06); border:1px solid var(--border); border-radius:9px; padding:9px 11px; margin-bottom:10px; }
    #proyeccion-card .proy-breakdown b { color:var(--tp); font-family:var(--mono); font-weight:700; }
    #proyeccion-card .proy-breakdown .proy-op { color:var(--tt); }
    #proyeccion-card .proy-figs { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
    #proyeccion-card .proy-fig { background:rgba(120,180,230,.05); border:1px solid var(--border); border-radius:9px; padding:9px 11px; }
    #proyeccion-card .proy-fig-lbl { font-size:var(--fs-12-5); color:var(--ts); }
    #proyeccion-card .proy-fig-val { font-family:var(--mono); font-weight:700; font-size:var(--fs-16); margin-top:2px; }
    #proyeccion-card .proy-daily { background:rgba(16,224,124,.08); border:1px solid rgba(16,224,124,.25); border-radius:9px; padding:10px 12px; margin-bottom:10px; }
    #proyeccion-card .proy-daily.over { background:rgba(255,51,88,.08); border-color:rgba(255,51,88,.28); }
    #proyeccion-card .proy-daily-lbl { font-size:var(--fs-12-5); color:var(--ts); }
    #proyeccion-card .proy-daily-val { font-family:var(--mono); font-weight:700; font-size:20px; color:var(--ok); }
    #proyeccion-card .proy-daily.over .proy-daily-val { color:var(--danger); }
    #proyeccion-card .proy-note { font-size:var(--fs-12-5); color:var(--tt); margin-top:2px; }
    #proyeccion-card .proy-badge { font-family:var(--mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--ts); border:1px solid var(--border); border-radius:5px; padding:1px 6px; }
    #proyeccion-card .proy-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:var(--fs-12-5); color:var(--ts); margin-top:6px; }
    #proyeccion-card .proy-legend span { display:inline-flex; align-items:center; gap:5px; }
    #proyeccion-card .proy-legend i { width:14px; height:2px; display:inline-block; border-radius:1px; }
    #proyeccion-card .proy-legend .l-real i { background:var(--hud-bright); }
    #proyeccion-card .proy-legend .l-budget i { background:var(--tt); border-top:2px dashed var(--tt); height:0; }
    @media (max-width:430px) { #proyeccion-card .proy-figs { grid-template-columns:1fr; } }
    @media (prefers-reduced-motion: reduce) { #proyeccion-card * { transition:none !important; animation:none !important; } }
  `;
  document.head.appendChild(style);

  // ── Cálculo puro (sin DOM) ──────────────────────────────────────────────
  function _daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

  function calcular(mesKey) {
    const curMk = (typeof _curMonthKey === 'function') ? _curMonthKey() : null;
    mesKey = mesKey || curMk;
    if (!mesKey || typeof S === 'undefined' || !S) return null;

    const [y, m] = mesKey.split('-').map(Number);
    const totalDias = _daysInMonth(y, m);
    const todayStr = (typeof getActiveDate === 'function') ? getActiveDate() : new Date().toISOString().slice(0, 10);

    let diasTranscurridos;
    if (mesKey < curMk) diasTranscurridos = totalDias;
    else if (mesKey > curMk) diasTranscurridos = 0;
    else diasTranscurridos = +todayStr.slice(8, 10);
    const diasRestantes = Math.max(0, totalDias - diasTranscurridos);
    const disponible = diasTranscurridos >= 5;

    const cutoff = mesKey < curMk ? `${mesKey}-${String(totalDias).padStart(2, '0')}`
      : mesKey > curMk ? `${mesKey}-00`
      : todayStr;

    const allTxns = Array.isArray(S.transactions) ? S.transactions : [];
    // Mismo criterio de moneda que _spentMonth()/renderBudget() (finanzas.js:1285, :1363):
    // solo ARS entra a la suma — mezclar monedas distintas en un total es el error de este ticket.
    const gastosMes = allTxns.filter(t => t && t.type === 'expense' && t.currency === 'ARS' &&
      t.date && t.date.slice(0, 7) === mesKey && t.date <= cutoff);
    const gastoRealAcumulado = gastosMes.reduce((s, t) => s + (+t.amount || 0), 0);

    // Las transacciones que autoDeductSubscriptions() genera llevan el nombre "Sub: <x>".
    // Se excluyen del pool "variable" para no contarlas dos veces: ya están adentro de
    // "comprometido" (más abajo) y no son un ritmo que deba extrapolarse.
    const esSuscripcionFacturada = t => typeof t.name === 'string' && t.name.indexOf('Sub: ') === 0;
    const variables = gastosMes.filter(t => !esSuscripcionFacturada(t));
    const gastoVariableAcumulado = variables.reduce((s, t) => s + (+t.amount || 0), 0);

    const ritmoDiarioMes = diasTranscurridos > 0 ? gastoVariableAcumulado / diasTranscurridos : 0;
    const desde7 = Math.max(1, diasTranscurridos - 6);
    const dias7 = diasTranscurridos > 0 ? (diasTranscurridos - desde7 + 1) : 0;
    const gastoVariable7 = variables.filter(t => +t.date.slice(8, 10) >= desde7).reduce((s, t) => s + (+t.amount || 0), 0);
    const ritmoDiario7 = dias7 > 0 ? gastoVariable7 / dias7 : 0;

    // Comprometido: cae sí o sí este mes y todavía NO generó transacción (por eso no
    // puede duplicarse con gastoRealAcumulado/variables, que solo miran S.transactions).
    const fixedExpenses = Array.isArray(S.fixedExpenses) ? S.fixedExpenses : [];
    const fixedLog = (S.fixedExpenseLog && S.fixedExpenseLog[mesKey]) || {};
    const comprFijos = fixedExpenses.filter(e => e && e.currency === 'ARS' && !fixedLog[e.id])
      .reduce((s, e) => s + (+e.amount || 0), 0);

    const subs = Array.isArray(S.subscriptions) ? S.subscriptions : [];
    const comprSubs = subs.filter(sub => sub && sub.currency === 'ARS' &&
        !gastosMes.some(t => t.name === `Sub: ${sub.name}`))
      .reduce((s, sub) => s + (+sub.amount || 0), 0);

    const orders = Array.isArray(S.orders) ? S.orders : [];
    const comprPedidos = orders.filter(o => o && o.currency === 'ARS' && !o.deducted &&
        o.arrival && o.arrival.slice(0, 7) === mesKey)
      .reduce((s, o) => s + (+o.amount || 0), 0);

    const comprometido = comprFijos + comprSubs + comprPedidos;

    const variableProy7 = ritmoDiario7 * diasRestantes;
    const variableProyMes = ritmoDiarioMes * diasRestantes;
    const proyeccion7 = gastoRealAcumulado + comprometido + variableProy7;
    const proyeccionMes = gastoRealAcumulado + comprometido + variableProyMes;

    const presupuesto = (typeof _budgetMonthTotal === 'function') ? _budgetMonthTotal(mesKey) : 0;
    const hayPresupuesto = presupuesto > 0;
    const restanteParaPresupuesto = presupuesto - gastoRealAcumulado - comprometido;
    const disponiblePorDia = (hayPresupuesto && diasRestantes > 0) ? restanteParaPresupuesto / diasRestantes : null;

    // Serie diaria para el gráfico chico: acumulado real (solo hasta hoy) vs. presupuesto prorrateado.
    const serieReal = [];
    let acc = 0;
    for (let d = 1; d <= totalDias; d++) {
      if (d > diasTranscurridos) { serieReal.push(null); continue; }
      const dayStr = `${mesKey}-${String(d).padStart(2, '0')}`;
      acc += gastosMes.filter(t => t.date === dayStr).reduce((s, t) => s + (+t.amount || 0), 0);
      serieReal.push(acc);
    }
    const serieBudget = hayPresupuesto
      ? Array.from({ length: totalDias }, (_, i) => presupuesto / totalDias * (i + 1))
      : null;

    return {
      mes: mesKey, totalDias, diasTranscurridos, diasRestantes, disponible,
      gastoRealAcumulado,
      comprometido, comprometidoDetalle: { fijos: comprFijos, subs: comprSubs, pedidos: comprPedidos },
      ritmoDiario7, ritmoDiarioMes,
      variableProy7, variableProyMes,
      proyeccion7, proyeccionMes,
      presupuesto, hayPresupuesto,
      brecha7: presupuesto - proyeccion7, brechaMes: presupuesto - proyeccionMes,
      disponiblePorDia,
      serieReal, serieBudget,
    };
  }

  // ── Render (DOM + Chart.js) ─────────────────────────────────────────────
  let _chart = null;

  function _ensureCard() {
    let card = document.getElementById('proyeccion-card');
    if (card) return card;
    const anchor = document.getElementById('budget-summary-card');
    if (!anchor || !anchor.parentElement) return null;
    card = document.createElement('div');
    card.className = 'card';
    card.id = 'proyeccion-card';
    card.style.setProperty('--card-accent', 'var(--c-finanzas)');
    card.innerHTML = `
      <div class="card-title">📈 Proyección del mes</div>
      <div id="proyeccionBody"></div>`;
    anchor.parentElement.insertBefore(card, anchor.nextSibling);
    return card;
  }

  function render() {
    const card = _ensureCard();
    if (!card) return;
    const body = document.getElementById('proyeccionBody');
    if (!body) return;

    const d = calcular();
    if (!d) { body.innerHTML = '<p class="empty-state">Sin datos todavía</p>'; return; }

    if (!d.disponible) {
      const faltan = 5 - d.diasTranscurridos;
      body.innerHTML = `
        <div class="proy-breakdown">
          <span>Comprometido este mes:</span> <b>${fmtMoney(d.comprometido, 'ARS')}</b>
        </div>
        <p class="proy-note">Van ${d.diasTranscurridos} día${d.diasTranscurridos === 1 ? '' : 's'} del mes — todavía es poco para estimar el ritmo de gasto sin ruido.
        Va a haber proyección a partir del día 5${faltan > 0 ? ` (en ${faltan} día${faltan === 1 ? '' : 's'})` : ''}.</p>`;
      if (_chart) { _chart.destroy(); _chart = null; }
      return;
    }

    const over7 = d.hayPresupuesto && d.proyeccion7 > d.presupuesto;
    const heroCls = !d.hayPresupuesto ? 'neutral' : (over7 ? 'over' : 'under');
    const heroLbl = !d.hayPresupuesto ? '' : (over7 ? 'te pasás por ' + fmtMoney(-d.brecha7, 'ARS') : 'te sobran ' + fmtMoney(d.brecha7, 'ARS'));

    const rangoTxt = Math.abs(d.proyeccionMes - d.proyeccion7) < 1
      ? `Con el ritmo de los últimos 7 días y con el del mes completo da prácticamente lo mismo.`
      : `Rango según el ritmo usado: ${fmtMoney(Math.min(d.proyeccion7, d.proyeccionMes), 'ARS')} (últimos 7 días) a ${fmtMoney(Math.max(d.proyeccion7, d.proyeccionMes), 'ARS')} (promedio del mes completo).`;

    body.innerHTML = `
      <div class="proy-hero-row">
        <div>
          <div class="proy-hero-lbl">Proyección al cierre <span class="proy-badge">estimado</span></div>
          <div class="proy-hero ${heroCls}">${fmtMoney(d.proyeccion7, 'ARS')}</div>
        </div>
        ${d.hayPresupuesto ? `<div class="proy-hero-lbl" style="text-align:right">${heroLbl}</div>` : ''}
      </div>
      <div class="proy-range">${rangoTxt}</div>
      <div class="proy-breakdown">
        <span>Comprometido</span> <b>${fmtMoney(d.comprometido, 'ARS')}</b>
        <span class="proy-op">+</span>
        <span>Variable proyectado</span> <b>${fmtMoney(d.variableProy7, 'ARS')} <span class="proy-badge">estimado</span></b>
        <span class="proy-op">=</span>
        <b>${fmtMoney(d.comprometido + d.variableProy7, 'ARS')}</b>
      </div>
      <div class="proy-figs">
        <div class="proy-fig"><div class="proy-fig-lbl">Gastado hasta hoy (real)</div><div class="proy-fig-val">${fmtMoney(d.gastoRealAcumulado, 'ARS')}</div></div>
        <div class="proy-fig"><div class="proy-fig-lbl">Presupuesto del mes</div><div class="proy-fig-val">${d.hayPresupuesto ? fmtMoney(d.presupuesto, 'ARS') : '— sin cargar —'}</div></div>
      </div>
      ${d.hayPresupuesto ? `
        <div class="proy-daily ${d.disponiblePorDia < 0 ? 'over' : ''}">
          <div class="proy-daily-lbl">Para cerrar dentro del presupuesto, podés gastar por día (${d.diasRestantes} día${d.diasRestantes === 1 ? '' : 's'} restantes)</div>
          <div class="proy-daily-val">${d.diasRestantes > 0 ? fmtMoney(Math.max(0, d.disponiblePorDia), 'ARS') : '—'}</div>
          ${d.disponiblePorDia < 0 ? '<div class="proy-note">Ya no alcanza el presupuesto ni gastando $0 el resto del mes.</div>' : ''}
        </div>` : `<p class="proy-note">Sin presupuesto cargado para ${d.mes} — cargalo en Presupuesto del mes para ver la brecha y cuánto podés gastar por día.</p>`}
      <div class="chart-wrap" style="height:130px"><canvas id="proyeccionChart"></canvas></div>
      <div class="proy-legend">
        <span class="l-real"><i></i>Gasto real acumulado</span>
        ${d.hayPresupuesto ? '<span class="l-budget"><i></i>Presupuesto prorrateado</span>' : ''}
      </div>`;

    _renderChart(d);
  }

  function _renderChart(d) {
    const canvas = document.getElementById('proyeccionChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_chart) { _chart.destroy(); _chart = null; }
    const cs = getComputedStyle(document.documentElement);
    const cReal = cs.getPropertyValue('--hud-bright').trim() || '#7DD3FC';
    const cBudget = cs.getPropertyValue('--tt').trim() || '#48596E';
    const cGrid = cs.getPropertyValue('--border').trim() || 'rgba(255,255,255,.1)';
    const cText = cs.getPropertyValue('--ts').trim() || '#8BA5C0';
    const labels = Array.from({ length: d.totalDias }, (_, i) => String(i + 1));
    const datasets = [{
      label: 'Gasto real acumulado',
      data: d.serieReal,
      borderColor: cReal, backgroundColor: cReal + '1a',
      borderWidth: 2, pointRadius: 0, tension: 0.2, spanGaps: false, fill: false,
    }];
    if (d.serieBudget) {
      datasets.push({
        label: 'Presupuesto prorrateado',
        data: d.serieBudget,
        borderColor: cBudget, borderDash: [5, 4],
        borderWidth: 2, pointRadius: 0, tension: 0, fill: false,
      });
    }
    const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    _chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: reduceMotion ? false : undefined,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => `Día ${items[0].label}`,
              label: ctx => ctx.raw == null ? null : `${ctx.dataset.label}: ${fmtMoney(ctx.raw, 'ARS')}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: cText, maxTicksLimit: 6, font: { size: 10 } } },
          y: { grid: { color: cGrid }, ticks: { color: cText, font: { size: 10 },
            callback: v => fmtMoney(v, 'ARS') } },
        },
      },
    });
  }

  // ── Auto-refresh: solo cuando cambia el estado relevante, no en cada render ──
  function _patch(name, after) {
    const orig = window[name];
    if (typeof orig !== 'function' || window['_proyPatched_' + name]) return;
    window[name] = function () {
      const r = orig.apply(this, arguments);
      after();
      return r;
    };
    window['_proyPatched_' + name] = true;
  }

  function boot() {
    if (typeof window.renderFinanzasTab === 'function') _patch('renderFinanzasTab', render);
    if (typeof window.renderBudget === 'function') _patch('renderBudget', render);
    const tab = document.getElementById('tab-finanzas');
    if (tab && tab.classList.contains('active')) render();
  }
  if (document.readyState === 'complete') setTimeout(boot, 700);
  else window.addEventListener('load', () => setTimeout(boot, 700));

  window.CMProyeccion = { calcular, render };
  window.renderProyeccionCard = render;
})();
