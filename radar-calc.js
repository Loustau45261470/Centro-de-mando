'use strict';
// ════════════════════════════════════════════════════════════════════════
// RADAR DE EMPRESAS — lectura de la SEC (cálculo PURO, sin DOM, sin red, sin `S`).
// Lo usa SOLO el job de datos (tools/radar-job/historia.js y radar-datos.js, en GitHub Actions del repo privado, que lleva una copia) y
// sus tests. La ficha del navegador ya no lo carga: lee los JSON listos (radar-vista.js).
// construirFicha(companyfacts) convierte el JSON "companyfacts" de la SEC (varios MB) en una ficha compacta con las líneas CRUDAS
// (ingresos, EBIT, FCF, deuda, acciones…) por año fiscal y TTM. No calcula ratios.
//
// ── Mapeo de conceptos de la SEC (cada "fuente" = [taxonomía, concepto]) ──
// Para cada línea se prueban las fuentes EN ORDEN y la elección es POR PERÍODO (no por empresa): si una empresa cambió de etiqueta
// en 2018 (SalesRevenueNet → RevenueFromContractWithCustomer…), cada año usa la primera que tenga. Valores restatados: gana la
// presentación más reciente (campo `filed`) del mismo período. Solo se leen cifras en USD ('USD', 'USD/shares', 'shares'):
// si una empresa reporta en otra moneda, esa línea queda null (nunca se convierte ni se inventa).
//   ingresos      us-gaap Revenues · RevenueFromContractWithCustomerExcludingAssessedTax · …IncludingAssessedTax · SalesRevenueNet ·
//                 SalesRevenueGoodsNet · SalesRevenueServicesNet | ifrs-full Revenue · RevenueFromContractsWithCustomers
//   ut. bruta     GrossProfit (us-gaap / ifrs-full); si no está: ingresos − (CostOfRevenue · CostOfGoodsAndServicesSold · CostOfGoodsSold · ifrs CostOfSales)
//   EBIT          us-gaap OperatingIncomeLoss | ifrs-full ProfitLossFromOperatingActivities
//   ut. neta      us-gaap NetIncomeLoss · NetIncomeLossAvailableToCommonStockholdersBasic · ProfitLoss | ifrs-full ProfitLossAttributableToOwnersOfParent · ProfitLoss
//   EPS diluido   us-gaap EarningsPerShareDiluted · EarningsPerShareBasicAndDiluted | ifrs-full DilutedEarningsLossPerShare · BasicAndDilutedEarningsLossPerShare
//   acciones dil. us-gaap WeightedAverageNumberOfDilutedSharesOutstanding · …SharesOutstandingBasicAndDiluted · …Basic | ifrs-full AdjustedWeightedAverageShares · WeightedAverageShares
//   flujo operat. us-gaap NetCashProvidedByUsedInOperatingActivities · …ContinuingOperations | ifrs-full CashFlowsFromUsedInOperatingActivities
//   capex         us-gaap PaymentsToAcquirePropertyPlantAndEquipment · PaymentsToAcquireProductiveAssets · PaymentsForCapitalImprovements |
//                 ifrs-full PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities · PaymentsToAcquirePropertyPlantAndEquipment
//   D&A           us-gaap DepreciationDepletionAndAmortization · DepreciationAndAmortization · DepreciationAmortizationAndAccretionNet |
//                 ifrs-full AdjustmentsForDepreciationAndAmortisationExpense · DepreciationAndAmortisationExpense · DepreciationExpense
//   caja          efectivo (us-gaap CashAndCashEquivalentsAtCarryingValue · CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents ·
//                 Cash | ifrs-full CashAndCashEquivalents) + inversiones corrientes si las informa (us-gaap MarketableSecuritiesCurrent ·
//                 ShortTermInvestments · AvailableForSaleSecuritiesDebtSecuritiesCurrent)
//   deuda total   us-gaap: LongTermDebtNoncurrent (o …AndCapitalLeaseObligations) + parte corriente (DebtCurrent; si no, LongTermDebtCurrent +
//                 ShortTermBorrowings + CommercialPaper). Si no hay la parte no corriente: LongTermDebt (incluye vencimientos corrientes) +
//                 ShortTermBorrowings + CommercialPaper. ifrs-full: Borrowings (respaldo ShorttermBorrowings). NO incluye arrendamientos.
//                 Sin ninguna de esas etiquetas → null (no se asume 0).
//   activos       us-gaap Assets | ifrs-full Assets   (solo para ROA)
//   patrimonio    us-gaap StockholdersEquity · StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest |
//                 ifrs-full EquityAttributableToOwnersOfParent · Equity
//   impuesto / ut. antes de impuestos (para la tasa efectiva)
//                 us-gaap IncomeTaxExpenseBenefit | ifrs-full IncomeTaxExpenseContinuingOperations
//                 us-gaap IncomeLossFromContinuingOperationsBeforeIncomeTaxes… (2 variantes) | ifrs-full ProfitLossBeforeTax
//
// ── Períodos ──
// Año fiscal = dato de ~1 año (350–380 días). Trimestre suelto = ~3 meses (80–100 días). Los reportes de flujo de caja (y a veces
// otros) vienen ACUMULADOS en el año (3, 6, 9 meses): el trimestre sale por resta. El Q4 casi nunca viene suelto en la SEC: Q4 = año − 9M.
// TTM = suma de los últimos 4 trimestres sueltos consecutivos; si no hay 4 (empresa que solo presenta anual, como las 20-F) o el año
// fiscal es más nuevo que el último trimestre, TTM = último año fiscal (ttm.fuente = 'anual'). Nunca se interpola.
//
// ── Fórmulas ──
//   FCF = flujo operativo − |capex|  (null si falta alguno; no se asume capex 0)       EBITDA = EBIT + D&A (D&A del estado de flujos)
//   Splits: si las acciones diluidas saltan x1,5 (o caen a 2/3) entre dos años seguidos, EPS y acciones de ese año y los anteriores quedan null (ver cortarPorSplit).
// ════════════════════════════════════════════════════════════════════════
(function (root) {
  const MS_DIA = 86400000;
  const esNum = v => typeof v === 'number' && isFinite(v);
  const dias = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / MS_DIA);
  const sumarDias = (f, n) => new Date(Date.parse(f + 'T00:00:00Z') + n * MS_DIA).toISOString().slice(0, 10);
  const porFinAsc = (a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0);
  const sumaNoNulos = arr => { const v = arr.filter(esNum); return v.length ? v.reduce((a, b) => a + b, 0) : null; };

  const USD = 'USD', POR_ACCION = 'USD/shares', ACC = 'shares';
  const T = (tax, lista) => lista.map(n => [tax, n]);
  const FUENTES = {
    ingresos: { u: USD, f: [].concat(T('us-gaap', ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'SalesRevenueServicesNet']), T('ifrs-full', ['Revenue', 'RevenueFromContractsWithCustomers'])) },
    costo: { u: USD, f: [].concat(T('us-gaap', ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold']), T('ifrs-full', ['CostOfSales'])) },
    bruta: { u: USD, f: [['us-gaap', 'GrossProfit'], ['ifrs-full', 'GrossProfit']] },
    ebit: { u: USD, f: [['us-gaap', 'OperatingIncomeLoss'], ['ifrs-full', 'ProfitLossFromOperatingActivities']] },
    neto: { u: USD, f: [].concat(T('us-gaap', ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss']), T('ifrs-full', ['ProfitLossAttributableToOwnersOfParent', 'ProfitLoss'])) },
    eps: { u: POR_ACCION, f: [].concat(T('us-gaap', ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted']), T('ifrs-full', ['DilutedEarningsLossPerShare', 'BasicAndDilutedEarningsLossPerShare'])) },
    acciones: { u: ACC, f: [].concat(T('us-gaap', ['WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfSharesOutstandingBasicAndDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic']), T('ifrs-full', ['AdjustedWeightedAverageShares', 'WeightedAverageShares'])) },
    cfo: { u: USD, f: [].concat(T('us-gaap', ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']), T('ifrs-full', ['CashFlowsFromUsedInOperatingActivities'])) },
    capex: { u: USD, f: [].concat(T('us-gaap', ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PaymentsForCapitalImprovements']), T('ifrs-full', ['PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities', 'PaymentsToAcquirePropertyPlantAndEquipment'])) },
    da: { u: USD, f: [].concat(T('us-gaap', ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet']), T('ifrs-full', ['AdjustmentsForDepreciationAndAmortisationExpense', 'DepreciationAndAmortisationExpense', 'DepreciationExpense'])) },
    impuesto: { u: USD, f: [['us-gaap', 'IncomeTaxExpenseBenefit'], ['ifrs-full', 'IncomeTaxExpenseContinuingOperations']] },
    aai: { u: USD, f: [['us-gaap', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest'], ['us-gaap', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'], ['ifrs-full', 'ProfitLossBeforeTax']] },
    // balance (datos "instante")
    efectivo: { u: USD, f: [].concat(T('us-gaap', ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash']), T('ifrs-full', ['CashAndCashEquivalents'])) },
    invCP: { u: USD, f: T('us-gaap', ['MarketableSecuritiesCurrent', 'ShortTermInvestments', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent']) },
    activos: { u: USD, f: [['us-gaap', 'Assets'], ['ifrs-full', 'Assets']] },
    patrimonio: { u: USD, f: [].concat(T('us-gaap', ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']), T('ifrs-full', ['EquityAttributableToOwnersOfParent', 'Equity'])) },
    deudaLP: { u: USD, f: T('us-gaap', ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations']) },
    deudaTotalUs: { u: USD, f: T('us-gaap', ['LongTermDebt']) },
    deudaTotalIfrs: { u: USD, f: T('ifrs-full', ['Borrowings', 'ShorttermBorrowings']) },
    deudaCP: { u: USD, f: T('us-gaap', ['DebtCurrent']) },
    deudaCPparte: { u: USD, f: T('us-gaap', ['LongTermDebtCurrent']) },
    prestCP: { u: USD, f: T('us-gaap', ['ShortTermBorrowings']) },
    papel: { u: USD, f: T('us-gaap', ['CommercialPaper']) },
  };

  // ── Lectura de un concepto: entradas { start, end, val, filed }, una por período (start|end) ──
  function leer(facts, fuentes, unidad) {
    const out = new Map();
    for (const par of fuentes) {
      const c = facts && facts[par[0]] && facts[par[0]][par[1]];
      const arr = c && c.units && c.units[unidad];
      if (!Array.isArray(arr)) continue;
      const mejor = new Map();
      for (const e of arr) {
        if (!e || !esNum(e.val) || typeof e.end !== 'string') continue;
        const k = (e.start || '') + '|' + e.end;
        const p = mejor.get(k);
        if (!p || String(e.filed || '') >= String(p.filed || '')) mejor.set(k, e);
      }
      for (const [k, e] of mejor) if (!out.has(k)) out.set(k, { start: e.start || null, end: e.end, val: e.val, filed: e.filed || null });
    }
    return [...out.values()];
  }

  const durOk = (e, min, max) => { if (!e.start) return false; const d = dias(e.start, e.end); return d >= min && d <= max; };
  const esAnual = e => durOk(e, 350, 380);
  const esTrimestre = e => durOk(e, 80, 100);

  function anualesDe(entradas) {
    const m = new Map();
    for (const e of entradas) {
      if (!esAnual(e)) continue;
      const p = m.get(e.end);
      if (!p || String(e.filed || '') >= String(p.filed || '')) m.set(e.end, e);
    }
    return m;
  }

  // a − b período por período (ej. ut. bruta = ingresos − costo). Solo donde están ambos.
  function restar(a, b) {
    const mb = new Map(b.map(e => [(e.start || '') + '|' + e.end, e]));
    const out = [];
    for (const e of a) { const o = mb.get((e.start || '') + '|' + e.end); if (o) out.push({ start: e.start, end: e.end, val: e.val - o.val, filed: e.filed }); }
    return out;
  }
  const unir = (primero, segundo) => {
    const claves = new Set(primero.map(e => (e.start || '') + '|' + e.end));
    return primero.concat(segundo.filter(e => !claves.has((e.start || '') + '|' + e.end)));
  };

  // Trimestres sueltos ({end, val, filed, derivado}) a partir de datos de 3 meses y/o acumulados (3/6/9 meses y año).
  function trimestresDe(entradas) {
    const flu = entradas.filter(e => e.start);
    const out = [];
    const agregar = q => { if (!out.some(r => Math.abs(dias(r.end, q.end)) <= 10)) out.push(q); };
    const q3m = flu.filter(esTrimestre);
    q3m.forEach(e => agregar({ end: e.end, val: e.val, filed: e.filed, derivado: false }));

    const anuales = [...anualesDe(entradas).values()].sort(porFinAsc);
    const marcos = anuales.map(a => ({ S: a.start, E: a.end, anual: a }));
    if (anuales.length) { const S = sumarDias(anuales[anuales.length - 1].end, 1); marcos.push({ S, E: sumarDias(S, 364), anual: null }); }
    for (const m of marcos) {
      const cerca = e => Math.abs(dias(m.S, e.start)) <= 6;
      const cum = [
        q3m.find(e => cerca(e)) || null,
        flu.find(e => cerca(e) && durOk(e, 170, 195)) || null,
        flu.find(e => cerca(e) && durOk(e, 260, 285)) || null,
        m.anual,
      ];
      const q = [null, null, null, null];
      for (let k = 0; k < 4; k++) {
        if (!cum[k]) continue;
        if (k === 0) q[0] = cum[0].val;
        else if (cum[k - 1]) q[k] = cum[k].val - cum[k - 1].val;
        if (q[k] != null) agregar({ end: cum[k].end, val: q[k], filed: cum[k].filed, derivado: k > 0 });
      }
      // Q4 sin el acumulado de 9 meses: año − (Q1 + Q2 + Q3) si los tres están sueltos.
      if (cum[3] && q[3] == null) {
        const sueltos = q3m.filter(e => dias(m.S, e.start) >= -6 && dias(e.end, m.E) > 20).sort(porFinAsc);
        if (sueltos.length === 3) {
          agregar({ end: cum[3].end, val: cum[3].val - sueltos.reduce((a, e) => a + e.val, 0), filed: cum[3].filed, derivado: true });
        }
      }
    }
    return out.sort(porFinAsc);
  }

  // TTM de un flujo: { fin, val, filed, fuente: 'trimestres' | 'anual' } o null.
  function ttmDe(entradas) {
    const qs = trimestresDe(entradas);
    const anuales = [...anualesDe(entradas).values()].sort(porFinAsc);
    const aUlt = anuales.length ? anuales[anuales.length - 1] : null;
    const ult4 = qs.slice(-4);
    let porQ = null;
    if (ult4.length === 4) {
      const seguidos = ult4.every((q, i) => i === 0 || (dias(ult4[i - 1].end, q.end) >= 75 && dias(ult4[i - 1].end, q.end) <= 110));
      if (seguidos) porQ = { fin: ult4[3].end, val: ult4.reduce((a, q) => a + q.val, 0), filed: ult4[3].filed, fuente: 'trimestres' };
    }
    if (porQ && (!aUlt || porQ.fin > aUlt.end)) return porQ;
    if (aUlt) return { fin: aUlt.end, val: aUlt.val, filed: aUlt.filed, fuente: 'anual' };
    return null;
  }

  const mapaInstantes = entradas => { const m = new Map(); for (const e of entradas) if (!e.start) m.set(e.end, e); return m; };
  function enFecha(mapa, fin, tol) {
    if (!fin || !mapa) return null;
    if (mapa.has(fin)) return mapa.get(fin);
    let mejor = null, md = Infinity;
    for (const [k, e] of mapa) { const d = Math.abs(dias(fin, k)); if (d <= tol && d < md) { mejor = e; md = d; } }
    return mejor;
  }
  function ultimoFin(...mapas) {
    let max = null;
    for (const m of mapas) if (m) for (const k of m.keys()) if (!max || k > max) max = k;
    return max;
  }

  // Splits: la SEC no re-expresa años viejos que ya no aparecen en reportes nuevos, y mezcla bases (EPS 9,21 de antes del split y 2,98 de después).
  // Si las acciones diluidas saltan x1,5 o más (o caen a 2/3) entre dos años seguidos, EPS y acciones de ese año y los anteriores se
  // dejan en null (no se ajustan: no se inventa un factor) y la ficha guarda desde cuándo no son comparables.
  function cortarPorSplit(anual) {
    const acc = anual.acciones;
    for (let i = acc.length - 1; i > 0; i--) {
      if (!esNum(acc[i]) || !esNum(acc[i - 1]) || acc[i - 1] <= 0) continue;
      const r = acc[i] / acc[i - 1];
      if (r >= 1.5 || r <= 1 / 1.5) {
        for (let j = 0; j < i; j++) { anual.eps[j] = null; anual.acciones[j] = null; }
        anual.sinComparar = anual.fin[i - 1];
        return;
      }
    }
  }

  // ── Ficha (job de la SEC) ──
  function construirFicha(cf, opts) {
    const facts = (cf && cf.facts) || {};
    const L = k => leer(facts, FUENTES[k].f, FUENTES[k].u);
    const ingresos = L('ingresos');
    const bruta = unir(L('bruta'), restar(ingresos, L('costo')));
    const flujos = {
      ingresos, bruta, ebit: L('ebit'), neto: L('neto'), eps: L('eps'), cfo: L('cfo'), capex: L('capex'), da: L('da'),
    };
    const accionesE = L('acciones');
    const impuesto = anualesDe(L('impuesto')), aai = anualesDe(L('aai'));

    const anuales = {}; for (const k of Object.keys(flujos)) anuales[k] = anualesDe(flujos[k]);
    const accAnual = anualesDe(accionesE);

    // Años fiscales de referencia: los de ingresos; si no hay, los del primer flujo que tenga.
    let ancla = null;
    for (const k of ['ingresos', 'neto', 'cfo', 'eps', 'ebit']) if (anuales[k].size) { ancla = anuales[k]; break; }
    const fin = ancla ? [...ancla.keys()].sort().slice(-11) : [];

    const M = {}; for (const k of ['efectivo', 'invCP', 'activos', 'patrimonio', 'deudaLP', 'deudaTotalUs', 'deudaTotalIfrs', 'deudaCP', 'deudaCPparte', 'prestCP', 'papel']) M[k] = mapaInstantes(L(k));
    const valorEn = (k, f) => { const e = enFecha(M[k], f, 3); return e ? e.val : null; };
    const cajaEn = f => { const ef = valorEn('efectivo', f); if (ef == null) return null; const inv = valorEn('invCP', f); return ef + (inv || 0); };
    const deudaEn = f => {
      const corto = () => {
        const dc = valorEn('deudaCP', f);
        if (dc != null) return dc;
        return sumaNoNulos([valorEn('deudaCPparte', f), valorEn('prestCP', f), valorEn('papel', f)]);
      };
      const lp = valorEn('deudaLP', f);
      if (lp != null) return lp + (corto() || 0);
      const totUs = valorEn('deudaTotalUs', f);
      if (totUs != null) return totUs + (sumaNoNulos([valorEn('prestCP', f), valorEn('papel', f)]) || 0);
      const totIfrs = valorEn('deudaTotalIfrs', f);
      if (totIfrs != null) return totIfrs;
      return corto();
    };

    const doc = (mapa, f) => { const e = enFecha(mapa, f, 7); return e ? e.val : null; };
    const anual = { fin };
    for (const k of Object.keys(flujos)) anual[k] = fin.map(f => doc(anuales[k], f));
    anual.acciones = fin.map(f => doc(accAnual, f));
    anual.caja = fin.map(cajaEn);
    anual.deuda = fin.map(deudaEn);
    anual.patrimonio = fin.map(f => valorEn('patrimonio', f));
    anual.tasa = fin.map(f => { const i = doc(impuesto, f), a = doc(aai, f); return esNum(i) && esNum(a) && a > 0 ? Math.round(i / a * 10000) / 10000 : null; });

    cortarPorSplit(anual);

    // TTM alineado al último período del ancla
    const t = {};
    for (const k of Object.keys(flujos)) t[k] = ttmDe(flujos[k]);
    let refTtm = null;
    for (const k of ['ingresos', 'neto', 'cfo', 'eps', 'ebit']) if (t[k]) { refTtm = t[k]; break; }
    const ttm = refTtm ? { fin: refTtm.fin, fuente: refTtm.fuente } : { fin: null, fuente: null };
    for (const k of Object.keys(flujos)) ttm[k] = t[k] && refTtm && Math.abs(dias(refTtm.fin, t[k].fin)) <= 10 ? t[k].val : null;
    if (esNum(ttm.eps)) ttm.eps = Math.round(ttm.eps * 10000) / 10000;

    // Balance más reciente
    const balFin = ultimoFin(M.patrimonio, M.efectivo);
    const bal = { fin: balFin, caja: balFin ? cajaEn(balFin) : null, deuda: balFin ? deudaEn(balFin) : null, patrimonio: balFin ? valorEn('patrimonio', balFin) : null, activos: balFin ? valorEn('activos', balFin) : null };

    // Acciones diluidas del último período informado (trimestre o año; si empatan, el más corto)
    let acc = null;
    for (const e of accionesE) {
      if (!(esTrimestre(e) || esAnual(e))) continue;
      if (!acc || e.end > acc.end || (e.end === acc.end && dias(e.start, e.end) < dias(acc.start, acc.end))) acc = e;
    }

    const sinDatos = !fin.length && !refTtm;
    const presentado = [refTtm && refTtm.filed, balFin && (enFecha(M.patrimonio, balFin, 0) || {}).filed].filter(Boolean).sort().pop() || null;
    return {
      v: 1,
      nombre: (cf && cf.entityName) || null,
      cik: cf && cf.cik != null ? String(cf.cik).padStart(10, '0') : null,
      sinDatos,
      datosAl: ttm.fin || balFin || null,
      presentado,
      anual, ttm, bal,
      acciones: acc ? acc.val : null,
      accionesFin: acc ? acc.end : null,
    };
  }

  // ── Utilidades de tickers y fechas ──
  const TICKER_RE = /^[A-Z][A-Z0-9-]{0,9}$/;
  function normalizarTicker(s) {
    const t = String(s == null ? '' : s).trim().toUpperCase().replace(/\./g, '-');
    return TICKER_RE.test(t) ? t : null;
  }

  const API = { FUENTES, leer, anualesDe, trimestresDe, ttmDe, construirFicha, normalizarTicker, dias, sumarDias };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.RadarCalc = API;
})(typeof window !== 'undefined' ? window : globalThis);
