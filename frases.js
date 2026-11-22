'use strict';
// ════════════════════════════════════════════════════════════════════════
// FRASES — sistema único de frases del Centro. Una franja arriba de cada pestaña principal (jarvis, vida, finanzas,
// conocimiento, salud, ia) y la cabecera del overlay de Cartera muestran SIEMPRE la misma frase: rota cada 5 minutos
// (turno = floor(Date.now() / 5 min), así coinciden todas las pestañas y dispositivos). Tocar la frase pasa a la siguiente
// (avance local; el turno siguiente lo borra).
// Pool = frases de libros (S.libros.items[].frases; texto + «Autor, Título»; fav = ★) + un respaldo chico fijo (RESPALDO).
// Prioridad: de cada 4 frases mostradas, 3 son favoritas y la 4ª no favorita. Sin favoritas o sin no-favoritas → todas
// iguales. Se recorre el pool entero (barajado determinístico) antes de repetir y nunca sale la misma dos veces seguidas.
// `elegir(pool, turno)` es pura (sin DOM ni S): la usa el test Node además del navegador. Archivo cargable por <script> y require().
// ════════════════════════════════════════════════════════════════════════
(function (root) {
  const TURNO_MS = 300000; // 5 min
  const PANELES = ['jarvis', 'vida', 'finanzas', 'conocimiento', 'salud', 'ia'];

  // Respaldo (no favoritas) para cuando no hay frases de libros o para la 4ª de cada ciclo. Para sumar una: { t, a? }.
  const RESPALDO = [
    { t: 'Planificá tu tiempo y tu concentración.' },
    { t: 'Actuar sin planear es la causa de cada fracaso.' },
    { t: 'Lista de 3: trabajá con máximo 3 tareas importantes al día; lo demás es secundario.' },
    { t: "If you're not willing to react with equanimity to a market price decline of 50%, you're not fit to be a common shareholder.", a: 'Charlie Munger' },
    { t: 'I did not succeed in life by intelligence. I succeeded because I have a long attention span.', a: 'Charlie Munger' },
    { t: "We don't have to be smarter than the rest. We have to be more disciplined than the rest.", a: 'Warren Buffett' },
  ].map((x, i) => ({ id: 'r' + i, t: x.t, a: x.a || '', fav: false }));

  function _hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // Orden barajado del ciclo k (determinístico, sin depender de ciclos anteriores salvo su último plano). Con 2 elementos
  // el orden fijo ya alterna sin repetir; con ≥3, si el primero repite al último del ciclo anterior se intercambian los dos
  // primeros (el último no cambia, así que la comparación contra el barajado plano del ciclo previo es exacta).
  function _plano(lista, k) {
    return lista.slice().sort((x, y) => (_hash(x.id + '|' + k) - _hash(y.id + '|' + k)) || (x.id < y.id ? -1 : 1));
  }
  function _orden(lista, k) {
    if (lista.length < 3) return lista.slice().sort((x, y) => (x.id < y.id ? -1 : 1));
    const ord = _plano(lista, k);
    if (k > 0 && ord[0].id === _plano(lista, k - 1)[lista.length - 1].id) { const x = ord[0]; ord[0] = ord[1]; ord[1] = x; }
    return ord;
  }
  function _nth(lista, n) { return _orden(lista, Math.floor(n / lista.length))[n % lista.length]; }

  // Frase del turno `turno` (entero ≥ 0) o null si el pool está vacío. Pool: [{ id, t, a?, fav? }].
  function elegir(pool, turno) {
    const p = (pool || []).filter(x => x && x.t && x.id != null);
    if (!p.length) return null;
    const t = Math.max(0, Math.floor(turno) || 0);
    const fav = p.filter(x => x.fav), no = p.filter(x => !x.fav);
    if (!fav.length || !no.length) return _nth(p, t);
    const blk = Math.floor(t / 4), slot = t % 4;
    return slot < 3 ? _nth(fav, blk * 3 + slot) : _nth(no, blk);
  }

  function pool() {
    const out = [];
    try {
      const it = (typeof S !== 'undefined' && S && S.libros && Array.isArray(S.libros.items)) ? S.libros.items : [];
      it.forEach(l => (l.frases || []).forEach(f => {
        if (f && f.texto) out.push({ id: 'l' + l.id + ':' + f.id, t: String(f.texto), a: [l.autor, l.titulo].filter(Boolean).join(', '), fav: !!f.fav });
      }));
    } catch (e) { /* sin libros: queda el respaldo */ }
    return out.concat(RESPALDO);
  }

  const api = { elegir, pool, TURNO_MS, RESPALDO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root || !root.document) return;

  // ── Navegador ────────────────────────────────────────────────────────────
  const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let _off = 0, _base = null, _cur = null, _html = '';
  const _subs = new Set();
  const turno = () => Math.floor(Date.now() / TURNO_MS);

  function actual() {
    const t = turno();
    if (_base !== t) { _base = t; _off = 0; }
    return elegir(pool(), t + _off);
  }
  function _strips() { return PANELES.map(n => document.querySelector('#tab-' + n + ' > .cm-frase')).filter(Boolean); }
  function _render() {
    if (typeof _appBooted !== 'undefined' && !_appBooted) return;
    const f = actual();
    const h = f ? f.id + '|' + f.t + '|' + f.a + '|' + (f.fav ? 1 : 0) : '';
    if (h === _html) return;
    _html = h; _cur = f;
    _strips().forEach(el => {
      el.hidden = !f;
      if (!f) return;
      el.title = '«' + f.t + '»' + (f.a ? ' — ' + f.a : '');
      el.querySelector('.cm-frase-star').hidden = !f.fav;
      el.querySelector('.cm-frase-t').textContent = f.t;
      el.querySelector('.cm-frase-a').textContent = f.a ? '— ' + f.a : '';
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    });
    _subs.forEach(fn => { try { fn(f); } catch (e) { /* un suscriptor roto no frena a los demás */ } });
  }
  function siguiente() { actual(); _off++; _render(); }
  function onCambio(fn) { _subs.add(fn); return () => _subs.delete(fn); }

  function _montar() {
    PANELES.forEach(n => {
      const p = document.getElementById('tab-' + n);
      if (!p || p.querySelector(':scope > .cm-frase')) return;
      const el = document.createElement('div');
      el.className = 'cm-frase'; el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-label', 'Siguiente frase'); el.hidden = true;
      el.innerHTML = '<span class="cm-frase-star" aria-label="Favorita" hidden>★</span><span class="cm-frase-body"><span class="cm-frase-t"></span> <span class="cm-frase-a"></span></span>';
      el.addEventListener('click', siguiente);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); siguiente(); } });
      p.insertBefore(el, p.firstChild);
    });
  }
  function refrescar() { _html = ''; _render(); }

  Object.assign(api, { actual, siguiente, onCambio, refrescar });
  root.CMFrases = api;

  function _arrancar() {
    _montar();
    _render();
    // Un solo reloj global: la comparación de turno es barata y el render solo toca el DOM si la frase cambió.
    setInterval(() => { if (!document.hidden) _render(); }, 2000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) _render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _arrancar); else _arrancar();
})(typeof window !== 'undefined' ? window : null);
