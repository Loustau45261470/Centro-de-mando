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
  function _contarRango(arr, campo, desde, hasta) {
    return _conDatos(_primerArr(arr, campo), hasta, () => _filtrar(arr, campo, desde, hasta).length);
  }
  function _sumRango(arr, campo, desde, hasta, valorFn) {
    return _conDatos(_primerArr(arr, campo), hasta, () =>
      _filtrar(arr, campo, desde, hasta).reduce((s, x) => s + (valorFn ? _n(valorFn(x)) : _n(x.amount)), 0));
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
  // A.3 — Catálogo de métricas (ADENDUM v2, 29 métricas — ver
  // ADDENDUM-informes-v2.md, que manda sobre el contrato original donde haya
  // conflicto). Se podó de 85 a 29 tras usar el informe con datos reales:
  // causa raíz encontrada, 20 métricas tenían `calc: () => ...` ignorando
  // `desde`/`hasta` — devolvían el acumulado actual, idéntico en todo
  // período, y los deltas terminaban midiendo el crecimiento del total, no
  // la actividad real de la ventana. Regla dura desde acá: NINGUNA métrica
  // puede ignorar `desde`/`hasta` en su `calc`, salvo las dos marcadas
  // `soloSnapshot` (con_promedio_carrera / con_materias_aprobadas), que
  // tienen su propio mecanismo (ver más abajo, no recalculan hacia atrás).
  //
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
  // Campos nuevos del addendum en cada entrada:
  //   fundamental: true|false — SOLO estas alimentan highlights/alertas del
  //     resumen ejecutivo y la regla de "mayor suba/baja" de la narrativa.
  //     Reemplaza a `destacada` en ese rol (9 fundamentales en total).
  //   minGran: 'M'|'T' — granularidad mínima. 'T' = la métrica no se muestra
  //     con foco mensual (matriz() devuelve null) y su serie desagregada
  //     nunca baja a meses. Es para lo estacional: comparar mes a mes miente
  //     (con_promedio_carrera, con_materias_aprobadas).
  //   soloSnapshot: true — SOLO en las 2 de carrera. El valor de un período
  //     CERRADO sale únicamente de S.informes[clave]; si no hay snapshot,
  //     null para siempre (nunca se recalcula hacia atrás). El período EN
  //     CURSO sí muestra su valor vivo (ver manejo especial en valor()/_delta()).
  //   descripcion: '...' — una línea en criollo, sin jerga ni nombres de
  //     variables, que la UI muestra bajo el título de cada métrica.
  // ────────────────────────────────────────────────────────────────────

  const CATALOGO = [];

  // ═══════════ VIDA (2) ═══════════
  CATALOGO.push(
    {
      id: 'vida_habitos_pct', seccion: 'vida', label: '% cumplimiento hábitos de Vida', unidad: 'pct', dir: 'up',
      fundamental: true, minGran: 'M', agg: 'pct',
      descripcion: 'De los hábitos que tenés cargados en Vida, qué porcentaje cumpliste en el período.',
      calc: (desde, hasta) => _habitPct('vida', desde, hasta),
      _primer: () => _primerHabitos('vida'),
    },
    {
      id: 'vida_dayplan_pct', seccion: 'vida', label: '% del planner cumplido', unidad: 'pct', dir: 'up',
      fundamental: false, minGran: 'M', agg: 'pct',
      descripcion: 'De las tareas que planificaste en la agenda diaria, cuántas marcaste como hechas.',
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
  );

  // ═══════════ FINANZAS (13) ═══════════
  CATALOGO.push(
    {
      id: 'fin_ingresos', seccion: 'finanzas', label: 'Ingresos', unidad: 'ARS', dir: 'up',
      fundamental: true, minGran: 'M', agg: 'sum',
      descripcion: 'Todo lo que entró a tus cuentas en el período, sumado en pesos.',
      calc: (desde, hasta) => _conDatos(_primerArr(S.transactions, 'date'), hasta, () =>
        _filtrar(S.transactions, 'date', desde, hasta).filter(t => t.type === 'income' && t.currency === 'ARS').reduce((s, t) => s + _n(t.amount), 0)),
      _primer: () => _primerArr(S.transactions, 'date'),
    },
    {
      id: 'fin_egresos', seccion: 'finanzas', label: 'Egresos', unidad: 'ARS', dir: 'down',
      fundamental: true, minGran: 'M', agg: 'sum',
      descripcion: 'Todo lo que gastaste en el período, sumado en pesos.',
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
      id: 'fin_neto', seccion: 'finanzas', label: 'Resultado neto', unidad: 'ARS', dir: 'up',
      fundamental: true, minGran: 'M', agg: 'sum',
      descripcion: 'Ingresos menos egresos del período: lo que te quedó (o te faltó).',
      calc: (desde, hasta) => _conDatos(_primerArr(S.transactions, 'date'), hasta, () => {
        const todas = _filtrar(S.transactions, 'date', desde, hasta).filter(t => t.currency === 'ARS');
        const ing = todas.filter(t => t.type === 'income').reduce((s, t) => s + _n(t.amount), 0);
        const eg = todas.filter(t => t.type === 'expense').reduce((s, t) => s + _n(t.amount), 0);
        return ing - eg;
      }),
      _primer: () => _primerArr(S.transactions, 'date'),
    },
    {
      id: 'fin_patrimonio', seccion: 'finanzas', label: 'Patrimonio neto', unidad: 'ARS', dir: 'up',
      fundamental: true, minGran: 'M', agg: 'last',
      descripcion: 'El valor total de tus cuentas al cierre del período, según el último registro cargado.',
      // Serie de stock: se reporta el último valor conocido hasta el cierre
      // del período (carry-forward), igual que un saldo de cuenta.
      calc: (desde, hasta) => {
        const arr = _arr(S.nwHistory).filter(x => x.date && x.date <= hasta).sort((a, b) => a.date < b.date ? -1 : 1);
        if (!arr.length) return null;
        return _n(arr[arr.length - 1].value);
      },
      _primer: () => _primerArr(S.nwHistory, 'date'),
    },
    // ── Cartera de inversión (data/cartera/*.json) — requiere precargarCartera() ──
    {
      id: 'fin_cartera_valorizado', seccion: 'finanzas', label: 'Valorizado de cartera', unidad: 'ARS', dir: 'up',
      // Fundamental: para Tobías el valor de la cartera es una de las cifras que
      // más importa. Si el archivo mensual falta, la métrica da null y queda
      // fuera de highlights por la vía normal de "sin datos" — no hace falta
      // degradarla de antemano.
      fundamental: true, minGran: 'M',
      descripcion: 'Cuánto vale tu cartera de CEDEARs al precio del mes, según el último informe mensual disponible.',
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
      id: 'fin_cartera_variacion_prom', seccion: 'finanzas', label: 'Variación de cartera', unidad: 'pct', dir: 'up',
      fundamental: false, minGran: 'M',
      descripcion: 'Cuánto subió o bajó tu cartera en promedio, ponderando cada CEDEAR por lo que representa en plata.',
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
      id: 'fin_cartera_mejor_cedear', seccion: 'finanzas', label: 'Mejor CEDEAR', unidad: 'pct', dir: 'up',
      fundamental: false, minGran: 'M', agg: 'last',
      descripcion: 'El CEDEAR que más subió en el mes, de los que tenés en cartera.',
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
      id: 'fin_cartera_peor_cedear', seccion: 'finanzas', label: 'Peor CEDEAR', unidad: 'pct', dir: 'up',
      fundamental: false, minGran: 'M', agg: 'last',
      descripcion: 'El CEDEAR que más bajó en el mes, de los que tenés en cartera.',
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
      id: 'fin_cartera_score_picks', seccion: 'finanzas', label: 'Acierto de predicciones', unidad: 'pct', dir: 'up',
      fundamental: false, minGran: 'M',
      descripcion: 'De las acciones que el sistema predijo como oportunidad, cuántas efectivamente subieron.',
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
    {
      id: 'fin_presupuesto_ejecutado_pct', seccion: 'finanzas', label: '% presupuesto ejecutado', unidad: 'pct', dir: 'down',
      fundamental: false, minGran: 'M', agg: 'pct',
      descripcion: 'De lo que presupuestaste para gastos fijos y reservas, qué porcentaje terminaste gastando de verdad.',
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
      id: 'fin_gastos_fijos_pct', seccion: 'finanzas', label: '% gastos fijos cumplidos', unidad: 'pct', dir: 'up',
      fundamental: false, minGran: 'M', agg: 'pct',
      descripcion: 'De tus gastos fijos del mes (alquiler, servicios, etc.), a cuántos les marcaste que ya los pagaste.',
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
      id: 'fin_financecalendar_pct', seccion: 'finanzas', label: '% días con control financiero', unidad: 'pct', dir: 'up',
      fundamental: false, minGran: 'M', agg: 'pct',
      descripcion: 'De los días del período, en cuántos marcaste el calendario de control financiero.',
      calc: (desde, hasta) => _calendarioPct(S.financeCalendar, desde, hasta, ['done']),
      _primer: () => _primerObjDias(S.financeCalendar && S.financeCalendar.days),
    },
    {
      id: 'fin_habitos_pct', seccion: 'finanzas', label: '% cumplimiento de hábitos de Finanzas', unidad: 'pct', dir: 'up',
      fundamental: false, minGran: 'M', agg: 'pct',
      descripcion: 'De los hábitos que tenés cargados en Finanzas, qué porcentaje cumpliste en el período.',
      calc: (desde, hasta) => _habitPct('finanzas', desde, hasta),
      _primer: () => _primerHabitos('finanzas'),
    },
  );

  // ═══════════ CONOCIMIENTO (5) ═══════════
  CATALOGO.push(
    {
      id: 'con_studycalendar_pct', seccion: 'conocimiento', label: '% de días estudiando', unidad: 'pct', dir: 'up',
      fundamental: true, minGran: 'M', agg: 'pct',
      descripcion: 'De los días del período, en cuántos marcaste el calendario de estudio.',
      calc: (desde, hasta) => _calendarioPct(S.studyCalendar, desde, hasta, ['done', 'studied']),
      _primer: () => _primerObjDias(S.studyCalendar && S.studyCalendar.days),
    },
    {
      id: 'con_pomodoro_minutos', seccion: 'conocimiento', label: 'Minutos de foco', unidad: 'min', dir: 'up',
      fundamental: true, minGran: 'M', agg: 'sum',
      descripcion: 'Los minutos acumulados en sesiones de Pomodoro de toda la app en el período (no separa por tema).',
      // pomodoroHistory no distingue "estudio" de otros usos (sin campo de
      // categoría) — es el ÚNICO pomodoro del informe (se sacó el de Vida
      // por duplicado; ver ADDENDUM v2).
      calc: (desde, hasta) => _sumRango(S.pomodoroHistory, 'date', desde, hasta, x => x.minutes),
      _primer: () => _primerArr(S.pomodoroHistory, 'date'),
    },
    {
      id: 'con_habitos_pct', seccion: 'conocimiento', label: '% cumplimiento de hábitos de Conocimiento', unidad: 'pct', dir: 'up',
      fundamental: false, minGran: 'M', agg: 'pct',
      descripcion: 'De los hábitos que tenés cargados en Conocimiento, qué porcentaje cumpliste en el período.',
      calc: (desde, hasta) => _habitPct('conocimiento', desde, hasta),
      _primer: () => _primerHabitos('conocimiento'),
    },
    {
      // NUEVA. Fuente: S.lawProgress.years[].subjects[].grade (nota 1-10,
      // verificado con grep en abogacia.js). Sin fecha propia → soloSnapshot:
      // el valor de un período cerrado sale ÚNICAMENTE de su snapshot; si el
      // período cerró antes de que existiera esta métrica, no hay snapshot y
      // el valor es null para siempre (nunca se recalcula hacia atrás). El
      // período en curso sí muestra el promedio vivo de hoy.
      id: 'con_promedio_carrera', seccion: 'conocimiento', label: 'Promedio de la carrera', unidad: 'nota', dir: 'up',
      fundamental: false, minGran: 'T', soloSnapshot: true, agg: 'avg',
      descripcion: 'El promedio de las notas de los finales que cargaste en la carrera. La serie arranca en el primer cierre de período: lo anterior no tiene dato, no es un error.',
      calc: () => {
        if (!S.lawProgress || !Array.isArray(S.lawProgress.years)) return null;
        const notas = [];
        S.lawProgress.years.forEach(y => _arr(y.subjects).forEach(sub => {
          const g = +sub.grade;
          if (sub.grade != null && isFinite(g)) notas.push(g);
        }));
        if (!notas.length) return null;
        return notas.reduce((a, b) => a + b, 0) / notas.length;
      },
      _primer: () => null,
    },
    {
      // REHECHA. Fuente: S.lawProgress.years[].subjects[].done (sin fecha) →
      // mismo mecanismo soloSnapshot que con_promedio_carrera. Antes esta
      // métrica tenía calc:()=>... sin soloSnapshot: sus deltas comparaban el
      // acumulado actual contra sí mismo período a período — el bug raíz de
      // este addendum.
      id: 'con_materias_aprobadas', seccion: 'conocimiento', label: 'Materias aprobadas', unidad: 'count', dir: 'up',
      fundamental: false, minGran: 'T', soloSnapshot: true, agg: 'last',
      descripcion: 'Cuántas materias tenés marcadas como aprobadas en la carrera. La serie arranca en el primer cierre de período: lo anterior no tiene dato, no es un error.',
      calc: () => {
        if (!S.lawProgress || !Array.isArray(S.lawProgress.years)) return null;
        return S.lawProgress.years.reduce((s, y) => s + _arr(y.subjects).filter(sub => sub.done).length, 0);
      },
      _primer: () => null,
    },
  );

  // ═══════════ SALUD (8) ═══════════
  CATALOGO.push(
    {
      id: 'salud_entrenamientos_sesiones', seccion: 'salud', label: 'Sesiones de entrenamiento', unidad: 'count', dir: 'up',
      fundamental: true, minGran: 'M', agg: 'count',
      descripcion: 'Cuántos entrenamientos registraste con las rutinas en el período.',
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
      id: 'salud_dieta_pct', seccion: 'salud', label: '% de días en cumplimiento de dieta', unidad: 'pct', dir: 'up',
      fundamental: true, minGran: 'M', agg: 'pct',
      descripcion: 'De los días del período, en cuántos cumpliste el umbral de reglas de dieta que te fijaste.',
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
      id: 'salud_sueno_horas_prom', seccion: 'salud', label: 'Horas de sueño promedio', unidad: 'h', dir: 'up',
      fundamental: true, minGran: 'M', agg: 'avg',
      descripcion: 'El promedio de horas de sueño que registraste en las noches del período.',
      calc: (desde, hasta) => _promedioCampoDia(S.sleepLog, 'hours', desde, hasta),
      _primer: () => _primerObjDias(S.sleepLog),
    },
    {
      id: 'salud_prs', seccion: 'salud', label: 'Récords personales', unidad: 'count', dir: 'up',
      fundamental: false, minGran: 'M', agg: 'count',
      descripcion: 'Cuántos récords personales (más peso que nunca en un ejercicio) marcaste en el período.',
      // Cuenta solo los PRs cuya FECHA cae en [desde,hasta] (no "hubo alguna
      // entrada en el historial", que con cualquier historial no vacío daba
      // siempre true sin importar el rango pedido — ver HIGH 1 del review).
      // fuera de highlights a pedido del usuario (ver ADDENDUM v2).
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
      id: 'salud_entrenamientos_volumen', seccion: 'salud', label: 'Volumen total levantado', unidad: 'kg-vol', dir: 'up',
      fundamental: false, minGran: 'M', agg: 'sum',
      descripcion: 'El peso total movido (kg × repeticiones) en todos tus entrenamientos del período.',
      // fuera de highlights a pedido del usuario (ver ADDENDUM v2: "en los
      // highlights aparece volumen de peso" era justamente el reclamo).
      calc: (desde, hasta) => _sumRango(_routineLogFlat(), 'date', desde, hasta, e => e.vol),
      _primer: () => _primerArr(_routineLogFlat(), 'date'),
    },
    {
      id: 'salud_entrenamientos_duracion', seccion: 'salud', label: 'Minutos entrenados', unidad: 'min', dir: 'up',
      fundamental: false, minGran: 'M', agg: 'sum',
      descripcion: 'Los minutos totales que pasaste entrenando en el período, según la duración de cada sesión.',
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
      id: 'salud_workoutcalendar_pct', seccion: 'salud', label: '% de días de entrenamiento', unidad: 'pct', dir: 'up',
      fundamental: false, minGran: 'M', agg: 'pct',
      descripcion: 'De los días del período, en cuántos marcaste el calendario de entrenamiento.',
      calc: (desde, hasta) => _calendarioPct(S.workoutCalendar, desde, hasta, ['done']),
      _primer: () => _primerObjDias(S.workoutCalendar && S.workoutCalendar.days),
    },
    {
      id: 'salud_habitos_pct', seccion: 'salud', label: '% cumplimiento de hábitos de Salud', unidad: 'pct', dir: 'up',
      fundamental: false, minGran: 'M', agg: 'pct',
      descripcion: 'De los hábitos que tenés cargados en Salud, qué porcentaje cumpliste en el período.',
      calc: (desde, hasta) => _habitPct('salud', desde, hasta),
      _primer: () => _primerHabitos('salud'),
    },
  );

  // ═══════════ IA (1) ═══════════
  CATALOGO.push(
    {
      id: 'ia_habitos_pct', seccion: 'ia', label: '% cumplimiento de hábitos de IA', unidad: 'pct', dir: 'up',
      fundamental: false, minGran: 'M', agg: 'pct',
      descripcion: 'De los hábitos que tenés cargados en IA, qué porcentaje cumpliste en el período.',
      calc: (desde, hasta) => _habitPct('ia', desde, hasta),
      _primer: () => _primerHabitos('ia'),
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

    // soloSnapshot (con_promedio_carrera / con_materias_aprobadas): sin
    // fecha propia del dato, así que un período CERRADO sin snapshot nunca
    // se calcula "hacia atrás" con el estado actual — sería el mismo bug de
    // fondo de este addendum (atribuirle a un período viejo un total que en
    // realidad es de hoy). Solo el período EN CURSO cae al calc() de abajo,
    // que siempre devuelve el valor vivo.
    if (metric.soloSnapshot && !enCurso(clave)) {
      _cache.set(key, null);
      return null;
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

    // Las soloSnapshot (con_promedio_carrera/con_materias_aprobadas) NUNCA
    // pro-ratean con metric.calc() crudo: ese calc() ignora desde/hasta a
    // propósito (es su "mecanismo propio", ver cabecera del catálogo) y
    // devuelve el valor VIVO de hoy sin importar qué rango se le pida —
    // pro-ratearlo contra un período de referencia CERRADO le atribuiría el
    // total de hoy a un período viejo, el mismo bug raíz de este addendum.
    // Para ellas, la referencia siempre sale de valor() (snapshot o null).
    const puedeProRatearCalc = !metric.soloSnapshot;

    if (tipo === 'prom') {
      const { gran } = parseClave(claveFoco);
      refLabel = 'Promedio histórico';
      if (focoEnCurso && puedeProRatearCalc) {
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
      if (focoEnCurso && puedeProRatearCalc) {
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

  // true si la métrica tiene sentido en la granularidad del foco. Hoy la
  // única restricción es minGran:'T' (estacional: comparar mes a mes miente).
  function _aplicaEnGranularidad(metric, granFoco) {
    return !(metric.minGran === 'T' && granFoco === 'M');
  }

  function matriz(metricaId, claveFoco) {
    const metric = _metricaMap[metricaId];
    if (!metric) return null;
    const granFoco = parseClave(claveFoco).gran;
    // minGran:'T' con foco mensual → la métrica no se muestra (ni fila Mes
    // ni nada): la UI recibe null y sabe que no corresponde pedirla acá.
    if (!_aplicaEnGranularidad(metric, granFoco)) return null;

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

    // Serie desagregada: para minGran:'T' nunca baja a meses (estacional),
    // aunque el foco sea semestral o anual.
    const subG = subGranularidades(granFoco).filter(g => !(metric.minGran === 'T' && g === 'M'));
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
      case 'nota': return _numAR(valorX, 1);
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
  // La racha general de Vida (S.streak) se sacó a pedido del usuario
  // (ADDENDUM v2, punto 3) — el resumen ejecutivo solo conserva las rachas
  // de estudio, gimnasio, dieta y hábitos.
  function _rachasSeccion(seccion) {
    const out = [];
    const rc = _rachaCalendarioSeccion(seccion);
    if (rc) out.push({ label: rc.label, actual: rc.actual, record: rc.record, unidad: 'dias' });
    if (seccion === 'salud') {
      const rd = _rachaDietaSeccion();
      if (rd) out.push({ label: rd.label, actual: rd.actual, record: rd.record, unidad: 'dias' });
    }
    return out;
  }

  function narrativaSeccion(seccion, claveFoco) {
    const granFoco = parseClave(claveFoco).gran;
    // Todas las métricas del capítulo que aplican a esta granularidad (una
    // minGran:'T' no entra acá con foco mensual). Las reglas de récord,
    // cruce de promedio e interanual pueden mirar cualquiera de estas; la
    // regla de "mayor suba/baja" se restringe a `fundamental` (ADDENDUM v2,
    // punto 2 — antes miraba `destacada` y por eso aparecía "volumen total
    // levantado" en la narrativa).
    const todas = _metricasDeSeccion(seccion).filter(m => _aplicaEnGranularidad(m, granFoco));
    const metricas = todas.filter(m => m.fundamental);
    const frases = [];

    // 1) mayor suba / mayor baja intra-ventana entre fundamentales
    let mejorSubida = null, mayorBaja = null;
    metricas.forEach(m => {
      const v = valor(m.id, claveFoco);
      if (v === null) return;
      const d = _delta(m.id, m, claveFoco, v, 'intra');
      if (d.pct === null || (d.estado !== 'mejor' && d.estado !== 'peor')) return;
      if (d.abs > 0 && (!mejorSubida || d.pct > mejorSubida.d.pct)) mejorSubida = { m, d };
      if (d.abs < 0 && (!mayorBaja || d.pct < mayorBaja.d.pct)) mayorBaja = { m, d };
    });
    // Sin jerga interna: la frase nombra la referencia concreta ("vs Agosto 2026"),
    // no "intra-ventana" ni "métricas fundamentales", que no le dicen nada a quien lee.
    const _ref = d => (d && d.refLabel) ? `vs ${d.refLabel}` : 'vs el período anterior';
    if (mejorSubida) frases.push({ texto: `${mejorSubida.m.label} ${mejorSubida.d.texto} ${_ref(mejorSubida.d)}, la mayor suba del período.`, tono: mejorSubida.d.estado === 'mejor' ? 'ok' : 'warn' });
    if (mayorBaja) frases.push({ texto: `${mayorBaja.m.label} ${mayorBaja.d.texto} ${_ref(mayorBaja.d)}, la mayor baja del período.`, tono: mayorBaja.d.estado === 'mejor' ? 'ok' : 'warn' });

    // 2) récord histórico (máx/mín de toda la serie de esa granularidad),
    // mirando TODAS las métricas del capítulo (no solo fundamentales).
    // Un período en curso no puede reclamar récord (compite con desventaja
    // frente a períodos cerrados completos) ni puede ensuciar el pool de
    // comparación de otro período (ver HIGH 2 del review 2026-09-04).
    const periodos = _periodosCerrados(granFoco);
    if (periodos.length >= 2 && !enCurso(claveFoco)) {
      todas.forEach(m => {
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

    // 3) cruce de promedio en cualquier dirección (todas las del capítulo)
    todas.forEach(m => {
      const vFoco = valor(m.id, claveFoco);
      if (vFoco === null) return;
      const d = _delta(m.id, m, claveFoco, vFoco, 'prom');
      if (d.estado === 'mejor') frases.push({ texto: `${m.label} está por encima de su promedio histórico (${d.texto}).`, tono: 'ok' });
      else if (d.estado === 'peor') frases.push({ texto: `${m.label} está por debajo de su promedio histórico (${d.texto}).`, tono: 'warn' });
    });

    // 4) comparación interanual cuando existe (todas las del capítulo)
    todas.forEach(m => {
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
    const granFoco = parseClave(claveFoco).gran;
    // Highlights/alertas SOLO de `fundamental` (ADDENDUM v2, punto 1 — antes
    // miraba `destacada` y por eso "volumen total levantado" aparecía como
    // highlight, el reclamo puntual del usuario).
    const fundamentales = CATALOGO.filter(m => m.fundamental && _aplicaEnGranularidad(m, granFoco));
    const items = [];
    fundamentales.forEach(m => {
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

    // Métricas que no aplican a esta granularidad (minGran:'T' con foco
    // mensual) se excluyen del conteo: no es que "no tengan dato", es que ni
    // corresponde pedirlas acá.
    let sobrePromedio = 0, bajoPromedio = 0, sinDatos = 0;
    CATALOGO.filter(m => _aplicaEnGranularidad(m, granFoco)).forEach(m => {
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
            CATALOGO.filter(m => m.seccion === sec && !m.fundamental).forEach(m => { delete metricasSec[m.id]; delete labelsSec[m.id]; });
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
