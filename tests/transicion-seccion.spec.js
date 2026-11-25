// Cambio de sección: el fundido de color de fondo (--a1-c) vive en body::before (no en body, donde invalidaba el estilo de
// todo el árbol en cada cuadro), y el aviso de Deshacer queda por encima de los overlays (Planificación, z 950).
'use strict';
const { test, expect } = require('./support/fixtures');

const irA = async (page, tab) => {
  await page.click(`.nav-btn[data-tab="${tab}"]`);
  await expect(page.locator(`#tab-${tab}`)).toHaveClass(/active/);
};
const rgbDe = (page, cssVar) => page.evaluate((v) => { const d = document.createElement('div'); d.style.color = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; }, cssVar);
const a1 = (page) => page.evaluate(() => getComputedStyle(document.body, '::before').getPropertyValue('--a1-c').trim());

test('(a) body ya no transiciona --a1-c', async ({ cmPage }) => {
  const tp = await cmPage.evaluate(() => getComputedStyle(document.body).transitionProperty);
  expect(tp).not.toContain('--a1-c');
});

test('(b) el pseudo del fondo sí transiciona --a1-c', async ({ cmPage }) => {
  const tp = await cmPage.evaluate(() => getComputedStyle(document.body, '::before').transitionProperty);
  expect(tp).toContain('--a1-c');
});

test('(c) al cambiar de sección el fondo interpola y termina en el color de la sección', async ({ cmPage }) => {
  await irA(cmPage, 'vida');
  await expect.poll(() => a1(cmPage), { timeout: 3000 }).toBe(await rgbDe(cmPage, '--c-vida'));
  const medio = await cmPage.evaluate(async () => {
    document.querySelector('.nav-btn[data-tab="finanzas"]').click();
    getComputedStyle(document.body, '::before').getPropertyValue('--a1-c');   // fuerza el recálculo: la transición arranca acá, no tras el script de switchTab
    await new Promise((r) => setTimeout(r, 350));
    return getComputedStyle(document.body, '::before').getPropertyValue('--a1-c').trim();
  });
  const vida = await rgbDe(cmPage, '--c-vida'), fin = await rgbDe(cmPage, '--c-finanzas');
  expect(medio).not.toBe(vida);
  expect(medio).not.toBe(fin);
  await expect.poll(() => a1(cmPage), { timeout: 3000 }).toBe(fin);
});

test('(d) con Planificación abierta el botón Deshacer del aviso es tocable', async ({ cmPage }) => {
  await irA(cmPage, 'vida');
  await cmPage.click('#dayPlannerCard', { position: { x: 20, y: 12 } });
  await expect(cmPage.locator('#ov-planner')).toHaveClass(/show/);
  await cmPage.evaluate(() => { window.__undone = 0; CMUndo.registrar({ descripcion: 'Prueba', deshacer: () => { window.__undone++; } }); });
  await expect(cmPage.locator('#cmundo-toast')).toHaveClass(/show/);
  const ok = await cmPage.evaluate(() => {
    const b = document.querySelector('#cmundo-toast button'), r = b.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b;
  });
  expect(ok).toBe(true);
  await cmPage.click('#cmundo-toast button');
  expect(await cmPage.evaluate(() => window.__undone)).toBe(1);
});
