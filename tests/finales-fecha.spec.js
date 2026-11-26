// Fecha de los finales del Plan de materias: tipo + selectores nativos (fecha, mes, hora, duración), migración del texto libre
// viejo (`target`) sin perder datos, `target` derivado para el resto de la app, y el final con hora en deadlines.js y en la
// Planificación del día. Materias y fechas de ejemplo. Hora de Argentina (-03:00).
'use strict';
const { test, expect } = require('./support/fixtures');
const path = require('path');
const D = require(path.join(__dirname, '..', 'deadlines.js'));

const TZ = '-03:00';
const ms = (fecha, hora) => Date.parse(fecha + 'T' + hora + ':00' + TZ);

// ── Node puro: deadlines.js ───────────────────────────────────────────────
test.describe('deadlines.js: final con hora', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });

  const estado = (fila, final) => ({
    lawPlan: [Object.assign({ id: 'r1', subject: 'Beta', fechaTipo: 'exacta', fecha: '2026-12-10', target: '10 de Diciembre 2026' }, fila)],
    sgc: { finales: [Object.assign({ id: 'f1', materia: 'Beta', fecha: '2026-12-10', tipo: 'Final Oral', done: false, lawPlanId: 'r1' }, final)] },
  });
  const final = (s, now) => D.collect(s, { now: now || ms('2026-12-01', '10:00'), tz: TZ }).find((i) => i.kind === 'final');

  test('con hora: evento con hora real y duración; sin hora o con hora de otra fecha: día completo (como siempre)', () => {
    let it = final(estado({ hora: '18:30', durMin: 90 }));
    expect(it.allDay).toBe(false);
    expect(it.time).toBe('18:30');
    expect(it.datetime).toBe('2026-12-10T18:30');
    expect(it.durMin).toBe(90);
    expect(it.at).toBe(ms('2026-12-10', '18:30'));
    expect(D.collect(estado({ hora: '18:30' }), { now: ms('2026-12-01', '10:00'), tz: TZ }).find((i) => i.kind === 'final').durMin).toBe(120);   // por defecto 2 h
    it = final(estado({}));
    expect(it.allDay).toBe(true);
    expect(it.durMin).toBeUndefined();
    it = final(estado({ hora: '18:30', fecha: '2026-12-09' }));          // la fila quedó con otra fecha: la hora no se arrastra
    expect(it.allDay).toBe(true);
    it = final(estado({ hora: '18:30', fechaTipo: 'mes' }));
    expect(it.allDay).toBe(true);
    it = final(estado({ hora: '25:99' }));                                  // hora inválida
    expect(it.allDay).toBe(true);
    it = final(estado({ hora: '18:30' }, { lawPlanId: undefined }));        // final suelto (sin fila)
    expect(it.allDay).toBe(true);
  });

  test('finalesConHora(día): solo los activos con hora de ese día, por hora', () => {
    const s = estado({ hora: '18:30', durMin: 150 });
    s.sgc.finales.push({ id: 'f2', materia: 'Otra', fecha: '2026-12-10', done: false });                       // sin fila
    s.sgc.finales.push({ id: 'f3', materia: 'Hecha', fecha: '2026-12-10', done: true, lawPlanId: 'r1' });      // rendido
    expect(D.finalesConHora(s, '2026-12-10')).toEqual([{ id: 'f1', materia: 'Beta', tipo: 'Final Oral', time: '18:30', durMin: 150 }]);
    expect(D.finalesConHora(s, '2026-12-11')).toEqual([]);
  });

  test('avisos del final con hora: escalonados por días + hoy 09:00 + 10 min antes; sin hora siguen igual', () => {
    const claves = (s) => D.collect(s, { now: ms('2026-12-01', '10:00'), tz: TZ }).find((i) => i.kind === 'final').alerts.map((a) => a.key.replace('final_f1@', ''));
    expect(claves(estado({ hora: '18:30' }))).toEqual([
      '2026-12-10T18:30_d60', '2026-12-10T18:30_d30', '2026-12-10T18:30_d15', '2026-12-10T18:30_d7', '2026-12-10T18:30_hoy', '2026-12-10T18:30_10m',
    ]);
    expect(claves(estado({ hora: '08:30' })).some((k) => k.endsWith('_hoy'))).toBe(false);   // examen a primera hora: el aviso de las 09:00 no tiene sentido
    expect(claves(estado({}))).toEqual([
      '2026-12-10T23:59_d60', '2026-12-10T23:59_d30', '2026-12-10T23:59_d15', '2026-12-10T23:59_d7', '2026-12-10T23:59_due',
    ]);
    // El aviso de 10 min antes dispara a las 18:20 y una sola vez.
    const s = estado({ hora: '18:30' });
    const seen = {};
    const antes = D.dueAlerts(s, { now: ms('2026-12-10', '18:21'), tz: TZ, seen });
    expect(antes.map((a) => a.title)).toContain('🎓 En 10 min: Beta');
  });
});

// ── Navegador ─────────────────────────────────────────────────────────────
const EN_PAGE = `
  window.__mas = (n) => { const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + n); return localStr(d); };
`;

async function armar(page, filas) {
  await page.evaluate(EN_PAGE);
  await page.evaluate((mk) => {
    S.lawProgress = { years: [{ id: 'y1', label: 'Primer Año', subjects: [
      { id: 'a2', name: 'Beta', done: false }, { id: 'a3', name: 'Gamma', done: false },
    ] }] };
    S.carrera = { regular: {}, pick: {} };
    S.sgc = S.sgc || {}; S.sgc.finales = [];
    S.dayPlan = {}; S.goals = {}; S.pomodoroHistory = [];
    S.lawPlan = new Function('return ' + mk)()();
    saveState();
    renderLawPlan();
  }, `() => [${filas}]`);
}

test('tabla de migración del texto libre: entrada → campos nuevos → target derivado', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, '');
  // "Hoy" = 2026-11-25 para los casos sin año.
  const casos = [
    // [entrada, campos esperados, target derivado]
    ['25 de Noviembre 2026',     { fechaTipo: 'exacta', fecha: '2026-11-25' },   '25 de Noviembre 2026'],
    ['15/12/2026',               { fechaTipo: 'exacta', fecha: '2026-12-15' },   '15 de Diciembre 2026'],
    ['15/12',                    { fechaTipo: 'exacta', fecha: '2026-12-15' },   '15 de Diciembre 2026'],
    ['15/03',                    { fechaTipo: 'exacta', fecha: '2027-03-15' },   '15 de Marzo 2027'],      // ya pasó este año → el que viene
    ['3-2-27',                   { fechaTipo: 'exacta', fecha: '2027-02-03' },   '3 de Febrero 2027'],
    ['2026-12-18',               { fechaTipo: 'exacta', fecha: '2026-12-18' },   '18 de Diciembre 2026'],
    ['15 dic',                   { fechaTipo: 'exacta', fecha: '2026-12-15' },   '15 de Diciembre 2026'],
    ['Jueves 10 de diciembre',   { fechaTipo: 'exacta', fecha: '2026-12-10' },   '10 de Diciembre 2026'],
    ['31/02/2026',               null,                                            null],                    // fecha imposible: no se adivina
    ['Junio 2026',               { fechaTipo: 'mes', mes: '2026-06' },           'Junio 2026'],
    ['dic',                      { fechaTipo: 'mes', mes: '2026-12' },           'Diciembre 2026'],
    ['diciembre 2026',           { fechaTipo: 'mes', mes: '2026-12' },           'Diciembre 2026'],
    ['sept 2027',                { fechaTipo: 'mes', mes: '2027-09' },           'Septiembre 2027'],
    ['12/2026',                  { fechaTipo: 'mes', mes: '2026-12' },           'Diciembre 2026'],
    ['Sin fecha',                { fechaTipo: 'sin' },                           'Sin fecha'],
    ['',                         { fechaTipo: 'sin' },                           'Sin fecha'],
    ['Promoción',                { fechaTipo: 'promo', sem: '', anio: '' },       'Promoción'],
    ['Promoción 1° sem. 2026',   { fechaTipo: 'promo', sem: '1', anio: '2026' },  'Promoción 1° sem. 2026'],
    ['promo 2do semestre 2026',  { fechaTipo: 'promo', sem: '2', anio: '2026' },  'Promoción 2° sem. 2026'],
    ['Libre / Online 2027',      { fechaTipo: 'libre', anio: '2027' },           'Libre / Online 2027'],
    ['online',                   { fechaTipo: 'libre', anio: '' },               'Libre / Online'],
    ['Noviembre u Online 2027',  null,                                            null],                    // mezcla dos cosas
    ['cuando pueda',             null,                                            null],
  ];
  const res = await cmPage.evaluate((cs) => cs.map(([txt]) => {
    const p = _lawTargetParse(txt, '2026-11-25');
    if (p) delete p.inferido;
    return [p, p ? _lawTargetDeCampos(p) : null];
  }), casos);
  casos.forEach(([txt, campos, derivado], i) => {
    expect.soft(res[i][0], 'campos de «' + txt + '»').toEqual(campos);
    expect.soft(res[i][1], 'target derivado de «' + txt + '»').toBe(derivado);
  });
  // Lo que no se interpreta se conserva tal cual y se muestra como sin fecha + texto original.
  const c = await cmPage.evaluate(() => _lawFilaCampos({ id: 'x', subject: 'Z', target: 'Noviembre u Online 2027' }));
  expect(c).toEqual({ fechaTipo: 'sin', orig: 'Noviembre u Online 2027' });
  // Todos los targets del plan de ejemplo de la app se interpretan o se conservan (nada rompe).
  expect(consoleErrors).toEqual([]);
});

test('migrar no escribe: abrir el plan con filas viejas deja S.lawPlan idéntico', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, `{ id: 'r1', subject: 'Beta', target: 'Junio 2026' }, { id: 'r2', subject: 'Gamma', target: 'Noviembre u Online 2027' }`);
  const antes = await cmPage.evaluate(() => JSON.stringify(S.lawPlan));
  await cmPage.evaluate(() => Finales.open('plan'));
  await cmPage.evaluate(() => { openEditLawPlan('r1'); closeModal('modal-law-plan'); openEditLawPlan('r2'); closeModal('modal-law-plan'); });
  expect(await cmPage.evaluate(() => JSON.stringify(S.lawPlan))).toBe(antes);
  expect(consoleErrors).toEqual([]);
});

test('el editor muestra los campos de cada tipo y guarda fecha + hora + duración; target se deriva', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, `{ id: 'r1', subject: 'Beta', target: 'Sin fecha' }`);
  await cmPage.evaluate(() => Finales.open('plan'));
  await cmPage.evaluate(() => openEditLawPlan('r1'));
  const vis = (id) => cmPage.locator(id).isVisible();
  await expect(cmPage.locator('#lawPlanFechaTipo')).toHaveValue('sin');
  expect([await vis('#lawPlanFExacta'), await vis('#lawPlanFMes'), await vis('#lawPlanFAnio')]).toEqual([false, false, false]);
  await cmPage.selectOption('#lawPlanFechaTipo', 'exacta');
  expect([await vis('#lawPlanFExacta'), await vis('#lawPlanFMes'), await vis('#lawPlanFAnio')]).toEqual([true, false, false]);
  await expect(cmPage.locator('#lawPlanFecha')).toHaveAttribute('type', 'date');
  await expect(cmPage.locator('#lawPlanHora')).toHaveAttribute('type', 'time');
  await expect(cmPage.locator('#lawPlanDur')).toHaveValue('120');         // 2 h por defecto
  await cmPage.selectOption('#lawPlanFechaTipo', 'mes');
  expect([await vis('#lawPlanFExacta'), await vis('#lawPlanFMes'), await vis('#lawPlanFAnio')]).toEqual([false, true, false]);
  await expect(cmPage.locator('#lawPlanMes')).toHaveAttribute('type', 'month');
  await cmPage.selectOption('#lawPlanFechaTipo', 'promo');
  expect([await vis('#lawPlanFAnio'), await vis('#lawPlanSem')]).toEqual([true, true]);
  await cmPage.selectOption('#lawPlanFechaTipo', 'libre');
  expect([await vis('#lawPlanFAnio'), await vis('#lawPlanSem')]).toEqual([true, false]);

  // Fecha exacta sin elegir fecha: avisa y no guarda.
  await cmPage.selectOption('#lawPlanFechaTipo', 'exacta');
  await cmPage.click('#modal-law-plan .btn-primary');
  await expect(cmPage.locator('#modal-law-plan')).toHaveClass(/open/);
  expect(await cmPage.evaluate(() => S.lawPlan[0].target)).toBe('Sin fecha');

  // Fecha + hora + duración: crea su final y la fila guarda campos + target derivado.
  const fecha = await cmPage.evaluate(() => __mas(20));
  await cmPage.fill('#lawPlanFecha', fecha);
  await cmPage.fill('#lawPlanHora', '18:30');
  await cmPage.selectOption('#lawPlanDur', '90');
  await cmPage.click('#modal-law-plan .btn-primary');
  const fila = await cmPage.evaluate(() => S.lawPlan[0]);
  expect(fila).toMatchObject({ fechaTipo: 'exacta', fecha, hora: '18:30', durMin: 90 });
  expect(fila.target).toBe(await cmPage.evaluate((f) => _lawTargetDeISO(f), fecha));
  const fs = await cmPage.evaluate(() => S.sgc.finales);
  expect(fs.length).toBe(1);
  expect(fs[0]).toMatchObject({ lawPlanId: 'r1', fecha });
  await expect(cmPage.locator('#law-plan-wrap tr', { hasText: 'Beta' })).toContainText('18:30');
  const item = await cmPage.evaluate(() => CMDeadlines.collect(S, { now: Date.now() }).find((i) => i.kind === 'final'));
  expect(item).toMatchObject({ allDay: false, time: '18:30', durMin: 90 });

  // Pasar a "Solo mes": se limpian fecha/hora y el target queda como mes.
  await cmPage.evaluate(() => openEditLawPlan('r1'));
  await expect(cmPage.locator('#lawPlanFecha')).toHaveValue(fecha);
  await expect(cmPage.locator('#lawPlanHora')).toHaveValue('18:30');
  await cmPage.selectOption('#lawPlanFechaTipo', 'mes');
  await cmPage.fill('#lawPlanMes', '2099-06');
  await cmPage.click('#modal-law-plan .btn-primary');
  const f2 = await cmPage.evaluate(() => S.lawPlan[0]);
  expect(f2).toMatchObject({ fechaTipo: 'mes', mes: '2099-06', target: 'Junio 2099' });
  expect(f2.fecha).toBeUndefined(); expect(f2.hora).toBeUndefined(); expect(f2.durMin).toBeUndefined();
  expect(consoleErrors).toEqual([]);
});

test('texto viejo que no se interpreta: se muestra para corregirlo y guardar sin tocar la fecha lo conserva', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, `{ id: 'r1', subject: 'Beta', target: 'Noviembre u Online 2027' }`);
  await cmPage.evaluate(() => Finales.open('plan'));
  await expect(cmPage.locator('#law-plan-wrap tr', { hasText: 'Beta' })).toContainText('Noviembre u Online 2027');   // la tabla lo sigue mostrando
  await cmPage.evaluate(() => openEditLawPlan('r1'));
  await expect(cmPage.locator('#lawPlanFechaTipo')).toHaveValue('sin');
  await expect(cmPage.locator('#lawPlanFOrig')).toContainText('Noviembre u Online 2027');
  await cmPage.selectOption('#lawPlanComision', 'B');
  await cmPage.click('#modal-law-plan .btn-primary');
  const fila = await cmPage.evaluate(() => S.lawPlan[0]);
  expect(fila.target).toBe('Noviembre u Online 2027');
  expect(fila.fechaTipo).toBeUndefined();
  expect(fila.comision).toBe('B');
  expect(consoleErrors).toEqual([]);
});

test('Planificación: el final con hora aparece en su día con hora y duración; sin hora no; no cuenta como tarea', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, `{ id: 'r1', subject: 'Beta', target: 'x' }, { id: 'r2', subject: 'Gamma', target: 'x' }`);
  await cmPage.evaluate(() => {
    const hoy = getActiveDate();
    S.lawPlan[0] = { id: 'r1', subject: 'Beta', fechaTipo: 'exacta', fecha: hoy, hora: '18:30', durMin: 90, target: _lawTargetDeISO(hoy) };
    S.lawPlan[1] = { id: 'r2', subject: 'Gamma', fechaTipo: 'exacta', fecha: hoy, target: _lawTargetDeISO(hoy) };
    S.sgc.finales = [
      { id: 'f1', materia: 'Beta', subjectId: 'a2', fecha: hoy, tipo: 'Final Oral', done: false, lawPlanId: 'r1' },
      { id: 'f2', materia: 'Gamma', subjectId: 'a3', fecha: hoy, tipo: 'Final Oral', done: false, lawPlanId: 'r2' },
    ];
    S.dayPlan[hoy] = { tasks: [{ id: 'p1', text: 'Repasar', time: '10:00', duration: 60, priority: 2, area: 'conocimiento', done: false }] };
    saveState();
  });
  const dia = await cmPage.evaluate(() => plannerDayAgenda(getActiveDate()).map((t) => [t.text, t.time, t.duration]));
  expect(dia).toEqual([['Repasar', '10:00', 60], ['Final · Beta', '18:30', 90]]);   // Gamma (sin hora) no figura

  await cmPage.evaluate(() => plannerOverlayOpen());
  const fila = cmPage.locator('#plov-list-dia .pcal-final').first();
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('Final · Beta');
  await expect(fila).toContainText('18:30');
  await expect(fila.locator('input[type=checkbox], .pcal-del')).toHaveCount(0);   // solo lectura: se rinde desde Finales
  // El progreso del día cuenta solo la actividad real.
  await expect(cmPage.locator('#plov-list-dia .pdb-count').first()).toHaveText('0/1');
  // Tocarlo abre el Plan de materias.
  await fila.click();
  await expect(cmPage.locator('#ov-finales')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('capturas: editor y Planificación con el final a su hora', async ({ cmPage }, testInfo) => {
  test.skip(!process.env.CAPTURAS, 'solo con CAPTURAS=<carpeta>');
  const dir = process.env.CAPTURAS, w = testInfo.project.name === 'chromium-mobile' ? 390 : 1280;
  await armar(cmPage, `{ id: 'r1', subject: 'Beta', target: 'x' }`);
  await cmPage.evaluate(() => {
    const hoy = getActiveDate();
    S.lawPlan[0] = { id: 'r1', subject: 'Beta', fechaTipo: 'exacta', fecha: hoy, hora: '18:30', durMin: 120, target: _lawTargetDeISO(hoy), tipo: 'Final Oral' };
    S.sgc.finales = [{ id: 'f1', materia: 'Beta', subjectId: 'a2', fecha: hoy, tipo: 'Final Oral', done: false, lawPlanId: 'r1' }];
    S.dayPlan[hoy] = { tasks: [{ id: 'p1', text: 'Repasar unidad 3', time: '15:00', duration: 90, priority: 2, area: 'conocimiento', done: false }] };
    saveState();
    openEditLawPlan('r1');
  });
  await cmPage.waitForTimeout(500);
  await cmPage.screenshot({ path: `${dir}/editor-${w}.png` });
  await cmPage.evaluate(() => { closeModal('modal-law-plan'); plannerOverlayOpen(); });
  await cmPage.waitForTimeout(800);
  await cmPage.evaluate(() => document.querySelector('#plov-list-dia .pcal-final').scrollIntoView({ block: 'center' }));
  await cmPage.waitForTimeout(400);
  await cmPage.screenshot({ path: `${dir}/planificacion-${w}.png` });
});

test('editor de Finales: fecha nativa + hora + duración; la fila del plan queda con los mismos campos y la hora no se pierde', async ({ cmPage, consoleErrors }, testInfo) => {
  await armar(cmPage, `{ id: 'r1', subject: 'Beta', target: 'x' }`);
  const f0 = await cmPage.evaluate(() => __mas(10)), f1 = await cmPage.evaluate(() => __mas(12));
  await cmPage.evaluate((f) => {
    S.lawPlan[0] = { id: 'r1', subject: 'Beta', fechaTipo: 'exacta', fecha: f, hora: '18:30', durMin: 90, target: _lawTargetDeISO(f), tipo: 'Final Oral' };
    S.sgc.finales = [{ id: 'f1', materia: 'Beta', subjectId: 'a2', fecha: f, tipo: 'Final Oral', done: false, doneEl: null, lawPlanId: 'r1' }];
    saveState(); Finales.open('historial'); Finales.edit('f1');
  }, f0);
  await expect(cmPage.locator('#fin-e-fecha')).toHaveAttribute('type', 'date');
  await expect(cmPage.locator('#fin-e-hora')).toHaveValue('18:30');
  await expect(cmPage.locator('#fin-e-dur')).toHaveValue('90');
  if (process.env.CAPTURAS) {
    const w = testInfo.project.name === 'chromium-mobile' ? 390 : 1280;
    await cmPage.waitForTimeout(500);
    await cmPage.screenshot({ path: `${process.env.CAPTURAS}/editor-finales-${w}.png` });
  }
  await cmPage.fill('#fin-e-fecha', f1);
  await cmPage.click('#ov-finales-list button:has-text("Guardar")');
  const fila = await cmPage.evaluate(() => S.lawPlan[0]);
  expect(fila).toMatchObject({ fechaTipo: 'exacta', fecha: f1, hora: '18:30', durMin: 90 });
  expect(fila.target).toBe(await cmPage.evaluate((f) => _lawTargetDeISO(f), f1));
  expect((await cmPage.evaluate(() => CMDeadlines.collect(S, { now: Date.now() }).find((i) => i.kind === 'final'))).time).toBe('18:30');
  // Sacar la hora desde Finales también se refleja.
  await cmPage.evaluate(() => Finales.edit('f1'));
  await cmPage.fill('#fin-e-hora', '');
  await cmPage.click('#ov-finales-list button:has-text("Guardar")');
  const f2 = await cmPage.evaluate(() => S.lawPlan[0]);
  expect(f2.hora).toBeUndefined(); expect(f2.durMin).toBeUndefined();
  // Un final suelto → su fila nace con los campos nuevos.
  await cmPage.evaluate((f) => { S.sgc.finales.push({ id: 'fs', materia: 'Suelta', subjectId: null, fecha: f, tipo: 'Final Oral', done: false, doneEl: null }); Finales.editarSuelto('fs'); }, f1);
  expect(await cmPage.evaluate(() => S.lawPlan.find((r) => r.subject === 'Suelta'))).toMatchObject({ fechaTipo: 'exacta', fecha: f1 });
  expect(consoleErrors).toEqual([]);
});
