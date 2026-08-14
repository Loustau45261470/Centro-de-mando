'use strict';
// ════════════════════════════════════════════════════════════════════════
// DEADLINES — recolector único de TODO lo que tiene fecha/hora en el estado.
//
// Devuelve una lista normalizada de vencimientos (recordatorios, proyectos,
// finales, cursada, metas del día, actividades del planner, proyecciones,
// suscripciones y pedidos) con sus avisos ya calculados.
//
// Lo consumen DOS lados y por eso el archivo es puro (sin DOM, sin S global):
//   · navegador  → recordatorios.js (lo que se ve + notificación local)
//   · Node/cron  → push-reminders.js (Web Push con la app cerrada)
//
// El navegador parsea en hora local; el cron pasa tz:'-03:00' (Argentina).
// ════════════════════════════════════════════════════════════════════════

const CMDeadlines = (() => {
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const TABS = ['vida', 'finanzas', 'salud', 'conocimiento', 'ia'];
  const ALLDAY_HOUR = '09:00';   // hora a la que avisa lo que solo tiene fecha
  const ACT_WINDOW  = 2;         // días hacia adelante que se expanden metas y actividades

  const PRIO_EMOJI = { critical: '⚡', high: '🔴', medium: '🟡', low: '🟢', someday: '🔵' };

  // ── fechas ──────────────────────────────────────────────────────────────
  const pad = n => String(n).padStart(2, '0');
  const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const isTime = s => /^\d{2}:\d{2}/.test(s || '');

  // 'YYYY-MM-DD' + 'HH:mm' → ms. Sin tz = hora local del dispositivo.
  function toMs(date, time, tz) {
    if (!isDate(date)) return NaN;
    const t = isTime(time) ? time.slice(0, 5) : '00:00';
    return new Date(`${date}T${t}:00${tz || ''}`).getTime();
  }
  function dateStrFromMs(ms, tz) {
    // Con tz fijo el cron necesita el "día" de Argentina, no el del runner (UTC).
    const off = tz ? (parseInt(tz.slice(0, 3), 10) * HOUR + (tz[0] === '-' ? -1 : 1) * parseInt(tz.slice(4, 6), 10) * MIN) : 0;
    const d = tz ? new Date(ms + off) : new Date(ms);
    return tz
      ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
      : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function addDays(date, n) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // ── avisos ──────────────────────────────────────────────────────────────
  // Ítem con hora: 10 min antes (+ al momento, salvo las actividades del planner).
  // Ítem de día completo: 09:00 del día anterior + 09:00 del día (finales suman 7 días antes).
  function buildAlerts(it, opts) {
    const tz = opts.tz, out = [];
    const push = (suffix, at, title) => { if (!isNaN(at)) out.push({ key: it.id + suffix, at, title, body: it.notifBody }); };

    if (it.allDay) {
      // Se muestran al cierre del día pero avisan a las 09:00 (nadie quiere el aviso 23:59).
      const lead = it.leadDays != null ? it.leadDays : 1;
      if (it.kind === 'final') push('_7d', toMs(addDays(it.date, -7), ALLDAY_HOUR, tz), `🎓 Final en una semana: ${it.title}`);
      if (lead > 0) push('_1d', toMs(addDays(it.date, -lead), ALLDAY_HOUR, tz),
                         `${it.icon} ${lead === 1 ? 'Mañana' : 'En ' + lead + ' días'}: ${it.title}`);
      push('_due', toMs(it.date, ALLDAY_HOUR, tz), `${it.icon} Hoy: ${it.title}`);
    } else if (it.kind === 'rec') {
      // Recordatorios clásicos: se respetan las claves y los tiempos originales
      // (24 h antes + al momento) para no re-disparar lo ya notificado.
      out.push({ key: it.id + '_1d', at: it.at - DAY, title: '📅 Vence mañana — Centro de Mando', body: it.notifBody });
      out.push({ key: it.id,        at: it.at,       title: '🔔 Recordatorio — Centro de Mando', body: it.notifBody });
    } else {
      push('_10m', it.at - 10 * MIN, `${it.icon} En 10 min: ${it.title}`);
      // Las actividades del planner avisan SOLO 10 min antes: son muchas por día y
      // el segundo aviso al arrancar no agrega nada. El resto sí avisa a la hora.
      if (it.kind !== 'actividad') push('_due', it.at, `${it.icon} Ahora: ${it.title}`);
    }
    return out;
  }

  function make(it, opts) {
    // `at` = momento que se muestra y por el que se ordena (día completo → 23:59).
    // Los avisos se calculan aparte a partir de la fecha (ver buildAlerts).
    it.time = it.allDay ? '23:59' : it.time;
    it.at = toMs(it.date, it.time, opts.tz);
    if (isNaN(it.at)) return null;
    it.datetime = `${it.date}T${isTime(it.time) ? it.time.slice(0, 5) : '00:00'}`;
    const cuando = it.allDay ? `${it.date.slice(8, 10)}/${it.date.slice(5, 7)}` : it.time;
    it.notifBody = it.kind === 'rec'
      ? `${PRIO_EMOJI[it.priority] || '🔵'} ${it.title}`
      : `${PRIO_EMOJI[it.priority] || '🔵'} ${it.kindLabel}${it.sub ? ' · ' + it.sub : ''} · ${cuando}`;
    it.alerts = buildAlerts(it, opts);
    return it;
  }

  // ── recurrencia del planner ─────────────────────────────────────────────
  // Espejo puro de plannerRecOccursOn() de app.js (allá vive la versión que usa
  // la UI; acá no se puede depender del DOM porque esto también corre en Node).
  function recOccursOn(r, date) {
    if (!r || !r.repeat || !r.startDate || date < r.startDate) return false;
    const d = new Date(date + 'T00:00:00'), s = new Date(r.startDate + 'T00:00:00');
    switch (r.repeat.freq) {
      case 'daily':    return true;
      case 'weekly':   return d.getDay() === s.getDay();
      case 'weekdays': return (r.repeat.byDays || []).includes(d.getDay());
      case 'monthly':  return d.getDate() === s.getDate();
      case 'yearly':   return d.getDate() === s.getDate() && d.getMonth() === s.getMonth();
      default:         return false;
    }
  }

  // ── recolección ─────────────────────────────────────────────────────────
  function collect(state, opts) {
    opts = opts || {};
    const S = state || {};
    const now = opts.now || Date.now();
    const today = dateStrFromMs(now, opts.tz);
    const from  = now - (opts.pastDays != null ? opts.pastDays : 30) * DAY;   // no arrastrar vencidos eternos
    const items = [];
    const add = it => { const m = make(it, opts); if (m && m.at >= from) items.push(m); };

    // 1) Recordatorios propios (única fuente editable desde la card)
    TABS.forEach(tab => {
      (S.reminders && S.reminders[tab] || []).forEach(r => {
        if (!r || !r.datetime) return;
        const [date, time] = String(r.datetime).split('T');
        add({ id: r.id, kind: 'rec', kindLabel: 'Recordatorio', icon: '🔔', tab,
              title: r.title || '(sin título)', date, time, allDay: false,
              priority: r.priority || 'medium', editable: true, raw: r });
      });
    });

    // 2) Proyectos y tareas con fecha límite (árbol de cada sección)
    TABS.forEach(tab => {
      const walk = nodes => (nodes || []).forEach(n => {
        if (n && isDate(n.dueDate) && !n.done) {
          add({ id: 'proy_' + n.id, kind: 'proy', kindLabel: 'Proyecto', icon: n.icon || '📁', tab,
                title: n.label || '(sin título)', date: n.dueDate, allDay: true,
                priority: n.priority === '1' ? 'high' : n.priority === '3' ? 'low' : 'medium',
                nodeId: n.id, doneAction: `Proyectos.setDone('${tab}','${n.id}',true)`,
                openAction: `Proyectos.openDetail('${tab}','${n.id}')` });
        }
        if (n && n.children) walk(n.children);
      });
      walk((S.proyectos || {})[tab]);
    });

    // 3) Finales
    ((S.sgc || {}).finales || []).forEach(f => {
      if (!f || f.done || !isDate(f.fecha)) return;
      const dias = Math.round((toMs(f.fecha, ALLDAY_HOUR, opts.tz) - now) / DAY);
      add({ id: 'final_' + f.id, kind: 'final', kindLabel: 'Final', icon: '🎓', tab: 'conocimiento',
            title: f.materia || 'Final', sub: f.tipo || '', date: f.fecha, allDay: true,
            priority: dias <= 3 ? 'critical' : 'high',
            doneAction: `Finales.done('${f.id}')`, openAction: 'Finales.open()' });
    });

    // 4) Cursada (clases, TPs, foros)
    (S.cursada || []).forEach(c => {
      if (!c || c.done || !isDate(c.fecha)) return;
      const lbl = c.tipo === 'tp' ? 'TP' : c.tipo === 'foro' ? 'Foro' : 'Clase';
      const ico = c.tipo === 'tp' ? '📝' : c.tipo === 'foro' ? '💬' : '📘';
      add({ id: 'curs_' + c.id, kind: 'cursada', kindLabel: lbl, icon: ico, tab: 'conocimiento',
            title: c.materia || lbl, sub: c.titulo || '', date: c.fecha, time: c.hora || '',
            allDay: !isTime(c.hora), priority: c.tipo === 'tp' ? 'high' : 'medium',
            doneAction: `Cursada.done('${c.id}')`, openAction: 'Cursada.open()' });
    });

    // 5) Metas del día con hora + 6) actividades del planner (ventana corta:
    //    son recurrentes y llenarían la lista si se expandieran a 60 días)
    for (let i = -1; i <= ACT_WINDOW; i++) {
      const date = addDays(today, i);

      (S.goals && S.goals[date] || []).forEach(g => {
        if (!g || g.done || !isTime(g.time)) return;
        add({ id: 'meta_' + g.id + '_' + date, kind: 'meta', kindLabel: 'Meta', icon: '🎯', tab: 'vida',
              title: g.text || 'Meta', date, time: g.time, allDay: false,
              priority: g.priority === 'high' ? 'high' : g.priority === 'mid' ? 'medium' : 'low',
              doneAction: `toggleGoalById('${date}','${g.id}')` });
      });

      const plannerTasks = ((S.dayPlan || {})[date] || {}).tasks || [];
      const recTasks = (S.planRecurring || []).filter(r => recOccursOn(r, date)).map(r => {
        const ex = (r.exceptions || {})[date] || {};
        if (ex.deleted) return null;
        return { id: r.id + '@' + date, text: ex.text != null ? ex.text : r.text,
                 time: ex.time != null ? ex.time : r.time, area: ex.area != null ? ex.area : r.area,
                 priority: ex.priority != null ? ex.priority : r.priority, done: !!ex.done };
      }).filter(Boolean);

      plannerTasks.concat(recTasks).forEach(t => {
        if (!t || t.done || !isTime(t.time)) return;
        add({ id: 'act_' + t.id, kind: 'actividad', kindLabel: 'Actividad', icon: '📅',
              tab: TABS.includes(t.area) ? t.area : 'vida',
              title: t.text || 'Actividad', date, time: t.time, allDay: false,
              priority: t.priority >= 3 ? 'high' : t.priority <= 1 ? 'low' : 'medium',
              openAction: 'if(typeof plannerOverlayOpen===\'function\')plannerOverlayOpen()' });
      });
    }

    // 7) Proyecciones de mercado que vencen (hay que cargarles el precio real)
    ((S.sgc || {}).proyecciones || []).forEach(p => {
      if (!p || p.precioReal != null || !isDate(p.fechaVence)) return;
      add({ id: 'proye_' + p.id, kind: 'proyeccion', kindLabel: 'Proyección', icon: '📈', tab: 'finanzas',
            title: `${p.simbolo} — cargar precio real`, date: p.fechaVence, allDay: true,
            priority: 'medium', leadDays: 0 });
    });

    // 8) Suscripciones (día de cobro del mes) y 9) pedidos en camino
    (S.subscriptions || []).forEach(s => {
      const day = parseInt(s && s.billingDay, 10);
      if (!day || day < 1 || day > 31) return;
      let date = today.slice(0, 8) + pad(day);
      if (date < today) date = addDays(today.slice(0, 8) + '01', 32).slice(0, 8) + pad(day);
      add({ id: 'sub_' + (s.id || s.name) + '_' + date, kind: 'suscripcion', kindLabel: 'Suscripción', icon: '💳',
            tab: 'finanzas', title: `${s.name} se cobra`, sub: s.amount ? `$${s.amount}` : '',
            date, allDay: true, priority: 'high', leadDays: 2 });
    });
    (S.orders || []).forEach(o => {
      if (!o || !isDate(o.arrival)) return;
      add({ id: 'ord_' + o.id, kind: 'pedido', kindLabel: 'Pedido', icon: '📦', tab: 'finanzas',
            title: `${o.name} llega`, date: o.arrival, allDay: true, priority: 'low', leadDays: 0 });
    });

    return items.sort((a, b) => a.at - b.at);
  }

  // Avisos que deben dispararse ahora: cayeron dentro de la ventana y no se notificaron.
  function dueAlerts(state, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const windowMs = opts.windowMs || 5 * MIN;
    const seen = opts.seen || {};
    const has = k => (typeof seen.has === 'function' ? seen.has(k) : !!seen[k]);
    const out = [];
    collect(state, opts).forEach(it => (it.alerts || []).forEach(a => {
      if (a.at <= now && now - a.at < windowMs && !has(a.key)) out.push({ ...a, item: it });
    }));
    return out;
  }

  return { collect, dueAlerts, recOccursOn, TABS, PRIO_EMOJI, ALLDAY_HOUR };
})();

if (typeof window !== 'undefined') window.CMDeadlines = CMDeadlines;
if (typeof module !== 'undefined' && module.exports) module.exports = CMDeadlines;
