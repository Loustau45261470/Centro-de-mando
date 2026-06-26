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
};

// ── Montaje ───────────────────────────────────────────────────────────────
function _sfMount() {
  if (typeof CMSpeedDial === 'undefined') return;
  const tabConoc = document.getElementById('tab-conocimiento');

  CMSpeedDial.create({
    id: 'sd-conocimiento',
    accent: '#6B8EFF',
    ariaLabel: 'Acciones de Conocimiento',
    mainIcon: _SF_ICONS.brain,
    items: [
      { icon: _SF_ICONS.notas, label: 'Notas', accent: '#6B8EFF', onClick: () => { if (typeof notasOpen === 'function') notasOpen(); } },
      { icon: _SF_ICONS.proy, label: 'Proyectos', accent: '#38BDF8', onClick: () => { if (window.ProyectosOverlay) ProyectosOverlay.open('conocimiento'); } },
    ],
    observeEl: tabConoc,
    visibleWhen: () => !!(tabConoc && tabConoc.classList.contains('active')),
  });

  // Resto de secciones: por ahora un item (Proyectos) → FAB de acción directa.
  // Se sumarán items (Planificación, Presupuesto, Entrenamiento, etc.) en fases siguientes.
  const sections = [
    { tab: 'vida', accent: '#00D4FF', icon: _SF_ICONS.vida, name: 'Vida' },
    { tab: 'salud', accent: '#F43F5E', icon: _SF_ICONS.salud, name: 'Salud' },
    { tab: 'finanzas', accent: '#22C55E', icon: _SF_ICONS.finanzas, name: 'Finanzas' },
    { tab: 'ia', accent: '#C4D0E4', icon: _SF_ICONS.ia, name: 'IA' },
  ];
  sections.forEach(s => {
    const el = document.getElementById('tab-' + s.tab);
    CMSpeedDial.create({
      id: 'sd-' + s.tab, accent: s.accent, ariaLabel: 'Acciones de ' + s.name, mainIcon: s.icon,
      items: [
        { icon: _SF_ICONS.proy, label: 'Proyectos', accent: s.accent, onClick: () => { if (window.ProyectosOverlay) ProyectosOverlay.open(s.tab); } },
      ],
      observeEl: el,
      visibleWhen: () => !!(el && el.classList.contains('active')),
    });
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _sfMount);
else _sfMount();
