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
async function crearAlimento(page, nombre, unidad, comidas, sana = true) {
  await page.click('#dietaBody button:has-text("+ Alimento")');
  await expect(page.locator('#modal-comida-alimento')).toHaveClass(/open/);
  await page.fill('#comAlimNombre', nombre);
  await page.click(`#comAlimUnidad .com-chip[data-v="${unidad}"]`);
  if (sana !== null) await page.click(`#comAlimSana .com-chip[data-v="${sana}"]`);
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
  const al = await cmPage.evaluate(() => S.comidas.alimentos.map((a) => ({ n: a.nombre, u: a.unidad, c: a.comidas, s: a.sana })));
  expect(al).toEqual([{ n: 'Pan de ejemplo', u: 'g', c: ['desayuno', 'merienda'], s: true }, { n: 'Huevo de ejemplo', u: 'u', c: ['cena'], s: true }]);
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

// ───────── Clasificación sana / no sana ─────────
test('11) la clasificación es obligatoria al crear y queda guardada', async ({ cmPage, consoleErrors }) => {
  await abrir(cmPage);
  await cmPage.click('#dietaBody button:has-text("+ Alimento")');
  await cmPage.fill('#comAlimNombre', 'Algo de ejemplo');
  await cmPage.click('#comAlimUnidad .com-chip[data-v="g"]');
  await cmPage.click('#comAlimComidas .com-chip[data-v="cena"]');
  await cmPage.click('#modal-comida-alimento button:has-text("Guardar")');
  await expect(cmPage.locator('#modal-comida-alimento')).toHaveClass(/open/);
  expect(await cmPage.evaluate(() => S.comidas.alimentos.length)).toBe(0);
  await cmPage.click('#comAlimSana .com-chip[data-v="false"]');
  await cmPage.click('#modal-comida-alimento button:has-text("Guardar")');
  await expect(cmPage.locator('#modal-comida-alimento')).not.toHaveClass(/open/);
  expect(await cmPage.evaluate(() => S.comidas.alimentos[0].sana)).toBe(false);
  expect(consoleErrors).toEqual([]);
});

test('12) la fila lleva la marca sana / no sana con texto accesible y el resumen del día cuenta lo comido', async ({ cmPage, consoleErrors }) => {
  test.setTimeout(90000);
  await abrir(cmPage);
  await crearAlimento(cmPage, 'Fruta de ejemplo', 'u', ['desayuno'], true);
  await crearAlimento(cmPage, 'Galletita de ejemplo', 'u', ['desayuno'], false);
  await expect(fila(cmPage, 'desayuno', 'Fruta de ejemplo').locator('.com-sana')).toHaveAttribute('aria-label', 'Sana');
  await expect(fila(cmPage, 'desayuno', 'Galletita de ejemplo').locator('.com-sana')).toHaveAttribute('aria-label', 'No sana');
  await expect(cmPage.locator('#comResumenSana')).toHaveText('0 sanas · 0 no sanas');
  await fila(cmPage, 'desayuno', 'Fruta de ejemplo').locator('.ptask-check input').check();
  await expect(cmPage.locator('#comResumenSana')).toHaveText('1 sana · 0 no sanas');
  await fila(cmPage, 'desayuno', 'Galletita de ejemplo').locator('.ptask-check input').check();
  await expect(cmPage.locator('#comResumenSana')).toHaveText('1 sana · 1 no sana');
  await expect(cmPage.locator('#comResumenDia')).toHaveText('Hoy: 1 de 4 comidas cargadas');
  // cambiar la clasificación de un alimento ya usado se refleja sin confirmación
  await cmPage.click('#dietaBody .com-bib summary');
  await cmPage.locator('.com-bib-row', { hasText: 'Galletita de ejemplo' }).locator('button[title="Editar"]').click();
  await cmPage.click('#comAlimSana .com-chip[data-v="true"]');
  await cmPage.click('#modal-comida-alimento button:has-text("Guardar")');
  await expect(cmPage.locator('#comResumenSana')).toHaveText('2 sanas · 0 no sanas');
  expect(consoleErrors).toEqual([]);
});

test('13) un alimento viejo sin el campo se ve «sin clasificar», no cuenta y se puede clasificar al editar', async ({ cmPage, consoleErrors }) => {
  await abrir(cmPage);
  await cmPage.evaluate(() => {
    S.comidas.alimentos.push({ id: 'viejo1', nombre: 'Viejo de ejemplo', unidad: 'g', comidas: ['cena'] });
    S.comidas.registro[getActiveDate()] = { cena: { viejo1: { ok: true, cant: 100 } } };
    renderDieta(); renderDietaResumen();
  });
  await expect(fila(cmPage, 'cena', 'Viejo de ejemplo').locator('.com-sana')).toHaveAttribute('aria-label', 'Sin clasificar');
  await expect(cmPage.locator('#comResumenSana')).toHaveText('0 sanas · 0 no sanas');
  await cmPage.click('#dietaBody .com-bib summary');
  await expect(cmPage.locator('.com-bib-row', { hasText: 'Viejo de ejemplo' })).toContainText('sin clasificar');
  // editar sin elegir: sigue sin clasificar, sin inventar un valor
  await cmPage.locator('.com-bib-row').locator('button[title="Editar"]').click();
  await expect(cmPage.locator('#comAlimSana .com-chip[aria-pressed="true"]')).toHaveCount(0);
  await cmPage.click('#modal-comida-alimento button:has-text("Guardar")');
  await expect(cmPage.locator('#modal-comida-alimento')).not.toHaveClass(/open/);
  expect(await cmPage.evaluate(() => 'sana' in S.comidas.alimentos[0])).toBe(false);
  // editar eligiendo: se clasifica
  await cmPage.locator('.com-bib-row').locator('button[title="Editar"]').click();
  await cmPage.click('#comAlimSana .com-chip[data-v="false"]');
  await cmPage.click('#modal-comida-alimento button:has-text("Guardar")');
  expect(await cmPage.evaluate(() => S.comidas.alimentos[0].sana)).toBe(false);
  await expect(cmPage.locator('#comResumenSana')).toHaveText('0 sanas · 1 no sana');
  expect(consoleErrors).toEqual([]);
});

test('14) en 390 px la marca y el resumen no producen scroll horizontal', async ({ cmPage, consoleErrors }) => {
  await cmPage.setViewportSize({ width: 390, height: 844 });
  await abrir(cmPage);
  await cmPage.evaluate(() => {
    S.comidas.alimentos.push({ id: 'a1', nombre: 'Un alimento con un nombre bastante largo para probar el corte de línea', unidad: 'g', sana: true, comidas: ['desayuno'] });
    S.comidas.alimentos.push({ id: 'a2', nombre: 'Otro', unidad: 'u', sana: false, comidas: ['desayuno'] });
    S.comidas.alimentos.push({ id: 'a3', nombre: 'Sin clasificar', unidad: 'u', comidas: ['desayuno'] });
    renderDieta();
  });
  await cmPage.click('#dietaBody .com-bib summary');
  const m = await cmPage.evaluate(() => ({
    scrollX: document.documentElement.scrollWidth - innerWidth,
    sobran: [...document.querySelectorAll('#dietaBody *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5).length,
    marcas: document.querySelectorAll('#dietaBody .com-row .com-sana').length,
  }));
  expect(m.scrollX).toBeLessThanOrEqual(0);
  expect(m.sobran).toBe(0);
  expect(m.marcas).toBe(3);
  expect(consoleErrors).toEqual([]);
});

// ───────── Hábito que se marca solo con el registro de comidas ─────────
const prepDia = (page) => page.evaluate(() => {
  const sanos = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'].map((id) => ({ id, nombre: 'Sano ' + id, unidad: 'u', sana: true, comidas: ['desayuno', 'almuerzo', 'cena'] }));
  S.comidas = { alimentos: [...sanos, { id: 'n1', nombre: 'No sano', unidad: 'u', sana: false, comidas: ['merienda'] }, { id: 'sc', nombre: 'Sin clas', unidad: 'u', comidas: ['merienda'] }], registro: {} };
});
const reg = (page, ds, dia) => page.evaluate(([d, r]) => { S.comidas.registro[d] = r; }, [ds, dia]);

test('15) regla pura comDiaCumple: 3 comidas y 90% sano', async ({ cmPage, consoleErrors }) => {
  await abrir(cmPage);
  await prepDia(cmPage);
  const casos = await cmPage.evaluate(() => {
    const k = { ok: true, cant: null };
    const r = {};
    S.comidas.registro = {
      // 3 comidas, 9 sanos + 1 no sano = 90% → cumple
      d1: { desayuno: { s1: k, s2: k, s3: k }, almuerzo: { s4: k, s5: k, s6: k }, cena: { s7: k, s8: k, s9: k }, merienda: { n1: k } },
      // solo 2 comidas
      d2: { desayuno: { s1: k }, almuerzo: { s4: k } },
      // 3 comidas, 8 sanos + 2 no sanos = 80%
      d3: { desayuno: { s1: k, s2: k, s3: k }, almuerzo: { s4: k, s5: k, s6: k }, cena: { s7: k, s8: k }, merienda: { n1: k } },
      // sin clasificar no cuenta: 3 sanos + sin clasificar = 100% de lo clasificado, pero la merienda sola con sin clasificar no es comida hecha extra aquí
      d4: { desayuno: { s1: k }, almuerzo: { s4: k }, cena: { s7: k, sc: k } },
      // solo sin clasificar: no hay base
      d5: { desayuno: { sc: k }, almuerzo: { sc: k }, cena: { sc: k } },
      // marcado en falso no hace comida
      d6: { desayuno: { s1: k }, almuerzo: { s4: k }, cena: { s7: { ok: false, cant: 5 } } },
    };
    ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'].forEach((d) => { r[d] = comDiaCumple(d); });
    r.d3_80 = comDiaCumple('d3', { type: 'comidas', minComidas: 3, pctSano: 80 });
    r.d2_2 = comDiaCumple('d2', { type: 'comidas', minComidas: 2, pctSano: 90 });
    return r;
  });
  expect(casos).toEqual({ d1: true, d2: false, d3: false, d4: true, d5: false, d6: false, d7: null, d3_80: true, d2_2: true });
  expect(consoleErrors).toEqual([]);
});

test('16) el hábito automático se marca al registrar, se desmarca al deshacer y respeta los estados manuales', async ({ cmPage, consoleErrors }) => {
  test.setTimeout(90000);
  await abrir(cmPage);
  await prepDia(cmPage);
  const ds = await cmPage.evaluate(() => {
    S.habitTrackers.salud = [
      { id: 'hc', name: 'Comida sana', emoji: '🍽️', days: {}, auto: { type: 'comidas', minComidas: 3, pctSano: 90 } },
      { id: 'hx', name: 'Común', emoji: '📌', days: { '2026-01-01': 'done' } },
    ];
    renderDieta(); renderDietaResumen();
    return getActiveDate();
  });
  const dias = () => cmPage.evaluate(() => S.habitTrackers.salud.find((h) => h.id === 'hc').days);
  const marcar = (c, id) => bloque(cmPage, c).locator('.com-row', { hasText: 'Sano ' + id }).locator('.ptask-check input');
  await marcar('desayuno', 's1').check();
  await marcar('almuerzo', 's2').check();
  expect((await dias())[ds]).toBeUndefined();   // 2 comidas: todavía no
  await marcar('cena', 's3').check();
  expect((await dias())[ds]).toBe('done');
  await marcar('cena', 's3').uncheck();
  expect((await dias())[ds]).toBeUndefined();
  await marcar('cena', 's3').check();
  // estados manuales: no se pisan ni al cumplir ni al dejar de cumplir
  await cmPage.evaluate((d) => { S.habitTrackers.salud[0].days[d] = 'partial'; }, ds);
  await marcar('cena', 's3').uncheck(); await marcar('cena', 's3').check();
  expect((await dias())[ds]).toBe('partial');
  await cmPage.evaluate((d) => { S.habitTrackers.salud[0].days[d] = 'rest'; }, ds);
  await marcar('cena', 's3').uncheck();
  expect((await dias())[ds]).toBe('rest');
  // desmarcar todo el día (el registro desaparece) saca el 'done' puesto por la regla
  await cmPage.evaluate((d) => { delete S.habitTrackers.salud[0].days[d]; }, ds);
  await marcar('cena', 's3').check();
  expect((await dias())[ds]).toBe('done');
  await marcar('cena', 's3').uncheck(); await marcar('almuerzo', 's2').uncheck(); await marcar('desayuno', 's1').uncheck();
  expect(await cmPage.evaluate((d) => S.comidas.registro[d], ds)).toBeUndefined();
  expect((await dias())[ds]).toBeUndefined();
  // el hábito sin auto no se toca
  expect(await cmPage.evaluate(() => S.habitTrackers.salud.find((h) => h.id === 'hx').days)).toEqual({ '2026-01-01': 'done' });
  expect(consoleErrors).toEqual([]);
});

test('17) cambiar la clasificación de un alimento recalcula los últimos días del hábito', async ({ cmPage, consoleErrors }) => {
  test.setTimeout(90000);
  await abrir(cmPage);
  await prepDia(cmPage);
  const ayer = await cmPage.evaluate(() => {
    const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() - 1);
    const a = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const k = { ok: true, cant: null };
    S.comidas.registro[a] = { desayuno: { s1: k }, almuerzo: { s2: k }, cena: { s3: k } };
    S.habitTrackers.salud = [{ id: 'hc', name: 'Comida sana', emoji: '🍽️', days: {}, auto: { type: 'comidas', minComidas: 3, pctSano: 90 } }];
    _habitComidasSyncAll(null, 60);
    renderDieta();
    return a;
  });
  expect(await cmPage.evaluate((a) => S.habitTrackers.salud[0].days[a], ayer)).toBe('done');
  await cmPage.click('#dietaBody .com-bib summary');
  await cmPage.locator('.com-bib-row', { hasText: 'Sano s3' }).locator('button[title="Editar"]').click();
  await cmPage.click('#comAlimSana .com-chip[data-v="false"]');
  await cmPage.click('#modal-comida-alimento button:has-text("Guardar")');
  expect(await cmPage.evaluate((a) => S.habitTrackers.salud[0].days[a], ayer)).toBeUndefined();   // 2/3 sanos = 67%
  expect(consoleErrors).toEqual([]);
});

test('18) las condiciones se editan en el modal del hábito y al guardar se recalculan 60 días', async ({ cmPage, consoleErrors }) => {
  await abrir(cmPage);
  await prepDia(cmPage);
  const ayer = await cmPage.evaluate(() => {
    const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() - 1);
    const a = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const k = { ok: true, cant: null };
    // 2 comidas, 4 sanos + 1 no sano = 80%
    S.comidas.registro[a] = { desayuno: { s1: k, s2: k }, almuerzo: { s4: k, s5: k }, merienda: { n1: k } };
    S.habitTrackers.salud = [{ id: 'hc', name: 'Comida sana', emoji: '🍽️', days: {} }];
    return a;
  });
  await cmPage.evaluate(() => openEditHabitFor('salud', 'hc'));
  const m = cmPage.locator('#modal-habit');
  await expect(m.locator('#habitComidasBody')).toBeHidden();
  await m.locator('#habitAutoComidasOn').check();
  await expect(m.locator('#habitComidasMin')).toHaveValue('3');
  await expect(m.locator('#habitComidasPct')).toHaveValue('90');
  await expect(m.locator('#habitComidasNota')).toHaveText('Se marca si cargaste al menos 3 comidas y el 90% de lo que comiste es sano');
  await m.getByRole('button', { name: 'Guardar' }).click();
  expect(await cmPage.evaluate(() => S.habitTrackers.salud[0].auto)).toEqual({ type: 'comidas', minComidas: 3, pctSano: 90 });
  expect(await cmPage.evaluate((a) => S.habitTrackers.salud[0].days[a], ayer)).toBeUndefined();   // 3 comidas / 90%: no cumple
  // nueva config: 2 comidas y 80% → recalcula y marca el día pasado
  await cmPage.evaluate(() => openEditHabitFor('salud', 'hc'));
  await expect(m.locator('#habitComidasMin')).toHaveValue('3');
  await m.locator('#habitComidasMin').fill('2');
  await m.locator('#habitComidasPct').fill('80');
  await expect(m.locator('#habitComidasNota')).toHaveText('Se marca si cargaste al menos 2 comidas y el 80% de lo que comiste es sano');
  await m.getByRole('button', { name: 'Guardar' }).click();
  expect(await cmPage.evaluate(() => S.habitTrackers.salud[0].auto)).toEqual({ type: 'comidas', minComidas: 2, pctSano: 80 });
  expect(await cmPage.evaluate((a) => S.habitTrackers.salud[0].days[a], ayer)).toBe('done');
  expect(await cmPage.evaluate(() => habitAutoTexto(S.habitTrackers.salud[0].auto))).toBe('Se marca solo: ≥2 comidas y 80% sano');
  await expect(cmPage.locator('.habit-auto-tag', { hasText: '🍽️ Se marca solo: ≥2 comidas y 80% sano' }).first()).toBeAttached();
  // valores inválidos no guardan
  await cmPage.evaluate(() => openEditHabitFor('salud', 'hc'));
  await m.locator('#habitComidasMin').fill('7');
  await m.getByRole('button', { name: 'Guardar' }).click();
  await expect(m).toHaveClass(/open/);
  expect(await cmPage.evaluate(() => S.habitTrackers.salud[0].auto.minComidas)).toBe(2);
  expect(consoleErrors).toEqual([]);
});

test('19) la migración de dieta retirada no borra auto.type «comidas»', async ({ cmPage, consoleErrors }) => {
  await abrir(cmPage);
  const r = await cmPage.evaluate(() => {
    S.habitTrackers.salud = [
      { id: 'hc', name: 'Comida', emoji: '🍽️', days: {}, auto: { type: 'comidas', minComidas: 2, pctSano: 80 } },
      { id: 'hd', name: 'Vieja', emoji: '🥗', days: {}, auto: { type: 'dieta', metric: 'dias' } },
    ];
    _migrateDietaRetirada();
    return S.habitTrackers.salud.map((h) => h.auto || null);
  });
  expect(r).toEqual([{ type: 'comidas', minComidas: 2, pctSano: 80 }, null]);
  expect(consoleErrors).toEqual([]);
});
