// Seguimiento de Foco, punto 2: chequeos durante el día (aviso push + deep-link + toque de respuesta + horas + reparto).
'use strict';
const { test, expect, waitForBoot, completeLoginOverlay } = require('./support/fixtures');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const D = require('../deadlines.js');

const ROOT = path.resolve(__dirname, '..');
const MOCK = path.join(__dirname, 'support', 'mock-push-node.js');
const TZ = '-03:00';
const AHORA = new Date('2026-11-12T11:05:00-03:00').getTime();
const focos = (state, now, extra) => D.collect(state, Object.assign({ now, tz: TZ }, extra)).filter((i) => i.kind === 'foco');

test.describe('deadlines.js: avisos de chequeo (puro, Node)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });

  test('un aviso por hora configurada para hoy, tag único, url del destino, hora -03:00', () => {
    const st = { foco: { config: { horas: ['19:00', '11:00', '15:00', '11:00', '25:99', 'x'] } } };
    const hoy = focos(st, AHORA).filter((i) => i.date === '2026-11-12');
    expect(hoy.map((i) => i.time)).toEqual(['11:00', '15:00', '19:00']);   // ordenadas, sin duplicados ni inválidas
    const alerts = hoy.flatMap((i) => i.alerts);
    expect(alerts).toHaveLength(3);
    expect(new Set(alerts.map((a) => a.key)).size).toBe(3);
    expect(alerts.map((a) => a.key)).toEqual(['foco_2026-11-12_11:00', 'foco_2026-11-12_15:00', 'foco_2026-11-12_19:00']);
    alerts.forEach((a) => { expect(a.url).toBe('#foco-chequeo'); expect(a.title).toBe('¿En qué estuviste?'); expect(a.body).toBe('Tocá para anotar las últimas horas.'); });
    expect(alerts[0].at).toBe(new Date('2026-11-12T11:00:00-03:00').getTime());
    expect(alerts[2].at).toBe(new Date('2026-11-12T19:00:00-03:00').getTime());
  });

  test('el día es el de Argentina aunque el reloj del runner sea UTC', () => {
    const now = new Date('2026-11-13T01:30:00Z').getTime();   // 22:30 del 12/11 en -03:00
    expect(focos({}, now).filter((i) => i.date === '2026-11-12')).toHaveLength(3);
    expect(focos({}, now).filter((i) => i.date === '2026-11-13')).toHaveLength(0);
  });

  test('con 0 horas no hay avisos; sin config rigen 11, 15 y 19', () => {
    expect(focos({ foco: { config: { horas: [] } } }, AHORA)).toHaveLength(0);
    expect(focos({}, AHORA).filter((i) => i.date === '2026-11-12').map((i) => i.time)).toEqual(['11:00', '15:00', '19:00']);
  });

  test('dueAlerts: sale una sola vez cuando llega la hora y no si ya se avisó', () => {
    const st = { foco: { config: { horas: ['11:00', '15:00'] } } };
    const ya = new Date('2026-11-12T11:03:00-03:00').getTime();   // ventana corta por defecto: 5 min
    const due = D.dueAlerts(st, { now: ya, tz: TZ, seen: {} });
    expect(due.map((a) => a.key)).toEqual(['foco_2026-11-12_11:00']);
    expect(due[0].url).toBe('#foco-chequeo');
    expect(D.dueAlerts(st, { now: ya, tz: TZ, seen: { 'foco_2026-11-12_11:00': true } })).toHaveLength(0);
  });

  test('winMs: solo el chequeo de Foco tiene ventana propia (60 min); los demás avisos no cambian', () => {
    const now = new Date('2026-11-12T11:45:00-03:00').getTime();   // 45 min tarde
    const o = { now, tz: TZ, seen: {}, windowMs: 20 * 60000 };       // como el cron
    expect(D.dueAlerts({ foco: { config: { horas: ['11:00'] } } }, o).map((a) => a.key)).toEqual(['foco_2026-11-12_11:00']);
    // aviso "es ahora" de un recordatorio con la misma demora: sigue perdiéndose con la ventana corta
    const rec = { reminders: { vida: [{ id: 'r1', title: 'x', datetime: '2026-11-12T11:00', priority: 'high' }] }, foco: { config: { horas: [] } } };
    expect(D.dueAlerts(rec, o).map((a) => a.key)).toEqual([]);
    D.collect(rec, { now, tz: TZ }).forEach((i) => i.alerts.forEach((a) => expect('winMs' in a).toBe(false)));
  });

  test('no avisa si ese chequeo ya fue respondido', () => {
    const st = { foco: { config: { horas: ['11:00', '15:00'] }, chequeos: [{ fecha: '2026-11-12', hora: '10:50', categoria: 'estudio', energia: 3 }] } };
    expect(D.dueAlerts(st, { now: new Date('2026-11-12T11:03:00-03:00').getTime(), tz: TZ, seen: {} })).toHaveLength(0);
    // el de las 15 sigue pendiente (la respuesta de las 10:50 no lo cubre)
    expect(D.dueAlerts(st, { now: new Date('2026-11-12T15:02:00-03:00').getTime(), tz: TZ, seen: {} }).map((a) => a.key)).toEqual(['foco_2026-11-12_15:00']);
  });

  test('no se cuelan en Recordatorios ni en el ticker (sin tab)', () => {
    focos({}, AHORA).forEach((i) => expect(i.tab).toBeUndefined());
  });
});

// Corre push-reminders.js con web-push y Firestore mockeados (nada sale a la red) y devuelve los payloads armados.
function correrCron(state, ahoraMs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-foco-'));
  const fDoc = path.join(dir, 'doc.json'), fOut = path.join(dir, 'out.json');
  fs.writeFileSync(fDoc, JSON.stringify({ state: JSON.stringify(state), pushSubscription: { endpoint: 'https://push.invalido/x', keys: { p256dh: 'a', auth: 'b' } }, vapidKeys: { pubKey: 'pub', sigKey: 'sig' }, notifiedReminders: {} }));
  const args = ['-r', MOCK, path.join(ROOT, 'push-reminders.js')];
  if (ahoraMs) {   // reloj fijo para el cron (solo usa Date.now)
    const fNow = path.join(dir, 'now.js');
    fs.writeFileSync(fNow, 'Date.now = () => ' + ahoraMs + ';');
    args.unshift('-r', fNow);
  }
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8',
    env: Object.assign({}, process.env, { FIREBASE_SERVICE_ACCOUNT: '{}', MOCK_DOC: fDoc, MOCK_OUT: fOut, MOCK_SEND: 'ok' }) });
  return Object.assign({ code: r.status }, fs.existsSync(fOut) ? JSON.parse(fs.readFileSync(fOut, 'utf8')) : { sends: [], payloads: [] });
}
const horaAR = (msAtras) => new Date(Date.now() - 3 * 3600000 - msAtras).toISOString().slice(11, 16);   // HH:MM en -03:00

test.describe('push-reminders.js: payload con url (sin enviar nada real)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });

  test('el aviso de chequeo lleva url; un recordatorio común no', () => {
    const r = correrCron({ foco: { config: { horas: [horaAR(2 * 60000)] } } });
    expect(r.code).toBe(0);
    expect(r.payloads).toHaveLength(1);
    expect(r.payloads[0]).toMatchObject({ title: '¿En qué estuviste?', body: 'Tocá para anotar las últimas horas.', url: '#foco-chequeo', requireInteraction: false });
    expect(r.payloads[0].tag).toMatch(/^foco_\d{4}-\d{2}-\d{2}_\d{2}:\d{2}$/);

    const dt = new Date(Date.now() - 3 * 3600000 - 2 * 60000).toISOString().slice(0, 16);
    const r2 = correrCron({ foco: { config: { horas: [] } }, reminders: { vida: [{ id: 'r1', title: 'x', datetime: dt, priority: 'high' }] } });
    expect(r2.payloads).toHaveLength(1);
    expect('url' in r2.payloads[0]).toBe(false);
  });

  test('documento SIN foco: el cron manda los 3 avisos por defecto (11/15/19) con url, y rescata uno atrasado hasta 60 min', () => {
    const ar = (hhmm) => new Date('2026-11-12T' + hhmm + ':00-03:00').getTime();
    ['11:02', '15:02', '19:02'].forEach((h) => {
      const r = correrCron({}, ar(h));
      expect(r.code).toBe(0);
      expect(r.payloads).toHaveLength(1);
      expect(r.payloads[0]).toMatchObject({ title: '¿En qué estuviste?', url: '#foco-chequeo', tag: 'foco_2026-11-12_' + h.slice(0, 2) + ':00' });
    });
    expect(correrCron({}, ar('13:00')).payloads).toHaveLength(0);   // entre medio no hay nada
    // Cron atrasado 45 min (> los 20 min de WINDOW_TIMED): el chequeo igual sale; 61 min ya no
    expect(correrCron({}, ar('15:45')).payloads.map((p) => p.tag)).toEqual(['foco_2026-11-12_15:00']);
    expect(correrCron({}, ar('16:01')).payloads).toHaveLength(0);
  });
});

// sw.js corre en un contexto vm con self/clients de mentira: se ejecutan los handlers reales.
function cargarSW() {
  const listeners = {}, shown = [], calls = { opened: [], navigated: [], posted: [], focused: 0 };
  let clientes = [];
  const self = {
    location: { origin: 'https://loustau45261470.github.io' },
    registration: { scope: 'https://loustau45261470.github.io/Centro-de-mando/', showNotification: (t, o) => { shown.push({ t, o }); return Promise.resolve(); } },
    addEventListener: (n, f) => { listeners[n] = f; },
    clients: { matchAll: () => Promise.resolve(clientes), openWindow: (u) => { calls.opened.push(u); return Promise.resolve(); } },
    skipWaiting() {}, caches: {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), { self, URL, console, Promise, fetch: () => {}, caches: {} });
  const esperar = (e) => e._p || Promise.resolve();
  const evento = (extra) => Object.assign({ waitUntil(p) { this._p = p; } }, extra);
  return {
    shown, calls, listeners,
    clientes: (l) => { clientes = l; },
    async push(payload) { const e = evento({ data: { json: () => payload, text: () => '' } }); listeners.push(e); await esperar(e); },
    async click(url) { const n = { data: { url }, close() {} }; const e = evento({ notification: n }); listeners.notificationclick(e); await esperar(e); },
  };
}

test.describe('sw.js: data.url y notificationclick (handlers reales en vm)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });

  test('push: data.url resuelta contra el scope; sin url → el Centro; fuera del Centro → el Centro', async () => {
    const sw = cargarSW();
    await sw.push({ title: 'a', url: '#foco-chequeo' });
    await sw.push({ title: 'b' });
    await sw.push({ title: 'c', url: 'https://malo.example/x' });
    expect(sw.shown.map((s) => s.o.data.url)).toEqual([
      'https://loustau45261470.github.io/Centro-de-mando/#foco-chequeo',
      'https://loustau45261470.github.io/Centro-de-mando/',
      'https://loustau45261470.github.io/Centro-de-mando/',
    ]);
  });

  test('click sin ventana abierta: openWindow(url); con ventana: se enfoca y recibe el destino', async () => {
    const sw = cargarSW();
    await sw.click('https://loustau45261470.github.io/Centro-de-mando/#foco-chequeo');
    expect(sw.calls.opened).toEqual(['https://loustau45261470.github.io/Centro-de-mando/#foco-chequeo']);

    const msgs = []; let foco = 0;
    sw.clientes([{ url: 'https://loustau45261470.github.io/Centro-de-mando/', focus: () => { foco++; return Promise.resolve(); }, postMessage: (m) => msgs.push(m) }]);
    await sw.click('https://loustau45261470.github.io/Centro-de-mando/#foco-chequeo');
    expect(foco).toBe(1);
    expect(msgs).toEqual([{ tipo: 'abrir-destino', url: 'https://loustau45261470.github.io/Centro-de-mando/#foco-chequeo' }]);
    expect(sw.calls.opened).toHaveLength(1);   // no abrió otra ventana
  });
});

// ── UI (navegador) ─────────────────────────────────────────────────────────
const sinScrollH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const irAFoco = async (page) => {
  await page.evaluate(() => { document.querySelector('.nav-btn[data-tab="principios"]').click(); Principios.sub('foco'); });
  await expect(page.locator('#fo-horas')).toBeVisible();
};

test.describe('Foco: chequeos en la app', () => {
  test('destino #foco-chequeo (app cerrada): abre Principios > Foco con el chequeo; categoría + energía se guardan', async ({ cmPage, consoleErrors }) => {
    await cmPage.goto('/?t=1#foco-chequeo');
    await waitForBoot(cmPage);
    await completeLoginOverlay(cmPage);
    await expect(cmPage.locator('#fo-chequeo .fo-cat')).toHaveCount(7);
    expect(await cmPage.evaluate(() => location.hash)).toBe('');   // se limpia para que un refresh no lo repita
    // Botones grandes y sin scroll horizontal
    const alto = await cmPage.locator('#fo-chequeo .fo-cat').evaluateAll((els) => Math.min(...els.map((e) => e.getBoundingClientRect().height)));
    expect(alto).toBeGreaterThanOrEqual(44);
    expect(await cmPage.locator('#fo-ch-en .fo-n').first().evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(await sinScrollH(cmPage)).toBe(true);

    await cmPage.evaluate(() => { window.__saves = 0; const o = window.saveState; window.saveState = function () { window.__saves++; return o.apply(this, arguments); }; S.foco = undefined; });
    await cmPage.evaluate(() => Principios.sub('foco'));
    await cmPage.evaluate(() => Foco.abrirChequeo());
    await cmPage.locator('#fo-chequeo [data-cat="estudio"]').click();
    await cmPage.locator('#fo-ch-en [data-en="4"]').click();
    const r = await cmPage.evaluate(() => ({ ch: S.foco.chequeos, saves: window.__saves, hoy: foFecha(new Date()) }));
    expect(r.ch).toHaveLength(1);
    expect(Object.keys(r.ch[0]).sort()).toEqual(['categoria', 'energia', 'fecha', 'hora']);
    expect(r.ch[0]).toMatchObject({ fecha: r.hoy, categoria: 'estudio', energia: 4 });
    expect(r.ch[0].hora).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    expect(r.saves).toBeGreaterThan(0);
    await expect(cmPage.locator('#fo-chequeo .fo-cat')).toHaveCount(0);   // se cierra tras guardar
    expect(consoleErrors).toEqual([]);
  });

  test('mensaje del SW con la app abierta: abre el chequeo; "Anotar ahora" también', async ({ cmPage }) => {
    await cmPage.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { tipo: 'abrir-destino', url: 'https://x.test/Centro-de-mando/#foco-chequeo' } })));
    await expect(cmPage.locator('#fo-chequeo .fo-cat')).toHaveCount(7);
    await cmPage.locator('#fo-chequeo .fo-btn', { hasText: 'Cancelar' }).click();
    await cmPage.locator('#fo-chequeo .fo-btn', { hasText: 'Anotar ahora' }).click();
    await expect(cmPage.locator('#fo-chequeo .fo-cat')).toHaveCount(7);
    await cmPage.locator('#fo-ch-en [data-en="2"]').click();   // energía sin categoría: no guarda
    expect(await cmPage.evaluate(() => (S.foco.chequeos || []).length)).toBe(0);
  });

  test('horas: agregar, ordenar, rechazar duplicada, cambiar, quitar hasta 0', async ({ cmPage }) => {
    await cmPage.evaluate(() => { S.foco = undefined; });
    await irAFoco(cmPage);
    await expect(cmPage.locator('#fo-horas input.fo-hora')).toHaveCount(4);   // 3 + el campo de agregar
    await cmPage.fill('#fo-nueva', '08:30');
    await cmPage.locator('#fo-horas .fo-btn', { hasText: 'Agregar hora' }).click();
    expect(await cmPage.evaluate(() => S.foco.config.horas)).toEqual(['08:30', '11:00', '15:00', '19:00']);
    await cmPage.fill('#fo-nueva', '11:00');
    await cmPage.locator('#fo-horas .fo-btn', { hasText: 'Agregar hora' }).click();
    expect(await cmPage.evaluate(() => S.foco.config.horas)).toEqual(['08:30', '11:00', '15:00', '19:00']);
    await cmPage.locator('#fo-horas input.fo-hora').nth(1).fill('12:15');   // 11:00 → 12:15
    expect(await cmPage.evaluate(() => S.foco.config.horas)).toEqual(['08:30', '12:15', '15:00', '19:00']);
    for (let i = 0; i < 4; i++) await cmPage.locator('#fo-horas .fo-btn', { hasText: 'Quitar' }).first().click();
    expect(await cmPage.evaluate(() => S.foco.config.horas)).toEqual([]);
    await expect(cmPage.locator('#fo-horas')).toContainText('Sin horas: no hay avisos');
    // y deadlines.js, leyendo el mismo estado, ya no genera avisos
    expect(await cmPage.evaluate(() => CMDeadlines.collect(S, { now: Date.now() }).filter((i) => i.kind === 'foco').length)).toBe(0);
    expect(await sinScrollH(cmPage)).toBe(true);
  });

  test('reparto de 7 días: con menos de 5 chequeos "faltan datos"; con 5 o más muestra categorías y %', async ({ cmPage }) => {
    const cargar = (n) => cmPage.evaluate((n) => {
      const hoy = foFecha(new Date()), viejo = foFecha(new Date(Date.now() - 10 * 86400000));
      const cats = ['estudio', 'estudio', 'gym', 'trabajo', 'estudio'];
      S.foco = { dias: {}, pantalla: {}, config: { horas: ['11:00'] }, chequeos: cats.slice(0, n).map((c) => ({ fecha: hoy, hora: '10:00', categoria: c, energia: 3 })).concat([{ fecha: viejo, hora: '10:00', categoria: 'social', energia: 3 }]) };
      prRender();
    }, n);
    await irAFoco(cmPage);
    await cargar(4);   // + 1 de hace 10 días que no cuenta
    await expect(cmPage.locator('#fo-reparto')).toContainText('Faltan datos: llevás 4 de 5');
    await expect(cmPage.locator('#fo-reparto .fo-rep')).toHaveCount(0);
    await cargar(5);
    await expect(cmPage.locator('#fo-reparto .fo-rep')).toHaveCount(3);
    await expect(cmPage.locator('#fo-reparto .fo-rep').first()).toContainText('Estudio');
    await expect(cmPage.locator('#fo-reparto .fo-rep').first()).toContainText('3 · 60%');
    await expect(cmPage.locator('#fo-reparto')).not.toContainText('Social');
    expect(await sinScrollH(cmPage)).toBe(true);
  });
});
