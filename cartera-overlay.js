'use strict';
// ════════════════════════════════════════════════════════════════════════
// CARTERA — overlay único de Finanzas con pestañas: "Mis tenencias"
// (posiciones reales IOL, ver tenencias.js — pestaña default). Un solo
// botón en el abanico de Finanzas, un solo CMOverlay, patrón de tabs
// reutilizado de plannificacion-overlay.js (.plov-tabs/.plov-tab/.plov-pane,
// overlay-core.css). La lógica de fetch y render de cada pestaña vive sin
// cambios en su propio archivo. Una segunda,
// "Historial", lista los activos ya vendidos por completo (ver tenencias.js). Una tercera, "Rendimiento",
// calcula el rendimiento como inversor desde la fecha base (ver rendimiento.js / rendimiento-calc.js). Una cuarta, "Radar", es la ficha de
// fundamentals de cada empresa de radar-config.json, con el gráfico Crecimiento vs Valuación (ver radar.js / radar-vista.js).
// ════════════════════════════════════════════════════════════════════════

const CarteraOverlay = (() => {
  let _rendimientoCargado = false;
  let _radarCargado = false;

  function open() {
    if (typeof CMOverlay === 'undefined') return;
    const { overlay, body } = CMOverlay.build({ id: 'ov-cartera', accent: '#22C55E' });
    _rendimientoCargado = false;
    _radarCargado = false;
    body.innerHTML = `
      <div class="cm-ov-head"><div class="cm-ov-eyebrow">FINANZAS · CARTERA</div><div class="cm-ov-title">Cartera</div></div>
      <figure class="cov-quote"><blockquote>“If you're not willing to react with equanimity to a market price decline of 50%, you're not fit to be a common shareholder.”</blockquote><figcaption>— Charlie Munger</figcaption></figure>
      <div class="plov-tabs" data-on="tenencias" role="tablist">
        <button class="plov-tab on" data-t="tenencias" role="tab" aria-selected="true" onclick="CarteraOverlay._tab('tenencias')">Mis tenencias</button>
        <button class="plov-tab" data-t="historial" role="tab" aria-selected="false" onclick="CarteraOverlay._tab('historial')">Historial</button>
        <button class="plov-tab" data-t="rendimiento" role="tab" aria-selected="false" onclick="CarteraOverlay._tab('rendimiento')">Rendimiento</button>
        <button class="plov-tab" data-t="radar" role="tab" aria-selected="false" onclick="CarteraOverlay._tab('radar')">Radar</button>
        <span class="plov-tab-ink"></span>
      </div>
      <div class="plov-pane ci-body" id="cov-pane-tenencias" role="tabpanel"></div>
      <div class="plov-pane ci-body" id="cov-pane-historial" role="tabpanel" hidden></div>
      <div class="plov-pane ci-body" id="cov-pane-rendimiento" role="tabpanel" hidden></div>
      <div class="plov-pane ci-body" id="cov-pane-radar" role="tabpanel" hidden></div>`;
    CMOverlay.open(overlay);
    if (window.Tenencias) Tenencias.renderInto(body.querySelector('#cov-pane-tenencias'));
  }

  const TABS = ['tenencias', 'historial', 'rendimiento', 'radar'];

  function tab(t) {
    if (!TABS.includes(t)) t = 'tenencias'; // un nombre viejo (p. ej. 'analisis') cae en la pestaña por defecto
    const ov = document.getElementById('ov-cartera');
    if (!ov) return;
    ov.querySelectorAll('.plov-tab').forEach(b => {
      const on = b.dataset.t === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    const tabs = ov.querySelector('.plov-tabs');
    if (tabs) tabs.dataset.on = t;
    const pTen = ov.querySelector('#cov-pane-tenencias'), pHis = ov.querySelector('#cov-pane-historial'), pRen = ov.querySelector('#cov-pane-rendimiento'), pRad = ov.querySelector('#cov-pane-radar');
    if (pTen) pTen.hidden = t !== 'tenencias';
    if (pHis) pHis.hidden = t !== 'historial';
    if (pRen) pRen.hidden = t !== 'rendimiento';
    if (pRad) pRad.hidden = t !== 'radar';
    // El radar lee archivos del repo privado vía Worker: se arma la primera vez que se abre la pestaña; al volver, se actualiza.
    if (t === 'radar' && pRad && window.Radar) {
      if (!_radarCargado) { _radarCargado = true; Radar.renderInto(pRad); } else Radar.alMostrar();
    }
    // El rendimiento pega a la red (Worker + IOL): se calcula la primera vez que se abre la pestaña; "Actualizar" lo repite.
    if (t === 'rendimiento' && pRen && !_rendimientoCargado && window.Rendimiento) {
      _rendimientoCargado = true;
      Rendimiento.renderInto(pRen);
    }
    // El historial sale de lo que se registró, así que se repinta cada vez que se abre la pestaña.
    if (t === 'historial' && pHis && window.Tenencias) Tenencias.renderHistorial(pHis);
  }

  return { open, _tab: tab };
})();
window.CarteraOverlay = CarteraOverlay;
