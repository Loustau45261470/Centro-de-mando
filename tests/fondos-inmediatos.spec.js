// Fondos de compra inmediatos: en el modo diario, lo ganado en el mes en curso se puede gastar apenas
// se marca el hábito (sin esperar al cierre). Presupuesto y Movimientos no cambian: una sola transacción
// al cierre. El saldo puede quedar negativo (desmarcar no tiene piso) y al gastar se permite un margen
// de hasta el 10% de lo máximo que el fondo junta en un mes.
'use strict';
const { test, expect } = require('./support/fixtures');

// Fondo diario de $1.000/día sin hitos, atado a un hábito de Salud; mes en curso sin registro.
async function cargarFondoDiario(page, extra) {
  return page.evaluate((extra) => {
    const mk = _pfMonthKey(new Date());
    const today = `${mk}-15`;
    window.getActiveDate = () => today;
    S.accounts = [{ id: 'bco', name: 'Banco', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' }];
    S.transactions = [];
    S.habitTrackers = S.habitTrackers || {};
    S.habitTrackers.salud = [{ id: 'h1', name: 'Gym', emoji: '🏋️', days: {} }];
    S.purchaseFunds = [{ id: 'f1', name: 'Gym', emoji: '💪', accountId: 'bco', monthlyAmount: 0, createdMonth: mk,
      condition: Object.assign({ type: 'diario', section: 'salud', habitId: 'h1', perDay: 1000, milestones: [] }, extra || {}) }];
    S.purchaseFundLog = {};
    S.purchaseFundSpends = [];
    renderFinanzasTab();
    return { mk, today, cap: pfMonthlyCap(S.purchaseFunds[0], mk) };
  }, extra);
}

const marcar = (page, ds, st) => page.evaluate(([ds, st]) => {
  const h = S.habitTrackers.salud[0];
  if (st) h.days[ds] = st; else delete h.days[ds];
}, [ds, st]);

// Gasto por el mismo camino que usa la UI (modal + saveFundSpend).
async function gastar(page, amount) {
  return page.evaluate((amount) => {
    const antes = S.purchaseFundSpends.length;
    openFundSpend('f1');
    document.getElementById('fundSpendDesc').value = 'Compra';
    document.getElementById('fundSpendAmount').value = String(amount);
    saveFundSpend();
    closeModal('modal-fund-spend');
    return S.purchaseFundSpends.length > antes;
  }, amount);
}

test('1) marcar el hábito hoy suma al disponible al instante, sin transacción ni registro del mes', async ({ cmPage, consoleErrors }) => {
  const { mk, today } = await cargarFondoDiario(cmPage);
  expect(await cmPage.evaluate(() => pfAccumulated('f1'))).toBe(0);
  await marcar(cmPage, today, 'done');
  expect(await cmPage.evaluate(() => pfAccumulated('f1'))).toBe(1000);
  await marcar(cmPage, `${mk}-14`, 'partial');
  expect(await cmPage.evaluate(() => pfAccumulated('f1'))).toBe(1500);
  const r = await cmPage.evaluate((mk) => ({ txns: S.transactions.length, log: (S.purchaseFundLog.f1 || {})[mk], saldo: S.accounts[0].balance }), mk);
  expect(r).toEqual({ txns: 0, log: undefined, saldo: 1000000 });
  // Un día futuro no cuenta.
  await marcar(cmPage, `${mk}-20`, 'done');
  expect(await cmPage.evaluate(() => pfAccumulated('f1'))).toBe(1500);
  expect(consoleErrors).toEqual([]);
});

test('2) se puede gastar hasta un 10% del tope mensual por encima del disponible, y no más', async ({ cmPage, consoleErrors }) => {
  const { today, cap } = await cargarFondoDiario(cmPage);
  await marcar(cmPage, today, 'done');                       // disponible 1.000
  const margen = Math.round(cap * 0.1);
  expect(await gastar(cmPage, 1000 + margen + 1)).toBe(false);
  expect(await gastar(cmPage, 1000 + margen)).toBe(true);
  expect(await cmPage.evaluate(() => pfAccumulated('f1'))).toBe(-margen);
  expect(await gastar(cmPage, 1)).toBe(false);               // ya está en el piso del margen
  expect(consoleErrors).toEqual([]);
});

test('3) desmarcar un día ya gastado deja el saldo negativo, sin piso', async ({ cmPage, consoleErrors }) => {
  const { mk, today } = await cargarFondoDiario(cmPage);
  await marcar(cmPage, today, 'done');
  await marcar(cmPage, `${mk}-14`, 'done');
  expect(await gastar(cmPage, 2000)).toBe(true);
  await marcar(cmPage, today, null);
  await marcar(cmPage, `${mk}-14`, null);
  expect(await cmPage.evaluate(() => pfAccumulated('f1'))).toBe(-2000);
  await cmPage.evaluate(() => renderFinanzasTab());
  expect(consoleErrors).toEqual([]);
});

test('4) al cerrar el mes se acredita lo ganado una sola vez y el disponible no salta', async ({ cmPage, consoleErrors }) => {
  const r = await cmPage.evaluate(() => {
    const cur = _pfMonthKey(new Date());
    const [y, m] = cur.split('-').map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    window.getActiveDate = () => `${cur}-15`;
    S.accounts = [{ id: 'bco', name: 'Banco', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' }];
    S.transactions = [];
    S.habitTrackers = S.habitTrackers || {};
    S.habitTrackers.salud = [{ id: 'h1', name: 'Gym', emoji: '🏋️', days: { [`${prev}-10`]: 'done', [`${prev}-20`]: 'done', [`${cur}-15`]: 'done' } }];
    S.purchaseFunds = [{ id: 'f1', name: 'Gym', emoji: '💪', accountId: 'bco', monthlyAmount: 0, createdMonth: prev,
      condition: { type: 'diario', section: 'salud', habitId: 'h1', perDay: 1000, milestones: [] } }];
    S.purchaseFundLog = {};
    S.purchaseFundSpends = [];
    pfCatchUp(); pfCatchUp();
    return {
      disp: pfAccumulated('f1'),
      txns: S.transactions.length,
      txnAmount: S.transactions[0] && S.transactions[0].amount,
      logPrev: S.purchaseFundLog.f1[prev].credited,
      logCur: S.purchaseFundLog.f1[cur],
      saldo: S.accounts[0].balance,
    };
  });
  expect(r).toEqual({ disp: 3000, txns: 1, txnAmount: 2000, logPrev: 2000, logCur: undefined, saldo: 998000 });
  expect(consoleErrors).toEqual([]);
});

test('5) fondos por % del mes siguen acreditando al cierre, pero también tienen margen del 10% de su monto mensual', async ({ cmPage, consoleErrors }) => {
  await cargarFondoDiario(cmPage);
  await cmPage.evaluate(() => {
    const f = S.purchaseFunds[0];
    f.monthlyAmount = 50000;
    f.condition = { type: 'habito', section: 'salud', habitId: 'h1', threshold: 50 };
    S.habitTrackers.salud[0].days[getActiveDate()] = 'done';
  });
  expect(await cmPage.evaluate(() => pfAccumulated('f1'))).toBe(0);   // nada inmediato
  expect(await gastar(cmPage, 5001)).toBe(false);
  expect(await gastar(cmPage, 5000)).toBe(true);
  expect(await cmPage.evaluate(() => pfAccumulated('f1'))).toBe(-5000);
  expect(consoleErrors).toEqual([]);
});

test('6) la tarjeta del fondo muestra el disponible con lo ganado hoy', async ({ cmPage, consoleErrors }) => {
  const { today } = await cargarFondoDiario(cmPage);
  await marcar(cmPage, today, 'done');
  const txt = await cmPage.evaluate(() => { renderPurchaseFunds(); return { acc: document.querySelector('#fundsList .fund-acc').textContent, esperado: fmtMoney(1000, 'ARS') }; });
  expect(txt.acc).toBe(txt.esperado);
  expect(consoleErrors).toEqual([]);
});
