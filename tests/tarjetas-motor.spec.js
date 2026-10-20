// Motor de cálculo de compras con tarjeta (tarjetas-motor.js): funciones puras.
// Se prueba por require() en Node y también cargado como script clásico en el navegador.
'use strict';
const { test, expect } = require('./support/fixtures');
const M = require('../tarjetas-motor.js');

// Tarjetas de ejemplo (solo para tests; no son datos de producción).
const naranja = { id: 'n', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 0 };
const mp      = { id: 'm', name: 'Mercado Pago', limit: 425000, closeDay: 5, dueDay: 10, openingUsed: 0 };
const galicia = { id: 'g', name: 'Galicia', limit: 1000000, closeDay: 29, dueDay: 11, openingUsed: 0 };
const cents = (list) => list.reduce((s, x) => s + Math.round(x.amount * 100), 0);

test.describe('statementFor', () => {
  const cases = [
    ['Naranja 15-oct', naranja, '2026-10-15', '2026-10-27', '2026-11-10'],
    ['Naranja 27-oct (día del cierre -> siguiente)', naranja, '2026-10-27', '2026-11-27', '2026-12-10'],
    ['Naranja 26-oct (víspera)', naranja, '2026-10-26', '2026-10-27', '2026-11-10'],
    ['MP 3-oct (vence mismo mes)', mp, '2026-10-03', '2026-10-05', '2026-10-10'],
    ['MP 5-oct (día del cierre)', mp, '2026-10-05', '2026-11-05', '2026-11-10'],
    ['MP 6-oct', mp, '2026-10-06', '2026-11-05', '2026-11-10'],
    ['Galicia 15-oct', galicia, '2026-10-15', '2026-10-29', '2026-11-11'],
    ['Naranja 28-dic (cruza de año)', naranja, '2026-12-28', '2027-01-27', '2027-02-10'],
    ['cierre 31 en febrero: 20-feb', { closeDay: 31, dueDay: 10 }, '2026-02-20', '2026-02-28', '2026-03-10'],
    ['cierre 31 en febrero: 28-feb (día del cierre clamp -> siguiente)', { closeDay: 31, dueDay: 10 }, '2026-02-28', '2026-03-31', '2026-04-10'],
    ['cierre 30 en feb bisiesto: 29-feb-2028', { closeDay: 30, dueDay: 10 }, '2028-02-29', '2028-03-30', '2028-04-10'],
    ['vence 31 > cierre 5: mismo mes, clamp a 30 (abril)', { closeDay: 5, dueDay: 31 }, '2026-04-02', '2026-04-05', '2026-04-30'],
    ['vence 31 en febrero: clamp 28-feb', { closeDay: 20, dueDay: 31 }, '2026-01-25', '2026-02-20', '2026-02-28'],
  ];
  for (const [name, card, date, close, due] of cases) {
    test(name, () => {
      const st = M.statementFor(card, date);
      expect([st.closeDate, st.dueDate]).toEqual([close, due]);
      expect(st.key).toBe(close.slice(0, 7));
    });
  }
  test('fecha inválida -> null', () => {
    expect(M.statementFor(naranja, '2026-02-30')).toBeNull();
    expect(M.statementFor(naranja, 'x')).toBeNull();
  });
});

test.describe('installmentSchedule', () => {
  test('90.000 en 3 cuotas Naranja 15-oct: 30.000 x3, vencimientos consecutivos', () => {
    const s = M.installmentSchedule(naranja, { date: '2026-10-15', amount: 90000, mode: 'nowInst', installments: 3 });
    expect(s.map((q) => [q.n, q.dueDate, q.statementKey, q.amount])).toEqual([
      [1, '2026-11-10', '2026-10', 30000],
      [2, '2026-12-10', '2026-11', 30000],
      [3, '2027-01-10', '2026-12', 30000],
    ]);
  });
  test('100.000 en 3: 33.333,33 / 33.333,33 / 33.333,34 y suma exacta', () => {
    const s = M.installmentSchedule(naranja, { date: '2026-10-15', amount: 100000, mode: 'nowInst', installments: 3 });
    expect(s.map((q) => q.amount)).toEqual([33333.33, 33333.33, 33333.34]);
    expect(cents(s)).toBe(10000000);
  });
  test('suma exacta con muchos centavos (1000,01 en 7 cuotas)', () => {
    const s = M.installmentSchedule(galicia, { date: '2026-10-15', amount: 1000.01, mode: 'nowInst', installments: 7 });
    expect(s).toHaveLength(7);
    expect(cents(s)).toBe(100001);
  });
  test('compra tras el cierre arranca en el resumen siguiente; las cuotas cruzan el año', () => {
    const s = M.installmentSchedule(naranja, { date: '2026-11-27', amount: 60000, mode: 'nowInst', installments: 2 });
    expect(s.map((q) => q.dueDate)).toEqual(['2027-01-10', '2027-02-10']);
  });
  test('cuotas con cierre 31: febrero clampa, el resto vuelve al día', () => {
    const card = { closeDay: 31, dueDay: 10 };
    const s = M.installmentSchedule(card, { date: '2026-01-10', amount: 300, mode: 'nowInst', installments: 3 });
    expect(s.map((q) => q.statementKey)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(s.map((q) => q.dueDate)).toEqual(['2026-02-10', '2026-03-10', '2026-04-10']);
  });
  test('now1 es siempre 1 cuota', () => {
    const s = M.installmentSchedule(naranja, { date: '2026-10-15', amount: 50000, mode: 'now1', installments: 5 });
    expect(s).toHaveLength(1);
  });
});

test.describe('expenseSchedule', () => {
  test('now1 -> un gasto completo en el mes de compra', () => {
    expect(M.expenseSchedule({ date: '2026-10-15', amount: 50000, mode: 'now1' })).toEqual([{ month: '2026-10', amount: 50000 }]);
  });
  test('nowInst -> un gasto completo en el mes de compra', () => {
    expect(M.expenseSchedule({ date: '2026-10-15', amount: 90000, mode: 'nowInst', installments: 3 })).toEqual([{ month: '2026-10', amount: 90000 }]);
  });
  test('deferred 90.000 en 5 meses -> 18.000 por mes desde el mes de compra (cruza año)', () => {
    const e = M.expenseSchedule({ date: '2026-11-20', amount: 90000, mode: 'deferred', installments: 3, consumeMonths: 5 });
    expect(e).toEqual([
      { month: '2026-11', amount: 18000 }, { month: '2026-12', amount: 18000 }, { month: '2027-01', amount: 18000 },
      { month: '2027-02', amount: 18000 }, { month: '2027-03', amount: 18000 },
    ]);
  });
  test('deferred 100.000 en 3 meses: suma exacta, resto al último', () => {
    const e = M.expenseSchedule({ date: '2026-10-15', amount: 100000, mode: 'deferred', consumeMonths: 3 });
    expect(e.map((x) => x.amount)).toEqual([33333.33, 33333.33, 33333.34]);
    expect(cents(e)).toBe(10000000);
  });
  test('advance -> lista vacía (no es gasto)', () => {
    expect(M.expenseSchedule({ date: '2026-10-15', amount: 100000, mode: 'advance', installments: 2 })).toEqual([]);
  });
});

test.describe('chargeEffects (DoD 2-5)', () => {
  test('DoD2: now1 50.000 el 15-oct Naranja: gasto en octubre, cash el 10-nov', () => {
    const ch = { date: '2026-10-15', amount: 50000, mode: 'now1', installments: 1 };
    const fx = M.chargeEffects(naranja, ch);
    expect(fx.creditUsedDelta).toBe(50000);
    expect(fx.cashIn).toBeNull();
    expect(fx.expenses).toEqual([{ month: '2026-10', amount: 50000 }]);
    expect(fx.installments.map((q) => [q.dueDate, q.amount])).toEqual([['2026-11-10', 50000]]);
  });
  test('DoD3: deferred 90.000 / 5 meses / 3 cuotas: 18.000 x5 de gasto, cash 30.000 x3', () => {
    const fx = M.chargeEffects(naranja, { date: '2026-10-15', amount: 90000, mode: 'deferred', installments: 3, consumeMonths: 5 });
    expect(fx.creditUsedDelta).toBe(90000);
    expect(fx.expenses.map((e) => e.amount)).toEqual([18000, 18000, 18000, 18000, 18000]);
    expect(fx.expenses.map((e) => e.month)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
    expect(fx.installments.map((q) => q.amount)).toEqual([30000, 30000, 30000]);
  });
  test('DoD4: nowInst 90.000 / 3 cuotas: gasto completo en el mes, cash 30.000 x3', () => {
    const fx = M.chargeEffects(naranja, { date: '2026-10-15', amount: 90000, mode: 'nowInst', installments: 3 });
    expect(fx.creditUsedDelta).toBe(90000);
    expect(fx.expenses).toEqual([{ month: '2026-10', amount: 90000 }]);
    expect(fx.installments.map((q) => q.amount)).toEqual([30000, 30000, 30000]);
  });
  test('DoD5: advance 100.000 / 2 cuotas: entra a la cuenta, sin gasto, consume 100.000 de crédito', () => {
    const fx = M.chargeEffects(naranja, { date: '2026-10-15', amount: 100000, mode: 'advance', installments: 2, toAccountId: 'uala' });
    expect(fx.creditUsedDelta).toBe(100000);
    expect(fx.cashIn).toEqual({ accountId: 'uala', amount: 100000 });
    expect(fx.expenses).toEqual([]);
    expect(fx.installments.map((q) => q.amount)).toEqual([50000, 50000]);
  });
});

test.describe('dueTotals', () => {
  const charges = [
    { id: '1', cardId: 'n', date: '2026-10-15', amount: 90000, mode: 'nowInst', installments: 3 },
    { id: '2', cardId: 'n', date: '2026-10-16', amount: 50000, mode: 'now1' },
    { id: '3', cardId: 'm', date: '2026-10-16', amount: 777, mode: 'now1' },   // otra tarjeta
    { id: '4', cardId: 'n', date: '2026-10-16', amount: -5, mode: 'now1' },    // inválido, se ignora
  ];
  test('suma por vencimiento y respeta el rango (inclusive)', () => {
    expect(M.dueTotals(naranja, charges, '2026-11-01', '2026-12-31')).toEqual([
      { dueDate: '2026-11-10', statementKey: '2026-10', amount: 80000 },
      { dueDate: '2026-12-10', statementKey: '2026-11', amount: 30000 },
    ]);
    expect(M.dueTotals(naranja, charges, '2026-11-10', '2026-11-10')).toHaveLength(1);
  });
  test('rango vacío -> []', () => {
    expect(M.dueTotals(naranja, charges, '2030-01-01', '2030-12-31')).toEqual([]);
  });
});

test.describe('validateCharge', () => {
  const ok = { cardId: 'n', date: '2026-10-15', amount: 1000, mode: 'now1', installments: 1 };
  const err = (patch) => M.validateCharge({ ...ok, ...patch });
  test('válidos', () => {
    expect(M.validateCharge(ok)).toEqual({ ok: true, error: null });
    expect(err({ mode: 'nowInst', installments: 60 }).ok).toBe(true);
    expect(err({ mode: 'deferred', installments: 3, consumeMonths: 5 }).ok).toBe(true);
    expect(err({ mode: 'advance', installments: 2, toAccountId: 'uala' }).ok).toBe(true);
  });
  const bad = [
    ['monto 0', { amount: 0 }], ['monto negativo', { amount: -1 }], ['monto NaN', { amount: NaN }], ['monto string', { amount: '5' }],
    ['cuotas 0', { mode: 'nowInst', installments: 0 }], ['cuotas 61', { mode: 'nowInst', installments: 61 }],
    ['cuotas 2,5', { mode: 'nowInst', installments: 2.5 }], ['now1 con 3 cuotas', { installments: 3 }],
    ['deferred sin consumeMonths', { mode: 'deferred', installments: 2 }],
    ['deferred consumeMonths 0', { mode: 'deferred', consumeMonths: 0 }],
    ['deferred consumeMonths 61', { mode: 'deferred', consumeMonths: 61 }],
    ['deferred consumeMonths 1,5', { mode: 'deferred', consumeMonths: 1.5 }],
    ['modo inválido', { mode: 'otro' }], ['sin cardId', { cardId: '' }],
    ['fecha inexistente', { date: '2026-02-30' }], ['fecha vacía', { date: '' }],
    ['advance sin toAccountId', { mode: 'advance', installments: 2 }],
  ];
  for (const [name, patch] of bad) {
    test(`rechaza: ${name}`, () => {
      const r = err(patch);
      expect(r.ok).toBe(false);
      expect(r.error).toBeTruthy();
    });
  }
  test('cargo nulo', () => expect(M.validateCharge(null).ok).toBe(false));
});

test.describe('entradas hostiles: nunca lanzan, nunca basura', () => {
  const okCharge = { date: '2026-10-15', amount: 90000, mode: 'nowInst', installments: 3 };
  const noGarbage = (v) => expect(JSON.stringify(v)).not.toMatch(/NaN|null|Infinity|undefined/);
  const badCards = [
    ['null', null], ['undefined', undefined], ['{}', {}], ['solo dueDay', { dueDay: 10 }], ['solo closeDay', { closeDay: 10 }],
    ['closeDay 0', { closeDay: 0, dueDay: 10 }], ['closeDay 32', { closeDay: 32, dueDay: 10 }], ['closeDay -1', { closeDay: -1, dueDay: 10 }],
    ['closeDay 2,5', { closeDay: 2.5, dueDay: 10 }], ["closeDay '27'", { closeDay: '27', dueDay: 10 }], ['closeDay NaN', { closeDay: NaN, dueDay: 10 }],
    ["dueDay '10'", { closeDay: 27, dueDay: '10' }], ['dueDay 0', { closeDay: 27, dueDay: 0 }], ['string', 'x'],
  ];
  for (const [name, card] of badCards) {
    test(`tarjeta ${name}`, () => {
      expect(() => M.statementFor(card, '2026-10-15')).not.toThrow();
      expect(M.statementFor(card, '2026-10-15')).toBeNull();
      expect(M.installmentSchedule(card, okCharge)).toEqual([]);
      expect(M.chargeEffects(card, okCharge)).toBeNull();
      expect(M.dueTotals(card, [{ cardId: 'n', ...okCharge }], '2026-01-01', '2027-12-31')).toEqual([]);
      expect(M.validateCard(card).ok).toBe(false);
    });
  }
  test('statementFor: fecha basura -> null sin lanzar', () => {
    for (const d of [undefined, null, 5, {}, '2026-13-01', '0000-01-01', '12026-01-01']) expect(M.statementFor(naranja, d)).toBeNull();
  });
  const badCharges = [
    ['null', null], ['undefined', undefined], ['{}', {}], ['string', 'x'],
    ['fecha 2026-02-30', { ...okCharge, date: '2026-02-30' }], ['fecha vacía', { ...okCharge, date: '' }],
    ['monto Infinity', { ...okCharge, amount: Infinity }], ['monto NaN', { ...okCharge, amount: NaN }], ["monto '100'", { ...okCharge, amount: '100' }],
    ['monto 0', { ...okCharge, amount: 0 }], ['monto negativo', { ...okCharge, amount: -5 }], ['monto 1e308', { ...okCharge, amount: 1e308 }],
    ['cuotas 0', { ...okCharge, installments: 0 }], ['cuotas -1', { ...okCharge, installments: -1 }],
    ['cuotas 2,5', { ...okCharge, installments: 2.5 }], ['cuotas 61', { ...okCharge, installments: 61 }], ["cuotas '3'", { ...okCharge, installments: '3' }],
    ['modo inválido', { ...okCharge, mode: 'otro' }],
    ['deferred sin consumeMonths', { ...okCharge, mode: 'deferred' }], ['deferred consumeMonths 1,5', { ...okCharge, mode: 'deferred', consumeMonths: 1.5 }],
    ['deferred consumeMonths 0', { ...okCharge, mode: 'deferred', consumeMonths: 0 }],
  ];
  for (const [name, ch] of badCharges) {
    test(`cargo ${name}`, () => {
      expect(() => M.installmentSchedule(naranja, ch)).not.toThrow();
      expect(M.installmentSchedule(naranja, ch)).toEqual([]);
      expect(M.expenseSchedule(ch)).toEqual([]);
      expect(M.chargeEffects(naranja, ch)).toBeNull();
      expect(M.dueTotals(naranja, [ch], '2026-01-01', '2027-12-31')).toEqual([]);
    });
  }
  test('dueTotals: rango/lista basura -> []', () => {
    expect(M.dueTotals(naranja, null, '2026-01-01', '2027-12-31')).toEqual([]);
    expect(M.dueTotals(naranja, [null, undefined], '2026-01-01', '2027-12-31')).toEqual([]);
    expect(M.dueTotals(naranja, [{ cardId: 'n', ...okCharge }], 'x', '2027-12-31')).toEqual([]);
    expect(M.dueTotals(naranja, [{ cardId: 'n', ...okCharge }], '2026-01-01', undefined)).toEqual([]);
  });
  test('validateCard: válida y rechazos de id/name', () => {
    expect(M.validateCard(naranja)).toEqual({ ok: true, error: null });
    expect(M.validateCard({ ...naranja, closeDay: 31, dueDay: 1 }).ok).toBe(true);
    expect(M.validateCard({ ...naranja, id: '' }).ok).toBe(false);
    expect(M.validateCard({ ...naranja, name: '  ' }).ok).toBe(false);
    expect(M.validateCard({ ...naranja, name: 5 }).ok).toBe(false);
    expect(M.validateCard({ ...naranja, closeDay: 0 }).error).toBeTruthy();
  });
  test('los resultados válidos no contienen NaN/null en fechas ni montos', () => {
    noGarbage(M.installmentSchedule(naranja, okCharge));
    noGarbage(M.expenseSchedule({ ...okCharge, mode: 'deferred', consumeMonths: 4 }));
    noGarbage(M.chargeEffects(naranja, { ...okCharge, mode: 'now1', installments: 1 }).installments);
  });
  test('hallazgos originales', () => {
    expect(M.statementFor({ dueDay: 10 }, '2026-10-15')).toBeNull();
    expect(M.statementFor({ closeDay: 0, dueDay: 10 }, '2026-10-15')).toBeNull();
    expect(M.installmentSchedule(naranja, { ...okCharge, installments: 2.5 })).toEqual([]);
    expect(M.chargeEffects(naranja, { ...okCharge, amount: Infinity })).toBeNull();
    expect(M.expenseSchedule(null)).toEqual([]);
  });
});

test('carga como script clásico en el navegador (window.CMTarjetas) y calcula igual', async ({ cmPage }) => {
  const r = await cmPage.evaluate(() => {
    const st = window.CMTarjetas.statementFor({ closeDay: 27, dueDay: 10 }, '2026-10-27');
    return [st.closeDate, st.dueDate, typeof window.CMTarjetas.dueTotals];
  });
  expect(r).toEqual(['2026-11-27', '2026-12-10', 'function']);
});
