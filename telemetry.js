/* ══════════════════════════════════════════════════════
   TELEMETRÍA EN VIVO — reloj/fecha terminal, estado de sync Firebase y
   "carga del sistema" (avance del día), superpuestos en el ticker.
   ══════════════════════════════════════════════════════ */
(function () {
  const ticker = document.getElementById('ticker');
  if (!ticker) return;
  const style = document.createElement('style');
  style.textContent = `
    #ticker-left,#ticker-right{position:absolute;top:0;height:var(--ticker);display:flex;align-items:center;gap:7px;
      z-index:3;padding:0 12px;font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.06em;color:var(--ts);pointer-events:none}
    #ticker-left{left:0;background:linear-gradient(90deg, rgba(5,9,15,0.96) 72%, rgba(5,9,15,0))}
    #ticker-right{right:0;flex-direction:row-reverse;background:linear-gradient(270deg, rgba(5,9,15,0.96) 72%, rgba(5,9,15,0))}
    #ticker-left .tk-dim,#ticker-right .tk-dim{color:var(--tt)}
    .tk-dot{width:6px;height:6px;border-radius:50%;background:var(--hud);box-shadow:0 0 8px var(--hud);animation:tkpulse 2s ease-in-out infinite;flex-shrink:0}
    @keyframes tkpulse{0%,100%{opacity:1}50%{opacity:.35}}
    #tk-time{color:var(--hud-bright);text-shadow:0 0 8px var(--hud-dim)}
    .tk-ok{color:var(--hud)} .tk-save{color:var(--warn)} .tk-off{color:var(--danger)}`;
  document.head.appendChild(style);

  const left = document.createElement('div'); left.id = 'ticker-left';
  left.innerHTML = '<span class="tk-dot"></span><span id="tk-time">--:--:--</span>';
  const right = document.createElement('div'); right.id = 'ticker-right';
  right.innerHTML = '<span id="tk-sync" class="tk-ok">● SYNC</span><span id="tk-size" class="tk-dim">--</span>';
  ticker.appendChild(left); ticker.appendChild(right);

  const p2 = n => String(n).padStart(2, '0');
  const elTime = left.querySelector('#tk-time');
  const elSync = right.querySelector('#tk-sync');
  const elSize = right.querySelector('#tk-size');

  // Medidor de tamaño del doc Firestore (S se serializa a UN doc; límite duro 1 MiB).
  const DOC_LIMIT = 1048576;          // 1 MiB
  const DOC_WARN  = DOC_LIMIT * 0.7;  // 70% → color de alerta
  let _sizeCache = null, _sizeLastCalc = 0;
  function fmtBytes(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(2) + 'M';
    if (n >= 1024) return Math.round(n / 1024) + 'K';
    return n + 'B';
  }
  function docSize() {
    // stringify de ~400KB por segundo sería caro: se cachea y recalcula cada ~30s.
    const now = Date.now();
    if (_sizeCache !== null && now - _sizeLastCalc < 30000) return _sizeCache;
    let bytes = 0;
    try { bytes = (typeof S !== 'undefined' && S) ? JSON.stringify(S).length : 0; } catch (e) {}
    _sizeCache = bytes; _sizeLastCalc = now;
    return bytes;
  }

  function syncInfo() {
    if (!navigator.onLine) return { t: '⚠ OFFLINE', c: 'tk-off' };
    let pending = false; try { pending = !!_fbSaveTid; } catch (e) {}
    return pending ? { t: '◌ SYNC…', c: 'tk-save' } : { t: '● SYNC', c: 'tk-ok' };
  }
  function tick() {
    const d = new Date();
    elTime.textContent = p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
    const s = syncInfo();
    elSync.textContent = s.t; elSync.className = s.c;
    const b = docSize();
    elSize.textContent = fmtBytes(b);
    elSize.className = b >= DOC_WARN ? 'tk-save' : 'tk-dim';  // tk-save=var(--warn); tk-dim=var(--tt)
  }
  tick();
  setInterval(tick, 1000);
})();

/* ══════════════════════════════════════════════════════
   TELEMETRÍA DE USO POR PESTAÑA — cuenta aperturas de cada tab en
   localStorage (solo este dispositivo, no sincroniza con Firestore)
   para decidir con datos qué módulos se usan y cuáles no.
   ══════════════════════════════════════════════════════ */
(function () {
  const KEY = 'cdm_usage';

  function leer() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function registrar(tab) {
    if (!tab) return;
    const datos = leer();
    const prev = datos[tab] || { count: 0, lastUsed: null };
    datos[tab] = { count: prev.count + 1, lastUsed: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(datos));
  }
  function tabInicial() {
    const activo = document.querySelector('.tab-panel.active');
    return activo ? activo.id.replace(/^tab-/, '') : null;
  }
  function hook() {
    if (typeof window.switchTab !== 'function' || window._usageTabHook) return false;
    window._usageTabHook = true;
    const orig = window.switchTab;
    window.switchTab = function (tab, btn) { orig(tab, btn); registrar(tab); };
    return true;
  }

  if (!hook()) document.addEventListener('DOMContentLoaded', hook);
  registrar(tabInicial()); // pestaña con la que arrancó la app, una vez por carga

  window.usoTabs = function () {
    const datos = leer();
    const filas = Object.keys(datos)
      .map(tab => ({ tab, count: datos[tab].count, lastUsed: datos[tab].lastUsed }))
      .sort((a, b) => b.count - a.count);
    console.table(filas);
    return filas;
  };
})();
