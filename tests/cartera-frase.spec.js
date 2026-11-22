// La cabecera del overlay de Cartera muestra la frase del sistema único (frases.js / CMFrases): la misma que la franja de las
// pestañas, rota con ella cada 5 min (ya no un array propio de 3 citas cada 45 s), clic/Enter pasa a la siguiente,
// altura estable, sin suscriptores colgados al cerrar y sin desborde en celular.
'use strict';
const { test, expect } = require('./support/fixtures');

// Texto de la frase visible en el overlay, o null si no hay exactamente una.
const actual = (page) => page.evaluate(() => {
  const on = document.querySelectorAll('#ov-cartera .cov-q.on');
  return on.length === 1 ? on[0].querySelector('blockquote').textContent.replace(/^[★\s]+/, '').replace(/^“|”$/g, '') : null;
});
const sembrar = (page) => page.evaluate(() => {
  S.libros = { items: [{ id: 'b1', titulo: 'L', autor: 'Autor Libro', estado: 'leido', notas: [], aplicar: [],
    frases: [1, 2, 3, 4, 5, 6].map((i) => ({ id: 'f' + i, texto: 'Frase de libro ' + i, fav: i <= 4 ? 1 : 0 })) }] };
  CMFrases.refrescar();
});

// Sin Worker simulado, Mis tenencias no puede bajar sus datos ("[tenencias] … HTTP 0"): no tiene que ver con la frase.
const sinRuido = (errs) => errs.filter((e) => !/\[tenencias\]/.test(e));

test('muestra la frase actual del sistema, con su autor, y sin desborde', async ({ cmPage, consoleErrors }) => {
  await sembrar(cmPage);
  await cmPage.evaluate(() => CarteraOverlay.open());
  const q = cmPage.locator('#ov-cartera .cov-quote');
  await expect(q).toBeVisible();
  const esperado = await cmPage.evaluate(() => CMFrases.actual().t);
  expect(await actual(cmPage)).toBe(esperado);
  expect(await cmPage.locator('#ov-cartera .cov-q').count()).toBe(1);
  await expect(q).toHaveAttribute('role', 'button');
  await expect(q).toHaveAttribute('tabindex', '0');
  await expect(q).toHaveAttribute('aria-label', 'Siguiente frase');
  await expect(q).toHaveAttribute('aria-live', 'polite');
  const box = await q.boundingBox(), vw = cmPage.viewportSize().width;
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
  expect(sinRuido(consoleErrors)).toEqual([]);
});

test('con el turno de 5 min cambia a la misma frase que la franja de las pestañas', async ({ cmPage, consoleErrors }) => {
  await cmPage.clock.install({ time: new Date(2026, 10, 22, 12, 0) });
  await sembrar(cmPage);
  await cmPage.evaluate(() => CarteraOverlay.open());
  const t0 = await actual(cmPage);
  await cmPage.clock.fastForward(60000);
  expect(await actual(cmPage)).toBe(t0);
  await cmPage.clock.fastForward(5 * 60000);
  await expect.poll(() => actual(cmPage)).not.toBe(t0);   // lo repinta el reloj global de frases.js (2 s reales)
  const t1 = await actual(cmPage);
  expect(t1).toBe(await cmPage.evaluate(() => document.querySelector('#tab-jarvis > .cm-frase .cm-frase-t').textContent));
  expect(sinRuido(consoleErrors)).toEqual([]);
});

test('clic y Enter/Espacio pasan a la siguiente al instante y no abren nada más', async ({ cmPage }) => {
  await sembrar(cmPage);
  await cmPage.evaluate(() => CarteraOverlay.open());
  const q = cmPage.locator('#ov-cartera .cov-quote');
  const t0 = await actual(cmPage);
  await q.click();
  const t1 = await actual(cmPage);
  expect(t1).not.toBe(t0);
  await q.focus();
  await cmPage.keyboard.press('Enter');
  const t2 = await actual(cmPage);
  expect(t2).not.toBe(t1);
  await cmPage.keyboard.press(' ');
  expect(await actual(cmPage)).not.toBe(t2);
  await expect(cmPage.locator('.cm-overlay.show')).toHaveCount(1);
  await expect(cmPage.locator('#ov-cartera .plov-tab.on')).toHaveAttribute('data-t', 'tenencias');
});

test('al cerrar no quedan suscriptores: abrir/cerrar 3 veces y cerrado no se repinta', async ({ cmPage }) => {
  await sembrar(cmPage);
  for (let k = 0; k < 3; k++) {
    await cmPage.evaluate(() => CarteraOverlay.open());
    await cmPage.evaluate(() => CMOverlay.close('ov-cartera'));
  }
  const antes = await cmPage.evaluate(() => document.querySelector('#ov-cartera .cov-q.on')?.textContent);
  await cmPage.evaluate(() => CMFrases.siguiente());
  expect(await cmPage.evaluate(() => document.querySelector('#ov-cartera .cov-q.on')?.textContent)).toBe(antes);
});

test('la altura no salta entre frases (pestañas a ≤ 1 px) y en 390 px no hay desborde', async ({ cmPage }) => {
  await sembrar(cmPage);
  for (const ancho of [1280, 390]) {
    await cmPage.setViewportSize({ width: ancho, height: 800 });
    await cmPage.evaluate(() => CarteraOverlay.open());
    const q = cmPage.locator('#ov-cartera .cov-quote');
    const tabs = cmPage.locator('#ov-cartera .plov-tabs'), head = cmPage.locator('#ov-cartera .cm-ov-head');
    await cmPage.waitForTimeout(900); // que termine la animación de entrada del panel
    const ys = [];
    for (let k = 0; k < 3; k++) {
      ys.push((await tabs.boundingBox()).y - (await head.boundingBox()).y);
      await q.click();
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);
    const box = await q.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(ancho);
    expect(await cmPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await cmPage.evaluate(() => CMOverlay.close('ov-cartera'));
  }
});
