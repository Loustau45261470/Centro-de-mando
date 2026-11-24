// Registro de comida (Salud · Dieta): reemplaza al tracker de reglas de comida sana. Cuatro comidas por día, biblioteca única de alimentos
// (nombre + unidad g/u + en qué comidas aparece), casilla «comí» a la derecha y cantidad. Se quitó el concepto de «día cumplido»
// (racha, vínculo de objetivos, hábito automático): acá se prueba su ausencia y la migración que limpia los datos viejos sin borrar historial.
// Todos los datos son de ejemplo inventados.
'use strict';
const { test, expect, completeLoginOverlay, waitForBoot } = require('./support/fixtures');

async function abrir(page) {
  await page.click('.nav-btn[data-tab="salud"]');
  await expect(page.locator('#tab-salud')).toHaveClass(/active/);
  await page.evaluate(() => { S.comidas = { alimentos: [], registro: {} }; renderDieta(); renderDietaResumen(); openDietaOverlay(); });
  await expect(page.locator('#dietaBody .com-bloque')).toHaveCount(4);
}
async function crearAlimento(page, nombre, unidad, comidas) {
  await page.click('#dietaBody button:has-text("+ Alimento")');
  await expect(page.locator('#modal-comida-alimento')).toHaveClass(/open/);
  await page.fill('#comAlimNombre', nombre);
  await page.click(`#comAlimUnidad .com-chip[data-v="${unidad}"]`);
  for (const c of comidas) await page.click(`#comAlimComidas .com-chip[data-v="${c}"]`);
  await page.click('#modal-comida-alimento button:has-text("Guardar")');
  await expect(page.locator('#modal-comida-alimento')).not.toHaveClass(/open/);
}
const bloque = (page, c) => page.locator(`#dietaBody .com-bloque[data-com="${c}"]`);
const fila = (page, c, nombre) => bloque(page, c).locator('.com-row', { hasText: nombre });

test('1) un alimento en gramos y otro en unidades: cada comida muestra solo los suyos', async ({ cmPage, consoleErrors }) => {
  await abrir(cmPage);
  await crearAlimento(cmPage, 'Pan de ejemplo', 'g', ['desayuno', 'merienda']);
  await crearAlimento(cmPage, 'Huevo de ejemplo', 'u', ['cena']);
  await expect(bloque(cmPage, 'desayuno').locator('.com-row')).toHaveCount(1);
  await expect(bloque(cmPage, 'merienda').locator('.com-row')).toHaveCount(1);
  await expect(bloque(cmPage, 'cena').locator('.com-row')).toHaveCount(1);
  await expect(bloque(cmPage, 'almuerzo').locator('.com-row')).toHaveCount(0);
  await expect(fila(cmPage, 'desayuno', 'Pan de ejemplo').locator('.com-unit')).toHaveText('g');
  await expect(fila(cmPage, 'cena', 'Huevo de ejemplo').locator('.com-unit')).toHaveText('u');
  await expect(bloque(cmPage, 'cena')).not.toContainText('Pan de ejemplo');
  const al = await cmPage.evaluate(() => S.comidas.alimentos.map((a) => ({ n: a.nombre, u: a.unidad, c: a.comidas })));
  expect(al).toEqual([{ n: 'Pan de ejemplo', u: 'g', c: ['desayuno', 'merienda'] }, { n: 'Huevo de ejemplo', u: 'u', c: ['cena'] }]);
  expect(consoleErrors).toEqual([]);
});

test('1b) el modal exige nombre, unidad y al menos una comida', async ({ cmPage, consoleErrors }) => {
  await abrir(cmPage);
  await cmPage.click('#dietaBody button:has-text("+ Alimento")');
  await cmPage.click('#modal-comida-alimento button:has-text("Guardar")');
  await cmPage.fill('#comAlimNombre', 'Algo');
  await cmPage.click('#modal-comida-alimento button:has-text("Guardar")');
  await cmPage.click('#comAlimUnidad .com-chip[data-v="g"]');
  await cmPage.click('#modal-comida-alimento button:has-text("Guardar")');
  await expect(cmPage.locator('#modal-comida-alimento')).toHaveClass(/open/);
  expect(await cmPage.evaluate(() => S.comidas.alimentos.length)).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('2) escribir la cantidad marca la casilla; desmarcar conserva la cantidad y no cuenta como comido', async ({ cmPage, consoleErrors }) => {
  await abrir(cmPage);
  await crearAlimento(cmPage, 'Pan de ejemplo', 'g', ['desayuno']);
  const f = fila(cmPage, 'desayuno', 'Pan de ejemplo');
  const casilla = f.locator('.ptask-check input');
  await expect(casilla).not.toBeChecked();
  await f.locator('.com-cant').fill('1.5');
  await expect(casilla).toBeChecked();
  await f.locator('.com-cant').blur();
  expect(await cmPage.evaluate(() => S.comidas.registro[getActiveDate()].desayuno)).toEqual({ [await cmPage.evaluate(() => S.comidas.alimentos[0].id)]: { ok: true, cant: 1.5 } });
  await expect(cmPage.locator('#comResumenDia')).toHaveText('Hoy: 1 de 4 comidas cargadas');
  await casilla.uncheck();
  await expect(f.locator('.com-cant')).toHaveValue('1.5');
  await expect(cmPage.locator('#comResumenDia')).toHaveText('Hoy: 0 de 4 comidas cargadas');
  const e = await cmPage.evaluate(() => Object.values(S.comidas.registro[getActiveDate()].desayuno)[0]);
  expect(e).toEqual({ ok: false, cant: 1.5 });
  // marcar sin cantidad también vale; desmarcar sin cantidad no deja basura
  await f.locator('.com-cant').fill('');
  await f.locator('.com-cant').blur();
  await casilla.check(); await casilla.uncheck();
  expect(await cmPage.evaluate(() => S.comidas.registro[getActiveDate()])).toBeUndefined();
  expect(consoleErrors).toEqual([]);
});

test('3) la casilla es chica y va al final de la fila, a la derecha del nombre y de la cantidad', async ({ cmPage, consoleErrors }) => {
  await abrir(cmPage);
  await crearAlimento(cmPage, 'Pan de ejemplo', 'g', ['desayuno']);
  const f = fila(cmPage, 'desayuno', 'Pan de ejemplo');
  const [bf, bc, bn, bq] = await Promise.all([f.boundingBox(), f.locator('.ptask-check input').boundingBox(), f.locator('.com-name').boundingBox(), f.locator('.com-qty').boundingBox()]);
  expect(bc.width).toBeLessThanOrEqual(18);
  expect(bc.height).toBeLessThanOrEqual(18);
  expect(bc.x).toBeGreaterThan(bn.x + bn.width - 1);
  expect(bc.x).toBeGreaterThan(bq.x + bq.width - 1);
  expect(bc.x + bc.width).toBeGreaterThanOrEqual(bf.x + bf.width - 20);
  expect(consoleErrors).toEqual([]);
});

test('4) cambiar de día activo muestra y edita ese día', async ({ cmPage, consoleErrors }) => {
  await abrir(cmPage);
  await crearAlimento(cmPage, 'Pan de ejemplo', 'g', ['desayuno']);
  const f = () => fila(cmPage, 'desayuno', 'Pan de ejemplo');
  await f().locator('.com-cant').fill('200'); await f().locator('.com-cant').blur();
  await cmPage.evaluate(() => { window.__hoy = getActiveDate; window.getActiveDate = () => '2026-03-04'; renderDieta(); renderDietaResumen(); });
  await expect(f().locator('.com-cant')).toHaveValue('');
  await expect(f().locator('.ptask-check input')).not.toBeChecked();
  await expect(cmPage.locator('#comResumenDia')).toHaveText('04/03: 0 de 4 comidas cargadas');
  await f().locator('.com-cant').fill('50'); await f().locator('.com-cant').blur();
  const reg = await cmPage.evaluate(() => Object.keys(S.comidas.registro).sort());
  expect(reg).toHaveLength(2);
  expect(reg).toContain('2026-03-04');
  await cmPage.evaluate(() => { window.getActiveDate = window.__hoy; renderDieta(); });
  await expect(f().locator('.com-cant')).toHaveValue('200');
  expect(consoleErrors).toEqual([]);
});

test('5) archivar oculta el alimento y conserva el historial; borrar solo si nunca se usó', async ({ cmPage, consoleErrors }) => {
  await abrir(cmPage);
  await crearAlimento(cmPage, 'Pan de ejemplo', 'g', ['desayuno']);
  await crearAlimento(cmPage, 'Nunca usado', 'u', ['cena']);
  await fila(cmPage, 'desayuno', 'Pan de ejemplo').locator('.com-cant').fill('80');
  await fila(cmPage, 'desayuno', 'Pan de ejemplo').locator('.com-cant').blur();
  await cmPage.click('#dietaBody .com-bib summary');
  const bibPan = cmPage.locator('.com-bib-row', { hasText: 'Pan de ejemplo' });
  const bibNo = cmPage.locator('.com-bib-row', { hasText: 'Nunca usado' });
  await expect(bibPan.locator('button[title="Borrar"]')).toHaveCount(0);   // usado: solo archivar
  await expect(bibNo.locator('button[title="Borrar"]')).toHaveCount(1);
  await bibPan.locator('button:has-text("Archivar")').click();
  await expect(bloque(cmPage, 'desayuno').locator('.com-row')).toHaveCount(0);
  await expect(cmPage.locator('.com-bib-row', { hasText: 'Pan de ejemplo' })).toContainText('archivado');
  const hist = await cmPage.evaluate(() => JSON.stringify(Object.values(S.comidas.registro)[0].desayuno));
  expect(hist).toContain('"cant":80');
  await cmPage.locator('.com-bib-row', { hasText: 'Pan de ejemplo' }).locator('button:has-text("Restaurar")').click();
  await expect(fila(cmPage, 'desayuno', 'Pan de ejemplo').locator('.com-cant')).toHaveValue('80');
  cmPage.once('dialog', (d) => d.accept());
  await cmPage.locator('.com-bib-row', { hasText: 'Nunca usado' }).locator('button[title="Borrar"]').click();
  expect(await cmPage.evaluate(() => S.comidas.alimentos.map((a) => a.nombre))).toEqual(['Pan de ejemplo']);
  expect(consoleErrors).toEqual([]);
});

test('5b) editar un alimento: nombre, unidad y comidas', async ({ cmPage, consoleErrors }) => {
  await abrir(cmPage);
  await crearAlimento(cmPage, 'Pan de ejemplo', 'g', ['desayuno']);
  await cmPage.click('#dietaBody .com-bib summary');
  await cmPage.click('.com-bib-row button[title="Editar"]');
  await expect(cmPage.locator('#comAlimNombre')).toHaveValue('Pan de ejemplo');
  await cmPage.fill('#comAlimNombre', 'Pan viejo');
  await cmPage.click('#comAlimUnidad .com-chip[data-v="u"]');
  await cmPage.click('#comAlimComidas .com-chip[data-v="cena"]');
  await cmPage.click('#modal-comida-alimento button:has-text("Guardar")');
  await expect(fila(cmPage, 'desayuno', 'Pan viejo').locator('.com-unit')).toHaveText('u');
  await expect(fila(cmPage, 'cena', 'Pan viejo')).toHaveCount(1);
  expect(consoleErrors).toEqual([]);
});

test('6) una recarga real conserva biblioteca, cantidades y archivados', async ({ cmPage, consoleErrors }) => {
  test.setTimeout(90000);   // crea 3 alimentos por la UI y recarga: ~31 s en esta máquina, justo sobre el límite de 30 s
  await abrir(cmPage);
  await crearAlimento(cmPage, 'Pan de ejemplo', 'g', ['desayuno']);
  await crearAlimento(cmPage, 'Huevo de ejemplo', 'u', ['cena']);
  await crearAlimento(cmPage, 'Archivado de ejemplo', 'g', ['almuerzo']);
  await fila(cmPage, 'desayuno', 'Pan de ejemplo').locator('.com-cant').fill('120');
  await fila(cmPage, 'desayuno', 'Pan de ejemplo').locator('.com-cant').blur();
  await fila(cmPage, 'cena', 'Huevo de ejemplo').locator('.ptask-check input').check();
  await cmPage.click('#dietaBody .com-bib summary');
  await cmPage.locator('.com-bib-row', { hasText: 'Archivado de ejemplo' }).locator('button:has-text("Archivar")').click();
  const antes = await cmPage.evaluate(() => JSON.stringify(S.comidas));

  await cmPage.reload();
  await waitForBoot(cmPage);
  await completeLoginOverlay(cmPage);
  expect(await cmPage.evaluate(() => JSON.stringify(S.comidas))).toBe(antes);
  await cmPage.click('.nav-btn[data-tab="salud"]');
  await cmPage.evaluate(() => openDietaOverlay());
  await expect(fila(cmPage, 'desayuno', 'Pan de ejemplo').locator('.com-cant')).toHaveValue('120');
  await expect(fila(cmPage, 'cena', 'Huevo de ejemplo').locator('.ptask-check input')).toBeChecked();
  await expect(bloque(cmPage, 'almuerzo').locator('.com-row')).toHaveCount(0);
  await expect(cmPage.locator('#comResumenDia')).toHaveText('Hoy: 2 de 4 comidas cargadas');
  expect(consoleErrors).toEqual([]);
});

test('7) migración: objetivos con vínculo de dieta pasan a manuales, el hábito automático de dieta queda común, nada del historial se pierde y es idempotente', async ({ cmPage, consoleErrors }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  const r = await cmPage.evaluate(() => {
    const dieta = { reglas: [{ id: 'r1', text: 'Regla de ejemplo' }], umbral: 1, log: { '2026-11-01': ['r1'], '2026-11-02': ['r1'] } };
    const dias = { '2026-11-01': 'done', '2026-11-02': 'done', '2026-11-03': 'rest' };
    S.dieta = JSON.parse(JSON.stringify(dieta));
    S.quarterlyObjectives.periods = [{ id: 't4-2026', label: 'T4 2026', flat: false, note: null, objectives: [
      { id: 9001, text: 'Objetivo con vínculo de dieta', done: true, category: 'salud', link: { type: 'dieta', metric: 'dias', target: 60 } },
      { id: 9002, text: 'Objetivo con vínculo de hábito', done: false, category: 'salud', link: { type: 'habit', section: 'salud', habitId: 'h-otro' } },
    ] }];
    S.quarterlyObjectives.activePeriod = 't4-2026';
    S.monthlyGoals = { salud: { '2026-11': [{ id: 'm1', text: 'Meta mensual con dieta', done: false, link: { type: 'dieta', metric: 'dias', target: 20 } }] } };
    S.habitTrackers.salud = [
      { id: 'habit-comida-sana', name: 'Comida sana', emoji: '🥗', days: { ...dias }, auto: { type: 'dieta', metric: 'dias' } },
      { id: 'h-sueno', name: 'Dormir', emoji: '😴', days: {}, auto: { type: 'sleep', metric: 'hours_min', horas: 7 } },
    ];
    const out = { dieta, dias };
    // camino de la nube: aplicar un estado remoto con los datos viejos
    _applyRemoteState(JSON.stringify(S), null);
    out.objs = S.quarterlyObjectives.periods[0].objectives.map((o) => ({ id: o.id, done: o.done, text: o.text, link: o.link || null }));
    out.mg = S.monthlyGoals.salud['2026-11'][0];
    out.hab = S.habitTrackers.salud.map((h) => ({ id: h.id, days: h.days, auto: h.auto || null }));
    out.dietaDespues = S.dieta;
    out.guardado = JSON.parse(localStorage.getItem('lifedash_v2')).quarterlyObjectives.periods[0].objectives[0].link || null;
    // idempotente: una segunda y tercera pasada no cambian nada
    const foto = JSON.stringify(S);
    out.cambio2 = _migrateDietaRetirada(); out.cambio3 = _migrateDietaRetirada();
    out.igual = JSON.stringify(S) === foto;
    return out;
  });
  expect(r.objs).toEqual([
    { id: 9001, done: true, text: 'Objetivo con vínculo de dieta', link: null },
    { id: 9002, done: false, text: 'Objetivo con vínculo de hábito', link: { type: 'habit', section: 'salud', habitId: 'h-otro' } },
  ]);
  expect(r.mg.link).toBeUndefined();
  expect(r.mg.text).toBe('Meta mensual con dieta');
  expect(r.hab[0]).toEqual({ id: 'habit-comida-sana', days: r.dias, auto: null });
  expect(r.hab[1].auto).toEqual({ type: 'sleep', metric: 'hours_min', horas: 7 });   // el hábito automático de sueño no se toca
  expect(r.dietaDespues).toEqual(r.dieta);
  expect(r.guardado).toBeNull();
  expect(r.cambio2).toBe(false); expect(r.cambio3).toBe(false); expect(r.igual).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test('8) no queda rastro de «cumplido», racha ni reglas de dieta: ni en la pantalla ni en las funciones', async ({ cmPage, consoleErrors }) => {
  await abrir(cmPage);
  await crearAlimento(cmPage, 'Pan de ejemplo', 'g', ['desayuno']);
  await cmPage.evaluate(() => { S.dieta = { reglas: [{ id: 'r1', text: 'Regla vieja' }], umbral: 1, log: { [getActiveDate()]: ['r1'] } }; renderDieta(); renderDietaResumen(); });
  const txt = await cmPage.evaluate(() => (document.getElementById('dietaBody').innerText + ' ' + document.getElementById('dietaResumenBody').innerText + ' ' + document.getElementById('dieta-resumen-card').innerText));
  expect(txt).not.toMatch(/cumpl|racha|regla|objetivo del día|umbral|%/i);
  const r = await cmPage.evaluate(() => ({
    fns: ['dietaDayMet', '_dietaStreak', '_dietaSyncHabit', '_dietaLast7', 'ensureDietaState', 'toggleDietaRegla', 'setDietaUmbral', 'saveDietaRegla', '_dietaLinkProgress'].filter((f) => typeof window[f] === 'function'),
    modal: !!document.getElementById('modal-dieta-regla'),
    viejo: JSON.stringify(S.dieta).includes('Regla vieja'),
  }));
  expect(r.fns).toEqual([]);
  expect(r.modal).toBe(false);
  expect(r.viejo).toBe(true);   // el historial viejo sigue guardado, solo que no se muestra
  // el cruce de Foco ya no habla de comida sana
  const cruces = await cmPage.evaluate(() => foArmarCruces({ dias: {} }, { sleepLog: {}, workoutLog: {} }).map((c) => c.clave));
  expect(cruces).toEqual(['sueno', 'entreno']);
  // y las relaciones no ofrecen la serie de dieta
  const src = await cmPage.evaluate(() => fetch('/correlaciones.js').then((r) => r.text()));
  expect(src).not.toContain('diet_pct');
  expect(consoleErrors).toEqual([]);
});

test('9) en 390 px no hay scroll horizontal y la casilla se ve entera', async ({ cmPage, consoleErrors }) => {
  await cmPage.setViewportSize({ width: 390, height: 844 });
  await abrir(cmPage);
  await crearAlimento(cmPage, 'Un alimento con un nombre bastante largo para probar el corte de línea', 'g', ['desayuno', 'almuerzo', 'merienda', 'cena']);
  await fila(cmPage, 'desayuno', 'Un alimento').locator('.com-cant').fill('1234.5');
  await cmPage.click('#dietaBody .com-bib summary');
  const m = await cmPage.evaluate(() => {
    const r = document.querySelector('#dietaBody .com-row .ptask-check input').getBoundingClientRect();
    const host = document.querySelector('#ov-dieta') || document.getElementById('dieta-card');
    const sobran = [...document.querySelectorAll('#dietaBody *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5).length;
    return { scrollX: document.documentElement.scrollWidth - innerWidth, hostScroll: host.scrollWidth - host.clientWidth, casillaDerecha: r.right, ancho: innerWidth, sobran };
  });
  expect(m.scrollX).toBeLessThanOrEqual(0);
  expect(m.hostScroll).toBeLessThanOrEqual(0);
  expect(m.sobran).toBe(0);
  expect(m.casillaDerecha).toBeLessThanOrEqual(m.ancho);
  expect(consoleErrors).toEqual([]);
});

test('10) el texto del usuario se escapa: un <script> en el nombre se ve como texto', async ({ cmPage, consoleErrors }) => {
  await abrir(cmPage);
  const nombre = '<script>window.__xss=1</script><img src=x onerror="window.__xss=1">';
  await crearAlimento(cmPage, nombre, 'g', ['desayuno']);
  await cmPage.click('#dietaBody .com-bib summary');
  await expect(bloque(cmPage, 'desayuno').locator('.com-name')).toHaveText(nombre);
  await expect(cmPage.locator('.com-bib-name')).toContainText(nombre);
  expect(await cmPage.evaluate(() => ({ x: window.__xss || 0, n: document.querySelectorAll('#dietaBody script, #dietaBody img').length }))).toEqual({ x: 0, n: 0 });
  await cmPage.fill('#dietaBody .com-cant', '30');
  expect(await cmPage.evaluate(() => Object.keys(Object.values(S.comidas.registro)[0].desayuno).length)).toBe(1);
  expect(consoleErrors).toEqual([]);
});
