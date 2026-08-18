'use strict';
// ════════════════════════════════════════════════════════════════════════
// CARTERA — overlay único de Finanzas con dos pestañas: "Mis tenencias"
// (posiciones reales IOL, ver tenencias.js — pestaña default) y
// "Análisis mensual" (CEDEARs + predicciones del agente, ver
// cartera-inversion.js). Fusión de los overlays que antes eran
// independientes: un solo botón en el abanico de Finanzas, un solo
// CMOverlay, patrón de tabs reutilizado de plannificacion-overlay.js
// (.plov-tabs/.plov-tab/.plov-pane, overlay-core.css). La lógica de fetch
// y render de cada pestaña vive sin cambios en su propio archivo.
// ════════════════════════════════════════════════════════════════════════

const CarteraOverlay = (() => {
  let _tab = 'tenencias';
  let _analisisCargado = false;

  function open() {
    if (typeof CMOverlay === 'undefined') return;
    const { overlay, body } = CMOverlay.build({ id: 'ov-cartera', accent: '#22C55E' });
    _tab = 'tenencias';
    _analisisCargado = false;
    body.innerHTML = `
      <div class="cm-ov-head"><div class="cm-ov-eyebrow">FINANZAS · CARTERA</div><div class="cm-ov-title">Cartera</div></div>
      <div class="plov-tabs" data-on="tenencias">
        <button class="plov-tab on" data-t="tenencias" onclick="CarteraOverlay._tab('tenencias')">Mis tenencias</button>
        <button class="plov-tab" data-t="analisis" onclick="CarteraOverlay._tab('analisis')">Análisis mensual</button>
        <span class="plov-tab-ink"></span>
      </div>
      <div class="plov-pane ci-body" id="cov-pane-tenencias"></div>
      <div class="plov-pane ci-body" id="cov-pane-analisis" hidden></div>`;
    CMOverlay.open(overlay);
    if (window.Tenencias) Tenencias.renderInto(body.querySelector('#cov-pane-tenencias'));
  }

  function tab(t) {
    _tab = t;
    const ov = document.getElementById('ov-cartera');
    if (!ov) return;
    ov.querySelectorAll('.plov-tab').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    const tabs = ov.querySelector('.plov-tabs');
    if (tabs) tabs.dataset.on = t;
    const pTen = ov.querySelector('#cov-pane-tenencias'), pAn = ov.querySelector('#cov-pane-analisis');
    if (pTen) pTen.hidden = t !== 'tenencias';
    if (pAn) pAn.hidden = t !== 'analisis';
    if (t === 'analisis' && !_analisisCargado && window.CarteraInversion) {
      _analisisCargado = true;
      CarteraInversion.renderInto(pAn);
    }
  }

  return { open, _tab: tab };
})();
window.CarteraOverlay = CarteraOverlay;
