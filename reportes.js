'use strict';
// ════════════════════════════════════════════════════════════════════════
// REPORTES — núcleo PURO de los reportes de revisión (Etapa B de specs/principios-y-revisiones.md).
// Sin DOM ni `S` global: recibe los datos por parámetro. Fechas SIEMPRE en hora local ('YYYY-MM-DD'), nunca UTC.
// Períodos y claves: semanal 'YYYY-Www' (semana ISO lunes-domingo), mensual 'YYYY-MM', trimestral 'YYYY-T1'..'T4',
// semestral 'YYYY-S1'/'S2', anual 'YYYY'. Rango = { desde, hasta } ambos inclusive.
// Navegador: window.CMReportes. Node: module.exports (mismo patrón que foco.js).
// ════════════════════════════════════════════════════════════════════════

const _rp = n => String(n).padStart(2, '0');
function repFecha(d) { return d.getFullYear() + '-' + _rp(d.getMonth() + 1) + '-' + _rp(d.getDate()); }
function repParse(ds) { const [y, m, d] = String(ds).split('-').map(Number); return new Date(y, m - 1, d); }
function repSumarDias(ds, n) { const d = repParse(ds); return repFecha(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); }
function repDiasEntre(a, b) {   // b - a en días, inmune a DST
  const A = repParse(a), B = repParse(b);
  return Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) - Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / 86400000);
}
function _repUltimo(y, m) { return repFecha(new Date(y, m, 0)); }   // último día del mes m (1-12)
function _repLunesSemana1(y) {   // lunes de la semana ISO 1 del año y (la que contiene el 4 de enero)
  const d = new Date(y, 0, 4), dow = (d.getDay() + 6) % 7;
  return repFecha(new Date(y, 0, 4 - dow));
}

function repRango(periodo, clave) {
  const c = String(clave);
  if (periodo === 'semanal') {
    const m = c.match(/^(\d{4})-W(\d{2})$/); if (!m) return null;
    const desde = repSumarDias(_repLunesSemana1(+m[1]), (+m[2] - 1) * 7);
    return { desde, hasta: repSumarDias(desde, 6) };
  }
  if (periodo === 'mensual') {
    const m = c.match(/^(\d{4})-(\d{2})$/); if (!m) return null;
    return { desde: m[1] + '-' + m[2] + '-01', hasta: _repUltimo(+m[1], +m[2]) };
  }
  if (periodo === 'trimestral') {
    const m = c.match(/^(\d{4})-T([1-4])$/); if (!m) return null;
    const m0 = (+m[2] - 1) * 3 + 1;
    return { desde: m[1] + '-' + _rp(m0) + '-01', hasta: _repUltimo(+m[1], m0 + 2) };
  }
  if (periodo === 'semestral') {
    const m = c.match(/^(\d{4})-S([12])$/); if (!m) return null;
    const m0 = (+m[2] - 1) * 6 + 1;
    return { desde: m[1] + '-' + _rp(m0) + '-01', hasta: _repUltimo(+m[1], m0 + 5) };
  }
  if (periodo === 'anual') {
    const m = c.match(/^(\d{4})$/); if (!m) return null;
    return { desde: m[1] + '-01-01', hasta: m[1] + '-12-31' };
  }
  return null;
}

function repClaveDe(periodo, fecha) {
  const d = repParse(fecha), y = d.getFullYear(), mo = d.getMonth() + 1;
  if (periodo === 'semanal') {
    const dow = (d.getDay() + 6) % 7;
    const jue = new Date(y, d.getMonth(), d.getDate() - dow + 3);   // el jueves decide el año ISO
    const ord = repDiasEntre(jue.getFullYear() + '-01-01', repFecha(jue));
    return jue.getFullYear() + '-W' + _rp(Math.floor(ord / 7) + 1);
  }
  if (periodo === 'mensual') return y + '-' + _rp(mo);
  if (periodo === 'trimestral') return y + '-T' + (Math.floor((mo - 1) / 3) + 1);
  if (periodo === 'semestral') return y + '-S' + (mo <= 6 ? 1 : 2);
  if (periodo === 'anual') return String(y);
  return null;
}

function repAnterior(periodo, clave) {
  const r = repRango(periodo, clave); if (!r) return null;
  if (periodo === 'semanal') return repClaveDe('semanal', repSumarDias(r.desde, -7));
  return repClaveDe(periodo, repSumarDias(r.desde, -1));   // el día previo cae siempre en el período anterior
}

function repMeses(rango) {   // ['YYYY-MM', ...] de los meses que toca el rango
  const out = [], a = repParse(rango.desde), b = repParse(rango.hasta);
  let y = a.getFullYear(), m = a.getMonth();
  while (y < b.getFullYear() || (y === b.getFullYear() && m <= b.getMonth())) {
    out.push(y + '-' + _rp(m + 1));
    if (++m > 11) { m = 0; y++; }
  }
  return out;
}

function repParcial(rango, hoy) { return hoy >= rango.desde && hoy <= rango.hasta; }   // período en curso (todavía no terminó)

// Si el período está en curso, recorta el anterior a la misma cantidad de días transcurridos.
function repRangoComparable(rango, anterior, hoy) {
  if (!repParcial(rango, hoy)) return anterior;
  const dias = repDiasEntre(rango.desde, hoy) + 1;
  const hasta = repSumarDias(anterior.desde, dias - 1);
  return { desde: anterior.desde, hasta: hasta < anterior.hasta ? hasta : anterior.hasta };
}

// Regla de color: mejora verde, igual azul, empeora rojo (invertido con menosEsMejor). pct null si el anterior es 0.
function repComparar(actual, anterior, opts) {
  const menos = !!(opts && opts.menosEsMejor);
  if (!Number.isFinite(actual) || !Number.isFinite(anterior)) return { abs: null, pct: null, tono: 'azul' };
  const abs = Math.round((actual - anterior) * 100) / 100;
  const pct = anterior === 0 ? null : Math.round(abs / Math.abs(anterior) * 100);
  const tono = abs === 0 ? 'azul' : ((abs > 0) !== menos ? 'verde' : 'rojo');
  return { abs, pct, tono };
}

// trackers = S.habitTrackers: { seccion: [{id, name, days: {fecha: 'done'|'partial'|'missed'|'rest'}}] }.
// 'partial' va aparte de `done`, pero vale medio punto: `puntos = done + 0.5 * partial` (decisión de Tobías 2026-11-12; la comparación usa puntos).
// Los hábitos sin registros aparecen con 0.
function repHabitos(trackers, rango) {
  const out = [];
  Object.keys(trackers || {}).forEach(seccion => (trackers[seccion] || []).forEach(h => {
    let done = 0, partial = 0;
    const days = h.days || {};
    Object.keys(days).forEach(f => {
      if (f < rango.desde || f > rango.hasta) return;
      if (days[f] === 'done') done++; else if (days[f] === 'partial') partial++;
    });
    out.push({ seccion, id: h.id, nombre: h.name || h.nombre || '', done, partial, puntos: done + 0.5 * partial });
  }));
  return out;
}

// vista = prVistaObjetivos(...). Cuenta cumplidos por categoría en el rango.
// Fecha: solo cumplidoEl (el plazo `fecha` NO es fecha de cumplimiento) → (trimestral) solo si el rango contiene su trimestre completo.
// Lo que no se puede atribuir va a sinFecha y no se compara.
function repObjetivosPorCategoria(vista, rango) {
  const porCategoria = {}, sinFecha = [];
  (vista || []).forEach(o => {
    if (o.estado !== 'cumplido') return;
    let f = o.cumplidoEl || '';
    let dentro;
    if (f) dentro = f >= rango.desde && f <= rango.hasta;
    else {
      const q = o.origen === 'trimestral' && String(o.periodoId || '').match(/^t([1-4])-(\d{4})$/);
      if (!q) { sinFecha.push(o); return; }
      const r = repRango('trimestral', q[2] + '-T' + q[1]);
      dentro = r.desde >= rango.desde && r.hasta <= rango.hasta;
      if (!dentro) { sinFecha.push(o); return; }
    }
    if (!dentro) return;
    const k = o.categoriaId || ('sin:' + (o.seccion || ''));
    porCategoria[k] = (porCategoria[k] || 0) + 1;
  });
  return { porCategoria, sinFecha };
}

// Compara cada hábito entre dos rangos por `puntos`. Un hábito que no estaba en el período anterior cuenta con 0.
function repHabitosComparados(trackers, rango, rangoAnt) {
  const ant = {};
  repHabitos(trackers, rangoAnt).forEach(h => { ant[h.seccion + '|' + h.id] = h.puntos; });
  return repHabitos(trackers, rango).map(h => {
    const anterior = ant[h.seccion + '|' + h.id] || 0;
    return Object.assign({}, h, { anterior, comparacion: repComparar(h.puntos, anterior) });
  });
}

// monthlyGoals = S.monthlyGoals: { seccion: { 'YYYY-MM': [{id, text, done}] } }. Cuentan como objetivos "sin categoría" de su sección
// (clave 'sin:<Sección>', igual que repObjetivosPorCategoria). No tienen fecha de cumplimiento: se atribuyen a su mes, así que solo
// cuentan los meses que el rango contiene completos; el resto va a `noAtribuibles` (cantidad de metas cumplidas que no se pueden ubicar).
function repMetasMensuales(monthlyGoals, rango) {
  const porCategoria = {}; let noAtribuibles = 0;
  Object.keys(monthlyGoals || {}).forEach(sec => {
    const meses = monthlyGoals[sec] || {};
    Object.keys(meses).forEach(mk => {
      const hechas = (meses[mk] || []).filter(g => g && g.done).length;
      if (!hechas) return;
      const r = repRango('mensual', mk); if (!r) return;
      if (r.hasta < rango.desde || r.desde > rango.hasta) return;
      if (r.desde >= rango.desde && r.hasta <= rango.hasta) porCategoria['sin:' + sec] = (porCategoria['sin:' + sec] || 0) + hechas;
      else noAtribuibles += hechas;
    });
  });
  return { porCategoria, noAtribuibles };
}

// ═══ KPIs (puros: reciben las porciones de S por parámetro). Forma común: { valor, anterior?, comparacion?, motivo? } ═══
// Si no se puede calcular honestamente: valor null + motivo en español simple.
const _repRedondeo = (n, d) => { const k = Math.pow(10, d == null ? 2 : d); return Math.round(n * k) / k; };
const _repEn = (f, r) => !!f && f >= r.desde && f <= r.hasta;
const _repEsArs = x => !x || !x.currency || x.currency === 'ARS';
const _repNulo = motivo => ({ valor: null, motivo });
function _repKpi(valor, anterior, opts) {   // arma el KPI con su comparación; sin anterior, sin comparación
  const k = { valor };
  if (anterior !== undefined) { k.anterior = anterior; k.comparacion = repComparar(valor, anterior, opts); }
  return k;
}
function _repPar(fn, rango, rangoAnt, opts) {   // fn(rango) → { valor, motivo? }; compara solo si ambos son número
  const a = fn(rango), b = rangoAnt ? fn(rangoAnt) : null;
  if (a.valor == null) return a;
  if (!b || b.valor == null) return Object.assign({}, a, { anterior: null, motivoAnterior: b ? b.motivo : undefined });
  return Object.assign({}, a, { anterior: b.valor, comparacion: repComparar(a.valor, b.valor, opts) });
}
const _repMesAnterior = mk => { const [y, m] = mk.split('-').map(Number); return m === 1 ? (y - 1) + '-12' : y + '-' + _rp(m - 1); };

// Transacciones de gasto/ingreso en pesos. Nunca se lee S.moves (mover plata entre cuentas no es ingreso ni gasto).
// Categoría 'invest' (ventas de la cartera: la ganancia entra como ingreso y la pérdida como gasto) no es consumo ni ahorro → fuera.
const _repEsGasto = t => !!t && t.type === 'expense' && _repEsArs(t) && !t.refundOf && t.category !== 'invest';
const _repEsIngreso = t => !!t && t.type === 'income' && _repEsArs(t) && !t.refundOf && t.category !== 'invest';
// Cuota de tarjeta que cae el día 1 (la crea materializeCardExpenses de finanzas.js:384: id 'cc:..', date '<mes>-01', nombre '… (i/n)').
// Si la compra misma se hizo ese día 1, su transacción lleva la fecha de la compra (finanzas.js:398) → es compra de la semana, no cuota.
const _repEsCuotaDia1 = (t, datos) => {
  if (!t.cardChargeId || String(t.date).slice(8, 10) !== '01' || !/\(\d+\/\d+\)\s*$/.test(t.name || '')) return false;
  const ch = ((datos && datos.cardCharges) || []).find(c => c && c.id === t.cardChargeId);
  return !(ch && ch.date === t.date);
};
const _repSemanal = r => repDiasEntre(r.desde, r.hasta) + 1 <= 7;

// Gasto NETO: cada reintegro (income con refundOf) se resta del gasto de la categoría de su compra/gasto, en el mes del reintegro
// (criterio económico: lo reintegrado no se gastó). Los reintegros siguen fuera de ingresos. Si no se encuentra el origen → 'other'.
function _repGastos(datos, r, sinCuotasDia1) {
  let total = 0, cuotasDia1 = 0; const porCat = {};
  const txs = datos.transactions || [];
  txs.forEach(t => {
    if (!_repEsGasto(t) || !_repEn(t.date, r)) return;
    const m = +t.amount || 0;
    if (sinCuotasDia1 && _repEsCuotaDia1(t, datos)) { cuotasDia1 += m; return; }
    total += m; const c = t.category || 'other'; porCat[c] = (porCat[c] || 0) + m;
  });
  txs.forEach(t => {
    if (!t || t.type !== 'income' || !t.refundOf || !_repEsArs(t) || !_repEn(t.date, r)) return;
    const m = +t.amount || 0;
    const o = (datos.cardCharges || []).find(c => c && c.id === t.refundOf) || txs.find(x => x && x.id === t.refundOf);
    const c = (o && o.category) || 'other';
    total -= m; porCat[c] = (porCat[c] || 0) - m;
  });
  return { total: _repRedondeo(total), porCat, cuotasDia1: _repRedondeo(cuotasDia1) };
}

// Saldo de una cuenta en una fecha: hoy o después → saldo actual; antes → último registro de accountHistory hasta esa fecha.
// Cuenta sin registro propio a esa fecha: si hay historial de cualquier otra cuenta, todavía no existía → vale 0;
// null solo si no hay ningún historial hasta esa fecha (el historial guarda ≈400 días).
function _repSaldoAl(datos, cuenta, fecha) {
  if (datos.hoy && fecha >= datos.hoy) return +cuenta.balance || 0;
  let v = null, hayGeneral = false;
  (datos.accountHistory || []).forEach(h => {
    if (h.date > fecha) return;
    hayGeneral = true;
    if (h.accountId === cuenta.id) v = +h.balance || 0;   // ordenado por fecha
  });
  return v != null ? v : (hayGeneral ? 0 : null);
}
function _repSumaSaldos(datos, cuentas, fecha) {
  let t = 0;
  for (const c of cuentas) { const v = _repSaldoAl(datos, c, fecha); if (v == null) return null; t += v; }
  return _repRedondeo(t);
}
// Activos líquidos = efectivo, banco y préstamos a cobrar (misma base que "Cash" de finanzas.js:10) + las cuentas que Tobías
// agregue en config.cuentasLiquidas (ids; los bonos no se reconocen solos: viven en la cuenta de inversión, que guarda el capital
// aportado mezclado con CEDEARs y acciones). Solo pesos: las cuentas en USD nunca entran.
function _repCuentasLiquidas(datos) {
  const extra = ((datos.config && datos.config.cuentasLiquidas) || []);
  return (datos.cuentas || []).filter(a => _repEsArs(a) && (['cash', 'bank', 'prestamo'].includes(a.type) || extra.includes(a.id)));
}

function _repPatrimonio(datos, r) {
  const h = (datos.nwHistory || []).filter(p => p && p.date).slice().sort((a, b) => a.date.localeCompare(b.date));
  let ini = null, fin = null;
  h.forEach(p => { if (p.date < r.desde) ini = p; if (p.date <= r.hasta) fin = p; });
  if (!ini || !fin || fin.date < r.desde) return _repNulo('No hay registros de patrimonio al inicio y al final de este período');
  if (repDiasEntre(ini.date, r.desde) > 7) return _repNulo('No hay registro del patrimonio cerca del inicio del período');
  // Simétrico: el registro del final tampoco puede estar a más de 7 días de `hasta` (o de hoy si el período sigue en curso).
  const refFin = datos.hoy && datos.hoy < r.hasta ? datos.hoy : r.hasta;
  if (repDiasEntre(fin.date, refFin) > 7) return _repNulo('No hay registro del patrimonio cerca del final del período');
  if (ini.c !== 1 || fin.c !== 1) return _repNulo('Los registros viejos de patrimonio se calculaban distinto y no se pueden comparar');
  // nwHistory suma los saldos sin distinguir moneda (finanzas.js:8): se restan las cuentas en USD (solo pesos en el reporte).
  const usd = (datos.cuentas || []).filter(a => !_repEsArs(a));
  const aj = f => usd.length ? _repSumaSaldos(datos, usd, f) : 0;
  const ai = aj(ini.date), af = aj(fin.date);
  if (ai == null || af == null) return _repNulo('Hay cuentas en dólares y no hay historial suficiente para sacarlas del patrimonio');
  const inicio = _repRedondeo((+ini.value || 0) - ai), final = _repRedondeo((+fin.value || 0) - af);
  const variacion = _repRedondeo(final - inicio);
  // Parte explicada: todo ingreso y gasto en pesos entre los dos registros (también reintegros y ventas, que sí mueven saldos). Entre cuentas no cuenta.
  // Las cuotas de tarjeta (cardChargeId, sin cuenta) NO mueven saldo: el patrimonio baja entero el día de la compra (crédito usado sube).
  // Por eso se excluyen como gasto y se suma como baja el monto total de cada compra con tarjeta (y cargos `cover`) hecha en el período,
  // según su fecha de compra. Los adelantos (mode 'advance') no: la plata entra a una cuenta y es neutro.
  let ing = 0, gas = 0;
  (datos.transactions || []).forEach(t => {
    if (!t || !_repEsArs(t) || !t.date || t.date <= ini.date || t.date > fin.date || t.cardChargeId) return;
    if (t.type === 'income') ing += +t.amount || 0; else if (t.type === 'expense') gas += +t.amount || 0;
  });
  // Tarjeta con arranque (resetAt): una compra anterior al corte no sube el crédito usado (tarjetas-motor.js chargeCounts: por momento
  // de registro leído del id; si no se lee, por fecha > resetDay) → no es baja explicada.
  const cards = {}; (datos.cards || []).forEach(k => { if (k && k.id) cards[k.id] = k; });
  const cuenta = c => {
    const k = cards[c.cardId];
    if (!k || !(typeof k.resetAt === 'number' && k.resetAt > 0)) return true;
    const ms = typeof c.id === 'string' && c.id.length >= 8 ? parseInt(c.id.slice(0, 8), 36) : NaN;
    if (isFinite(ms) && ms >= Date.UTC(2020, 0, 1) && ms <= Date.UTC(2100, 0, 1)) return ms > k.resetAt;
    const d = new Date(k.resetAt), dia = k.resetDay || (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    return c.date > dia;
  };
  (datos.cardCharges || []).forEach(c => {
    if (!c || !c.date || c.date <= ini.date || c.date > fin.date || c.mode === 'advance' || !cuenta(c)) return;
    gas += +c.amount || 0;
  });
  const explicado = _repRedondeo(ing - gas);
  return { valor: variacion, inicio, fin: final, explicado, resto: _repRedondeo(variacion - explicado),
    motivoResto: 'El resto no se puede atribuir: ajustes de saldo, cambios entre pesos y dólares y otros movimientos sin registrar' };
}

function _repInversiones(datos, r) {
  const ventas = (datos.carteraTx || []).filter(x => x && _repEn(x.fecha, r));
  // Las cuentas de inversión que Tobías marcó como líquidas (bonos) ya cuentan en activos líquidos: no se suman dos veces.
  const liquidas = (datos.config && datos.config.cuentasLiquidas) || [];
  const cuentasInv = (datos.cuentas || []).filter(a => _repEsArs(a) && a.type === 'invest' && !liquidas.includes(a.id));
  const invertido = _repSumaSaldos(datos, cuentasInv, r.hasta);
  const out = { noRealizada: _repNulo('La ganancia sin vender no se guarda por período'),
    montoInvertido: invertido == null ? _repNulo('No hay historial de la cuenta de inversión para esa fecha') : { valor: invertido, motivo: 'Capital aportado, no valor de mercado' } };
  if (!ventas.length) return Object.assign(out, { valor: null, motivo: 'No hubo ventas en el período', aciertos: _repNulo('No hubo ventas en el período'), pct: null });
  const gan = ventas.reduce((s, x) => s + (+x.resultado || 0), 0), costo = ventas.reduce((s, x) => s + (+x.costo || 0), 0);
  return Object.assign(out, { valor: _repRedondeo(gan), pct: costo > 0 ? _repRedondeo(gan / costo * 100, 1) : null, aciertos: _repAciertos(datos, r) });
}

// Aciertos por OPERACIÓN CERRADA (activo vendido por completo), no por venta parcial: misma regla que carteraCiclosCerrados
// (finanzas.js:298): ventas del símbolo en orden (ts, fecha, id), un ciclo termina en la venta con `cierra`; su resultado es la suma
// de los resultados del ciclo y cuenta en el período de su última venta. Resultado 0 = neutra: no es acierto ni error, queda fuera
// del denominador y se informa aparte en `neutras`.
function _repAciertos(datos, r) {
  const por = {};
  (datos.carteraTx || []).forEach(x => { if (x && x.simbolo) (por[x.simbolo] = por[x.simbolo] || []).push(x); });
  let ganadoras = 0, perdedoras = 0, neutras = 0;
  Object.keys(por).forEach(sim => {
    const rec = por[sim].slice().sort((a, b) => ((+a.ts || 0) - (+b.ts || 0)) || String(a.fecha).localeCompare(String(b.fecha)) || String(a.id).localeCompare(String(b.id)));
    let ciclo = [];
    rec.forEach(x => {
      ciclo.push(x);
      if (!x.cierra) return;
      if (_repEn(x.fecha, r)) {
        const res = _repRedondeo(ciclo.reduce((s, y) => s + (+y.resultado || 0), 0));
        if (res > 0) ganadoras++; else if (res < 0) perdedoras++; else neutras++;
      }
      ciclo = [];
    });
  });
  const n = ganadoras + perdedoras;
  if (!n) return _repNulo('No se cerró ninguna operación con ganancia o pérdida en el período');
  return { valor: _repRedondeo(ganadoras / n * 100, 0), ganadoras, perdedoras, neutras, operaciones: n };
}

function _repPresupuesto(datos, r) {
  if (_repSemanal(r)) return _repNulo('El presupuesto es mensual: no se mide en una semana');
  const bud = datos.budgets || {};
  let presup = 0; const porCatP = {};
  for (const mk of repMeses(r)) {
    const b = bud[mk];
    if (!b) return _repNulo('Falta el presupuesto de ' + mk);
    // Mismas partes que _budgetMonthTotal (finanzas.js:3290): fijos (v1×v2×v3), reservados, estacionales y fondos del mes.
    (b.fixed || []).forEach(it => { const m = (+it.v1 || 0) * (+it.v2 || 0) * (+it.v3 || 0); presup += m; if (it.category) porCatP[it.category] = (porCatP[it.category] || 0) + m; });
    ['reserved', 'seasonal'].forEach(k => (b[k] || []).forEach(it => { const m = +it.amount || 0; presup += m; if (it.category) porCatP[it.category] = (porCatP[it.category] || 0) + m; }));
    presup += +((datos.fondosMes || {})[mk]) || 0;
  }
  if (!(presup > 0)) return _repNulo('No hay presupuesto cargado');
  const g = _repGastos(datos, r, false);
  const excedidas = Object.keys(porCatP).filter(c => (g.porCat[c] || 0) > porCatP[c])
    .map(c => ({ categoria: c, presupuesto: _repRedondeo(porCatP[c]), gastado: _repRedondeo(g.porCat[c]) }));
  return { valor: _repRedondeo(g.total / presup * 100, 1), gastado: g.total, presupuestado: _repRedondeo(presup), excedidas };
}

function _repUtilidad(datos, r) {
  let good = 0, bad = 0, total = 0;
  const sem = _repSemanal(r);   // misma base que gastos: en semanal, sin cuotas de tarjeta del día 1
  (datos.transactions || []).forEach(t => {
    if (!_repEsGasto(t) || !_repEn(t.date, r) || (sem && _repEsCuotaDia1(t, datos))) return;
    const m = +t.amount || 0; total += m;
    if (t.verdict === 'good') good += m; else if (t.verdict === 'bad') bad += m;
  });
  const clas = good + bad;
  if (!(clas > 0)) return _repNulo('No hay gastos marcados con el pulgar en el período');
  const pctClas = total > 0 ? _repRedondeo(clas / total * 100, 0) : 0;
  return { valor: _repRedondeo(bad / clas * 100, 0), utiles: _repRedondeo(good), inutiles: _repRedondeo(bad), pctClasificado: pctClas,
    pocoClasificado: pctClas < 50, aviso: pctClas < 50 ? 'Poco clasificado: marcaste menos de la mitad del gasto' : undefined };
}

function _repTasaAhorro(datos, r) {
  let ing = 0;
  (datos.transactions || []).forEach(t => { if (t && _repEn(t.date, r) && _repEsIngreso(t)) ing += +t.amount || 0; });
  const gas = _repGastos(datos, r, _repSemanal(r)).total;   // gasto neto de reintegros, misma base que el KPI de gastos
  if (!(ing > 0)) return _repNulo('Sin ingresos en el período');
  return { valor: _repRedondeo((ing - gas) / ing * 100, 1), ingresos: _repRedondeo(ing), gastos: _repRedondeo(gas) };
}

function _repCobertura(datos, r) {
  const liq = _repSumaSaldos(datos, _repCuentasLiquidas(datos), r.hasta);
  if (liq == null) return _repNulo('No hay historial de las cuentas para esa fecha');
  const ref = datos.hoy && datos.hoy < r.hasta ? datos.hoy : r.hasta;
  let mk = _repMesAnterior(ref.slice(0, 7)); const gs = [];
  for (let i = 0; i < 3; i++) { gs.push(_repGastos(datos, repRango('mensual', mk), false).total); mk = _repMesAnterior(mk); }
  // Un mes sin gasto registrado no es un mes de gasto cero: promediarlo inflaría la cobertura. Hacen falta los 3 con gasto.
  const conGasto = gs.filter(g => g > 0);
  if (conGasto.length < 3) return _repNulo('hay menos de 3 meses con gastos registrados');
  const prom = conGasto.reduce((a, b) => a + b, 0) / 3;
  return { valor: _repRedondeo(liq / prom, 1), liquidos: liq, gastoPromedio: _repRedondeo(prom) };
}

// datos = { hoy, cuentas: S.accounts, nwHistory, accountHistory, transactions, cards?: [{ id, resetAt, resetDay? }] de S.cards (solo para excluir compras anteriores al arranque de su tarjeta), cardCharges: S.cardCharges (compras con tarjeta: patrimonio, cuotas del día 1 y origen de reintegros), carteraTx, budgets, fondosMes?: {'YYYY-MM': monto}, creditoUsado?, config? (S.reportes.config) }
function repKpiEconomia(datos, rango, rangoAnt) {
  datos = datos || {};
  const semanal = _repSemanal(rango);
  // Gastos por categoría (sin reintegros). En semanal, las cuotas de tarjeta del día 1 van aparte.
  const gA = _repGastos(datos, rango, semanal), gB = rangoAnt ? _repGastos(datos, rangoAnt, semanal) : null;
  const gastos = Object.assign(_repKpi(gA.total, gB ? gB.total : undefined, { menosEsMejor: true }), { porCategoria: [] });
  Object.keys(Object.assign({}, gA.porCat, gB ? gB.porCat : {})).forEach(c => {
    gastos.porCategoria.push(Object.assign({ categoria: c }, _repKpi(_repRedondeo(gA.porCat[c] || 0), gB ? _repRedondeo(gB.porCat[c] || 0) : undefined, { menosEsMejor: true })));
  });
  gastos.porCategoria.sort((a, b) => b.valor - a.valor);
  if (semanal && (gA.cuotasDia1 || (gB && gB.cuotasDia1))) {
    gastos.cuotasTarjetaDia1 = { valor: gA.cuotasDia1, anterior: gB ? gB.cuotasDia1 : undefined };
    gastos.aviso = 'Las cuotas de tarjeta que caen el día 1 no están en estos números: se muestran aparte';
  }
  const inv = _repInversiones(datos, rango), invAnt = rangoAnt ? _repInversiones(datos, rangoAnt) : null;
  if (inv.valor != null && invAnt && invAnt.valor != null) { inv.anterior = invAnt.valor; inv.comparacion = repComparar(inv.valor, invAnt.valor); }
  const liqA = _repSumaSaldos(datos, _repCuentasLiquidas(datos), rango.hasta);
  const liqB = rangoAnt ? _repSumaSaldos(datos, _repCuentasLiquidas(datos), rangoAnt.hasta) : undefined;
  const liquidos = liqA == null ? _repNulo('Fuera del historial de cuentas (unos 400 días)') : _repKpi(liqA, liqB === null ? undefined : liqB);
  // Pasivo: solo se conoce el crédito usado de HOY (no se guarda por fecha) → el resultado vale si el período llega a hoy.
  let pasivoMenosLiquidos;
  if (liqA == null) pasivoMenosLiquidos = _repNulo(liquidos.motivo);
  else if (datos.creditoUsado == null || !(datos.hoy && rango.hasta >= datos.hoy)) pasivoMenosLiquidos = _repNulo('Las deudas de tarjeta no se guardan por fecha: solo se puede calcular en el período en curso');
  else pasivoMenosLiquidos = { valor: _repRedondeo(datos.creditoUsado - liqA), pasivo: _repRedondeo(datos.creditoUsado), liquidos: liqA };
  return {
    patrimonio: _repPar(r => _repPatrimonio(datos, r), rango, rangoAnt),
    inversiones: inv, gastos,
    presupuesto: _repPar(r => _repPresupuesto(datos, r), rango, rangoAnt, { menosEsMejor: true }),
    utilidad: _repPar(r => _repUtilidad(datos, r), rango, rangoAnt, { menosEsMejor: true }),
    activosLiquidos: liquidos, pasivoMenosLiquidos,
    tasaAhorro: _repPar(r => _repTasaAhorro(datos, r), rango, rangoAnt),
    cobertura: _repPar(r => _repCobertura(datos, r), rango, rangoAnt),
  };
}

// finales = S.sgc.finales [{fecha, done, doneEl, aprobo, ...}] (finales.js:13). `finalesAprobados` usa f.fecha (día del examen), no doneEl (día del clic). Cuenta TODOS los cargados (activos y rendidos) por mes de su fecha.
function repExamenesPorMes(finales, rango) {
  const out = {};
  (finales || []).forEach(f => { if (f && _repEn(f.fecha, rango)) { const k = f.fecha.slice(0, 7); out[k] = (out[k] || 0) + 1; } });
  return out;
}
const _repSuma = o => Object.keys(o).reduce((s, k) => s + o[k], 0);

// Racha máxima de días de estudio dentro del rango. Misma regla que habitCurrentStreak (habitos.js:31): hecho suma, descanso es
// neutro, incumplido o sin registrar corta. Solo cuenta días del período (fechas locales).
function _repRachaMax(days, r) {
  let cur = 0, max = 0;
  for (let f = r.desde; f <= r.hasta; f = repSumarDias(f, 1)) {
    const v = (days || {})[f];
    if (v === 'done' || v === 'studied') { cur++; if (cur > max) max = cur; }
    else if (v === 'rest') { /* neutro */ }
    else cur = 0;
  }
  return max;
}

// datos = { lawProgress: S.lawProgress (app.js:53), finales: S.sgc.finales, pomodoroHistory, studyDays: S.studyCalendar.days }
function repKpiConocimiento(datos, rango, rangoAnt) {
  datos = datos || {};
  const materias = ((datos.lawProgress && datos.lawProgress.years) || []).reduce((a, y) => a.concat(y.subjects || []), []);
  const aprobadas = materias.filter(s => s.done);
  const sinFecha = aprobadas.filter(s => !s.doneAt).length;
  const pomo = r => (datos.pomodoroHistory || []).filter(e => e && _repEn(e.date, r));   // pomodoro.js:115
  const horas = r => _repRedondeo(pomo(r).reduce((s, e) => s + (+e.minutes || 0), 0) / 60, 1);
  const grades = r => aprobadas.filter(s => _repEn(s.doneAt, r) && s.grade != null && !isNaN(s.grade)).map(s => +s.grade);
  const prom = a => a.length ? _repRedondeo(a.reduce((x, y) => x + y, 0) / a.length, 2) : null;
  const alCierre = r => aprobadas.filter(s => !s.doneAt || s.doneAt <= r.hasta);   // sin fecha: cuenta desde el principio (convención de abogacia.js:228)
  const kpi = fn => _repPar(fn, rango, rangoAnt);

  const exA = repExamenesPorMes(datos.finales, rango), exB = rangoAnt ? repExamenesPorMes(datos.finales, rangoAnt) : null;
  const nA = _repSuma(exA), nB = exB ? _repSuma(exB) : null;
  const avisoEx = (nB != null && nA !== nB) ? 'Este período tuvo ' + nA + ' exámenes y el anterior ' + nB : undefined;
  const conAviso = k => { if (avisoEx && k.comparacion) k.comparacion.aviso = avisoEx; return k; };

  const out = {
    examenes: { valor: nA, anterior: nB == null ? undefined : nB, porMes: exA, aviso: avisoEx },
    materiasFinalizadas: Object.assign(kpi(r => ({ valor: aprobadas.filter(s => _repEn(s.doneAt, r)).length })), sinFecha ? { sinFecha, aviso: sinFecha + ' sin fecha' } : {}),
    horasEstudio: conAviso(Object.assign(kpi(r => ({ valor: horas(r) })), { etiqueta: 'horas cronometradas' })),
    sesionesPomodoro: conAviso(kpi(r => ({ valor: pomo(r).length }))),
    finalesAprobados: kpi(r => ({ valor: (datos.finales || []).filter(f => f && f.aprobo && _repEn(f.fecha, r)).length })),
    promedioPeriodo: kpi(r => { const p = prom(grades(r)); return p == null ? _repNulo('No hubo notas cargadas en el período') : { valor: p }; }),
    promedioCarrera: kpi(r => { const p = prom(alCierre(r).filter(s => s.grade != null && !isNaN(s.grade)).map(s => +s.grade)); return p == null ? _repNulo('No hay notas cargadas') : { valor: p }; }),
    rachaEstudio: kpi(r => ({ valor: _repRachaMax(datos.studyDays, r) })),
    avanceCarrera: kpi(r => materias.length ? { valor: _repRedondeo(alCierre(r).length / materias.length * 100, 1) } : _repNulo('No hay materias cargadas')),
  };
  if (nA > 0 && nB > 0) {   // con exámenes en ambos períodos, las horas se miden por examen
    out.horasPorExamen = _repKpi(_repRedondeo(horas(rango) / nA, 1), _repRedondeo(horas(rangoAnt) / nB, 1));
    out.horasPorExamen.etiqueta = 'horas cronometradas por examen';
  } else out.horasPorExamen = null;
  return out;
}

const _repNum15 = v => { const n = Math.round(Number(v)); return (n >= 1 && n <= 5) ? n : null; };   // mismo criterio que foNum15 (foco.js:42)
const _repCatsFoco = ['estudio', 'gym', 'trabajo', 'pantalla', 'social', 'descanso', 'otro'];   // FO_CATEGORIAS (foco.js:26)
const _repMinChequeos = 5;   // FO_MIN_CHEQUEOS (foco.js:25)

// datos = { foco: S.foco, sleepLog, workoutLog, dietaLog, dietaMet }; deps = { foArmarCruces } (foco.js:113; opcional, no se lee global).
function repFoco(datos, rango, deps) {
  datos = datos || {}; deps = deps || {};
  const foco = datos.foco || {};
  const dias = {}; let a = 0, e = 0, n = 0;
  Object.keys(foco.dias || {}).forEach(f => {
    if (!_repEn(f, rango)) return;
    const d = foco.dias[f], at = _repNum15(d && d.atencion), en = _repNum15(d && d.energia);
    if (at == null || en == null) return;
    dias[f] = d; a += at; e += en; n++;
  });
  const sinDias = _repNulo('No hay cierres del día en este período');
  const prom = v => ({ valor: _repRedondeo(v / n, 1), dias: n });
  // Pantalla: la clave es el lunes de cada semana; solo cuentan las semanas completas dentro del período.
  let ph = 0, ps = 0;
  Object.keys(foco.pantalla || {}).forEach(l => { if (l >= rango.desde && repSumarDias(l, 6) <= rango.hasta) { ph += +foco.pantalla[l] || 0; ps++; } });
  const rep = {}; let nc = 0;
  (foco.chequeos || []).forEach(c => { if (c && _repEn(c.fecha, rango) && _repCatsFoco.includes(c.categoria)) { rep[c.categoria] = (rep[c.categoria] || 0) + 1; nc++; } });
  const chequeos = nc < _repMinChequeos
    ? { valor: null, n: nc, motivo: 'Faltan datos: ' + nc + ' de ' + _repMinChequeos + ' chequeos en el período' }
    : { valor: nc, n: nc, filas: _repCatsFoco.filter(c => rep[c]).map(c => ({ categoria: c, n: rep[c], pct: Math.round(rep[c] * 100 / nc) })).sort((x, y) => y.n - x.n),
        motivo: 'Es una muestra, no un cronómetro' };
  let cruces = null;   // foArmarCruces ya respeta su mínimo de 10 días con registro
  if (typeof deps.foArmarCruces === 'function') cruces = deps.foArmarCruces({ dias }, { sleepLog: datos.sleepLog || {}, workoutLog: datos.workoutLog || {}, dietaLog: datos.dietaLog || {}, dietaMet: datos.dietaMet || null });
  return {
    atencion: n ? prom(a) : sinDias, energia: n ? prom(e) : sinDias,
    pantalla: ps ? { valor: _repRedondeo(ph / ps, 1), semanas: ps, total: _repRedondeo(ph, 1), motivo: 'Promedio de horas por semana completa' } : _repNulo('No hay semanas completas con tiempo de pantalla cargado'),
    chequeos, cruces,
  };
}

const CMReportes = { repFecha, repParse, repSumarDias, repDiasEntre, repRango, repClaveDe, repAnterior, repMeses, repParcial, repRangoComparable, repComparar, repHabitos, repHabitosComparados, repObjetivosPorCategoria, repMetasMensuales, repExamenesPorMes, repKpiEconomia, repKpiConocimiento, repFoco };
if (typeof window !== 'undefined') window.CMReportes = CMReportes;
if (typeof module !== 'undefined' && module.exports) module.exports = CMReportes;
