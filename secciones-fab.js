'use strict';
// ════════════════════════════════════════════════════════════════════════
// SECCIONES-FAB — wiring del speed-dial por sección del Centro de Mando.
// Conocimiento: cerebro 🧠 → abanico [ Notas, Proyectos ].
// Proyectos se abre reubicando su árbol ya renderizado dentro de un overlay
// inmersivo (no reescribe la lógica existente; al cerrar lo devuelve).
// ════════════════════════════════════════════════════════════════════════

const _SF_ICONS = {
  brain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 3.2A2.8 2.8 0 0 0 6.7 6a2.7 2.7 0 0 0-1.9 4.6A2.8 2.8 0 0 0 6 15.6a2.8 2.8 0 0 0 3.5 2.4z"/><path d="M14.5 3.2A2.8 2.8 0 0 1 17.3 6a2.7 2.7 0 0 1 1.9 4.6 2.8 2.8 0 0 1-1.2 5 2.8 2.8 0 0 1-3.5 2.4z"/><path d="M9.5 3.2v15.2M14.5 3.2v15.2M9.5 8.5H7M17 8.5h-2.5M9.5 12.5H7.5M16.5 12.5h-2"/></svg>`,
  notas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="13" height="17" rx="2.3"/><path d="M8.5 3.5v17"/><path d="M11 8.5h4M11 12h4"/></svg>`,
  proy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h3.4a2 2 0 0 1 1.4.6L11 7h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 11h18"/></svg>`,
  // Íconos principales por sección (coherentes con la nav)
  vida: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.58-7 8-7s8 3 8 7"/></svg>`,
  salud: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  finanzas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  ia: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="3"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 5V2.5M15 5V2.5M9 21.5V19M15 21.5V19M5 9H2.5M5 15H2.5M21.5 9H19M21.5 15H19"/></svg>`,
  // Íconos de items del abanico
  planner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M7.5 13h3M7.5 16.5h6"/></svg>`,
  gym: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5v11M17.5 6.5v11M4 9v6M20 9v6M6.5 12h11"/></svg>`,
  wellness: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 6-7 10-7 10z"/><path d="M12 12v-2"/></svg>`,
  goals: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 11.5a1 1 0 0 1-1 .9H8a1 1 0 0 1-1-.9z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>`,
  budget: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8 7h8"/><path d="M8 11h2M11 11h2M14 11h2M8 14.5h2M11 14.5h2M14 14.5v3"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>`,
};

// ── Presupuesto: overlay que aloja el presupuesto + las obligaciones recurrentes ──
let _sfBudgetSrcs = [];
function _sfOpenBudget() {
  if (typeof CMOverlay === 'undefined') return;
  const { overlay, body } = CMOverlay.build({ id: 'ov-budget', accent: '#22C55E', onClose: _sfRestoreBudget });
  if (!overlay._sfBuilt) {
    body.innerHTML = `<div class="cm-ov-head"><div class="cm-ov-eyebrow">FINANZAS · PRESUPUESTO</div><div class="cm-ov-title">Presupuesto del mes</div></div><div class="cm-ov-host" id="ov-budget-host"></div>`;
    overlay._sfBuilt = true;
  }
  const host = document.getElementById('ov-budget-host');
  _sfBudgetSrcs = [];
  ['budget-card', 'obligaciones-card'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el._sfHome = { parent: el.parentNode, next: el.nextSibling }; host.appendChild(el); _sfBudgetSrcs.push(el); }
  });
  CMOverlay.open(overlay);
}
function _sfRestoreBudget() {
  _sfBudgetSrcs.forEach(el => { if (el && el._sfHome) { el._sfHome.parent.insertBefore(el, el._sfHome.next); el._sfHome = null; } });
  _sfBudgetSrcs = [];
}
window.openBudgetOverlay = _sfOpenBudget;

// ── Montaje ───────────────────────────────────────────────────────────────
function _sfMount() {
  if (typeof CMSpeedDial === 'undefined') return;
  const tabConoc = document.getElementById('tab-conocimiento');

  // Openers de overlays inmersivos por reubicación del contenido existente.
  const R = (CMOverlay && CMOverlay.relocate) ? CMOverlay.relocate : () => () => {};
  const remItem = tab => ({ icon: _SF_ICONS.bell, label: 'Recordatorios', accent: '#7DD3FC', onClick: R({ id: 'ov-rem-' + tab, accent: '#7DD3FC', eyebrow: 'RECORDATORIOS', title: 'Recordatorios', sourceId: 'reminders-wrap-' + tab }) });

  CMSpeedDial.create({
    id: 'sd-conocimiento',
    accent: '#6B8EFF',
    ariaLabel: 'Acciones de Conocimiento',
    mainIcon: _SF_ICONS.brain,
    items: [
      { icon: _SF_ICONS.notas, label: 'Notas', accent: '#6B8EFF', onClick: () => { if (typeof notasOpen === 'function') notasOpen(); } },
      { icon: _SF_ICONS.proy, label: 'Proyectos', accent: '#38BDF8', onClick: () => { if (window.ProyectosOverlay) ProyectosOverlay.open('conocimiento'); } },
      remItem('conocimiento'),
    ],
    observeEl: tabConoc,
    visibleWhen: () => !!(tabConoc && tabConoc.classList.contains('active')),
  });

  const openPlanner = () => { if (typeof plannerOverlayOpen === 'function') plannerOverlayOpen(); };
  const openGym = R({ id: 'ov-gym', accent: '#F43F5E', eyebrow: 'SALUD · ENTRENAMIENTO', title: 'Entrenamiento', sourceId: 'rutinas-wrap' });
  window.openGymOverlay = openGym;
  const openGoals = R({ id: 'ov-goals', accent: '#F5A623', eyebrow: 'FINANZAS · ADQUISICIÓN', title: 'Objetivos de adquisición', sourceId: 'wishlist-card' });
  const openBudget = _sfOpenBudget;
  const proyItem = tab => ({ icon: _SF_ICONS.proy, label: 'Proyectos', accent: '#38BDF8', onClick: () => { if (window.ProyectosOverlay) ProyectosOverlay.open(tab); } });

  const sections = [
    { tab: 'vida', accent: '#00D4FF', icon: _SF_ICONS.vida, name: 'Vida', items: [
      proyItem('vida'),
      { icon: _SF_ICONS.planner, label: 'Planificación', accent: '#00D4FF', onClick: openPlanner },
      remItem('vida'),
    ] },
    { tab: 'salud', accent: '#F43F5E', icon: _SF_ICONS.salud, name: 'Salud', items: [
      proyItem('salud'),
      { icon: _SF_ICONS.gym, label: 'Entrenamiento', accent: '#F43F5E', onClick: openGym },
      { icon: _SF_ICONS.notas, label: 'Notas', accent: '#10E07C', onClick: () => { if (typeof saludNotasOpen === 'function') saludNotasOpen(); } },
      remItem('salud'),
    ] },
    { tab: 'finanzas', accent: '#22C55E', icon: _SF_ICONS.finanzas, name: 'Finanzas', items: [
      proyItem('finanzas'),
      { icon: _SF_ICONS.goals, label: 'Adquisición', accent: '#F5A623', onClick: openGoals },
      { icon: _SF_ICONS.budget, label: 'Presupuesto', accent: '#22C55E', onClick: openBudget },
      remItem('finanzas'),
    ] },
    { tab: 'ia', accent: '#C4D0E4', icon: _SF_ICONS.ia, name: 'IA', items: [proyItem('ia'), remItem('ia')] },
  ];
  sections.forEach(s => {
    const el = document.getElementById('tab-' + s.tab);
    CMSpeedDial.create({
      id: 'sd-' + s.tab, accent: s.accent, ariaLabel: 'Acciones de ' + s.name, mainIcon: s.icon,
      items: s.items,
      observeEl: el,
      visibleWhen: () => !!(el && el.classList.contains('active')),
    });
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _sfMount);
else _sfMount();
