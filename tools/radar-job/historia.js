'use strict';
// ════════════════════════════════════════════════════════════════════════
// RADAR v2 — historia trimestral por empresa (cálculo PURO, sin red ni disco).
//   SEC companyfacts  → serie trimestral (ingresos, EBIT, ut. neta, EPS básico y diluido, flujo operativo, capex, FCF, SBC, D&A,
//                       deuda, caja, acciones, dividendos, recompras). Reusa ../../radar-calc.js (leer / trimestresDe / anualesDe).
//   Yahoo (fundamentalsTimeSeries) → rellena los trimestres que la SEC no trae (emisores extranjeros que presentan 20-F/6-K: solo anual).
//   Precios diarios de Yahoo → precio de cierre del trimestre, P/E TTM por trimestre y medias a 5/10/15 años.
//
// Reglas:
//  - Monto = moneda de reporte, sin escalar. capex, dividendos y recompras se guardan POSITIVOS (pagos).
//  - EPS TTM = suma de los 4 EPS diluidos trimestrales consecutivos (Q4 = año − 9 meses, aproximación estándar).
//  - P/E TTM = precio de cierre del trimestre / EPS TTM. EPS ≤ 0 o P/E > PE_MAX → null con motivo 'n/s'.
//  - Insumos de ROIC / rotación de activos / cobertura de intereses / ciclo de caja por trimestre (balance, intereses, impuestos): SEC y, donde falta, Yahoo.
//  - Splits: el EPS/acciones de la SEC se llevan a la base actual con los splits de Yahoo posteriores a la fecha de presentación.
//  - Media de P/E a N años: promedio de los P/E trimestrales significativos de los últimos N años; si no hay tantos años de datos
//    (o la empresa cotiza hace menos) se promedia desde el primero que hay y se marca completo:false + desde.
// ════════════════════════════════════════════════════════════════════════
const Calc = require('../../radar-calc.js');

const PE_MAX = 500;            // P/E mayor a esto = EPS casi cero → no significativo
const DESDE_MIN = '2010-01-01';
const esNum = v => typeof v === 'number' && isFinite(v);
const redond = (v, d = 4) => (esNum(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

const T = (tax, lista) => lista.map(n => [tax, n]);
const EXTRA = {
  epsBasico: { u: 'USD/shares', f: [].concat(T('us-gaap', ['EarningsPerShareBasic', 'EarningsPerShareBasicAndDiluted']), T('ifrs-full', ['BasicEarningsLossPerShare', 'BasicAndDilutedEarningsLossPerShare'])) },
  sbc: { u: 'USD', f: [].concat(T('us-gaap', ['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense']), T('ifrs-full', ['AdjustmentsForSharebasedPayments'])) },
  dividendos: { u: 'USD', f: [].concat(T('us-gaap', ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock']), T('ifrs-full', ['DividendsPaidClassifiedAsFinancingActivities'])) },
  recompras: { u: 'USD', f: [].concat(T('us-gaap', ['PaymentsForRepurchaseOfCommonStock']), T('ifrs-full', ['PaymentsToAcquireOrRedeemEntitysShares'])) },
  accionesCirc: { u: 'shares', f: T('us-gaap', ['CommonStockSharesOutstanding']) },
  // Para ROIC, rotación de activos, cobertura de intereses y ciclo de conversión de caja (la ficha los calcula con estos insumos).
  intereses: { u: 'USD', f: [].concat(T('us-gaap', ['InterestExpense', 'InterestExpenseDebt', 'InterestExpenseNonoperating']), T('ifrs-full', ['InterestExpense'])) },
  cxc: { u: 'USD', f: T('us-gaap', ['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent', 'AccountsAndOtherReceivablesNetCurrent']) },
  cxp: { u: 'USD', f: T('us-gaap', ['AccountsPayableCurrent', 'AccountsPayableTradeCurrent', 'AccountsPayableAndAccruedLiabilitiesCurrent']) },
  inventario: { u: 'USD', f: T('us-gaap', ['InventoryNet']) },
};
const fuenteDe = k => Calc.FUENTES[k] || EXTRA[k];
const leer = (facts, k) => Calc.leer(facts, fuenteDe(k).f, fuenteDe(k).u);
const dias = Calc.dias;
const sumarAnios = (f, n) => { const d = new Date(Date.parse(f + 'T00:00:00Z')); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10); };

// Factor con el que hay que multiplicar (EPS: dividir) un dato presentado en `filed` para llevarlo a la base de acciones actual.
function factorSplits(splits, filed) {
  let f = 1;
  for (const s of splits || []) if (filed && s.fecha > filed) f *= s.factor;
  return f;
}
const ajustarEps = (entradas, splits) => entradas.map(e => ({ ...e, val: e.val / factorSplits(splits, e.filed) }));
const ajustarAcc = (entradas, splits) => entradas.map(e => ({ ...e, val: e.val * factorSplits(splits, e.filed) }));

// Mapa fin → valor, con búsqueda por cercanía (los cierres de distintos conceptos pueden diferir unos días).
function mapaPorFin(qs) { return new Map(qs.map(q => [q.end, q.val])); }
function buscar(mapa, fin, tol) {
  if (mapa.has(fin)) return mapa.get(fin);
  let mejor = null, md = Infinity;
  for (const [k, v] of mapa) { const d = Math.abs(dias(fin, k)); if (d <= tol && d < md) { mejor = v; md = d; } }
  return mejor;
}

// Acciones promedio ponderadas: no se acumulan; Q4 = 4 × anual − (Q1+Q2+Q3).
function accionesTrimestrales(entradas, finesRef) {
  const q3m = new Map(entradas.filter(e => e.start && dias(e.start, e.end) >= 80 && dias(e.start, e.end) <= 100).map(e => [e.end, e.val]));
  const anuales = [...Calc.anualesDe(entradas).values()];
  const out = new Map(q3m);
  for (const fin of finesRef) {
    if (buscar(q3m, fin, 6) != null) continue;
    const a = anuales.find(x => Math.abs(dias(fin, x.end)) <= 6);
    if (!a) continue;
    const previos = [...q3m.entries()].filter(([e]) => e > a.start && dias(e, a.end) > 20);
    if (previos.length === 3) out.set(fin, 4 * a.val - previos.reduce((s, [, v]) => s + v, 0));
  }
  return out;
}

function instantes(entradas) { const m = new Map(); for (const e of entradas) if (!e.start) m.set(e.end, e.val); return m; }

// Suma de partes que existan (null si no hay ninguna).
const sumaNn = arr => { const v = arr.filter(esNum); return v.length ? v.reduce((a, b) => a + b, 0) : null; };

function serieSec(cf, splits) {
  const facts = (cf && cf.facts) || {};
  const L = k => leer(facts, k);
  const ingresosE = L('ingresos');
  const qIng = Calc.trimestresDe(ingresosE).filter(q => q.end >= DESDE_MIN);
  if (qIng.length < 4) return [];
  const flujo = k => mapaPorFin(Calc.trimestresDe(L(k)));
  const eps = mapaPorFin(Calc.trimestresDe(ajustarEps(L('eps'), splits)));
  const epsB = mapaPorFin(Calc.trimestresDe(ajustarEps(L('epsBasico'), splits)));
  const F = {};
  for (const k of ['ebit', 'neto', 'cfo', 'capex', 'da', 'sbc', 'dividendos', 'recompras', 'costo', 'impuesto', 'aai', 'intereses']) F[k] = flujo(k);
  const fines = qIng.map(q => q.end);
  const acc = accionesTrimestrales(ajustarAcc(L('acciones'), splits), fines);
  const I = {}; for (const k of ['efectivo', 'invCP', 'deudaLP', 'deudaTotalUs', 'deudaTotalIfrs', 'deudaCP', 'deudaCPparte', 'prestCP', 'papel', 'accionesCirc', 'activos', 'patrimonio', 'cxc', 'cxp', 'inventario']) I[k] = instantes(L(k));
  const ing = mapaPorFin(qIng);

  const inst = (k, f) => buscar(I[k], f, 5);
  const deudaEn = f => {
    const corto = () => { const dc = inst('deudaCP', f); return dc != null ? dc : sumaNn([inst('deudaCPparte', f), inst('prestCP', f), inst('papel', f)]); };
    const lp = inst('deudaLP', f);
    if (lp != null) return lp + (corto() || 0);
    const totUs = inst('deudaTotalUs', f);
    if (totUs != null) return totUs + (sumaNn([inst('prestCP', f), inst('papel', f)]) || 0);
    const totIf = inst('deudaTotalIfrs', f);
    return totIf != null ? totIf : corto();
  };
  const cajaEn = f => { const ef = inst('efectivo', f); return ef == null ? null : ef + (inst('invCP', f) || 0); };

  return qIng.map(q => {
    const f = q.end;
    const cfo = buscar(F.cfo, f, 6), capex = buscar(F.capex, f, 6);
    const accAcc = buscar(acc, f, 6);
    return {
      fin: f, fuente: 'sec', presentado: q.filed || null,
      ingresos: q.val, utilidad_operativa: buscar(F.ebit, f, 6), utilidad_neta: buscar(F.neto, f, 6),
      eps_basico: redond(buscar(epsB, f, 6)), eps_diluido: redond(buscar(eps, f, 6)),
      cfo, capex: capex == null ? null : Math.abs(capex), fcf: cfo != null && capex != null ? cfo - Math.abs(capex) : null,
      sbc: buscar(F.sbc, f, 6), da: buscar(F.da, f, 6),
      deuda: deudaEn(f), caja: cajaEn(f), acciones_diluidas: accAcc == null ? null : Math.round(accAcc), acciones_circulacion: inst('accionesCirc', f),
      dividendos: (v => (v == null ? null : Math.abs(v)))(buscar(F.dividendos, f, 6)), recompras: (v => (v == null ? null : Math.abs(v)))(buscar(F.recompras, f, 6)),
      costo_ventas: buscar(F.costo, f, 6), impuestos: buscar(F.impuesto, f, 6), utilidad_antes_impuestos: buscar(F.aai, f, 6), intereses: (v => (v == null ? null : Math.abs(v)))(buscar(F.intereses, f, 6)),
      activos_totales: inst('activos', f), patrimonio: inst('patrimonio', f), capital_invertido: null, cxc: inst('cxc', f), cxp: inst('cxp', f), inventario: inst('inventario', f),
      derivado_q4: !!q.derivado,
    };
  });
}

// Filas de fundamentalsTimeSeries (type quarterly, module all) → mismos trimestres.
function serieYahoo(filas) {
  const pick = (r, ...ks) => { for (const k of ks) if (esNum(r[k])) return r[k]; return null; };
  const abs = v => (v == null ? null : Math.abs(v));
  const out = [];
  for (const r of filas || []) {
    if (!r || (r.periodType && r.periodType !== '3M')) continue;
    const fin = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : typeof r.date === 'string' ? r.date.slice(0, 10) : null;
    if (!fin) continue;
    const cfo = pick(r, 'operatingCashFlow', 'cashFlowFromContinuingOperatingActivities'), capex = abs(pick(r, 'capitalExpenditure'));
    const fcfY = pick(r, 'freeCashFlow');
    out.push({
      fin, fuente: 'yahoo', presentado: null,
      ingresos: pick(r, 'totalRevenue', 'operatingRevenue'), utilidad_operativa: pick(r, 'operatingIncome'),
      utilidad_neta: pick(r, 'netIncomeCommonStockholders', 'netIncome'),
      eps_basico: pick(r, 'basicEPS'), eps_diluido: pick(r, 'dilutedEPS'),
      cfo, capex, fcf: cfo != null && capex != null ? cfo - capex : fcfY,
      sbc: pick(r, 'stockBasedCompensation'), da: pick(r, 'depreciationAndAmortization', 'reconciledDepreciation'),
      deuda: pick(r, 'totalDebt'), caja: pick(r, 'cashCashEquivalentsAndShortTermInvestments', 'cashAndCashEquivalents'),
      acciones_diluidas: pick(r, 'dilutedAverageShares'), acciones_circulacion: pick(r, 'ordinarySharesNumber', 'shareIssued'),
      dividendos: abs(pick(r, 'cashDividendsPaid', 'commonStockDividendPaid')), recompras: abs(pick(r, 'repurchaseOfCapitalStock', 'commonStockPayments')),
      costo_ventas: pick(r, 'costOfRevenue', 'reconciledCostOfRevenue'), impuestos: pick(r, 'taxProvision'), utilidad_antes_impuestos: pick(r, 'pretaxIncome'), intereses: abs(pick(r, 'interestExpense', 'interestExpenseNonOperating')),
      activos_totales: pick(r, 'totalAssets'), patrimonio: pick(r, 'stockholdersEquity', 'commonStockEquity'), capital_invertido: pick(r, 'investedCapital'),
      cxc: pick(r, 'accountsReceivable'), cxp: pick(r, 'accountsPayable'), inventario: pick(r, 'inventory'),
      derivado_q4: false,
    });
  }
  return out;
}

// SEC manda; Yahoo agrega solo los trimestres que la SEC no tiene (a ±10 días).
function unirSeries(sec, yahoo) {
  const out = sec.slice();
  for (const y of yahoo) if (!sec.some(s => Math.abs(dias(s.fin, y.fin)) <= 10)) out.push(y);
  return out.sort((a, b) => (a.fin < b.fin ? -1 : a.fin > b.fin ? 1 : 0));
}

// Yahoo completa lo que la SEC no trae para un trimestre que la SEC sí tiene (misma fecha ±10 días) y se anota cuáles campos vinieron de Yahoo:
//  - EPS y acciones: algunos emisores (ej. con acciones de varias clases) tienen el EPS en XBRL con dimensión y companyfacts no lo trae.
//  - Insumos de ROIC / rotación / cobertura / ciclo de caja (activos, patrimonio, capital invertido, intereses, impuestos, utilidad antes de impuestos, cobrar, pagar, inventario, costo de ventas).
//  - Trimestres Q4 DERIVADOS (año − 9 meses): si Yahoo tiene el dilutedEPS/basicEPS reportado de ese trimestre se usa ese (el derivado se guarda en eps_diluido_derivado_sec).
const CAMPOS_EPS = ['eps_basico', 'eps_diluido', 'acciones_diluidas'];
const CAMPOS_INSUMOS = ['activos_totales', 'patrimonio', 'capital_invertido', 'intereses', 'impuestos', 'utilidad_antes_impuestos', 'cxc', 'cxp', 'inventario', 'costo_ventas'];
function completarDeYahoo(sec, yahoo, splits) {
  for (const q of sec) {
    const y = yahoo.find(x => Math.abs(dias(q.fin, x.fin)) <= 10);
    if (!y) continue;
    const llenos = CAMPOS_EPS.concat(CAMPOS_INSUMOS).filter(k => q[k] == null && esNum(y[k]));
    for (const k of llenos) q[k] = y[k];
    if (q.derivado_q4) {
      const f = factorSplits(splits, y.fin);   // el EPS que informa Yahoo no se reexpresa por splits posteriores
      for (const k of ['eps_diluido', 'eps_basico']) {
        if (!esNum(y[k])) continue;
        const v = redond(y[k] / f);
        if (esNum(q[k]) && Math.abs(q[k] - v) < 0.005) continue;
        if (k === 'eps_diluido' && esNum(q[k])) q.eps_diluido_derivado_sec = q[k];
        q[k] = v; if (!llenos.includes(k)) llenos.push(k);
      }
    }
    if (llenos.length) q.campos_yahoo = llenos;
  }
  return sec;
}
// ¿Faltan EPS en los últimos 4 trimestres de la SEC? (entonces conviene pedir la serie de Yahoo)
const faltaEps = sec => sec.length > 0 && sec.slice(-4).some(q => !esNum(q.eps_diluido));

function precioEn(precios, fin) {
  // último cierre ≤ fin (búsqueda binaria; `precios` ordenado por fecha). Si el dato más cercano está a más de 10 días, null.
  let lo = 0, hi = precios.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (precios[m].fecha <= fin) { r = m; lo = m + 1; } else hi = m - 1; }
  if (r < 0 || dias(precios[r].fecha, fin) > 10) return null;
  return precios[r].close;
}

// Agrega precio de cierre, EPS TTM y P/E TTM a cada trimestre (muta y devuelve la lista).
function agregarValuacion(qs, precios) {
  qs.forEach((q, i) => {
    const p = precioEn(precios || [], q.fin);
    q.precio_cierre = redond(p, 4);
    let ttm = null;
    if (i >= 3) {
      const v = qs.slice(i - 3, i + 1);
      const seguidos = v.every((x, j) => j === 0 || (dias(v[j - 1].fin, x.fin) >= 75 && dias(v[j - 1].fin, x.fin) <= 110));
      if (seguidos && v.every(x => esNum(x.eps_diluido))) ttm = v.reduce((s, x) => s + x.eps_diluido, 0);
    }
    q.eps_ttm = redond(ttm);
    q.pe_ttm = null;
    delete q.pe_motivo;
    if (!esNum(p)) q.pe_motivo = 'sin precio';
    else if (ttm == null) q.pe_motivo = 'sin EPS TTM';
    else if (ttm <= 0 || p / ttm > PE_MAX) q.pe_motivo = 'n/s';
    else q.pe_ttm = redond(p / ttm, 2);
  });
  return qs;
}

// Medias de P/E TTM a 5/10/15 años contados hacia atrás desde el último trimestre.
function mediasPE(qs, { cotizaDesde } = {}) {
  const out = {};
  const conPrecio = qs.filter(q => esNum(q.precio_cierre));
  if (!conPrecio.length) return out;
  const ultimo = qs[qs.length - 1].fin;
  const primeroDato = conPrecio[0].fin;
  for (const n of [5, 10, 15]) {
    const corte = sumarAnios(ultimo, -n);
    const ventana = qs.filter(q => q.fin > corte);
    const validos = ventana.filter(q => esNum(q.pe_ttm));
    const noSig = ventana.filter(q => q.pe_motivo === 'n/s').length;
    const completo = primeroDato <= corte || dias(corte, primeroDato) <= 100;
    const o = { valor: validos.length >= 4 ? redond(validos.reduce((s, q) => s + q.pe_ttm, 0) / validos.length, 2) : null, desde: validos.length ? validos[0].fin : null, hasta: validos.length ? validos[validos.length - 1].fin : null, trimestres: validos.length, trimestres_n_s: noSig, completo };
    if (!completo) o.nota = cotizaDesde && cotizaDesde > corte ? `desde la salida a bolsa (${cotizaDesde})` : `datos desde ${primeroDato}`;
    out[n + 'y'] = o;
  }
  return out;
}

// Orquesta: cf = companyfacts (o null), yahooFilas = fundamentalsTimeSeries (o []), hist = { precios, splits }.
function construirHistoria({ ticker, cf, yahooFilas, hist, cotizaDesde, hoy }) {
  const splits = (hist && hist.splits) || [];
  const sec = cf ? serieSec(cf, splits) : [];
  const yah = serieYahoo(yahooFilas);
  if (yah.length) completarDeYahoo(sec, yah, splits);
  const usarYahoo = sec.length < 12;                // la SEC alcanza (≥12 trimestres) → Yahoo no se mezcla
  const qs = agregarValuacion(usarYahoo ? unirSeries(sec, yah) : sec, hist && hist.precios);
  const h = {
    v: 1, ticker, generado: hoy, cotiza_desde: cotizaDesde || null,
    fuente_trimestres: (nY => (nY && nY < qs.length ? 'sec+yahoo' : nY ? 'yahoo' : qs.length ? 'sec' : null))(qs.filter(q => q.fuente === 'yahoo').length),
    trimestres: qs,
    medias_pe_ttm: mediasPE(qs, { cotizaDesde }),
    splits_aplicados: splits.filter(s => s.fecha >= DESDE_MIN),
    notas: [],
  };
  if (cf && usarYahoo && sec.length < 4) {
    // Emisor sin trimestres en la SEC (20-F): se agrega la serie anual para dar contexto de largo plazo.
    try {
      const f = Calc.construirFicha(cf);
      if (!f.sinDatos && f.anual) {
        h.anual_sec = f.anual;
        h.pe_anual = f.anual.fin.map((fin, i) => {
          const p = precioEn((hist && hist.precios) || [], fin), e = f.anual.eps[i];
          const r = { fin, precio_cierre: redond(p, 4), eps: esNum(e) ? e : null, pe: null };
          if (!esNum(p)) r.motivo = 'sin precio'; else if (!esNum(e)) r.motivo = 'sin EPS'; else if (e <= 0 || p / e > PE_MAX) r.motivo = 'n/s'; else r.pe = redond(p / e, 2);
          return r;
        });
      }
    } catch (_) { /* sin anual */ }
    h.notas.push('La SEC trae solo años (20-F/IFRS); los trimestres vienen de Yahoo y cubren pocos períodos. Completar con los comunicados.');
  }
  if (qs.length < 12) h.notas.push(`Menos de 12 trimestres disponibles (${qs.length}).`);
  return h;
}

module.exports = { faltaEps, completarDeYahoo, construirHistoria, serieSec, serieYahoo, unirSeries, agregarValuacion, mediasPE, precioEn, factorSplits, accionesTrimestrales, PE_MAX, EXTRA };
