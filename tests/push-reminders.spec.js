// push-reminders.js (cron de Web Push) con el envío mockeado: qué se marca como avisado,
// cuándo se declara muerta la suscripción (pushDead) y cuándo sale con error.
'use strict';
const { test, expect } = require('@playwright/test');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MOCK = path.join(__dirname, 'support', 'mock-push-node.js');

// Corre el cron una vez con `doc` de partida y devuelve { code, doc, sends, out }.
function correr(doc, envio, extraEnv) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-push-'));
  const fDoc = path.join(dir, 'doc.json'), fOut = path.join(dir, 'out.json');
  fs.writeFileSync(fDoc, JSON.stringify(doc));
  const r = spawnSync(process.execPath, ['-r', MOCK, path.join(ROOT, 'push-reminders.js')], {
    cwd: ROOT, encoding: 'utf8',
    env: Object.assign({}, process.env, { FIREBASE_SERVICE_ACCOUNT: '{}', MOCK_DOC: fDoc, MOCK_OUT: fOut, MOCK_SEND: envio }, extraEnv || {}),
  });
  const res = fs.existsSync(fOut) ? JSON.parse(fs.readFileSync(fOut, 'utf8')) : { doc: null, sends: [] };
  return { code: r.status, doc: res.doc, sends: res.sends, out: r.stdout + r.stderr };
}

// Documento con UN recordatorio que venció hace 2 minutos (hora de Argentina, UTC-3).
function docBase() {
  const dt = new Date(Date.now() - 3 * 3600000 - 2 * 60000).toISOString().slice(0, 16);
  const state = { foco: { config: { horas: [] } }, reminders: { vida: [{ id: 'r1', title: 'Prueba de aviso', datetime: dt, priority: 'high' }] } };   // sin chequeos de Foco: el test mira solo el recordatorio
  return {
    state: JSON.stringify(state),
    pushSubscription: { endpoint: 'https://push.invalido/x', keys: { p256dh: 'a', auth: 'b' } },
    vapidKeys: { pubKey: 'pub', sigKey: 'sig' },
    notifiedReminders: {},
  };
}

test.describe('push-reminders.js', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador: una sola vez alcanza'); });

  test('envío exitoso: marca el aviso como enviado y sale con 0', () => {
    const r = correr(docBase(), 'ok');
    expect(r.code).toBe(0);
    expect(r.sends).toHaveLength(1);
    expect(Object.keys(r.doc.notifiedReminders)).toEqual(r.sends);
    expect(r.doc.pushDead).toBeUndefined();
  });

  test('fallo transitorio (500): NO marca, no declara pushDead y se reintenta en la próxima corrida', () => {
    const r1 = correr(docBase(), '500');
    expect(r1.code).toBe(0);
    expect(r1.sends).toHaveLength(1);
    expect(r1.doc.notifiedReminders).toEqual({});
    expect(r1.doc.pushDead).toBeUndefined();
    // La próxima corrida lo vuelve a intentar y, si sale, recién ahí lo marca.
    const r2 = correr(r1.doc, 'ok');
    expect(r2.sends).toHaveLength(1);
    expect(Object.keys(r2.doc.notifiedReminders)).toEqual(r2.sends);
  });

  test('410: no marca, guarda pushDead una sola vez y solo esa corrida sale con error; un éxito posterior lo borra', () => {
    const base = docBase();
    const estado = base.state;

    const r1 = correr(base, '410');
    expect(r1.code).not.toBe(0);
    expect(r1.out).toContain('::error::');
    expect(r1.doc.notifiedReminders).toEqual({});
    expect(r1.doc.pushDead).toMatchObject({ code: 410 });
    expect(Number.isNaN(Date.parse(r1.doc.pushDead.at))).toBe(false);
    expect(r1.doc.state).toBe(estado);   // el campo state no se toca

    // Segunda corrida, mismo 410: ya estaba marcado → no reescribe `at` y sale con 0 (un solo mail).
    // (El cron ya borró la suscripción legada muerta; se repone para simular que el dispositivo la reescribió y sigue muerta.)
    expect(r1.doc.pushSubscription).toBeUndefined();
    r1.doc.pushSubscription = base.pushSubscription;
    const r2 = correr(r1.doc, '410');
    expect(r2.code).toBe(0);
    expect(r2.out).toContain('::error::');
    expect(r2.doc.pushDead).toEqual(r1.doc.pushDead);
    expect(r2.doc.notifiedReminders).toEqual({});

    // Tras reactivar en la app (suscripción nueva), un envío exitoso borra pushDead y marca el aviso.
    r2.doc.pushSubscription = base.pushSubscription;
    const r3 = correr(r2.doc, 'ok');
    expect(r3.code).toBe(0);
    expect(r3.doc.pushDead).toBeUndefined();
    expect(Object.keys(r3.doc.notifiedReminders)).toEqual(r3.sends);
  });

  test('404 también cuenta como suscripción muerta', () => {
    const r = correr(docBase(), '404');
    expect(r.code).not.toBe(0);
    expect(r.doc.pushDead).toMatchObject({ code: 404 });
  });

  test('error fatal en main (Firestore caído): sale con 1, no con 0', () => {
    const r = correr(docBase(), 'ok', { MOCK_GET_FALLA: '1' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('firestore caído');
  });
});
