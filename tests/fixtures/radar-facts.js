// Fixtures INVENTADOS con la forma de "companyfacts" de la SEC (https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json).
// Ninguna cifra es de una empresa real. Montos en millones de USD escritos a mano (se multiplican por 1e6 al armar los hechos).
'use strict';

const M = 1e6;
const ent = (start, end, val, filed, form, fp) => Object.assign({ end, val, accn: '0000000000-00-000000', fy: Number(end.slice(0, 4)), fp: fp || 'FY', form: form || '10-K', filed }, start ? { start } : {});

// Arma { 'us-gaap': { Concepto: { units: { USD: [...] } } } }
function facts(tax, defs) {
  const out = { [tax]: {} };
  for (const [nombre, unidad, entradas] of defs) out[tax][nombre] = { label: nombre, units: { [unidad]: entradas } };
  return out;
}

// ── ACME TEST CORP (EE.UU., us-gaap, cierre 31/12). Años 2015–2025 + trimestres de 2025 y 2026 (Q1, Q2) ──
// Años (i = 0..10): ingresos 1.000 + 100·i, costo 60%, EBIT 20%, neto 15%, acciones 100 − i (millones), CFO 25%, capex 5%, D&A 5%.
// 2025: ingresos Q1 470 · Q2 490 · Q3 510 (9M = 1.470), año 2.000 → Q4 implícito 530. 2026: Q1 520, Q2 540.
// TTM a 30/06/2026 (Q3'25 + Q4'25 + Q1'26 + Q2'26): ingresos 510+530+520+540 = 2.100.
function acme() {
  const filedAnual = y => `${y + 1}-02-14`;
  const Y = [...Array(11)].map((_, i) => 2015 + i);
  const anual = (fn, filtro) => Y.map((y, i) => ent(`${y}-01-01`, `${y}-12-31`, fn(i, y) * M, filedAnual(y)));
  const inst = fn => Y.map((y, i) => ent(null, `${y}-12-31`, fn(i, y) * M, filedAnual(y)));
  const rev = i => 1000 + 100 * i;

  // 3M sueltos de 2025 (10-Q) y de 2026
  const q = (start, end, val, filed, fp) => ent(start, end, val * M, filed, '10-Q', fp);
  const ytd = q; // mismo formato: start = inicio del año fiscal, end = cierre del trimestre

  const revenueEntradas = anual(rev).map(e => e.end === '2023-12-31' ? [ent(e.start, e.end, 1790 * M, '2024-02-14'), ent(e.start, e.end, 1800 * M, '2025-02-14')] : [e]).flat(); // 2023: versión vieja (1.790) y restatada (1.800, más nueva)
  revenueEntradas.push(
    q('2025-01-01', '2025-03-31', 470, '2025-05-02', 'Q1'), q('2025-04-01', '2025-06-30', 490, '2025-08-01', 'Q2'), q('2025-07-01', '2025-09-30', 510, '2025-10-31', 'Q3'),
    q('2025-01-01', '2025-09-30', 1470, '2025-10-31', 'Q3'),
    q('2026-01-01', '2026-03-31', 520, '2026-05-01', 'Q1'), q('2026-04-01', '2026-06-30', 540, '2026-08-07', 'Q2'),
  );
  const costoEntradas = anual(i => 0.6 * rev(i)).concat([
    q('2025-07-01', '2025-09-30', 306, '2025-10-31', 'Q3'), q('2025-01-01', '2025-09-30', 882, '2025-10-31', 'Q3'),
    q('2026-01-01', '2026-03-31', 312, '2026-05-01', 'Q1'), q('2026-04-01', '2026-06-30', 324, '2026-08-07', 'Q2'),
    q('2025-04-01', '2025-06-30', 294, '2025-08-01', 'Q2'), q('2025-01-01', '2025-03-31', 282, '2025-05-02', 'Q1'),
  ]);
  const ebitEntradas = anual(i => 0.2 * rev(i)).concat([
    q('2025-01-01', '2025-03-31', 94, '2025-05-02', 'Q1'), q('2025-04-01', '2025-06-30', 98, '2025-08-01', 'Q2'), q('2025-07-01', '2025-09-30', 102, '2025-10-31', 'Q3'),
    q('2025-01-01', '2025-09-30', 294, '2025-10-31', 'Q3'),
    q('2026-01-01', '2026-03-31', 104, '2026-05-01', 'Q1'), q('2026-04-01', '2026-06-30', 108, '2026-08-07', 'Q2'),
  ]);
  const netoEntradas = anual(i => 0.15 * rev(i)).concat([
    q('2025-01-01', '2025-03-31', 70, '2025-05-02', 'Q1'), q('2025-04-01', '2025-06-30', 72, '2025-08-01', 'Q2'), q('2025-07-01', '2025-09-30', 76, '2025-10-31', 'Q3'),
    q('2025-01-01', '2025-09-30', 218, '2025-10-31', 'Q3'),
    q('2026-01-01', '2026-03-31', 78, '2026-05-01', 'Q1'), q('2026-04-01', '2026-06-30', 84, '2026-08-07', 'Q2'),
  ]);
  const epsEntradas = Y.map((y, i) => ent(`${y}-01-01`, `${y}-12-31`, Math.round(0.15 * rev(i) / (100 - i) * 100) / 100, filedAnual(y))).concat([
    ent('2025-01-01', '2025-03-31', 0.78, '2025-05-02', '10-Q', 'Q1'), ent('2025-04-01', '2025-06-30', 0.8, '2025-08-01', '10-Q', 'Q2'), ent('2025-07-01', '2025-09-30', 0.84, '2025-10-31', '10-Q', 'Q3'),
    ent('2025-01-01', '2025-09-30', 2.42, '2025-10-31', '10-Q', 'Q3'),
    ent('2026-01-01', '2026-03-31', 0.87, '2026-05-01', '10-Q', 'Q1'), ent('2026-04-01', '2026-06-30', 0.93, '2026-08-07', '10-Q', 'Q2'),
  ]);
  const accEntradas = Y.map((y, i) => ent(`${y}-01-01`, `${y}-12-31`, (100 - i) * M, filedAnual(y))).concat([
    ent('2026-01-01', '2026-03-31', 89 * M, '2026-05-01', '10-Q', 'Q1'), ent('2026-04-01', '2026-06-30', 88 * M, '2026-08-07', '10-Q', 'Q2'),
  ]);
  // Flujo de caja: en los 10-Q viene ACUMULADO en el año (3, 6 y 9 meses), nunca el trimestre suelto de Q2 ni Q3.
  const cfoEntradas = anual(i => 0.25 * rev(i)).concat([
    ytd('2025-01-01', '2025-03-31', 110, '2025-05-02', 'Q1'), ytd('2025-01-01', '2025-06-30', 235, '2025-08-01', 'Q2'), ytd('2025-01-01', '2025-09-30', 370, '2025-10-31', 'Q3'),
    ytd('2026-01-01', '2026-03-31', 120, '2026-05-01', 'Q1'), ytd('2026-01-01', '2026-06-30', 260, '2026-08-07', 'Q2'),
  ]);
  const capexEntradas = anual(i => 0.05 * rev(i)).concat([
    ytd('2025-01-01', '2025-03-31', 22, '2025-05-02', 'Q1'), ytd('2025-01-01', '2025-06-30', 46, '2025-08-01', 'Q2'), ytd('2025-01-01', '2025-09-30', 72, '2025-10-31', 'Q3'),
    ytd('2026-01-01', '2026-03-31', 24, '2026-05-01', 'Q1'), ytd('2026-01-01', '2026-06-30', 50, '2026-08-07', 'Q2'),
  ]);
  const daEntradas = anual(i => 0.05 * rev(i)).concat([
    ytd('2025-01-01', '2025-03-31', 24, '2025-05-02', 'Q1'), ytd('2025-01-01', '2025-06-30', 49, '2025-08-01', 'Q2'), ytd('2025-01-01', '2025-09-30', 75, '2025-10-31', 'Q3'),
    ytd('2026-01-01', '2026-03-31', 25, '2026-05-01', 'Q1'), ytd('2026-01-01', '2026-06-30', 51, '2026-08-07', 'Q2'),
  ]);
  const bal = (extraFn) => inst(extraFn);
  const balUlt = (val) => ent(null, '2026-06-30', val * M, '2026-08-07', '10-Q', 'Q2');

  const usGaap = facts('us-gaap', [
    ['RevenueFromContractWithCustomerExcludingAssessedTax', 'USD', revenueEntradas],
    ['CostOfRevenue', 'USD', costoEntradas],
    ['OperatingIncomeLoss', 'USD', ebitEntradas],
    ['NetIncomeLoss', 'USD', netoEntradas],
    ['EarningsPerShareDiluted', 'USD/shares', epsEntradas],
    ['WeightedAverageNumberOfDilutedSharesOutstanding', 'shares', accEntradas],
    ['NetCashProvidedByUsedInOperatingActivities', 'USD', cfoEntradas],
    ['PaymentsToAcquirePropertyPlantAndEquipment', 'USD', capexEntradas],
    ['DepreciationDepletionAndAmortization', 'USD', daEntradas],
    ['IncomeTaxExpenseBenefit', 'USD', anual(i => 0.2 * 0.2 * rev(i))],
    ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'USD', anual(i => 0.2 * rev(i))],
    ['CashAndCashEquivalentsAtCarryingValue', 'USD', bal(i => 200 + 20 * i).concat([balUlt(420)])],
    ['MarketableSecuritiesCurrent', 'USD', [balUlt(30)]],
    ['LongTermDebtNoncurrent', 'USD', bal(() => 500).concat([balUlt(500)])],
    ['DebtCurrent', 'USD', [balUlt(50)]],
    ['StockholdersEquity', 'USD', bal(i => 1000 + 100 * i).concat([balUlt(2100)])],
    ['Assets', 'USD', bal(i => 3000 + 100 * i).concat([balUlt(5000)])],
  ]);
  return { cik: 1234567, entityName: 'Acme Test Corp', facts: usGaap };
}

// ── NUBO TEST HOLDINGS (extranjera, 20-F, IFRS): solo anuales, sin trimestres, sin capex ni EBIT ──
function nubo() {
  const Y = [2020, 2021, 2022, 2023, 2024];
  const a = fn => Y.map((y, i) => ent(`${y}-01-01`, `${y}-12-31`, fn(i), `${y + 1}-04-20`, '20-F'));
  const inst = fn => Y.map((y, i) => ent(null, `${y}-12-31`, fn(i), `${y + 1}-04-20`, '20-F'));
  return {
    cik: 7654321, entityName: 'Nubo Test Holdings Ltd.',
    facts: facts('ifrs-full', [
      ['Revenue', 'USD', a(i => (1000 + 500 * i) * M)],
      ['ProfitLoss', 'USD', a(i => (100 + 80 * i) * M)],
      ['DilutedEarningsLossPerShare', 'USD/shares', a(i => Math.round((100 + 80 * i) / 1000 * 100) / 100)],
      ['AdjustedWeightedAverageShares', 'shares', a(() => 1000 * M)],
      ['CashFlowsFromUsedInOperatingActivities', 'USD', a(i => (300 + 100 * i) * M)],
      ['CashAndCashEquivalents', 'USD', inst(i => (500 + 100 * i) * M)],
      ['Borrowings', 'USD', inst(i => (200 + 50 * i) * M)],
      ['Equity', 'USD', inst(i => (900 + 200 * i) * M)],
      ['Assets', 'USD', inst(i => (4000 + 500 * i) * M)],
    ]),
  };
}

// company_tickers.json inventado
function companyTickers() {
  return { 0: { cik_str: 1234567, ticker: 'ACME', title: 'Acme Test Corp' }, 1: { cik_str: 7654321, ticker: 'NUBO', title: 'Nubo Test Holdings Ltd.' }, 2: { cik_str: 1111111, ticker: 'FOND', title: 'Fondo Test Trust' } };
}

module.exports = { ent, facts, acme, nubo, companyTickers, M };
