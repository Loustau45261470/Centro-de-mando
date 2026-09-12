/* ══════════════════════════════════════════════════════
   DIAGNÓSTICO (caja negra de errores) — captura errores de runtime
   (window.onerror, promesas rechazadas y console.error) para poder
   ver qué rompió la app en el celular sin acceso a la consola.
   Todo el módulo es defensivo: un fallo acá nunca puede tirar la app.
   ══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY = 'cm_errores_v1';
  var MAX = 30;
  var _reentrant = false; // guard: evita loop si registrar() dispara console.error

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  function leer() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function escribir(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX))); } catch (e) { /* localStorage lleno/bloqueado: no romper la app */ }
  }

  function primerasLineas(stack, n) {
    try {
      if (!stack) return '';
      return String(stack).split('\n').slice(0, n).join('\n');
    } catch (e) { return ''; }
  }

  // Registra un error, deduplicando por msg+linea (incrementa n y actualiza t en vez de duplicar).
  function registrar(tipo, msg, extra) {
    try {
      extra = extra || {};
      var entry = {
        t: Date.now(),
        tipo: tipo || 'error',
        msg: String(msg == null ? '' : msg).slice(0, 500),
        archivo: extra.archivo || '',
        linea: extra.linea || 0,
        col: extra.col || 0,
        stack: primerasLineas(extra.stack, 3),
        n: 1
      };
      var arr = leer();
      var dupIdx = -1;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].msg === entry.msg && arr[i].linea === entry.linea) { dupIdx = i; break; }
      }
      if (dupIdx !== -1) {
        arr[dupIdx].n = (arr[dupIdx].n || 1) + 1;
        arr[dupIdx].t = entry.t;
        // mover al frente para que "los últimos" siga reflejando actividad reciente
        var moved = arr.splice(dupIdx, 1)[0];
        arr.unshift(moved);
      } else {
        arr.unshift(entry);
      }
      escribir(arr);
      _tryRender();
    } catch (e) { /* jamás propagar: este es el peor lugar para tirar una excepción */ }
  }

  function limpiar() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    _tryRender();
  }

  function lista() { return leer(); }

  window.CMErrores = { lista: lista, limpiar: limpiar, registrar: registrar };

  // ── Captura, lo antes posible ──
  try {
    window.addEventListener('error', function (ev) {
      try {
        registrar('error', ev && ev.message, {
          archivo: (ev && ev.filename ? String(ev.filename).split('/').pop() : ''),
          linea: (ev && ev.lineno) || 0,
          col: (ev && ev.colno) || 0,
          stack: ev && ev.error && ev.error.stack
        });
      } catch (e) {}
    });
  } catch (e) {}

  try {
    window.addEventListener('unhandledrejection', function (ev) {
      try {
        var reason = ev && ev.reason;
        var msg = (reason && reason.message) ? reason.message : String(reason);
        registrar('promise', msg, { stack: reason && reason.stack });
      } catch (e) {}
    });
  } catch (e) {}

  try {
    var _origConsoleError = console.error;
    console.error = function () {
      try { _origConsoleError.apply(console, arguments); } catch (e) {}
      if (!_reentrant) {
        _reentrant = true;
        try {
          var msg = Array.prototype.slice.call(arguments).map(function (a) {
            try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (e) { return String(a); }
          }).join(' ');
          registrar('console', msg, {});
        } catch (e) {}
        _reentrant = false;
      }
    };
  } catch (e) {}

  // ── UI: tarjeta en la tab IA ──
  var LAST_SEEN_KEY = 'cm_errores_last_seen_v1';
  var _expanded = false;

  function getLastSeen() {
    try { return parseInt(localStorage.getItem(LAST_SEEN_KEY), 10) || 0; } catch (e) { return 0; }
  }
  function setLastSeen(t) {
    try { localStorage.setItem(LAST_SEEN_KEY, String(t)); } catch (e) {}
  }

  function fmtHora(t) {
    try { return new Date(t).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); }
    catch (e) { return ''; }
  }

  function ensureStyle() {
    if (document.getElementById('cm-errores-style')) return;
    try {
      var style = document.createElement('style');
      style.id = 'cm-errores-style';
      style.textContent =
        '#errores-card .err-empty{color:var(--tt);font-size:var(--fs-13);padding:10px 2px;text-align:center}' +
        '#errores-card .err-total{color:var(--ts);font-size:var(--fs-12-5);margin:0 0 10px}' +
        '#errores-card .err-list{display:flex;flex-direction:column;gap:8px}' +
        '#errores-card .err-item{border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:var(--card)}' +
        '#errores-card .err-item .err-row1{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:var(--fs-12-5);color:var(--tt)}' +
        '#errores-card .err-item .err-msg{font-size:var(--fs-13);color:var(--tp);word-break:break-word;margin:3px 0}' +
        '#errores-card .err-item .err-loc{font-family:var(--mono);font-size:var(--fs-12-5);color:var(--ts)}' +
        '#errores-card .err-item .err-count{color:var(--warn);font-weight:600}' +
        '#errores-card .err-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}' +
        '#errores-card .err-badge{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 5px;border-radius:9px;background:var(--danger);color:#fff;font-size:10px;font-weight:700;margin-left:6px;vertical-align:middle}' +
        '#errores-card .err-vertodos{background:none;border:none;color:var(--hud);font-size:var(--fs-12-5);cursor:pointer;padding:4px 0;text-decoration:underline;text-underline-offset:2px}' +
        '@media (prefers-reduced-motion: reduce){#errores-card *{transition:none!important;animation:none!important}}';
      document.head.appendChild(style);
    } catch (e) {}
  }

  function ensureCard() {
    try {
      if (document.getElementById('errores-card')) return document.getElementById('errores-card');
      var tab = document.getElementById('tab-ia');
      if (!tab) return null;
      var card = document.createElement('div');
      card.className = 'card';
      card.id = 'errores-card';
      card.innerHTML = '<div class="card-title"><span>🩺 Diagnóstico</span></div><div id="errores-card-body"></div>';
      tab.appendChild(card);
      return card;
    } catch (e) { return null; }
  }

  function render() {
    ensureStyle();
    var card = ensureCard();
    if (!card) return; // la tab IA todavía no está en el DOM: se reintenta en el próximo render
    var body = card.querySelector('#errores-card-body');
    var titleSpan = card.querySelector('.card-title span');
    if (!body) return;

    var arr = leer();
    var lastSeen = getLastSeen();
    var nuevos = arr.filter(function (e) { return e.t > lastSeen; }).length;

    if (titleSpan) {
      titleSpan.innerHTML = '🩺 Diagnóstico' + (nuevos > 0 ? '<span class="err-badge">' + Math.min(nuevos, 99) + '</span>' : '');
    }

    if (!arr.length) {
      var desdeTxt = '';
      try {
        var since = getLastSeen();
        desdeTxt = since ? ' desde ' + fmtHora(since) : '';
      } catch (e) {}
      body.innerHTML = '<div class="err-empty">Sin errores registrados' + esc(desdeTxt) + '</div>';
      setLastSeen(Date.now());
      return;
    }

    var totalOcurrencias = arr.reduce(function (acc, e) { return acc + (e.n || 1); }, 0);
    var visibles = _expanded ? arr : arr.slice(0, 3);

    var html = '<div class="err-total">' + totalOcurrencias + ' error' + (totalOcurrencias === 1 ? '' : 'es') + ' registrado' + (totalOcurrencias === 1 ? '' : 's') + '</div>';
    html += '<div class="err-list">';
    visibles.forEach(function (e) {
      var loc = [e.archivo, e.linea].filter(Boolean).join(':');
      html += '<div class="err-item">' +
        '<div class="err-row1"><span>' + esc(fmtHora(e.t)) + '</span>' + (e.n > 1 ? '<span class="err-count">×' + e.n + '</span>' : '') + '</div>' +
        '<div class="err-msg">' + esc(e.msg) + '</div>' +
        (loc ? '<div class="err-loc">' + esc(loc) + '</div>' : '') +
        '</div>';
    });
    html += '</div>';
    if (!_expanded && arr.length > 3) {
      html += '<button type="button" class="err-vertodos" id="errores-ver-todos">ver todos (' + arr.length + ')</button>';
    }
    html += '<div class="err-actions">' +
      '<button type="button" class="btn btn-ghost btn-sm" id="errores-limpiar-btn">Limpiar</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="errores-copiar-btn">Copiar</button>' +
      '</div>';
    body.innerHTML = html;

    setLastSeen(Date.now());

    try {
      var btnVer = body.querySelector('#errores-ver-todos');
      if (btnVer) btnVer.addEventListener('click', function () { _expanded = true; render(); });
      var btnLimpiar = body.querySelector('#errores-limpiar-btn');
      if (btnLimpiar) btnLimpiar.addEventListener('click', function () { limpiar(); _expanded = false; });
      var btnCopiar = body.querySelector('#errores-copiar-btn');
      if (btnCopiar) btnCopiar.addEventListener('click', function () {
        try {
          var json = JSON.stringify(leer(), null, 2);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(json).then(function () {
              try { if (typeof showToast === 'function') showToast('Copiado'); } catch (e) {}
            }).catch(function () {});
          }
        } catch (e) { /* fallback silencioso: sin clipboard, no se rompe nada */ }
      });
    } catch (e) {}
  }

  function _tryRender() {
    try { render(); } catch (e) { /* nunca propagar */ }
  }

  window.renderErroresCard = _tryRender;

  // Primer intento de montaje; si la tab IA aún no existe en el DOM, DOMContentLoaded reintenta.
  _tryRender();
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _tryRender);
    }
  } catch (e) {}
})();
