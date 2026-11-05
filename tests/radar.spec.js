// Radar de empresas (radar-calc.js + radar.js + tools/radar-job/run.js + pestaña "Radar" de Cartera).
// Parte 1: cálculo puro (Node) con fixtures inventados de tests/fixtures/radar-facts.js. Parte 2: el job de la SEC con IO y red falsas.
// Parte 3: la pestaña en la app con el Worker mockeado (page.route). Nada es real: ninguna empresa, precio ni cartera.
// Con RADAR_SHOTS=<carpeta> también guarda capturas (escritorio 1440 y celular 390) para revisarlas a ojo.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { test, expect } = require('./support/fixtures');
const Calc = require(path.join(__dirname, '..', 'radar-calc.js'));
const Job = require(path.join(__dirname, '..', 'tools', 'radar-job', 'run.js'));
const F = require('./fixtures/radar-facts.js');

const SHOTS = process.env.RADAR_SHOTS || '';
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

  test('FCF = flujo operativo − capex; margen FCF sobre ingresos; EBITDA = EBIT + D&A; deuda neta = deuda − caja', () => {
    const c = Calc.completar(acme());
    expect(c.ttm.fcf).toBe(421 * M);
    cerca(c.ttm.mFcf, 421 / 2100);
    expect(c.ttm.ebitda).toBe(522 * M);
    expect(c.ttm.deudaNeta).toBe(100 * M);
    expect(c.anual.fcf[10]).toBe(400 * M);              // 500 − 100
    cerca(c.anual.mFcf[10], 400 / 2000);
    expect(c.anual.deudaNeta[10]).toBe(100 * M);        // 500 − 400
    cerca(c.ttm.mBruto, 0.4); cerca(c.ttm.mOper, 0.2); cerca(c.ttm.mNeto, 320 / 2100);
  });

  test('ROIC = EBIT × (1 − tasa) / (deuda + patrimonio − caja): 2025 = 400 × 0,8 / (500 + 2.000 − 400)', () => {
    const c = Calc.completar(acme());
    cerca(c.anual.tasa[10], 0.2); expect(c.anual.tasaEst[10]).toBe(false);
    cerca(c.anual.roic[10], 320 / 2100);
    cerca(c.ttm.roic, 420 * 0.8 / (550 + 2100 - 450));   // TTM: tasa del último año y balance del último reporte
    cerca(c.ttm.roe, 320 / 2100);
    cerca(c.ttm.roa, 320 / 5000);
  });

  test('tasa fuera de 0–40 % o imposible de calcular: se usa 21 % marcado como estimado', () => {
    expect(Calc.tasaUsada(0.6)).toEqual({ t: 0.21, est: true });
    expect(Calc.tasaUsada(-0.1)).toEqual({ t: 0.21, est: true });
    expect(Calc.tasaUsada(null)).toEqual({ t: 0.21, est: true });
    expect(Calc.tasaUsada(0.18)).toEqual({ t: 0.18, est: false });
    cerca(Calc.roicDe(200, 0.2, 300, 700, 100), 160 / 900);
    expect(Calc.roicDe(200, 0.2, 100, 100, 300)).toBeNull();   // capital invertido ≤ 0
    expect(Calc.roicDe(null, 0.2, 300, 700, 100)).toBeNull();
  });

  test('crecimiento y variación de acciones solo entre años fiscales consecutivos; el primero no tiene con qué compararse', () => {
    const c = Calc.completar(acme());
    expect(c.anual.crecimiento[0]).toBeNull();
    cerca(c.anual.crecimiento[10], 2000 / 1900 - 1);
    cerca(c.anual.varAcciones[10], 90 / 91 - 1);
  });

  test('múltiplos al vuelo: cambiar el precio cambia el P/E sin tocar el EPS', () => {
    const f = acme();
    const m100 = Calc.multiplos(f, 100);
    cerca(m100.marketCap, 100 * 88 * M, 1);
    cerca(m100.pe, 100 / 3.55);
    cerca(m100.ps, 8800 / 2100);
    cerca(m100.ev, 8900 * M, 1);                      // 8.800 + deuda 550 − caja 450
    cerca(m100.evEbitda, 8900 / 522);
    cerca(m100.fcfYield, 421 / 8800);
    cerca(m100.deudaNetaEbitda, 100 / 522);
    const m120 = Calc.multiplos(f, 120);
    cerca(m120.pe, 120 / 3.55);
    expect(m120.pe).toBeGreaterThan(m100.pe);
    cerca(m120.fcfYield, 421 / 10560);
    expect(f.ttm.eps).toBeCloseTo(3.55, 9);           // la ficha no cambió
  });

  test('múltiplos con datos faltantes o inválidos: null con motivo, nunca un número inventado', () => {
    const f = acme();
    expect(Calc.multiplos(f, null).pe).toBeNull();
    expect(Calc.multiplos(f, 0).marketCap).toBeNull();
    expect(Calc.multiplos(f, -5).pe).toBeNull();
    expect(Calc.multiplos(null, 100).pe).toBeNull();
    const pierde = JSON.parse(JSON.stringify(f)); pierde.ttm.eps = -1.2; pierde.ttm.ebit = -50 * M; pierde.ttm.da = 10 * M;
    const m = Calc.multiplos(pierde, 100);
    expect(m.pe).toBeNull(); expect(m.motivos.pe).toBe('Ganancia negativa');
    expect(m.evEbitda).toBeNull(); expect(m.motivos.evEbitda).toBe('EBITDA negativo');
    const sinDeuda = JSON.parse(JSON.stringify(f)); sinDeuda.bal.deuda = null;
    const m2 = Calc.multiplos(sinDeuda, 100);
    expect(m2.ev).toBeNull(); expect(m2.evEbitda).toBeNull(); expect(m2.pe).not.toBeNull();
    const sinAcc = JSON.parse(JSON.stringify(f)); sinAcc.acciones = null;
    const m3 = Calc.multiplos(sinAcc, 100);
    expect(m3.marketCap).toBeNull(); expect(m3.ps).toBeNull(); expect(m3.fcfYield).toBeNull(); cerca(m3.pe, 100 / 3.55);
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

  test('empresa IFRS de 20-F (taxonomía ifrs-full, solo anuales): TTM = último año, sin capex ni EBIT no se inventa FCF ni EBITDA', () => {
    const f = Calc.construirFicha(F.nubo());
    expect(f.anual.fin).toHaveLength(5);
    expect(f.anual.ingresos).toEqual([1000 * M, 1500 * M, 2000 * M, 2500 * M, 3000 * M]);
    expect(f.ttm).toMatchObject({ fuente: 'anual', fin: '2024-12-31', ingresos: 3000 * M, neto: 420 * M, cfo: 700 * M, capex: null, ebit: null });
    expect(f.bal).toMatchObject({ caja: 900 * M, deuda: 400 * M, patrimonio: 1700 * M, activos: 6000 * M });
    const c = Calc.completar(f);
    expect(c.ttm.fcf).toBeNull(); expect(c.ttm.ebitda).toBeNull(); expect(c.ttm.roic).toBeNull();
    expect(c.anual.mOper.every(x => x === null)).toBe(true);
    const m = Calc.multiplos(f, 5);
    cerca(m.pe, 5 / 0.42); cerca(m.marketCap, 5000 * M, 1);
    expect(m.evEbitda).toBeNull(); expect(m.fcfYield).toBeNull();
  });

  test('datos faltantes → null: facts vacíos, null y cifras en otra moneda no producen números', () => {
    for (const cf of [null, {}, { facts: {} }]) {
      const f = Calc.construirFicha(cf);
      expect(f.sinDatos).toBe(true);
      expect(f.ttm.ingresos).toBeNull();
      expect(f.bal.caja).toBeNull();
      expect(Calc.completar(f).ttm.fcf).toBeNull();
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

  test('tickers: normalización y CEDEAR → subyacente (solo CEDEARs; bonos y letras se excluyen)', () => {
    expect(Calc.normalizarTicker(' brk.b ')).toBe('BRK-B');
    expect(Calc.normalizarTicker('nvda')).toBe('NVDA');
    for (const malo of ['', '1ABC', 'AB CD', 'AAAAAAAAAAA', '../x', null]) expect(Calc.normalizarTicker(malo)).toBeNull();
    expect(Calc.tickerDeCedear('MELI', 'CEDEARS')).toBe('MELI');
    expect(Calc.tickerDeCedear('BRKB', 'CEDEARS')).toBe('BRK-B');
    expect(Calc.tickerDeCedear('T30A7', 'TIT. PUBLICOS')).toBeNull();
    expect(Calc.tickerDeCedear('S30N6', 'Letras')).toBeNull();
    expect(Calc.tickerDeCedear('GGAL', 'ACCIONES')).toBeNull();
  });
});

// ───────────────────────── Parte 2: el job de la SEC (Node, red falsa) ─────────────────────────
test.describe('job de la SEC (tools/radar-job/run.js)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'job puro: una sola vez'); });

  function entorno(over = {}) {
    const archivos = new Map(over.archivos || []);
    const pedidos = [];
    const facts = { 1234567: F.acme(), 7654321: F.nubo() };
    const fetchJson = async (url) => {
      pedidos.push(url);
      if (over.cae && over.cae.some(c => url.includes(c))) throw new Error('red caída');
      if (url === 'https://www.sec.gov/files/company_tickers.json') return { status: 200, json: F.companyTickers() };
      const m = /companyfacts\/CIK(\d{10})\.json$/.exec(url);
      if (m && facts[Number(m[1])]) return { status: 200, json: facts[Number(m[1])] };
      if (m) return { status: 404, json: null };
      throw new Error('url inesperada ' + url);
    };
    return { archivos, pedidos, args: { fetchJson, leer: n => (archivos.has(n) ? archivos.get(n) : null), escribir: (n, t) => archivos.set(n, t), listar: () => [...archivos.keys()], pausaMs: 0 } };
  }

  test('a pedido: arma fund-<T>.json por empresa, marca no_sec lo que la SEC no tiene y deja el índice resumido', async () => {
    const e = entorno();
    const r = await Job.procesar(Object.assign({ tickers: ['ACME', 'NUBO', 'FOND', 'ZZZZ'] }, e.args));
    expect(r.ok.sort()).toEqual(['ACME', 'NUBO']);
    expect(r.noSec.sort()).toEqual(['FOND', 'ZZZZ']);
    expect(r.fallidos).toEqual([]);
    const acme = JSON.parse(e.archivos.get('fund-ACME.json'));
    expect(acme.ticker).toBe('ACME');
    expect(acme.ttm.ingresos).toBe(2100 * M);
    expect(acme.sinDatos).toBeUndefined();
    expect(JSON.parse(e.archivos.get('fund-ZZZZ.json'))).toEqual({ v: 1, ticker: 'ZZZZ', error: 'no_sec' });
    const idx = JSON.parse(e.archivos.get('fund-index.json'));
    expect(Object.keys(idx.empresas).sort()).toEqual(['ACME', 'FOND', 'NUBO', 'ZZZZ']);
    expect(idx.empresas.ACME.anual).toBeUndefined();                 // el índice no lleva los 10 años
    expect(idx.empresas.ACME.ttm.eps).toBeCloseTo(3.55, 9);
    expect(idx.empresas.FOND).toEqual({ error: 'no_sec' });
    // El resumen del índice alcanza para calcular múltiplos igual que con la ficha completa.
    cerca(Calc.multiplos(idx.empresas.ACME, 100).pe, 100 / 3.55);
  });

  test('corrida programada: refresca solo lo que ya está cargado, sin tocar lo marcado no_sec, y no reescribe lo que no cambió', async () => {
    const e = entorno();
    await Job.procesar(Object.assign({ tickers: ['ACME', 'FOND'] }, e.args));
    const antes = new Map(e.archivos);
    e.pedidos.length = 0;
    const r = await Job.procesar(Object.assign({ tickers: null }, e.args));
    expect(r.sinCambios).toEqual(['ACME']);
    expect(e.pedidos.filter(u => u.includes('companyfacts'))).toHaveLength(1);   // FOND (no_sec) no se vuelve a pedir
    for (const [k, v] of antes) expect(e.archivos.get(k)).toBe(v);
  });

  test('un 404 de la SEC para una empresa que ya tenía datos buenos no borra su ficha', async () => {
    const e = entorno();
    await Job.procesar(Object.assign({ tickers: ['ACME'] }, e.args));
    const buena = e.archivos.get('fund-ACME.json');
    e.args.fetchJson = async (url) => (url.includes('company_tickers') ? { status: 200, json: F.companyTickers() } : { status: 404, json: null });
    const r = await Job.procesar(Object.assign({ tickers: ['ACME'] }, e.args));
    expect(r.fallidos).toEqual(['ACME']);
    expect(e.archivos.get('fund-ACME.json')).toBe(buena);
  });

  test('si la red falla para una empresa se conserva su archivo anterior y se sigue con las demás', async () => {
    const e = entorno();
    await Job.procesar(Object.assign({ tickers: ['ACME', 'NUBO'] }, e.args));
    const viejo = e.archivos.get('fund-NUBO.json');
    const e2 = entorno({ archivos: [...e.archivos], cae: ['CIK0007654321'] });
    const r = await Job.procesar(Object.assign({ tickers: ['ACME', 'NUBO'] }, e2.args));
    expect(r.fallidos).toEqual(['NUBO']);
    expect(r.sinCambios).toEqual(['ACME']);
    expect(e2.archivos.get('fund-NUBO.json')).toBe(viejo);
  });

  test('main: exige SEC_USER_AGENT y valida --tickers (nada de comandos ni caracteres raros)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-job-'));
    try {
      await expect(Job.main([ '--datos', dir ], {})).rejects.toThrow(/SEC_USER_AGENT/);
      await expect(Job.main([ '--datos', dir, '--tickers', 'NVDA; rm -rf /' ], { SEC_USER_AGENT: 'Centro de Mando prueba@ejemplo.com' })).rejects.toThrow(/ningún ticker válido/);
      await expect(Job.main([], { SEC_USER_AGENT: 'x y' })).rejects.toThrow(/--datos/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('el workflow que se sube al repo privado no pega los tickers en el comando y no lleva ningún mail', () => {
    const yml = fs.readFileSync(path.join(__dirname, '..', 'tools', 'radar-job', 'radar-fundamentals.yml'), 'utf8');
    expect(yml).toContain('TICKERS: ${{ github.event.inputs.tickers }}');
    expect(yml).not.toMatch(/run:.*\$\{\{\s*github\.event\.inputs/);
    expect(yml).toContain('secrets.SEC_USER_AGENT');
    const mails = yml.match(/[w.-]+@[w.-]+.w+/g) || [];
    expect(mails.filter(m => !/noreply|ejemplo/.test(m))).toEqual([]);   // ningún mail real en el archivo (solo el ejemplo y el noreply de GitHub)
  });
});

// ───────────────────────── Parte 3: la pestaña en la app ─────────────────────────
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const HORA = Date.parse('2026-11-10T14:57:00Z'); // 3 min antes del reloj fijo de los tests

const TENENCIAS = { generado: '2026-11-10T12:00:00Z', tenencias: [
  { simbolo: 'ACME', descripcion: 'Cedear Acme Test Corp', tipo: 'CEDEARS', cantidad: 10, valorizado: 1000 },
  { simbolo: 'FOND', descripcion: 'Cedear Fondo Test Trust', tipo: 'CEDEARS', cantidad: 5, valorizado: 500 },
  { simbolo: 'TESTBONO', descripcion: 'Bono de prueba', tipo: 'TIT. PUBLICOS', cantidad: 100, valorizado: 100 },
  { simbolo: 'TESTLETRA', descripcion: 'Letra de prueba', tipo: 'Letras', cantidad: 100, valorizado: 100 },
] };

function fichasMock() {
  const acme = Object.assign({ ticker: 'ACME' }, Calc.construirFicha(F.acme())); delete acme.sinDatos;
  const nubo = Object.assign({ ticker: 'NUBO' }, Calc.construirFicha(F.nubo())); delete nubo.sinDatos;
  const indice = { v: 1, empresas: { ACME: Job.resumenDe(acme), NUBO: Job.resumenDe(nubo), FOND: { error: 'no_sec' } } };
  return { acme, nubo, indice };
}

async function abrir(page, over = {}) {
  const fm = fichasMock();
  const ctl = {
    tenencias: { status: 200, body: TENENCIAS }, indice: { status: 200, body: fm.indice },
    fichas: { ACME: fm.acme, NUBO: fm.nubo }, precios: { ACME: 100, NUBO: 5 }, noExiste: ['ZZZZ'], viejo: false,
    pedir: { status: 200 }, llamadas: [], posts: [], ...over,
  };
  await page.route('**/cdm-push-worker.tobiasloustau11.workers.dev/**', async (r) => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const u = new URL(req.url());
    ctl.llamadas.push(req.method() + ' ' + u.pathname + u.search);
    const json = (status, body) => r.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
    if (u.pathname.startsWith('/radar/') && ctl.viejo) return r.fulfill({ status: 401, contentType: 'text/plain', headers: CORS, body: 'unauthorized' });
    if (u.pathname === '/datos/tenencias.json') return json(ctl.tenencias.status, ctl.tenencias.body);
    if (u.pathname === '/datos/fund-index.json') return json(ctl.indice.status, ctl.indice.body);
    const f = /^\/datos\/fund-(.+)\.json$/.exec(u.pathname);
    if (f) return ctl.fichas[f[1]] ? json(200, ctl.fichas[f[1]]) : json(404, { error: 'not_found', message: 'Ese archivo no existe.' });
    if (u.pathname === '/radar/precios') {
      const precios = {}, errores = {};
      for (const t of String(u.searchParams.get('t') || '').split(',')) {
        if (ctl.noExiste.includes(t) || !(t in ctl.precios)) { precios[t] = null; errores[t] = 'not_found'; }
        else precios[t] = { precio: ctl.precios[t], previo: ctl.precios[t] - 1, hora: HORA, moneda: ctl.moneda && ctl.moneda[t] || 'USD' };
      }
      return json(200, { generado: new Date().toISOString(), precios, errores });
    }
    if (u.pathname === '/radar/pedir') {
      const b = JSON.parse(req.postData() || '{}');
      ctl.posts.push(b);
      return ctl.pedir.status === 200 ? json(200, { pedidos: b.tickers, yaPedidos: [] }) : json(ctl.pedir.status, ctl.pedir.body);
    }
    return json(404, { error: 'not_found_route' });
  });
  await page.clock.setFixedTime(new Date('2026-11-10T15:00:00Z'));
  await page.evaluate(() => {
    _auth.currentUser.getIdToken = async () => 'token-de-prueba';
    S.radar = { items: [] };
    S.accounts = [{ id: 'inv', name: 'Inversiones', type: 'invest', balance: 1000, currency: 'ARS', icon: '📈' }];
  });
  await page.evaluate(() => CarteraOverlay.open());
  await page.locator('#ov-cartera .plov-tab[data-t="radar"]').click();
  return ctl;
}

const pane = (page) => page.locator('#cov-pane-radar');
const card = (page, t) => pane(page).locator(`.rd-card[data-t="${t}"]`);
const abrirFicha = async (page, t) => { await card(page, t).locator('.rd-card-main').click(); await expect(pane(page).locator('.rd-ftitle .rd-tk')).toHaveText(t); };
const radarS = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S.radar)));
const sinErrores = (consoleErrors) => expect(consoleErrors.filter(e => !/Failed to load resource/.test(e))).toEqual([]);
const desborde = (page) => page.evaluate(() => {
  const p = document.querySelector('#cov-pane-radar'), w = document.documentElement.clientWidth;
  const fuera = [...p.querySelectorAll('.rd-root *')].filter((e) => {
    if (e.closest('.rd-tabla-wrap')) return false;           // la tabla se desplaza por dentro
    const r = e.getBoundingClientRect();
    return r.width > 0 && (r.right > w + 1 || r.left < -1);
  }).map((e) => (typeof e.className === 'string' && e.className) || e.tagName).slice(0, 6);
  const ov = document.querySelector('#ov-cartera .cm-ov-body');
  return { doc: document.documentElement.scrollWidth - w, pane: p.scrollWidth - p.clientWidth, cuerpo: ov.scrollWidth - ov.clientWidth, fuera };
});
async function foto(page, nombre) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(500);   // deja terminar el fundido de la pestaña
  await page.screenshot({ path: path.join(SHOTS, nombre + '.png') });
}

test.describe('pestaña Radar de Cartera', () => {
  test.beforeEach(async ({ cmPage }) => { test.setTimeout(120000); cmPage.on('dialog', (d) => d.accept()); });

  test('es la quinta pestaña de Cartera; la lista trae sola la cartera (CEDEARs, no bonos ni letras) sin categoría, con precio y múltiplos al vuelo', async ({ cmPage: page, consoleErrors }) => {
    const ctl = await abrir(page);
    await expect(page.locator('#ov-cartera .plov-tab')).toHaveCount(5);
    await expect(card(page, 'ACME')).toBeVisible();
    await expect(pane(page).locator('.rd-card')).toHaveCount(2);              // ACME y FOND; el bono y la letra no
    await expect(card(page, 'TESTBONO')).toHaveCount(0);
    await expect(card(page, 'ACME')).toContainText('En cartera');
    await expect(card(page, 'ACME')).toContainText('Sin categoría');
    await expect(card(page, 'ACME')).toContainText('US$ 100,00');
    await expect(card(page, 'ACME')).toContainText('hace 3 min');
    await expect(card(page, 'ACME').locator('.rd-mult')).toContainText('P/E 28,2x');
    await expect(card(page, 'ACME').locator('.rd-mult')).toContainText('EV/EBITDA 17,0x');
    await expect(card(page, 'ACME').locator('.rd-mult')).toContainText('FCF yield 4,8%');
    await expect(card(page, 'FOND')).toContainText('No presenta en la SEC');
    // Las posiciones de la cartera no entran a S.radar hasta que les ponés algo.
    expect(await radarS(page)).toEqual({ items: [] });
    // Un solo pedido por archivo de datos y uno de precios con todas las empresas; nada pidió datos nuevos (todo está en el índice).
    expect(ctl.llamadas).toContain('GET /datos/tenencias.json');
    expect(ctl.llamadas).toContain('GET /datos/fund-index.json');
    expect(ctl.llamadas.filter(l => l.startsWith('GET /radar/precios'))[0]).toContain('t=ACME,FOND');
    expect(ctl.posts).toEqual([]);
    sinErrores(consoleErrors);
  });

  test('+ Empresa: valida el ticker contra el mercado, lo guarda en S.radar y abre su ficha; un ticker que no existe o mal escrito no se agrega', async ({ cmPage: page, consoleErrors }) => {
    const ctl = await abrir(page);
    await expect(card(page, 'ACME')).toBeVisible();
    await pane(page).locator('[data-act="nuevo"]').click();
    await page.fill('#rd-nuevo-t', 'zzzz');
    await pane(page).locator('[data-act="crear"]').click();
    await expect(pane(page).locator('.rd-err')).toContainText('No encontré «ZZZZ»');
    await page.fill('#rd-nuevo-t', 'AB CD');
    await pane(page).locator('[data-act="crear"]').click();
    await expect(pane(page).locator('.rd-err')).toContainText('ticker válido');
    expect((await radarS(page)).items).toEqual([]);
    await page.fill('#rd-nuevo-t', 'nubo');
    await pane(page).locator('[data-act="crear"]').click();
    await expect(pane(page).locator('.rd-ftitle .rd-tk')).toHaveText('NUBO');
    const s = await radarS(page);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ t: 'NUBO', cat: '', star: 0, tesis: '', hist: [] });
    expect(ctl.llamadas).toContain('GET /radar/precios?t=NUBO');
    await expect(pane(page).locator('.rd-fpx')).toContainText('US$ 5,00');
    // Agregar uno que ya está abre el existente en vez de duplicarlo.
    await pane(page).locator('[data-act="volver"]').click();
    await pane(page).locator('[data-act="nuevo"]').click();
    await page.fill('#rd-nuevo-t', 'ACME');
    await pane(page).locator('[data-act="crear"]').click();
    await expect(pane(page).locator('.rd-ftitle .rd-tk')).toHaveText('ACME');
    expect((await radarS(page)).items).toHaveLength(1);
    sinErrores(consoleErrors);
  });

  test('si Yahoo no responde al validar, el ticker se agrega igual (con aviso) en vez de bloquear', async ({ cmPage: page }) => {
    await abrir(page);
    await expect(card(page, 'ACME')).toBeVisible();
    await page.unroute('**/cdm-push-worker.tobiasloustau11.workers.dev/**');
    await page.route('**/cdm-push-worker.tobiasloustau11.workers.dev/**', r => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: CORS }) : r.fulfill({ status: 502, contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: 'radar_unavailable', message: 'Yahoo caído' }) }));
    await pane(page).locator('[data-act="nuevo"]').click();
    await page.fill('#rd-nuevo-t', 'NUBO');
    await pane(page).locator('[data-act="crear"]').click();
    await expect(pane(page).locator('.rd-ftitle .rd-tk')).toHaveText('NUBO');
    expect((await radarS(page)).items.map(i => i.t)).toEqual(['NUBO']);
  });

  test('categoría + historial: al cambiarla se pide el motivo (opcional), queda con fecha y se ve en la lista y en la pestaña Historial', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page);
    await abrirFicha(page, 'ACME');
    await pane(page).locator('#rd-tab-historial').click();
    await expect(pane(page).locator('.rd-pane')).toContainText('Todavía no cambiaste la categoría');
    await pane(page).locator('#rd-tab-resumen').click();
    await page.selectOption('#rd-cat', 'compra');
    await expect(pane(page).locator('.rd-catform')).toContainText('Cambiar de «Sin categoría» a «Compra o posible compra»');
    // Cancelar no cambia nada.
    await pane(page).locator('[data-act="cat-cancel"]').click();
    expect((await radarS(page)).items).toEqual([]);
    await expect(page.locator('#rd-cat')).toHaveValue('');
    // Cambio con motivo.
    await page.selectOption('#rd-cat', 'compra');
    await page.fill('#rd-motivo', 'Cotiza por debajo de lo que vale');
    await pane(page).locator('[data-act="cat-ok"]').click();
    let s = await radarS(page);
    expect(s.items[0]).toMatchObject({ t: 'ACME', cat: 'compra' });
    expect(s.items[0].hist).toEqual([{ f: '2026-11-10', de: '', a: 'compra', m: 'Cotiza por debajo de lo que vale' }]);
    // Segundo cambio sin motivo.
    await page.selectOption('#rd-cat', 'aumentar');
    await pane(page).locator('[data-act="cat-ok"]').click();
    s = await radarS(page);
    expect(s.items[0].cat).toBe('aumentar');
    expect(s.items[0].hist).toHaveLength(2);
    expect(s.items[0].hist[1]).toEqual({ f: '2026-11-10', de: 'compra', a: 'aumentar', m: '' });
    await pane(page).locator('#rd-tab-historial').click();
    const filas = pane(page).locator('.rd-hist li');
    await expect(filas).toHaveCount(2);
    await expect(filas.nth(0)).toContainText('Aumentar posición');                       // el más nuevo primero
    await expect(filas.nth(1)).toContainText('Cotiza por debajo de lo que vale');
    await expect(filas.nth(1)).toContainText('10/11/2026');
    await pane(page).locator('[data-act="volver"]').click();
    await expect(card(page, 'ACME').locator('.rd-chip')).toHaveText('Aumentar posición');
    // Filtro por categoría.
    await pane(page).locator('[data-chg="f-cat"]').selectOption('compra');
    await expect(pane(page).locator('.rd-card')).toHaveCount(0);
    await pane(page).locator('[data-chg="f-cat"]').selectOption('aumentar');
    await expect(pane(page).locator('.rd-card')).toHaveCount(1);
    await pane(page).locator('[data-chg="f-cat"]').selectOption('_sin');
    await expect(card(page, 'FOND')).toBeVisible();
    sinErrores(consoleErrors);
  });

  test('⭐ seguir: desde la lista y desde la ficha, persiste en S.radar, sube la empresa y filtra', async ({ cmPage: page }) => {
    await abrir(page);
    await expect(card(page, 'FOND')).toBeVisible();
    await expect(pane(page).locator('.rd-card').first()).toHaveAttribute('data-t', 'ACME');   // sin ⭐: primero la que tiene datos... orden alfabético dentro de cartera
    await card(page, 'FOND').locator('.rd-star').click();
    await expect(pane(page).locator('.rd-card').first()).toHaveAttribute('data-t', 'FOND');   // la que seguís sube
    let s = await radarS(page);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ t: 'FOND', star: 1 });
    await pane(page).locator('[data-act="f-star"]').click();
    await expect(pane(page).locator('.rd-card')).toHaveCount(1);
    await pane(page).locator('[data-act="f-star"]').click();
    await abrirFicha(page, 'ACME');
    await pane(page).locator('.rd-fhead .rd-star').click();
    expect((await radarS(page)).items.find(i => i.t === 'ACME').star).toBe(1);
    await pane(page).locator('.rd-fhead .rd-star').click();
    expect((await radarS(page)).items.find(i => i.t === 'ACME').star).toBe(0);
    await pane(page).locator('[data-act="volver"]').click();
    await pane(page).locator('[data-act="f-cartera"]').click();
    await expect(pane(page).locator('.rd-card')).toHaveCount(2);                                // las dos están en cartera
  });

  test('tesis: se escribe con formato, se guarda con fecha y se vuelve a mostrar; se puede editar', async ({ cmPage: page }) => {
    await abrir(page);
    await abrirFicha(page, 'ACME');
    await pane(page).locator('#rd-tab-tesis').click();
    await page.fill('#rd-tesis', '## Por qué\n- Márgenes altos\n**Ojo** con la deuda');
    await pane(page).locator('[data-act="tesis-preview"]').click();
    await expect(pane(page).locator('#rd-tesis-prev')).toContainText('Márgenes altos');
    await pane(page).locator('[data-act="tesis-guardar"]').click();
    const s = await radarS(page);
    expect(s.items[0]).toMatchObject({ t: 'ACME', tesis: '## Por qué\n- Márgenes altos\n**Ojo** con la deuda', tesisF: '2026-11-10' });
    await expect(pane(page).locator('.rd-tesis')).toContainText('Márgenes altos');
    await expect(pane(page).locator('.rd-panebar')).toContainText('Actualizada el 10/11/2026');
    await pane(page).locator('[data-act="tesis-editar"]').click();
    await page.fill('#rd-tesis', 'Versión nueva');
    await pane(page).locator('[data-act="tesis-guardar"]').click();
    await expect(pane(page).locator('.rd-tesis')).toContainText('Versión nueva');
    expect((await radarS(page)).items[0].tesis).toBe('Versión nueva');
  });

  test('ficha: tarjetas Valuación / Rentabilidad / Estructura de capital con el precio en vivo y los datos de la SEC', async ({ cmPage: page }) => {
    await abrir(page);
    await abrirFicha(page, 'ACME');
    const tc = (titulo, lbl) => pane(page).locator('.rd-tcard', { has: page.locator('h4', { hasText: titulo }) }).locator('dl > div', { hasText: lbl }).locator('dd');
    await expect(pane(page).locator('.rd-fpx')).toContainText('US$ 100,00');
    await expect(pane(page).locator('.rd-fpx')).toContainText('hace 3 min');
    await expect(pane(page).locator('.rd-fpx')).toContainText('+1,01%');              // 100 vs 99
    await expect(tc('Valuación', 'P/E')).toHaveText('28,2x');
    await expect(tc('Valuación', 'P/S')).toHaveText('4,2x');
    await expect(tc('Valuación', 'EV/EBITDA')).toHaveText('17,0x');
    await expect(tc('Valuación', 'FCF yield')).toHaveText('4,8%');
    await expect(tc('Rentabilidad', 'Margen bruto')).toHaveText('40,0%');
    await expect(tc('Rentabilidad', 'Margen EBIT')).toHaveText('20,0%');
    await expect(tc('Rentabilidad', 'Margen neto')).toHaveText('15,2%');
    await expect(tc('Rentabilidad', 'ROE')).toHaveText('15,2%');
    await expect(tc('Rentabilidad', 'ROA')).toHaveText('6,4%');
    await expect(tc('Rentabilidad', 'ROIC')).toHaveText('15,3%');
    await expect(tc('Estructura de capital', 'Cap. bursátil')).toHaveText('US$ 8.800 M');
    await expect(tc('Estructura de capital', 'Deuda total')).toHaveText('US$ 550 M');
    await expect(tc('Estructura de capital', 'Efectivo')).toHaveText('US$ 450 M');
    await expect(tc('Estructura de capital', 'Valor de empresa')).toHaveText('US$ 8.900 M');
    await expect(pane(page).locator('.rd-nota').first()).toContainText('Datos al 30/06/2026 (presentado el 07/08/2026)');
    await expect(pane(page).locator('.rd-nota').first()).toContainText('TTM = últimos 4 trimestres');
  });

  test('los múltiplos se recalculan con el precio nuevo sin tocar el EPS: P/E 28,2x a US$ 100 → 33,8x a US$ 120 (lista y ficha)', async ({ cmPage: page }) => {
    const ctl = await abrir(page);
    await expect(card(page, 'ACME').locator('.rd-mult')).toContainText('P/E 28,2x');
    ctl.precios.ACME = 120;
    await page.evaluate(() => Radar.refrescar());
    await expect(card(page, 'ACME').locator('.rd-mult')).toContainText('P/E 33,8x');
    await expect(card(page, 'ACME')).toContainText('US$ 120,00');
    await abrirFicha(page, 'ACME');
    const pe = pane(page).locator('.rd-tcard', { has: page.locator('h4', { hasText: 'Valuación' }) }).locator('dl > div', { hasText: 'P/E' }).locator('dd');
    await expect(pe).toHaveText('33,8x');
    await expect(pane(page).locator('.rd-tcard', { hasText: 'Cap. bursátil' }).locator('dl > div', { hasText: 'Cap. bursátil' }).locator('dd')).toHaveText('US$ 10.560 M');
    // El EPS de la tabla es el mismo de antes: solo se movió el precio.
    await expect(pane(page).locator('.rd-tabla tbody tr', { hasText: 'EPS diluido' }).locator('td').first()).toHaveText('3,55');
    ctl.precios.ACME = 90;
    await page.evaluate(() => Radar.refrescar());
    await expect(pe).toHaveText('25,4x');
    await expect(pane(page).locator('.rd-tabla tbody tr', { hasText: 'EPS diluido' }).locator('td').first()).toHaveText('3,55');
  });

  test('tabla de estados financieros: TTM + 10 años fiscales (el más reciente a la izquierda), sparklines, negativos entre paréntesis, sin inventar', async ({ cmPage: page }) => {
    await abrir(page);
    await abrirFicha(page, 'ACME');
    await expect(pane(page).locator('.rd-tabla')).toBeVisible();
    const ths = await pane(page).locator('.rd-tabla thead th').allTextContents();
    expect(ths).toHaveLength(12);
    expect(ths.slice(0, 4)).toEqual(['Millones de US$', 'TTM', 'dic 2025', 'dic 2024']);
    expect(ths[11]).toBe('dic 2016');
    const fila = (t) => pane(page).locator('.rd-tabla tbody tr', { has: page.locator('th .rd-lbl', { hasText: new RegExp('^' + t) }) });
    const vals = async (t) => (await fila(t).locator('td').allTextContents());
    expect((await vals('Ingresos')).slice(0, 4)).toEqual(['2.100', '2.000', '1.900', '1.800']);          // 2023 = restatado 1.800
    expect((await vals('Margen bruto'))[0]).toBe('40,0%');
    expect((await vals('EBIT'))[0]).toBe('420');
    expect((await vals('EPS diluido')).slice(0, 2)).toEqual(['3,55', '3,33']);
    expect((await vals('Acciones diluidas'))[0]).toBe('88,0');
    expect((await vals('Caja'))[0]).toBe('450');
    expect((await vals('Deuda neta'))[0]).toBe('100');
    expect((await vals('Capex')).slice(0, 2)).toEqual(['(104)', '(100)']);                               // salida de caja: entre paréntesis
    expect((await vals('Flujo libre')).slice(0, 2)).toEqual(['421', '400']);
    // Cada fila lleva su minigráfico de 10 años y el último es el que resalta.
    await expect(pane(page).locator('.rd-tabla tbody tr .rd-spark')).toHaveCount(13);
    await expect(fila('Ingresos').locator('.rd-spark rect')).toHaveCount(10);
    await expect(fila('Ingresos').locator('.rd-spark rect.ult')).toHaveCount(1);
    // Grupos con la columna que corresponde.
    await expect(pane(page).locator('.rd-grp').nth(0)).toContainText('TTM');
    await expect(pane(page).locator('.rd-grp').nth(1)).toContainText('Último informe');
  });

  test('empresa que no informa capex ni EBIT (IFRS, solo anual): las celdas dicen "—", la fila no se rellena y el TTM avisa que es el último año', async ({ cmPage: page }) => {
    await abrir(page);
    await pane(page).locator('[data-act="nuevo"]').click();
    await page.fill('#rd-nuevo-t', 'NUBO');
    await pane(page).locator('[data-act="crear"]').click();
    await expect(pane(page).locator('.rd-ftitle .rd-tk')).toHaveText('NUBO');
    const fila = (t) => pane(page).locator('.rd-tabla tbody tr', { has: page.locator('th .rd-lbl', { hasText: new RegExp('^' + t) }) });
    await expect(pane(page).locator('.rd-tabla thead th').nth(1)).toHaveText('Último año');
    expect((await fila('Capex').locator('td').allTextContents()).every(x => x === '—')).toBe(true);
    expect((await fila('EBIT').locator('td').allTextContents()).every(x => x === '—')).toBe(true);
    expect((await fila('Flujo libre').locator('td').allTextContents()).every(x => x === '—')).toBe(true);
    expect((await fila('Ingresos').locator('td').allTextContents()).slice(0, 2)).toEqual(['3.000', '3.000']);
    await expect(pane(page).locator('.rd-nota').first()).toContainText('no presenta trimestres en la SEC');
    const tc = pane(page).locator('.rd-tcard', { has: page.locator('h4', { hasText: 'Valuación' }) });
    await expect(tc.locator('dl > div', { hasText: 'EV/EBITDA' }).locator('dd')).toContainText('—');
    await expect(tc.locator('dl > div', { hasText: 'EV/EBITDA' }).locator('dd small')).toHaveText('sin ebitda');
    await expect(tc.locator('dl > div', { hasText: 'P/E' }).locator('dd')).toHaveText('11,9x');         // 50 / 0,42
  });

  test('estados claros: no presenta en la SEC, pendiente (pide los datos y se actualiza sola), servidor viejo, sin datos todavía', async ({ cmPage: page, consoleErrors }) => {
    const ctl = await abrir(page);
    await abrirFicha(page, 'FOND');
    await expect(pane(page).locator('.rd-pane')).toContainText('Esta empresa no presenta en la SEC');
    await pane(page).locator('#rd-tab-tesis').click();                                             // el resto de la ficha sigue andando
    await expect(pane(page).locator('#rd-tesis')).toBeVisible();
    await pane(page).locator('[data-act="volver"]').click();
    // Empresa nueva que todavía no está en el índice: se pide al servidor y queda "pendiente".
    await pane(page).locator('[data-act="nuevo"]').click();
    await page.fill('#rd-nuevo-t', 'PEND');
    ctl.precios.PEND = 10;
    await pane(page).locator('[data-act="crear"]').click();
    await expect(pane(page).locator('.rd-pane')).toContainText('Pidiendo los datos a la SEC');
    expect(ctl.posts).toEqual([{ tickers: ['PEND'] }]);
    // Llegan los datos: el índice y el archivo ya existen → al refrescar la ficha se completa sola.
    const fm = fichasMock();
    const pend = Object.assign({}, fm.acme, { ticker: 'PEND', nombre: 'Pendiente Test SA' });
    ctl.fichas.PEND = pend; ctl.indice.body.empresas.PEND = Job.resumenDe(pend);
    await page.evaluate(() => Radar.refrescar());
    await expect(pane(page).locator('.rd-tcard').first()).toBeVisible();
    await expect(pane(page).locator('.rd-ftitle .rd-nom')).toHaveText('Pendiente Test SA');
    sinErrores(consoleErrors);
  });

  test('Worker viejo (sin las rutas del radar): dice "Falta publicar el servidor" y no inventa precios ni múltiplos', async ({ cmPage: page }) => {
    await abrir(page, { viejo: true });
    await expect(pane(page).locator('.rd-aviso').first()).toContainText('Falta publicar el servidor');
    await expect(card(page, 'ACME')).toContainText('Sin precio');
    await expect(card(page, 'ACME').locator('.rd-mult')).toContainText('P/E —');
    await expect(card(page, 'ACME').locator('.rd-mult')).not.toContainText('x');
  });

  test('sin datos de la SEC todavía (índice inexistente): aviso con el paso que falta y las empresas quedan "Pidiendo datos"', async ({ cmPage: page }) => {
    const ctl = await abrir(page, { indice: { status: 404, body: { error: 'not_found', message: 'Ese archivo no existe.' } }, fichas: {} });
    await expect(pane(page).locator('.rd-aviso').first()).toContainText('Todavía no hay datos de la SEC');
    await expect(card(page, 'ACME')).toContainText('Pidiendo datos a la SEC');
    await expect.poll(() => ctl.posts.length).toBe(1);
    expect(ctl.posts[0].tickers.sort()).toEqual(['ACME', 'FOND']);                                  // pide las de la cartera
  });

  test('si el servidor no deja lanzar la actualización, lo dice con el motivo (permiso de GitHub) en vez de quedarse esperando', async ({ cmPage: page }) => {
    await abrir(page, { indice: { status: 404, body: { error: 'not_found' } }, fichas: {}, pedir: { status: 502, body: { error: 'github_permiso', message: 'GitHub no dejó lanzar la actualización: falta «Actions: Read and write».' } } });
    await expect(pane(page).locator('.rd-aviso', { hasText: 'Actions: Read and write' })).toBeVisible();
  });

  test('un precio en otra moneda no se usa para múltiplos en dólares', async ({ cmPage: page }) => {
    await abrir(page, { moneda: { ACME: 'BRL' } });
    await expect(card(page, 'ACME')).toContainText('Cotiza en BRL');
    await expect(card(page, 'ACME').locator('.rd-mult')).toContainText('P/E —');
  });

  test('quitar del radar borra categoría, tesis e historial; la posición de la cartera sigue apareciendo sin categoría', async ({ cmPage: page }) => {
    await abrir(page);
    await abrirFicha(page, 'ACME');
    await page.selectOption('#rd-cat', 'top');
    await pane(page).locator('[data-act="cat-ok"]').click();
    await pane(page).locator('[data-act="quitar"]').click();
    expect((await radarS(page)).items).toEqual([]);
    await expect(card(page, 'ACME')).toContainText('Sin categoría');
  });

  test('el diseño entra sin scroll horizontal en la página (390 y 360) y las 5 pestañas de Cartera caben; la tabla se desplaza por dentro con la columna de nombres fija', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page);
    for (const ancho of [390, 360]) {
      await page.setViewportSize({ width: ancho, height: 844 });
      await expect(pane(page).locator('.rd-card').first()).toBeVisible();
      expect(await desborde(page)).toEqual({ doc: 0, pane: 0, cuerpo: 0, fuera: [] });
      const tabs = await page.locator('#ov-cartera .plov-tabs:not(.rd-tabs) .plov-tab').evaluateAll(els => els.map(e => ({ t: e.textContent.trim(), ok: e.scrollWidth <= e.clientWidth + 1 })));
      expect(tabs.map(t => t.t)).toEqual(['Mis tenencias', 'Análisis mensual', 'Historial', 'Rendimiento', 'Radar']);
      expect(tabs.every(t => t.ok)).toBe(true);
      await pane(page).locator('.rd-bar [data-act="nuevo"]').click();
      await page.fill('#rd-nuevo-t', 'ACME');
      expect(await desborde(page)).toEqual({ doc: 0, pane: 0, cuerpo: 0, fuera: [] });
      await pane(page).locator('.rd-formcard [data-act="nuevo"]').click();
      await abrirFicha(page, 'ACME');
      expect(await desborde(page)).toEqual({ doc: 0, pane: 0, cuerpo: 0, fuera: [] });
      await expect(pane(page).locator('.rd-tabla-wrap')).toBeVisible();
      // Todo en una sola evaluación (la ficha se repinta cuando llega el precio: un nodo viejo quedaría suelto).
      const t = await page.evaluate(() => {
        const w = document.querySelector('#cov-pane-radar .rd-tabla-wrap'), th = () => w.querySelector('tbody tr:nth-child(2) th').getBoundingClientRect().left;
        const a = th(); w.scrollLeft = 400;
        return { scrollea: w.scrollWidth > w.clientWidth, movido: w.scrollLeft, delta: Math.abs(a - th()) };
      });
      expect(t.scrollea).toBe(true);                                                          // la tabla scrollea por dentro...
      expect(t.movido).toBeGreaterThan(0);
      expect(t.delta).toBeLessThan(1.5);                                                      // ...y la columna de nombres no se mueve
      expect(await desborde(page)).toEqual({ doc: 0, pane: 0, cuerpo: 0, fuera: [] });
      await pane(page).locator('#rd-tab-tesis').click();
      expect(await desborde(page)).toEqual({ doc: 0, pane: 0, cuerpo: 0, fuera: [] });
      await pane(page).locator('#rd-tab-historial').click();
      expect(await desborde(page)).toEqual({ doc: 0, pane: 0, cuerpo: 0, fuera: [] });
      await pane(page).locator('[data-act="volver"]').click();
    }
    sinErrores(consoleErrors);
  });

  test('en escritorio (1440) todo entra y las 5 pestañas de Cartera se alternan', async ({ cmPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await abrir(page);
    await expect(card(page, 'ACME')).toBeVisible();
    expect(await desborde(page)).toEqual({ doc: 0, pane: 0, cuerpo: 0, fuera: [] });
    await page.locator('#ov-cartera .plov-tab[data-t="tenencias"]').click();
    await expect(pane(page)).toBeHidden();
    await page.locator('#ov-cartera .plov-tab[data-t="radar"]').click();
    await expect(card(page, 'ACME')).toBeVisible();
  });

  test('capturas (solo con RADAR_SHOTS): lista, ficha con cada pestaña, en 1440 y en 390', async ({ cmPage: page }, testInfo) => {
    test.skip(!SHOTS, 'se activa con RADAR_SHOTS=<carpeta>');
    const ctl = await abrir(page);
    const tam = testInfo.project.name === 'chromium-mobile' ? [390, 844, 'm390'] : [1440, 900, 'd1440'];
    await page.setViewportSize({ width: tam[0], height: tam[1] });
    await page.evaluate(() => { S.radar = { items: [{ id: 'a', t: 'ACME', cat: 'compra', star: 1, tesis: '## Por qué\n- Márgenes altos y estables\n- Recompra de acciones todos los años\n**Ojo**: la deuda subió en el último trimestre.', tesisF: '2026-11-03', hist: [{ f: '2026-09-02', de: '', a: 'obs', m: 'La sigo desde el último reporte' }, { f: '2026-11-03', de: 'obs', a: 'compra', m: 'Cotiza por debajo de lo que vale' }], creado: 1 }, { id: 'b', t: 'NUBO', cat: 'solida', star: 0, tesis: '', hist: [], creado: 2 }] }; });
    await page.evaluate(() => Radar.refrescar());
    await expect(card(page, 'NUBO')).toBeVisible();
    await foto(page, `${tam[2]}-1-lista`);
    await abrirFicha(page, 'ACME');
    await expect(pane(page).locator('.rd-tabla')).toBeVisible();
    await foto(page, `${tam[2]}-2-ficha-resumen`);
    await pane(page).locator('.rd-tabla').scrollIntoViewIfNeeded();
    await page.evaluate(() => { document.querySelector('#ov-cartera .cm-ov-body').scrollTop = 520; });
    await foto(page, `${tam[2]}-3-ficha-tabla`);
    await pane(page).locator('#rd-tab-tesis').click();
    await foto(page, `${tam[2]}-4-ficha-tesis`);
    await pane(page).locator('#rd-tab-historial').click();
    await foto(page, `${tam[2]}-5-ficha-historial`);
    void ctl;
  });
});
