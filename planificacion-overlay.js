'use strict';
// ════════════════════════════════════════════════════════════════════════
// PLANIFICACIÓN — overlay inmersivo con pestañas Día / Semana (estilo Google).
// Reutiliza buildDayCalendar()/buildWeekCalendar() (app.js) para el calendario
// por horas y por semana, pintado por área. La pestaña Día aloja también las
// metas de hoy y de mañana (#metas-hoy-card, #tomorrow-card) — ya no hay una
// pestaña "Mañana" separada; el resto de los días vive en la pestaña Semana.
// ════════════════════════════════════════════════════════════════════════

let _plovTab = 'dia';

function plannerOverlayOpen() {
  if (typeof CMOverlay === 'undefined') return;
  const { overlay, body } = CMOverlay.build({ id: 'ov-planner', accent: '#00D4FF', onClose: _plovRestore });
  if (!overlay._plovBuilt) {
    body.innerHTML = `
      <div class="cm-ov-head"><div class="cm-ov-eyebrow">VIDA · PLANIFICACIÓN · build v151</div><div class="cm-ov-title">Planificación</div></div>
      <div class="plov-tabs">
        <button class="plov-tab" data-d="dia" onclick="plannerOverlayTab('dia')">Día</button>
        <button class="plov-tab" data-d="semana" onclick="plannerOverlayTab('semana')">Semana</button>
        <span class="plov-tab-ink"></span>
      </div>
      <div class="plov-pane" id="plov-pane-dia">
        <div class="plov-sub">Metas de hoy</div>
        <div id="plov-metas-host"></div>
        <div class="plov-sub">Plan de mañana</div>
        <div id="plov-tom-host"></div>
        <div class="plov-sub">Calendario de hoy</div>
        <div class="plov-list" id="plov-list-dia"></div>
      </div>
      <div class="plov-pane" id="plov-pane-semana" hidden>
        <div class="plov-sub">Calendario semanal</div>
        <div class="plov-list" id="plov-list-semana"></div>
      </div>`;
    overlay._plovBuilt = true;
  }
  _plovTab = 'dia';
  _plovApplyTab();
  plannerOverlayRender();
  CMOverlay.open(overlay);
}

function plannerOverlayRender() {
  if (typeof buildDayCalendar !== 'function') return;
  buildDayCalendar(document.getElementById('plov-list-dia'), getActiveDate());
  if (_plovTab === 'semana' && typeof buildWeekCalendar === 'function') {
    buildWeekCalendar(document.getElementById('plov-list-semana'), getActiveDate());
  }
  // Reubicar las cards existentes dentro de la pestaña Día (si no están ya).
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

function plannerOverlayTab(d) { _plovTab = d; _plovApplyTab(); plannerOverlayRender(); }
function _plovApplyTab() {
  const ov = document.getElementById('ov-planner'); if (!ov) return;
  ov.querySelectorAll('.plov-tab').forEach(t => t.classList.toggle('on', t.dataset.d === _plovTab));
  const dia = document.getElementById('plov-pane-dia'), sem = document.getElementById('plov-pane-semana');
  if (dia) dia.hidden = _plovTab !== 'dia';
  if (sem) sem.hidden = _plovTab !== 'semana';
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
