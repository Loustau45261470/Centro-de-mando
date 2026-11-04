// Plan de Materias <-> Finales: una fila con día+mes+año crea su final (f.lawPlanId); fecha y tipo se reflejan en
// ambos sentidos; la fila suma Comisión y Tipo de examen; al aprobar el final la fila figura "Rendida".
// Todas las materias y fechas son de ejemplo (fechas relativas a hoy para que nunca se venzan).
'use strict';
const { test, expect } = require('./support/fixtures');

const EN_PAGE = `
  window.__mas = (n) => { const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + n); return localStr(d); };
  window.__txt = (n) => _lawTargetDeISO(window.__mas(n));
`;

// Carrera con 4 materias pendientes + 1 aprobada; el Plan de Materias lo arma cada test.
async function armar(page, filas) {
  await page.evaluate(EN_PAGE);
  await page.evaluate((mk) => {
    S.lawProgress = { years: [
      { id: 'y1', label: 'Primer Año', subjects: [
        { id: 'a1', name: 'Alfa', done: true, grade: 7 },
        { id: 'a2', name: 'Beta', done: false },
        { id: 'a3', name: 'Gamma', done: false },
        { id: 'a4', name: 'Delta', done: false },
      ] },
    ] };
    S.carrera = { regular: {}, pick: {} };
    S.sgc = S.sgc || {};
    S.sgc.finales = [];
    S.dayPlan = {};
    S.pomodoroHistory = [];
    S.lawPlan = new Function('return ' + mk)()();
    saveState();
    renderLawPlan();   // lo mismo que corre al iniciar la app con las filas ya cargadas
  }, `() => [${filas}]`);
  await page.evaluate(() => Finales.open('plan'));   // la tabla del plan vive en el overlay "Plan de materias"
}

const finales = (page) => page.evaluate(() => S.sgc.finales);
const fila = (page, id) => page.evaluate((i) => S.lawPlan.find((r) => r.id === i), id);
const tabla = (page) => page.locator('#law-plan-wrap');

test('el modal del plan ofrece Comisión (A, B, C, Unificada) y los tipos de examen de Finales; se guardan y se ven en la fila', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, `{ id: 'r1', subject: 'Beta', target: 'Online 2027' }`);
  await cmPage.evaluate(() => openAddLawPlan());
  const com = await cmPage.locator('#lawPlanComision option').evaluateAll((os) => os.map((o) => o.value));
  expect(com).toEqual(['', 'A', 'B', 'C', 'Unificada']);
  const tipos = await cmPage.locator('#lawPlanTipo option').evaluateAll((os) => os.map((o) => o.value));
  expect(tipos).toEqual(['', ...(await cmPage.evaluate(() => Finales.TIPOS))]);
  expect(tipos).toContain('Final MC');

  await cmPage.fill('#lawPlanSubject', 'Gamma');
  await cmPage.fill('#lawPlanTarget', 'Junio 2099');
  await cmPage.selectOption('#lawPlanComision', 'B');
  await cmPage.selectOption('#lawPlanTipo', 'Final MC');
  await cmPage.click('#modal-law-plan .btn-primary');

  const nueva = await cmPage.evaluate(() => S.lawPlan.find((r) => r.subject === 'Gamma'));
  expect(nueva).toMatchObject({ target: 'Junio 2099', comision: 'B', tipo: 'Final MC' });
  await expect(tabla(cmPage)).toContainText('Com. B');
  await expect(tabla(cmPage)).toContainText('Final MC');

  // Editar: los selects vuelven con lo guardado; "—" los borra de la fila.
  await cmPage.evaluate((id) => openEditLawPlan(id), nueva.id);
  await expect(cmPage.locator('#lawPlanComision')).toHaveValue('B');
  await expect(cmPage.locator('#lawPlanTipo')).toHaveValue('Final MC');
  await cmPage.selectOption('#lawPlanComision', '');
  await cmPage.selectOption('#lawPlanTipo', '');
  await cmPage.click('#modal-law-plan .btn-primary');
  const limpia = await fila(cmPage, nueva.id);
  expect(limpia.comision).toBeUndefined();
  expect(limpia.tipo).toBeUndefined();
  expect(consoleErrors).toEqual([]);
});

test('solo una fecha con día, mes y año crea el final; solo mes, sin fecha o pasada no crean nada', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, `
    { id: 'r1', subject: 'Beta', target: __txt(20), tipo: 'Final MC', comision: 'B' },
    { id: 'r2', subject: 'Gamma', target: 'Noviembre 2099' },
    { id: 'r3', subject: 'Delta', target: '3 de marzo 2020' },
    { id: 'r4', subject: 'Alfa', target: __txt(25) },
    { id: 'r5', subject: 'Sin materia en la carrera', target: __txt(30) },
    { id: 'r6', subject: 'Otra', target: 'Sin fecha' }`);
  const fs = await finales(cmPage);
  const f20 = await cmPage.evaluate(() => __mas(20));
  const f30 = await cmPage.evaluate(() => __mas(30));
  // r1 (Beta) y r5 (texto libre). r4 es Alfa: ya aprobada en la carrera, no se crea.
  expect(fs.map((f) => f.lawPlanId).sort()).toEqual(['r1', 'r5']);
  const beta = fs.find((f) => f.lawPlanId === 'r1');
  expect(beta).toMatchObject({ materia: 'Beta', subjectId: 'a2', fecha: f20, tipo: 'Final MC', done: false });
  const libre = fs.find((f) => f.lawPlanId === 'r5');
  expect(libre).toMatchObject({ materia: 'Sin materia en la carrera', subjectId: null, fecha: f30, tipo: 'Final Escrito' }); // sin tipo en la fila: el primero

  // Idempotente: volver a dibujar el plan no duplica.
  await cmPage.evaluate(() => { renderLawPlan(); renderLawPlan(true); });
  expect((await finales(cmPage)).length).toBe(2);
  expect(consoleErrors).toEqual([]);
});

test('no duplica: un final suelto de la misma materia y fecha se vincula; con otra fecha, al iniciar no se pisa', async ({ cmPage }) => {
  await cmPage.evaluate(EN_PAGE);
  await armar(cmPage, ``);
  await cmPage.evaluate(() => {
    S.sgc.finales = [
      { id: 'sueltoBeta', materia: 'Beta', subjectId: 'a2', fecha: __mas(15), tipo: 'Final Oral', done: false, doneEl: null },
      { id: 'sueltoGamma', materia: 'Gamma', subjectId: 'a3', fecha: __mas(50), tipo: 'Final Oral', done: false, doneEl: null },
    ];
    S.lawPlan = [
      { id: 'r1', subject: 'BETA', target: __txt(15) },    // misma fecha (nombre en mayúsculas): se vincula
      { id: 'r2', subject: 'Gamma', target: __txt(10) },   // otra fecha: no se crea otro ni se pisa el cargado a mano
    ];
    saveState(); renderLawPlan();
  });
  const fs = await finales(cmPage);
  expect(fs.length).toBe(2);
  expect(fs.find((f) => f.id === 'sueltoBeta').lawPlanId).toBe('r1');
  expect(fs.find((f) => f.id === 'sueltoBeta').tipo).toBe('Final Oral');
  expect(fs.find((f) => f.id === 'sueltoGamma').lawPlanId).toBeUndefined();
  expect(fs.find((f) => f.id === 'sueltoGamma').fecha).toBe(await cmPage.evaluate(() => __mas(50)));
});

test('guardar la fila desde el modal crea/actualiza el final; pasar a "solo mes" lo deja como está', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, `{ id: 'r1', subject: 'Beta', target: 'Online 2027' }`);
  expect((await finales(cmPage)).length).toBe(0);

  const guardar = async (target, tipo) => {
    await cmPage.evaluate(() => openEditLawPlan('r1'));
    await cmPage.fill('#lawPlanTarget', target);
    if (tipo) await cmPage.selectOption('#lawPlanTipo', tipo);
    await cmPage.click('#modal-law-plan .btn-primary');
  };
  const t12 = await cmPage.evaluate(() => __txt(12));
  await guardar(t12, 'Final Mixto');
  let fs = await finales(cmPage);
  expect(fs.length).toBe(1);
  expect(fs[0]).toMatchObject({ lawPlanId: 'r1', materia: 'Beta', subjectId: 'a2', fecha: await cmPage.evaluate(() => __mas(12)), tipo: 'Final Mixto' });
  await expect(cmPage.locator('#finales-wrap-conocimiento')).toContainText('Beta');

  // Cambia la fecha y el tipo en la fila -> se actualiza el mismo final.
  await guardar(await cmPage.evaluate(() => __txt(18)), 'Final Oral');
  fs = await finales(cmPage);
  expect(fs.length).toBe(1);
  expect(fs[0]).toMatchObject({ fecha: await cmPage.evaluate(() => __mas(18)), tipo: 'Final Oral' });

  // Solo mes: el final no se borra ni se mueve.
  await guardar('Diciembre 2099');
  fs = await finales(cmPage);
  expect(fs.length).toBe(1);
  expect(fs[0].fecha).toBe(await cmPage.evaluate(() => __mas(18)));
  expect(consoleErrors).toEqual([]);
});

test('editar fecha y tipo del final actualiza la fila ("25 de Noviembre 2026") y reacomoda el plan de estudio', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, `{ id: 'r1', subject: 'Beta', target: __txt(40), comision: 'C' }`);
  const id = (await finales(cmPage))[0].id;
  await cmPage.evaluate((i) => {
    const f = S.sgc.finales.find((x) => x.id === i);
    f.plan = { horasSemana: 7, dias: [0, 1, 2, 3, 4, 5, 6], hora: '18:00', creado: getActiveDate(), totalHoras: 20 };
    saveState();
  }, id);

  await cmPage.evaluate(() => Finales.open());
  await cmPage.evaluate((i) => Finales.edit(i), id);
  const nueva = await cmPage.evaluate(() => __mas(9));
  await cmPage.fill('#fin-e-fecha', nueva);
  await cmPage.selectOption('#fin-e-tipo', 'Final MC');
  await cmPage.locator('#ov-finales-list .btn-sm:has-text("Guardar")').click();

  const r = await fila(cmPage, 'r1');
  expect(r.target).toBe(await cmPage.evaluate(() => __txt(9)));
  expect(r.target).toMatch(/^\d{1,2} de [A-ZÁÉÍÓÚ][a-záéíóú]+ \d{4}$/);   // mes capitalizado, en español
  expect(r.tipo).toBe('Final MC');
  expect(r.comision).toBe('C');
  await expect(tabla(cmPage)).toContainText('Final MC');

  // Plan de estudio: los bloques se rehacen hasta el día antes de la nueva fecha.
  const bloques = await cmPage.evaluate((i) => Finales.bloquesDe(S.sgc.finales.find((x) => x.id === i)).map((b) => b.date), id);
  expect(bloques.length).toBeGreaterThan(0);
  bloques.forEach((d) => expect(d < nueva).toBe(true));
  expect(await cmPage.evaluate((i) => S.sgc.finales.find((x) => x.id === i).plan.ajuste.fecha, id)).toBe(await cmPage.evaluate(() => getActiveDate()));
  expect(consoleErrors).toEqual([]);
});

test('borrar el final vinculado deja la fila con su fecha y finalOff; cambiar la fecha de la fila lo vuelve a crear', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, `{ id: 'r1', subject: 'Beta', target: __txt(20) }`);
  const id = (await finales(cmPage))[0].id;
  const t20 = await cmPage.evaluate(() => __txt(20));

  await cmPage.evaluate((i) => Finales.del(i), id);
  expect((await finales(cmPage)).length).toBe(0);
  expect(await fila(cmPage, 'r1')).toMatchObject({ target: t20, finalOff: true });
  await cmPage.evaluate(() => { renderLawPlan(); renderLawPlan(true); });
  expect((await finales(cmPage)).length).toBe(0);   // no se recrea

  // Guardar la fila sin tocar la fecha (p. ej. solo la comisión) tampoco lo recrea.
  await cmPage.evaluate(() => openEditLawPlan('r1'));
  await cmPage.selectOption('#lawPlanComision', 'A');
  await cmPage.click('#modal-law-plan .btn-primary');
  expect((await finales(cmPage)).length).toBe(0);
  expect((await fila(cmPage, 'r1')).finalOff).toBe(true);

  // Cambiar la fecha borra la marca y vuelve a crearlo.
  await cmPage.evaluate(() => openEditLawPlan('r1'));
  await cmPage.fill('#lawPlanTarget', await cmPage.evaluate(() => __txt(22)));
  await cmPage.click('#modal-law-plan .btn-primary');
  const fs = await finales(cmPage);
  expect(fs.length).toBe(1);
  expect(fs[0]).toMatchObject({ lawPlanId: 'r1', fecha: await cmPage.evaluate(() => __mas(22)) });
  expect((await fila(cmPage, 'r1')).finalOff).toBeUndefined();
  expect(consoleErrors).toEqual([]);
});

test('aprobar el final marca la fila "Rendida" (con la nota) y reactivarlo la devuelve a su fecha', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, `{ id: 'r1', subject: 'Beta', target: __txt(20) }, { id: 'r2', subject: 'Gamma', target: 'Online 2027' }`);
  const id = (await finales(cmPage))[0].id;
  const t20 = await cmPage.evaluate(() => __txt(20));
  const filaBeta = tabla(cmPage).locator('tr', { hasText: 'Beta' });
  await expect(filaBeta).toContainText(t20.split(' ')[2]);   // el mes
  await expect(filaBeta).not.toContainText('Rendida');

  await cmPage.evaluate((i) => Finales.done(i), id);
  await cmPage.fill('#fin-nota', '8');
  await cmPage.click('#modal-final-nota .btn-primary');
  await expect(filaBeta).toContainText('✅ Rendida');
  await expect(filaBeta).toContainText('8');
  await expect(filaBeta).not.toContainText(t20.split(' ')[2]);
  await expect(tabla(cmPage).locator('tr', { hasText: 'Gamma' })).not.toContainText('Rendida');
  expect((await finales(cmPage))[0].done).toBe(true);
  await cmPage.evaluate(() => { renderLawPlan(); });
  expect((await finales(cmPage)).length).toBe(1);   // rendido no se recrea

  await cmPage.evaluate((i) => Finales.reactivar(i), id);
  await expect(filaBeta).not.toContainText('Rendida');
  await expect(filaBeta).toContainText(t20.split(' ')[2]);

  // Cerrado sin cargar nota (la carrera no se toca): igual figura rendida, sin nota.
  await cmPage.evaluate(() => { S.lawProgress.years[0].subjects.find((x) => x.id === 'a2').done = false; });   // la nota de arriba la había aprobado
  await cmPage.evaluate((i) => Finales.del(i), id);
  await cmPage.evaluate(() => { openEditLawPlan('r1'); });
  await cmPage.fill('#lawPlanTarget', await cmPage.evaluate(() => __txt(21)));
  await cmPage.click('#modal-law-plan .btn-primary');
  const id2 = (await finales(cmPage))[0].id;
  await cmPage.evaluate((i) => { const f = S.sgc.finales.find((x) => x.id === i); f.done = true; f.doneEl = getActiveDate(); renderLawPlan(true); }, id2);
  await expect(filaBeta).toContainText('✅ Rendida');
  expect(consoleErrors).toEqual([]);
});

test('desaprobar: la fila no figura "Rendida", no se recrea con la misma fecha y una fecha nueva crea el final nuevo', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, `{ id: 'r1', subject: 'Beta', target: __txt(20) }`);
  const f1 = (await finales(cmPage))[0];
  expect(f1.id).toBe('lp_r1_' + (await cmPage.evaluate(() => __mas(20))));   // id fijo: dos dispositivos crean el mismo
  await cmPage.evaluate((i) => Finales.done(i), f1.id);
  await cmPage.evaluate(() => Finales.notaDesaprobe());
  const filaBeta = tabla(cmPage).locator('tr', { hasText: 'Beta' });
  await expect(filaBeta).not.toContainText('Rendida');
  await cmPage.evaluate(() => { renderLawPlan(); });
  expect((await finales(cmPage)).filter((f) => !f.done)).toEqual([]);   // misma fecha: no vuelve a aparecer

  await cmPage.evaluate(() => { openEditLawPlan('r1'); });
  await cmPage.fill('#lawPlanTarget', await cmPage.evaluate(() => __txt(40)));
  await cmPage.click('#modal-law-plan .btn-primary');
  const activos = (await finales(cmPage)).filter((f) => !f.done);
  expect(activos.length).toBe(1);
  expect(activos[0]).toMatchObject({ lawPlanId: 'r1', fecha: await cmPage.evaluate(() => __mas(40)) });
  expect(consoleErrors).toEqual([]);
});

test('las tarjetas de final muestran la comisión de la fila vinculada', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, `
    { id: 'r1', subject: 'Beta', target: __txt(20), comision: 'B' },
    { id: 'r2', subject: 'Gamma', target: __txt(30), comision: 'Unificada' },
    { id: 'r3', subject: 'Delta', target: __txt(40) }`);
  const card = cmPage.locator('#finales-wrap-conocimiento');
  await expect(card.locator('.fin-item', { hasText: 'Beta' })).toContainText('Com. B');
  await expect(card.locator('.fin-item', { hasText: 'Gamma' })).toContainText('Unificada');
  await expect(card.locator('.fin-item', { hasText: 'Delta' })).not.toContainText('Com.');
  await cmPage.evaluate(() => Finales.open('plan'));
  await expect(tabla(cmPage)).toContainText('Com. B');
  expect(consoleErrors).toEqual([]);
});
