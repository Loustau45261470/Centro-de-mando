// T6: Jarvis habla y recuerda los principios, sugiere cosas y da opciones. Sin red: Jarvis.speak se mockea (jamás ElevenLabs/LLM reales).
'use strict';
const { test, expect } = require('./support/fixtures');
const P = require('../principios.js');

const HOY = '2026-11-12';
const prin = (o) => Object.assign({ id: 'p1', tipo: 'principio', enunciado: 'Lo más difícil primero', porque: 'La energía es más alta temprano', seccion: 'Vida', haz: '', noHagas: '', fuente: '', habitosIds: [] }, o);

test.describe('puras (Node)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });

  test('prPrincipioDelDia: prioridad aviso por datos > diario > rotación; excluye silenciados; vacío → null', () => {
    const a = prin({ id: 'a' }), b = prin({ id: 'b', tipo: 'anti', enunciado: 'No gastar de más' }), c = prin({ id: 'c', enunciado: 'C' });
    const lista = [c, a, b];
    // 1) datos gana a diario
    const r1 = P.prPrincipioDelDia(lista, { diarios: [a], datos: [{ p: b, detalle: 'Llevás 2 días sin cumplir «X»' }] }, HOY);
    expect(r1.p.id).toBe('b'); expect(r1.aviso).toEqual({ tipo: 'datos', detalle: 'Llevás 2 días sin cumplir «X»' });
    // 2) diario si no hay datos
    const r2 = P.prPrincipioDelDia(lista, { diarios: [c], datos: [] }, HOY);
    expect(r2.p.id).toBe('c'); expect(r2.aviso).toEqual({ tipo: 'diario' });
    // 3) rotación determinística por fecha (ordenada por id, independiente del orden de la lista)
    const rot = (d, l) => P.prPrincipioDelDia(l || lista, { diarios: [], datos: [] }, d).p.id;
    expect(P.prPrincipioDelDia(lista, null, HOY).aviso).toBeNull();
    expect(rot(HOY)).toBe(rot(HOY, [a, b, c]));
    const vistos = new Set(['2026-11-12', '2026-11-13', '2026-11-14'].map((d) => rot(d)));
    expect(vistos.size).toBe(3);                                      // tres días seguidos → tres principios distintos (el 'anti' también rota)
    expect(rot('2026-11-15')).toBe(rot('2026-11-12'));                // ciclo de 3
    // 4) silenciados fuera de la rotación (por fecha y por tiempo corto)
    const sil = [Object.assign({}, a, { silenciadoHasta: '2026-11-20' }), Object.assign({}, b, { silenciadoHastaTs: 2e12 }), c];
    expect(P.prPrincipioDelDia(sil, { diarios: [], datos: [] }, HOY, 1e12).p.id).toBe('c');
    expect(P.prPrincipioDelDia([sil[0]], { diarios: [], datos: [] }, HOY, 1e12)).toBeNull();
    // 5) vacío / datos inválidos
    expect(P.prPrincipioDelDia([], { diarios: [], datos: [] }, HOY)).toBeNull();
    expect(P.prPrincipioDelDia(null, null, HOY)).toBeNull();
    expect(P.prPrincipioDelDia([prin({ id: 'z', tipo: 'otro' }), prin({ id: 'y', enunciado: '  ' })], null, HOY)).toBeNull();
  });

  test('prSugerencias: con haz, con hábito sin registro, sin nada', () => {
    const ctx = { hoy: HOY, habitTrackers: { salud: [{ id: 'h1', name: 'Leer 20 min', days: {} }, { id: 'h2', name: 'Correr', days: { [HOY]: 'done' } }] } };
    const ids = (l) => l.map((x) => x.id);
    const conHaz = P.prSugerencias(prin({ haz: 'Escribir el informe antes de mirar el celular' }), null, ctx);
    expect(ids(conHaz)).toEqual(['agendar', 'posponer', 'ver']);
    expect(conHaz[0].label).toMatch(/^Agendar 30 min ahora: Escribir el informe/); expect(conHaz[0].label.length).toBeLessThan(75);
    const conHab = P.prSugerencias(prin({ habitosIds: ['salud|h1', 'salud|h2'] }), null, ctx);
    expect(ids(conHab)).toEqual(['habito', 'posponer', 'ver']);
    expect(conHab[0]).toMatchObject({ label: 'Marcar «Leer 20 min» hecho hoy', accion: { tipo: 'habito', ref: 'salud|h1' } });
    expect(ids(P.prSugerencias(prin({ habitosIds: ['salud|h2', 'salud|nada'] }), null, ctx))).toEqual(['posponer', 'ver']);   // ya hecho / borrado
    expect(P.prSugerencias(prin({}), null, ctx).map((x) => x.accion.tipo)).toEqual(['posponer', 'ver']);
    expect(ids(P.prSugerencias(prin({ haz: 'X', habitosIds: ['salud|h1'] }), null, ctx))).toEqual(['agendar', 'habito', 'posponer', 'ver']);
    expect(P.prSugerencias(null, null, ctx)).toEqual([]);
  });

  test('prTextoDelDia y prProximoBloqueLibre', () => {
    expect(P.prTextoDelDia({ p: prin({ enunciado: 'Lo más difícil primero.' }), aviso: null })).toBe('Principio de hoy: Lo más difícil primero.');
    expect(P.prTextoDelDia({ p: prin({}), aviso: { tipo: 'datos', detalle: 'Llevás 2 días sin cumplir «X»' } })).toBe('Principio de hoy: Lo más difícil primero. Llevás 2 días sin cumplir «X».');
    expect(P.prProximoBloqueLibre(14 * 60 + 10, [])).toBe(14 * 60 + 30);
    expect(P.prProximoBloqueLibre(14 * 60 + 10, [{ start: 14 * 60 + 30, end: 15 * 60 + 15 }])).toBe(15 * 60 + 30);
    expect(P.prProximoBloqueLibre(60, [])).toBe(300);                                  // antes de las 05:00 → 05:00
    expect(P.prProximoBloqueLibre(23 * 60 + 45, [])).toBeNull();                       // no entra
  });
});

// ── Navegador ──
const poner = (page, ps, extra) => page.evaluate(([ps, extra]) => {
  S.principios = { principios: ps, categorias: [], objetivos: [], extras: {}, sembrado: true };
  S.foco = { dias: {}, pantalla: {}, chequeos: [], config: { horas: [] } };
  Object.assign(S, extra || {});
  localStorage.clear();
}, [ps, extra]);
// Jarvis mockeado: registra lo que diría, sin tocar ElevenLabs ni ningún LLM.
const mockJarvis = (page) => page.evaluate(() => {
  window.__dichos = [];
  window.JARVIS = Object.assign(window.JARVIS || {}, { speak: (t, o) => { window.__dichos.push({ t, lang: o && o.lang }); return Promise.resolve(); }, isSpeaking: () => false });
  window.JARVIS_EARS_sayEN = (t) => { window.__dichos.push({ t, lang: 'en', en: true }); };
  localStorage.setItem('jarvis_enabled', '1');
});
const dichos = (page) => page.evaluate(() => window.__dichos);
const reloj = (page, h, m = 0) => page.clock.setFixedTime(new Date(2026, 10, 12, h, m));

test.describe('Jarvis y principios en el navegador', () => {
  test('saludo de la mañana: dice «Principio de hoy» en español, toast con el principio y tarjeta con opciones; una vez por día', async ({ cmPage, consoleErrors }) => {
    await poner(cmPage, [prin({ id: 'a', haz: 'Escribir antes de mirar el celular' })], { goals: {}, habitTrackers: { vida: [], finanzas: [], salud: [], conocimiento: [], ia: [] } });
    await reloj(cmPage, 9);
    await mockJarvis(cmPage);
    // briefing() de Jarvis arma líneas con insights; si no hay nada que decir, el principio igual dispara el saludo.
    await cmPage.evaluate(() => { localStorage.removeItem('jarvis_last_briefing'); window.JARVIS_INTEL.maybeMorningBriefing(); });
    await expect(cmPage.locator('#toast')).toContainText('Principio de hoy: Lo más difícil primero.');
    await expect(cmPage.locator('#toast')).toContainText('Good morning, sir.');
    await expect.poll(async () => (await dichos(cmPage)).filter((d) => d.lang === 'es').length, { timeout: 8000 }).toBe(1);
    const es = (await dichos(cmPage)).find((d) => d.lang === 'es');
    expect(es.t).toBe('Principio de hoy: Lo más difícil primero.');
    // tarjeta con opciones
    const dia = cmPage.locator('#pr-dia');
    await expect(dia).toBeVisible();
    await expect(dia.locator('.pr-av-sug')).toHaveText([/Agendar 30 min ahora: Escribir antes/, 'Posponer 1 h', 'Ver principio']);
    // una vez por día: un segundo intento no repite
    await cmPage.evaluate(() => window.JARVIS_INTEL.maybeMorningBriefing());
    await cmPage.waitForTimeout(2800);
    expect((await dichos(cmPage)).filter((d) => d.lang === 'es').length).toBe(1);
    expect(consoleErrors).toEqual([]);
  });

  test('saludo sin jarvis_enabled: no habla ni muestra nada', async ({ cmPage }) => {
    await poner(cmPage, [prin({ id: 'a' })]);
    await reloj(cmPage, 9);
    await mockJarvis(cmPage); await cmPage.evaluate(() => localStorage.setItem('jarvis_enabled', '0'));
    await cmPage.evaluate(() => window.JARVIS_INTEL.maybeMorningBriefing());
    await cmPage.waitForTimeout(300);
    expect(await dichos(cmPage)).toEqual([]);
    await expect(cmPage.locator('#pr-dia')).toHaveCount(0);
  });

  test('«Agendar 30 min» crea la actividad en el próximo bloque libre del planner de hoy', async ({ cmPage, consoleErrors }) => {
    await poner(cmPage, [prin({ id: 'a', haz: 'Escribir el informe', seccion: 'Salud' })], { dayPlan: {}, planRecurring: [] });
    await reloj(cmPage, 14, 10);
    await cmPage.evaluate(() => { getDayPlan('2026-11-12').tasks.push({ id: 'x1', text: 'Reunión', area: 'vida', priority: 2, time: '14:30', duration: 45, habit: null, done: false }); Principios.mostrarDelDia(); });
    await cmPage.locator('#pr-dia .pr-av-sug', { hasText: 'Agendar 30 min' }).click();
    const t = await cmPage.evaluate(() => getDayPlan('2026-11-12').tasks.filter((x) => x.text === 'Escribir el informe'));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ time: '15:30', duration: 30, area: 'salud', done: false });   // 14:30–15:15 ocupado → 15:30
    expect(await cmPage.evaluate(() => plannerDayTasks('2026-11-12').some((x) => x.text === 'Escribir el informe'))).toBe(true);
    await expect(cmPage.locator('#pr-dia')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('«Marcar hecho» marca el hábito vinculado hoy', async ({ cmPage, consoleErrors }) => {
    await poner(cmPage, [prin({ id: 'a', habitosIds: ['salud|h1'] })], { habitTrackers: { vida: [], finanzas: [], salud: [{ id: 'h1', name: 'Leer 20 min', emoji: '📚', days: {} }], conocimiento: [], ia: [] } });
    await reloj(cmPage, 10);
    await cmPage.evaluate(() => Principios.mostrarDelDia());
    await cmPage.locator('#pr-dia .pr-av-sug', { hasText: 'Marcar «Leer 20 min» hecho hoy' }).click();
    expect(await cmPage.evaluate(() => S.habitTrackers.salud[0].days['2026-11-12'])).toBe('done');
    expect(consoleErrors).toEqual([]);
  });

  test('campanita: tarjeta grande y panel muestran las opciones; el panel no duplica «Posponer 1 h»', async ({ cmPage, consoleErrors }) => {
    await poner(cmPage, [prin({ id: 'a', haz: 'Escribir primero', habitosIds: ['salud|h1'], disparo: { tipo: 'diario' } })], { habitTrackers: { vida: [], finanzas: [], salud: [{ id: 'h1', name: 'Leer', days: {} }], conocimiento: [], ia: [] } });
    await reloj(cmPage, 9);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    const card = cmPage.locator('#pr-avisos .pr-av-card');
    await expect(card).toBeVisible();
    await expect(card.locator('.pr-av-sug')).toHaveText([/Agendar 30 min ahora/, /Marcar «Leer» hecho hoy/, 'Posponer 1 h', 'Ver principio']);
    await cmPage.locator('#pr-avisos .pr-bell').click();
    const panel = cmPage.locator('#pr-av-panel');
    await expect(panel.locator('.pr-av-sug')).toHaveText([/Agendar 30 min ahora/, /Marcar «Leer» hecho hoy/, 'Ver principio']);
    await expect(panel.getByRole('button', { name: 'Posponer 1 hora' })).toHaveCount(1);
    expect(await cmPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await cmPage.screenshot({ path: test.info().outputPath('panel-sugerencias.png') });
    // «Ver principio» abre la ventana de principios
    await panel.locator('.pr-av-sug', { hasText: 'Ver principio' }).click();
    await expect(cmPage.locator('#ov-principios')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('voz de la campanita: una sola vez por aviso por día; no habla con la pestaña oculta ni con Jarvis apagado', async ({ cmPage }) => {
    const aviso = prin({ id: 'a', enunciado: 'Dormir antes de las 23', disparo: { tipo: 'datos', regla: { plantilla: 'sueno_menos', horas: 7 } } });
    await poner(cmPage, [aviso], { sleepLog: { '2026-11-12': { hours: 5 } } });
    await reloj(cmPage, 9);
    await mockJarvis(cmPage);
    // pestaña oculta: no habla y NO consume la firma
    await cmPage.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Principios.chequearAvisos(); });
    expect(await dichos(cmPage)).toEqual([]);
    // visible: habla una vez, en español, con la razón y el enunciado
    await cmPage.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await cmPage.evaluate(() => { Principios.ocultar('a'); localStorage.removeItem('cm_pr_visto_2026-11-12'); });
    // «ocultar» saca el aviso; al desaparecer se olvida y vuelve a ser nuevo
    await cmPage.evaluate(() => { Principios.reactivar('a'); S.sleepLog['2026-11-12'].hours = 4; });
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect.poll(async () => (await dichos(cmPage)).length).toBe(1);
    expect((await dichos(cmPage))[0]).toEqual({ t: 'Anoche dormiste 4 horas. Dormir antes de las 23.', lang: 'es' });
    // vuelve a aparecer como «nuevo» el mismo día: no repite
    await cmPage.evaluate(() => { S.sleepLog['2026-11-12'].hours = 9; Principios.chequearAvisos(); S.sleepLog['2026-11-12'].hours = 3; Principios.chequearAvisos(); });
    await cmPage.waitForTimeout(200);
    expect((await dichos(cmPage)).length).toBe(1);
    // Jarvis apagado: silencio
    await cmPage.evaluate(() => { localStorage.setItem('jarvis_enabled', '0'); localStorage.removeItem('cm_pr_voz_2026-11-12'); S.sleepLog['2026-11-12'].hours = 9; Principios.chequearAvisos(); S.sleepLog['2026-11-12'].hours = 3; Principios.chequearAvisos(); });
    expect((await dichos(cmPage)).length).toBe(1);
  });

  test('Jarvis (voz): speak con lang es usa modelo multilingüe y voz es-AR; el comportamiento por defecto no cambia', async ({ cmPage }) => {
    const cuerpos = [];
    await cmPage.route('https://api.elevenlabs.io/v1/text-to-speech/**', async (route) => {
      cuerpos.push(JSON.parse(route.request().postData()));
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: 'x' });
    });
    await cmPage.evaluate(() => {
      localStorage.setItem('jarvis_el_model', 'eleven_monolingual_v1'); localStorage.setItem('jarvis_el_key', 'test');
      if (localStorage.getItem('jarvis_enabled') !== '1') JARVIS.toggle();
      window.__utt = []; speechSynthesis.speak = (u) => window.__utt.push(u.lang);
    });
    await cmPage.evaluate(() => caches.delete('jarvis-tts-v1'));
    await cmPage.evaluate(() => JARVIS.speak('Principio de hoy: esperar antes de comprar', { lang: 'es' }));
    await cmPage.evaluate(() => JARVIS.speak('Understood, sir', undefined));
    await expect.poll(() => cuerpos.filter((b) => /Principio de hoy|Understood/.test(b.text)).length, { timeout: 8000 }).toBe(2);
    expect(cuerpos.find((b) => /Principio/.test(b.text)).model_id).toBe('eleven_flash_v2_5');     // monolingüe inglés → multilingüe SOLO para español
    expect(cuerpos.find((b) => /Understood/.test(b.text)).model_id).toBe('eleven_monolingual_v1');  // por defecto: sin cambios
    // fallback del navegador: ElevenLabs falla → speechSynthesis en es-AR (y en-GB para lo de siempre)
    await cmPage.unroute('https://api.elevenlabs.io/v1/text-to-speech/**');
    await cmPage.route('https://api.elevenlabs.io/v1/text-to-speech/**', (route) => route.fulfill({ status: 500, body: 'err' }));
    await cmPage.evaluate(() => JARVIS.speak('Otro principio distinto para el fallback', { lang: 'es' }));
    await cmPage.evaluate(() => JARVIS.speak('Another line for the fallback', undefined));
    await expect.poll(() => cmPage.evaluate(() => window.__utt.slice())).toEqual(['es-AR', 'en-GB']);
  });

  test('chat con IA: get_app_state incluye principios compactos (máx. 10, los con aviso primero) y el prompt lo menciona', async ({ cmPage }) => {
    const muchos = Array.from({ length: 14 }, (_, i) => prin({ id: 'p' + String(i).padStart(2, '0'), enunciado: 'Principio ' + i, haz: 'Hacer ' + i }));
    muchos[13] = prin({ id: 'p13', enunciado: 'Con aviso', disparo: { tipo: 'diario' } });
    await poner(cmPage, muchos);
    await reloj(cmPage, 9);
    const st = JSON.parse(await cmPage.evaluate(() => JARVIS_AGENT.exec('get_app_state', {})));
    expect(st.principios).toHaveLength(10);
    expect(st.principios[0]).toMatchObject({ enunciado: 'Con aviso', aviso: 'aviso diario' });
    expect(st.principios[1].haz).toBeTruthy();
  });
});
