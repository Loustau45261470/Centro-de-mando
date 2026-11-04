// A6 — Final aprobado → carrera: el final se carga eligiendo una materia del plan (guarda subjectId),
// y al aprobarlo se pide la nota y se marca la materia en S.lawProgress (done + grade).
// Las materias del plan se arman en el test (el código no trae datos personales).
'use strict';
const { test, expect } = require('./support/fixtures');

// Plan mínimo con ids reales del puente de correlativas.js:
//   s1_1 (ya aprobada) · s2_4 "Constitución…" · s2_8 "Derecho constitucional del poder" (se cursa con 2_4 regularizada).
async function armarPlan(page) {
  await page.evaluate(() => {
    S.lawProgress = { years: [
      { id: 'y1', label: 'Primer Año', subjects: [
        { id: 's1_1', name: 'Introducción a la filosofía', done: true, grade: 7 },
      ] },
      { id: 'y2', label: 'Segundo Año', subjects: [
        { id: 's2_4', name: 'Constitución, derechos humanos y garantías', done: false },
        { id: 's2_8', name: 'Derecho constitucional del poder', done: false },
      ] },
    ] };
    S.carrera = { regular: {}, pick: {} };
    S.sgc = S.sgc || {};
    S.sgc.finales = [];
    saveState();
  });
}

const fila = (page, id) => page.evaluate((i) => {
  for (const y of S.lawProgress.years) { const s = y.subjects.find((x) => x.id === i); if (s) return { done: !!s.done, grade: s.grade ?? null }; }
  return null;
}, id);
const finalDe = (page, id) => page.evaluate((i) => S.sgc.finales.find((f) => f.id === i) || null, id);

async function sembrarFinal(page, extra) {
  await page.evaluate((e) => {
    S.sgc.finales.push(Object.assign({ id: 'fx', materia: 'X', fecha: getActiveDate(), tipo: 'Final Escrito', done: false, doneEl: null }, e));
    saveState();
  }, extra);
}

// El overlay ya no tiene formulario "+ Agregar" (los finales se crean desde el Plan de materias): el selector de materia
// vive en la edición de un final del Historial. Final rendido de antes, con fecha pasada para que siga en el historial.
test('editar un final del historial eligiendo la materia del plan guarda subjectId y nombre; las aprobadas no se ofrecen', async ({ cmPage }) => {
  await armarPlan(cmPage);
  await sembrarFinal(cmPage, { id: 'fh', materia: 'Algo viejo', fecha: '2020-01-01', done: true, doneEl: '2020-01-01' });
  await cmPage.evaluate(() => { Finales.open(); Finales.edit('fh'); });
  const opciones = await cmPage.locator('#fin-e-materia-sel option').evaluateAll((os) => os.map((o) => o.value));
  expect(opciones).toEqual(['', 's2_4', 's2_8', '__otra']); // s1_1 aprobada: fuera
  // Sin elegir materia no guarda.
  await cmPage.selectOption('#fin-e-materia-sel', '');
  await cmPage.click('#ov-finales-list >> text=Guardar');
  expect((await finalDe(cmPage, 'fh')).materia).toBe('Algo viejo');

  await cmPage.selectOption('#fin-e-materia-sel', 's2_4');
  await cmPage.click('#ov-finales-list >> text=Guardar');
  expect(await finalDe(cmPage, 'fh')).toMatchObject({ subjectId: 's2_4', materia: 'Constitución, derechos humanos y garantías', done: true });
});

test('"Otra (escribir)" deja el texto libre sin subjectId', async ({ cmPage }) => {
  await armarPlan(cmPage);
  await sembrarFinal(cmPage, { id: 'fh', materia: 'Algo viejo', fecha: '2020-01-01', done: true, doneEl: '2020-01-01' });
  await cmPage.evaluate(() => { Finales.open(); Finales.edit('fh'); });
  await cmPage.selectOption('#fin-e-materia-sel', '__otra');
  await cmPage.fill('#fin-e-materia', 'Materia que no está en el plan');
  await cmPage.click('#ov-finales-list >> text=Guardar');
  const f = await finalDe(cmPage, 'fh');
  expect(f.materia).toBe('Materia que no está en el plan');
  expect(f.subjectId).toBeNull();
});

test('aprobar con nota marca done/grade en la carrera y habilita la correlativa dependiente', async ({ cmPage }) => {
  await armarPlan(cmPage);
  await sembrarFinal(cmPage, { id: 'f1', materia: 'Constitución, derechos humanos y garantías', subjectId: 's2_4', lawPlanId: 'r1' });
  await cmPage.evaluate(() => { S.lawPlan = [{ id: 'r1', subject: 'Constitución, derechos humanos y garantías', target: 'Sin fecha' }]; saveState(); });
  const reqDeDependiente = [['Regularizada', '60-4320']]; // "Derecho constitucional del poder" necesita 2_4 regularizada o aprobada
  expect(await cmPage.evaluate((r) => Correlativas.evalReqCursar(r), reqDeDependiente)).toBe(false);

  await cmPage.evaluate(() => Finales.open('plan'));
  await cmPage.locator('#law-plan-wrap .law-rendida').click();   // ✓ de la fila del plan
  await expect(cmPage.locator('#modal-final-nota')).toHaveClass(/open/);
  await cmPage.fill('#fin-nota', '8');
  await cmPage.click('#modal-final-nota .btn-primary');

  expect(await fila(cmPage, 's2_4')).toEqual({ done: true, grade: 8 });
  expect(await finalDe(cmPage, 'f1')).toMatchObject({ done: true });
  expect(await cmPage.evaluate((r) => Correlativas.evalReqCursar(r), reqDeDependiente)).toBe(true);
  await expect(cmPage.locator('#modal-final-nota')).not.toHaveClass(/open/);
});

test('nota fuera de 1 a 10: el modal sigue abierto y no toca nada', async ({ cmPage }) => {
  await armarPlan(cmPage);
  await sembrarFinal(cmPage, { id: 'f1', materia: 'Constitución, derechos humanos y garantías', subjectId: 's2_4' });
  await cmPage.evaluate(() => Finales.done('f1'));
  await cmPage.fill('#fin-nota', '11');
  await cmPage.click('#modal-final-nota .btn-primary');
  await expect(cmPage.locator('#modal-final-nota')).toHaveClass(/open/);
  expect(await fila(cmPage, 's2_4')).toEqual({ done: false, grade: null });
  expect((await finalDe(cmPage, 'f1')).done).toBe(false);
});

test('"Sin cargar nota" y "Desaprobé / no rendí" pasan al historial sin tocar la carrera', async ({ cmPage }) => {
  await armarPlan(cmPage);
  await sembrarFinal(cmPage, { id: 'f1', materia: 'Constitución, derechos humanos y garantías', subjectId: 's2_4' });
  await sembrarFinal(cmPage, { id: 'f2', materia: 'Derecho constitucional del poder', subjectId: 's2_8' });

  await cmPage.evaluate(() => Finales.done('f1'));
  await cmPage.click('#modal-final-nota .btn-ghost >> text=Sin cargar nota');
  await cmPage.evaluate(() => Finales.done('f2'));
  await cmPage.click('#modal-final-nota .btn-ghost >> text=Desaprobé');

  expect(await finalDe(cmPage, 'f1')).toMatchObject({ done: true });
  expect(await finalDe(cmPage, 'f2')).toMatchObject({ done: true });
  expect(await fila(cmPage, 's2_4')).toEqual({ done: false, grade: null });
  expect(await fila(cmPage, 's2_8')).toEqual({ done: false, grade: null });
});

test('final viejo sin subjectId se vincula por nombre (tildes/mayúsculas) y al aprobarlo toca la carrera', async ({ cmPage }) => {
  await armarPlan(cmPage);
  await sembrarFinal(cmPage, { id: 'f1', materia: 'CONSTITUCION, derechos humanos y GARANTIAS' }); // sin subjectId
  await sembrarFinal(cmPage, { id: 'f2', materia: 'Algo que no está en el plan' });
  expect(await cmPage.evaluate(() => Finales.subjectIdDe(S.sgc.finales[0]))).toBe('s2_4');
  expect(await cmPage.evaluate(() => Finales.subjectIdDe(S.sgc.finales[1]))).toBeNull();

  await cmPage.evaluate(() => Finales.done('f1'));
  await cmPage.fill('#fin-nota', '9.5');
  await cmPage.click('#modal-final-nota .btn-primary');
  expect(await fila(cmPage, 's2_4')).toEqual({ done: true, grade: 9.5 });

  // El que no coincide sigue como hoy: directo al historial, sin modal.
  await cmPage.evaluate(() => Finales.done('f2'));
  await expect(cmPage.locator('#modal-final-nota')).not.toHaveClass(/open/);
  expect((await finalDe(cmPage, 'f2')).done).toBe(true);
});

test('reactivar un final no desaprueba la materia en la carrera', async ({ cmPage }) => {
  await armarPlan(cmPage);
  await sembrarFinal(cmPage, { id: 'f1', materia: 'Constitución, derechos humanos y garantías', subjectId: 's2_4' });
  await cmPage.evaluate(() => Finales.done('f1'));
  await cmPage.fill('#fin-nota', '6');
  await cmPage.click('#modal-final-nota .btn-primary');
  await cmPage.evaluate(() => Finales.reactivar('f1'));
  expect((await finalDe(cmPage, 'f1')).done).toBe(false);
  expect(await fila(cmPage, 's2_4')).toEqual({ done: true, grade: 6 });
});

test('editar un final cambia la materia del plan y el subjectId', async ({ cmPage }) => {
  await armarPlan(cmPage);
  await sembrarFinal(cmPage, { id: 'f1', materia: 'Constitución, derechos humanos y garantías', subjectId: 's2_4' });
  await cmPage.evaluate(() => { Finales.open(); Finales.edit('f1'); });
  await expect(cmPage.locator('#fin-e-materia-sel')).toHaveValue('s2_4');
  await cmPage.selectOption('#fin-e-materia-sel', 's2_8');
  await cmPage.click('#ov-finales-list >> text=Guardar');
  expect(await finalDe(cmPage, 'f1')).toMatchObject({ subjectId: 's2_8', materia: 'Derecho constitucional del poder' });
});
