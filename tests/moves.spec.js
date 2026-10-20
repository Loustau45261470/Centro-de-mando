// "Mover plata": pasa un monto de una cuenta a otra sin crear ingreso ni gasto.
'use strict';
const { test, expect } = require('./support/fixtures');

async function abrirConCuentas(page) {
  await page.evaluate(() => {
    S.accounts = [
      { id: 'efectivo', name: 'Efectivo', type: 'cash', balance: 30000, currency: 'ARS', icon: '💵' },
      { id: 'uala', name: 'Ualá', type: 'bank', balance: 500000, currency: 'ARS', icon: '🏦' },
      { id: 'inv', name: 'Inversiones', type: 'invest', balance: 100000, currency: 'ARS', icon: '📈' },
      { id: 'didi', name: 'Deuda de Didi', type: 'prestamo', balance: 0, currency: 'ARS', icon: '🤝' },
      { id: 'usd', name: 'Dólares', type: 'bank', balance: 10, currency: 'USD', icon: '💵' },
    ];
    S.moves = [];
  });
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(() => renderFinanzasTab());
}

async function mover(page, from, to, monto, nota) {
  await page.click('button:has-text("Mover plata")');
  await expect(page.locator('#modal-move-money')).toHaveClass(/open/);
  await page.selectOption('#moveFrom', from);
  await page.selectOption('#moveTo', to);
  await page.fill('#moveAmount', String(monto));
  if (nota) await page.fill('#moveNote', nota);
}

const saldos = (page) => page.evaluate(() => Object.fromEntries(S.accounts.map((a) => [a.id, a.balance])));
const confirmar = (page) => page.click('#modal-move-money button:has-text("Mover")');

test('Ualá a Inversiones de 200.000: mueve los saldos y no toca ingresos ni gastos', async ({ cmPage }) => {
  await abrirConCuentas(cmPage);
  const txnAntes = await cmPage.evaluate(() => JSON.stringify(S.transactions));
  const nwAntes = await cmPage.evaluate(() => calcNetWorth());

  await mover(cmPage, 'uala', 'inv', 200000, 'rebalanceo');
  await confirmar(cmPage);
  await expect(cmPage.locator('#modal-move-money')).not.toHaveClass(/open/);

  const s = await saldos(cmPage);
  expect(s.uala).toBe(300000);
  expect(s.inv).toBe(300000);
  expect(await cmPage.evaluate(() => JSON.stringify(S.transactions))).toBe(txnAntes);
  expect(await cmPage.evaluate(() => calcNetWorth())).toBe(nwAntes);

  const moves = await cmPage.evaluate(() => S.moves);
  expect(moves).toHaveLength(1);
  expect(moves[0]).toMatchObject({ from: 'uala', to: 'inv', amount: 200000, note: 'rebalanceo' });
  expect(moves[0].id).toBeTruthy();
  expect(moves[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // snapshotNW() registró el saldo nuevo de la cuenta en el historial de hoy
  const hoy = await cmPage.evaluate(() => getActiveDate());
  const h = await cmPage.evaluate((d) => S.accountHistory.filter((x) => x.date === d && x.accountId === 'uala').map((x) => x.balance), hoy);
  expect(h).toEqual([300000]);
  expect(await cmPage.evaluate((d) => S.nwHistory.some((x) => x.date === d), hoy)).toBe(true);
});

test('efectivo a Ualá: cubre efectivo y digital con la misma función', async ({ cmPage }) => {
  await abrirConCuentas(cmPage);
  await mover(cmPage, 'efectivo', 'uala', 10000);
  await confirmar(cmPage);
  const s = await saldos(cmPage);
  expect(s.efectivo).toBe(20000);
  expect(s.uala).toBe(510000);
});

test('pasar a una cuenta que queda en negativo avisa, pero deja hacerlo', async ({ cmPage }) => {
  await abrirConCuentas(cmPage);
  await mover(cmPage, 'efectivo', 'uala', 50000);
  // aviso visible dentro del modal antes de confirmar
  await expect(cmPage.locator('#moveWarn')).toBeVisible();
  await expect(cmPage.locator('#moveWarn')).toContainText('negativo');
  await confirmar(cmPage);
  await expect(cmPage.locator('#toast')).toContainText('negativo');
  const s = await saldos(cmPage);
  expect(s.efectivo).toBe(-20000);
  expect(s.uala).toBe(550000);
});

test('monto invalido, mismas cuentas, campos vacios o monedas distintas se rechazan', async ({ cmPage }) => {
  await abrirConCuentas(cmPage);
  const antes = await saldos(cmPage);

  const casos = [
    ['uala', 'inv', '0', 'mayor a cero'],
    ['uala', 'inv', '-500', 'mayor a cero'],
    ['uala', 'inv', '', 'mayor a cero'],
    ['uala', 'uala', '1000', 'no pueden ser la misma'],
    ['', 'inv', '1000', 'las dos cuentas'],
    ['uala', '', '1000', 'las dos cuentas'],
    ['uala', 'usd', '1000', 'misma moneda'],
  ];
  await cmPage.click('button:has-text("Mover plata")');
  for (const [from, to, monto, msg] of casos) {
    await cmPage.selectOption('#moveFrom', from);
    await cmPage.selectOption('#moveTo', to);
    await cmPage.fill('#moveAmount', monto);
    await confirmar(cmPage);
    await expect(cmPage.locator('#toast')).toContainText(new RegExp(msg, 'i'));
    await expect(cmPage.locator('#modal-move-money')).toHaveClass(/open/);
  }
  expect(await saldos(cmPage)).toEqual(antes);
  expect(await cmPage.evaluate(() => S.moves.length)).toBe(0);
});

test('prestamo: prestar resta de Ualá y suma a la deuda de la persona; que paguen es el movimiento inverso', async ({ cmPage }) => {
  await abrirConCuentas(cmPage);
  const txnAntes = await cmPage.evaluate(() => JSON.stringify(S.transactions));

  await mover(cmPage, 'uala', 'didi', 80000, 'le presté a Didi');
  await confirmar(cmPage);
  let s = await saldos(cmPage);
  expect(s.uala).toBe(420000);
  expect(s.didi).toBe(80000);

  await mover(cmPage, 'didi', 'uala', 80000, 'Didi me pagó');
  await confirmar(cmPage);
  s = await saldos(cmPage);
  expect(s.uala).toBe(500000);
  expect(s.didi).toBe(0);

  expect(await cmPage.evaluate(() => S.moves.length)).toBe(2);
  expect(await cmPage.evaluate(() => JSON.stringify(S.transactions))).toBe(txnAntes);
});

test('el tipo Efectivo existe al crear una cuenta y se muestra con su nombre', async ({ cmPage }) => {
  await abrirConCuentas(cmPage);
  await expect(cmPage.locator('#accType option[value="cash"]')).toHaveCount(1);
  await expect(cmPage.locator('#accountList')).toContainText('Efectivo');
});
