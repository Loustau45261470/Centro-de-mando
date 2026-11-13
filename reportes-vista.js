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

// ── Textos escritos a mano, aprendizajes y veredicto (T3) ──
// S.reportes.items[key] se crea SOLO al escribir (abrir no crea nada). _rvEd guarda qué reporte está abierto y su editadoEn al abrir:
// si al guardar ya es otro, llegó otra versión por sync → no se pisa (sin tocar la lógica de sync).
let _rvEd = null, _rvPend = {}, _rvTimer = 0;
const _rvItems = () => (S.reportes && typeof S.reportes.items === 'object' && S.reportes.items) || {};
const _rvItemActual = () => { const it = _rvEd && _rvItems()[_rvEd.key]; return it ? CMReportes.repItemCompletar(JSON.parse(JSON.stringify(it)), _rvEd.periodo, _rvEd.clave) : CMReportes.repItemNuevo(_rvEd.periodo, _rvEd.clave); };
function _rvAvisoConflicto() {   // lo tipeado queda en pantalla (solo lectura, seleccionable) para que se pueda copiar; no se descarta _rvPend
  const e = document.getElementById('rv-conf'); if (!e || !e.hidden) return;
  e.hidden = false;
  document.querySelectorAll('#ov-reporte [data-rvf]').forEach(x => { x.readOnly = true; if (x.tagName === 'SELECT') x.disabled = true; });
  if (_rvEd && typeof _syncEv === 'function') { const act = _rvItems()[_rvEd.key]; _syncEv('reporte-conflicto', { item: _rvEd.periodo + ':' + _rvEd.clave, base: _rvEd.base, actual: (act && act.editadoEn) || null }); }
}
// mut(item) → false aborta sin marcar edición. Devuelve true si guardó.
function _rvEscribir(mut) {
  const ed = _rvEd; if (!ed) return false;
  if (CMReportes.repHayConflicto(ed.base, _rvItems()[ed.key])) { _rvAvisoConflicto(); return false; }
  if (!S.reportes || typeof S.reportes !== 'object') S.reportes = {};
  if (!S.reportes.items || typeof S.reportes.items !== 'object') S.reportes.items = {};
  const nuevo = !S.reportes.items[ed.key];
  const it = nuevo ? CMReportes.repItemNuevo(ed.periodo, ed.clave) : CMReportes.repItemCompletar(S.reportes.items[ed.key], ed.periodo, ed.clave);
  if (mut(it) === false) return false;
  const t = new Date(Math.max(Date.now(), Date.parse(it.editadoEn || 0) + 1)).toISOString();
  it.editadoEn = t; S.reportes.items[ed.key] = it; ed.base = t;
  if (typeof saveState === 'function') saveState();
  return true;
}
function _rvFlush() {
  clearTimeout(_rvTimer); _rvTimer = 0;
  const pend = Object.keys(_rvPend).map(k => _rvPend[k]);
  if (!pend.length || !_rvEd) { _rvPend = {}; return; }
  if (CMReportes.repHayConflicto(_rvEd.base, _rvItems()[_rvEd.key])) { _rvAvisoConflicto(); return; }   // conflicto: lo pendiente NO se vacía
  _rvPend = {};
  if (!_rvItems()[_rvEd.key] && pend.every(p => p.v === '')) return;   // borrar lo que nunca se guardó no crea nada
  _rvEscribir(it => { pend.forEach(p => p.fn(it)); });
}
function _rvEncolar(k, v, fn) { _rvPend[k] = { v, fn }; clearTimeout(_rvTimer); _rvTimer = setTimeout(_rvFlush, 450); }
function _rvCampoLeido(el) {   // textarea/select con data-rvf → [clave de cola, valor, función que lo aplica al item]
  const f = el.dataset.rvf, v = el.value, sec = el.dataset.sec, id = el.dataset.id, k = el.dataset.k;
  if (f === 'est' || f === 'det') return [f + sec, v, it => { it[f === 'est' ? 'estancamientos' : 'deterioro'][sec] = v; }];
  if (f === 'agr') return ['agr', v, it => { it.agradecimientos = v; }];
  if (f === 'man') return ['man', v, it => { it.veredicto.manual = v.trim() ? { texto: v, el: new Date().toISOString() } : null; }];
  if (f === 'apr') return ['apr' + id + k, v, it => { const fi = it.aprendizajes.find(x => x.id === id); if (fi) fi[k] = v; }];
  return null;
}
const _rvTa = (f, etiqueta, valor, o) => { o = o || {};
  return '<label class="rv-lab">' + _rvEsc(etiqueta) + '<textarea class="rv-ta" rows="' + (o.rows || 4) + '" data-rvf="' + f + '"' + (o.sec ? ' data-sec="' + _rvEsc(o.sec) + '"' : '') + (o.id ? ' data-id="' + _rvEsc(o.id) + '"' : '') + (o.k ? ' data-k="' + o.k + '"' : '')
    + (o.ph ? ' placeholder="' + _rvEsc(o.ph) + '"' : '') + '>' + _rvEsc(valor) + '</textarea></label>'; };
function _rvCamposSec(it, sec, conTitulo) {
  return _rvCard(conTitulo ? sec : 'Tu lectura de ' + sec, _rvTa('est', 'Estancamientos', it.estancamientos[sec], { sec, ph: 'Qué se estancó, qué no avanzó' }) + _rvTa('det', 'Deterioro', it.deterioro[sec], { sec, ph: 'Qué empeoró respecto del período anterior' }));
}
function _rvAprHtml(it) {
  const filas = it.aprendizajes.map(f => {
    const conv = f.convertidoA;
    return '<div class="rv-fila" data-id="' + _rvEsc(f.id) + '"><label class="rv-lab">Sección<select class="rv-in" data-rvf="apr" data-k="seccion" data-id="' + _rvEsc(f.id) + '">' + CMReportes.REP_SECCIONES.map(s => '<option' + (s === f.seccion ? ' selected' : '') + '>' + _rvEsc(s) + '</option>').join('') + '</select></label>'
      + _rvTa('apr', 'Error', f.error, { id: f.id, k: 'error', rows: 3, ph: 'Qué salió mal' }) + _rvTa('apr', 'Aprendizaje', f.aprendizaje, { id: f.id, k: 'aprendizaje', rows: 3, ph: 'Qué aprendí de eso' }) + _rvTa('apr', 'Propuesta para cambiarlo', f.propuesta, { id: f.id, k: 'propuesta', rows: 3, ph: 'Qué voy a hacer distinto' })
      + '<div class="rv-acts">' + (conv && CMReportes.repBuscarConversion(_prData(), CMReportes.repItemKey(_rvEd.periodo, _rvEd.clave), f.id) ? '<span class="rv-ya">Ya convertido en ' + (conv.tipo === 'objetivo' ? 'objetivo' : 'principio') + '</span>'
        : '<button type="button" class="rv-btn" data-rvact="conv" data-tipo="principio" data-id="' + _rvEsc(f.id) + '">Convertir en principio</button><button type="button" class="rv-btn" data-rvact="conv" data-tipo="objetivo" data-id="' + _rvEsc(f.id) + '">Convertir en objetivo</button>')
      + '<button type="button" class="rv-btn rv-btn-d" data-rvact="del" data-id="' + _rvEsc(f.id) + '">Borrar</button></div></div>';
  }).join('');
  return '<div id="rv-apr">' + (filas || '<div class="rv-card"><div class="rv-vacio">Todavía no cargaste ningún aprendizaje. Cada fila es: error, aprendizaje y propuesta para cambiarlo.</div></div>') + '<button type="button" class="rv-btn rv-btn-p" data-rvact="add">Agregar aprendizaje</button></div>';
}
const _rvFechaHora = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }); };
function _rvVeredictoIaHtml(it) {
  const ia = it.veredicto.ia, hay = ia.estado === 'listo' && typeof ia.texto === 'string' && ia.texto.trim() !== '', conf = it.veredicto.conformidad;
  return '<div id="rv-ia" class="rv-card"><div class="rv-ct">Veredicto de Claude</div>'
    + (hay ? '<div class="rv-vtxt">' + _rvEsc(ia.texto) + '</div>' : '<div class="rv-fm">Pendiente (se genera cuando esté el consejero con IA)</div>')
    + (conf ? '<div class="rv-ya">Estás de acuerdo · ' + _rvEsc(_rvFechaHora(conf.el)) + '</div>' : '')
    + '<div class="rv-acts"><button type="button" class="rv-btn rv-btn-p" data-rvact="acuerdo"' + (hay && !conf ? '' : ' disabled') + '>' + (conf ? 'Ya estás de acuerdo' : 'Estoy de acuerdo') + '</button></div></div>';
}
function _rvVeredictoHtml(it) {
  return _rvVeredictoIaHtml(it) + _rvCard('Mi veredicto', _rvTa('man', 'Tu propio veredicto del período', (it.veredicto.manual && it.veredicto.manual.texto) || '', { rows: 5, ph: 'Cómo te fue en este período, en tus palabras' }));
}
function _rvTextosGlobalesHtml(it) { return _rvCard('Agradecimientos', _rvTa('agr', 'De qué estás agradecido en este período', it.agradecimientos, { rows: 5 })); }
function _rvAccion(act, b) {
  _rvFlush();
  if (!_rvEd) return;
  const apr = () => { const c = document.getElementById('rv-apr'); if (c) c.outerHTML = _rvAprHtml(_rvItemActual()); };
  if (act === 'add') { if (_rvEscribir(it => { it.aprendizajes.push({ id: _prUid(), seccion: CMReportes.REP_SECCIONES[0], error: '', aprendizaje: '', propuesta: '', convertidoA: null }); })) apr(); return; }
  if (act === 'del') {
    const f = _rvItemActual().aprendizajes.find(x => x.id === b.dataset.id);
    if (f && (f.error || f.aprendizaje || f.propuesta) && !confirm('¿Borrar esta fila?')) return;
    if (_rvEscribir(it => { it.aprendizajes = it.aprendizajes.filter(x => x.id !== b.dataset.id); })) apr(); return;
  }
  if (act === 'conv') {
    let r = null;
    const ok = _rvEscribir(it => {
      const fi = it.aprendizajes.find(x => x.id === b.dataset.id);
      r = CMReportes.repConvertirFila(_prData(), it, fi, b.dataset.tipo, 'Reporte ' + _rvEtiqueta(_rvEd.periodo, _rvEd.clave), _prUid);
      if (r.error) return false;
    });
    if (r && r.error && typeof showToast === 'function') showToast(r.error);
    if (ok) { apr(); if (typeof showToast === 'function') showToast(r.creado ? (r.tipo === 'principio' ? 'Principio creado' : 'Objetivo creado') : 'Ya estaba convertido'); }
    return;
  }
  if (act === 'acuerdo') {
    if (_rvEscribir(it => { const ia = it.veredicto.ia; if (ia.estado !== 'listo' || !String(ia.texto || '').trim() || it.veredicto.conformidad) return false; it.veredicto.conformidad = { el: new Date().toISOString(), periodo: it.periodo, clave: it.clave }; })) { const c = document.getElementById('rv-ia'); if (c) c.outerHTML = _rvVeredictoIaHtml(_rvItemActual()); }
  }
}

// ── Armado del reporte ──
function _rvPagina(titulo, cuerpo) { return { titulo, html: '<h3 class="rv-pt">' + _rvEsc(titulo) + '</h3>' + cuerpo }; }

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
  const foco = R.repFoco(datos, rango, comp, { foArmarCruces: typeof foArmarCruces === 'function' ? foArmarCruces : null });
  const eco = R.repKpiEconomia(datos, rango, comp);
  const it = _rvItemActual();
  const paginas = [_rvPagina('Foco', _rvKpisFoco(foco, eco))];
  if (periodo === 'semanal') {
    paginas.push(_rvPagina('Hábitos', _rvLeyenda() + RV_SECCIONES.map(s => { const h = _rvHabitosDe(s[0], ctx, true); return h ? '<div class="rv-sec">' + _rvEsc(s[1]) + '</div>' + h : ''; }).join('')));
    paginas.push(_rvPagina('Gastos', _rvKpisEconomia(eco, true)));
    paginas.push(_rvPagina('Textos de la semana', R.REP_SECCIONES.map(s => _rvCamposSec(it, s, true)).join('') + '<div class="rv-sec">Aprendizajes</div>' + _rvAprHtml(it) + _rvTextosGlobalesHtml(it) + _rvVeredictoHtml(it)));
  } else {
    const kpis = { conocimiento: () => _rvKpisConocimiento(R.repKpiConocimiento(datos, rango, comp)), finanzas: () => _rvKpisEconomia(eco, false) };
    RV_SECCIONES.forEach(s => {
      paginas.push(_rvPagina(s[1], (ctx.habitos.some(h => h.seccion === s[0]) ? _rvLeyenda() : '') + _rvHabitosDe(s[0], ctx, false) + _rvObjetivos(s[0], s[2], ctx) + (kpis[s[0]] ? kpis[s[0]]() : '') + _rvCamposSec(it, s[2], false)));
    });
    paginas.push(_rvPagina('Aprendizajes', _rvAprHtml(it)), _rvPagina('Agradecimientos', _rvTextosGlobalesHtml(it) + _rvVeredictoHtml(it)));
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
  const ir = i => sc.scrollTo({ left: i * sc.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  let raf = 0;
  sc.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0; if (!sc.isConnected) return;
      const i = Math.min(dots.length - 1, Math.max(0, Math.round(sc.scrollLeft / sc.clientWidth)));
      body._rvI = i;
      dots.forEach((d, j) => { d.classList.toggle('on', j === i); d.setAttribute('aria-current', j === i ? 'true' : 'false'); });
      if (lab) lab.textContent = dots[i].getAttribute('aria-label') + ' · ' + (i + 1) + ' de ' + dots.length;
    });
  }, { passive: true });
  dots.forEach((d, i) => d.addEventListener('click', () => ir(i)));
  body._rvIr = ir; body._rvN = dots.length; body._rvI = 0;
}

function _rvDevolverFoco(el) {
  const visible = x => x && x.isConnected && !x.disabled && !!(x.offsetWidth || x.offsetHeight || x.getClientRects().length) && !x.closest('[hidden]');
  setTimeout(() => {   // después de que CMOverlay.close oculte el reporte
    // body/html no cuentan como foco a devolver (un toque en iPhone no enfoca el botón): seguir al fallback
    if (el && el !== document.body && el !== document.documentElement && visible(el) && !el.closest('#ov-reporte')) { el.focus(); return; }
    const ovs = Array.from(document.querySelectorAll('.cm-overlay.show')).filter(o => o.id !== 'ov-reporte');
    const top = ovs[ovs.length - 1];
    const f = top && Array.from(top.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).find(visible);
    if (f) f.focus(); else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }, 0);
}
function _rvVer(periodo, clave) {
  if (typeof CMOverlay === 'undefined' || typeof CMReportes === 'undefined') return;
  _rvFlush();
  const _rvFoco = document.activeElement;   // a donde vuelve el foco al cerrar (CMOverlay.close no lo devuelve)
  _rvEd = { periodo, clave, key: CMReportes.repItemKey(periodo, clave), base: (_rvItems()[CMReportes.repItemKey(periodo, clave)] || {}).editadoEn || null };
  const rep = _rvConstruir(periodo, clave);
  const { overlay, body } = CMOverlay.build({ id: 'ov-reporte', accent: '#6B8EFF' });
  body.innerHTML = '<div class="cm-ov-head rv-head"><div class="cm-ov-eyebrow">REVISIONES · REPORTE</div><div class="cm-ov-title">' + _rvEsc(RV_PERIODOS.find(p => p[0] === periodo)[1] + ' · ' + _rvEtiqueta(periodo, clave)) + '</div>'
    + '<div class="rv-sub">' + _rvEsc(_rvFechaCorta(rep.rango.desde) + ' – ' + _rvFechaCorta(rep.rango.hasta) + ' ' + rep.rango.hasta.slice(0, 4) + ' · se compara con ' + _rvEtiqueta(periodo, rep.antClave)) + '</div>'
    + (rep.parcial ? '<div class="rv-banner">Período en curso: se compara contra los mismos días del anterior</div>' : '')
    + '<div class="rv-conflicto" id="rv-conf" role="alert" hidden>Este reporte se editó en otro dispositivo. Copiá lo que escribiste y volvé a abrir el reporte.</div></div>'
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
    body.addEventListener('input', e => { const el = e.target.closest && e.target.closest('[data-rvf]'); const r = el && _rvCampoLeido(el); if (r) _rvEncolar(r[0], r[1], r[2]); });
    body.addEventListener('change', e => { const el = e.target.closest && e.target.closest('select[data-rvf]'); const r = el && _rvCampoLeido(el); if (r) { _rvEncolar(r[0], r[1], r[2]); _rvFlush(); } });
    body.addEventListener('focusout', e => { if (e.target.closest && e.target.closest('[data-rvf]')) _rvFlush(); });
    body.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-rvact]'); if (b && !b.disabled) _rvAccion(b.dataset.rvact, b); });
    overlay._cmOnClose = () => { _rvFlush(); _rvDevolverFoco(overlay._rvFoco); };   // cerrar con lo tipeado a medias: se guarda antes de soltar el reporte
    document.addEventListener('visibilitychange', () => { if (document.hidden) { _rvFlush(); if (typeof _fbFlush === 'function') _fbFlush(); } });
    window.addEventListener('pagehide', () => { _rvFlush(); if (typeof _fbFlush === 'function') _fbFlush(); });
    overlay._rvBuilt = true;
  }
  overlay._rvFoco = _rvFoco;
  _rvBind(body);
  document.body.appendChild(overlay);   // siempre encima de la ventana de Principios
  CMOverlay.open(overlay);
  const cierre = overlay.querySelector('.cm-ov-close'); if (cierre) cierre.focus();
}

// ── Resumen compacto de una semana (lo usa el paso 1 de la Revisión semanal): mismos cálculos que el reporte semanal; las fichas son un subconjunto ──
function _rvResumenSemanal(clave) {
  const R = CMReportes, hoy = _rvHoy();
  const rango = R.repRango('semanal', clave); if (!rango) return '';
  const ant = R.repRango('semanal', R.repAnterior('semanal', clave)), comp = R.repRangoComparable(rango, ant, hoy);
  const trackers = S.habitTrackers && !Array.isArray(S.habitTrackers) ? S.habitTrackers : {};
  const datos = _rvDatos(rango, comp, hoy);
  const hab = R.repHabitosComparados(trackers, rango, comp);
  const tot = hab.reduce((a, h) => a + h.puntos, 0), totAnt = hab.reduce((a, h) => a + h.anterior, 0);
  const kHab = hab.length ? { valor: tot, anterior: totAnt, comparacion: R.repComparar(tot, totAnt) } : { valor: null, motivo: 'No hay hábitos cargados' };
  const eco = R.repKpiEconomia(datos, rango, comp);
  const fo = R.repFoco(datos, rango, comp, { foArmarCruces: typeof foArmarCruces === 'function' ? foArmarCruces : null });
  const con = R.repKpiConocimiento(datos, rango, comp);
  const f = _rvFicha, m = _rvMoney, deCinco = v => _rvN(v, 1) + ' / 5';
  return '<div class="rv-rs">' + _rvFichas([
    f('Hábitos (suma de puntos)', kHab, v => _rvN(v, 1), { unidad: 'pts', subs: ['Suma de ' + hab.length + ' hábitos activos'], fmtAbs: _rvPts, conPct: false }),
    f('Gastos', eco.gastos, m, { opts: { menosEsMejor: true } }),
    f('Tasa de ahorro', eco.tasaAhorro, _rvPct, { conPct: false, fmtAbs: _rvPts }),
    f('Atención promedio', fo.atencion, deCinco),
    f('Energía promedio', fo.energia, deCinco),
    f('Horas de estudio', con.horasEstudio, v => _rvN(v, 1), { unidad: 'h cronometradas', fmtAbs: _rvHoras, motivo: false }),
  ]) + '<button type="button" class="btn btn-ghost rv-rs-ver" onclick="ReportesVista.verSemana(\'' + _rvEsc(clave) + '\')">Ver reporte completo</button></div>';
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
function _rvHistorialHtml() {
  const lista = CMReportes.repHistorial(_rvItems());
  return '<div class="pr-card"><div class="pr-card-h"><span class="pr-chip pr-chip-h">Reportes con textos</span></div>'
    + (lista.length ? lista.map(i => '<div class="rv-hist"><div class="rv-hist-t"><b>' + _rvEsc((RV_PERIODOS.find(p => p[0] === i.periodo) || [0, i.periodo])[1] + ' · ' + _rvEtiqueta(i.periodo, i.clave)) + '</b><span>' + _rvEsc(CMReportes.repResumenItem(i).join(' · ')) + '</span></div>'
      + '<button type="button" class="pr-btn" data-rvhist data-p="' + _rvEsc(i.periodo) + '" data-c="' + _rvEsc(i.clave) + '">Abrir</button></div>').join('')
      : '<div class="pr-vacio">Todavía no escribiste nada en ningún reporte.</div>') + '</div>';
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
    + _rvHistorialHtml() + _rvCuentasLiquidasUI();
}

const ReportesVista = {
  htmlSub: rvHtmlSub,
  resumenSemanalHtml: _rvResumenSemanal,
  periodo(p) { _rvV.periodo = p; _rvV.clave = null; Principios.render(); },
  mover(dir) { const c = _rvVecina(_rvClaveActual(), dir); if (c) { _rvV.clave = c; Principios.render(); } },
  ver(periodo, clave) { if (periodo) { _rvV.periodo = periodo; _rvV.clave = clave || null; } _rvVer(_rvV.periodo, _rvClaveActual()); },
  verSemana(clave) { _rvVer('semanal', clave); },   // no toca _rvV: la sub-pestaña Revisiones conserva su período
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

document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-rvhist]'); if (b) ReportesVista.ver(b.dataset.p, b.dataset.c); });   // historial: Abrir
