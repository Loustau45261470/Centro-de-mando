'use strict';
// ════════════════════════════════════════════════════════════════════════
// DESCIFRAR — los números grandes (KPIs) "se decodifican" al aparecer (propuesta #7 de la maqueta HUD).
//
//   cmDescifrar(el, textoFinal, opts?)
//     opts.full  true  → descifrado completo al entrar: arranca LEAD_MS después del primer cuadro pintado (la sección todavía
//                        está apareciendo). Solo si el número está en pantalla; uno bajo el pliegue (o en una tarjeta que el
//                        scroll aún no reveló) queda con su valor real y se descifra UNA vez cuando asoma (IntersectionObserver).
//     opts.from  texto anterior a comparar (si el elemento se re-creó y ya no lo recuerda).
//
// Cómo se ve (fiel a la maqueta):
//   · Cada dígito rueda por 0-9 y los símbolos # % & @ * en CELESTE con brillo, ~18 cambios por segundo.
//   · Se fijan de izquierda a derecha: el carácter i queda fijo a los 250 ms + i × 75 ms, en BLANCO con halo suave.
//     $ . , % + - / espacios y letras quedan fijos (blancos) desde el inicio.
//   · Al terminar, el número vuelve en ~0,4 s a su propio color (verde en Finanzas, etc.) y queda el texto plano.
//   · Cada dígito ocupa el ancho medido de un dígito real → el número no cambia de ancho mientras rueda.
//   · Al CAMBIAR el valor (guardar un gasto) se vuelve a descifrar entero y su recuadro (FLASH_SEL) destella verde si
//     sube o rojo si baja: un barrido de luz + un anillo que se apaga en 0,9 s.
//
// Garantías:
//   · El texto final es SIEMPRE el valor real: una llamada nueva cancela la anterior; hay un timeout de seguridad aunque
//     rAF esté frenado; si alguien más escribe el elemento a mitad, no se lo pisa.
//   · Accesible: durante la animación el elemento lleva role="img" + aria-label=valor real (un lector de pantalla nunca
//     lee los símbolos al azar); al terminar se quitan y queda el texto real.
//   · Sin animación (texto final directo, sin destello) con prefers-reduced-motion, pestaña oculta, elemento no visible
//     o elemento con hijos propios.
// ════════════════════════════════════════════════════════════════════════
(() => {
  const SETTLE0 = 250, STEP_MS = 75;   // maqueta: el carácter i se fija a los 250 ms + i·75 ms
  const FULL_MIN_MS = 850;             // al entrar, el último carácter se fija no antes de 850 ms (un "2/6" no se resuelve en un parpadeo)
  const TICK_MS = 55;                  // ~18 cambios de símbolo por segundo (maqueta)
  const FADE_MS = 380;                 // blanco → color propio del número al terminar
  const LEAD_MS = 200;   // el descifrado completo empieza a fijar dígitos recién ~200 ms después del primer cuadro: la sección (tab-fade-in, --dur-base 220 ms) todavía está apareciendo
  const CH = '0123456789#%&@*';
  const FLASH_SEL = '.kpi-tile, .fin-summary-stat, .nw-hero-text';   // recuadro que destella al cambiar el valor
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const esDigito = (c) => c >= '0' && c <= '9';
  const sim = () => CH[(Math.random() * CH.length) | 0];

  // Valor de un texto formateado ("$7.885.408", "-$96.800", "18,4%", "+702k", "2/6") para saber si subió o bajó.
  function numero(s) {
    const t = String(s).replace(/[^\d.,]/g, '');
    if (!/\d/.test(t)) return NaN;
    const m = t.match(/[.,](\d{1,2})$/);
    let v = m ? parseFloat(t.slice(0, -m[0].length).replace(/[.,]/g, '') + '.' + m[1]) : parseFloat(t.replace(/[.,]/g, ''));
    if (/\dk\b/i.test(s)) v *= 1e3; else if (/\dM\b/.test(s)) v *= 1e6;
    return /^[^\d]*[-−]/.test(s) ? -v : v;
  }
  function destellar(el, previo, final) {
    const box = el.closest(FLASH_SEL);
    const a = numero(previo), b = numero(final);
    if (!box || Number.isNaN(a) || Number.isNaN(b) || a === b) return;
    let sw = box.querySelector(':scope > .dx-sweep');
    if (sw) sw.remove();
    box.classList.remove('dx-up', 'dx-down'); void box.offsetWidth;
    box.classList.add('dx-flash', b > a ? 'dx-up' : 'dx-down');
    sw = document.createElement('i'); sw.className = 'dx-sweep'; sw.setAttribute('aria-hidden', 'true');
    box.appendChild(sw);
    clearTimeout(box._dxFl);
    box._dxFl = setTimeout(() => { sw.remove(); box.classList.remove('dx-up', 'dx-down', 'dx-flash'); }, 1000);
  }

  // ── Números fuera de pantalla: esperan a verse (una sola vez) ──
  const _pend = new Set();
  const _io = ('IntersectionObserver' in window)
    ? new IntersectionObserver((ents) => {
        for (const e of ents) if (e.isIntersecting && _pend.has(e.target)) arrancar(e.target, 0);
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.5 })
    : null;
  const oculto = (el) => { const c = el.closest('.sr-armed'); return !!(c && !c.classList.contains('sr-in')); };   // tarjeta que el scroll aún no reveló (opacity 0)
  function enPantalla(el) {
    const r = el.getBoundingClientRect(), vh = window.innerHeight || document.documentElement.clientHeight;
    return r.width > 0 && r.bottom > 0 && r.top < vh * 0.94 && !oculto(el);
  }
  function arrancar(el, n) {   // asomó: espera a que su tarjeta termine de revelarse y descifra completo
    if (!_pend.has(el)) return;
    if (!el.isConnected || !el.getClientRects().length) { _pend.delete(el); _io.unobserve(el); return; }
    if (oculto(el) && n < 30) { setTimeout(() => arrancar(el, n + 1), 100); return; }
    _pend.delete(el); _io.unobserve(el);
    cmDescifrar(el, el.textContent, { full: true, visto: true });
  }

  function cerrar(el) {   // deja el elemento sin animación pendiente ni aria temporal
    if (_pend.has(el)) { _pend.delete(el); _io.unobserve(el); }
    const st = el._dx;
    if (!st) return;
    cancelAnimationFrame(st.raf); clearTimeout(st.timer); clearTimeout(st.fade);
    if (st.aria) { el.removeAttribute('role'); el.removeAttribute('aria-label'); }
    el.classList.remove('dx-on', 'dx-z'); el.style.removeProperty('--dx-w');
    el._dx = null;
  }
  function directo(el, final) {
    const spans = !!el._dx;
    cerrar(el);
    if (spans || el.textContent !== final) el.textContent = final;   // con animación en curso hay spans: siempre se vuelve a texto plano
    el._dxFinal = final;
  }

  function cmDescifrar(el, texto, opts) {
    if (!el) return;
    opts = opts || {};
    let final = String(texto == null ? '' : texto);
    // Quien relee el DOM a mitad de animación (motion.js al volver a entrar, etc.) pasa los símbolos al azar que hay en pantalla:
    // si coincide con lo que estamos pintando, el valor real es el que ya guardamos, no ese texto.
    if (el._dx && final === el.textContent) final = el._dx.final;
    const previo = opts.from != null ? String(opts.from) : (el._dx ? el._dx.final : (el._dxFinal != null ? el._dxFinal : el.textContent));
    const corriendo = el._dx && el._dx.final === final && !opts.full;
    if (corriendo) return;                                     // mismo valor ya descifrándose: no reiniciar
    if (!/[0-9]/.test(final) || (mq && mq.matches) || document.hidden || !el.isConnected || !el.getClientRects().length || (el.children.length && !el._dx)) {
      return directo(el, final);
    }
    if (!opts.full && !el._dx && previo === final) return directo(el, final);   // sin cambios
    if (opts.full && !opts.visto && _io && !enPantalla(el)) {   // fuera de pantalla: valor real ya escrito, se descifra al asomar
      directo(el, final); _pend.add(el); _io.observe(el); return;
    }

    const completo = !!opts.full || !el._dxInit;
    if (!completo && document.documentElement.classList.contains('mo-in')) return directo(el, final);   // render masivo de entrada a sección (CMMotion.quiet): sin animar
    if (!opts.full && previo !== final) destellar(el, previo, final);

    cerrar(el);
    el._dxInit = true;
    const n = final.length;
    const step = completo ? Math.max(STEP_MS, (FULL_MIN_MS - SETTLE0) / Math.max(1, n - 1)) : STEP_MS;
    const st = el._dx = { final, aria: false, raf: 0, timer: 0, fade: 0, last: final };
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('role')) {
      el.setAttribute('role', 'img'); el.setAttribute('aria-label', final); st.aria = true;
    }
    // Un span por carácter. Arranca mostrando el valor real (quien lo lea en la misma tarea, p. ej. _fitNwTotal, ve el final);
    // el primer cuadro cifrado se pinta en el próximo rAF, antes del siguiente paint.
    const frag = document.createDocumentFragment(), rot = [];
    for (let i = 0; i < n; i++) {
      const sp = document.createElement('span'), c = final[i];
      sp.textContent = c;
      if (esDigito(c)) { sp.className = 'dx-d dx-s'; rot.push({ sp, c, at: SETTLE0 + i * step }); }
      else sp.className = 'dx-s';
      frag.appendChild(sp);
    }
    el.textContent = ''; el.appendChild(frag); el.classList.add('dx-on');
    const w = rot[0].sp.getBoundingClientRect().width;         // ancho real de un dígito: los símbolos no mueven el número
    if (w > 0) el.style.setProperty('--dx-w', w + 'px');
    const dur = rot[rot.length - 1].at;

    let t0 = 0, tickAt = -Infinity;                            // arranca en el primer cuadro PINTADO: un render pesado antes no se come la animación
    const terminar = () => { directo(el, final); };
    const pintar = (now) => {
      const e = now - t0, tick = now - tickAt >= TICK_MS;
      if (tick) tickAt = now;
      for (const r of rot) {
        if (e >= r.at) { if (r.sp.className !== 'dx-d dx-s') { r.sp.className = 'dx-d dx-s'; r.sp.textContent = r.c; } }
        else if (tick || r.sp.className !== 'dx-d dx-r') { r.sp.className = 'dx-d dx-r'; r.sp.textContent = sim(); }
      }
      st.last = el.textContent;
    };
    const frame = (now) => {
      if (el._dx !== st) return;
      if (!t0) t0 = now + (completo ? LEAD_MS : 0);
      if (el.textContent !== st.last) { el._dxFinal = el.textContent; cerrar(el); return; }   // otro escribió: no lo pisamos
      if (document.hidden) return terminar();
      pintar(now);
      if (now - t0 >= dur) {                                   // todo fijo en blanco → vuelve a su color y queda el texto plano
        el.classList.add('dx-z');
        st.fade = setTimeout(() => { if (el._dx !== st) return; if (el.textContent !== st.last) { el._dxFinal = el.textContent; cerrar(el); } else terminar(); }, FADE_MS);
        return;
      }
      st.raf = requestAnimationFrame(frame);
    };
    st.raf = requestAnimationFrame(frame);
    st.timer = setTimeout(() => { if (el._dx === st) terminar(); }, dur + LEAD_MS + FADE_MS + 1500);   // red de seguridad (rAF frenado)
  }

  cmDescifrar.cancelar = cerrar;
  window.cmDescifrar = cmDescifrar;
})();
