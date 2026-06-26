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
};

// ── Overlay de Proyectos (reubicación del árbol existente) ────────────────
let _sfProyWrap = null;
function _sfProyOverlay() {
  const { overlay, body } = CMOverlay.build({ id: 'proy-overlay', accent: '#6B8EFF', onClose: _sfRestoreProy });
  overlay.classList.add('cm-ov-proy');
  if (!document.getElementById('proy-ov-host')) {
    body.innerHTML = `<div class="cm-ov-head"><div class="cm-ov-eyebrow">CONOCIMIENTO · PROYECTOS</div><div class="cm-ov-title">Proyectos</div></div><div id="proy-ov-host"></div>`;
  }
  return overlay;
}
function proyectosOverlayOpen(tab) {
  const wrap = document.getElementById('proyectos-wrap-' + tab);
  if (!wrap) return;
  const overlay = _sfProyOverlay();
  const host = document.getElementById('proy-ov-host');
  wrap._sfHome = { parent: wrap.parentNode, next: wrap.nextSibling };
  _sfProyWrap = wrap;
  host.appendChild(wrap);
  CMOverlay.open(overlay);
}
function _sfRestoreProy() {
  const wrap = _sfProyWrap;
  if (wrap && wrap._sfHome) { wrap._sfHome.parent.insertBefore(wrap, wrap._sfHome.next); wrap._sfHome = null; }
  _sfProyWrap = null;
}

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
      { icon: _SF_ICONS.proy, label: 'Proyectos', accent: '#38BDF8', onClick: () => proyectosOverlayOpen('conocimiento') },
    ],
    observeEl: tabConoc,
    visibleWhen: () => !!(tabConoc && tabConoc.classList.contains('active')),
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _sfMount);
else _sfMount();
