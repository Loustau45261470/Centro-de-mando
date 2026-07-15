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

  // Modo nocturno: >=23h o <7h (el usuario duerme 00:00-07:00) — voz más baja y respuestas
  // más cortas (esto último lo aplica ears.js en el prompt de Gemini). Guard: solo la hora local.
  function _isNightTime() {
    try { const h = new Date().getHours(); return h >= 23 || h < 7; } catch(e) { return false; }
  }
  const NIGHT_VOLUME = 0.55;

  // Storage persistente: pide al navegador NO desalojar Cache Storage bajo presión de
  // espacio (la 2ª causa de frases TTS perdidas, junto al SW que borraba jarvis-tts-*
  // en cada activate — ver fixes.json). Silencioso: Chrome decide solo, sin prompt.
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  async function speakElevenLabs(text) {
    // Modelo TTS: Flash v2.5 por defecto (más barato/rápido); override posible vía localStorage.
    const elModel = localStorage.getItem('jarvis_el_model') || 'eleven_flash_v2_5';
    // Cache de audio: cada frase única se genera una sola vez en la vida (ahorra cuota de ElevenLabs).
    // El modelo va en la clave: una frase cacheada con un modelo viejo no debe servirse tras cambiar de modelo.
    const cacheUrl = 'https://jarvis-tts.cache/' + EL_VOICE + '/' + elModel + '/' + encodeURIComponent(text);
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
          model_id: elModel,
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
    try { if (_isNightTime()) audio.volume = NIGHT_VOLUME; } catch(e) {}
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

  // Preprocesador TTS: los datos de la app vienen en formato es-AR ($1.234.567,89 · 45,5%) pero
  // JARVIS habla en inglés — sin esto, ElevenLabs/speechSynthesis leen los símbolos literalmente.
  // Puro: solo regex, sin dependencias. Se aplica a TODO texto antes de sintetizar.
  function _ttsPrep(text) {
    if (!text) return text;
    let out = text;
    // es-AR → número plano en inglés: punto = separador de miles, coma = decimal
    function esArToPlain(numStr) {
      if (numStr.indexOf(',') !== -1) {
        const parts = numStr.split(',');
        return parts[0].replace(/\./g, '') + '.' + parts[1];
      }
      return numStr.replace(/\./g, '');
    }
    // 1) Montos: "$1.234.567,89" → "1234567.89 pesos"
    out = out.replace(/\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)/g, (m, num) => esArToPlain(num) + ' pesos');
    // 2) Porcentajes: "45,5%" → "45.5 percent"
    out = out.replace(/(\d+(?:,\d+)?)\s?%/g, (m, num) => num.replace(',', '.') + ' percent');
    // 3) Números es-AR sueltos con separador de miles (sin $ ni %): "1.234.567" → "1234567"
    //    Exige al menos un grupo de EXACTAMENTE 3 dígitos tras el punto, para no tocar decimales
    //    normales (ej. "3.14") ni fechas ISO ("2026-07-14", que usa guiones, no puntos).
    out = out.replace(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b/g, (m) => esArToPlain(m));
    return out;
  }

  // Fallback de voz del navegador: se usa SOLO cuando ElevenLabs falla (sin key es aparte, ver
  // _elHint), para que una key vencida/rate-limit no deje a JARVIS mudo. Nunca reemplaza a
  // ElevenLabs como voz primaria (issues históricos de speechSynthesis trabado — ver fixes.json);
  // es puramente el "no te quedes sin hablar" ante un error puntual de la API.
  function _speakBrowser(text) {
    try {
      if (!window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB';
      if (_isNightTime()) u.volume = NIGHT_VOLUME;
      speechSynthesis.speak(u);
    } catch(e) {}
  }

  const _DAY_MS = 24 * 60 * 60 * 1000;
  function _elToastOncePerDay(key, msg) {
    if (typeof showToast !== 'function') return;
    const last = parseInt(localStorage.getItem(key) || '0', 10);
    if (Date.now() - last < _DAY_MS) return;
    localStorage.setItem(key, String(Date.now()));
    showToast(msg, 10000);
  }
  // Traduce el status HTTP embebido en el Error de speakElevenLabs ("EL 401") a un aviso visible,
  // limitado a 1 vez por día por tipo, para que una key vencida o un rate-limit no dejen a
  // Tobías sin saber por qué JARVIS "sonó distinto" (voz del navegador en vez de la premium).
  function _elHandleFailure(err) {
    const m = /EL (\d+)/.exec((err && err.message) || '');
    const status = m ? parseInt(m[1], 10) : null;
    if (status === 401 || status === 403) {
      _elToastOncePerDay('jarvis_el_authfail_toast_at', '🔑 La key de ElevenLabs es inválida o venció — JARVIS usa la voz del navegador.');
    } else if (status === 429) {
      _elToastOncePerDay('jarvis_el_ratelimit_toast_at', '⏳ Se alcanzó el límite de uso de ElevenLabs — JARVIS usa la voz del navegador.');
    }
  }

  // ElevenLabs es la voz primaria; ante fallo (key inválida, rate-limit, error de red) se cae a
  // la voz del navegador para que la frase igual suene — JARVIS nunca queda mudo.

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
      } else if (res.status === 401 || res.status === 403) {
        _elHandleFailure({ message: 'EL ' + res.status });
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

  // Voz primaria por ElevenLabs (en vivo o cacheada). Sin key / sin cuota → silencio (deliberado,
  // ver _elHint y reserva de cuota). Ante error de ElevenLabs (key inválida, rate-limit, red)
  // se cae a _speakBrowser() para que la frase igual suene — ver _elHandleFailure.
  async function speak(text, opts) {
    if (!enabled || !text) return;
    _speakAt = Date.now();
    const prepped = _ttsPrep(text);
    if (!_elKey()) { _elHint(); return; }                                  // sin key → silencio
    if (opts && opts.dynamic && !(await _elQuotaOk())) return;              // dinámica sin cuota → silencio
    try {
      await speakElevenLabs(prepped);
    } catch (e) {
      console.warn('JARVIS sin voz premium (ElevenLabs), usando voz del navegador:', e.message);
      _elHandleFailure(e);
      _speakBrowser(prepped);                                              // nunca queda mudo
    }
  }

  let _speakAt = 0, _lastSpeakEnd = 0;
  function isSpeaking() {
    // Tope de 25s también en la rama del <audio>: un elemento trabado (no pausado/no terminado)
    // jamás debe mantener isSpeaking() en true para siempre — eso deja el micrófono apagado (anti-eco).
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
        try { walk(JSON.parse(localStorage.getItem('proyectos_' + t + '_v1') || '[]')); } catch(e){ console.warn('JARVIS checkOverdue: no se pudo parsear proyectos_' + t + '_v1', e); }
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

  window.JARVIS = { speak, greeting, onNewProject, onTaskDone, onPrioritySet, onDeleteProject, onThemeChange, checkOverdue, toggle, isSpeaking, recentlySpoke, stopSpeaking, checkVoiceQuota: _elQuotaCheckProactive, isNight: _isNightTime };
})();
