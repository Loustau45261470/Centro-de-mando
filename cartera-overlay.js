'use strict';
// ════════════════════════════════════════════════════════════════════════
// CARTERA — overlay único de Finanzas con dos pestañas: "Mis tenencias"
// (posiciones reales IOL, ver tenencias.js — pestaña default) y
// "Análisis mensual" (CEDEARs + predicciones del agente, ver
// cartera-inversion.js). Fusión de los overlays que antes eran
// independientes: un solo botón en el abanico de Finanzas, un solo
// CMOverlay, patrón de tabs reutilizado de plannificacion-overlay.js
// (.plov-tabs/.plov-tab/.plov-pane, overlay-core.css). La lógica de fetch
// y render de cada pestaña vive sin cambios en su propio archivo. Una tercera,
// "Historial", lista los activos ya vendidos por completo (ver tenencias.js).
// ════════════════════════════════════════════════════════════════════════

const CarteraOverlay = (() => {
  let _analisisCargado = false;
  let _analisisEnCurso = false;

  function open() {
    if (typeof CMOverlay === 'undefined') return;
    const { overlay, body } = CMOverlay.build({ id: 'ov-cartera', accent: '#22C55E' });
    _analisisCargado = false;
    _analisisEnCurso = false;
    body.innerHTML = `
      <div class="cm-ov-head"><div class="cm-ov-eyebrow">FINANZAS · CARTERA</div><div class="cm-ov-title">Cartera</div></div>
      <div class="plov-tabs" data-on="tenencias" role="tablist">
        <button class="plov-tab on" data-t="tenencias" role="tab" aria-selected="true" onclick="CarteraOverlay._tab('tenencias')">Mis tenencias</button>
        <button class="plov-tab" data-t="analisis" role="tab" aria-selected="false" onclick="CarteraOverlay._tab('analisis')">Análisis mensual</button>
        <button class="plov-tab" data-t="historial" role="tab" aria-selected="false" onclick="CarteraOverlay._tab('historial')">Historial</button>
        <span class="plov-tab-ink"></span>
      </div>
      <div class="plov-pane ci-body" id="cov-pane-tenencias" role="tabpanel"></div>
      <div class="plov-pane ci-body" id="cov-pane-analisis" role="tabpanel" hidden></div>
      <div class="plov-pane ci-body" id="cov-pane-historial" role="tabpanel" hidden></div>`;
    CMOverlay.open(overlay);
    if (window.Tenencias) Tenencias.renderInto(body.querySelector('#cov-pane-tenencias'));
  }

  function tab(t) {
    const ov = document.getElementById('ov-cartera');
    if (!ov) return;
    ov.querySelectorAll('.plov-tab').forEach(b => {
      const on = b.dataset.t === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    const tabs = ov.querySelector('.plov-tabs');
    if (tabs) tabs.dataset.on = t;
    const pTen = ov.querySelector('#cov-pane-tenencias'), pAn = ov.querySelector('#cov-pane-analisis'), pHis = ov.querySelector('#cov-pane-historial');
    if (pTen) pTen.hidden = t !== 'tenencias';
    if (pAn) pAn.hidden = t !== 'analisis';
    if (pHis) pHis.hidden = t !== 'historial';
    // El historial sale de lo que se registró, así que se repinta cada vez que se abre la pestaña.
    if (t === 'historial' && pHis && window.Tenencias) Tenencias.renderHistorial(pHis);
    if (t === 'analisis' && !_analisisCargado && !_analisisEnCurso && window.CarteraInversion) {
      _analisisEnCurso = true;
      CarteraInversion.renderInto(pAn)
        .then(() => { _analisisCargado = true; })
        .catch(() => {}) // ya renderizó el error en el pane; solo evitamos unhandled rejection
        .finally(() => { _analisisEnCurso = false; });
    }
  }

  return { open, _tab: tab };
})();
window.CarteraOverlay = CarteraOverlay;
