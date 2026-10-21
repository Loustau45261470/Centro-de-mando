'use strict';
// ════════════════════════════════════════════════════════════════════════
// MIS TENENCIAS — pestaña "Mis tenencias" (default) del overlay unificado
// de Cartera (ver cartera-overlay.js). Muestra las posiciones REALES de la
// cartera IOL de Tobías, generadas por una routine cloud semanal (lunes
// 8:00 ART) que commitea data/cartera/tenencias.json. No escribe estado:
// la única fuente es ese JSON servido por GitHub Pages. No construye su
// propio overlay: expone renderInto(container) para que cartera-overlay.js
// la monte dentro de su pane. Distinto de CarteraInversion
// (cartera-inversion.js, análisis mensual de CEDEARs con predicciones).
// ════════════════════════════════════════════════════════════════════════

const Tenencias = (() => {
  const URL_JSON = 'data/cartera/tenencias.json';
  // Endpoint /cartera del Worker de push que ya existe (cf-worker/) — cartera IOL
  // en vivo, cacheada ~15 min. Constante fácil de cambiar si el Worker se muda.
  const URL_WORKER = 'https://cdm-push-worker.tobiasloustau11.workers.dev/cartera';
  const WORKER_TIMEOUT_MS = 6000;
  // Sin secret embebido: /cartera expone datos financieros, así que se gatea
  // con el ID token de Firebase Auth (fresco, pedido en cada intento) en vez
  // de un valor fijo que quedaría legible en este repo público. `_auth` es la
  // instancia global de app.js (carga antes que este archivo — index.html).

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const num = v => (v == null || isNaN(v)) ? null : Number(v);
  const pct = v => { const n = num(v); return n == null ? '—' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; };
  const money = (v, dec) => { const n = num(v); if (n == null) return '—'; const neg = n < 0; return (neg ? '-$' : '$') + Math.abs(n).toLocaleString('es-AR', { maximumFractionDigits: dec ?? 2 }); };
  const varCls = v => { const n = num(v); return n == null ? 'text-ter' : n > 0 ? 'text-ok' : n < 0 ? 'text-danger' : 'text-ter'; };

  let _openSimbolo = null;
  let _orden = 'valorizado'; // 'valorizado' | 'rendimiento'
  let _ctx = null;   // { body, d, fuente } del último render — para repintar después de registrar una venta
  let _venta = null; // { t, generado } mientras el modal "Registrar venta" está abierto (null = ya se confirmó o se cerró)

  function header(d) {
    const t = d.totales || {};
    return `<div class="ten-hero">
      <div class="ten-hero-lbl">Valorizado total</div>
      <div class="ten-hero-num mono">${money(t.valorizado, 0)}</div>
      <div class="ten-hero-var mono ${varCls(t.variacionPct)}">${t.variacionPct == null ? 'Sin variación semanal registrada aún' : pct(t.variacionPct) + ' desde la última actualización'}</div>
    </div>`;
  }

  // Solo el texto cualitativo — el número (%, monto) ya se ve en la fila
  // compacta (rendimientoCompacto) que queda visible arriba mientras el
  // detalle está expandido; no repetirlo acá.
  function rendimientoBanner(t) {
    const ppc = num(t.ppc);
    const rp = num(t.rendimientoPct);
    if (ppc == null || rp == null) return '';
    const cls = rp > 0 ? 'text-ok' : rp < 0 ? 'text-danger' : 'text-ter';
    const label = rp > 0 ? '¡Estás ganando!' : rp < 0 ? 'Estás perdiendo' : 'Sin cambio';
    return `<div class="ten-rend ${cls}">${esc(label)}</div>`;
  }

  // Versión compacta del banner de ganancia/pérdida para mostrar en la fila
  // de la lista (mismo criterio de colores/null que rendimientoBanner).
  function rendimientoCompacto(t) {
    const ppc = num(t.ppc);
    const rp = num(t.rendimientoPct);
    if (ppc == null || rp == null) return `<span class="mono col-r ten-num ten-num-rend text-ter">—</span>`;
    const rm = num(t.rendimientoMonto);
    const cls = rp > 0 ? 'text-ok' : rp < 0 ? 'text-danger' : 'text-ter';
    const montoTxt = rm != null ? `<span class="ten-num-monto"> (${money(rm, 0)})</span>` : '';
    return `<span class="mono col-r ten-num ten-num-rend ${cls}">${pct(rp)}${montoTxt}</span>`;
  }

  // Clase de "mood" para la fila entera (borde/fondo sutil) según ganancia/pérdida.
  function rowMoodCls(t) {
    const rp = num(t.rendimientoPct);
    return rp == null ? '' : rp > 0 ? 'ten-row-gain' : rp < 0 ? 'ten-row-loss' : '';
  }

  function pctCartera(t, totalVal) {
    const v = num(t.valorizado);
    if (v == null || !totalVal) return `<span class="mono col-r ten-num ten-num-sec text-ter">—</span>`;
    return `<span class="mono col-r ten-num ten-num-sec">${((v / totalVal) * 100).toFixed(1)}%</span>`;
  }

  function fechaCorta(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
    return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : esc(s);
  }

  function historialLotes(t) {
    const lotesValidos = (Array.isArray(t.lotes) ? t.lotes : []).filter(lo => lo && typeof lo === 'object');
    if (!lotesValidos.length) return '';
    // Agrupa lotes de la misma fecha y mismo precio (partes de una misma orden) sumando cantidad.
    const agrupados = [];
    for (const lo of lotesValidos) {
      const prev = agrupados.find(g => g.fecha === lo.fecha && num(g.precio) === num(lo.precio));
      if (prev) prev.cantidad = (num(prev.cantidad) ?? 0) + (num(lo.cantidad) ?? 0);
      else agrupados.push({ fecha: lo.fecha, cantidad: lo.cantidad, precio: lo.precio });
    }
    const filas = agrupados.map(lo => `<div class="ten-lote-item">
        <span class="mono ten-lote-fecha">${fechaCorta(lo.fecha)}</span>
        <span class="mono ten-lote-cant">${num(lo.cantidad)?.toLocaleString('es-AR') ?? '—'}</span>
        <span class="mono ten-lote-precio">${num(lo.precio) ? money(lo.precio, 4) : '—'}</span>
      </div>`).join('');
    return `<div class="ten-lotes">
      <div class="ten-lotes-lbl">Historial de compras</div>
      <div class="ten-lote-item ten-lote-hdr">
        <span class="ten-lote-fecha">Fecha</span>
        <span class="ten-lote-cant">Cantidad</span>
        <span class="ten-lote-precio">Precio unitario</span>
      </div>
      <div class="ten-lotes-list">${filas}</div>
    </div>`;
  }

  // Ventas parciales ya registradas del activo (ciclo abierto), bajo su historial de compras.
  function ventasParciales(t) {
    const recs = typeof carteraVentasAbiertas === 'function' ? carteraVentasAbiertas(t.simbolo) : [];
    if (!recs.length) return '';
    const filas = recs.map(r => `<div class="ten-venta-item">
        <span class="mono ten-lote-fecha">${fechaCorta(r.fecha)}</span>
        <span class="mono">${num(r.unidades)?.toLocaleString('es-AR') ?? '—'}</span>
        <span class="mono">${money(r.precio, 4)}</span>
        <span class="mono ${varCls(r.resultado)}">${money(r.resultado, 2)}</span>
      </div>`).join('');
    return `<div class="ten-lotes ten-ventas">
      <div class="ten-lotes-lbl">Ventas que registraste</div>
      <div class="ten-venta-item ten-lote-hdr">
        <span>Fecha</span><span>Cantidad</span><span>Precio de venta</span><span>Resultado</span>
      </div>
      <div class="ten-ventas-list">${filas}</div>
    </div>`;
  }

  function detalleFila(t, totalVal) {
    // "Disponible p/ operar" sigue calculado con comprometido internamente,
    // aunque el campo comprometido ya no se muestra por separado en la grilla.
    const disponible = num(t.cantidad) != null && num(t.comprometido) != null ? num(t.cantidad) - num(t.comprometido) : null;
    const ppc = num(t.ppc);
    const aprox = ppc != null && t.ppcConfianza === 'aproximada'
      ? ` <span class="ten-ppc-approx" title="Estimado — el historial de operaciones no cierra exacto para este activo" aria-label="Precio promedio de compra estimado">⚠</span>`
      : '';
    const v = num(t.valorizado);
    const pctCarteraTxt = v == null || !totalVal ? '—' : `${((v / totalVal) * 100).toFixed(1)}%`;
    return `<div class="ten-detail">
      ${rendimientoBanner(t)}
      <div class="ten-detail-grid">
        <div class="ten-detail-item"><span class="ten-detail-lbl">Cantidad</span><span class="mono">${num(t.cantidad)?.toLocaleString('es-AR') ?? '—'}</span></div>
        <div class="ten-detail-item"><span class="ten-detail-lbl">Disponible p/ operar</span><span class="mono">${disponible?.toLocaleString('es-AR') ?? '—'}</span></div>
        <div class="ten-detail-item"><span class="ten-detail-lbl">Precio actual</span><span class="mono">${money(t.precio, 4)}</span></div>
        ${ppc != null ? `<div class="ten-detail-item"><span class="ten-detail-lbl">Precio promedio de compra</span><span class="mono">${money(ppc, 4)}${aprox}</span></div>` : ''}
        <div class="ten-detail-item"><span class="ten-detail-lbl">Valorizado</span><span class="mono">${money(t.valorizado, 0)}</span></div>
        <div class="ten-detail-item"><span class="ten-detail-lbl">% de la cartera</span><span class="mono">${pctCarteraTxt}</span></div>
        <div class="ten-detail-item"><span class="ten-detail-lbl">Var. último día hábil</span><span class="mono ${varCls(t.variacionDiariaPct)}">${pct(t.variacionDiariaPct)}</span></div>
        <div class="ten-detail-item"><span class="ten-detail-lbl">Variación semanal</span><span class="mono ${varCls(t.variacionPct)}">${t.variacionPct == null ? 'Sin dato aún' : pct(t.variacionPct)}</span></div>
      </div>
      <div class="ten-actions"><button type="button" class="btn btn-ghost ten-venta-btn" data-simbolo="${esc(t.simbolo)}">Registrar venta</button></div>
      ${historialLotes(t)}
      ${ventasParciales(t)}
    </div>`;
  }

  function fila(t, totalVal) {
    const abierto = _openSimbolo === t.simbolo;
    return `<div class="ten-row-wrap">
      <div class="ten-row ${abierto ? 'ten-row-active' : ''} ${rowMoodCls(t)}" data-simbolo="${esc(t.simbolo)}" tabindex="0" role="button" aria-expanded="${abierto}">
        <div class="ten-row-main">
          <span class="mono bold ten-sim">${esc(t.simbolo)}</span>
          <span class="ten-tipo">${esc(t.tipo)}</span>
        </div>
        <span class="mono col-r ten-num ten-num-sec ${varCls(t.variacionDiariaPct)}">${pct(t.variacionDiariaPct)}</span>
        <span class="mono col-r ten-num ten-num-sec ${varCls(t.variacionPct)}">${t.variacionPct == null ? '—' : pct(t.variacionPct)}</span>
        ${rendimientoCompacto(t)}
        <span class="mono col-r ten-num ten-val">${money(t.valorizado, 0)}</span>
        ${pctCartera(t, totalVal)}
      </div>
      ${abierto ? detalleFila(t, totalVal) : ''}
    </div>`;
  }

  // Agrupa la lista en "CEDEARs y acciones" (CEDEARS/ACCIONES), "Bonos y letras"
  // (TIT.PUBLICOS/LETRAS/ONS) y "Otros" (cualquier tipo que no matchea los
  // anteriores, incl. null/undefined) — así ninguna fila desaparece nunca,
  // aunque siga sumando al total del header. Match normalizado (trim+upper)
  // para tolerar variaciones de capitalización/espaciado del JSON de origen.
  const normTipo = tipo => String(tipo ?? '').trim().toUpperCase();
  const GRUPOS = [
    { titulo: 'CEDEARs y acciones', match: tipo => normTipo(tipo) === 'CEDEARS' || normTipo(tipo) === 'ACCIONES' },
    { titulo: 'Bonos y letras', match: tipo => ['TIT. PUBLICOS', 'TIT.PUBLICOS', 'LETRAS', 'ONS'].includes(normTipo(tipo)) }
  ];

  function hdrRow() {
    return `<div class="ten-row ten-hdr">
        <div class="ten-row-main"><span>Símbolo</span></div>
        <span class="col-r">Día hábil</span>
        <span class="col-r">Semanal</span>
        <span class="col-r">Rendimiento</span>
        <span class="col-r">Valorizado</span>
        <span class="col-r">% cartera</span>
      </div>`;
  }

  function grupoLbl(titulo, rows, totalVal) {
    const suma = rows.reduce((a, t) => a + (num(t.valorizado) ?? 0), 0);
    const pctTxt = totalVal ? `<span class="ten-grupo-pct">· <b class="mono">${((suma / totalVal) * 100).toFixed(0)}%</b> cartera</span>` : '';
    return `<div class="sec-label ten-grupo-lbl">${esc(titulo)} ${pctTxt}</div>`;
  }

  // Comparador de orden dentro de cada grupo. 'rendimiento' manda las
  // posiciones sin PPC calculable (rendimientoPct null) al final del grupo,
  // nunca al principio ni mezcladas con las que sí tienen dato.
  const ORDEN_CMP = {
    valorizado: (a, b) => (num(b.valorizado) ?? 0) - (num(a.valorizado) ?? 0),
    rendimiento: (a, b) => {
      const ppcA = num(a.ppc), ppcB = num(b.ppc);
      const ra = ppcA == null ? null : num(a.rendimientoPct);
      const rb = ppcB == null ? null : num(b.rendimientoPct);
      if (ra == null && rb == null) return 0;
      if (ra == null) return 1;
      if (rb == null) return -1;
      return rb - ra;
    }
  };

  function ordenControl() {
    return `<div class="ten-orden-chips" role="group" aria-label="Ordenar por">
      <button type="button" class="ten-orden-chip ${_orden === 'valorizado' ? 'on' : ''}" data-orden="valorizado" aria-pressed="${_orden === 'valorizado'}">Valorizado</button>
      <button type="button" class="ten-orden-chip ${_orden === 'rendimiento' ? 'on' : ''}" data-orden="rendimiento" aria-pressed="${_orden === 'rendimiento'}">Rendimiento</button>
    </div>`;
  }

  function tabla(d) {
    const todas = (d.tenencias || []);
    const totalVal = num((d.totales || {}).valorizado);
    const cmp = ORDEN_CMP[_orden] || ORDEN_CMP.valorizado;
    const matcheadas = new Set();
    const grupos = GRUPOS.map(g => {
      const rows = todas.filter(t => g.match(t.tipo)).sort(cmp);
      rows.forEach(t => matcheadas.add(t));
      return { titulo: g.titulo, rows };
    });
    const otros = todas.filter(t => !matcheadas.has(t)).sort(cmp);
    if (otros.length) grupos.push({ titulo: 'Otros', rows: otros });
    const gruposConDatos = grupos.filter(g => g.rows.length);
    if (!gruposConDatos.length) {
      return `${ordenControl()}<div class="card ten-card"><div class="empty-state">Sin tenencias en cartera</div></div>`;
    }
    return ordenControl() + gruposConDatos.map(g => `<div class="card ten-card">
      ${grupoLbl(g.titulo, g.rows, totalVal)}
      ${hdrRow()}
      ${g.rows.map(t => fila(t, totalVal)).join('')}
    </div>`).join('');
  }

  // fuente: 'live' (Worker → IOL, recién consultado) o 'estatico' (JSON commiteado,
  // último cierre de la rutina semanal). El usuario necesita saber cuál está viendo.
  function metaFuente(d, fuente) {
    const gen = d.generado ? new Date(d.generado) : null;
    if (fuente === 'live') {
      if (!gen) return 'En vivo · IOL';
      const minutos = Math.max(0, Math.round((Date.now() - gen.getTime()) / 60000));
      const hace = minutos < 1 ? 'hace instantes' : minutos < 60 ? `hace ${minutos} min` : `hace ${Math.round(minutos / 60)} h`;
      return `En vivo · ${hace} · IOL`;
    }
    if (!gen) return 'Último cierre · rutina semanal IOL (lunes 8:00)';
    return `Último cierre · ${gen.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} · rutina semanal IOL (lunes 8:00)`;
  }

  function render(body, d, fuente) {
    _ctx = { body, d, fuente };
    const meta = metaFuente(d, fuente || 'estatico');
    body.innerHTML = `<div class="ci-meta">${esc(meta)}</div>${header(d)}${tabla(d)}`;
    const toggle = sim => {
      _openSimbolo = _openSimbolo === sim ? null : sim;
      render(body, d, fuente);
      const restored = body.querySelector(`.ten-row[data-simbolo="${CSS.escape(sim)}"]`);
      if (restored) restored.focus();
    };
    body.querySelectorAll('.ten-row[data-simbolo]').forEach(row => {
      row.addEventListener('click', () => toggle(row.dataset.simbolo));
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle(row.dataset.simbolo);
        }
      });
    });
    body.querySelectorAll('.ten-venta-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); abrirVenta(btn.dataset.simbolo); });
    });
    body.querySelectorAll('.ten-orden-chip[data-orden]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (_orden === btn.dataset.orden) return;
        _orden = btn.dataset.orden;
        render(body, d, fuente);
        body.querySelector('.ten-orden-chip[data-orden="' + _orden + '"]')?.focus();
      });
    });
  }

  // ── Registrar venta: modal + historial. El cálculo y los asientos viven en finanzas.js (registrarVentaCartera). ──
  const $ = id => document.getElementById(id);

  function abrirVenta(simbolo) {
    const d = _ctx && _ctx.d;
    const t = d && (d.tenencias || []).find(x => x.simbolo === simbolo);
    if (!t) return;
    const accs = (S.accounts || []).filter(a => (a.currency || 'ARS') === 'ARS');
    const inv = accs.filter(a => a.type === 'invest');
    if (!inv.length) { showToast('Para registrar una venta primero creá una cuenta de tipo Inversión en Finanzas', 4500); return; }
    if (accs.length < 2) { showToast('Necesitás otra cuenta en pesos (por ejemplo Ualá) para recibir la plata de la venta', 4500); return; }
    const disp = carteraDisponibles(t, d.generado);
    if (disp <= 0) { showToast('No te quedan unidades de ' + t.simbolo + ' para vender hasta la próxima actualización de la cartera', 4500); return; }
    const from = inv[0];
    const to = accs.find(a => a.type === 'bank' && a.id !== from.id) || accs.find(a => a.id !== from.id);
    const opts = sel => accs.map(a => `<option value="${esc(a.id)}"${a.id === sel.id ? ' selected' : ''}>${esc(a.icon || '🏦')} ${esc(a.name)} · ${esc(fmtMoney(a.balance, a.currency))}</option>`).join('');
    $('ventaFrom').innerHTML = opts(from);
    $('ventaTo').innerHTML = opts(to);
    $('ventaTitulo').textContent = 'Registrar venta · ' + t.simbolo;
    $('ventaDisp').textContent = 'Disponibles para vender: ' + disp.toLocaleString('es-AR');
    $('ventaUnidades').value = '';
    $('ventaPrecio').value = num(t.precio) > 0 ? String(t.precio) : '';
    _venta = { t, generado: d.generado };
    ventaPreview();
    openModal('modal-venta-activo');
  }

  function ventaValores() {
    return { unidades: $('ventaUnidades').value, precio: $('ventaPrecio').value, fromId: $('ventaFrom').value, toId: $('ventaTo').value };
  }

  // Resumen en vivo: cuánto entra, cuánto era el costo y el resultado; avisa si el origen queda en negativo (se permite).
  function ventaPreview() {
    const res = $('ventaResumen'), warn = $('ventaWarn');
    res.innerHTML = ''; warn.textContent = ''; warn.style.display = 'none';
    if (!_venta) return;
    const v = ventaValores();
    if (v.unidades === '' || v.precio === '') return;
    const c = carteraCalcVenta({ t: _venta.t, generado: _venta.generado, unidades: v.unidades, precio: v.precio });
    if (!c.ok) { res.innerHTML = `<span class="text-danger">${esc(c.msg)}</span>`; return; }
    const cls = c.resultado > 0 ? 'text-ok' : c.resultado < 0 ? 'text-danger' : 'text-ter';
    res.innerHTML = `<div>Vendés por <b class="mono">${money(c.vendido, 2)}</b>; lo que habías puesto era <b class="mono">${money(c.costoTot, 2)}</b>.</div>
      <div class="${cls}">${c.resultado >= 0 ? 'Ganancia' : 'Pérdida'}: <b class="mono">${money(Math.abs(c.resultado), 2)}</b> (${pct(c.pct)})</div>
      <div class="text-ter ten-venta-costo">Costo por unidad: <b class="mono">${money(c.costoUnit, 4)}</b> (${c.costoOrigen === 'lotes' ? 'promedio de tus compras' : 'promedio que informa IOL'})</div>
      ${c.avisoLotes ? '<div class="move-warn ten-venta-aviso">El costo sale del promedio que informa IOL porque los lotes no coinciden.</div>' : ''}
      ${c.cierra ? '<div class="text-ter">Con esta venta ya no te queda nada de este activo.</div>' : ''}`;
    const from = (S.accounts || []).find(a => a.id === v.fromId);
    if (from && from.balance - c.costoTot < 0) {
      warn.textContent = `Ojo: "${from.name}" va a quedar en negativo (${fmtMoney(Math.round((from.balance - c.costoTot) * 100) / 100, from.currency)}). Igual se puede registrar.`;
      warn.style.display = '';
    }
  }

  function ventaConfirmar() {
    if (!_venta) return; // ya confirmada (doble clic) o cerrada
    const v = ventaValores();
    const r = registrarVentaCartera({ t: _venta.t, generado: _venta.generado, unidades: v.unidades, precio: v.precio, fromId: v.fromId, toId: v.toId });
    if (!r.ok) { showToast(r.msg, 4500); return; }
    _venta = null;
    closeModal('modal-venta-activo');
    if (_ctx) render(_ctx.body, _ctx.d, _ctx.fuente);
    const txt = r.resultado === 0 ? 'Venta registrada, sin ganancia ni pérdida'
      : `Venta registrada: ${r.resultado > 0 ? 'ganaste' : 'perdiste'} ${money(Math.abs(r.resultado), 2)}`;
    showToast(r.from.balance < 0 ? `${txt}. Ojo: "${r.from.name}" quedó en negativo` : txt, 5000);
  }

  // Pestaña "Historial": un registro por activo vendido por completo (las ventas parciales de los que siguen en cartera se ven en su detalle).
  function renderHistorial(box) {
    const ciclos = typeof carteraCiclosCerrados === 'function' ? carteraCiclosCerrados() : [];
    if (!ciclos.length) {
      box.innerHTML = `<div class="card ten-card"><div class="empty-state">Todavía no vendiste ningún activo por completo.<br>
        Cuando registres la venta de todo lo que tenías de un activo, queda acá su resumen: cuándo lo compraste, cuándo lo vendiste y cuánto ganaste o perdiste.</div></div>`;
      return;
    }
    box.innerHTML = `<div class="card ten-card">
      <div class="sec-label ten-grupo-lbl">Activos que ya vendiste</div>
      ${ciclos.map(c => `<div class="ten-hist-row">
        <div class="ten-hist-main">
          <span class="mono bold ten-sim">${esc(c.simbolo)}</span>
          <span class="ten-hist-fechas">Compra ${fechaCorta(c.fechaCompra)} · Venta ${fechaCorta(c.fechaVenta)}</span>
        </div>
        <div class="ten-hist-res ${varCls(c.resultado)}">
          <span class="mono bold">${c.pct == null ? '—' : pct(c.pct)}</span>
          <span class="mono ten-hist-monto">${money(c.resultado, 2)}</span>
        </div>
      </div>`).join('')}
    </div>`;
  }

  // Fetch con timeout corto — si el Worker está caído/lento no puede demorar
  // la carga de la pestaña; a los WORKER_TIMEOUT_MS se aborta y cae al estático.
  function fetchConTimeout(url, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
  }

  async function fetchWorker() {
    // Sin sesión no hay token que mandar — directo al estático, ni vale la
    // pena golpear el Worker (respondería 401 igual).
    if (typeof _auth === 'undefined' || !_auth.currentUser) throw new Error('sin sesión de Firebase Auth');
    const idToken = await _auth.currentUser.getIdToken();
    const res = await fetchConTimeout(URL_WORKER, {
      headers: { authorization: `Bearer ${idToken}` },
      cache: 'no-store',
    }, WORKER_TIMEOUT_MS);
    if (!res.ok) {
      let msg = 'worker HTTP ' + res.status;
      try { const j = await res.json(); if (j && j.message) msg = j.message; } catch (_) { /* body no-JSON, nos quedamos con el status */ }
      throw new Error(msg);
    }
    return res.json();
  }

  function fetchEstatico(bx) {
    return fetch(URL_JSON, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        try {
          render(bx, d, 'estatico');
        } catch (e) {
          console.error('[tenencias]', e);
          bx.innerHTML = `<div class="empty-state">Los datos de tenencias tienen un formato inesperado.<br>
            Revisá la consola para más detalle.</div>`;
        }
      })
      .catch(e => {
        console.error('[tenencias]', e);
        const es404 = /^HTTP 404/.test(String(e && e.message));
        bx.innerHTML = es404
          ? `<div class="empty-state">Todavía no hay tenencias disponibles.<br>
              La rutina corre los lunes a las 8:00 y publica la posición acá automáticamente.</div>`
          : `<div class="empty-state">No se pudieron cargar las tenencias.<br>
              Revisá la conexión o intentá de nuevo más tarde.</div>`;
      });
  }

  // Intenta el Worker (cartera en vivo desde IOL); ante CUALQUIER falla (sin
  // red, Worker caído, sin credenciales configuradas, timeout, formato
  // inesperado) cae al JSON estático exactamente como funcionaba antes de
  // este endpoint — la app nunca puede quedar peor que antes por su culpa.
  function renderInto(bx) {
    _openSimbolo = null;
    _orden = 'valorizado';
    bx.innerHTML = `<div class="empty-state">Cargando tenencias…</div>`;
    fetchWorker()
      .then(d => {
        try {
          render(bx, d, 'live');
        } catch (e) {
          console.warn('[tenencias] Worker devolvió un formato inesperado, cae a estático:', e);
          return fetchEstatico(bx);
        }
      })
      .catch(e => {
        console.warn('[tenencias] Worker no disponible, cae a JSON estático:', e && e.message ? e.message : e);
        return fetchEstatico(bx);
      });
  }

  return { renderInto, renderHistorial, _ventaPreview: ventaPreview, _ventaConfirmar: ventaConfirmar };
})();
window.Tenencias = Tenencias;
