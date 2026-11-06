'use strict';
// ════════════════════════════════════════════════════════════════════════
// RADAR v2 — datos de mercado de Yahoo Finance (cliente + parseo PURO).
// Paquete: yahoo-finance2 (npm). Se eligió sobre un fetch a mano porque Yahoo exige cookie + crumb en cada sesión y cambia
// el formato seguido; ese paquete lo resuelve, está mantenido (v4, 2026) y expone quoteSummary / chart / fundamentalsTimeSeries.
// Todo se pide con validateResult:false: si Yahoo cambia un campo, el job no revienta, ese campo queda null.
//
// Convenciones de salida (las fija radar-config.json → _convenciones): ratios como fracción (0,0119 = 1,19%), fechas ISO yyyy-mm-dd,
// cada dato de mercado = { valor, fuente: 'yahoo', fecha } (+ motivo cuando valor es null por una razón conocida: 'n/s', 'no aplica…').
//
// Este archivo no sabe qué empresas existen: recibe el resumen de Yahoo y la historia de precios de una empresa y devuelve el JSON.
// ════════════════════════════════════════════════════════════════════════

const MODULOS = ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'earningsTrend', 'earningsHistory',
  'recommendationTrend', 'insiderTransactions', 'netSharePurchaseActivity', 'majorHoldersBreakdown', 'institutionOwnership', 'calendarEvents'];

const esNum = v => typeof v === 'number' && isFinite(v);
const num = v => { if (v && typeof v === 'object' && 'raw' in v) v = v.raw; return esNum(v) ? v : null; };
const iso = d => {
  if (d == null) return null;
  const t = d instanceof Date ? d.getTime() : typeof d === 'number' ? (d < 1e11 ? d * 1000 : d) : Date.parse(d);
  return isFinite(t) && t > 86400000 * 366 ? new Date(t).toISOString().slice(0, 10) : null; // 1970 = valor basura de Yahoo
};
const redond = (v, d = 6) => (esNum(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

const MS_DIA = 86400000;
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / MS_DIA);

// EPS estimado de los PRÓXIMOS 12 MESES (NTM): ponderación por los meses que faltan para cerrar el año fiscal en curso.
//   w = meses que faltan para el cierre del año fiscal actual / 12  (meses = días / (365,25 / 12), tope [0, 1])
//   EPS_NTM = w · EPS_FY0 + (1 − w) · EPS_FY1       (FY0/FY1 = earningsTrend '0y' / '+1y'; el cierre sale de la fecha de fin del '0y')
// Si el '0y' ya cerró (fecha de fin pasada, Yahoo todavía no rodó el año) w = 0 y el NTM es el EPS del año siguiente.
function epsNtm(fin0, hoy, eps0, eps1) {
  if (!fin0 || !hoy) return null;
  const faltan = diasEntre(hoy, fin0);
  const w = Math.min(1, Math.max(0, faltan / 365.25));
  const cerrado = faltan < 0;
  if (w > 0 && !esNum(eps0)) return null;
  if (w < 1 && !esNum(eps1)) return null;
  const e = (w > 0 ? w * eps0 : 0) + (w < 1 ? (1 - w) * eps1 : 0);
  return { eps: e, w: redond(w, 4), fin_fy_actual: fin0, cerrado, eps_fy_actual: esNum(eps0) ? eps0 : null, eps_fy_siguiente: esNum(eps1) ? eps1 : null };
}

function campo(valor, fecha, motivo) {
  const c = { valor: valor === undefined ? null : valor, fuente: 'yahoo', fecha: fecha || null };
  if (motivo) c.motivo = motivo;
  return c;
}

// Máximo histórico y peor caída (pico a valle) sobre precios diarios [{fecha, high, close}] (ya ajustados por splits).
function atl(precios, precioActual) {
  let ath = null, athFecha = null;
  let pico = null, picoFecha = null, peor = 0, peorPico = null, peorValle = null;
  for (const p of precios) {
    if (esNum(p.high) && (ath == null || p.high > ath)) { ath = p.high; athFecha = p.fecha; }
    if (!esNum(p.close)) continue;
    if (pico == null || p.close > pico) { pico = p.close; picoFecha = p.fecha; }
    const dd = p.close / pico - 1;
    if (dd < peor) { peor = dd; peorPico = picoFecha; peorValle = p.fecha; }
  }
  if (ath != null && esNum(precioActual) && precioActual > ath) { ath = precioActual; athFecha = null; }
  return { ath, athFecha, drawdownMax: precios.length ? { valor: redond(peor), pico: peorPico, valle: peorValle } : null };
}

const periodo = (trend, p) => (trend || []).find(t => t && t.period === p) || null;
function estimacion(t) {
  if (!t) return null;
  const e = t.earningsEstimate || {}, r = t.revenueEstimate || {};
  return {
    fin: iso(t.endDate),
    eps: { promedio: num(e.avg), bajo: num(e.low), alto: num(e.high), analistas: num(e.numberOfAnalysts), hace_un_anio: num(e.yearAgoEps), crecimiento: num(e.growth) },
    ventas: { promedio: num(r.avg), bajo: num(r.low), alto: num(r.high), analistas: num(r.numberOfAnalysts), hace_un_anio: num(r.yearAgoRevenue), crecimiento: num(r.growth) },
  };
}
function revision(t) {
  if (!t || !t.epsTrend) return null;
  const a = t.epsTrend, act = num(a.current);
  const v = k => num(a[k]);
  const var_ = k => (esNum(act) && esNum(v(k)) && v(k) !== 0 ? redond(act / v(k) - 1) : null);
  const r = t.epsRevisions || {};
  return {
    actual: act, hace_7d: v('7daysAgo'), hace_30d: v('30daysAgo'), hace_60d: v('60daysAgo'), hace_90d: v('90daysAgo'),
    variacion_7d: var_('7daysAgo'), variacion_30d: var_('30daysAgo'), variacion_60d: var_('60daysAgo'), variacion_90d: var_('90daysAgo'),
    analistas_al_alza_30d: num(r.upLast30days), analistas_a_la_baja_30d: num(r.downLast30days),
  };
}

// ── Parseo principal ──
// resumen: salida de quoteSummary (objeto de módulos). hist: { precios:[{fecha,high,close}] }. opts: { hoy:'yyyy-mm-dd', financiera:boolean }
function parsearMercado(resumen, hist, opts) {
  const R = resumen || {};
  const hoy = (opts && opts.hoy) || new Date().toISOString().slice(0, 10);
  const financiera = !!(opts && opts.financiera);
  const price = R.price || {}, sd = R.summaryDetail || {}, ks = R.defaultKeyStatistics || {}, fd = R.financialData || {};
  const precio = num(price.regularMarketPrice) != null ? num(price.regularMarketPrice) : num(fd.currentPrice);
  const fechaPrecio = iso(price.regularMarketTime) || hoy;
  const noAplica = 'no aplica (financiera)';
  const ev = x => (financiera ? campo(null, hoy, noAplica) : x);
  const out = { v: 1 };

  out.nombre = price.longName || price.shortName || null;
  out.moneda = price.currency || null;
  out.moneda_financiera = fd.financialCurrency || null;
  out.precio = campo(precio, fechaPrecio);
  out.capitalizacion = campo(num(price.marketCap), fechaPrecio);

  // Precio: ATH, distancia, peor caída, rango 52 semanas
  const precios = (hist && hist.precios) || [];
  const a = atl(precios, precio);
  const athYahoo = num(sd.allTimeHigh);
  const athVal = a.ath != null ? a.ath : athYahoo;
  out.ath = campo(athVal, a.athFecha || fechaPrecio);
  if (a.ath != null && athYahoo != null) out.ath.ath_yahoo = athYahoo;
  out.distancia_ath = campo(esNum(precio) && esNum(athVal) && athVal > 0 ? redond(precio / athVal - 1) : null, fechaPrecio);
  out.drawdown_maximo = campo(a.drawdownMax ? a.drawdownMax.valor : null, hoy);
  if (a.drawdownMax) { out.drawdown_maximo.pico = a.drawdownMax.pico; out.drawdown_maximo.valle = a.drawdownMax.valle; }
  const lo = num(sd.fiftyTwoWeekLow), hi = num(sd.fiftyTwoWeekHigh);
  out.rango_52s = campo({ min: lo, max: hi, posicion: esNum(precio) && esNum(lo) && esNum(hi) && hi > lo ? redond((precio - lo) / (hi - lo)) : null }, fechaPrecio);

  // Múltiplos de resultados. EPS ≤ 0 → P/E "n/s" (no significativo), nunca un número absurdo.
  const epsTtm = num(ks.trailingEps), epsFwd = num(ks.forwardEps);
  const peTtmY = num(sd.trailingPE) != null ? num(sd.trailingPE) : num(ks.trailingPE);
  const peFwdY = num(sd.forwardPE) != null ? num(sd.forwardPE) : num(ks.forwardPE);
  const pe = (valor, eps) => (esNum(eps) && eps <= 0 ? campo(null, hoy, 'n/s') : esNum(valor) && valor > 0 ? campo(redond(valor, 4), hoy) : campo(null, hoy, esNum(eps) ? undefined : 'sin dato'));
  out.pe_ttm = pe(peTtmY, epsTtm);
  out.eps_ttm_gaap = campo(epsTtm, hoy);
  out.earnings_yield = campo(esNum(epsTtm) && esNum(precio) && precio > 0 && epsTtm > 0 ? redond(epsTtm / precio) : null, hoy, esNum(epsTtm) && epsTtm <= 0 ? 'n/s' : undefined);
  out.ultimo_trimestre_yahoo = iso(ks.mostRecentQuarter);   // hasta qué trimestre llegan trailingEps / EBITDA / P/E de Yahoo (para detectar que la SEC trae uno más nuevo)

  // Estimaciones de consenso y CAGR de EPS a 2 años (último año fiscal informado → estimación del 2.º año siguiente)
  const trend = (R.earningsTrend && R.earningsTrend.trend) || [];
  const est = {};
  for (const [k, p] of [['trimestre_actual', '0q'], ['trimestre_proximo', '+1q'], ['anio_actual', '0y'], ['anio_proximo', '+1y']]) est[k] = estimacion(periodo(trend, p));
  out.estimaciones = campo(est, hoy);
  // P/E forward = precio / EPS estimado del año fiscal EN CURSO (el que Yahoo web muestra como Forward P/E). El forwardPE crudo de la API de Yahoo
  // salta al año siguiente apenas la empresa cierra su año fiscal (ej. cierre en septiembre: 24,7x en la API vs 29,0x en la web), por eso se guarda aparte.
  const epsAct = est.anio_actual && est.anio_actual.eps.promedio, epsSig = est.anio_proximo && est.anio_proximo.eps.promedio;
  // ADR cuyo EPS (y EBITDA) vienen en otra moneda que el precio (ej. ganancias en yuanes, precio en dólares): el cociente sería un número falso → no se calcula.
  const monedaDistinta = !!(price.currency && fd.financialCurrency && price.currency !== fd.financialCurrency);
  const motivoMoneda = 'no comparable: EPS en ' + fd.financialCurrency + ', precio en ' + price.currency;
  const peDe = e => (monedaDistinta ? campo(null, hoy, motivoMoneda) : esNum(e) && e > 0 && esNum(precio) ? campo(redond(precio / e, 4), hoy) : campo(null, hoy, esNum(e) ? 'n/s' : 'sin dato'));
  out.pe_forward = esNum(epsAct) ? peDe(epsAct) : pe(peFwdY, epsFwd);
  out.pe_forward.base = esNum(epsAct) ? 'EPS estimado del año fiscal en curso' : 'forwardPE de la API de Yahoo';
  out.pe_forward_siguiente = peDe(epsSig);
  out.pe_forward_yahoo_api = pe(peFwdY, epsFwd);
  // P/E forward NTM = precio / EPS estimado de los próximos 12 meses (el que usa la ficha, el gráfico y el PEG). Ver epsNtm().
  const ntm = epsNtm(est.anio_actual && est.anio_actual.fin, hoy, epsAct, epsSig);
  if (ntm) {
    out.pe_forward_ntm = peDe(ntm.eps);
    Object.assign(out.pe_forward_ntm, { eps_ntm: redond(ntm.eps, 4), peso_fy_actual: ntm.w, fin_fy_actual: ntm.fin_fy_actual, eps_fy_actual: ntm.eps_fy_actual, eps_fy_siguiente: ntm.eps_fy_siguiente, base: 'EPS estimado de los próximos 12 meses' + (ntm.cerrado ? ' (el año fiscal en curso ya cerró: EPS del año siguiente)' : ' (ponderado entre el año fiscal en curso y el siguiente)') });
  } else { out.pe_forward_ntm = campo(null, hoy, monedaDistinta ? motivoMoneda : 'sin dato'); out.pe_forward_ntm.base = 'EPS estimado de los próximos 12 meses'; }
  out.eps_forward_ntm = campo(ntm ? redond(ntm.eps, 4) : null, hoy, ntm ? undefined : 'sin dato');
  out.eps_forward = campo(esNum(epsAct) ? epsAct : epsFwd, hoy);
  out.eps_forward_siguiente = campo(esNum(epsSig) ? epsSig : null, hoy);
  const base = est.anio_actual && est.anio_actual.eps.hace_un_anio, fin2 = est.anio_proximo && est.anio_proximo.eps.promedio;
  let cagr = null, motivoCagr;
  if (esNum(base) && esNum(fin2)) {
    if (base > 0 && fin2 > 0) cagr = redond(Math.sqrt(fin2 / base) - 1);
    else motivoCagr = 'n/s';
  } else motivoCagr = 'sin dato';
  out.eps_cagr_2a = campo(cagr, hoy, motivoCagr);
  if (esNum(base) || esNum(fin2)) { out.eps_cagr_2a.eps_base = base == null ? null : base; out.eps_cagr_2a.eps_final = fin2 == null ? null : fin2; out.eps_cagr_2a.anio_base = 'último año fiscal informado'; out.eps_cagr_2a.anio_final = est.anio_proximo ? est.anio_proximo.fin : null; }

  // Alternativa con base consistente de consenso (año fiscal en curso → siguiente): útil cuando el último año informado trae partidas no recurrentes
  // (ej. beneficio fiscal que infla el EPS GAAP) y el CAGR a 2 años sale distorsionado.
  const b1 = est.anio_actual && est.anio_actual.eps.promedio;
  out.eps_crecimiento_1a_consenso = campo(esNum(b1) && esNum(fin2) && b1 > 0 && fin2 > 0 ? redond(fin2 / b1 - 1) : null, hoy, esNum(b1) && esNum(fin2) ? undefined : 'sin dato');
  if (esNum(b1) && esNum(fin2)) { out.eps_crecimiento_1a_consenso.eps_base = b1; out.eps_crecimiento_1a_consenso.eps_final = fin2; }

  // Sorpresa del último trimestre (Yahoo solo informa la de EPS; la de ingresos sale del comunicado)
  const hh = (R.earningsHistory && R.earningsHistory.history) || [];
  const ult = hh.filter(h => h && esNum(num(h.epsActual))).sort((x, y) => (iso(x.quarter) || '') < (iso(y.quarter) || '') ? -1 : 1).pop();
  out.sorpresa_ultimo_trimestre = campo(ult ? { trimestre: iso(ult.quarter), eps_real: num(ult.epsActual), eps_estimado: num(ult.epsEstimate), diferencia: num(ult.epsDifference), sorpresa_pct: num(ult.surprisePercent), ingresos: null } : null, ult ? iso(ult.quarter) : hoy, ult ? undefined : 'sin dato');

  // Revisiones de EPS (7/30/60/90 días)
  out.revisiones_eps = campo({ trimestre_actual: revision(periodo(trend, '0q')), anio_actual: revision(periodo(trend, '0y')), anio_proximo: revision(periodo(trend, '+1y')) }, hoy);

  // Precio objetivo y recomendaciones
  const tMean = num(fd.targetMeanPrice);
  out.precio_objetivo = campo(tMean == null && num(fd.targetHighPrice) == null ? null : { promedio: tMean, alto: num(fd.targetHighPrice), bajo: num(fd.targetLowPrice), mediana: num(fd.targetMedianPrice), analistas: num(fd.numberOfAnalystOpinions), potencial: esNum(tMean) && esNum(precio) && precio > 0 ? redond(tMean / precio - 1) : null }, hoy);
  const rt = ((R.recommendationTrend && R.recommendationTrend.trend) || []).find(t => t.period === '0m') || null;
  out.recomendaciones = campo(rt || num(fd.recommendationMean) != null ? {
    compra_fuerte: rt ? num(rt.strongBuy) : null, compra: rt ? num(rt.buy) : null, mantener: rt ? num(rt.hold) : null, venta: rt ? num(rt.sell) : null, venta_fuerte: rt ? num(rt.strongSell) : null,
    media: num(fd.recommendationMean), clave: fd.recommendationKey || null,
  } : null, hoy);

  // Insiders
  const tx = ((R.insiderTransactions && R.insiderTransactions.transactions) || []).filter(t => t && iso(t.startDate)).sort((x, y) => (iso(x.startDate) < iso(y.startDate) ? 1 : -1)).slice(0, 10)
    .map(t => ({ fecha: iso(t.startDate), nombre: t.filerName || null, cargo: t.filerRelation || null, acciones: num(t.shares), valor: num(t.value), texto: t.transactionText || null }));
  const ns = R.netSharePurchaseActivity || {};
  out.insiders = campo(tx.length || num(ns.netInfoShares) != null ? {
    transacciones_recientes: tx,
    periodo: ns.period || null, compras_n: num(ns.buyInfoCount), compras_acciones: num(ns.buyInfoShares), ventas_n: num(ns.sellInfoCount), ventas_acciones: num(ns.sellInfoShares),
    neto_acciones: num(ns.netInfoShares), neto_pct_de_acciones_insiders: num(ns.netPercentInsiderShares), tenencia_insiders_pct: num(ks.heldPercentInsiders),
  } : null, hoy);

  // Institucionales (foto actual; la serie se arma guardando cada corrida si se pide)
  const mh = R.majorHoldersBreakdown || {};
  const top = ((R.institutionOwnership && R.institutionOwnership.ownershipList) || []).slice(0, 10)
    .map(h => ({ nombre: h.organization || null, pct: num(h.pctHeld), acciones: num(h.position), valor: num(h.value), variacion_pct: num(h.pctChange), fecha_reporte: iso(h.reportDate) }));
  out.institucional = campo(num(mh.institutionsPercentHeld) != null || top.length ? {
    pct: num(mh.institutionsPercentHeld) != null ? num(mh.institutionsPercentHeld) : num(ks.heldPercentInstitutions), pct_float: num(mh.institutionsFloatPercentHeld), cantidad: num(mh.institutionsCount),
    neto_compra_pct: num(ns.netInstBuyingPercent), principales: top,
  } : null, top[0] && top[0].fecha_reporte ? top[0].fecha_reporte : hoy);

  // Short interest
  out.short_interest = campo(num(ks.shortPercentOfFloat) != null || num(ks.shortRatio) != null ? { pct_float: num(ks.shortPercentOfFloat), dias_para_cubrir: num(ks.shortRatio), acciones_short: num(ks.sharesShort), pct_acciones: num(ks.sharesPercentSharesOut) } : null, iso(ks.dateShortInterest) || hoy);

  // Próxima fecha de resultados
  const ce = (R.calendarEvents && R.calendarEvents.earnings) || {};
  const fechas = (ce.earningsDate || []).map(iso).filter(Boolean).sort();
  const prox = fechas.find(f => f >= hoy) || null;
  out.proximos_resultados = campo(prox ? { fecha: prox, estimada: ce.isEarningsDateEstimate === true } : null, hoy, prox ? undefined : 'sin fecha futura');

  // EV, EBITDA, FCF y derivados (no aplican a financieras)
  const deuda = num(fd.totalDebt), caja = num(fd.totalCash);
  out.ev = ev(campo(num(ks.enterpriseValue), hoy));
  out.ebitda = ev(campo(num(fd.ebitda), hoy));
  out.ev_ebitda = ev(monedaDistinta ? campo(null, hoy, motivoMoneda) : campo(num(ks.enterpriseToEbitda), hoy));
  out.ev_ventas = ev(monedaDistinta ? campo(null, hoy, motivoMoneda) : campo(num(ks.enterpriseToRevenue), hoy));
  // Sin fcf / p_fcf / fcf_yield: el freeCashflow de Yahoo es un FCF «levered» que no es flujo operativo − capex. La ficha usa solo el FCF de la
  // SEC (suma de 4 trimestres de flujo operativo − capex) o, si la SEC no lo trae, el de las series trimestrales de Yahoo, siempre rotulado.
  out.deuda_neta = ev(campo(esNum(deuda) && esNum(caja) ? deuda - caja : null, hoy));
  // Un banco no tiene margen bruto: Yahoo lo informa en 0 y eso no es un dato.
  const brutoY = num(fd.grossMargins), brutoNoAplica = financiera && (brutoY == null || brutoY === 0);
  out.margenes = campo({ bruto: brutoNoAplica ? null : brutoY, operativo: num(fd.operatingMargins), neto: num(fd.profitMargins), ebitda: num(fd.ebitdaMargins) }, hoy);
  if (brutoNoAplica) out.margenes.motivo_bruto = 'no aplica (banco)';
  out.roe = campo(num(fd.returnOnEquity), hoy);
  out.beta = campo(num(sd.beta) != null ? num(sd.beta) : num(ks.beta), hoy);
  return out;
}

// Mercado mínimo de un PAR (comparable): precio, P/E TTM, P/E forward NTM, EV/EBITDA y crecimiento esperado del EPS. Sin ficha ni historia.
function parsearPar(resumen, opts) {
  const m = parsearMercado(resumen, null, opts);
  return {
    nombre: m.nombre, moneda: m.moneda, moneda_financiera: m.moneda_financiera, precio: m.precio, pe_ttm: m.pe_ttm, pe_forward_ntm: m.pe_forward_ntm, ev_ebitda: m.ev_ebitda,
    crecimiento_eps_2a: m.eps_cagr_2a, crecimiento_eps_1a: m.eps_crecimiento_1a_consenso,
  };
}

// ── Cliente ──
// yf = instancia de yahoo-finance2 (inyectable). Un ticker a la vez; cada pedido se reintenta con espera creciente.
const dormir = ms => new Promise(r => setTimeout(r, ms));
async function conReintentos(fn, { intentos = 4, esperaMs = 2500, log = () => {} } = {}) {
  let ultimo = null;
  for (let i = 0; i < intentos; i++) {
    try { return await fn(); } catch (e) {
      ultimo = e;
      log(`  reintento ${i + 1}/${intentos}: ${(e && e.message || e).toString().slice(0, 120)}`);
      if (i < intentos - 1) await dormir(esperaMs * (i + 1));
    }
  }
  throw ultimo;
}

function crearClienteYahoo(yf, opts = {}) {
  const o = { intentos: 4, esperaMs: 2500, log: () => {}, ...opts };
  return {
    resumen: t => conReintentos(() => yf.quoteSummary(t, { modules: MODULOS }, { validateResult: false }), o),
    // Precios diarios desde siempre (ajustados por splits, no por dividendos) + splits.
    async precios(t) {
      const c = await conReintentos(() => yf.chart(t, { period1: '1970-01-01', interval: '1d', events: 'div|split' }, { validateResult: false }), o);
      const precios = (c.quotes || []).filter(q => q && esNum(q.close)).map(q => ({ fecha: iso(q.date), high: esNum(q.high) ? q.high : q.close, close: q.close })).filter(q => q.fecha);
      const splits = ((c.events && c.events.splits) || []).map(s => ({ fecha: iso(s.date), factor: s.numerator / s.denominator })).filter(s => s.fecha && esNum(s.factor) && s.factor > 0);
      return { precios, splits };
    },
    trimestralesYahoo: t => conReintentos(() => yf.fundamentalsTimeSeries(t, { period1: '2010-01-01', type: 'quarterly', module: 'all' }, { validateResult: false }), o),
  };
}

module.exports = { MODULOS, parsearMercado, parsearPar, epsNtm, crearClienteYahoo, conReintentos, campo, atl, iso, num, esNum, redond, dormir };
