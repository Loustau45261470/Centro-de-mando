// Seminarios electivos (fila compartida del plan: s3_9 = 60-4960 / 60-4970): el selector del final ofrece cada
// opción por código y aprobar se comporta igual que setEstado(code, 'aprobada') — pick = código, hermanas sin regularidad.
'use strict';
const { test, expect } = require('./support/fixtures');

async function armarPlan(page) {
  await page.evaluate(() => {
    S.lawProgress = { years: [
      { id: 'y1', label: 'Primer Año', subjects: [{ id: 's1_1', name: 'Introducción a la filosofía', done: true, grade: 7 }] },
      { id: 'y3', label: 'Tercer Año', subjects: [{ id: 's3_9', name: 'Seminario electivo I', done: false }] },
      { id: 'y5', label: 'Quinto Año', subjects: [{ id: 's5_11', name: 'Seminario electivo II', done: false }] },
    ] };
    S.carrera = { regular: {}, pick: {} };
    S.sgc = S.sgc || {};
    S.sgc.finales = [];
    saveState();
  });
}
const carrera = (page) => page.evaluate(() => ({
  pick: { ...S.carrera.pick }, regular: { ...S.carrera.regular },
  fila: ['s3_9', 's5_11'].map((id) => { for (const y of S.lawProgress.years) { const s = y.subjects.find((x) => x.id === id); if (s) return { id, done: !!s.done }; } }),
  est: ['60-4960', '60-4970', '60-6120', '60-6130', '60-6140'].map((c) => Correlativas.estado(c)),
}));
async function sembrarFinal(page, extra) {
  await page.evaluate((e) => {
    S.sgc.finales.push(Object.assign({ id: 'fx', materia: 'X', fecha: getActiveDate(), tipo: 'Final Escrito', done: false, doneEl: null }, e));
    saveState();
  }, extra);
}
async function aprobarConNota(page, id, nota) {
  await page.evaluate((i) => Finales.done(i), id);
  await expect(page.locator('#modal-final-nota')).toHaveClass(/open/);
  await page.fill('#fin-nota', String(nota));
  await page.click('#modal-final-nota .btn-primary');
}

// El overlay ya no tiene formulario "+ Agregar": el selector de materia vive en la edición de un final del Historial.
async function editarHistorico(page) {
  await sembrarFinal(page, { id: 'fh', materia: 'Algo viejo', fecha: '2020-01-01', done: true, doneEl: '2020-01-01' });
  await page.evaluate(() => { Finales.open(); Finales.edit('fh'); });
}

test('el selector ofrece cada opción de la fila compartida por código y con su nombre', async ({ cmPage }) => {
  await armarPlan(cmPage);
  await editarHistorico(cmPage);
  const ops = await cmPage.locator('#fin-e-materia-sel option').evaluateAll((os) => os.map((o) => [o.value, o.textContent]));
  const valores = ops.map((o) => o[0]);
  expect(valores).toEqual(['', 's3_9#60-4960', 's3_9#60-4970', 's5_11#60-6120', 's5_11#60-6130', 's5_11#60-6140', '__otra']);
  expect(ops[1][1]).toBe('Oratoria jurídica (seminario electivo I) (60-4960)');
  expect(ops[2][1]).toContain('Teoría de la argumentación jurídica');
  expect(ops[2][1]).toContain('(60-4970)');
});

test('editar un final eligiendo una opción guarda codigo, subjectId y el nombre de esa opción', async ({ cmPage }) => {
  await armarPlan(cmPage);
  await editarHistorico(cmPage);
  await cmPage.selectOption('#fin-e-materia-sel', 's3_9#60-4960');
  await cmPage.click('#ov-finales-list >> text=Guardar');
  const f = await cmPage.evaluate(() => S.sgc.finales[0]);
  expect(f).toMatchObject({ subjectId: 's3_9', codigo: '60-4960', done: true });
  expect(f.materia).toContain('Oratoria jurídica');
});

test('aprobar la opción 60-4960 deja 60-4970 en "ninguna" y el pick seteado, igual que setEstado', async ({ cmPage }) => {
  // Referencia: aprobar a mano en el plan.
  await armarPlan(cmPage);
  await cmPage.evaluate(() => { S.carrera.regular['60-4970'] = true; Correlativas.setEstado('60-4960', 'aprobada'); });
  const manual = await carrera(cmPage);

  // Por el final (con la hermana regularizada de antemano, como en la referencia).
  await armarPlan(cmPage);
  await cmPage.evaluate(() => { S.carrera.regular['60-4970'] = true; });
  await sembrarFinal(cmPage, { id: 'f1', materia: 'Oratoria jurídica (seminario electivo I)', subjectId: 's3_9', codigo: '60-4960' });
  await aprobarConNota(cmPage, 'f1', 8);

  const porFinal = await carrera(cmPage);
  expect(porFinal).toEqual(manual);
  expect(porFinal.pick).toEqual({ s3_9: '60-4960' });
  expect(porFinal.est.slice(0, 2)).toEqual(['aprobada', 'ninguna']);
  expect(porFinal.regular).toEqual({});
  expect(await cmPage.evaluate(() => S.lawProgress.years[1].subjects[0].grade)).toBe(8);
  expect(await cmPage.evaluate(() => S.sgc.finales[0].done)).toBe(true);
});

test('fila de tres opciones (s5_11): aprobar 60-6140 deja las otras dos en "ninguna"', async ({ cmPage }) => {
  await armarPlan(cmPage);
  await sembrarFinal(cmPage, { id: 'f1', subjectId: 's5_11', codigo: '60-6140' });
  await aprobarConNota(cmPage, 'f1', 9);
  const c = await carrera(cmPage);
  expect(c.pick).toEqual({ s5_11: '60-6140' });
  expect(c.est.slice(2)).toEqual(['ninguna', 'ninguna', 'aprobada']);
});

test('final viejo de fila compartida sin código ni pick: se cierra sin tocar la carrera y avisa', async ({ cmPage }) => {
  await armarPlan(cmPage);
  await sembrarFinal(cmPage, { id: 'f1', materia: 'Seminario electivo I', subjectId: 's3_9' });
  await aprobarConNota(cmPage, 'f1', 7);
  const c = await carrera(cmPage);
  expect(c.fila[0]).toEqual({ id: 's3_9', done: false });
  expect(c.pick).toEqual({});
  expect(await cmPage.evaluate(() => S.sgc.finales[0].done)).toBe(true);
  await expect(cmPage.locator('#toast')).toContainText('Elegí cuál seminario aprobaste en el plan');
});

test('final viejo sin código pero con pick ya elegido en el plan: usa ese pick', async ({ cmPage }) => {
  await armarPlan(cmPage);
  await cmPage.evaluate(() => { Correlativas.setEstado('60-4970', 'regular'); });
  await sembrarFinal(cmPage, { id: 'f1', materia: 'Seminario electivo I', subjectId: 's3_9' });
  await aprobarConNota(cmPage, 'f1', 6);
  const c = await carrera(cmPage);
  expect(c.pick).toEqual({ s3_9: '60-4970' });
  expect(c.est.slice(0, 2)).toEqual(['ninguna', 'aprobada']);
});

test('editar un final de fila compartida preselecciona su opción y permite cambiarla', async ({ cmPage }) => {
  await armarPlan(cmPage);
  await sembrarFinal(cmPage, { id: 'f1', materia: 'Teoría', subjectId: 's3_9', codigo: '60-4970' });
  await sembrarFinal(cmPage, { id: 'f2', materia: 'Seminario electivo I', subjectId: 's3_9' }); // viejo, sin código
  await cmPage.evaluate(() => { Finales.open(); Finales.edit('f1'); });
  expect(await cmPage.locator('#fin-e-materia-sel').inputValue()).toBe('s3_9#60-4970');
  await cmPage.selectOption('#fin-e-materia-sel', 's3_9#60-4960');
  await cmPage.click('#ov-finales-list .btn >> text=Guardar');
  expect(await cmPage.evaluate(() => S.sgc.finales.find((f) => f.id === 'f1').codigo)).toBe('60-4960');

  // El viejo conserva la opción genérica seleccionada hasta que elija una.
  await cmPage.evaluate(() => Finales.edit('f2'));
  expect(await cmPage.locator('#fin-e-materia-sel').inputValue()).toBe('s3_9');
});
