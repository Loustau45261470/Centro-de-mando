// Regresiones puntuales tomadas de fixes.json — cada una es un bug real que ya
// pasó una vez. Se prioriza comportamiento observable, no solo la presencia
// del marker (eso ya lo cubre witness-fixes con grep).
'use strict';
const { test, expect } = require('./support/fixtures');

test.describe('regresiones (fixes.json)', () => {
  test('brain-confirm-gate-destructive: borrar sin confirm devuelve confirm_required y no borra', async ({ cmPage }) => {
    const before = await cmPage.evaluate(() => S.transactions.length);

    const result = await cmPage.evaluate(() => {
      return window.JARVIS_BRAIN.execute('delete_transaction', { search: 'Alquiler' });
    });

    expect(result.ok).toBe(false);
    expect(result.confirm_required).toBe(true);

    const after = await cmPage.evaluate(() => S.transactions.length);
    expect(after, 'sin confirm:true la transacción no debe borrarse').toBe(before);
  });

  test('brain-confirm-gate-destructive: con confirm:true sí borra', async ({ cmPage }) => {
    const before = await cmPage.evaluate(() => S.transactions.length);

    const result = await cmPage.evaluate(() => {
      return window.JARVIS_BRAIN.execute('delete_transaction', { search: 'Alquiler', confirm: true });
    });

    expect(result.ok).toBe(true);
    const after = await cmPage.evaluate(() => S.transactions.length);
    expect(after).toBe(before - 1);
  });

  test('speed-dial-items-eat-clicks: el contenedor cerrado no debe interceptar clicks', async ({ cmPage }) => {
    const sd = cmPage.locator('.cm-sd').first();
    await expect(sd).toHaveCount(1);
    await expect(sd).not.toHaveClass(/open/);

    const pointerEvents = await sd
      .locator('.cm-sd-items')
      .evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(pointerEvents, 'el contenedor .cm-sd-items debe tener pointer-events:none mientras está cerrado').toBe('none');
  });

  test('txncat-seeded-flag-not-truthy-object: al entrar a Finanzas se siembran categorías por defecto', async ({ cmPage }) => {
    const beforeSeeded = await cmPage.evaluate(() => S.txnCategoriesSeeded);
    expect(beforeSeeded, 'el fixture arranca sin sembrar (regresión real: reproduce el estado previo al fix)').toBe(false);

    await cmPage.click('.nav-btn[data-tab="finanzas"]');
    await expect(cmPage.locator('#tab-finanzas')).toHaveClass(/active/);

    const after = await cmPage.evaluate(() => ({
      seeded: S.txnCategoriesSeeded,
      count: Object.keys(S.txnCategories || {}).length,
    }));
    expect(after.seeded).toBe(true);
    expect(after.count, 'txnCategories debe quedar poblado, no un objeto vacío').toBeGreaterThan(0);
  });
});
