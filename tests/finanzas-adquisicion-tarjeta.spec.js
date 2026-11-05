// Finanzas: sin Notas, Proyectos ni Adquisición en el abanico. Los objetivos de adquisición se abren tocando la tarjeta
// "Top 5 · Adquisiciones" (patrón .cc-card-link, como Crédito y Cursada).
'use strict';
const { test, expect } = require('./support/fixtures');

const irAFinanzas = async (page) => {
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
};
const sembrar = (page, vacio = false) => page.evaluate((vacio) => {
  S.wishlist = vacio ? [] : [
    { id: 'w1', name: 'Notebook', amount: 1200, currency: 'USD', category: 'tech', priority: 'importante', score: 5 },
    { id: 'w2', name: 'Bicicleta', amount: 800, currency: 'USD', category: 'tech', priority: 'normal', score: 3 },
  ];
  renderWishTop5();
}, vacio);

const tarjeta = (page) => page.locator('#wish-top5-card');
const overlay = (page) => page.locator('#ov-goals');

test.describe('Top 5 · Adquisiciones abre el overlay', () => {
  test('clic en la tarjeta (título o fila) abre el overlay de adquisición; es botón enfocable', async ({ cmPage: page, consoleErrors }) => {
    await irAFinanzas(page);
    await sembrar(page);
    await expect(tarjeta(page)).toHaveClass(/cc-card-link/);
    await expect(tarjeta(page)).toHaveAttribute('role', 'button');
    await expect(tarjeta(page)).toHaveAttribute('tabindex', '0');
    await tarjeta(page).locator('.card-title').click();
    await expect(overlay(page)).toHaveClass(/show/);
    await expect(overlay(page).locator('.cm-ov-title')).toHaveText('Objetivos de adquisición');
    await expect(overlay(page).locator('#wishlist-card')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(overlay(page)).not.toHaveClass(/show/);
    await tarjeta(page).locator('.wt-item').first().click();
    await expect(overlay(page)).toHaveClass(/show/);
    await page.keyboard.press('Escape');
    await expect(overlay(page)).not.toHaveClass(/show/);
    expect(consoleErrors).toEqual([]);
  });

  test('Enter y Espacio sobre la tarjeta enfocada la abren', async ({ cmPage: page, consoleErrors }) => {
    await irAFinanzas(page);
    await sembrar(page);
    for (const tecla of ['Enter', ' ']) {
      await tarjeta(page).focus();
      await page.keyboard.press(tecla);
      await expect(overlay(page)).toHaveClass(/show/);
      await page.keyboard.press('Escape');
      await expect(overlay(page)).not.toHaveClass(/show/);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('tocar el título no colapsa la tarjeta (queda visible al cerrar el overlay)', async ({ cmPage: page }) => {
    await irAFinanzas(page);
    await sembrar(page);
    await tarjeta(page).locator('.card-title').click();
    await page.keyboard.press('Escape');
    await expect(tarjeta(page).locator('.collapsed')).toHaveCount(0);
    await expect(tarjeta(page).locator('.wt-item').first()).toBeVisible();
  });

  test('sin objetivos: el aviso manda a tocar la tarjeta y ya no habla del abanico', async ({ cmPage: page }) => {
    await irAFinanzas(page);
    await sembrar(page, true);
    await expect(tarjeta(page)).toContainText('Tocá esta tarjeta');
    await expect(tarjeta(page)).not.toContainText('📈');
    await tarjeta(page).click({ position: { x: 20, y: 20 } });
    await expect(overlay(page)).toHaveClass(/show/);
  });
});

test.describe('el abanico de Finanzas', () => {
  test('no trae Notas, Proyectos ni Adquisición; sigue con Presupuesto, Cartera y Negocios', async ({ cmPage: page, consoleErrors }) => {
    await irAFinanzas(page);
    const etiquetas = await page.evaluate(() => [...document.querySelectorAll('#sd-finanzas .cm-sd-item')].map((b) => b.getAttribute('aria-label')));
    for (const e of ['Notas', 'Proyectos', 'Adquisición']) expect(etiquetas).not.toContain(e);
    for (const e of ['Presupuesto', 'Cartera', 'Negocios']) expect(etiquetas).toContain(e);
    expect(await page.evaluate(() => typeof window.finanzasNotasOpen)).toBe('undefined');
    expect(consoleErrors).toEqual([]);
  });

  test('las demás secciones conservan Proyectos y Notas donde los tenían', async ({ cmPage: page }) => {
    const etiquetas = (sd) => page.evaluate((id) => [...document.querySelectorAll(`#${id} .cm-sd-item`)].map((b) => b.getAttribute('aria-label')), sd);
    for (const tab of ['vida', 'salud', 'conocimiento', 'ia']) expect(await etiquetas('sd-' + tab), tab).toContain('Proyectos');
    expect(await etiquetas('sd-salud')).toContain('Notas');
    expect(await etiquetas('sd-conocimiento')).toContain('Notas');
  });
});
