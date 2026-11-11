// La cabecera del overlay de Cartera muestra la frase de Charlie Munger, sin desbordar en celular.
'use strict';
const { test, expect } = require('./support/fixtures');

test('el overlay de Cartera muestra la frase de Munger', async ({ cmPage, consoleErrors }) => {
  await cmPage.evaluate(() => CarteraOverlay.open());
  const q = cmPage.locator('#ov-cartera .cov-quote');
  await expect(q).toBeVisible();
  await expect(q.locator('blockquote')).toContainText('decline of 50%');
  await expect(q.locator('figcaption')).toHaveText('— Charlie Munger');
  const box = await q.boundingBox(), vw = cmPage.viewportSize().width;
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
  // Sin Worker simulado, Mis tenencias no puede bajar sus datos ("[tenencias] … HTTP 0"): no tiene que ver con la frase.
  expect(consoleErrors.filter((e) => !/\[tenencias\]/.test(e))).toEqual([]);
});
