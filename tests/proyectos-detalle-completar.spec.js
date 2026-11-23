// Detalle de una tarea de Proyectos abierto desde Recordatorios: 100% la marca hecha (sale de Recordatorios),
// volver a <100 la reabre, y hay accesos para ir a la tarea / al proyecto en la vista de Proyectos.
'use strict';
const { test, expect } = require('./support/fixtures');

const TAB = 'vida';
const enRecordatorios = (page) => page.locator(`#reminders-notif-${TAB} .rnotif-title`, { hasText: 'Tarea con fecha' });
const nodo = (page) => page.evaluate(() => { const n = Proyectos.findById('vida', 't1'); return { done: n.done, progress: n.progress, adv: (n.advances || []).length }; });

async function armar(page, done = false) {
  await page.evaluate((done) => {
    const d = new Date(); d.setDate(d.getDate() + 2);
    const p = (n) => String(n).padStart(2, '0');
    const due = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const proy = Object.assign(Proyectos.newNode('Proyecto madre', true), { id: 'p1', open: true });
    const t = Object.assign(Proyectos.newNode('Tarea con fecha'), { id: 't1', dueDate: due, done, progress: done ? 100 : 0 });
    proy.children.push(t);
    Proyectos.get('vida').push(proy);
    Proyectos.save('vida');
    renderReminders('vida');
  }, done);
}
const abrir = async (page) => {
  await page.evaluate(() => Proyectos.openDetail('vida', 't1'));
  await expect(page.locator('#modal-proy-detail')).toHaveClass(/open/);
};

test('100% la marca hecha y sale de Recordatorios; volver a 50% la reabre', async ({ cmPage: page, consoleErrors }) => {
  await armar(page);
  await expect(enRecordatorios(page)).toHaveCount(1);
  await abrir(page);
  const m = page.locator('#modal-proy-detail');
  await m.getByRole('button', { name: '100%' }).click();
  await expect(m.locator('#proyDetailStatus')).toHaveText('Guardado ✓');
  expect(await nodo(page)).toMatchObject({ done: true, progress: 100, adv: 1 });
  await expect(enRecordatorios(page)).toHaveCount(0);

  await m.getByRole('button', { name: '50%' }).click();
  expect(await nodo(page)).toMatchObject({ done: false, progress: 50 });
  await expect(enRecordatorios(page)).toHaveCount(1);
  expect(consoleErrors).toEqual([]);
});

test('abrir una tarea ya hecha muestra 100% seleccionado', async ({ cmPage: page }) => {
  await armar(page, true);
  await abrir(page);
  await expect(page.locator('#proyDetailProg button.on')).toHaveText('100%');
});

test('«Abrir en Proyectos» y «Ir al proyecto» llevan a la tarea y a su padre', async ({ cmPage: page, consoleErrors }) => {
  await armar(page);
  await abrir(page);
  const m = page.locator('#modal-proy-detail');
  await expect(m.locator('#proyDetailUp')).toHaveText('Ir al proyecto: Proyecto madre');

  await m.locator('#proyDetailOpen').click();
  await expect(m).not.toHaveClass(/open/);
  const ov = page.locator('#proy-overlay');
  await expect(ov.locator('.po-title')).toHaveValue('Tarea con fecha');
  await expect(ov.locator('.po-crumb.on')).toHaveText('Tarea con fecha');
  await expect(ov.locator('.po-crumbs')).toContainText('Proyecto madre');

  await page.evaluate(() => { document.querySelector('#proy-overlay .cm-ov-close, #proy-overlay [aria-label="Cerrar"]')?.click(); });
  await abrir(page);
  await m.locator('#proyDetailUp').click();
  await expect(page.locator('#proy-overlay .po-title')).toHaveValue('Proyecto madre');
  expect(consoleErrors).toEqual([]);
});

test('una tarea sin padre no muestra «Ir al proyecto»', async ({ cmPage: page }) => {
  await page.evaluate(() => { Proyectos.get('vida').push(Object.assign(Proyectos.newNode('Suelta'), { id: 't1' })); Proyectos.save('vida'); });
  await abrir(page);
  await expect(page.locator('#proyDetailUp')).toBeHidden();
  await expect(page.locator('#proyDetailOpen')).toBeVisible();
});

test('a 390 px los accesos entran sin scroll horizontal', async ({ cmPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await armar(page);
  await page.evaluate(() => { Proyectos.findById('vida', 'p1').label = 'Un proyecto con un nombre larguísimo que no entra en una línea del modal'; });
  await abrir(page);
  const r = await page.evaluate(() => {
    const md = document.querySelector('#modal-proy-detail .modal').getBoundingClientRect();
    const u = document.getElementById('proyDetailUp').getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, ok: u.right <= md.right + 1 && u.left >= md.left - 1 };
  });
  expect(r.sw).toBeLessThanOrEqual(r.cw);
  expect(r.ok).toBe(true);
});
