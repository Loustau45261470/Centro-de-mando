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

  test('P/E: TTM GAAP, ajustado, forward del año en curso y del siguiente, siempre con la variante en el rótulo; EPS básico y diluido', () => {
    const v = vistaDe('ACME');
    expect(buscar(v, 'p_e_ttm')).toMatchObject({ nombre: 'P/E TTM (GAAP)', txt: '25,0x' });
    expect(buscar(v, 'p_e_ttm_ajustado')).toMatchObject({ nombre: 'P/E TTM ajustado', estado: 'sin_datos' });   // faltan 4 comunicados con EPS ajustado
    expect(buscar(v, 'p_e_forward')).toMatchObject({ nombre: 'P/E forward (EPS 2026e)', txt: '18,0x' });
    expect(buscar(v, 'p_e_forward_siguiente')).toMatchObject({ nombre: 'P/E forward (EPS 2027e)', txt: '15,0x' });
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
    for (const id of ['deuda_neta', 'deuda_neta_ebitda', 'ev_ebitda', 'fcf', 'fcf_utilidad_neta']) expect(buscar(nubo, id)).toMatchObject({ estado: 'no_aplica', txt: 'no aplica' });
    expect(buscar(nubo, 'rule_of_40')).not.toBeNull();
    expect(buscar(acme, 'rule_of_40')).toBeNull();
    expect(buscar(nubo, 'margen_operativo')).toMatchObject({ estado: 'sin_datos' });    // la fuente no trae resultado operativo: no se rellena con 0
    expect(buscar(nubo, 'margen_neto').estado).toBe('ok');
  });

  test('nunca un cero falso: lo que la fuente no trae queda "sin datos todavía"', () => {
    const v = vistaDe('ACME');
    for (const id of ['roic', 'dividendos', 'rotacion_de_activos']) { const i = buscar(v, id); if (i) { expect(i.estado).toBe('sin_datos'); expect(i.txt).toBe('sin datos todavía'); expect(i.num).toBeUndefined(); } }
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
  test('sin 4 trimestres seguidos de la SEC: FCF 12 meses de Yahoo rotulado como tal, y P/FCF y yield también de Yahoo', () => {
    const v = vistaDe('ACME', { 'historia-ACME.json': D.historia({ ticker: 'ACME', n: 2 }) });
    expect(buscar(v, 'fcf_12m')).toMatchObject({ nombre: 'FCF 12 meses (Yahoo)', origen: 'yahoo', txt: 'US$ 600 M' });
    expect(buscar(v, 'p_fcf')).toMatchObject({ txt: '20,0x', nota: 'Calculado por Yahoo con su FCF de 12 meses.' });
    expect(buscar(v, 'fcf_yield')).toMatchObject({ txt: '5,0%' });
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
