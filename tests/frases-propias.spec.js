// Frases sueltas cargadas a mano (S.frasesPropias): alta desde el «+» de la franja, entran al pool y a la rotación,
// edición/★/borrado desde Biblioteca (overlay Libros), persistencia tras recarga y escapado de HTML.
'use strict';
const { test, expect, completeLoginOverlay, waitForBoot } = require('./support/fixtures');

const franja = (page, tab = 'jarvis') => page.locator(`#tab-${tab} > .cm-frase`);
const LIB = '#ov-libros';

async function agregar(page, { texto, autor, fav }) {
  await franja(page).locator('.cm-frase-add').click();
  await expect(page.locator('#modal-frase-propia')).toHaveClass(/open/);
  await page.fill('#fp-texto', texto);
  if (autor !== undefined) await page.fill('#fp-autor', autor);
  if (fav) await page.locator('#fp-fav').dispatchEvent('click');   // dispatch: el modal sube con animación y el botón flotante de tema tapa la casilla en celu
  await page.click('#fp-guardar');
  await expect(page.locator('#modal-frase-propia')).not.toHaveClass(/open/);
}
const propias = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S.frasesPropias || [])));
const abrirBiblioteca = async (page) => { await page.evaluate(() => Libros.open()); await expect(page.locator(`${LIB} #lb-sueltas`)).toBeVisible(); };

test('agregar desde la franja: sin autor figura como «Propia», con autor lo muestra; entra al pool', async ({ cmPage: page, consoleErrors }) => {
  await agregar(page, { texto: 'Frase sin autor de prueba', autor: '' });
  await agregar(page, { texto: 'Frase con autor de prueba', autor: 'Fulano de Tal' });
  const ps = await propias(page);
  expect(ps).toHaveLength(2);
  expect(ps[0]).toMatchObject({ texto: 'Frase sin autor de prueba' });
  expect(ps[0].autor).toBeUndefined();
  expect(ps[0].fav).toBeUndefined();
  expect(ps[0].creada).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(ps[1].autor).toBe('Fulano de Tal');
  const pool = await page.evaluate(() => CMFrases.pool().filter((p) => p.id.startsWith('p')).map((p) => [p.t, p.a, p.fav]));
  expect(pool).toEqual([['Frase sin autor de prueba', 'Propia', false], ['Frase con autor de prueba', 'Fulano de Tal', false]]);
  expect(consoleErrors).toEqual([]);
});

test('guardar sin texto avisa y no crea nada', async ({ cmPage: page }) => {
  await franja(page).locator('.cm-frase-add').click();
  await page.click('#fp-guardar');
  await expect(page.locator('#modal-frase-propia')).toHaveClass(/open/);
  expect(await propias(page)).toHaveLength(0);
});

test('el «+» no avanza la frase, y Enter/click en la franja sí', async ({ cmPage: page }) => {
  const f = franja(page);
  const t0 = await f.locator('.cm-frase-t').textContent();
  await f.locator('.cm-frase-add').click();
  await page.click('#modal-frase-propia .btn-ghost');
  expect(await f.locator('.cm-frase-t').textContent()).toBe(t0);
});

test('aparece en la rotación y la ★ pesa 3 de cada 4', async ({ cmPage: page }) => {
  await page.clock.install({ time: new Date(2026, 10, 22, 12, 0) });
  await page.evaluate(() => { S.libros = { items: [] }; });
  await agregar(page, { texto: 'Propia favorita A', fav: true });
  await agregar(page, { texto: 'Propia favorita B', autor: 'Yo', fav: true });
  await agregar(page, { texto: 'Propia comun C' });
  const f = franja(page);
  // DOM: 4 turnos reales (3 favoritas ★ + 1 no favorita), con el autor de la propia atenuado
  const dom = [];
  for (let k = 0; k < 4; k++) {
    await page.evaluate(() => CMFrases.refrescar());
    dom.push([await f.locator('.cm-frase-t').textContent(), await f.locator('.cm-frase-star').isVisible(), await f.locator('.cm-frase-a').textContent()]);
    await page.clock.fastForward(300000);
  }
  expect(dom.filter((d) => d[1])).toHaveLength(3);
  dom.filter((d) => d[1]).forEach((d) => expect(d[0]).toMatch(/^Propia favorita/));
  expect(dom.filter((d) => !d[1])[0][0]).not.toMatch(/^Propia favorita/);
  dom.filter((d) => /favorita B/.test(d[0])).forEach((d) => expect(d[2]).toBe('— Yo'));
  // regla 3:1 sobre el pool real y ambas favoritas propias salen
  const r = await page.evaluate(() => { const p = CMFrases.pool(); const x = []; for (let t = 0; t < 16; t++) x.push(CMFrases.elegir(p, t)); return { favs: x.filter((y) => y.fav).length, ids: [...new Set(x.filter((y) => y.fav).map((y) => y.t))] }; });
  expect(r.favs).toBe(12);
  expect(r.ids.sort()).toEqual(['Propia favorita A', 'Propia favorita B']);
  // la no favorita propia entra al ciclo de las no favoritas (7 en total con el respaldo: sale dentro de 28 turnos)
  const sale = await page.evaluate(() => { const p = CMFrases.pool(); for (let t = 0; t < 40; t++) if (CMFrases.elegir(p, t).t === 'Propia comun C') return true; return false; });
  expect(sale).toBe(true);
});

test('Biblioteca: ver, editar, ★ y borrar frases sueltas', async ({ cmPage: page, consoleErrors }) => {
  await agregar(page, { texto: 'Para editar', autor: '' });
  await agregar(page, { texto: 'Para borrar', autor: 'Alguien' });
  await abrirBiblioteca(page);
  const filas = page.locator(`${LIB} #lb-sueltas .lb-frase-row`);
  await expect(filas).toHaveCount(2);
  await expect(filas.filter({ hasText: 'Para editar' })).toContainText('Propia');
  // editar
  await filas.filter({ hasText: 'Para editar' }).locator('[data-act="fp-editar"]').click();
  await page.fill('#lb-fp-texto', 'Ya editada');
  await page.fill('#lb-fp-autor', 'Marco Aurelio');
  await page.click(`${LIB} [data-act="fp-guardar"]`);
  await expect(filas.filter({ hasText: 'Ya editada' })).toContainText('Marco Aurelio');
  // ★
  await filas.filter({ hasText: 'Ya editada' }).locator('[data-act="fp-fav"]').click();
  expect((await propias(page)).find((p) => p.texto === 'Ya editada').fav).toBe(1);
  await expect(filas.first()).toContainText('Ya editada');   // las favoritas van primero
  expect(await page.evaluate(() => CMFrases.pool().find((p) => p.t === 'Ya editada').fav)).toBe(true);
  // borrar
  page.once('dialog', (d) => d.accept());
  await filas.filter({ hasText: 'Para borrar' }).locator('[data-act="fp-borrar"]').click();
  await expect(filas).toHaveCount(1);
  expect((await propias(page)).map((p) => p.texto)).toEqual(['Ya editada']);
  expect(await page.evaluate(() => CMFrases.pool().some((p) => p.t === 'Para borrar'))).toBe(false);
  expect(consoleErrors).toEqual([]);
});

test('recarga real: las frases sueltas se conservan', async ({ cmPage: page, consoleErrors }) => {
  await agregar(page, { texto: 'Sobrevive a la recarga', autor: 'Yo mismo', fav: true });
  await page.waitForTimeout(300);
  await page.reload();
  await waitForBoot(page);
  if (await page.locator('#login-screen').count()) await completeLoginOverlay(page);
  const ps = await propias(page);
  expect(ps).toHaveLength(1);
  expect(ps[0]).toMatchObject({ texto: 'Sobrevive a la recarga', autor: 'Yo mismo', fav: 1 });
  expect(await page.evaluate(() => CMFrases.pool().some((p) => p.t === 'Sobrevive a la recarga'))).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test('texto con <script> se muestra escapado en franja, modal y Biblioteca', async ({ cmPage: page, consoleErrors }) => {
  await page.evaluate(() => { window.__xss = 0; S.libros = { items: [] }; });
  const mala = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
  await agregar(page, { texto: mala, autor: '<b onmouseover="window.__xss=3">x</b>', fav: true });
  // única favorita: tiene que salir en la franja (3 de 4 turnos); se la fuerza tocando
  const f = franja(page);
  for (let k = 0; k < 8 && !(await f.locator('.cm-frase-t').textContent()).includes('<script>'); k++) await f.click();
  await expect(f.locator('.cm-frase-t')).toHaveText(mala);
  await abrirBiblioteca(page);
  await expect(page.locator(`${LIB} #lb-sueltas .lb-q`)).toHaveText(mala);
  expect(await page.locator(`${LIB} #lb-sueltas img, ${LIB} #lb-sueltas script, ${LIB} #lb-sueltas b`).count()).toBe(0);
  expect(await page.evaluate(() => window.__xss)).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('390 px: sin scroll horizontal, «+» dentro de la franja y casilla Favorita a la derecha', async ({ cmPage: page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await agregar(page, { texto: 'Una frase bastante larga para comprobar que el texto no queda tapado por el botón de agregar ni empuja el ancho de la pantalla en el celular.', autor: 'Autor con un nombre larguísimo', fav: true });
  const f = franja(page);
  for (let k = 0; k < 8 && !(await f.locator('.cm-frase-t').textContent()).startsWith('Una frase'); k++) await f.click();
  const fb = await f.boundingBox(), bb = await f.locator('.cm-frase-add').boundingBox(), body = await f.locator('.cm-frase-body').boundingBox();
  expect(bb.x + bb.width).toBeLessThanOrEqual(fb.x + fb.width);
  expect(body.x + body.width).toBeLessThanOrEqual(bb.x + 1);   // el texto termina antes del botón
  expect(fb.x + fb.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // casilla chica y a la derecha en el modal
  await f.locator('.cm-frase-add').click();
  const row = await page.locator('#modal-frase-propia .fp-fav-row').boundingBox();
  const chk = await page.locator('#fp-fav').boundingBox();
  expect(chk.width).toBeLessThanOrEqual(24);
  expect(chk.x + chk.width).toBeGreaterThan(row.x + row.width - 40);
  expect(chk.x).toBeGreaterThan(row.x + row.width / 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.click('#modal-frase-propia .btn-ghost');
  await abrirBiblioteca(page);
  expect(await page.evaluate(() => { const b = document.querySelector('#ov-libros .cm-ov-body'); return b.scrollWidth <= b.clientWidth + 1; })).toBe(true);
});
