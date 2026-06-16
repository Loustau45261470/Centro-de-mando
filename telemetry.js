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
  right.innerHTML = '<span id="tk-sync" class="tk-ok">● SYNC</span>';
  ticker.appendChild(left); ticker.appendChild(right);

  const p2 = n => String(n).padStart(2, '0');
  const elTime = left.querySelector('#tk-time');
  const elSync = right.querySelector('#tk-sync');

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
  }
  tick();
  setInterval(tick, 1000);
})();
