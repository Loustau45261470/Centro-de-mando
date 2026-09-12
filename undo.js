/* ══════════════════════════════════════════════════════
   DESHACER — pila genérica de acciones reversibles con toast + Ctrl/Cmd+Z.
   API: window.CMUndo.registrar({ descripcion, deshacer }) / .hay() / .deshacerUltimo()
   ══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const MAX_STACK = 10;
  const TOAST_MS  = 7000;
  let stack = [];

  const style = document.createElement('style');
  style.textContent = `
    #cmundo-toast{position:fixed;bottom:calc(var(--nav) + var(--safe-b) + 70px);left:50%;
      transform:translateX(-50%) translateY(20px);display:flex;align-items:center;gap:12px;
      background:rgba(30,30,35,.95);border:1px solid var(--border);border-radius:12px;padding:10px 12px 10px 18px;
      font-size:var(--fs-13);color:var(--tp);backdrop-filter:blur(20px);opacity:0;transition:all .3s;
      pointer-events:none;z-index:201;max-width:calc(100vw - 32px)}
    #cmundo-toast.show{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto}
    #cmundo-toast .cmundo-msg{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #cmundo-toast button{flex-shrink:0;background:transparent;border:1px solid var(--hud);color:var(--hud-bright);
      font-family:var(--mono);font-size:var(--fs-13);font-weight:600;padding:5px 12px;border-radius:8px;cursor:pointer}
    #cmundo-toast button:hover,#cmundo-toast button:focus-visible{background:var(--hud);color:#000;outline:none}
    @media (prefers-reduced-motion: reduce){ #cmundo-toast{transition:none} }
    @media (max-width:480px){
      #cmundo-toast{left:12px;right:12px;transform:translateY(20px);max-width:none}
      #cmundo-toast.show{transform:translateY(0)}
    }
  `;
  document.head.appendChild(style);

  const box = document.createElement('div');
  box.id = 'cmundo-toast';
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  box.innerHTML = '<span class="cmundo-msg"></span><button type="button">Deshacer</button>';
  document.body.appendChild(box);
  const msgEl = box.querySelector('.cmundo-msg');
  const btnEl = box.querySelector('button');
  btnEl.addEventListener('click', deshacerUltimo);

  let hideTimer = null;
  function mostrarToast(descripcion) {
    msgEl.textContent = descripcion;
    box.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => box.classList.remove('show'), TOAST_MS);
  }

  function registrar({ descripcion, deshacer }) {
    if (typeof deshacer !== 'function') return;
    stack.push({ descripcion: descripcion || 'Acción eliminada', deshacer });
    if (stack.length > MAX_STACK) stack.shift();
    mostrarToast(stack[stack.length - 1].descripcion);
  }

  function hay() { return stack.length > 0; }

  function deshacerUltimo() {
    if (!stack.length) return;
    const accion = stack.pop();
    clearTimeout(hideTimer);
    box.classList.remove('show');
    try {
      accion.deshacer();
      if (typeof saveState === 'function') saveState();
      if (typeof showToast === 'function') showToast('Deshecho: ' + accion.descripcion, 2500);
    } catch (e) {
      console.error('[CMUndo] no se pudo deshacer', e);
      if (typeof showToast === 'function') showToast('No se pudo deshacer', 3500);
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'z' && e.key !== 'Z') return;
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    const t = e.target;
    const tag = t && t.tagName;
    const editable = t && (t.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT');
    if (editable || !hay()) return;
    e.preventDefault();
    deshacerUltimo();
  });

  window.CMUndo = { registrar, hay, deshacerUltimo };
})();
