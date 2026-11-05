// Rendimiento como inversor (rendimiento-calc.js + rendimiento.js + pestaña de cartera-overlay.js).
// Parte 1: cálculo puro contra valores hechos a mano (Node, sin navegador). Parte 2: la pestaña en la app, con el Worker y las
// fuentes mockeadas con page.route. Todo es inventado: ninguna posición, precio ni cuenta real.
'use strict';
const path = require('path');
const { test, expect } = require('./support/fixtures');
const C = require(path.join(__dirname, '..', 'rendimiento-calc.js'));

const cerca = (a, b, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol);

test.describe('cálculo de rendimiento (puro)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'cálculo puro: una sola vez'); });

  // MEP inventado: 1000 el día base, 1250 hoy.
  const MEP = { serie: [{ fecha: '2026-11-04', venta: 1000 }], actual: { fecha: '2026-12-04', venta: 1250 } };
  const BASE = { fecha: '2026-11-04', posiciones: [{ simbolo: 'X', tipo: 'CEDEARS', cantidad: 100, precioBase: 100 }], efectivo: { ARS: 0, USD: 0 } };
  const actual = (pos, ars) => ({ fecha: '2026-12-04', posiciones: pos ? [{ simbolo: 'X', cantidad: pos[0], valorizado: pos[1] }] : [], efectivo: { ARS: ars || 0, USD: 0 } });
  const venta = (q, monto) => ({ numero: 1, fecha: '2026-11-20', tipo: 'venta', simbolo: 'X', cantidad: q, monto, comision: 0, moneda: 'ARS' });

  test('Modified Dietz: 1000 → 1650 con un aporte de 500 a mitad del período da 150 / (1000 + 250) = 12%', () => {
    cerca(C.modifiedDietz(1000, 1650, [{ dia: 50, monto: 500 }], 100), 0.12);
  });

  test('un aporte a mitad de período NO infla el TWR: 1000 + 1000 aportados, mercado quieto → 0%, no +100%', () => {
    cerca(C.modifiedDietz(1000, 2000, [{ dia: 50, monto: 1000 }], 100), 0);
    // Y si el mercado sube 10% en la segunda mitad sobre los 2000: 200 / (1000 + 500) = 13,33%
    cerca(C.modifiedDietz(1000, 2200, [{ dia: 50, monto: 1000 }], 100), 200 / 1500);
  });

  test('un retiro también se descuenta: 2000 → 1100 con un retiro de 1000 a mitad (mercado +10%) da 100 / 1500', () => {
    cerca(C.modifiedDietz(2000, 1100, [{ dia: 50, monto: -1000 }], 100), 100 / 1500);
  });

  test('XIRR: 1000 → 1210 en 730 días es 10% anual (21% en el período)', () => {
    const r = C.xirr([{ dia: 0, monto: -1000 }, { dia: 730, monto: 1210 }], 730);
    cerca(r.anual, 0.10, 1e-9);
    cerca(r.periodo, 0.21, 1e-9);
  });

  test('XIRR con un aporte: 1000 + 1000 al año, 2310 a los 2 años es 10% anual exacto', () => {
    const r = C.xirr([{ dia: 0, monto: -1000 }, { dia: 365, monto: -1000 }, { dia: 730, monto: 2310 }], 730);
    cerca(r.anual, 0.10, 1e-9);
  });

  test('XIRR sin flujos de signos opuestos o sin días no se inventa: devuelve null', () => {
    expect(C.xirr([{ dia: 0, monto: -1000 }], 10)).toBeNull();
    expect(C.xirr([{ dia: 0, monto: -1000 }, { dia: 0, monto: 1100 }], 0)).toBeNull();
    expect(C.xirr([{ dia: 0, monto: 1000 }, { dia: 10, monto: 1100 }], 10)).toBeNull();
  });

  test('el caso del pedido: una posición que sube 45% y se vende NO cambia el resultado total, solo pasa de no realizado a realizado', () => {
    // 100 u. a 100 (cierre base) = 10.000. Hoy valen 145.
    const sinVender = C.calcular({ base: BASE, actual: actual([100, 14500]), mep: MEP, moneda: 'ARS', hoy: '2026-12-04' });
    expect(sinVender).toMatchObject({ resultado: 4500, noRealizado: 4500, realizado: 0 });
    // Vende todo a 145: el efectivo pasa a 14.500.
    const vendido = C.calcular({ base: BASE, operaciones: [venta(100, 14500)], actual: actual(null, 14500), mep: MEP, moneda: 'ARS', hoy: '2026-12-04' });
    expect(vendido).toMatchObject({ resultado: 4500, noRealizado: 0, realizado: 4500 });
    expect(vendido.ventas).toHaveLength(1);
    expect(vendido.ventas[0]).toMatchObject({ simbolo: 'X', cantidad: 100, ganancia: 4500 });
    cerca(vendido.ventas[0].pct, 0.45);
    // Vende la mitad: 7250 realizado en caja (2250 de ganancia) + 50 u. que valen 7250 (2250 sin realizar).
    const mitad = C.calcular({ base: BASE, operaciones: [venta(50, 7250)], actual: actual([50, 7250], 7250), mep: MEP, moneda: 'ARS', hoy: '2026-12-04' });
    expect(mitad).toMatchObject({ resultado: 4500, realizado: 2250, noRealizado: 2250 });
    cerca(mitad.otros, 0);
    // El rendimiento del que vendió es el mismo que el del que no vendió: 45%.
    cerca(sinVender.twr, 0.45); cerca(vendido.twr, 0.45); cerca(mitad.twr, 0.45);
    expect(mitad.advertencias).toEqual([]);
  });

  test('el costo de una venta es el promedio ponderado: base 10 a 100, compra 10 a 200, vende 10 a 300 → costo 150, ganancia 1500', () => {
    const base = { fecha: '2026-11-04', posiciones: [{ simbolo: 'X', tipo: 'CEDEARS', cantidad: 10, precioBase: 100 }], efectivo: { ARS: 5000, USD: 0 } };
    const ops = [
      { numero: 1, fecha: '2026-11-10', tipo: 'compra', simbolo: 'X', cantidad: 10, monto: 2000, comision: 20, moneda: 'ARS' },
      { numero: 2, fecha: '2026-11-15', tipo: 'venta', simbolo: 'X', cantidad: 10, monto: 3000, comision: 30, moneda: 'ARS' },
    ];
    // Efectivo: 5000 − 2000 − 20 + 3000 − 30 = 5950. Quedan 10 u. a 300 = 3000.
    const r = C.calcular({ base, operaciones: ops, actual: { fecha: '2026-12-04', posiciones: [{ simbolo: 'X', cantidad: 10, valorizado: 3000 }], efectivo: { ARS: 5950, USD: 0 } }, mep: MEP, moneda: 'ARS', hoy: '2026-12-04' });
    expect(r.ventas[0]).toMatchObject({ costo: 1500, ganancia: 1500 });
    expect(r.realizado).toBe(1500);
    expect(r.noRealizado).toBe(1500); // 3000 − costo 1500 de las 10 que quedan
    expect(r.comisiones).toBe(50);
    expect(r.resultado).toBe(2950);   // 1500 + 1500 − 50
    cerca(r.otros, 0);
  });

  test('las operaciones del mismo día de la base solo cuentan si son posteriores a la hora en que se tomó la base', () => {
    const base = { ...BASE, tomadoEn: '2026-11-04T15:00:00Z' }; // 12:00 hora de Argentina
    const ops = [
      { numero: 1, fecha: '2026-11-04', fechaHora: '2026-11-04T10:00:00', tipo: 'compra' }, // 10:00 ART: ya estaba en la base
      { numero: 2, fecha: '2026-11-04', fechaHora: '2026-11-04T14:00:00', tipo: 'compra' }, // 14:00 ART: posterior
      { numero: 3, fecha: '2026-11-04', fechaHora: null, tipo: 'compra' },                   // sin hora: no se sabe → no cuenta
      { numero: 4, fecha: '2026-11-05', fechaHora: null, tipo: 'compra' },
      { numero: 5, fecha: '2026-11-03', fechaHora: '2026-11-03T10:00:00', tipo: 'compra' },
    ];
    expect(C.filtrarOperaciones(ops, base).map(o => o.numero)).toEqual([2, 4]);
  });

  test('conversión a MEP: lo que no se mueve en pesos pierde 20% en dólares cuando el MEP sube de 1000 a 1250', () => {
    const base = { fecha: '2026-11-04', posiciones: [{ simbolo: 'X', tipo: 'CEDEARS', cantidad: 100, precioBase: 10000 }], efectivo: { ARS: 0, USD: 0 } };
    const ars = C.calcular({ base, actual: actual([100, 1000000]), mep: MEP, moneda: 'ARS', hoy: '2026-12-04' });
    const usd = C.calcular({ base, actual: actual([100, 1000000]), mep: MEP, moneda: 'USD', hoy: '2026-12-04' });
    expect(ars.resultado).toBe(0);
    expect(usd.v0).toBe(1000);   // 1.000.000 / 1000
    expect(usd.vFin).toBe(800);  // 1.000.000 / 1250
    expect(usd.resultado).toBe(-200);
    cerca(usd.twr, -0.2);
    // Sin MEP la vista en dólares no inventa nada: falla con un mensaje.
    expect(() => C.calcular({ base, actual: actual([100, 1000000]), mep: { serie: [] }, moneda: 'USD', hoy: '2026-12-04' })).toThrow(/MEP/);
  });

  test('en dólares cada flujo va al MEP de SU fecha: aporte de 1.100.000 ARS con MEP 1100 son 1000 USD', () => {
    const base = { fecha: '2026-11-04', posiciones: [], efectivo: { ARS: 1000000, USD: 0 } };
    const mep = { serie: [{ fecha: '2026-11-04', venta: 1000 }, { fecha: '2026-11-20', venta: 1100 }], actual: { fecha: '2026-12-04', venta: 1100 } };
    const r = C.calcular({
      base, mep, moneda: 'USD', hoy: '2026-12-04',
      actual: { fecha: '2026-12-04', posiciones: [], efectivo: { ARS: 2100000, USD: 0 } },
      flujos: [{ id: 'a', fecha: '2026-11-20', tipo: 'aporte', monto: 1100000, moneda: 'ARS' }],
    });
    expect(r.v0).toBe(1000);
    expect(r.aportesNetos).toBe(1000);
    // Valor final 2.100.000 / 1100 = 1909,09; menos 1000 de V0 y 1000 aportados = −90,91 (el peso se devaluó contra el MEP).
    cerca(r.resultado, 2100000 / 1100 - 2000, 1e-9);
    // Un flujo cargado en USD no se vuelve a convertir.
    const r2 = C.calcular({
      base, mep, moneda: 'USD', hoy: '2026-12-04',
      actual: { fecha: '2026-12-04', posiciones: [], efectivo: { ARS: 1000000, USD: 500 } },
      flujos: [{ id: 'b', fecha: '2026-11-20', tipo: 'aporte', monto: 500, moneda: 'USD' }],
    });
    expect(r2.aportesNetos).toBe(500);
  });

  test('bonos y letras: la cantidad son nominales y el precio de IOL es por lote de 100 (unitario = precio / 100)', () => {
    expect(C.esLote100('TIT. PUBLICOS')).toBe(true);
    expect(C.esLote100('Letras')).toBe(true);
    expect(C.esLote100('ONS')).toBe(true);
    expect(C.esLote100('CEDEARS')).toBe(false);
    expect(C.esLote100('ACCIONES')).toBe(false);
    const base = { fecha: '2026-11-04', posiciones: [{ simbolo: 'BONO', tipo: 'TIT. PUBLICOS', cantidad: 100000, precioBase: 120 }], efectivo: { ARS: 0, USD: 0 } };
    // 100.000 nominales a 120 por cada 100 = 120.000. Hoy a 126 → 126.000.
    const r0 = C.calcular({ base, actual: { fecha: '2026-12-04', posiciones: [{ simbolo: 'BONO', cantidad: 100000, valorizado: 126000 }], efectivo: { ARS: 0, USD: 0 } }, mep: MEP, moneda: 'ARS', hoy: '2026-12-04' });
    expect(r0.v0).toBe(120000);
    expect(r0.noRealizado).toBe(6000);
    // Vende 40.000 nominales a 125 por 100 → cobra 50.000; costo 40.000 × 1,20 = 48.000 → ganancia 2.000.
    const op = { numero: 1, fecha: '2026-11-20', tipo: 'venta', simbolo: 'BONO', cantidad: 40000, monto: 50000, comision: 0, moneda: 'ARS' };
    const r1 = C.calcular({ base, operaciones: [op], actual: { fecha: '2026-12-04', posiciones: [{ simbolo: 'BONO', cantidad: 60000, valorizado: 75600 }], efectivo: { ARS: 50000, USD: 0 } }, mep: MEP, moneda: 'ARS', hoy: '2026-12-04' });
    expect(r1.ventas[0]).toMatchObject({ costo: 48000, ganancia: 2000 });
    expect(r1.noRealizado).toBe(3600); // 75.600 − 60.000 × 1,20
    expect(r1.resultado).toBe(5600);   // 125.600 − 120.000
    cerca(r1.otros, 0);
  });

  test('sin precio de cierre el costo usa el intradía y lo avisa como aproximado', () => {
    const base = { fecha: '2026-11-04', posiciones: [{ simbolo: 'X', tipo: 'CEDEARS', cantidad: 10, precioIntradia: 100 }], efectivo: { ARS: 0, USD: 0 } };
    const r = C.calcular({ base, actual: { fecha: '2026-12-04', posiciones: [{ simbolo: 'X', cantidad: 10, valorizado: 1100 }], efectivo: { ARS: 0, USD: 0 } }, mep: MEP, moneda: 'ARS', hoy: '2026-12-04' });
    expect(r.v0).toBe(1000);
    expect(r.advertencias.map(a => a.codigo)).toContain('base-aprox');
  });

  test('dividendos y rentas suman al resultado, y los aportes y retiros no son ganancia', () => {
    const base = { fecha: '2026-11-04', posiciones: [{ simbolo: 'X', tipo: 'CEDEARS', cantidad: 10, precioBase: 100 }], efectivo: { ARS: 0, USD: 0 } };
    const ops = [{ numero: 1, fecha: '2026-11-20', tipo: 'dividendo', simbolo: 'X', monto: 50, moneda: 'ARS' }];
    const sin = C.calcular({ base, operaciones: ops, actual: { fecha: '2026-12-04', posiciones: [{ simbolo: 'X', cantidad: 10, valorizado: 1000 }], efectivo: { ARS: 50, USD: 0 } }, mep: MEP, moneda: 'ARS', hoy: '2026-12-04' });
    expect(sin).toMatchObject({ rentas: 50, resultado: 50 });
    // Aporte de 500 el 20/11: el efectivo sube a 550 pero el resultado sigue en 50.
    const con = C.calcular({ base, operaciones: ops, flujos: [{ id: 'a', fecha: '2026-11-20', tipo: 'aporte', monto: 500, moneda: 'ARS' }], actual: { fecha: '2026-12-04', posiciones: [{ simbolo: 'X', cantidad: 10, valorizado: 1000 }], efectivo: { ARS: 550, USD: 0 } }, mep: MEP, moneda: 'ARS', hoy: '2026-12-04' });
    expect(con.resultado).toBe(50);
    expect(con.aportesNetos).toBe(500);
    cerca(con.otros, 0);
  });

  test('inflación: el mes de la base se prorratea por los días que quedan; sin IPC del mes de la base no se compara', () => {
    // Base 04/11 en un mes de 30 días: quedan 26/30. IPC de noviembre 3% → 1,03^(26/30) − 1 = 2,5949%.
    const r = C.inflacionAcum([{ mes: '2026-11', pct: 3 }], '2026-11-04');
    cerca(r.valor, 0.025948580077686634, 1e-12);
    expect(r).toMatchObject({ hasta: '2026-11', meses: 1 });
    // Con diciembre publicado (2%) se compone: 1,02593 × 1,02 − 1.
    const r2 = C.inflacionAcum([{ mes: '2026-11', pct: 3 }, { mes: '2026-12', pct: 2 }], '2026-11-04');
    cerca(r2.valor, Math.pow(1.03, 26 / 30) * 1.02 - 1, 1e-12);
    expect(r2.hasta).toBe('2026-12');
    // Último dato publicado: septiembre. La base es noviembre → no hay dato del período.
    expect(C.inflacionAcum([{ mes: '2026-09', pct: 1.9 }], '2026-11-04')).toMatchObject({ sinDato: true });
    // Un mes faltante corta la cadena (no se salta octubre).
    expect(C.inflacionAcum([{ mes: '2026-11', pct: 3 }, { mes: '2027-01', pct: 2 }], '2026-11-04').hasta).toBe('2026-11');
  });

  test('CPI de EE.UU.: la variación mensual sale de los niveles consecutivos', () => {
    const m = C.nivelesAMensual([{ mes: '2026-08', nivel: 100 }, { mes: '2026-09', nivel: 101 }, { mes: '2026-11', nivel: 103 }]);
    expect(m).toHaveLength(1); // 2026-10 no está: noviembre no se puede encadenar
    expect(m[0].mes).toBe('2026-09');
    cerca(m[0].pct, 1, 1e-9);
  });

  test('S&P 500: retorno entre el cierre de la base y la última barra; en pesos, cada punta al MEP de su fecha', () => {
    const spy = [{ fecha: '2026-11-04', close: 500, adj: 500 }, { fecha: '2026-12-04', close: 520, adj: 525 }];
    const usd = C.retornoSpy(spy, '2026-11-04', 'USD', MEP);
    cerca(usd.valor, 0.05);
    expect(usd).toMatchObject({ desde: '2026-11-04', hasta: '2026-12-04' });
    cerca(C.retornoSpy(spy, '2026-11-04', 'ARS', MEP).valor, (525 * 1250) / (500 * 1000) - 1);
    expect(C.retornoSpy([], '2026-11-04', 'USD', MEP)).toMatchObject({ sinDato: true });
    // La barra más cercana anterior a la base a más de 5 días no sirve.
    expect(C.retornoSpy([{ fecha: '2026-10-20', adj: 1 }, { fecha: '2026-12-04', adj: 2 }], '2026-11-04', 'USD', MEP)).toMatchObject({ sinDato: true });
  });

  test('acumulado desde un punto de partida propio: sin serie, o con serie que no pasa de la fecha, queda el punto de partida', () => {
    expect(C.acumuladoDesdeInicial(0.095, '2026-11-04', null)).toEqual({ pct: 0.095, hasta: '2026-11-04' });
    expect(C.acumuladoDesdeInicial(0.095, '2026-11-04', [])).toEqual({ pct: 0.095, hasta: '2026-11-04' });
    // La serie termina antes de la fecha de partida, o justo en ella: no hay nada que encadenar.
    expect(C.acumuladoDesdeInicial(0.095, '2026-11-04', [['2026-01-01', 0], ['2026-11-03', 0.05]])).toEqual({ pct: 0.095, hasta: '2026-11-04' });
    expect(C.acumuladoDesdeInicial(0.095, '2026-11-04', [['2026-01-01', 0], ['2026-11-04', 0.05]])).toEqual({ pct: 0.095, hasta: '2026-11-04' });
    // Sin ningún punto en o antes de la fecha de partida tampoco se puede encadenar.
    expect(C.acumuladoDesdeInicial(0.095, '2026-11-04', [['2026-11-10', 0.01]])).toEqual({ pct: 0.095, hasta: '2026-11-04' });
  });

  test('acumulado: (1 + 9,5%) × (1 + twr final) / (1 + twr de la fecha de partida) − 1', () => {
    const r = C.acumuladoDesdeInicial(0.095, '2026-11-04', [['2026-01-01', 0], ['2026-11-04', 0.05], ['2026-11-05', 0.06], ['2026-11-06', 0.071]]);
    cerca(r.pct, 1.095 * 1.071 / 1.05 - 1);
    expect(r.hasta).toBe('2026-11-06');
    // Fecha de partida sin punto exacto (fin de semana, feriado): se toma el último punto anterior; y la serie desordenada se ordena.
    const r2 = C.acumuladoDesdeInicial(0.095, '2026-11-04', [['2026-11-06', 0.071], ['2026-01-01', 0], ['2026-11-03', 0.05], ['2026-11-05', 0.06]]);
    cerca(r2.pct, 1.095 * 1.071 / 1.05 - 1);
    expect(r2.hasta).toBe('2026-11-06');
    // Una caída de la cuenta después de la partida baja el acumulado.
    cerca(C.acumuladoDesdeInicial(0.1, '2026-11-04', [['2026-11-03', 0.2], ['2026-11-10', 0.1]]).pct, 1.1 * 1.1 / 1.2 - 1);
  });
});

// ───────────────────────── La pestaña en la app ─────────────────────────
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization', 'access-control-expose-headers': 'x-cartera-fuente' };

const BASE_JSON = {
  fecha: '2026-11-04', tomadoEn: '2026-11-04T15:00:00Z', nota: 'datos de prueba',
  posiciones: [
    { simbolo: 'TESTA', mercado: 'BCBA', tipo: 'CEDEARS', cantidad: 100, precioIntradia: 990 },
    { simbolo: 'TESTB', mercado: 'BCBA', tipo: 'CEDEARS', cantidad: 50, precioIntradia: 1990 },
    { simbolo: 'TESTBONO', mercado: 'BCBA', tipo: 'TIT. PUBLICOS', cantidad: 100000, precioIntradia: 119 },
  ],
  efectivo: { ARS: 50000, USD: 0 },
};
// Cierre del 04/11: V0 = 100.000 + 100.000 + 120.000 + 50.000 efectivo = 370.000.
const CIERRES = { TESTA: 1000, TESTB: 2000, TESTBONO: 120 };
const OPS = [
  { numero: 1, fecha: '2026-11-12', fechaHora: '2026-11-12T11:00:00', tipo: 'venta', simbolo: 'TESTA', cantidad: 40, precio: 1450, monto: 58000, moneda: 'ARS', comision: 580 },
  { numero: 2, fecha: '2026-11-15', fechaHora: '2026-11-15T11:00:00', tipo: 'compra', simbolo: 'TESTB', cantidad: 10, precio: 2100, monto: 21000, moneda: 'ARS', comision: 210 },
  { numero: 3, fecha: '2026-11-20', fechaHora: '2026-11-20T11:00:00', tipo: 'dividendo', simbolo: 'TESTB', monto: 300, moneda: 'ARS', comision: null },
];
// Hoy (04/12): TESTA 60 u. a 1450, TESTB 60 u. a 2200, bono a 125 por 100 → 87.000 + 132.000 + 125.000 + efectivo 86.510 = 430.510.
const CARTERA = { generado: '2026-12-04T15:00:00Z', tenencias: [
  { simbolo: 'TESTA', cantidad: 60, valorizado: 87000 }, { simbolo: 'TESTB', cantidad: 60, valorizado: 132000 }, { simbolo: 'TESTBONO', cantidad: 100000, valorizado: 125000 },
] };
const MERCADO = {
  mep: { serie: [{ fecha: '2026-11-04', venta: 1000 }, { fecha: '2026-11-12', venta: 1050 }, { fecha: '2026-11-15', venta: 1100 }, { fecha: '2026-11-20', venta: 1150 }], actual: { fecha: '2026-12-04', venta: 1250 } },
  spy: [{ fecha: '2026-11-04', close: 500, adj: 500 }, { fecha: '2026-12-04', close: 520, adj: 525 }],
  ipc: [{ mes: '2026-09', pct: 1.9 }],
  cpi: [{ mes: '2026-08', nivel: 334.98 }, { mes: '2026-09', nivel: 336.94 }],
  errores: {},
};

async function abrir(page, over = {}) {
  const ctl = {
    base: { status: 200, body: BASE_JSON },
    ops: { status: 200, body: { operaciones: OPS, efectivo: { ARS: { disponible: 86510, saldo: 86510 }, USD: { disponible: 0, saldo: 0 } }, comisionesPendientes: 0 } },
    cierres: { status: 200, body: { cierres: CIERRES, fallidos: 0 } },
    mercado: { status: 200, body: MERCADO },
    cartera: { status: 200, body: CARTERA },
    iol: { status: 404, body: { error: 'not_found' } },
    viejo: false, llamadas: [], ...over,
  };
  await page.route('**/cdm-push-worker.tobiasloustau11.workers.dev/**', async (r) => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const u = new URL(req.url());
    ctl.llamadas.push(u.pathname + u.search);
    const json = (x) => r.fulfill({ status: x.status, contentType: 'application/json', headers: CORS, body: JSON.stringify(x.body) });
    if (u.pathname === '/datos/rendimiento-base.json') return json(ctl.base);
    if (u.pathname === '/datos/rendimiento-iol.json') return json(ctl.iol);
    if (u.pathname.startsWith('/rendimiento/') && ctl.viejo) return r.fulfill({ status: 401, contentType: 'text/plain', headers: CORS, body: 'unauthorized' });
    if (u.pathname === '/rendimiento/operaciones') return json(ctl.ops);
    if (u.pathname === '/rendimiento/cierres') return json(ctl.cierres);
    if (u.pathname === '/rendimiento/mercado') return json(ctl.mercado);
    if (u.pathname === '/cartera') return json(ctl.cartera);
    return json({ status: 200, body: { tenencias: [], totales: { valorizado: 0 } } });
  });
  await page.clock.setFixedTime(new Date('2026-12-04T15:00:00-03:00'));
  await page.evaluate(() => {
    _auth.currentUser.getIdToken = async () => 'token-de-prueba';
    S.rendimientoFlujos = [];
    S.accounts = [{ id: 'inv', name: 'Inversiones', type: 'invest', balance: 1000, currency: 'ARS', icon: '📈' }];
    S.carteraTx = [];
  });
  await page.evaluate(() => CarteraOverlay.open());
  await page.locator('#ov-cartera .plov-tab[data-t="rendimiento"]').click();
  return ctl;
}

const pane = (page) => page.locator('#cov-pane-rendimiento');
const heroNum = (page) => pane(page).locator('.rnd-det .ten-hero-num');
const tarjeta = (page, titulo) => pane(page).locator('.rnd-card').filter({ has: page.locator('.rnd-card-lbl', { hasText: new RegExp('^' + titulo) }) }).locator('.rnd-card-num');
const sinScrollHorizontal = (page) => page.evaluate(() => {
  const b = document.querySelector('#cov-pane-rendimiento');
  const ov = document.querySelector('#ov-cartera .cm-ov-body, #ov-cartera') || document.body;
  return { doc: document.documentElement.scrollWidth <= window.innerWidth + 1, pane: b.scrollWidth <= b.clientWidth + 1, ov: ov.scrollWidth <= ov.clientWidth + 1 };
});

test.describe('pestaña Rendimiento', () => {
  test('en pesos: resultado, realizado, no realizado, rentas, comisiones, TWR y TIR del caso inventado', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page);
    await expect(heroNum(page)).toHaveText('$60.510');
    await expect(tarjeta(page, 'Realizado')).toHaveText('$18.000');         // 58.000 − 40 × 1.000
    await expect(tarjeta(page, 'No realizado')).toHaveText('$43.000');      // 27.000 + 11.000 + 5.000
    await expect(tarjeta(page, 'Rentas y dividendos')).toHaveText('$300');
    await expect(tarjeta(page, 'Comisiones')).toHaveText('−$790');
    await expect(tarjeta(page, 'TWR')).toHaveText('+16,35%');               // 60.510 / 370.000
    await expect(tarjeta(page, 'TIR del período')).toHaveText('+16,35%');   // sin aportes coincide con el rendimiento simple
    await expect(pane(page).locator('.ci-meta')).toContainText('Desde 04/11/2026 · 30 días');
    // Ventas realizadas.
    const venta = pane(page).locator('.rnd-venta');
    await expect(venta).toHaveCount(1);
    await expect(venta).toContainText('TESTA');
    await expect(venta).toContainText('$18.000');
    await expect(venta).toContainText('+45,00%');
    // El resultado cuadra: nada de advertencia de descuadre.
    await expect(pane(page).locator('.rnd-advs')).toHaveCount(0);
    expect(consoleErrors.filter(e => !/Failed to load resource/.test(e))).toEqual([]);
  });

  test('pide la base, las operaciones, los cierres de los símbolos de la base, el mercado y la cartera, todo con el ID token', async ({ cmPage: page }) => {
    const ctl = await abrir(page);
    await expect(heroNum(page)).toHaveText('$60.510');
    const l = ctl.llamadas;
    expect(l).toContain('/datos/rendimiento-base.json');
    expect(l).toContain('/rendimiento/operaciones?desde=2026-11-04');
    expect(l).toContain('/rendimiento/cierres?fecha=2026-11-04&s=TESTA:BCBA,TESTB:BCBA,TESTBONO:BCBA');
    expect(l).toContain('/rendimiento/mercado?desde=2026-01-01'); // una sola llamada desde el 1/1 sirve para el año y para el detalle
    expect(l).toContain('/datos/rendimiento-iol.json');
    expect(l).toContain('/cartera');
  });

  test('en dólares MEP: cada movimiento al MEP de su fecha; el mismo portafolio rinde distinto que en pesos', async ({ cmPage: page }) => {
    await abrir(page);
    await expect(heroNum(page)).toHaveText('$60.510');
    await pane(page).locator('[data-mon="USD"]').click();
    // V0 = 370.000 / 1000 = 370. V fin = 430.510 / 1250 = 344,408. Sin aportes: −25,592 → −US$25,59; −6,92%.
    await expect(heroNum(page)).toHaveText('−US$25,59');
    await expect(tarjeta(page, 'TWR')).toHaveText('−6,92%');
    await expect(pane(page).locator('.ten-hero-lbl')).toContainText('dólares MEP');
    // La venta de 58.000 ARS el 12/11 (MEP 1050) cobró 55,24 USD contra un costo de 40.000/1000 = 40 USD.
    await expect(pane(page).locator('.rnd-venta')).toContainText('US$15,24');
    await pane(page).locator('[data-mon="ARS"]').click();
    await expect(heroNum(page)).toHaveText('$60.510');
  });

  test('comparación: S&P 500 con su ventana, y la inflación sin dato publicado dice por qué en vez de inventar', async ({ cmPage: page }) => {
    await abrir(page);
    const refs = pane(page).locator('.rnd-det .rnd-ref');
    // ARS: SPY en pesos = 525 × 1250 / (500 × 1000) − 1 = +31,25%. Diferencia de TWR = 16,35 − 31,25 = −14,90 pts.
    await expect(refs.nth(0)).toContainText('S&P 500');
    await expect(refs.nth(0)).toContainText('+31,25%');
    await expect(refs.nth(0)).toContainText('−14,90 pts');
    await expect(refs.nth(0)).toContainText('04/11/2026 al 04/12/2026');
    await expect(refs.nth(1)).toContainText('Inflación INDEC');
    await expect(refs.nth(1)).toContainText('Sin dato');
    await expect(refs.nth(1)).toContainText('Todavía no hay IPC publicado de nov 2026');
    // USD: SPY +5,00%, y la inflación de EE.UU. también sin dato.
    await pane(page).locator('[data-mon="USD"]').click();
    await expect(refs.nth(0)).toContainText('+5,00%');
    await expect(refs.nth(0)).toContainText('−11,92 pts'); // −6,92 − 5,00
    await expect(refs.nth(1)).toContainText('Inflación EE.UU.');
    await expect(refs.nth(1)).toContainText('Sin dato');
  });

  test('con el IPC del mes de la base publicado, se muestra prorrateado, con "hasta <mes>" y avisando que las ventanas difieren', async ({ cmPage: page }) => {
    await abrir(page, { mercado: { status: 200, body: { ...MERCADO, ipc: [{ mes: '2026-09', pct: 1.9 }, { mes: '2026-11', pct: 3 }] } } });
    const inf = pane(page).locator('.rnd-det .rnd-ref').nth(1);
    await expect(inf).toContainText('+2,59%');             // 1,03^(26/30) − 1
    await expect(inf).toContainText('hasta fin de nov 2026');
    await expect(inf).toContainText('ventanas distintas');
    await expect(inf).toContainText('+13,76 pts');         // 16,35 − 2,59
  });

  test('aportes y retiros cargados a mano: no cuentan como ganancia, no inflan el TWR, se guardan en S y se pueden quitar', async ({ cmPage: page }) => {
    await abrir(page);
    await expect(heroNum(page)).toHaveText('$60.510');
    const form = pane(page).locator('.rnd-form');
    await form.locator('.rnd-f-fecha').fill('2026-11-10');
    await form.locator('.rnd-f-tipo').selectOption('aporte');
    await form.locator('.rnd-f-monto').fill('100000');
    await form.locator('.rnd-f-add').click();
    // Si la plata entró pero el efectivo de IOL no cambió, el resultado baja 100.000 y el sistema avisa que no cuadra.
    await expect(heroNum(page)).toHaveText('−$39.490');
    await expect(pane(page).locator('.rnd-flujo')).toHaveCount(1);
    await expect(tarjeta(page, 'TWR')).toHaveText('−8,78%'); // −39.490 / (370.000 + 100.000 × 24/30)
    await expect(pane(page).locator('.rnd-advs')).toContainText('no se explica del todo');
    expect(await page.evaluate(() => S.rendimientoFlujos)).toEqual([expect.objectContaining({ fecha: '2026-11-10', tipo: 'aporte', monto: 100000, moneda: 'ARS' })]);
    // Un aporte del mismo día de la base ya está en el punto de partida: no cambia nada.
    await form.locator('.rnd-f-fecha').fill('2026-11-04');
    await form.locator('.rnd-f-monto').fill('5000');
    await form.locator('.rnd-f-add').click();
    await expect(pane(page).locator('.rnd-flujo')).toHaveCount(2);
    await expect(heroNum(page)).toHaveText('−$39.490');
    // Quitar los dos vuelve al resultado original.
    await pane(page).locator('.rnd-flujo-del').first().click();
    await pane(page).locator('.rnd-flujo-del').first().click();
    await expect(pane(page).locator('.rnd-flujo')).toHaveCount(0);
    await expect(heroNum(page)).toHaveText('$60.510');
    expect(await page.evaluate(() => S.rendimientoFlujos)).toEqual([]);
  });

  test('un cobro cargado a mano suma a rentas y no es aporte', async ({ cmPage: page }) => {
    await abrir(page);
    const form = pane(page).locator('.rnd-form');
    await form.locator('.rnd-f-fecha').fill('2026-11-25');
    await form.locator('.rnd-f-tipo').selectOption('cobro');
    await form.locator('.rnd-f-monto').fill('5000');
    await form.locator('.rnd-f-add').click();
    await expect(tarjeta(page, 'Rentas y dividendos')).toHaveText('$5.300');
    await expect(heroNum(page)).toHaveText('$60.510'); // el efectivo de IOL no trae esa plata (caso inventado): el resultado no cambia y queda el aviso de descuadre
    await expect(pane(page).locator('.rnd-advs')).toContainText('no se explica del todo');
  });

  test('Worker viejo (sin las rutas nuevas): dice que falta publicar el servidor y ofrece reintentar', async ({ cmPage: page }) => {
    await abrir(page, { viejo: true });
    await expect(pane(page)).toContainText('Falta publicar el servidor');
    await expect(pane(page).locator('.rnd-retry')).toBeVisible();
  });

  test('sin rendimiento-base.json en el repo privado: lo dice con el nombre del archivo', async ({ cmPage: page }) => {
    await abrir(page, { base: { status: 404, body: { error: 'not_found' } } });
    await expect(pane(page)).toContainText('rendimiento-base.json');
    await expect(pane(page)).toContainText('No encuentro');
  });

  test('si fallan los cierres usa el intradía y lo marca como aproximado; si falla el mercado no hay comparación pero sí resultado', async ({ cmPage: page }) => {
    await abrir(page, {
      cierres: { status: 502, body: { error: 'iol_unavailable', message: 'IOL caído' } },
      mercado: { status: 502, body: { error: 'iol_unavailable', message: 'sin fuentes' } },
    });
    // V0 intradía = 99.000 + 99.500 + 119.000 + 50.000 = 367.500 → resultado 63.010.
    await expect(heroNum(page)).toHaveText('$63.010');
    await expect(pane(page).locator('.rnd-advs')).toContainText('precio intradía');
    await expect(pane(page).locator('.rnd-det .rnd-ref').nth(0)).toContainText('Sin dato');
    await expect(pane(page).locator('.rnd-det .rnd-ref').nth(1)).toContainText('Sin dato');
  });

  test('sin MEP la vista en dólares lo dice, y la de pesos sigue andando', async ({ cmPage: page }) => {
    await abrir(page, { mercado: { status: 200, body: { ...MERCADO, mep: null, errores: { mep: 'caído' } } } });
    await expect(heroNum(page)).toHaveText('$60.510');
    await pane(page).locator('[data-mon="USD"]').click();
    await expect(pane(page)).toContainText('Falta el dólar MEP');
  });

  test('el botón Actualizar vuelve a pedir todo', async ({ cmPage: page }) => {
    const ctl = await abrir(page);
    await expect(heroNum(page)).toHaveText('$60.510');
    const antes = ctl.llamadas.filter(x => x === '/cartera').length;
    await pane(page).locator('.rnd-act').click();
    await expect(pane(page).locator('.rnd-act')).toHaveText('Actualizar');
    await expect.poll(() => ctl.llamadas.filter(x => x === '/cartera').length).toBe(antes + 1);
  });

  // Serie de IOL inventada: la cuenta valía +5% el 03/11 y +7,1% al 03/12 (ARS); en dólares MEP −2%.
  const IOL = {
    v: 1, generado: '2026-12-04T09:00:00Z', desde: '2026-01-01',
    ARS: { desde: '2026-01-01', hasta: '2026-12-03', twr: 0.071, puntos: [['2026-01-01', 0], ['2026-11-03', 0.05], ['2026-12-03', 0.071]] },
    MEP: { desde: '2026-01-01', hasta: '2026-12-03', twr: -0.02, puntos: [['2026-01-01', 0], ['2026-12-03', -0.02]] },
  };
  const BASE_9_5 = { ...BASE_JSON, gananciaInicial: { pct: 0.095, fecha: '2026-11-04', nota: 'dato de prueba' } };
  const MERCADO_ANIO = {
    ...MERCADO,
    mep: { serie: [{ fecha: '2025-12-30', venta: 1000 }, { fecha: '2026-11-04', venta: 1000 }, { fecha: '2026-12-03', venta: 1200 }], actual: { fecha: '2026-12-04', venta: 1250 } },
    spy: [{ fecha: '2025-12-31', close: 600, adj: 600 }, { fecha: '2026-11-04', close: 500, adj: 500 }, { fecha: '2026-12-03', close: 640, adj: 648 }, { fecha: '2026-12-04', close: 700, adj: 700 }],
    ipc: [{ mes: '2025-12', pct: 2.5 }, { mes: '2026-01', pct: 2 }, { mes: '2026-02', pct: 2 }],
  };
  const acumulado = (page) => pane(page).locator('.rnd-acum');
  const anio = (page) => pane(page).locator('.rnd-ytd');

  test('acumulado: parte del 9,5% del archivo privado y lo sigue con la serie de IOL, siempre en pesos', async ({ cmPage: page }) => {
    await abrir(page, { base: { status: 200, body: BASE_9_5 }, iol: { status: 200, body: IOL }, mercado: { status: 200, body: MERCADO_ANIO } });
    await expect(heroNum(page)).toHaveText('$60.510');
    await expect(acumulado(page)).toContainText('Acumulado');
    await expect(acumulado(page).locator('.ten-hero-num')).toHaveText('+11,69%'); // 1,095 × 1,071 / 1,05 − 1
    await expect(acumulado(page)).toContainText('Partió de 9,50% el 04/11');
    await expect(acumulado(page)).toContainText('actualizado al 03/12/2026');
    // Está arriba de todo: antes de la comparación del año y del detalle.
    const orden = await pane(page).locator('.rnd').first().evaluate(el => [...el.children].map(c => ['rnd-acum', 'rnd-ytd', 'rnd-det'].find(k => c.classList.contains(k))).filter(Boolean));
    expect(orden).toEqual(['rnd-acum', 'rnd-ytd', 'rnd-det']);
    await expect(pane(page).locator('.rnd-det .sec-label').first()).toHaveText('Detalle desde el 04/11');
    // En dólares el acumulado sigue siendo en pesos y lo aclara.
    await pane(page).locator('[data-mon="USD"]').click();
    await expect(acumulado(page).locator('.ten-hero-num')).toHaveText('+11,69%');
    await expect(acumulado(page)).toContainText('Siempre en pesos');
  });

  test('desde el 1 de enero: la cuenta contra el S&P 500 y la inflación, misma moneda y misma ventana que la serie', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page, { base: { status: 200, body: BASE_9_5 }, iol: { status: 200, body: IOL }, mercado: { status: 200, body: MERCADO_ANIO } });
    const f = anio(page).locator('.rnd-ref');
    await expect(anio(page).locator('.sec-label')).toHaveText('Desde el 1 de enero');
    await expect(f.nth(0)).toContainText('Tu cuenta');
    await expect(f.nth(0)).toContainText('+7,10%');
    await expect(f.nth(0)).toContainText('01/01/2026 al 03/12/2026');
    // ARS: S&P cortado en el 03/12 (no usa la barra del 04/12), pasado a pesos: 648 × 1200 / (600 × 1000) − 1 = +29,60%. Dif: 7,10 − 29,60.
    await expect(f.nth(1)).toContainText('S&P 500');
    await expect(f.nth(1)).toContainText('+29,60%');
    await expect(f.nth(1)).toContainText('−22,50 pts');
    // Inflación: diciembre entero cuenta cero (base = cierre del 31/12), enero y febrero 2% cada uno = +4,04%. Dif: 7,10 − 4,04.
    await expect(f.nth(2)).toContainText('Inflación INDEC');
    await expect(f.nth(2)).toContainText('+4,04%');
    await expect(f.nth(2)).toContainText('+3,06 pts');
    await expect(f.nth(2)).toContainText('hasta fin de feb 2026');
    // USD: serie MEP de IOL, S&P en dólares (+8,00%), inflación de EE.UU. sin dato (el mock no trae CPI).
    await pane(page).locator('[data-mon="USD"]').click();
    await expect(f.nth(0)).toContainText('−2,00%');
    await expect(f.nth(1)).toContainText('+8,00%');
    await expect(f.nth(1)).toContainText('−10,00 pts');
    await expect(f.nth(2)).toContainText('Inflación EE.UU.');
    await expect(f.nth(2)).toContainText('Sin dato');
    expect(consoleErrors.filter(e => !/Failed to load resource/.test(e))).toEqual([]);
  });

  test('sin rendimiento-iol.json: el acumulado muestra el 9,5% sin actualizar, el año lo explica y el detalle sigue andando, sin errores', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page, { base: { status: 200, body: BASE_9_5 } });
    await expect(heroNum(page)).toHaveText('$60.510');
    await expect(acumulado(page).locator('.ten-hero-num')).toHaveText('+9,50%');
    await expect(acumulado(page)).toContainText('sin actualizar todavía');
    await expect(anio(page)).toContainText('Todavía no llegó la serie de IOL (se actualiza cada mañana)');
    await expect(anio(page).locator('.rnd-ref')).toHaveCount(0);
    await pane(page).locator('[data-mon="USD"]').click();
    await expect(anio(page)).toContainText('Todavía no llegó la serie de IOL');
    expect(consoleErrors.filter(e => !/Failed to load resource/.test(e))).toEqual([]);
  });

  test('sin gananciaInicial en la base no hay tarjeta de acumulado, y un archivo de IOL con formato roto cuenta como "no llegó"', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page, { iol: { status: 200, body: { v: 1, ARS: { twr: 'x' } } } });
    await expect(heroNum(page)).toHaveText('$60.510');
    await expect(acumulado(page)).toHaveCount(0);
    await expect(anio(page)).toContainText('Todavía no llegó la serie de IOL');
    expect(consoleErrors.filter(e => !/Failed to load resource/.test(e))).toEqual([]);
  });

  test('el diseño entra sin scroll horizontal (390 y 1440) y las pestañas del overlay caben', async ({ cmPage: page }, testInfo) => {
    await abrir(page, { base: { status: 200, body: BASE_9_5 }, iol: { status: 200, body: IOL }, mercado: { status: 200, body: MERCADO_ANIO } });
    await expect(acumulado(page)).toBeVisible();
    await page.locator('.rnd-form .rnd-f-monto').fill('1000'); // el formulario también tiene que caber
    const r = await sinScrollHorizontal(page);
    expect(r).toEqual({ doc: true, pane: true, ov: true });
    const tabs = await page.locator('#ov-cartera .plov-tab').evaluateAll(els => els.map(e => ({ t: e.textContent.trim(), ok: e.scrollWidth <= e.clientWidth + 1 })));
    expect(tabs.map(t => t.t)).toEqual(['Mis tenencias', 'Análisis mensual', 'Historial', 'Rendimiento', 'Radar']);
    expect(tabs.every(t => t.ok)).toBe(true);
    void testInfo;
  });
});
