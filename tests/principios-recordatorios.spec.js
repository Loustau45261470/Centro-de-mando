// Etapa C de specs/principios-y-revisiones.md: recordatorios de principios (horario por push, diario y por datos dentro del Centro).
'use strict';
const { test, expect } = require('./support/fixtures');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const D = require('../deadlines.js');
const P = require('../principios.js');

const ROOT = path.resolve(__dirname, '..');
const MOCK = path.join(__dirname, 'support', 'mock-push-node.js');
const TZ = '-03:00';
const HOY = '2026-11-12';
const prin = (o) => Object.assign({ id: 'p1', tipo: 'principio', enunciado: 'Lo más difícil primero', porque: 'La energía es más alta temprano', seccion: 'Vida', haz: '', noHagas: '', fuente: '', habitosIds: [] }, o);

// ── Reglas por datos (puro, Node) ──────────────────────────────────────────
test.describe('prEvaluarRegla: cada plantilla, activa e inactiva', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });
  const ev = (regla, datos, hoy) => P.prEvaluarRegla(regla, datos, hoy || HOY);

  test('hábito sin cumplir: cuenta desde el último "done"; hoy cumplido o nunca cumplido = inactiva', () => {
    const ht = (days) => ({ habitTrackers: { salud: [{ id: 'h1', name: 'Leer', days }] } });
    const r = { plantilla: 'habito_sin_cumplir', habito: 'salud|h1', dias: 4 };
    // Último done 11-08, hoy 11-12. Días COMPLETOS sin cumplir: 09, 10, 11 = 3 (hoy no cuenta hasta que termina).
    const r3 = Object.assign({}, r, { dias: 3 });
    expect(ev(r3, ht({ '2026-11-08': 'done', '2026-11-10': 'missed' }))).toEqual({ activa: true, detalle: 'Llevás 3 días sin cumplir «Leer»' });
    expect(ev(r, ht({ '2026-11-08': 'done' })).activa).toBe(false);   // 3 < 4
    // Con 11-10 en 'rest' (descanso) no cuenta: 09 y 11 = 2.
    expect(ev(Object.assign({}, r, { dias: 2 }), ht({ '2026-11-08': 'done', '2026-11-10': 'rest' }))).toEqual({ activa: true, detalle: 'Llevás 2 días sin cumplir «Leer»' });
    expect(ev(r3, ht({ '2026-11-08': 'done', '2026-11-10': 'rest' })).activa).toBe(false);
    expect(ev(r, ht({ '2026-11-08': 'done', [HOY]: 'done' })).activa).toBe(false);
    expect(ev(r, ht({})).activa).toBe(false);                                   // nunca cumplido: sin dato
    expect(ev({ plantilla: 'habito_sin_cumplir', habito: 'salud|nada', dias: 1 }, ht({ '2026-11-08': 'done' })).activa).toBe(false);   // hábito borrado
  });

  test('sin entrenar: el día con series vacías no cuenta como entreno', () => {
    const wl = { '2026-11-09': { Press: [{ reps: '8', weight: '' }] }, '2026-11-11': { Press: [{ reps: '', weight: '' }] } };
    // Último entreno real 11-09 (el 11-11 está vacío), hoy 11-12. Días COMPLETOS sin entrenar: 10 y 11 = 2 (hoy no cuenta).
    expect(ev({ plantilla: 'sin_entrenar', dias: 2 }, { workoutLog: wl })).toEqual({ activa: true, detalle: 'Llevás 2 días sin entrenar' });
    expect(ev({ plantilla: 'sin_entrenar', dias: 3 }, { workoutLog: wl }).activa).toBe(false);
    expect(ev({ plantilla: 'sin_entrenar', dias: 1 }, { workoutLog: {} }).activa).toBe(false);   // sin ningún registro: sin dato
    expect(ev({ plantilla: 'sin_entrenar', dias: 1 }, { workoutLog: { [HOY]: { Press: [{ reps: '5' }] } } }).activa).toBe(false);
  });

  test('sueño: menos de X horas hoy; sin registro de hoy = inactiva', () => {
    expect(ev({ plantilla: 'sueno_menos', horas: 6 }, { sleepLog: { [HOY]: { hours: 5.5 } } })).toEqual({ activa: true, detalle: 'Anoche dormiste 5,5 horas' });
    expect(ev({ plantilla: 'sueno_menos', horas: 5 }, { sleepLog: { [HOY]: { hours: 5.5 } } }).activa).toBe(false);
    expect(ev({ plantilla: 'sueno_menos', horas: 6 }, { sleepLog: { '2026-11-11': { hours: 3 } } }).activa).toBe(false);
  });

  test('gasto del día: neto de reintegros; sin invest, sin USD, sin cuotas de tarjeta del día 1', () => {
    const tx = [
      { type: 'expense', amount: 8000, date: HOY, category: 'food' }, { type: 'expense', amount: 3000, date: HOY, category: 'invest' },
      { type: 'expense', amount: 5000, date: HOY, currency: 'USD' }, { type: 'income', amount: 1000, date: HOY, refundOf: 'x' },
      { type: 'expense', amount: 99999, date: '2026-11-11' }, { type: 'income', amount: 70000, date: HOY },
    ];
    const r = ev({ plantilla: 'gasto_dia', monto: 6000 }, { transactions: tx });
    expect(r.activa).toBe(true); expect(r.detalle).toBe('Hoy gastaste $7.000 (tu tope era $6.000)');
    expect(ev({ plantilla: 'gasto_dia', monto: 7000 }, { transactions: tx }).activa).toBe(false);   // exactamente el tope: no se pasó
    const cuota = [{ type: 'expense', amount: 5000, date: '2026-12-01', cardChargeId: 'c1', name: 'TV (2/6)' }];
    expect(ev({ plantilla: 'gasto_dia', monto: 100 }, { transactions: cuota, cardCharges: [{ id: 'c1', date: '2026-10-05' }] }, '2026-12-01').activa).toBe(false);
    expect(ev({ plantilla: 'gasto_dia', monto: 100 }, { transactions: cuota, cardCharges: [{ id: 'c1', date: '2026-12-01' }] }, '2026-12-01').activa).toBe(true);   // la compra misma del día 1 sí
  });

  test('presupuesto del mes: fijos + reservados + fondos contra el gasto neto del mes; sin presupuesto = inactiva', () => {
    const budgets = { '2026-11': { fixed: [{ v1: 1, v2: 1000, v3: 10 }], reserved: [{ amount: 2000 }], seasonal: [] } };   // 12.000
    const base = { budgets, fondosMes: { '2026-11': 3000 } };                                                              // + fondos = 15.000
    const tx = (m) => [{ type: 'expense', amount: m, date: '2026-11-03' }, { type: 'expense', amount: 77777, date: '2026-10-30' }];
    const r = ev({ plantilla: 'presupuesto_mes' }, Object.assign({ transactions: tx(16000) }, base));
    expect(r.activa).toBe(true); expect(r.detalle).toBe('Llevás gastados $16.000 y lo presupuestado del mes es $15.000');
    expect(ev({ plantilla: 'presupuesto_mes' }, Object.assign({ transactions: tx(14000) }, base)).activa).toBe(false);
    expect(ev({ plantilla: 'presupuesto_mes' }, { transactions: tx(16000), budgets: {} }).activa).toBe(false);
    // Solo fondos del mes (sin S.budgets[mk]): igual cuentan como presupuesto → 3.000 contra 4.000 gastados.
    expect(ev({ plantilla: 'presupuesto_mes' }, { transactions: tx(4000), budgets: {}, fondosMes: { '2026-11': 3000 } }).detalle).toBe('Llevás gastados $4.000 y lo presupuestado del mes es $3.000');
  });

  test('energía del cierre: usa el más reciente entre hoy y ayer', () => {
    const f = (dias) => ({ foco: { dias } });
    expect(ev({ plantilla: 'energia_baja', nivel: 2 }, f({ '2026-11-11': { energia: 2, atencion: 3 } }))).toEqual({ activa: true, detalle: 'Tu energía del cierre de ayer fue 2' });
    expect(ev({ plantilla: 'energia_baja', nivel: 2 }, f({ '2026-11-11': { energia: 1, atencion: 3 }, [HOY]: { energia: 4, atencion: 3 } })).activa).toBe(false);
    expect(ev({ plantilla: 'energia_baja', nivel: 2 }, f({ [HOY]: { energia: 2, atencion: 3 } })).detalle).toBe('Tu energía del cierre de hoy fue 2');
    expect(ev({ plantilla: 'energia_baja', nivel: 1 }, f({ '2026-11-11': { energia: 2, atencion: 3 } })).activa).toBe(false);
    expect(ev({ plantilla: 'energia_baja', nivel: 3 }, f({ '2026-11-05': { energia: 1, atencion: 3 } })).activa).toBe(false);   // muy viejo
  });

  test('parámetros inválidos o regla desconocida: inactiva, nunca tira', () => {
    ['0', '-1', 'abc', '', '1.5'].forEach((d) => expect(ev({ plantilla: 'sin_entrenar', dias: d }, { workoutLog: {} }).activa).toBe(false));
    expect(P.prNormalizarRegla({ plantilla: 'inventada' })).toBeNull();
    expect(P.prNormalizarRegla({ plantilla: 'sueno_menos', horas: '5,5' })).toEqual({ plantilla: 'sueno_menos', horas: 5.5 });
    expect(ev(null, {}).activa).toBe(false);
    expect(P.prNormalizarDisparo({ tipo: 'horario', hora: '25:00' }).error).toBeTruthy();
    expect(P.prNormalizarDisparo({ tipo: 'horario', hora: '07:30' }).disparo).toEqual({ tipo: 'horario', hora: '07:30' });
    expect(P.prNormalizarDisparo(undefined).disparo).toEqual({ tipo: 'ninguno' });
  });

  test('avisos del Centro: diarios y reglas activas; silenciado o pospuesto no sale; vence al llegar la fecha', () => {
    const ps = [prin({ id: 'd', disparo: { tipo: 'diario' } }), prin({ id: 'e', disparo: { tipo: 'datos', regla: { plantilla: 'sin_entrenar', dias: 2 } } }),
      prin({ id: 'h', disparo: { tipo: 'horario', hora: '07:00' } }), prin({ id: 'n' })];
    const datos = { workoutLog: { '2026-11-09': { A: [{ reps: '1' }] } } };
    const r = P.prAvisosDePrincipios(ps, datos, HOY);
    expect(r.diarios.map((p) => p.id)).toEqual(['d']); expect(r.datos.map((x) => x.p.id)).toEqual(['e']);
    ps[0].silenciadoHasta = '2026-11-13'; ps[1].silenciadoHasta = '2026-11-19';
    const s = P.prAvisosDePrincipios(ps, datos, HOY); expect(s.diarios).toHaveLength(0); expect(s.datos).toHaveLength(0);
    expect(P.prAvisosDePrincipios(ps, datos, '2026-11-13').diarios).toHaveLength(1);   // mañana vuelve el diario
    expect(P.prAvisosDePrincipios(ps, datos, '2026-11-19').datos).toHaveLength(1);     // a los 7 días vuelve la regla
    expect(P.prSumarDias('2026-11-30', 1)).toBe('2026-12-01');
  });
});

// ── deadlines.js: aviso por horario ────────────────────────────────────────
const principios = (...ps) => ({ foco: { config: { horas: [] } }, principios: { principios: ps } });
test.describe('deadlines.js: principio por horario (Node)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });
  const ms = (hhmm, dia) => new Date((dia || HOY) + 'T' + hhmm + ':00-03:00').getTime();
  const due = (st, now, seen) => D.dueAlerts(st, { now, tz: TZ, seen: seen || {} });

  test('avisa a la hora, tag único por fecha+principio, url del principio, cuerpo con enunciado y por qué', () => {
    const st = principios(prin({ disparo: { tipo: 'horario', hora: '07:30' } }));
    const a = due(st, ms('07:32'));
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ key: 'prin_2026-11-12_p1', url: '#principio-p1', lead: false, title: '🧭 Tu principio' });
    expect(a[0].body).toBe('Lo más difícil primero\nPor qué: La energía es más alta temprano');
    expect(due(st, ms('07:32'), { 'prin_2026-11-12_p1': true })).toHaveLength(0);                 // ya avisado
    expect(due(st, ms('07:29'))).toHaveLength(0);                                                // todavía no
    expect(due(st, ms('09:00'))).toHaveLength(0);                                                // más de 60 min tarde: ya no sirve
    expect(due(st, ms('07:40'), { 'prin_2026-11-12_p1': true })).toHaveLength(0);
    expect(due(st, ms('07:31', '2026-11-13')).map((x) => x.key)).toEqual(['prin_2026-11-13_p1']);   // otro día, otro tag
  });

  test('silenciado o pospuesto no avisa; al llegar silenciadoHasta vuelve; ninguno/diario/datos no hacen push', () => {
    const h = { tipo: 'horario', hora: '07:30' };
    expect(due(principios(prin({ disparo: h, silenciadoHasta: '2026-11-13' })), ms('07:32'))).toHaveLength(0);   // pospuesto hasta mañana
    expect(due(principios(prin({ disparo: h, silenciadoHasta: '2026-11-19' })), ms('07:32'))).toHaveLength(0);
    expect(due(principios(prin({ disparo: h, silenciadoHasta: '2026-11-13' })), ms('07:32', '2026-11-13'))).toHaveLength(1);
    expect(due(principios(prin({ disparo: h, silenciadoHasta: '2026-11-12' })), ms('07:32'))).toHaveLength(1);
    ['ninguno', 'diario', 'datos'].forEach((t) => expect(due(principios(prin({ disparo: { tipo: t } })), ms('07:32'))).toHaveLength(0));
    expect(due(principios(prin()), ms('07:32'))).toHaveLength(0);                                  // documento viejo sin disparo
    expect(due(principios(prin({ disparo: { tipo: 'horario', hora: '7:3' } })), ms('07:32'))).toHaveLength(0);   // hora inválida
  });

  test('no entra en Recordatorios ni en el ticker; el motivo largo se recorta; el id se codifica', () => {
    const st = principios(prin({ id: 'a b/ñ', porque: 'x '.repeat(200), disparo: { tipo: 'horario', hora: '07:30' } }));
    const it = D.collect(st, { now: ms('07:32'), tz: TZ }).filter((i) => i.kind === 'principio');
    it.forEach((i) => expect(i.tab).toBeUndefined());
    const a = due(st, ms('07:32'))[0];
    expect(a.url).toBe('#principio-' + encodeURIComponent('a b/ñ'));
    expect(a.body.split('\n')[1].length).toBeLessThanOrEqual('Por qué: '.length + 140);
    expect(a.body.endsWith('…')).toBe(true);
  });
});

// ── push-reminders.js con el mock ──────────────────────────────────────────
function correrCron(state) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-prin-'));
  const fDoc = path.join(dir, 'doc.json'), fOut = path.join(dir, 'out.json');
  fs.writeFileSync(fDoc, JSON.stringify({ state: JSON.stringify(state), pushSubscription: { endpoint: 'https://push.invalido/x', keys: { p256dh: 'a', auth: 'b' } }, vapidKeys: { pubKey: 'pub', sigKey: 'sig' }, notifiedReminders: {} }));
  const r = spawnSync(process.execPath, ['-r', MOCK, path.join(ROOT, 'push-reminders.js')], { cwd: ROOT, encoding: 'utf8',
    env: Object.assign({}, process.env, { FIREBASE_SERVICE_ACCOUNT: '{}', MOCK_DOC: fDoc, MOCK_OUT: fOut, MOCK_SEND: 'ok' }) });
  return Object.assign({ code: r.status }, fs.existsSync(fOut) ? JSON.parse(fs.readFileSync(fOut, 'utf8')) : { sends: [], payloads: [] });
}
const horaAR = (msAtras) => new Date(Date.now() - 3 * 3600000 - msAtras).toISOString().slice(11, 16);

test.describe('push-reminders.js: principio por horario', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });

  test('lo envía con url y cuerpo; silenciado no se envía', () => {
    const h = { tipo: 'horario', hora: horaAR(2 * 60000) };
    const r = correrCron(principios(prin({ disparo: h })));
    expect(r.code).toBe(0);
    expect(r.payloads).toHaveLength(1);
    expect(r.payloads[0]).toMatchObject({ title: '🧭 Tu principio', url: '#principio-p1', requireInteraction: false });
    expect(r.payloads[0].body).toContain('Lo más difícil primero'); expect(r.payloads[0].body).toContain('Por qué: La energía es más alta temprano');
    expect(r.payloads[0].tag).toMatch(/^prin_\d{4}-\d{2}-\d{2}_p1$/);
    const mañana = new Date(Date.now() - 3 * 3600000 + 86400000).toISOString().slice(0, 10);
    expect(correrCron(principios(prin({ disparo: h, silenciadoHasta: mañana }))).payloads).toHaveLength(0);
  });
});

// ── En el navegador ────────────────────────────────────────────────────────
const sinScrollH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const a = (page, h, m = 0, dia = 12) => page.clock.setFixedTime(new Date(2026, 10, dia, h, m));
const mostrarAvisos = (page) => page.addStyleTag({ content: '#fo-nudge,#rs-nudge{display:flex!important}' });   // el fixture los oculta
const poner = (page, ps, extra) => page.evaluate(([ps, extra]) => {
  S.principios = { principios: ps, categorias: [], objetivos: [], extras: {}, sembrado: true };
  S.foco = { dias: {}, pantalla: {}, chequeos: [], config: { horas: [] } };
  Object.assign(S, extra || {});
  localStorage.clear();
}, [ps, extra]);
const hasta = (page) => page.evaluate(() => S.principios.principios.map((p) => ({ id: p.id, hasta: p.silenciadoHasta })));

test.describe('Recordatorios de principios en el Centro', () => {
  test('formulario: se configura cada tipo de disparo y cada plantilla, y queda guardado', async ({ cmPage, consoleErrors }, testInfo) => {
    await poner(cmPage, [prin({ id: 'base' })], { habitTrackers: { salud: [{ id: 'h1', name: 'Leer', emoji: '📚', days: {} }] } });
    await cmPage.evaluate(() => Principios.abrir());
    const ov = cmPage.locator('#ov-principios');
    const guardar = () => ov.locator('.pr-btn-p', { hasText: 'Guardar' }).click();
    const nuevo = async (enun, disp) => {
      await ov.locator('.pr-btn-p', { hasText: '+ Principio' }).click();
      await ov.locator('#prf-enun').fill(enun);
      await ov.locator('#prf-disp').selectOption(disp);
    };
    const ultimo = () => cmPage.evaluate(() => { const l = S.principios.principios; return l[l.length - 1]; });

    await nuevo('Sin aviso', 'ninguno'); await guardar();
    expect((await ultimo()).disparo).toEqual({ tipo: 'ninguno' });

    await nuevo('A dormir temprano', 'horario');
    await guardar();                                                   // sin hora: no guarda
    await expect(ov.locator('#prf-hora')).toBeVisible();
    expect((await ultimo()).enunciado).toBe('Sin aviso');
    await ov.locator('#prf-hora').fill('22:30');
    await cmPage.screenshot({ path: testInfo.outputPath('form-horario.png') });
    await guardar();
    expect((await ultimo()).disparo).toEqual({ tipo: 'horario', hora: '22:30' });

    await nuevo('Hacer todos los días aunque sea un poco', 'diario'); await guardar();
    expect((await ultimo()).disparo).toEqual({ tipo: 'diario' });

    const casos = [
      ['habito_sin_cumplir', async () => { await ov.locator('#prf-hab').selectOption('salud|h1'); await ov.locator('#prf-dias').fill('4'); }, { plantilla: 'habito_sin_cumplir', habito: 'salud|h1', dias: 4 }],
      ['sin_entrenar', async () => { await ov.locator('#prf-dias').fill('3'); }, { plantilla: 'sin_entrenar', dias: 3 }],
      ['sueno_menos', async () => { await ov.locator('#prf-horas').fill('6.5'); }, { plantilla: 'sueno_menos', horas: 6.5 }],
      ['gasto_dia', async () => { await ov.locator('#prf-monto').fill('20000'); }, { plantilla: 'gasto_dia', monto: 20000 }],
      ['presupuesto_mes', async () => {}, { plantilla: 'presupuesto_mes' }],
      ['energia_baja', async () => { await ov.locator('#prf-nivel').selectOption('2'); }, { plantilla: 'energia_baja', nivel: 2 }],
    ];
    for (const [pl, llenar, esperado] of casos) {
      await nuevo('Regla ' + pl, 'datos');
      await ov.locator('#prf-pl').selectOption(pl);
      await llenar();
      if (pl === 'gasto_dia') {
        expect(await sinScrollH(cmPage)).toBe(true);
        await cmPage.screenshot({ path: testInfo.outputPath('form-datos.png') });
      }
      await guardar();
      expect((await ultimo()).disparo).toEqual({ tipo: 'datos', regla: esperado });
    }
    // el texto del formulario conserva lo elegido al reabrir, y una regla sin número no se guarda
    await ov.locator('.pr-btn', { hasText: 'Editar' }).last().click();
    await expect(ov.locator('#prf-nivel')).toHaveValue('2');
    await ov.locator('#prf-pl').selectOption('sin_entrenar');
    await ov.locator('#prf-dias').fill('');
    await guardar();
    expect((await ultimo()).disparo.regla.plantilla).toBe('energia_baja');
    await expect(ov.locator('#prf-dias')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('diario: sale una vez por día con el motivo; "Visto" lo oculta hasta mañana', async ({ cmPage, consoleErrors }, testInfo) => {
    await poner(cmPage, [prin({ disparo: { tipo: 'diario' } }), prin({ id: 'p2', enunciado: 'Hacer aunque sea un poco', porque: '', disparo: { tipo: 'diario' } }), prin({ id: 'p3', enunciado: 'Sin aviso' })]);
    await a(cmPage, 9);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    const av = cmPage.locator('#pr-avisos .pr-av-diario');
    await expect(av).toBeVisible();
    await expect(av.locator('.pr-av-row')).toHaveCount(0);                          // varios principios: una sola tarjeta resumen
    await expect(av).toContainText('Principios de hoy (2)');
    await expect(av).not.toContainText('Sin aviso');
    await expect(av.locator('.pr-btn', { hasText: 'Ver' })).toBeVisible();
    expect(await sinScrollH(cmPage)).toBe(true);
    await cmPage.screenshot({ path: testInfo.outputPath('aviso-diario.png') });
    const btn = av.locator('.pr-btn', { hasText: 'Visto' });
    expect((await btn.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await btn.click();
    await expect(cmPage.locator('#pr-avisos')).toHaveCount(0);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(cmPage.locator('#pr-avisos')).toHaveCount(0);                      // no reaparece el mismo día
    expect((await hasta(cmPage)).every((x) => x.hasta === undefined)).toBe(true);   // "Visto" no toca los principios
    await a(cmPage, 9, 0, 13);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(cmPage.locator('#pr-avisos .pr-av-diario')).toBeVisible();         // mañana vuelve
    expect(consoleErrors).toEqual([]);
  });

  test('por datos: "3 días sin entrenar" activa muestra la tarjeta con el dato; si entrenás, se va', async ({ cmPage, consoleErrors }, testInfo) => {
    // Último entreno 11-09, hoy 11-12: días completos sin entrenar = 10 y 11 = 2 (hoy no cuenta).
    await poner(cmPage, [prin({ disparo: { tipo: 'datos', regla: { plantilla: 'sin_entrenar', dias: 2 } } })],
      { workoutLog: { '2026-11-09': { Press: [{ reps: '8', weight: '50' }] } } });
    await a(cmPage, 10);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    const t = cmPage.locator('#pr-avisos .pr-av-datos');
    await expect(t).toBeVisible();
    await expect(t).toContainText('Llevás 2 días sin entrenar');
    await expect(t).toContainText('Lo más difícil primero');
    expect(await sinScrollH(cmPage)).toBe(true);
    await cmPage.screenshot({ path: testInfo.outputPath('aviso-datos.png') });
    // "Ocultar": se va sin escribir nada en el principio, y no vuelve en la misma evaluación
    await t.locator('.pr-btn', { hasText: 'Ocultar' }).click();
    await expect(cmPage.locator('#pr-avisos')).toHaveCount(0);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(cmPage.locator('#pr-avisos')).toHaveCount(0);
    expect((await hasta(cmPage)).every((x) => x.hasta === undefined)).toBe(true);
    // un día antes (1 día completo) no activa
    await a(cmPage, 10, 0, 11);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(cmPage.locator('#pr-avisos')).toHaveCount(0);
    // vuelve a cambiar el estado (activa de nuevo): reaparece aunque se haya ocultado
    await a(cmPage, 10);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(cmPage.locator('#pr-avisos .pr-av-datos')).toBeVisible();
    // entrenás hoy: se va
    await a(cmPage, 10);
    await cmPage.evaluate(() => { S.workoutLog['2026-11-12'] = { Press: [{ reps: '5', weight: '' }] }; Principios.chequearAvisos(); });
    await expect(cmPage.locator('#pr-avisos')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('posponer hasta mañana y silenciar 7 días (el principio no se borra); Reactivar lo devuelve', async ({ cmPage, consoleErrors }) => {
    const dd = { tipo: 'datos', regla: { plantilla: 'sueno_menos', horas: 7 } };
    await poner(cmPage, [prin({ disparo: dd }), prin({ id: 'p2', enunciado: 'Otro', disparo: dd })], { sleepLog: { '2026-11-12': { hours: 5 }, '2026-11-13': { hours: 5 } } });
    await a(cmPage, 9);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    const fila = (txt) => cmPage.locator('#pr-avisos .pr-av-row', { hasText: txt });
    expect((await fila('Lo más difícil').locator('.pr-btn').first().boundingBox()).height).toBeGreaterThanOrEqual(44);
    await expect(fila('Lo más difícil').locator('.pr-btn[aria-label="Posponer hasta mañana"]')).toHaveCount(1);
    await fila('Lo más difícil').locator('.pr-btn', { hasText: 'Mañana' }).click();
    expect(await hasta(cmPage)).toEqual([{ id: 'p1', hasta: '2026-11-13' }, { id: 'p2', hasta: undefined }]);
    await expect(fila('Lo más difícil')).toHaveCount(0);
    await expect(fila('Otro')).toHaveCount(1);
    await fila('Otro').locator('.pr-btn', { hasText: '7 días' }).click();
    expect(await hasta(cmPage)).toEqual([{ id: 'p1', hasta: '2026-11-13' }, { id: 'p2', hasta: '2026-11-19' }]);
    await expect(cmPage.locator('#pr-avisos')).toHaveCount(0);
    expect(await cmPage.evaluate(() => S.principios.principios.length)).toBe(2);   // no se borran
    // mañana vuelve el pospuesto, no el silenciado
    await a(cmPage, 9, 0, 13);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(fila('Lo más difícil')).toHaveCount(1); await expect(fila('Otro')).toHaveCount(0);
    // el principio silenciado se ve marcado en la ventana y se puede reactivar
    await cmPage.evaluate(() => Principios.abrir());
    const card = cmPage.locator('#ov-principios .pr-card', { hasText: 'Otro' });
    await expect(card).toContainText('silenciado hasta el 19/11');
    await card.locator('.pr-btn', { hasText: 'Reactivar' }).click();
    expect(await hasta(cmPage)).toEqual([{ id: 'p1', hasta: '2026-11-13' }, { id: 'p2', hasta: undefined }]);
    await expect(fila('Otro')).toHaveCount(1);
    expect(consoleErrors).toEqual([]);
  });

  test('al tocar un aviso se abre la ventana de Principios en ese principio (mensaje del SW y link del aviso); #foco-chequeo sigue andando', async ({ cmPage, consoleErrors }, testInfo) => {
    await poner(cmPage, [prin({ id: 'p1', enunciado: 'Primero' }), prin({ id: 'p2', enunciado: 'Segundo', disparo: { tipo: 'diario' } })]);
    await a(cmPage, 9);
    const msg = (url) => cmPage.evaluate((u) => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { tipo: 'abrir-destino', url: u } })), url);
    await msg('https://x.test/Centro-de-mando/#principio-p2');
    const ov = cmPage.locator('#ov-principios.show');
    await expect(ov).toBeVisible();
    await expect(ov.locator('.pr-card')).toHaveCount(1);
    await expect(ov).toContainText('Segundo'); await expect(ov).not.toContainText('Primero');
    await cmPage.screenshot({ path: testInfo.outputPath('destino-principio.png') });
    await ov.locator('.pr-btn', { hasText: 'Ver todos' }).click();
    await expect(ov.locator('.pr-card')).toHaveCount(2);
    // desde el aviso del Centro
    await cmPage.evaluate(() => { CMOverlay.close('ov-principios'); Principios.chequearAvisos(); });
    await cmPage.locator('#pr-avisos .pr-av-link').click();
    await expect(cmPage.locator('#ov-principios.show .pr-card')).toHaveCount(1);
    // principio borrado: avisa y abre la lista completa
    await cmPage.evaluate(() => CMOverlay.close('ov-principios'));
    await msg('#principio-inexistente');
    await expect(cmPage.locator('#ov-principios.show .pr-card')).toHaveCount(2);
    // el destino de los chequeos de Foco no se rompió
    await cmPage.evaluate(() => CMOverlay.close('ov-principios'));
    await msg('https://x.test/Centro-de-mando/#foco-chequeo');
    await expect(cmPage.locator('#ov-principios.show #fo-chequeo .fo-cat')).toHaveCount(7);
    expect(consoleErrors).toEqual([]);
  });

  test('apilado: cierre del día + revisión semanal + principios se ven a la vez, sin taparse (domingo 21:00)', async ({ cmPage, consoleErrors }, testInfo) => {
    await poner(cmPage, [prin({ disparo: { tipo: 'diario' } }), prin({ id: 'p2', enunciado: 'Sin entrenar', disparo: { tipo: 'datos', regla: { plantilla: 'sueno_menos', horas: 7 } } })],
      { sleepLog: { '2026-11-15': { hours: 5 } } });
    await mostrarAvisos(cmPage);
    await a(cmPage, 21, 0, 15);   // domingo 15/11
    await cmPage.evaluate(() => { window.renderGoals(); });
    await expect(cmPage.locator('#rs-nudge')).toBeVisible();
    await expect(cmPage.locator('#fo-nudge')).toBeVisible();
    await expect(cmPage.locator('#pr-avisos')).toBeVisible();
    await cmPage.screenshot({ path: testInfo.outputPath('apilado.png') });
    const r = await cmPage.evaluate(() => {
      const b = (s) => document.querySelector(s).getBoundingClientRect();
      return { rs: b('#rs-nudge'), fo: b('#fo-nudge'), pr: b('#pr-avisos'), nav: b('#nav'), w: window.innerWidth, h: window.innerHeight };
    });
    if (r.nav.top > r.h / 2) expect(r.pr.bottom).toBeLessThanOrEqual(r.nav.top + 1);   // barra inferior (móvil): el panel no la tapa
    expect(r.fo.bottom).toBeLessThanOrEqual(r.rs.top + 1);   // el cierre queda arriba de la semanal
    expect(r.pr.bottom).toBeLessThanOrEqual(r.fo.top + 1);   // los principios, arriba del cierre
    expect(r.pr.top).toBeGreaterThanOrEqual(0);
    expect(await sinScrollH(cmPage)).toBe(true);
    // los botones de los tres avisos siguen siendo tocables (no los tapa otro)
    await cmPage.locator('#pr-avisos .pr-av-diario .pr-btn', { hasText: 'Visto' }).click();
    await expect(cmPage.locator('#pr-avisos .pr-av-diario')).toHaveCount(0);
    await expect(cmPage.locator('#pr-avisos .pr-av-datos')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('apilado completo (dato + diario de 3 + cierre + semanal): todos los botones visibles y tocables, sin tapar nada', async ({ cmPage, consoleErrors }, testInfo) => {
    const dd = { tipo: 'datos', regla: { plantilla: 'sueno_menos', horas: 7 } };
    await poner(cmPage, [prin({ id: 'd1', enunciado: 'Un principio con un enunciado bastante largo que no entra en una sola línea del aviso', disparo: dd }),
      prin({ id: 'a', disparo: { tipo: 'diario' } }), prin({ id: 'b', enunciado: 'Segundo', disparo: { tipo: 'diario' } }), prin({ id: 'c', enunciado: 'Tercero', disparo: { tipo: 'diario' } })],
      { sleepLog: { '2026-11-15': { hours: 5 } } });
    await mostrarAvisos(cmPage);
    await a(cmPage, 21, 0, 15);
    await cmPage.evaluate(() => { window.renderGoals(); });
    await expect(cmPage.locator('#rs-nudge')).toBeVisible();
    await expect(cmPage.locator('#fo-nudge')).toBeVisible();
    await expect(cmPage.locator('#pr-avisos .pr-av-diario')).toContainText('Principios de hoy (3)');
    await cmPage.screenshot({ path: testInfo.outputPath('apilado-completo.png') });
    const r = await cmPage.evaluate(() => {
      const p = document.getElementById('pr-avisos'), box = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
      const bots = [...p.querySelectorAll('button')].map((b) => { const q = b.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2;
        return { txt: b.textContent, h: q.height, ok: document.elementFromPoint(x, y) === b, dentro: q.top >= p.getBoundingClientRect().top - 0.5 && q.bottom <= p.getBoundingClientRect().bottom + 0.5 }; });
      return { bots, scroll: p.scrollHeight - p.clientHeight, mas: !!p.querySelector('.pr-av-mas'), pr: box(p), fo: box(document.getElementById('fo-nudge')), rs: box(document.getElementById('rs-nudge')), nav: box(document.getElementById('nav')), h: window.innerHeight };
    });
    expect(r.bots.map((b) => b.txt)).toEqual(['Un principio con un enunciado bastante largo que no entra en una sola línea del aviso', 'Mañana', '7 días', 'Ocultar', 'Ver', 'Visto']);
    r.bots.forEach((b) => { expect(b.ok, b.txt).toBe(true); expect(b.dentro, b.txt).toBe(true); if (b.txt.length < 12) expect(b.h, b.txt).toBeGreaterThanOrEqual(44); });
    expect(r.scroll).toBeLessThanOrEqual(1); expect(r.mas).toBe(false);
    const sol = (x, y) => x.l < y.r && x.r > y.l && x.t < y.b && x.b > y.t;
    [r.fo, r.rs].forEach((o) => expect(sol(r.pr, o)).toBe(false));
    if (r.nav.t > r.h / 2) expect(sol(r.pr, r.nav)).toBe(false);
    const sd = await cmPage.evaluate(() => { const e = document.querySelector('.cm-sd'); if (!e) return null; const b = e.getBoundingClientRect(), p = document.getElementById('pr-avisos').getBoundingClientRect(); return b.left < p.right && b.right > p.left && b.top < p.bottom && b.bottom > p.top; });
    if (sd !== null) expect(sd).toBe(false);
    expect(consoleErrors).toEqual([]);
  });

  test('con muchos avisos por datos aparece el cartel "Deslizá para ver N más"', async ({ cmPage, consoleErrors }, testInfo) => {
    const dd = { tipo: 'datos', regla: { plantilla: 'sueno_menos', horas: 7 } };
    await poner(cmPage, [1, 2, 3, 4, 5, 6].map((i) => prin({ id: 'd' + i, enunciado: 'Principio ' + i, disparo: dd })), { sleepLog: { '2026-11-12': { hours: 5 } } });
    await a(cmPage, 9);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    const mas = cmPage.locator('#pr-avisos .pr-av-mas');
    await expect(mas).toBeVisible();
    await expect(mas).toHaveText(/Deslizá para ver [0-9]+ más/);
    await cmPage.screenshot({ path: testInfo.outputPath('muchos-avisos.png') });
    await cmPage.evaluate(() => { const p = document.getElementById('pr-avisos'); p.scrollTop = p.scrollHeight; });
    await expect(mas).toBeHidden();
    expect(consoleErrors).toEqual([]);
  });
});
