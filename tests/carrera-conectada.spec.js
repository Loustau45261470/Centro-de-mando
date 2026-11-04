// Carrera conectada: aprobar/desaprobar una materia es UN solo camino (Correlativas.aprobarMateria/desaprobarMateria),
// venga de la casilla de Progreso de carrera, del Plan de carrera o del ✓ de Finales. Cierra/reactiva el final,
// guarda doneAt, destraba correlativas, repinta todo y alimenta el "real" del Seguimiento de avance por fecha.
// Todos los datos son inventados (ids reales del puente de correlativas.js para que las correlatividades funcionen).
'use strict';
const { test, expect } = require('./support/fixtures');

// y1: s1_1 Introducción a la filosofía (5-100) · s1_3 Introducción al derecho (60-250) · s1_8 Lógica y argumentación (60-4300, pide 5-100)
// y2: s2_1 Teología I (0-10)     y3: s3_1 Teología II (0-20, sin final) · s3_9 Seminario electivo I (fila compartida 60-4960/60-4970)
async function armar(page, { finales = true } = {}) {
  await page.evaluate((conFinales) => {
    S.lawProgress = { years: [
      { id: 'y1', label: 'Primer Año', subjects: [
        { id: 's1_1', name: 'Introducción a la filosofía', done: false },
        { id: 's1_3', name: 'Introducción al derecho', done: false },
        { id: 's1_8', name: 'Lógica y argumentación jurídica', done: false },
      ] },
      { id: 'y2', label: 'Segundo Año', subjects: [{ id: 's2_1', name: 'Teología I', done: false }] },
      { id: 'y3', label: 'Tercer Año', subjects: [
        { id: 's3_1', name: 'Teología II', done: false },
        { id: 's3_9', name: 'Seminario electivo I', done: false },
      ] },
    ] };
    S.carrera = { regular: {}, pick: {} };
    S.lawPlan = [{ id: 'r1', subject: 'Introducción a la filosofía', target: 'Sin fecha' }];
    const en = (n) => { const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    S.sgc = S.sgc || {};
    S.sgc.finales = conFinales ? [
      { id: 'f1', materia: 'Introducción a la filosofía', subjectId: 's1_1', fecha: en(5), tipo: 'Final Escrito', done: false, doneEl: null, lawPlanId: 'r1' },
      { id: 'f2', materia: 'Introducción al derecho', subjectId: 's1_3', fecha: en(12), tipo: 'Final Oral', done: false, doneEl: null },
      { id: 'f3', materia: 'Teología I', subjectId: 's2_1', fecha: en(3), tipo: 'Final Escrito', done: false, doneEl: null },
    ] : [];
    S.lawMilestones = [];
    saveState();
    renderLawProgress(); renderLawMilestones();
  }, finales);
}
const sub = (page, id) => page.evaluate((i) => {
  for (const y of S.lawProgress.years) { const s = y.subjects.find((x) => x.id === i); if (s) return { done: !!s.done, doneAt: s.doneAt ?? null, grade: s.grade ?? null }; }
  return null;
}, id);
const fin = (page, id) => page.evaluate((i) => { const f = S.sgc.finales.find((x) => x.id === i); return f ? { done: !!f.done, doneEl: f.doneEl ?? null, aprobo: !!f.aprobo } : null; }, id);
const hoy = (page) => page.evaluate(() => getActiveDate());
// Casilla de Progreso de carrera de una materia (por nombre), con el evento real de la UI.
const tildarProgreso = (page, nombre) => page.evaluate((n) => {
  const row = [...document.querySelectorAll('#law-progress-wrap .law-subject-row')].find((r) => r.textContent.includes(n));
  row.querySelector('.law-check').click();
}, nombre);
const cardPlan = (page, nombre) => page.locator('#corr-list .corr-card', { hasText: nombre });

test('aprobar desde Progreso: guarda doneAt, cierra el final, la fila del plan queda Rendida y desmarcar todo lo deshace', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => Finales.open('plan'));   // Plan de materias abierto: se tiene que repintar solo
  await expect(cmPage.locator('#law-plan-wrap')).not.toContainText('Rendida');

  await tildarProgreso(cmPage, 'Introducción a la filosofía');
  expect(await sub(cmPage, 's1_1')).toEqual({ done: true, doneAt: await hoy(cmPage), grade: null });
  expect(await fin(cmPage, 'f1')).toEqual({ done: true, doneEl: await hoy(cmPage), aprobo: true });
  expect((await fin(cmPage, 'f2')).done).toBe(false);   // otras materias no se tocan
  await expect(cmPage.locator('#law-plan-wrap')).toContainText('Rendida');
  await expect(cmPage.locator('#ov-finales-list')).toContainText('Introducción a la filosofía');   // historial
  await expect(cmPage.locator('#law-progress-wrap .law-subject-row.done')).toHaveCount(1);

  // La nota de Progreso se ve enseguida en la fila del plan.
  await cmPage.evaluate(() => setLawGrade('y1', 's1_1', '8'));
  await expect(cmPage.locator('#law-plan-wrap')).toContainText('Rendida · 8');

  await tildarProgreso(cmPage, 'Introducción a la filosofía');   // desmarcar
  expect(await sub(cmPage, 's1_1')).toMatchObject({ done: false, doneAt: null });
  expect(await fin(cmPage, 'f1')).toEqual({ done: false, doneEl: null, aprobo: false });   // el final vuelve a estar activo
  await expect(cmPage.locator('#law-plan-wrap')).not.toContainText('Rendida');
  expect(consoleErrors).toEqual([]);
});

test('aprobar desde el Plan de carrera hace lo mismo y desmarcar reactiva el final', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => Correlativas.open());
  await cmPage.locator("#corr-list button[onclick*=\"'5-100','aprobada'\"]").click();
  expect(await sub(cmPage, 's1_1')).toMatchObject({ done: true, doneAt: await hoy(cmPage) });
  expect(await fin(cmPage, 'f1')).toEqual({ done: true, doneEl: await hoy(cmPage), aprobo: true });

  await cmPage.locator("#corr-list button[onclick*=\"'5-100','aprobada'\"]").click();   // toggle a "No cursada"
  expect(await sub(cmPage, 's1_1')).toMatchObject({ done: false, doneAt: null });
  expect(await fin(cmPage, 'f1')).toEqual({ done: false, doneEl: null, aprobo: false });

  // Regularizada desde "aprobada" también reactiva (la materia deja de estar aprobada).
  await cmPage.evaluate(() => Correlativas.setEstado('5-100', 'aprobada'));
  expect((await fin(cmPage, 'f1')).done).toBe(true);
  await cmPage.evaluate(() => Correlativas.setEstado('5-100', 'regular'));
  expect(await sub(cmPage, 's1_1')).toMatchObject({ done: false, doneAt: null });
  expect((await fin(cmPage, 'f1')).done).toBe(false);
  expect(consoleErrors).toEqual([]);
});

test('la correlativa destrabada se ve sin reabrir nada: cambia de estado, se resalta y se avisa', async ({ cmPage }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => Correlativas.open());
  await expect(cardPlan(cmPage, 'Lógica y argumentación').first()).toHaveClass(/st-bloqueada/);

  await tildarProgreso(cmPage, 'Introducción a la filosofía');   // desde Progreso, con el Plan de carrera ya abierto
  const logica = cardPlan(cmPage, 'Lógica y argumentación').first();
  await expect(logica).not.toHaveClass(/st-bloqueada/);
  await expect(logica).toHaveClass(/corr-card-nueva/);
  expect(await cmPage.evaluate(() => Correlativas.avisoDesbloqueo())).toContain('Lógica y argumentación jurídica');

  await tildarProgreso(cmPage, 'Introducción a la filosofía');   // y se vuelve a trabar
  await expect(cardPlan(cmPage, 'Lógica y argumentación').first()).toHaveClass(/st-bloqueada/);
});

test('aprobar desde el final (✓ + nota): doneAt es la fecha del final, queda marcado y desmarcar lo reactiva sin bucles', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  const fechaFinal = await cmPage.evaluate(() => {
    const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() - 3);
    const iso = d.toISOString().slice(0, 10);
    S.sgc.finales.find((f) => f.id === 'f1').fecha = iso;   // rendido hace 3 días, recién lo marca
    return iso;
  });
  // Cuenta cuántas veces se aprueba / se cierra por la carrera: una sola, sin rebotes.
  await cmPage.evaluate(() => {
    window._n = { apr: 0, al: 0 };
    const a = Correlativas.aprobarMateria, b = Finales.alAprobar;
    Correlativas.aprobarMateria = (...x) => { window._n.apr++; return a(...x); };
    Finales.alAprobar = (...x) => { window._n.al++; return b(...x); };
  });
  await cmPage.evaluate(() => Finales.done('f1'));
  await cmPage.fill('#fin-nota', '9');
  await cmPage.click('#modal-final-nota .btn-primary');

  expect(await sub(cmPage, 's1_1')).toEqual({ done: true, doneAt: fechaFinal, grade: 9 });
  expect(await fin(cmPage, 'f1')).toEqual({ done: true, doneEl: await hoy(cmPage), aprobo: true });
  expect(await cmPage.evaluate(() => window._n)).toEqual({ apr: 1, al: 1 });
  expect(await cmPage.evaluate(() => S.sgc.finales.length)).toBe(3);

  await tildarProgreso(cmPage, 'Introducción a la filosofía');   // desmarcar → el final vuelve a estar activo
  expect(await fin(cmPage, 'f1')).toEqual({ done: false, doneEl: null, aprobo: false });
  expect(await sub(cmPage, 's1_1')).toMatchObject({ done: false, doneAt: null });
  expect(consoleErrors).toEqual([]);
});

test('"Sin cargar nota" no es una aprobación: desmarcar otra materia no lo reactiva', async ({ cmPage }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => Finales.done('f1'));
  await cmPage.click('#modal-final-nota .btn-ghost >> text=Sin cargar nota');
  expect(await fin(cmPage, 'f1')).toEqual({ done: true, doneEl: await hoy(cmPage), aprobo: false });
  await tildarProgreso(cmPage, 'Introducción a la filosofía');   // aprobar desde Progreso: no hay final activo que cerrar
  await tildarProgreso(cmPage, 'Introducción a la filosofía');   // desmarcar: el final cerrado "sin nota" sigue en el historial
  expect((await fin(cmPage, 'f1')).done).toBe(true);
});

test('seminarios (fila compartida): la casilla de Progreso sin opción elegida marca la fila y no adivina ni toca el pick', async ({ cmPage }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => {
    S.sgc.finales.push({ id: 'fs1', materia: 'Oratoria jurídica', subjectId: 's3_9', codigo: '60-4960', fecha: getActiveDate(), tipo: 'Final Oral', done: false, doneEl: null });
    S.sgc.finales.push({ id: 'fs2', materia: 'Teoría de la argumentación', subjectId: 's3_9', codigo: '60-4970', fecha: getActiveDate(), tipo: 'Final Oral', done: false, doneEl: null });
    saveState();
  });
  await tildarProgreso(cmPage, 'Seminario electivo I');
  expect(await sub(cmPage, 's3_9')).toMatchObject({ done: true });
  expect(await cmPage.evaluate(() => ({ pick: { ...S.carrera.pick }, regular: { ...S.carrera.regular } }))).toEqual({ pick: {}, regular: {} });
  expect((await fin(cmPage, 'fs1')).done).toBe(false);
  expect((await fin(cmPage, 'fs2')).done).toBe(false);

  await tildarProgreso(cmPage, 'Seminario electivo I');   // desmarcar
  expect(await sub(cmPage, 's3_9')).toMatchObject({ done: false, doneAt: null });

  // Con la opción ya elegida en el plan de carrera, solo se cierra el final de esa opción.
  await cmPage.evaluate(() => { S.carrera.pick.s3_9 = '60-4970'; });
  await tildarProgreso(cmPage, 'Seminario electivo I');
  expect((await fin(cmPage, 'fs1')).done).toBe(false);
  expect(await fin(cmPage, 'fs2')).toMatchObject({ done: true, aprobo: true });
  await tildarProgreso(cmPage, 'Seminario electivo I');
  expect((await fin(cmPage, 'fs2')).done).toBe(false);
});

test('Progreso de carrera muestra "Próximo final" debajo de cada año y se actualiza al aprobar', async ({ cmPage }) => {
  await armar(cmPage);
  const linea = (i) => cmPage.locator('#law-progress-wrap .law-year-slide').nth(i).locator('.law-next-final');
  await expect(linea(0)).toContainText('Próximo final: Introducción a la filosofía');
  await expect(linea(0)).toContainText('(5 días)');
  await expect(linea(1)).toContainText('Teología I');
  await expect(linea(1)).toContainText('(3 días)');
  await expect(linea(2)).toHaveCount(0);   // año sin finales: nada

  await tildarProgreso(cmPage, 'Introducción a la filosofía');   // la más cercana ya está aprobada → sigue la otra del año
  await expect(linea(0)).toContainText('Introducción al derecho');
  await expect(linea(0)).toContainText('(12 días)');
  await tildarProgreso(cmPage, 'Introducción al derecho');
  await expect(linea(0)).toHaveCount(0);
});

test('Seguimiento de avance: el real de cada punto vencido cuenta las aprobadas hasta su fecha; el manual no se toca', async ({ cmPage }) => {
  await armar(cmPage, { finales: false });
  const r = await cmPage.evaluate(() => {
    const y1 = S.lawProgress.years[0].subjects;
    Object.assign(y1[0], { done: true, doneAt: '2024-02-10' });
    Object.assign(y1[1], { done: true, doneAt: '2025-01-10' });
    y1[2].done = true;   // aprobada en datos viejos: sin doneAt
    S.lawMilestones = [
      { id: 'a', date: '01/03/22', label: 'Mar 22', real: 7, expected: 1 },   // manual
      { id: 'b', date: '01/03/23', label: 'Mar 23', real: null, expected: 1 },
      { id: 'c', date: '01/03/24', label: 'Mar 24', real: null, expected: 2 },
      { id: 'd', date: '01/03/25', label: 'Mar 25', real: null, expected: 3 },   // último vencido: la cuenta actual
      { id: 'e', date: '01/01/99', label: 'Ene 99', real: null, expected: 9 },   // futuro: sin valor
    ];
    saveState(); renderLawMilestones();
    return _lawRealPorHito(S.lawMilestones, new Date());
  });
  expect(r.a).toBeUndefined();
  expect(r.b).toEqual({ val: 1, kind: 'fecha' });    // solo la que no tiene fecha (cuenta desde el principio)
  expect(r.c).toEqual({ val: 2, kind: 'fecha' });    // + la aprobada en feb 24
  expect(r.d).toEqual({ val: 3, kind: 'actual' });
  expect(r.e).toBeUndefined();
  expect(r.sinFecha).toBe(1);

  // La tabla del historial usa la misma cuenta y deja la nota honesta.
  const filas = await cmPage.locator('#lawMsHistBody tbody tr').evaluateAll((trs) => trs.map((t) => t.children[1].textContent.trim()));
  expect(filas).toEqual(['7', '1†', '2†', '3*', '—']);
  await expect(cmPage.locator('#lawMsHistBody')).toContainText('sin fecha cargada cuentan desde el principio');
  // El gráfico también.
  await expect.poll(() => cmPage.evaluate(() => _lawMilestoneChart && _lawMilestoneChart.data.datasets[1].data)).toEqual([7, 1, 2, 3, null]);

  // Aprobar una materia hoy no cambia lo que ya pasó, solo la cuenta actual.
  await cmPage.evaluate(() => { Correlativas.aprobarMateria('s2_1', null, null); });
  expect((await cmPage.evaluate(() => _lawRealPorHito(S.lawMilestones, new Date()))).c.val).toBe(2);
  expect((await cmPage.evaluate(() => _lawRealPorHito(S.lawMilestones, new Date()))).d.val).toBe(4);
});

test('Seguimiento de avance: si ninguna aprobada tiene fecha, los puntos vencidos siguen mostrando la cuenta actual (no se inventa)', async ({ cmPage }) => {
  await armar(cmPage, { finales: false });
  const r = await cmPage.evaluate(() => {
    S.lawProgress.years[0].subjects.forEach((s) => { s.done = true; });   // sin doneAt
    S.lawMilestones = [
      { id: 'b', date: '01/03/23', label: 'Mar 23', real: null, expected: 1 },
      { id: 'c', date: '01/03/24', label: 'Mar 24', real: null, expected: 2 },
      { id: 'd', date: '01/03/25', label: 'Mar 25', real: null, expected: 3 },
    ];
    saveState(); renderLawMilestones();
    return _lawRealPorHito(S.lawMilestones, new Date());
  });
  expect(r.b).toEqual({ val: 3, kind: 'actual' });
  expect(r.c).toEqual({ val: 3, kind: 'actual' });
  expect(r.d).toEqual({ val: 3, kind: 'actual' });
  await expect(cmPage.locator('#lawMsHistBody')).not.toContainText('†');
});

test('aprobar desde Progreso actualiza el Seguimiento de avance (banner "materias reales")', async ({ cmPage }) => {
  await armar(cmPage, { finales: false });
  await cmPage.evaluate(() => { S.lawMilestones = [{ id: 'd', date: '01/03/25', label: 'Mar 25', real: null, expected: 1 }]; saveState(); renderLawMilestones(); });
  await expect(cmPage.locator('#law-milestones-wrap .law-lag-num').first()).toHaveText('0');
  await tildarProgreso(cmPage, 'Teología I');
  await expect(cmPage.locator('#law-milestones-wrap .law-lag-num').first()).toHaveText('1');
});
