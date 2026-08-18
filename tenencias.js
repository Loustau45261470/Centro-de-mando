'use strict';
// ════════════════════════════════════════════════════════════════════════
// MIS TENENCIAS — overlay de solo lectura sobre CMOverlay.
// Muestra las posiciones REALES de la cartera IOL de Tobías, generadas por
// una routine cloud semanal (lunes 8:00 ART) que commitea
// data/cartera/tenencias.json. No escribe estado: la única fuente es ese
// JSON servido por GitHub Pages. Distinto de CarteraInversion (análisis
// mensual de CEDEARs con predicciones) — este overlay es la foto real de
// lo que hay en la cuenta, sin picks ni proyecciones.
// ════════════════════════════════════════════════════════════════════════

const Tenencias = (() => {
  const URL_JSON = 'data/cartera/tenencias.json';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const num = v => (v == null || isNaN(v)) ? null : Number(v);
  const pct = v => { const n = num(v); return n == null ? '—' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; };
  const money = (v, dec) => { const n = num(v); return n == null ? '—' : '$' + n.toLocaleString('es-AR', { maximumFractionDigits: dec ?? 2 }); };
  const varCls = v => { const n = num(v); return n == null ? 'text-ter' : n > 0 ? 'text-ok' : n < 0 ? 'text-danger' : 'text-ter'; };

  let _openSimbolo = null;

  function liquidezRow(d) {
    const l = d.liquidez || {};
    return `<div class="ten-liq">
      <div class="ten-liq-item"><span class="ten-liq-lbl">ARS disponible</span><span class="mono">${money(l.ars_disponible, 0)}</span></div>
      <div class="ten-liq-item"><span class="ten-liq-lbl">ARS comprometido</span><span class="mono text-ter">${money(l.ars_comprometido, 0)}</span></div>
      <div class="ten-liq-item"><span class="ten-liq-lbl">USD disponible</span><span class="mono">u$s ${num(l.usd_disponible)?.toFixed(2) ?? '—'}</span></div>
    </div>`;
  }

  function header(d) {
    const t = d.totales || {};
    return `<div class="ten-hero">
      <div class="ten-hero-lbl">Valorizado total</div>
      <div class="ten-hero-num mono">${money(t.valorizado, 0)}</div>
      <div class="ten-hero-var mono ${varCls(t.variacionPct)}">${t.variacionPct == null ? 'Sin variación semanal registrada aún' : pct(t.variacionPct) + ' desde la última actualización'}</div>
    </div>
    ${liquidezRow(d)}`;
  }

  function rendimientoBanner(t) {
    const ppc = num(t.ppc);
    if (ppc == null) return '';
    const rp = num(t.rendimientoPct);
    const rm = num(t.rendimientoMonto);
    const gana = rp != null && rp >= 0;
    const cls = gana ? 'text-ok' : 'text-danger';
    const label = gana ? '¡Estás ganando!' : 'Estás perdiendo';
    const aprox = t.ppcConfianza === 'aproximada'
      ? ` <span class="ten-ppc-approx" title="Estimado — el historial de operaciones no cierra exacto para este activo">⚠</span>`
      : '';
    return `<div class="ten-rend ${cls}">${esc(label)} ${rp != null ? pct(rp) : '—'} (${money(rm, 0)})${aprox}</div>`;
  }

  function detalleFila(t) {
    const disponible = num(t.cantidad) != null && num(t.comprometido) != null ? num(t.cantidad) - num(t.comprometido) : null;
    const ppc = num(t.ppc);
    const aprox = ppc != null && t.ppcConfianza === 'aproximada'
      ? ` <span class="ten-ppc-approx" title="Estimado — el historial de operaciones no cierra exacto para este activo">⚠</span>`
      : '';
    return `<div class="ten-detail">
      ${rendimientoBanner(t)}
      <div class="ten-detail-grid">
        <div class="ten-detail-item"><span class="ten-detail-lbl">Cantidad</span><span class="mono">${num(t.cantidad)?.toLocaleString('es-AR') ?? '—'}</span></div>
        <div class="ten-detail-item"><span class="ten-detail-lbl">Comprometido</span><span class="mono">${num(t.comprometido)?.toLocaleString('es-AR') ?? '0'}</span></div>
        <div class="ten-detail-item"><span class="ten-detail-lbl">Disponible p/ operar</span><span class="mono">${disponible?.toLocaleString('es-AR') ?? '—'}</span></div>
        <div class="ten-detail-item"><span class="ten-detail-lbl">Precio actual</span><span class="mono">${money(t.precio, 4)}</span></div>
        ${ppc != null ? `<div class="ten-detail-item"><span class="ten-detail-lbl">PPC</span><span class="mono">${money(ppc, 4)}${aprox}</span></div>` : ''}
        <div class="ten-detail-item"><span class="ten-detail-lbl">Valorizado</span><span class="mono">${money(t.valorizado, 0)}</span></div>
        <div class="ten-detail-item"><span class="ten-detail-lbl">Var. último día hábil</span><span class="mono ${varCls(t.variacionDiariaPct)}">${pct(t.variacionDiariaPct)}</span></div>
        <div class="ten-detail-item"><span class="ten-detail-lbl">Variación semanal</span><span class="mono ${varCls(t.variacionPct)}">${t.variacionPct == null ? 'Sin dato aún' : pct(t.variacionPct)}</span></div>
      </div>
    </div>`;
  }

  function fila(t) {
    const abierto = _openSimbolo === t.simbolo;
    return `<div class="ten-row-wrap">
      <div class="ten-row ${abierto ? 'ten-row-active' : ''}" data-simbolo="${esc(t.simbolo)}" tabindex="0" role="button" aria-expanded="${abierto}">
        <div class="ten-row-main">
          <span class="mono bold ten-sim">${esc(t.simbolo)}</span>
          <span class="ten-tipo">${esc(t.tipo)}</span>
        </div>
        <span class="mono col-r ten-num ${varCls(t.variacionDiariaPct)}">${pct(t.variacionDiariaPct)}</span>
        <span class="mono col-r ten-num ${varCls(t.variacionPct)}">${t.variacionPct == null ? '—' : pct(t.variacionPct)}</span>
        <span class="mono col-r ten-num ten-val">${money(t.valorizado, 0)}</span>
      </div>
      ${abierto ? detalleFila(t) : ''}
    </div>`;
  }

  function tabla(d) {
    const rows = (d.tenencias || []).slice().sort((a, b) => (num(b.valorizado) ?? 0) - (num(a.valorizado) ?? 0));
    return `<div class="card ten-card">
      <div class="ten-row ten-hdr">
        <div class="ten-row-main"><span>Símbolo</span></div>
        <span class="col-r">Día hábil</span>
        <span class="col-r">Semanal</span>
        <span class="col-r">Valorizado</span>
      </div>
      ${rows.map(fila).join('') || '<div class="empty-state">Sin tenencias en cartera</div>'}
    </div>`;
  }

  function render(body, d) {
    const gen = d.generado ? new Date(d.generado) : null;
    const meta = `${gen ? 'Actualizado el ' + gen.toLocaleDateString('es-AR') + ' ' + gen.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''} · rutina semanal IOL (lunes 8:00)`;
    body.innerHTML = `<div class="ci-meta">${meta}</div>${header(d)}${tabla(d)}`;
    const toggle = sim => {
      _openSimbolo = _openSimbolo === sim ? null : sim;
      render(body, d);
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
  }

  function open() {
    if (typeof CMOverlay === 'undefined') return;
    _openSimbolo = null;
    const { overlay, body } = CMOverlay.build({ id: 'ov-tenencias', accent: '#22C55E' });
    body.innerHTML = `<div class="cm-ov-head"><div class="cm-ov-eyebrow">FINANZAS · CARTERA</div><div class="cm-ov-title">Mis tenencias</div></div><div class="ci-body" id="ten-body"><div class="empty-state">Cargando tenencias…</div></div>`;
    CMOverlay.open(overlay);
    const bx = body.querySelector('#ten-body');
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

  return { open };
})();
window.Tenencias = Tenencias;
