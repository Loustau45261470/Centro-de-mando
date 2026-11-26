'use strict';
// ════════════════════════════════════════════════════════════════════════
// DEADLINES — recolector único de TODO lo que tiene fecha/hora en el estado.
//
// Devuelve una lista normalizada de vencimientos (recordatorios, proyectos,
// finales, cursada, metas del día, actividades del planner, proyecciones,
// pedidos y vencimientos de tarjeta) con sus avisos ya calculados.
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

  // Tareas del día con franja (sin hora exacta): aviso a la hora de arranque de la franja.
  const FRANJAS = { m: ['08:00', 'Esta mañana'], t: ['13:00', 'Esta tarde'], n: ['19:00', 'Esta noche'] };

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
  // Ítem de día completo: un aviso a las 09:00 por cada día de `leads` (días de
  // anticipación) + otro a las 09:00 del día que vence.
  // Ítem con hora: 10 min antes (+ al momento, salvo las actividades del planner).
  const LEADS = {
    final:       [60, 30, 15, 7],   // pedido de Tobías: alerta temprana y escalonada
    tp:          [30, 15, 7],
    proy:        [7],
    cursada:     [1],               // clases y foros
    tarjeta:     [1],             // vencimiento de resumen: el día anterior + el mismo día
    proyeccion:  [],
    pedido:      [],
  };

  // Entidades cuyo id NO lleva la fecha: si se reprograma tras avisar, la clave vieja taparía el aviso nuevo.
  // Su clave de "ya avisado" incluye fecha y hora (id@YYYY-MM-DDTHH:MM + sufijo). Las demás (meta_, act_, tarj_, foco_, prin_)
  // ya llevan la fecha en el id. `legacyKey` = la clave sin fecha de antes: dueAlerts la sigue respetando para no
  // reavisar, al desplegar, lo que ya se avisó con la fecha sin cambios.
  const KEY_CON_FECHA = { rec: 1, proy: 1, final: 1, cursada: 1, proyeccion: 1, pedido: 1, registro: 1 };

  function buildAlerts(it, opts) {
    const tz = opts.tz, out = [];
    const conFecha = !!KEY_CON_FECHA[it.kind];
    const base = conFecha ? it.id + '@' + it.datetime : it.id;
    const mk = (suffix, at, title, lead) => {
      const a = { key: base + suffix, at, title, body: it.notifBody, lead: !!lead };
      if (conFecha) a.legacyKey = it.id + suffix;
      return a;
    };
    // `lead` = aviso de anticipación (tolera llegar tarde y pide interacción);
    // sin lead = aviso "es ahora", que tarde ya no sirve.
    const push = (suffix, at, title, lead) => { if (!isNaN(at)) out.push(mk(suffix, at, title, lead)); };

    if (it.kind === 'foco' || it.kind === 'principio') {
      // Chequeo de Foco y principio por horario: un solo aviso "es ahora" (tarde ya no sirve), con destino dentro de la app.
      // winMs propio (60 min): si el cron de Actions se atrasa más que la ventana corta, el chequeo no se pierde.
      out.push({ key: it.id, at: it.at, title: it.title, body: it.cuerpo, lead: false, url: it.url, winMs: FOCO_WIN_MS });
    } else if (it.kind === 'registro') {
      // Ocurrencia de un registro (registros.js): un solo aviso "es ahora", con la clave id@YYYY-MM-DDTHH:MM de ESA ocurrencia
      // y la url que abre su formulario. winMs propio (60 min), igual que el chequeo de Foco.
      out.push({ key: base, at: it.at, title: it.title, body: it.cuerpo, lead: false, url: it.url, winMs: FOCO_WIN_MS });
    } else if (it.kind === 'final' && !it.allDay) {
      // Final con hora: mismas alertas escalonadas por días que uno de día completo (a las 09:00) + el día del final
      // (09:00, salvo que el examen sea a primera hora) + 10 min antes. Claves con la hora → no pisan las de día completo.
      (it.leads || LEADS.final).forEach(d => {
        if (d > 0) push('_d' + d, toMs(addDays(it.date, -d), ALLDAY_HOUR, tz),
                        `${it.icon} ${d === 1 ? 'Mañana' : 'En ' + d + ' días'}: ${it.title} (${it.time})`, true);
      });
      const nueve = toMs(it.date, ALLDAY_HOUR, tz);
      if (it.at - nueve >= 60 * MIN) push('_hoy', nueve, `${it.icon} Hoy ${it.time}: ${it.title}`, true);
      push('_10m', it.at - 10 * MIN, `${it.icon} En 10 min: ${it.title}`, false);
    } else if (it.allDay) {
      // Se muestran al cierre del día pero avisan a las 09:00 (nadie quiere el aviso 23:59).
      (it.leads || LEADS[it.kind] || [1]).forEach(d => {
        if (d > 0) push('_d' + d, toMs(addDays(it.date, -d), ALLDAY_HOUR, tz),
                        `${it.icon} ${d === 1 ? 'Mañana' : 'En ' + d + ' días'}: ${it.title}`, true);
      });
      push('_due', toMs(it.date, ALLDAY_HOUR, tz), `${it.icon} Hoy: ${it.title}`, true);
    } else if (it.kind === 'rec' && it.repeticion) {
      // Ocurrencia de un recordatorio repetido: un solo aviso, a la hora. La clave lleva fecha y hora de ESA ocurrencia
      // (id@YYYY-MM-DDTHH:MM) y no hereda claves viejas: cada ocurrencia avisa una vez.
      out.push({ key: base, at: it.at, title: '🔁 Recordatorio — Centro de Mando', body: it.notifBody, lead: false });
    } else if (it.kind === 'rec') {
      // Recordatorios clásicos: se respetan las claves y los tiempos originales
      // (24 h antes + al momento) para no re-disparar lo ya notificado.
      out.push(mk('_1d', it.at - DAY, '📅 Vence mañana — Centro de Mando', true));
      out.push(mk('',    it.at,       '🔔 Recordatorio — Centro de Mando', false));
    } else {
      // Tarea con franja (sin hora exacta): un solo aviso al arrancar la franja, sin el "en 10 min".
      if (!it.ahoraTxt) push('_10m', it.at - 10 * MIN, `${it.icon} En 10 min: ${it.title}`, false);
      // Las actividades del planner avisan SOLO 10 min antes: son muchas por día y
      // el segundo aviso al arrancar no agrega nada. El resto sí avisa a la hora.
      if (it.kind !== 'actividad') push('_due', it.at, `${it.icon} ${it.ahoraTxt || 'Ahora'}: ${it.title}`, false);
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
    const cuando = it.allDay ? `${it.date.slice(8, 10)}/${it.date.slice(5, 7)}` : (it.cuandoTxt || it.time);
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

  // Motor de tarjetas: en el navegador es window.CMTarjetas; en Node se require().
  // Se resuelve al usarlo (index.html carga deadlines.js ANTES que tarjetas-motor.js).
  function cardsEngine() {
    if (typeof window !== 'undefined' && window.CMTarjetas) return window.CMTarjetas;
    try { return typeof require === 'function' ? require('./tarjetas-motor.js') : null; } catch (e) { return null; }
  }
  const peso = n => {
    const [i, d] = Math.abs(n).toFixed(2).split('.');
    return (n < 0 ? '-' : '') + '$' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d === '00' ? '' : ',' + d);
  };

  // ── recordatorios que se repiten ────────────────────────────────────────
  // r.repetir = { cada:N, unidad:'min'|'h'|'d', desde:'HH:MM', hasta:'HH:MM', dias:[0..6], fin:'YYYY-MM-DD', pausado:bool, visto:'YYYY-MM-DDTHH:MM' }
  //  · min/h: ocurrencias de `desde` a `hasta` (mismo día, sin cruzar medianoche), cada N, solo en `dias` (vacío = todos).
  //  · d: cada N días, a la hora de r.datetime.
  //  · r.datetime es el comienzo: nada ocurre antes. `fin` (fecha) es opcional; sin fin sigue para siempre.
  //  · `visto` = última ocurrencia dada por vista a mano: esa y las anteriores no se muestran ni avisan.
  // Nunca se expande la serie: solo la ocurrencia vigente (la última que pasó dentro de la ventana) y la próxima.
  const REP_MIN_MIN = 15;          // el cron corre cada 5 min: menos que esto no se puede cumplir
  const REP_VENTANA_MS = 60 * MIN; // cuánto tiempo sigue "vigente" una ocurrencia que ya pasó
  const REP_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
  const minDeHora = h => parseInt(h.slice(0, 2), 10) * 60 + parseInt(h.slice(3, 5), 10);
  const horaDeMin = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);

  // '' si es válido; si no, el motivo en español simple.
  function repValidar(rep) {
    if (!rep || typeof rep !== 'object') return 'Falta configurar la repetición.';
    const n = Number(rep.cada);
    if (!Number.isInteger(n) || n < 1) return 'Poné cada cuánto se repite (un número entero).';
    if (rep.unidad !== 'min' && rep.unidad !== 'h' && rep.unidad !== 'd') return 'Elegí minutos, horas o días.';
    if (rep.fin && !isDate(rep.fin)) return 'La fecha final no es válida.';
    if (rep.unidad === 'd') return '';
    if (rep.unidad === 'min' && n < REP_MIN_MIN) return 'El mínimo es cada ' + REP_MIN_MIN + ' minutos.';
    if (!REP_HORA.test(rep.desde || '') || !REP_HORA.test(rep.hasta || '')) return 'Poné la hora de inicio y la de fin.';
    if (minDeHora(rep.hasta) < minDeHora(rep.desde)) return 'La hora de fin tiene que ser posterior a la de inicio (no puede cruzar la medianoche).';
    if (rep.dias != null && (!Array.isArray(rep.dias) || rep.dias.some(d => !Number.isInteger(d) || d < 0 || d > 6))) return 'Los días no son válidos.';
    return '';
  }

  // → { actual, proxima } con { date, time, datetime, at } o null. Sin repetición válida o en pausa → ambos null.
  function repOcurrencias(r, now, opts) {
    const vacio = { actual: null, proxima: null };
    const rep = r && r.repetir;
    if (!rep || rep.pausado || repValidar(rep) || !r.datetime) return vacio;
    opts = opts || {};
    const tz = opts.tz, pasMs = opts.ventanaMs != null ? opts.ventanaMs : REP_VENTANA_MS;
    const [d0, t0] = String(r.datetime).split('T');
    const inicio = toMs(d0, t0, tz);
    if (isNaN(inicio)) return vacio;
    const hoy = dateStrFromMs(now, tz);
    let actual = null, proxima = null;
    // Devuelve true cuando ya encontró la próxima (no hace falta seguir).
    const visitar = (date, time) => {
      const at = toMs(date, time, tz);
      if (isNaN(at) || at < inicio) return false;
      const datetime = date + 'T' + time;
      if (rep.visto && datetime <= rep.visto) return false;
      const o = { date, time, datetime, at };
      if (at <= now) { if (now - at <= pasMs) actual = o; return false; }
      proxima = o; return true;
    };
    if (rep.unidad === 'd') {
      const dif = Math.round((Date.parse(hoy + 'T12:00:00Z') - Date.parse(d0 + 'T12:00:00Z')) / DAY);
      const k0 = Math.max(0, Math.floor(dif / rep.cada) - 1);
      for (let k = k0; k < k0 + 4; k++) {
        const date = addDays(d0, k * rep.cada);
        if (rep.fin && date > rep.fin) break;
        if (visitar(date, isTime(t0) ? t0.slice(0, 5) : '00:00')) break;
      }
    } else {
      const paso = rep.cada * (rep.unidad === 'h' ? 60 : 1), a = minDeHora(rep.desde), b = minDeHora(rep.hasta);
      const dias = Array.isArray(rep.dias) && rep.dias.length ? rep.dias : null;
      // Desde ayer (la ventana de rescate puede cruzar la medianoche) hasta 8 días: alcanza para cualquier combinación de días.
      fuera: for (let i = -1; i <= 8; i++) {
        const date = addDays(hoy, i);
        if (rep.fin && date > rep.fin) break;
        if (dias && !dias.includes(new Date(date + 'T12:00:00').getDay())) continue;
        for (let m = a; m <= b; m += paso) { if (visitar(date, horaDeMin(m))) break fuera; }
      }
    }
    return { actual, proxima };
  }

  // ── registros (registros.js) ────────────────────────────────────────────
  // reg = { id, nombre, principal?, frecuencia:{ tipo:'cada', cada:N, unidad:'min'|'h' } | { tipo:'horas', horas:['HH:MM',..] },
  //         desde:'HH:MM', hasta:'HH:MM' (solo 'cada'), dias:[0..6] (vacío = todos), pausado, pausadoDesde:'YYYY-MM-DDTHH:MM', inicio:'YYYY-MM-DDTHH:MM' }
  //  · `inicio` (hora local, se compara como texto con la ocurrencia) = desde cuándo cuenta: nada ocurre antes. Se corre al cambiar el horario.
  //  · Pausado: las ocurrencias desde `pausadoDesde` ya no existen (ni avisan ni cuentan como «sin respuesta»).
  const REG_URL = '#registro-';
  function regFrecValidar(reg) {
    const f = reg && reg.frecuencia;
    if (!f || typeof f !== 'object') return 'Falta elegir cada cuánto avisa.';
    if (reg.dias != null && (!Array.isArray(reg.dias) || reg.dias.some(d => !Number.isInteger(d) || d < 0 || d > 6))) return 'Los días no son válidos.';
    if (f.tipo === 'horas') {
      if (!Array.isArray(f.horas) || !f.horas.length) return 'Agregá al menos una hora.';
      if (f.horas.some(h => !REP_HORA.test(h || ''))) return 'Hay una hora que no es válida.';
      return '';
    }
    if (f.tipo !== 'cada') return 'Falta elegir cada cuánto avisa.';
    const n = Number(f.cada);
    if (!Number.isInteger(n) || n < 1) return 'Poné cada cuánto avisa (un número entero).';
    if (f.unidad !== 'min' && f.unidad !== 'h') return 'Elegí minutos u horas.';
    if (f.unidad === 'min' && n < REP_MIN_MIN) return 'El mínimo es cada ' + REP_MIN_MIN + ' minutos.';
    if (!REP_HORA.test(reg.desde || '') || !REP_HORA.test(reg.hasta || '')) return 'Poné el horario de inicio y de fin.';
    if (minDeHora(reg.hasta) < minDeHora(reg.desde)) return 'El horario de fin tiene que ser posterior al de inicio.';
    return '';
  }
  // Horas 'HH:MM' en las que cae el registro ese día (respeta días, inicio y pausa).
  function regSlotsDia(reg, date) {
    if (!reg || !isDate(date) || regFrecValidar(reg)) return [];
    const dias = Array.isArray(reg.dias) && reg.dias.length ? reg.dias : null;
    if (dias && !dias.includes(new Date(date + 'T12:00:00').getDay())) return [];
    const f = reg.frecuencia;
    let horas = [];
    if (f.tipo === 'horas') horas = Array.from(new Set(f.horas)).sort();
    else {
      const paso = f.cada * (f.unidad === 'h' ? 60 : 1), b = minDeHora(reg.hasta);
      for (let m = minDeHora(reg.desde); m <= b; m += paso) horas.push(horaDeMin(m));
    }
    return horas.filter(h => {
      const dt = date + 'T' + h;
      if (reg.inicio && dt < reg.inicio) return false;
      if (reg.pausado && reg.pausadoDesde && dt >= reg.pausadoDesde) return false;
      return true;
    });
  }
  // → { actual, proxima } como repOcurrencias. Pausado → ambos null.
  function regOcurrencias(reg, now, opts) {
    const vacio = { actual: null, proxima: null };
    if (!reg || reg.pausado || regFrecValidar(reg)) return vacio;
    opts = opts || {};
    const tz = opts.tz, pasMs = opts.ventanaMs != null ? opts.ventanaMs : REP_VENTANA_MS;
    const hoy = dateStrFromMs(now, tz);
    let actual = null, proxima = null;
    fuera: for (let i = -1; i <= 8; i++) {
      const date = addDays(hoy, i);
      for (const time of regSlotsDia(reg, date)) {
        const at = toMs(date, time, tz);
        if (isNaN(at)) continue;
        const o = { date, time, datetime: date + 'T' + time, at };
        if (at <= now) { if (now - at <= pasMs) actual = o; } else { proxima = o; break fuera; }
      }
    }
    return { actual, proxima };
  }

  // ── finales con hora ────────────────────────────────────────────────────
  // La hora vive en la fila del Plan de materias (S.lawPlan: fechaTipo 'exacta', fecha, hora 'HH:MM', durMin) que el final
  // tiene vinculada por f.lawPlanId. Solo vale si la fila sigue con la misma fecha que el final (si se editó la fecha desde
  // Finales, la hora de la fecha vieja no se arrastra). → { hora, durMin } o null.
  function finalHora(S, f) {
    if (!f || !f.lawPlanId) return null;
    const r = ((S || {}).lawPlan || []).find(x => x && x.id === f.lawPlanId);
    if (!r || r.fechaTipo !== 'exacta' || r.fecha !== f.fecha || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora || '')) return null;
    return { hora: r.hora, durMin: r.durMin > 0 ? r.durMin : 120 };
  }
  // Finales activos con hora de un día (para el planner del día): [{ id, materia, tipo, time, durMin }], por hora.
  function finalesConHora(S, date) {
    const out = [];
    ((S && S.sgc || {}).finales || []).forEach(f => {
      if (!f || f.done || f.fecha !== date) return;
      const h = finalHora(S, f);
      if (h) out.push({ id: f.id, materia: f.materia || 'Final', tipo: f.tipo || '', time: h.hora, durMin: h.durMin });
    });
    return out.sort((a, b) => a.time.localeCompare(b.time));
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
        if (r.repetir && !repValidar(r.repetir)) {
          // Repetido: solo la ocurrencia vigente y la próxima (una pausa o un "visto" las apaga). Misma id, cada una con su clave.
          const o = repOcurrencias(r, now, opts);
          [o.actual, o.proxima].filter(Boolean).forEach(x => add({ id: r.id, kind: 'rec', kindLabel: 'Recordatorio', icon: '🔁', tab,
            title: r.title || '(sin título)', date: x.date, time: x.time, allDay: false, repeticion: true,
            priority: r.priority || 'medium', editable: true, raw: r }));
          return;
        }
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

    // 3) Finales. Con hora (fila del Plan de materias con fecha exacta + hora, ver finalHora) → evento con hora real y su
    //    duración; sin hora → de día completo, como siempre.
    ((S.sgc || {}).finales || []).forEach(f => {
      if (!f || f.done || !isDate(f.fecha)) return;
      const h = finalHora(S, f);
      const dias = Math.round((toMs(f.fecha, ALLDAY_HOUR, opts.tz) - now) / DAY);
      add({ id: 'final_' + f.id, kind: 'final', kindLabel: 'Final', icon: '🎓', tab: 'conocimiento',
            title: f.materia || 'Final', sub: f.tipo || '', date: f.fecha, time: h ? h.hora : '', allDay: !h,
            ...(h ? { durMin: h.durMin } : {}),
            priority: dias <= 3 ? 'critical' : 'high',
            doneAction: `Finales.done('${f.id}')`, openAction: "Finales.open('plan')" });
    });

    // 4) Cursada (clases, TPs, foros)
    (S.cursada || []).forEach(c => {
      if (!c || c.done || !isDate(c.fecha)) return;
      const lbl = c.tipo === 'tp' ? 'TP' : c.tipo === 'foro' ? 'Foro' : 'Clase';
      const ico = c.tipo === 'tp' ? '📝' : c.tipo === 'foro' ? '💬' : '📘';
      add({ id: 'curs_' + c.id, kind: 'cursada', kindLabel: lbl, icon: ico, tab: 'conocimiento',
            title: c.materia || lbl, sub: c.titulo || '', date: c.fecha, time: c.hora || '',
            allDay: !isTime(c.hora), priority: c.tipo === 'tp' ? 'high' : 'medium',
            leads: c.tipo === 'tp' ? LEADS.tp : LEADS.cursada,
            doneAction: `Cursada.done('${c.id}')`, openAction: 'Cursada.open()' });
    });

    // 5) Metas del día con hora + 6) actividades del planner (ventana corta:
    //    son recurrentes y llenarían la lista si se expandieran a 60 días)
    for (let i = -1; i <= ACT_WINDOW; i++) {
      const date = addDays(today, i);

      (S.goals && S.goals[date] || []).forEach(g => {
        if (!g || g.done) return;
        const conHora = isTime(g.time), fr = !conHora && FRANJAS[g.franja];
        if (!conHora && !(fr && g.oblig)) return;   // la franja solo avisa si es obligatoria
        // "Obligatoria a esa hora": se marca en el aviso y sube a prioridad alta. Con franja avisa a la hora de arranque de la franja.
        const oblig = !!g.oblig;
        add({ id: 'meta_' + g.id + '_' + date, kind: 'meta', kindLabel: 'Meta', icon: '🎯', tab: 'vida',
              title: g.text || 'Meta', sub: oblig ? 'Obligatoria' : '', date, time: conHora ? g.time : fr[0], allDay: false,
              ...(fr ? { ahoraTxt: fr[1], cuandoTxt: fr[1].replace('Esta ', '').replace(/^./, c => c.toUpperCase()) } : {}),
              priority: oblig ? 'high' : g.priority === 'high' ? 'high' : g.priority === 'mid' ? 'medium' : 'low',
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
            priority: 'medium' });
    });

    // 8) Pedidos en camino
    (S.orders || []).forEach(o => {
      if (!o || !isDate(o.arrival)) return;
      add({ id: 'ord_' + o.id, kind: 'pedido', kindLabel: 'Pedido', icon: '📦', tab: 'finanzas',
            title: `${o.name} llega`, date: o.arrival, allDay: true, priority: 'low' });
    });

    // 10) Vencimientos de tarjeta: una entrada por (tarjeta, fecha) con lo que vence ese día,
    //     de hoy a 12 meses. Suma las cuotas de las compras y lo ya usado con fecha (S.cardDues) que vencen
    //     ese día. Sin motor o sin tarjetas con compras ni vencimientos cargados, el bloque se omite.
    const motor = cardsEngine();
    const cCharges = Array.isArray(S.cardCharges) ? S.cardCharges : [];
    const cDues = Array.isArray(S.cardDues) ? S.cardDues : [];
    if (motor && Array.isArray(S.cards) && (cCharges.length || cDues.length)) {
      const end = addDays(today, 365);
      S.cards.forEach(card => {
        if (!card || !card.id) return;
        // pendingDues descuenta los pagos: el automático y los adelantos ("Registrar pago de resumen").
        motor.pendingDues(card, cCharges, today, end, cDues, S.cardPayments).forEach(d => {
          if (!(d.amount > 0)) return;
          add({ id: 'tarj_' + card.id + '_' + d.dueDate, kind: 'tarjeta', kindLabel: 'Tarjeta', icon: '💳',
                tab: 'finanzas', title: card.name + ' vence', sub: peso(d.amount) + ' a pagar',
                date: d.dueDate, allDay: true, priority: 'high' });
        });
      });
    }

    // 11) Chequeos de Foco ("¿En qué estuviste?"): uno por cada hora de S.foco.config.horas, todos los días.
    //     Sin `tab` → no aparece en las cards de Recordatorios ni en el ticker; solo genera el aviso.
    //     Si la config no existe todavía rigen las horas por defecto; con [] no hay avisos.
    //     Con el registro principal ya creado (registros.js) los avisos son los suyos (sección 13): este bloque se apaga.
    const hayPrincipal = Array.isArray(S.registros) && S.registros.some(r => r && r.principal);
    const horas = hayPrincipal ? [] : focoHoras(S.foco);
    const chequeos = (S.foco && Array.isArray(S.foco.chequeos)) ? S.foco.chequeos : [];
    // Aceptado: cambiar una hora que ya avisó puede avisar de nuevo si la nueva cae dentro de la ventana (clave distinta).
    for (let i = -1; i <= 0; i++) {   // ayer también: un aviso de las 23:xx puede salir pasada la medianoche
      const date = addDays(today, i);
      horas.forEach((hora, k) => {
        if (focoRespondido(chequeos, date, hora, horas[k + 1])) return;
        add({ id: 'foco_' + date + '_' + hora, kind: 'foco', kindLabel: 'Chequeo', icon: '🧭', date, time: hora, allDay: false,
              title: '¿En qué estuviste?', cuerpo: 'Tocá para anotar las últimas horas.', url: FOCO_URL, priority: 'low' });
      });
    }

    // 12) Principios con recordatorio por horario (principio.disparo = {tipo:'horario', hora}): un aviso por día a esa hora, con la url del principio.
    //     Sin `tab` → solo genera el aviso. Un principio silenciado/pospuesto (silenciadoHasta posterior a ese día) no avisa: el cron lee este mismo estado.
    const prins = (S.principios && Array.isArray(S.principios.principios)) ? S.principios.principios : [];
    for (let i = -1; i <= 0; i++) {   // ayer también: un aviso de las 23:xx puede salir pasada la medianoche
      const date = addDays(today, i);
      prins.forEach(p => {
        const d = p && p.disparo;
        if (!d || d.tipo !== 'horario' || !p.id || !p.enunciado || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.hora || '')) return;
        if (isDate(p.silenciadoHasta) && p.silenciadoHasta > date) return;
        const corta = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/[\s.,;:]+$/, '') + '…' : t; };
        add({ id: 'prin_' + date + '_' + p.id, kind: 'principio', kindLabel: 'Principio', icon: '🧭', date, time: d.hora, allDay: false,
              title: p.tipo === 'anti' ? '⛔ A evitar' : '🧭 Tu principio',
              cuerpo: corta(p.enunciado, 120) + (p.porque ? '\nPor qué: ' + corta(p.porque, 140) : ''),
              url: '#principio-' + encodeURIComponent(p.id), priority: 'low' });
      });
    }

    // 13) Registros (registros.js): solo la ocurrencia vigente (la última que pasó dentro de la ventana) y solo si todavía no se respondió.
    //     Sin `tab` → solo genera el aviso. La clave es id@YYYY-MM-DDTHH:MM de esa ocurrencia; la url abre su formulario.
    const regs = Array.isArray(S.registros) ? S.registros : [];
    if (regs.length) {
      const hechos = new Set((Array.isArray(S.registroRespuestas) ? S.registroRespuestas : []).filter(x => x && x.slot).map(x => x.registroId + '@' + x.slot));
      regs.forEach(reg => {
        if (!reg || !reg.id) return;
        const o = regOcurrencias(reg, now, opts).actual;
        if (!o || hechos.has(reg.id + '@' + o.datetime)) return;
        const prin = !!reg.principal, nombre = String(reg.nombre || 'Registro');
        add({ id: 'reg_' + reg.id, kind: 'registro', kindLabel: 'Registro', icon: '📝', date: o.date, time: o.time, allDay: false,
              title: prin ? '¿Qué estuviste haciendo?' : '📝 ' + nombre,
              cuerpo: prin ? 'Tocá para anotar qué hacías y en qué pensabas.' : 'Tocá para responder.',
              url: REG_URL + encodeURIComponent(reg.id) + '@' + o.datetime, priority: 'low' });
      });
    }

    return items.sort((a, b) => a.at - b.at);
  }

  const FOCO_URL = '#foco-chequeo';   // relativo al scope del SW; sw.js lo resuelve contra su scope
  const FOCO_WIN_MS = 60 * 60000;
  const FOCO_HORAS_DEF =['11:00', '15:00', '19:00'];
  const minDe = h => parseInt(h.slice(0, 2), 10) * 60 + parseInt(h.slice(3, 5), 10);
  // Horas de los chequeos: 'HH:MM' válidas, sin duplicados, ordenadas. Sin config → por defecto.
  function focoHoras(foco) {
    const raw = foco && foco.config && Array.isArray(foco.config.horas) ? foco.config.horas : FOCO_HORAS_DEF;
    return Array.from(new Set(raw.filter(h => typeof h === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(h)))).sort();
  }
  // Un chequeo ya anotado desde 30 min antes de la hora y hasta la hora siguiente cubre ese aviso.
  function focoRespondido(chequeos, date, hora, siguiente) {
    const desde = minDe(hora) - 30, hasta = siguiente ? minDe(siguiente) : 24 * 60;
    return chequeos.some(c => c && c.fecha === date && /^\d{2}:\d{2}$/.test(c.hora || '') && minDe(c.hora) >= desde && minDe(c.hora) < hasta);
  }

  // Avisos que deben dispararse ahora: cayeron dentro de su ventana de rescate y
  // no se notificaron todavía.
  //
  // Dos ventanas, según el flag `lead` del aviso: uno de anticipación ("final en
  // 30 días") sigue sirviendo una hora tarde, así que se rescata; uno de momento
  // ("en 10 min") tarde ya es ruido. Sin esta distinción, con la pestaña dormida
  // más de la ventana corta —lo normal en el celular— los avisos de anticipación
  // se perdían en silencio.
  function dueAlerts(state, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const winTimed = opts.windowMs || 5 * MIN;
    const winLead  = opts.windowLeadMs || 60 * MIN;
    const seen = opts.seen || {};
    const has = k => (typeof seen.has === 'function' ? seen.has(k) : !!seen[k]);
    const out = [];
    collect(state, opts).forEach(it => (it.alerts || []).forEach(a => {
      const win = a.winMs || (a.lead ? winLead : winTimed);   // winMs propio del aviso gana sobre la regla por lead
      if (a.at <= now && now - a.at < win && !has(a.key) && !(a.legacyKey && has(a.legacyKey))) out.push({ ...a, item: it });
    }));
    return out;
  }

  // Migración de claves: para cada aviso ya vencido (at <= now) cuya clave vieja (sin fecha) figura como avisada, la clave
  // nueva (con fecha) también. Si el aviso todavía no llegó (at > now) la fecha se corrió a futuro tras avisar: no se
  // hereda, así vuelve a avisar. Devuelve las claves nuevas a conservar.
  function migrarClaves(state, opts, seen) {
    const has = k => (seen && typeof seen.has === 'function' ? seen.has(k) : !!(seen && seen[k]));
    const now = (opts && opts.now) || Date.now();
    const out = [];
    collect(state, opts).forEach(it => (it.alerts || []).forEach(a => {
      if (a.legacyKey && a.at <= now && has(a.legacyKey) && !has(a.key)) out.push(a.key);
    }));
    return out;
  }

  return { collect, finalHora, finalesConHora, dueAlerts, focoHoras, migrarClaves, repValidar, repOcurrencias, REP_MIN_MIN, regFrecValidar, regSlotsDia, regOcurrencias, REG_URL };
})();

if (typeof window !== 'undefined') window.CMDeadlines = CMDeadlines;
if (typeof module !== 'undefined' && module.exports) module.exports = CMDeadlines;
