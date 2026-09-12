'use strict';
/* ══════════════════════════════════════════════════════════════════════
   🔗 RELACIONES — motor de correlaciones entre las series diarias que ya
   registra la app (sueño, planner, metas, hábitos, entrenamiento, estudio,
   dieta, gasto). El usuario es economista: nada de explicar qué es una
   correlación, sí exigir rigor (n mínimo, varianza mínima, ausencia de
   dato ≠ cero, relación ≠ causalidad).

   Estructura del archivo (contrato tipo informes-datos.js):
   - PARTE PURA: mean/stddev/pearson/emparejarSeries/evaluarPar — reciben
     arrays/objetos, nunca tocan `S` ni el DOM. Exportadas aparte
     (CMCorrelacionesCalc) para poder testearlas desde Node.
   - Construcción de series diarias desde `S` (no reusa los extractores de
     informes-datos.js: esos calculan UN agregado por rango [desde,hasta],
     no una serie día a día — ver reporte del ticket T2).
   - Motor de correlación (matriz de pares + lag ±1) con caché por ventana.
   - UI: tarjeta auto-montada en #tab-vida (mismo patrón que errores.js).
   Solo se auto-monta el DOM si `document` existe — el resto del archivo
   corre también en Node para poder verificar el cálculo a mano.
   ══════════════════════════════════════════════════════════════════════ */
(function (global) {

  // ── Fechas: SIEMPRE hora local (nunca toISOString) ──
  function _pad2(n) { return String(n).padStart(2, '0'); }
  function _localStrFecha(d) { return d.getFullYear() + '-' + _pad2(d.getMonth() + 1) + '-' + _pad2(d.getDate()); }
  function _hoy() { return (typeof getActiveDate === 'function') ? getActiveDate() : _localStrFecha(new Date()); }
  function _parseFecha(ds) { var p = ds.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12, 0, 0); }
  function _addDias(ds, n) { var d = _parseFecha(ds); d.setDate(d.getDate() + n); return _localStrFecha(d); }
  function _ultimosNDias(n) {
    var out = [], hoy = _hoy();
    for (var i = n - 1; i >= 0; i--) out.push(_addDias(hoy, -i));
    return out;
  }

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // ════════════════════════════════════════════════════════════════════
  // PARTE PURA — cálculo. Sin `S`, sin DOM.
  // ════════════════════════════════════════════════════════════════════

  function mean(arr) {
    if (!arr.length) return null;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function stddev(arr) {
    if (arr.length < 2) return 0;
    var m = mean(arr), s = 0;
    for (var i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
    return Math.sqrt(s / arr.length);
  }

  // Pearson (fórmula de sumas). null si no se puede calcular (nunca 0 disfrazado).
  function pearson(xs, ys) {
    var n = xs.length;
    if (n < 2 || ys.length !== n) return null;
    var sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < n; i++) {
      var x = xs[i], y = ys[i];
      sx += x; sy += y; sxy += x * y; sxx += x * x; syy += y * y;
    }
    var den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    if (!den) return null;
    return (n * sxy - sx * sy) / den;
  }

  // Empareja dos series diarias {fecha:valor}, desplazando la lectura de Y por
  // `offsetDias` respecto de la fecha ancla. Un día solo entra al par si AMBAS
  // series tienen dato real ahí — un día sin registrar NO es un cero, se excluye.
  function emparejarSeries(serieX, serieY, offsetDias, fechasAncla) {
    var xs = [], ys = [], fechas = [];
    for (var i = 0; i < fechasAncla.length; i++) {
      var d = fechasAncla[i];
      var dy = offsetDias ? _addDias(d, offsetDias) : d;
      var vx = serieX[d], vy = serieY[dy];
      if (vx == null || vy == null || !isFinite(vx) || !isFinite(vy)) continue;
      xs.push(vx); ys.push(vy); fechas.push(d);
    }
    return { xs: xs, ys: ys, fechas: fechas, n: xs.length };
  }

  var N_MIN = 20;
  var EPS_VARIANZA = 1e-9;

  function fuerzaDeR(absR) {
    if (absR < 0.2) return 'sin relación visible';
    if (absR < 0.4) return 'débil';
    if (absR < 0.6) return 'moderada';
    return 'fuerte';
  }

  // Aplica las reglas duras de honestidad sobre un par ya emparejado.
  function evaluarPar(par) {
    if (par.n < N_MIN) return { estado: 'sin_datos', n: par.n, faltan: N_MIN - par.n };
    var sdX = stddev(par.xs), sdY = stddev(par.ys);
    if (sdX < EPS_VARIANZA || sdY < EPS_VARIANZA) return { estado: 'sin_variacion', n: par.n };
    var r = pearson(par.xs, par.ys);
    if (r == null) return { estado: 'sin_variacion', n: par.n };
    return { estado: 'ok', n: par.n, r: r, fuerza: fuerzaDeR(Math.abs(r)) };
  }

  // Expuesto aparte de la API pública: motor puro testeable desde Node sin DOM.
  global.CMCorrelacionesCalc = { mean: mean, stddev: stddev, pearson: pearson, emparejarSeries: emparejarSeries, evaluarPar: evaluarPar, fuerzaDeR: fuerzaDeR };

  // ════════════════════════════════════════════════════════════════════
  // Series diarias desde `S` — NO se reusan los extractores de
  // informes-datos.js: su `calc(desde,hasta)` devuelve UN agregado del
  // rango completo (para el informe mensual/trimestral), no un valor por
  // día — acá se necesita el punto diario para poder cruzar dos variables
  // fecha a fecha. Donde la regla de negocio coincide (ej. umbral de
  // dieta, 'rest' no cuenta en hábitos) se reimplementa igual, en pocas
  // líneas, porque esas funciones tampoco están expuestas en
  // window.CMInformesData (viven cerradas dentro de su IIFE).
  // ════════════════════════════════════════════════════════════════════

  function ST() { return (typeof S !== 'undefined' && S) ? S : {}; }

  function serieSleepHoras() {
    var out = {}, log = ST().sleepLog || {};
    Object.keys(log).forEach(function (d) {
      var h = log[d] && log[d].hours;
      if (h != null && isFinite(+h)) out[d] = +h;
    });
    return out;
  }
  function serieSleepFeeling() {
    var out = {}, log = ST().sleepLog || {};
    Object.keys(log).forEach(function (d) {
      var f = log[d] && log[d].feeling;
      if (f != null && isFinite(+f)) out[d] = +f;
    });
    return out;
  }
  function seriePlannerPct() {
    var out = {}, dp = ST().dayPlan || {};
    Object.keys(dp).forEach(function (d) {
      var tasks = (dp[d] && dp[d].tasks) || [];
      if (!tasks.length) return; // sin tareas planificadas: no hay dato de cumplimiento ese día
      var done = tasks.filter(function (t) { return t.done; }).length;
      out[d] = done / tasks.length * 100;
    });
    return out;
  }
  function serieGoalsPct() {
    var out = {}, g = ST().goals || {};
    Object.keys(g).forEach(function (d) {
      var arr = g[d] || [];
      if (!arr.length) return;
      var done = arr.filter(function (x) { return x.done; }).length;
      out[d] = done / arr.length * 100;
    });
    return out;
  }
  // % de cumplimiento diario de hábitos (mismo criterio que _fraccionPeriodo de
  // informes-datos.js: 'rest' no entra al denominador, 'done'/'studied'=1, 'partial'=0.5).
  function _pctHabitosPorDia(secciones) {
    var out = {}, porDia = {};
    secciones.forEach(function (sec) {
      var habitos = (ST().habitTrackers && ST().habitTrackers[sec]) || [];
      habitos.forEach(function (h) {
        var days = h.days || {};
        Object.keys(days).forEach(function (d) {
          var v = days[d];
          if (v === 'rest') return;
          if (!porDia[d]) porDia[d] = { num: 0, den: 0 };
          porDia[d].den++;
          if (v === 'done' || v === 'studied') porDia[d].num += 1;
          else if (v === 'partial') porDia[d].num += 0.5;
        });
      });
    });
    Object.keys(porDia).forEach(function (d) {
      if (porDia[d].den > 0) out[d] = porDia[d].num / porDia[d].den * 100;
    });
    return out;
  }
  function serieEntrenoBool() {
    var out = {}, days = (ST().workoutCalendar && ST().workoutCalendar.days) || {};
    Object.keys(days).forEach(function (d) {
      if (days[d] === 'done') out[d] = 1;
      else if (days[d] === 'rest') out[d] = 0; // día marcado a propósito: es dato, no ausencia
    });
    return out;
  }
  function serieVolumenEntreno() {
    var out = {}, rl = ST().routineLog || {};
    Object.keys(rl).forEach(function (rid) {
      (rl[rid] || []).forEach(function (e) {
        if (!e || !e.date) return;
        var v = +e.vol;
        if (!isFinite(v)) return;
        out[e.date] = (out[e.date] || 0) + v;
      });
    });
    return out;
  }
  function serieEstudioBool() {
    var out = {}, days = (ST().studyCalendar && ST().studyCalendar.days) || {};
    Object.keys(days).forEach(function (d) {
      if (days[d] === 'done' || days[d] === 'studied') out[d] = 1;
      else if (days[d] === 'rest') out[d] = 0;
    });
    return out;
  }
  function serieFocoMinutos() {
    var out = {};
    (ST().pomodoroHistory || []).forEach(function (e) {
      if (!e || !e.date) return;
      var m = +e.minutes;
      if (!isFinite(m)) return;
      out[e.date] = (out[e.date] || 0) + m;
    });
    return out;
  }
  // Mismo umbral que salud_dieta_pct de informes-datos.js. Limitación heredada
  // del propio S.dieta.log (app.js): si el usuario destilda todas las reglas
  // de un día, la clave se borra (arr.length===0 → delete) — ese día vuelve a
  // verse igual que "nunca registrado". No es un bug de este archivo, es el
  // modelo de datos existente; no se toca (fuera del alcance de este ticket).
  function serieDietaCumple() {
    var out = {}, dieta = ST().dieta;
    if (!dieta || !Array.isArray(dieta.reglas) || !dieta.reglas.length) return out;
    var umbral = Math.min(dieta.umbral != null ? dieta.umbral : 1, dieta.reglas.length);
    var log = dieta.log || {};
    Object.keys(log).forEach(function (d) {
      out[d] = (log[d] || []).length >= umbral ? 1 : 0;
    });
    return out;
  }
  // Solo ARS (mezclar monedas distintas en una suma no significa nada). Un día
  // cuenta como dato si tuvo AL MENOS una transacción ARS ese día (ingreso o
  // gasto) — así se puede distinguir "gastó 0 de verdad" (hubo actividad
  // registrada) de "no usó la app ese día" (no hay ninguna transacción).
  function serieGastoDia() {
    var out = {};
    (ST().transactions || []).forEach(function (t) {
      if (!t || !t.date || t.currency !== 'ARS') return;
      if (out[t.date] == null) out[t.date] = 0;
      if (t.type === 'expense') {
        var a = +t.amount;
        if (isFinite(a)) out[t.date] += a;
      }
    });
    return out;
  }

  var VARS = [
    { id: 'sleep_hours', label: 'Horas de sueño', unidad: 'h', sube: 'dormís más', baja: 'dormís menos', build: serieSleepHoras },
    { id: 'sleep_feeling', label: 'Sensación al dormir', unidad: 'pts', sube: 'descansás mejor', baja: 'descansás peor', build: serieSleepFeeling },
    { id: 'planner_pct', label: 'Cumplimiento del planner', unidad: '%', sube: 'cumplís más del planner', baja: 'cumplís menos del planner', build: seriePlannerPct },
    { id: 'goals_pct', label: 'Metas del día', unidad: '%', sube: 'cumplís más metas del día', baja: 'cumplís menos metas del día', build: serieGoalsPct },
    { id: 'habits_total_pct', label: 'Hábitos (total)', unidad: '%', sube: 'cumplís más tus hábitos', baja: 'cumplís menos tus hábitos', esTotal: true, build: function () { return _pctHabitosPorDia(['vida', 'finanzas', 'salud', 'conocimiento', 'ia']); } },
    { id: 'habits_vida_pct', label: 'Hábitos de Vida', unidad: '%', sube: 'cumplís más hábitos de Vida', baja: 'cumplís menos hábitos de Vida', padre: 'habits_total_pct', build: function () { return _pctHabitosPorDia(['vida']); } },
    { id: 'habits_finanzas_pct', label: 'Hábitos de Finanzas', unidad: '%', sube: 'cumplís más hábitos de Finanzas', baja: 'cumplís menos hábitos de Finanzas', padre: 'habits_total_pct', build: function () { return _pctHabitosPorDia(['finanzas']); } },
    { id: 'habits_salud_pct', label: 'Hábitos de Salud', unidad: '%', sube: 'cumplís más hábitos de Salud', baja: 'cumplís menos hábitos de Salud', padre: 'habits_total_pct', build: function () { return _pctHabitosPorDia(['salud']); } },
    { id: 'habits_conocimiento_pct', label: 'Hábitos de Conocimiento', unidad: '%', sube: 'cumplís más hábitos de Conocimiento', baja: 'cumplís menos hábitos de Conocimiento', padre: 'habits_total_pct', build: function () { return _pctHabitosPorDia(['conocimiento']); } },
    { id: 'habits_ia_pct', label: 'Hábitos de IA', unidad: '%', sube: 'cumplís más hábitos de IA', baja: 'cumplís menos hábitos de IA', padre: 'habits_total_pct', build: function () { return _pctHabitosPorDia(['ia']); } },
    { id: 'trained_bool', label: 'Entrenamiento', unidad: '', sube: 'entrenás', baja: 'no entrenás', build: serieEntrenoBool },
    { id: 'training_volume', label: 'Volumen entrenado', unidad: 'kg-vol', sube: 'levantás más volumen', baja: 'levantás menos volumen', build: serieVolumenEntreno },
    { id: 'studied_bool', label: 'Estudio', unidad: '', sube: 'estudiás', baja: 'no estudiás', build: serieEstudioBool },
    { id: 'focus_minutes', label: 'Minutos de foco', unidad: 'min', sube: 'sumás más minutos de foco', baja: 'sumás menos minutos de foco', build: serieFocoMinutos },
    { id: 'diet_pct', label: 'Dieta', unidad: '', sube: 'cumplís la dieta', baja: 'no cumplís la dieta', build: serieDietaCumple },
    { id: 'expense_day', label: 'Gasto del día', unidad: 'ARS', sube: 'gastás más', baja: 'gastás menos', build: serieGastoDia },
  ];

  // Evita correlacionar un agregado con su propia parte (ej. "Hábitos total"
  // vs "Hábitos de Vida"): es tautológico, no una relación real.
  function _esParTautologico(a, b) {
    return (a.esTotal && b.padre === a.id) || (b.esTotal && a.padre === b.id);
  }

  // ════════════════════════════════════════════════════════════════════
  // Motor: matriz de pares × {mismo día, lag+1 en cada dirección}
  // ════════════════════════════════════════════════════════════════════

  function calcularCorrelaciones(ventanaDias) {
    var fechas = _ultimosNDias(ventanaDias);
    var series = {};
    VARS.forEach(function (v) { series[v.id] = v.build(); });

    var ok = [];
    var mejorFaltante = null;

    for (var i = 0; i < VARS.length; i++) {
      for (var j = i + 1; j < VARS.length; j++) {
        var A = VARS[i], B = VARS[j];
        if (_esParTautologico(A, B)) continue;

        var tests = [
          { lider: A, seguidor: B, offset: 0, mismoDia: true },
          { lider: A, seguidor: B, offset: 1, mismoDia: false },
          { lider: B, seguidor: A, offset: 1, mismoDia: false },
        ];
        tests.forEach(function (t) {
          var par = emparejarSeries(series[t.lider.id], series[t.seguidor.id], t.offset, fechas);
          var ev = evaluarPar(par);
          if (ev.estado === 'ok') {
            ok.push({
              lider: t.lider, seguidor: t.seguidor, mismoDia: t.mismoDia,
              r: ev.r, n: ev.n, fuerza: ev.fuerza,
              xs: par.xs, ys: par.ys, fechas: par.fechas,
            });
          } else if (ev.estado === 'sin_datos') {
            if (!mejorFaltante || ev.n > mejorFaltante.n) {
              mejorFaltante = { lider: t.lider, seguidor: t.seguidor, n: ev.n, faltan: ev.faltan };
            }
          }
        });
      }
    }

    ok.sort(function (p, q) { return Math.abs(q.r) - Math.abs(p.r); });
    return { ventanaDias: ventanaDias, top: ok.slice(0, 5), todas: ok, mejorFaltante: mejorFaltante };
  }

  // ── Caché por ventana: no recalcula salvo cambio de día activo o pedido explícito ──
  var _cache = {};
  function calcular(ventanaDias, forzar) {
    ventanaDias = [30, 90, 365].indexOf(ventanaDias) !== -1 ? ventanaDias : 90;
    var hoy = _hoy();
    var c = _cache[ventanaDias];
    if (!forzar && c && c.activeDate === hoy) return c.data;
    var data = calcularCorrelaciones(ventanaDias);
    _cache[ventanaDias] = { activeDate: hoy, data: data };
    return data;
  }

  function _cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function _clauseDir(v, positivo) { return positivo ? v.sube : v.baja; }

  function frasePar(e) {
    var positivo = e.r >= 0;
    var izq = _cap(e.lider.sube);
    var der = e.mismoDia ? _clauseDir(e.seguidor, positivo) : ('al día siguiente ' + _clauseDir(e.seguidor, positivo));
    return izq + ' → ' + der + ' · r ' + e.r.toFixed(2) + ' (' + e.fuerza + ') · ' + e.n + ' días';
  }

  function _mensajeVacio(datos) {
    if (datos.mejorFaltante) {
      var mf = datos.mejorFaltante;
      return 'Todavía no hay suficientes días con ambos datos cargados. La más cerca de calcularse es "' +
        mf.lider.label + '" con "' + mf.seguidor.label + '": faltan ' + mf.faltan + ' días más con los dos registrados.';
    }
    return 'Todavía no hay suficiente cruce de datos. Registrá sueño, planner, hábitos y entrenamiento seguido para que esto empiece a servir.';
  }

  // ════════════════════════════════════════════════════════════════════
  // UI — se auto-monta en #tab-vida (patrón de errores.js). Nada de esto
  // corre si no hay `document` (ej. al requerir el archivo desde Node).
  // ════════════════════════════════════════════════════════════════════

  var VENTANA_KEY = 'cm_correlaciones_ventana';
  function _leerVentana() {
    try {
      var v = parseInt(localStorage.getItem(VENTANA_KEY), 10);
      return [30, 90, 365].indexOf(v) !== -1 ? v : 90;
    } catch (e) { return 90; }
  }
  function _guardarVentana(v) {
    try { localStorage.setItem(VENTANA_KEY, String(v)); } catch (e) {}
  }

  var _ventanaSel = _leerVentana();
  var _abiertoIdx = null;
  var _chartInst = null;

  function _reduceMotion() {
    try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }
  function _fs(n) { return (typeof _cfs === 'function') ? _cfs(n) : n; }
  function _fmtN(n) { return (Math.round(n * 10) / 10).toString(); }

  function ensureStyle() {
    if (document.getElementById('cm-correlaciones-style')) return;
    var style = document.createElement('style');
    style.id = 'cm-correlaciones-style';
    style.textContent =
      '#correlaciones-card .corr-banner{font-size:var(--fs-12-5);color:var(--tt);margin-bottom:11px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:rgba(120,180,230,.05)}' +
      '#correlaciones-card .corr-seg{margin-bottom:12px}' +
      '#correlaciones-card .corr-list{display:flex;flex-direction:column;gap:8px}' +
      '#correlaciones-card .corr-item{width:100%;text-align:left;font-family:var(--sans);font-size:var(--fs-13);line-height:1.4;color:var(--tp);background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 12px;cursor:pointer;transition:border-color .12s,background .12s}' +
      '#correlaciones-card .corr-item:hover{border-color:color-mix(in srgb, var(--accent) 40%, var(--border))}' +
      '#correlaciones-card .corr-item.abierto{border-color:var(--accent);background:color-mix(in srgb, var(--accent) 8%, var(--card))}' +
      '#correlaciones-card .corr-scatter-wrap{position:relative;height:220px;width:100%;margin:2px 0 4px;padding:8px 4px 2px;border:1px solid var(--border);border-radius:9px;background:var(--card)}' +
      '@media (min-width:900px){#correlaciones-card .corr-scatter-wrap{height:280px}}' +
      '@media (prefers-reduced-motion: reduce){#correlaciones-card *{transition:none!important;animation:none!important}}';
    document.head.appendChild(style);
  }

  function ensureCard() {
    var existing = document.getElementById('correlaciones-card');
    if (existing) return existing;
    var tab = document.getElementById('tab-vida');
    if (!tab) return null;
    var card = document.createElement('div');
    card.className = 'card';
    card.id = 'correlaciones-card';
    card.innerHTML = '<div class="card-title"><span>🔗 Relaciones</span></div><div id="correlaciones-card-body"></div>';
    tab.appendChild(card);
    return card;
  }

  function _dibujarScatter(entry) {
    var cv = document.getElementById('corr-scatter-cv');
    if (!cv || typeof Chart === 'undefined') return;
    if (_chartInst) { try { _chartInst.destroy(); } catch (e) {} _chartInst = null; }
    var puntos = entry.xs.map(function (x, i) { return { x: x, y: entry.ys[i] }; });
    var cs = getComputedStyle(document.documentElement);
    var colorPunto = (cs.getPropertyValue('--hud') || '#38BDF8').trim();
    var colorTexto = (cs.getPropertyValue('--ts') || '#8BA5C0').trim();
    var colorGrid = (cs.getPropertyValue('--border') || 'rgba(100,155,220,0.15)').trim();
    var uL = entry.lider.unidad ? ' (' + entry.lider.unidad + ')' : '';
    var uS = entry.seguidor.unidad ? ' (' + entry.seguidor.unidad + ')' : '';
    _chartInst = new Chart(cv.getContext('2d'), {
      type: 'scatter',
      data: { datasets: [{ data: puntos, backgroundColor: colorPunto, borderColor: colorPunto, pointRadius: 4, pointHoverRadius: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: _reduceMotion() ? false : { duration: 350 },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (ctx) {
            return entry.lider.label + ': ' + _fmtN(ctx.parsed.x) + entry.lider.unidad + ' · ' + entry.seguidor.label + ': ' + _fmtN(ctx.parsed.y) + entry.seguidor.unidad;
          } } },
        },
        scales: {
          x: { title: { display: true, text: entry.lider.label + uL, color: colorTexto, font: { size: _fs(12) } }, ticks: { color: colorTexto, font: { size: _fs(11) } }, grid: { color: colorGrid } },
          y: { title: { display: true, text: entry.seguidor.label + uS, color: colorTexto, font: { size: _fs(12) } }, ticks: { color: colorTexto, font: { size: _fs(11) } }, grid: { color: colorGrid } },
        },
      },
    });
  }

  function render() {
    if (typeof document === 'undefined') return;
    ensureStyle();
    var card = ensureCard();
    if (!card) return;
    var body = card.querySelector('#correlaciones-card-body');
    if (!body) return;

    var datos = calcular(_ventanaSel, false);

    var html = '<div class="corr-banner">Esto muestra relación, no causalidad.</div>';
    html += '<div class="seg seg-sm corr-seg" id="corr-seg" role="group" aria-label="Ventana de tiempo">' +
      [30, 90, 365].map(function (v) {
        return '<button type="button" data-v="' + v + '" aria-pressed="' + (v === _ventanaSel ? 'true' : 'false') + '" class="' + (v === _ventanaSel ? 'on' : '') + '">' + v + ' días</button>';
      }).join('') +
      '</div>';

    if (!datos.top.length) {
      html += '<div class="empty-state">' + esc(_mensajeVacio(datos)) + '</div>';
    } else {
      html += '<div class="corr-list">';
      datos.top.forEach(function (e, idx) {
        var abierto = idx === _abiertoIdx;
        html += '<button type="button" class="corr-item' + (abierto ? ' abierto' : '') + '" data-idx="' + idx + '" aria-expanded="' + (abierto ? 'true' : 'false') + '">' + esc(frasePar(e)) + '</button>';
        if (abierto) html += '<div class="corr-scatter-wrap"><canvas id="corr-scatter-cv" role="img" aria-label="' + esc(e.lider.label + ' contra ' + e.seguidor.label) + '"></canvas></div>';
      });
      html += '</div>';
    }

    body.innerHTML = html;

    var seg = body.querySelector('#corr-seg');
    if (seg) seg.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-v]');
      if (!btn) return;
      var v = parseInt(btn.dataset.v, 10);
      if (v === _ventanaSel) return;
      _ventanaSel = v;
      _guardarVentana(v);
      _abiertoIdx = null;
      render();
    });

    body.querySelectorAll('.corr-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.idx, 10);
        _abiertoIdx = (_abiertoIdx === idx) ? null : idx;
        render();
      });
    });

    if (_abiertoIdx != null && datos.top[_abiertoIdx]) _dibujarScatter(datos.top[_abiertoIdx]);
  }

  function _tryRender() { try { render(); } catch (e) { /* nunca romper la app */ } }

  global.CMCorrelaciones = { calcular: calcular, render: _tryRender };
  global.renderCorrelacionesCard = _tryRender;

  if (typeof document !== 'undefined') {
    _tryRender();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _tryRender);
  }

})(typeof window !== 'undefined' ? window : globalThis);
