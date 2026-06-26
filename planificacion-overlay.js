'use strict';
// ════════════════════════════════════════════════════════════════════════
// PLANIFICACIÓN — overlay inmersivo con pestañas Hoy / Mañana (estilo Google).
// Reutiliza buildPlannerSlide() (app.js) para el planner por hora y reubica la
// card "Plan Mañana" (#tomorrow-card) dentro de la pestaña Mañana.
// ════════════════════════════════════════════════════════════════════════

let _plovTab = 'hoy';

function plannerOverlayOpen() {
  if (typeof CMOverlay === 'undefined') return;
  const { overlay, body } = CMOverlay.build({ id: 'ov-planner', accent: '#00D4FF', onClose: _plovRestore });
  if (!overlay._plovBuilt) {
    body.innerHTML = `
      <div class="cm-ov-head"><div class="cm-ov-eyebrow">VIDA · PLANIFICACIÓN</div><div class="cm-ov-title">Planificación del día</div></div>
      <div class="plov-tabs">
        <button class="plov-tab" data-d="hoy" onclick="plannerOverlayTab('hoy')">Hoy</button>
        <button class="plov-tab" data-d="manana" onclick="plannerOverlayTab('manana')">Mañana</button>
        <span class="plov-tab-ink"></span>
      </div>
      <div class="plov-pane" id="plov-pane-hoy">
        <div class="plov-sub">Metas de hoy</div>
        <div id="plov-metas-host"></div>
        <div class="plov-sub">Agenda por hora</div>
        <div class="plov-list" id="plov-list-hoy"></div>
      </div>
      <div class="plov-pane" id="plov-pane-manana" hidden>
        <div class="plov-sub">Plan de mañana</div>
        <div id="plov-tom-host"></div>
        <div class="plov-sub">Agenda por hora</div>
        <div class="plov-list" id="plov-list-manana"></div>
      </div>`;
    overlay._plovBuilt = true;
  }
  _plovTab = 'hoy';
  _plovApplyTab();
  plannerOverlayRender();
  CMOverlay.open(overlay);
}

function plannerOverlayRender() {
  if (typeof buildPlannerSlide !== 'function') return;
  buildPlannerSlide(document.getElementById('plov-list-hoy'), getActiveDate(), true, false);
  buildPlannerSlide(document.getElementById('plov-list-manana'), getTomorrow(), false, false);
  // Reubicar las cards existentes dentro de las pestañas (si no están ya).
  _plovHostInto('metas-hoy-card', 'plov-metas-host');
  _plovHostInto('tomorrow-card', 'plov-tom-host');
}
function _plovHostInto(srcId, hostId) {
  const src = document.getElementById(srcId), host = document.getElementById(hostId);
  if (src && host && src.parentNode !== host) {
    src._plovHome = { parent: src.parentNode, next: src.nextSibling };
    host.appendChild(src);
  }
}

function plannerOverlayTab(d) { _plovTab = d; _plovApplyTab(); }
function _plovApplyTab() {
  const ov = document.getElementById('ov-planner'); if (!ov) return;
  ov.querySelectorAll('.plov-tab').forEach(t => t.classList.toggle('on', t.dataset.d === _plovTab));
  const hoy = document.getElementById('plov-pane-hoy'), man = document.getElementById('plov-pane-manana');
  if (hoy) hoy.hidden = _plovTab !== 'hoy';
  if (man) man.hidden = _plovTab !== 'manana';
  const tabs = ov.querySelector('.plov-tabs');
  if (tabs) tabs.dataset.on = _plovTab;
}

function _plovRestore() {
  ['metas-hoy-card', 'tomorrow-card'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el._plovHome) { el._plovHome.parent.insertBefore(el, el._plovHome.next); el._plovHome = null; }
  });
}
window.plannerOverlayOpen = plannerOverlayOpen;
