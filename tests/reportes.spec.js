'use strict';
const { test, expect } = require('./support/fixtures');
const R = require('../reportes.js');

test.describe('reportes.js (puro, Node)', () => {
  test('comparar: mejora, empeora, igual, anterior 0, menosEsMejor', () => {
    expect(R.repComparar(30, 20)).toEqual({ abs: 10, pct: 50, tono: 'verde' });
    expect(R.repComparar(20, 30)).toEqual({ abs: -10, pct: -33, tono: 'rojo' });
    expect(R.repComparar(30, 30)).toEqual({ abs: 0, pct: 0, tono: 'azul' });
    expect(R.repComparar(5, 0)).toEqual({ abs: 5, pct: null, tono: 'verde' });
    expect(R.repComparar(20, 30, { menosEsMejor: true }).tono).toBe('verde');
    expect(R.repComparar(30, 20, { menosEsMejor: true }).tono).toBe('rojo');
    expect(R.repComparar(3, 2).abs).toBe(1);
  });

  test('comparar: redondeo y valores no finitos', () => {
    expect(R.repComparar(10.000001, 10).tono).toBe('azul');
    expect(R.repComparar(undefined, 10)).toEqual({ abs: null, pct: null, tono: 'azul' });
    expect(R.repComparar(10, NaN)).toEqual({ abs: null, pct: null, tono: 'azul' });
  });

  test('parcial: el último día del período sigue en curso', () => {
    const r = R.repRango('mensual', '2026-11');
    expect(R.repParcial(r, '2026-11-30')).toBe(true);
    expect(R.repParcial(r, '2026-12-01')).toBe(false);
  });

  test('semana ISO en cambios de año', () => {
    expect(R.repClaveDe('semanal', '2026-01-01')).toBe('2026-W01');
    expect(R.repClaveDe('semanal', '2026-12-31')).toBe('2026-W53');
    expect(R.repClaveDe('semanal', '2027-01-03')).toBe('2026-W53');
    expect(R.repClaveDe('semanal', '2026-11-12')).toBe('2026-W46');
    expect(R.repRango('semanal', '2026-W01')).toEqual({ desde: '2025-12-29', hasta: '2026-01-04' });
    expect(R.repRango('semanal', '2026-W53')).toEqual({ desde: '2026-12-28', hasta: '2027-01-03' });
    expect(R.repRango('semanal', '2026-W46')).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' });
    expect(R.repAnterior('semanal', '2026-W01')).toBe('2025-W52');
    expect(R.repAnterior('semanal', '2027-W01')).toBe('2026-W53');
  });

  test('mensual, trimestral, semestral, anual y sus anteriores', () => {
    expect(R.repRango('mensual', '2026-02')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(R.repAnterior('mensual', '2026-01')).toBe('2025-12');
    expect(R.repRango('trimestral', '2026-T4')).toEqual({ desde: '2026-10-01', hasta: '2026-12-31' });
    expect(R.repAnterior('trimestral', '2026-T1')).toBe('2025-T4');
    expect(R.repAnterior('trimestral', '2026-T3')).toBe('2026-T2');
    expect(R.repRango('semestral', '2026-S2')).toEqual({ desde: '2026-07-01', hasta: '2026-12-31' });
    expect(R.repAnterior('semestral', '2026-S1')).toBe('2025-S2');
    expect(R.repRango('anual', '2026')).toEqual({ desde: '2026-01-01', hasta: '2026-12-31' });
    expect(R.repAnterior('anual', '2026')).toBe('2025');
    expect(R.repClaveDe('trimestral', '2026-11-12')).toBe('2026-T4');
    expect(R.repClaveDe('semestral', '2026-06-30')).toBe('2026-S1');
    expect(R.repMeses(R.repRango('trimestral', '2026-T4'))).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(R.repMeses(R.repRango('semanal', '2026-W53'))).toEqual(['2026-12', '2027-01']);
  });

  test('período en curso: parcial y anterior recortado', () => {
    const r = R.repRango('mensual', '2026-11'), a = R.repRango('mensual', '2026-10');
    expect(R.repParcial(r, '2026-11-12')).toBe(true);
    expect(R.repParcial(a, '2026-11-12')).toBe(false);
    expect(R.repRangoComparable(r, a, '2026-11-12')).toEqual({ desde: '2026-10-01', hasta: '2026-10-12' });
    expect(R.repRangoComparable(a, R.repRango('mensual', '2026-09'), '2026-11-12')).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    // febrero (28) como anterior de un marzo en curso: no pasa del fin de febrero
    expect(R.repRangoComparable(R.repRango('mensual', '2026-03'), R.repRango('mensual', '2026-02'), '2026-03-30').hasta).toBe('2026-02-28');
  });

  test('hábitos: partial aparte del conteo de done; sin registros = 0', () => {
    const tr = { Salud: [
      { id: 'h1', name: 'Gym', days: { '2026-11-02': 'done', '2026-11-03': 'partial', '2026-11-04': 'done', '2026-11-05': 'missed', '2026-10-31': 'done' } },
      { id: 'h2', name: 'Leer', days: {} },
    ] };
    const out = R.repHabitos(tr, { desde: '2026-11-01', hasta: '2026-11-30' });
    expect(out.find(h => h.id === 'h1')).toMatchObject({ done: 2, partial: 1 });
    expect(out.find(h => h.id === 'h2')).toMatchObject({ done: 0, partial: 0 });
  });

  test('objetivos por categoría: Familia 3 vs 2, sin fecha aparte', () => {
    const fam = (f, extra) => Object.assign({ key: 'k' + Math.random(), origen: 'propio', estado: 'cumplido', categoriaId: 'c-vida-familia', seccion: 'Vida', cumplidoEl: f, fecha: '' }, extra);
    const vista = [fam('2026-11-02'), fam('2026-11-05'), fam('2026-11-25'), fam('', { fecha: '2026-11-20' }), fam('2026-10-10'), fam('2026-10-11'),
      fam('', {}), fam('2026-11-03', { estado: 'pendiente' }),
      { key: 't1', origen: 'trimestral', estado: 'cumplido', categoriaId: 'c-x', seccion: 'Vida', cumplidoEl: '', fecha: '', periodoId: 't4-2026' }];
    const nov = R.repObjetivosPorCategoria(vista, R.repRango('mensual', '2026-11'));
    const oct = R.repObjetivosPorCategoria(vista, R.repRango('mensual', '2026-10'));
    expect(nov.porCategoria['c-vida-familia']).toBe(3);     // el plazo (fecha) no cuenta como cumplimiento
    expect(oct.porCategoria['c-vida-familia']).toBe(2);
    expect(R.repComparar(3, 2)).toMatchObject({ abs: 1, tono: 'verde' });   // spec: Familia 3 vs 2 → +1 verde
    expect(nov.sinFecha.map(o => o.key)).toContain('t1');   // trimestral sin fecha no cabe en un mes
    expect(nov.sinFecha.length).toBe(3);                    // los 2 propios sin cumplidoEl + el trimestral
    const t4 = R.repObjetivosPorCategoria(vista, R.repRango('trimestral', '2026-T4'));
    expect(t4.porCategoria['c-x']).toBe(1);                 // el trimestre completo sí lo contiene
  });
});

test.describe('reportes.js KPIs (puro, Node)', () => {
  const NOV = R.repRango('mensual', '2026-11'), OCT = R.repRango('mensual', '2026-10');
  const tx = (o) => Object.assign({ currency: 'ARS', date: '2026-11-03', amount: 0 }, o);
  const eco = () => ({
    hoy: '2026-11-20',
    cuentas: [
      { id: 'efe', type: 'cash', balance: 1000, currency: 'ARS' }, { id: 'ban', type: 'bank', balance: 5000, currency: 'ARS' },
      { id: 'bono', type: 'invest', balance: 2000, currency: 'ARS' }, { id: 'inv', type: 'invest', balance: 8000, currency: 'ARS' },
      { id: 'usd', type: 'cash', balance: 300, currency: 'USD' },
    ],
    accountHistory: [
      { date: '2026-09-30', accountId: 'usd', balance: 300 }, { date: '2026-10-31', accountId: 'usd', balance: 300 },
      { date: '2026-10-31', accountId: 'efe', balance: 900 }, { date: '2026-10-31', accountId: 'ban', balance: 4000 },
      { date: '2026-10-31', accountId: 'bono', balance: 1500 }, { date: '2026-10-31', accountId: 'inv', balance: 7000 },
    ],
    nwHistory: [{ date: '2026-09-30', value: 100000, c: 1 }, { date: '2026-10-31', value: 120000, c: 1 }, { date: '2026-11-20', value: 130300, c: 1 }],
    transactions: [
      tx({ id: 'f1', type: 'expense', amount: 3000, category: 'food', verdict: 'good' }),
      tx({ type: 'expense', amount: 1000, category: 'fun', verdict: 'bad', date: '2026-11-04' }),
      tx({ type: 'expense', amount: 2000, category: 'fun', date: '2026-11-01', cardChargeId: 'x', name: 'TV (2/3)', id: 'cc:x:2026-11' }),
      tx({ type: 'expense', amount: 500, currency: 'USD', category: 'food' }),
      tx({ type: 'income', amount: 20000, category: 'salary', date: '2026-11-05' }),
      tx({ type: 'income', amount: 100, refundOf: 'f1' }),   // reintegro de 100 sobre la comida: gasto neto
      tx({ type: 'income', amount: 5000, category: 'invest' }),
      tx({ type: 'expense', amount: 4000, category: 'food', date: '2026-10-10' }),
      tx({ type: 'expense', amount: 500, category: 'fun', date: '2026-10-12' }),
      tx({ type: 'income', amount: 18000, date: '2026-10-05' }),
    ],
    carteraTx: [
      { id: 'a', simbolo: 'AAA', cierra: true, fecha: '2026-11-02', resultado: 300, costo: 1000 }, { id: 'b', simbolo: 'BBB', cierra: true, fecha: '2026-11-10', resultado: -100, costo: 500 },
      { id: 'c', simbolo: 'CCC', cierra: true, fecha: '2026-10-05', resultado: 50, costo: 500 },
    ],
    cardCharges: [{ id: 'x', date: '2026-10-15', amount: 6000, mode: 'deferred', category: 'fun' }],   // compra anterior al período: no baja el patrimonio de noviembre
    budgets: { '2026-11': { fixed: [{ category: 'food', v1: 1, v2: 1, v3: 4000 }], reserved: [{ category: 'fun', amount: 1000 }] } },
    creditoUsado: 1000,
  });

  test('hábitos: parcial = medio punto y la comparación usa puntos', () => {
    const tr = { Salud: [{ id: 'h1', name: 'Gym', days: { '2026-11-02': 'done', '2026-11-03': 'partial', '2026-11-04': 'partial', '2026-10-05': 'done' } }] };
    const h = R.repHabitos(tr, NOV)[0];
    expect(h).toMatchObject({ done: 1, partial: 2, puntos: 2 });
    const c = R.repHabitosComparados(tr, NOV, OCT)[0];
    expect(c).toMatchObject({ puntos: 2, anterior: 1 });
    expect(c.comparacion).toMatchObject({ abs: 1, pct: 100, tono: 'verde' });
  });

  test('metas mensuales: objetivos "sin categoría" de su sección, solo meses completos', () => {
    const mg = { Vida: { '2026-11': [{ done: true }, { done: true }, { done: false }], '2026-10': [{ done: true }] }, Salud: { '2026-11': [{ done: true }] } };
    const r = R.repMetasMensuales(mg, NOV);
    expect(r.porCategoria).toEqual({ 'sin:Vida': 2, 'sin:Salud': 1 });
    const sem = R.repMetasMensuales(mg, R.repRango('semanal', '2026-W46'));
    expect(sem.porCategoria).toEqual({}); expect(sem.noAtribuibles).toBe(3);
    expect(R.repMetasMensuales(mg, R.repRango('trimestral', '2026-T4')).porCategoria['sin:Vida']).toBe(3);
  });

  test('economía: gastos, USD fuera, reintegros e inversión fuera, comparación menosEsMejor', () => {
    const k = R.repKpiEconomia(eco(), NOV, OCT);
    expect(k.gastos.valor).toBe(5900);               // 3000 + 1000 + 2000 - 100 de reintegro (gasto neto); el gasto en USD no suma
    expect(k.gastos.anterior).toBe(4500);
    expect(k.gastos.comparacion).toMatchObject({ abs: 1400, tono: 'rojo' });
    expect(k.gastos.porCategoria.find(c => c.categoria === 'fun')).toMatchObject({ valor: 3000, anterior: 500 });
    expect(k.tasaAhorro.valor).toBe(70.5);           // (20000 - 5900) / 20000: el reintegro baja el gasto y no suma a ingresos; tampoco el ingreso de inversión
    expect(k.tasaAhorro.anterior).toBe(75);
  });

  test('economía: activos líquidos sin USD; el bono cuenta si está en la lista de cuentas líquidas', () => {
    const d = eco();
    expect(R.repKpiEconomia(d, NOV, OCT).activosLiquidos.valor).toBe(6000);   // efectivo + banco; la cuenta USD no entra
    d.config = { cuentasLiquidas: ['bono'] };
    const k = R.repKpiEconomia(d, NOV, OCT);
    expect(k.activosLiquidos.valor).toBe(8000);      // + bono (2000)
    expect(k.activosLiquidos.anterior).toBe(6400);   // 900 + 4000 + 1500 desde accountHistory
    expect(k.pasivoMenosLiquidos.valor).toBe(1000 - 8000);   // crédito usado de hoy − líquidos
  });

  test('economía: pasivo − líquidos solo en el período en curso; fuera del historial → null', () => {
    const d = eco();
    expect(R.repKpiEconomia(d, OCT, R.repRango('mensual', '2026-09')).pasivoMenosLiquidos.valor).toBeNull();
    expect(R.repKpiEconomia(d, OCT, R.repRango('mensual', '2026-09')).pasivoMenosLiquidos.motivo).toMatch(/tarjeta/);
    const viejo = R.repKpiEconomia(d, R.repRango('mensual', '2025-01'), null);
    expect(viejo.activosLiquidos.valor).toBeNull();
    expect(viejo.activosLiquidos.motivo).toMatch(/historial/);
  });

  test('economía: patrimonio sin USD, parte explicada y resto; sin c:1 no es comparable', () => {
    const d = eco();
    const p = R.repKpiEconomia(d, NOV, OCT).patrimonio;
    expect(p).toMatchObject({ inicio: 119700, fin: 130000, valor: 10300 });   // se restan los 300 USD de nwHistory
    expect(p.explicado).toBe(21100);                 // ingresos 25100 − gastos 4000 (la cuota de tarjeta de 2000 no mueve saldo; la compra es de octubre)
    expect(p.resto).toBe(10300 - 21100);
    expect(p.motivoResto).toMatch(/no se puede atribuir/);
    d.nwHistory[1] = { date: '2026-10-31', value: 120000 };   // sin c:1
    const q = R.repKpiEconomia(d, NOV, OCT).patrimonio;
    expect(q.valor).toBeNull(); expect(q.motivo).toMatch(/no se pueden comparar/);
  });

  test('economía: movimientos entre cuentas no cambian gastos ni patrimonio', () => {
    const a = R.repKpiEconomia(eco(), NOV, OCT);
    const d = eco(); d.moves = [{ id: 'm', date: '2026-11-06', from: 'efe', to: 'ban', amount: 999 }];
    const b = R.repKpiEconomia(d, NOV, OCT);
    expect(b).toEqual(a);
    expect(b.gastos.valor).toBe(5900);
  });

  test('economía: inversiones realizadas (ganancia, %, aciertos) y no realizada null', () => {
    const k = R.repKpiEconomia(eco(), NOV, OCT).inversiones;
    expect(k.valor).toBe(200); expect(k.pct).toBe(13.3);
    expect(k.aciertos).toMatchObject({ valor: 50, ganadoras: 1, perdedoras: 1, neutras: 0, operaciones: 2 });
    expect(k.anterior).toBe(50);
    expect(k.noRealizada.valor).toBeNull(); expect(k.noRealizada.motivo).toBeTruthy();
    expect(k.montoInvertido.valor).toBe(10000);      // capital aportado: bono 2000 + inversión 8000
    const sin = R.repKpiEconomia(eco(), R.repRango('mensual', '2026-09'), null).inversiones;
    expect(sin.valor).toBeNull(); expect(sin.motivo).toMatch(/ventas/);
  });

  test('economía: presupuesto = gastado / presupuestado + excedidas; semanal → null', () => {
    const k = R.repKpiEconomia(eco(), NOV, OCT).presupuesto;
    expect(k.valor).toBe(118); expect(k.presupuestado).toBe(5000); // 5900 / 5000
    expect(k.excedidas).toEqual([{ categoria: 'fun', presupuesto: 1000, gastado: 3000 }]);
    expect(k.comparacion).toBeUndefined();           // octubre sin presupuesto: no se compara
    const sem = R.repKpiEconomia(eco(), R.repRango('semanal', '2026-W46'), null).presupuesto;
    expect(sem.valor).toBeNull(); expect(sem.motivo).toMatch(/mensual/);
  });

  test('economía: fondos del mes sin presupuesto cargado → valor no null (cuentan como presupuesto)', () => {
    const d = Object.assign(eco(), { budgets: {}, fondosMes: { '2026-11': 2000 } });
    const k = R.repKpiEconomia(d, NOV, OCT).presupuesto;
    expect(k.valor).not.toBeNull(); expect(k.presupuestado).toBe(2000);
    expect(R.repPresupuesto(eco(), R.repRango('mensual', '2026-10')).valor).toBeNull();   // sin presupuesto ni fondos: sigue null
  });

  test('economía: semanal separa las cuotas de tarjeta del día 1 con aviso', () => {
    const k = R.repKpiEconomia(Object.assign(eco(), { transactions: eco().transactions.concat([tx({ type: 'expense', amount: 500, category: 'food', date: '2026-10-28' })]) }), R.repRango('semanal', '2026-W44'), null).gastos;
    expect(k.valor).toBe(500); expect(k.cuotasTarjetaDia1.valor).toBe(2000); expect(k.aviso).toMatch(/día 1/);
  });

  test('economía: útiles vs inútiles, % clasificado y "poco clasificado"', () => {
    const u = R.repKpiEconomia(eco(), NOV, OCT).utilidad;
    expect(u).toMatchObject({ utiles: 3000, inutiles: 1000, valor: 25, pctClasificado: 67, pocoClasificado: false });
    const poco = R.repKpiEconomia({ transactions: [tx({ type: 'expense', amount: 100, verdict: 'good' }), tx({ type: 'expense', amount: 900 })] }, NOV, null).utilidad;
    expect(poco.pocoClasificado).toBe(true); expect(poco.aviso).toMatch(/Poco clasificado/);
    expect(R.repKpiEconomia({ transactions: [tx({ type: 'expense', amount: 100 })] }, NOV, null).utilidad.valor).toBeNull();
  });

  test('economía: ingresos 0 → tasa de ahorro null "sin ingresos"', () => {
    const k = R.repKpiEconomia({ transactions: [tx({ type: 'expense', amount: 100, category: 'food' })] }, NOV, null).tasaAhorro;
    expect(k.valor).toBeNull(); expect(k.motivo).toMatch(/Sin ingresos/);
  });

  test('economía: meses de cobertura = líquidos / gasto promedio de los 3 meses cerrados anteriores', () => {
    // Solo octubre tiene gasto (4500): con 1 mes de 3 no se promedia /3 (daría 6000/1500 = 4, inflado) → null con motivo
    const c = R.repKpiEconomia(eco(), NOV, null).cobertura;
    expect(c.valor).toBeNull(); expect(c.motivo).toMatch(/menos de 3 meses con gastos/);
    // Oct 4500 + sep 3000 + ago 1500 = 9000 / 3 = 3000 → 6000 / 3000 = 2
    const d = eco(); d.transactions.push(tx({ type: 'expense', amount: 3000, date: '2026-09-10' }), tx({ type: 'expense', amount: 1500, date: '2026-08-10' }));
    const c3 = R.repKpiEconomia(d, NOV, null).cobertura;
    expect(c3.valor).toBe(2); expect(c3.gastoPromedio).toBe(3000);
    expect(R.repKpiEconomia({ hoy: '2026-11-20', cuentas: [{ id: 'e', type: 'cash', balance: 10, currency: 'ARS' }], transactions: [] }, NOV, null).cobertura.valor).toBeNull();
  });

  test('economía: compra en cuotas con tarjeta baja el patrimonio entera el día de compra (explicada -3000, resto 0)', () => {
    // TV 3000 en 3 cuotas de 1000, comprada el 03/11: el crédito usado sube 3000 ese día → patrimonio 100000 → 97000.
    const d = { hoy: '2026-11-20', cuentas: [], nwHistory: [{ date: '2026-10-31', value: 100000, c: 1 }, { date: '2026-11-20', value: 97000, c: 1 }],
      cardCharges: [{ id: 'tv', date: '2026-11-03', amount: 3000, mode: 'nowInst' }, { id: 'adv', date: '2026-11-04', amount: 500, mode: 'advance' }],
      transactions: [tx({ type: 'expense', amount: 1000, cardChargeId: 'tv', name: 'TV (1/3)', date: '2026-11-03' })] };
    const p = R.repKpiEconomia(d, NOV, null).patrimonio;
    expect(p).toMatchObject({ valor: -3000, explicado: -3000, resto: 0 });   // la cuota (1000) no cuenta; la compra entera (3000) sí; el adelanto es neutro
    expect(p.motivoResto).toMatch(/ajustes de saldo/);
    d.cardCharges[0].cover = { who: 'Ana' }; d.transactions = [];   // cargo cubierto por otro: igual sube el crédito usado
    expect(R.repKpiEconomia(d, NOV, null).patrimonio.explicado).toBe(-3000);
  });

  test('economía: reintegro 30% sobre 10000 → gasto neto 7000 (gastos, presupuesto, tasa de ahorro); sigue fuera de ingresos', () => {
    const d = { hoy: '2026-11-20', transactions: [
      tx({ id: 'g1', type: 'expense', amount: 10000, category: 'food' }),
      tx({ type: 'income', amount: 3000, refundOf: 'g1', date: '2026-11-08' }),   // 30% de 10000
      tx({ type: 'income', amount: 20000, category: 'salary' })],
      budgets: { '2026-11': { fixed: [{ category: 'food', v1: 1, v2: 1, v3: 5000 }] } } };
    const k = R.repKpiEconomia(d, NOV, null);
    expect(k.gastos.valor).toBe(7000); expect(k.gastos.porCategoria[0]).toMatchObject({ categoria: 'food', valor: 7000 });
    expect(k.presupuesto).toMatchObject({ gastado: 7000, valor: 140, excedidas: [{ categoria: 'food', presupuesto: 5000, gastado: 7000 }] });   // 7000/5000
    expect(k.tasaAhorro).toMatchObject({ valor: 65, ingresos: 20000, gastos: 7000 });   // (20000 - 7000) / 20000
  });

  test('economía: semanal usa la misma base en gastos, utilidad y tasa de ahorro (cuota día 1 aparte); compra real un día 1 no', () => {
    const W = R.repRango('semanal', '2026-W44');   // 26/10 al 01/11
    const d = { transactions: [
      tx({ type: 'expense', amount: 500, category: 'food', date: '2026-10-28', verdict: 'bad' }),
      tx({ type: 'expense', amount: 2000, category: 'fun', date: '2026-11-01', cardChargeId: 'cu', name: 'TV (2/3)', verdict: 'bad' }),   // cuota de una compra de octubre
      tx({ type: 'expense', amount: 700, category: 'fun', date: '2026-11-01', cardChargeId: 'rea', name: 'Mesa (1/2)', verdict: 'bad' }),  // compra real hecha el día 1
      tx({ type: 'income', amount: 1000, date: '2026-10-30' })],
      cardCharges: [{ id: 'cu', date: '2026-10-05', amount: 6000 }, { id: 'rea', date: '2026-11-01', amount: 1400 }] };
    const k = R.repKpiEconomia(d, W, null);
    expect(k.gastos.valor).toBe(1200);               // 500 + 700 (la compra real); la cuota de 2000 va aparte
    expect(k.gastos.cuotasTarjetaDia1.valor).toBe(2000);
    expect(k.utilidad.inutiles).toBe(1200);
    expect(k.tasaAhorro).toMatchObject({ gastos: 1200, valor: -20 });   // (1000 - 1200) / 1000
  });

  test('economía: cuenta creada en noviembre → octubre se calcula con 0; sin ningún historial → null', () => {
    const d = eco(); d.cuentas.push({ id: 'nueva', type: 'cash', balance: 700, currency: 'ARS' });   // sin registros en accountHistory
    expect(R.repKpiEconomia(d, NOV, OCT).activosLiquidos.anterior).toBe(4900);   // octubre: efectivo 900 + banco 4000 + cuenta nueva 0
    const e = { hoy: '2026-11-20', cuentas: [{ id: 'e', type: 'cash', balance: 10, currency: 'ARS' }], accountHistory: [{ date: '2026-11-05', accountId: 'e', balance: 10 }] };
    expect(R.repKpiEconomia(e, OCT, null).activosLiquidos.valor).toBeNull();   // nadie tenía registro a fin de octubre
  });

  test('economía: patrimonio con el último registro previo a más de 7 días del inicio → null con motivo', () => {
    const d = eco(); d.nwHistory[1] = { date: '2026-10-20', value: 120000, c: 1 };   // 12 días antes del 01/11
    const p = R.repKpiEconomia(d, NOV, OCT).patrimonio;
    expect(p.valor).toBeNull(); expect(p.motivo).toMatch(/cerca del inicio/);
  });

  test('economía: patrimonio con el último registro a más de 7 días del final → null; a 3 días → calcula', () => {
    const d = eco(); d.hoy = '2026-12-15'; d.nwHistory[2] = { date: '2026-11-20', value: 130300, c: 1 };   // fin 30/11: 10 días
    const p = R.repKpiEconomia(d, NOV, OCT).patrimonio;
    expect(p.valor).toBeNull(); expect(p.motivo).toMatch(/cerca del final/);
    d.nwHistory[2] = { date: '2026-11-27', value: 130300, c: 1 };   // 3 días
    expect(R.repKpiEconomia(d, NOV, OCT).patrimonio.valor).not.toBeNull();
  });

  test('economía: compra anterior al resetAt de su tarjeta no cuenta como baja explicada; una posterior sí', () => {
    // Tarjeta arrancó el 05/11. Compra A 2000 (03/11, anterior) no cuenta; compra B 500 (10/11, posterior) sí → explicada = -500.
    const d = { hoy: '2026-11-20', cuentas: [], nwHistory: [{ date: '2026-10-31', value: 100000, c: 1 }, { date: '2026-11-20', value: 99500, c: 1 }],
      cards: [{ id: 'k1', resetAt: Date.UTC(2026, 10, 5, 12), resetDay: '2026-11-05' }],
      cardCharges: [{ id: 'a', cardId: 'k1', date: '2026-11-03', amount: 2000 }, { id: 'b', cardId: 'k1', date: '2026-11-10', amount: 500 }],
      transactions: [] };
    expect(R.repKpiEconomia(d, NOV, null).patrimonio).toMatchObject({ explicado: -500, resto: 0 });
    delete d.cards;   // sin tarjetas informadas, ambas cuentan: -2500
    expect(R.repKpiEconomia(d, NOV, null).patrimonio.explicado).toBe(-2500);
  });

  test('economía: aciertos por operación cerrada; resultado 0 queda fuera del denominador', () => {
    // AAA: venta parcial +300 y venta final -100 (cierra) = +200, una sola operación ganadora; BBB -50 perdedora; CCC 0 neutra; DDD abierta: no cuenta
    const d = { carteraTx: [
      { id: '1', ts: 1, simbolo: 'AAA', fecha: '2026-11-02', resultado: 300, costo: 1000, cierra: false },
      { id: '2', ts: 2, simbolo: 'AAA', fecha: '2026-11-05', resultado: -100, costo: 500, cierra: true },
      { id: '3', ts: 3, simbolo: 'BBB', fecha: '2026-11-06', resultado: -50, costo: 500, cierra: true },
      { id: '4', ts: 4, simbolo: 'CCC', fecha: '2026-11-07', resultado: 0, costo: 500, cierra: true },
      { id: '5', ts: 5, simbolo: 'DDD', fecha: '2026-11-08', resultado: 900, costo: 500, cierra: false }] };
    const a = R.repKpiEconomia(d, NOV, null).inversiones.aciertos;
    expect(a).toMatchObject({ valor: 50, ganadoras: 1, perdedoras: 1, neutras: 1, operaciones: 2 });   // 1 de 2 con resultado distinto de 0
  });

  test('economía: bono en cuentas líquidas no suma a monto invertido (ya está en líquidos)', () => {
    const d = eco(); d.config = { cuentasLiquidas: ['bono'] };
    const k = R.repKpiEconomia(d, NOV, OCT);
    expect(k.inversiones.montoInvertido.valor).toBe(8000);   // solo 'inv'; el bono (2000) está en líquidos
    expect(k.activosLiquidos.valor).toBe(8000);              // 1000 + 5000 + 2000
  });

  const conoc = () => ({
    lawProgress: { years: [{ subjects: [
      { id: 'a', done: true, doneAt: '2026-11-05', grade: 8 }, { id: 'b', done: true, doneAt: '2026-10-10', grade: 6 },
      { id: 'c', done: true, grade: 7 }, { id: 'd', done: false }] }] },
    finales: [{ fecha: '2026-11-10', done: true, aprobo: true, doneEl: '2026-11-10' }, { fecha: '2026-11-20' }, { fecha: '2026-10-15', done: true, doneEl: '2026-10-15' }],
    pomodoroHistory: [{ date: '2026-11-03', minutes: 120 }, { date: '2026-11-04', minutes: 60 }, { date: '2026-10-03', minutes: 60 }],
    studyDays: { '2026-11-02': 'done', '2026-11-03': 'studied', '2026-11-04': 'done', '2026-11-05': 'rest', '2026-11-06': 'done', '2026-11-07': 'missed', '2026-11-08': 'done' },
  });

  test('conocimiento: exámenes por mes, aviso de cantidad distinta y horas por examen', () => {
    expect(R.repExamenesPorMes(conoc().finales, R.repRango('trimestral', '2026-T4'))).toEqual({ '2026-10': 1, '2026-11': 2 });
    const k = R.repKpiConocimiento(conoc(), NOV, OCT);
    expect(k.examenes).toMatchObject({ valor: 2, anterior: 1, aviso: 'Este período tuvo 2 exámenes y el anterior 1' });
    expect(k.horasEstudio).toMatchObject({ valor: 3, anterior: 1, etiqueta: 'horas cronometradas' });
    expect(k.horasEstudio.comparacion.aviso).toBe('Este período tuvo 2 exámenes y el anterior 1');
    expect(k.horasPorExamen).toMatchObject({ valor: 1.5, anterior: 1 });
    expect(k.sesionesPomodoro).toMatchObject({ valor: 2, anterior: 1 });
    const sinAnt = R.repKpiConocimiento(conoc(), NOV, R.repRango('mensual', '2026-09'));
    expect(sinAnt.horasPorExamen).toBeNull();        // el anterior no tuvo exámenes
    const igual = conoc(); igual.finales.push({ fecha: '2026-10-20' });
    expect(R.repKpiConocimiento(igual, NOV, OCT).examenes.aviso).toBeUndefined();
  });

  test('conocimiento: final aprobado cuenta en el mes del examen, no del clic (30/10 marcado el 02/11 → octubre)', () => {
    const d = { finales: [{ fecha: '2026-10-30', done: true, aprobo: true, doneEl: '2026-11-02' }] };
    expect(R.repKpiConocimiento(d, NOV, OCT).finalesAprobados).toMatchObject({ valor: 0, anterior: 1 });
  });

  test('conocimiento: materias, finales, promedios, avance y racha', () => {
    const k = R.repKpiConocimiento(conoc(), NOV, OCT);
    expect(k.materiasFinalizadas).toMatchObject({ valor: 1, anterior: 1, sinFecha: 1, aviso: '1 sin fecha' });
    expect(k.finalesAprobados.valor).toBe(1);
    expect(k.promedioPeriodo.valor).toBe(8);
    expect(k.promedioCarrera.valor).toBe(7);         // 8, 6 y la de sin fecha (7) al cierre de noviembre
    expect(k.promedioCarrera.anterior).toBe(6.5);
    expect(k.avanceCarrera.valor).toBe(75);
    expect(k.rachaEstudio.valor).toBe(4);            // 02,03,04, descanso neutro, 06; el 07 corta
    expect(R.repKpiConocimiento(conoc(), R.repRango('mensual', '2026-09'), null).promedioPeriodo.motivo).toMatch(/notas/);
  });

  test('foco: promedios con cantidad de días, pantalla solo semanas completas, chequeos, cruces con mínimo', () => {
    const F = require('../foco.js');
    const datos = { foco: {
      dias: { '2026-11-02': { atencion: 4, energia: 3 }, '2026-11-03': { atencion: 2, energia: 5 }, '2026-10-30': { atencion: 1, energia: 1 }, '2026-11-04': { atencion: 9, energia: 9 } },
      pantalla: { '2026-10-26': 99, '2026-11-02': 20, '2026-11-09': 30 },
      chequeos: ['estudio', 'estudio', 'gym', 'otro', 'pantalla'].map(c => ({ fecha: '2026-11-05', hora: '11:00', categoria: c, energia: 3 })),
    } };
    const k = R.repFoco(datos, NOV, { foArmarCruces: F.foArmarCruces });
    expect(k.atencion).toEqual({ valor: 3, dias: 2 }); expect(k.energia).toEqual({ valor: 4, dias: 2 });   // el 9 es inválido; el 10-30 es de otro mes
    expect(k.pantalla).toMatchObject({ valor: 25, semanas: 2 });
    expect(k.chequeos.n).toBe(5); expect(k.chequeos.filas[0]).toMatchObject({ categoria: 'estudio', n: 2, pct: 40 });
    expect(k.cruces.every(c => c.estado === 'faltan')).toBe(true);   // 2 días < mínimo de 10
    expect(R.repFoco({ foco: {} }, NOV, {}).atencion.valor).toBeNull();
    expect(R.repFoco({ foco: { chequeos: datos.foco.chequeos.slice(0, 2) } }, NOV).chequeos.valor).toBeNull();
    // Con período anterior (octubre: solo el 30 con 1/1): atención 3 vs 1 = +2 (+200%); energía 4 vs 1 = +3 (+300%). Cálculo a mano.
    const OCT = R.repRango('mensual', '2026-10'), conAnt = R.repFoco(datos, NOV, OCT, { foArmarCruces: F.foArmarCruces });
    expect(conAnt.atencion).toMatchObject({ valor: 3, dias: 2, anterior: 1, diasAnterior: 1, comparacion: { abs: 2, pct: 200, tono: 'verde' } });
    expect(conAnt.energia).toMatchObject({ valor: 4, dias: 2, anterior: 1, diasAnterior: 1, comparacion: { abs: 3, pct: 300, tono: 'verde' } });
    expect(conAnt.pantalla).toMatchObject({ valor: 25, semanas: 2 });
    // Sin días en el anterior (septiembre vacío): sin comparación, con motivo y sin inventar 0.
    const sinAnt = R.repFoco(datos, NOV, R.repRango('mensual', '2026-09'));
    expect(sinAnt.atencion).toEqual({ valor: 3, dias: 2, motivo: 'Sin registros en el período anterior' });
    expect(sinAnt.atencion.comparacion).toBeUndefined(); expect(sinAnt.energia.anterior).toBeUndefined();
  });
});

test.describe('fechas de cumplimiento (app)', () => {
  test('principios.guardarObjetivo guarda y borra cumplidoEl', async ({ cmPage }) => {
    const r = await cmPage.evaluate(() => {
      const val = (id, v) => { let e = document.getElementById(id); if (!e) { e = document.createElement('input'); e.id = id; document.body.appendChild(e); } e.value = v; };
      const d = _prData(); d.objetivos = [];
      const guardar = est => {
        val('pro-texto', 'Obj de prueba'); val('pro-hor', 'mensual'); val('pro-est', est); val('pro-fecha', '');
        val('pro-sec', 'Vida'); val('pro-cat', ''); val('pro-padre', '');
      };
      _prDraft = { origen: 'propio', nuevo: true, key: '', texto: '', horizonte: 'mensual', seccion: 'Vida', categoriaId: '', estado: 'pendiente', fecha: '', padreKey: '', principiosIds: [], habitosIds: [] };
      guardar('cumplido'); Principios.guardarObjetivo();
      const id = d.objetivos[0].id, hoy = _prHoyLocal();
      const a = d.objetivos[0].cumplidoEl;
      d.objetivos[0].cumplidoEl = '2020-01-02';   // fecha original: re-guardar no la pisa
      _prDraft = Object.assign({}, _prVista().find(x => x.key === id), { nuevo: false, principiosIds: [], habitosIds: [] });
      guardar('cumplido'); Principios.guardarObjetivo();
      const b = d.objetivos[0].cumplidoEl;
      _prDraft = Object.assign({}, _prVista().find(x => x.key === id), { nuevo: false, principiosIds: [], habitosIds: [] });
      guardar('pendiente'); Principios.guardarObjetivo();
      const c = d.objetivos[0].cumplidoEl;
      // cumplido previo a T1 (sin cumplidoEl): re-guardar no inventa la fecha de hoy
      delete d.objetivos[0].cumplidoEl; d.objetivos[0].estado = 'cumplido';
      _prDraft = Object.assign({}, _prVista().find(x => x.key === id), { nuevo: false, principiosIds: [], habitosIds: [] });
      guardar('cumplido'); Principios.guardarObjetivo();
      const e = d.objetivos[0].cumplidoEl;
      d.objetivos = [];
      return { hoy, a, b, c, e };
    });
    expect(r.a).toBe(r.hoy);
    expect(r.a).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.b).toBe('2020-01-02');
    expect(r.c).toBeUndefined();
    expect(r.e).toBeUndefined();
  });

  test('toggleQObj guarda y borra doneAt', async ({ cmPage }) => {
    const r = await cmPage.evaluate(() => {
      S.quarterlyObjectives = { activePeriod: 'tx', periods: [{ id: 'tx', label: 'TX', flat: false, note: null, objectives: [{ id: 'o1', text: 'x', category: 'Vida', done: false }] }] };
      const o = S.quarterlyObjectives.periods[0].objectives[0];
      toggleQObj('tx', 'o1'); const a = o.doneAt, hecho = o.done;
      toggleQObj('tx', 'o1');
      return { a, hecho, b: o.doneAt, hoy: _prHoyLocal(), enVista: null };
    });
    expect(r.hecho).toBe(true);
    expect(r.a).toBe(r.hoy);
    expect(r.b).toBeUndefined();
  });
});

test.describe('reportes.js textos, conversión e historial (puro, Node)', () => {
  const item = (o) => Object.assign(R.repItemNuevo('mensual', '2026-11'), o);
  test('repItemNuevo / repItemCompletar: defaults seguros y documento viejo no rompe', () => {
    const n = R.repItemNuevo('mensual', '2026-11');
    expect(n.desde).toBe('2026-11-01'); expect(n.hasta).toBe('2026-11-30');
    expect(Object.keys(n.estancamientos)).toEqual(['Vida', 'Salud', 'Conocimiento', 'Economía', 'IA']);
    expect(n.veredicto.ia).toEqual({ estado: 'pendiente', texto: '', el: null });
    const viejo = { periodo: 'mensual', clave: '2026-11', estancamientos: { Vida: 'x' }, veredicto: null };
    R.repItemCompletar(viejo);
    expect(viejo.estancamientos.Vida).toBe('x'); expect(viejo.estancamientos.IA).toBe(''); expect(viejo.aprendizajes).toEqual([]); expect(viejo.veredicto.manual).toBeNull();
    expect(R.repItemKey('semanal', '2026-W46')).toBe('semanal:2026-W46');
  });
  test('contenido, resumen e historial (solo con algo escrito, más reciente primero)', () => {
    expect(R.repItemTieneContenido(R.repItemNuevo('mensual', '2026-11'))).toBe(false);
    const a = item({ editadoEn: '2026-11-10T10:00:00Z' }); a.estancamientos.Vida = 'algo';
    const b = R.repItemNuevo('mensual', '2026-10'); b.editadoEn = '2026-11-12T10:00:00Z'; b.aprendizajes.push({ id: 'x' }, { id: 'y' }); b.veredicto.manual = { texto: 'bien', el: 'z' };
    const vacio = R.repItemNuevo('mensual', '2026-09'); vacio.editadoEn = '2026-11-13T10:00:00Z';
    expect(R.repResumenItem(b)).toEqual(['aprendizajes 2', 'veredicto']); expect(R.repResumenItem(a)).toEqual(['textos']);
    expect(R.repHistorial({ 'mensual:2026-11': a, 'mensual:2026-10': b, 'mensual:2026-09': vacio }).map(i => i.clave)).toEqual(['2026-10', '2026-11']);
    const roto = { periodo: 'mensual', clave: 'basura', editadoEn: '2026-11-14T10:00:00Z', agradecimientos: 'x' };   // clave sin rango: no se lista
    expect(R.repHistorial({ 'mensual:basura': roto, 'mensual:2026-11': a }).map(i => i.clave)).toEqual(['2026-11']);
  });
  test('conflicto de edición: compara lo guardado contra lo que había al abrir', () => {
    expect(R.repHayConflicto(null, undefined)).toBe(false);
    expect(R.repHayConflicto(null, { editadoEn: 'A' })).toBe(true);
    expect(R.repHayConflicto('A', { editadoEn: 'A' })).toBe(false);
    expect(R.repHayConflicto('A', { editadoEn: 'B' })).toBe(true);
  });
  test('horizonte por período y conversión idempotente (principio y objetivo)', () => {
    expect(['semanal', 'mensual', 'trimestral', 'semestral', 'anual'].map(R.repHorizonteDe)).toEqual(['mensual', 'mensual', 'trimestral', 'anual', 'anual']);
    const it = item(); const fila = { id: 'f1', seccion: 'Salud', error: 'e', aprendizaje: 'porque', propuesta: 'hacer X', convertidoA: null };
    const data = { principios: [], objetivos: [] }; let n = 0; const id = () => 'id' + (++n);
    const r1 = R.repConvertirFila(data, it, fila, 'principio', 'Reporte Noviembre 2026', id);
    expect(r1).toEqual({ creado: true, tipo: 'principio', id: 'id1' });
    expect(data.principios[0]).toMatchObject({ enunciado: 'hacer X', porque: 'porque', fuente: 'Reporte Noviembre 2026', seccion: 'Salud', origen: { reporte: 'mensual:2026-11', filaId: 'f1' } });
    // otra vez, y desde "otro dispositivo" (fila sin convertidoA): no duplica
    fila.convertidoA = null;
    expect(R.repConvertirFila(data, it, fila, 'principio', 'x', id).creado).toBe(false);
    expect(R.repConvertirFila(data, it, fila, 'objetivo', 'x', id)).toMatchObject({ creado: false, tipo: 'principio' });
    expect(data.principios).toHaveLength(1); expect(data.objetivos).toHaveLength(0);
    const f2 = { id: 'f2', seccion: 'IA', propuesta: 'obj', aprendizaje: '', error: '', convertidoA: null };
    expect(R.repConvertirFila(data, item({ periodo: 'semestral', clave: '2026-S2' }), f2, 'objetivo', 'x', id).creado).toBe(true);
    expect(data.objetivos[0]).toMatchObject({ texto: 'obj', horizonte: 'anual', seccion: 'IA', estado: 'pendiente', origen: { filaId: 'f2' } });
    expect(R.repConvertirFila(data, it, { id: 'f3', propuesta: '  ' }, 'principio', 'x', id).error).toBeTruthy();
  });
});
