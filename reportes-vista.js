'use strict';
// ════════════════════════════════════════════════════════════════════════
// REPORTES — VISTA (Etapa B, T2b de specs/principios-y-revisiones.md). Solo lectura de `S` y render.
// Todo el cálculo vive en reportes.js (window.CMReportes): acá solo se arma `datos` desde `S` y se dibuja.
// Dos piezas: la sub-pestaña "Revisiones" de la ventana de Principios (selector de período + cuentas líquidas)
// y la ventana de pantalla completa del reporte (páginas deslizables con scroll-snap).
// Único dato propio: S.reportes.config.cuentasLiquidas (ids de cuentas en pesos que cuentan como líquidas).
// ════════════════════════════════════════════════════════════════════════

const RV_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const RV_MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const RV_DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const RV_PERIODOS = [['semanal', 'Semanal'], ['mensual', 'Mensual'], ['trimestral', 'Trimestral'], ['semestral', 'Semestral'], ['anual', 'Anual']];
const RV_SECCIONES = [['vida', 'Vida', 'Vida'], ['salud', 'Salud', 'Salud'], ['conocimiento', 'Conocimiento', 'Conocimiento'], ['finanzas', 'Economía', 'Economía'], ['ia', 'IA', 'IA']];   // [clave de S.habitTrackers, nombre, sección de Principios]
const RV_ESTADOS = { d: 'Hecho', p: 'Parcial (vale medio punto)', m: 'No hecho', r: 'Descanso', n: 'Sin dato' };

const _rvEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _rvN = (n, d) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: d == null ? 0 : d });
const _rvMoney = n => (n < 0 ? '−' : '') + '$ ' + _rvN(Math.abs(n));
const _rvPct = n => _rvN(n, 1) + '%';
const _rvCant = n => _rvN(n, 0);
const _rvPts = n => _rvN(n, 1) + ' pts';
const _rvHoras = n => _rvN(n, 1) + ' h';
const _rvDec = n => _rvN(n, 2);
const _rvMeses = n => _rvN(n, 1) + ' meses';
const _rvCap = s => { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
function _rvFechaLarga(ds) { const d = CMReportes.repParse(ds); return RV_DIAS[(d.getDay() + 6) % 7] + ' ' + d.getDate() + ' ' + RV_MES3[d.getMonth()] + ' ' + d.getFullYear(); }
function _rvFechaCorta(ds) { const d = CMReportes.repParse(ds); return d.getDate() + ' ' + RV_MES3[d.getMonth()]; }
function _rvMesAnio(mk) { const [y, m] = mk.split('-').map(Number); return RV_MESES[m - 1] + ' ' + y; }
// Un motivo nunca muestra claves técnicas ('2026-09' → 'septiembre 2026') y arranca con mayúscula.
function _rvMotivo(s) { return _rvCap(String(s || '').replace(/\b(\d{4}-(?:0[1-9]|1[0-2]))\b/g, m => _rvMesAnio(m))); }

function _rvEtiqueta(periodo, clave) {
  const r = CMReportes.repRango(periodo, clave); if (!r) return clave;
  if (periodo === 'semanal') return 'Semana ' + Number(clave.slice(-2)) + ' · ' + _rvFechaCorta(r.desde) + ' al ' + _rvFechaCorta(r.hasta) + ' ' + r.hasta.slice(0, 4);
  if (periodo === 'mensual') return _rvCap(_rvMesAnio(clave));
  if (periodo === 'trimestral') return clave.slice(-1) + '.º trimestre ' + clave.slice(0, 4);
  if (periodo === 'semestral') return clave.slice(-1) + '.º semestre ' + clave.slice(0, 4);
  return clave;
}
const _rvHoy = () => CMReportes.repFecha(new Date());

// ── Datos: se arman desde S siguiendo el contrato documentado en reportes.js ──
function _rvHabitosEstudio() {   // mismo criterio que app.js: el hábito migrado manda; studyCalendar es el respaldo
  const h = ((S.habitTrackers && S.habitTrackers.conocimiento) || []).find(x => x.id === 'habit-estudio');
  return (h && h.days) || (S.studyCalendar && S.studyCalendar.days) || {};
}
function _rvDatos(rango, rangoAnt, hoy) {
  const meses = {};
  [rango, rangoAnt].forEach(r => { if (r) CMReportes.repMeses(r).forEach(m => { meses[m] = 1; }); });
  const fondosMes = {};
  if (typeof _pfBudgetTotal === 'function') Object.keys(meses).forEach(m => { const v = _pfBudgetTotal(m); if (v) fondosMes[m] = v; });
  return {
    hoy, cuentas: S.accounts || [], nwHistory: S.nwHistory || [], accountHistory: S.accountHistory || [], transactions: S.transactions || [],
    carteraTx: S.carteraTx || [], budgets: S.budgets || {}, fondosMes, creditoUsado: typeof calcCreditUsed === 'function' ? calcCreditUsed() : null,
    config: (S.reportes && S.reportes.config) || {}, cardCharges: S.cardCharges || [],
    cards: (S.cards || []).map(k => ({ id: k.id, resetAt: k.resetAt, resetDay: k.resetDay })),
    lawProgress: S.lawProgress, finales: (S.sgc && S.sgc.finales) || [], pomodoroHistory: S.pomodoroHistory || [], studyDays: _rvHabitosEstudio(),
    foco: S.foco, sleepLog: S.sleepLog || {}, workoutLog: S.workoutLog || {}, dietaLog: (S.dieta && S.dieta.log) || {},
    dietaMet: (typeof dietaDayMet === 'function' && S.dieta && Array.isArray(S.dieta.reglas)) ? dietaDayMet : null,
  };
}

// ── Comparaciones y fichas ──
const _rvClaseTono = { verde: 'rv-ok', azul: 'rv-eq', rojo: 'rv-bad' };
// Siempre signo y número (el color nunca es la única señal). Con pct null (o conPct falso) solo el absoluto; sin cambio: "= 0" (empate, en azul).
function _rvChip(comp, valor, fmt, conPct) {
  if (!comp || comp.abs == null) return '';
  let t;
  if (comp.abs === 0) t = '= ' + fmt(0);
  else t = (comp.abs > 0 ? '+' : '−') + fmt(Math.abs(comp.abs)) + (conPct !== false && comp.pct != null ? ' · ' + (comp.pct > 0 ? '+' : comp.pct < 0 ? '−' : '') + Math.abs(comp.pct) + '%' : '');
  return '<span class="rv-chip ' + (_rvClaseTono[comp.tono] || 'rv-eq') + '">' + _rvEsc(t) + '</span>';
}

// k = KPI de reportes.js ({valor, comparacion?, anterior?, motivo?, aviso?...}). subs = líneas chicas debajo.
function _rvFicha(titulo, k, fmt, o) {
  o = o || {};
  if (!k) return '';
  const nulo = k.valor == null;
  let h = '<div class="rv-ficha"><div class="rv-fl">' + _rvEsc(titulo) + '</div>';
  h += '<div class="rv-fv' + (nulo ? ' rv-nulo' : '') + '">' + (nulo ? '—' : _rvEsc(fmt(k.valor)) + (o.unidad ? ' <small>' + _rvEsc(o.unidad) + '</small>' : '')) + '</div>';
  if (!nulo) {
    const comp = k.comparacion || (k.anterior != null && o.comparar !== false ? CMReportes.repComparar(k.valor, k.anterior, o.opts) : null);
    if (comp) h += '<div class="rv-fc">' + _rvChip(comp, k.valor, o.fmtAbs || fmt, o.conPct) + '</div>';
    else if (k.anterior === null) h += '<div class="rv-fm">' + _rvEsc(k.motivoAnterior ? 'Período anterior: ' + _rvMotivo(k.motivoAnterior).toLowerCase() : 'Sin dato del período anterior') + '</div>';
  }
  (o.subs || []).forEach(s => { if (s) h += '<div class="rv-fs">' + _rvEsc(s) + '</div>'; });
  if (nulo && k.motivo) h += '<div class="rv-fm">' + _rvEsc(_rvMotivo(k.motivo)) + '</div>';
  else if (!nulo && k.motivo && o.motivo !== false) h += '<div class="rv-fm">' + _rvEsc(_rvMotivo(k.motivo)) + '</div>';
  const av = (k.comparacion && k.comparacion.aviso) || k.aviso || o.aviso;
  if (av) h += '<div class="rv-fa">' + _rvEsc(_rvMotivo(av)) + '</div>';
  return h + '</div>';
}
const _rvFichas = arr => '<div class="rv-fichas">' + arr.join('') + '</div>';
const _rvCard = (titulo, cuerpo, extra) => '<div class="rv-card"><div class="rv-ct">' + _rvEsc(titulo) + (extra || '') + '</div>' + cuerpo + '</div>';

// ── Calendarios ──
const _rvEstadoDe = v => v === 'done' || v === 'studied' ? 'd' : v === 'partial' ? 'p' : v === 'missed' ? 'm' : v === 'rest' ? 'r' : 'n';
const _rvCelda = (days, ds) => { const e = _rvEstadoDe((days || {})[ds]); return '<i class="rv-c rv-' + e + '" role="img" aria-label="' + _rvEsc(_rvFechaLarga(ds) + ' — ' + RV_ESTADOS[e]) + '" data-d="' + ds + '" data-s="' + e + '"></i>'; };
function _rvMiniMes(days, mk, compacto, solo) {
  const [y, m] = mk.split('-').map(Number), n = new Date(y, m, 0).getDate(), off = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  let h = '<div class="rv-mm' + (compacto ? ' rv-mm-c' : '') + (solo ? ' rv-mm-solo' : '') + '"><div class="rv-mml">' + _rvEsc(compacto ? RV_MES3[m - 1] : _rvCap(RV_MESES[m - 1]) + ' ' + y) + '</div>';
  if (!compacto) h += '<div class="rv-mg rv-mgh">' + RV_DIAS.map(d => '<span>' + d.charAt(0).toUpperCase() + '</span>').join('') + '</div>';
  h += '<div class="rv-mg">';
  for (let i = 0; i < off; i++) h += '<b class="rv-c0"></b>';
  for (let d = 1; d <= n; d++) h += _rvCelda(days, mk + '-' + String(d).padStart(2, '0'));
  return h + '</div></div>';
}
function _rvSemana(days, rango) {
  let h = '<div class="rv-sem">';
  for (let ds = rango.desde, i = 0; ds <= rango.hasta; ds = CMReportes.repSumarDias(ds, 1), i++)
    h += '<div class="rv-sd"><span>' + RV_DIAS[i % 7].charAt(0).toUpperCase() + '</span>' + _rvCelda(days, ds) + '</div>';
  return h + '</div>';
}
function _rvLeyenda() {
  return '<div class="rv-ley">' + ['d', 'p', 'm', 'r', 'n'].map(s => '<span><i class="rv-c rv-' + s + '"></i>' + _rvEsc(RV_ESTADOS[s].replace(' (vale medio punto)', '')) + '</span>').join('') + '</div>';
}

// Un hábito: nombre, puntaje del período (hecho + medio punto por parcial), comparación y sus calendarios.
function _rvHabito(h, tr, ctx) {
  const days = (tr && tr.days) || {};
  const per = ctx.periodo, meses = CMReportes.repMeses(ctx.rango);
  let cal;
  if (per === 'semanal') cal = _rvSemana(days, ctx.rango);
  else if (per === 'anual') cal = '<div class="rv-mms rv-mms-12">' + meses.map(m => _rvMiniMes(days, m, true)).join('') + '</div>';
  else cal = '<div class="rv-mms" style="--n:' + (per === 'mensual' ? 1 : 3) + '">' + meses.map(m => _rvMiniMes(days, m, per !== 'mensual', per === 'mensual')).join('') + '</div>';
  return '<div class="rv-hab"><div class="rv-hh"><span class="rv-hn">' + _rvEsc((tr && tr.emoji ? tr.emoji + ' ' : '') + h.nombre) + '</span>'
    + '<span class="rv-hp"><b>' + _rvN(h.puntos, 1) + '</b> pts' + (h.partial ? ' <small>(' + h.done + ' + ' + h.partial + ' parc.)</small>' : '') + '</span>'
    + _rvChip(h.comparacion, h.puntos, v => _rvN(v, 1), true) + '</div>' + cal + '</div>';
}
function _rvHabitosDe(tab, ctx, conTitulo) {
  const lista = ctx.habitos.filter(h => h.seccion === tab);
  if (!lista.length) return conTitulo ? '' : '<div class="rv-card"><div class="rv-vacio">No hay hábitos en esta sección.</div></div>';
  const trk = (S.habitTrackers && S.habitTrackers[tab]) || [];
  return lista.map(h => _rvHabito(h, trk.find(x => x.id === h.id), ctx)).join('');
}

// ── Objetivos por categoría ──
function _rvObjetivos(tab, sec, ctx) {
  const o = ctx.obj, oa = ctx.objAnt, ma = ctx.metas[tab], mb = ctx.metasAnt[tab];
  const cats = ctx.categorias.filter(c => c.seccion === sec);
  const enCurso = ctx.parcial;   // período en curso: lo atribuido por mes/trimestre completo no tiene contraparte en el anterior recortado
  const fila = (nombre, a, b, sinComp) => '<div class="rv-row"><span>' + _rvEsc(nombre) + '</span><span class="rv-rn">' + a + '</span>' + (sinComp ? '<span class="rv-fm">En curso: sin comparar</span>' : _rvChip(CMReportes.repComparar(a, b), a, _rvCant, false)) + '</div>';
  const porTrim = k => enCurso && (o.porCategoria[k] || 0) !== ((ctx.objFecha.porCategoria[k]) || 0);   // hay cumplidos atribuidos solo por su trimestre completo
  let h = cats.map(c => fila(c.nombre, o.porCategoria[c.id] || 0, oa.porCategoria[c.id] || 0, porTrim(c.id))).join('');
  const sinA = (o.porCategoria['sin:' + sec] || 0) + (ma.porCategoria['sin:' + tab] || 0), sinB = (oa.porCategoria['sin:' + sec] || 0) + (mb.porCategoria['sin:' + tab] || 0);
  h += fila('Sin categoría (incluye metas mensuales)', sinA, sinB, enCurso && (ma.porCategoria['sin:' + tab] || porTrim('sin:' + sec)));
  if (tab === 'vida' && ((o.porCategoria['sin:'] || 0) || (oa.porCategoria['sin:'] || 0))) h += fila('Sin sección', o.porCategoria['sin:'] || 0, oa.porCategoria['sin:'] || 0, porTrim('sin:'));
  const sf = o.sinFecha.filter(x => tab === 'vida' && !x.seccion ? true : x.seccion === sec);
  if (sf.length) h += '<div class="rv-aparte"><div class="rv-fl">Cumplidos sin fecha (no se comparan)</div>' + sf.map(x => '<div class="rv-fs">· ' + _rvEsc(x.texto) + '</div>').join('') + '</div>';
  if (ma.noAtribuibles) h += '<div class="rv-fm">' + ma.noAtribuibles + ' meta' + (ma.noAtribuibles === 1 ? '' : 's') + ' mensual' + (ma.noAtribuibles === 1 ? '' : 'es') + ' cumplida' + (ma.noAtribuibles === 1 ? '' : 's') + ' de un mes que el período no abarca entero: no se pueden ubicar y quedan afuera.</div>';
  return _rvCard('Objetivos cumplidos', h);
}

// ── KPIs por sección ──
function _rvCat(k) {
  const c = (typeof TXN_CATEGORIES !== 'undefined') ? TXN_CATEGORIES[k] : null;
  return c ? (c.icon ? c.icon + ' ' : '') + c.label : (k === 'other' ? 'Otros' : _rvCap(k));
}
function _rvGastosCat(g, top, titulo) {
  if (!g || !g.porCategoria || !g.porCategoria.length) return '';
  return _rvCard(titulo || 'Gastos por categoría', g.porCategoria.slice(0, top || g.porCategoria.length).map(c => '<div class="rv-row"><span>' + _rvEsc(_rvCat(c.categoria)) + '</span><span class="rv-rn">' + _rvEsc(_rvMoney(c.valor)) + '</span>' + _rvChip(c.comparacion, c.valor, _rvMoney, true) + '</div>').join(''));
}
function _rvKpisEconomia(e, soloGastos) {
  const m = _rvMoney, f = _rvFicha;
  const g = e.gastos, inv = e.inversiones, pa = e.patrimonio, pre = e.presupuesto, ut = e.utilidad, pas = e.pasivoMenosLiquidos;
  const gSubs = [];
  if (g.cuotasTarjetaDia1) gSubs.push('Cuotas de tarjeta del día 1 (aparte): ' + m(g.cuotasTarjetaDia1.valor));
  const fGastos = f('Gastos', g, m, { opts: { menosEsMejor: true }, subs: gSubs, aviso: g.aviso });
  const fUt = f('Gasto inútil (del clasificado)', ut, _rvPct, { conPct: false, fmtAbs: _rvPts, subs: ut.valor == null ? [] : ['Útiles: ' + m(ut.utiles), 'Inútiles: ' + m(ut.inutiles), 'Clasificado: ' + ut.pctClasificado + '% del gasto'] });
  const fAhorro = f('Tasa de ahorro', e.tasaAhorro, _rvPct, { conPct: false, fmtAbs: _rvPts, subs: e.tasaAhorro.valor == null ? [] : ['Ingresos: ' + m(e.tasaAhorro.ingresos), 'Gastos: ' + m(e.tasaAhorro.gastos)] });
  if (soloGastos) return _rvFichas([fGastos, fUt, fAhorro]) + _rvGastosCat(g);
  const pSubs = pa.valor == null ? [] : ['De ' + m(pa.inicio) + ' a ' + m(pa.fin), 'Explicado por ingresos y gastos: ' + m(pa.explicado), 'Resto sin atribuir: ' + m(pa.resto)];
  const iSubs = [];
  if (inv.pct != null) iSubs.push('Rendimiento de lo vendido: ' + _rvPct(inv.pct));
  if (inv.aciertos && !(inv.aciertos.valor == null && inv.aciertos.motivo === inv.motivo)) iSubs.push(inv.aciertos.valor == null ? 'Aciertos: ' + _rvMotivo(inv.aciertos.motivo).toLowerCase() : 'Aciertos: ' + inv.aciertos.valor + '% (' + inv.aciertos.ganadoras + ' de ' + inv.aciertos.operaciones + ' operaciones cerradas)');
  if (inv.montoInvertido && inv.montoInvertido.valor != null) iSubs.push('Capital invertido: ' + m(inv.montoInvertido.valor) + ' (aportado, no valor de mercado)');
  if (inv.noRealizada && inv.noRealizada.motivo) iSubs.push(_rvMotivo(inv.noRealizada.motivo));
  const preSubs = pre.valor == null ? [] : ['Gastado ' + m(pre.gastado) + ' de ' + m(pre.presupuestado)].concat((pre.excedidas || []).map(x => 'Se pasó: ' + _rvCat(x.categoria) + ' (' + m(x.gastado) + ' de ' + m(x.presupuesto) + ')'));
  const fichas = [
    f('Patrimonio (variación)', pa, m, { subs: pSubs, motivo: false }),
    f('Ganancia de inversiones vendidas', inv, m, { subs: iSubs, motivo: false }),
    fGastos,
    f('Presupuesto usado', pre, _rvPct, { opts: { menosEsMejor: true }, conPct: false, fmtAbs: _rvPts, subs: preSubs }),
    fUt,
    f('Activos líquidos', e.activosLiquidos, m),
    f('Deudas de tarjeta menos líquidos', pas, m, { subs: pas.valor == null ? [] : ['Deudas de tarjeta: ' + m(pas.pasivo), 'Líquidos: ' + m(pas.liquidos)] }),
    fAhorro,
    f('Meses de cobertura', e.cobertura, _rvMeses, { fmtAbs: _rvMeses, subs: e.cobertura.valor == null ? [] : ['Líquidos: ' + m(e.cobertura.liquidos), 'Gasto mensual promedio: ' + m(e.cobertura.gastoPromedio)] }),
  ];
  return _rvFichas(fichas) + _rvGastosCat(g);
}
function _rvKpisConocimiento(c) {
  const f = _rvFicha;
  const ex = c.examenes, pm = Object.keys(ex.porMes || {}).sort();
  const exK = { valor: ex.valor, aviso: ex.aviso };   // reportes.js lo da solo como contexto: dato + aviso, sin tono
  const fichas = [
    f('Exámenes del período', exK, _rvCant, { comparar: false, subs: pm.map(k => _rvCap(_rvMesAnio(k)) + ': ' + ex.porMes[k]) }),
    f('Materias finalizadas', c.materiasFinalizadas, _rvCant),
    f('Horas de estudio', c.horasEstudio, v => _rvN(v, 1), { unidad: 'h cronometradas', fmtAbs: _rvHoras }),
    f('Sesiones Pomodoro', c.sesionesPomodoro, _rvCant),
    f('Finales aprobados', c.finalesAprobados, _rvCant),
    f('Promedio de notas del período', c.promedioPeriodo, _rvDec),
    f('Promedio de la carrera', c.promedioCarrera, _rvDec),
    f('Racha máxima de estudio', c.rachaEstudio, _rvCant, { unidad: 'días' }),
    f('Avance de la carrera', c.avanceCarrera, _rvPct, { conPct: false, fmtAbs: _rvPts }),
  ];
  if (c.horasPorExamen) fichas.push(f('Horas por examen', c.horasPorExamen, _rvHoras, { unidad: 'cronometradas' }));
  return _rvFichas(fichas);
}
function _rvKpisFoco(fo, eco) {
  const f = _rvFicha;
  const par = (t, k) => f(t, k, v => _rvN(v, 1) + ' / 5', { subs: k.valor == null ? [] : [k.dias + ' día' + (k.dias === 1 ? '' : 's') + ' con cierre'] });
  let h = _rvFichas([par('Atención promedio', fo.atencion), par('Energía promedio', fo.energia),
    f('Tiempo de pantalla', fo.pantalla, _rvHoras, { unidad: 'por semana', subs: fo.pantalla.valor == null ? [] : [fo.pantalla.semanas + ' semana' + (fo.pantalla.semanas === 1 ? '' : 's') + ' completa' + (fo.pantalla.semanas === 1 ? '' : 's')], motivo: false })]);
  const ch = fo.chequeos;
  h += _rvCard('¿Dónde estuvo el tiempo? (chequeos)', ch.valor == null ? '<div class="rv-fm">' + _rvEsc(_rvMotivo(ch.motivo)) + '</div>'
    : ch.filas.map(x => '<div class="rv-row"><span>' + _rvEsc(_rvCap(x.categoria)) + '</span><span class="rv-rn">' + x.pct + '% <small>(' + x.n + ')</small></span></div>').join('') + '<div class="rv-fm">' + _rvEsc(_rvMotivo(ch.motivo)) + '</div>');
  if (fo.cruces && fo.cruces.length) h += _rvCard('Cruce con sueño, entrenamiento y comida', fo.cruces.map(c => '<div class="rv-cruce"><b>' + _rvEsc(c.titulo) + '</b><div class="rv-fs">' + _rvEsc(c.texto) + '</div></div>').join(''));
  h += _rvGastosCat(eco && eco.gastos, 5, 'Dónde fue el dinero');   // top 5 de lo que ya devuelve repKpiEconomia para este rango
  return h;
}

// ── Armado del reporte ──
function _rvPagina(titulo, cuerpo) { return { titulo, html: '<h3 class="rv-pt">' + _rvEsc(titulo) + '</h3>' + cuerpo }; }
function _rvPlaceholder(t) { return _rvPagina(t, '<div class="rv-card"><div class="rv-vacio">Se completa en la próxima versión.</div></div>'); }

function _rvConstruir(periodo, clave) {
  const R = CMReportes, hoy = _rvHoy();
  const rango = R.repRango(periodo, clave), ant = R.repRango(periodo, R.repAnterior(periodo, clave));
  const comp = R.repRangoComparable(rango, ant, hoy);
  const trackers = S.habitTrackers && !Array.isArray(S.habitTrackers) ? S.habitTrackers : {};
  const vista = typeof _prVista === 'function' ? _prVista() : [];
  const metas = {}, metasAnt = {};
  RV_SECCIONES.forEach(s => { const mg = { [s[0]]: (S.monthlyGoals || {})[s[0]] || {} }; metas[s[0]] = R.repMetasMensuales(mg, rango); metasAnt[s[0]] = R.repMetasMensuales(mg, comp); });
  const datos = _rvDatos(rango, comp, hoy);
  const ctx = {
    periodo, rango, comp, habitos: R.repHabitosComparados(trackers, rango, comp), obj: R.repObjetivosPorCategoria(vista, rango), objAnt: R.repObjetivosPorCategoria(vista, comp),
    metas, metasAnt, parcial: R.repParcial(rango, hoy), objFecha: R.repObjetivosPorCategoria(vista.filter(o => o.cumplidoEl), rango), categorias: (typeof _prData === 'function' ? _prData().categorias : []),
  };
  const foco = R.repFoco(datos, rango, { foArmarCruces: typeof foArmarCruces === 'function' ? foArmarCruces : null });
  const eco = R.repKpiEconomia(datos, rango, comp);
  const paginas = [_rvPagina('Foco', _rvKpisFoco(foco, eco))];
  if (periodo === 'semanal') {
    paginas.push(_rvPagina('Hábitos', _rvLeyenda() + RV_SECCIONES.map(s => { const h = _rvHabitosDe(s[0], ctx, true); return h ? '<div class="rv-sec">' + _rvEsc(s[1]) + '</div>' + h : ''; }).join('')));
    paginas.push(_rvPagina('Gastos', _rvKpisEconomia(eco, true)));
    paginas.push(_rvPlaceholder('Textos de la semana'));
  } else {
    const kpis = { conocimiento: () => _rvKpisConocimiento(R.repKpiConocimiento(datos, rango, comp)), finanzas: () => _rvKpisEconomia(eco, false) };
    RV_SECCIONES.forEach(s => {
      paginas.push(_rvPagina(s[1], (ctx.habitos.some(h => h.seccion === s[0]) ? _rvLeyenda() : '') + _rvHabitosDe(s[0], ctx, false) + _rvObjetivos(s[0], s[2], ctx) + (kpis[s[0]] ? kpis[s[0]]() : '')));
    });
    paginas.push(_rvPlaceholder('Aprendizajes'), _rvPlaceholder('Agradecimientos'));
  }
  return { periodo, clave, rango, comp, parcial: R.repParcial(rango, hoy), paginas, antClave: R.repAnterior(periodo, clave) };
}

// ── Ventana del reporte ──
function _rvTip(el, ev) {
  const root = document.getElementById('ov-reporte'); if (!root) return;
  let tip = document.getElementById('rv-tip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'rv-tip'; tip.className = 'rv-tip'; root.appendChild(tip); }
  tip.textContent = _rvFechaLarga(el.dataset.d) + ' — ' + RV_ESTADOS[el.dataset.s];
  tip.classList.add('on');
  const r = el.getBoundingClientRect(), w = tip.offsetWidth;
  tip.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + 'px';
  tip.style.top = Math.max(6, r.top - tip.offsetHeight - 6) + 'px';
  clearTimeout(_rvTip._t); _rvTip._t = setTimeout(() => tip.classList.remove('on'), ev === 'click' ? 2500 : 4000);
}
function _rvBind(body) {
  const sc = body.querySelector('.rv-pages'); if (!sc) return;
  const dots = body.querySelectorAll('.rv-dot'), lab = body.querySelector('.rv-plabel');
  const ir = i => sc.scrollTo({ left: i * sc.clientWidth, behavior: 'smooth' });
  let raf = 0;
  sc.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const i = Math.min(dots.length - 1, Math.max(0, Math.round(sc.scrollLeft / sc.clientWidth)));
      body._rvI = i;
      dots.forEach((d, j) => { d.classList.toggle('on', j === i); d.setAttribute('aria-current', j === i ? 'true' : 'false'); });
      if (lab) lab.textContent = dots[i].getAttribute('aria-label') + ' · ' + (i + 1) + ' de ' + dots.length;
    });
  }, { passive: true });
  dots.forEach((d, i) => d.addEventListener('click', () => ir(i)));
  body._rvIr = ir; body._rvN = dots.length; body._rvI = 0;
}

function _rvVer(periodo, clave) {
  if (typeof CMOverlay === 'undefined' || typeof CMReportes === 'undefined') return;
  const rep = _rvConstruir(periodo, clave);
  const { overlay, body } = CMOverlay.build({ id: 'ov-reporte', accent: '#6B8EFF' });
  body.innerHTML = '<div class="cm-ov-head rv-head"><div class="cm-ov-eyebrow">REVISIONES · REPORTE</div><div class="cm-ov-title">' + _rvEsc(RV_PERIODOS.find(p => p[0] === periodo)[1] + ' · ' + _rvEtiqueta(periodo, clave)) + '</div>'
    + '<div class="rv-sub">' + _rvEsc(_rvFechaCorta(rep.rango.desde) + ' – ' + _rvFechaCorta(rep.rango.hasta) + ' ' + rep.rango.hasta.slice(0, 4) + ' · se compara con ' + _rvEtiqueta(periodo, rep.antClave)) + '</div>'
    + (rep.parcial ? '<div class="rv-banner">Período en curso: se compara contra los mismos días del anterior</div>' : '') + '</div>'
    + '<div class="rv-pages">' + rep.paginas.map(p => '<section class="rv-page" aria-label="' + _rvEsc(p.titulo) + '">' + p.html + '</section>').join('') + '</div>'
    + '<div class="rv-nav"><div class="rv-dots">' + rep.paginas.map((p, i) => '<button type="button" class="rv-dot' + (i ? '' : ' on') + '"' + (i ? '' : ' aria-current="true"') + ' aria-label="' + _rvEsc(p.titulo) + '"><i></i></button>').join('') + '</div>'
    + '<div class="rv-plabel">' + _rvEsc(rep.paginas[0].titulo) + ' · 1 de ' + rep.paginas.length + '</div></div>';
  if (!overlay._rvBuilt) {
    const onTip = (ev) => (e) => { const c = e.target.closest && e.target.closest('.rv-c[data-d]'); if (c) _rvTip(c, ev); };
    body.addEventListener('mouseover', onTip('hover')); body.addEventListener('click', onTip('click'));
    body.addEventListener('mouseout', e => { if (e.target.closest && e.target.closest('.rv-c[data-d]')) { const t = document.getElementById('rv-tip'); if (t) t.classList.remove('on'); } });
    document.addEventListener('keydown', e => {
      if (!overlay.classList.contains('show') || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      const sc = overlay.querySelector('.rv-pages'); if (!sc) return;
      const i = Math.round(sc.scrollLeft / sc.clientWidth) + (e.key === 'ArrowRight' ? 1 : -1);
      if (i >= 0 && i < body._rvN) body._rvIr(i);
    });
    window.addEventListener('resize', () => {   // al girar o redimensionar, se queda en la misma página
      const sc = overlay.querySelector('.rv-pages');
      if (sc && overlay.classList.contains('show')) sc.scrollTo({ left: (body._rvI || 0) * sc.clientWidth, behavior: 'instant' });
    });
    overlay._rvBuilt = true;
  }
  _rvBind(body);
  document.body.appendChild(overlay);   // siempre encima de la ventana de Principios
  CMOverlay.open(overlay);
}

// ── Sub-pestaña "Revisiones" (dentro de la ventana de Principios) ──
let _rvV = { periodo: 'mensual', clave: null };
const _rvClaveActual = () => _rvV.clave || CMReportes.repClaveDe(_rvV.periodo, _rvHoy());
function _rvVecina(clave, dir) {   // clave anterior (-1) o siguiente (+1) del período elegido; null si cae en el futuro
  const r = CMReportes.repRango(_rvV.periodo, clave); if (!r) return null;
  const c = dir < 0 ? CMReportes.repAnterior(_rvV.periodo, clave) : CMReportes.repClaveDe(_rvV.periodo, CMReportes.repSumarDias(r.hasta, 1));
  const rc = CMReportes.repRango(_rvV.periodo, c);
  return rc && rc.desde <= _rvHoy() ? c : null;
}
function _rvCuentasLiquidasUI() {
  const marcadas = (S.reportes && S.reportes.config && S.reportes.config.cuentasLiquidas) || [];
  const ctas = (S.accounts || []).filter(a => (!a.currency || a.currency === 'ARS') && !['cash', 'bank', 'prestamo'].includes(a.type));
  return '<div class="pr-card"><div class="pr-card-h"><span class="pr-chip pr-chip-h">Cuentas que cuentan como líquidas</span></div>'
    + '<div class="pr-nota">Marcá acá las cuentas de bonos o fondo de emergencia. Efectivo, bancos y préstamos a cobrar ya cuentan solos; las cuentas en dólares no entran.</div>'
    + (ctas.length ? '<div class="pr-checks">' + ctas.map(a => '<label class="pr-chk"><span>' + _rvEsc(((a.icon || '') + ' ' + (a.name || 'Cuenta')).trim()) + '</span><input type="checkbox" value="' + _rvEsc(a.id) + '"' + (marcadas.includes(a.id) ? ' checked' : '') + ' onchange="ReportesVista.liquida(this.value,this.checked)"></label>').join('') + '</div>'
      : '<div class="pr-vacio">No tenés cuentas en pesos de otro tipo (inversión, otras).</div>') + '</div>';
}
function rvHtmlSub() {
  if (typeof CMReportes === 'undefined') return '';
  const clave = _rvClaveActual(), prev = _rvVecina(clave, -1), next = _rvVecina(clave, 1);
  return '<div class="pr-card rv-sel"><div class="pr-card-h"><span class="pr-chip pr-chip-h">Reportes de revisión</span></div>'
    + '<label class="pr-l" for="rv-per">Período</label>'
    + '<select id="rv-per" class="pr-in" onchange="ReportesVista.periodo(this.value)">' + RV_PERIODOS.map(p => '<option value="' + p[0] + '"' + (p[0] === _rvV.periodo ? ' selected' : '') + '>' + p[1] + '</option>').join('') + '</select>'
    + '<div class="rv-claves"><button type="button" class="pr-btn" aria-label="Período anterior" onclick="ReportesVista.mover(-1)"' + (prev ? '' : ' disabled') + '>‹</button>'
    + '<div class="rv-clave" id="rv-clave">' + _rvEsc(_rvEtiqueta(_rvV.periodo, clave)) + '</div>'
    + '<button type="button" class="pr-btn" aria-label="Período siguiente" onclick="ReportesVista.mover(1)"' + (next ? '' : ' disabled') + '>›</button></div>'
    + '<button type="button" class="pr-btn pr-btn-p rv-ver" onclick="ReportesVista.ver()">Ver reporte</button></div>'
    + _rvCuentasLiquidasUI();
}

const ReportesVista = {
  htmlSub: rvHtmlSub,
  periodo(p) { _rvV.periodo = p; _rvV.clave = null; Principios.render(); },
  mover(dir) { const c = _rvVecina(_rvClaveActual(), dir); if (c) { _rvV.clave = c; Principios.render(); } },
  ver(periodo, clave) { if (periodo) { _rvV.periodo = periodo; _rvV.clave = clave || null; } _rvVer(_rvV.periodo, _rvClaveActual()); },
  liquida(id, on) {
    if (!S.reportes || typeof S.reportes !== 'object') S.reportes = {};
    if (!S.reportes.config || typeof S.reportes.config !== 'object') S.reportes.config = {};
    const l = Array.isArray(S.reportes.config.cuentasLiquidas) ? S.reportes.config.cuentasLiquidas : (S.reportes.config.cuentasLiquidas = []);
    const i = l.indexOf(id);
    if (on && i < 0) l.push(id); else if (!on && i >= 0) l.splice(i, 1);
    if (typeof saveState === 'function') saveState();
  },
  abrir(periodo, clave) { if (window.Principios) Principios.abrir('revisiones'); if (periodo) { _rvV.periodo = periodo; _rvV.clave = clave || null; Principios.render(); } },
};
window.ReportesVista = ReportesVista;
