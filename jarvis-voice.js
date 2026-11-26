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
  // Token de generación de la cola de reproducción: cada speakElevenLabs() nuevo (o stopSpeaking())
  // lo incrementa. El loop de _playSequence lo chequea antes de pasar a la siguiente oración —
  // así una interrupción corta TODA la cola pendiente, no solo la oración que suena en ese momento.
  let _playGen = 0;

  // Modo nocturno: >=23h o <7h (el usuario duerme 00:00-07:00) — voz más baja y respuestas
  // más cortas (esto último lo aplica ears.js en el prompt de Gemini). Guard: solo la hora local.
  function _isNightTime() {
    // Si el día ya arrancó (primera entrada desde las 05:00, ver cmInicioDiaMin en app.js) la madrugada no cuenta como noche.
    try { const h = new Date().getHours(); return h >= 23 || (h < 7 && !(typeof cmDiaArrancado === 'function' && cmDiaArrancado())); } catch(e) { return false; }
  }
  const NIGHT_VOLUME = 0.55;

  // Storage persistente: pide al navegador NO desalojar Cache Storage bajo presión de
  // espacio (la 2ª causa de frases TTS perdidas, junto al SW que borraba jarvis-tts-*
  // en cada activate — ver fixes.json). Silencioso: Chrome decide solo, sin prompt.
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  // Clave de cache unificada: se usa TANTO para la frase completa como para cada oración suelta
  // (misma forma exacta 'EL_VOICE/elModel/texto') — así una oración cacheada en un llamado
  // multi-oración sirve como hit directo si esa misma oración vuelve a pedirse sola después.
  function _ttsCacheKey(t, elModel) {
    return 'https://jarvis-tts.cache/' + EL_VOICE + '/' + elModel + '/' + encodeURIComponent(t);
  }
  async function _openCache() {
    try { return await caches.open('jarvis-tts-v1'); } catch(e) { return null; }
  }
  async function _cacheGet(c, key) {
    if (!c) return null;
    try { const hit = await c.match(key); if (hit) return await hit.blob(); } catch(e) {}
    return null;
  }

  // ── Caché compartida en Firestore (colección jarvis_tts) ──────────────────────────────
  // La Cache Storage de arriba es POR DISPOSITIVO: la misma frase se pagaba de nuevo en la PC,
  // en el celular y en cada perfil de navegador. Esta capa la comparte entre todos: una frase se
  // sintetiza UNA sola vez en la vida y después sale gratis en cualquier dispositivo logueado.
  // Colección propia a propósito — NO va en appdata/: varias funciones de app.js hacen
  // _db.collection('appdata').get(), que trae TODOS los docs, y se bajarían los MP3 enteros.
  const TTS_COL     = 'jarvis_tts';
  const TTS_MAX_B64 = 700000;   // tope propio; el límite duro de un doc de Firestore es 1 MiB
  function _cloudReady() {
    try { return typeof _db !== 'undefined' && !!_db && typeof _auth !== 'undefined' && !!_auth && !!_auth.currentUser; }
    catch(e) { return false; }
  }
  // Id de documento estable: SHA-256 del MISMO triple (voz/modelo/texto) que la clave local, así
  // las dos capas de cache aciertan y fallan juntas. Requiere contexto seguro (HTTPS/localhost).
  async function _ttsDocId(text, elModel) {
    const raw = EL_VOICE + '/' + elModel + '/' + text;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function _blobToB64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload  = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }
  function _b64ToBlob(b64) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: 'audio/mpeg' });
  }
  // La caché de nube NUNCA rompe la voz: ante cualquier fallo se devuelve null y el flujo cae a
  // sintetizar como siempre. Pero no falla en silencio — si faltan las reglas de Firestore, cada
  // dispositivo gastaría cuota por su cuenta sin que se note, así que eso se avisa (1 vez/día).
  function _cloudFail(e, op) {
    console.warn('[jarvis-tts] ' + op + ' de la caché compartida falló:', (e && (e.code || e.message)) || e);
    if (e && e.code === 'permission-denied') {
      _elToastOncePerDay('jarvis_tts_perm_toast_at', '☁️ La caché de voz compartida no tiene permiso en Firestore — cada dispositivo va a gastar cuota por su cuenta. Falta publicar la regla de jarvis_tts.');
    }
  }
  async function _cloudGet(id) {
    if (!_cloudReady()) return null;
    try {
      const d = await _db.collection(TTS_COL).doc(id).get();
      if (!d.exists) return null;
      const b64 = d.data() && d.data().mp3;
      return b64 ? _b64ToBlob(b64) : null;
    } catch(e) { _cloudFail(e, 'lectura'); return null; }
  }
  async function _cloudPut(id, text, elModel, blob) {
    if (!_cloudReady()) return;
    try {
      const b64 = await _blobToB64(blob);
      if (!b64 || b64.length > TTS_MAX_B64) return;
      await _db.collection(TTS_COL).doc(id).set({
        mp3: b64, text, voice: EL_VOICE, model: elModel,
        chars: text.length, bytes: b64.length, createdAt: Date.now()
      });
    } catch(e) { _cloudFail(e, 'escritura'); }
  }
  // Busca una frase ya pagada: cache local (instantánea) → Firestore (una lectura, 0 caracteres).
  // Un acierto de nube se copia a la cache local para que la próxima vez ni toque la red.
  async function _lookup(text, key, elModel, c) {
    const local = await _cacheGet(c, key);
    if (local) return local;
    const id = await _ttsDocId(text, elModel).catch(() => null);
    if (!id) return null;
    const cloud = await _cloudGet(id);
    if (cloud && c) { try { await c.put(key, new Response(cloud, { headers: { 'Content-Type': 'audio/mpeg' } })); } catch(e) {} }
    return cloud;
  }
  // Sintetiza de verdad (lo único que gasta cuota) y sube la frase para que ningún OTRO
  // dispositivo la vuelva a pagar. Se llama solo con un miss ya confirmado de las dos caches.
  async function _synthAndUpload(text, key, elModel, c) {
    const blob = await _synthAndCache(text, key, elModel, c);
    // Sin await: subir no debe demorar la reproducción de la frase recién sintetizada.
    _ttsDocId(text, elModel).then(id => _cloudPut(id, text, elModel, blob)).catch(() => {});
    return blob;
  }
  async function _getOrSynth(text, key, elModel, c) {
    const hit = await _lookup(text, key, elModel, c);
    return hit || _synthAndUpload(text, key, elModel, c);
  }

  const CHARS_KEY = 'jarvis_el_chars_used_total';
  // Solo se llama tras una llamada REAL (exitosa) a la API — nunca en un cache hit — para que el
  // contador refleje el consumo real contra la cuota mensual de ElevenLabs.
  function _addCharsUsed(n) {
    try {
      const cur = parseInt(localStorage.getItem(CHARS_KEY) || '0', 10) || 0;
      localStorage.setItem(CHARS_KEY, String(cur + n));
    } catch(e) {}
    _renderUsage();
  }
  function _renderUsage() {
    const el = document.getElementById('jarvis-el-usage');
    if (!el) return;
    const total = parseInt(localStorage.getItem(CHARS_KEY) || '0', 10) || 0;
    el.textContent = `🔊 ${total.toLocaleString('es')} caracteres usados (histórico)`;
  }
  setTimeout(_renderUsage, 500);

  // ── Contador de costo de API (Claude/Gemini/Groq/OpenRouter) — mismo patrón que arriba ──
  const TOK_IN_KEY  = 'jarvis_tokens_in_total';
  const TOK_OUT_KEY = 'jarvis_tokens_out_total';
  const COST_KEY    = 'jarvis_api_cost_total_usd';
  // Precios APROXIMADOS por millón de tokens (USD). Editables — ajustar si cambian las tarifas.
  const API_PRICES = {
    'claude-haiku-4-5-20251001': { in: 1.00, out: 5.00 },
    'claude-sonnet-5':           { in: 3.00, out: 15.00 },
    _default:                    { in: 1.00, out: 5.00 }  // groq/openrouter free ≈ 0, gemini free = 0
  };
  // Se llama tras CADA respuesta real de la API (Anthropic en jarvis-agent.js, y los 4 providers
  // de askGemini en jarvis-ears.js). `free=true` (o `model=null`) fuerza costo $0 — usarlo para
  // providers gratis (Groq, OpenRouter, Gemini free tier) aunque igual se cuenten los tokens.
  function addApiUsage(model, inTok, outTok, free) {
    inTok = inTok || 0; outTok = outTok || 0;
    try {
      const curIn  = parseInt(localStorage.getItem(TOK_IN_KEY)  || '0', 10) || 0;
      const curOut = parseInt(localStorage.getItem(TOK_OUT_KEY) || '0', 10) || 0;
      localStorage.setItem(TOK_IN_KEY,  String(curIn  + inTok));
      localStorage.setItem(TOK_OUT_KEY, String(curOut + outTok));
      if (!free && model) {
        const price = API_PRICES[model] || API_PRICES._default;
        const cost = (inTok / 1e6) * price.in + (outTok / 1e6) * price.out;
        const curCost = parseFloat(localStorage.getItem(COST_KEY) || '0') || 0;
        localStorage.setItem(COST_KEY, String(curCost + cost));
      }
    } catch(e) {}
    _renderCost();
  }
  function _renderCost() {
    const el = document.getElementById('jarvis-api-usage');
    if (!el) return;
    const tIn  = parseInt(localStorage.getItem(TOK_IN_KEY)  || '0', 10) || 0;
    const tOut = parseInt(localStorage.getItem(TOK_OUT_KEY) || '0', 10) || 0;
    const cost = parseFloat(localStorage.getItem(COST_KEY) || '0') || 0;
    el.textContent = `💬 ${(tIn + tOut).toLocaleString('es')} tokens · ~$${cost.toFixed(4)} estimado (cliente)`;
  }
  setTimeout(_renderCost, 500);

  async function _synthAndCache(text, key, elModel, c) {
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
    const blob = await res.blob();
    _addCharsUsed(text.length);
    if (c) { try { await c.put(key, new Response(blob, { headers: { 'Content-Type': 'audio/mpeg' } })); } catch(e) {} }
    return blob;
  }

  // Divide en oraciones sin cortar decimales ("3.14") ni abreviaturas comunes: exige puntuación
  // de cierre + espacio + mayúscula siguiente (incl. acentuadas) para considerar el corte válido.
  function _splitSentences(text) {
    if (!text) return [text];
    return text.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¡¿])/).filter(s => s.length > 0);
  }

  // Reproduce una cola de blobs EN ORDEN. currentAudio siempre apunta al <audio> que suena en
  // ese instante; solo se libera (y se marca _lastSpeakEnd) al terminar la ÚLTIMA oración o si
  // la cola fue cancelada — isSpeaking()/recentlySpoke() dependen de esta semántica exacta
  // porque el anti-eco de jarvis-ears.js las usa tal cual.
  function _playOne(blob, myGen, isLast) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      if (currentAudio) { try { currentAudio.pause(); URL.revokeObjectURL(currentAudio.src); } catch(e){} }
      const audio = currentAudio = new Audio(url);
      try { if (_isNightTime()) audio.volume = NIGHT_VOLUME; } catch(e) {}
      let settled = false;
      const done = () => {
        if (settled) return; settled = true;
        clearTimeout(to);
        if (isLast || myGen !== _playGen) { _lastSpeakEnd = Date.now(); if (currentAudio === audio) currentAudio = null; }
        try { URL.revokeObjectURL(url); } catch(e){}
        resolve();
      };
      const to = setTimeout(done, 60000);   // hard cap: jamás colgar isSpeaking() para siempre
      audio.onended = done;
      audio.onpause = done;   // interrumpido por la siguiente oración, una frase nueva o stopSpeaking()
      audio.onerror = done;
      audio.play().catch(err => { if (settled) return; settled = true; clearTimeout(to); if (currentAudio === audio) currentAudio = null; try { URL.revokeObjectURL(url); } catch(e){} reject(err); });
    });
  }
  async function _playSequence(blobs) {
    const myGen = ++_playGen;
    for (let i = 0; i < blobs.length; i++) {
      if (myGen !== _playGen) return;   // cancelado (stopSpeaking o un speak() más nuevo) antes de arrancar
      await _playOne(blobs[i], myGen, i === blobs.length - 1);
      if (myGen !== _playGen) return;   // cancelado a mitad de la cola
    }
  }

  // Modelos de ElevenLabs que NO hablan español: para texto en español (opts.lang === 'es') se cambia al multilingüe que la app ya usa por defecto.
  const _EL_EN_ONLY = ['eleven_monolingual_v1', 'eleven_turbo_v2'];
  function _elModelFor(lang) {
    const m = localStorage.getItem('jarvis_el_model') || 'eleven_flash_v2_5';
    return lang === 'es' && _EL_EN_ONLY.indexOf(m) >= 0 ? 'eleven_flash_v2_5' : m;
  }
  async function speakElevenLabs(text, lang) {
    // Modelo TTS: Flash v2.5 por defecto (más barato/rápido); override posible vía localStorage.
    const elModel = _elModelFor(lang);
    const c = await _openCache();
    // Fast path: la frase COMPLETA ya sonó antes tal cual → 1 sola lectura de cache, sin split ni
    // llamadas extra (cubre las líneas fijas/canned que se repiten exactas).
    const fullKey = _ttsCacheKey(text, elModel);
    const fullHit = await _lookup(text, fullKey, elModel, c);
    if (fullHit) return _playSequence([fullHit]);

    // Miss de la frase completa: partimos en oraciones para capturar hits PARCIALES — las
    // respuestas del LLM nunca son idénticas palabra por palabra, pero sí repiten fragmentos
    // ("Marked complete, sir.", "Understood, sir.") que la cache de frase completa no aprovechaba.
    const sentences = _splitSentences(text);
    if (sentences.length <= 1) {
      // No se pudo partir (o ya es 1 sola oración): mismo camino de siempre, sin overhead extra.
      // _lookup ya falló arriba con esta MISMA clave: sintetizar directo, sin releer las caches.
      const blob = await _synthAndUpload(text, fullKey, elModel, c);
      return _playSequence([blob]);
    }

    // 2+ oraciones: sintetizar TODAS las que falten ANTES de reproducir nada (loop secuencial,
    // no Promise.all, para no disparar N requests en paralelo). Si una falla, el error sube
    // intacto hasta speak(), que hace el fallback a voz del navegador con el texto COMPLETO —
    // así nunca queda audio a medias sin ese fallback.
    const blobs = [];
    for (const s of sentences) {
      const sKey = _ttsCacheKey(s, elModel);
      blobs.push(await _getOrSynth(s, sKey, elModel, c));
    }
    // No se cachea la frase completa acá: concatenar blobs MP3 independientes de ElevenLabs
    // (cada uno con sus propios headers/frames) es riesgoso — puede sonar con glitches o no
    // reproducir en algunos navegadores. No hace falta: la próxima vez que aparezca este mismo
    // texto, las 3 oraciones ya están cacheadas individualmente → 0 llamadas a la API igual,
    // solo que pasa de nuevo por el camino de 2+ oraciones en vez del fast-path de frase completa.
    return _playSequence(blobs);
  }

  // ── Voz en inglés (preferencia) ──
  // JARVIS HABLA siempre en inglés (voz nativa George); lo que se ve en pantalla sigue en español.
  // Preferencia por dispositivo, activada por defecto: localStorage 'jarvis_voice_en' === '0' la apaga
  // (vuelve al comportamiento anterior: lee el texto tal cual, con lang 'es' si el llamador lo pide).
  const VOICE_EN_KEY = 'jarvis_voice_en';
  function _voiceEN() { try { return localStorage.getItem(VOICE_EN_KEY) !== '0'; } catch (e) { return true; } }
  // Respaldo cuando hay que hablar algo que solo existe en español: NUNCA se lee el español con la voz inglesa.
  const GENERIC_EN = "Sir, I've put the details on screen.";

  // ¿Este texto es español? Heurística barata (sin LLM): signos ¿¡ ñ, o proporción de palabras funcionales
  // del español que no existen en inglés. Un nombre propio suelto dentro de una frase inglesa larga NO la dispara.
  const _ES_WORDS = new Set(['de','del','la','las','los','el','que','por','con','para','una','un','y','en','es','al','lo','se','su','sus','mi','mis','pero','como','más','mas','muy','ya','hoy','tu','tus','sin','está','esta','están','fue','hay','tenés','tenes','tiene','tienen','te','nos','este','estos','estas','también','porque','cuando','donde','sobre','entre','hasta','desde','todo','todos','cada','mañana','ayer','semana','principio','principios']);
  function _looksSpanish(text) {
    const t = String(text || '');
    if (/[¿¡ñÑ]/.test(t)) return true;
    const words = t.toLowerCase().match(/[a-záéíóúüñ]+/g) || [];
    if (!words.length) return false;
    let hits = 0;
    for (const w of words) if (_ES_WORDS.has(w)) hits++;
    const ratio = hits / words.length;
    const accents = (t.match(/[áéíóúü]/gi) || []).length;
    return hits >= 3 || (hits >= 1 && ratio >= 0.18) || (accents >= 1 && hits >= 1 && ratio >= 0.1);
  }

  // Separa la respuesta bilingüe del LLM (UN solo llamado): "reply" = español para pantalla, "say_en" = inglés para la voz.
  // Si falta la versión en inglés → en '' (el llamador habla el respaldo genérico, nunca el español).
  function _parseBilingual(obj) {
    const o = obj && typeof obj === 'object' ? obj : {};
    const s = v => (typeof v === 'string' ? v : '').trim();
    return { es: s(o.reply) || s(o.say_es) || s(o.say), en: s(o.say_en) || s(o.reply_en) };
  }

  // Preprocesador TTS (D): lo que JARVIS dice sale del formato es-AR de la app a algo que la voz inglesa
  // lee bien. Puro (solo regex, sin DOM): se testea en Node. `now` solo decide si una fecha lleva año.
  const _MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function _ord(n) { const v = n % 100; return (v >= 11 && v <= 13) ? n + 'th' : n + (['th','st','nd','rd'][n % 10] || 'th'); }
  function _parseNum(s) {
    s = String(s).trim();
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.'));   // es-AR: 1.234.567,89
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return parseFloat(s.replace(/,/g, ''));                       // en-US: 1,234,567.89
    if (/^\d+,\d+$/.test(s)) return parseFloat(s.replace(',', '.'));                                         // decimal con coma: 45,5
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    return NaN;
  }
  function _scaled(n, d, word) { const v = n / d, r = Math.round(v * 10) / 10; return (Math.abs(v - r) < 1e-6 ? '' : 'about ') + r + ' ' + word; }
  // Montos largos se dicen en palabras ("about 7.9 million"); el resto, con comas (la voz los lee bien).
  function _fmtBig(n) {
    const a = Math.abs(n);
    if (a >= 1e9) return _scaled(n, 1e9, 'billion');
    if (a >= 1e6) return _scaled(n, 1e6, 'million');
    if (a >= 1000) return Math.round(n).toLocaleString('en-US');
    return String(Math.round(n * 100) / 100);
  }
  const _SIGLAS = { IOL: 'I O L', FCI: 'F C I', CCL: 'C C L', MEP: 'M E P', BCRA: 'B C R A', CEDEAR: 'Sedear', CEDEARS: 'Sedears', ARS: 'Argentine pesos', USD: 'US dollars', EUR: 'euros' };
  function _prepEN(text, now) {
    if (!text) return '';
    now = now || new Date();
    let o = String(text);
    // emojis y modificadores
    o = o.replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{1F1E6}-\u{1F1FF}\u200d\ufe0f\u20e3]/gu, '');
    // markdown: enlaces, títulos, viñetas, énfasis, saltos de línea
    o = o.replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1');
    o = o.replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s*(?:[-*+•·●▪◦]\s+)/gm, '');
    const lines = o.split(/\n+/).map(l => l.trim()).filter(Boolean);
    o = lines.map((l, i) => (i < lines.length - 1 && !/[.!?:;,…]$/.test(l)) ? l + '.' : l).join(' ');
    // URLs → "a link"
    o = o.replace(/\b(?:https?:\/\/|www\.)[^\s)]+/gi, 'a link').replace(/\b[a-z0-9-]+\.(?:com|org|net|io|app|dev|ar)(?:\/[^\s)]*)?(?=[\s.,;:!?)]|$)/g, 'a link');
    o = o.replace(/\*\*|__|~~|`+/g, '').replace(/\*/g, '').replace(/(?<!\w)_|_(?!\w)/g, '');
    // fechas: 2026-11-24 y 24/11/2026 → "November 24th" (con año si no es el actual)
    const dateOut = (d, m, y) => {
      if (m < 1 || m > 12 || d < 1 || d > 31) return null;
      return _MONTHS[m - 1] + ' ' + _ord(d) + (y && y !== now.getFullYear() ? ', ' + y : '');
    };
    o = o.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, y, mo, d) => dateOut(+d, +mo, +y) || m);
    o = o.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g, (m, d, mo, y) => dateOut(+d, +mo, y.length === 2 ? 2000 + +y : +y) || m);
    // horas: 14:30 → 2:30 PM
    o = o.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s?[AaPp]\.?[Mm])/g, (m, h, mi) => {
      const hh = +h, h12 = hh % 12 === 0 ? 12 : hh % 12;
      return h12 + (mi === '00' ? '' : ':' + mi) + (hh < 12 ? ' AM' : ' PM');
    });
    // montos: $1.234,56 · US$ 1.500 · USD 1.500 · 1.500 USD
    const unitOf = c => { c = c.toUpperCase(); return /^(US\$|U\$S|USD)$/.test(c) ? 'dollars' : /^(€|EUR)$/.test(c) ? 'euros' : 'pesos'; };
    const money = (num, unit) => { const n = _parseNum(num); if (isNaN(n)) return null; return _fmtBig(n) + ' ' + (n === 1 ? unit.replace(/s$/, '') : unit); };
    o = o.replace(/(US\$|U\$S|USD|ARS|EUR|€|\$)\s?(\d[\d.,]*\d|\d)/gi, (m, c, num) => money(num, unitOf(c)) || m);
    o = o.replace(/(\d[\d.,]*\d|\d)\s?(USD|ARS|EUR)\b/g, (m, num, c) => money(num, unitOf(c)) || m);
    // porcentajes: +12,5% → "plus 12.5 percent"
    o = o.replace(/([+\-−]?)(\d[\d.,]*\d|\d)\s?%/g, (m, sg, num) => {
      const n = _parseNum(num); const v = isNaN(n) ? num : String(Math.round(n * 100) / 100);
      return (sg === '+' ? 'plus ' : sg ? 'minus ' : '') + v + ' percent';
    });
    // duraciones: 3h · 25 min
    o = o.replace(/\b(\d+(?:[.,]\d+)?)\s?(?:h|hs|hr|hrs)\b/g, (m, n) => n.replace(',', '.') + (parseFloat(n.replace(',', '.')) === 1 ? ' hour' : ' hours'));
    o = o.replace(/\b(\d+)\s?(?:min|mins)\b\.?/g, (m, n) => n + (n === '1' ? ' minute' : ' minutes'));
    // siglas de la app
    o = o.replace(/\bS&P\b/g, 'S and P').replace(/\b(IOL|FCI|CCL|MEP|BCRA|CEDEARs?|ARS|USD|EUR)\b/g, (m, k) => _SIGLAS[k.toUpperCase()] || m);
    // números es-AR sueltos y fracciones tipo hecho/total
    o = o.replace(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b/g, m => { const n = _parseNum(m); return isNaN(n) ? m : _fmtBig(n); });
    o = o.replace(/\b(\d+),(\d{1,2})\b(?!\d)/g, '$1.$2');
    // d/m sin año con día 13-31 y mes 1-12 es claramente una fecha (30/11 → November 30th); lo demás, hecho/total (3/5 → 3 of 5)
    o = o.replace(/\b(\d+)\/(\d+)\b/g, (m, a, b) => { const d = +a, mo = +b; return (d >= 13 && d <= 31 && mo >= 1 && mo <= 12) ? _MONTHS[mo - 1] + ' ' + _ord(d) : a + ' of ' + b; });
    // abreviaturas y símbolos
    o = o.replace(/\bvs\.?(?=\s)/gi, 'versus').replace(/\bapprox\./gi, 'approximately').replace(/\be\.g\./gi, 'for example').replace(/\bi\.e\./gi, 'that is');
    o = o.replace(/[→⇒➜➡▶|]/g, ', ').replace(/[≈~]\s?/g, 'about ').replace(/&/g, ' and ').replace(/°/g, ' degrees').replace(/×/g, ' times ').replace(/[•·●▪◦★☆✓✔✗✘]/g, ' ');
    // limpieza final
    o = o.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/(?:,\s*){2,}/g, ', ').replace(/^[,.;\s]+/, '').trim();
    return o;
  }
  // Legacy (preferencia apagada + texto en español): solo normaliza números es-AR a coma decimal / "por ciento".
  function _prepESLegacy(text) {
    let out = text;
    function plain(numStr) {
      if (numStr.indexOf(',') !== -1) { const p = numStr.split(','); return p[0].replace(/\./g, '') + ',' + p[1]; }
      return numStr.replace(/\./g, '');
    }
    out = out.replace(/\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)/g, (m, num) => plain(num) + ' pesos');
    out = out.replace(/(\d+(?:,\d+)?)\s?%/g, (m, num) => num + ' por ciento');
    out = out.replace(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b/g, m => plain(m));
    return out;
  }
  function _ttsPrep(text, lang) {
    if (!text) return text;
    return lang === 'es' ? _prepESLegacy(text) : _prepEN(text);
  }
  // Qué texto y en qué idioma se pronuncia. Con la preferencia activa SIEMPRE es inglés: `opts.en` es la versión
  // inglesa explícita ('' = "no hay"); sin `opts.en` el texto se asume inglés. Si lo que iba a sonar parece español
  // (o no hay nada), se habla el respaldo genérico — jamás español con la voz inglesa.
  function _resolveVoice(text, opts) {
    if (!_voiceEN()) return { text, lang: opts && opts.lang === 'es' ? 'es' : 'en' };
    let t = (opts && typeof opts.en === 'string') ? opts.en : text;
    t = String(t || '').trim();
    if (!t || _looksSpanish(t)) t = GENERIC_EN;
    return { text: t, lang: 'en' };
  }

  // Fallback de voz del navegador: se usa SOLO cuando ElevenLabs falla (sin key es aparte, ver
  // _elHint), para que una key vencida/rate-limit no deje a JARVIS mudo. Nunca reemplaza a
  // ElevenLabs como voz primaria (issues históricos de speechSynthesis trabado — ver fixes.json);
  // es puramente el "no te quedes sin hablar" ante un error puntual de la API.
  // Voz del navegador para inglés: en-GB si existe, si no cualquier en-*; sin voces cargadas, en-GB igual.
  function _pickEnVoice() {
    try { const vs = speechSynthesis.getVoices() || []; return vs.find(v => /^en[-_]GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null; } catch (e) { return null; }
  }
  function _speakBrowser(text, lang) {
    try {
      if (!window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(text);
      if (lang === 'es') u.lang = 'es-AR';
      else { const v = _pickEnVoice(); u.lang = v ? v.lang : 'en-GB'; if (v) { try { u.voice = v; } catch (e) {} } }
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
    if (!enabled || (!text && !(opts && opts.en))) return;
    _speakAt = Date.now();
    const voiced = _resolveVoice(text, opts);   // inglés siempre (o respaldo genérico); ver _resolveVoice
    const lang = voiced.lang;
    let prepped = _ttsPrep(voiced.text, lang);
    // Tope duro en respuestas dinámicas: el prompt de Gemini ya pide "max 2 sentences" pero un
    // LLM puede ignorarlo — sin este corte una respuesta larga se comería la cuota de ElevenLabs.
    // No aplica a texto no-dinámico (líneas fijas, ya son cortas por diseño).
    if (opts && opts.dynamic && prepped.length > 600) {
      let cut = -1;
      for (const ch of ['.', '!', '?']) { const idx = prepped.lastIndexOf(ch, 599); if (idx > cut) cut = idx; }
      prepped = cut >= 0 ? prepped.slice(0, cut + 1) : prepped.slice(0, 600) + '…';
    }
    if (!_elKey()) { _elHint(); return; }                                  // sin key → silencio
    if (opts && opts.dynamic && !(await _elQuotaOk())) return;              // dinámica sin cuota → silencio
    try {
      await speakElevenLabs(prepped, lang);
    } catch (e) {
      console.warn('JARVIS sin voz premium (ElevenLabs), usando voz del navegador:', e.message);
      _elHandleFailure(e);
      _speakBrowser(prepped, lang);                                        // nunca queda mudo
    }
  }

  // Reproduce una respuesta armada en código como segmentos [{d:bool,t:texto}] (ver jarvis-brain.js
  // _buildSegments): cada segmento se cachea/sintetiza por separado con las mismas piezas de
  // speakElevenLabs (misma _ttsCacheKey, _cacheGet, _synthAndCache) y se reproduce con la cola
  // secuencial existente (_playSequence) — NUNCA se concatenan blobs MP3 crudos. Así la parte
  // estática de la plantilla (intro, nombres, cierre) queda cacheada para siempre y solo el
  // valor dinámico (el número) se sintetiza de nuevo cuando cambia.
  async function speakSegments(segments) {
    if (!enabled || !segments || !segments.length) return;
    if (!_elKey()) { _elHint(); return; }
    if (!(await _elQuotaOk())) return;   // se trata siempre como dinámica: trae datos en vivo
    _speakAt = Date.now();
    const elModel = localStorage.getItem('jarvis_el_model') || 'eleven_flash_v2_5';
    const parts = segments.map(seg => _prepEN(seg.t)).filter(t => t);   // mismo preprocesador que speak()
    const joined = parts.join(' ');
    try {
      const c = await _openCache();
      const blobs = [];
      for (const t of parts) {
        const key = _ttsCacheKey(t, elModel);
        blobs.push(await _getOrSynth(t, key, elModel, c));
      }
      return _playSequence(blobs);
    } catch (e) {
      console.warn('JARVIS sin voz premium (ElevenLabs) en speakSegments, usando voz del navegador:', e.message);
      _elHandleFailure(e);
      _speakBrowser(joined, 'en');   // nunca queda mudo
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
    _playGen++;   // invalida la cola de oraciones en curso: el loop de _playSequence corta TODO lo pendiente
    try { speechSynthesis.cancel(); } catch(e) {}
    if (currentAudio) { try { currentAudio.pause(); } catch(e) {} }
    _lastSpeakEnd = Date.now();
  }

  function greeting() {
    const h = new Date().getHours();
    const lines = (h >= 6 || (h >= 5 && typeof cmDiaArrancado === 'function' && cmDiaArrancado())) && h < 12
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

  function toggleVoiceEN() {
    localStorage.setItem(VOICE_EN_KEY, _voiceEN() ? '0' : '1');
    _updateBtn();
  }

  function _updateBtn() {
    const vb = document.getElementById('jarvis-voice-en-btn');
    if (vb) {
      const on = _voiceEN();
      vb.textContent = on ? '🗣️ Voz en inglés: activada' : '🗣️ Voz en inglés: apagada';
      vb.style.color = on ? 'rgba(0,255,136,0.75)' : 'rgba(255,255,255,0.28)';
    }
    const b = document.getElementById('jarvis-toggle-btn');
    if (!b) return;
    b.textContent = enabled ? '🔊 JARVIS activo' : '🔇 JARVIS silenciado';
    b.style.color = enabled ? 'rgba(0,255,136,0.75)' : 'rgba(255,255,255,0.28)';
    b.style.borderColor = enabled ? 'rgba(0,255,136,0.25)' : 'rgba(255,255,255,0.08)';
  }
  setTimeout(_updateBtn, 400);

  function getUsageStats() {
    return {
      charsUsedTotal: parseInt(localStorage.getItem(CHARS_KEY) || '0', 10) || 0,
      quotaOk: _elQuota.ok,
      lastChecked: _elQuota.checked,
      tokensInTotal: parseInt(localStorage.getItem(TOK_IN_KEY) || '0', 10) || 0,
      tokensOutTotal: parseInt(localStorage.getItem(TOK_OUT_KEY) || '0', 10) || 0,
      estCostUSD: parseFloat(localStorage.getItem(COST_KEY) || '0') || 0
    };
  }

  window.JARVIS = { speak, speakSegments, toggleVoiceEN, voiceEN: _voiceEN, prepSpeech: _prepEN, looksSpanish: _looksSpanish, parseBilingual: _parseBilingual, GENERIC_EN, greeting, onNewProject, onTaskDone, onPrioritySet, onDeleteProject, onThemeChange, checkOverdue, toggle, isSpeaking, recentlySpoke, stopSpeaking, checkVoiceQuota: _elQuotaCheckProactive, isNight: _isNightTime, getUsageStats, addApiUsage };
})();
