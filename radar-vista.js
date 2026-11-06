'use strict';
// ════════════════════════════════════════════════════════════════════════
// RADAR — VISTA DE LA FICHA (cálculo y formato PUROS: sin DOM, sin red, sin `S`).
// Lo carga el navegador (window.RadarVista, antes de radar.js) y los tests de Node. Toma los JSON ya leídos del repo privado y arma, para
// una empresa, las secciones de la ficha con cada número listo para mostrar:
//   radar-config.json   → qué empresas hay, sus KPIs generales (por sección) y específicos          (lo edita Tobías, sin tocar código)
//   mercado-<T>.json    → Yahoo: precio, múltiplos, consenso, insiders…                             (job diario)
//   historia-<T>.json   → SEC / Yahoo: trimestres de ingresos, resultados, flujos, balance, P/E     (job diario)
//   kpis-<T>.json       → comunicados y presentaciones: KPIs trimestrales con página y cita         (rutina de extracción)
//   radar-manual.json   → lo que carga Tobías a mano (media de P/E forward, pares, WACC)
// Reglas que no se negocian: un valor faltante nunca es un cero falso ('pendiente' = lo carga Tobías, 'no informado en Qx' = el comunicado
// no lo trae, 'sin datos todavía' = nadie lo cargó aún, 'n/s' = no significativo, 'no aplica' = no tiene sentido para ese tipo de empresa);
// nunca se arrastra el valor de un trimestre viejo como si fuera del último; nada se estima ni se interpola.
// Unidades: los % de mercado vienen como razón (0,0247 = 2,47%); los de comunicados como se leen (12,3 = 12,3%) → acá todo pasa a razón.
// ════════════════════════════════════════════════════════════════════════
(function (root) {
  const esNum = v => typeof v === 'number' && isFinite(v);
  const MS_DIA = 86400000;
  const dias = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / MS_DIA);
  const ISO = /^\d{4}-\d{2}-\d{2}/;

  // ── Formato (es-AR) ──
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const dec = (n, d) => n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const signo = (n, d) => { const r = Math.round(n * Math.pow(10, d)) / Math.pow(10, d); return (r > 0 ? '+' : '') + dec(r === 0 ? 0 : n, d); };
  const fc = f => (typeof f === 'string' && ISO.test(f) ? f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(2, 4) : (f || ''));
  const dm = f => (typeof f === 'string' && ISO.test(f) ? f.slice(8, 10) + '/' + f.slice(5, 7) : (f || ''));
  const mesAnio = f => (typeof f === 'string' && ISO.test(f) ? MESES[+f.slice(5, 7) - 1] + '-' + f.slice(2, 4) : (f || ''));
  const claveQ = k => { const m = /^(\d{4})-Q(\d)$/.exec(String(k || '')); return m ? 'Q' + m[2] + ' ' + m[1] : String(k || ''); };
  function compacto(v) {
    const a = Math.abs(v);
    if (a >= 1e9) return dec(v / 1e9, a >= 1e11 ? 0 : 1) + ' mil M';
    if (a >= 1e6) return dec(v / 1e6, a >= 1e8 ? 0 : 1) + ' M';
    if (a >= 1e5) return dec(v / 1e3, 0) + ' mil';
    return dec(v, a >= 100 ? 0 : 1);
  }
  // kind: pct (razón) · pp · x · usd (importe en USD) · usdps (USD por acción) · n (cantidad) · dias · usdtarjeta
  function fmt(kind, v, opts) {
    if (!esNum(v)) return null;
    const con = opts && opts.signo;
    switch (kind) {
      case 'pct': return (con ? signo(v * 100, 1) : dec(v * 100, 1)) + '%';
      case 'pp': return signo(v, 1) + ' pp';
      case 'x': return dec(v, 1) + 'x';
      case 'usd': return (v < 0 ? '-' : '') + 'US$ ' + compacto(Math.abs(v));
      case 'usdps': return (v < 0 ? '-' : '') + 'US$ ' + dec(Math.abs(v), 2);
      case 'n': return compacto(v);
      case 'dias': return dec(v, 0) + ' días';
      case 'usdtarjeta': return 'US$ ' + dec(v, 0) + ' por tarjeta';
      default: return dec(v, 2);
    }
  }
  // Comunicados: { unidad, valor } → { kind, v } normalizado (razón, USD completos, cantidades completas).
  function norm(unidad, valor) {
    if (!esNum(valor)) return null;
    switch (unidad) {
      case 'USD millones': return { kind: 'usd', v: valor * 1e6 };
      case 'USD miles de millones': return { kind: 'usd', v: valor * 1e9 };
      case 'USD': return { kind: 'usdps', v: valor };
      case '%': return { kind: 'pct', v: valor / 100 };
      case 'pp': return { kind: 'pp', v: valor };
      case 'x': return { kind: 'x', v: valor };
      case 'días': return { kind: 'dias', v: valor };
      case 'n': return { kind: 'n', v: valor };
      case 'miles': return { kind: 'n', v: valor * 1e3 };
      case 'millones': return { kind: 'n', v: valor * 1e6 };
      case 'USD/tarjeta': return { kind: 'usdtarjeta', v: valor };
      default: return null;
    }
  }
  // Variación contra un valor anterior: puntos porcentuales si es un % (o pp); relativa en el resto. Base ≤ 0 → null (no significativa).
  function variacion(kind, ahora, antes) {
    if (!esNum(ahora) || !esNum(antes)) return null;
    if (kind === 'pct') return signo((ahora - antes) * 100, 1) + ' pp';
    if (kind === 'pp') return signo(ahora - antes, 1) + ' pp';
    if (antes <= 0) return null;
    return signo((ahora / antes - 1) * 100, 1) + '%';
  }
  function monograma(nombre) {
    const w = String(nombre || '').split(/\s+/).map(p => (p.match(/[A-Za-z0-9]/) || [''])[0]).filter(Boolean);
    return (w.length > 1 ? w[0] + w[1] : String(nombre || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2)).toUpperCase() || '?';
  }
  const urlSegura = u => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

  // ── Secciones, en el orden de la lista de Tobías ──
  const SECCIONES = [
    ['precio', 'Precio'], ['crecimiento', 'Crecimiento'], ['rentabilidad', 'Rentabilidad'], ['calidad_ganancias', 'Calidad de ganancias'], ['caja', 'Caja'],
    ['eficiencia_retorno', 'Eficiencia y retorno'], ['balance_riesgo', 'Balance y riesgo'], ['capital', 'Capital'], ['valuacion', 'Valuación'],
    ['expectativas_mercado', 'Expectativas y mercado'],
  ];
  // En un banco (financiera: true en el config) la deuda, el valor de empresa y el flujo libre no se interpretan como en una empresa operativa.
  const NO_APLICA_FIN = new Set(['deuda_neta', 'deuda_neta_ebitda', 'cobertura_de_intereses', 'ev_ebitda', 'ev_ventas', 'p_fcf', 'fcf_yield', 'fcf', 'fcf_utilidad_neta', 'fcf_neto_de_sbc']);
  const rid = id => String(id).slice(0, 24);   // el Worker acepta kpi_id de hasta 24 caracteres
  const NS = 'ns';

  // ── Comunicados: kpis-<T>.json → trimestres ordenados por fecha de cierre ──
  function trimestresDe(kpis) {
    const t = kpis && kpis.trimestres && typeof kpis.trimestres === 'object' ? kpis.trimestres : {};
    return Object.keys(t).map(clave => ({ clave, fin: (t[clave] && t[clave].fecha_fin) || null, kpis: (t[clave] && t[clave].kpis) || {} }))
      .filter(q => q.fin).sort((a, b) => (a.fin < b.fin ? -1 : a.fin > b.fin ? 1 : 0));
  }

  // ── Fuentes ──
  const srcYahoo = fecha => ({ tipo: 'yahoo', titulo: 'Yahoo Finance', detalle: fecha ? 'dato del ' + fc(fecha) : '', fecha: fecha || null });
  function srcFila(row) {
    if (row && row.fuente === 'sec') return { tipo: 'sec', titulo: 'SEC (presentación oficial de la empresa)', detalle: 'trimestre al ' + fc(row.fin) + (row.presentado ? ', presentado el ' + fc(row.presentado) : ''), fecha: row.presentado || row.fin };
    return { tipo: 'yahoo', titulo: 'Yahoo Finance', detalle: 'trimestre al ' + fc(row && row.fin), fecha: row && row.fin };
  }
  const srcCalc = (formula, base) => ({ tipo: 'calculo', titulo: 'Cálculo', detalle: formula, base: base || null });

  // ════════════════════════════════════════════════════════════════════
  // Vista de una empresa
  // ════════════════════════════════════════════════════════════════════
  function vista(ctx) {
    const { config, emp, mercado, historia, kpis, manual } = ctx;
    const T = emp.ticker;
    const M = mercado && typeof mercado === 'object' ? mercado : null;
    const rows = historia && Array.isArray(historia.trimestres) ? historia.trimestres.filter(r => r && r.fin).sort((a, b) => (a.fin < b.fin ? -1 : a.fin > b.fin ? 1 : 0)) : [];
    const Q = trimestresDe(kpis);
    const ultQ = Q.length ? Q[Q.length - 1] : null;
    const man = manual && manual.empresas && manual.empresas[T] ? manual.empresas[T] : null;
    const fin = !!emp.financiera;

    const mv = k => (M && M[k] && M[k].valor != null ? M[k] : null);   // { valor, fecha, … }
    const mf = k => (M && M[k] && M[k].fecha) || (M && M.generado) || null;

    // ── Constructores de ítems ──
    const base = (id, nombre, o) => Object.assign({ id, rid: rid(id), nombre, estado: 'ok', txt: '', lineas: [], serie: [], tt: null, aa: null, periodo: '', tri: null, fuente: null, proxy: false, nota: '', desde: '' }, o);
    const falta = (id, nombre, estado, txt, o) => base(id, nombre, Object.assign({ estado, txt }, o));
    const sinDatos = (id, nombre, o) => falta(id, nombre, 'sin_datos', 'sin datos todavía', o);
    const noAplica = (id, nombre) => falta(id, nombre, 'no_aplica', 'no aplica', { detalle: 'Banco: la deuda, el valor de empresa y el flujo libre no se interpretan como en una empresa operativa.' });
    const pendiente = (id, nombre, detalle) => falta(id, nombre, 'pendiente', 'pendiente', { detalle });
    const noSig = (id, nombre, detalle, o) => falta(id, nombre, 'ns', 'n/s', Object.assign({ detalle: detalle || 'No significativo.' }, o));
    // Valor de mercado simple.
    function deMercado(id, nombre, kind, clave, o) {
      const m = mv(clave);
      if (!m || !esNum(m.valor)) return sinDatos(id, nombre);
      return base(id, nombre, Object.assign({ txt: fmt(kind, m.valor, o && o.signo), num: m.valor, kind, periodo: 'al ' + fc(m.fecha), tri: m.fecha, fuente: srcYahoo(m.fecha) }, o));
    }

    // ── Serie trimestral (historia): helpers de fecha ──
    const consecutivo = (i) => i > 0 && dias(rows[i - 1].fin, rows[i].fin) >= 70 && dias(rows[i - 1].fin, rows[i].fin) <= 110;
    const haceMeses = (i, m) => {   // índice de la fila que cierra ~m meses antes de la fila i (±20 días) o -1
      const d = new Date(Date.parse(rows[i].fin + 'T00:00:00Z')); d.setUTCMonth(d.getUTCMonth() - m);
      const objetivo = d.toISOString().slice(0, 10);
      for (let j = i - 1; j >= 0; j--) { const x = Math.abs(dias(rows[j].fin, objetivo)); if (x <= 20) return j; if (rows[j].fin < objetivo && x > 20) break; }
      return -1;
    };
    const ttmDe = (i, f) => {   // suma de 4 trimestres consecutivos; null si falta uno
      if (i < 3 || !consecutivo(i) || !consecutivo(i - 1) || !consecutivo(i - 2)) return null;
      let s = 0; for (let k = 0; k < 4; k++) { const v = f(rows[i - k]); if (!esNum(v)) return null; s += v; } return s;
    };
    const A = i => rows[i];

    // Item a partir de una serie trimestral. f(i) → número | NS | null. formula = texto del cálculo (null = dato directo de la fuente).
    function deHistoria(id, nombre, kind, f, formula, o) {
      if (!rows.length) return sinDatos(id, nombre);
      const serie = [];
      for (let i = 0; i < rows.length; i++) { const v = f(i); if (esNum(v)) serie.push({ fin: rows[i].fin, v, i }); }
      const n = rows.length - 1;
      const v = f(n);
      const row = rows[n];
      const comunes = { serie: serie.map(p => ({ fin: p.fin, v: p.v })), kind, periodo: 'trim. al ' + fc(row.fin), tri: row.fin };
      comunes.desde = serie.length && serie.length < 12 ? 'datos desde ' + mesAnio(serie[0].fin) : '';
      const fuente = formula ? srcCalc(formula, srcFila(row)) : srcFila(row);
      if (v === NS) return noSig(id, nombre, 'El trimestre no permite un cociente con sentido (base cero o negativa).', Object.assign({ fuente }, comunes));
      if (!esNum(v)) return sinDatos(id, nombre, Object.assign({ fuente }, comunes, { detalle: serie.length ? 'El último trimestre (' + fc(row.fin) + ') no trae este dato.' : '' }));
      const calcVar = m => { const j = haceMeses(n, m); return j < 0 ? null : variacion(kind, v, f(j)); };
      return base(id, nombre, Object.assign({ txt: fmt(kind, v), num: v, tt: calcVar(3), aa: calcVar(12), fuente }, comunes, o));
    }
    const razonQ = (a, b) => i => { const x = a(i), y = b(i); if (!esNum(x) || !esNum(y)) return null; return y > 0 ? x / y : NS; };
    const col = k => i => (esNum(A(i)[k]) ? A(i)[k] : null);
    const crecimiento = (g, m) => i => { const j = haceMeses(i, m); if (j < 0) return null; const x = g(i), y = g(j); if (!esNum(x) || !esNum(y)) return null; return y > 0 ? x / y - 1 : NS; };
    const ing = col('ingresos'), opi = col('utilidad_operativa'), neto = col('utilidad_neta'), fcf = col('fcf'), cfo = col('cfo'), cap = col('capex'), sbc = col('sbc'), da = col('da');
    const deudaNeta = i => (esNum(A(i).deuda) && esNum(A(i).caja) ? A(i).deuda - A(i).caja : null);
    const ebitdaTtm = i => ttmDe(i, r => (esNum(r.utilidad_operativa) && esNum(r.da) ? r.utilidad_operativa + r.da : null));

    // ── Ítems de comunicado (cualquier KPI del config con fuente 'comunicado' y todos los específicos) ──
    function deComunicado(id, nombre, unidadCfg, nota) {
      const extra = nota ? { nota } : {};
      if (!Q.length) return sinDatos(id, nombre, extra);
      const pts = []; let kindSerie = null;
      for (const q of Q) {
        const k = q.kpis[id];
        if (k && k.valor != null && typeof k.valor !== 'string') { const nn = norm(k.unidad || unidadCfg, k.valor); if (nn) { pts.push({ fin: q.fin, v: nn.v }); kindSerie = nn.kind; } }
      }
      const lk = ultQ.kpis[id];
      const fuenteDe = k => {
        const f = (k && k.fuente) || {};
        const titulo = { comunicado: 'Comunicado de resultados', presentacion: 'Presentación de resultados', sec: 'SEC', calculo: 'Cálculo' }[f.tipo] || 'Comunicado';
        return { tipo: f.tipo === 'calculo' ? 'calculo' : f.tipo === 'sec' ? 'sec' : 'comunicado', titulo, detalle: f.pagina_o_slide || '', url: urlSegura(f.url), cita: f.cita || '', fecha: kpis && kpis.actualizado ? kpis.actualizado.slice(0, 10) : null };
      };
      if (!lk) return sinDatos(id, nombre, Object.assign({ detalle: 'El último comunicado cargado (' + claveQ(ultQ.clave) + ') todavía no trae este indicador.', serie: pts, kind: kindSerie, desde: pts.length ? 'datos desde ' + mesAnio(pts[0].fin) : '' }, extra));
      if (lk.valor == null) {
        return falta(id, nombre, 'no_informado', 'no informado en ' + claveQ(ultQ.clave), Object.assign({ detalle: lk.motivo || '', fuente: fuenteDe(lk), periodo: claveQ(ultQ.clave), tri: ultQ.fin, serie: pts, kind: kindSerie, desde: pts.length ? 'datos desde ' + mesAnio(pts[0].fin) : '' }, extra));
      }
      const comunes = { periodo: claveQ(ultQ.clave) + ' (al ' + fc(ultQ.fin) + ')', tri: ultQ.fin, fuente: fuenteDe(lk), proxy: !!lk.proxy, nota: lk.nota || nota || '' };
      if (typeof lk.valor === 'string') return base(id, nombre, Object.assign({ txt: lk.valor, largo: true }, comunes));
      const nn = norm(lk.unidad || unidadCfg, lk.valor);
      if (!nn) return sinDatos(id, nombre, { detalle: 'Unidad desconocida en el comunicado: ' + (lk.unidad || '?') });
      const lineas = [];
      if (lk.desglose && typeof lk.desglose === 'object') {
        for (const k of Object.keys(lk.desglose)) { const d = norm(lk.unidad || unidadCfg, lk.desglose[k]); if (d) lineas.push({ k, txt: fmt(d.kind, d.v) }); }
      }
      const serie = pts.slice();
      const conTT = m => { const d = new Date(Date.parse(ultQ.fin + 'T00:00:00Z')); d.setUTCMonth(d.getUTCMonth() - m); const obj = d.toISOString().slice(0, 10); const p = serie.find(x => Math.abs(dias(x.fin, obj)) <= 20); return p ? variacion(nn.kind, nn.v, p.v) : null; };
      return base(id, nombre, Object.assign({ txt: fmt(nn.kind, nn.v), num: nn.v, kind: nn.kind, serie, lineas, tt: conTT(3), aa: conTT(12), desde: serie.length < 12 ? 'datos desde ' + mesAnio(serie[0].fin) : '' }, comunes));
    }

    // EPS ajustado TTM (4 trimestres de comunicados seguidos) para el P/E ajustado.
    function epsAjustadoTtm() {
      if (Q.length < 4) return null;
      const u = Q.slice(-4); let s = 0;
      for (let i = 0; i < 4; i++) {
        const k = u[i].kpis.eps_ajustado; if (!k || !esNum(k.valor)) return null;
        if (i > 0) { const d = dias(u[i - 1].fin, u[i].fin); if (d < 70 || d > 110) return null; }
        s += k.valor;
      }
      return { eps: s, desde: u[0].fin, hasta: u[3].fin };
    }

    // ── P/E ──
    const anioDe = k => { const e = M && M.estimaciones && M.estimaciones.valor && M.estimaciones.valor[k]; return e && e.fin ? e.fin.slice(0, 4) : ''; };
    const epsEst = k => { const e = M && M.estimaciones && M.estimaciones.valor && M.estimaciones.valor[k]; return e && e.eps ? e.eps : null; };

    function peTtmGaap() {
      const pe = mv('pe_ttm'), eps = mv('eps_ttm_gaap');
      const nombre = 'P/E TTM (GAAP)';
      const serie = rows.filter(r => esNum(r.pe_ttm)).map(r => ({ fin: r.fin, v: r.pe_ttm }));
      const comunes = { serie, kind: 'x', desde: serie.length && serie.length < 12 ? 'datos desde ' + mesAnio(serie[0].fin) : '' };
      if (eps && esNum(eps.valor) && eps.valor <= 0) return noSig('p_e_ttm', nombre, 'La empresa perdió plata en los últimos 12 meses (EPS ' + fmt('usdps', eps.valor) + '): el P/E no tiene sentido.', Object.assign({ fuente: srcYahoo(eps.fecha) }, comunes));
      if (!pe) return sinDatos('p_e_ttm', nombre, comunes);
      const lineas = eps ? [{ k: 'EPS diluido de los últimos 12 meses (GAAP)', txt: fmt('usdps', eps.valor) }] : [];
      return base('p_e_ttm', nombre, Object.assign({ txt: fmt('x', pe.valor), num: pe.valor, periodo: 'al ' + fc(pe.fecha), tri: pe.fecha, fuente: srcYahoo(pe.fecha), lineas, detalle: 'Precio ÷ ganancia por acción contable (GAAP) de los últimos 12 meses.' }, comunes));
    }
    function peTtmAjustado() {
      const nombre = 'P/E TTM ajustado', id = 'p_e_ttm_ajustado';
      const e = epsAjustadoTtm(), px = mv('precio');
      if (!e || !px) return sinDatos(id, nombre, { detalle: 'Necesita el EPS ajustado de 4 comunicados seguidos (todavía no están cargados).' });
      if (e.eps <= 0) return noSig(id, nombre, 'EPS ajustado de los últimos 12 meses ≤ 0.');
      return base(id, nombre, { txt: fmt('x', px.valor / e.eps), num: px.valor / e.eps, kind: 'x', periodo: 'al ' + fc(px.fecha), tri: px.fecha, lineas: [{ k: 'EPS ajustado, 4 trimestres hasta ' + fc(e.hasta), txt: fmt('usdps', e.eps) }], fuente: srcCalc('precio ÷ suma del EPS ajustado de los últimos 4 comunicados', srcYahoo(px.fecha)) });
    }
    function peFwd(clave, estKey, nombreBase, id) {
      const anio = anioDe(estKey);
      const nombre = nombreBase + (anio ? ' (EPS ' + anio + 'e)' : '');
      const pe = mv(clave), eps = epsEst(estKey);
      if (eps && esNum(eps.promedio) && eps.promedio <= 0) return noSig(id, nombre, 'El consenso espera pérdidas para ' + anio + ' (EPS ' + fmt('usdps', eps.promedio) + ').', { fuente: srcYahoo(mf('estimaciones')) });
      if (!pe) return sinDatos(id, nombre);
      const lineas = eps && esNum(eps.promedio) ? [{ k: 'EPS estimado ' + anio + ' (promedio de ' + (eps.analistas || '?') + ' analistas)', txt: fmt('usdps', eps.promedio) }] : [];
      return base(id, nombre, { txt: fmt('x', pe.valor), num: pe.valor, kind: 'x', periodo: 'al ' + fc(pe.fecha), tri: pe.fecha, lineas, fuente: srcYahoo(pe.fecha), detalle: 'Precio de hoy ÷ ganancia por acción que espera el consenso para el año fiscal ' + anio + '.' });
    }
    function peVsMedia() {
      const id = 'p_e_vs_media_5_10_15_anos', nombre = 'P/E TTM vs media de 5, 10 y 15 años';
      const med = historia && historia.medias_pe_ttm; const pe = mv('pe_ttm');
      if (!med) return sinDatos(id, nombre);
      const lineas = []; let principal = null;
      for (const [k, rot] of [['5y', '5 años'], ['10y', '10 años'], ['15y', '15 años']]) {
        const m = med[k]; if (!m) continue;
        if (!esNum(m.valor)) { lineas.push({ k: 'Media ' + rot, txt: 'sin datos' + (m.trimestres ? ' (solo ' + m.trimestres + ' trimestres de P/E)' : '') }); continue; }
        const dif = pe && esNum(pe.valor) && m.valor > 0 ? pe.valor / m.valor - 1 : null;
        const desde = m.completo === false ? (emp.cotiza_desde ? 'desde la salida a bolsa, ' + fc(emp.cotiza_desde) : 'desde ' + fc(m.desde)) : 'desde ' + fc(m.desde);
        lineas.push({ k: 'Media ' + rot + ' (' + desde + ')', txt: fmt('x', m.valor) + (dif != null ? ' · hoy ' + fmt('pct', dif, { signo: true }) : '') });
        if (!principal && dif != null) principal = { dif, rot };
      }
      const fuente = srcCalc('media del P/E TTM (GAAP) al cierre de cada trimestre; precio de cierre y EPS de la SEC', { tipo: 'sec', titulo: 'SEC + precios de cierre', detalle: 'hasta ' + fc(med['5y'] && med['5y'].hasta) });
      if (!principal) return sinDatos(id, nombre, { lineas, fuente, detalle: 'No hay historia suficiente de P/E con ganancias positivas.' });
      return base(id, nombre, { txt: fmt('pct', principal.dif, { signo: true }) + ' vs media ' + principal.rot, lineas, fuente, periodo: 'hoy', tri: pe ? pe.fecha : null });
    }
    function peFwdVsMedia() {
      const id = 'p_e_forward_vs_media_5_10_15_anos', nombre = 'P/E forward vs media de 5, 10 y 15 años';
      const m = man && man.pe_forward_media; const pe = mv('pe_forward');
      if (!m || ![m['5y'], m['10y'], m['15y']].some(esNum)) return pendiente(id, nombre, 'Lo cargás vos en radar-manual.json (media del P/E forward a 5, 10 y 15 años).');
      const lineas = []; let principal = null;
      for (const [k, rot] of [['5y', '5 años'], ['10y', '10 años'], ['15y', '15 años']]) {
        if (!esNum(m[k])) { lineas.push({ k: 'Media ' + rot, txt: 'pendiente' }); continue; }
        const dif = pe && esNum(pe.valor) && m[k] > 0 ? pe.valor / m[k] - 1 : null;
        lineas.push({ k: 'Media ' + rot + (k === '5y' && m.desde ? ' (desde ' + m.desde + ')' : ''), txt: fmt('x', m[k]) + (dif != null ? ' · hoy ' + fmt('pct', dif, { signo: true }) : '') });
        if (!principal && dif != null) principal = { dif, rot };
      }
      const fuente = { tipo: 'manual', titulo: 'Cargado por vos el ' + manualFecha(m.fecha_dato), detalle: [m.fuente, ''].filter(Boolean).join(' · '), url: urlSegura(m.url) };
      return base(id, nombre, { txt: principal ? fmt('pct', principal.dif, { signo: true }) + ' vs media ' + principal.rot : 'cargado', lineas, fuente, periodo: 'cargado por vos', tri: m.fecha_dato && ISO.test(m.fecha_dato) ? m.fecha_dato.slice(0, 10) : (pe ? pe.fecha : null) });
    }
    function manualFecha(f) { return typeof f === 'string' && ISO.test(f) ? dm(f) : (f || 'dd/mm'); }
    function vsPares() {
      const id = 'valuacion_vs_pares', nombre = 'Valuación vs pares';
      const pares = man && Array.isArray(man.pares) ? man.pares.filter(Boolean) : [];
      if (!pares.length) return pendiente(id, nombre, 'Lo cargás vos en radar-manual.json (2 a 4 empresas comparables).');
      const pe = mv('pe_forward'); const vals = pares.map(p => ctx.paresMercado && ctx.paresMercado[p] && ctx.paresMercado[p].pe_forward && ctx.paresMercado[p].pe_forward.valor).filter(esNum);
      const fuente = { tipo: 'manual', titulo: 'Pares cargados por vos el ' + manualFecha(man.pares_fecha || (man.pe_forward_media && man.pe_forward_media.fecha_dato)), detalle: pares.join(', ') };
      if (!pe || !vals.length) return sinDatos(id, nombre, { detalle: 'Pares: ' + pares.join(', ') + '. Faltan sus P/E forward para comparar.', fuente });
      const prom = vals.reduce((a, b) => a + b, 0) / vals.length;
      return base(id, nombre, { txt: fmt('x', pe.valor / prom), num: pe.valor / prom, kind: 'x', detalle: 'P/E forward de la empresa ÷ promedio de sus pares (' + pares.join(', ') + ').', fuente, periodo: 'al ' + fc(pe.fecha), tri: pe.fecha });
    }

    // ── Precio ──
    function distanciaAth() {
      const m = mv('distancia_ath'); if (!m) return sinDatos('distancia_al_ath', 'Distancia al ATH');
      const ath = mv('ath');
      return base('distancia_al_ath', 'Distancia al ATH', { txt: fmt('pct', m.valor, { signo: true }), num: m.valor, kind: 'pct', periodo: 'al ' + fc(m.fecha), tri: m.fecha, fuente: srcYahoo(m.fecha),
        lineas: ath ? [{ k: 'Máximo histórico', txt: fmt('usdps', ath.valor) + ' (' + fc(ath.fecha) + ')' }] : [] });
    }
    function drawdown() {
      const m = mv('drawdown_maximo'); if (!m) return sinDatos('drawdown_maximo_desde_ath', 'Drawdown máximo desde ATH');
      return base('drawdown_maximo_desde_ath', 'Drawdown máximo desde ATH', { txt: fmt('pct', m.valor), num: m.valor, kind: 'pct', periodo: 'al ' + fc(m.fecha), tri: m.fecha, fuente: srcYahoo(m.fecha),
        detalle: 'La peor caída desde un máximo hasta el mínimo siguiente.', lineas: m.pico ? [{ k: 'Desde el pico', txt: fc(m.pico) }, { k: 'Hasta el mínimo', txt: fc(m.valle) }] : [] });
    }
    function rango52() {
      const m = mv('rango_52s'); if (!m || !m.valor || !esNum(m.valor.min)) return sinDatos('rango_52_semanas', 'Rango 52 semanas');
      const r = m.valor; const px = mv('precio');
      return base('rango_52_semanas', 'Rango 52 semanas', { txt: fmt('usdps', r.min) + ' – ' + fmt('usdps', r.max), periodo: 'al ' + fc(m.fecha), tri: m.fecha, fuente: srcYahoo(m.fecha),
        lineas: esNum(r.posicion) ? [{ k: 'Dónde está el precio dentro del rango', txt: fmt('pct', r.posicion) + (px ? ' (' + fmt('usdps', px.valor) + ')' : '') }] : [], rango: esNum(r.posicion) ? r.posicion : null });
    }

    // ── Expectativas ──
    function sorpresaEps() {
      const m = mv('sorpresa_ultimo_trimestre'); const id = 'sorpresa_vs_consenso_eps', nombre = 'Sorpresa vs consenso (EPS)';
      if (!m || !esNum(m.valor.sorpresa_pct)) return sinDatos(id, nombre);
      const v = m.valor;
      return base(id, nombre, { txt: fmt('pct', v.sorpresa_pct, { signo: true }), num: v.sorpresa_pct, kind: 'pct', periodo: 'trim. al ' + fc(v.trimestre), tri: v.trimestre || m.fecha, fuente: srcYahoo(m.fecha),
        lineas: [{ k: 'EPS real', txt: fmt('usdps', v.eps_real) }, { k: 'EPS que esperaba el consenso', txt: fmt('usdps', v.eps_estimado) }] });
    }
    function revisiones() {
      const m = mv('revisiones_eps'); const id = 'revisiones_de_eps_30_90_dias', nombre = 'Revisiones de EPS (30 y 90 días)';
      const a = m && m.valor && m.valor.anio_actual; if (!a || !esNum(a.variacion_30d)) return sinDatos(id, nombre);
      const anio = anioDe('anio_actual');
      const lineas = [{ k: 'Hace 90 días', txt: esNum(a.variacion_90d) ? fmt('pct', a.variacion_90d, { signo: true }) : 'sin datos' }];
      if (esNum(a.analistas_al_alza_30d)) lineas.push({ k: 'Analistas que subieron / bajaron su estimación (30 días)', txt: a.analistas_al_alza_30d + ' / ' + a.analistas_a_la_baja_30d });
      return base(id, nombre, { txt: '30 d ' + fmt('pct', a.variacion_30d, { signo: true }), num: a.variacion_30d, kind: 'pct', periodo: 'EPS ' + (anio || 'año en curso') + 'e', tri: m.fecha, lineas, fuente: srcYahoo(m.fecha), detalle: 'Cómo cambió el EPS que espera el consenso para el año fiscal en curso.' });
    }
    function precioObjetivo() {
      const m = mv('precio_objetivo'); const id = 'precio_objetivo_promedio', nombre = 'Precio objetivo promedio';
      if (!m || !esNum(m.valor.promedio)) return sinDatos(id, nombre);
      const v = m.valor;
      return base(id, nombre, { txt: fmt('usdps', v.promedio), num: v.promedio, kind: 'usdps', periodo: 'al ' + fc(m.fecha), tri: m.fecha, fuente: srcYahoo(m.fecha),
        lineas: [{ k: 'Potencial contra el precio de hoy', txt: esNum(v.potencial) ? fmt('pct', v.potencial, { signo: true }) : 'sin datos' }, { k: 'Rango de los analistas', txt: fmt('usdps', v.bajo) + ' – ' + fmt('usdps', v.alto) }, { k: 'Analistas', txt: String(v.analistas || '?') }] });
    }
    function recomendaciones() {
      const m = mv('recomendaciones'); const id = 'distribucion_de_recomendaciones', nombre = 'Distribución de recomendaciones';
      if (!m) return sinDatos(id, nombre);
      const v = m.valor; const compra = (v.compra_fuerte || 0) + (v.compra || 0), venta = (v.venta || 0) + (v.venta_fuerte || 0), total = compra + venta + (v.mantener || 0);
      if (!total) return sinDatos(id, nombre);
      return base(id, nombre, { txt: compra + ' compra · ' + (v.mantener || 0) + ' mantener · ' + venta + ' venta', periodo: 'al ' + fc(m.fecha), tri: m.fecha, fuente: srcYahoo(m.fecha),
        lineas: [{ k: 'Compra fuerte / compra', txt: (v.compra_fuerte || 0) + ' / ' + (v.compra || 0) }, { k: 'Venta / venta fuerte', txt: (v.venta || 0) + ' / ' + (v.venta_fuerte || 0) }].concat(esNum(v.media) ? [{ k: 'Nota media (1 compra fuerte, 5 venta fuerte)', txt: dec(v.media, 2) }] : []) });
    }
    function insiders() {
      const m = mv('insiders'); const id = 'compras_y_ventas_de_insiders', nombre = 'Compras y ventas de insiders';
      if (!m) return sinDatos(id, nombre);
      const v = m.valor; if (!esNum(v.neto_acciones)) return sinDatos(id, nombre);
      return base(id, nombre, { txt: (v.neto_acciones > 0 ? 'compran: ' : v.neto_acciones < 0 ? 'venden: ' : '') + compacto(Math.abs(v.neto_acciones)) + ' acc.', num: v.neto_acciones, periodo: 'últimos ' + (v.periodo === '6m' ? '6 meses' : (v.periodo || 'meses')), tri: m.fecha, fuente: srcYahoo(m.fecha),
        detalle: 'Directivos y miembros del directorio de la empresa; saldo neto de acciones.',
        lineas: [{ k: 'Operaciones de compra', txt: String(v.compras_n) }, { k: 'Operaciones de venta', txt: String(v.ventas_n) }] });
    }
    function institucional() {
      const m = mv('institucional'); const id = 'variacion_de_tenencia_institucional', nombre = 'Variación de tenencia institucional';
      if (!m || !esNum(m.valor.neto_compra_pct)) return sinDatos(id, nombre);
      const v = m.valor;
      return base(id, nombre, { txt: fmt('pct', v.neto_compra_pct, { signo: true }), num: v.neto_compra_pct, kind: 'pct', periodo: 'al ' + fc(m.fecha), tri: m.fecha, fuente: srcYahoo(m.fecha),
        detalle: 'Compra neta de los fondos e instituciones en el último trimestre informado.',
        lineas: esNum(v.pct) ? [{ k: 'Parte de las acciones en manos de instituciones', txt: fmt('pct', v.pct) + (v.cantidad ? ' (' + dec(v.cantidad, 0) + ' tenedores)' : '') }] : [] });
    }
    function shortInterest() {
      const m = mv('short_interest'); const id = 'short_interest', nombre = 'Short interest (apuestas a la baja)';
      if (!m || !esNum(m.valor.pct_float)) return sinDatos(id, nombre);
      const v = m.valor;
      return base(id, nombre, { txt: fmt('pct', v.pct_float), num: v.pct_float, kind: 'pct', periodo: 'al ' + fc(m.fecha), tri: m.fecha, fuente: srcYahoo(m.fecha), detalle: 'Parte de las acciones en circulación vendidas en corto.',
        lineas: esNum(v.dias_para_cubrir) ? [{ k: 'Días para cubrir', txt: dec(v.dias_para_cubrir, 1) }] : [] });
    }

    // ── Resolutores por id del config ──
    const ruleOf40 = () => {
      const f = fin ? neto : fcf;
      return deHistoria('rule_of_40', 'Rule of 40', 'pct', i => { const g = crecimiento(ing, 12)(i); const m = razonQ(f, ing)(i); return esNum(g) && esNum(m) ? g + m : (g === NS || m === NS ? NS : null); },
        'crecimiento de ingresos a/a + margen ' + (fin ? 'neto' : 'de flujo libre') + ' del trimestre');
    };
    const resolutores = {
      distancia_al_ath: distanciaAth, drawdown_maximo_desde_ath: drawdown, rango_52_semanas: rango52,
      ingresos_totales_a_a: () => deHistoria('ingresos_totales_a_a', 'Ingresos totales a/a', 'pct', crecimiento(ing, 12), 'ingresos del trimestre ÷ ingresos de hace un año − 1'),
      ingresos_totales_t_t: () => deHistoria('ingresos_totales_t_t', 'Ingresos totales t/t', 'pct', crecimiento(ing, 3), 'ingresos del trimestre ÷ ingresos del trimestre anterior − 1'),
      margen_bruto: () => { const m = mv('margenes'); return m && esNum(m.valor.bruto) ? base('margen_bruto', 'Margen bruto', { txt: fmt('pct', m.valor.bruto), num: m.valor.bruto, kind: 'pct', periodo: 'últimos 12 meses', tri: m.fecha, fuente: srcYahoo(m.fecha) }) : sinDatos('margen_bruto', 'Margen bruto'); },
      margen_operativo: () => deHistoria('margen_operativo', 'Margen operativo', 'pct', razonQ(opi, ing), 'resultado operativo ÷ ingresos del trimestre'),
      margen_neto: () => deHistoria('margen_neto', 'Margen neto', 'pct', razonQ(neto, ing), 'resultado neto ÷ ingresos del trimestre'),
      eps_gaap: () => deHistoria('eps_gaap', 'EPS GAAP diluido', 'usdps', col('eps_diluido'), null),
      fcf_utilidad_neta: () => deHistoria('fcf_utilidad_neta', 'FCF / utilidad neta', 'x', razonQ(fcf, neto), 'flujo libre ÷ resultado neto del trimestre (≈1 o más es sano)'),
      sbc_ingresos: () => deHistoria('sbc_ingresos', 'SBC % ingresos', 'pct', razonQ(sbc, ing), 'remuneración en acciones ÷ ingresos del trimestre'),
      fcf_neto_de_sbc: () => deHistoria('fcf_neto_de_sbc', 'FCF neto de SBC', 'usd', i => (esNum(fcf(i)) && esNum(sbc(i)) ? fcf(i) - sbc(i) : null), 'flujo libre − remuneración en acciones del trimestre'),
      d_a_vs_capex: () => deHistoria('d_a_vs_capex', 'D&A vs capex', 'x', razonQ(da, cap), 'depreciación y amortización ÷ inversión en activos (capex) del trimestre'),
      flujo_operativo: () => deHistoria('flujo_operativo', 'Flujo operativo', 'usd', cfo, null),
      fcf: () => deHistoria('fcf', 'FCF', 'usd', fcf, null),
      capex: () => deHistoria('capex', 'Capex', 'usd', cap, null),
      capex_vs_flujo_operativo: () => deHistoria('capex_vs_flujo_operativo', 'Capex vs flujo operativo', 'pct', razonQ(cap, cfo), 'capex ÷ flujo operativo del trimestre'),
      capex_ingresos: () => deHistoria('capex_ingresos', 'Capex / ingresos', 'pct', razonQ(cap, ing), 'capex ÷ ingresos del trimestre'),
      roe: () => deMercado('roe', 'ROE', 'pct', 'roe'),
      roic: () => sinDatos('roic', 'ROIC', { detalle: 'Falta el patrimonio y el pago de impuestos por trimestre en la fuente; no se estima.' }),
      roic_vs_wacc: () => (man && man.wacc && esNum(man.wacc.valor) ? sinDatos('roic_vs_wacc', 'ROIC vs WACC', { detalle: 'Hay WACC cargado, pero falta el ROIC.' }) : pendiente('roic_vs_wacc', 'ROIC vs WACC', 'Necesita el ROIC y tu WACC (lo cargás vos en radar-manual.json).')),
      margen_incremental: () => deHistoria('margen_incremental', 'Margen incremental', 'pct', i => {
        const j = haceMeses(i, 12); if (j < 0 || !esNum(opi(i)) || !esNum(opi(j)) || !esNum(ing(i)) || !esNum(ing(j))) return null;
        const dI = ing(i) - ing(j); return dI > 0 ? (opi(i) - opi(j)) / dI : NS;
      }, 'variación a/a del resultado operativo ÷ variación a/a de los ingresos'),
      apalancamiento_operativo_gastos_operativos_vs_ingresos: () => {
        const id = 'apalancamiento_operativo_gastos_operativos_vs_ingresos';
        const gastos = i => (esNum(ing(i)) && esNum(opi(i)) ? ing(i) - opi(i) : null);
        const it = deHistoria(id, 'Apalancamiento operativo (gastos operativos vs ingresos)', 'x', i => {
          const gi = crecimiento(ing, 12)(i), gg = crecimiento(gastos, 12)(i);
          if (!esNum(gi) || !esNum(gg)) return gi === NS || gg === NS ? NS : null;
          return gg > 0 && gi > 0 ? gi / gg : NS;
        }, 'crecimiento a/a de los ingresos ÷ crecimiento a/a de los gastos operativos (por encima de 1 = los gastos crecen menos que las ventas)');
        if (it.estado === 'ok') {
          const n = rows.length - 1;
          it.lineas = [{ k: 'Ingresos a/a', txt: fmt('pct', crecimiento(ing, 12)(n), { signo: true }) }, { k: 'Gastos operativos a/a', txt: fmt('pct', crecimiento(gastos, 12)(n), { signo: true }) }];
        }
        return it;
      },
      rotacion_de_activos: () => sinDatos('rotacion_de_activos', 'Rotación de activos', { detalle: 'Falta el total de activos por trimestre en la fuente.' }),
      ciclo_de_conversion_de_caja: () => sinDatos('ciclo_de_conversion_de_caja', 'Ciclo de conversión de caja', { detalle: 'Faltan inventarios, cuentas por cobrar y por pagar en la fuente.' }),
      deuda_neta: () => {
        const it = deHistoria('deuda_neta', 'Deuda neta', 'usd', deudaNeta, 'deuda total − caja e inversiones de corto plazo');
        if (it.estado === 'ok') { if (it.num < 0) it.detalle = 'Negativa = la empresa tiene más caja que deuda.'; return it; }
        const m = mv('deuda_neta'); return m ? base('deuda_neta', 'Deuda neta', { txt: fmt('usd', m.valor), num: m.valor, kind: 'usd', periodo: 'al ' + fc(m.fecha), tri: m.fecha, fuente: srcYahoo(m.fecha) }) : it;
      },
      deuda_neta_ebitda: () => deHistoria('deuda_neta_ebitda', 'Deuda neta / EBITDA', 'x', i => { const d = deudaNeta(i), e = ebitdaTtm(i); if (!esNum(d) || !esNum(e)) return null; return e > 0 ? d / e : NS; }, 'deuda neta ÷ EBITDA de los últimos 4 trimestres (resultado operativo + D&A)'),
      cobertura_de_intereses: () => sinDatos('cobertura_de_intereses', 'Cobertura de intereses', { detalle: 'La fuente no trae los intereses pagados por trimestre.' }),
      liquidez_caja_inversiones_de_corto_plazo: () => deHistoria('liquidez_caja_inversiones_de_corto_plazo', 'Liquidez (caja + inversiones de corto plazo)', 'usd', col('caja'), null),
      recompras: () => deHistoria('recompras', 'Recompras', 'usd', col('recompras'), null),
      dividendos: () => deHistoria('dividendos', 'Dividendos', 'usd', col('dividendos'), null),
      dilucion_variacion_a_a_de_acciones: () => deHistoria('dilucion_variacion_a_a_de_acciones', 'Dilución (variación a/a de acciones)', 'pct', crecimiento(col('acciones_diluidas'), 12), 'acciones diluidas del trimestre ÷ las de hace un año − 1 (negativo = la empresa recompra)'),
      p_e_ttm: peTtmGaap, p_e_vs_media_5_10_15_anos: peVsMedia, p_e_forward: () => peFwd('pe_forward', 'anio_actual', 'P/E forward', 'p_e_forward'),
      p_e_forward_vs_media_5_10_15_anos: peFwdVsMedia,
      ev_ebitda: () => deMercado('ev_ebitda', 'EV/EBITDA', 'x', 'ev_ebitda'), ev_ventas: () => deMercado('ev_ventas', 'EV/Ventas', 'x', 'ev_ventas'),
      p_fcf: () => { const f = mv('fcf'); const m = mv('p_fcf'); if (!m && f && esNum(f.valor) && f.valor <= 0) return noSig('p_fcf', 'P/FCF', 'El flujo libre de los últimos 12 meses es negativo.', { fuente: srcYahoo(f.fecha) }); return deMercado('p_fcf', 'P/FCF', 'x', 'p_fcf'); },
      peg: () => deMercado('peg', 'PEG', 'x', 'peg'),
      fcf_yield: () => deMercado('fcf_yield', 'FCF yield', 'pct', 'fcf_yield'),
      earnings_yield: () => deMercado('earnings_yield', 'Earnings yield', 'pct', 'earnings_yield'),
      valuacion_vs_pares: vsPares, rule_of_40: ruleOf40,
      sorpresa_vs_consenso_eps: sorpresaEps, revisiones_de_eps_30_90_dias: revisiones, precio_objetivo_promedio: precioObjetivo,
      distribucion_de_recomendaciones: recomendaciones, compras_y_ventas_de_insiders: insiders, variacion_de_tenencia_institucional: institucional, short_interest: shortInterest,
    };
    // Filas extra que cuelgan de un KPI de la lista (variantes del mismo número, siempre con el rótulo explícito).
    const extras = {
      eps_gaap: () => [deHistoria('eps_gaap_basico', 'EPS GAAP básico', 'usdps', col('eps_basico'), null)],
      eps_ajustado: () => [],
      p_e_ttm: () => [peTtmAjustado()],
      p_e_forward: () => [peFwd('pe_forward_siguiente', 'anio_proximo', 'P/E forward', 'p_e_forward_siguiente')],
    };
    // eps_ajustado y brecha: del comunicado; la brecha se calcula si hay EPS ajustado.
    function brecha(cfg) {
      const ya = deComunicado(cfg.id, cfg.nombre, cfg.unidad);
      if (ya.estado === 'ok') return ya;
      const aj = ultQ && ultQ.kpis.eps_ajustado; const g = rows.length ? rows[rows.length - 1].eps_diluido : null;
      if (aj && esNum(aj.valor) && esNum(g)) return base(cfg.id, cfg.nombre, { txt: fmt('usdps', aj.valor - g, { signo: true }), num: aj.valor - g, kind: 'usdps', periodo: claveQ(ultQ.clave), tri: ultQ.fin, fuente: srcCalc('EPS ajustado − EPS GAAP diluido', srcFila(rows[rows.length - 1])) });
      return ya;
    }

    // ── Armado ──
    const generales = (config.kpis_generales || []).filter(k => !k.aplica_a || k.aplica_a.includes(T));
    const idsGen = new Set(generales.map(k => k.id));
    const secciones = [];
    const lista = (config.kpis_generales && SECCIONES.map(s => s[0])) || [];
    const seccionesConfig = [...new Set([...lista, ...generales.map(k => k.seccion)])];
    for (const sid of seccionesConfig) {
      const nombreSec = (SECCIONES.find(s => s[0] === sid) || [sid, sid.replace(/_/g, ' ')])[1];
      const items = [];
      for (const cfg of generales.filter(k => k.seccion === sid)) {
        if (fin && NO_APLICA_FIN.has(cfg.id)) { items.push(noAplica(cfg.id, cfg.nombre)); continue; }
        let it;
        if (cfg.id === 'brecha_eps_gaap_vs_ajustado_y_extraordinarios_recurrentes') it = brecha(cfg);
        else if (resolutores[cfg.id]) it = resolutores[cfg.id]();
        else if (cfg.fuente === 'comunicado') it = deComunicado(cfg.id, cfg.nombre, cfg.unidad);
        else it = sinDatos(cfg.id, cfg.nombre);
        items.push(it);
        if (extras[cfg.id]) for (const x of extras[cfg.id]()) items.push(x);
      }
      if (items.length) secciones.push({ id: sid, nombre: nombreSec, items });
    }
    const especificos = (emp.kpis_especificos || []).filter(k => !idsGen.has(k.id)).map(k => deComunicado(k.id, k.nombre, k.unidad, k.notas));

    const estado = {
      mercadoFecha: M ? (M.generado || null) : null,
      mercadoStale: M && M.stale_since ? M.stale_since : null,
      mercadoError: M && M.ultimo_error ? M.ultimo_error : null,
      comunicado: ultQ ? { clave: ultQ.clave, rotulo: claveQ(ultQ.clave), fin: ultQ.fin } : null,
      historiaHasta: rows.length ? rows[rows.length - 1].fin : null,
      precio: mv('precio') ? { valor: mv('precio').valor, fecha: mv('precio').fecha } : null,
    };
    return { ticker: T, nombre: emp.nombre, secciones, especificos, estado, avisoMargenes: !!emp.aviso_margenes };
  }

  // ════════════════════════════════════════════════════════════════════
  // Gráfico "Crecimiento vs Valuación": X = P/E forward (EPS del año fiscal en curso), Y = CAGR esperado del EPS a 2 años (consenso).
  // El job calcula el CAGR desde el último año fiscal informado. Si ese año base está distorsionado (el EPS cae un tramo y rebota, o sube
  // un tramo y cae) el CAGR engaña: con la base inflada se usa el crecimiento del año siguiente vs el actual; con un salto en el año
  // del medio se deja el CAGR a 2 años (que lo atenúa) y se marca el punto con una nota. Nunca se oculta el aviso.
  // ════════════════════════════════════════════════════════════════════
  function puntoCrecimiento(mercado, emp) {
    const T = emp.ticker;
    const sin = motivo => ({ ticker: T, nombre: emp.nombre, ok: false, motivo, aviso: !!emp.aviso_margenes });
    if (!mercado || typeof mercado !== 'object') return sin('sin datos de mercado todavía');
    const pf = mercado.pe_forward && mercado.pe_forward.valor;
    const est = mercado.estimaciones && mercado.estimaciones.valor;
    const actual = est && est.anio_actual && est.anio_actual.eps && est.anio_actual.eps.promedio;
    const sig = est && est.anio_proximo && est.anio_proximo.eps && est.anio_proximo.eps.promedio;
    if (!esNum(pf) || (esNum(actual) && actual <= 0)) return sin('P/E forward no significativo (EPS esperado ≤ 0)');
    const c2 = mercado.eps_cagr_2a && mercado.eps_cagr_2a.valor;
    const baseEps = mercado.eps_cagr_2a && mercado.eps_cagr_2a.eps_base;
    const s1 = esNum(actual) && esNum(baseEps) && baseEps > 0 ? actual / baseEps - 1 : null;
    const s2 = esNum(sig) && esNum(actual) && actual > 0 ? sig / actual - 1 : null;
    let y = null, nota = '', modo = '2a';
    if (s1 != null && s2 != null && s1 <= -0.1 && s2 >= 0.1) { y = s2; modo = '1a'; nota = 'El EPS del último año informado (' + dec(baseEps, 2) + ') es más alto que el esperado para este año (' + dec(actual, 2) + '): el CAGR a 2 años quedaría distorsionado. Se usa el crecimiento del año siguiente vs el actual.'; }
    else if (esNum(c2)) {
      y = c2;
      if (s1 != null && s2 != null && s1 >= 0.1 && s2 <= -0.1) nota = 'El EPS de este año (' + dec(actual, 2) + ') salta por encima del de los años vecinos (' + dec(baseEps, 2) + ' y ' + dec(sig, 2) + '): puede incluir resultados extraordinarios. El CAGR a 2 años lo atenúa, pero tomalo con cuidado.';
    } else if (s2 != null) { y = s2; modo = '1a'; nota = 'No hay CAGR a 2 años: se usa el crecimiento del año siguiente vs el actual.'; }
    if (!esNum(y)) return sin('sin estimaciones de EPS a 2 años');
    return { ticker: T, nombre: emp.nombre, ok: true, x: pf, y, modo, nota, aviso: !!emp.aviso_margenes, fecha: (mercado.pe_forward && mercado.pe_forward.fecha) || mercado.generado || null };
  }

  // Reportes de números mal: los que corresponden a un ítem (mismo ticker, kpi_id recortado y período). Más viejo primero.
  function reportesDe(lista, ticker, item) {
    if (!Array.isArray(lista) || !item || !item.tri) return [];
    return lista.filter(r => r && r.ticker === ticker && r.kpi_id === item.rid && r.trimestre === item.tri).sort((a, b) => String(a.reportado_en).localeCompare(String(b.reportado_en)));
  }

  const API = { vista, puntoCrecimiento, reportesDe, fmt, norm, variacion, monograma, urlSegura, claveQ, fc, dm, mesAnio, trimestresDe, rid, SECCIONES, NO_APLICA_FIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.RadarVista = API;
})(typeof window !== 'undefined' ? window : globalThis);
