// Radar — lectura de la SEC (radar-calc.js): lo que usa el job de datos (tools/radar-job/historia.js y radar-datos.js).
// Cálculo puro (Node) con fixtures INVENTADOS de tests/fixtures/radar-facts.js. Nada es real: ninguna empresa, precio ni cartera.
// La ficha del navegador se prueba en tests/radar-vista.spec.js (cálculo/formato) y tests/radar-ui.spec.js (la pestaña en la app).
'use strict';
const path = require('path');
const { test, expect } = require('./support/fixtures');
const Calc = require(path.join(__dirname, '..', 'radar-calc.js'));
const F = require('./fixtures/radar-facts.js');

const cerca = (a, b, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol);
const M = F.M;

// ───────────────────────── Parte 1: cálculo puro ─────────────────────────
test.describe('cálculo del radar (puro)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'cálculo puro: una sola vez'); });

  const acme = () => Calc.construirFicha(F.acme());
  const ingresosAcme = () => Calc.leer(F.acme().facts, Calc.FUENTES.ingresos.f, 'USD');

  test('trimestres: el Q4 no viene suelto en la SEC y sale como año − 9 meses (530 = 2.000 − 1.470)', () => {
    const qs = Calc.trimestresDe(ingresosAcme());
    const q25 = qs.filter(q => q.end >= '2025-03-31');
    expect(q25.map(q => [q.end, q.val / M])).toEqual([['2025-03-31', 470], ['2025-06-30', 490], ['2025-09-30', 510], ['2025-12-31', 530], ['2026-03-31', 520], ['2026-06-30', 540]]);
    expect(q25.find(q => q.end === '2025-12-31').derivado).toBe(true);
    expect(q25.find(q => q.end === '2025-09-30').derivado).toBe(false);
  });

  test('TTM desde trimestres: Q3 + Q4 (implícito) de 2025 + Q1 + Q2 de 2026 = 2.100', () => {
    const t = Calc.ttmDe(ingresosAcme());
    expect(t).toMatchObject({ fin: '2026-06-30', fuente: 'trimestres' });
    expect(t.val).toBe(2100 * M);
    expect(t.filed).toBe('2026-08-07');
  });

  test('flujo de caja acumulado (3, 6, 9 meses): cada trimestre sale por resta y el TTM da 525 (135 + 130 + 120 + 140)', () => {
    const cfo = Calc.leer(F.acme().facts, Calc.FUENTES.cfo.f, 'USD');
    const q = Calc.trimestresDe(cfo).filter(x => x.end >= '2025-03-31').map(x => [x.end, x.val / M]);
    expect(q).toEqual([['2025-03-31', 110], ['2025-06-30', 125], ['2025-09-30', 135], ['2025-12-31', 130], ['2026-03-31', 120], ['2026-06-30', 140]]);
    expect(Calc.ttmDe(cfo).val).toBe(525 * M);
  });

  test('si el último dato es el año fiscal, TTM = ese año (no se rearma desde trimestres viejos)', () => {
    const hastaElAnio = ingresosAcme().filter(e => e.end <= '2025-12-31');   // trimestres de 2025 + año 2025, sin nada de 2026
    const t = Calc.ttmDe(hastaElAnio);
    expect(t).toMatchObject({ fin: '2025-12-31', fuente: 'anual' });
    expect(t.val).toBe(2000 * M);
  });

  test('sin 4 trimestres seguidos no se interpola: el TTM cae al último año fiscal', () => {
    // Falta el trimestre de 2025-09-30 y su acumulado: Q3 y Q4 de 2025 no se pueden armar.
    const roto = ingresosAcme().filter(e => !(e.end === '2025-09-30'));
    const t = Calc.ttmDe(roto);
    expect(t.fuente).toBe('anual');
    expect(t.fin).toBe('2025-12-31');
    expect(t.val).toBe(2000 * M);
  });

  test('el dato restatado más nuevo pisa al viejo (ingresos 2023: 1.790 presentado en 2024, 1.800 en 2025)', () => {
    const f = acme();
    expect(f.anual.fin[8]).toBe('2023-12-31');
    expect(f.anual.ingresos[8]).toBe(1800 * M);
  });

  test('ficha: 11 años fiscales de referencia, líneas crudas, balance y acciones del último período', () => {
    const f = acme();
    expect(f.anual.fin).toHaveLength(11);
    expect(f.anual.fin[0]).toBe('2015-12-31');
    expect(f.anual.fin[10]).toBe('2025-12-31');
    expect(f.ttm).toMatchObject({ fin: '2026-06-30', fuente: 'trimestres', ingresos: 2100 * M, ebit: 420 * M, neto: 320 * M, cfo: 525 * M, capex: 104 * M, da: 102 * M, bruta: 840 * M });
    cerca(f.ttm.eps, 3.55, 1e-9);
    expect(f.bal).toMatchObject({ fin: '2026-06-30', caja: 450 * M, deuda: 550 * M, patrimonio: 2100 * M, activos: 5000 * M });
    expect(f.acciones).toBe(88 * M);
    expect(f.accionesFin).toBe('2026-06-30');
    expect(f.datosAl).toBe('2026-06-30');
    expect(f.presentado).toBe('2026-08-07');
    expect(f.sinDatos).toBe(false);
  });


  test('fallback de conceptos POR PERÍODO: una empresa que cambió de etiqueta de ingresos queda con la serie completa', () => {
    const e = F.ent;
    const facts = F.facts('us-gaap', [
      ['SalesRevenueNet', 'USD', [e('2016-01-01', '2016-12-31', 100 * M, '2017-02-01'), e('2017-01-01', '2017-12-31', 110 * M, '2018-02-01')]],
      ['RevenueFromContractWithCustomerExcludingAssessedTax', 'USD', [e('2018-01-01', '2018-12-31', 125 * M, '2019-02-01'), e('2019-01-01', '2019-12-31', 140 * M, '2020-02-01'), e('2017-01-01', '2017-12-31', 111 * M, '2019-02-01')]],
    ]);
    const f = Calc.construirFicha({ cik: 1, entityName: 'Etiqueta Cambiante SA', facts });
    expect(f.anual.fin).toEqual(['2016-12-31', '2017-12-31', '2018-12-31', '2019-12-31']);
    // 2017 está en las dos etiquetas: gana la de mayor prioridad (RevenueFromContract…, 111) sobre SalesRevenueNet (110).
    expect(f.anual.ingresos).toEqual([100 * M, 111 * M, 125 * M, 140 * M]);
  });


  test('empresa IFRS de 20-F (taxonomía ifrs-full, solo anuales): TTM = último año, sin capex ni EBIT', () => {
    const f = Calc.construirFicha(F.nubo());
    expect(f.anual.fin).toHaveLength(5);
    expect(f.anual.ingresos).toEqual([1000 * M, 1500 * M, 2000 * M, 2500 * M, 3000 * M]);
    expect(f.ttm).toMatchObject({ fuente: 'anual', fin: '2024-12-31', ingresos: 3000 * M, neto: 420 * M, cfo: 700 * M, capex: null, ebit: null });
    expect(f.bal).toMatchObject({ caja: 900 * M, deuda: 400 * M, patrimonio: 1700 * M, activos: 6000 * M });
  });

  test('datos faltantes → null: facts vacíos, null y cifras en otra moneda no producen números', () => {
    for (const cf of [null, {}, { facts: {} }]) {
      const f = Calc.construirFicha(cf);
      expect(f.sinDatos).toBe(true);
      expect(f.ttm.ingresos).toBeNull();
      expect(f.bal.caja).toBeNull();
    }
    const brl = F.facts('us-gaap', [['Revenues', 'BRL', [F.ent('2024-01-01', '2024-12-31', 5e9, '2025-03-01')]]]);
    expect(Calc.construirFicha({ facts: brl }).sinDatos).toBe(true);   // solo se leen cifras en USD
  });

  test('deuda: no incluye arrendamientos; sin ninguna etiqueta de deuda queda null (no 0)', () => {
    const e = F.ent;
    const base = [['StockholdersEquity', 'USD', [e(null, '2024-12-31', 500 * M, '2025-02-01')]], ['CashAndCashEquivalentsAtCarryingValue', 'USD', [e(null, '2024-12-31', 100 * M, '2025-02-01')]], ['Revenues', 'USD', [e('2024-01-01', '2024-12-31', 900 * M, '2025-02-01')]]];
    const sin = Calc.construirFicha({ facts: F.facts('us-gaap', base) });
    expect(sin.bal.deuda).toBeNull();
    const con = Calc.construirFicha({ facts: F.facts('us-gaap', base.concat([['LongTermDebt', 'USD', [e(null, '2024-12-31', 300 * M, '2025-02-01')]], ['CommercialPaper', 'USD', [e(null, '2024-12-31', 20 * M, '2025-02-01')]], ['OperatingLeaseLiability', 'USD', [e(null, '2024-12-31', 999 * M, '2025-02-01')]]])) });
    expect(con.bal.deuda).toBe(320 * M);
  });

  test('split o salto fuerte de acciones: EPS y acciones de los años anteriores quedan null y se informa desde cuándo', () => {
    const e = F.ent;
    const anios = [2020, 2021, 2022, 2023];
    const facts = F.facts('us-gaap', [
      ['Revenues', 'USD', anios.map(y => e(`${y}-01-01`, `${y}-12-31`, 100 * M, `${y + 1}-02-01`))],
      ['EarningsPerShareDiluted', 'USD/shares', anios.map((y, i) => e(`${y}-01-01`, `${y}-12-31`, i < 2 ? 8 : 2, `${y + 1}-02-01`))],
      ['WeightedAverageNumberOfDilutedSharesOutstanding', 'shares', anios.map((y, i) => e(`${y}-01-01`, `${y}-12-31`, (i < 2 ? 25 : 100) * M, `${y + 1}-02-01`))],
    ]);
    const f = Calc.construirFicha({ facts });
    expect(f.anual.acciones).toEqual([null, null, 100 * M, 100 * M]);
    expect(f.anual.eps).toEqual([null, null, 2, 2]);
    expect(f.anual.sinComparar).toBe('2021-12-31');
    expect(acme().anual.sinComparar).toBeUndefined();   // sin splits no se corta nada
  });

  test('tickers: normalización (los CEDEAR de IOL ya no se mapean acá: el Radar sale de radar-config.json)', () => {
    expect(Calc.normalizarTicker(' brk.b ')).toBe('BRK-B');
    expect(Calc.normalizarTicker('acme')).toBe('ACME');
    for (const malo of ['', '1ABC', 'AB CD', 'AAAAAAAAAAA', '../x', null]) expect(Calc.normalizarTicker(malo)).toBeNull();
    expect(Object.keys(Calc).sort()).toEqual(['FUENTES', 'anualesDe', 'construirFicha', 'dias', 'leer', 'normalizarTicker', 'sumarDias', 'trimestresDe', 'ttmDe']);
  });
});
