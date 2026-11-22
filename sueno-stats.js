'use strict';
// ════════════════════════════════════════════════════════════════════════
// SUEÑO — estadísticas de horarios (acostarse / levantarse). Núcleo PURO: sin DOM ni `S` global, recibe el log por parámetro.
// log = S.sleepLog: { 'YYYY-MM-DD': { bedtime:'HH:MM', waketime:'HH:MM', hours, wellness, notes } } (la fecha es la del día de registro).
// rango = { desde, hasta } ambos inclusive, 'YYYY-MM-DD'.
// Horas de reloj en "minutos del día": levantarse = 0..1439. Acostarse usa el día corrido desde el mediodía
// (00:30 vale 24:30 = 1470) para que 23:30 y 00:30 promedien 00:00 y no 12:00. Se muestra con fmtHora (que hace % 1440).
// Navegador: window.CMSueno. Node: module.exports (mismo patrón que reportes.js).
// ════════════════════════════════════════════════════════════════════════
(function (global) {
  const MIN_REGULARIDAD = 3;   // con menos noches con horario no se calcula el desvío (sería un número sin sentido)
  const _p = n => String(n).padStart(2, '0');

  // 'HH:MM' → minutos desde medianoche (0..1439); null si no es una hora válida.
  function horaAMin(h) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(h == null ? '' : h).trim());
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    return +m[1] * 60 + +m[2];
  }
  // minutos (aunque pasen de 1440) → 'HH:MM'
  function fmtHora(min) {
    if (min == null || !isFinite(min)) return null;
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return _p(Math.floor(m / 60)) + ':' + _p(m % 60);
  }
  const _minNoche = m => (m < 720 ? m + 1440 : m);   // día corrido desde el mediodía
  const acostarseAMin = h => { const m = horaAMin(h); return m == null ? null : _minNoche(m); };

  // Mismo cálculo que _sleepCalcHours de app.js (cruza medianoche si despertar <= acostarse; redondeo a .5).
  function calcHoras(bedtime, waketime) {
    const b = horaAMin(bedtime), w = horaAMin(waketime);
    if (b == null || w == null) return null;
    let d = w - b; if (d <= 0) d += 1440;
    const h = Math.round(d / 60 * 2) / 2;
    return h > 0 ? h : null;
  }

  // Noches del rango, ordenadas por fecha: { fecha, bed (día corrido desde mediodía | null), wake (0..1439 | null), horas | null }
  function noches(log, rango) {
    const out = [];
    Object.keys(log || {}).sort().forEach(f => {
      if (!rango || f < rango.desde || f > rango.hasta) return;
      const e = log[f]; if (!e || typeof e !== 'object') return;
      let horas = e.hours != null && isFinite(+e.hours) && +e.hours > 0 ? +e.hours : null;
      const c = calcHoras(e.bedtime, e.waketime); if (c !== null) horas = c;
      const bed = acostarseAMin(e.bedtime), wake = horaAMin(e.waketime);
      if (bed == null && wake == null && horas == null) return;
      out.push({ fecha: f, bed, wake, horas });
    });
    return out;
  }

  const _media = a => a.reduce((s, x) => s + x, 0) / a.length;
  const _desvio = a => { const m = _media(a); return Math.sqrt(_media(a.map(x => (x - m) * (x - m)))); };   // poblacional
  const _r1 = n => Math.round(n * 10) / 10;

  function textoRegularidad(desvioMin) {
    if (desvioMin == null || !isFinite(desvioMin)) return null;
    return desvioMin <= 20 ? 'muy regular' : desvioMin <= 45 ? 'regular' : 'irregular';
  }

  // Resumen del rango. Todo es null cuando no hay datos de eso (nunca 0 engañoso).
  // desvio = promedio de los desvíos de acostarse y levantarse (o el único que haya); regularidad = su texto.
  function resumen(log, rango) {
    const ns = noches(log, rango);
    const hs = ns.map(n => n.horas).filter(h => h != null);
    const beds = ns.map(n => n.bed).filter(x => x != null);
    const wakes = ns.map(n => n.wake).filter(x => x != null);
    const bedMin = beds.length ? Math.round(_media(beds)) : null;
    const wakeMin = wakes.length ? Math.round(_media(wakes)) : null;
    const bedDesvio = beds.length >= MIN_REGULARIDAD ? Math.round(_desvio(beds)) : null;
    const wakeDesvio = wakes.length >= MIN_REGULARIDAD ? Math.round(_desvio(wakes)) : null;
    const ds = [bedDesvio, wakeDesvio].filter(x => x != null);
    const desvio = ds.length ? Math.round(_media(ds)) : null;
    return {
      noches: hs.length, horasProm: hs.length ? _r1(_media(hs)) : null,
      bedN: beds.length, wakeN: wakes.length,
      bedMin, wakeMin, bed: fmtHora(bedMin), wake: fmtHora(wakeMin),
      bedDesvio, wakeDesvio, desvio, regularidad: textoRegularidad(desvio),
    };
  }

  // Franja [desde, hasta] 'HH:MM', inclusive; si desde > hasta la franja cruza la medianoche.
  function _enFranja(min, a, b) { return a <= b ? (min >= a && min <= b) : (min >= a || min <= b); }

  // % (0-100, un decimal) de los días CON hora de levantarse registrada en que te levantaste dentro de la franja. null si no hay registros.
  function pctDiasLevantarEnFranja(log, rango, desde, hasta) {
    const a = horaAMin(desde), b = horaAMin(hasta);
    if (a == null || b == null) return null;
    const w = noches(log, rango).map(n => n.wake).filter(x => x != null);
    if (!w.length) return null;
    return _r1(w.filter(m => _enFranja(m, a, b)).length * 100 / w.length);
  }
  // % de las noches CON hora de acostarse registrada en que te acostaste a más tardar a `hora` (inclusive). 23:50 y 00:10 son "antes" de 00:30.
  function pctNochesAcostarseAntes(log, rango, hora) {
    const h = acostarseAMin(hora);
    if (h == null) return null;
    const b = noches(log, rango).map(n => n.bed).filter(x => x != null);
    if (!b.length) return null;
    return _r1(b.filter(m => m <= h).length * 100 / b.length);
  }
  // % de las noches con horas conocidas en que dormiste al menos `horas`.
  function pctNochesHorasMin(log, rango, horas) {
    if (horas == null || !isFinite(+horas)) return null;
    const hs = noches(log, rango).map(n => n.horas).filter(x => x != null);
    if (!hs.length) return null;
    return _r1(hs.filter(x => x >= +horas).length * 100 / hs.length);
  }

  const CMSueno = { horaAMin, fmtHora, acostarseAMin, calcHoras, noches, resumen, textoRegularidad, pctDiasLevantarEnFranja, pctNochesAcostarseAntes, pctNochesHorasMin, MIN_REGULARIDAD };
  global.CMSueno = CMSueno;
  if (typeof module !== 'undefined' && module.exports) module.exports = CMSueno;
})(typeof window !== 'undefined' ? window : globalThis);
