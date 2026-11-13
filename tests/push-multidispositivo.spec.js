// Avisos push a TODOS los dispositivos: (a) cron push-reminders.js, (b) cliente (app.js), (c) TimerAlarm del Worker.
'use strict';
const { test, expect } = require('./support/fixtures');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MOCK = path.join(__dirname, 'support', 'mock-push-node.js');
const sub = (n) => ({ endpoint: 'https://push.' + n + '.invalido/x', keys: { p256dh: 'a', auth: 'b' } });

function correr(doc, envio, extraEnv) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-pushmulti-'));
  const fDoc = path.join(dir, 'doc.json'), fOut = path.join(dir, 'out.json');
  fs.writeFileSync(fDoc, JSON.stringify(doc));
  const r = spawnSync(process.execPath, ['-r', MOCK, path.join(ROOT, 'push-reminders.js')], {
    cwd: ROOT, encoding: 'utf8',
    env: Object.assign({}, process.env, { FIREBASE_SERVICE_ACCOUNT: '{}', MOCK_DOC: fDoc, MOCK_OUT: fOut, MOCK_SEND: envio }, extraEnv || {}),
  });
  const res = fs.existsSync(fOut) ? JSON.parse(fs.readFileSync(fOut, 'utf8')) : { doc: null, sends: [], dests: [] };
  return { code: r.status, doc: res.doc, sends: res.sends, dests: res.dests, out: r.stdout + r.stderr };
}
function docBase(extra) {
  const dt = new Date(Date.now() - 3 * 3600000 - 2 * 60000).toISOString().slice(0, 16);
  const state = { foco: { config: { horas: [] } }, reminders: { vida: [{ id: 'r1', title: 'Prueba de aviso', datetime: dt, priority: 'high' }] } };
  return Object.assign({ state: JSON.stringify(state), vapidKeys: { pubKey: 'pub', sigKey: 'sig' }, notifiedReminders: {} }, extra);
}

test.describe('(a) cron push-reminders.js: todos los dispositivos', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });

  const dos = () => ({ pushSubscriptions: { dA: { sub: sub('A'), ua: 'iPhone', updatedAt: 1 }, dB: { sub: sub('B'), ua: 'Windows', updatedAt: 2 } } });

  test('2 dispositivos + legado igual a uno: sale a 2 endpoints distintos, sin duplicar', () => {
    const r = correr(docBase(Object.assign(dos(), { pushSubscription: sub('B') })), 'ok');
    expect(r.code).toBe(0);
    expect(r.dests).toHaveLength(2);
    expect(new Set(r.dests.map(d => d.endpoint)).size).toBe(2);
    expect(Object.keys(r.doc.notifiedReminders)).toHaveLength(1);
  });

  test('legado distinto de los del mapa: se suma como tercer destino', () => {
    const r = correr(docBase(Object.assign(dos(), { pushSubscription: sub('C') })), 'ok');
    expect(r.dests.map(d => d.endpoint).sort()).toEqual([sub('A').endpoint, sub('B').endpoint, sub('C').endpoint]);
  });

  test('uno devuelve 410: se borra solo esa entrada, el otro recibe, el aviso queda marcado y no hay pushDead', () => {
    const r = correr(docBase(Object.assign(dos(), { pushSubscription: sub('B') })), 'ok', { MOCK_DEAD: 'push.A.' });
    expect(r.code).toBe(0);
    expect(r.dests).toHaveLength(2);   // intentó a los dos
    expect(Object.keys(r.doc.pushSubscriptions)).toEqual(['dB']);
    expect(r.doc.pushSubscriptions.dB.sub.endpoint).toBe(sub('B').endpoint);
    expect(Object.keys(r.doc.notifiedReminders)).toHaveLength(1);   // llegó a B
    expect(r.doc.pushDead).toBeUndefined();
    expect(r.doc.state).toBe(docBase().state);
  });

  test('todos muertos: pushDead, no marca, y se borran las entradas', () => {
    const r = correr(docBase(dos()), '410');
    expect(r.code).not.toBe(0);
    expect(r.doc.pushDead).toMatchObject({ code: 410 });
    expect(r.doc.notifiedReminders).toEqual({});
    expect(r.doc.pushSubscriptions).toEqual({});
  });

  test('legado muerto: se borra también el campo pushSubscription', () => {
    const r = correr(docBase({ pushSubscription: sub('L') }), '410');
    expect(r.doc.pushSubscription).toBeUndefined();
  });

  test('transacción: no borra una entrada re-escrita con endpoint nuevo', () => {
    const r = correr(docBase(Object.assign(dos(), { pushSubscription: sub('B') })), 'ok', { MOCK_DEAD: 'push.A.', MOCK_REESCRIBIR: JSON.stringify({ dA: sub('A2') }) });
    expect(r.doc.pushSubscriptions.dA.sub.endpoint).toBe(sub('A2').endpoint);
    expect(r.doc.pushSubscriptions.dB).toBeTruthy();
  });

  test('prioridad de código: 410 gana al 500 aunque el 500 sea el último', () => {
    const r = correr(docBase(dos()), '500', { MOCK_DEAD: 'push.A.' });
    expect(r.doc.pushDead).toMatchObject({ code: 410 });
    expect(Object.keys(r.doc.pushSubscriptions)).toEqual(['dB']);
  });

  test('solo legado (documento viejo): sigue funcionando', () => {
    const r = correr(docBase({ pushSubscription: sub('L') }), 'ok');
    expect(r.code).toBe(0);
    expect(r.dests.map(d => d.endpoint)).toEqual([sub('L').endpoint]);
    expect(Object.keys(r.doc.notifiedReminders)).toHaveLength(1);
  });

  test('sin ninguna suscripción: no envía y no falla', () => {
    const r = correr(docBase({}), 'ok');
    expect(r.code).toBe(0);
    expect(r.dests).toHaveLength(0);
  });
});

test.describe('(b) cliente: suscripción por dispositivo y timers por dispositivo', () => {
  // Doc falso con update() de dotted-path real (como Firestore): 'a.b' escribe solo a.b.
  async function falsoDoc(page, inicial) {
    await page.evaluate((ini) => {
      const doc = JSON.parse(JSON.stringify(ini));
      window.__doc = doc; window.__fetches = []; window.__upd = 0;
      _db.collection = () => ({ doc: () => ({
        get: () => Promise.resolve({ exists: true, data: () => JSON.parse(JSON.stringify(doc)) }),
        update: (d) => { window.__upd++; if (window.__updFalla) return Promise.reject(new Error('sin red')); Object.keys(d).forEach((k) => { const p = k.split('.'); let o = doc; p.slice(0, -1).forEach((x) => { o[x] = o[x] || {}; o = o[x]; }); o[p[p.length - 1]] = d[k]; }); return Promise.resolve(); },
      }) });
      window.fetch = (u, init) => { window.__fetches.push({ u: String(u), body: init && init.body ? JSON.parse(init.body) : null }); return Promise.resolve({ ok: true }); };
    }, inicial);
  }

  test('activar notificaciones escribe pushSubscriptions.<deviceId> sin borrar otra entrada ni otros campos', async ({ cmPage }) => {
    await falsoDoc(cmPage, { state: 'X', vapidKeys: { pubKey: 'p' }, pushSubscriptions: { dOtro: { sub: sub('otro'), ua: 'Windows', updatedAt: 1 } } });
    await cmPage.evaluate(() => {
      Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
      _swReg = { pushManager: { getSubscription: async () => null, subscribe: async () => ({ endpoint: 'https://push.propio.invalido/x', keys: { p256dh: 'p', auth: 'a' } }) } };
    });
    expect(await cmPage.evaluate(() => _subscribePush('AAAA'))).toBe(true);
    const r = await cmPage.evaluate(() => ({ doc: window.__doc, id: _pushDeviceId(), ls: localStorage.getItem('cm_device_id') }));
    expect(r.id).toBe(r.ls);
    expect(r.id).toMatch(/^[a-z0-9]+$/i);
    expect(Object.keys(r.doc.pushSubscriptions).sort()).toEqual(['dOtro', r.id].sort());
    expect(r.doc.pushSubscriptions[r.id].sub.endpoint).toBe('https://push.propio.invalido/x');
    expect(typeof r.doc.pushSubscriptions[r.id].ua).toBe('string');
    expect(r.doc.pushSubscriptions[r.id].updatedAt).toBeGreaterThan(0);
    expect(r.doc.pushSubscriptions.dOtro.sub.endpoint).toBe(sub('otro').endpoint);   // intacta
    expect(r.doc.pushSubscription.endpoint).toBe('https://push.propio.invalido/x');   // legado se sigue escribiendo
    expect(r.doc.state).toBe('X');
    expect(r.doc.vapidKeys).toEqual({ pubKey: 'p' });
  });

  test('_schedulePushAlarm: id pomo-<deviceId> y subscriptions con todas (propia primero, sin repetidas)', async ({ cmPage }) => {
    await falsoDoc(cmPage, { pushSubscription: sub('dup'), pushSubscriptions: { dA: { sub: sub('dup') }, dB: { sub: sub('otro') } } });
    await cmPage.evaluate(() => {
      _swReg = { pushManager: { getSubscription: async () => ({ endpoint: 'https://push.propio.invalido/x', keys: { p256dh: 'p', auth: 'a' } }) } };
      window._pushWorkerToken = async () => 'tok';
    });
    await cmPage.evaluate(() => _schedulePushAlarm('pomo', 60, 'T', 'B', 'pomo'));
    await cmPage.evaluate(() => _schedulePushAlarm('rtn-ex7', 30, 'T', 'B', 'rtn-timer'));
    await cmPage.evaluate(() => _cancelPushAlarm('pomo'));
    const r = await cmPage.evaluate(() => ({ f: window.__fetches, id: _pushDeviceId() }));
    expect(r.f[0].u.endsWith('/schedule/pomo-' + r.id)).toBe(true);
    expect(r.f[0].body.subscriptions.map(s => s.endpoint)).toEqual(['https://push.propio.invalido/x', sub('dup').endpoint, sub('otro').endpoint]);
    expect(r.f[0].body.subscription.endpoint).toBe('https://push.propio.invalido/x');
    expect(r.f[1].u.endsWith('/schedule/rtn-' + r.id + '-ex7')).toBe(true);
    expect(r.f[2].u.endsWith('/cancel/pomo-' + r.id)).toBe(true);
  });

  // Prepara permiso concedido + suscripción propia con endpoint dado + toasts capturados.
  async function arranque(page, docInicial, endpoint) {
    await falsoDoc(page, docInicial);
    await page.evaluate((ep) => {
      Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
      window.__toasts = []; window.showToast = (m) => window.__toasts.push(String(m));
      _swReg = { pushManager: { getSubscription: async () => ({ endpoint: ep, keys: { p256dh: 'p', auth: 'a' } }), subscribe: async () => ({ endpoint: ep, keys: { p256dh: 'p', auth: 'a' } }) } };
    }, endpoint);
  }
  const EP = 'https://push.propio.invalido/x';

  test('arranque con permiso concedido y sin entrada propia: se escribe la entrada', async ({ cmPage }) => {
    await arranque(cmPage, { vapidKeys: { pubKey: 'AAAA' }, pushSubscriptions: { dOtro: { sub: sub('otro') } } }, EP);
    await cmPage.evaluate(() => _asegurarPushDispositivo());
    const r = await cmPage.evaluate(() => ({ doc: window.__doc, id: _pushDeviceId() }));
    expect(r.doc.pushSubscriptions[r.id].sub.endpoint).toBe(EP);
    expect(r.doc.pushSubscriptions.dOtro).toBeTruthy();
  });

  test('arranque con la entrada ya igual: no reescribe', async ({ cmPage }) => {
    await arranque(cmPage, { vapidKeys: { pubKey: 'AAAA' } }, EP);
    const id = await cmPage.evaluate(() => _pushDeviceId());
    await cmPage.evaluate(([i, ep]) => { window.__doc.pushSubscriptions = { [i]: { sub: { endpoint: ep } } }; }, [id, EP]);
    await cmPage.evaluate(() => _asegurarPushDispositivo());
    expect(await cmPage.evaluate(() => window.__upd)).toBe(0);
  });

  test('arranque con endpoint distinto al actual (suscripción renovada): reescribe', async ({ cmPage }) => {
    await arranque(cmPage, { vapidKeys: { pubKey: 'AAAA' } }, EP);
    const id = await cmPage.evaluate(() => _pushDeviceId());
    await cmPage.evaluate(([i]) => { window.__doc.pushSubscriptions = { [i]: { sub: { endpoint: 'https://push.vieja.invalido/x' } } }; }, [id]);
    await cmPage.evaluate(() => _asegurarPushDispositivo());
    expect(await cmPage.evaluate(([i]) => window.__doc.pushSubscriptions[i].sub.endpoint, [id])).toBe(EP);
  });

  test('escritura que falla: toast de error visible y resultado false', async ({ cmPage }) => {
    await arranque(cmPage, { vapidKeys: { pubKey: 'AAAA' } }, EP);
    const r = await cmPage.evaluate(async () => { window.__updFalla = true; const ok = await _subscribePush('AAAA'); return { ok, t: window.__toasts }; });
    expect(r.ok).toBe(false);
    expect(r.t.some(m => m.includes('No pude registrar este dispositivo'))).toBe(true);
  });

  test('"ya activas": toast de éxito solo si se escribió; si falla, solo el de error', async ({ cmPage }) => {
    await arranque(cmPage, { vapidKeys: { pubKey: 'AAAA' } }, EP);
    await cmPage.evaluate(async () => { initNotifications(); await new Promise(r => setTimeout(r, 300)); });
    expect(await cmPage.evaluate(() => window.__toasts.some(m => m.includes('ya activas')))).toBe(true);
    await cmPage.evaluate(async () => { window.__toasts = []; window.__updFalla = true; initNotifications(); await new Promise(r => setTimeout(r, 300)); });
    const t = await cmPage.evaluate(() => window.__toasts);
    expect(t.some(m => m.includes('ya activas'))).toBe(false);
    expect(t.some(m => m.includes('No pude registrar'))).toBe(true);
  });

  test('_schedulePushAlarm resta lo que tardó la lectura del documento al delay', async ({ cmPage }) => {
    await falsoDoc(cmPage, { pushSubscriptions: {} });
    await cmPage.evaluate(() => {
      const g = _db.collection().doc().get;
      _db.collection = () => ({ doc: () => ({ get: () => new Promise(r => setTimeout(() => g().then(r), 2500)) }) });
      _swReg = { pushManager: { getSubscription: async () => ({ endpoint: 'https://push.propio.invalido/x', keys: { p256dh: 'p', auth: 'a' } }) } };
      window._pushWorkerToken = async () => 'tok';
      _pushSubsCache = null;
    });
    await cmPage.evaluate(() => _schedulePushAlarm('pomo', 60, 'T', 'B', 'pomo'));
    const f = await cmPage.evaluate(() => window.__fetches);
    expect(f[0].body.delaySeconds).toBeLessThanOrEqual(58);
    expect(f[0].body.delaySeconds).toBeGreaterThanOrEqual(55);
  });

  test('lectura fallida: cachea solo la propia por ~60 s, no 10 min', async ({ cmPage }) => {
    await falsoDoc(cmPage, {});
    const r = await cmPage.evaluate(async () => {
      _db.collection = () => ({ doc: () => ({ get: () => Promise.reject(new Error('timeout')) }) });
      _pushSubsCache = null;
      await _pushSubsTodas({ endpoint: 'https://push.propio.invalido/x' });
      return { edad: Date.now() - _pushSubsCache.at, n: _pushSubsCache.subs.length };
    });
    expect(r.n).toBe(1);
    expect(r.edad).toBeGreaterThan(530000);   // vence en <= ~60 s (TTL 600 s)
  });

  test('si la lectura del documento falla, agenda igual con la suscripción propia', async ({ cmPage }) => {
    await falsoDoc(cmPage, {});
    await cmPage.evaluate(() => {
      _db.collection = () => ({ doc: () => ({ get: () => Promise.reject(new Error('offline')) }) });
      _swReg = { pushManager: { getSubscription: async () => ({ endpoint: 'https://push.propio.invalido/x', keys: { p256dh: 'p', auth: 'a' } }) } };
      window._pushWorkerToken = async () => 'tok';
    });
    await cmPage.evaluate(() => _schedulePushAlarm('pomo', 60, 'T', 'B', 'pomo'));
    const f = await cmPage.evaluate(() => window.__fetches);
    expect(f[0].body.subscriptions).toHaveLength(1);
  });
});

test.describe('(c) Worker: TimerAlarm', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });

  // Evalúa el texto del Worker (cf-worker/ tiene su propio node_modules) con buildPushPayload y fetch falsos.
  function armar(enviosFallan) {
    const src = fs.readFileSync(path.join(ROOT, 'cf-worker', 'src', 'index.js'), 'utf8')
      .replace(/^import .*$/m, '')
      .replace('export class TimerAlarm', 'class TimerAlarm')
      .replace('export class CarteraGate', 'class CarteraGate')
      .replace('export default', 'const __worker =');
    const enviados = [];
    const buildPushPayload = async (msg, s) => ({ method: 'POST', body: msg.data, __ep: s.endpoint });
    const fetchFalso = async (url) => {
      enviados.push(url);
      if (enviosFallan && enviosFallan(url)) throw new Error('red caída');
      return { ok: true, status: 201, text: async () => '' };
    };
    const { TimerAlarm } = new Function('buildPushPayload', 'fetch', src + '\nreturn { TimerAlarm };')(buildPushPayload, fetchFalso);
    const almacen = new Map();
    let alarma = null;
    const storage = {
      async get(k) { return almacen.has(k) ? structuredClone(almacen.get(k)) : undefined; },
      async put(k, v) { almacen.set(k, structuredClone(v)); },
      async delete(k) { return almacen.delete(k); },
      async setAlarm(t) { alarma = t; }, async deleteAlarm() { alarma = null; },
    };
    const obj = new TimerAlarm({ storage }, { VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'k' });
    const programar = (body) => obj.fetch(new Request('https://do/schedule', { method: 'POST', body: JSON.stringify(body) }));
    return { obj, enviados, programar, alarma: () => alarma, almacen };
  }

  test('con 2 suscripciones manda a ambas', async () => {
    const w = armar();
    const res = await w.programar({ delaySeconds: 60, subscriptions: [sub('A'), sub('B')], title: 'T', body: 'B', tag: 'pomo' });
    expect(res.status).toBe(200);
    expect(w.alarma()).toBeGreaterThan(Date.now());
    await w.obj.alarm();
    expect(w.enviados.sort()).toEqual([sub('A').endpoint, sub('B').endpoint]);
    expect(w.almacen.has('payload')).toBe(false);
  });

  test('si una falla, la otra se manda igual', async () => {
    const w = armar((u) => u.includes('push.A.'));
    await w.programar({ delaySeconds: 60, subscriptions: [sub('A'), sub('B')], title: 'T', body: 'B', tag: 'pomo' });
    await w.obj.alarm();
    expect(w.enviados).toContain(sub('B').endpoint);
    expect(w.enviados).toHaveLength(2);
  });

  test('body viejo (subscription sola) sigue andando; payload viejo ya guardado también', async () => {
    const w = armar();
    expect((await w.programar({ delaySeconds: 60, subscription: sub('V'), title: 'T', body: 'B', tag: 'pomo' })).status).toBe(200);
    await w.obj.alarm();
    expect(w.enviados).toEqual([sub('V').endpoint]);
    const w2 = armar();
    w2.almacen.set('payload', { subscription: sub('W'), title: 'T', notifBody: 'B', tag: 'x' });
    await w2.obj.alarm();
    expect(w2.enviados).toEqual([sub('W').endpoint]);
  });

  test('valida: sin suscripciones válidas, delay fuera de rango, endpoint no https, y recorta a 10', async () => {
    const w = armar();
    for (const b of [
      { delaySeconds: 60, subscriptions: [] },
      { delaySeconds: 0, subscriptions: [sub('A')] },
      { delaySeconds: 99999, subscriptions: [sub('A')] },
      { delaySeconds: 60, subscriptions: [{ endpoint: 'http://x/y', keys: {} }, { endpoint: 'https://x/y' }, null] },
    ]) expect((await w.programar(b)).status).toBe(400);
    const muchas = Array.from({ length: 15 }, (_, i) => sub('n' + i));
    expect((await w.programar({ delaySeconds: 60, subscriptions: muchas, title: 'T', body: 'B', tag: 't' })).status).toBe(200);
    await w.obj.alarm();
    expect(w.enviados).toHaveLength(10);
  });
});
