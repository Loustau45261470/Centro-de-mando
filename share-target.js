/* ── Atajos de app + "Compartir con" ──
   Lee ?accion=... o ?compartido=1 de la URL al cargar, lo guarda para sobrevivir
   al login (pantalla previa, no hay recarga real) y lo aplica post-boot. */
(function () {
  'use strict';
  const STORAGE_KEY = 'cm_accion_pendiente';

  // ── Captura al cargar el script ──
  (function capturar() {
    const p = new URLSearchParams(location.search);
    const accion = p.get('accion');
    const compartido = p.get('compartido');
    if (!accion && !compartido) return;

    const data = {
      accion: accion || (compartido ? 'compartido' : null),
      title: p.get('title') || '',
      text: p.get('text') || '',
      url: p.get('url') || '',
    };
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* privado/lleno: se pierde el atajo, no rompe el arranque */ }

    // Limpiar la URL para que un refresh no vuelva a disparar la acción.
    history.replaceState(null, '', location.pathname + location.hash);
  })();

  window.CMAccionPendiente = {
    consumir() {
      let data = null;
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) data = JSON.parse(raw);
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (e) { data = null; }
      return data;
    },
  };

  function combinarTexto(d) {
    const partes = [];
    if (d.title) partes.push(d.title);
    if (d.text) partes.push(d.text);
    if (d.url) partes.push(d.url);
    return partes.join('\n\n');
  }

  function irA(tab) {
    const btn = document.querySelector('.nav-btn[data-tab="' + tab + '"]');
    if (btn) btn.click();
    return btn;
  }

  function ejecutar(data) {
    if (data.accion === 'gasto') {
      irA('finanzas');
      if (typeof openModal === 'function') openModal('modal-add-txn');
      return true;
    }
    if (data.accion === 'habito') {
      irA('vida');
      setTimeout(() => {
        const el = document.getElementById('vida-habits-wrap');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return true;
    }
    if (data.accion === 'planner') {
      irA('vida');
      setTimeout(() => {
        const el = document.getElementById('dayPlannerCard');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return true;
    }
    if (data.accion === 'idea') {
      if (typeof openMapaIdeasOverlay !== 'function' || typeof miQcToggle !== 'function') return false;
      openMapaIdeasOverlay();
      miQcToggle();
      return true;
    }
    if (data.accion === 'compartido') {
      if (typeof openMapaIdeasOverlay !== 'function' || typeof miQcToggle !== 'function') return false;
      openMapaIdeasOverlay();
      miQcToggle();
      // ta.value es una propiedad de texto plano, no innerHTML: el navegador no la
      // interpreta como HTML, así que no hace falta (ni corresponde) escaparla acá.
      const ta = document.getElementById('mi-qc-text');
      if (ta) ta.value = combinarTexto(data);
      return true;
    }
    return false;
  }

  window.aplicarAccionPendiente = function aplicarAccionPendiente() {
    const data = window.CMAccionPendiente.consumir();
    if (!data || !data.accion) return;

    const ok = ejecutar(data);
    if (!ok) {
      setTimeout(() => {
        if (!ejecutar(data)) console.warn('CM: no se pudo aplicar la acción pendiente "' + data.accion + '"');
      }, 800);
    }
  };
})();
