/* ── JARVIS EARS — wake word "Hey Jarvis" + comandos de voz ──
   Toda la config vive en localStorage (por dispositivo): no toca S ni Firebase,
   por lo que no interfiere con la sincronización entre PC y celular. */
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const WAKE_RE = /\b(jarvis|yarvis|harvis|jarbis|garvis|charvis|jervis|yarbis|harbis|jarviz|j[aá]rbis|gervis)\b/i;
  const TABS_VOICE = { vida:'vida', finanzas:'finanzas', salud:'salud', conocimiento:'conocimiento', inteligencia:'ia', ia:'ia' };
  let wakeOn = localStorage.getItem('jarvis_wake') === '1';
  let rec = null, mode = 'off'; // off | passive (espera wake word) | command (espera orden)
  let cmdTimer = null, recStartedAt = 0;
  const LISTEN_MS = 32000; // ventana de escucha muy amplia, para charlas largas sin repetir "Jarvis"
  let restartTimes = [], restartTimer = null; // anti-tormenta de reinicios

  // ── Anti-eco: NUNCA escuchar la propia voz de JARVIS ──
  // Mientras habla, se aborta el reconocimiento (descarta el buffer de audio, así su voz jamás
  // se transcribe). Tras terminar, se espera un cooldown antes de reabrir, para tragar la cola
  // que el reconocedor finaliza un instante después. Esto rompe el loop TTS→mic→comando.
  const ECHO_COOLDOWN = 1400; // ms tras terminar de hablar
  let _micSuppressed = false;
  function _jarvisTalking() { try { return !!(window.JARVIS && JARVIS.isSpeaking()); } catch(e){ return false; } }
  // ¿es (o acaba de ser) su propia voz? — guarda a nivel de resultado, por si algo se filtra
  function _selfEcho() {
    try { return !!(window.JARVIS && (JARVIS.isSpeaking() || (JARVIS.recentlySpoke && JARVIS.recentlySpoke(ECHO_COOLDOWN)))); }
    catch(e){ return false; }
  }
  setInterval(() => {
    if (mode === 'off') { _micSuppressed = false; return; }
    const talking = _jarvisTalking();
    if (talking && !_micSuppressed) {
      // JARVIS empezó a hablar → apagar el micrófono para no oírse a sí mismo
      _micSuppressed = true;
      if (rec) { try { rec.onend = null; rec.abort(); } catch(e){} rec = null; }
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    } else if (_micSuppressed && !_selfEcho()) {
      // terminó de hablar y pasó el cooldown → reabrir el micrófono fresco (eco descartado)
      _micSuppressed = false;
      _scheduleRestart();
    }
  }, 150);

  function _ui() {
    if (window.JARVIS_FX) JARVIS_FX.setState(mode === 'off' ? 'off' : mode);
  }

  /* ── Motor de reconocimiento (es-AR) ── */
  function startRec() {
    if (!SR || rec || mode === 'off' || _micSuppressed) return;
    rec = new SR();
    rec.lang = 'es-AR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = (e.results[i][0].transcript || '').trim();
        if (!text) continue;

        if (!e.results[i].isFinal) {
          if (mode === 'command') {
            if (_selfEcho()) continue; // no reaccionar a su propia voz (ni a su eco reciente)
            // Seguís hablando: extender la ventana y mostrar transcripción en vivo
            clearTimeout(cmdTimer); cmdTimer = setTimeout(commandTimeout, LISTEN_MS);
            if (typeof showToast === 'function') showToast('🎙️ ' + text + '…');
          } else if (mode === 'passive' && WAKE_RE.test(text) && !_selfEcho()) {
            // Wake word en resultado parcial: reaccionar ya (los finales a veces tardan o no llegan)
            const after = text.replace(WAKE_RE, '').replace(/^[,.\s]+/, '').trim();
            enterCommand();
            if (!after && window.JARVIS) JARVIS.speak('Yes, sir?');
          }
          continue;
        }

        // Resultado final
        if (mode === 'command') {
          if (_selfEcho()) continue; // descartar el eco de su propia voz (incluye el cooldown posterior)
          // Quitar el wake word si vino pegado a la orden ("jarvis cambiá a finanzas")
          const cmd = text.replace(WAKE_RE, '').replace(/^[,.\s]+/, '').trim();
          if (!cmd) continue; // era solo "jarvis" — seguir esperando la orden
          clearTimeout(cmdTimer);                                   // pausar el cierre mientras procesa y responde
          Promise.resolve(handleCommand(cmd)).finally(followUp);    // tras responder, sigue escuchando (charla continua)
        } else if (mode === 'passive') {
          if (_selfEcho()) continue; // no escucharse a sí mismo (ni su eco reciente)
          const m = text.match(WAKE_RE);
          if (!m) continue;
          const after = text.slice(text.search(WAKE_RE) + m[0].length).replace(/^[,.\s]+/, '').trim();
          if (after.split(/\s+/).filter(Boolean).length >= 2) { enterCommand(); Promise.resolve(handleCommand(after)).finally(followUp); } // orden directa + abrir la charla
          else { enterCommand(); if (window.JARVIS) JARVIS.speak('Yes, sir?'); }
        }
      }
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wakeOn = false; localStorage.setItem('jarvis_wake', '0');
        mode = 'off'; stopRec(); _ui(); _updateWakeBtn();
        if (typeof showToast === 'function') showToast('🎙️ Chrome bloqueó el micrófono — clic en el candado de la barra de direcciones → permitir Micrófono', 7000);
      } else if (e.error === 'audio-capture') {
        mode = 'off'; stopRec(); _ui();
        if (typeof showToast === 'function') showToast('🎙️ No se detectó micrófono — revisá que esté conectado y sea el predeterminado en Windows', 7000);
      } else if (e.error === 'network' && mode === 'command') {
        if (typeof showToast === 'function') showToast('🎙️ Sin conexión con el servicio de voz de Google', 5000);
      }
      // 'no-speech' y 'aborted' son normales — el reinicio automático de onend los cubre
    };
    rec.onend = () => {
      rec = null;
      _scheduleRestart(); // reinicio automático (Chrome corta la sesión solo)
    };
    try { rec.start(); recStartedAt = Date.now(); restartTimes.push(recStartedAt); }
    catch(e) { rec = null; _scheduleRestart(); }
  }

  // Reinicio resiliente: espaciado normal, pero si Chrome entra en bucle de cortes
  // (throttling o micrófono perdido) se frena para darle tiempo a recuperarse en lugar
  // de tormentear reinicios — que es justo lo que dejaba la escucha intermitente.
  function _scheduleRestart() {
    if (mode === 'off' || restartTimer || _micSuppressed) return;
    const now = Date.now();
    restartTimes = restartTimes.filter(t => now - t < 10000);
    const delay = restartTimes.length >= 5 ? 2000 : 250;
    restartTimer = setTimeout(() => { restartTimer = null; startRec(); }, delay);
  }

  function stopRec() {
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    if (!rec) return;
    const r = rec; rec = null;
    try { r.onend = null; r.stop(); } catch(e) {}
  }

  // Watchdog: cubre dos fallas de Chrome que dejaban a JARVIS sordo de forma intermitente.
  // (1) onend nunca disparó y no quedó reconocimiento vivo → reiniciar.
  // (2) "zombie": el reconocimiento sigue vivo pero Chrome dejó de capturar sin avisar
  //     (no dispara onend). Las sesiones continuas largas se degradan; reciclarlas en
  //     reposo cada ~50s mantiene la escucha sana y mata cualquier sesión zombie.
  setInterval(() => {
    if (mode === 'off') return;
    if (!rec) { _scheduleRestart(); return; }
    if (mode === 'passive' && Date.now() - recStartedAt > 50000) {
      stopRec();          // corta la sesión vieja…
      _scheduleRestart(); // …y arranca una fresca
    }
  }, 4000);

  // El cierre por silencio NO corre mientras JARVIS está hablando: la charla queda viva y
  // te da la ventana completa recién cuando terminó de hablar y te quedaste callado.
  function commandTimeout(tries) {
    tries = tries || 0;
    // Esperar a que termine de hablar, pero con tope (~30s) por si isSpeaking quedara trabado.
    if (tries < 20 && window.JARVIS && JARVIS.isSpeaking()) { cmdTimer = setTimeout(() => commandTimeout(tries + 1), 1500); return; }
    exitCommand();
  }
  // Tras responder una orden, reabrir la ventana para seguir la conversación sin repetir "Jarvis".
  function followUp() {
    if (mode !== 'command') return;        // si saliste manualmente, no reabrir
    clearTimeout(cmdTimer);
    cmdTimer = setTimeout(commandTimeout, LISTEN_MS);
  }

  function enterCommand() {
    mode = 'command'; _ui();
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; } // no dejar un reinicio del watchdog pisando el arranque
    clearTimeout(cmdTimer);
    cmdTimer = setTimeout(commandTimeout, LISTEN_MS); // si te quedás en silencio, vuelve a reposo
    _checkMic();
    _startMeter();
    if (typeof showToast === 'function') showToast('🎙️ Te escucho — hablá ahora');
    startRec();
  }

  // ── Medidor de nivel: el botón brilla según cuán fuerte capta el micrófono ──
  // Sirve para calibrar la amplificación de Windows viendo la señal en vivo
  let _meterCtx = null, _meterStream = null, _meterRaf = null;
  async function _startMeter() {
    if (_meterStream || !navigator.mediaDevices?.getUserMedia) return;
    try {
      _meterStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      _meterCtx = new (window.AudioContext || window.webkitAudioContext)();
      try { _meterCtx.resume(); } catch(e) {}
      const src = _meterCtx.createMediaStreamSource(_meterStream);
      const an = _meterCtx.createAnalyser(); an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let max = 0;
        for (let i = 0; i < buf.length; i++) { const d = Math.abs(buf[i] - 128); if (d > max) max = d; }
        const lvl = Math.min(1, max / 50);
        if (window.JARVIS_FX) JARVIS_FX.setLevel(lvl); // alimenta la red neuronal con el nivel de voz en vivo
        _meterRaf = requestAnimationFrame(tick);
      };
      tick();
    } catch(e) {}
  }
  function _stopMeter() {
    if (_meterRaf) { cancelAnimationFrame(_meterRaf); _meterRaf = null; }
    if (_meterStream) { _meterStream.getTracks().forEach(t => t.stop()); _meterStream = null; }
    if (_meterCtx) { try { _meterCtx.close(); } catch(e) {} _meterCtx = null; }
    if (window.JARVIS_FX) JARVIS_FX.setLevel(0);
  }

  async function _checkMic() {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      if (!devs.some(d => d.kind === 'audioinput')) {
        if (typeof showToast === 'function') showToast('🎙️ Windows no reporta ningún micrófono conectado — revisá Configuración → Sistema → Sonido', 7000);
      }
    } catch(e) {}
  }

  function exitCommand() {
    clearTimeout(cmdTimer);
    _stopMeter();
    mode = wakeOn ? 'passive' : 'off'; _ui();
    if (mode === 'off') stopRec();
  }

  /* ── Router de comandos (español) ── */
  function _norm(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function say(text, dynamic) { if (window.JARVIS) JARVIS.speak(text, dynamic ? { dynamic: true } : undefined); }

  // Traduce a inglés un texto generado localmente en español (briefing/insights del centro de mando),
  // para que JARVIS lo HABLE en inglés aunque la tarjeta en pantalla siga en español.
  // Sin key de IA o ante cualquier error → devuelve el texto original (degradación elegante).
  async function _translateEN(text) {
    const key = localStorage.getItem('jarvis_gemini_key');
    if (!key || !text) return text;
    const sysT = 'Translate the user message into natural, fluent English. Keep it concise and faithful. Reply with ONLY the English translation — no quotes, no notes, no preamble.';
    const headers = { 'Content-Type': 'application/json' };
    let url, body, parse;
    try {
      if (key.startsWith('gsk_') || key.startsWith('sk-or-')) {
        const isGroq = key.startsWith('gsk_');
        url = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
        headers['Authorization'] = 'Bearer ' + key;
        body = { model: isGroq ? 'llama-3.3-70b-versatile' : 'meta-llama/llama-3.3-70b-instruct:free',
          messages: [{ role: 'system', content: sysT }, { role: 'user', content: text }], max_tokens: 300, temperature: 0 };
        parse = d => d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
      } else {
        url = key.startsWith('AQ.')
          ? 'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent'
          : 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
        headers['x-goog-api-key'] = key;
        body = { systemInstruction: { parts: [{ text: sysT }] }, contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0, thinkingConfig: { thinkingBudget: 0 } } };
        parse = d => d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts[0].text;
      }
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) return text;
      const data = await res.json();
      return ((parse(data) || '') + '').trim() || text;
    } catch (e) { return text; }
  }
  // Hablar en inglés un texto que puede venir en español (traduce y luego habla)
  function sayEN(text) { _translateEN(text).then(en => say(en, true)); }
  window.JARVIS_EARS_sayEN = sayEN;   // reutilizable desde otros módulos (p. ej. paleta de comandos)

  let _cmdBusy = false;
  async function handleCommand(raw) {
    if (_cmdBusy) return;   // evita doble ejecución si el STT entrega dos resultados finales seguidos
    _cmdBusy = true;
    try { return await _handleCommandInner(raw); }
    finally { _cmdBusy = false; }
  }
  async function _handleCommandInner(raw) {
    const t = _norm(raw);
    if (typeof showToast === 'function') showToast('🎙️ ' + raw);

    // silenciar
    if (/\b(silencio|callate|basta|pará de hablar|para de hablar)\b/.test(t)) {
      if (window.JARVIS) JARVIS.stopSpeaking();
      return;
    }

    // cambiar de pestaña
    if (/\b(anda|abri|cambia|mostra|pone|vamos|lleva|ir|pestana|seccion)\b/.test(t)) {
      for (const [word, tab] of Object.entries(TABS_VOICE)) {
        if (t.includes(word)) {
          const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
          if (btn) { btn.click(); say(`Switching to ${tab}, sir.`, true); return; }
        }
      }
    }

    // crear proyecto: "creá un proyecto llamado X [en finanzas]"
    let m = raw.match(/cre[aá]\w*\s+(?:un\s+)?proyecto\s+(?:llamado\s+|que se llame\s+)?(.+)/i);
    if (m && window.PROY_VOICE) {
      let name = m[1].trim(), tab = 'vida';
      const mt = _norm(name).match(/\s+en\s+(vida|finanzas|salud|conocimiento|inteligencia|ia)\s*$/);
      if (mt) { tab = TABS_VOICE[mt[1]]; name = name.slice(0, mt.index).trim(); }
      if (name) {
        PROY_VOICE.addProject(tab, name.charAt(0).toUpperCase() + name.slice(1));
        _translateEN(name).then(n => say(`Project "${n}" created in ${tab}, sir. I'll keep an eye on it.`, true));
        return;
      }
    }

    // marcar hábito: "marcá el hábito de lectura", "registré entrenamientos", "marcá lectura como parcial/descanso"
    if ((/\bhabito\b/.test(t) || /\bregistr/.test(t)) && window.PROY_VOICE) {
      let status = 'done';
      if (/\bparcial\b/.test(t)) status = 'partial';
      else if (/\bdescans/.test(t)) status = 'rest';
      const name = raw
        .replace(/\b(marc[aá]\w*|registr[aáeéó]\w*|complet[aá]\w*|anot[aá]\w*|tild[aá]\w*|pon[eé]\w*)\b/gi, ' ')
        .replace(/\b(el|la|los|las|un|una|unos|unas|mi|mis|de|del|hoy|como|hecho|hecha|completo|completa|completado|completada|parcial|descanso|descans[eé]|h[aá]bito|h[aá]bitos)\b/gi, ' ')
        .replace(/\s+/g, ' ').trim();
      const marked = PROY_VOICE.markHabit(name, status);
      if (marked) {
        const w = status === 'partial' ? 'logged as partial' : status === 'rest' ? 'marked as a rest day' : 'marked as done';
        _translateEN(marked).then(n => say(`"${n}" ${w} for today, sir.`, true));
      } else say(`I couldn't find a habit matching that, sir.`, true);
      return;
    }

    // completar tarea: "marcá como hecha X" / "completá X"  (si no es tarea, prueba como hábito)
    m = raw.match(/(?:marc[aá]\w*|complet[aá]\w*|termin[aá]\w*|tild[aá]\w*)\s+(?:como\s+(?:hecha|hecho|completa|completada|completado)\s+)?(?:la\s+tarea\s+)?(.+)/i);
    if (m && window.PROY_VOICE) {
      const done = PROY_VOICE.completeTask(m[1].trim());
      if (done) { _translateEN(done).then(n => say(`"${n}" marked as complete, sir. Well done.`, true)); return; }
      const h = PROY_VOICE.markHabit(m[1].trim(), 'done');
      if (h) { _translateEN(h).then(n => say(`"${n}" marked as done for today, sir.`, true)); return; }
      // ni tarea ni hábito → que lo resuelva el cerebro IA (puede ser objetivo trimestral, meta del día, etc.)
    }

    // pendientes / vencidas
    if (/\b(pendiente|pendientes|vencid\w+|atrasad\w+)\b/.test(t) && window.PROY_VOICE) {
      const s = PROY_VOICE.stats();
      say(`You have ${s.pending} pending tasks, ${s.overdue} of them overdue, sir.`, true);
      return;
    }

    // hora / fecha
    if (/que hora/.test(t)) {
      const d = new Date();
      say(`It's ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}, sir.`, true);
      return;
    }
    if (/que dia/.test(t)) {
      say(`Today is ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, sir.`, true);
      return;
    }

    // tema visual
    if (/\b(tema|modo)\b/.test(t) && typeof applyTheme === 'function') {
      const map = { bloomberg:'bloomberg', ambar:'amber', radar:'radar', infrarrojo:'infrared', normal:'', clasico:'' };
      for (const [w, th] of Object.entries(map)) {
        if (t.includes(w)) { applyTheme(th); say('Theme changed, sir.', true); return; }
      }
    }

    // briefing / informe del sistema (motor de inteligencia)
    if (/\b(briefing|informe|como voy|como vengo|como vamos)\b/.test(t) && window.JARVIS_INTEL) {
      const c = document.querySelector('.intel-card'); if (c) { JARVIS_INTEL.renderCard(); c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      sayEN(JARVIS_INTEL.briefing());   // datos en español → hablado en inglés
      return;
    }

    // fallback → cerebro IA: responde sobre cualquier dato y ejecuta cualquier acción del centro de mando
    if (window.JARVIS_FX) JARVIS_FX.setState('thinking');
    try {
      const ans = await askGemini(raw);
      if (ans) _handleBrain(ans);
    } catch (e) {
      console.warn('JARVIS brain error:', e.message);
      say("I'm afraid my reasoning engine is offline, sir.", true);
    } finally { _ui(); }
  }

  let _convo = [];   // memoria conversacional corta (multi-turno) para askGemini

  // Extrae el primer objeto JSON balanceado (tolera texto antes o después del JSON)
  function _extractJSON(raw) {
    let s = ('' + raw).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const start = s.indexOf('{');
    if (start < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; }
      else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { if (--depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch (e) { return null; } } }
    }
    return null;
  }

  // Interpreta la respuesta JSON del cerebro: ejecuta la acción (si hay) y habla la confirmación.
  // Siempre registra exactamente un turno de respuesta en _convo (balanceado con el del usuario).
  function _handleBrain(raw) {
    const parsed = _extractJSON(raw);
    let spoken;
    if (!parsed) {
      spoken = ('' + raw).trim();   // no vino como JSON → leerlo tal cual
    } else {
      const reply = ((parsed.reply || parsed.say || '') + '').trim();
      if (parsed.action && parsed.action !== 'none' && window.JARVIS_BRAIN) {
        const res = JARVIS_BRAIN.execute(parsed.action, parsed.args || {});
        spoken = (res && res.ok === false) ? (res.msg || "I couldn't do that, sir.") : (reply || 'Done, sir.');
      } else {
        spoken = reply || 'Done, sir.';
      }
    }
    spoken = spoken || 'Done, sir.';
    _convo.push({ role: 'model', text: spoken });
    if (_convo.length > 12) _convo = _convo.slice(-12);
    say(spoken, true);
  }

  /* ── Gemini (free tier) — key por dispositivo, nunca en el repo ── */
  async function askGemini(question) {
    const key = localStorage.getItem('jarvis_gemini_key');
    if (!key) {
      say('I need a Gemini API key to answer that, sir. You can add one in the appearance panel.', true);
      if (typeof showToast === 'function') showToast('🔑 Falta la API key de Gemini (panel de temas)');
      return null;
    }
    let snap = '', actions = '';
    try { if (window.JARVIS_BRAIN) { snap = JARVIS_BRAIN.snapshot(); actions = JARVIS_BRAIN.ACTIONS_HELP; } } catch(e) {}
    const sys =
'You are JARVIS, the AI butler of this personal command center. The user speaks Spanish (rioplatense); understand him in Spanish but ALWAYS reply in English, addressing him as "sir", precise with a touch of dry wit. Today is ' + new Date().toDateString() + '.\n\n' +
'IMPORTANT — LANGUAGE: All the command center DATA in CONTEXT (task names, project names, goals, subjects, reminders, notes, etc.) is written in Spanish. Whenever you read, list or report any of it aloud, TRANSLATE it naturally into English — never speak the Spanish text verbatim. For example a task "Comprar leche" must be said as "Buy milk". Your entire reply must be in fluent English, including every item name you mention. (You still match items against the Spanish CONTEXT internally for actions, but you SPEAK English.)\n\n' +
'You can READ the full state of the command center (CONTEXT below) AND act on it (create, mark/complete, edit, delete). ' +
'Respond with ONLY a single JSON object — no markdown, no text around it:\n' +
'{"action":"<an action name below, or none>","args":{...},"reply":"<your spoken reply in English, max 2 sentences>"}\n' +
'If the user only asks something, use "action":"none" and answer in "reply" using the CONTEXT (e.g. the quarterly objectives are listed there). ' +
'If he asks to create/mark/complete/edit/delete anything, choose the matching action, fill args, and confirm in "reply". ' +
'For "search"/"name" args use a short distinctive fragment of the item so it can be matched.\n\n' +
'CRITICAL SAFETY RULES — obey strictly:\n' +
'1. Choose a MUTATING action (create/add/mark/complete/edit/delete/log/toggle) ONLY when THIS user message is a clear, explicit, intentional command to do exactly that.\n' +
'2. If the message is a question, a request to list/show/tell, a greeting, ambiguous, fragmented, nonsensical, or it merely repeats or echoes something you just said, you MUST use "action":"none" and only answer or acknowledge — change NOTHING.\n' +
'3. NEVER mark, complete, toggle or delete anything as a side effect of answering. Listing today\'s tasks must NEVER complete them.\n' +
'4. When in any doubt, use "action":"none". Acting without an explicit request is a serious error; doing nothing is always safe.\n\n' +
'AVAILABLE ACTIONS:\n- ' + actions + '\n\n' +
'CONTEXT (live state of the command center):\n' + snap;

    // Proveedor según el formato de la key — todas se pegan en el mismo campo:
    //   AIza… → Gemini (AI Studio)    AQ.… → Gemini (Vertex express, requiere API + billing)
    //   gsk_… → Groq                  sk-or-… → OpenRouter (modelos gratis)
    let url, body, parse;
    const headers = { 'Content-Type': 'application/json' };
    if (key.startsWith('gsk_') || key.startsWith('sk-or-')) {
      const isGroq = key.startsWith('gsk_');
      url = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
      headers['Authorization'] = 'Bearer ' + key;
      body = {
        model: isGroq ? 'llama-3.3-70b-versatile' : 'meta-llama/llama-3.3-70b-instruct:free',
        messages: [{ role: 'system', content: sys }, ..._convo.map(mm => ({ role: mm.role === 'model' ? 'assistant' : 'user', content: mm.text })), { role: 'user', content: question }],
        max_tokens: 600, temperature: 0.2
      };
      parse = d => d.choices?.[0]?.message?.content;
    } else {
      url = key.startsWith('AQ.')
        ? 'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent'
        : 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
      headers['x-goog-api-key'] = key;
      body = {
        systemInstruction: { parts: [{ text: sys }] },
        contents: [..._convo.map(mm => ({ role: mm.role === 'model' ? 'model' : 'user', parts: [{ text: mm.text }] })), { role: 'user', parts: [{ text: question }] }],
        generationConfig: { maxOutputTokens: 600, temperature: 0.2, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } }
      };
      parse = d => d.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    let res;
    try {
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (e) {
      // fetch lanzó antes de llegar al servidor: red caída o CORS bloqueado
      if (typeof showToast === 'function') showToast('🤖 No se pudo contactar a la IA (red o CORS): ' + e.message, 8000);
      throw e;
    }
    if (!res.ok) {
      let detail = '';
      try {
        const err = await res.json();
        detail = err.error?.message || err.error || '';
        if (typeof detail !== 'string') detail = JSON.stringify(detail);
      } catch(e) {}
      if (typeof showToast === 'function') {
        const hint = (res.status === 401 || res.status === 403)
          ? ' — esa key no sirve; probá con una de Groq (console.groq.com/keys, gratis sin tarjeta)'
          : (res.status === 429 ? ' — límite de uso alcanzado, esperá un rato' : '');
        showToast('🤖 La IA rechazó el pedido (HTTP ' + res.status + ')' + (detail ? ': ' + detail.slice(0, 140) : '') + hint, 10000);
      }
      throw new Error('AI ' + res.status + ' ' + detail);
    }
    const data = await res.json();
    const out = ((parse(data) || '') + '').trim() || null;
    if (out) { _convo.push({ role: 'user', text: question }); if (_convo.length > 12) _convo = _convo.slice(-12); }
    return out;
  }

  /* ── Toggle wake word + guardado de keys (todo por dispositivo) ── */
  function toggleWake() {
    wakeOn = !wakeOn;
    localStorage.setItem('jarvis_wake', wakeOn ? '1' : '0'); // solo este dispositivo — no sincroniza
    if (wakeOn) { mode = 'passive'; startRec(); say('Listening for your call, sir.'); }
    else { mode = 'off'; stopRec(); }
    _ui(); _updateWakeBtn();
  }

  function _updateWakeBtn() {
    const b = document.getElementById('jarvis-wake-btn');
    if (!b) return;
    b.textContent = wakeOn ? '🎙️ "Hey Jarvis" activo' : '🎙️ "Hey Jarvis" apagado';
    b.style.color = wakeOn ? 'rgba(0,255,136,0.75)' : 'rgba(255,255,255,0.28)';
    b.style.borderColor = wakeOn ? 'rgba(0,255,136,0.25)' : 'rgba(255,255,255,0.08)';
  }

  function saveKey(name, val) {
    val = (val || '').trim();
    if (val) localStorage.setItem(name, val); else localStorage.removeItem(name);
    if (typeof showToast === 'function') showToast(val ? '🔑 Key guardada en este dispositivo' : '🔑 Key eliminada');
  }

  function _initInputs() {
    const g = document.getElementById('jarvis-gemini-key');
    const el = document.getElementById('jarvis-el-key');
    if (g) g.value = localStorage.getItem('jarvis_gemini_key') || '';
    if (el) el.value = localStorage.getItem('jarvis_el_key') || '';
  }
  setTimeout(() => { _updateWakeBtn(); _initInputs(); }, 400);

  if (window.JARVIS_FX) JARVIS_FX.onExit = exitCommand; // clic en el HUD a pantalla completa = salir del modo comando

  if (wakeOn && SR) { mode = 'passive'; startRec(); }
  _ui();

  window.JARVIS_EARS = { toggleWake, saveKey, handleCommand };
})();
