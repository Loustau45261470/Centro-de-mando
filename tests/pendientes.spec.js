// Pendientes: las tareas no hechas de días anteriores pasan al día siguiente (vista calculada, sin escribir en S al cambiar de día)
// y se resuelven desde la lista "Pendientes" con Confirmar / Reprogramar / Descartar.
// Fechas simuladas reemplazando getActiveDate/getTomorrow (la app las usa para "hoy" y "mañana"). Datos de ejemplo inventados.
// Hoy = 2026-11-11 (miércoles); ayer = 2026-11-10.
'use strict';
const { test, expect } = require('./support/fixtures');

const HOY = '2026-11-11', AYER = '2026-11-10';

async function irAVida(page) {
  await page.click('.nav-btn[data-tab="vida"]');
  await expect(page.locator('#tab-vida')).toHaveClass(/active/);
}
async function fijarDia(page, hoy) {
  await page.evaluate((h) => {
    const d = new Date(h + 'T00:00:00'); d.setDate(d.getDate() + 1);
    const m = localStr(d);
    window.getActiveDate = () => h;
    window.getTomorrow = () => m;
    renderGoals();
  }, hoy);
}
// Deja S.goals con lo indicado ({ fecha: [tareas] }), pinta y devuelve la página lista en la sección Vida.
async function armar(page, porFecha) {
  await irAVida(page);
  await fijarDia(page, HOY);
  await page.evaluate((pf) => {
    S.goals = {};
    Object.keys(pf).forEach((f) => { S.goals[f] = pf[f].map((g, i) => ({ id: f + '-' + i, done: false, priority: 'mid', ...g })); });
    saveState(); renderGoals();
  }, porFecha);
}
const goalsDe = (page, f) => page.evaluate((x) => (S.goals[x] || []).map((g) => ({ id: g.id, text: g.text, done: g.done, q: g.q })), f);
const pend = (page) => page.locator('#pendientesCard');
const filas = (page) => page.locator('#pendientesCard .pend-item');
const enLista = (page) => page.locator('#metas-readonly-card .mrd-text');

test('1) una tarea no hecha de ayer aparece hoy (sin marca de fecha) y en Pendientes con los 3 botones', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, { [AYER]: [{ text: 'Llamar al contador', q: 'ui', priority: 'high' }], [HOY]: [{ text: 'De hoy' }] });
  await expect(enLista(cmPage)).toHaveText(['Llamar al contador', 'De hoy']);
  await expect(cmPage.locator('#metas-readonly-card .tl-q[data-q="ui"] .mrd-text')).toHaveText(['Llamar al contador']);   // conserva su grupo
  await expect(pend(cmPage)).toBeVisible();
  await expect(filas(cmPage)).toHaveCount(1);
  await expect(filas(cmPage).first()).toContainText('Llamar al contador');
  await expect(filas(cmPage).first().locator('button')).toHaveText(['Confirmar', 'Reprogramar', 'Descartar']);
  // Sin ningún texto con la fecha de origen, ni en la lista ni en Pendientes.
  const texto = await cmPage.locator('#metas-readonly-card').innerText();
  expect(texto).not.toMatch(/viene del/i);
  expect(texto).not.toMatch(/10\/11|2026-11-10/);
  // Nada se escribió solo: la tarea sigue en su fecha original.
  expect((await goalsDe(cmPage, AYER)).map((g) => g.text)).toEqual(['Llamar al contador']);
  expect((await goalsDe(cmPage, HOY)).map((g) => g.text)).toEqual(['De hoy']);
  expect(consoleErrors).toEqual([]);
});

test('2) Confirmar la deja en hoy (mismo id) y sale de Pendientes', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, { [AYER]: [{ text: 'Confirmable', q: 'un', priority: 'mid' }] });
  await filas(cmPage).first().getByRole('button', { name: 'Confirmar' }).click();
  await expect(pend(cmPage)).toBeHidden();
  const hoy = await goalsDe(cmPage, HOY);
  expect(hoy).toEqual([{ id: AYER + '-0', text: 'Confirmable', done: false, q: 'un' }]);
  expect(await goalsDe(cmPage, AYER)).toEqual([]);
  await expect(enLista(cmPage)).toHaveText(['Confirmable']);
  await expect(cmPage.locator('#metas-readonly-card .mrd-prog-tot')).toHaveText('1');   // ahora sí cuenta en el progreso
  expect(consoleErrors).toEqual([]);
});

test('3) Reprogramar a +3 días: ni hoy ni Pendientes; aparece ese día. Cancelar no cambia nada', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, { [AYER]: [{ text: 'Para el sábado' }] });
  const reprog = filas(cmPage).first().getByRole('button', { name: 'Reprogramar' });
  await reprog.click();
  await expect(cmPage.locator('#modal-pend-repro')).toHaveClass(/open/);
  await expect(cmPage.locator('#pendReproFecha')).toHaveAttribute('min', '2026-11-12');   // desde mañana
  await cmPage.locator('#modal-pend-repro').getByRole('button', { name: 'Cancelar' }).click();
  await expect(cmPage.locator('#modal-pend-repro')).not.toHaveClass(/open/);
  expect((await goalsDe(cmPage, AYER)).length).toBe(1);   // cancelar no movió nada
  await expect(filas(cmPage)).toHaveCount(1);

  await reprog.click();
  await cmPage.fill('#pendReproFecha', '2026-11-11');       // hoy: no vale, mínimo mañana
  await cmPage.locator('#modal-pend-repro').getByRole('button', { name: 'Reprogramar' }).click();
  expect((await goalsDe(cmPage, AYER)).length).toBe(1);
  await cmPage.fill('#pendReproFecha', '2026-11-14');
  await cmPage.locator('#modal-pend-repro').getByRole('button', { name: 'Reprogramar' }).click();
  await expect(cmPage.locator('#modal-pend-repro')).not.toHaveClass(/open/);
  await expect(pend(cmPage)).toBeHidden();
  await expect(enLista(cmPage)).toHaveCount(0);
  expect(await goalsDe(cmPage, AYER)).toEqual([]);
  expect((await goalsDe(cmPage, HOY)).length).toBe(0);
  expect(await goalsDe(cmPage, '2026-11-14')).toEqual([{ id: AYER + '-0', text: 'Para el sábado', done: false, q: undefined }]);

  await fijarDia(cmPage, '2026-11-14');                     // llega el día: aparece en la lista de hoy
  await expect(enLista(cmPage)).toHaveText(['Para el sábado']);
  await expect(pend(cmPage)).toBeHidden();
  expect(consoleErrors).toEqual([]);
});

test('4) Descartar pide confirmación y la borra; si se cancela no se borra', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, { [AYER]: [{ text: 'Descartable' }, { text: 'Otra' }] });
  cmPage.once('dialog', (d) => d.dismiss());
  await filas(cmPage).first().getByRole('button', { name: 'Descartar' }).click();
  expect((await goalsDe(cmPage, AYER)).length).toBe(2);
  await expect(filas(cmPage)).toHaveCount(2);

  cmPage.once('dialog', (d) => d.accept());
  await filas(cmPage).first().getByRole('button', { name: 'Descartar' }).click();
  await expect(filas(cmPage)).toHaveCount(1);
  expect((await goalsDe(cmPage, AYER)).map((g) => g.text)).toEqual(['Otra']);
  expect((await goalsDe(cmPage, HOY)).length).toBe(0);
  await expect(enLista(cmPage)).toHaveText(['Otra']);
  expect(consoleErrors).toEqual([]);
});

test('5) marcar hecha una arrastrada desde la lista de hoy la deja hecha HOY (no en el día viejo)', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, { [AYER]: [{ text: 'Arrastrada' }] });
  await cmPage.locator('#metas-readonly-card .mrd-item .mrd-check').click();
  expect(await goalsDe(cmPage, HOY)).toEqual([{ id: AYER + '-0', text: 'Arrastrada', done: true, q: undefined }]);
  expect(await goalsDe(cmPage, AYER)).toEqual([]);
  await expect(pend(cmPage)).toBeHidden();
  await expect(cmPage.locator('#metas-readonly-card .mrd-prog-num')).toHaveText('1');
  await expect(cmPage.locator('#metas-readonly-card .mrd-prog-tot')).toHaveText('1');
  expect(consoleErrors).toEqual([]);
});

test('6) editar el texto y cambiar el grupo de una arrastrada se hace sobre la tarea movida a hoy', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, { [AYER]: [{ text: 'Vieja A' }, { text: 'Vieja B' }] });
  const filaA = cmPage.locator('#metas-readonly-card .mrd-item', { hasText: 'Vieja A' });
  await filaA.locator('.goal-q-sel').selectOption('nn');
  expect((await goalsDe(cmPage, HOY)).map((g) => [g.text, g.q])).toEqual([['Vieja A', 'nn']]);
  expect((await goalsDe(cmPage, AYER)).map((g) => g.text)).toEqual(['Vieja B']);

  const textoB = cmPage.locator('#metas-readonly-card .mrd-item', { hasText: 'Vieja B' }).locator('.mrd-text');
  await textoB.click();
  await cmPage.keyboard.press('End');
  await cmPage.keyboard.type(' editada');
  await cmPage.keyboard.press('Enter');
  await expect.poll(async () => (await goalsDe(cmPage, HOY)).map((g) => g.text).sort()).toEqual(['Vieja A', 'Vieja B editada']);
  expect(await goalsDe(cmPage, AYER)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('7) las instancias de tareas repetitivas (y las de Proyectos) no aparecen como pendientes', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, {
    [AYER]: [
      { id: 'rep:grX:' + AYER, repId: 'grX', text: 'Repetitiva por regla' },
      { id: 'rep:grY:' + AYER, text: 'Repetitiva sin repId' },
      { id: 'p1', fromTask: 'tp1', fromTab: 'vida', text: 'Viene de Proyectos' },
      { id: 'n1', text: 'Normal' },
    ],
  });
  await expect(filas(cmPage)).toHaveCount(1);
  await expect(filas(cmPage).first()).toContainText('Normal');
  await expect(enLista(cmPage)).toHaveText(['Normal']);
  expect(consoleErrors).toEqual([]);
});

test('8) solo se miran los últimos 14 días: a 14 aparece, a 15 no', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, { '2026-10-28': [{ text: 'Hace 14 días' }], '2026-10-27': [{ text: 'Hace 15 días' }] });
  await expect(filas(cmPage)).toHaveCount(1);
  await expect(filas(cmPage).first()).toContainText('Hace 14 días');
  await expect(enLista(cmPage)).toHaveText(['Hace 14 días']);
  expect(consoleErrors).toEqual([]);
});

test('9) sin duplicados tras re-renderizar ni cuando otro dispositivo ya la movió a hoy (mismo id)', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, { [AYER]: [{ text: 'Una sola' }] });
  await cmPage.evaluate(() => { renderGoals(); renderGoals(); renderGoals(); });
  await expect(filas(cmPage)).toHaveCount(1);
  await expect(enLista(cmPage)).toHaveCount(1);
  // Otro dispositivo ya la tiene hoy con el mismo id pero la copia vieja sigue acá: no se muestra dos veces.
  await cmPage.evaluate((a) => { S.goals[getActiveDate()] = [{ id: a, text: 'Una sola', done: false, priority: 'mid' }]; renderGoals(); }, AYER + '-0');
  await expect(pend(cmPage)).toBeHidden();
  await expect(enLista(cmPage)).toHaveCount(1);
  expect((await goalsDe(cmPage, HOY)).length).toBe(1);
  // Mover es idempotente: confirmar de nuevo con el id ya presente no duplica.
  await cmPage.evaluate(([f, a]) => { S.goals[f] = [{ id: a, text: 'Una sola', done: false, priority: 'mid' }]; _pendMoverId(f, a, getActiveDate()); saveState(); renderGoals(); }, [AYER, AYER + '-0']);
  expect((await goalsDe(cmPage, HOY)).length).toBe(1);
  expect(await goalsDe(cmPage, AYER)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('10) el progreso del día no cuenta las arrastradas hasta confirmarlas o marcarlas hechas', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, { [AYER]: [{ text: 'Arr 1' }, { text: 'Arr 2' }], [HOY]: [{ text: 'Hoy 1', done: true }, { text: 'Hoy 2' }] });
  await expect(cmPage.locator('#metas-readonly-card .mrd-prog-num')).toHaveText('1');
  await expect(cmPage.locator('#metas-readonly-card .mrd-prog-tot')).toHaveText('2');
  await expect(cmPage.locator('#goalsDoneNum')).toHaveText('1');
  await expect(cmPage.locator('#goalsTotalNum')).toHaveText('/ 2');
  await expect(cmPage.locator('#goalsBar > div')).toHaveCount(2);
  await expect(enLista(cmPage)).toHaveCount(4);                      // se ven, pero no cuentan
  await filas(cmPage).first().getByRole('button', { name: 'Confirmar' }).click();
  await expect(cmPage.locator('#goalsTotalNum')).toHaveText('/ 3');
  await expect(cmPage.locator('#goalsDoneNum')).toHaveText('1');
  expect(consoleErrors).toEqual([]);
});

test('11) la tarjeta de la sección muestra el contador; sus botones no abren Planificación, solo el acceso', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, { [AYER]: [{ text: 'P1' }, { text: 'P2' }, { text: 'P3' }] });
  await expect(cmPage.locator('#pendientesCard .pend-head .gs-count')).toHaveText('3');
  await expect(cmPage.locator('#pendientesCard .pend-head')).toContainText('Pendientes');
  await filas(cmPage).first().getByRole('button', { name: 'Confirmar' }).click();
  await expect(cmPage.locator('#ov-planner.show')).toHaveCount(0);
  await expect(cmPage.locator('#pendientesCard .pend-head .gs-count')).toHaveText('2');
  await filas(cmPage).first().getByRole('button', { name: 'Reprogramar' }).click();
  await cmPage.locator('#modal-pend-repro').getByRole('button', { name: 'Cancelar' }).click();
  await expect(cmPage.locator('#ov-planner.show')).toHaveCount(0);
  await cmPage.locator('#pendientesCard .pend-acceso').click();
  await expect(cmPage.locator('#ov-planner')).toHaveClass(/show/);
  // En Planificación el mismo bloque está arriba de la lista de hoy.
  await expect(cmPage.locator('#pendientesPlan .pend-item')).toHaveCount(2);
  await expect(cmPage.locator('#pendientesPlan .pend-acceso')).toHaveCount(0);
  const yBloque = (await cmPage.locator('#pendientesPlan').boundingBox()).y;
  const yLista = (await cmPage.locator('#goalList').boundingBox()).y;
  expect(yBloque).toBeLessThan(yLista);
  expect(consoleErrors).toEqual([]);
});

test('12) desde Planificación: marcar la casilla de una arrastrada la deja hecha hoy', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, { [AYER]: [{ text: 'Desde el overlay' }] });
  await cmPage.evaluate(() => plannerOverlayOpen());
  await expect(cmPage.locator('#ov-planner')).toHaveClass(/show/);
  await expect(cmPage.locator('#goalList .goal-text-el')).toHaveText(['Desde el overlay']);
  const texto = await cmPage.locator('#metas-hoy-card').innerText();
  expect(texto).not.toMatch(/viene del/i);
  await cmPage.locator('#goalList .goal-item .check-box').click();
  expect(await goalsDe(cmPage, HOY)).toEqual([{ id: AYER + '-0', text: 'Desde el overlay', done: true, q: undefined }]);
  expect(await goalsDe(cmPage, AYER)).toEqual([]);
  await expect(cmPage.locator('#pendientesPlan')).toBeHidden();
  expect(consoleErrors).toEqual([]);
});

test('13) sin pendientes no hay bloque ni contador', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, { [AYER]: [{ text: 'Hecha', done: true }], [HOY]: [{ text: 'X' }] });
  await expect(pend(cmPage)).toBeHidden();
  await expect(cmPage.locator('#pendientesPlan')).toBeHidden();
  await expect(cmPage.locator('.traer-ayer-btn')).toHaveCount(0);
  await expect(cmPage.locator('#metas-ayer-aviso')).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('14) a 390 px no hay scroll horizontal y los botones quedan a la derecha', async ({ cmPage, consoleErrors }) => {
  await cmPage.setViewportSize({ width: 390, height: 844 });
  await armar(cmPage, { [AYER]: [{ text: 'Una tarea con un texto bastante largo para que ocupe más de una línea en el celular' }, { text: 'Corta' }] });
  await expect(filas(cmPage)).toHaveCount(2);
  const sinScroll = await cmPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(sinScroll).toBe(true);
  for (let i = 0; i < 2; i++) {
    const fila = await filas(cmPage).nth(i).boundingBox();
    const texto = await filas(cmPage).nth(i).locator('.pend-text').boundingBox();
    const acc = await filas(cmPage).nth(i).locator('.pend-acc').boundingBox();
    expect(acc.x + acc.width).toBeGreaterThan(fila.x + fila.width - 14);   // pegados al borde derecho de la fila
    expect(acc.x).toBeGreaterThan(texto.x);                                  // a la derecha del texto (o debajo, alineados a la derecha)
    expect(acc.x + acc.width).toBeLessThanOrEqual(390);
  }
  expect(consoleErrors).toEqual([]);
});
