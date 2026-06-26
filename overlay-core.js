'use strict';
// ════════════════════════════════════════════════════════════════════════
// OVERLAY CORE — primitivo reusable para overlays inmersivos full-screen.
// API: CMOverlay.build({id, accent, onClose}) → { overlay, body }
//      CMOverlay.open(idOrEl) / CMOverlay.close(idOrEl)
// Escape cierra el overlay abierto más reciente. Sin dependencias.
// ════════════════════════════════════════════════════════════════════════

const CMOverlay = (() => {
  const _el = x => typeof x === 'string' ? document.getElementById(x) : x;
  const _openStack = [];

  function build({ id, accent, onClose } = {}) {
    let ov = id && document.getElementById(id);
    if (!ov) {
      ov = document.createElement('div');
      if (id) ov.id = id;
      ov.className = 'cm-overlay';
      ov.innerHTML = `<div class="cm-panel">
        <button class="cm-ov-close" title="Cerrar (Esc)" aria-label="Cerrar">✕</button>
        <div class="cm-ov-body"></div>
      </div>`;
      document.body.appendChild(ov);
      ov.querySelector('.cm-ov-close').addEventListener('click', () => close(ov));
    }
    if (accent) ov.style.setProperty('--cm-accent', accent);
    if (onClose) ov._cmOnClose = onClose;
    return { overlay: ov, body: ov.querySelector('.cm-ov-body') };
  }

  function open(x) {
    const ov = _el(x); if (!ov) return;
    ov.classList.add('show');
    if (!_openStack.includes(ov)) _openStack.push(ov);
  }

  function close(x) {
    const ov = _el(x); if (!ov) return;
    ov.classList.remove('show');
    const i = _openStack.indexOf(ov); if (i >= 0) _openStack.splice(i, 1);
    if (typeof ov._cmOnClose === 'function') ov._cmOnClose(ov);
  }

  // Escape cierra el overlay abierto más reciente
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !_openStack.length) return;
    e.stopPropagation();
    close(_openStack[_openStack.length - 1]);
  });

  // relocate({ id, accent, eyebrow, title, sourceId }) → función que abre un overlay
  // que ALOJA (mueve) un contenedor ya existente del DOM, y lo devuelve al cerrar.
  // No reescribe la lógica de la sección: reutiliza el mismo nodo y sus handlers.
  function relocate(opts) {
    return function () {
      const src = document.getElementById(opts.sourceId);
      if (!src) { if (typeof showToast === 'function') showToast('No disponible'); return; }
      const { overlay, body } = build({
        id: opts.id, accent: opts.accent,
        onClose: () => { if (src._cmHome) { src._cmHome.parent.insertBefore(src, src._cmHome.next); src._cmHome = null; } },
      });
      if (!overlay._cmHosted) {
        body.innerHTML = `<div class="cm-ov-head"><div class="cm-ov-eyebrow">${opts.eyebrow || ''}</div><div class="cm-ov-title">${opts.title || ''}</div></div><div class="cm-ov-host"></div>`;
        overlay._cmHosted = true;
      }
      const host = body.querySelector('.cm-ov-host');
      src._cmHome = { parent: src.parentNode, next: src.nextSibling };
      host.appendChild(src);
      open(overlay);
    };
  }

  return { build, open, close, relocate };
})();
window.CMOverlay = CMOverlay;
