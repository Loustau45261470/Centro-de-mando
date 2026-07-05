'use strict';
// ════════════════════════════════════════════════════════════════════════
// SPEED-DIAL — FAB radial reusable por sección.
// CMSpeedDial.create({
//   id, accent, mainIcon, ariaLabel,
//   items: [{ icon, label, accent?, onClick }],
//   observeEl,                 // elemento cuyo .class define la visibilidad
//   visibleWhen: () => boolean  // cuándo mostrar el FAB
// })
// ════════════════════════════════════════════════════════════════════════

function _sdExportBackup() {
  const state = typeof S !== 'undefined' ? S : {};
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lifedash-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  if (typeof showToast === 'function') showToast('Backup exportado');
}

const CMSpeedDial = (() => {
  function create(cfg) {
    if (document.getElementById(cfg.id)) return;
    const sd = document.createElement('div');
    sd.id = cfg.id;
    sd.className = 'cm-sd';
    if (cfg.accent) sd.style.setProperty('--cm-accent', cfg.accent);

    const items = (cfg.items || []).map((it, i) => {
      const acc = it.accent ? ` style="--ia:${it.accent}"` : '';
      return `<button class="cm-sd-item" data-i="${i}" type="button" aria-label="${(it.label || '').replace(/"/g, '&quot;')}">
        <span class="cm-sd-item-lbl">${it.label || ''}</span>
        <span class="cm-sd-item-ico"${acc}>${it.icon || ''}</span>
      </button>`;
    }).join('');

    sd.innerHTML = `<div class="cm-sd-backdrop"></div>
      <div class="cm-sd-items">${items}</div>
      <button class="cm-sd-main" type="button" aria-label="${cfg.ariaLabel || 'Acciones'}" aria-expanded="false">
        <span class="cm-sd-ring"></span>
        <span class="cm-sd-main-ico">${cfg.mainIcon || ''}</span>
      </button>`;
    document.body.appendChild(sd);

    const main = sd.querySelector('.cm-sd-main');
    const backdrop = sd.querySelector('.cm-sd-backdrop');
    const setOpen = on => { sd.classList.toggle('open', on); main.setAttribute('aria-expanded', String(on)); };

    const solo = (cfg.items || []).length <= 1;
    if (solo) {
      sd.classList.add('cm-sd-solo');
      main.addEventListener('click', e => { e.stopPropagation(); const it = (cfg.items || [])[0]; if (it && typeof it.onClick === 'function') it.onClick(); });
    } else {
      main.addEventListener('click', e => { e.stopPropagation(); setOpen(!sd.classList.contains('open')); });
    }
    backdrop.addEventListener('click', () => setOpen(false));
    sd.querySelectorAll('.cm-sd-item').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        setOpen(false);
        const it = cfg.items[+btn.dataset.i];
        if (it && typeof it.onClick === 'function') it.onClick();
      });
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && sd.classList.contains('open')) setOpen(false); });

    // Visibilidad según pestaña/contexto
    const pred = typeof cfg.visibleWhen === 'function' ? cfg.visibleWhen : () => true;
    const sync = () => { sd.classList.toggle('on', !!pred()); if (!pred()) setOpen(false); };
    if (cfg.observeEl) new MutationObserver(sync).observe(cfg.observeEl, { attributes: true, attributeFilter: ['class'] });
    sync();
    return sd;
  }
  return { create };
})();
window.CMSpeedDial = CMSpeedDial;
