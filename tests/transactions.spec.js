// Alta de transacción: abre el modal, carga un gasto, confirma que aparece en
// el historial de Actividad y que S.transactions creció.
'use strict';
const { test, expect } = require('./support/fixtures');

test('cargar un gasto lo agrega a S.transactions y al historial', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="finanzas"]');
  await expect(cmPage.locator('#tab-finanzas')).toHaveClass(/active/);

  const before = await cmPage.evaluate(() => S.transactions.length);

  await cmPage.click('#tab-finanzas .btn:has-text("+ Movimiento")');
  await expect(cmPage.locator('#modal-add-txn')).toHaveClass(/open/);

  const desc = 'Test E2E Cafetería';
  await cmPage.fill('#txnName', desc);
  await cmPage.selectOption('#txnType', 'expense');
  await cmPage.fill('#txnAmount', '1234');
  await cmPage.selectOption('#txnAccount', 'acc-main');
  await cmPage.click('#modal-add-txn button:has-text("Registrar")');

  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);

  const after = await cmPage.evaluate(() => S.transactions.length);
  expect(after).toBe(before + 1);

  const stored = await cmPage.evaluate((d) => S.transactions.find((t) => t.name === d), desc);
  expect(stored).toBeTruthy();
  expect(stored.type).toBe('expense');
  expect(stored.amount).toBe(1234);

  await expect(cmPage.locator('#activityList')).toContainText(desc);
});
