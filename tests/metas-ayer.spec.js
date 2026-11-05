// A10 — Aviso "Te quedaron N tareas de ayer sin hacer": aparece una vez por día por dispositivo (localStorage),
// con "Pasarlas a hoy" (sin duplicar por texto) y "Dejarlas". Nada se mueve solo.
'use strict';
const { test, expect } = require('./support/fixtures');

async function irAVida(page) {
  await page.click('.nav-btn[data-tab="vida"]');
  await expect(page.locator('#tab-vida')).toHaveClass(/active/);
}

// Deja ayer/hoy a medida, borra la marca del día y vuelve a correr el chequeo de arranque.
async function armar(page, { ayer, hoy = [] }) {
  await page.evaluate(({ ayer, hoy }) => {
    const mk = (g, i) => ({ id: 'g' + i + g.text, text: g.text, done: !!g.done, priority: 'mid' });
    S.goals[_ayerStr()] = ayer.map(mk);
    S.goals[getActiveDate()] = hoy.map(mk);
    document.getElementById('metas-ayer-aviso')?.remove();
    localStorage.removeItem(METAS_AYER_KEY);
    saveState(); renderGoals();
    mostrarAvisoMetasAyer();
  }, { ayer, hoy });
}
const aviso = (page) => page.locator('#metas-ayer-aviso');
const textos = (page, cual) => page.evaluate((c) => (S.goals[c === 'ayer' ? _ayerStr() : getActiveDate()] || []).map((g) => g.text), cual);

test('1) con metas de ayer sin hacer aparece el cartel con la cuenta, sin mover nada', async ({ cmPage, consoleErrors }) => {
  await irAVida(cmPage);
  await armar(cmPage, { ayer: [{ text: 'A' }, { text: 'B' }, { text: 'C', done: true }] });
  await expect(aviso(cmPage)).toBeVisible();
  await expect(aviso(cmPage)).toContainText('Te quedaron 2 tareas de ayer sin hacer');
  expect(await textos(cmPage, 'ayer')).toEqual(['A', 'B', 'C']);
  expect(await textos(cmPage, 'hoy')).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('2) singular con una sola meta', async ({ cmPage }) => {
  await irAVida(cmPage);
  await armar(cmPage, { ayer: [{ text: 'A' }] });
  await expect(aviso(cmPage)).toContainText('Te quedó 1 tarea de ayer sin hacer');
});

test('3) sin metas pendientes de ayer (vacío o todas hechas) no aparece', async ({ cmPage }) => {
  await irAVida(cmPage);
  await armar(cmPage, { ayer: [] });
  await expect(aviso(cmPage)).toHaveCount(0);
  await armar(cmPage, { ayer: [{ text: 'A', done: true }] });
  await expect(aviso(cmPage)).toHaveCount(0);
});

test('4) una sola vez por día: tras cerrarlo no vuelve; al día siguiente (marca vieja) sí', async ({ cmPage }) => {
  await irAVida(cmPage);
  await armar(cmPage, { ayer: [{ text: 'A' }] });
  await expect(aviso(cmPage)).toBeVisible();
  await cmPage.getByRole('button', { name: 'Dejarlas' }).click();
  await expect(aviso(cmPage)).toHaveCount(0);
  expect(await textos(cmPage, 'ayer')).toEqual(['A']);   // "Dejarlas" no toca nada
  expect(await textos(cmPage, 'hoy')).toEqual([]);

  await cmPage.evaluate(() => mostrarAvisoMetasAyer());   // misma jornada: no reaparece
  await expect(aviso(cmPage)).toHaveCount(0);
  expect(await cmPage.evaluate(() => localStorage.getItem(METAS_AYER_KEY))).toBe(await cmPage.evaluate(() => getActiveDate()));

  await cmPage.evaluate(() => { localStorage.setItem(METAS_AYER_KEY, '2000-01-01'); mostrarAvisoMetasAyer(); });
  await expect(aviso(cmPage)).toBeVisible();
});

test('5) "Pasarlas a hoy" trae solo las pendientes, sin duplicar las que ya están hoy por texto', async ({ cmPage, consoleErrors }) => {
  await irAVida(cmPage);
  await armar(cmPage, { ayer: [{ text: 'A' }, { text: 'B' }, { text: 'C', done: true }], hoy: [{ text: 'A' }] });
  await cmPage.getByRole('button', { name: 'Pasarlas a hoy' }).click();
  await expect(aviso(cmPage)).toHaveCount(0);
  expect((await textos(cmPage, 'hoy')).sort()).toEqual(['A', 'B']);   // A no se duplicó, C (hecha) no viene
  expect(await textos(cmPage, 'ayer')).toEqual(['C']);
  const hoy = await cmPage.evaluate(() => S.goals[getActiveDate()]);
  expect(hoy.every((g) => g.done === false)).toBe(true);
  await expect(cmPage.locator('#metas-readonly-card .mrd-text')).toHaveText(['A', 'B']);
  expect(consoleErrors).toEqual([]);
});

test('6) "Empujar restantes a mañana" sigue igual (misma lógica compartida)', async ({ cmPage }) => {
  await irAVida(cmPage);
  await cmPage.evaluate(() => {
    const hoy = getActiveDate();
    S.goals[hoy] = [{ id: 'x1', text: 'P', done: false, priority: 'mid' }, { id: 'x2', text: 'Q', done: true, priority: 'mid' }];
    S.goals[getTomorrow()] = [{ id: 'x3', text: 'P', done: false, priority: 'mid' }];
    window.confirm = () => true;
    pushRemaining();
  });
  expect(await cmPage.evaluate(() => S.goals[getActiveDate()].map((g) => g.text))).toEqual(['Q']);
  expect(await cmPage.evaluate(() => S.goals[getTomorrow()].map((g) => g.text))).toEqual(['P']);
});

// ── Botón permanente "Traer de ayer (N)": no depende del cartel de una vez por día ──
const traer = (page) => page.locator('.traer-ayer-btn');

test('7) el botón "Traer de ayer (N)" sigue disponible aunque se cierre el cartel, con N = lo que realmente traería', async ({ cmPage, consoleErrors }) => {
  await irAVida(cmPage);
  await armar(cmPage, { ayer: [{ text: 'A' }, { text: 'B' }, { text: 'C', done: true }], hoy: [{ text: 'A' }] });
  await cmPage.getByRole('button', { name: 'Dejarlas' }).click();
  await expect(aviso(cmPage)).toHaveCount(0);
  await cmPage.evaluate(() => mostrarAvisoMetasAyer());      // la marca del día ya está puesta: el cartel no vuelve...
  await expect(aviso(cmPage)).toHaveCount(0);
  // ...pero el botón sí está, en la tarjeta de la sección y en Planificación. N = 1: A ya está hoy, C está hecha.
  await expect(cmPage.locator('#metas-readonly-card .traer-ayer-btn')).toBeVisible();
  await expect(cmPage.locator('#metas-readonly-card .traer-ayer-btn')).toHaveText('↶ Traer de ayer (1)');
  await expect(cmPage.locator('#metas-hoy-card .traer-ayer-btn')).toHaveText('↶ Traer de ayer (1)');
  expect(consoleErrors).toEqual([]);
});

test('8) "Traer de ayer" trae solo lo pendiente, sin duplicar, conserva la categoría y el botón desaparece al quedar en 0', async ({ cmPage, consoleErrors }) => {
  await irAVida(cmPage);
  await cmPage.evaluate(() => {
    S.goals[_ayerStr()] = [
      { id: 'a1', text: 'Urgente de ayer', done: false, priority: 'high', q: 'ui' },
      { id: 'a2', text: 'Baja de ayer', done: false, priority: 'low', q: 'nn' },
      { id: 'a3', text: 'Hecha de ayer', done: true, priority: 'mid' },
    ];
    S.goals[getActiveDate()] = [{ id: 'h1', text: 'Baja de ayer', done: false, priority: 'low', q: 'nn' }];
    saveState(); renderGoals();
  });
  await expect(traer(cmPage).first()).toHaveText('↶ Traer de ayer (1)');
  await cmPage.locator('#metas-readonly-card .traer-ayer-btn').click();
  expect((await textos(cmPage, 'hoy')).sort()).toEqual(['Baja de ayer', 'Urgente de ayer']);   // sin duplicar la que ya estaba
  const urg = await cmPage.evaluate(() => S.goals[getActiveDate()].find((g) => g.text === 'Urgente de ayer'));
  expect(urg).toMatchObject({ q: 'ui', priority: 'high', done: false });
  await expect(cmPage.locator('#metas-readonly-card .tl-q[data-q="ui"] .mrd-text')).toHaveText(['Urgente de ayer']);
  await expect(traer(cmPage).first()).toBeHidden();          // ya no queda nada por traer
  await expect(traer(cmPage).nth(1)).toBeHidden();
  expect(consoleErrors).toEqual([]);
});

test('9) sin pendientes de ayer el botón no se muestra; y el click en él no abre Planificación', async ({ cmPage }) => {
  await irAVida(cmPage);
  await armar(cmPage, { ayer: [{ text: 'A', done: true }] });
  await expect(traer(cmPage).first()).toBeHidden();
  await armar(cmPage, { ayer: [{ text: 'A' }, { text: 'B' }] });
  await cmPage.getByRole('button', { name: 'Dejarlas' }).click();
  await cmPage.locator('#metas-readonly-card .traer-ayer-btn').click();
  await expect(cmPage.locator('#ov-planner.show')).toHaveCount(0);   // la tarjeta es un link a Planificación; el botón no lo dispara
  expect((await textos(cmPage, 'hoy')).sort()).toEqual(['A', 'B']);
});
