/* ── JARVIS VOICE ENGINE ── */
(function () {
  const EL_VOICE  = 'JBFqnCBsd6RMkjVDRZzb'; // George — British, authoritative, deep
  // La key de ElevenLabs vive SOLO en localStorage por dispositivo (se carga desde el panel de temas).
  // Nunca se hardcodea: el repo es público. Sin key, JARVIS usa la voz del navegador.
  function _elKey() { return localStorage.getItem('jarvis_el_key') || ''; }
  // Aviso único (no molesta más de una vez) sugiriendo cargar una key para la voz premium
  function _elHint() {
    if (localStorage.getItem('jarvis_el_hint')) return;
    localStorage.setItem('jarvis_el_hint', '1');
    if (typeof showToast === 'function') showToast('🔊 JARVIS habla con la voz del navegador. Para su voz premium, cargá una API key de ElevenLabs en el panel de temas.', 8000);
  }
  let enabled     = localStorage.getItem('jarvis_enabled') === '1';
  let currentAudio = null;

  async function speakElevenLabs(text) {
    // Cache de audio: cada frase única se genera una sola vez en la vida (ahorra cuota de ElevenLabs)
    const cacheUrl = 'https://jarvis-tts.cache/' + EL_VOICE + '/' + encodeURIComponent(text);
    let blob = null;
    try {
      const c = await caches.open('jarvis-tts-v1');
      const hit = await c.match(cacheUrl);
      if (hit) blob = await hit.blob();
    } catch(e) {}
    if (!blob) {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}`, {
        method: 'POST',
        headers: {
          'xi-api-key': _elKey(),
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.38, similarity_boost: 0.85, style: 0.12, use_speaker_boost: true }
        })
      });
      if (!res.ok) throw new Error(`EL ${res.status}`);
      blob = await res.blob();
      try {
        const c = await caches.open('jarvis-tts-v1');
        await c.put(cacheUrl, new Response(blob, { headers: { 'Content-Type': 'audio/mpeg' } }));
      } catch(e) {}
    }
    const url  = URL.createObjectURL(blob);
    if (currentAudio) { try { currentAudio.pause(); URL.revokeObjectURL(currentAudio.src); } catch(e){} }
    const audio = currentAudio = new Audio(url);
    // Esperar a que termine de sonar: así isSpeaking() es correcto durante toda la reproducción
    // y se libera el ObjectURL (evita memory leak por cada frase).
    await new Promise((resolve, reject) => {
      let settled = false;
      // Al terminar (o ante cualquier corte) soltar la referencia: isSpeaking() jamás debe quedar
      // trabado en true por un <audio> huérfano — eso dejaría el micrófono apagado por el anti-eco.
      const done = () => { if (settled) return; settled = true; _lastSpeakEnd = Date.now(); clearTimeout(to); if (currentAudio === audio) currentAudio = null; try { URL.revokeObjectURL(url); } catch(e){} resolve(); };
      const to = setTimeout(done, 60000);   // hard cap: jamás colgar isSpeaking() para siempre
      audio.onended = done;
      audio.onpause = done;   // interrumpido por una nueva frase o por stopSpeaking()
      audio.onerror = done;
      audio.play().catch(err => { if (settled) return; settled = true; clearTimeout(to); if (currentAudio === audio) currentAudio = null; try { URL.revokeObjectURL(url); } catch(e){} reject(err); });
    });
  }

  // Cuota de ElevenLabs: se consulta una vez por hora. Las respuestas dinámicas usan la voz
  // de JARVIS mientras queden créditos, reservando 1500 para las frases fijas nuevas.
  let _elQuota = { checked: 0, ok: true };
  // Nivel de aviso ya mostrado para no repetir: 0 ninguno · 1 "se está por agotar" · 2 "agotada"
  let _elWarnLevel = 0;
  const EL_WARN_LOW = 2500;  // umbral de aviso anticipado (caracteres restantes)
  function _elMaybeWarn(remaining) {
    if (typeof showToast !== 'function') return;
    if (remaining <= 0) {
      if (_elWarnLevel < 2) {
        _elWarnLevel = 2;
        showToast('🔇 Se agotó la cuota de voz premium de ElevenLabs. JARVIS usa la voz del navegador hasta que se renueven los créditos.', 10000);
      }
    } else if (remaining <= EL_WARN_LOW) {
      if (_elWarnLevel < 1) {
        _elWarnLevel = 1;
        showToast(`⚠️ A la voz premium de JARVIS (ElevenLabs) le quedan ~${remaining.toLocaleString('es')} caracteres. Se está por agotar.`, 10000);
      }
    } else {
      _elWarnLevel = 0;  // se renovó la cuota → rearmar avisos
    }
  }
  async function _elQuotaOk() {
    const now = Date.now();
    if (now - _elQuota.checked < 3600000) return _elQuota.ok;
    _elQuota.checked = now;
    try {
      const ctrl = new AbortController();
      const tout = setTimeout(() => ctrl.abort(), 2000);
      let res;
      try { res = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': _elKey() }, signal: ctrl.signal }); }
      finally { clearTimeout(tout); }
      if (res.ok) {
        const d = await res.json();
        const remaining = d.character_limit - d.character_count;
        _elQuota.ok = remaining > 1500;
        _elMaybeWarn(remaining);
      }
    } catch(e) {}
    return _elQuota.ok;
  }
  // Chequeo proactivo de cuota (avisa aunque no se dispare una respuesta dinámica)
  async function _elQuotaCheckProactive() {
    if (!_elKey()) return;
    _elQuota.checked = 0;   // fuerza el refresco saltando el cache horario
    try { await _elQuotaOk(); } catch(e) {}
  }

  // Política de voz: JARVIS habla SOLO con la voz de ElevenLabs (en vivo o cacheada). Si no hay
  // ElevenLabs disponible (sin key, cuota agotada, o error), queda EN SILENCIO — nunca cae a la
  // voz genérica del navegador. Las frases ya cacheadas siguen sonando aunque la cuota esté en 0.
  async function speak(text, opts) {
    if (!enabled || !text) return;
    _speakAt = Date.now();
    if (!_elKey()) { _elHint(); return; }   // sin key → silencio (aviso único para cargar una)
    if (opts && opts.dynamic && !(await _elQuotaOk())) return;   // dinámica sin cuota → silencio
    try {
      await speakElevenLabs(text);
    } catch (e) {
      // Sin cuota / error de ElevenLabs → silencio (frases cacheadas igual sonaron desde la caché).
      console.warn('JARVIS sin voz premium (ElevenLabs):', e.message);
    }
  }

  let _speakAt = 0, _lastSpeakEnd = 0;
  function isSpeaking() {
    // Tope de 25s también para el <audio> de ElevenLabs: si el elemento queda en estado
    // "no pausado / no terminado" (autoplay bloqueado sin gesto, o el cap de 60s), no debe
    // mantener isSpeaking() en true para siempre — eso deja el micrófono apagado (anti-eco).
    if (currentAudio && !currentAudio.paused && !currentAudio.ended && Date.now() - _speakAt < 25000) return true;
    // speechSynthesis.speaking puede quedar trabado en true para siempre (bug de Chrome):
    // solo confiar en él durante los 25s posteriores al último speak(), si no deja sordo a JARVIS
    return !!(window.speechSynthesis && speechSynthesis.speaking && Date.now() - _speakAt < 25000);
  }
  // ¿JARVIS habló en los últimos `ms`? — usado por EARS para descartar el eco de su propia voz,
  // que el reconocedor finaliza un instante DESPUÉS de que isSpeaking() ya volvió a false.
  function recentlySpoke(ms) { return Date.now() - _lastSpeakEnd < (ms || 0); }

  function stopSpeaking() {
    try { speechSynthesis.cancel(); } catch(e) {}
    if (currentAudio) { try { currentAudio.pause(); } catch(e) {} }
    _lastSpeakEnd = Date.now();
  }

  function greeting() {
    const h = new Date().getHours();
    const lines = h >= 6 && h < 12
      ? ["Good morning, sir. All systems are online.",
         "Good morning, sir. Ready when you are.",
         "Good morning, sir. Your agenda is clear.",
         "Rise and shine, sir. What are we building today?",
         "Good morning, sir. The world awaits your instructions.",
         "Morning, sir. I trust you slept adequately.",
         "Good morning, sir. Shall we make today count?"]
      : h >= 12 && h < 19
      ? ["Good afternoon, sir. Welcome back.",
         "Good afternoon, sir. Shall we get to work?",
         "Good afternoon, sir. The command center is yours.",
         "Good afternoon, sir. Everything is running smoothly.",
         "Good afternoon, sir. I've kept everything in order.",
         "Welcome back, sir. Right where we left off."]
      : h >= 19 && h < 23
      ? ["Good evening, sir. What shall we accomplish tonight?",
         "Good evening, sir. Shall we review today's progress?",
         "Good evening, sir. The command center is yours.",
         "Good evening, sir. All systems standing by.",
         "Evening, sir. Let's finish strong.",
         "Good evening, sir. I took the liberty of keeping everything tidy."]
      : ["Working late again, sir. I'll keep the lights on.",
         "Good evening, sir. Still at it, I see.",
         "Late night again, sir. Coffee's metaphorically ready.",
         "Burning the midnight oil, sir. Admirable, if slightly concerning.",
         "Sir, even genius requires sleep. Eventually."];
    speak(lines[Math.floor(Math.random() * lines.length)]);
  }

  const PROJ_LINES = [
    "Project initiated. I'll monitor it closely, sir.",
    "New objective logged and ready for execution, sir.",
    "Added to your command center. I'll keep track of every detail.",
    "Understood. Mission parameters set, sir.",
    "Another target acquired, sir. Let's get to work.",
    "Logged. I'll make sure nothing falls through the cracks, sir.",
    "Consider it tracked, sir.",
    "A new venture. I do enjoy ambition, sir.",
    "Filed and flagged, sir. We'll see it through.",
    "Excellent choice, sir. Adding it to the board.",
  ];
  let _pi = 0;
  function onNewProject() { speak(PROJ_LINES[_pi++ % PROJ_LINES.length]); }

  const DONE_LINES = [
    "Well done, sir. One less obstacle.",
    "Mission accomplished. Moving on, sir.",
    "Objective cleared. What's next, sir?",
    "Marked complete. You're making progress, sir.",
    "Another one down, sir. Most efficient.",
    "Done and dusted, sir.",
    "Splendid work, sir. The list grows shorter.",
    "Task neutralized, sir. On to the next.",
  ];
  let _di = 0;
  function onTaskDone() { speak(DONE_LINES[_di++ % DONE_LINES.length]); }

  const P1_LINES = [
    "High priority flagged, sir. I'll keep a close eye on that one.",
    "Understood. This one goes to the top of the list.",
    "Top priority confirmed, sir. Consider it under surveillance.",
    "Marked urgent, sir. I shall be persistent about it.",
    "Priority one, sir. Nothing slips past me.",
  ];
  let _p1i = 0;
  function onPrioritySet() { speak(P1_LINES[_p1i++ % P1_LINES.length]); }

  const DEL_LINES = [
    "Project removed, sir. Clean slate.",
    "Understood. It's gone.",
    "Erased from the record, sir.",
    "Off the books, sir. As if it never existed.",
  ];
  let _deli = 0;
  function onDeleteProject() { speak(DEL_LINES[_deli++ % DEL_LINES.length]); }

  const THEME_LINES = [
    "Display preferences updated, sir.",
    "Switching visual mode, sir.",
    "A fresh coat of paint, sir. Very tasteful.",
    "Interface reconfigured, sir.",
  ];
  let _ti = 0;
  function onThemeChange() { speak(THEME_LINES[_ti++ % THEME_LINES.length]); }

  function checkOverdue() {
    if (sessionStorage.getItem('jarvis_overdue_checked')) return;
    sessionStorage.setItem('jarvis_overdue_checked', '1');
    try {
      const tabs = ['vida','finanzas','salud','conocimiento','ia'];
      const today = new Date(); today.setHours(0,0,0,0);
      let count = 0;
      function walk(nodes) {
        (nodes || []).forEach(n => {
          if (n.dueDate && !n.done) {
            if (new Date(n.dueDate + 'T00:00:00') < today) count++;
          }
          walk(n.children);
        });
      }
      tabs.forEach(t => {
        try { walk(JSON.parse(localStorage.getItem('proyectos_' + t + '_v1') || '[]')); } catch(e){}
      });
      if (count === 0) return;
      const lines = count === 1
        ? ["Sir, one deadline has passed. Your attention may be required.",
           "You have an overdue item, sir. Might want to take a look."]
        : [`Sir, you have ${count} overdue items. Might want to take a look.`,
           `${count} deadlines have passed, sir. Shall we review them?`];
      setTimeout(() => speak(lines[Math.floor(Math.random() * lines.length)]), 3500);
    } catch(e) {}
  }

  function toggle() {
    enabled = !enabled;
    localStorage.setItem('jarvis_enabled', enabled ? '1' : '0');
    _updateBtn();
    if (enabled) { speak('Voice systems online, sir.'); _elQuotaCheckProactive(); }
  }

  function _updateBtn() {
    const b = document.getElementById('jarvis-toggle-btn');
    if (!b) return;
    b.textContent = enabled ? '🔊 JARVIS activo' : '🔇 JARVIS silenciado';
    b.style.color = enabled ? 'rgba(0,255,136,0.75)' : 'rgba(255,255,255,0.28)';
    b.style.borderColor = enabled ? 'rgba(0,255,136,0.25)' : 'rgba(255,255,255,0.08)';
  }
  setTimeout(_updateBtn, 400);

  window.JARVIS = { speak, greeting, onNewProject, onTaskDone, onPrioritySet, onDeleteProject, onThemeChange, checkOverdue, toggle, isSpeaking, recentlySpoke, stopSpeaking, checkVoiceQuota: _elQuotaCheckProactive };
})();
