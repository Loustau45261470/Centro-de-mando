'use strict';
// ════════════════════════════════════════════════════════════════════════
// PLANIFICACIÓN — overlay inmersivo con pestañas Día / Semana (estilo Google).
// Reutiliza buildDayCalendar()/buildWeekCalendar() (app.js) para el calendario
// por horas y por semana, pintado por área. La pestaña Día aloja también las
// metas de hoy y de mañana (#metas-hoy-card, #tomorrow-card) — ya no hay una
// pestaña "Mañana" separada; el resto de los días vive en la pestaña Semana.
// ════════════════════════════════════════════════════════════════════════

let _plovTab = 'dia';
// Semana mostrada en la pestaña "Semana": ancla en memoria (no persiste — al
// reabrir el overlay siempre vuelve a la semana actual). null = semana de hoy.
let _plovWeekAnchor = null;

function plannerOverlayOpen() {
  if (typeof CMOverlay === 'undefined') return;
  const { overlay, body } = CMOverlay.build({ id: 'ov-planner', accent: '#00D4FF', onClose: _plovRestore });
  if (!overlay._plovBuilt) {
    body.innerHTML = `
      <div class="cm-ov-head"><div class="cm-ov-eyebrow">VIDA · PLANIFICACIÓN · build v152</div><div class="cm-ov-title">Planificación</div></div>
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
        <div class="plov-sub plov-sub-row">Calendario de hoy
          <button class="plov-add" onclick="openPlanModal(getActiveDate(), null)">＋ Actividad</button>
        </div>
        <div class="plov-list" id="plov-list-dia"></div>
      </div>
      <div class="plov-pane" id="plov-pane-semana" hidden>
        <div class="plov-sub plov-sub-row">Calendario semanal
          <button class="plov-add" onclick="openPlanModal(_plovWeekAddDate(), null)">＋ Actividad</button>
        </div>
        <div class="plov-week-nav">
          <button class="plov-wk-btn" onclick="plovWeekShift(-7)" aria-label="Semana anterior">‹</button>
          <span class="plov-wk-label" id="plov-wk-label" aria-live="polite" role="status"></span>
          <button class="plov-wk-btn" onclick="plovWeekShift(7)" aria-label="Semana siguiente">›</button>
          <button class="plov-wk-today" onclick="plovWeekToday()">Hoy</button>
          <input type="month" class="plov-wk-month" id="plov-wk-month" onchange="plovWeekJumpToMonth(this.value)" aria-label="Saltar a mes y año" min="1970-01" max="2100-12">
        </div>
        <div class="plov-list" id="plov-list-semana"></div>
      </div>`;
    overlay._plovBuilt = true;
  }
  _plovTab = 'dia';
  _plovWeekAnchor = null;
  _plovApplyTab();
  plannerOverlayRender();
  CMOverlay.open(overlay);
}

function _plovWeekAnchorDate() { return _plovWeekAnchor || getActiveDate(); }
function plovWeekShift(days) {
  const d = new Date(_plovWeekAnchorDate() + 'T00:00:00');
  d.setDate(d.getDate() + days);
  _plovWeekAnchor = localStr(d);
  plannerOverlayRender();
}
function plovWeekToday() { _plovWeekAnchor = null; plannerOverlayRender(); }
function plovWeekJumpToMonth(value) {
  // value: "YYYY-MM" (input type=month). Salta a la semana que contiene el
  // día 1 de ese mes — criterio simple y consistente.
  if (!value) return;
  const [y, m] = value.split('-').map(Number);
  if (!(y >= 1970 && y <= 2100) || m < 1 || m > 12) return;
  const d = new Date(2000, 0, 1);
  d.setFullYear(y, m - 1, 1);
  _plovWeekAnchor = localStr(d);
  plannerOverlayRender();
}
// Día a usar para "＋ Actividad" en la pestaña Semana: si hoy cae dentro de la
// semana mostrada se usa hoy, si no el lunes de esa semana (evita crear la
// actividad en una fecha fuera de lo que el usuario está viendo).
function _plovWeekAddDate() {
  const anchor = _plovWeekAnchorDate();
  const dates = plannerWeekDates(anchor);
  const today = getActiveDate();
  return dates.includes(today) ? today : dates[0];
}
function _plovWeekLabel(anchor) {
  const dates = plannerWeekDates(anchor);
  const a = new Date(dates[0] + 'T00:00:00'), b = new Date(dates[6] + 'T00:00:00');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const sameMonth = a.getMonth() === b.getMonth();
  const left = sameMonth ? `${a.getDate()}` : `${a.getDate()} ${months[a.getMonth()]}`;
  return `${left} – ${b.getDate()} ${months[b.getMonth()]} ${b.getFullYear()}`;
}

function plannerOverlayRender() {
  if (typeof buildDayCalendar !== 'function') return;
  if (_plovTab === 'dia') buildDayCalendar(document.getElementById('plov-list-dia'), getActiveDate());
  if (_plovTab === 'semana' && typeof buildWeekCalendar === 'function') {
    const anchor = _plovWeekAnchorDate();
    buildWeekCalendar(document.getElementById('plov-list-semana'), anchor);
    const lbl = document.getElementById('plov-wk-label'); if (lbl) lbl.textContent = _plovWeekLabel(anchor);
    const monthInput = document.getElementById('plov-wk-month');
    if (monthInput) monthInput.value = anchor.slice(0, 7);
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
window.plovWeekShift = plovWeekShift;
window.plovWeekToday = plovWeekToday;
window.plovWeekJumpToMonth = plovWeekJumpToMonth;
