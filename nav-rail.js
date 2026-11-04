/* nav-rail.js — rail de navegación de escritorio ocultable (≥980px).
   Estado en <html>: .rail-off (oculto, se recuerda en localStorage 'cm_rail_off'), .rail-peek (asoma al acercar
   el mouse al borde izquierdo), .rail-hiding / .rail-showing (solo mientras dura la animación).
   Todo el CSS vive en styles.css ("RAIL OCULTABLE"). No toca switchTab ni la barra del celular. */
(function () {
  'use strict';
  var KEY = 'cm_rail_off';
  var root = document.documentElement;
  var nav = document.getElementById('nav');
  var edge = document.getElementById('rail-edge');
  var tgl = document.getElementById('rail-toggle');
  var edgeBtn = document.getElementById('rail-show');
  var app = document.getElementById('app');
  if (!nav || !edge || !tgl || !edgeBtn) return;

  var zone = edge.querySelector('.re-zone');
  var mqDesk = window.matchMedia('(min-width: 980px)');
  var mqRM = window.matchMedia('(prefers-reduced-motion: reduce)');
  var animTimer = null, peekTimer = null, closeTimer = null;

  function isOff() { return root.classList.contains('rail-off'); }
  function isPeek() { return root.classList.contains('rail-peek'); }
  function persist(off) { try { localStorage.setItem(KEY, off ? '1' : '0'); } catch (e) {} }
  function railW() { return parseFloat(getComputedStyle(root).getPropertyValue('--rail')) || 124; }

  // Color de acento = sección activa (el CSS lo resuelve con las variables --c-* vía data-rail-tab)
  function syncTab() {
    var b = nav.querySelector('.nav-btn.active');
    if (b && b.dataset.tab) root.setAttribute('data-rail-tab', b.dataset.tab);
  }

  function sync() {
    var off = isOff();
    var label = off ? 'Fijar barra lateral' : 'Ocultar barra lateral';
    tgl.setAttribute('aria-expanded', off ? 'false' : 'true');
    tgl.setAttribute('aria-label', label);
    tgl.title = label + ' (Ctrl+B)';
  }

  // El contenido se reacomoda una sola vez (left cambia al instante) y se desliza con transform: sin layout por frame.
  function slideApp(dx) {
    if (!app || !app.animate) return;
    try {
      app.animate([{ transform: 'translateX(' + dx + 'px)' }, { transform: 'translateX(0)' }],
        { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' });
    } catch (e) {}
  }
  // Charts / canvas que escuchan window.resize se enteran del nuevo ancho
  function kickResize() { requestAnimationFrame(function () { window.dispatchEvent(new Event('resize')); }); }

  function clearAnim() {
    clearTimeout(animTimer);
    root.classList.remove('rail-hiding', 'rail-showing');
  }
  function clearPeekTimers() { clearTimeout(peekTimer); clearTimeout(closeTimer); }

  function hide() {
    if (isOff() || !mqDesk.matches) return;
    var refocus = nav.contains(document.activeElement);
    clearAnim(); clearPeekTimers();
    root.classList.remove('rail-peek');
    root.classList.add('rail-off');
    persist(true); sync();
    var finish = function () {
      clearAnim();
      if (refocus) edgeBtn.focus({ preventScroll: true });
    };
    if (mqRM.matches) { finish(); } else {
      root.classList.add('rail-hiding');
      slideApp(railW());
      animTimer = setTimeout(finish, 360);
    }
    kickResize();
  }

  function show() {
    if (!isOff()) return;
    var peeking = isPeek();
    var refocus = document.activeElement === edgeBtn;
    var w = railW();
    clearAnim(); clearPeekTimers();
    root.classList.remove('rail-off', 'rail-peek');
    persist(false); sync();
    if (!mqRM.matches) {
      if (!peeking) {
        root.classList.add('rail-showing');
        animTimer = setTimeout(clearAnim, 380);
      }
      slideApp(-w);
    }
    if (refocus) tgl.focus({ preventScroll: true });
    kickResize();
  }

  function toggle() { if (isOff()) show(); else hide(); }

  // ── Vista rápida (peek): mouse al borde izquierdo ──
  function openPeek() {
    if (!isOff() || isPeek() || root.classList.contains('rail-hiding')) return;
    root.classList.add('rail-peek');
    // red de seguridad: si el puntero nunca llegó a entrar al rail, se vuelve a esconder
    clearTimeout(closeTimer);
    closeTimer = setTimeout(function () { if (!nav.matches(':hover')) closePeek(); }, 900);
  }
  function closePeek() {
    clearPeekTimers();
    root.classList.remove('rail-peek');
  }

  zone.addEventListener('pointerenter', function (e) {
    if (e.pointerType !== 'mouse' || !isOff() || isPeek()) return;
    clearTimeout(peekTimer);
    peekTimer = setTimeout(openPeek, 150);   // no se dispara con el mouse pasando de largo
  });
  zone.addEventListener('pointerleave', function () { clearTimeout(peekTimer); });
  nav.addEventListener('pointerenter', function () { clearTimeout(closeTimer); });
  nav.addEventListener('pointerleave', function (e) {
    if (!isPeek() || e.pointerType !== 'mouse') return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(closePeek, 220);
  });

  tgl.addEventListener('click', toggle);
  edgeBtn.addEventListener('click', show);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isPeek()) { closePeek(); return; }
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (e.key !== 'b' && e.key !== 'B')) return;
    if (e.defaultPrevented || !mqDesk.matches) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;   // Ctrl+B = negrita ahí
    e.preventDefault();
    toggle();
  });

  // Init: el <script> inline del <head> ya aplicó .rail-off (sin parpadeo); acá solo se asegura y se sincroniza
  try { if (localStorage.getItem(KEY) === '1') root.classList.add('rail-off'); } catch (e) {}
  syncTab(); sync();
  new MutationObserver(syncTab).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
})();
