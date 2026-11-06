// Radar v2 — capa de datos (tools/radar-job/{yahoo,historia,radar-datos}.js). Todo con datos INVENTADOS y red/disco falsos.
// Cubre: parseo de Yahoo con respuesta simulada, P/E TTM por trimestre, medias a 5/10/15 años con "desde", EPS negativo → n/s,
// ajuste por splits y que un archivo bueno nunca se pisa con uno vacío o con error.
'use strict';
const path = require('path');
const { test, expect } = require('./support/fixtures');
const Yahoo = require(path.join(__dirname, '..', 'tools', 'radar-job', 'yahoo.js'));
const Historia = require(path.join(__dirname, '..', 'tools', 'radar-job', 'historia.js'));
const Datos = require(path.join(__dirname, '..', 'tools', 'radar-job', 'radar-datos.js'));
const F = require('./fixtures/radar-facts.js');

const HOY = '2026-11-05';
const d = s => new Date(s + 'T00:00:00.000Z');

// Resumen de Yahoo INVENTADO (misma forma que quoteSummary de yahoo-finance2).
function resumenAcme(extra = {}) {
  return Object.assign({
    price: { regularMarketPrice: 120, regularMarketTime: d('2026-11-05'), currency: 'USD', longName: 'Acme Test Corp', marketCap: 12e9 },
    summaryDetail: { trailingPE: 24, forwardPE: 16, fiftyTwoWeekLow: 80, fiftyTwoWeekHigh: 130, allTimeHigh: 125, beta: 1.1 },
    defaultKeyStatistics: { trailingEps: 5, forwardEps: 7.5, enterpriseValue: 13e9, enterpriseToEbitda: 14, enterpriseToRevenue: 4, pegRatio: 1.2, shortPercentOfFloat: 0.02, shortRatio: 2.5, sharesShort: 1e6, dateShortInterest: d('2026-10-15'), heldPercentInsiders: 0.01 },
    financialData: { targetMeanPrice: 140, targetHighPrice: 170, targetLowPrice: 100, targetMedianPrice: 138, numberOfAnalystOpinions: 20, recommendationMean: 1.8, recommendationKey: 'buy', freeCashflow: 6e8, totalDebt: 2e9, totalCash: 1e9, ebitda: 9e8, grossMargins: 0.6, operatingMargins: 0.25, profitMargins: 0.2, ebitdaMargins: 0.3, returnOnEquity: 0.3, financialCurrency: 'USD' },
    earningsTrend: { trend: [
      { period: '0q', endDate: d('2026-12-31'), earningsEstimate: { avg: 1.5, low: 1.4, high: 1.6, numberOfAnalysts: 10, yearAgoEps: 1.3, growth: 0.15 }, revenueEstimate: { avg: 5e8, numberOfAnalysts: 9, yearAgoRevenue: 4.5e8, growth: 0.11 },
        epsTrend: { current: 1.5, '7daysAgo': 1.49, '30daysAgo': 1.45, '60daysAgo': 1.4, '90daysAgo': 1.3 }, epsRevisions: { upLast30days: 6, downLast30days: 1 } },
      { period: '0y', endDate: d('2026-12-31'), earningsEstimate: { avg: 6, yearAgoEps: 5, numberOfAnalysts: 12, growth: 0.2 }, revenueEstimate: { avg: 2e9, yearAgoRevenue: 1.8e9 }, epsTrend: { current: 6, '7daysAgo': 6, '30daysAgo': 5.8, '60daysAgo': 5.7, '90daysAgo': 5.5 } },
      { period: '+1y', endDate: d('2027-12-31'), earningsEstimate: { avg: 7.2, yearAgoEps: 6, numberOfAnalysts: 11, growth: 0.2 }, revenueEstimate: { avg: 2.2e9, yearAgoRevenue: 2e9 }, epsTrend: { current: 7.2, '7daysAgo': 7.2, '30daysAgo': 7.2, '60daysAgo': 7, '90daysAgo': 6.9 } },
    ] },
    earningsHistory: { history: [{ epsActual: 1.1, epsEstimate: 1.0, epsDifference: 0.1, surprisePercent: 0.1, quarter: d('2026-03-31') }, { epsActual: 1.3, epsEstimate: 1.2, epsDifference: 0.1, surprisePercent: 0.083, quarter: d('2026-06-30') }] },
    recommendationTrend: { trend: [{ period: '0m', strongBuy: 5, buy: 8, hold: 3, sell: 1, strongSell: 0 }] },
    insiderTransactions: { transactions: [{ startDate: d('2026-10-30'), filerName: 'PEREZ JUAN', filerRelation: 'CEO', shares: 1000, value: 120000, transactionText: 'Sale at price 120 per share.' }, { startDate: d('2026-09-01'), filerName: 'GOMEZ ANA', filerRelation: 'CFO', shares: 500, value: 55000, transactionText: 'Purchase' }] },
    netSharePurchaseActivity: { period: '6m', buyInfoCount: 2, buyInfoShares: 1500, sellInfoCount: 3, sellInfoShares: 4000, netInfoShares: -2500, netPercentInsiderShares: -0.01, netInstBuyingPercent: 0.02 },
    majorHoldersBreakdown: { institutionsPercentHeld: 0.8, institutionsFloatPercentHeld: 0.81, institutionsCount: 900 },
    institutionOwnership: { ownershipList: [{ organization: 'Fondo Uno', pctHeld: 0.08, position: 1e7, value: 1.2e9, pctChange: 0.01, reportDate: d('2026-06-30') }] },
    calendarEvents: { earnings: { earningsDate: [d('2026-10-20'), d('2027-01-27')], isEarningsDateEstimate: true } },
  }, extra);
}
const preciosInventados = [
  { fecha: '2020-01-02', high: 50, close: 48 }, { fecha: '2021-06-01', high: 130, close: 125 }, { fecha: '2022-06-01', high: 70, close: 60 },
  { fecha: '2026-11-04', high: 121, close: 119 }, { fecha: '2026-11-05', high: 122, close: 120 },
];

test.describe('radar v2: datos de mercado (Yahoo)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'cálculo puro: una sola vez'); });

  test('parsea la respuesta simulada de Yahoo: precio, ATH, distancia, peor caída, múltiplos y rango 52s', () => {
    const m = Yahoo.parsearMercado(resumenAcme(), { precios: preciosInventados }, { hoy: HOY });
    expect(m.precio).toEqual({ valor: 120, fuente: 'yahoo', fecha: '2026-11-05' });
    expect(m.ath.valor).toBe(130);                                   // máximo de los precios diarios, no el allTimeHigh del resumen
    expect(m.ath.ath_yahoo).toBe(125);
    expect(m.distancia_ath.valor).toBeCloseTo(120 / 130 - 1, 5);
    expect(m.drawdown_maximo.valor).toBeCloseTo(60 / 125 - 1, 5);    // pico 125 (2021) → valle 60 (2022)
    expect(m.drawdown_maximo).toMatchObject({ pico: '2021-06-01', valle: '2022-06-01' });
    expect(m.rango_52s.valor).toMatchObject({ min: 80, max: 130 });
    expect(m.rango_52s.valor.posicion).toBeCloseTo(0.8, 5);
    expect(m.pe_ttm.valor).toBe(24);
    expect(m.pe_forward.valor).toBe(20);                              // 120 / 6 (EPS estimado del año fiscal en curso)
    expect(m.pe_forward_siguiente.valor).toBeCloseTo(120 / 7.2, 3);
    expect(m.pe_forward_yahoo_api.valor).toBe(16);
    // NTM: cierre del año fiscal 31/12/2026, hoy 05/11/2026 → faltan 56 días → w = 56 / 365,25; EPS NTM = w · 6 + (1 − w) · 7,2
    const w = 56 / 365.25, epsNtm = w * 6 + (1 - w) * 7.2;
    expect(m.pe_forward_ntm.valor).toBeCloseTo(120 / epsNtm, 3);
    expect(m.pe_forward_ntm).toMatchObject({ eps_fy_actual: 6, eps_fy_siguiente: 7.2, fin_fy_actual: '2026-12-31' });
    expect(m.pe_forward_ntm.peso_fy_actual).toBeCloseTo(w, 3);
    expect(m.pe_forward_ntm.eps_ntm).toBeCloseTo(epsNtm, 3);
    expect(m.eps_forward_ntm.valor).toBeCloseTo(epsNtm, 3);                    // el forwardPE crudo de la API (usa otro año) queda aparte
    expect(m.eps_ttm_gaap.valor).toBe(5);
    expect(m.eps_forward.valor).toBe(6);
    expect(m.earnings_yield.valor).toBeCloseTo(5 / 120, 5);
    expect(m.ev_ebitda.valor).toBe(14);
    for (const k of ['fcf', 'p_fcf', 'fcf_yield', 'peg']) expect(m[k]).toBeUndefined();   // el FCF «levered» y el PEG de la API de Yahoo no se publican: la ficha calcula los suyos
    expect(m.ultimo_trimestre_yahoo).toBeNull();                       // el resumen inventado no trae mostRecentQuarter: no se inventa
    expect(m.deuda_neta.valor).toBe(1e9);
    expect(m.beta.valor).toBe(1.1);
    for (const k of ['precio', 'pe_ttm', 'eps_forward', 'ev', 'insiders']) expect(m[k].fuente).toBe('yahoo');
  });

  test('consenso: estimaciones, CAGR de EPS a 2 años, revisiones 7/30/60/90, sorpresa, objetivo, recomendaciones', () => {
    const m = Yahoo.parsearMercado(resumenAcme(), { precios: preciosInventados }, { hoy: HOY });
    expect(m.estimaciones.valor.anio_proximo.eps).toMatchObject({ promedio: 7.2, hace_un_anio: 6 });
    expect(m.estimaciones.valor.trimestre_actual.ventas.promedio).toBe(5e8);
    expect(m.eps_cagr_2a.valor).toBeCloseTo(Math.sqrt(7.2 / 5) - 1, 5);      // base = último año informado (5) → estimación del año siguiente (7,2)
    expect(m.eps_cagr_2a).toMatchObject({ eps_base: 5, eps_final: 7.2 });
    expect(m.eps_crecimiento_1a_consenso.valor).toBeCloseTo(7.2 / 6 - 1, 5);
    const r = m.revisiones_eps.valor.trimestre_actual;
    expect(r).toMatchObject({ actual: 1.5, hace_7d: 1.49, hace_30d: 1.45, hace_60d: 1.4, hace_90d: 1.3, analistas_al_alza_30d: 6, analistas_a_la_baja_30d: 1 });
    expect(r.variacion_90d).toBeCloseTo(1.5 / 1.3 - 1, 5);
    expect(m.sorpresa_ultimo_trimestre.valor).toMatchObject({ trimestre: '2026-06-30', eps_real: 1.3, eps_estimado: 1.2, ingresos: null });
    expect(m.precio_objetivo.valor).toMatchObject({ promedio: 140, alto: 170, bajo: 100, analistas: 20 });
    expect(m.precio_objetivo.valor.potencial).toBeCloseTo(140 / 120 - 1, 5);
    expect(m.recomendaciones.valor).toMatchObject({ compra_fuerte: 5, compra: 8, mantener: 3, venta: 1, venta_fuerte: 0, media: 1.8 });
  });

  test('insiders, institucionales, short interest y próxima fecha de resultados (la primera fecha futura)', () => {
    const m = Yahoo.parsearMercado(resumenAcme(), { precios: preciosInventados }, { hoy: HOY });
    expect(m.insiders.valor.transacciones_recientes[0]).toMatchObject({ fecha: '2026-10-30', nombre: 'PEREZ JUAN', acciones: 1000 });
    expect(m.insiders.valor).toMatchObject({ compras_n: 2, ventas_n: 3, neto_acciones: -2500 });
    expect(m.institucional.valor).toMatchObject({ pct: 0.8, cantidad: 900 });
    expect(m.institucional.valor.principales[0]).toMatchObject({ nombre: 'Fondo Uno', pct: 0.08, fecha_reporte: '2026-06-30' });
    expect(m.short_interest.valor).toMatchObject({ pct_float: 0.02, dias_para_cubrir: 2.5 });
    expect(m.short_interest.fecha).toBe('2026-10-15');
    expect(m.proximos_resultados.valor).toEqual({ fecha: '2027-01-27', estimada: true });
  });

  test('EPS negativo o cero: el P/E no se calcula y queda null con motivo "n/s"; CAGR con base negativa también', () => {
    const r = resumenAcme();
    r.defaultKeyStatistics.trailingEps = -0.4; r.summaryDetail.trailingPE = undefined;
    r.earningsTrend.trend[1].earningsEstimate.yearAgoEps = -0.4;
    const m = Yahoo.parsearMercado(r, { precios: preciosInventados }, { hoy: HOY });
    expect(m.pe_ttm).toMatchObject({ valor: null, motivo: 'n/s' });
    expect(m.earnings_yield).toMatchObject({ valor: null, motivo: 'n/s' });
    expect(m.eps_cagr_2a).toMatchObject({ valor: null, motivo: 'n/s' });
    const cero = resumenAcme(); cero.defaultKeyStatistics.trailingEps = 0; cero.summaryDetail.trailingPE = 9999;
    expect(Yahoo.parsearMercado(cero, { precios: preciosInventados }, { hoy: HOY }).pe_ttm).toMatchObject({ valor: null, motivo: 'n/s' });
  });

  test('empresa financiera: EV, EBITDA, FCF y deuda neta quedan en null con motivo "no aplica"; el P/E sigue', () => {
    const m = Yahoo.parsearMercado(resumenAcme(), { precios: preciosInventados }, { hoy: HOY, financiera: true });
    for (const k of ['ev', 'ebitda', 'ev_ebitda', 'ev_ventas', 'deuda_neta']) expect(m[k]).toMatchObject({ valor: null, motivo: 'no aplica (financiera)' });
    expect(m.pe_ttm.valor).toBe(24);
  });

  test('campos que Yahoo no trae quedan null (sin reventar) y la fecha basura de 1970 se descarta', () => {
    const m = Yahoo.parsearMercado({ price: { regularMarketPrice: 10 }, defaultKeyStatistics: { dateShortInterest: d('1970-08-03') } }, { precios: [] }, { hoy: HOY });
    expect(m.precio.valor).toBe(10);
    expect(m.ath.valor).toBeNull();                                  // sin historia de precios no se inventa un ATH
    expect(m.pe_ttm.valor).toBeNull();
    expect(m.insiders.valor).toBeNull();
    expect(m.proximos_resultados.valor).toBeNull();
    expect(Yahoo.iso(d('1970-08-03'))).toBeNull();
  });
});

// ───────────────────────── historia ─────────────────────────
// Trimestres inventados: EPS diluido 1,00 por trimestre en 2018–2026 (32 trimestres), precio de cierre = 20 × EPS TTM → P/E TTM 20.
const finTrim = (i) => { const y = 2018 + Math.floor(i / 4), m = ['03-31', '06-30', '09-30', '12-31'][i % 4]; return `${y}-${m}`; };
const trimestres = (n, epsFn = () => 1) => [...Array(n)].map((_, i) => ({ fin: finTrim(i), fuente: 'sec', eps_diluido: epsFn(i) }));
const preciosFlat = (n, px) => [...Array(n)].map((_, i) => ({ fecha: finTrim(i), high: px(i), close: px(i) }));

test.describe('radar v2: historia, P/E TTM y medias', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'cálculo puro: una sola vez'); });

  test('P/E TTM por trimestre = precio de cierre / suma de los 4 EPS diluidos; los 3 primeros no tienen TTM', () => {
    const qs = Historia.agregarValuacion(trimestres(8), preciosFlat(8, () => 80));
    expect(qs.slice(0, 3).map(q => q.pe_ttm)).toEqual([null, null, null]);
    expect(qs[0].pe_motivo).toBe('sin EPS TTM');
    expect(qs[3]).toMatchObject({ eps_ttm: 4, precio_cierre: 80, pe_ttm: 20 });
    expect(qs[7].pe_ttm).toBe(20);
  });

  test('EPS TTM negativo o casi cero → P/E null con motivo "n/s", nunca un número absurdo', () => {
    const qs = Historia.agregarValuacion(trimestres(8, i => (i < 4 ? -0.5 : 0.00001)), preciosFlat(8, () => 50));
    expect(qs[3]).toMatchObject({ pe_ttm: null, pe_motivo: 'n/s' });   // TTM = −2
    expect(qs[7]).toMatchObject({ pe_ttm: null, pe_motivo: 'n/s' });   // TTM = 0,00004 → P/E de 1,25 millones
  });

  test('si falta un trimestre en el medio no se arma un TTM interpolado', () => {
    const qs = trimestres(8); qs.splice(5, 1);
    Historia.agregarValuacion(qs, preciosFlat(8, () => 80));
    expect(qs[4].pe_ttm).toBe(20);                                       // 4 trimestres seguidos (1 a 4)
    expect(qs.slice(5).every(q => q.pe_ttm === null)).toBe(true);        // toda ventana que cruza el hueco queda en null
  });

  test('medias a 5/10/15 años: con 32 trimestres (8 años) la de 5 es completa y las de 10 y 15 salen "desde" el primer dato', () => {
    const qs = Historia.agregarValuacion(trimestres(32, () => 1), preciosFlat(32, i => 60 + (i % 2 ? 40 : 0)));
    // precios alternan 60/100 contra EPS TTM 4 → P/E 15 y 25; promedio 20
    const m = Historia.mediasPE(qs, {});
    expect(m['5y']).toMatchObject({ completo: true });
    expect(m['5y'].valor).toBeGreaterThan(19); expect(m['5y'].valor).toBeLessThan(21);
    expect(m['5y'].trimestres).toBe(20);                               // ventana de 5 años = 20 trimestres (2021T1 a 2025T4)
    expect(m['10y']).toMatchObject({ completo: false, desde: '2018-12-31' });
    expect(m['10y'].nota).toBe('datos desde 2018-03-31');
    expect(m['15y'].completo).toBe(false);
    expect(m['10y'].trimestres).toBe(29);                              // todos los que hay con TTM (32 − 3)
  });

  test('empresa que cotiza hace poco: la nota dice "desde la salida a bolsa" y los trimestres con EPS negativo se cuentan aparte', () => {
    const qs = Historia.agregarValuacion(trimestres(32, i => (i < 12 ? -0.2 : 1)), preciosFlat(32, () => 80));
    const m = Historia.mediasPE(qs, { cotizaDesde: '2018-02-01' });
    expect(m['10y'].nota).toBe('desde la salida a bolsa (2018-02-01)');
    expect(m['10y'].trimestres_n_s).toBeGreaterThan(0);
    expect(m['10y'].desde > '2018-03-31').toBe(true);                  // los n/s no entran en la media
  });

  test('menos de 4 trimestres significativos → la media es null (no se promedia ruido)', () => {
    const qs = Historia.agregarValuacion(trimestres(6, () => 1), preciosFlat(6, () => 80));
    expect(Historia.mediasPE(qs, {})['5y'].valor).toBeNull();
  });

  test('splits: el EPS presentado antes del split se divide por el factor; el presentado después, no', () => {
    const splits = [{ fecha: '2024-06-10', factor: 10 }, { fecha: '2021-07-20', factor: 4 }];
    expect(Historia.factorSplits(splits, '2020-01-10')).toBe(40);
    expect(Historia.factorSplits(splits, '2022-01-10')).toBe(10);
    expect(Historia.factorSplits(splits, '2025-01-10')).toBe(1);
  });

  test('serieSec con un companyfacts inventado: trimestres con Q4 derivado, FCF = flujo − capex, balance y precio de cierre', () => {
    const q = Historia.serieSec(F.acme(), []);
    const q4 = q.find(x => x.fin === '2025-12-31');
    expect(q4).toMatchObject({ fuente: 'sec', ingresos: 530 * F.M, derivado_q4: true });
    const q2 = q.find(x => x.fin === '2026-06-30');
    expect(q2).toMatchObject({ ingresos: 540 * F.M, cfo: 140 * F.M, capex: 26 * F.M, fcf: 114 * F.M, caja: 450 * F.M, deuda: 550 * F.M });
    expect(q2.eps_diluido).toBeGreaterThan(0);
    const conPrecio = Historia.agregarValuacion(q, [{ fecha: '2026-06-30', high: 40, close: 40 }]);
    expect(conPrecio.find(x => x.fin === '2026-06-30').precio_cierre).toBe(40);
  });

  test('EPS que la SEC no trae (XBRL con dimensión, ej. acciones de varias clases): se completa con Yahoo, queda anotado y alcanza para el EPS TTM', () => {
    const cf = F.acme();
    delete cf.facts['us-gaap'].EarningsPerShareDiluted; delete cf.facts['us-gaap'].WeightedAverageNumberOfDilutedSharesOutstanding;
    const sec = Historia.serieSec(cf, []);
    expect(Historia.faltaEps(sec)).toBe(true);
    const filas = ['2025-09-30', '2025-12-31', '2026-03-31', '2026-06-30'].map((f, i) => ({ date: d(f), periodType: '3M', dilutedEPS: 1 + i * 0.1, basicEPS: 1.01 + i * 0.1, dilutedAverageShares: 1e8 }));
    const h = Historia.construirHistoria({ ticker: 'ACME', cf, yahooFilas: filas, hist: { precios: [{ fecha: '2026-06-30', high: 60, close: 60 }], splits: [] }, cotizaDesde: null, hoy: HOY });
    const ult = h.trimestres.at(-1);
    expect(ult).toMatchObject({ fin: '2026-06-30', fuente: 'sec', eps_diluido: 1.3, ingresos: 540 * F.M });
    expect(ult.campos_yahoo).toEqual(['eps_basico', 'eps_diluido', 'acciones_diluidas']);
    expect(ult.eps_ttm).toBeCloseTo(1 + 1.1 + 1.2 + 1.3, 6);
    expect(ult.pe_ttm).toBeCloseTo(60 / 4.6, 1);
  });

  test('emisor anual (20-F): además de los trimestres de Yahoo, pe_anual da el P/E de cada cierre de año con el EPS de la SEC; sin precio o EPS ≤ 0 → null con motivo', () => {
    const h = Historia.construirHistoria({ ticker: 'NUBO', cf: F.nubo(), yahooFilas: [], hist: { precios: [{ fecha: '2023-12-29', high: 9, close: 9 }, { fecha: '2024-12-31', high: 12, close: 12 }], splits: [] }, cotizaDesde: null, hoy: HOY });
    expect(h.trimestres).toEqual([]);
    const por = Object.fromEntries(h.pe_anual.map(x => [x.fin, x]));
    expect(por['2024-12-31']).toMatchObject({ eps: 0.42, precio_cierre: 12 });   // fixture: utilidad (100 + 80·4) / 1.000 millones de acciones
    expect(por['2024-12-31'].pe).toBeCloseTo(12 / 0.42, 1);
    expect(por['2020-12-31']).toMatchObject({ pe: null, motivo: 'sin precio' });
  });

  test('emisor sin trimestres en la SEC (solo anual): construirHistoria usa los de Yahoo y deja la serie anual y una nota', () => {
    const filas = [
      { date: d('2025-12-31'), periodType: '3M', totalRevenue: 100, dilutedEPS: 0.1, basicEPS: 0.11, operatingCashFlow: 30, capitalExpenditure: -5 },
      { date: d('2026-03-31'), periodType: '3M', totalRevenue: 110, dilutedEPS: 0.12, basicEPS: 0.13, operatingCashFlow: 33, capitalExpenditure: -6 },
      { date: d('2026-06-30'), periodType: '12M', totalRevenue: 999 },
    ];
    const h = Historia.construirHistoria({ ticker: 'NUBO', cf: F.nubo(), yahooFilas: filas, hist: { precios: [{ fecha: '2026-03-31', high: 5, close: 5 }], splits: [] }, cotizaDesde: null, hoy: HOY });
    expect(h.fuente_trimestres).toBe('yahoo');
    expect(h.trimestres.map(x => x.fin)).toEqual(['2025-12-31', '2026-03-31']);       // la fila de 12M no es un trimestre
    expect(h.trimestres[1]).toMatchObject({ capex: 6, fcf: 27, eps_diluido: 0.12 });
    expect(h.anual_sec).toBeTruthy();
    expect(h.notas.join(' ')).toContain('20-F');
  });
});

// ───────────────────────── job: nunca pisar un archivo bueno ─────────────────────────
function entorno({ archivos = [], yahoo, sec } = {}) {
  const fs = new Map(archivos);
  const pedidos = [];
  const config = { v: 1, empresas: [{ ticker: 'ACME', nombre: 'Acme', financiera: false, cotiza_desde: null }, { ticker: 'NUBO', nombre: 'Nubo', financiera: true, cotiza_desde: '2021-12-09' }] };
  const yahooOk = {
    // El año fiscal en curso ya cerró (31/12/2025): el EPS NTM no depende del día, así que «mismos datos otro día» sigue sin reescribir nada.
    resumen: async () => { const r = resumenAcme(); r.earningsTrend.trend[1].endDate = d('2025-12-31'); return r; },
    precios: async () => ({ precios: [{ fecha: '2025-12-31', high: 60, close: 60 }, { fecha: '2026-03-31', high: 70, close: 70 }, { fecha: '2026-06-30', high: 80, close: 80 }, { fecha: '2026-11-05', high: 130, close: 120 }], splits: [] }),
    trimestralesYahoo: async () => [
      { date: d('2025-12-31'), periodType: '3M', totalRevenue: 100, dilutedEPS: 0.1 }, { date: d('2026-03-31'), periodType: '3M', totalRevenue: 110, dilutedEPS: 0.12 },
    ],
  };
  const fetchJson = sec || (async (url) => {
    pedidos.push(url);
    if (url.includes('company_tickers')) return { status: 200, json: F.companyTickers() };
    if (url.includes('CIK0001234567')) return { status: 200, json: F.acme() };
    if (url.includes('CIK0007654321')) return { status: 200, json: F.nubo() };
    return { status: 404, json: null };
  });
  return {
    fs, pedidos,
    args: { config, yahoo: yahoo || yahooOk, fetchJson, leer: n => (fs.has(n) ? fs.get(n) : null), escribir: (n, t) => fs.set(n, t), hoy: HOY, pausaYahooMs: 0, pausaSecMs: 0, log: () => {} },
  };
}

test.describe('radar v2: el job no pisa archivos buenos', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'job con IO falsa: una sola vez'); });

  test('corrida completa: escribe mercado-<T>.json y historia-<T>.json por empresa, sin tickers fijos en el código', async () => {
    const e = entorno();
    const r = await Datos.procesar(e.args);
    expect(r.mercado).toEqual({ ACME: 'ok', NUBO: 'ok' });
    expect(r.historia).toEqual({ ACME: 'ok', NUBO: 'ok' });
    const m = JSON.parse(e.fs.get('mercado-ACME.json'));
    expect(m).toMatchObject({ ticker: 'ACME', generado: HOY });
    expect(m.precio.valor).toBe(120);
    expect(JSON.parse(e.fs.get('mercado-NUBO.json')).ev_ebitda.motivo).toBe('no aplica (financiera)');   // la bandera sale de la config
    const h = JSON.parse(e.fs.get('historia-ACME.json'));
    expect(h.fuente_trimestres).toBe('sec');
    expect(h.trimestres.at(-1)).toMatchObject({ fin: '2026-06-30', precio_cierre: 80 });
  });

  test('segunda corrida del mismo día con los mismos datos: no reescribe nada (sin commits vacíos)', async () => {
    const e = entorno();
    await Datos.procesar(e.args);
    const r = await Datos.procesar(e.args);
    expect(r.mercado).toEqual({ ACME: 'sin_cambios', NUBO: 'sin_cambios' });
    expect(r.historia).toEqual({ ACME: 'sin_cambios', NUBO: 'sin_cambios' });
  });

  test('corrida de OTRO día con los mismos datos: solo cambió la fecha de corrida, no reescribe nada', async () => {
    const e = entorno();
    await Datos.procesar(e.args);
    const antes = new Map(e.fs);
    const r = await Datos.procesar(Object.assign({}, e.args, { hoy: '2026-11-06' }));
    expect(r.mercado).toEqual({ ACME: 'sin_cambios', NUBO: 'sin_cambios' });
    expect(r.historia).toEqual({ ACME: 'sin_cambios', NUBO: 'sin_cambios' });
    expect([...e.fs]).toEqual([...antes]);                       // ni un byte distinto
  });

  test('otro día Y un dato que cambió de verdad: sí reescribe', async () => {
    const e = entorno();
    await Datos.procesar(e.args);
    const otroPrecio = { resumen: async () => resumenAcme({ price: { regularMarketPrice: 125, regularMarketTime: d('2026-11-06'), currency: 'USD', longName: 'Acme Test Corp', marketCap: 12e9 } }), precios: async () => ({ precios: preciosInventados, splits: [] }), trimestralesYahoo: async () => [] };
    const r = await Datos.procesar(Object.assign({}, e.args, { yahoo: otroPrecio, hoy: '2026-11-06' }));
    expect(r.mercado.ACME).toBe('ok');
    expect(JSON.parse(e.fs.get('mercado-ACME.json')).precio.valor).toBe(125);
  });

  test('Yahoo caído: se conserva el archivo anterior intacto salvo stale_since y ultimo_error', async () => {
    const e = entorno();
    await Datos.procesar(e.args);
    const bueno = JSON.parse(e.fs.get('mercado-ACME.json'));
    const caido = { resumen: async () => { throw new Error('429 Too Many Requests'); }, precios: async () => { throw new Error('429'); }, trimestralesYahoo: async () => { throw new Error('429'); } };
    const r = await Datos.procesar(Object.assign({}, e.args, { yahoo: caido, hoy: '2026-11-06' }));
    expect(r.mercado.ACME).toBe('stale');
    expect(r.historia.ACME).toBe('stale');
    const ahora = JSON.parse(e.fs.get('mercado-ACME.json'));
    expect(ahora.stale_since).toBe('2026-11-06');
    expect(ahora.ultimo_error).toContain('429');
    const { stale_since, ultimo_error, ...resto } = ahora;
    expect(resto).toEqual(bueno);
    // y cuando Yahoo vuelve, la marca desaparece
    await Datos.procesar(Object.assign({}, e.args, { hoy: '2026-11-09' }));
    expect(JSON.parse(e.fs.get('mercado-ACME.json')).stale_since).toBeUndefined();
  });

  test('stale_since conserva la fecha de la PRIMERA falla aunque falle varios días seguidos', async () => {
    const e = entorno();
    await Datos.procesar(e.args);
    const caido = { resumen: async () => { throw new Error('boom'); }, precios: async () => { throw new Error('boom'); }, trimestralesYahoo: async () => [] };
    await Datos.procesar(Object.assign({}, e.args, { yahoo: caido, hoy: '2026-11-06' }));
    await Datos.procesar(Object.assign({}, e.args, { yahoo: caido, hoy: '2026-11-07' }));
    expect(JSON.parse(e.fs.get('mercado-ACME.json')).stale_since).toBe('2026-11-06');
  });

  test('respuesta vacía de Yahoo (sin precio): no pisa el archivo bueno', async () => {
    const e = entorno();
    await Datos.procesar(e.args);
    const antes = JSON.parse(e.fs.get('mercado-ACME.json'));
    const vacio = { resumen: async () => ({}), precios: async () => ({ precios: [], splits: [] }), trimestralesYahoo: async () => [] };
    const r = await Datos.procesar(Object.assign({}, e.args, { yahoo: vacio, hoy: '2026-11-06' }));
    expect(r.mercado.ACME).toBe('stale');
    expect(JSON.parse(e.fs.get('mercado-ACME.json')).precio).toEqual(antes.precio);
  });

  test('SEC caída: la historia anterior se conserva (stale) pero el mercado de Yahoo se actualiza igual', async () => {
    const e = entorno();
    await Datos.procesar(e.args);
    const sinSec = async () => { throw new Error('HTTP 503'); };
    const r = await Datos.procesar(Object.assign({}, e.args, { fetchJson: sinSec, hoy: '2026-11-06' }));
    expect(r.historia).toEqual({ ACME: 'stale', NUBO: 'stale' });
    expect(r.mercado.ACME).toBe('sin_cambios');              // Yahoo sí corrió (no quedó stale); los datos eran los mismos y solo cambió el día
    expect(JSON.parse(e.fs.get('historia-ACME.json')).stale_since).toBe('2026-11-06');
  });

  test('si la SEC devuelve 404 para una empresa con historia buena de la SEC, no se la reemplaza por una serie más corta', async () => {
    const e = entorno();
    await Datos.procesar(e.args);
    const antes = JSON.parse(e.fs.get('historia-ACME.json'));
    const r = await Datos.procesar(Object.assign({}, e.args, { fetchJson: async (u) => (u.includes('company_tickers') ? { status: 200, json: F.companyTickers() } : { status: 404, json: null }), hoy: '2026-11-06' }));
    expect(r.historia.ACME).toBe('stale');
    expect(JSON.parse(e.fs.get('historia-ACME.json')).trimestres).toEqual(antes.trimestres);
  });

  test('sin archivo previo y sin datos: no crea archivos vacíos', async () => {
    const e = entorno({ yahoo: { resumen: async () => { throw new Error('x'); }, precios: async () => { throw new Error('x'); }, trimestralesYahoo: async () => [] } });
    const r = await Datos.procesar(e.args);
    expect(r.mercado).toEqual({ ACME: 'vacio', NUBO: 'vacio' });
    expect([...e.fs.keys()]).toEqual([]);
  });

  test('--tickers y --solo: procesa solo lo pedido', async () => {
    const e = entorno();
    const r = await Datos.procesar(Object.assign({}, e.args, { tickers: ['NUBO'], solo: 'mercado' }));
    expect(r).toEqual({ mercado: { NUBO: 'ok' }, historia: {} });
    expect([...e.fs.keys()]).toEqual(['mercado-NUBO.json']);
  });
});

// ───────────────────────── R7: P/E forward NTM, insumos de retorno, Q4 derivado, pares ─────────────────────────
test.describe('radar v2 (R7): P/E forward de los próximos 12 meses (NTM)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'cálculo puro: una sola vez'); });

  test('ponderación por los meses que faltan para cerrar el año fiscal: w = días / 365,25, EPS NTM = w · FY0 + (1 − w) · FY1', () => {
    // hoy 05/11/2026; EPS del año fiscal en curso 6, del siguiente 7,2
    const caso = (fin0) => Yahoo.epsNtm(fin0, '2026-11-05', 6, 7.2);
    const dic = caso('2026-12-31');                         // cierre en 56 días → casi todo el NTM es el año siguiente
    expect(dic.w).toBeCloseTo(56 / 365.25, 3); expect(dic.eps).toBeCloseTo(56 / 365.25 * 6 + (1 - 56 / 365.25) * 7.2, 6); expect(dic.cerrado).toBe(false);
    const jun = caso('2027-06-30');                         // cierre en 237 días (~7,8 meses) → mayoría del año en curso
    expect(jun.w).toBeCloseTo(237 / 365.25, 3); expect(jun.eps).toBeCloseTo(237 / 365.25 * 6 + (1 - 237 / 365.25) * 7.2, 6);
    const sep = caso('2027-09-30');                         // cierre en 329 días (~10,8 meses)
    expect(sep.eps).toBeCloseTo(329 / 365.25 * 6 + (1 - 329 / 365.25) * 7.2, 6);
    expect(sep.eps).toBeLessThan(jun.eps); expect(jun.eps).toBeLessThan(dic.eps);   // mientras más lejos el cierre, más pesa el EPS del año en curso (el menor)
    const lejos = caso('2028-11-05');                       // más de 12 meses: w topa en 1 (solo el año en curso)
    expect(lejos.w).toBe(1); expect(lejos.eps).toBe(6);
    const cerrado = caso('2026-09-30');                     // el año en curso ya cerró (Yahoo todavía no lo rodó): w = 0, EPS del año siguiente, y lo marca
    expect(cerrado).toMatchObject({ w: 0, eps: 7.2, cerrado: true });
  });
  test('faltan estimaciones o la fecha de cierre: sin EPS NTM (no se inventa); w = 0 no necesita el EPS del año en curso', () => {
    expect(Yahoo.epsNtm('2026-12-31', '2026-11-05', null, 7.2)).toBeNull();
    expect(Yahoo.epsNtm('2026-12-31', '2026-11-05', 6, null)).toBeNull();
    expect(Yahoo.epsNtm(null, '2026-11-05', 6, 7.2)).toBeNull();
    expect(Yahoo.epsNtm('2026-09-30', '2026-11-05', null, 7.2).eps).toBe(7.2);
  });
  test('mercado: pe_forward_ntm = precio / EPS NTM; el del año en curso y el del siguiente quedan aparte; EPS NTM ≤ 0 → n/s; sin estimaciones → sin dato', () => {
    const r = resumenAcme(); r.earningsTrend.trend[1].endDate = d('2027-06-30');
    const m = Yahoo.parsearMercado(r, { precios: preciosInventados }, { hoy: HOY });
    const w = 237 / 365.25;
    expect(m.pe_forward_ntm.valor).toBeCloseTo(120 / (w * 6 + (1 - w) * 7.2), 3);
    expect(m.pe_forward.valor).toBe(20); expect(m.pe_forward_siguiente.valor).toBeCloseTo(120 / 7.2, 3);
    const neg = resumenAcme(); neg.earningsTrend.trend[1].earningsEstimate.avg = -1; neg.earningsTrend.trend[2].earningsEstimate.avg = -2;
    expect(Yahoo.parsearMercado(neg, { precios: preciosInventados }, { hoy: HOY }).pe_forward_ntm).toMatchObject({ valor: null, motivo: 'n/s' });
    const sin = resumenAcme(); sin.earningsTrend.trend = [];
    expect(Yahoo.parsearMercado(sin, { precios: preciosInventados }, { hoy: HOY }).pe_forward_ntm).toMatchObject({ valor: null, motivo: 'sin dato' });
  });
  test('banco: el margen bruto 0 de Yahoo no es un dato → null con "no aplica (banco)"; en una empresa operativa el 0 se conserva', () => {
    const r = resumenAcme(); r.financialData.grossMargins = 0;
    const nu = Yahoo.parsearMercado(r, { precios: preciosInventados }, { hoy: HOY, financiera: true });
    expect(nu.margenes.valor.bruto).toBeNull(); expect(nu.margenes.motivo_bruto).toBe('no aplica (banco)');
    expect(Yahoo.parsearMercado(r, { precios: preciosInventados }, { hoy: HOY, financiera: false }).margenes.valor.bruto).toBe(0);
  });
  test('ADR con EPS en otra moneda que el precio (ganancias en yuanes, precio en dólares): P/E forward y EV/EBITDA quedan null con el motivo, nunca un cociente falso; el par también lo marca', () => {
    const r = resumenAcme(); r.financialData.financialCurrency = 'CNY'; r.price.currency = 'USD';
    const m = Yahoo.parsearMercado(r, { precios: preciosInventados }, { hoy: HOY });
    for (const k of ['pe_forward_ntm', 'pe_forward', 'pe_forward_siguiente', 'ev_ebitda', 'ev_ventas']) expect(m[k]).toMatchObject({ valor: null, motivo: 'no comparable: EPS en CNY, precio en USD' });
    expect(m.pe_ttm.valor).toBe(24);                                  // el P/E TTM lo calcula Yahoo con su propia conversión
    expect(Yahoo.parsearPar(r, { hoy: HOY })).toMatchObject({ moneda: 'USD', moneda_financiera: 'CNY', pe_forward_ntm: { valor: null } });
    expect(Yahoo.parsearMercado(resumenAcme(), { precios: preciosInventados }, { hoy: HOY }).pe_forward_ntm.valor).toBeGreaterThan(0);   // misma moneda: se calcula
  });
  test('ultimo_trimestre_yahoo sale de mostRecentQuarter (para detectar que la SEC trae un trimestre más nuevo)', () => {
    const r = resumenAcme(); r.defaultKeyStatistics.mostRecentQuarter = d('2026-06-30');
    expect(Yahoo.parsearMercado(r, { precios: preciosInventados }, { hoy: HOY }).ultimo_trimestre_yahoo).toBe('2026-06-30');
  });
  test('mercado mínimo de un par: precio, P/E TTM, P/E fwd NTM, EV/EBITDA y crecimiento esperado; sin ficha ni historia', () => {
    const p = Yahoo.parsearPar(resumenAcme(), { hoy: HOY });
    expect(Object.keys(p).sort()).toEqual(['crecimiento_eps_1a', 'crecimiento_eps_2a', 'ev_ebitda', 'moneda', 'moneda_financiera', 'nombre', 'pe_forward_ntm', 'pe_ttm', 'precio'].sort());
    expect(p.precio.valor).toBe(120); expect(p.pe_ttm.valor).toBe(24); expect(p.ev_ebitda.valor).toBe(14); expect(p.pe_forward_ntm.valor).toBeGreaterThan(0);
    expect(p.crecimiento_eps_1a.valor).toBeCloseTo(7.2 / 6 - 1, 5);
  });
});

test.describe('radar v2 (R7): insumos de ROIC, rotación, cobertura y ciclo de caja; Q4 derivado', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'cálculo puro: una sola vez'); });

  test('serieYahoo mapea activos, patrimonio, intereses, impuestos, utilidad antes de impuestos, capital invertido, cobrar, pagar, inventario y costo de ventas; FCF = flujo operativo − capex', () => {
    const [q] = Historia.serieYahoo([{ date: d('2026-09-30'), periodType: '3M', totalRevenue: 100, totalAssets: 900, stockholdersEquity: 400, interestExpense: 5, taxProvision: 12, pretaxIncome: 60, investedCapital: 700, accountsReceivable: 30, accountsPayable: 25, inventory: 20, costOfRevenue: 40,
      operatingCashFlow: 50, capitalExpenditure: -8, freeCashFlow: 999 }]);
    expect(q).toMatchObject({ fin: '2026-09-30', activos_totales: 900, patrimonio: 400, intereses: 5, impuestos: 12, utilidad_antes_impuestos: 60, capital_invertido: 700, cxc: 30, cxp: 25, inventario: 20, costo_ventas: 40, fcf: 42 });
    const sinInt = Historia.serieYahoo([{ date: d('2026-09-30'), periodType: '3M', totalRevenue: 100 }])[0];
    expect(sinInt.intereses).toBeNull(); expect(sinInt.inventario).toBeNull();   // lo que Yahoo no trae queda null (NU no tiene intereses)
  });
  test('serieSec lee de la SEC activos, patrimonio, intereses, impuestos, utilidad antes de impuestos, costo de ventas, cobrar, pagar e inventario', () => {
    const ent = (start, end, val) => ({ start, end, val, accn: 'x', fy: 2026, fp: 'Q', form: '10-Q', filed: end.slice(0, 4) + '-' + String(+end.slice(5, 7) + 1).padStart(2, '0') + '-20' });
    const inst = (end, val) => ({ end, val, accn: 'x', fy: 2026, fp: 'Q', form: '10-Q', filed: end.slice(0, 4) + '-' + String(+end.slice(5, 7) + 1).padStart(2, '0') + '-20' });
    const Qs = [['2025-01-01', '2025-03-31'], ['2025-04-01', '2025-06-30'], ['2025-07-01', '2025-09-30'], ['2025-10-01', '2025-12-31'], ['2026-01-01', '2026-03-31'], ['2026-04-01', '2026-06-30']];
    const fl = v => Qs.map(([a, b], i) => ent(a, b, v + i));
    const bal = v => Qs.map(([, b], i) => inst(b, v + i));
    const us = (n, u, e) => [n, { label: n, units: { [u]: e } }];
    const cf = { facts: { 'us-gaap': Object.fromEntries([
      us('Revenues', 'USD', fl(1000)), us('CostOfRevenue', 'USD', fl(400)), us('IncomeTaxExpenseBenefit', 'USD', fl(30)),
      us('IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'USD', fl(150)), us('InterestExpense', 'USD', fl(-10)),
      us('Assets', 'USD', bal(5000)), us('StockholdersEquity', 'USD', bal(2000)), us('AccountsReceivableNetCurrent', 'USD', bal(100)), us('AccountsPayableCurrent', 'USD', bal(160)), us('InventoryNet', 'USD', bal(80)),
    ]) } };
    const q = Historia.serieSec(cf, []).at(-1);
    expect(q).toMatchObject({ fin: '2026-06-30', costo_ventas: 405, impuestos: 35, utilidad_antes_impuestos: 155, intereses: 5, activos_totales: 5005, patrimonio: 2005, cxc: 105, cxp: 165, inventario: 85, capital_invertido: null });
  });
  test('Q4 derivado (año − 9 meses) con dilutedEPS reportado por Yahoo ese trimestre: se usa el de Yahoo y queda anotado el derivado; los trimestres no derivados no se tocan', () => {
    const sec = [
      { fin: '2025-12-31', derivado_q4: true, eps_basico: 1.12, eps_diluido: 1.1 },
      { fin: '2026-03-31', derivado_q4: false, eps_basico: 1.2, eps_diluido: 1.18 },
    ];
    const y = [{ fin: '2025-12-31', eps_basico: 1.07, eps_diluido: 1.05 }, { fin: '2026-03-31', eps_basico: 9, eps_diluido: 9 }];
    Historia.completarDeYahoo(sec, y, []);
    expect(sec[0]).toMatchObject({ eps_diluido: 1.05, eps_basico: 1.07, eps_diluido_derivado_sec: 1.1 });
    expect(sec[0].campos_yahoo).toEqual(expect.arrayContaining(['eps_diluido', 'eps_basico']));
    expect(sec[1]).toMatchObject({ eps_diluido: 1.18, eps_basico: 1.2 }); expect(sec[1].campos_yahoo).toBeUndefined();
    const h = Historia.completarDeYahoo([{ fin: '2025-12-31', derivado_q4: true, eps_diluido: 1.1 }], [{ fin: '2025-12-31', eps_diluido: null }], []);
    expect(h[0].eps_diluido).toBe(1.1);                     // Yahoo sin EPS ese trimestre: queda el derivado
  });
  test('los insumos que la SEC no trae se completan con Yahoo del mismo trimestre (±10 días) y se anotan', () => {
    const sec = [{ fin: '2026-09-30', derivado_q4: false, eps_diluido: 1, activos_totales: null, patrimonio: 500, cxc: null }];
    Historia.completarDeYahoo(sec, [{ fin: '2026-09-29', activos_totales: 900, patrimonio: 111, cxc: 33 }], []);
    expect(sec[0]).toMatchObject({ activos_totales: 900, patrimonio: 500, cxc: 33 });   // lo que la SEC sí trae manda
    expect(sec[0].campos_yahoo).toEqual(['activos_totales', 'cxc']);
  });
});

test.describe('radar v2 (R7): pares-mercado.json', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'job con IO falsa: una sola vez'); });
  const manual = { v: 1, empresas: { ACME: { pares: ['PAR1', 'PAR2', 'nubo'] }, NUBO: { pares: ['PAR2', 'PAR3'] } } };

  test('paresDe: tickers únicos y ordenados de todas las empresas del manual', () => {
    expect(Datos.paresDe(manual)).toEqual(['NUBO', 'PAR1', 'PAR2', 'PAR3']);
    expect(Datos.paresDe(null)).toEqual([]);
  });
  test('corrida completa: baja un archivo único con el mercado mínimo de cada par (reusa el resumen de las empresas del Radar, no las pide dos veces)', async () => {
    const e = entorno({ archivos: [['radar-manual.json', JSON.stringify(manual)]] });
    const pedidosYahoo = [];
    const base = e.args.yahoo;
    const yahoo = Object.assign({}, base, { resumen: async t => { pedidosYahoo.push(t); return base.resumen(t); } });
    const r = await Datos.procesar(Object.assign({}, e.args, { yahoo }));
    expect(r.pares).toBe('ok');
    const p = JSON.parse(e.fs.get('pares-mercado.json'));
    expect(Object.keys(p.empresas)).toEqual(['NUBO', 'PAR1', 'PAR2', 'PAR3']);
    expect(p.empresas.PAR1).toMatchObject({ precio: { valor: 120 }, pe_ttm: { valor: 24 } });
    expect(p.empresas.PAR1.pe_forward_ntm.valor).toBeGreaterThan(0);
    expect(p.empresas.PAR1.ficha).toBeUndefined();
    expect(pedidosYahoo.filter(t => t === 'NUBO')).toHaveLength(1);        // NUBO ya se pidió como empresa del Radar
  });
  test('un par que falla conserva su entrada anterior marcada stale_since; el que nunca existió no aparece; la segunda corrida igual no reescribe', async () => {
    const e = entorno({ archivos: [['radar-manual.json', JSON.stringify(manual)]] });
    await Datos.procesar(e.args);
    const yahoo = Object.assign({}, e.args.yahoo, { resumen: async t => { if (t === 'PAR2' || t === 'PAR3') throw new Error('Yahoo 429'); return e.args.yahoo.resumen(t); } });
    e.fs.delete('pares-mercado.json');
    await Datos.procesar(Object.assign({}, e.args, { yahoo }));            // sin archivo previo: PAR2 y PAR3 no existen
    expect(Object.keys(JSON.parse(e.fs.get('pares-mercado.json')).empresas)).toEqual(['NUBO', 'PAR1']);
    const ok = entorno({ archivos: [['radar-manual.json', JSON.stringify(manual)]] });
    await Datos.procesar(ok.args);
    const antes = ok.fs.get('pares-mercado.json');
    const r2 = await Datos.procesar(ok.args);
    expect(r2.pares).toBe('sin_cambios'); expect(ok.fs.get('pares-mercado.json')).toBe(antes);
    const y2 = Object.assign({}, ok.args.yahoo, { resumen: async t => { if (t === 'PAR2') throw new Error('Yahoo 429'); return ok.args.yahoo.resumen(t); } });
    await Datos.procesar(Object.assign({}, ok.args, { yahoo: y2, hoy: '2026-11-06' }));
    const p = JSON.parse(ok.fs.get('pares-mercado.json'));
    expect(p.empresas.PAR2.stale_since).toBe('2026-11-06'); expect(p.empresas.PAR2.precio.valor).toBe(120);
  });
  test('sin pares en radar-manual.json, o con --tickers, no se baja nada de pares', async () => {
    const e = entorno();
    const r = await Datos.procesar(e.args);
    expect(r.pares).toBeUndefined(); expect(e.fs.has('pares-mercado.json')).toBe(false);
    const e2 = entorno({ archivos: [['radar-manual.json', JSON.stringify(manual)]] });
    const r2 = await Datos.procesar(Object.assign({}, e2.args, { tickers: ['ACME'] }));
    expect(r2.pares).toBeUndefined(); expect(e2.fs.has('pares-mercado.json')).toBe(false);
  });
});
