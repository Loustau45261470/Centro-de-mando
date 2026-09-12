'use strict';
/* ══════════════════════════════════════════════════════
   BÚSQUEDA GLOBAL — índice en memoria sobre S para Ctrl+K.
   Expone window.CMBuscar = { buscar(texto, limite), reindexar() }.
   Lo consume command-palette.js; no dibuja nada por sí mismo.
   ══════════════════════════════════════════════════════ */
(function () {
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const nav  = tab => { const b = document.querySelector('.nav-btn[data-tab="' + tab + '"]'); if (b) b.click(); };
  const has  = f => typeof window[f] === 'function';
  const call = (f, ...args) => { if (has(f)) window[f](...args); };

  const MAX_POR_TIPO = 8;
  const MAX_TOTAL = 30;

  // Categoría mostrada como separador en la paleta de comandos.
  const SEC = {
    MOVIMIENTOS: 'MOVIMIENTOS',
    METAS: 'METAS',
    RECORDATORIOS: 'RECORDATORIOS',
    NOTAS: 'NOTAS',
    PROYECTOS: 'PROYECTOS',
    ENTRENAMIENTO: 'ENTRENAMIENTO',
    MATERIAS: 'MATERIAS',
    PERSONAS: 'PERSONAS',
  };

  // Categoría de S.quarterlyObjectives → tab de navegación (objetivos.js:4-9, QOBJ_TAB_CATS).
  const QOBJ_TAB = { Vida: 'vida', Economía: 'finanzas', Facultad: 'conocimiento', Conocimiento: 'conocimiento', Entrenamiento: 'salud', IA: 'ia' };

  let _index = [];
  let _sig = null;

  // Épocha ms para ordenar por fecha desc. Sin fecha → -Infinity (va al final).
  function _ts(dateLike) {
    if (dateLike == null || dateLike === '') return -Infinity;
    if (typeof dateLike === 'number') return dateLike;
    const t = new Date(dateLike).getTime();
    return Number.isFinite(t) ? t : -Infinity;
  }

  function _sumValues(obj) {           // { key: array }
    if (!obj) return 0;
    return Object.values(obj).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0);
  }
  function _sumNested(obj) {           // { key: { key2: array } }
    if (!obj) return 0;
    return Object.values(obj).reduce((s, v) => s + _sumValues(v), 0);
  }
  function _proyCount() {
    if (!window.Proyectos || typeof window.Proyectos.get !== 'function') return 0;
    const walk = nodes => (nodes || []).reduce((s, n) => s + 1 + walk(n.children), 0);
    return ['vida', 'finanzas', 'salud', 'conocimiento', 'ia'].reduce((s, t) => s + walk(window.Proyectos.get(t)), 0);
  }

  // Firma barata para saber si hace falta reconstruir el índice: cuenta ítems,
  // NUNCA serializa S entero (puede tener miles de transacciones — ver ticket).
  function _signature() {
    if (typeof S === 'undefined' || !S) return 'no-state';
    const n = arr => (Array.isArray(arr) ? arr.length : 0);
    return [
      n(S.transactions), n(S.subscriptions), n(S.fixedExpenses), n(S.orders), n(S.wishlist), n(S.accounts),
      n(S.purchaseFunds),
      _sumValues(S.goals), _sumNested(S.monthlyGoals),
      ((S.quarterlyObjectives && S.quarterlyObjectives.periods) || []).reduce((s, p) => s + n(p.objectives), 0),
      _sumValues(S.reminders), _sumValues(S.ideas),
      n(S.mapaIdeas && S.mapaIdeas.notes),
      _proyCount(),
      n(S.exercises), n(S.routines),
      ((S.lawProgress && S.lawProgress.years) || []).reduce((s, y) => s + n(y.subjects), 0), n(S.lawPlan),
      n(S.fichero),
    ].join('|');
  }

  function _walkProy(nodes, tab, out) {
    (nodes || []).forEach(node => {
      out.push({
        tipo: 'proyecto', seccion: SEC.PROYECTOS,
        titulo: node.label || '(sin título)',
        subtitulo: node.dueDate ? ('Vence ' + node.dueDate) : (node.description ? node.description.slice(0, 60) : ''),
        _ts: node.dueDate ? _ts(node.dueDate) : -Infinity,
        _hay: norm((node.label || '') + ' ' + (node.description || '') + ' ' + (node.notes || '')),
        ir: () => { nav(tab); if (window.Proyectos) window.Proyectos.openDetail(tab, node.id); },
      });
      if (node.children && node.children.length) _walkProy(node.children, tab, out);
    });
  }

  function _build() {
    const out = [];
    if (typeof S === 'undefined' || !S) { _index = out; return; }

    // Transacciones — app.js:33 transactions: [{ id, date, amount, type, currency, accountId, name }]
    (S.transactions || []).forEach(t => out.push({
      tipo: 'transaccion', seccion: SEC.MOVIMIENTOS, titulo: t.name || '(sin nombre)',
      subtitulo: (has('fmtMoney') ? fmtMoney(t.amount, t.currency) : (t.amount + ' ' + (t.currency || ''))) + (t.date ? ' · ' + t.date : ''),
      _ts: _ts(t.date), _hay: norm(t.name),
      ir: () => { nav('finanzas'); call('openEditTxn', t.id); },
    }));

    // Suscripciones — app.js:34 subscriptions: [{ id, name, amount, currency, billingDay, accountId }]
    (S.subscriptions || []).forEach(s => out.push({
      tipo: 'suscripcion', seccion: SEC.MOVIMIENTOS, titulo: s.name || '(sin nombre)',
      subtitulo: 'Suscripción · día ' + s.billingDay,
      _ts: -Infinity, _hay: norm(s.name),
      ir: () => { nav('finanzas'); call('openEditSub', s.id); },
    }));

    // Gastos fijos — app.js:37 fixedExpenses: [{ id, name, amount, currency, dayOfMonth }]
    (S.fixedExpenses || []).forEach(e => out.push({
      tipo: 'gastoFijo', seccion: SEC.MOVIMIENTOS, titulo: e.name || '(sin nombre)',
      subtitulo: 'Gasto fijo · día ' + e.dayOfMonth,
      _ts: -Infinity, _hay: norm(e.name),
      ir: () => { nav('finanzas'); call('openEditFixedExpense', e.id); },
    }));

    // Pedidos — app.js:33 orders: [{ id, name, amount, currency, arrival, accountId, deducted }]
    (S.orders || []).forEach(o => out.push({
      tipo: 'pedido', seccion: SEC.MOVIMIENTOS, titulo: o.name || '(sin nombre)',
      subtitulo: 'Pedido' + (o.arrival ? ' · llega ' + o.arrival : ''),
      _ts: _ts(o.arrival), _hay: norm(o.name),
      ir: () => nav('finanzas'), // sin modal propio (deadlines.js:229) — mejor esfuerzo
    }));

    // Lista de deseos — finanzas.js:291-298 wishlist: { id, name, amount, currency, category, priority, notes }
    (S.wishlist || []).forEach(w => out.push({
      tipo: 'deseo', seccion: SEC.MOVIMIENTOS, titulo: w.name || '(sin nombre)',
      subtitulo: 'Deseo' + (w.category ? ' · ' + w.category : ''),
      _ts: -Infinity, _hay: norm(w.name),
      ir: () => { nav('finanzas'); call('openEditWish', w.id); },
    }));

    // Cuentas — app.js:31 accounts: [{ id, name, type, balance, currency, icon }]
    (S.accounts || []).forEach(a => out.push({
      tipo: 'cuenta', seccion: SEC.MOVIMIENTOS, titulo: a.name || '(sin nombre)',
      subtitulo: 'Cuenta' + (a.type ? ' · ' + a.type : ''),
      _ts: -Infinity, _hay: norm(a.name),
      ir: () => { nav('finanzas'); call('openEditAccount', a.id); },
    }));

    // Fondos de compra — finanzas.js:371 purchaseFunds: [{ id, name, emoji, monthlyAmount, accountId, condition, createdMonth }]
    (S.purchaseFunds || []).forEach(f => out.push({
      tipo: 'fondoCompra', seccion: SEC.MOVIMIENTOS, titulo: f.name || '(sin nombre)',
      subtitulo: 'Fondo de compra',
      _ts: -Infinity, _hay: norm(f.name),
      ir: () => { nav('finanzas'); call('openFundModal', f.id); },
    }));

    // Metas del día — app.js:13 goals: { 'YYYY-MM-DD': [{ id, text, done, priority, time }] }
    Object.keys(S.goals || {}).forEach(date => {
      (S.goals[date] || []).forEach(g => out.push({
        tipo: 'metaDia', seccion: SEC.METAS, titulo: g.text || '(sin texto)',
        subtitulo: 'Meta del día · ' + date,
        _ts: _ts(date), _hay: norm(g.text),
        ir: () => nav('vida'), // la vista de metas solo muestra hoy/mañana — mejor esfuerzo
      }));
    });

    // Metas mensuales — objetivos.js:29 monthlyGoals: { sec: { 'YYYY-MM': [{ id, text, done }] } }
    Object.keys(S.monthlyGoals || {}).forEach(sec => {
      const byMonth = S.monthlyGoals[sec] || {};
      Object.keys(byMonth).forEach(ym => {
        (byMonth[ym] || []).forEach(g => out.push({
          tipo: 'metaMensual', seccion: SEC.METAS, titulo: g.text || '(sin texto)',
          subtitulo: 'Meta mensual · ' + ym,
          _ts: _ts(ym + '-01'), _hay: norm(g.text),
          ir: () => { nav(sec); call('selectMonthView', sec, ym); },
        }));
      });
    });

    // Objetivos trimestrales — app.js:220+ quarterlyObjectives.periods[].objectives[] { id, text, done, category }
    ((S.quarterlyObjectives && S.quarterlyObjectives.periods) || []).forEach(p => {
      (p.objectives || []).forEach(o => out.push({
        tipo: 'objetivoTrimestral', seccion: SEC.METAS, titulo: o.text || '(sin texto)',
        subtitulo: 'Objetivo · ' + (p.label || p.id),
        _ts: -Infinity, _hay: norm(o.text),
        ir: () => {
          const tab = QOBJ_TAB[o.category] || 'vida';
          nav(tab);
          if (S.quarterlyObjectives.activePeriod !== p.id) call('selectQPeriod', p.id);
          call('openEditQObj', p.id, o.id);
        },
      }));
    });

    // Recordatorios — deadlines.js:133, recordatorios.js:276 S.reminders[tab] = [{ id, title, datetime, priority }]
    Object.keys(S.reminders || {}).forEach(tab => {
      (S.reminders[tab] || []).forEach(r => out.push({
        tipo: 'recordatorio', seccion: SEC.RECORDATORIOS, titulo: r.title || '(sin título)',
        subtitulo: r.datetime || '',
        _ts: _ts(r.datetime), _hay: norm(r.title),
        ir: () => { nav(tab); call('openEditReminder', tab, r.id); },
      }));
    });

    // Ideas — workspace.js:54 S.ideas[tab] = [{ id, title, description, notes }] (legacy, se migra a proyectos)
    Object.keys(S.ideas || {}).forEach(tab => {
      (S.ideas[tab] || []).forEach(idea => out.push({
        tipo: 'idea', seccion: SEC.NOTAS, titulo: idea.title || '(sin título)',
        subtitulo: 'Idea',
        _ts: -Infinity, _hay: norm((idea.title || '') + ' ' + (idea.description || '')),
        ir: () => nav(tab),
      }));
    });

    // Notas del mapa de ideas — mapa-ideas.js:27-32 S.mapaIdeas.notes = [{ id, texto, tags, creado, editado }]
    ((S.mapaIdeas && S.mapaIdeas.notes) || []).forEach(nt => {
      const primera = (nt.texto || '').split('\n')[0].trim().slice(0, 70) || '(sin texto)';
      out.push({
        tipo: 'notaMapa', seccion: SEC.NOTAS, titulo: primera,
        subtitulo: 'Mapa de ideas',
        _ts: _ts(nt.editado || nt.creado), _hay: norm(nt.texto),
        ir: () => { call('openMapaIdeasOverlay'); call('miOpenNote', nt.id); },
      });
    });

    // Proyectos y tareas — workspace.js:41-46/544-561 árbol por tab, window.Proyectos.openDetail(tab,id)
    ['vida', 'finanzas', 'salud', 'conocimiento', 'ia'].forEach(tab => {
      const tree = (window.Proyectos && window.Proyectos.get) ? window.Proyectos.get(tab) : ((S.proyectos && S.proyectos[tab]) || []);
      _walkProy(tree, tab, out);
    });

    // Ejercicios — app.js:24 exercises: [{ id, gymId, name, repMin, repMax, increment, unit, sets }]
    (S.exercises || []).forEach(ex => out.push({
      tipo: 'ejercicio', seccion: SEC.ENTRENAMIENTO, titulo: ex.name || '(sin nombre)',
      subtitulo: 'Ejercicio',
      _ts: -Infinity, _hay: norm(ex.name),
      ir: () => { nav('salud'); call('openEditExercise', ex.id); },
    }));

    // Rutinas — rutinas.js:63-66 routines: [{ id, name, icon, exercises }]
    (S.routines || []).forEach(r => out.push({
      tipo: 'rutina', seccion: SEC.ENTRENAMIENTO, titulo: r.name || '(sin nombre)',
      subtitulo: 'Rutina · ' + ((r.exercises || []).length) + ' ejercicios',
      _ts: -Infinity, _hay: norm(r.name),
      ir: () => { nav('salud'); call('openEditRoutine', r.id); },
    }));

    // Materias — app.js:47-97 lawProgress.years[].subjects[] = { id, name, done }
    ((S.lawProgress && S.lawProgress.years) || []).forEach(y => {
      (y.subjects || []).forEach(sub => out.push({
        tipo: 'materia', seccion: SEC.MATERIAS, titulo: sub.name,
        subtitulo: y.label + (sub.done ? ' · aprobada' : ''),
        _ts: -Infinity, _hay: norm(sub.name),
        ir: () => nav('conocimiento'), // sin abrir individual: evita disparar el toggle de aprobada
      }));
    });

    // Plan de materias — app.js:118-136, abogacia.js:426 lawPlan: [{ id, subject, target }]
    (S.lawPlan || []).forEach(e => out.push({
      tipo: 'planMateria', seccion: SEC.MATERIAS, titulo: e.subject,
      subtitulo: e.target || '',
      _ts: -Infinity, _hay: norm(e.subject),
      ir: () => { nav('conocimiento'); call('openEditLawPlan', e.id); },
    }));

    // Personas del fichero — fichero-personas.js:29 S.fichero = [{ id, nombre, apellido, nacimiento, trabajo, familia, pareja, mascotas, intereses }]
    (S.fichero || []).forEach(p => {
      const nombre = `${p.nombre || ''} ${p.apellido || ''}`.trim() || '(sin nombre)';
      out.push({
        tipo: 'persona', seccion: SEC.PERSONAS, titulo: nombre,
        subtitulo: p.trabajo || '',
        _ts: -Infinity, _hay: norm(`${nombre} ${p.trabajo || ''} ${p.familia || ''} ${p.intereses || ''}`),
        ir: () => { call('ficheroOpen'); call('ficheroEdit', p.id); },
      });
    });

    _index = out;
  }

  function _cmp(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    const ta = a.e._ts, tb = b.e._ts;
    if (ta === -Infinity && tb === -Infinity) return 0; // evita NaN de -Infinity - -Infinity
    return tb - ta;
  }

  function buscar(texto, limite) {
    const nq = norm(texto || '').trim();
    if (!nq) return [];
    const sig = _signature();
    if (sig !== _sig) { _build(); _sig = sig; }

    const scored = [];
    for (const e of _index) {
      const pos = e._hay.indexOf(nq);
      if (pos < 0) continue;
      scored.push({ e, score: pos === 0 ? 2 : 1 });
    }
    scored.sort(_cmp);

    const tope = limite || MAX_TOTAL;
    const porTipo = Object.create(null);
    const out = [];
    for (const { e } of scored) {
      const c = porTipo[e.tipo] || 0;
      if (c >= MAX_POR_TIPO) continue;
      porTipo[e.tipo] = c + 1;
      out.push({
        tipo: e.tipo, titulo: e.titulo, subtitulo: e.subtitulo,
        fecha: Number.isFinite(e._ts) ? e._ts : undefined,
        seccion: e.seccion, ir: e.ir,
      });
      if (out.length >= tope) break;
    }
    return out;
  }

  function reindexar() { _build(); _sig = _signature(); }

  window.CMBuscar = { buscar, reindexar };
})();
