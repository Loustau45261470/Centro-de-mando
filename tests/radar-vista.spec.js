// Radar v2 — cálculo y formato de la ficha (radar-vista.js), en Node, con datos INVENTADOS de tests/fixtures/radar-v2.js.
// Cubre: estados de los números (pendiente / no informado / sin datos / n/s / no aplica), nada de ceros falsos, P/E rotulados,
// variaciones t/t y a/a, fuente de cada número, unidades de comunicado, y las reglas del punto del gráfico Crecimiento vs Valuación.
'use strict';
const path = require('path');
const { test, expect } = require('./support/fixtures');
const V = require(path.join(__dirname, '..', 'radar-vista.js'));
const D = require('./fixtures/radar-v2.js');

test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'cálculo puro: una sola vez'); });

const ARCH = D.archivos();
const vistaDe = (t, over = {}) => {
  const config = ARCH['radar-config.json'], emp = config.empresas.find(e => e.ticker === t);
  const a = Object.assign({}, ARCH, over);
  return V.vista({ config, emp, mercado: a['mercado-' + t + '.json'], historia: a['historia-' + t + '.json'], kpis: a['kpis-' + t + '.json'], manual: a['radar-manual.json'] });
};
const buscar = (v, id) => { for (const s of v.secciones) { const i = s.items.find(x => x.id === id); if (i) return i; } return v.especificos.find(x => x.id === id) || null; };

test.describe('formato', () => {
  test('números en es-AR, con la unidad explícita', () => {
    expect(V.fmt('pct', 0.1234)).toBe('12,3%');
    expect(V.fmt('pct', -0.0326, { signo: true })).toBe('-3,3%');
    expect(V.fmt('x', 21.6638)).toBe('21,7x');
    expect(V.fmt('usdps', 68.78)).toBe('US$ 68,78');
    expect(V.fmt('usd', 22818e6)).toBe('US$ 22,8 mil M');
    expect(V.fmt('usd', 104e6)).toBe('US$ 104 M');
    expect(V.fmt('n', 93e6)).toBe('93,0 M');
    expect(V.fmt('pp', -2.5)).toBe('-2,5 pp');
    expect(V.fmt('x', null)).toBeNull();
  });
  test('unidad de los comunicados: 12,3 con unidad % es 12,3% (no la fracción 0,123)', () => {
    expect(V.norm('%', 12.3).kind).toBe('pct'); expect(V.norm('%', 12.3).v).toBeCloseTo(0.123, 10);
    expect(V.norm('USD millones', 22818)).toEqual({ kind: 'usd', v: 22818e6 });
    expect(V.norm('millones', 93)).toEqual({ kind: 'n', v: 93e6 });
    expect(V.norm('USD', 1.23)).toEqual({ kind: 'usdps', v: 1.23 });
    expect(V.norm('texto', 'algo')).toBeNull();
  });
  test('variación: puntos si es un porcentaje, relativa en el resto; base cero o negativa no se compara; un redondeo a cero no lleva signo', () => {
    expect(V.variacion('pct', 0.2, 0.15)).toBe('+5,0 pp');
    expect(V.variacion('usd', 110, 100)).toBe('+10,0%');
    expect(V.variacion('usd', 110, -5)).toBeNull();
    expect(V.variacion('usd', 110, 0)).toBeNull();
    expect(V.variacion('pct', 0.12001, 0.12)).toBe('0,0 pp');
  });
  test('monograma: iniciales de las dos primeras palabras; una sola palabra, sus dos primeras letras', () => {
    expect(V.monograma('Mundo Libre')).toBe('ML');
    expect(V.monograma('S&P Global')).toBe('SG');
    expect(V.monograma('Nubo')).toBe('NU');
  });
  test('solo se enlazan documentos http(s)', () => {
    expect(V.urlSegura('https://example.test/a')).toBe('https://example.test/a');
    expect(V.urlSegura('javascript:alert(1)')).toBeNull();
    expect(V.urlSegura(null)).toBeNull();
  });
});

test.describe('ficha de una empresa', () => {
  test('las secciones salen en el orden de la lista, con Precio primero; los KPIs propios van aparte', () => {
    const v = vistaDe('ACME');
    expect(v.secciones.map(s => s.nombre)).toEqual(['Precio', 'Crecimiento', 'Rentabilidad', 'Calidad de ganancias', 'Caja', 'Eficiencia y retorno', 'Balance y riesgo', 'Capital', 'Valuación', 'Expectativas y mercado']);
    expect(v.especificos.map(i => i.nombre)).toEqual(['Volumen de pagos', 'Tarjetas emitidas', 'Mora a 90 días', 'Riesgo regulatorio', 'Costo por envío']);
  });

  test('P/E: TTM GAAP, ajustado, forward de 12 meses (con el del año en curso y el del siguiente como detalle rotulado); EPS básico y diluido', () => {
    const v = vistaDe('ACME');
    expect(buscar(v, 'p_e_ttm')).toMatchObject({ nombre: 'P/E TTM (GAAP)', txt: '25,0x' });
    expect(buscar(v, 'p_e_ttm_ajustado')).toMatchObject({ nombre: 'P/E TTM ajustado', estado: 'sin_datos' });   // faltan 4 comunicados con EPS ajustado
    expect(buscar(v, 'p_e_forward')).toMatchObject({ nombre: 'P/E fwd (12 meses)', txt: '18,0x' });
    expect(buscar(v, 'p_e_forward_fy_actual')).toMatchObject({ nombre: 'P/E fwd año fiscal en curso (EPS 2026e)', txt: '18,0x' });
    expect(buscar(v, 'p_e_forward_siguiente')).toMatchObject({ nombre: 'P/E fwd año fiscal siguiente (EPS 2027e)', txt: '15,0x' });
    expect(buscar(v, 'eps_gaap')).toMatchObject({ nombre: 'EPS GAAP diluido', txt: 'US$ 0,84' });
    expect(buscar(v, 'eps_gaap_basico')).toMatchObject({ nombre: 'EPS GAAP básico', txt: 'US$ 0,86' });
  });

  test('P/E TTM vs la media de 5, 10 y 15 años, con "desde" y "desde la salida a bolsa" si cotiza hace menos', () => {
    const it = buscar(vistaDe('ACME'), 'p_e_vs_media_5_10_15_anos');
    expect(it.estado).toBe('ok');
    expect(it.txt).toBe('+13,6% vs media 5 años');
    expect(it.lineas.map(l => l.k)).toEqual(['Media 5 años (desde 30/09/23)', 'Media 10 años (desde la salida a bolsa, 01/03/21)', 'Media 15 años (desde la salida a bolsa, 01/03/21)']);
  });

  test('P/E forward vs media y valuación vs pares: "pendiente" hasta que Tobías carga radar-manual.json; ROIC vs WACC también', () => {
    const v = vistaDe('ACME');
    for (const id of ['p_e_forward_vs_media_5_10_15_anos', 'valuacion_vs_pares', 'roic_vs_wacc']) expect(buscar(v, id)).toMatchObject({ estado: 'pendiente', txt: 'pendiente' });
    const man = { v: 1, empresas: { ACME: { pe_forward_media: { '5y': 20, '10y': null, '15y': null, desde: '2021', fuente: 'Fuente inventada', url: 'https://example.test/m', fecha_dato: '2026-11-07' }, pares: [], wacc: { valor: null } } } };
    const it = buscar(vistaDe('ACME', { 'radar-manual.json': man }), 'p_e_forward_vs_media_5_10_15_anos');
    expect(it).toMatchObject({ estado: 'ok', txt: '-10,0% vs media 5 años' });
    expect(it.fuente).toMatchObject({ tipo: 'manual', titulo: 'Cargado por vos el 07/11' });
  });

  test('EPS negativo: el P/E es "n/s" (no significativo), nunca un número absurdo; sin historia suficiente, "sin datos todavía"', () => {
    const v = vistaDe('ZETA');
    expect(buscar(v, 'p_e_ttm')).toMatchObject({ estado: 'ns', txt: 'n/s' });
    expect(buscar(v, 'p_e_forward')).toMatchObject({ estado: 'ns', txt: 'n/s' });
    expect(buscar(v, 'p_e_vs_media_5_10_15_anos')).toMatchObject({ estado: 'sin_datos', txt: 'sin datos suficientes (datos desde dic-22)' });
  });

  test('comunicado: valor con página y cita, "no informado en Q3 2026", proxy, desglose, texto largo y unidad convertida', () => {
    const v = vistaDe('ACME');
    expect(buscar(v, 'crecimiento_de_ingresos_a_moneda_constante')).toMatchObject({ estado: 'ok', txt: '12,3%', fuente: { tipo: 'comunicado', detalle: 'p. 6, tabla de métricas clave', cita: 'Constant currency revenue growth 12.3%', url: D.URL_DOC } });
    expect(buscar(v, 'eps_ajustado')).toMatchObject({ estado: 'no_informado', txt: 'no informado en Q3 2026', detalle: 'no informado en este trimestre' });
    expect(buscar(v, 'mora_90_dias')).toMatchObject({ estado: 'no_informado', txt: 'no informado en Q3 2026' });
    const vol = buscar(v, 'volumen_de_pagos');
    expect(vol).toMatchObject({ estado: 'ok', txt: 'US$ 1.250 mil M', tt: '+5,9%', nota: 'Total procesado en el trimestre.' });
    expect(vol.lineas).toEqual([{ k: 'Crédito', txt: 'US$ 700 mil M' }, { k: 'Débito', txt: 'US$ 550 mil M' }]);
    expect(vol.desde).toBe('datos desde jun-26');     // solo 2 trimestres cargados: la sparkline no inventa los 10 que faltan
    expect(buscar(v, 'tarjetas_emitidas')).toMatchObject({ txt: '93,0 M', proxy: true, nota: 'Sustituto: tarjetas con actividad.' });
    expect(buscar(v, 'riesgo_regulatorio')).toMatchObject({ largo: true });
    expect(buscar(v, 'costo_por_envio')).toMatchObject({ estado: 'sin_datos' });   // el último comunicado no lo trae: no se arrastra ni se inventa
  });

  test('los números de la SEC/Yahoo traen variación t/t y a/a, sparkline de 12+ trimestres y fuente con fecha', () => {
    const v = vistaDe('ACME');
    const ing = buscar(v, 'ingresos_totales_a_a');
    expect(ing.txt).toBe('21,6%');                       // 1,05^4 − 1
    expect(ing.serie.length).toBeGreaterThanOrEqual(12);
    expect(ing.fuente).toMatchObject({ tipo: 'calculo' });
    expect(ing.fuente.base).toMatchObject({ tipo: 'sec' });
    const fcf = buscar(v, 'fcf');
    expect(fcf.fuente).toMatchObject({ tipo: 'sec', titulo: 'SEC (presentación oficial de la empresa)' });
    expect(fcf.tt).toBe('+5,0%'); expect(fcf.aa).toBe('+21,6%');
    expect(fcf.serie).toHaveLength(19); expect(fcf.desde).toBe('');
    expect(buscar(v, 'distancia_al_ath')).toMatchObject({ txt: '-16,7%', fuente: { tipo: 'yahoo', fecha: '2026-11-05' } });
  });

  test('banco (financiera: true): deuda neta, EV y flujo libre dicen "no aplica"; Rule of 40 solo donde aplica_a lo indica', () => {
    const nubo = vistaDe('NUBO'), acme = vistaDe('ACME');
    for (const id of ['deuda_neta', 'deuda_neta_ebitda', 'ev_ebitda', 'fcf', 'fcf_utilidad_neta', 'roic', 'roic_vs_wacc', 'ciclo_de_conversion_de_caja']) expect(buscar(nubo, id)).toMatchObject({ estado: 'no_aplica', txt: 'no aplica' });
    expect(buscar(nubo, 'rule_of_40')).not.toBeNull();
    expect(buscar(acme, 'rule_of_40')).toBeNull();
    expect(buscar(nubo, 'margen_operativo')).toMatchObject({ estado: 'sin_datos' });    // la fuente no trae resultado operativo: no se rellena con 0
    expect(buscar(nubo, 'margen_neto').estado).toBe('ok');
  });

  test('nunca un cero falso: lo que la fuente no trae queda "sin datos todavía"', () => {
    const v = vistaDe('ACME');
    const sinInsumos = vistaDe('ACME', { 'historia-ACME.json': D.historia({ ticker: 'ACME', insumos: false }) });
    for (const id of ['dividendos']) { const i = buscar(v, id); if (i) { expect(i.estado).toBe('sin_datos'); expect(i.txt).toBe('sin datos todavía'); expect(i.num).toBeUndefined(); } }
    for (const id of ['roic', 'rotacion_de_activos', 'cobertura_de_intereses', 'ciclo_de_conversion_de_caja']) { const i = buscar(sinInsumos, id); if (i) { expect(i.estado).toBe('sin_datos'); expect(i.txt).toBe('sin datos todavía'); expect(i.num).toBeUndefined(); } }
    const todos = [...v.secciones.flatMap(s => s.items), ...v.especificos];
    for (const i of todos) if (i.estado !== 'ok') expect(['pendiente', 'no_informado', 'sin_datos', 'ns', 'no_aplica']).toContain(i.estado);
    for (const i of todos) if (i.estado !== 'ok') expect(i.num).toBeUndefined();
  });

  test('una empresa sin ningún archivo: todo "sin datos todavía" y estado vacío', () => {
    const config = ARCH['radar-config.json'], emp = config.empresas.find(e => e.ticker === 'QUIM');
    const v = V.vista({ config, emp, mercado: null, historia: null, kpis: null, manual: null });
    const todos = [...v.secciones.flatMap(s => s.items), ...v.especificos];
    expect(todos.length).toBeGreaterThan(30);
    expect(todos.filter(i => i.estado === 'ok')).toEqual([]);
    expect(v.estado).toMatchObject({ mercadoFecha: null, comunicado: null, historiaHasta: null });
  });

  test('estado de datos: fecha de mercado, último comunicado y datos viejos con su fecha (stale_since)', () => {
    const v = vistaDe('ACME', { 'mercado-ACME.json': D.mercado({ ticker: 'ACME', stale: '2026-11-04', generado: '2026-11-03' }) });
    expect(v.estado).toMatchObject({ mercadoFecha: '2026-11-03', mercadoStale: '2026-11-04', mercadoError: 'Yahoo no respondió', historiaHasta: '2026-09-30' });
    expect(v.estado.comunicado).toMatchObject({ clave: '2026-Q3', rotulo: 'Q3 2026', fin: '2026-09-30' });
  });

  test('el id que se manda a reportar entra en los 64 caracteres del Worker (sin recortar) y se asocia al reporte por ticker + id + período', () => {
    const v = vistaDe('ACME');
    const it = buscar(v, 'crecimiento_de_ingresos_a_moneda_constante');
    expect(it.rid).toBe('crecimiento_de_ingresos_a_moneda_constante');
    for (const i of [...v.secciones.flatMap(s => s.items), ...v.especificos]) expect(i.rid.length).toBeLessThanOrEqual(64);
    expect(V.rid('x'.repeat(80))).toHaveLength(64);
    const margen = buscar(v, 'margen_neto');
    const rs = V.reportesDe(D.reportesBase(), 'ACME', margen);
    expect(rs).toHaveLength(1); expect(rs[0].estado).toBe('corregido');
    expect(V.reportesDe(D.reportesBase(), 'ACME', buscar(v, 'margen_bruto'))).toEqual([]);
    expect(V.reportesDe(D.reportesBase(), 'OTRA', margen)).toEqual([]);
  });
});

test.describe('sorpresa vs consenso (EPS): solo si el EPS real y el consenso son de la misma base', () => {
  const sorp = (real, est, pct) => ({ trimestre: '2026-09-30', eps_real: real, eps_estimado: est, diferencia: +(real - est).toFixed(2), sorpresa_pct: pct, ingresos: null });
  const mer = (o) => ({ 'mercado-ACME.json': D.mercado({ ticker: 'ACME', pf: 18, act: 5.5, sig: 6.6, base: 4.6, cagr: 0.2, pfs: 15, sorp: o }) });
  const conAjustado = (valor) => { const k = D.kpisAcme(); k.trimestres['2026-Q3'].kpis.eps_ajustado = { valor, unidad: 'USD', fuente: { tipo: 'comunicado', url: D.URL_DOC, pagina_o_slide: 'p. 3', cita: 'Adjusted EPS' } }; return { 'kpis-ACME.json': k }; };
  const S = (over) => buscar(vistaDe('ACME', over), 'sorpresa_vs_consenso_eps');

  test('el real de Yahoo no coincide con el GAAP de la SEC (es de la base del consenso): se muestra tal cual', () => {
    expect(S({})).toMatchObject({ estado: 'ok', txt: '+10,0%' });     // 1,1 vs 1; el GAAP del trimestre es 0,84
  });
  test('el real coincide con el GAAP (0,84) y el consenso es otra base (1,5): "no comparable", sin número y con los dos EPS rotulados', () => {
    const it = S(mer(sorp(0.84, 1.5, -0.44)));
    expect(it).toMatchObject({ estado: 'ns', txt: 'no comparable (GAAP vs ajustado)' });
    expect(it.txt).not.toMatch(/\d/); expect(it.num).toBeUndefined();
    expect(it.lineas).toEqual([{ k: 'EPS real (contable, GAAP)', txt: 'US$ 0,84' }, { k: 'EPS que esperaba el consenso', txt: 'US$ 1,50' }]);
  });
  test('el real es GAAP pero el comunicado trae el EPS ajustado del trimestre: la sorpresa se calcula con ese (misma base que el consenso)', () => {
    const it = S(Object.assign(mer(sorp(0.84, 1.5, -0.44)), conAjustado(1.55)));
    expect(it).toMatchObject({ estado: 'ok', txt: '+3,3%' });
    expect(it.lineas.map(l => l.k)).toEqual(['EPS ajustado (comunicado)', 'EPS GAAP (contable)', 'EPS que esperaba el consenso']);
    expect(it.fuente).toMatchObject({ tipo: 'calculo' });
  });
  test('el real es GAAP y la diferencia con el consenso es chica: se muestra, rotulado como contable y con una nota', () => {
    const it = S(mer(sorp(0.84, 0.8, 0.05)));
    expect(it).toMatchObject({ estado: 'ok', txt: '+5,0%' });
    expect(it.lineas[0]).toEqual({ k: 'EPS real (contable, GAAP)', txt: 'US$ 0,84' });
    expect(it.nota).toMatch(/contable \(GAAP\)/);
  });
});

test.describe('flujo libre: una sola base y siempre rotulada', () => {
  const ult4 = () => { const t = ARCH['historia-ACME.json'].trimestres; return t.slice(-4).reduce((a, r) => a + r.fcf, 0); };
  test('"FCF del trimestre" y "FCF 12 meses" (suma de 4 trimestres de la SEC); P/FCF y FCF yield usan ese mismo FCF 12 meses y el valor de mercado', () => {
    const v = vistaDe('ACME');
    expect(buscar(v, 'fcf').nombre).toBe('FCF del trimestre');
    const f12 = buscar(v, 'fcf_12m');
    expect(f12).toMatchObject({ nombre: 'FCF 12 meses', estado: 'ok', num: ult4(), origen: 'sec' });
    expect(f12.fuente).toMatchObject({ tipo: 'calculo' });
    const cap = ARCH['mercado-ACME.json'].capitalizacion.valor;
    expect(buscar(v, 'p_fcf').num).toBeCloseTo(cap / ult4(), 10);
    expect(buscar(v, 'fcf_yield').num).toBeCloseTo(ult4() / cap, 10);
    expect(buscar(v, 'p_fcf').txt).not.toBe('20,0x');                  // el P/FCF de Yahoo (con otro FCF) no se mezcla
    expect(buscar(v, 'p_fcf').lineas.map(l => l.k)[1]).toMatch(/^FCF 12 meses/);
    expect(buscar(v, 'p_fcf').fuente).toMatchObject({ tipo: 'calculo' });
  });
  test('el FCF «levered» de Yahoo (fcf, p_fcf, fcf_yield del mercado) no se usa nunca: ni aunque el archivo todavía los traiga', () => {
    const m = D.mercado({ ticker: 'ACME', pf: 18, act: 5.5, sig: 6.6, base: 4.6, cagr: 0.2, pfs: 15 });
    Object.assign(m, { fcf: { valor: 1, fuente: 'yahoo', fecha: '2026-11-06' }, p_fcf: { valor: 999, fuente: 'yahoo', fecha: '2026-11-06' }, fcf_yield: { valor: 0.77, fuente: 'yahoo', fecha: '2026-11-06' } });
    const v = vistaDe('ACME', { 'mercado-ACME.json': m });
    expect(buscar(v, 'p_fcf').num).toBeCloseTo(ARCH['mercado-ACME.json'].capitalizacion.valor / ult4(), 10);
    expect(buscar(v, 'fcf_yield').num).toBeCloseTo(ult4() / ARCH['mercado-ACME.json'].capitalizacion.valor, 10);
    expect(buscar(v, 'fcf_12m').num).toBe(ult4());
  });
  test('sin 4 trimestres seguidos con flujo libre: "sin datos todavía" (no se completa con Yahoo ni se inventa), también en P/FCF y FCF yield', () => {
    const v = vistaDe('ACME', { 'historia-ACME.json': D.historia({ ticker: 'ACME', n: 2 }) });
    expect(buscar(v, 'fcf_12m')).toMatchObject({ estado: 'sin_datos' });
    for (const id of ['p_fcf', 'fcf_yield']) expect(buscar(v, id)).toMatchObject({ estado: 'sin_datos', txt: 'sin datos todavía' });
  });
  test('si los 4 trimestres vienen de Yahoo (la SEC no los trae), el FCF 12 meses sigue siendo flujo operativo − capex y se rotula como Yahoo', () => {
    const v = vistaDe('ACME', { 'historia-ACME.json': D.historia({ ticker: 'ACME', fuente: 'yahoo' }) });
    const f12 = buscar(v, 'fcf_12m');
    expect(f12).toMatchObject({ estado: 'ok', origen: 'yahoo', num: ult4() });
    expect(f12.fuente.base.tipo).toBe('yahoo');
    expect(buscar(v, 'p_fcf').lineas[1].k).toMatch(/4 trimestres de Yahoo Finance/);
  });
  test('FCF de 12 meses negativo: P/FCF y FCF yield "n/s", nunca un número negativo', () => {
    const v = vistaDe('ACME', { 'historia-ACME.json': D.historia({ ticker: 'ACME', fcf: () => -1e8 }) });
    expect(buscar(v, 'fcf_12m')).toMatchObject({ estado: 'ok', num: -4e8 });
    expect(buscar(v, 'p_fcf')).toMatchObject({ estado: 'ns', txt: 'n/s' });
    expect(buscar(v, 'fcf_yield')).toMatchObject({ estado: 'ns', txt: 'n/s' });
  });
  test('banco: el FCF 12 meses no aparece (no aplica), igual que P/FCF y FCF yield', () => {
    const nubo = vistaDe('NUBO');
    expect(buscar(nubo, 'fcf_12m')).toBeNull();
    for (const id of ['p_fcf', 'fcf_yield']) expect(buscar(nubo, id)).toMatchObject({ estado: 'no_aplica' });
  });
});

test.describe('P/E vs media sin serie suficiente', () => {
  const sinMedias = { '5y': { valor: null, desde: null, hasta: null, trimestres: 0, trimestres_n_s: 0, completo: false }, '10y': { valor: null, desde: null, hasta: null, trimestres: 0, completo: false }, '15y': { valor: null, desde: null, hasta: null, trimestres: 0, completo: false } };
  test('con series de P/E cortas: "sin datos suficientes (datos desde <mes>)", sin paréntesis vacíos ni "hasta " vacío', () => {
    const it = buscar(vistaDe('ACME', { 'historia-ACME.json': D.historia({ ticker: 'ACME', medias: sinMedias }) }), 'p_e_vs_media_5_10_15_anos');
    expect(it).toMatchObject({ estado: 'sin_datos', txt: 'sin datos suficientes (datos desde dic-22)' });
    expect(it.fuente.base.detalle).toBe('');
    for (const l of it.lineas) expect(l.txt).toBe('sin datos suficientes (datos desde dic-22)');
    expect(JSON.stringify(it)).not.toMatch(/hasta "|\(\)|\(hasta \)/);
  });
  test('sin ningún P/E trimestral (empresa sin EPS TTM): "sin datos suficientes" a secas', () => {
    const it = buscar(vistaDe('ACME', { 'historia-ACME.json': D.historia({ ticker: 'ACME', medias: sinMedias, pe: false }) }), 'p_e_vs_media_5_10_15_anos');
    expect(it).toMatchObject({ estado: 'sin_datos', txt: 'sin datos suficientes' });
    for (const l of it.lineas) expect(l.txt).toBe('sin datos suficientes');
  });
});

test.describe('punto del gráfico Crecimiento vs Valuación', () => {
  const emp = t => ARCH['radar-config.json'].empresas.find(e => e.ticker === t);
  const punto = t => V.puntoCrecimiento(ARCH['mercado-' + t + '.json'], emp(t));

  test('normal: X = P/E forward del año fiscal en curso, Y = CAGR del EPS a 2 años del consenso', () => {
    expect(punto('ACME')).toMatchObject({ ok: true, x: 18, y: 0.2, modo: '2a', nota: '' });
  });
  test('base inflada (el EPS del último año informado es mucho mayor que el del año en curso): se usa el crecimiento del año siguiente vs el actual, con nota', () => {
    const p = punto('E08');
    expect(p.ok).toBe(true); expect(p.modo).toBe('1a');
    expect(p.y).toBeCloseTo(4.2 / 3 - 1, 6);
    expect(p.nota).toMatch(/distorsionado/);
  });
  test('salto en el año del medio: se deja el CAGR a 2 años y se marca el punto con nota', () => {
    const p = punto('E07');
    expect(p).toMatchObject({ ok: true, modo: '2a', y: 0.22 });
    expect(p.nota).toMatch(/extraordinarios/);
  });
  test('EPS negativo o sin P/E forward: la empresa no entra al gráfico y dice por qué; sin archivos: "sin datos de mercado todavía"', () => {
    expect(punto('ZETA')).toMatchObject({ ok: false, motivo: expect.stringMatching(/no significativo/) });
    expect(V.puntoCrecimiento(null, emp('QUIM'))).toMatchObject({ ok: false, motivo: 'sin datos de mercado todavía', aviso: true });
  });
  test('la advertencia de márgenes viaja con la empresa (campo aviso_margenes del config), sin tickers en el código', () => {
    expect(punto('NUBO').aviso).toBe(true);
    expect(punto('ACME').aviso).toBe(false);
  });
});

// ───────────────────────── R7 ─────────────────────────
const manualCon = (extra) => ({ v: 1, empresas: { ACME: Object.assign({ pe_forward_media: { '5y': 20, '10y': null, '15y': null, mediana: 16, desde: 'dic-21', fuente: 'Fuente inventada', url: 'https://example.test/m', fecha_dato: '2026-11-06' }, pares: [], wacc: { valor: null } }, extra) } });
const mercadoAcme = (o = {}) => D.mercado(Object.assign({ ticker: 'ACME', pf: 18, act: 5.5, sig: 6.6, base: 4.6, cagr: 0.2, pfs: 15 }, o));
// Historia plana (todo igual cada trimestre) para poder verificar a mano: ingresos 1.000 M, resultado operativo 200 M, impuestos 40 M sobre 160 M antes de impuestos (25%),
// intereses 10 M, costo de ventas 400 M. Balance: deuda 500 M; patrimonio 1.900 M hoy y 1.500 M hace un año (resto 1.700 M); activos 6.000 M hoy y 5.000 M hace un año; por cobrar 100 M, por pagar 160 M, inventario 80 M.
const historiaPlana = (o = {}) => {
  const h = D.historia({ ticker: 'ACME' });
  h.trimestres.forEach((r, i) => {
    const hoy = i === h.trimestres.length - 1, haceUnAnio = i === h.trimestres.length - 5;
    Object.assign(r, { ingresos: 1000e6, utilidad_operativa: 200e6, da: 50e6, impuestos: 40e6, utilidad_antes_impuestos: 160e6, intereses: 10e6, costo_ventas: 400e6, deuda: 500e6, caja: 800e6,
      patrimonio: hoy ? 1900e6 : haceUnAnio ? 1500e6 : 1700e6, activos_totales: hoy ? 6000e6 : haceUnAnio ? 5000e6 : 5500e6, capital_invertido: null, cxc: 100e6, cxp: 160e6, inventario: o.sinInventario ? null : 80e6 }, o.fila || {});
  });
  return h;
};

test.describe('P/E forward de los próximos 12 meses (NTM)', () => {
  test('la ficha lo muestra como "P/E fwd (12 meses)", con la ponderación del año fiscal en curso y el siguiente y su cierre', () => {
    const it = buscar(vistaDe('ACME'), 'p_e_forward');
    expect(it).toMatchObject({ nombre: 'P/E fwd (12 meses)', estado: 'ok', txt: '18,0x', kind: 'x' });
    expect(it.lineas.map(l => l.k)).toEqual(['EPS estimado de los próximos 12 meses', 'Ponderación', 'Cierre del año fiscal en curso']);
    expect(it.lineas[1].txt).toBe('15% del EPS 2026e (US$ 5,50) + 85% del EPS 2027e (US$ 6,60)');
    expect(it.lineas[2].txt).toBe('31/12/26');
    expect(it.fuente).toMatchObject({ tipo: 'calculo' });
    expect(it.fuente.detalle).toMatch(/w = meses que faltan para el cierre del año fiscal ÷ 12/);
  });
  test('el P/E del año fiscal en curso y el del siguiente son detalle aparte, cada uno con su rótulo; el principal no se confunde con ellos', () => {
    const v = vistaDe('ACME', { 'mercado-ACME.json': mercadoAcme({ pf: 17, pfa: 21, pfs: 16 }) });
    expect(buscar(v, 'p_e_forward').txt).toBe('17,0x');
    expect(buscar(v, 'p_e_forward_fy_actual')).toMatchObject({ nombre: 'P/E fwd año fiscal en curso (EPS 2026e)', txt: '21,0x' });
    expect(buscar(v, 'p_e_forward_siguiente')).toMatchObject({ nombre: 'P/E fwd año fiscal siguiente (EPS 2027e)', txt: '16,0x' });
  });
  test('EPS esperado ≤ 0 en los 12 meses: n/s; sin estimaciones: "sin datos todavía"', () => {
    expect(buscar(vistaDe('ZETA'), 'p_e_forward')).toMatchObject({ estado: 'ns', txt: 'n/s', nombre: 'P/E fwd (12 meses)' });
    const m = mercadoAcme(); delete m.pe_forward_ntm;
    expect(buscar(vistaDe('ACME', { 'mercado-ACME.json': m }), 'p_e_forward')).toMatchObject({ estado: 'sin_datos' });
  });
  test('P/E fwd con EPS en otra moneda: n/s con el motivo, no un número', () => {
    const m = mercadoAcme(); m.pe_forward_ntm = { valor: null, fuente: 'yahoo', fecha: '2026-11-06', motivo: 'no comparable: EPS en CNY, precio en USD' };
    const it = buscar(vistaDe('ACME', { 'mercado-ACME.json': m }), 'p_e_forward');
    expect(it).toMatchObject({ estado: 'ns', txt: 'n/s' }); expect(it.detalle).toMatch(/EPS en CNY, precio en USD/);
  });
  test('vs media de 5, 10 y 15 años: compara el NTM con la media de Stock Analysis y muestra media y mediana rotuladas', () => {
    const it = buscar(vistaDe('ACME', { 'radar-manual.json': manualCon({}) }), 'p_e_forward_vs_media_5_10_15_anos');
    expect(it.nombre).toBe('P/E fwd (12 meses) vs media de 5, 10 y 15 años');
    expect(it.txt).toBe('-10,0% vs media 5 años');              // 18 / 20 − 1
    expect(it.lineas[0]).toEqual({ k: 'Media 5a / mediana 5a (desde dic-21)', txt: '20,0x / 16,0x · hoy -10,0% vs media · +12,5% vs mediana' });
    expect(it.lineas.slice(1).map(l => l.txt)).toEqual(['pendiente', 'pendiente']);
  });
  test('sin mediana cargada, la línea de 5 años es solo la media', () => {
    const man = manualCon({}); delete man.empresas.ACME.pe_forward_media.mediana;
    expect(buscar(vistaDe('ACME', { 'radar-manual.json': man }), 'p_e_forward_vs_media_5_10_15_anos').lineas[0]).toEqual({ k: 'Media 5 años (desde dic-21)', txt: '20,0x · hoy -10,0%' });
  });
  test('el gráfico usa el NTM en el eje X', () => {
    expect(V.puntoCrecimiento(mercadoAcme({ pf: 22, pfa: 30 }), ARCH['radar-config.json'].empresas[0])).toMatchObject({ ok: true, x: 22 });
  });
});

test.describe('PEG', () => {
  test('PEG = P/E fwd (12 meses) ÷ crecimiento esperado del EPS en %; la API de Yahoo (pegRatio) no se usa', () => {
    const m = mercadoAcme(); m.peg = { valor: 9.99, fuente: 'yahoo', fecha: '2026-11-06' };
    const it = buscar(vistaDe('ACME', { 'mercado-ACME.json': m }), 'peg');
    expect(it).toMatchObject({ estado: 'ok', txt: '0,90x', kind: 'x2' });            // 18 / (0,20 × 100)
    expect(it.num).toBeCloseTo(0.9, 10);
    expect(it.lineas).toEqual([{ k: 'P/E fwd (12 meses)', txt: '18,0x' }, { k: 'Crecimiento esperado del EPS (CAGR a 2 años)', txt: '+20,0%' }]);
    expect(it.fuente).toMatchObject({ tipo: 'calculo' });
  });
  test('crecimiento esperado ≤ 0 → n/s; P/E fwd no significativo → n/s; sin crecimiento estimado → sin datos', () => {
    expect(buscar(vistaDe('ACME', { 'mercado-ACME.json': mercadoAcme({ cagr: -0.05 }) }), 'peg')).toMatchObject({ estado: 'ns', txt: 'n/s' });
    expect(buscar(vistaDe('ZETA'), 'peg')).toMatchObject({ estado: 'ns', txt: 'n/s' });
    const m = mercadoAcme({ cagr: null }); m.estimaciones.valor.anio_proximo.eps.promedio = null;
    expect(buscar(vistaDe('ACME', { 'mercado-ACME.json': m }), 'peg').estado).toBe('sin_datos');
  });
  test('usa el mismo crecimiento que el eje Y del gráfico (con base distorsionada, el del año siguiente vs el actual)', () => {
    const it = buscar(vistaDe('ACME', { 'mercado-ACME.json': D.mercado({ ticker: 'ACME', pf: 28, act: 3, sig: 4.2, base: 6, cagr: -0.16 }) }), 'peg');
    expect(it.num).toBeCloseTo(28 / ((4.2 / 3 - 1) * 100), 10);
    expect(it.nota).toMatch(/distorsionado/);
  });
});

test.describe('TTM con la SEC cuando trae un trimestre más nuevo que Yahoo', () => {
  const ult4 = (k) => ARCH['historia-ACME.json'].trimestres.slice(-4).reduce((a, r) => a + r[k], 0);
  const conYahooAtrasado = (extra = {}) => Object.assign({ 'mercado-ACME.json': mercadoAcme({ ultQ: '2026-06-30', pe_ttm: 30 }) }, extra);

  test('Yahoo llega al 30/06 y la SEC ya tiene el 30/09: P/E TTM = precio ÷ EPS TTM de la SEC, rotulado, con la fuente y la nota', () => {
    const it = buscar(vistaDe('ACME', conYahooAtrasado()), 'p_e_ttm');
    expect(it).toMatchObject({ estado: 'ok', txt: '25,0x' });                    // 100 / 4, no el 30x de Yahoo
    expect(it.fuente).toMatchObject({ tipo: 'calculo' });
    expect(it.fuente.detalle).toMatch(/EPS diluido de los últimos 4 trimestres de la SEC \(hasta 30\/09\/26\)/);
    expect(it.nota).toBe('La SEC ya presentó el trimestre al 30/09/26 y Yahoo llega hasta el 30/06/26: se calcula con los trimestres de la SEC.');
    expect(it.lineas[0].k).toMatch(/SEC hasta 30\/09\/26/);
  });
  test('si Yahoo ya llega al último trimestre de la SEC, se usa el P/E de Yahoo tal cual', () => {
    const it = buscar(vistaDe('ACME', { 'mercado-ACME.json': mercadoAcme({ ultQ: '2026-09-30', pe_ttm: 30 }) }), 'p_e_ttm');
    expect(it.txt).toBe('30,0x'); expect(it.fuente.tipo).toBe('yahoo'); expect(it.nota).toBe('');
  });
  test('EPS TTM de la SEC ≤ 0: n/s; el P/E vs media usa el mismo P/E TTM actual', () => {
    const h = D.historia({ ticker: 'ACME' }); h.trimestres.at(-1).eps_ttm = -1;
    expect(buscar(vistaDe('ACME', conYahooAtrasado({ 'historia-ACME.json': h })), 'p_e_ttm')).toMatchObject({ estado: 'ns', txt: 'n/s' });
    const it = buscar(vistaDe('ACME', conYahooAtrasado()), 'p_e_vs_media_5_10_15_anos');
    expect(it.txt).toBe('+13,6% vs media 5 años');                              // 25 / 22 − 1 (con el 30 de Yahoo sería +36,4%)
  });
  test('ingresos y EBITDA de 12 meses salen de la historia (suma de 4 trimestres), con la nota cuando la SEC es más nueva', () => {
    const v = vistaDe('ACME', conYahooAtrasado());
    const ing = buscar(v, 'ingresos_ttm'), ebitda = buscar(v, 'ebitda_ttm');
    expect(ing).toMatchObject({ nombre: 'Ingresos 12 meses (TTM)', estado: 'ok', num: ult4('ingresos') });
    expect(ebitda).toMatchObject({ nombre: 'EBITDA 12 meses (TTM)', estado: 'ok', num: ult4('utilidad_operativa') + ult4('da') });
    expect(ing.nota).toMatch(/La SEC ya presentó el trimestre al 30\/09\/26/);
    expect(buscar(vistaDe('ACME'), 'ingresos_ttm').nota).toBe('');
  });
  test('EV/EBITDA con la SEC más nueva: (valor de mercado + deuda − caja del trimestre) ÷ EBITDA 12 meses; sin SEC más nueva, el de Yahoo', () => {
    const e = ult4('utilidad_operativa') + ult4('da');
    const it = buscar(vistaDe('ACME', conYahooAtrasado()), 'ev_ebitda');
    expect(it.num).toBeCloseTo((1e10 + 500e6 - 800e6) / e, 6);
    expect(it.fuente.tipo).toBe('calculo'); expect(it.nota).toMatch(/SEC/);
    expect(buscar(vistaDe('ACME'), 'ev_ebitda')).toMatchObject({ txt: '14,0x', fuente: { tipo: 'yahoo' } });
  });
  test('banco: no hay EV/EBITDA ni extras de EBITDA aunque la SEC sea más nueva', () => {
    const v = vistaDe('NUBO', { 'mercado-NUBO.json': D.mercado({ ticker: 'NUBO', pf: 9, ultQ: '2026-06-30' }) });
    expect(buscar(v, 'ev_ebitda').estado).toBe('no_aplica'); expect(buscar(v, 'ebitda_ttm')).toBeNull();
  });
});

test.describe('ROIC, rotación de activos, cobertura de intereses y ciclo de conversión de caja', () => {
  const v = (o) => vistaDe('ACME', { 'historia-ACME.json': historiaPlana(o), 'radar-manual.json': manualCon({ wacc: { valor: 0.0733, rango: { bajo: 0.064, alto: 0.083 }, metodo: 'CAPM', fuente: 'ValueInvesting.io', url: 'https://example.test/wacc', fecha_dato: '2026-11-06' } }) });

  test('ROIC = NOPAT 12 meses ÷ capital invertido promedio: 800 × (1 − 25%) = 600; capital (deuda + patrimonio) 2.400 hoy y 2.000 hace un año → promedio 2.200', () => {
    const it = buscar(v(), 'roic');
    expect(it.estado).toBe('ok'); expect(it.num).toBeCloseTo(600 / 2200, 10); expect(it.txt).toBe('27,3%');
    expect(it.lineas).toEqual([{ k: 'NOPAT 12 meses', txt: 'US$ 600 M' }, { k: 'Tasa efectiva de impuestos (12 meses)', txt: '25,0%' }, { k: 'Capital invertido promedio', txt: 'US$ 2,2 mil M' }]);
    expect(it.fuente.tipo).toBe('calculo'); expect(it.fuente.detalle).toMatch(/NOPAT .* ÷ capital invertido promedio/);
  });
  test('si Yahoo informa el capital invertido, se usa ese en vez de deuda + patrimonio', () => {
    const h = historiaPlana(); h.trimestres.at(-1).capital_invertido = 3000e6; h.trimestres.at(-5).capital_invertido = 2600e6;   // promedio 2.800
    const it = buscar(vistaDe('ACME', { 'historia-ACME.json': h }), 'roic');
    expect(it.num).toBeCloseTo(600 / 2800, 10);
  });
  test('tasa efectiva fuera de 0–50% o utilidad antes de impuestos ≤ 0: n/s; sin impuestos o sin capital de hace un año: "sin datos todavía" con el motivo', () => {
    expect(buscar(v({ fila: { impuestos: 100e6 } }), 'roic')).toMatchObject({ estado: 'ns' });             // 62,5%
    expect(buscar(v({ fila: { utilidad_antes_impuestos: -5e6 } }), 'roic')).toMatchObject({ estado: 'ns' });
    const sinImp = buscar(v({ fila: { impuestos: null } }), 'roic');
    expect(sinImp).toMatchObject({ estado: 'sin_datos' }); expect(sinImp.detalle).toMatch(/impuesto/);
    const h = historiaPlana(); h.trimestres.at(-5).patrimonio = null; h.trimestres.at(-5).deuda = null;
    expect(buscar(vistaDe('ACME', { 'historia-ACME.json': h }), 'roic').detalle).toMatch(/capital invertido/);
  });
  test('ROIC vs WACC: crea valor si el ROIC supera el extremo alto del rango; destruye valor si queda debajo del bajo; en el medio, sin conclusión', () => {
    const it = buscar(v(), 'roic_vs_wacc');
    expect(it).toMatchObject({ estado: 'ok', kind: 'pp' }); expect(it.num).toBeCloseTo((600 / 2200 - 0.0733) * 100, 8); expect(it.txt).toBe('+19,9 pp · crea valor');
    expect(it.lineas).toEqual([{ k: 'ROIC', txt: '27,3%' }, { k: 'WACC (rango 6,4% – 8,3%)', txt: '7,3%' }]);
    const alto = vistaDe('ACME', { 'historia-ACME.json': historiaPlana(), 'radar-manual.json': manualCon({ wacc: { valor: 0.30, rango: { bajo: 0.28, alto: 0.32 }, fuente: 'x', fecha_dato: '2026-11-06' } }) });
    expect(buscar(alto, 'roic_vs_wacc').txt).toBe('-2,7 pp · destruye valor');
    const medio = vistaDe('ACME', { 'historia-ACME.json': historiaPlana(), 'radar-manual.json': manualCon({ wacc: { valor: 0.27, rango: { bajo: 0.25, alto: 0.29 }, fuente: 'x', fecha_dato: '2026-11-06' } }) });
    expect(buscar(medio, 'roic_vs_wacc').txt).toMatch(/dentro del rango del WACC$/);
  });
  test('WACC visible en la ficha: valor, rango, método, fuente (ValueInvesting.io) y fecha de la carga; sin WACC cargado, "pendiente"', () => {
    const w = buscar(v(), 'wacc');
    expect(w).toMatchObject({ nombre: 'WACC', estado: 'ok', txt: '7,3%', fuente: { tipo: 'manual', titulo: 'Cargado por vos el 06/11/26', detalle: 'ValueInvesting.io', url: 'https://example.test/wacc' } });
    expect(w.lineas).toEqual([{ k: 'Rango', txt: '6,4% – 8,3%' }, { k: 'Método', txt: 'CAPM' }]);
    expect(buscar(vistaDe('ACME'), 'wacc')).toMatchObject({ estado: 'pendiente' });
    expect(buscar(vistaDe('ACME'), 'roic_vs_wacc')).toMatchObject({ estado: 'pendiente' });
  });
  test('rotación de activos = ingresos 12 meses ÷ activos promedio: 4.000 ÷ 5.500', () => {
    const it = buscar(v(), 'rotacion_de_activos');
    expect(it.num).toBeCloseTo(4000 / 5500, 10); expect(it.txt).toBe('0,73x');
    expect(it.fuente.tipo).toBe('calculo');
  });
  test('cobertura de intereses = resultado operativo 12 meses ÷ intereses 12 meses: 800 ÷ 40 = 20x; sin intereses en la fuente: sin datos', () => {
    expect(buscar(v(), 'cobertura_de_intereses')).toMatchObject({ estado: 'ok', txt: '20,0x', num: 20 });
    expect(buscar(v({ fila: { intereses: null } }), 'cobertura_de_intereses')).toMatchObject({ estado: 'sin_datos' });
  });
  test('ciclo de conversión de caja = DSO + DIO − DPO: 9,1 + 18,3 − 36,5 días; sin inventario, DSO − DPO con nota', () => {
    const it = buscar(v(), 'ciclo_de_conversion_de_caja');
    expect(it.num).toBeCloseTo(100 / 4000 * 365 + 80 / 1600 * 365 - 160 / 1600 * 365, 8); expect(it.txt).toBe('-9 días');
    expect(it.lineas.map(l => l.txt)).toEqual(['9 días', '18 días', '37 días']);
    expect(it.nota).toBe('');
    const sin = buscar(v({ sinInventario: true }), 'ciclo_de_conversion_de_caja');
    expect(sin.num).toBeCloseTo(100 / 4000 * 365 - 160 / 1600 * 365, 8); expect(sin.txt).toBe('-27 días');
    expect(sin.lineas[1].txt).toBe('sin inventario'); expect(sin.nota).toMatch(/DSO − DPO/);
  });
  test('sin costo de ventas o sin cuentas por cobrar/pagar: sin datos, nunca un cero', () => {
    expect(buscar(v({ fila: { costo_ventas: null } }), 'ciclo_de_conversion_de_caja')).toMatchObject({ estado: 'sin_datos' });
    expect(buscar(v({ fila: { cxc: null } }), 'ciclo_de_conversion_de_caja')).toMatchObject({ estado: 'sin_datos' });
  });
});

test.describe('valuación vs pares (P/E fwd 12 meses)', () => {
  const par = (valor, nombre, motivo) => ({ nombre, precio: { valor: 10, fecha: '2026-11-05' }, pe_forward_ntm: motivo ? { valor: null, motivo } : { valor, fuente: 'yahoo', fecha: '2026-11-06' } });
  const vp = (pares, mercadoPares) => {
    const config = ARCH['radar-config.json'], emp = config.empresas.find(e => e.ticker === 'ACME');
    return V.vista({ config, emp, mercado: ARCH['mercado-ACME.json'], historia: ARCH['historia-ACME.json'], kpis: ARCH['kpis-ACME.json'], manual: manualCon({ pares, pares_fecha: '2026-11-06' }), paresMercado: mercadoPares });
  };
  test('compara el P/E fwd NTM de la empresa con la MEDIANA de sus pares y lista cada par con su valor', () => {
    const it = buscar(vp(['P1', 'P2', 'P3'], { P1: par(15, 'Par Uno'), P2: par(20, 'Par Dos'), P3: par(40, 'Par Tres') }), 'valuacion_vs_pares');
    expect(it.estado).toBe('ok'); expect(it.txt).toBe('-10,0% vs mediana de pares');   // 18 / 20 − 1
    expect(it.lineas).toEqual([{ k: 'Esta empresa', txt: '18,0x' }, { k: 'Mediana de 3 pares', txt: '20,0x' }, { k: 'P1 · Par Uno', txt: '15,0x' }, { k: 'P2 · Par Dos', txt: '20,0x' }, { k: 'P3 · Par Tres', txt: '40,0x' }]);
    expect(it.fuente.detalle).toBe('P/E fwd (12 meses) de la empresa ÷ mediana del P/E fwd (12 meses) de sus pares − 1');
    expect(it.fuente.base.titulo).toBe('Pares cargados por vos el 06/11');
  });
  test('cantidad par de pares: mediana = promedio de los dos del medio; un par con EPS esperado negativo figura como n/s y no entra', () => {
    const it = buscar(vp(['P1', 'P2', 'P3', 'P4'], { P1: par(15), P2: par(20), P3: par(0, 'Par Tres', 'n/s'), P4: par(25) }), 'valuacion_vs_pares');
    expect(it.lineas[1]).toEqual({ k: 'Mediana de 3 pares', txt: '20,0x' });
    expect(it.lineas.find(l => l.k.startsWith('P3'))).toEqual({ k: 'P3 · Par Tres', txt: 'n/s' });
    const pares2 = buscar(vp(['P1', 'P2'], { P1: par(15), P2: par(25) }), 'valuacion_vs_pares');
    expect(pares2.lineas[1].txt).toBe('20,0x');
  });
  test('menos de 2 pares con P/E válido, o pares que el job todavía no bajó: "sin datos todavía" con la lista, sin inventar', () => {
    const uno = buscar(vp(['P1', 'P2'], { P1: par(15), P2: par(0, 'Par Dos', 'n/s') }), 'valuacion_vs_pares');
    expect(uno.estado).toBe('sin_datos'); expect(uno.detalle).toMatch(/al menos 2 pares/);
    const nada = buscar(vp(['P1', 'P2'], {}), 'valuacion_vs_pares');
    expect(nada.estado).toBe('sin_datos'); expect(nada.lineas.map(l => l.txt)).toEqual(['sin datos todavía', 'sin datos todavía']);
  });
});

test.describe('banco: margen bruto', () => {
  test('Yahoo informa 0 para un banco → "no aplica (banco)", nunca 0,0%', () => {
    const m = D.mercado({ ticker: 'NUBO', pf: 9 }); m.margenes = { valor: { bruto: null, operativo: 0.3, neto: 0.2 }, fuente: 'yahoo', fecha: '2026-11-06', motivo_bruto: 'no aplica (banco)' };
    const it = buscar(vistaDe('NUBO', { 'mercado-NUBO.json': m }), 'margen_bruto');
    expect(it).toMatchObject({ estado: 'no_aplica', txt: 'no aplica (banco)' }); expect(it.num).toBeUndefined();
    const viejo = D.mercado({ ticker: 'NUBO', pf: 9 }); viejo.margenes = { valor: { bruto: 0, operativo: 0.3, neto: 0.2 }, fuente: 'yahoo', fecha: '2026-11-06' };
    expect(buscar(vistaDe('NUBO', { 'mercado-NUBO.json': viejo }), 'margen_bruto')).toMatchObject({ estado: 'no_aplica', txt: 'no aplica (banco)' });   // archivo anterior al cambio del job
    expect(buscar(vistaDe('ACME'), 'margen_bruto')).toMatchObject({ estado: 'ok', txt: '60,0%' });
  });
});
