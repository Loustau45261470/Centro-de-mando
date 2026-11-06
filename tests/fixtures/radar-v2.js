'use strict';
// Datos INVENTADOS del Radar v2 (empresas ficticias: ninguna es de la cartera real ni existe). Misma forma que los archivos del repo
// privado de datos: radar-config.json, mercado-<T>.json, historia-<T>.json, kpis-<T>.json, radar-manual.json y reportes.json.

const GENERALES = [
  ['distancia_al_ath', 'precio', 'Distancia al ATH', '%', 'yahoo'], ['drawdown_maximo_desde_ath', 'precio', 'Drawdown máximo desde ATH', '%', 'yahoo'], ['rango_52_semanas', 'precio', 'Rango 52 semanas', 'USD', 'yahoo'],
  ['ingresos_totales_a_a', 'crecimiento', 'Ingresos totales a/a', '%', 'sec'], ['ingresos_totales_t_t', 'crecimiento', 'Ingresos totales t/t', '%', 'sec'], ['crecimiento_de_ingresos_a_moneda_constante', 'crecimiento', 'Crecimiento de ingresos a moneda constante', '%', 'comunicado'],
  ['margen_bruto', 'rentabilidad', 'Margen bruto', '%', 'sec'], ['margen_operativo', 'rentabilidad', 'Margen operativo', '%', 'sec'], ['margen_neto', 'rentabilidad', 'Margen neto', '%', 'sec'], ['eps_gaap', 'rentabilidad', 'EPS GAAP', 'USD', 'sec'], ['eps_ajustado', 'rentabilidad', 'EPS ajustado', 'USD', 'comunicado'],
  ['fcf_utilidad_neta', 'calidad_ganancias', 'FCF / utilidad neta', 'x', 'calc'], ['sbc_ingresos', 'calidad_ganancias', 'SBC % ingresos', '%', 'sec'], ['fcf_neto_de_sbc', 'calidad_ganancias', 'FCF neto de SBC', 'USD', 'calc'],
  ['flujo_operativo', 'caja', 'Flujo operativo', 'USD', 'sec'], ['fcf', 'caja', 'FCF', 'USD', 'sec'], ['capex', 'caja', 'Capex', 'USD', 'sec'], ['capex_ingresos', 'caja', 'Capex / ingresos', '%', 'calc'],
  ['roe', 'eficiencia_retorno', 'ROE', '%', 'yahoo'], ['roic', 'eficiencia_retorno', 'ROIC', '%', 'calc'], ['roic_vs_wacc', 'eficiencia_retorno', 'ROIC vs WACC', 'pp', 'calc'], ['margen_incremental', 'eficiencia_retorno', 'Margen incremental', '%', 'calc'],
  ['deuda_neta', 'balance_riesgo', 'Deuda neta', 'USD', 'yahoo'], ['deuda_neta_ebitda', 'balance_riesgo', 'Deuda neta / EBITDA', 'x', 'calc'], ['liquidez_caja_inversiones_de_corto_plazo', 'balance_riesgo', 'Liquidez (caja + inversiones de corto plazo)', 'USD', 'sec'],
  ['recompras', 'capital', 'Recompras', 'USD', 'sec'], ['dilucion_variacion_a_a_de_acciones', 'capital', 'Dilución (variación a/a de acciones)', '%', 'sec'],
  ['p_e_ttm', 'valuacion', 'P/E TTM', 'x', 'yahoo'], ['p_e_vs_media_5_10_15_anos', 'valuacion', 'P/E vs media 5/10/15 años', 'x', 'calc'], ['p_e_forward', 'valuacion', 'P/E forward', 'x', 'yahoo'],
  ['p_e_forward_vs_media_5_10_15_anos', 'valuacion', 'P/E forward vs media 5/10/15 años', 'x', 'manual'], ['ev_ebitda', 'valuacion', 'EV/EBITDA', 'x', 'yahoo'], ['p_fcf', 'valuacion', 'P/FCF', 'x', 'calc'], ['fcf_yield', 'valuacion', 'FCF yield', '%', 'calc'], ['valuacion_vs_pares', 'valuacion', 'Valuación vs pares', 'x', 'manual'],
  ['rule_of_40', 'valuacion', 'Rule of 40', '%', 'calc', ['NUBO']],
  ['sorpresa_vs_consenso_eps', 'expectativas_mercado', 'Sorpresa vs consenso (EPS)', '%', 'yahoo'], ['precio_objetivo_promedio', 'expectativas_mercado', 'Precio objetivo promedio', 'USD', 'yahoo'], ['short_interest', 'expectativas_mercado', 'Short interest', '%', 'yahoo'],
].map(([id, seccion, nombre, unidad, fuente, aplica_a]) => Object.assign({ id, seccion, nombre, unidad, fuente }, aplica_a ? { aplica_a } : {}));

const ESPECIFICOS_ACME = [
  { id: 'volumen_de_pagos', nombre: 'Volumen de pagos', unidad: 'USD', notas: 'Total procesado en el trimestre.' },
  { id: 'tarjetas_emitidas', nombre: 'Tarjetas emitidas', unidad: 'n' },
  { id: 'mora_90_dias', nombre: 'Mora a 90 días', unidad: '%' },
  { id: 'riesgo_regulatorio', nombre: 'Riesgo regulatorio', unidad: 'texto' },
  { id: 'costo_por_envio', nombre: 'Costo por envío', unidad: 'USD' },
];

function config(extra = 8) {
  const emp = [
    { ticker: 'ACME', nombre: 'Acme Pagos', ir_url: 'https://example.test/acme', cotiza_desde: '2021-03-01', financiera: false, icono: 'acmeicon', notas: 'Empresa inventada para pruebas.', kpis_especificos: ESPECIFICOS_ACME },
    { ticker: 'NUBO', nombre: 'Nubo Banco', ir_url: 'https://example.test/nubo', cotiza_desde: null, financiera: true, aviso_margenes: true, icono: null, kpis_especificos: [{ id: 'clientes', nombre: 'Clientes', unidad: 'n' }] },
    { ticker: 'ZETA', nombre: 'Zeta Motores', ir_url: 'https://example.test/zeta', cotiza_desde: null, financiera: false, icono: 'zetaicon', kpis_especificos: [] },
    { ticker: 'QUIM', nombre: 'Quimera Labs', ir_url: 'https://example.test/quim', cotiza_desde: null, financiera: false, aviso_margenes: true, icono: null, kpis_especificos: [{ id: 'molecula_estrella', nombre: 'Moléculas en fase 3', unidad: 'n' }] },
  ];
  for (let i = 5; i < 5 + extra; i++) emp.push({ ticker: 'E' + String(i).padStart(2, '0'), nombre: 'Empresa de prueba ' + i, ir_url: '', cotiza_desde: null, financiera: false, icono: null, kpis_especificos: [] });
  return { v: 1, _convenciones: 'inventado', empresas: emp, kpis_generales: GENERALES };
}

const campo = (valor, fecha = '2026-11-06', extra = {}) => Object.assign({ valor, fuente: 'yahoo', fecha }, extra);
// Mercado de una empresa inventada. o.sorp = sorpresa del último trimestre; o.pf = P/E forward; o.act / o.sig = EPS esperado año en curso / siguiente; o.base = EPS del último año informado; o.cagr = CAGR a 2 años.
function mercado(o = {}) {
  const act = o.act != null ? o.act : 5, sig = o.sig != null ? o.sig : 6, base = o.base != null ? o.base : 4;
  const m = {
    v: 1, nombre: o.nombre || 'Empresa inventada', moneda: 'USD', generado: o.generado || '2026-11-06',
    precio: campo(o.precio != null ? o.precio : 100, '2026-11-05'),
    ath: campo(120, '2026-01-15', { ath_yahoo: 120 }), distancia_ath: campo(o.dist != null ? o.dist : -0.1667, '2026-11-05'),
    drawdown_maximo: campo(-0.55, '2026-11-06', { pico: '2021-11-04', valle: '2022-12-28' }),
    rango_52s: campo({ min: 80, max: 120, posicion: 0.5 }, '2026-11-05'),
    pe_ttm: campo(o.pe_ttm !== undefined ? o.pe_ttm : 25), eps_ttm_gaap: campo(o.eps_ttm != null ? o.eps_ttm : 4),
    earnings_yield: campo(0.04), peg: campo(1.8),
    estimaciones: campo({ anio_actual: { fin: '2026-12-31', eps: { promedio: act, analistas: 20, hace_un_anio: base } }, anio_proximo: { fin: '2027-12-31', eps: { promedio: sig, analistas: 18, hace_un_anio: act } } }),
    pe_forward: campo(o.pf !== undefined ? o.pf : 20, '2026-11-06', { base: 'EPS estimado del año fiscal en curso' }),
    pe_forward_siguiente: campo(o.pfs !== undefined ? o.pfs : 16.7),
    eps_cagr_2a: campo(o.cagr !== undefined ? o.cagr : 0.2, '2026-11-06', { eps_base: base, eps_final: sig }),
    sorpresa_ultimo_trimestre: campo(o.sorp || { trimestre: '2026-09-30', eps_real: 1.1, eps_estimado: 1, diferencia: 0.1, sorpresa_pct: 0.1, ingresos: null }, '2026-09-30'),
    revisiones_eps: campo({ anio_actual: { actual: act, variacion_30d: 0.02, variacion_90d: 0.05, analistas_al_alza_30d: 4, analistas_a_la_baja_30d: 1 } }),
    precio_objetivo: campo({ promedio: 130, alto: 160, bajo: 100, mediana: 128, analistas: 25, potencial: 0.3 }),
    recomendaciones: campo({ compra_fuerte: 8, compra: 10, mantener: 5, venta: 1, venta_fuerte: 0, media: 1.9, clave: 'buy' }),
    insiders: campo({ transacciones_recientes: [], periodo: '6m', compras_n: 3, ventas_n: 1, neto_acciones: 12000 }),
    institucional: campo({ pct: 0.8, cantidad: 1200, neto_compra_pct: -0.02, principales: [] }, '2026-06-30'),
    short_interest: campo({ pct_float: 0.03, dias_para_cubrir: 2.5 }, '2026-10-15'),
    capitalizacion: campo(1.0e10, '2026-11-05'), ev: campo(1.2e10), ev_ebitda: campo(14), ev_ventas: campo(4), fcf: campo(6e8), p_fcf: campo(20), fcf_yield: campo(0.05), deuda_neta: campo(2e8),
    margenes: campo({ bruto: 0.6, operativo: 0.2, neto: 0.15 }), roe: campo(0.3),
    ticker: o.ticker || 'ACME',
  };
  if (o.stale) { m.stale_since = o.stale; m.ultimo_error = 'Yahoo no respondió'; }
  return m;
}

// 19 trimestres inventados (2022-03-31 … 2026-09-30). Ingresos +5% por trimestre; el último reporta 2026-09-30.
// o.fcf = función (i) → FCF del trimestre i (por defecto 18% de los ingresos); o.pe = false quita el P/E TTM de cada trimestre; o.n = cantidad de trimestres a conservar (los últimos).
function historia(o = {}) {
  const fines = []; for (let y = 2022, q = 1; ; ) { const f = [`${y}-03-31`, `${y}-06-30`, `${y}-09-30`, `${y}-12-31`][q - 1]; fines.push(f); if (f === '2026-09-30') break; q++; if (q > 4) { q = 1; y++; } }
  const trimestres = fines.map((fin, i) => {
    const ing = Math.round(1000e6 * Math.pow(1.05, i));
    const r = {
      fin, fuente: o.fuente || 'sec', presentado: o.fuente === 'yahoo' ? null : fin.slice(0, 4) + '-' + String(+fin.slice(5, 7) + 1).padStart(2, '0') + '-20',
      ingresos: ing, utilidad_operativa: o.sinOper ? null : Math.round(ing * 0.2), utilidad_neta: Math.round(ing * 0.15), eps_basico: +(0.5 + i * 0.02).toFixed(2), eps_diluido: +(0.48 + i * 0.02).toFixed(2),
      cfo: Math.round(ing * 0.22), capex: Math.round(ing * 0.04), fcf: o.fcf ? o.fcf(i) : Math.round(ing * 0.18), sbc: Math.round(ing * 0.03), da: Math.round(ing * 0.05),
      deuda: 500e6, caja: 800e6, acciones_diluidas: Math.round(300e6 - i * 1e6), acciones_circulacion: null, dividendos: null, recompras: 50e6, derivado_q4: false,
      precio_cierre: 100, eps_ttm: i >= 3 ? 4 : null, pe_ttm: i >= 3 && o.pe !== false ? +(20 + i * 0.3).toFixed(2) : null,
    };
    return r;
  });
  return {
    v: 1, ticker: o.ticker || 'ACME', generado: '2026-11-06', cotiza_desde: null, fuente_trimestres: 'sec', trimestres: o.n ? trimestres.slice(-o.n) : trimestres,
    medias_pe_ttm: o.medias || { '5y': { valor: 22, desde: '2023-09-30', hasta: '2026-09-30', trimestres: 13, completo: true }, '10y': { valor: 21, desde: '2023-09-30', hasta: '2026-09-30', trimestres: 13, completo: false, nota: 'desde la salida a bolsa (2021-03-01)' }, '15y': { valor: 21, desde: '2023-09-30', hasta: '2026-09-30', trimestres: 13, completo: false, nota: 'desde la salida a bolsa (2021-03-01)' } },
    splits_aplicados: [], notas: [],
  };
}

const URL_DOC = 'https://example.test/acme-q3-2026.htm';
function kpisAcme() {
  const f = (pagina, cita, tipo = 'comunicado') => ({ tipo, url: URL_DOC, pagina_o_slide: pagina, cita });
  return {
    v: 1, ticker: 'ACME', actualizado: '2026-11-06T01:00:00Z',
    trimestres: {
      '2026-Q2': { fecha_fin: '2026-06-30', kpis: { volumen_de_pagos: { valor: 1180, unidad: 'USD miles de millones', fuente: f('p. 5', 'Payments volume 1,180') } } },
      '2026-Q3': { fecha_fin: '2026-09-30', kpis: {
        crecimiento_de_ingresos_a_moneda_constante: { valor: 12.3, unidad: '%', fuente: f('p. 6, tabla de métricas clave', 'Constant currency revenue growth 12.3%') },
        eps_ajustado: { valor: null, motivo: 'no informado en este trimestre', fuente: { url: URL_DOC } },
        volumen_de_pagos: { valor: 1250, unidad: 'USD miles de millones', fuente: f('p. 5', 'Payments volume 1,250'), desglose: { Crédito: 700, Débito: 550 } },
        tarjetas_emitidas: { valor: 93, unidad: 'millones', proxy: true, nota: 'Sustituto: tarjetas con actividad.', fuente: f('slide 14', 'Cards in force 93 million', 'presentacion') },
        mora_90_dias: { valor: null, motivo: 'la empresa dejó de informarlo', fuente: { url: URL_DOC } },
        riesgo_regulatorio: { valor: 'Se discute un tope a las comisiones entre bancos; el efecto estimado todavía no se informa.', unidad: 'texto', fuente: f('p. 12', 'Regulatory matters') },
      } },
    },
  };
}
function kpisVacio(t) { return { v: 1, ticker: t, actualizado: null, trimestres: {} }; }

const manualVacio = () => ({ v: 1, empresas: {} });
const reportesBase = () => ([
  { id: 'ACME:margen_neto:2026-09-30', ticker: 'ACME', kpi_id: 'margen_neto', trimestre: '2026-09-30', valor_mostrado: '15,0%', comentario: '', estado: 'corregido', reportado_en: '2026-11-01T12:00:00Z', resuelto_en: '2026-11-03T08:00:00Z', resolucion: 'de 15,0% a 14,2%: el comunicado restó una partida' },
  { id: 'ACME:margen_operativo:2026-09-30', ticker: 'ACME', kpi_id: 'margen_operativo', trimestre: '2026-09-30', valor_mostrado: '20,0%', comentario: '', estado: 'confirmado', reportado_en: '2026-11-01T12:00:00Z', resuelto_en: '2026-11-03T08:00:00Z', resolucion: 'confirmado 20,0% (cita: "Operating margin 20.0%")' },
]);

// Mapa de archivos que sirve el Worker falso. Lo que no está acá responde 404 not_found ("sin datos todavía").
function archivos(over = {}) {
  const a = {
    'radar-config.json': config(),
    'mercado-ACME.json': mercado({ ticker: 'ACME', pf: 18, act: 5.5, sig: 6.6, base: 4.6, cagr: 0.2, pfs: 15 }),
    'historia-ACME.json': historia({ ticker: 'ACME' }),
    'kpis-ACME.json': kpisAcme(),
    'mercado-NUBO.json': mercado({ ticker: 'NUBO', pf: 9, act: 1.1, sig: 1.4, base: 0.9, cagr: 0.3, pe_ttm: 11, eps_ttm: 0.8 }),
    'historia-NUBO.json': historia({ ticker: 'NUBO', fuente: 'yahoo', sinOper: true }),
    'kpis-NUBO.json': kpisVacio('NUBO'),
    'mercado-ZETA.json': mercado({ ticker: 'ZETA', pf: null, pfs: null, pe_ttm: null, eps_ttm: -0.5, act: -0.4, sig: 0.3, base: -0.8, cagr: null }),
    'historia-ZETA.json': historia({ ticker: 'ZETA', medias: { '5y': { valor: null, desde: '2026-06-30', hasta: '2026-09-30', trimestres: 2, completo: true }, '10y': { valor: null }, '15y': { valor: null } } }),
    'kpis-ZETA.json': kpisVacio('ZETA'),
    'mercado-E05.json': mercado({ ticker: 'E05', pf: 12, act: 5, sig: 5.3, base: 4.8, cagr: 0.04 }),
    'mercado-E06.json': mercado({ ticker: 'E06', pf: 30, act: 5, sig: 5.4, base: 4.9, cagr: 0.05 }),
    'mercado-E07.json': mercado({ ticker: 'E07', pf: 22, act: 9, sig: 7.5, base: 5, cagr: 0.22 }),        // salto en el año del medio
    'mercado-E08.json': mercado({ ticker: 'E08', pf: 28, act: 3, sig: 4.2, base: 6, cagr: -0.16 }),       // base inflada
    'mercado-E09.json': mercado({ ticker: 'E09', pf: 19, act: 6, sig: 10, base: 4, cagr: 0.9 }),          // fuera de escala hacia arriba
    'reportes.json': reportesBase(),
    'radar-manual.json': manualVacio(),
  };
  return Object.assign(a, over);
}

module.exports = { config, mercado, historia, kpisAcme, kpisVacio, archivos, reportesBase, manualVacio, URL_DOC, GENERALES };
