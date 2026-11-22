// Sistema único de frases (frases.js): franja arriba de cada pestaña principal, rota cada 5 min, prioriza favoritas (3 de 4),
// tocar avanza, re-render al cambiar frases de libros.
'use strict';
const { test, expect } = require('./support/fixtures');

const TABS = ['jarvis', 'vida', 'finanzas', 'conocimiento', 'salud', 'ia'];
const T = 300000;

test('elección pura: 3:1, sin repetir, sin favoritas, todas favoritas, pool vacío', async () => {
  require('./frases-elegir.node.js');
});

const franja = (page, tab) => page.locator(`#tab-${tab} > .cm-frase`);
const sembrar = (page, favs, nofavs) => page.evaluate(([nf, nn]) => {
  S.libros = { items: [{ id: 'b1', titulo: 'Libro Uno', autor: 'Autor Uno', estado: 'leido', notas: [], aplicar: [],
    frases: [].concat(
      Array.from({ length: nf }, (_, i) => ({ id: 'f' + i, texto: 'Favorita número ' + i, fav: 1 })),
      Array.from({ length: nn }, (_, i) => ({ id: 'n' + i, texto: 'Común número ' + i })))
  }] };
  CMFrases.refrescar();
}, [favs, nofavs]);

test('la franja aparece en cada pestaña principal, con el mismo texto, y sin desborde', async ({ cmPage: page, consoleErrors }) => {
  for (const tab of TABS) {
    await page.click(`.nav-btn[data-tab="${tab}"]`);
    const f = franja(page, tab);
    await expect(f).toBeVisible();
    await expect(f.locator('.cm-frase-t')).not.toHaveText('');
    const box = await f.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  }
  const textos = await page.evaluate((tabs) => tabs.map((t) => document.querySelector(`#tab-${t} > .cm-frase .cm-frase-t`).textContent), TABS);
  expect(new Set(textos).size).toBe(1);
  expect(consoleErrors).toEqual([]);
});

test('el planner ya no repite la frase en su propia tarjeta', async ({ cmPage: page }) => {
  await expect(page.locator('#plannerQuoteText')).toHaveCount(0);
});

test('tocar (o Enter) pasa a la siguiente frase y todas las franjas quedan iguales', async ({ cmPage: page }) => {
  await sembrar(page, 3, 2);
  await page.click('.nav-btn[data-tab="vida"]');
  const f = franja(page, 'vida');
  const t0 = await f.locator('.cm-frase-t').textContent();
  await f.click();
  const t1 = await f.locator('.cm-frase-t').textContent();
  expect(t1).not.toBe(t0);
  await f.focus(); await page.keyboard.press('Enter');
  expect(await f.locator('.cm-frase-t').textContent()).not.toBe(t1);
  const otro = await page.evaluate(() => document.querySelector('#tab-salud > .cm-frase .cm-frase-t').textContent);
  expect(otro).toBe(await f.locator('.cm-frase-t').textContent());
});

test('rota cada 5 min, 3 de cada 4 son favoritas (★) y con libro/autor atenuado', async ({ cmPage: page }) => {
  await page.clock.install({ time: new Date(2026, 10, 22, 12, 0) });
  await sembrar(page, 6, 6);
  await page.click('.nav-btn[data-tab="conocimiento"]');
  const f = franja(page, 'conocimiento');
  let favs = 0, prev = null;
  for (let k = 0; k < 24; k++) {
    const t = await f.locator('.cm-frase-t').textContent();
    expect(t).not.toBe(prev); prev = t;
    if (await f.locator('.cm-frase-star').isVisible()) { favs++; expect(t).toMatch(/^Favorita/); }
    else expect(t).not.toMatch(/^Favorita/);
    if (/número/.test(t)) await expect(f.locator('.cm-frase-a')).toHaveText('— Autor Uno, Libro Uno');
    await page.clock.fastForward(T);
    await page.evaluate(() => CMFrases.refrescar());   // el reloj de 2 s nació antes de clock.install: se fuerza el render
  }
  expect(favs).toBe(18);
});

test('antes de los 5 min no cambia; sin frases de libros se usa el respaldo; título completo en title', async ({ cmPage: page }) => {
  await page.clock.install({ time: new Date(2026, 10, 22, 12, 2, 0) });
  await page.evaluate(() => { S.libros = { items: [] }; CMFrases.refrescar(); });
  const f = franja(page, 'jarvis');
  const t0 = await f.locator('.cm-frase-t').textContent();
  expect(await page.evaluate((t) => CMFrases.RESPALDO.some((r) => r.t === t), t0)).toBe(true);
  await page.clock.fastForward(60000);   // 12:03, mismo turno
  await expect(f.locator('.cm-frase-t')).toHaveText(t0);
  await expect(f).toHaveAttribute('title', /.+/);
  await page.clock.fastForward(4 * 60000);
  await expect(f.locator('.cm-frase-t')).not.toHaveText(t0);
});

test('agregar una frase favorita en un libro se refleja sin esperar 5 min', async ({ cmPage: page }) => {
  await page.evaluate(() => { S.libros = { items: [{ id: 'b1', titulo: 'L', autor: 'A', estado: 'leido', notas: [], aplicar: [], frases: [{ id: 'x', texto: 'Única frase favorita', fav: 1 }] }] }; _lbSave(); });
  const pool = await page.evaluate(() => CMFrases.pool().filter((p) => p.fav).map((p) => p.t));
  expect(pool).toEqual(['Única frase favorita']);
  // con una sola favorita y el respaldo, tras varios toques tiene que aparecer
  let visto = false;
  for (let k = 0; k < 8 && !visto; k++) {
    visto = (await franja(page, 'jarvis').locator('.cm-frase-t').textContent()) === 'Única frase favorita';
    if (!visto) await franja(page, 'jarvis').click();
  }
  expect(visto).toBe(true);
});

test('en 390 px la franja no desborda ni cambia de alto entre frases', async ({ cmPage: page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await sembrar(page, 3, 3);
  await page.click('.nav-btn[data-tab="vida"]');
  const f = franja(page, 'vida');
  const hs = [];
  for (let k = 0; k < 4; k++) { const b = await f.boundingBox(); hs.push(b.height); expect(b.x + b.width).toBeLessThanOrEqual(390); await f.click(); }
  expect(Math.max(...hs) - Math.min(...hs)).toBeLessThanOrEqual(1);
});
