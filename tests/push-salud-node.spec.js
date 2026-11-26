// Notificaciones push (lado Node, sin red): claves de "ya avisado" con fecha (reprogramar vuelve a avisar, compatibilidad con
// las claves viejas), poda real del mapa notifiedReminders, persistencia por lotes, TTL/timeout y fallos consecutivos por dispositivo.
'use strict';
const { test, expect } = require('@playwright/test');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const D = require(path.join(ROOT, 'deadlines.js'));
const P = require(path.join(ROOT, 'push-reminders.js'));
const TZ = '-03:00';
const BORRAR = { __borrar: true };
const clone = (x) => JSON.parse(JSON.stringify(x));

// "Ahora" fijo: 2026-11-24 10:00 en Argentina (13:00 UTC).
const NOW = Date.parse('2026-11-24T13:00:00Z');
const estado = (reminders, extra) => Object.assign({ foco: { config: { horas: [] } }, reminders: { vida: reminders } }, extra || {});
const rec = (id, datetime) => ({ id, title: 'T ' + id, datetime, priority: 'high' });
const keysDue = (state, now, seen) => D.dueAlerts(state, { now, tz: TZ, seen: seen || {} }).map((a) => a.key);

test.describe('deadlines.js: claves de aviso con fecha', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });

  test('recordatorio: la clave lleva id@fecha y el aviso sale una sola vez', () => {
    const st = estado([rec('r1', '2026-11-24T10:00')]);
    expect(keysDue(st, NOW)).toEqual(['r1@2026-11-24T10:00']);
    expect(keysDue(st, NOW, { 'r1@2026-11-24T10:00': true })).toEqual([]);
  });

  test('recordatorio reprogramado tras avisar: vuelve a avisar', () => {
    const seen = { 'r1@2026-11-24T10:00': true };
    const movido = estado([rec('r1', '2026-11-25T10:00')]);
    expect(keysDue(movido, NOW + 24 * 3600000, seen)).toEqual(['r1@2026-11-25T10:00']);
  });

  test('proyecto, final, cursada y pedido: la clave lleva la fecha y reprogramar re-avisa; las proyecciones (SGC retirado) ya no avisan', () => {
    const mk = (f1, p1, c1, y1, o1) => ({
      foco: { config: { horas: [] } },
      proyectos: { vida: [{ id: 'p1', label: 'P', dueDate: p1 }] },
      sgc: { finales: [{ id: 'f1', materia: 'M', fecha: f1 }], proyecciones: [{ id: 'y1', simbolo: 'X', fechaVence: y1 }] },
      cursada: [{ id: 'c1', materia: 'M', tipo: 'foro', fecha: c1 }],
      orders: [{ id: 'o1', name: 'Caja', arrival: o1 }],
    });
    const dia = '2026-12-01', nuevo = '2026-12-08';
    const ahora = Date.parse(dia + 'T12:00:00Z');   // 09:00 de Argentina: salta el "Hoy"
    const antes = keysDue(mk(dia, dia, dia, dia, dia), ahora);
    ['proy_p1@', 'final_f1@', 'curs_c1@', 'ord_o1@'].forEach((pre) => {
      expect(antes.some((k) => k.startsWith(pre + dia + 'T23:59_due'))).toBe(true);
    });
    expect(antes.some((k) => k.startsWith('proye_'))).toBe(false);
    const seen = Object.fromEntries(antes.map((k) => [k, true]));
    expect(keysDue(mk(dia, dia, dia, dia, dia), ahora, seen)).toEqual([]);
    // Se reprograman todos una semana después: a las 09:00 del nuevo día vuelven a avisar.
    const despues = keysDue(mk(nuevo, nuevo, nuevo, nuevo, nuevo), Date.parse(nuevo + 'T12:00:00Z'), seen);
    ['proy_p1@', 'final_f1@', 'curs_c1@', 'ord_o1@'].forEach((pre) => {
      expect(despues.some((k) => k.startsWith(pre + nuevo + 'T23:59_due'))).toBe(true);
    });
  });

  test('claves viejas (sin fecha): si la fecha no cambió se tratan como avisadas, sin ola de reavisos', () => {
    const st = estado([rec('r1', '2026-11-24T10:00')]);
    expect(keysDue(st, NOW, { r1: true })).toEqual([]);
    expect(D.migrarClaves(st, { now: NOW, tz: TZ }, { r1: true })).toEqual(['r1@2026-11-24T10:00']);
    // Final con la clave vieja de su aviso de las 09:00.
    const fin = { foco: { config: { horas: [] } }, sgc: { finales: [{ id: 'f1', materia: 'M', fecha: '2026-12-01' }] } };
    const t = Date.parse('2026-12-01T12:00:00Z');
    expect(keysDue(fin, t, { 'final_f1_due': true })).toEqual([]);
    expect(D.migrarClaves(fin, { now: t, tz: TZ }, { final_f1_due: true })).toEqual(['final_f1@2026-12-01T23:59_due']);
  });

  test('clave vieja + fecha corrida a futuro: no se hereda, así que avisa cuando llega la nueva', () => {
    const futuro = estado([rec('r1', '2026-11-26T10:00')]);
    expect(D.migrarClaves(futuro, { now: NOW, tz: TZ }, { r1: true, r1_1d: true })).toEqual([]);
    expect(keysDue(futuro, Date.parse('2026-11-26T13:00:00Z'), {})).toEqual(['r1@2026-11-26T10:00']);
  });
});

// ── doble de Firestore + web-push en memoria, para llamar a run() sin red ──
function armar(docInicial, comportamiento) {
  const doc = clone(docInicial);
  const updates = [];
  const sends = [];   // { endpoint, tag, opts, docAlEnviar }
  const aplicar = (upd) => Object.keys(upd).forEach((k) => {
    const p = k.split('.'); let o = doc;
    p.slice(0, -1).forEach((x) => { o = o[x] = o[x] || {}; });
    if (upd[k] === BORRAR) delete o[p[p.length - 1]]; else o[p[p.length - 1]] = clone(upd[k]);
  });
  const ref = {
    get: async () => ({ data: () => clone(doc) }),
    update: async (upd) => { updates.push(clone(upd)); aplicar(upd); },
  };
  const db = { runTransaction: async (fn) => fn({ get: async () => ref.get(), update: (_r, upd) => aplicar(upd) }) };
  const vapidArgs = [];
  const webpush = {
    setVapidDetails: (...a) => vapidArgs.push(a),
    sendNotification: async (sub, payload, opts) => {
      const tag = JSON.parse(payload).tag;
      sends.push({ endpoint: sub.endpoint, tag, opts, docAlEnviar: clone(doc) });
      const r = comportamiento ? comportamiento(sub.endpoint, tag) : 'ok';
      if (r === 'ok') return { statusCode: 201 };
      const e = new Error('mock ' + r); e.statusCode = r; throw e;
    },
  };
  const correr = (now) => P.run({ ref, db, webpush, FieldValue: { delete: () => BORRAR }, now });
  return { doc, updates, sends, vapidArgs, correr };
}
const sub = (n) => ({ endpoint: 'https://push.' + n + '.invalido/x', keys: { p256dh: 'a', auth: 'b' } });
const docCon = (reminders, extra) => Object.assign({
  state: JSON.stringify(estado(reminders)), vapidKeys: { pubKey: 'pub', sigKey: 'sig' }, notifiedReminders: {},
  pushSubscriptions: { dA: { sub: sub('A'), ua: 'iPhone', updatedAt: 1 } },
}, extra || {});

test.describe('push-reminders.js: poda, lotes, TTL y salud', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });

  test('el VAPID subject es una URL, no un email personal', async () => {
    const t = armar(docCon([rec('r1', '2026-11-24T10:00')]));
    await t.correr(NOW);
    expect(t.vapidArgs[0][0]).toMatch(/^https:\/\//);
    expect(t.vapidArgs[0][0]).not.toContain('@');
  });

  test('cada envío lleva TTL y timeout explícitos', async () => {
    const t = armar(docCon([rec('r1', '2026-11-24T10:00')]));
    await t.correr(NOW);
    expect(t.sends[0].opts.timeout).toBeGreaterThan(0);
    expect(t.sends[0].opts.TTL).toBeGreaterThan(0);
  });

  test('poda: update reemplaza el mapa y las claves viejas desaparecen de verdad', async () => {
    const viejas = Object.fromEntries(Array.from({ length: 60 }, (_, i) => ['vieja' + i + '@2025-01-01T10:00', true]));
    const t = armar(docCon([rec('r1', '2026-11-24T10:00')], { notifiedReminders: Object.assign({ 'r1@2026-11-24T10:00_1d': true }, viejas) }));
    await t.correr(NOW);
    const keys = Object.keys(t.doc.notifiedReminders).sort();
    expect(keys).toEqual(['r1@2026-11-24T10:00', 'r1@2026-11-24T10:00_1d']);   // lo recién enviado + lo vivo; las 60 viejas, fuera
  });

  test('podarNotificados: lo fuera de horizonte se va, lo marcado y lo migrado se queda', () => {
    const items = D.collect(estado([rec('r1', '2026-11-24T10:00')]), { now: NOW, tz: TZ });
    const out = P.podarNotificados(items, { 'r1@2026-11-24T10:00_1d': true, 'basura': true }, { nueva: true }, ['migrada'], NOW);
    expect(Object.keys(out).sort()).toEqual(['migrada', 'nueva', 'r1@2026-11-24T10:00_1d']);
  });

  test('migración al desplegar: la clave vieja se reemplaza por la nueva y no se reenvía', async () => {
    const t = armar(docCon([rec('r1', '2026-11-24T10:00')], { notifiedReminders: { r1: true } }));
    await t.correr(NOW);
    expect(t.sends).toHaveLength(0);
    expect(Object.keys(t.doc.notifiedReminders)).toEqual(['r1@2026-11-24T10:00']);
  });

  test('lotes: lo enviado se persiste antes de seguir (un job que muere a mitad no reenvía todo)', async () => {
    const rs = Array.from({ length: 12 }, (_, i) => rec('r' + i, '2026-11-24T10:00'));
    const t = armar(docCon(rs));
    await t.correr(NOW);
    expect(t.sends).toHaveLength(12);
    // Al arrancar el 2º lote (envío nº 6), el 1º lote (5 avisos) ya estaba escrito en el documento.
    expect(Object.keys(t.sends[5].docAlEnviar.notifiedReminders)).toHaveLength(5);
    expect(Object.keys(t.sends[10].docAlEnviar.notifiedReminders)).toHaveLength(10);
    expect(Object.keys(t.doc.notifiedReminders)).toHaveLength(12);
  });

  test('401 repetido (VAPID no coincide): visible recién a la 3ª corrida seguida, y esa corrida sale con error una sola vez', async () => {
    const t = armar(docCon([rec('r1', '2026-11-24T10:00')]), () => 401);
    expect(await t.correr(NOW)).toBe(0);
    expect(t.doc.pushHealth.fallos.dA).toMatchObject({ n: 1, code: 401, dead: false, ua: 'iPhone' });
    expect(await t.correr(NOW + 60000)).toBe(0);
    expect(t.doc.pushHealth.fallos.dA.n).toBe(2);
    expect(await t.correr(NOW + 120000)).toBe(1);
    expect(t.doc.pushHealth.fallos.dA.n).toBe(3);
    expect(await t.correr(NOW + 180000)).toBe(0);   // ya estaba visible: no repite el mail
    expect(t.doc.pushHealth.fallos.dA.n).toBe(4);
    expect(t.doc.notifiedReminders).toEqual({});     // nunca marcó como enviado lo que no salió
  });

  test('un envío exitoso borra el contador del dispositivo', async () => {
    let falla = true;
    const t = armar(docCon([rec('r1', '2026-11-24T10:00')]), () => (falla ? 500 : 'ok'));
    await t.correr(NOW); await t.correr(NOW + 60000);
    expect(t.doc.pushHealth.fallos.dA.n).toBe(2);
    falla = false;
    await t.correr(NOW + 120000);
    expect(t.doc.pushHealth.fallos.dA).toBeUndefined();
  });

  test('sin nada para enviar no hay evidencia: el contador no se mueve', async () => {
    const t = armar(docCon([rec('r1', '2026-11-24T10:00')], { pushHealth: { fallos: { dA: { n: 2, code: 500, desde: 1, at: NOW - 1000, ua: 'iPhone', dead: false } } }, notifiedReminders: { 'r1@2026-11-24T10:00': true } }), () => 500);
    await t.correr(NOW + 60000);
    expect(t.sends).toHaveLength(0);
    expect(t.doc.pushHealth.fallos.dA.n).toBe(2);
  });

  test('un dispositivo muerto y otro vivo: se borra el muerto, el vivo recibe, queda registrado y el job no falla', async () => {
    const t = armar(docCon([rec('r1', '2026-11-24T10:00')], { pushSubscriptions: { dA: { sub: sub('A'), ua: 'iPhone', updatedAt: 1 }, dB: { sub: sub('B'), ua: 'Windows', updatedAt: 2 } } }),
      (ep) => (ep.includes('push.A.') ? 410 : 'ok'));
    expect(await t.correr(NOW)).toBe(0);
    expect(Object.keys(t.doc.pushSubscriptions)).toEqual(['dB']);
    expect(t.doc.pushHealth.fallos.dA).toMatchObject({ dead: true, code: 410, ua: 'iPhone' });
    expect(t.doc.pushHealth.fallos.dB).toBeUndefined();
    expect(Object.keys(t.doc.notifiedReminders)).toHaveLength(1);
  });
});

test.describe('evaluarSalud (función pura)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });
  const tg = (id, updatedAt) => ({ sub: sub(id), ids: [id], ua: 'X', updatedAt: updatedAt || 0 });

  test('suma, resetea y marca "nuevos" solo al cruzar el umbral', () => {
    let prev = {};
    for (let i = 1; i <= 4; i++) {
      const r = P.evaluarSalud(prev, [tg('d1')], [{ probado: true, ok: false, code: 503 }], 1000 * i);
      expect(r.fallos.d1.n).toBe(i);
      expect(r.nuevos).toEqual(i === P.FALLOS_MAX ? ['d1'] : []);
      expect(r.graves).toEqual(r.nuevos);
      prev = r.fallos;
    }
    expect(P.evaluarSalud(prev, [tg('d1')], [{ probado: true, ok: true, code: 0 }], 9000).fallos.d1).toBeUndefined();
  });

  test('404/410 es visible de inmediato y no es "grave" (no pone el job en rojo)', () => {
    const r = P.evaluarSalud({}, [tg('d1')], [{ probado: true, ok: false, code: 410 }], 1000);
    expect(r.nuevos).toEqual(['d1']);
    expect(r.graves).toEqual([]);
    expect(r.fallos.d1.dead).toBe(true);
  });

  test('re-suscripción posterior al fallo (updatedAt mayor): el fallo viejo se limpia; y lo abandonado vence a los 30 días', () => {
    const prev = { d1: { n: 5, code: 500, desde: 1, at: 5000, ua: 'X', dead: false } };
    expect(P.evaluarSalud(prev, [tg('d1', 6000)], [{ probado: false }], 7000).fallos.d1).toBeUndefined();
    expect(P.evaluarSalud(prev, [tg('d1', 4000)], [{ probado: false }], 7000).fallos.d1).toBeDefined();
    expect(P.evaluarSalud(prev, [], [], 5000 + 31 * 24 * 3600000).fallos.d1).toBeUndefined();
  });
});
