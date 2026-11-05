// "Metas del día" pasó a ser la "Lista de tareas del día": 4 categorías (matriz de Eisenhower) en orden fijo.
// S.goals no cambia de forma: la categoría vive en el campo opcional `q` ('ui' | 'un' | 'ni' | 'nn') y, si falta,
// se deriva de la prioridad al leer (alta -> ui, media -> ni, baja -> nn, otra cosa -> ni). Datos de ejemplo inventados.
'use strict';
const { test, expect } = require('./support/fixtures');

const NOMBRES = ['Urgente-importante', 'Urgente-no importante', 'No urgente-importante', 'No urgente-no importante'];

async function irAVida(page) {
  await page.click('.nav-btn[data-tab="vida"]');
  await expect(page.locator('#tab-vida')).toHaveClass(/active/);
}

// Deja el día con las tareas dadas y abre Planificación (donde vive la lista completa).
async function armar(page, goals) {
  await irAVida(page);
  await page.evaluate((gs) => {
    S.goals[getActiveDate()] = gs.map((g, i) => ({ id: 'lt' + i, done: false, ...g }));
    saveState(); renderGoals(); plannerOverlayOpen();
  }, goals);
  await expect(page.locator('#ov-planner')).toHaveClass(/show/);
  await expect(page.locator('#metas-hoy-card')).toBeVisible();
}
const enCat = (page, q) => page.locator(`#goalList .tl-q[data-q="${q}"] .goal-text-el`);
const estado = (page, texto) => page.evaluate((t) => S.goals[getActiveDate()].find((g) => g.text === t), texto);

test('1) el título nuevo está en la tarjeta de la sección, en Planificación y en los botones', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, [{ text: 'Una', priority: 'mid' }]);
  await expect(cmPage.locator('#metas-hoy-card .card-title')).toContainText('Lista de tareas del día');
  await expect(cmPage.locator('#metas-hoy-card .card-title')).not.toContainText('Metas');
  await expect(cmPage.locator('#metas-hoy-card').getByRole('button', { name: '+ Tarea' })).toBeVisible();
  await expect(cmPage.locator('#tomorrow-card').getByRole('button', { name: '+ Tarea' })).toBeVisible();
  // La tarjeta de la sección (oculta mientras Planificación está abierta) lleva el mismo título.
  await expect(cmPage.locator('#metas-readonly-card .card-title')).toContainText('Lista de tareas del día');
  await expect(cmPage.locator('#metas-readonly-card .card-title')).not.toContainText('Metas');
  expect(consoleErrors).toEqual([]);
});

test('2) las 4 categorías van en orden y cada una lleva su contador', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, [
    { text: 'A', priority: 'high', q: 'ui' }, { text: 'B', priority: 'high', q: 'ui', done: true },
    { text: 'C', priority: 'mid', q: 'ni' },
  ]);
  await expect(cmPage.locator('#goalList .tl-q-name')).toHaveText(NOMBRES);
  await expect(cmPage.locator('#goalList .tl-q')).toHaveCount(4);
  await expect(cmPage.locator('#goalList .tl-q[data-q="ui"] .gs-count')).toHaveText('1/2');
  await expect(cmPage.locator('#goalList .tl-q[data-q="un"] .gs-count')).toHaveText('0/0');
  await expect(cmPage.locator('#goalList .tl-q[data-q="ni"] .gs-count')).toHaveText('0/1');
  await expect(cmPage.locator('#goalList .tl-q[data-q="nn"] .gs-count')).toHaveText('0/0');
  expect(consoleErrors).toEqual([]);
});

test('3) las tareas viejas (sin q) caen según su prioridad, sin migrar S', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, [
    { text: 'Vieja alta', priority: 'high' },
    { text: 'Vieja media', priority: 'mid' },
    { text: 'Vieja media larga', priority: 'medium' },
    { text: 'Vieja baja', priority: 'low' },
    { text: 'Vieja sin prioridad' },
    { text: 'Vieja rara', priority: 'zzz' },
  ]);
  await expect(enCat(cmPage, 'ui')).toHaveText(['Vieja alta']);
  await expect(enCat(cmPage, 'un')).toHaveCount(0);
  await expect(enCat(cmPage, 'ni')).toHaveText(['Vieja media', 'Vieja media larga', 'Vieja sin prioridad', 'Vieja rara']);
  await expect(enCat(cmPage, 'nn')).toHaveText(['Vieja baja']);
  // Derivar al leer no escribe nada: ninguna tarea ganó el campo q.
  expect(await cmPage.evaluate(() => S.goals[getActiveDate()].some((g) => 'q' in g))).toBe(false);
  expect(consoleErrors).toEqual([]);
});

test('4) crear una tarea eligiendo "Urgente-no importante" la deja ahí con q:un; el default es No urgente-importante', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, [{ text: 'Base', priority: 'mid' }]);
  await cmPage.locator('#metas-hoy-card').getByRole('button', { name: '+ Tarea' }).click();
  await expect(cmPage.locator('#modal-add-goal')).toHaveClass(/open/);
  await expect(cmPage.locator('#newGoalQuad')).toHaveValue('ni');
  await expect(cmPage.locator('#newGoalQuad option')).toHaveText(NOMBRES);
  await cmPage.fill('#newGoalText', 'Pagar la luz');
  await cmPage.selectOption('#newGoalQuad', 'un');
  await cmPage.click('#modal-add-goal button:has-text("Agregar")');
  await expect(cmPage.locator('#modal-add-goal')).not.toHaveClass(/open/);
  await expect(enCat(cmPage, 'un')).toHaveText(['Pagar la luz']);
  expect((await estado(cmPage, 'Pagar la luz')).q).toBe('un');

  // Sin tocar el selector: queda en No urgente-importante.
  await cmPage.locator('#metas-hoy-card').getByRole('button', { name: '+ Tarea' }).click();
  await cmPage.fill('#newGoalText', 'Leer un rato');
  await cmPage.click('#modal-add-goal button:has-text("Agregar")');
  await expect(enCat(cmPage, 'ni')).toContainText(['Base', 'Leer un rato']);
  expect((await estado(cmPage, 'Leer un rato')).q).toBe('ni');

  // El "+" de una categoría abre el modal con esa categoría elegida.
  await cmPage.locator('#goalList .tl-q[data-q="nn"] .tl-q-add').click();
  await expect(cmPage.locator('#newGoalQuad')).toHaveValue('nn');
  await cmPage.fill('#newGoalText', 'Ordenar cables');
  await cmPage.click('#modal-add-goal button:has-text("Agregar")');
  await expect(enCat(cmPage, 'nn')).toHaveText(['Ordenar cables']);
  expect(consoleErrors).toEqual([]);
});

test('5) Plan Mañana crea con el mismo selector de categoría', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, [{ text: 'Base', priority: 'mid' }]);
  await cmPage.locator('#tomorrow-card').getByRole('button', { name: '+ Tarea' }).click();
  await expect(cmPage.locator('#modal-add-goal-tom')).toHaveClass(/open/);
  await expect(cmPage.locator('#newGoalQuadTom')).toHaveValue('ni');
  await cmPage.fill('#newGoalTextTom', 'Preparar mate');
  await cmPage.selectOption('#newGoalQuadTom', 'ui');
  await cmPage.click('#modal-add-goal-tom button:has-text("Agregar")');
  await expect(cmPage.locator('#tomorrowList .goal-text-el')).toHaveText(['Preparar mate']);
  expect(await cmPage.evaluate(() => S.goals[getTomorrow()][0].q)).toBe('ui');
  expect(consoleErrors).toEqual([]);
});

test('6) cambiar una tarea de categoría la mueve y guarda q; las demás no se tocan', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, [{ text: 'Mover', priority: 'mid' }, { text: 'Quieta', priority: 'low' }]);
  await expect(enCat(cmPage, 'ni')).toHaveText(['Mover']);
  const fila = cmPage.locator('#goalList .goal-item', { hasText: 'Mover' });
  await fila.locator('.goal-q-sel').selectOption('ui');
  await expect(enCat(cmPage, 'ui')).toHaveText(['Mover']);
  await expect(enCat(cmPage, 'ni')).toHaveCount(0);
  expect((await estado(cmPage, 'Mover')).q).toBe('ui');
  expect('q' in (await estado(cmPage, 'Quieta'))).toBe(false);
  await expect(cmPage.locator('#goalList .tl-q[data-q="ui"] .gs-count')).toHaveText('0/1');
  expect(consoleErrors).toEqual([]);
});

test('7) marcar una tarea hecha suma al progreso del día, de cualquier categoría', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, [
    { text: 'T1', priority: 'high', q: 'ui' }, { text: 'T2', priority: 'mid', q: 'un' },
    { text: 'T3', priority: 'mid', q: 'ni' }, { text: 'T4', priority: 'low', q: 'nn' },
  ]);
  await expect(cmPage.locator('#goalsDoneNum')).toHaveText('0');
  await expect(cmPage.locator('#goalsTotalNum')).toContainText('4');
  await cmPage.locator('#goalList .goal-item', { hasText: 'T2' }).locator('.check-box').click();
  await expect(cmPage.locator('#goalsDoneNum')).toHaveText('1');
  await cmPage.locator('#goalList .goal-item', { hasText: 'T4' }).locator('.check-box').click();
  await expect(cmPage.locator('#goalsDoneNum')).toHaveText('2');
  await expect(cmPage.locator('#goalsTotalNum')).toContainText('4');
  await expect(cmPage.locator('#goalList .tl-q[data-q="un"] .gs-count')).toHaveText('1/1');
  expect(await cmPage.evaluate(() => S.goals[getActiveDate()].filter((g) => g.done).length)).toBe(2);
  expect(consoleErrors).toEqual([]);
});

test('8) en escritorio las categorías van en matriz 2x2; a 390 px, una debajo de la otra y sin desborde', async ({ cmPage, consoleErrors }) => {
  await cmPage.setViewportSize({ width: 1280, height: 900 });
  await armar(cmPage, [
    { text: 'Una tarea con un texto bastante largo para ver cómo corta en la fila', priority: 'high' },
    { text: 'Dos', priority: 'mid', q: 'un' }, { text: 'Tres', priority: 'mid' }, { text: 'Cuatro', priority: 'low' },
  ]);
  const caja = async (q) => cmPage.locator(`#goalList .tl-q[data-q="${q}"]`).boundingBox();
  let [ui, un, ni, nn] = [await caja('ui'), await caja('un'), await caja('ni'), await caja('nn')];
  expect(Math.abs(ui.y - un.y)).toBeLessThan(2);          // fila de arriba: ui | un
  expect(un.x).toBeGreaterThan(ui.x + ui.width - 2);
  expect(Math.abs(ni.y - nn.y)).toBeLessThan(2);          // fila de abajo: ni | nn
  expect(ni.y).toBeGreaterThan(ui.y + ui.height - 2);

  await cmPage.setViewportSize({ width: 390, height: 844 });
  await cmPage.evaluate(() => renderGoals());
  [ui, un, ni, nn] = [await caja('ui'), await caja('un'), await caja('ni'), await caja('nn')];
  expect(Math.abs(un.x - ui.x)).toBeLessThan(2);          // una sola columna
  expect(Math.abs(ni.x - ui.x)).toBeLessThan(2);
  expect(Math.abs(nn.x - ui.x)).toBeLessThan(2);
  expect(un.y).toBeGreaterThan(ui.y + ui.height - 2);
  expect(ni.y).toBeGreaterThan(un.y + un.height - 2);
  expect(nn.y).toBeGreaterThan(ni.y + ni.height - 2);
  const desborde = await cmPage.evaluate(() => {
    const raiz = document.documentElement;
    const lista = document.getElementById('goalList');
    return { pagina: raiz.scrollWidth - raiz.clientWidth, lista: lista.scrollWidth - lista.clientWidth };
  });
  expect(desborde.pagina).toBeLessThanOrEqual(0);
  expect(desborde.lista).toBeLessThanOrEqual(0);
  // Casilla chica y a la derecha del texto, también acá.
  const fila = cmPage.locator('#goalList .goal-item').first();
  const cb = await fila.locator('.check-box').boundingBox();
  const tx = await fila.locator('.goal-text-el').boundingBox();
  expect(cb.width).toBeLessThanOrEqual(18);
  expect(cb.x).toBeGreaterThan(tx.x + tx.width - 1);
  expect(consoleErrors).toEqual([]);
});

test('9) la tarjeta de la sección también agrupa por categoría', async ({ cmPage, consoleErrors }) => {
  await irAVida(cmPage);
  await cmPage.evaluate(() => {
    S.goals[getActiveDate()] = [
      { id: 'r1', text: 'Roja', done: false, priority: 'high' },
      { id: 'r2', text: 'Azul', done: false, priority: 'mid', q: 'un' },
      { id: 'r3', text: 'Verde', done: true, priority: 'low' },
    ];
    renderMetasReadonly();
  });
  const t = cmPage.locator('#metas-readonly-card');
  await expect(t.locator('.tl-q-name')).toHaveText(NOMBRES);
  await expect(t.locator('.tl-q[data-q="ui"] .mrd-text')).toHaveText(['Roja']);
  await expect(t.locator('.tl-q[data-q="un"] .mrd-text')).toHaveText(['Azul']);
  await expect(t.locator('.tl-q[data-q="nn"] .mrd-text')).toHaveText(['Verde']);
  await expect(t.locator('.mrd-prog-num')).toHaveText('1');
  expect(consoleErrors).toEqual([]);
});

test('10) en la tarjeta de la sección se puede editar el texto, cambiar de categoría y arrastrar', async ({ cmPage, consoleErrors }) => {
  await irAVida(cmPage);
  await cmPage.evaluate(() => {
    S.goals[getActiveDate()] = [
      { id: 'e1', text: 'p9', done: false, priority: 'mid', q: 'un' },
      { id: 'e2', text: 'Otra', done: false, priority: 'high' },
    ];
    renderMetasReadonly();
  });
  const t = cmPage.locator('#metas-readonly-card');
  // Cambiar de categoría con el selector ⇅
  await t.locator('.tl-q[data-q="un"] .goal-q-sel').selectOption('ni');
  await expect(t.locator('.tl-q[data-q="ni"] .mrd-text')).toHaveText(['p9']);
  expect((await estado(cmPage, 'p9')).q).toBe('ni');
  // Editar el texto con clic + Enter
  await t.locator('.tl-q[data-q="ni"] .mrd-text').click();
  await cmPage.keyboard.press('End');
  await cmPage.keyboard.type(' editada');
  await cmPage.keyboard.press('Enter');
  await expect(t.locator('.tl-q[data-q="ni"] .mrd-text')).toHaveText(['p9 editada']);
  expect(await estado(cmPage, 'p9 editada')).toBeTruthy();
  // Escape cancela la edición
  await t.locator('.tl-q[data-q="ni"] .mrd-text').click();
  await cmPage.keyboard.type('xx');
  await cmPage.keyboard.press('Escape');
  await expect(t.locator('.tl-q[data-q="ni"] .mrd-text')).toHaveText(['p9 editada']);
  // Arrastrar a otra categoría (el mouse no tiene demora; en touch hay que mantener apretado)
  const src = t.locator('.tl-q[data-q="ui"] .mrd-item .mrd-prio');
  const dst = t.locator('.tl-q[data-q="nn"] .tl-q-list');
  const a = await src.boundingBox(), b = await dst.boundingBox();
  await cmPage.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await cmPage.mouse.down();
  await cmPage.mouse.move(a.x + 20, a.y + 10, { steps: 5 });
  await cmPage.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
  await cmPage.mouse.up();
  await expect(t.locator('.tl-q[data-q="nn"] .mrd-text')).toHaveText(['Otra']);
  const otra = await estado(cmPage, 'Otra');
  expect(otra.q).toBe('nn');
  expect(otra.priority).toBe('low');
  expect(await cmPage.evaluate(() => S.goals[getActiveDate()].length)).toBe(2);
  expect(consoleErrors).toEqual([]);
});
