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

  test('posponer corto: prSilenciado respeta silenciadoHastaTs (ms) además de la fecha; vence solo; ts inválido no silencia', () => {
    const T = new Date(2026, 10, 12, 9, 0).getTime(), p = prin({ disparo: { tipo: 'diario' } }), con = (o) => Object.assign({}, p, o);
    expect(P.prSilenciado(con({ silenciadoHastaTs: T + 15 * 60000 }), HOY, T)).toBe(true);
    expect(P.prSilenciado(con({ silenciadoHastaTs: T + 15 * 60000 }), HOY, T + 15 * 60000 - 1)).toBe(true);
    expect(P.prSilenciado(con({ silenciadoHastaTs: T + 15 * 60000 }), HOY, T + 15 * 60000)).toBe(false);   // vence justo al llegar
    expect(P.prSilenciado(con({ silenciadoHastaTs: T - 1 }), HOY, T)).toBe(false);
    expect(P.prSilenciado(con({ silenciadoHastaTs: 'x' }), HOY, T)).toBe(false);
    expect(P.prSilenciado(con({ silenciadoHasta: '2026-11-13', silenciadoHastaTs: T - 1 }), HOY, T)).toBe(true);   // la fecha sola alcanza
    expect(P.prSilenciado(con({ silenciadoHasta: '2026-11-12', silenciadoHastaTs: T + 1 }), HOY, T)).toBe(true);   // y el ts solo también
    expect(P.prSilenciado(p, HOY, T)).toBe(false); expect(P.prSilenciado(null, HOY, T)).toBe(false);
    const ps = [con({ silenciadoHastaTs: T + 60000 }), prin({ id: 'q', disparo: { tipo: 'diario' } })];
    expect(P.prAvisosDePrincipios(ps, {}, HOY, T).diarios.map((x) => x.id)).toEqual(['q']);
    expect(P.prAvisosDePrincipios(ps, {}, HOY, T + 60000).diarios.map((x) => x.id)).toEqual(['p1', 'q']);
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

  const bell = (page) => page.locator('#pr-avisos .pr-bell');
  const nBell = (page) => page.locator('#pr-avisos .pr-bell-n');
  const card = (page) => page.locator('#pr-avisos .pr-av-card');
  const panel = (page) => page.locator('#pr-avisos #pr-av-panel');
  const item = (page, txt) => page.locator('#pr-avisos .pr-av-item', { hasText: txt });
  const DD = { tipo: 'datos', regla: { plantilla: 'sueno_menos', horas: 7 } };

  test('campanita con contador: sin avisos no hay número; con avisos muestra la cantidad y no se pisa con el botón de Game Mode', async ({ cmPage, consoleErrors }) => {
    await poner(cmPage, [prin({ id: 'n' })]);
    await a(cmPage, 9);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(bell(cmPage)).toBeVisible();
    await expect(nBell(cmPage)).toHaveCount(0);                                     // 0 avisos: contador oculto
    await expect(card(cmPage)).toHaveCount(0);
    await poner(cmPage, [prin({ disparo: { tipo: 'diario' } }), prin({ id: 'p2', enunciado: 'Otro', disparo: DD })], { sleepLog: { '2026-11-12': { hours: 5 } } });
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(nBell(cmPage)).toHaveText('2');
    await expect(bell(cmPage)).toHaveAttribute('aria-expanded', 'false');
    await expect(bell(cmPage)).toHaveAttribute('aria-label', /2 pendientes/);
    const r = await cmPage.evaluate(() => { const b = (s) => document.querySelector(s).getBoundingClientRect(), x = b('#pr-avisos .pr-bell'), t = b('#trophy-btn');
      return { sol: x.left < t.right && x.right > t.left && x.top < t.bottom && x.bottom > t.top, ok: document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2).closest('.pr-bell') !== null, top: x.top }; });
    expect(r.sol).toBe(false); expect(r.ok).toBe(true); expect(r.top).toBeGreaterThanOrEqual(0);
    expect(await sinScrollH(cmPage)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('aviso nuevo: tarjeta grande con el texto completo (sin recortar) que se pliega a los 8 s y no vuelve; la pausa con el mouse encima la retiene', async ({ cmPage, consoleErrors }, testInfo) => {
    const enun = 'Antes de gastar en algo que no es de primera necesidad espero 48 horas y me pregunto si lo compraría igual mañana, sin que nadie me lo haya mostrado';
    const porque = 'Casi todo lo que quiero comprar en el momento deja de importarme en dos días, y lo que sigue importando después de esperar suele valer la plata de verdad, así que esperar es gratis';
    await cmPage.clock.install({ time: new Date(2026, 10, 12, 9, 0) });
    await poner(cmPage, [prin({ enunciado: enun, porque, disparo: { tipo: 'diario' } })]);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(card(cmPage)).toBeVisible();
    await expect(card(cmPage)).toContainText(enun);
    await expect(card(cmPage)).toContainText(porque);
    await expect(card(cmPage)).toContainText('Principio de hoy');
    await expect(card(cmPage)).not.toContainText(' más');                           // una sola: sin «y N más»
    const m = await cmPage.evaluate(() => {
      const l = document.querySelector('#pr-avisos .pr-av-card .pr-av-link'), c = document.querySelector('#pr-avisos .pr-av-card'), cs = getComputedStyle(l), w = window.innerWidth;
      const b = c.getBoundingClientRect(); return { ell: cs.textOverflow, ws: cs.whiteSpace, corta: l.scrollHeight > l.clientHeight + 1, ancho: b.width, w, der: b.right, izq: b.left };
    });
    expect(m.ell).not.toBe('ellipsis'); expect(m.ws).not.toBe('nowrap'); expect(m.corta).toBe(false);
    expect(m.izq).toBeGreaterThanOrEqual(0); expect(m.der).toBeLessThanOrEqual(m.w);
    expect(m.ancho).toBeGreaterThanOrEqual(Math.min(360, m.w - 24)); expect(m.ancho).toBeLessThanOrEqual(420);
    await cmPage.screenshot({ path: testInfo.outputPath('tarjeta.png') });
    // pausa: con el mouse encima no se pliega
    const bb = await card(cmPage).boundingBox();
    await cmPage.mouse.move(bb.x + bb.width / 2, bb.y + 20);
    await cmPage.clock.fastForward(20000);
    await expect(card(cmPage)).toBeVisible();
    await cmPage.mouse.move(5, 300);
    await cmPage.clock.fastForward(7000);
    await expect(card(cmPage)).toBeVisible();                                       // todavía no pasaron los 8 s
    await cmPage.clock.fastForward(1500);
    await expect(card(cmPage)).toHaveCount(0);                                      // se pliega al panel
    await expect(nBell(cmPage)).toHaveText('1');                                    // el aviso sigue activo en la campanita
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(card(cmPage)).toHaveCount(0);                                      // el mismo aviso no se vuelve a desplegar
    // «Cerrar» también la pliega
    await cmPage.evaluate(() => { localStorage.clear(); S.principios.principios.push({ id: 'z', tipo: 'principio', enunciado: 'Nuevo', porque: '', disparo: { tipo: 'diario' } }); Principios.chequearAvisos(); });
    await expect(card(cmPage)).toContainText('Nuevo');
    await card(cmPage).locator('.pr-btn', { hasText: 'Cerrar' }).click();
    await expect(card(cmPage)).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('varios avisos a la vez: una sola tarjeta con «y N más» que abre el panel con todos', async ({ cmPage, consoleErrors }, testInfo) => {
    await poner(cmPage, [prin({ disparo: { tipo: 'diario' } }), prin({ id: 'p2', enunciado: 'Hacer aunque sea un poco', porque: '', disparo: { tipo: 'diario' } }),
      prin({ id: 'p3', enunciado: 'Dormir temprano', disparo: DD }), prin({ id: 'p4', enunciado: 'Sin aviso' })], { sleepLog: { '2026-11-12': { hours: 5 } } });
    await a(cmPage, 9);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(card(cmPage)).toHaveCount(1);
    await expect(card(cmPage)).toContainText('y 2 más');
    await expect(card(cmPage).locator('.pr-av-link')).toHaveCount(1);              // nunca se apilan tarjetas
    await expect(panel(cmPage)).toHaveCount(0);
    await expect(nBell(cmPage)).toHaveText('3');
    await card(cmPage).locator('.pr-btn', { hasText: 'y 2 más' }).click();
    await expect(panel(cmPage)).toBeVisible();
    await expect(card(cmPage)).toHaveCount(0);
    await expect(cmPage.locator('#pr-avisos .pr-av-item')).toHaveCount(3);
    await expect(panel(cmPage)).not.toContainText('Sin aviso');
    await expect(bell(cmPage)).toHaveAttribute('aria-expanded', 'true');
    await cmPage.screenshot({ path: testInfo.outputPath('panel.png') });
    expect(await sinScrollH(cmPage)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('panel: abre y cierra con la campanita, con Esc y tocando afuera; los botones son tocables (44 px) y no los tapa nada', async ({ cmPage, consoleErrors }) => {
    await poner(cmPage, [1, 2, 3, 4, 5, 6].map((i) => prin({ id: 'd' + i, enunciado: 'Principio ' + i + ' con un enunciado un poco más largo para que ocupe', disparo: DD })), { sleepLog: { '2026-11-12': { hours: 5 } } });
    await a(cmPage, 9);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await bell(cmPage).click();
    await expect(panel(cmPage)).toBeVisible();
    await expect(panel(cmPage)).toBeFocused();
    const r = await cmPage.evaluate(() => {
      const p = document.getElementById('pr-av-panel'), pb = p.getBoundingClientRect(), nav = document.getElementById('nav').getBoundingClientRect();
      const bots = [...p.querySelectorAll('.pr-av-pos .pr-btn, .pr-av-fin .pr-btn')].slice(0, 6).map((b) => { b.scrollIntoView({ block: 'nearest' }); const q = b.getBoundingClientRect();
        return { txt: b.textContent, h: q.height, ok: document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2) === b }; });
      return { scroll: p.scrollHeight > p.clientHeight, izq: pb.left, der: pb.right, abajo: pb.bottom, navTop: nav.top, h: window.innerHeight, w: window.innerWidth, bots };
    });
    expect(r.scroll).toBe(true);                                                    // muchos avisos: el panel desliza, no se sale de la pantalla
    expect(r.izq).toBeGreaterThanOrEqual(0); expect(r.der).toBeLessThanOrEqual(r.w); expect(r.abajo).toBeLessThanOrEqual(r.h);
    if (r.navTop > r.h / 2) expect(r.abajo).toBeLessThanOrEqual(r.navTop + 1);
    r.bots.forEach((b) => { expect(b.ok, b.txt).toBe(true); expect(b.h, b.txt).toBeGreaterThanOrEqual(44); });
    await cmPage.keyboard.press('Escape');
    await expect(panel(cmPage)).toHaveCount(0);
    await expect(bell(cmPage)).toBeFocused();
    await bell(cmPage).click(); await expect(panel(cmPage)).toBeVisible();
    await bell(cmPage).click(); await expect(panel(cmPage)).toHaveCount(0);        // la campanita alterna
    await bell(cmPage).click(); await expect(panel(cmPage)).toBeVisible();
    await cmPage.mouse.click(5, 10);                                                 // afuera (arriba a la izquierda: en el celular el panel ocupa casi todo el ancho)
    await expect(panel(cmPage)).toHaveCount(0);
    // posponer desde el panel no lo cierra mientras quedan avisos
    await bell(cmPage).click();
    await item(cmPage, 'Principio 1 ').locator('.pr-btn', { hasText: '1 h' }).click();
    await expect(panel(cmPage)).toBeVisible();
    await expect(cmPage.locator('#pr-avisos .pr-av-item')).toHaveCount(5);
    await expect(nBell(cmPage)).toHaveText('5');
    expect(consoleErrors).toEqual([]);
  });

  test('diario: «Visto» saca solo ese principio hasta mañana y no toca los principios', async ({ cmPage, consoleErrors }) => {
    await poner(cmPage, [prin({ disparo: { tipo: 'diario' } }), prin({ id: 'p2', enunciado: 'Hacer aunque sea un poco', porque: '', disparo: { tipo: 'diario' } }), prin({ id: 'p3', enunciado: 'Sin aviso' })]);
    await a(cmPage, 9);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await bell(cmPage).click();
    await expect(cmPage.locator('#pr-avisos .pr-av-item')).toHaveCount(2);
    await item(cmPage, 'Lo más difícil').locator('.pr-btn', { hasText: 'Visto' }).click();
    await expect(cmPage.locator('#pr-avisos .pr-av-item')).toHaveCount(1);
    await expect(item(cmPage, 'Hacer aunque sea un poco')).toHaveCount(1);
    await expect(nBell(cmPage)).toHaveText('1');
    await item(cmPage, 'Hacer aunque sea un poco').locator('.pr-btn', { hasText: 'Visto' }).click();
    await expect(nBell(cmPage)).toHaveCount(0);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(nBell(cmPage)).toHaveCount(0);                                     // no reaparece el mismo día
    expect((await hasta(cmPage)).every((x) => x.hasta === undefined)).toBe(true);
    expect(await cmPage.evaluate(() => S.principios.principios.every((p) => p.silenciadoHastaTs === undefined))).toBe(true);
    await a(cmPage, 9, 0, 13);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(nBell(cmPage)).toHaveText('2');                                    // mañana vuelve
    expect(consoleErrors).toEqual([]);
  });

  test('por datos: la tarjeta trae el dato; «Ocultar» lo saca sin escribir nada; vuelve si cambia el estado; si entrenás, se va', async ({ cmPage, consoleErrors }) => {
    // Último entreno 11-09, hoy 11-12: días completos sin entrenar = 10 y 11 = 2 (hoy no cuenta).
    await poner(cmPage, [prin({ disparo: { tipo: 'datos', regla: { plantilla: 'sin_entrenar', dias: 2 } } })],
      { workoutLog: { '2026-11-09': { Press: [{ reps: '8', weight: '50' }] } } });
    await a(cmPage, 10);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(card(cmPage)).toContainText('Llevás 2 días sin entrenar');
    await expect(card(cmPage)).toContainText('Lo más difícil primero');
    await expect(card(cmPage)).toContainText('La energía es más alta temprano');
    await bell(cmPage).click();
    const t = item(cmPage, 'Llevás 2 días sin entrenar');
    await expect(t).toBeVisible();
    await expect(t.locator('.pr-btn', { hasText: 'Visto' })).toHaveCount(0);       // «Visto» es solo de los diarios
    await t.locator('.pr-btn', { hasText: 'Ocultar' }).click();
    await expect(nBell(cmPage)).toHaveCount(0);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(nBell(cmPage)).toHaveCount(0);
    expect((await hasta(cmPage)).every((x) => x.hasta === undefined)).toBe(true);
    await a(cmPage, 10, 0, 11);                                                     // un día antes no activa
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(nBell(cmPage)).toHaveCount(0);
    await a(cmPage, 10);                                                            // cambió el estado: reaparece aunque se haya ocultado
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(nBell(cmPage)).toHaveText('1');
    await cmPage.evaluate(() => { S.workoutLog['2026-11-12'] = { Press: [{ reps: '5', weight: '' }] }; Principios.chequearAvisos(); });
    await expect(nBell(cmPage)).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('posponer corto: 15 min lo saca, reaparece pasado el tiempo; el principio no se borra; se guarda en silenciadoHastaTs', async ({ cmPage, consoleErrors }) => {
    await poner(cmPage, [prin({ disparo: DD }), prin({ id: 'p2', enunciado: 'Otro', disparo: DD })], { sleepLog: { '2026-11-12': { hours: 5 } } });
    await a(cmPage, 9);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await bell(cmPage).click();
    const ini = new Date(2026, 10, 12, 9, 0).getTime();
    expect((await item(cmPage, 'Lo más difícil').locator('.pr-btn', { hasText: '15 min' }).boundingBox()).height).toBeGreaterThanOrEqual(44);
    await item(cmPage, 'Lo más difícil').locator('.pr-btn', { hasText: '15 min' }).click();
    expect(await cmPage.evaluate(() => S.principios.principios.map((p) => [p.id, p.silenciadoHastaTs, p.silenciadoHasta]))).toEqual([['p1', ini + 15 * 60000, undefined], ['p2', undefined, undefined]]);
    await expect(item(cmPage, 'Lo más difícil')).toHaveCount(0);
    await expect(nBell(cmPage)).toHaveText('1');
    await a(cmPage, 9, 14); await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(item(cmPage, 'Lo más difícil')).toHaveCount(0);                    // a los 14 min todavía no
    await a(cmPage, 9, 16); await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(item(cmPage, 'Lo más difícil')).toHaveCount(1);                    // a los 16 min vuelve
    await expect(nBell(cmPage)).toHaveText('2');
    await item(cmPage, 'Otro').locator('.pr-btn', { hasText: '3 h' }).click();
    expect(await cmPage.evaluate(() => S.principios.principios[1].silenciadoHastaTs)).toBe(new Date(2026, 10, 12, 9, 16).getTime() + 180 * 60000);
    await a(cmPage, 12, 20); await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(item(cmPage, 'Otro')).toHaveCount(1);
    expect(await cmPage.evaluate(() => S.principios.principios.length)).toBe(2);
    expect(consoleErrors).toEqual([]);
  });

  test('posponer corto: reaparece solo al vencer (sin esperar el chequeo de 5 min)', async ({ cmPage, consoleErrors }) => {
    await cmPage.clock.install({ time: new Date(2026, 10, 12, 9, 0) });
    await poner(cmPage, [prin({ disparo: { tipo: 'diario' } })]);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await bell(cmPage).click();
    await item(cmPage, 'Lo más difícil').locator('.pr-btn', { hasText: '1 h' }).click();
    await expect(nBell(cmPage)).toHaveCount(0);
    await cmPage.keyboard.press('Escape');                                          // con el panel abierto no se despliega tarjeta: lo ve ahí
    await cmPage.clock.fastForward(59 * 60000);
    await expect(nBell(cmPage)).toHaveCount(0);
    await cmPage.clock.fastForward(2 * 60000);
    await expect(nBell(cmPage)).toHaveText('1');
    await expect(card(cmPage)).toBeVisible();                                       // al volver es un aviso nuevo: se despliega
    expect(consoleErrors).toEqual([]);
  });

  test('posponer hasta mañana y silenciar 7 días (el principio no se borra); Reactivar lo devuelve y borra también el posponer corto', async ({ cmPage, consoleErrors }) => {
    await poner(cmPage, [prin({ disparo: DD }), prin({ id: 'p2', enunciado: 'Otro', disparo: DD }), prin({ id: 'p3', enunciado: 'Tercero', disparo: DD })],
      { sleepLog: { '2026-11-12': { hours: 5 }, '2026-11-13': { hours: 5 } } });
    await a(cmPage, 9);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await bell(cmPage).click();
    await expect(item(cmPage, 'Lo más difícil').locator('.pr-btn[aria-label="Posponer hasta mañana"]')).toHaveCount(1);
    await item(cmPage, 'Lo más difícil').locator('.pr-btn', { hasText: 'Mañana' }).click();
    expect(await hasta(cmPage)).toEqual([{ id: 'p1', hasta: '2026-11-13' }, { id: 'p2', hasta: undefined }, { id: 'p3', hasta: undefined }]);
    await expect(item(cmPage, 'Lo más difícil')).toHaveCount(0);
    await item(cmPage, 'Otro').locator('.pr-btn', { hasText: '7 días' }).click();
    expect(await hasta(cmPage)).toEqual([{ id: 'p1', hasta: '2026-11-13' }, { id: 'p2', hasta: '2026-11-19' }, { id: 'p3', hasta: undefined }]);
    await item(cmPage, 'Tercero').locator('.pr-btn', { hasText: '15 min' }).click();
    await expect(nBell(cmPage)).toHaveCount(0);
    expect(await cmPage.evaluate(() => S.principios.principios.length)).toBe(3);   // no se borran
    // mañana vuelve el pospuesto, no el silenciado
    await a(cmPage, 9, 0, 13);
    await cmPage.evaluate(() => Principios.chequearAvisos());
    await expect(item(cmPage, 'Lo más difícil')).toHaveCount(1); await expect(item(cmPage, 'Otro')).toHaveCount(0);
    // el silenciado se ve marcado en la ventana y se puede reactivar
    await cmPage.evaluate(() => Principios.abrir());
    const c2 = cmPage.locator('#ov-principios .pr-card', { hasText: 'Otro' });
    await expect(c2).toContainText('silenciado hasta el 19/11');
    await c2.locator('.pr-btn', { hasText: 'Reactivar' }).click();
    expect(await hasta(cmPage)).toEqual([{ id: 'p1', hasta: '2026-11-13' }, { id: 'p2', hasta: undefined }, { id: 'p3', hasta: undefined }]);
    await expect(item(cmPage, 'Otro')).toHaveCount(1);
    // el pospuesto corto muestra la hora; Reactivar borra el ts
    await cmPage.evaluate(() => { S.principios.principios[2].silenciadoHastaTs = Date.now() + 3600000; Principios.chequearAvisos(); Principios.abrir(); });
    const c3 = cmPage.locator('#ov-principios .pr-card', { hasText: 'Tercero' });
    await expect(c3).toContainText(/silenciado hasta las \d\d:\d\d/);
    await c3.locator('.pr-btn', { hasText: 'Reactivar' }).click();
    expect(await cmPage.evaluate(() => S.principios.principios[2].silenciadoHastaTs)).toBeUndefined();
    await expect(item(cmPage, 'Tercero')).toHaveCount(1);
    expect(consoleErrors).toEqual([]);
  });

  test('al tocar un aviso se abre la ventana de Principios en ese principio (mensaje del SW, tarjeta y panel); #foco-chequeo sigue andando', async ({ cmPage, consoleErrors }) => {
    await poner(cmPage, [prin({ id: 'p1', enunciado: 'Primero' }), prin({ id: 'p2', enunciado: 'Segundo', disparo: { tipo: 'diario' } })]);
    await a(cmPage, 9);
    const msg = (url) => cmPage.evaluate((u) => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { tipo: 'abrir-destino', url: u } })), url);
    await msg('https://x.test/Centro-de-mando/#principio-p2');
    const ov = cmPage.locator('#ov-principios.show');
    await expect(ov).toBeVisible();
    await expect(ov.locator('.pr-card')).toHaveCount(1);
    await expect(ov).toContainText('Segundo'); await expect(ov).not.toContainText('Primero');
    await ov.locator('.pr-btn', { hasText: 'Ver todos' }).click();
    await expect(ov.locator('.pr-card')).toHaveCount(2);
    // desde la tarjeta del aviso
    await cmPage.evaluate(() => { CMOverlay.close('ov-principios'); Principios.chequearAvisos(); });
    await cmPage.locator('#pr-avisos .pr-av-card .pr-av-link').click();
    await expect(cmPage.locator('#ov-principios.show .pr-card')).toHaveCount(1);
    // desde el panel
    await cmPage.evaluate(() => CMOverlay.close('ov-principios'));
    await bell(cmPage).click();
    await cmPage.locator('#pr-avisos .pr-av-item .pr-av-link').click();
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

  test('con el cierre del día y la revisión semanal visibles, la campanita sigue a la vista y el panel no se sale de la pantalla (domingo 21:00)', async ({ cmPage, consoleErrors }) => {
    await poner(cmPage, [prin({ disparo: { tipo: 'diario' } }), prin({ id: 'p2', enunciado: 'Dormir', disparo: DD })], { sleepLog: { '2026-11-15': { hours: 5 } } });
    await mostrarAvisos(cmPage);
    await a(cmPage, 21, 0, 15);
    await cmPage.evaluate(() => { window.renderGoals(); });
    await expect(cmPage.locator('#rs-nudge')).toBeVisible();
    await expect(cmPage.locator('#fo-nudge')).toBeVisible();
    await expect(bell(cmPage)).toBeVisible();
    const sol = await cmPage.evaluate(() => { const b = document.querySelector('#pr-avisos .pr-bell').getBoundingClientRect();
      return ['#rs-nudge', '#fo-nudge'].map((s) => { const o = document.querySelector(s).getBoundingClientRect(); return b.left < o.right && b.right > o.left && b.top < o.bottom && b.bottom > o.top; }); });
    expect(sol).toEqual([false, false]);
    await bell(cmPage).click();
    await expect(panel(cmPage)).toBeVisible();
    expect(await sinScrollH(cmPage)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
});
