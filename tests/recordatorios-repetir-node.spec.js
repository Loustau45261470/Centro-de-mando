// Recordatorios que se repiten («cada 2 h de 9 a 21»): lógica pura de deadlines.js (sin navegador) y envío de push-reminders.js con mocks.
// Datos de ejemplo inventados. 2026-11-24 es martes. Hora de Argentina (-03:00).
'use strict';
const { test, expect } = require('@playwright/test');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const D = require(path.join(ROOT, 'deadlines.js'));
const P = require(path.join(ROOT, 'push-reminders.js'));
const TZ = '-03:00';
const BORRAR = { __borrar: true };
const clone = (x) => JSON.parse(JSON.stringify(x));
const ms = (fecha, hora) => Date.parse(fecha + 'T' + hora + ':00' + TZ);
const estado = (reminders) => ({ foco: { config: { horas: [] } }, reminders: { vida: reminders } });
const agua = (repetir, extra) => Object.assign({ id: 'agua', title: 'Tomar agua', datetime: '2026-11-24T09:00', priority: 'medium', repetir }, extra || {});
const REP_2H = { cada: 2, unidad: 'h', desde: '09:00', hasta: '21:00', dias: [0, 1, 2, 3, 4, 5, 6] };
const occ = (r, fecha, hora, opts) => D.repOcurrencias(r, ms(fecha, hora), Object.assign({ tz: TZ }, opts));

// Recorre un día cada 5 min (como el cron) acumulando lo ya avisado; devuelve las claves en orden.
function avisosDelDia(state, fecha) {
  const seen = {}, orden = [];
  for (let m = 0; m < 24 * 60; m += 5) {
    const now = ms(fecha, String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
    D.dueAlerts(state, { now, tz: TZ, seen }).forEach((a) => { orden.push(a.key); seen[a.key] = true; });
  }
  return orden;
}

test.describe('deadlines.js: recordatorios repetidos', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });

  test('cada 2 h de 9 a 21: avisa a las 09, 11, 13, 15, 17, 19 y 21, una sola vez cada una', () => {
    const claves = avisosDelDia(estado([agua(REP_2H)]), '2026-11-24');
    expect(claves).toEqual(['09', '11', '13', '15', '17', '19', '21'].map((h) => `agua@2026-11-24T${h}:00`));
    expect(new Set(claves).size).toBe(claves.length);
  });

  test('ocurrencia vigente y próxima: nunca se expande la serie', () => {
    const r = agua(REP_2H);
    let o = occ(r, '2026-11-24', '10:30');
    expect(o.actual).toBeNull();                                  // las 09:00 pasaron hace 90 min: fuera de la ventana de 60
    expect(o.proxima.datetime).toBe('2026-11-24T11:00');
    o = occ(r, '2026-11-24', '11:20');
    expect(o.actual.datetime).toBe('2026-11-24T11:00');
    expect(o.proxima.datetime).toBe('2026-11-24T13:00');
    // Pasada la última del día, la próxima es la primera de mañana.
    o = occ(r, '2026-11-24', '22:30');
    expect(o.actual).toBeNull();
    expect(o.proxima.datetime).toBe('2026-11-25T09:00');
    // El collect trae como mucho 2 ocurrencias del recordatorio (vigente + próxima), aunque lleve meses repitiendo.
    const items = D.collect(estado([agua(REP_2H, { datetime: '2026-01-01T09:00' })]), { now: ms('2026-11-24', '11:20'), tz: TZ });
    expect(items.filter((i) => i.id === 'agua').length).toBe(2);
    expect(items.every((i) => i.kind === 'rec' && i.repeticion)).toBe(true);
  });

  test('de lunes a viernes: el sábado salta al lunes; domingo solo si está marcado', () => {
    const lv = agua({ cada: 2, unidad: 'h', desde: '09:00', hasta: '21:00', dias: [1, 2, 3, 4, 5] });
    expect(occ(lv, '2026-11-28', '12:00').proxima.datetime).toBe('2026-11-30T09:00');   // sábado → lunes
    expect(occ(lv, '2026-11-27', '22:00').proxima.datetime).toBe('2026-11-30T09:00');   // viernes noche → lunes
    expect(avisosDelDia(estado([lv]), '2026-11-28')).toEqual([]);
    const dom = agua({ cada: 1, unidad: 'h', desde: '10:00', hasta: '12:00', dias: [0] });
    expect(occ(dom, '2026-11-25', '08:00').proxima.datetime).toBe('2026-11-29T10:00');   // 29/11/2026 es domingo
  });

  test('mínimo 15 minutos: menos se rechaza y el recordatorio sigue como uno común', () => {
    expect(D.repValidar({ cada: 10, unidad: 'min', desde: '09:00', hasta: '10:00' })).toMatch(/mínimo.*15/);
    expect(D.repValidar({ cada: 15, unidad: 'min', desde: '09:00', hasta: '10:00' })).toBe('');
    expect(D.REP_MIN_MIN).toBe(15);
    const r15 = agua({ cada: 15, unidad: 'min', desde: '09:00', hasta: '10:00' });
    expect(avisosDelDia(estado([r15]), '2026-11-24')).toEqual(['09:00', '09:15', '09:30', '09:45', '10:00'].map((h) => `agua@2026-11-24T${h}`));
    // Con repetición inválida el collect lo trata como recordatorio común (sin ocurrencias repetidas).
    const malo = agua({ cada: 5, unidad: 'min', desde: '09:00', hasta: '10:00' });
    const items = D.collect(estado([malo]), { now: ms('2026-11-24', '08:00'), tz: TZ });
    expect(items.some((i) => i.repeticion)).toBe(false);
  });

  test('validación: no cruza la medianoche, cada N entero, unidad y horas obligatorias', () => {
    expect(D.repValidar({ cada: 1, unidad: 'h', desde: '22:00', hasta: '02:00' })).toMatch(/medianoche/);
    expect(D.repValidar({ cada: 2, unidad: 'h', desde: '09:00', hasta: '09:00' })).toBe('');   // una sola vez por día
    expect(D.repValidar({ cada: 0, unidad: 'h', desde: '09:00', hasta: '10:00' })).not.toBe('');
    expect(D.repValidar({ cada: 1.5, unidad: 'h', desde: '09:00', hasta: '10:00' })).not.toBe('');
    expect(D.repValidar({ cada: 2, unidad: 'x', desde: '09:00', hasta: '10:00' })).not.toBe('');
    expect(D.repValidar({ cada: 2, unidad: 'h' })).not.toBe('');
    expect(D.repValidar({ cada: 2, unidad: 'h', desde: '09:00', hasta: '10:00', dias: [7] })).not.toBe('');
    expect(D.repValidar({ cada: 3, unidad: 'd', fin: 'mañana' })).not.toBe('');
    expect(D.repValidar(null)).not.toBe('');
  });

  test('cada N días: a la hora del recordatorio, desde la fecha de inicio', () => {
    const r = agua({ cada: 3, unidad: 'd' }, { datetime: '2026-11-24T08:30' });
    expect(occ(r, '2026-11-24', '08:00').proxima.datetime).toBe('2026-11-24T08:30');
    let o = occ(r, '2026-11-26', '08:40');
    expect(o.actual).toBeNull();
    expect(o.proxima.datetime).toBe('2026-11-27T08:30');
    o = occ(r, '2026-11-27', '08:45');
    expect(o.actual.datetime).toBe('2026-11-27T08:30');
    expect(o.proxima.datetime).toBe('2026-11-30T08:30');
    // Mucho tiempo después sigue calculando sin recorrer la serie: 2026-11-24 + 3*100 días = 2027-09-20.
    expect(occ(r, '2027-09-19', '12:00').proxima.datetime).toBe('2027-09-20T08:30');
    // En 3 días hay 1 sola ocurrencia → un solo aviso por ventana.
    expect(avisosDelDia(estado([r]), '2026-11-27')).toEqual(['agua@2026-11-27T08:30']);
    expect(avisosDelDia(estado([r]), '2026-11-28')).toEqual([]);
  });

  test('antes del comienzo no hay nada; fecha final corta la serie; pausa y «visto» apagan', () => {
    const futuro = agua(REP_2H, { datetime: '2026-12-01T09:00' });
    expect(occ(futuro, '2026-11-24', '10:00').proxima.datetime).toBe('2026-12-01T09:00');
    expect(avisosDelDia(estado([futuro]), '2026-11-24')).toEqual([]);
    const conFin = agua(Object.assign({}, REP_2H, { fin: '2026-11-24' }));
    expect(occ(conFin, '2026-11-24', '22:00').proxima).toBeNull();                 // pasó el último día: ya terminó
    expect(avisosDelDia(estado([conFin]), '2026-11-25')).toEqual([]);
    const pausado = agua(Object.assign({}, REP_2H, { pausado: true }));
    expect(occ(pausado, '2026-11-24', '11:10')).toEqual({ actual: null, proxima: null });
    expect(avisosDelDia(estado([pausado]), '2026-11-24')).toEqual([]);
    // «Visto» la de las 11: ya no figura como vigente ni avisa, y la de las 13 sigue en pie.
    const visto = agua(Object.assign({}, REP_2H, { visto: '2026-11-24T11:00' }));
    const o = occ(visto, '2026-11-24', '11:10');
    expect(o.actual).toBeNull();
    expect(o.proxima.datetime).toBe('2026-11-24T13:00');
    expect(avisosDelDia(estado([visto]), '2026-11-24')).toEqual(['13', '15', '17', '19', '21'].map((h) => `agua@2026-11-24T${h}:00`));
  });

  test('cada ocurrencia tiene su clave, sin heredar claves viejas del recordatorio común', () => {
    const r = agua(REP_2H);
    // Aunque el recordatorio ya hubiera avisado antes como común (clave sin fecha), las ocurrencias avisan.
    const due = D.dueAlerts(estado([r]), { now: ms('2026-11-24', '11:02'), tz: TZ, seen: { agua: true, 'agua@2026-11-24T09:00': true } });
    expect(due.map((a) => a.key)).toEqual(['agua@2026-11-24T11:00']);
    expect(due[0].title).toContain('Recordatorio');
    expect(due[0].body).toContain('Tomar agua');
    expect(due[0].lead).toBe(false);
  });

  test('compatibilidad: un recordatorio sin repetir se comporta igual que siempre', () => {
    const st = estado([{ id: 'r1', title: 'Pagar luz', datetime: '2026-11-24T10:00', priority: 'high' }]);
    const items = D.collect(st, { now: ms('2026-11-24', '09:00'), tz: TZ });
    expect(items.length).toBe(1);
    expect(items[0].repeticion).toBeUndefined();
    expect(items[0].alerts.map((a) => a.key)).toEqual(['r1@2026-11-24T10:00_1d', 'r1@2026-11-24T10:00']);
  });
});

// ── push-reminders.js con un Firestore y un web-push de mentira ──
function armar(docInicial) {
  const doc = clone(docInicial);
  const sends = [];
  const aplicar = (upd) => Object.keys(upd).forEach((k) => {
    const p = k.split('.'); let o = doc;
    p.slice(0, -1).forEach((x) => { o = o[x] = o[x] || {}; });
    if (upd[k] === BORRAR) delete o[p[p.length - 1]]; else o[p[p.length - 1]] = clone(upd[k]);
  });
  const ref = { get: async () => ({ data: () => clone(doc) }), update: async (upd) => aplicar(upd) };
  const db = { runTransaction: async (fn) => fn({ get: async () => ref.get(), update: (_r, upd) => aplicar(upd) }) };
  const webpush = {
    setVapidDetails: () => {},
    sendNotification: async (sub, payload) => { const j = JSON.parse(payload); sends.push({ tag: j.tag, title: j.title, body: j.body }); return { statusCode: 201 }; },
  };
  return { doc, sends, correr: (now) => P.run({ ref, db, webpush, FieldValue: { delete: () => BORRAR }, now }) };
}

test.describe('push-reminders.js: recordatorio repetido', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });

  test('manda la ocurrencia que toca, una sola vez, y la siguiente a su hora', async () => {
    const t = armar({
      state: JSON.stringify(estado([agua(REP_2H)])), vapidKeys: { pubKey: 'pub', sigKey: 'sig' }, notifiedReminders: {},
      pushSubscriptions: { dA: { sub: { endpoint: 'https://push.A.invalido/x', keys: { p256dh: 'a', auth: 'b' } }, ua: 'iPhone', updatedAt: 1 } },
    });
    await t.correr(ms('2026-11-24', '10:00'));                       // entre las 09 y las 11: nada para mandar (las 09:00 pasó hace 60 min y es "aviso de momento")
    const previos = t.sends.map((s) => s.tag);
    expect(previos).not.toContain('agua@2026-11-24T11:00');
    t.sends.length = 0;
    await t.correr(ms('2026-11-24', '11:03'));                       // cron corriendo 3 min tarde
    expect(t.sends.map((s) => s.tag)).toEqual(['agua@2026-11-24T11:00']);
    expect(t.sends[0].body).toContain('Tomar agua');
    await t.correr(ms('2026-11-24', '11:08'));                       // la corrida siguiente no lo repite
    await t.correr(ms('2026-11-24', '11:13'));
    expect(t.sends.length).toBe(1);
    expect(t.doc.notifiedReminders['agua@2026-11-24T11:00']).toBe(true);
    await t.correr(ms('2026-11-24', '13:01'));                       // dos horas después: la siguiente ocurrencia
    expect(t.sends.map((s) => s.tag)).toEqual(['agua@2026-11-24T11:00', 'agua@2026-11-24T13:00']);
    // En pausa: no sale nada más.
    const pausado = estado([agua(Object.assign({}, REP_2H, { pausado: true }))]);
    t.doc.state = JSON.stringify(pausado);
    await t.correr(ms('2026-11-24', '15:01'));
    expect(t.sends.length).toBe(2);
  });
});
