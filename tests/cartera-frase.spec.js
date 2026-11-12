// La cabecera del overlay de Cartera rota frases (Munger/Buffett): 45 s cada una, clic/Enter pasa a la siguiente,
// altura estable, sin timers colgados al cerrar y sin desborde en celular.
'use strict';
const { test, expect } = require('./support/fixtures');

const CLAVES = ['decline of 50%', 'long attention span', 'more disciplined than the rest'];

// Índice (0..2) de la frase visible, o -1 si no hay exactamente una.
const actual = (page) => page.evaluate((claves) => {
  const on = document.querySelectorAll('#ov-cartera .cov-q.on');
  if (on.length !== 1) return -1;
  const t = on[0].querySelector('blockquote').textContent;
  return claves.findIndex((c) => t.includes(c));
}, CLAVES);

// Sin Worker simulado, Mis tenencias no puede bajar sus datos ("[tenencias] … HTTP 0"): no tiene que ver con la frase.
const sinRuido = (errs) => errs.filter((e) => !/\[tenencias\]/.test(e));

test('muestra una de las 3 frases con su autor y sin desborde', async ({ cmPage, consoleErrors }) => {
  await cmPage.evaluate(() => CarteraOverlay.open());
  const q = cmPage.locator('#ov-cartera .cov-quote');
  await expect(q).toBeVisible();
  expect(await actual(cmPage)).toBeGreaterThanOrEqual(0);
  const autor = await cmPage.locator('#ov-cartera .cov-q.on figcaption').textContent();
  expect(['— Charlie Munger', '— Warren Buffett']).toContain(autor);
  expect(await cmPage.locator('#ov-cartera .cov-q').count()).toBe(3);
  // Accesibilidad
  await expect(q).toHaveAttribute('role', 'button');
  await expect(q).toHaveAttribute('tabindex', '0');
  await expect(q).toHaveAttribute('aria-label', 'Siguiente frase');
  await expect(q).toHaveAttribute('aria-live', 'polite');
  const box = await q.boundingBox(), vw = cmPage.viewportSize().width;
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
  expect(sinRuido(consoleErrors)).toEqual([]);
});

test('a los 45 s pasa a la siguiente frase, en loop', async ({ cmPage, consoleErrors }) => {
  await cmPage.clock.install();
  await cmPage.evaluate(() => CarteraOverlay.open());
  const i0 = await actual(cmPage);
  expect(i0).toBeGreaterThanOrEqual(0);
  await cmPage.clock.fastForward(44000);
  expect(await actual(cmPage)).toBe(i0);
  await cmPage.clock.fastForward(1500);
  expect(await actual(cmPage)).toBe((i0 + 1) % 3);
  await cmPage.clock.fastForward(45000);
  await cmPage.clock.fastForward(45000);
  expect(await actual(cmPage)).toBe((i0 + 3) % 3);
  expect(sinRuido(consoleErrors)).toEqual([]);
});

test('clic y Enter/Espacio pasan a la siguiente al instante y no abren nada más', async ({ cmPage }) => {
  await cmPage.evaluate(() => CarteraOverlay.open());
  const q = cmPage.locator('#ov-cartera .cov-quote');
  const i0 = await actual(cmPage);
  await q.click();
  expect(await actual(cmPage)).toBe((i0 + 1) % 3);
  await q.focus();
  await cmPage.keyboard.press('Enter');
  expect(await actual(cmPage)).toBe((i0 + 2) % 3);
  await cmPage.keyboard.press(' ');
  expect(await actual(cmPage)).toBe(i0);
  // Sigue abierto solo el overlay de Cartera, con la pestaña por defecto.
  await expect(cmPage.locator('.cm-overlay.show')).toHaveCount(1);
  await expect(cmPage.locator('#ov-cartera .plov-tab.on')).toHaveAttribute('data-t', 'tenencias');
});

test('al cerrar no quedan timers: abrir/cerrar 3 veces no acelera la rotación y cerrado no rota', async ({ cmPage }) => {
  await cmPage.clock.install();
  for (let k = 0; k < 3; k++) {
    await cmPage.evaluate(() => CarteraOverlay.open());
    await cmPage.evaluate(() => CMOverlay.close('ov-cartera'));
  }
  // Cerrado: pasa el tiempo y la frase no cambia (no hay timer vivo).
  const antes = await cmPage.evaluate(() => document.querySelector('#ov-cartera .cov-q.on')?.textContent);
  for (let k = 0; k < 3; k++) await cmPage.clock.fastForward(45000);
  expect(await cmPage.evaluate(() => document.querySelector('#ov-cartera .cov-q.on')?.textContent)).toBe(antes);
  // Reabierto: un único timer, avanza exactamente de a una frase por ciclo.
  await cmPage.evaluate(() => CarteraOverlay.open());
  const i0 = await actual(cmPage);
  await cmPage.clock.fastForward(45500);
  expect(await actual(cmPage)).toBe((i0 + 1) % 3);
});

test('la altura no salta entre frases (pestañas a ≤ 1 px) y en 390 px no hay desborde', async ({ cmPage }) => {
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

test('con prefers-reduced-motion el cambio es directo, sin fundido', async ({ cmPage }) => {
  await cmPage.emulateMedia({ reducedMotion: 'reduce' });
  await cmPage.evaluate(() => CarteraOverlay.open());
  const dur = await cmPage.evaluate(() => getComputedStyle(document.querySelector('#ov-cartera .cov-q')).transitionDuration);
  expect(dur).toBe('0s');
});
