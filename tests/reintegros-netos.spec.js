// Reintegros: nunca son ingreso y restan del gasto de su compra, en su categoría y en los meses en que ese gasto cuenta
// (reintegros.js). Caso real: un bife de 84.282 con tarjeta diferida a diciembre, con reintegro del 20% que ya entró a la cuenta en noviembre.
'use strict';
const { test, expect } = require('./support/fixtures');
const { cerrarTarjetas } = require('./support/tarjetas-ui');
const RE = require('../reintegros.js');
const R = require('../reportes.js');

const BIFE = 84282, REINT = 16856.4, NETO = 67425.6;
const bife = (extra) => Object.assign({
  id: 'bife', cardId: 'nar', name: 'Bife', date: '2026-11-20', amount: BIFE, mode: 'deferred', consumeFrom: '2026-12', consumeMonths: 1,
  installments: 1, category: 'food', refund: { pct: 20, amount: REINT, accountId: 'uala', txnId: 'rf:bife' },
}, extra || {});
const reint = (origen, amount, extra) => Object.assign({ id: 'rf:' + origen, date: '2026-11-20', name: 'Reintegro', type: 'income', amount, currency: 'ARS', accountId: 'uala', category: '', refundOf: origen }, extra || {});

test.describe('reintegros.js (puro, Node)', () => {
  test('compra diferida a diciembre: todo el reintegro cae en diciembre, en su categoría', () => {
    const st = { transactions: [reint('bife', REINT)], cardCharges: [bife()] };
    expect(RE.porMes(st)).toEqual({ '2026-12': { total: REINT, porCategoria: { food: REINT } } });
    expect(RE.porMes(st, { soloExistentes: true })).toEqual({});   // el gasto de diciembre todavía no es un movimiento
  });

  test('compra en 3 meses: proporcional, centavos exactos, el resto en la última parte', () => {
    const ch = bife({ id: 'tv', amount: 100, consumeMonths: 3, consumeFrom: '2026-11', refund: undefined });   // partes de gasto 33,33 / 33,33 / 33,34
    const st = { transactions: [reint('tv', 10)], cardCharges: [ch] };
    const m = RE.porMes(st);
    const partes = RE.partes(st).map((p) => p.cents);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(1000);   // suma exacta: 10,00
    expect(Object.keys(m)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(partes).toEqual([333, 333, 334]);   // floor(1000 × 3333 / 10000) = 333 las dos primeras; el resto de centavos va a la última
  });

  test('reintegro huérfano: ni ingreso ni gasto', () => {
    const st = { transactions: [reint('no-existe', 500)], cardCharges: [] };
    expect(RE.porMes(st)).toEqual({});
    expect(RE.esIngreso(st.transactions[0])).toBe(false);
    expect(RE.esReintegro(st.transactions[0])).toBe(true);
  });

  test('gasto común: resta en el mes de su fecha y categoría', () => {
    const st = { transactions: [{ id: 'g1', type: 'expense', amount: 10000, currency: 'ARS', date: '2026-11-08', category: 'fun' }, reint('g1', 2500)], cardCharges: [] };
    expect(RE.delMes(st, '2026-11')).toEqual({ total: 2500, porCategoria: { fun: 2500 } });
  });

  test('compra cubierta por otro o adelanto: no es gasto, no resta nada', () => {
    const st = { transactions: [reint('c', 100)], cardCharges: [bife({ id: 'c', cover: { who: 'Ana' } })] };
    expect(RE.porMes(st)).toEqual({});
  });

  test('reportes: mismo número que finanzas (neto en el mes del gasto, no en el del reintegro)', () => {
    const NOV = R.repRango('mensual', '2026-11'), DIC = R.repRango('mensual', '2026-12');
    const d = { hoy: '2026-12-10', cardCharges: [bife()], transactions: [
      { id: 'cc:bife:2026-12', type: 'expense', amount: BIFE, currency: 'ARS', date: '2026-12-01', category: 'food', cardChargeId: 'bife', name: 'Bife' },
      reint('bife', REINT),
      { id: 'sueldo', type: 'income', amount: 100000, currency: 'ARS', date: '2026-11-05', category: 'salary' }] };
    const nov = R.repKpiEconomia(d, NOV, null), dic = R.repKpiEconomia(d, DIC, null);
    expect(nov.gastos.valor).toBe(0);            // el reintegro no resta en noviembre
    expect(dic.gastos.valor).toBe(NETO);         // 84282 - 16856,4
    expect(dic.gastos.porCategoria[0]).toMatchObject({ categoria: 'food', valor: NETO });
    expect(nov.tasaAhorro.ingresos).toBe(100000);   // y tampoco suma a los ingresos
  });
});

async function preparar(page) {
  await cerrarTarjetas(page);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ ch }) => {
    window.getActiveDate = () => '2026-11-23';
    S.accounts = [{ id: 'uala', name: 'Ualá', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' }];
    S.cards = [{ id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 0, payAccountId: 'uala' }];
    S.transactions = [{ id: 'sueldo', type: 'income', amount: 100000, currency: 'ARS', date: '2026-11-05', name: 'Sueldo', category: 'salary', accountId: 'uala' }];
    S.cardCharges = [ch]; S.cardPayments = []; S.moves = []; S.repartos = []; S.budgets = {};
    S.accounts[0].balance = 1000000;
    _addRefund(S.cardCharges[0], 'Bife', '2026-11-20');   // camino real del reintegro: ingreso con refundOf + sube la cuenta
    materializeCardExpenses();
  }, { ch: bife() });
}

test('bife: noviembre sin ingreso; diciembre neto en gasto, presupuesto y comprometido; la cuenta sube igual', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const r = await cmPage.evaluate(() => {
    const out = {};
    out.saldo = S.accounts[0].balance;
    out.reintegros = S.transactions.filter((t) => t.refundOf).length;
    out.flujoNov = dfMonthFlow('2026-11-23');
    out.comp = comprometidoDelMes('2026-12');
    out.spentDic = _spentMonth('2026-12');
    out.spentNov = _spentMonth('2026-11');
    txnActiveMonth = '2026-11'; renderActivity();
    out.sumIncNov = document.getElementById('txnSumIncome').textContent;
    renderMonthBalanceList();
    out.balList = document.getElementById('monthBalanceList').innerText;
    budgetActiveMonth = '2026-12'; renderBudget();
    out.budget = document.getElementById('budgetBody') ? document.getElementById('budgetBody').innerText : document.body.innerText;
    out.ingresoMes = CMReintegros.esIngreso(S.transactions.find((t) => t.refundOf));
    return out;
  });
  expect(r.reintegros).toBe(1);
  expect(r.saldo).toBeCloseTo(1000000 + REINT, 2);               // el saldo de la cuenta sí sube
  expect(r.flujoNov.income.total).toBe(100000);                  // el reintegro no es ingreso (solo el sueldo)
  expect(r.sumIncNov.replace(/\D/g, '')).toBe('100000');       // "+$ 100.000,00" sin el reintegro
  expect(r.balList).not.toMatch(/116[.,]?856/);                  // noviembre no cuenta ingreso de más
  expect(r.comp.gasto).toBeCloseTo(NETO, 2);                     // comprometido de diciembre, neto
  expect(r.comp.porCategoria.food).toBeCloseTo(NETO, 2);
  expect(r.spentDic).toBeCloseTo(NETO, 2);                       // presupuesto de diciembre, neto
  expect(r.spentNov).toBe(0);
  expect(r.balList).toMatch(/67[.,]?42[56]/);                       // diciembre: "Ya comprometido" neto
  expect(r.balList).not.toMatch(/84[.,]?282/);
  expect(r.budget).toMatch(/67[.,]?42[56]/);
  expect(r.ingresoMes).toBe(false);
  expect(consoleErrors).toEqual([]);
});

test('gasto común con reintegro del mismo mes: neto en gasto, categoría y totales; sin ingreso', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const r = await cmPage.evaluate(() => {
    S.cardCharges = []; S.transactions = S.transactions.filter((t) => t.id === 'sueldo');
    const g = { id: 'g1', date: '2026-11-10', name: 'Cena', type: 'expense', amount: 10000, currency: 'ARS', accountId: 'uala', category: 'food', refund: { pct: 25, amount: 2500, accountId: 'uala', txnId: '' } };
    S.transactions.unshift(g);
    _addRefund(g, 'Cena', '2026-11-10');
    txnActiveMonth = '2026-11'; renderActivity();
    const e = document.getElementById('txnSumExpense').textContent, i = document.getElementById('txnSumIncome').textContent;
    const flow = dfMonthFlow('2026-11-23');
    const objGasto = qobjLinkProgress('2026-11', { type: 'finance', metric: 'gasto', category: 'food', target: 10000 });
    const objTotal = qobjLinkProgress('2026-11', { type: 'finance', metric: 'gasto_total', target: 10000 });
    const objSuper = qobjLinkProgress('2026-11', { type: 'finance', metric: 'superavit', target: 100000 });
    const objIng = qobjLinkProgress('2026-11', { type: 'finance', metric: 'ingreso', target: 100000 });
    return { e, i, flow, spent: _spentMonth('2026-11'), objGasto, objTotal, objSuper, objIng, lista: document.getElementById('activityList').innerText };
  });
  expect(r.i.replace(/\D/g, '')).toBe('100000');   // solo el sueldo
  expect(r.e.replace(/\D/g, '')).toBe('7500');     // 10000 - 2500
  expect(r.flow.expense.total).toBe(7500);
  expect(r.flow.income.total).toBe(100000);
  expect(r.spent).toBe(7500);
  expect(r.objGasto.pct).toBe(75); expect(r.objTotal.pct).toBe(75);
  expect(r.objSuper.label).toMatch(/92[.,]?500/);    // 100000 - 7500: el reintegro no es ingreso
  expect(r.objIng.pct).toBe(100);                    // ingresos = solo el sueldo
  expect(r.lista).toMatch(/Reintegro/);              // el movimiento sigue en la lista, rotulado
  expect(consoleErrors).toEqual([]);
});

test('compra en 3 meses con reintegro: el presupuesto de cada mes resta su parte; historial mensual neto', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const r = await cmPage.evaluate(() => {
    S.transactions = S.transactions.filter((t) => t.id === 'sueldo');
    const ch = { id: 'tv', cardId: 'nar', name: 'TV', date: '2026-11-10', amount: 90000, mode: 'deferred', consumeFrom: '2026-11', consumeMonths: 3, installments: 3, category: 'fun', refund: { pct: 10, amount: 9000, accountId: 'uala', txnId: '' } };
    S.cardCharges = [ch];
    _addRefund(ch, 'TV', '2026-11-10');
    materializeCardExpenses();   // solo noviembre existe como movimiento
    renderMonthBalanceList();
    return { nov: _spentMonth('2026-11'), dic: _spentMonth('2026-12'), ene: _spentMonth('2027-01'), lista: document.getElementById('monthBalanceList').innerText,
      porMes: CMReintegros.porMes(S) };
  });
  expect(r.nov).toBe(27000);   // 30000 - 3000
  expect(r.dic).toBe(27000);
  expect(r.ene).toBe(27000);
  expect(r.porMes['2026-11'].total + r.porMes['2026-12'].total + r.porMes['2027-01'].total).toBeCloseTo(9000, 2);
  expect(r.lista).toMatch(/Gast: -ARS\s?27[.,]000/);   // historial mensual de noviembre neto
  expect(consoleErrors).toEqual([]);
});

test('reintegro huérfano: no es ingreso ni resta gasto en ninguna parte', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const r = await cmPage.evaluate(() => {
    S.cardCharges = []; S.transactions = S.transactions.filter((t) => t.id === 'sueldo');
    S.transactions.unshift({ id: 'rf:fantasma', date: '2026-11-15', name: 'Reintegro 20% · Fantasma', type: 'income', amount: 5000, currency: 'ARS', accountId: 'uala', category: '', refundOf: 'fantasma' });
    return { flow: dfMonthFlow('2026-11-23'), spent: _spentMonth('2026-11'), porMes: CMReintegros.porMes(S), avg: dfIncomeAverage('2026-12-05') };
  });
  expect(r.flow.income.total).toBe(100000);
  expect(r.flow.expense.total).toBe(0);
  expect(r.spent).toBe(0);
  expect(r.porMes).toEqual({});
  expect(consoleErrors).toEqual([]);
});
