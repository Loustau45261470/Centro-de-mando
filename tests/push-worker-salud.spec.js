// Worker (cf-worker/src/index.js) sin red: registro de endpoints muertos (404/410), GET /push/salud y el Cron Trigger que dispara el workflow.
'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const sub = (n) => ({ endpoint: 'https://push.' + n + '.invalido/x', keys: { p256dh: 'a', auth: 'b' } });

// Evalúa el texto del Worker con buildPushPayload y fetch falsos; devuelve la clase y el objeto default.
function cargar(fetchFalso) {
  const src = fs.readFileSync(path.join(ROOT, 'cf-worker', 'src', 'index.js'), 'utf8')
    .replace(/^import .*$/m, '')
    .replace('export class TimerAlarm', 'class TimerAlarm')
    .replace('export class CarteraGate', 'class CarteraGate')
    .replace('export default', 'const __worker =');
  const buildPushPayload = async (msg, s) => ({ method: 'POST', body: msg.data, __ep: s.endpoint });
  return new Function('buildPushPayload', 'fetch', src + '\nreturn { TimerAlarm, __worker };')(buildPushPayload, fetchFalso);
}
function almacen() {
  const m = new Map(); let alarma = null;
  return { async get(k) { return m.has(k) ? structuredClone(m.get(k)) : undefined; }, async put(k, v) { m.set(k, structuredClone(v)); }, async delete(k) { return m.delete(k); }, async setAlarm(t) { alarma = t; }, async deleteAlarm() { alarma = null; }, _m: m, _a: () => alarma };
}

test.describe('Worker: salud del push y cron', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });

  test('la alarma registra los 404/410 y los demás fallos en __salud__; GET /salud los devuelve y ack los borra', async () => {
    const f = async (url) => {
      if (url.includes('push.A.')) return { ok: false, status: 410, text: async () => '' };
      if (url.includes('push.B.')) return { ok: false, status: 503, text: async () => '' };
      return { ok: true, status: 201, text: async () => '' };
    };
    const { TimerAlarm } = cargar(f);
    const instancias = new Map();
    const env = { VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'k' };
    env.TIMER = { idFromName: (n) => n, get: (n) => {
      if (!instancias.has(n)) instancias.set(n, new TimerAlarm({ storage: almacen() }, env));
      const o = instancias.get(n); return { fetch: (url, init) => o.fetch(new Request(url, init)), _o: o };
    } };
    const timer = env.TIMER.get('pomo-d1');
    await timer.fetch('https://do/schedule', { method: 'POST', body: JSON.stringify({ delaySeconds: 60, subscriptions: [sub('A'), sub('B'), sub('C')], title: 'T', body: 'B', tag: 'x' }) });
    await timer._o.alarm();
    const salud = await (await env.TIMER.get('__salud__').fetch('https://do/salud')).json();
    expect(salud.muertos).toHaveLength(1);
    expect(salud.muertos[0]).toMatchObject({ endpoint: sub('A').endpoint, status: 410 });
    expect(salud.fallos).toHaveLength(1);
    expect(salud.fallos[0].status).toBe(503);
    // Los endpoints no se mezclan en la instancia del timer ni los vivos aparecen como muertos.
    expect(JSON.stringify(salud)).not.toContain('push.C.');
    await env.TIMER.get('__salud__').fetch('https://do/salud/ack', { method: 'POST', body: JSON.stringify({ endpoints: [sub('A').endpoint] }) });
    expect((await (await env.TIMER.get('__salud__').fetch('https://do/salud')).json()).muertos).toHaveLength(0);
  });

  test('scheduled(): dispara workflow_dispatch con GH_DISPATCH_TOKEN (204 = ok) y deja el estado en /salud', async () => {
    const llamadas = [];
    const f = async (url, init) => { llamadas.push({ url: String(url), init }); return { status: 204, text: async () => '' }; };
    const { TimerAlarm, __worker } = cargar(f);
    const instancias = new Map();
    const env = { GH_DISPATCH_TOKEN: 'tok-dispatch', GH_DATA_TOKEN: 'tok-datos' };
    env.TIMER = { idFromName: (n) => n, get: (n) => {
      if (!instancias.has(n)) instancias.set(n, new TimerAlarm({ storage: almacen() }, env));
      const o = instancias.get(n); return { fetch: (url, init) => o.fetch(new Request(url, init)) };
    } };
    const pend = [];
    await __worker.scheduled({ cron: '*/5 * * * *' }, env, { waitUntil: (p) => pend.push(p) });
    await Promise.all(pend);
    const gh = llamadas.find((l) => l.url.includes('api.github.com'));
    expect(gh.url).toBe('https://api.github.com/repos/Loustau45261470/Centro-de-mando/actions/workflows/push-reminders.yml/dispatches');
    expect(gh.init.method).toBe('POST');
    expect(gh.init.headers.Authorization).toBe('Bearer tok-dispatch');   // el token propio gana sobre el de datos
    expect(JSON.parse(gh.init.body)).toEqual({ ref: 'main' });
    const salud = await (await env.TIMER.get('__salud__').fetch('https://do/salud')).json();
    expect(salud.cron.status).toBe(204);
  });

  test('scheduled(): un 403 (token sin permiso) queda registrado y no tira excepción', async () => {
    const f = async () => ({ status: 403, text: async () => '{"message":"Resource not accessible"}' });
    const { TimerAlarm, __worker } = cargar(f);
    const instancias = new Map();
    const env = { GH_DATA_TOKEN: 'tok-datos' };   // sin GH_DISPATCH_TOKEN: cae al de datos (como hoy)
    env.TIMER = { idFromName: (n) => n, get: (n) => {
      if (!instancias.has(n)) instancias.set(n, new TimerAlarm({ storage: almacen() }, env));
      const o = instancias.get(n); return { fetch: (url, init) => o.fetch(new Request(url, init)) };
    } };
    const pend = [];
    await __worker.scheduled({}, env, { waitUntil: (p) => pend.push(p) });
    await Promise.all(pend);
    expect((await (await env.TIMER.get('__salud__').fetch('https://do/salud')).json()).cron.status).toBe(403);
  });

  test('el subject VAPID del Worker es una URL, no un email', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'cf-worker', 'src', 'index.js'), 'utf8');
    expect(src).not.toMatch(/mailto:/);
    expect(src).toContain("VAPID_SUBJECT = 'https://");
  });
});
