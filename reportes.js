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
// 'partial' va aparte: no suma al conteo principal. Los hábitos sin registros aparecen con 0.
function repHabitos(trackers, rango) {
  const out = [];
  Object.keys(trackers || {}).forEach(seccion => (trackers[seccion] || []).forEach(h => {
    let done = 0, partial = 0;
    const days = h.days || {};
    Object.keys(days).forEach(f => {
      if (f < rango.desde || f > rango.hasta) return;
      if (days[f] === 'done') done++; else if (days[f] === 'partial') partial++;
    });
    out.push({ seccion, id: h.id, nombre: h.name || h.nombre || '', done, partial });
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

const CMReportes = { repFecha, repParse, repSumarDias, repDiasEntre, repRango, repClaveDe, repAnterior, repMeses, repParcial, repRangoComparable, repComparar, repHabitos, repObjetivosPorCategoria };
if (typeof window !== 'undefined') window.CMReportes = CMReportes;
if (typeof module !== 'undefined' && module.exports) module.exports = CMReportes;
