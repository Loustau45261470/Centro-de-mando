(function(){
  'use strict';
  function _date(){ try { return getActiveDate(); } catch(e){ return new Date().toISOString().slice(0,10); } }
  function _money(n){ try { return '$' + Math.round(n).toLocaleString('es-AR'); } catch(e){ return '$' + Math.round(n||0); } }
  function setStat(k, val, pct){
    const el = document.querySelector('#tab-jarvis .jstat[data-k="' + k + '"]');
    if (!el) return;
    const v = el.querySelector('[data-v]'); if (v) v.textContent = val;
    const fg = el.querySelector('.jr-fg');
    if (fg){ const C = 119.38, p = Math.max(0, Math.min(1, pct || 0)); fg.style.strokeDashoffset = (C * (1 - p)).toFixed(1); }
  }
  window.renderJarvisCore = function(){
    let St; try { St = S; } catch(e){ St = {}; }
    if (!St) St = {};
    const d = _date();
    const g = (St.goals && St.goals[d]) || [];
    const md = g.filter(x => x.done).length, mt = g.length;
    const streak = (St.streak && St.streak.count) || 0;
    let nw = 0; try { nw = calcNetWorth(); } catch(e){}
    let sleep = St.sleepLog && St.sleepLog[d] && St.sleepLog[d].hours;
    if (sleep == null){ const ks = Object.keys(St.sleepLog || {}).sort(); sleep = ks.length ? (St.sleepLog[ks[ks.length-1]].hours || 0) : 0; }
    let ld = 0, lt = 0;
    ((St.lawProgress && St.lawProgress.years) || []).forEach(y => (y.subjects || []).forEach(s => { lt++; if (s.done) ld++; }));
    const lawPct = lt ? Math.round(ld / lt * 100) : 0;
    const now = new Date(); const dayPct = Math.round(((now.getHours()*60 + now.getMinutes()) / 1440) * 100);
    setStat('streak', streak, Math.min(streak / 30, 1));
    setStat('metas', md + '/' + mt, mt ? md / mt : 0);
    setStat('dia', dayPct + '%', dayPct / 100);
    setStat('patrimonio', _money(nw), nw > 0 ? 1 : 0.04);
    setStat('sueno', (Math.round((sleep || 0) * 10) / 10) + 'h', Math.min((sleep || 0) / 9, 1));
    setStat('law', lawPct + '%', lawPct / 100);
  };
  // Montar la red neuronal JARVIS real (FX) confinada en la sección
  function isJarvisActive(){ const t = document.getElementById('tab-jarvis'); return !!(t && t.classList.contains('active')); }
  function dockJarvis(){
    const host = document.getElementById('jarvis-net');
    if (host && window.JARVIS_FX && JARVIS_FX.dock){
      if (!host.clientWidth) { setTimeout(dockJarvis, 150); return; }
      JARVIS_FX.dock(host);
    }
  }
  function undockJarvis(){ if (window.JARVIS_FX && JARVIS_FX.undock && JARVIS_FX.isDocked && JARVIS_FX.isDocked()) JARVIS_FX.undock(); }

  // Reflejar estado de escucha/voz en los botones + en el FX
  window.jSyncVoiceBar = function(){
    let wake = false, voice = false;
    try { wake = localStorage.getItem('jarvis_wake') === '1'; } catch(e){}
    try { voice = localStorage.getItem('jarvis_enabled') === '1'; } catch(e){}
    const wb = document.getElementById('jcore-wake');
    if (wb){ wb.classList.toggle('on', wake); wb.textContent = wake ? '🎙️ "Hey Jarvis" · activo' : '🎙️ "Hey Jarvis"'; }
    const vb = document.getElementById('jcore-voice');
    if (vb){ vb.classList.toggle('on', voice); vb.textContent = voice ? '🔊 Voz · activa' : '🔊 Voz'; }
    if (window.JARVIS_FX && JARVIS_FX.isDocked && JARVIS_FX.isDocked()) JARVIS_FX.setState(wake ? 'command' : 'passive');
  };

  function embedChat(){
    const panel = document.getElementById('agent-panel');
    const host = document.getElementById('jarvis-console');
    if (panel && host && panel.parentElement !== host){
      host.appendChild(panel);
      panel.classList.add('embedded');
      try { if (typeof agentToggle === 'function' && !panel.classList.contains('open')) agentToggle(); }
      catch(e){ console.warn('jarvis chat init', e); }
      setTimeout(() => { const inp = document.getElementById('agent-input'); if (inp) inp.blur(); const app = document.getElementById('app'); if (app) app.scrollTop = 0; }, 480);
    }
  }
  function boot(){
    embedChat();
    renderJarvisCore();
    jSyncVoiceBar();
    if (isJarvisActive()) dockJarvis();
    setInterval(renderJarvisCore, 10000);
    if (typeof window.switchTab === 'function' && !window._jSwitchPatched){
      const o = window.switchTab;
      window.switchTab = function(t, b){
        const wasJarvis = isJarvisActive();
        o(t, b);
        if (t === 'jarvis'){ renderJarvisCore(); jSyncVoiceBar(); dockJarvis(); }
        else if (wasJarvis){ undockJarvis(); }
      };
      window._jSwitchPatched = true;
    }
    if (typeof window._bootApp === 'function' && !window._jBootPatched){
      const ob = window._bootApp;
      window._bootApp = function(){ ob.apply(this, arguments); setTimeout(() => { renderJarvisCore(); jSyncVoiceBar(); if (isJarvisActive()) dockJarvis(); }, 800); };
      window._jBootPatched = true;
    }
  }
  if (document.readyState === 'complete') setTimeout(boot, 700);
  else window.addEventListener('load', () => setTimeout(boot, 700));
})();
