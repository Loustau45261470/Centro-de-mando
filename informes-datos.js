'use strict';
// ════════════════════════════════════════════════════════════════════════
// INFORMES — motor de cálculo puro (PARTE A del contrato). Sin DOM, sin
// Chart, sin efectos de escritura salvo cerrarPeriodosVencidos(), que
// persiste S.informes y llama saveState() una sola vez.
// Lee exclusivamente `S` (estado global de app.js) y expone window.CMInformesData.
// La UI (informes.js) consume esta interfaz tal cual — no recalcula reglas acá.
// ════════════════════════════════════════════════════════════════════════
(function (global) {

  // ── Helpers globales ya disponibles en la app (uid/_mStr/_dStr/saveState) ──
  // Se reusan vía typeof-guard: en el navegador (con app.js cargado antes,
  // como manda el orden del CLAUDE.md) siempre existen. El guard solo cubre
  // el smoke test en Node, donde este archivo se carga solo.
  const _mStrF = (typeof _mStr === 'function') ? _mStr : (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;
  const _dStrF = (typeof _dStr === 'function') ? _dStr : (y, m, d) => `${_mStrF(y, m)}-${String(d).padStart(2, '0')}`;

  const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const GRANS = ['M', 'T', 'S', 'A']; // de más fino a más grueso

  // ────────────────────────────────────────────────────────────────────
  // Utilidades de fecha — SIEMPRE hora local, nunca UTC/toISOString().
  // ────────────────────────────────────────────────────────────────────
  function _pad2(n) { return String(n).padStart(2, '0'); }

  function _hoyStr() {
    const d = new Date();
    return _dStrF(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function _partsOf(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return { y, m, d }; // m: 1-12
  }
  // Mediodía local: evita que un cambio de horario de verano corra el día.
  function _localDate(dateStr) {
    const { y, m, d } = _partsOf(dateStr);
    return new Date(y, m - 1, d, 12, 0, 0);
  }
  function _diasEnMes(y, mUnoIdx) { return new Date(y, mUnoIdx, 0).getDate(); }
  function _addDias(dateStr, n) {
    const dt = _localDate(dateStr);
    dt.setDate(dt.getDate() + n);
    return _dStrF(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }
  function _diffDias(a, b) { return Math.round((_localDate(b) - _localDate(a)) / 86400000); }
  function _tsToDia(ts) {
    const d = new Date(ts);
    return _dStrF(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function _diasEnRango(desde, hasta) {
    const out = [];
    let cur = desde, guard = 0;
    while (cur <= hasta && guard < 800) { out.push(cur); cur = _addDias(cur, 1); guard++; }
    return out;
  }
  function _mesesEnRango(desde, hasta) {
    const out = [];
    let { y, m } = _partsOf(desde); // m 1-indexado
    const mHasta = hasta.slice(0, 7);
    let mk = _mStrF(y, m - 1);
    let guard = 0;
    while (mk <= mHasta && guard < 600) {
      out.push(mk);
      m++; if (m > 12) { m = 1; y++; }
      mk = _mStrF(y, m - 1);
      guard++;
    }
    return out;
  }

  // ────────────────────────────────────────────────────────────────────
  // A.1 — Claves y aritmética de períodos
  // ────────────────────────────────────────────────────────────────────
  function claveDe(gran, dateStr) {
    const { y, m } = _partsOf(dateStr);
    if (gran === 'M') return `M-${y}-${_pad2(m)}`;
    if (gran === 'T') return `T-${y}-${Math.ceil(m / 3)}`;
    if (gran === 'S') return `S-${y}-${m <= 6 ? 1 : 2}`;
    return `A-${y}`;
  }
  function parseClave(clave) {
    const p = String(clave).split('-');
    const gran = p[0];
    if (gran === 'A') return { gran, y: +p[1], i: 0 };
    return { gran, y: +p[1], i: +p[2] };
  }
  // 'M' se guarda con mes 0-padded (igual que claveDe) para que las claves
  // generadas acá (anterior/anioAnterior/_siguienteClave) sean comparables
  // como string 1:1 con las que produce claveDe() — de lo contrario 'M-2026-8'
  // (sin padding) y 'M-2026-08' quedan como claves DISTINTAS para el mismo mes.
  function _clave(gran, y, i) {
    if (gran === 'A') return `A-${y}`;
    if (gran === 'M') return `M-${y}-${_pad2(i)}`;
    return `${gran}-${y}-${i}`;
  }

  function rangoDe(clave) {
    const { gran, y, i } = parseClave(clave);
    let mDesde, mHasta;
    if (gran === 'M') { mDesde = i; mHasta = i; }
    else if (gran === 'T') { mDesde = (i - 1) * 3 + 1; mHasta = i * 3; }
    else if (gran === 'S') { mDesde = (i - 1) * 6 + 1; mHasta = i * 6; }
    else { mDesde = 1; mHasta = 12; }
    const desde = _dStrF(y, mDesde - 1, 1);
    const hasta = _dStrF(y, mHasta - 1, _diasEnMes(y, mHasta));
    return { desde, hasta };
  }
  function labelDe(clave) {
    const { gran, y, i } = parseClave(clave);
    if (gran === 'M') return `${MESES_LARGO[i - 1]} ${y}`;
    if (gran === 'T') return `T${i} ${y}`;
    if (gran === 'S') return `${i}º semestre ${y}`;
    return `${y}`;
  }
  function labelCortoDe(clave) {
    const { gran, y, i } = parseClave(clave);
    const yy = String(y).slice(2);
    if (gran === 'M') return `${MESES_CORTO[i - 1]} ${yy}`;
    if (gran === 'T') return `T${i} ${yy}`;
    if (gran === 'S') return `S${i} ${yy}`;
    return `${y}`;
  }
  function anterior(clave) {
    const { gran, y, i } = parseClave(clave);
    if (gran === 'A') return _clave('A', y - 1, 0);
    const tope = gran === 'M' ? 12 : (gran === 'T' ? 4 : 2);
    let ni = i - 1, ny = y;
    if (ni < 1) { ni = tope; ny = y - 1; }
    return _clave(gran, ny, ni);
  }
  function _siguienteClave(clave) {
    const { gran, y, i } = parseClave(clave);
    if (gran === 'A') return _clave('A', y + 1, 0);
    const tope = gran === 'M' ? 12 : (gran === 'T' ? 4 : 2);
    let ni = i + 1, ny = y;
    if (ni > tope) { ni = 1; ny = y + 1; }
    return _clave(gran, ny, ni);
  }
  function anioAnterior(clave) {
    const { gran, y, i } = parseClave(clave);
    return _clave(gran, y - 1, i);
  }
  function contenedores(claveFoco) {
    const { gran } = parseClave(claveFoco);
    const desde = rangoDe(claveFoco).desde;
    const rank = GRANS.indexOf(gran);
    if (rank < 0) return [];
    return GRANS.slice(rank).map(g => claveDe(g, desde));
  }
  function subGranularidades(gran) {
    if (gran === 'T') return ['M'];
    if (gran === 'S') return ['M', 'T'];
    if (gran === 'A') return ['M', 'T', 'S'];
    return [];
  }
  function subVentanas(claveFoco, gran) {
    const { desde, hasta } = rangoDe(claveFoco);
    const out = [];
    let { y, m } = _partsOf(desde); // recorrido mes a mes, unidad mínima
    let guard = 0;
    let cur = desde;
    while (cur <= hasta && guard < 400) {
      const c = claveDe(gran, cur);
      if (out[out.length - 1] !== c) out.push(c);
      cur = _dStrF(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1);
      if (m === 12) { y++; m = 1; } else { m++; }
      guard++;
    }
    return out;
  }
  function enCurso(clave) {
    const hoy = _hoyStr();
    const { desde, hasta } = rangoDe(clave);
    return hoy >= desde && hoy <= hasta;
  }
  function diasTranscurridos(clave) {
    const hoy = _hoyStr();
    const { desde, hasta } = rangoDe(clave);
    if (hoy < desde) return 0;
    const fin = hoy < hasta ? hoy : hasta;
    return _diffDias(desde, fin) + 1;
  }

  // ────────────────────────────────────────────────────────────────────
  // Helpers genéricos de lectura de datos crudos
  // ────────────────────────────────────────────────────────────────────
  function _arr(x) { return Array.isArray(x) ? x : []; }
  function _obj(x) { return (x && typeof x === 'object') ? x : {}; }
  function _n(v) { const x = +v; return isFinite(x) ? x : 0; }

  function _enRango(dateVal, desde, hasta) {
    if (!dateVal) return false;
    const d = String(dateVal).slice(0, 10);
    return d >= desde && d <= hasta;
  }
  function _filtrar(arr, campo, desde, hasta) {
    return _arr(arr).filter(x => x && _enRango(x[campo], desde, hasta));
  }
  function _filtrarTs(arr, campo, desde, hasta) {
    return _arr(arr).filter(x => x && x[campo] && _enRango(_tsToDia(x[campo]), desde, hasta));
  }
  function _primerArr(arr, campo) {
    const items = _arr(arr).filter(x => x && x[campo]);
    if (!items.length) return null;
    return items.reduce((min, x) => { const d = String(x[campo]).slice(0, 10); return (min === null || d < min) ? d : min; }, null);
  }

  // ── Regla dura de null vs 0, UNIFICADA (ver fixes.json / review) ──
  // Una métrica tiene "datos" en un período si su fuente YA EXISTÍA durante
  // ese período: si el período entero termina antes del primer registro
  // (`primer`), no había nada que registrar todavía -> null. Si el período
  // cae en o después del primer registro, se calcula de verdad y el
  // resultado puede ser legítimamente 0 (existía la fuente, no hubo
  // actividad ese período) — 0 es un dato real, no un hueco.
  // NO confundir con "¿hay algún registro EN ESE RANGO puntual?": esa
  // pregunta hacía que un período posterior al arranque de la fuente, pero
  // sin actividad, se mostrara igual que un período anterior a que la fuente
  // existiera — dos situaciones distintas que el usuario necesita poder
  // distinguir (ver HIGH 1 del review 2026-09-04).
  function _conDatos(primer, hasta, calcFn) {
    if (!primer || hasta < primer) return null;
    return calcFn();
  }
  // Variante para fuentes fecha→valor (S.goals, S.dayPlan, etc.): misma regla,
  // primer = fecha de la clave más vieja del objeto.
  function _conDatosDias(obj, hasta, calcFn) {
    return _conDatos(_primerObjDias(obj), hasta, calcFn);
  }
  function _contarRango(arr, campo, desde, hasta) {
    return _conDatos(_primerArr(arr, campo), hasta, () => _filtrar(arr, campo, desde, hasta).length);
  }
  function _contarRangoTs(arr, campo, desde, hasta) {
    return _conDatos(_primerArrTs(arr, campo), hasta, () => _filtrarTs(arr, campo, desde, hasta).length);
  }
  function _sumRango(arr, campo, desde, hasta, valorFn) {
    return _conDatos(_primerArr(arr, campo), hasta, () =>
      _filtrar(arr, campo, desde, hasta).reduce((s, x) => s + (valorFn ? _n(valorFn(x)) : _n(x.amount)), 0));
  }
  function _primerArrTs(arr, campo) {
    const items = _arr(arr).filter(x => x && x[campo]);
    if (!items.length) return null;
    return items.reduce((min, x) => { const d = _tsToDia(x[campo]); return (min === null || d < min) ? d : min; }, null);
  }
  // Claves de un objeto fecha→valor ('YYYY-MM-DD') dentro de [desde,hasta]
  function _clavesDia(obj, desde, hasta) {
    return Object.keys(_obj(obj)).filter(k => k >= desde && k <= hasta);
  }
  function _primerObjDias(obj) {
    const keys = Object.keys(_obj(obj));
    if (!keys.length) return null;
    return keys.slice().sort()[0];
  }
  // Claves de un objeto mes→valor ('YYYY-MM') cuyo mes cae en [desde,hasta]
  function _clavesMes(obj, desde, hasta) {
    const mDesde = desde.slice(0, 7), mHasta = hasta.slice(0, 7);
    return Object.keys(_obj(obj)).filter(k => k >= mDesde && k <= mHasta);
  }
  function _primerObjMeses(obj) {
    const keys = Object.keys(_obj(obj));
    if (!keys.length) return null;
    return keys.slice().sort()[0] + '-01';
  }
  function _promedioCampoDia(obj, campo, desde, hasta) {
    const dias = _clavesDia(obj, desde, hasta);
    if (!dias.length) return null;
    let sum = 0, n = 0;
    dias.forEach(ds => { const v = +((obj[ds] || {})[campo]); if (isFinite(v)) { sum += v; n++; } });
    if (!n) return null;
    return sum / n;
  }
  function _calendarioPct(calObj, desde, hasta, doneVals) {
    const days = (calObj && calObj.days) || {};
    const dias = _clavesDia(days, desde, hasta);
    if (!dias.length) return null;
    const done = dias.filter(ds => doneVals.includes(days[ds])).length;
    return Math.round((done / dias.length) * 1000) / 10;
  }
  function _calendarioDias(calObj, desde, hasta, doneVals) {
    const days = (calObj && calObj.days) || {};
    return _conDatosDias(days, hasta, () => _clavesDia(days, desde, hasta).filter(ds => doneVals.includes(days[ds])).length);
  }
  function _rachaCalendario(calObj, doneVals) {
    const days = (calObj && calObj.days) || {};
    const claves = Object.keys(days);
    if (!claves.length) return null;
    let cursor = _hoyStr(), actual = 0, guard = 0;
    while (doneVals.includes(days[cursor]) && guard < 3650) { actual++; cursor = _addDias(cursor, -1); guard++; }
    let record = 0, run = 0, prev = null;
    claves.slice().sort().forEach(ds => {
      const ok = doneVals.includes(days[ds]);
      if (ok) { run = (prev && _addDias(prev, 1) === ds) ? run + 1 : 1; if (run > record) record = run; }
      else run = 0;
      prev = ds;
    });
    return { actual, record };
  }
  // Pct de cumplimiento genérico de habitTrackers[<sec>] (formato days: 'done'|'partial'|'rest')
  function _habitPct(section, desde, hasta) {
    const habitos = _arr(S.habitTrackers && S.habitTrackers[section]);
    if (!habitos.length) return null;
    let sumFrac = 0, n = 0;
    habitos.forEach(h => {
      const dias = _clavesDia(h.days, desde, hasta);
      if (!dias.length) return;
      let score = 0;
      dias.forEach(ds => {
        const st = h.days[ds];
        if (st === 'done' || st === 'studied') score += 1;
        else if (st === 'partial') score += 0.5;
      });
      sumFrac += score / dias.length;
      n++;
    });
    if (!n) return null;
    return Math.round((sumFrac / n) * 1000) / 10;
  }
  function _primerHabitos(section) {
    let min = null;
    _arr(S.habitTrackers && S.habitTrackers[section]).forEach(h => {
      const d = _primerObjDias(h.days);
      if (d && (min === null || d < min)) min = d;
    });
    return min;
  }
  // Cuenta/desglose recursivo de un árbol de proyectos (workspace.js)
  function _proyectosContar(tab) {
    const tree = S.proyectos && S.proyectos[tab];
    if (!Array.isArray(tree)) return { total: 0, done: 0, existe: false };
    let total = 0, done = 0;
    (function walk(nodes) {
      (nodes || []).forEach(n => {
        total++;
        if (n.done) done++;
        if (Array.isArray(n.children) && n.children.length) walk(n.children);
      });
    })(tree);
    return { total, done, existe: true };
  }
  function _routineLogFlat() {
    const out = [];
    Object.entries(_obj(S.routineLog)).forEach(([rtnId, arr]) => {
      _arr(arr).forEach(e => out.push(Object.assign({}, e, { rtnId })));
    });
    return out;
  }
  function _primerExerciseHistory() {
    let min = null;
    Object.values(_obj(S.exerciseHistory)).forEach(arr => {
      _arr(arr).forEach(e => { if (e.date && (min === null || e.date < min)) min = e.date; });
    });
    return min;
  }

  // ────────────────────────────────────────────────────────────────────
  // Cartera de inversión (data/cartera/<YYYY-MM>.json) — NO vive en `S`,
  // así que no puede leerse de forma síncrona desde disco/red. Store en
  // memoria del módulo, poblado por precargarCartera() (async, la llama la
  // UI antes de renderizar — ver comentario en su definición). Las `calc`
  // de las métricas de cartera leen este store de forma síncrona: si el mes
  // no está (nunca se pidió, dio 404, o falló la red) devuelven null, igual
  // que cualquier otra métrica "sin datos". Un valor `null` en el store
  // significa "se intentó y no hay dato para ese mes" (evita reintentar en
  // cada precarga); `undefined` significa "todavía no se intentó".
  // ────────────────────────────────────────────────────────────────────
  const _carteraStore = {};
  function _carteraMes(mk) { return _carteraStore[mk] || null; }
  function _mesesConCartera(desde, hasta) { return _mesesEnRango(desde, hasta).filter(mk => _carteraMes(mk)); }
  // 'a/b' → porcentaje (0-100). Formato de evaluacion.scorePicks/scoreMejores/scorePeores.
  function _parseScore(s) {
    if (typeof s !== 'string') return null;
    const m = /^(\d+)\/(\d+)$/.exec(s.trim());
    if (!m) return null;
    const a = +m[1], b = +m[2];
    if (!b) return null;
    return (a / b) * 100;
  }
  function _carteraVariacionPonderada(data) {
    const cedears = _arr(data && data.cedears);
    let sumV = 0, sumPeso = 0;
    cedears.forEach(c => { const peso = _n(c.precio) * _n(c.cantidad); sumV += _n(c.variacionPct) * peso; sumPeso += peso; });
    return sumPeso ? sumV / sumPeso : null;
  }

  // ────────────────────────────────────────────────────────────────────
  // A.3 — Catálogo de métricas
  // Cada entrada trae, además de lo documentado en el contrato, un `_primer()`
  // interno (no expuesto como función pública de CMInformesData) que devuelve
  // la fecha del registro más viejo de esa métrica o null — lo usan
  // primerDatoMetrica()/primerDatoGlobal(). No es parte de la interfaz que
  // consume informes.js, es un detalle de implementación del catálogo.
  //
  // Convención de null vs 0 aplicada en TODO el catálogo: null solo cuando la
  // fuente nunca tuvo ningún registro en el rango pedido; 0 cuando hubo
  // registros pero el resultado matemático es cero.
  //
  // Métricas "stock sin fecha": varias fuentes de S (S.fichero, S.ideas,
  // S.lawProgress, árboles de S.proyectos, S.agentChat.displayLog) no guardan
  // cuándo se creó cada ítem. Siguiendo la instrucción explícita del contrato
  // para este caso (A.3, "Antes de escribir el calc..."), se reportan como
  // STOCK: el valor actual del conteo, igual sin importar qué período se
  // consulte (se documenta en cada una). No se inventa ninguna fecha.
  // ────────────────────────────────────────────────────────────────────

  const CATALOGO = [];

  // ═══════════ VIDA ═══════════
  CATALOGO.push(
    {
      id: 'vida_metas_creadas', seccion: 'vida', label: 'Metas creadas', unidad: 'count', dir: 'up', destacada: true, agg: 'sum',
      calc: (desde, hasta) => _conDatosDias(S.goals, hasta, () =>
        _clavesDia(S.goals, desde, hasta).reduce((s, ds) => s + _arr(S.goals[ds]).length, 0)),
      _primer: () => _primerObjDias(S.goals),
    },
    {
      id: 'vida_metas_cumplidas', seccion: 'vida', label: 'Metas cumplidas', unidad: 'count', dir: 'up', destacada: true, agg: 'sum',
      calc: (desde, hasta) => _conDatosDias(S.goals, hasta, () =>
        _clavesDia(S.goals, desde, hasta).reduce((s, ds) => s + _arr(S.goals[ds]).filter(g => g.done).length, 0)),
      _primer: () => _primerObjDias(S.goals),
    },
    {
      id: 'vida_metas_pct', seccion: 'vida', label: '% cumplimiento de metas', unidad: 'pct', dir: 'up', destacada: false, agg: 'pct',
      calc: (desde, hasta) => {
        const claves = _clavesDia(S.goals, desde, hasta);
        if (!claves.length) return null;
        let total = 0, done = 0;
        claves.forEach(ds => { const g = _arr(S.goals[ds]); total += g.length; done += g.filter(x => x.done).length; });
        if (!total) return null;
        return Math.round((done / total) * 1000) / 10;
      },
      _primer: () => _primerObjDias(S.goals),
    },
    {
      id: 'vida_dayplan_tareas', seccion: 'vida', label: 'Tareas planificadas', unidad: 'count', dir: 'up', destacada: false, agg: 'sum',
      calc: (desde, hasta) => _conDatosDias(S.dayPlan, hasta, () =>
        _clavesDia(S.dayPlan, desde, hasta).reduce((s, ds) => s + _arr((S.dayPlan[ds] || {}).tasks).length, 0)),
      _primer: () => _primerObjDias(S.dayPlan),
    },
    {
      id: 'vida_dayplan_hechas', seccion: 'vida', label: 'Tareas cumplidas', unidad: 'count', dir: 'up', destacada: false, agg: 'sum',
      calc: (desde, hasta) => _conDatosDias(S.dayPlan, hasta, () =>
        _clavesDia(S.dayPlan, desde, hasta).reduce((s, ds) => s + _arr((S.dayPlan[ds] || {}).tasks).filter(t => t.done).length, 0)),
      _primer: () => _primerObjDias(S.dayPlan),
    },
    {
      id: 'vida_dayplan_pct', seccion: 'vida', label: '% del planner cumplido', unidad: 'pct', dir: 'up', destacada: true, agg: 'pct',
      calc: (desde, hasta) => {
        const claves = _clavesDia(S.dayPlan, desde, hasta);
        if (!claves.length) return null;
        let total = 0, done = 0;
        claves.forEach(ds => { const t = _arr((S.dayPlan[ds] || {}).tasks); total += t.length; done += t.filter(x => x.done).length; });
        if (!total) return null;
        return Math.round((done / total) * 1000) / 10;
      },
      _primer: () => _primerObjDias(S.dayPlan),
    },
    {
      // Cubre S.planRecurring: no guarda ocurrencias por fecha, así que se
      // reusa plannerDayTasks() (app.js) día por día del rango para contar
      // cuántas ocurrencias de reglas recurrentes cayeron en el período —
      // evita reimplementar la lógica de recurrencia (weekly/monthly/etc).
      id: 'vida_planrecurring_ocurrencias', seccion: 'vida', label: 'Tareas recurrentes generadas', unidad: 'count', dir: 'neutral', destacada: false, agg: 'sum',
      calc: (desde, hasta) => {
        if (typeof plannerDayTasks !== 'function') return null;
        const primer = _arr(S.planRecurring).length ? _primerArr(S.planRecurring, 'startDate') : null;
        return _conDatos(primer, hasta, () => {
          let total = 0;
          _diasEnRango(desde, hasta).forEach(ds => { total += plannerDayTasks(ds).filter(t => t._rec).length; });
          return total;
        });
      },
      _primer: () => { const arr = _arr(S.planRecurring); return arr.length ? _primerArr(arr, 'startDate') : null; },
    },
    {
      id: 'vida_streak_actual', seccion: 'vida', label: 'Racha general activa', unidad: 'dias', dir: 'up', destacada: true, agg: 'last',
      // S.streak es un contador vivo (no histórico): solo tiene sentido
      // reportarlo para el período que contiene la fecha de su último registro.
      calc: (desde, hasta) => {
        if (!S.streak || !S.streak.lastDate) return null;
        if (S.streak.lastDate < desde || S.streak.lastDate > hasta) return null;
        return _n(S.streak.count);
      },
      _primer: () => (S.streak && S.streak.lastDate) || null,
    },
    {
      id: 'vida_habitos_pct', seccion: 'vida', label: '% cumplimiento hábitos de Vida', unidad: 'pct', dir: 'up', destacada: true, agg: 'pct',
      calc: (desde, hasta) => _habitPct('vida', desde, hasta),
      _primer: () => _primerHabitos('vida'),
    },
    {
      id: 'vida_monthlygoals_pct', seccion: 'vida', label: '% metas mensuales cumplidas', unidad: 'pct', dir: 'up', destacada: false, agg: 'pct',
      calc: (desde, hasta) => {
        const mg = (S.monthlyGoals && S.monthlyGoals.vida) || null;
        if (!mg) return null;
        const meses = _mesesEnRango(desde, hasta).filter(mk => mg[mk]);
        if (!meses.length) return null;
        let total = 0, done = 0;
        meses.forEach(mk => { (mg[mk] || []).forEach(g => { total++; if (g.done) done++; }); });
        if (!total) return null;
        return Math.round((done / total) * 1000) / 10;
      },
      _primer: () => { const mg = (S.monthlyGoals && S.monthlyGoals.vida) || {}; return _primerObjMeses(mg); },
    },
    {
      id: 'vida_reminders_programados', seccion: 'vida', label: 'Recordatorios con vencimiento', unidad: 'count', dir: 'neutral', destacada: false, agg: 'count',
      calc: (desde, hasta) => _contarRango((S.reminders && S.reminders.vida) || [], 'datetime', desde, hasta),
      _primer: () => _primerArr((S.reminders && S.reminders.vida) || [], 'datetime'),
    },
    {
      // S.ideas.vida no guarda fecha de creación → stock (ver nota de cabecera).
      id: 'vida_ideas_creadas', seccion: 'vida', label: 'Ideas anotadas (stock)', unidad: 'count', dir: 'up', destacada: false, agg: 'last',
      calc: () => (S.ideas && Array.isArray(S.ideas.vida)) ? S.ideas.vida.length : null,
      _primer: () => null,
    },
    {
      id: 'vida_pomodoro_sesiones', seccion: 'vida', label: 'Sesiones de foco (Pomodoro)', unidad: 'count', dir: 'up', destacada: true, agg: 'count',
      calc: (desde, hasta) => _contarRango(S.pomodoroHistory, 'date', desde, hasta),
      _primer: () => _primerArr(S.pomodoroHistory, 'date'),
    },
    {
      id: 'vida_pomodoro_minutos', seccion: 'vida', label: 'Minutos de foco', unidad: 'min', dir: 'up', destacada: false, agg: 'sum',
      calc: (desde, hasta) => _sumRango(S.pomodoroHistory, 'date', desde, hasta, x => x.minutes),
      _primer: () => _primerArr(S.pomodoroHistory, 'date'),
    },
    {
      id: 'vida_logros_desbloqueados', seccion: 'vida', label: 'Logros desbloqueados', unidad: 'count', dir: 'up', destacada: false, agg: 'count',
      calc: (desde, hasta) => {
        const entries = Object.entries(_obj(S.achievementLog));
        if (!entries.length) return null;
        return entries.filter(([, fecha]) => _enRango(fecha, desde, hasta)).length;
      },
      _primer: () => { const vals = Object.values(_obj(S.achievementLog)).filter(Boolean); return vals.length ? vals.slice().sort()[0] : null; },
    },
    {
      // S.fichero no guarda fecha de alta → stock (ver nota de cabecera).
      id: 'vida_fichero_personas', seccion: 'vida', label: 'Contactos en el fichero (stock)', unidad: 'count', dir: 'up', destacada: false, agg: 'last',
      calc: () => Array.isArray(S.fichero) ? S.fichero.length : null,
      _primer: () => null,
    },
    {
      // Árbol de proyectos sin fecha de creación/cierre → stock.
      id: 'vida_proyectos_completados', seccion: 'vida', label: 'Proyectos de Vida completados (stock)', unidad: 'count', dir: 'up', destacada: false, agg: 'last',
      calc: () => { const r = _proyectosContar('vida'); return r.existe ? r.done : null; },
      _primer: () => null,
    },
    {
      id: 'vida_proyectos_totales', seccion: 'vida', label: 'Proyectos de Vida totales (stock)', unidad: 'count', dir: 'neutral', destacada: false, agg: 'last',
      calc: () => { const r = _proyectosContar('vida'); return r.existe ? r.total : null; },
      _primer: () => null,
    },
  );

  // ═══════════ FINANZAS ═══════════
  CATALOGO.push(
    {
      id: 'fin_ingresos', seccion: 'finanzas', label: 'Ingresos', unidad: 'ARS', dir: 'up', destacada: true, agg: 'sum',
      calc: (desde, hasta) => _conDatos(_primerArr(S.transactions, 'date'), hasta, () =>
        _filtrar(S.transactions, 'date', desde, hasta).filter(t => t.type === 'income' && t.currency === 'ARS').reduce((s, t) => s + _n(t.amount), 0)),
      _primer: () => _primerArr(S.transactions, 'date'),
    },
    {
      id: 'fin_egresos', seccion: 'finanzas', label: 'Egresos', unidad: 'ARS', dir: 'down', destacada: true, agg: 'sum',
      calc: (desde, hasta) => _conDatos(_primerArr(S.transactions, 'date'), hasta, () =>
        _filtrar(S.transactions, 'date', desde, hasta).filter(t => t.type === 'expense' && t.currency === 'ARS').reduce((s, t) => s + _n(t.amount), 0)),
      desglose: (desde, hasta) => {
        const cats = {};
        _filtrar(S.transactions, 'date', desde, hasta).filter(t => t.type === 'expense' && t.currency === 'ARS')
          .forEach(t => { const c = t.category || 'other'; cats[c] = (cats[c] || 0) + _n(t.amount); });
        const entries = Object.entries(cats);
        if (!entries.length) return null;
        return entries.map(([catId, valorC]) => {
          const info = (S.txnCategories && S.txnCategories[catId]) || null;
          return { label: info ? info.label : catId, valor: valorC, color: info ? info.color : null };
        });
      },
      _primer: () => _primerArr(S.transactions, 'date'),
    },
    {
      id: 'fin_neto', seccion: 'finanzas', label: 'Resultado neto', unidad: 'ARS', dir: 'up', destacada: true, agg: 'sum',
      calc: (desde, hasta) => _conDatos(_primerArr(S.transactions, 'date'), hasta, () => {
        const todas = _filtrar(S.transactions, 'date', desde, hasta).filter(t => t.currency === 'ARS');
        const ing = todas.filter(t => t.type === 'income').reduce((s, t) => s + _n(t.amount), 0);
        const eg = todas.filter(t => t.type === 'expense').reduce((s, t) => s + _n(t.amount), 0);
        return ing - eg;
      }),
      _primer: () => _primerArr(S.transactions, 'date'),
    },
    {
      // Sin fecha de alta por cuenta → stock.
      id: 'fin_cuentas_activas', seccion: 'finanzas', label: 'Cuentas activas (stock)', unidad: 'count', dir: 'neutral', destacada: false, agg: 'last',
      calc: () => Array.isArray(S.accounts) ? S.accounts.length : null,
      _primer: () => null,
    },
    {
      id: 'fin_saldo_promedio_cuentas', seccion: 'finanzas', label: 'Saldo promedio de cuentas', unidad: 'ARS', dir: 'up', destacada: false, agg: 'avg',
      // Promedio: sin registros EN EL RANGO no hay nada que promediar (0 sería
      // falso: "promedio 0" implica saldo nulo, no "no se registró nada").
      calc: (desde, hasta) => {
        const en = _filtrar(S.accountHistory, 'date', desde, hasta);
        if (!en.length) return null;
        return en.reduce((s, x) => s + _n(x.balance), 0) / en.length;
      },
      _primer: () => _primerArr(S.accountHistory, 'date'),
    },
    {
      id: 'fin_patrimonio', seccion: 'finanzas', label: 'Patrimonio neto', unidad: 'ARS', dir: 'up', destacada: true, agg: 'last',
      // Serie de stock: se reporta el último valor conocido hasta el cierre
      // del período (carry-forward), igual que un saldo de cuenta.
      calc: (desde, hasta) => {
        const arr = _arr(S.nwHistory).filter(x => x.date && x.date <= hasta).sort((a, b) => a.date < b.date ? -1 : 1);
        if (!arr.length) return null;
        return _n(arr[arr.length - 1].value);
      },
      _primer: () => _primerArr(S.nwHistory, 'date'),
    },
    {
      id: 'fin_gastos_fijos_pct', seccion: 'finanzas', label: '% gastos fijos cumplidos', unidad: 'pct', dir: 'up', destacada: true, agg: 'pct',
      calc: (desde, hasta) => {
        const fijos = _arr(S.fixedExpenses);
        if (!fijos.length) return null;
        let total = 0, hechos = 0, huboDatos = false;
        _mesesEnRango(desde, hasta).forEach(mk => {
          const log = S.fixedExpenseLog && S.fixedExpenseLog[mk];
          if (!log) return;
          huboDatos = true;
          fijos.forEach(fe => { total++; if (log[fe.id]) hechos++; });
        });
        if (!huboDatos || !total) return null;
        return Math.round((hechos / total) * 1000) / 10;
      },
      _primer: () => _primerObjMeses(S.fixedExpenseLog),
    },
    {
      id: 'fin_presupuesto_ejecutado_pct', seccion: 'finanzas', label: '% presupuesto ejecutado', unidad: 'pct', dir: 'down', destacada: false, agg: 'pct',
      calc: (desde, hasta) => {
        const meses = _mesesEnRango(desde, hasta).filter(mk => S.budgets && S.budgets[mk]);
        if (!meses.length) return null;
        let presupuestado = 0, ejecutado = 0;
        meses.forEach(mk => {
          const b = S.budgets[mk];
          (b.fixed || []).forEach(it => { presupuestado += _n(it.v1) * _n(it.v2) * _n(it.v3); });
          (b.reserved || []).forEach(it => { presupuestado += _n(it.amount); });
          const mDesde = mk + '-01', mHasta = mk + '-31';
          ejecutado += _filtrar(S.transactions, 'date', mDesde, mHasta)
            .filter(t => t.type === 'expense' && t.currency === 'ARS').reduce((s, t) => s + _n(t.amount), 0);
        });
        if (!presupuestado) return null;
        return Math.round((ejecutado / presupuestado) * 1000) / 10;
      },
      _primer: () => _primerObjMeses(S.budgets),
    },
    {
      // Sin fecha por suscripción → stock (gasto mensual comprometido actual).
      id: 'fin_suscripciones_gasto', seccion: 'finanzas', label: 'Gasto mensual en suscripciones (stock)', unidad: 'ARS', dir: 'down', destacada: false, agg: 'last',
      calc: () => {
        if (!Array.isArray(S.subscriptions)) return null;
        return S.subscriptions.filter(s => s.currency === 'ARS').reduce((s, x) => s + _n(x.amount), 0);
      },
      _primer: () => null,
    },
    {
      id: 'fin_pedidos_monto', seccion: 'finanzas', label: 'Monto en pedidos', unidad: 'ARS', dir: 'neutral', destacada: false, agg: 'sum',
      calc: (desde, hasta) => _sumRango(S.orders, 'arrival', desde, hasta, x => x.currency === 'ARS' ? x.amount : 0),
      _primer: () => _primerArr(S.orders, 'arrival'),
    },
    {
      // Sin fecha por ítem de wishlist → stock.
      id: 'fin_wishlist_monto', seccion: 'finanzas', label: 'Monto deseado en wishlist (stock)', unidad: 'ARS', dir: 'neutral', destacada: false, agg: 'last',
      calc: () => {
        if (!Array.isArray(S.wishlist)) return null;
        return S.wishlist.filter(w => w.currency === 'ARS').reduce((s, x) => s + _n(x.amount), 0);
      },
      _primer: () => null,
    },
    {
      id: 'fin_fondos_acreditado', seccion: 'finanzas', label: 'Acreditado a fondos de compra', unidad: 'ARS', dir: 'up', destacada: false, agg: 'sum',
      calc: (desde, hasta) => {
        const byFund = _obj(S.purchaseFundLog);
        if (!Object.keys(byFund).length) return null;
        let total = 0, hubo = false;
        _mesesEnRango(desde, hasta).forEach(mk => {
          Object.values(byFund).forEach(byMonth => {
            const e = byMonth && byMonth[mk];
            if (e) { hubo = true; total += _n(e.credited); }
          });
        });
        return hubo ? total : null;
      },
      _primer: () => {
        let min = null;
        Object.values(_obj(S.purchaseFundLog)).forEach(byMonth => {
          Object.keys(_obj(byMonth)).forEach(mk => { const d = mk + '-01'; if (min === null || d < min) min = d; });
        });
        return min;
      },
    },
    {
      id: 'fin_fondos_gastado', seccion: 'finanzas', label: 'Gastado desde fondos de compra', unidad: 'ARS', dir: 'neutral', destacada: false, agg: 'sum',
      calc: (desde, hasta) => _sumRango(S.purchaseFundSpends, 'date', desde, hasta, x => x.amount),
      _primer: () => _primerArr(S.purchaseFundSpends, 'date'),
    },
    {
      id: 'fin_financecalendar_pct', seccion: 'finanzas', label: '% días con control financiero', unidad: 'pct', dir: 'up', destacada: true, agg: 'pct',
      calc: (desde, hasta) => _calendarioPct(S.financeCalendar, desde, hasta, ['done']),
      _primer: () => _primerObjDias(S.financeCalendar && S.financeCalendar.days),
    },
    {
      id: 'fin_habitos_pct', seccion: 'finanzas', label: '% cumplimiento hábitos de Finanzas', unidad: 'pct', dir: 'up', destacada: false, agg: 'pct',
      calc: (desde, hasta) => _habitPct('finanzas', desde, hasta),
      _primer: () => _primerHabitos('finanzas'),
    },
    {
      id: 'fin_sgc_proyecciones_creadas', seccion: 'finanzas', label: 'Proyecciones de mercado creadas', unidad: 'count', dir: 'neutral', destacada: false, agg: 'count',
      calc: (desde, hasta) => _contarRango((S.sgc && S.sgc.proyecciones) || [], 'fechaCreada', desde, hasta),
      _primer: () => _primerArr((S.sgc && S.sgc.proyecciones) || [], 'fechaCreada'),
    },
    {
      id: 'fin_sgc_proyecciones_resueltas', seccion: 'finanzas', label: 'Proyecciones de mercado resueltas', unidad: 'count', dir: 'up', destacada: false, agg: 'count',
      calc: (desde, hasta) => {
        const arr = (S.sgc && S.sgc.proyecciones) || [];
        if (!arr.length) return null;
        return arr.filter(p => p.precioReal != null && _enRango(p.fechaVence, desde, hasta)).length;
      },
      _primer: () => _primerArr((S.sgc && S.sgc.proyecciones) || [], 'fechaVence'),
    },
    {
      // Árbol de proyectos sin fecha → stock.
      id: 'fin_proyectos_completados', seccion: 'finanzas', label: 'Proyectos de Finanzas completados (stock)', unidad: 'count', dir: 'up', destacada: false, agg: 'last',
      calc: () => { const r = _proyectosContar('finanzas'); return r.existe ? r.done : null; },
      _primer: () => null,
    },
    // ── Cartera de inversión (data/cartera/*.json) — requiere precargarCartera() ──
    {
      id: 'fin_cartera_valorizado', seccion: 'finanzas', label: 'Valorizado de cartera', unidad: 'ARS', dir: 'up', destacada: true,
      // 'last': el valorizado es una foto de fin de mes (stock), no un flujo
      // que tenga sentido sumar — se usa el mes más reciente con datos
      // disponible dentro del rango pedido.
      agg: 'last',
      calc: (desde, hasta) => {
        const meses = _mesesConCartera(desde, hasta);
        if (!meses.length) return null;
        const data = _carteraMes(meses[meses.length - 1]);
        return _arr(data.cedears).reduce((s, c) => s + _n(c.precio) * _n(c.cantidad), 0);
      },
      // No depende de S: no aporta a primerDatoGlobal (evita el problema del
      // huevo y la gallina con precargarCartera(), que usa primerDatoGlobal()
      // para decidir qué meses pedir).
      _primer: () => null,
    },
    {
      id: 'fin_cartera_posiciones', seccion: 'finanzas', label: 'Posiciones en cartera', unidad: 'count', dir: 'neutral', destacada: false, agg: 'last',
      calc: (desde, hasta) => {
        const meses = _mesesConCartera(desde, hasta);
        if (!meses.length) return null;
        return _arr(_carteraMes(meses[meses.length - 1]).cedears).length;
      },
      _primer: () => null,
    },
    {
      id: 'fin_cartera_variacion_prom', seccion: 'finanzas', label: 'Variación ponderada de cartera', unidad: 'pct', dir: 'up', destacada: true,
      // 'avg': la variación mensual es una tasa (flujo), no un stock — para
      // ventanas de más de un mes se promedian las tasas mensuales
      // disponibles, no se toma solo la del último mes.
      agg: 'avg',
      calc: (desde, hasta) => {
        const meses = _mesesConCartera(desde, hasta);
        if (!meses.length) return null;
        const vals = meses.map(mk => _carteraVariacionPonderada(_carteraMes(mk))).filter(v => v !== null);
        if (!vals.length) return null;
        return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      },
      _primer: () => null,
    },
    {
      id: 'fin_cartera_mejor_cedear', seccion: 'finanzas', label: 'Mejor CEDEAR del período', unidad: 'pct', dir: 'up', destacada: false, agg: 'last',
      calc: (desde, hasta) => {
        const meses = _mesesConCartera(desde, hasta);
        if (!meses.length) return null;
        const cedears = _arr(_carteraMes(meses[meses.length - 1]).cedears);
        if (!cedears.length) return null;
        return Math.max.apply(null, cedears.map(c => _n(c.variacionPct)));
      },
      desglose: (desde, hasta) => {
        const meses = _mesesConCartera(desde, hasta);
        if (!meses.length) return null;
        const cedears = _arr(_carteraMes(meses[meses.length - 1]).cedears).slice().sort((a, b) => _n(b.variacionPct) - _n(a.variacionPct));
        if (!cedears.length) return null;
        return cedears.map(c => ({ label: c.simbolo, valor: _n(c.variacionPct), color: null }));
      },
      _primer: () => null,
    },
    {
      id: 'fin_cartera_peor_cedear', seccion: 'finanzas', label: 'Peor CEDEAR del período', unidad: 'pct', dir: 'up', destacada: false, agg: 'last',
      calc: (desde, hasta) => {
        const meses = _mesesConCartera(desde, hasta);
        if (!meses.length) return null;
        const cedears = _arr(_carteraMes(meses[meses.length - 1]).cedears);
        if (!cedears.length) return null;
        return Math.min.apply(null, cedears.map(c => _n(c.variacionPct)));
      },
      desglose: (desde, hasta) => {
        const meses = _mesesConCartera(desde, hasta);
        if (!meses.length) return null;
        const cedears = _arr(_carteraMes(meses[meses.length - 1]).cedears).slice().sort((a, b) => _n(a.variacionPct) - _n(b.variacionPct));
        if (!cedears.length) return null;
        return cedears.map(c => ({ label: c.simbolo, valor: _n(c.variacionPct), color: null }));
      },
      _primer: () => null,
    },
    {
      id: 'fin_cartera_score_picks', seccion: 'finanzas', label: 'Acierto de predicciones (picks)', unidad: 'pct', dir: 'up', destacada: false,
      // 'avg': cada archivo mensual trae el score de aciertos vigente a esa
      // fecha (evaluacion.scorePicks, formato 'a/b'); para una ventana con
      // varios meses se promedian los scores de los meses disponibles.
      agg: 'avg',
      calc: (desde, hasta) => {
        const meses = _mesesConCartera(desde, hasta);
        if (!meses.length) return null;
        const pcts = meses
          .map(mk => { const ev = _carteraMes(mk).evaluacion; return ev ? _parseScore(ev.scorePicks) : null; })
          .filter(v => v !== null);
        if (!pcts.length) return null;
        return Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10;
      },
      _primer: () => null,
    },
  );

  // ═══════════ CONOCIMIENTO ═══════════
  CATALOGO.push(
    {
      // S.lawProgress.years[].subjects[].done no guarda fecha de aprobación
      // → stock (instrucción explícita del contrato para este caso puntual).
      id: 'con_materias_aprobadas', seccion: 'conocimiento', label: 'Materias aprobadas (stock)', unidad: 'count', dir: 'up', destacada: true, agg: 'last',
      calc: () => {
        if (!S.lawProgress || !Array.isArray(S.lawProgress.years)) return null;
        return S.lawProgress.years.reduce((s, y) => s + _arr(y.subjects).filter(sub => sub.done).length, 0);
      },
      _primer: () => null,
    },
    {
      // S.carrera.regular tampoco guarda fecha → stock.
      id: 'con_materias_regularizadas', seccion: 'conocimiento', label: 'Materias regularizadas (stock)', unidad: 'count', dir: 'up', destacada: true, agg: 'last',
      calc: () => {
        if (!S.carrera || !S.carrera.regular) return null;
        return Object.values(S.carrera.regular).filter(Boolean).length;
      },
      _primer: () => null,
    },
    {
      id: 'con_lawplan_pendientes', seccion: 'conocimiento', label: 'Materias en el plan (stock)', unidad: 'count', dir: 'down', destacada: false, agg: 'last',
      calc: () => Array.isArray(S.lawPlan) ? S.lawPlan.length : null,
      _primer: () => null,
    },
    {
      id: 'con_cursada_creadas', seccion: 'conocimiento', label: 'Actividades de cursada creadas', unidad: 'count', dir: 'up', destacada: false, agg: 'count',
      calc: (desde, hasta) => _contarRango(S.cursada, 'fecha', desde, hasta),
      _primer: () => _primerArr(S.cursada, 'fecha'),
    },
    {
      id: 'con_cursada_hechas', seccion: 'conocimiento', label: 'Actividades de cursada cumplidas', unidad: 'count', dir: 'up', destacada: true, agg: 'count',
      calc: (desde, hasta) => {
        const done = _arr(S.cursada).filter(it => it.done);
        return _conDatos(_primerArr(done, 'doneEl'), hasta, () => _filtrar(done, 'doneEl', desde, hasta).length);
      },
      _primer: () => _primerArr(_arr(S.cursada).filter(it => it.done), 'doneEl'),
    },
    {
      id: 'con_finales_programados', seccion: 'conocimiento', label: 'Finales programados', unidad: 'count', dir: 'neutral', destacada: false, agg: 'count',
      calc: (desde, hasta) => _contarRango((S.sgc && S.sgc.finales) || [], 'fecha', desde, hasta),
      _primer: () => _primerArr((S.sgc && S.sgc.finales) || [], 'fecha'),
    },
    {
      id: 'con_finales_rendidos', seccion: 'conocimiento', label: 'Finales rendidos', unidad: 'count', dir: 'up', destacada: true, agg: 'count',
      calc: (desde, hasta) => {
        const done = ((S.sgc && S.sgc.finales) || []).filter(f => f.done);
        return _conDatos(_primerArr(done, 'doneEl'), hasta, () => _filtrar(done, 'doneEl', desde, hasta).length);
      },
      _primer: () => _primerArr(((S.sgc && S.sgc.finales) || []).filter(f => f.done), 'doneEl'),
    },
    {
      id: 'con_estudio_paginas', seccion: 'conocimiento', label: 'Páginas de estudio registradas', unidad: 'count', dir: 'up', destacada: true, agg: 'count',
      calc: (desde, hasta) => _contarRango(S.estudioPaginas, 'fecha', desde, hasta),
      desglose: (desde, hasta) => {
        const materias = _obj(S.estudioMaterias);
        const porMateria = {};
        _filtrar(S.estudioPaginas, 'fecha', desde, hasta).forEach(p => { porMateria[p.materiaId] = (porMateria[p.materiaId] || 0) + 1; });
        const entries = Object.entries(porMateria);
        if (!entries.length) return null;
        return entries.map(([mid, valorC]) => {
          const m = _arr(S.estudioMaterias).find(x => x.id === mid);
          return { label: m ? m.nombre : mid, valor: valorC, color: null };
        });
      },
      _primer: () => _primerArr(S.estudioPaginas, 'fecha'),
    },
    {
      id: 'con_estudio_materias', seccion: 'conocimiento', label: 'Materias en Notas de estudio (stock)', unidad: 'count', dir: 'neutral', destacada: false, agg: 'last',
      calc: () => Array.isArray(S.estudioMaterias) ? S.estudioMaterias.length : null,
      _primer: () => null,
    },
    {
      id: 'con_studycalendar_dias', seccion: 'conocimiento', label: 'Días de estudio', unidad: 'dias', dir: 'up', destacada: false, agg: 'count',
      calc: (desde, hasta) => _calendarioDias(S.studyCalendar, desde, hasta, ['done', 'studied']),
      _primer: () => _primerObjDias(S.studyCalendar && S.studyCalendar.days),
    },
    {
      id: 'con_studycalendar_pct', seccion: 'conocimiento', label: '% de días estudiando', unidad: 'pct', dir: 'up', destacada: true, agg: 'pct',
      calc: (desde, hasta) => _calendarioPct(S.studyCalendar, desde, hasta, ['done', 'studied']),
      _primer: () => _primerObjDias(S.studyCalendar && S.studyCalendar.days),
    },
    {
      id: 'con_notas_creadas', seccion: 'conocimiento', label: 'Notas de intelecto creadas', unidad: 'count', dir: 'up', destacada: false, agg: 'count',
      calc: (desde, hasta) => _contarRango(S.notas, 'fecha', desde, hasta),
      _primer: () => _primerArr(S.notas, 'fecha'),
    },
    {
      id: 'con_habitos_pct', seccion: 'conocimiento', label: '% cumplimiento hábitos de Conocimiento', unidad: 'pct', dir: 'up', destacada: false, agg: 'pct',
      calc: (desde, hasta) => _habitPct('conocimiento', desde, hasta),
      _primer: () => _primerHabitos('conocimiento'),
    },
    {
      id: 'con_pomodoro_minutos', seccion: 'conocimiento', label: 'Minutos de foco (todo el pomodoro)', unidad: 'min', dir: 'up', destacada: false, agg: 'sum',
      // pomodoroHistory no distingue "estudio" de otros usos (sin campo de
      // categoría) — se reporta el total, igual que en Vida; documentado.
      calc: (desde, hasta) => _sumRango(S.pomodoroHistory, 'date', desde, hasta, x => x.minutes),
      _primer: () => _primerArr(S.pomodoroHistory, 'date'),
    },
    {
      id: 'con_proyectos_completados', seccion: 'conocimiento', label: 'Proyectos de Conocimiento completados (stock)', unidad: 'count', dir: 'up', destacada: false, agg: 'last',
      calc: () => { const r = _proyectosContar('conocimiento'); return r.existe ? r.done : null; },
      _primer: () => null,
    },
  );

  // ═══════════ SALUD ═══════════
  CATALOGO.push(
    {
      id: 'salud_entrenamientos_sesiones', seccion: 'salud', label: 'Sesiones de entrenamiento', unidad: 'count', dir: 'up', destacada: true, agg: 'count',
      calc: (desde, hasta) => _contarRango(_routineLogFlat(), 'date', desde, hasta),
      desglose: (desde, hasta) => {
        const porRutina = {};
        _filtrar(_routineLogFlat(), 'date', desde, hasta).forEach(e => { porRutina[e.rtnId] = (porRutina[e.rtnId] || 0) + 1; });
        const entries = Object.entries(porRutina);
        if (!entries.length) return null;
        const rutinas = _arr(S.routines);
        return entries.map(([rid, valorC]) => {
          const r = rutinas.find(x => x.id === rid);
          return { label: r ? (r.name || rid) : rid, valor: valorC, color: null };
        });
      },
      _primer: () => _primerArr(_routineLogFlat(), 'date'),
    },
    {
      id: 'salud_entrenamientos_volumen', seccion: 'salud', label: 'Volumen total levantado', unidad: 'kg-vol', dir: 'up', destacada: true, agg: 'sum',
      calc: (desde, hasta) => _sumRango(_routineLogFlat(), 'date', desde, hasta, e => e.vol),
      _primer: () => _primerArr(_routineLogFlat(), 'date'),
    },
    {
      id: 'salud_entrenamientos_series', seccion: 'salud', label: 'Series totales', unidad: 'count', dir: 'up', destacada: false, agg: 'sum',
      calc: (desde, hasta) => _sumRango(_routineLogFlat(), 'date', desde, hasta, e => e.sets),
      _primer: () => _primerArr(_routineLogFlat(), 'date'),
    },
    {
      id: 'salud_entrenamientos_duracion', seccion: 'salud', label: 'Minutos entrenados', unidad: 'min', dir: 'up', destacada: false, agg: 'sum',
      calc: (desde, hasta) => {
        const flat = _routineLogFlat();
        if (!flat.length) return null;
        const en = _filtrar(flat, 'date', desde, hasta);
        const segs = en.reduce((s, e) => s + _n(e.duration), 0);
        return Math.round(segs / 60);
      },
      _primer: () => _primerArr(_routineLogFlat(), 'date'),
    },
    {
      id: 'salud_workoutlog_sesiones', seccion: 'salud', label: 'Sesiones registradas (log clásico)', unidad: 'count', dir: 'up', destacada: false, agg: 'count',
      calc: (desde, hasta) => _conDatos(_primerObjDias(S.workoutLog), hasta, () =>
        _clavesDia(S.workoutLog, desde, hasta).filter(ds => Object.keys(_obj(S.workoutLog[ds])).length > 0).length),
      _primer: () => _primerObjDias(S.workoutLog),
    },
    {
      id: 'salud_prs', seccion: 'salud', label: 'Récords personales (PRs)', unidad: 'count', dir: 'up', destacada: true, agg: 'count',
      // Cuenta solo los PRs cuya FECHA cae en [desde,hasta] (no "hubo alguna
      // entrada en el historial", que con cualquier historial no vacío daba
      // siempre true sin importar el rango pedido — ver HIGH 1 del review).
      calc: (desde, hasta) => _conDatos(_primerExerciseHistory(), hasta, () => {
        const hist = _obj(S.exerciseHistory);
        let prs = 0;
        Object.keys(hist).forEach(libId => {
          const entries = _arr(hist[libId]).slice().sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);
          let max = 0;
          entries.forEach(e => {
            const wMax = _arr(e.sets).reduce((m, s) => Math.max(m, _n(s.weight)), 0);
            if (wMax > max) {
              if (_enRango(e.date, desde, hasta)) prs++;
              max = wMax;
            }
          });
        });
        return prs;
      }),
      _primer: () => _primerExerciseHistory(),
    },
    {
      id: 'salud_peso_actual', seccion: 'salud', label: 'Peso corporal', unidad: 'kg', dir: 'neutral', destacada: true, agg: 'last',
      calc: (desde, hasta) => {
        const arr = _arr(S.bodyWeight).filter(x => x.date && x.date <= hasta).sort((a, b) => a.date < b.date ? -1 : 1);
        if (!arr.length) return null;
        return _n(arr[arr.length - 1].value);
      },
      _primer: () => _primerArr(S.bodyWeight, 'date'),
    },
    {
      id: 'salud_peso_registros', seccion: 'salud', label: 'Registros de peso', unidad: 'count', dir: 'up', destacada: false, agg: 'count',
      calc: (desde, hasta) => _contarRango(S.bodyWeight, 'date', desde, hasta),
      _primer: () => _primerArr(S.bodyWeight, 'date'),
    },
    {
      id: 'salud_fotos', seccion: 'salud', label: 'Fotos de progreso', unidad: 'count', dir: 'up', destacada: false, agg: 'count',
      // Solo se cuenta: jamás se lee photos[].src.
      calc: (desde, hasta) => _contarRango(S.photos, 'date', desde, hasta),
      _primer: () => _primerArr(S.photos, 'date'),
    },
    {
      id: 'salud_sueno_horas_prom', seccion: 'salud', label: 'Horas de sueño promedio', unidad: 'h', dir: 'up', destacada: true, agg: 'avg',
      calc: (desde, hasta) => _promedioCampoDia(S.sleepLog, 'hours', desde, hasta),
      _primer: () => _primerObjDias(S.sleepLog),
    },
    {
      id: 'salud_sueno_noches', seccion: 'salud', label: 'Noches registradas', unidad: 'count', dir: 'up', destacada: false, agg: 'count',
      calc: (desde, hasta) => _conDatosDias(S.sleepLog, hasta, () => _clavesDia(S.sleepLog, desde, hasta).length),
      _primer: () => _primerObjDias(S.sleepLog),
    },
    {
      id: 'salud_dieta_pct', seccion: 'salud', label: '% de días en cumplimiento de dieta', unidad: 'pct', dir: 'up', destacada: true, agg: 'pct',
      calc: (desde, hasta) => {
        if (!S.dieta || !Array.isArray(S.dieta.reglas) || !S.dieta.reglas.length) return null;
        const dias = _clavesDia(S.dieta.log, desde, hasta);
        if (!dias.length) return null;
        const umbral = Math.min(S.dieta.umbral != null ? S.dieta.umbral : 1, S.dieta.reglas.length);
        const cumplidos = dias.filter(ds => _arr(S.dieta.log[ds]).length >= umbral).length;
        return Math.round((cumplidos / dias.length) * 1000) / 10;
      },
      _primer: () => _primerObjDias(S.dieta && S.dieta.log),
    },
    {
      id: 'salud_dieta_dias_cumplidos', seccion: 'salud', label: 'Días de dieta cumplidos', unidad: 'dias', dir: 'up', destacada: false, agg: 'count',
      calc: (desde, hasta) => {
        if (!S.dieta || !Array.isArray(S.dieta.reglas) || !S.dieta.reglas.length) return null;
        return _conDatosDias(S.dieta.log, hasta, () => {
          const umbral = Math.min(S.dieta.umbral != null ? S.dieta.umbral : 1, S.dieta.reglas.length);
          return _clavesDia(S.dieta.log, desde, hasta).filter(ds => _arr(S.dieta.log[ds]).length >= umbral).length;
        });
      },
      _primer: () => _primerObjDias(S.dieta && S.dieta.log),
    },
    {
      id: 'salud_workoutcalendar_pct', seccion: 'salud', label: '% de días de entrenamiento', unidad: 'pct', dir: 'up', destacada: false, agg: 'pct',
      calc: (desde, hasta) => _calendarioPct(S.workoutCalendar, desde, hasta, ['done']),
      _primer: () => _primerObjDias(S.workoutCalendar && S.workoutCalendar.days),
    },
    {
      id: 'salud_habitos_pct', seccion: 'salud', label: '% cumplimiento hábitos de Salud', unidad: 'pct', dir: 'up', destacada: false, agg: 'pct',
      calc: (desde, hasta) => _habitPct('salud', desde, hasta),
      _primer: () => _primerHabitos('salud'),
    },
    {
      id: 'salud_notas', seccion: 'salud', label: 'Notas de salud creadas', unidad: 'count', dir: 'neutral', destacada: false, agg: 'count',
      calc: (desde, hasta) => _contarRango(S.notasSalud, 'fecha', desde, hasta),
      _primer: () => _primerArr(S.notasSalud, 'fecha'),
    },
    {
      id: 'salud_proyectos_completados', seccion: 'salud', label: 'Proyectos de Salud completados (stock)', unidad: 'count', dir: 'up', destacada: false, agg: 'last',
      calc: () => { const r = _proyectosContar('salud'); return r.existe ? r.done : null; },
      _primer: () => null,
    },
  );

  // ═══════════ IA ═══════════
  CATALOGO.push(
    {
      id: 'ia_notas_creadas', seccion: 'ia', label: 'Notas en Mapa de Ideas creadas', unidad: 'count', dir: 'up', destacada: true, agg: 'count',
      calc: (desde, hasta) => _contarRangoTs((S.mapaIdeas && S.mapaIdeas.notes) || [], 'creado', desde, hasta),
      _primer: () => _primerArrTs((S.mapaIdeas && S.mapaIdeas.notes) || [], 'creado'),
    },
    {
      id: 'ia_notas_editadas', seccion: 'ia', label: 'Notas en Mapa de Ideas editadas', unidad: 'count', dir: 'up', destacada: false, agg: 'count',
      calc: (desde, hasta) => _contarRangoTs((S.mapaIdeas && S.mapaIdeas.notes) || [], 'editado', desde, hasta),
      _primer: () => _primerArrTs((S.mapaIdeas && S.mapaIdeas.notes) || [], 'editado'),
    },
    {
      // Los links no llevan timestamp propio (solo el ts de creación/edición
      // de la nota que los contiene) → se reporta el stock de conexiones actual.
      id: 'ia_notas_conexiones', seccion: 'ia', label: 'Conexiones entre notas (stock)', unidad: 'count', dir: 'up', destacada: false, agg: 'last',
      calc: () => {
        const notes = _arr(S.mapaIdeas && S.mapaIdeas.notes);
        if (!notes.length) return null;
        return notes.reduce((s, n) => s + _arr(n.links).length, 0);
      },
      _primer: () => null,
    },
    {
      id: 'ia_sugerencias_total', seccion: 'ia', label: 'Sugerencias de conexión evaluadas', unidad: 'count', dir: 'neutral', destacada: false, agg: 'count',
      calc: (desde, hasta) => _contarRangoTs((S.mapaIdeas && S.mapaIdeas.suggestionLog) || [], 'ts', desde, hasta),
      _primer: () => _primerArrTs((S.mapaIdeas && S.mapaIdeas.suggestionLog) || [], 'ts'),
    },
    {
      id: 'ia_sugerencias_aceptadas', seccion: 'ia', label: 'Sugerencias de conexión aceptadas', unidad: 'count', dir: 'up', destacada: true, agg: 'count',
      calc: (desde, hasta) => {
        const arr = (S.mapaIdeas && S.mapaIdeas.suggestionLog) || [];
        if (!arr.length) return null;
        return _filtrarTs(arr, 'ts', desde, hasta).filter(l => l.decision === 'accept').length;
      },
      _primer: () => _primerArrTs((S.mapaIdeas && S.mapaIdeas.suggestionLog) || [], 'ts'),
    },
    {
      id: 'ia_sugerencias_tasa', seccion: 'ia', label: 'Tasa de aceptación de sugerencias', unidad: 'pct', dir: 'up', destacada: true, agg: 'pct',
      calc: (desde, hasta) => {
        const arr = (S.mapaIdeas && S.mapaIdeas.suggestionLog) || [];
        if (!arr.length) return null;
        const en = _filtrarTs(arr, 'ts', desde, hasta);
        if (!en.length) return null;
        const acept = en.filter(l => l.decision === 'accept').length;
        return Math.round((acept / en.length) * 1000) / 10;
      },
      _primer: () => _primerArrTs((S.mapaIdeas && S.mapaIdeas.suggestionLog) || [], 'ts'),
    },
    {
      id: 'ia_memoria_agregada', seccion: 'ia', label: 'Entradas de memoria de JARVIS agregadas', unidad: 'count', dir: 'neutral', destacada: false, agg: 'count',
      calc: (desde, hasta) => _contarRango(S.jarvisMemory, 'fecha', desde, hasta),
      _primer: () => _primerArr(S.jarvisMemory, 'fecha'),
    },
    {
      id: 'ia_memoria_total', seccion: 'ia', label: 'Memoria de JARVIS (stock)', unidad: 'count', dir: 'neutral', destacada: false, agg: 'last',
      calc: () => Array.isArray(S.jarvisMemory) ? S.jarvisMemory.length : null,
      _primer: () => null,
    },
    {
      id: 'ia_capturas_creadas', seccion: 'ia', label: 'Capturas para el vault creadas', unidad: 'count', dir: 'up', destacada: true, agg: 'count',
      calc: (desde, hasta) => _contarRango(S.capturas, 'fecha', desde, hasta),
      _primer: () => _primerArr(S.capturas, 'fecha'),
    },
    {
      id: 'ia_capturas_pendientes', seccion: 'ia', label: 'Capturas pendientes (stock)', unidad: 'count', dir: 'down', destacada: false, agg: 'last',
      calc: () => Array.isArray(S.capturas) ? S.capturas.length : null,
      _primer: () => null,
    },
    {
      // S.agentChat.displayLog no guarda fecha por mensaje → stock.
      id: 'ia_chat_mensajes', seccion: 'ia', label: 'Mensajes con JARVIS (stock)', unidad: 'count', dir: 'up', destacada: true, agg: 'last',
      calc: () => (S.agentChat && Array.isArray(S.agentChat.displayLog)) ? S.agentChat.displayLog.length : null,
      _primer: () => null,
    },
    {
      // S.ideas.ia sin fecha → stock.
      id: 'ia_ideas_creadas', seccion: 'ia', label: 'Ideas de IA anotadas (stock)', unidad: 'count', dir: 'up', destacada: false, agg: 'last',
      calc: () => (S.ideas && Array.isArray(S.ideas.ia)) ? S.ideas.ia.length : null,
      _primer: () => null,
    },
    {
      id: 'ia_habitos_pct', seccion: 'ia', label: '% cumplimiento hábitos de IA', unidad: 'pct', dir: 'up', destacada: false, agg: 'pct',
      calc: (desde, hasta) => _habitPct('ia', desde, hasta),
      _primer: () => _primerHabitos('ia'),
    },
    {
      id: 'ia_proyectos_completados', seccion: 'ia', label: 'Proyectos de IA completados (stock)', unidad: 'count', dir: 'up', destacada: false, agg: 'last',
      calc: () => { const r = _proyectosContar('ia'); return r.existe ? r.done : null; },
      _primer: () => null,
    },
  );

  const _metricaMap = {};
  CATALOGO.forEach(m => { _metricaMap[m.id] = m; });

  // ────────────────────────────────────────────────────────────────────
  // A.2 — Cobertura de datos
  // ────────────────────────────────────────────────────────────────────
  let _primerGlobalCache;
  function primerDatoMetrica(metricaId) {
    const m = _metricaMap[metricaId];
    if (!m || typeof m._primer !== 'function') return null;
    try { return m._primer() || null; } catch (e) { return null; }
  }
  function primerDatoGlobal() {
    if (_primerGlobalCache !== undefined) return _primerGlobalCache;
    let min = null;
    CATALOGO.forEach(m => {
      const f = primerDatoMetrica(m.id);
      if (f && (min === null || f < min)) min = f;
    });
    _primerGlobalCache = min;
    return min;
  }
  function periodosDisponibles(gran) {
    const pg = primerDatoGlobal();
    if (!pg) return [];
    const hoy = _hoyStr();
    const last = claveDe(gran, hoy);
    let cur = claveDe(gran, pg);
    const out = [];
    let guard = 0;
    while (guard < 2000) {
      out.push(cur);
      if (cur === last) break;
      cur = _siguienteClave(cur);
      guard++;
    }
    return out.filter(c => CATALOGO.some(m => valor(m.id, c) !== null));
  }
  function cobertura(clave) {
    const { desde, hasta } = rangoDe(clave);
    const pg = primerDatoGlobal();
    if (!pg) return { parcial: false, desde, hasta, motivo: 'sin datos registrados aún' };
    const parcial = pg > desde && pg <= hasta;
    return { parcial, desde, hasta, motivo: parcial ? `los datos arrancan el ${pg}` : null };
  }

  // ────────────────────────────────────────────────────────────────────
  // A.4 — Valores y matriz
  // ────────────────────────────────────────────────────────────────────
  const _cache = new Map();

  function valor(metricaId, clave) {
    const key = metricaId + '|' + clave;
    if (_cache.has(key)) return _cache.get(key);
    const metric = _metricaMap[metricaId];
    if (!metric) { _cache.set(key, null); return null; }

    // Snapshot cerrado: si existe y trae la métrica, manda (aunque sea null).
    if (S && S.informes && S.informes[clave]) {
      const snap = S.informes[clave];
      const sec = snap.secciones && snap.secciones[metric.seccion];
      if (sec && sec.metricas && Object.prototype.hasOwnProperty.call(sec.metricas, metricaId)) {
        const v = sec.metricas[metricaId];
        _cache.set(key, v);
        return v;
      }
    }

    const { desde, hasta } = rangoDe(clave);
    let v;
    try { v = metric.calc(desde, hasta); } catch (e) { v = null; }
    if (v !== null && v !== undefined && (typeof v !== 'number' || !isFinite(v))) v = null;
    if (v === undefined) v = null;
    _cache.set(key, v);
    return v;
  }

  // Excluye SIEMPRE el período en curso: es un período incompleto (hoy es
  // 4 de septiembre → "septiembre" trae 4 días de datos) y promediarlo crudo
  // junto a períodos cerrados hunde/infla el promedio histórico sin que
  // signifique nada real (ver HIGH 2 del review 2026-09-04). Lo mismo aplica
  // a la regla de "récord histórico" de narrativaSeccion.
  function _periodosCerrados(gran) {
    return periodosDisponibles(gran).filter(c => !enCurso(c));
  }
  function _promedioHistorico(metricaId, gran) {
    const vals = _periodosCerrados(gran).map(c => valor(metricaId, c)).filter(v => v !== null);
    if (vals.length < 2) return { base: null, n: vals.length };
    return { base: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length };
  }
  // Variante pro-rata: cada período histórico CERRADO se recalcula solo con
  // sus primeros `dias` días (misma cantidad de días que ya transcurrió el
  // foco en curso), para que comparar "septiembre a día 4" contra el
  // promedio no penalice al período abierto solo por estar incompleto
  // (MEDIUM 3 del review 2026-09-04) — mismo mecanismo que ya usan
  // dIntra/dInter al pro-ratear contra un período de referencia puntual.
  function _promedioHistoricoProRata(metric, gran, dias) {
    const vals = _periodosCerrados(gran).map(c => {
      const r = rangoDe(c);
      const hastaSliced = _addDias(r.desde, dias - 1);
      const hastaFinal = hastaSliced < r.hasta ? hastaSliced : r.hasta;
      let v;
      try { v = metric.calc(r.desde, hastaFinal); } catch (e) { v = null; }
      if (v !== null && (typeof v !== 'number' || !isFinite(v))) v = null;
      return v;
    }).filter(v => v !== null);
    if (vals.length < 2) return { base: null, n: vals.length };
    return { base: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length };
  }

  function _numAR(n, dec) {
    return n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function _fmtPct(pct) {
    const sign = pct > 0 ? '+' : (pct < 0 ? '−' : '');
    return `${sign}${_numAR(Math.abs(pct), 1)}%`;
  }

  // tipo: 'intra' | 'inter' | 'prom'
  function _delta(metricaId, metric, claveFoco, valorFoco, tipo) {
    const focoParcial = cobertura(claveFoco).parcial;
    const focoEnCurso = enCurso(claveFoco);

    if (valorFoco === null) {
      const refLabel = tipo === 'prom' ? 'Promedio histórico' : labelDe(tipo === 'intra' ? anterior(claveFoco) : anioAnterior(claveFoco));
      return { ref: tipo === 'prom' ? 'promedio' : (tipo === 'intra' ? anterior(claveFoco) : anioAnterior(claveFoco)), refLabel, base: null, abs: null, pct: null, estado: 'sin-dato', texto: '— sin dato comparable', proRata: false };
    }

    let refClave = null, refLabel, base, proRata = false;

    if (tipo === 'prom') {
      const { gran } = parseClave(claveFoco);
      refLabel = 'Promedio histórico';
      if (focoEnCurso) {
        const dias = diasTranscurridos(claveFoco);
        const { base: b, n } = _promedioHistoricoProRata(metric, gran, dias);
        if (n < 2) return { ref: 'promedio', refLabel, base: null, abs: null, pct: null, estado: 'sin-dato', texto: '— sin dato comparable', proRata: true };
        base = b;
        proRata = true;
      } else {
        const { base: b, n } = _promedioHistorico(metricaId, gran);
        if (n < 2) return { ref: 'promedio', refLabel, base: null, abs: null, pct: null, estado: 'sin-dato', texto: '— sin dato comparable', proRata: false };
        base = b;
      }
    } else {
      refClave = tipo === 'intra' ? anterior(claveFoco) : anioAnterior(claveFoco);
      refLabel = labelDe(refClave);
      const refCob = cobertura(refClave);
      if (refCob.parcial && !focoParcial) {
        return { ref: refClave, refLabel, base: null, abs: null, pct: null, estado: 'suprimido', texto: '— no comparable (parcial)', proRata: false };
      }
      if (focoEnCurso) {
        const dias = diasTranscurridos(claveFoco);
        const refRango = rangoDe(refClave);
        const hastaProRata = _addDias(refRango.desde, dias - 1);
        const hastaFinal = hastaProRata < refRango.hasta ? hastaProRata : refRango.hasta;
        try { base = metric.calc(refRango.desde, hastaFinal); } catch (e) { base = null; }
        if (base !== null && (typeof base !== 'number' || !isFinite(base))) base = null;
        proRata = true;
      } else {
        base = valor(metricaId, refClave);
      }
      if (base === null) {
        return { ref: refClave, refLabel, base: null, abs: null, pct: null, estado: 'sin-dato', texto: '— sin dato comparable', proRata };
      }
    }

    const abs = valorFoco - base;
    let estado, texto, pct;

    if (base === 0) {
      if (valorFoco > 0) { estado = 'nuevo'; texto = 'nuevo'; pct = null; }
      else if (valorFoco === 0) { estado = 'igual'; texto = 'sin cambios'; pct = 0; }
      else {
        pct = null;
        estado = metric.dir === 'down' ? 'mejor' : (metric.dir === 'up' ? 'peor' : 'igual');
        texto = 'nuevo (negativo)';
      }
    } else {
      pct = (abs / Math.abs(base)) * 100;
      if (!isFinite(pct)) pct = 0;
      pct = Math.round(pct * 10) / 10;
      const dir = metric.dir;
      if (dir === 'neutral' || abs === 0) estado = 'igual';
      else if (dir === 'up') estado = abs > 0 ? 'mejor' : 'peor';
      else estado = abs > 0 ? 'peor' : 'mejor';
      texto = _fmtPct(pct);
    }

    return { ref: tipo === 'prom' ? 'promedio' : refClave, refLabel, base, abs, pct, estado, texto, proRata };
  }

  function matriz(metricaId, claveFoco) {
    const metric = _metricaMap[metricaId];
    if (!metric) return null;
    const claves = contenedores(claveFoco);
    const filas = claves.map(clave => {
      const { gran } = parseClave(clave);
      const v = valor(metricaId, clave);
      const cob = cobertura(clave);
      return {
        gran, clave, label: labelDe(clave), valor: v,
        parcial: cob.parcial, enCurso: enCurso(clave),
        dIntra: _delta(metricaId, metric, clave, v, 'intra'),
        dInter: _delta(metricaId, metric, clave, v, 'inter'),
        dProm: _delta(metricaId, metric, clave, v, 'prom'),
      };
    });

    const subG = subGranularidades(parseClave(claveFoco).gran);
    const NOMBRES = { M: 'Meses', T: 'Trimestres', S: 'Semestres' };
    const serie = subG.map(g => {
      const puntos = subVentanas(claveFoco, g).map(c => ({ clave: c, label: labelCortoDe(c), valor: valor(metricaId, c) }));
      const vals = puntos.map(p => p.valor).filter(v => v !== null);
      let mejor = null, peor = null, prom = null, desvio = null;
      if (vals.length) {
        mejor = Math.max.apply(null, vals);
        peor = Math.min.apply(null, vals);
        prom = vals.reduce((a, b) => a + b, 0) / vals.length;
        const varr = vals.reduce((a, b) => a + Math.pow(b - prom, 2), 0) / vals.length;
        desvio = Math.sqrt(varr);
      }
      return { gran: g, label: NOMBRES[g] || g, puntos, mejor, peor, prom, desvio };
    });

    return { metrica: metric, filas, serie };
  }

  // ────────────────────────────────────────────────────────────────────
  // A.5 — Formato
  // ────────────────────────────────────────────────────────────────────
  // Formato compacto para las FILAS de la matriz: ahí conviven 5 columnas en una
  // tarjeta de ~360px y un importe como "$ 5.013.500" no entra — se cortaba a la
  // mitad ("$ 5.013.5("), que en un informe de finanzas es ilegible. La cifra
  // exacta se sigue mostrando entera arriba de la tarjeta y en el title de la celda.
  function fmtCompacto(valorX, unidad) {
    if (valorX === null || valorX === undefined || typeof valorX !== 'number' || !isFinite(valorX)) return 'sin datos';
    if (unidad === 'ARS') {
      const a = Math.abs(valorX);
      const sign = valorX < 0 ? '-' : '';
      if (a >= 1e6) return `${sign}$ ${_numAR(a / 1e6, 2)} M`;
      if (a >= 1e4) return `${sign}$ ${_numAR(a / 1e3, 0)} k`;
      return fmt(valorX, unidad);
    }
    return fmt(valorX, unidad);
  }

  function fmt(valorX, unidad) {
    if (valorX === null || valorX === undefined || typeof valorX !== 'number' || !isFinite(valorX)) return 'sin datos';
    switch (unidad) {
      case 'ARS': {
        const r = Math.round(valorX);
        const sign = r < 0 ? '-' : '';
        return `${sign}$ ${Math.abs(r).toLocaleString('es-AR')}`;
      }
      case 'count': return String(Math.round(valorX));
      case 'pct': return `${Math.round(valorX)}%`;
      case 'kg': return `${_numAR(valorX, 1)} kg`;
      case 'h': return `${_numAR(valorX, 1)} h`;
      case 'min': return `${Math.round(valorX)} min`;
      case 'dias': return `${Math.round(valorX)} días`;
      case 'kg-vol':
        return Math.abs(valorX) >= 1000 ? `${_numAR(valorX / 1000, 1)} t` : `${Math.round(valorX)} kg`;
      default: return _numAR(valorX, 1);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // A.6 — Narrativa por reglas
  // ────────────────────────────────────────────────────────────────────
  function _metricasDeSeccion(seccion) { return CATALOGO.filter(m => m.seccion === seccion); }

  function _rachaCalendarioSeccion(seccion) {
    if (seccion === 'salud') {
      const r = _rachaCalendario(S.workoutCalendar, ['done']);
      return r ? { label: 'entrenamiento', ...r } : null;
    }
    if (seccion === 'conocimiento') {
      const r = _rachaCalendario(S.studyCalendar, ['done', 'studied']);
      return r ? { label: 'estudio', ...r } : null;
    }
    if (seccion === 'finanzas') {
      const r = _rachaCalendario(S.financeCalendar, ['done']);
      return r ? { label: 'control financiero', ...r } : null;
    }
    return null;
  }
  function _rachaDietaSeccion() {
    if (!S.dieta || !Array.isArray(S.dieta.reglas) || !S.dieta.reglas.length) return null;
    const claves = Object.keys(_obj(S.dieta.log));
    if (!claves.length) return null;
    const umbral = Math.min(S.dieta.umbral != null ? S.dieta.umbral : 1, S.dieta.reglas.length);
    let cursor = _hoyStr(), actual = 0, guard = 0;
    while (_arr(S.dieta.log[cursor]).length >= umbral && guard < 3650) { actual++; cursor = _addDias(cursor, -1); guard++; }
    let record = 0, run = 0, prev = null;
    claves.slice().sort().forEach(ds => {
      const ok = _arr(S.dieta.log[ds]).length >= umbral;
      if (ok) { run = (prev && _addDias(prev, 1) === ds) ? run + 1 : 1; if (run > record) record = run; }
      else run = 0;
      prev = ds;
    });
    return { label: 'dieta', actual, record };
  }
  function _rachasSeccion(seccion) {
    const out = [];
    const rc = _rachaCalendarioSeccion(seccion);
    if (rc) out.push({ label: rc.label, actual: rc.actual, record: rc.record, unidad: 'dias' });
    if (seccion === 'salud') {
      const rd = _rachaDietaSeccion();
      if (rd) out.push({ label: rd.label, actual: rd.actual, record: rd.record, unidad: 'dias' });
    }
    if (seccion === 'vida' && S.streak && S.streak.count) {
      out.push({ label: 'racha general', actual: S.streak.count, record: S.streak.count, unidad: 'dias' });
    }
    return out;
  }

  function narrativaSeccion(seccion, claveFoco) {
    const metricas = _metricasDeSeccion(seccion).filter(m => m.destacada);
    const frases = [];

    // 1) mayor suba / mayor baja intra-ventana entre destacadas
    let mejorSubida = null, mayorBaja = null;
    metricas.forEach(m => {
      const v = valor(m.id, claveFoco);
      if (v === null) return;
      const d = _delta(m.id, m, claveFoco, v, 'intra');
      if (d.pct === null || (d.estado !== 'mejor' && d.estado !== 'peor')) return;
      if (d.abs > 0 && (!mejorSubida || d.pct > mejorSubida.d.pct)) mejorSubida = { m, d };
      if (d.abs < 0 && (!mayorBaja || d.pct < mayorBaja.d.pct)) mayorBaja = { m, d };
    });
    if (mejorSubida) frases.push({ texto: `${mejorSubida.m.label} ${mejorSubida.d.texto} intra-ventana, la mayor suba del período entre las métricas destacadas.`, tono: mejorSubida.d.estado === 'mejor' ? 'ok' : 'warn' });
    if (mayorBaja) frases.push({ texto: `${mayorBaja.m.label} ${mayorBaja.d.texto} intra-ventana, la mayor baja del período entre las métricas destacadas.`, tono: mayorBaja.d.estado === 'mejor' ? 'ok' : 'warn' });

    // 2) récord histórico (máx/mín de toda la serie de esa granularidad).
    // Un período en curso no puede reclamar récord (compite con desventaja
    // frente a períodos cerrados completos) ni puede ensuciar el pool de
    // comparación de otro período (ver HIGH 2 del review 2026-09-04).
    const { gran } = parseClave(claveFoco);
    const periodos = _periodosCerrados(gran);
    if (periodos.length >= 2 && !enCurso(claveFoco)) {
      metricas.forEach(m => {
        const vFoco = valor(m.id, claveFoco);
        if (vFoco === null) return;
        const vals = periodos.map(c => valor(m.id, c)).filter(v => v !== null);
        if (vals.length < 2) return;
        const max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
        if (vFoco === max && vals.filter(v => v === max).length === 1) {
          frases.push({ texto: `${m.label} alcanzó su máximo histórico en este período: ${fmt(vFoco, m.unidad)}.`, tono: 'ok' });
        } else if (vFoco === min && vals.filter(v => v === min).length === 1) {
          frases.push({ texto: `${m.label} tocó su mínimo histórico en este período: ${fmt(vFoco, m.unidad)}.`, tono: m.dir === 'down' ? 'ok' : 'warn' });
        }
      });
    }

    // 3) cruce de promedio en cualquier dirección
    metricas.forEach(m => {
      const vFoco = valor(m.id, claveFoco);
      if (vFoco === null) return;
      const d = _delta(m.id, m, claveFoco, vFoco, 'prom');
      if (d.estado === 'mejor') frases.push({ texto: `${m.label} está por encima de su promedio histórico (${d.texto}).`, tono: 'ok' });
      else if (d.estado === 'peor') frases.push({ texto: `${m.label} está por debajo de su promedio histórico (${d.texto}).`, tono: 'warn' });
    });

    // 4) comparación interanual cuando existe
    metricas.forEach(m => {
      const vFoco = valor(m.id, claveFoco);
      if (vFoco === null) return;
      const d = _delta(m.id, m, claveFoco, vFoco, 'inter');
      if (d.estado === 'mejor' || d.estado === 'peor') {
        frases.push({ texto: `${m.label} vs el mismo período del año pasado: ${d.texto}.`, tono: d.estado === 'mejor' ? 'ok' : 'warn' });
      }
    });

    // 5) racha más larga del período (estudio/gym/dieta/hábitos)
    _rachasSeccion(seccion).forEach(r => {
      if (!r.actual) return;
      frases.push({ texto: `Racha de ${r.label}: ${r.actual} días (récord ${r.record} días).`, tono: r.actual >= r.record ? 'ok' : 'neutral' });
    });

    return frases.slice(0, 6);
  }

  function resumenEjecutivo(claveFoco) {
    const destacadas = CATALOGO.filter(m => m.destacada);
    const items = [];
    destacadas.forEach(m => {
      const v = valor(m.id, claveFoco);
      if (v === null) return;
      const d = _delta(m.id, m, claveFoco, v, 'intra');
      if (d.estado === 'mejor' || d.estado === 'peor') {
        items.push({ metricaId: m.id, label: m.label, seccion: m.seccion, texto: `${m.label}: ${d.texto} vs ${d.refLabel}`, estado: d.estado, pctAbs: d.pct === null ? 0 : Math.abs(d.pct) });
      }
    });
    const highlights = items.filter(i => i.estado === 'mejor').sort((a, b) => b.pctAbs - a.pctAbs).slice(0, 5).map(({ metricaId, label, seccion, texto }) => ({ metricaId, label, seccion, texto }));
    const alertas = items.filter(i => i.estado === 'peor').sort((a, b) => b.pctAbs - a.pctAbs).slice(0, 5).map(({ metricaId, label, seccion, texto }) => ({ metricaId, label, seccion, texto }));

    const rachas = [];
    ['vida', 'finanzas', 'conocimiento', 'salud'].forEach(sec => { _rachasSeccion(sec).forEach(r => rachas.push(r)); });

    let sobrePromedio = 0, bajoPromedio = 0, sinDatos = 0;
    CATALOGO.forEach(m => {
      const v = valor(m.id, claveFoco);
      if (v === null) { sinDatos++; return; }
      const d = _delta(m.id, m, claveFoco, v, 'prom');
      if (d.estado === 'mejor') sobrePromedio++;
      else if (d.estado === 'peor') bajoPromedio++;
    });

    return { highlights, alertas, rachas, sobrePromedio, bajoPromedio, sinDatos, cobertura: cobertura(claveFoco) };
  }

  // ────────────────────────────────────────────────────────────────────
  // A.7 — Snapshots
  // ────────────────────────────────────────────────────────────────────
  function ensureInformes() {
    if (!S.informes || typeof S.informes !== 'object') S.informes = {};
  }

  function snapshotDe(clave) {
    const secciones = {};
    ['vida', 'finanzas', 'conocimiento', 'salud', 'ia'].forEach(sec => {
      const metricas = {}, labels = {};
      CATALOGO.filter(m => m.seccion === sec).forEach(m => {
        metricas[m.id] = valor(m.id, clave);
        labels[m.id] = m.label;
      });
      secciones[sec] = { metricas, labels };
    });
    return { cerrado: new Date().toISOString(), v: 1, secciones };
  }

  function cerrarPeriodosVencidos() {
    ensureInformes();
    const hoy = _hoyStr();
    let changed = false;
    GRANS.forEach(gran => {
      periodosDisponibles(gran).forEach(clave => {
        if (S.informes[clave]) return; // idempotente: primero que cierra, gana
        const { hasta } = rangoDe(clave);
        if (hasta >= hoy) return; // en curso o futuro: nunca se congela
        let snap = snapshotDe(clave);
        // Recorte en dos escalones, RE-MIDIENDO después de cada uno (el bug
        // que corrige esto: medir una sola vez y confiar en que el recorte
        // alcanzó — si el catálogo crece, un snapshot recortado podía seguir
        // pasado de 15360 sin que nada lo detectara). Escalón 1: sacar las
        // métricas no destacadas. Escalón 2 (solo si el 1 no alcanzó): sacar
        // también las etiquetas históricas (se pierde la conservación exacta
        // del label vigente al cierre para ese snapshot puntual, pero un
        // snapshot que no entra en el documento es peor).
        if (JSON.stringify(snap).length > 15360) {
          const recorte = JSON.parse(JSON.stringify(snap));
          Object.keys(recorte.secciones).forEach(sec => {
            const metricasSec = recorte.secciones[sec].metricas;
            const labelsSec = recorte.secciones[sec].labels;
            CATALOGO.filter(m => m.seccion === sec && !m.destacada).forEach(m => { delete metricasSec[m.id]; delete labelsSec[m.id]; });
          });
          recorte.recortado = true;
          snap = recorte;

          if (JSON.stringify(snap).length > 15360) {
            const recorte2 = JSON.parse(JSON.stringify(snap));
            Object.keys(recorte2.secciones).forEach(sec => { recorte2.secciones[sec].labels = {}; });
            recorte2.recortado = true;
            recorte2.recortadoDuro = true;
            snap = recorte2;
          }
        }
        S.informes[clave] = snap;
        changed = true;
      });
    });
    if (changed && typeof saveState === 'function') saveState();
  }

  function invalidarCache() {
    _cache.clear();
    _primerGlobalCache = undefined;
  }

  // Precarga asíncrona de data/cartera/<YYYY-MM>.json para los meses entre
  // primerDatoGlobal() y hoy. NO se llama sola — el motor es síncrono a
  // propósito (valor()/matriz() no pueden depender de una Promise) así que
  // la UI (informes.js) es responsable de invocarla y esperarla ANTES de
  // pedir cualquier valor()/matriz() de una métrica 'fin_cartera_*'; si no
  // se llama, esas métricas simplemente devuelven null (sin datos), como
  // cualquier otra fuente vacía — no rompen nada.
  // Un mes sin archivo (404) es esperable y normal: se cachea como
  // "no disponible" (null en el store) sin console.error y sin frenar el
  // resto de la precarga. Un fallo total de red (fetch rechaza, o no existe
  // `fetch` en el entorno) tampoco puede tirar abajo el motor: se resuelve
  // igual, dejando esas métricas en null.
  function precargarCartera() {
    const pg = primerDatoGlobal();
    if (!pg) return Promise.resolve();
    const fetchFn = (typeof fetch === 'function') ? fetch
      : (typeof global !== 'undefined' && typeof global.fetch === 'function') ? global.fetch
      : null;
    if (!fetchFn) return Promise.resolve(); // entorno sin fetch (ej. smoke test sin mock): cartera queda sin datos, no rompe
    const meses = _mesesEnRango(pg, _hoyStr());
    const tareas = meses.map(mk => {
      if (_carteraStore[mk] !== undefined) return Promise.resolve(); // ya resuelto (éxito o "no disponible")
      return fetchFn(`data/cartera/${mk}.json`)
        .then(res => {
          if (!res || !res.ok) { _carteraStore[mk] = null; return; }
          return res.json()
            .then(data => { _carteraStore[mk] = data || null; })
            .catch(() => { _carteraStore[mk] = null; }); // JSON malformado: mes no disponible, no rompe
        })
        .catch(() => { _carteraStore[mk] = null; }); // sin red / fetch rechazado: mes no disponible, no rompe
    });
    return Promise.all(tareas).then(() => { invalidarCache(); });
  }

  // ────────────────────────────────────────────────────────────────────
  // Export
  // ────────────────────────────────────────────────────────────────────
  global.CMInformesData = {
    claveDe, parseClave, rangoDe, labelDe, labelCortoDe, anterior, anioAnterior,
    contenedores, subGranularidades, subVentanas, enCurso, diasTranscurridos,
    primerDatoGlobal, primerDatoMetrica, periodosDisponibles, cobertura,
    CATALOGO, valor, matriz, fmt, fmtCompacto, narrativaSeccion, resumenEjecutivo,
    snapshotDe, cerrarPeriodosVencidos, invalidarCache, ensureInformes,
    precargarCartera,
  };

})(typeof window !== 'undefined' ? window : globalThis);
