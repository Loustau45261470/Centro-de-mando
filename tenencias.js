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

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const num = v => (v == null || isNaN(v)) ? null : Number(v);
  const pct = v => { const n = num(v); return n == null ? '—' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; };
  const money = (v, dec) => { const n = num(v); if (n == null) return '—'; const neg = n < 0; return (neg ? '-$' : '$') + Math.abs(n).toLocaleString('es-AR', { maximumFractionDigits: dec ?? 2 }); };
  const varCls = v => { const n = num(v); return n == null ? 'text-ter' : n > 0 ? 'text-ok' : n < 0 ? 'text-danger' : 'text-ter'; };

  let _openSimbolo = null;
  let _orden = 'valorizado'; // 'valorizado' | 'rendimiento'

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
      ${historialLotes(t)}
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
      const ra = num(a.rendimientoPct), rb = num(b.rendimientoPct);
      if (ra == null && rb == null) return 0;
      if (ra == null) return 1;
      if (rb == null) return -1;
      return rb - ra;
    }
  };

  function ordenControl() {
    return `<div class="ten-orden-chips" role="group" aria-label="Ordenar por">
      <button type="button" class="ten-orden-chip ${_orden === 'valorizado' ? 'on' : ''}" data-orden="valorizado">Valorizado</button>
      <button type="button" class="ten-orden-chip ${_orden === 'rendimiento' ? 'on' : ''}" data-orden="rendimiento">Rendimiento</button>
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

  function render(body, d) {
    const gen = d.generado ? new Date(d.generado) : null;
    const meta = `${gen ? 'Actualizado el ' + gen.toLocaleDateString('es-AR') + ' ' + gen.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''} · rutina semanal IOL (lunes 8:00)`;
    body.innerHTML = `<div class="ci-meta">${meta}</div>${header(d)}${tabla(d)}`;
    const toggle = sim => {
      _openSimbolo = _openSimbolo === sim ? null : sim;
      render(body, d);
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
    body.querySelectorAll('.ten-orden-chip[data-orden]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (_orden === btn.dataset.orden) return;
        _orden = btn.dataset.orden;
        render(body, d);
      });
    });
  }

  function renderInto(bx) {
    _openSimbolo = null;
    _orden = 'valorizado';
    bx.innerHTML = `<div class="empty-state">Cargando tenencias…</div>`;
    fetch(URL_JSON, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        try {
          render(bx, d);
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

  return { renderInto };
})();
window.Tenencias = Tenencias;
