// Detalle de un proyecto/tarea: se guarda solo (sin botón Guardar), el avance va por botones
// y los textos largos se ven enteros (crecen con el contenido, sin scroll interno).
'use strict';
const { test, expect } = require('./support/fixtures');

const LARGO = 'Poder escribir una pequeña anotación cada vez que se pone como no hecho un hábito de cualquier calendario de hábitos, '
  + 'para poder hacer aclaraciones o poner qué pasó o qué aprendí y después revisarlo en el informe semanal. '.repeat(3);

async function abrir(page, extra = {}) {
  await page.evaluate((extra) => {
    const n = Object.assign(Proyectos.newNode('Réplica gráfico portafolios'), { id: 'pd1' }, extra);
    Proyectos.get('vida').push(n);
    Proyectos.save('vida');
    Proyectos.openDetail('vida', 'pd1');
  }, extra);
  await expect(page.locator('#modal-proy-detail')).toHaveClass(/open/);
}
const nodo = (page) => page.evaluate(() => JSON.parse(JSON.stringify(Proyectos.findById('vida', 'pd1'))));

test('sin Guardar ni barra: lo escrito queda guardado al cerrar', async ({ cmPage: page }) => {
  await abrir(page);
  const m = page.locator('#modal-proy-detail');
  await expect(m.locator('input[type=range]')).toHaveCount(0);
  await expect(m.getByRole('button', { name: 'Guardar' })).toHaveCount(0);

  await page.fill('#proyDetailDesc', 'Descripción nueva');
  await page.fill('#proyDetailNotes', 'Paso 1');
  await m.getByRole('button', { name: '50%' }).click();
  await page.selectOption('#proyDetailPriority', '2');
  await m.getByRole('button', { name: 'Cerrar' }).click();
  await expect(m).not.toHaveClass(/open/);

  const n = await nodo(page);
  expect(n.description).toBe('Descripción nueva');
  expect(n.notes).toBe('Paso 1');
  expect(n.progress).toBe(50);
  expect(n.priority).toBe('2');
});

test('se guarda solo mientras se escribe, sin cerrar', async ({ cmPage: page }) => {
  await abrir(page);
  await page.locator('#proyDetailDesc').pressSequentially('hola');
  await expect.poll(async () => (await nodo(page)).description).toBe('hola');
  await expect(page.locator('#proyDetailStatus')).toHaveText('Guardado ✓');
});

test('un avance viejo (35%) no se pisa si no se toca', async ({ cmPage: page }) => {
  await abrir(page, { progress: 35 });
  await page.fill('#proyDetailNotes', 'x');
  await page.locator('#modal-proy-detail').getByRole('button', { name: 'Cerrar' }).click();
  expect((await nodo(page)).progress).toBe(35);
});

test('título vacío no borra el título anterior', async ({ cmPage: page }) => {
  await abrir(page);
  await page.fill('#proyDetailLabel', '');
  await page.locator('#modal-proy-detail').getByRole('button', { name: 'Cerrar' }).click();
  expect((await nodo(page)).label).toBe('Réplica gráfico portafolios');
});

test('texto largo se ve entero, sin scroll interno, y nada se corta a lo ancho', async ({ cmPage: page }, info) => {
  await abrir(page, { description: LARGO });
  const d = page.locator('#proyDetailDesc');
  const { sh, ch } = await d.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
  expect(sh).toBeLessThanOrEqual(ch + 2);
  const desborde = await page.locator('#modal-proy-detail .modal').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(desborde).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `test-results/proyecto-detalle-${info.project.name}.png` });
});
