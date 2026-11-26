'use strict';
// ════════════════════════════════════════════════════════════════════════
// DESCIFRAR — los números grandes (KPIs) "se decodifican" al aparecer.
//
//   cmDescifrar(el, textoFinal, opts?)
//     opts.full  true  → descifrado completo (~1,1 s): todos los dígitos rotan y se fijan de izquierda a derecha.
//                        Solo si el número está en pantalla; uno bajo el pliegue (o en una tarjeta que el scroll aún no reveló)
//                        queda con su valor real y se descifra UNA vez cuando asoma (IntersectionObserver).
//     opts.from  texto anterior a comparar (si el elemento se re-creó y ya no lo recuerda).
//
// Política:
//   · Entrar a la sección / primera vez que el elemento se ve → completo (lo dispara motion.js con {full:true}).
//   · Actualización posterior del valor (guardar un gasto) → descifrado corto (~280 ms) SOLO de los dígitos que
//     cambiaron (comparando alineado a la derecha); los demás dígitos quedan quietos. Si ningún dígito cambió,
//     el valor es el mismo o es el render masivo de entrada a la sección (html.mo-in), no anima.
//   · Solo rotan los dígitos 0-9; $ . , % + - espacios y letras quedan fijos desde el inicio
//     → el ancho no salta. (El CSS global ya da tabular-nums.)
//   · El texto final es SIEMPRE el valor real: una llamada nueva cancela la animación anterior; hay un
//     timeout de seguridad aunque rAF esté frenado; si alguien más escribe el elemento a mitad, no se lo pisa.
//   · Accesible: durante la animación el elemento lleva role="img" + aria-label=valor real (un lector de
//     pantalla nunca lee los dígitos al azar); al terminar se quitan y queda el texto real.
//   · Sin animación (texto final directo) con prefers-reduced-motion, pestaña oculta, elemento no visible o
//     elemento con hijos.
// ════════════════════════════════════════════════════════════════════════
(() => {
  const FULL_MS = 1100, DELTA_MS = 280, TICK_MS = 55;
  const LEAD_MS = 200;   // el descifrado completo empieza a fijar dígitos recién ~200 ms después del primer cuadro: la sección (tab-fade-in, --dur-base 220 ms) todavía está apareciendo
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const esDigito = (c) => c >= '0' && c <= '9';
  const rnd = () => String((Math.random() * 10) | 0);

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
    cancelAnimationFrame(st.raf); clearTimeout(st.timer);
    if (st.aria) { el.removeAttribute('role'); el.removeAttribute('aria-label'); }
    el._dx = null;
  }
  function directo(el, final) {
    cerrar(el);
    if (el.textContent !== final) el.textContent = final;
    el._dxFinal = final;
  }

  function cmDescifrar(el, texto, opts) {
    if (!el) return;
    opts = opts || {};
    let final = String(texto == null ? '' : texto);
    // Quien relee el DOM a mitad de animación (motion.js al volver a entrar, etc.) pasa los dígitos al azar que hay en pantalla:
    // si coincide con lo que estamos pintando, el valor real es el que ya guardamos, no ese texto.
    if (el._dx && final === el.textContent) final = el._dx.final;
    const previo = opts.from != null ? String(opts.from) : (el._dx ? el._dx.final : (el._dxFinal != null ? el._dxFinal : el.textContent));
    const corriendo = el._dx && el._dx.final === final && !opts.full;
    if (corriendo) return;                                     // mismo valor ya descifrándose: no reiniciar
    if (!/[0-9]/.test(final) || (mq && mq.matches) || document.hidden || !el.isConnected || !el.getClientRects().length || el.children.length) {
      return directo(el, final);
    }
    if (!opts.full && !el._dx && previo === final) return directo(el, final);   // sin cambios
    if (opts.full && !opts.visto && _io && !enPantalla(el)) {   // fuera de pantalla: valor real ya escrito, se descifra al asomar
      directo(el, final); _pend.add(el); _io.observe(el); return;
    }

    const completo = !!opts.full || !el._dxInit;
    if (!completo && document.documentElement.classList.contains('mo-in')) return directo(el, final);   // render masivo de entrada a sección (CMMotion.quiet): sin animar
    const n = final.length, off = previo.length - n;           // alineado a la derecha
    const rot = [];                                            // índices de los dígitos que rotan
    for (let i = 0; i < n; i++) {
      if (!esDigito(final[i])) continue;
      if (completo || previo[i + off] !== final[i]) rot.push(i);
    }
    if (!rot.length) return directo(el, final);

    cerrar(el);
    el._dxInit = true;
    const dur = completo ? FULL_MS : DELTA_MS;
    const st = el._dx = { final, aria: false, raf: 0, timer: 0, last: '' };
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('role')) {
      el.setAttribute('role', 'img'); el.setAttribute('aria-label', final); st.aria = true;
    }
    let t0 = 0;                                                // arranca en el primer cuadro PINTADO: un render pesado antes no se come la animación
    let tickAt = -Infinity, fijos = -1, chars = final.split('');
    const terminar = () => { directo(el, final); };
    const pintar = (now) => {
      const k = Math.min(1, Math.max(0, (now - t0) / dur));
      const f = Math.floor(k * rot.length + 1e-9);             // cuántos dígitos ya quedaron fijos (de izquierda a derecha)
      if (f !== fijos || now - tickAt >= TICK_MS) {
        fijos = f; tickAt = now;
        for (let j = 0; j < rot.length; j++) chars[rot[j]] = j < f ? final[rot[j]] : rnd();
        st.last = chars.join(''); el.textContent = st.last;
      }
    };
    const frame = (now) => {
      if (el._dx !== st) return;
      if (!t0) t0 = now + (completo ? LEAD_MS : 0);
      if (el.textContent !== st.last) { el._dxFinal = el.textContent; cerrar(el); return; }   // otro escribió: no lo pisamos
      if (now - t0 >= dur || document.hidden) return terminar();
      pintar(now);
      st.raf = requestAnimationFrame(frame);
    };
    // El texto real queda escrito al instante (quien lo lea en la misma tarea, p. ej. _fitNwTotal, ve el valor final);
    // el primer cuadro rotado se pinta en el próximo rAF, antes del siguiente paint → el valor final nunca se llega a ver suelto.
    if (el.textContent !== final) el.textContent = final;
    st.last = final;
    st.raf = requestAnimationFrame(frame);
    st.timer = setTimeout(() => { if (el._dx === st) terminar(); }, dur + 1500);   // red de seguridad (rAF frenado)
  }

  cmDescifrar.cancelar = cerrar;
  window.cmDescifrar = cmDescifrar;
})();
