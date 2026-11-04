// Selectores de materia (Nuevo final / editar final y Pomodoro): arriba "Próximos exámenes" ordenados por fecha
// (final activo > Plan de Materias), abajo el resto por año sin repetir. Datos de ejemplo inventados.
'use strict';
const { test, expect } = require('./support/fixtures');

// Plan: Alfa aprobada; el resto con distinta fuente de fecha (se calculan respecto de hoy para no vencerse nunca).
//   Delta   → lawPlan "dd de mes aaaa" a +20 días
//   Epsilon → lawPlan a +10 días PERO final activo a +60 días (el final gana → va después de Delta)
//   Beta    → lawPlan con día, a +100 días
//   Gamma   → lawPlan solo mes, el mismo mes que Beta (día gana sobre solo-mes)
//   Zeta    → lawPlan "Libre / Online 2027" (sin mes) · Eta → lawPlan con fecha pasada → quedan abajo
//   Seminario compartido s3_9 → final a +5 días con código 60-4960
async function armar(page) {
  return page.evaluate(() => {
    const hoy = getActiveDate();
    const mas = (n) => { const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() + n); return d; };
    const iso = (d) => d.toISOString().slice(0, 10);
    const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const conDia = (d) => `${d.getDate()} de ${MES[d.getMonth()]} ${d.getFullYear()}`;
    const soloMes = (d) => `${MES[d.getMonth()][0].toUpperCase()}${MES[d.getMonth()].slice(1)} ${d.getFullYear()}`;
    const pad = (n) => String(n).padStart(2, '0');
    const dm = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` + (d.getFullYear() === +hoy.slice(0, 4) ? '' : '/' + String(d.getFullYear()).slice(2));

    S.lawProgress = { years: [
      { id: 'y1', label: 'Primer Año', subjects: [
        { id: 'a1', name: 'Alfa', done: true, grade: 7 },
        { id: 'a2', name: 'Beta', done: false },
        { id: 'a3', name: 'Gamma', done: false },
      ] },
      { id: 'y2', label: 'Segundo Año', subjects: [
        { id: 'b1', name: 'Delta', done: false },
        { id: 'b2', name: 'Épsilon', done: false },
        { id: 'b3', name: 'Zeta', done: false },
        { id: 'b4', name: 'Eta', done: false },
      ] },
      { id: 'y3', label: 'Tercer Año', subjects: [{ id: 's3_9', name: 'Seminario electivo I', done: false }] },
    ] };
    S.carrera = { regular: {}, pick: {} };
    S.lawPlan = [
      { id: 'p1', subject: 'DELTA', target: conDia(mas(20)) },                 // mayúsculas: coincide igual
      { id: 'p2', subject: 'Epsilon', target: conDia(mas(10)) },               // sin tilde: coincide igual
      { id: 'p3', subject: 'Beta', target: conDia(mas(100)) },
      { id: 'p4', subject: 'Gamma', target: soloMes(mas(100)) },
      { id: 'p5', subject: 'Zeta', target: 'Libre / Online 2027' },
      { id: 'p6', subject: 'Eta', target: '1 de enero 2020' },
    ];
    S.sgc = S.sgc || {};
    S.sgc.finales = [
      { id: 'fe', materia: 'Épsilon', subjectId: 'b2', fecha: iso(mas(60)), tipo: 'Final Oral', done: false, doneEl: null },
      { id: 'fs', materia: 'Oratoria jurídica (seminario electivo I)', subjectId: 's3_9', codigo: '60-4960', fecha: iso(mas(5)), tipo: 'Final Escrito', done: false, doneEl: null },
    ];
    S.pomodoroHistory = [];
    saveState();
    return { dm20: dm(mas(20)), dm60: dm(mas(60)), dm100: dm(mas(100)), dm5: dm(mas(5)), mes100: soloMes(mas(100)).toLowerCase().replace(/^(\p{L}{3})\p{L}*/u, '$1') };
  });
}

const opciones = (loc) => loc.locator('option').evaluateAll((os) => os.map((o) => [o.value, o.textContent, o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : '']));

test('Nuevo final: arriba "Próximos exámenes" por fecha (con la fecha al lado), abajo el resto por año sin repetir', async ({ cmPage, consoleErrors }) => {
  const f = await armar(cmPage);
  await cmPage.evaluate(() => Finales.open());
  const ops = await opciones(cmPage.locator('#fin-materia-sel'));
  expect(ops.map((o) => o[0])).toEqual([
    '', 's3_9#60-4960', 'b1', 'b2', 'a2', 'a3', // arriba
    'b3', 'b4', 's3_9#60-4970', '__otra',        // abajo, por año
  ]);
  expect(ops.map((o) => o[2])).toEqual([
    '', 'Próximos exámenes', 'Próximos exámenes', 'Próximos exámenes', 'Próximos exámenes', 'Próximos exámenes',
    'Segundo Año', 'Segundo Año', 'Tercer Año', '',
  ]);
  const txt = Object.fromEntries(ops.map((o) => [o[0], o[1]]));
  expect(txt['s3_9#60-4960']).toBe(`Oratoria jurídica (seminario electivo I) (60-4960) · ${f.dm5}`);
  expect(txt.b1).toBe(`Delta · ${f.dm20}`);
  expect(txt.b2).toBe(`Épsilon · ${f.dm60}`);   // la fecha del final, no la del lawPlan (+10)
  expect(txt.a2).toBe(`Beta · ${f.dm100}`);
  expect(txt.a3).toBe(`Gamma · ${f.mes100}`);    // solo mes → "nov 2026"
  expect(txt.a3).toMatch(/^Gamma · [a-z]{3} \d{4}$/);
  expect(txt.b3).toBe('Zeta');                    // "Online 2027": sin fecha, abajo sin sufijo
  expect(txt.b4).toBe('Eta');                     // fecha pasada: abajo
  expect(ops.some((o) => o[0] === 'a1')).toBe(false); // aprobada: fuera, como antes
  const unicos = new Set(ops.map((o) => o[0]));
  expect(unicos.size).toBe(ops.length);           // sin duplicados
  expect(consoleErrors).toEqual([]);
});

test('Pomodoro: mismo orden y grupos, la fila compartida sube entera y no se repite', async ({ cmPage, consoleErrors }) => {
  const f = await armar(cmPage);
  await cmPage.evaluate(() => openSesionEstudioOverlay());
  const ops = await opciones(cmPage.locator('#pomo-materia-sel'));
  expect(ops.map((o) => o[0])).toEqual(['', 's3_9', 'b1', 'b2', 'a2', 'a3', 'b3', 'b4']);
  expect(ops.map((o) => o[2])).toEqual(['', ...Array(5).fill('Próximos exámenes'), 'Segundo Año', 'Segundo Año']);
  const txt = Object.fromEntries(ops.map((o) => [o[0], o[1]]));
  expect(txt.s3_9).toBe(`Seminario electivo I · ${f.dm5}`);
  expect(txt.b1).toBe(`Delta · ${f.dm20}`);
  expect(txt.b2).toBe(`Épsilon · ${f.dm60}`);
  expect(txt.a3).toMatch(/^Gamma · [a-z]{3} \d{4}$/);
  expect(txt.b3).toBe('Zeta');
  await expect(cmPage.locator('#pomo-materia-sel')).toHaveValue('s3_9'); // sigue sugiriendo la del próximo final
  expect(consoleErrors).toEqual([]);
});

test('sin finales manda el Plan de Materias; con final vencido la materia queda abajo aunque el plan tenga fecha futura', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => {
    const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() - 3);
    S.sgc.finales = [{ id: 'fv', materia: 'Delta', subjectId: 'b1', fecha: d.toISOString().slice(0, 10), tipo: 'Final Oral', done: false, doneEl: null }];
    saveState();
  });
  await cmPage.evaluate(() => Finales.open());
  const vals = await cmPage.locator('#fin-materia-sel option').evaluateAll((os) => os.map((o) => o.value));
  // Delta tiene final vencido (+lawPlan futuro): el final manda → abajo. Epsilon ahora sale del lawPlan (+10).
  expect(vals).toEqual(['', 'b2', 'a2', 'a3', 'b1', 'b3', 'b4', 's3_9#60-4960', 's3_9#60-4970', '__otra']);
  expect(consoleErrors).toEqual([]);
});

test('elegir una materia del grupo de arriba guarda el mismo subjectId y nombre (sin la fecha)', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => Finales.open());
  await cmPage.selectOption('#fin-materia-sel', 'b1');
  await cmPage.click('#ov-finales-form .btn');
  let nuevo = await cmPage.evaluate(() => S.sgc.finales.find((x) => x.subjectId === 'b1' && !x.codigo));
  expect(nuevo).toMatchObject({ materia: 'Delta', subjectId: 'b1', done: false });

  await cmPage.selectOption('#fin-materia-sel', 's3_9#60-4970');
  await cmPage.click('#ov-finales-form .btn');
  nuevo = await cmPage.evaluate(() => S.sgc.finales.find((x) => x.codigo === '60-4970'));
  expect(nuevo).toMatchObject({ subjectId: 's3_9', codigo: '60-4970' });
  expect(nuevo.materia).not.toContain('·');
  expect(consoleErrors).toEqual([]);
});

test('editar un final: la materia actual queda seleccionada en el grupo de arriba y guardar conserva subjectId', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => { Finales.open(); Finales.edit('fe'); });
  const sel = cmPage.locator('#fin-e-materia-sel');
  await expect(sel).toHaveValue('b2');
  const ops = await opciones(sel);
  expect(ops.filter((o) => o[0] === 'b2')).toHaveLength(1);
  expect(ops.find((o) => o[0] === 'b2')[2]).toBe('Próximos exámenes');
  await cmPage.selectOption('#fin-e-materia-sel', 'a2');
  await cmPage.click('#ov-finales-list >> text=Guardar');
  expect(await cmPage.evaluate(() => S.sgc.finales.find((x) => x.id === 'fe'))).toMatchObject({ subjectId: 'a2', materia: 'Beta' });
  expect(consoleErrors).toEqual([]);
});

test('Pomodoro: elegir una materia del grupo de arriba guarda su subjectId', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => openSesionEstudioOverlay());
  await cmPage.selectOption('#pomo-materia-sel', 'a3');
  await expect(cmPage.locator('#pomo-materia-sel')).toHaveValue('a3');
  expect(await cmPage.evaluate(() => localStorage.getItem('cdm_pomodoro_materia'))).toBe('a3');
  expect(consoleErrors).toEqual([]);
});
