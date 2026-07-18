/* ── JARVIS BRIDGE — puente de voz hacia Claude Code vía cola en Firestore ──
   Un poller local (fuera de esta app) lee appdata/ctask_<epochMs>, corre `claude`
   en modo read-only y escribe status:'done'|'error' + result. Este módulo:
   1) encola una tarea (JARVIS_BRIDGE.enqueue) cuando JARVIS detecta un pedido a Claude
   2) escucha esa colección y anuncia por voz + guarda el reporte completo como captura
   cuando una tarea ENCOLADA EN ESTA SESIÓN termina. No toca el doc lifedash_v2 ni su
   sync (_DOC/_fbSave/onSnapshot en app.js) — query separada sobre type=='claude_task'. */
(function () {
  const _misTareas = new Set();   // ids de tareas encoladas en ESTA sesión (pestaña abierta)
  const _anunciadas = new Set();  // ids ya anunciadas (evita doble speak/capture)

  function enqueue(promptText, device) {
    try {
      const db = (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;
      if (!db) { if (typeof showToast === 'function') showToast('⚠️ Sin conexión a Firestore para encolar la tarea'); return null; }
      const id = 'ctask_' + Date.now();
      const doc = {
        type: 'claude_task',
        prompt: promptText,
        status: 'pending',
        result: null,
        createdAt: Date.now(),
        finishedAt: null,
        device: device || null
      };
      db.collection('appdata').doc(id).set(doc)
        .catch(e => { console.warn('[JARVIS_BRIDGE] enqueue set error:', e); if (typeof showToast === 'function') showToast('⚠️ No pude encolar la tarea para Claude'); });
      _misTareas.add(id);
      return id;
    } catch (e) {
      console.warn('[JARVIS_BRIDGE] enqueue error:', e);
      if (typeof showToast === 'function') showToast('⚠️ No pude encolar la tarea para Claude');
      return null;
    }
  }

  // Corta el resultado a ~220 chars respetando límite de oración (para no gastar cuota de voz)
  function _shortSummary(result, max) {
    max = max || 220;
    const s = ('' + (result || '')).trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, max);
    const lastDot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'), cut.lastIndexOf('.'));
    if (lastDot > 40) return cut.slice(0, lastDot + 1);
    return cut.trim() + '…';
  }

  function _onTaskUpdate(id, data) {
    if (!_misTareas.has(id)) return;      // no lo encolé en esta sesión → ignorar (anti-ruido)
    if (_anunciadas.has(id)) return;      // ya anunciada
    if (data.status === 'done') {
      _anunciadas.add(id);
      const result = ('' + (data.result || '')).trim();
      try {
        if (window.JARVIS_BRAIN && typeof JARVIS_BRAIN.execute === 'function') {
          JARVIS_BRAIN.execute('capture', { text: 'Reporte de Claude:\n' + result });
        }
      } catch (e) { console.warn('[JARVIS_BRIDGE] capture error:', e); }
      if (window.JARVIS && typeof JARVIS.speak === 'function') {
        JARVIS.speak('Claude finished, sir. I saved the full report to your notes. In short: ' + _shortSummary(result), { dynamic: true });
      }
    } else if (data.status === 'error') {
      _anunciadas.add(id);
      const result = ('' + (data.result || '')).trim();
      try {
        if (window.JARVIS_BRAIN && typeof JARVIS_BRAIN.execute === 'function') {
          JARVIS_BRAIN.execute('capture', { text: 'Reporte de Claude (error):\n' + result });
        }
      } catch (e) { console.warn('[JARVIS_BRIDGE] capture error:', e); }
      if (window.JARVIS && typeof JARVIS.speak === 'function') {
        JARVIS.speak("Claude ran into a problem, sir. I saved the details to your notes.", { dynamic: true });
      }
    }
  }

  let _listenerArmed = false;
  function _armListener() {
    if (_listenerArmed) return;
    if (typeof firebase === 'undefined' || !firebase.firestore) return;   // firebase aún no cargó
    try {
      const db = firebase.firestore();
      db.collection('appdata').where('type', '==', 'claude_task').onSnapshot(snap => {
        snap.docChanges().forEach(ch => {
          const data = ch.doc.data();
          _onTaskUpdate(ch.doc.id, data);
        });
      }, e => console.warn('[JARVIS_BRIDGE] onSnapshot error:', e));
      _listenerArmed = true;
    } catch (e) { console.warn('[JARVIS_BRIDGE] armListener error:', e); }
  }

  _armListener();
  if (!_listenerArmed) {
    // firebase todavía no estaba listo al cargar este script → reintentar unas veces
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      _armListener();
      if (_listenerArmed || tries > 20) clearInterval(iv);
    }, 500);
  }

  window.JARVIS_BRIDGE = { enqueue };
})();
