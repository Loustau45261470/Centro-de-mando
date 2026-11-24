// JARVIS habla SIEMPRE en inglés (voz nativa George); la pantalla sigue en español.
// Sin red real: ElevenLabs y el LLM (Groq) se interceptan con page.route, y speechSynthesis se mockea.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('./support/fixtures');

// ── Node: jarvis-voice.js cargado en un contexto vm con stubs mínimos (es un IIFE que cuelga de window) ──
function cargarVoz() {
  const store = {};
  const win = {};
  const ctx = {
    window: win, console, Date, TextEncoder, setTimeout: () => 0, navigator: {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    document: { getElementById: () => null },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'jarvis-voice.js'), 'utf8'), ctx);
  return win.JARVIS;
}

test.describe('puras (Node)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });
  const NOW = new Date(2026, 10, 24);

  test('preprocesador: montos es-AR, %, fechas, horas, siglas, emojis, markdown y URLs', () => {
    const P = (t) => cargarVoz().prepSpeech(t, NOW);
    // montos: largos en palabras, medianos con comas, singular
    expect(P('Tenés $7.881.408 en total')).toBe('Tenés about 7.9 million pesos en total');
    expect(P('$7.000.000')).toBe('7 million pesos');
    expect(P('$150.000')).toBe('150,000 pesos');
    expect(P('$1.234,56')).toBe('1,235 pesos');
    expect(P('$12,5')).toBe('12.5 pesos');
    expect(P('$1')).toBe('1 peso');
    expect(P('US$ 1.500')).toBe('1,500 dollars');
    expect(P('2.000 USD')).toBe('2,000 dollars');
    expect(P('$2.500.000.000')).toBe('2.5 billion pesos');
    // porcentajes
    expect(P('Gasto +12,5% vs 45,5 %')).toBe('Gasto plus 12.5 percent versus 45.5 percent');
    expect(P('bajó -3%')).toBe('bajó minus 3 percent');
    // fechas y horas
    expect(P('Vence 2026-11-30')).toBe('Vence November 30th');
    expect(P('Vence 05/12/2027')).toBe('Vence December 5th, 2027');
    expect(P('a las 14:30 y 09:00')).toBe('a las 2:30 PM y 9 AM');
    // duraciones y fracciones
    expect(P('3/5 metas, 25 min, 3h')).toBe('3 of 5 metas, 25 minutes, 3 hours');
    // siglas
    expect(P('IOL, FCI, CCL y CEDEARs en ARS')).toBe('I O L, F C I, C C L y Sedears en Argentine pesos');
    expect(P('S&P 500')).toBe('S and P 500');
    // emojis, markdown, URLs
    expect(P('**Listo** ✅ 🔥 ver [esto](http://y.z) en https://x.com/a?b=1')).toBe('Listo ver esto en a link');
    expect(P('- uno\n- dos\n# Título')).toBe('uno. dos. Título');
    // texto inglés normal queda igual; vacío → ''
    expect(P('Sir, you have 2 goals left for today.')).toBe('Sir, you have 2 goals left for today.');
    expect(P('')).toBe('');
    // montos en inglés con comas (plantillas de brain) no se tocan
    expect(P('1,234,567')).toBe('1,234,567');
    expect(P('ARS')).toBe('Argentine pesos');
    expect(P('Galicia: 1,234,567 ARS.')).toBe('Galicia: about 1.2 million pesos.');
  });

  test('detector de español: marca español, deja pasar inglés (incl. nombres propios sueltos)', () => {
    const J = cargarVoz();
    for (const es of ['Principio de hoy: esperar antes de comprar', 'Reunión con el cliente', 'Tenés 3 metas pendientes para hoy', '¿Todo bien?', 'Hola, mañana tengo examen', 'Claude finished, sir. In short: Hice los cambios que pediste en el archivo.']) expect(J.looksSpanish(es), es).toBe(true);
    for (const en of ['Good morning, sir. All systems are online.', 'Sir, you have 3 overdue items. Might want to take a look.', 'Project "Buy milk" created in Life, sir.', "Sir, I've put the details on screen.", 'Switching to Finance, sir.', "That's a lot, sir — saving what we have."]) expect(J.looksSpanish(en), en).toBe(false);
  });

  test('respuesta bilingüe del LLM: reply (español, pantalla) + say_en (inglés, voz) en un solo objeto', () => {
    const J = cargarVoz();
    expect(J.parseBilingual({ action: 'none', reply: ' Tenés 3 metas. ', say_en: ' You have 3 goals, sir. ' })).toEqual({ es: 'Tenés 3 metas.', en: 'You have 3 goals, sir.' });
    expect(J.parseBilingual({ reply: 'Hecho.' })).toEqual({ es: 'Hecho.', en: '' });     // sin versión inglesa → en vacío → respaldo
    expect(J.parseBilingual({ say_en: 'Done, sir.' })).toEqual({ es: '', en: 'Done, sir.' });
    expect(J.parseBilingual(null)).toEqual({ es: '', en: '' });
    expect(J.parseBilingual({ reply: 42, say_en: {} })).toEqual({ es: '', en: '' });
  });
});

// ── Navegador ──
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

// ElevenLabs mockeado: guarda cada texto enviado a TTS. Con `fallar` responde 500 (→ voz del navegador).
async function prepararTTS(page, { fallar = false } = {}) {
  const textos = [];
  await page.route('https://api.elevenlabs.io/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (/\/user\/subscription/.test(req.url())) return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ character_limit: 100000, character_count: 0 }) });
    const b = JSON.parse(req.postData() || '{}');
    textos.push(b.text);
    if (fallar) return route.fulfill({ status: 500, headers: CORS, body: 'err' });
    return route.fulfill({ status: 200, contentType: 'audio/mpeg', headers: CORS, body: 'x' });
  });
  await page.evaluate(async () => {
    await caches.delete('jarvis-tts-v1');
    localStorage.setItem('jarvis_el_key', 'test');
    if (localStorage.getItem('jarvis_enabled') !== '1') JARVIS.toggle();   // dice «Voice systems online» → se descarta abajo
    window.__utt = [];
    speechSynthesis.speak = (u) => window.__utt.push({ lang: u.lang, text: u.text });
  });
  await expect.poll(() => textos.length, { timeout: 8000 }).toBeGreaterThan(0);
  if (fallar) await expect.poll(() => page.evaluate(() => window.__utt.length), { timeout: 8000 }).toBeGreaterThan(0);
  await page.evaluate(() => { window.__utt = []; });
  textos.length = 0;
  return textos;
}
// Espera a que dejen de llegar pedidos a TTS (una frase de varias oraciones hace varios).
const estable = async (textos) => {
  let n = -1;
  await expect.poll(async () => { const ok = textos.length === n; n = textos.length; await new Promise((r) => setTimeout(r, 400)); return ok && n > 0; }, { timeout: 10000 }).toBe(true);
};
const sinEs = (textos) => textos.every((t) => !/[¿¡ñáéíóú]|\b(tenés|hoy|principio|metas|pendientes)\b/i.test(t));
const prin = (o) => Object.assign({ id: 'p1', tipo: 'principio', enunciado: 'Lo más difícil primero', porque: 'La energía es más alta temprano', seccion: 'Vida', haz: '', noHagas: '', fuente: '', habitosIds: [] }, o);
const poner = (page, ps) => page.evaluate((ps) => {
  S.principios = { principios: ps, categorias: [], objetivos: [], extras: {}, sembrado: true };
  S.foco = { dias: {}, pantalla: {}, chequeos: [], config: { horas: [] } };
}, ps);

test.describe('JARVIS habla en inglés', () => {
  test('el saludo y el aviso de un principio mandan a TTS solo inglés; la pantalla queda en español', async ({ cmPage, consoleErrors }) => {
    await poner(cmPage, [prin({ id: 'a' })]);
    const textos = await prepararTTS(cmPage);
    await cmPage.evaluate(() => JARVIS.greeting());
    await estable(textos);                                                   // el saludo tiene varias oraciones → varios pedidos
    expect(textos.join(' ')).toMatch(/\bsir\b/i);
    textos.length = 0;
    await cmPage.evaluate(() => { const dd = Principios.delDia(); Principios.mostrarDelDia(dd); Principios.decirDelDia(dd); });
    await expect.poll(() => textos.length, { timeout: 8000 }).toBe(1);
    expect(textos[0]).toBe('Sir, a reminder of your principle for today.');
    expect(sinEs(textos)).toBe(true);
    expect(textos.join(' ')).not.toContain('difícil');                       // el texto exacto del principio NO se lee ni se traduce
    await expect(cmPage.locator('#pr-dia')).toContainText('Lo más difícil primero');   // …queda en pantalla, en español
    expect(consoleErrors).toEqual([]);
  });

  test('briefing de la mañana: toast en español; la voz saluda en inglés y, sin traductor, usa el respaldo para el briefing', async ({ cmPage, consoleErrors }) => {
    await poner(cmPage, [prin({ id: 'a' })]);
    await cmPage.clock.setFixedTime(new Date(2026, 10, 24, 9, 0));
    const textos = await prepararTTS(cmPage);
    await cmPage.evaluate(() => { localStorage.removeItem('jarvis_last_briefing'); localStorage.removeItem('jarvis_gemini_key'); JARVIS_INTEL.maybeMorningBriefing(); });
    await expect(cmPage.locator('#toast')).toContainText('Buenos días, señor.');
    await expect.poll(() => textos.length, { timeout: 8000 }).toBeGreaterThan(0);
    expect(textos[0]).toMatch(/^Good morning, sir\./);
    expect(sinEs(textos)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('respuesta de chat de voz: un solo llamado al LLM, la voz recibe say_en y la pantalla el español', async ({ cmPage, consoleErrors }) => {
    const textos = await prepararTTS(cmPage);
    const llm = [];
    let respuesta = { action: 'none', args: {}, reply: 'Tenés 3 metas pendientes para hoy.', say_en: 'You have 3 goals pending today, sir.' };
    await cmPage.route('https://api.groq.com/**', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      llm.push(JSON.parse(req.postData()));
      await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(respuesta) } }] }) });
    });
    await cmPage.evaluate(() => localStorage.setItem('jarvis_gemini_key', 'gsk_test'));
    await cmPage.evaluate(() => JARVIS_EARS.handleCommand('como ando de energia esta semana'));
    await expect.poll(() => textos.length, { timeout: 8000 }).toBe(1);
    expect(textos[0]).toBe('You have 3 goals pending today, sir.');
    expect(llm).toHaveLength(1);                                                // ambas versiones en el MISMO llamado
    expect(llm[0].messages[0].content).toContain('say_en');
    await expect(cmPage.locator('#toast')).toContainText('Tenés 3 metas pendientes para hoy.');

    // el modelo se olvida de say_en → respaldo genérico, JAMÁS el español con la voz inglesa
    respuesta = { action: 'none', args: {}, reply: 'Tenés 2 hábitos pendientes.' };
    await cmPage.evaluate(() => JARVIS_EARS.handleCommand('contame algo de mis finanzas'));
    await expect.poll(() => textos.length, { timeout: 8000 }).toBe(2);
    expect(textos[1]).toBe("Sir, I've put the details on screen.");
    expect(sinEs(textos)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('texto en español sin versión inglesa → respaldo genérico; el inglés pasa por el preprocesador', async ({ cmPage, consoleErrors }) => {
    const textos = await prepararTTS(cmPage);
    // cada texto en español, por separado y con la caché vaciada: tiene que salir el respaldo (no el español)
    const casos = [['Tenés tres tareas pendientes para hoy', { dynamic: true }], ['No tenés principios para recordar hoy.', { lang: 'es' }], ['Hola, mañana tengo examen de derecho', { en: '' }]];
    for (const [t, o] of casos) {
      await cmPage.evaluate(() => caches.delete('jarvis-tts-v1'));
      const n = textos.length;
      await cmPage.evaluate(([t, o]) => JARVIS.speak(t, o), [t, o]);
      // (la caché compartida mockeada puede responder sin pedir TTS: la prueba es qué clave queda en la caché local)
      await expect.poll(() => cmPage.evaluate(async () => (await (await caches.open('jarvis-tts-v1')).keys()).map((r) => decodeURIComponent(r.url).split('/').pop())), { timeout: 8000 }).toEqual(["Sir, I've put the details on screen."]);
      if (textos.length > n) expect(textos[n]).toBe("Sir, I've put the details on screen.");
    }
    await cmPage.evaluate(() => JARVIS.speak('You have $7.881.408 in IOL, up +12,5%, sir.'));
    await expect.poll(() => textos.filter((x) => /million/.test(x)).length, { timeout: 8000 }).toBe(1);
    expect(textos[textos.length - 1]).toBe('You have about 7.9 million pesos in I O L, up plus 12.5 percent, sir.');
    // la clave de caché lleva el texto final: ningún audio viejo en español puede coincidir
    const claves = await cmPage.evaluate(async () => (await (await caches.open('jarvis-tts-v1')).keys()).map((r) => decodeURIComponent(r.url)));
    expect(claves.some((k) => /tenés|Tenés|mañana/i.test(k))).toBe(false);
    expect(consoleErrors).toEqual([]);
  });

  test('respaldo del navegador: habla en en-* (en-GB si existe), incluso para texto en español', async ({ cmPage, consoleErrors }) => {
    const textos = await prepararTTS(cmPage, { fallar: true });
    await cmPage.evaluate(() => { speechSynthesis.getVoices = () => []; });
    await cmPage.evaluate(() => JARVIS.speak('Understood, sir.'));
    await expect.poll(() => cmPage.evaluate(() => window.__utt.length), { timeout: 8000 }).toBe(1);
    await cmPage.evaluate(() => JARVIS.speak('Tenés tres tareas pendientes para hoy', { lang: 'es', dynamic: true }));
    await expect.poll(() => cmPage.evaluate(() => window.__utt.length), { timeout: 8000 }).toBe(2);
    // con voces instaladas: prefiere en-GB; si solo hay en-US usa esa; nunca es-*
    await cmPage.evaluate(() => { speechSynthesis.getVoices = () => [{ lang: 'es-AR' }, { lang: 'en-US' }, { lang: 'en-GB' }]; });
    await cmPage.evaluate(() => JARVIS.speak('Another line, sir.'));
    await expect.poll(() => cmPage.evaluate(() => window.__utt.length), { timeout: 8000 }).toBe(3);
    await cmPage.evaluate(() => { speechSynthesis.getVoices = () => [{ lang: 'es-AR' }, { lang: 'en-US' }]; });
    await cmPage.evaluate(() => JARVIS.speak('And one more, sir.'));
    await expect.poll(() => cmPage.evaluate(() => window.__utt.length), { timeout: 8000 }).toBe(4);
    const utt = await cmPage.evaluate(() => window.__utt);
    expect(utt.map((u) => u.lang)).toEqual(['en-GB', 'en-GB', 'en-GB', 'en-US']);
    expect(utt[1].text).toBe("Sir, I've put the details on screen.");
    expect(textos.length).toBeGreaterThan(0);
    // (los 500 simulados de ElevenLabs aparecen en la consola como «Failed to load resource»: se descartan a propósito)
    expect(consoleErrors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });

  test('preferencia «Voz en inglés»: activada por defecto, botón en el panel y se puede apagar', async ({ cmPage, consoleErrors }) => {
    expect(await cmPage.evaluate(() => JARVIS.voiceEN())).toBe(true);
    const btn = cmPage.locator('#jarvis-voice-en-btn');
    await expect(btn).toHaveText('🗣️ Voz en inglés: activada');
    await cmPage.evaluate(() => JARVIS.toggleVoiceEN());
    expect(await cmPage.evaluate(() => localStorage.getItem('jarvis_voice_en'))).toBe('0');
    await expect(btn).toHaveText('🗣️ Voz en inglés: apagada');
    await cmPage.evaluate(() => JARVIS.toggleVoiceEN());
    expect(await cmPage.evaluate(() => JARVIS.voiceEN())).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
});
