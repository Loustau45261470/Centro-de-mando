'use strict';
// ════════════════════════════════════════════════════════════════════════
// PLAN-ENTRENO — lógica PURA del plan semanal de Entrenamiento (sin DOM, sin `S` global).
// Script clásico (global `PlanEntreno`) y también require()-able desde Node (tests).
//
// Estado (S.planEntreno), lunes = 0 (semana ISO). Cada DÍA es una lista (0..n items) guardada como OBJETO {uid: item}
// — no un array sin id — para que el merge entre dispositivos (_merge3 une objetos clave por clave) no pierda un
// item agregado en otro dispositivo:
//   { fijo:      { "0": {uid:item,...}, ... },               // día ausente o {} = descanso/sin asignar
//     semanas:   { "AAAA-Www": { "<dia>": {uid:item,...,anulada?}, descanso?:bool, descansoDesde?:"AAAA-MM-DD" (el descanso vale desde ahí; ausente = toda la semana), hasta?:"AAAA-MM-DD" (deja de valer desde ahí) } },
//                                                              // excepción de ESA semana: reemplaza la lista fija del día ({} = descanso)
//     corridas:  { "<uid>": { desde:"AAAA-MM-DD", hasta?:"AAAA-MM-DD" } },   // vigente si desde <= f < hasta (resetear fija hasta; anulada = formato viejo)  // desplazamiento en cadena (ver aplicarCorrida)
//     pendientes:{ "AAAA-MM-DD": "corrida"|"seguir"|"reset" } }       // decisión tomada ese día sobre lo que quedó de ayer
//   item = { uid, o, franja:'manana'|'tarde'|'noche', tipo:'rutina', id } | { ..., tipo:'actividad', clave }
//   (orden dentro del día: franja, luego o, luego uid)
// Registro de actividades hechas (S.actividadesHechas): { uid: {fecha, clave, franja, duracionMin?, intensidad?, concentracion?, proposito?} }
//
// Sync (tests/plan-entreno-sync.spec.js): NUNCA se borran claves (una clave borrada resucita desde el otro dispositivo en
// _rescueLocal): quitar = null en el uid (tombstone), deshacer = `anulada:true`. Los lectores filtran nulls/anuladas.
// El estado vacío no pre-carga nulls (un null ya presente en la nube pisaría una edición local en el rescate sin ancestro).
// Las funciones NO mutan lo recibido: devuelven un plan/registro nuevo.
//
// Fechas: strings 'AAAA-MM-DD' en día LOCAL del dispositivo (el llamador usa getActiveDate()/localStr()).
// ════════════════════════════════════════════════════════════════════════
const PlanEntreno = (() => {
  const ACTIVIDADES = [
    { clave: 'boxeo', nombre: 'Boxeo', grupo: 'combate' },
    { clave: 'jiujitsu', nombre: 'Jiujitsu', grupo: 'combate' },
    { clave: 'resistencia', nombre: 'Resistencia', grupo: 'cardio' },
    { clave: 'fuerza', nombre: 'Fuerza', grupo: 'fuerza' },
    { clave: 'sprint', nombre: 'Sprint', grupo: 'cardio' },
    { clave: 'futbol', nombre: 'Fútbol', grupo: 'cardio' },
    { clave: 'rugby', nombre: 'Rugby', grupo: 'cardio' },
  ];
  const FRANJAS = ['manana', 'tarde', 'noche'];
  const nombreActividad = clave => (ACTIVIDADES.find(a => a.clave === clave) || {}).nombre || null;
  const DIAS = ['0', '1', '2', '3', '4', '5', '6'];

  const vacio = () => ({ fijo: {}, semanas: {}, corridas: {}, pendientes: {} });
  const clone = o => JSON.parse(JSON.stringify(o));
  const esObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const pad = n => String(n).padStart(2, '0');
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  let _n = 0;
  const nuevoUid = () => 'pe' + Date.now().toString(36) + (++_n).toString(36) + Math.random().toString(36).slice(2, 6);

  function norm(plan) {
    const p = esObj(plan) ? clone(plan) : {};
    ['fijo', 'semanas', 'corridas', 'pendientes'].forEach(k => { if (!esObj(p[k])) p[k] = {}; });
    return p;
  }

  // ── Fechas (aritmética UTC sobre la fecha calendario → inmune a zona horaria / DST) ──
  function parse(f) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f));
    if (!m) throw new Error('fecha inválida: ' + f);
    return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  }
  const fmt = ms => { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  const sumarDias = (f, n) => fmt(parse(f) + n * 86400000);
  const fechaLocal = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const diaDeSemana = f => (new Date(parse(f)).getUTCDay() + 6) % 7;   // lunes = 0
  function semanaISO(f) {   // 'AAAA-Www' ISO 8601 (año del jueves de esa semana)
    const jueves = parse(f) + (3 - diaDeSemana(f)) * 86400000;
    const anio = new Date(jueves).getUTCFullYear();
    const w = 1 + Math.floor((jueves - Date.UTC(anio, 0, 1)) / (7 * 86400000));
    return anio + '-W' + pad(w);
  }
  const fechaDeDia = (f, dia) => sumarDias(f, dia - diaDeSemana(f));
  // Fecha del lunes de 'AAAA-Www'.
  function lunesDeSemana(key) {
    const m = /^(\d{4})-W(\d{2})$/.exec(String(key));
    if (!m) throw new Error('semana inválida: ' + key);
    const ene4 = fmt(Date.UTC(+m[1], 0, 4));
    return sumarDias(ene4, -diaDeSemana(ene4) + (+m[2] - 1) * 7);
  }

  // ── Items ──
  const esItem = v => esObj(v) && (v.tipo === 'rutina' ? !!v.id : v.tipo === 'actividad' ? !!v.clave : false);
  const mismoItem = (a, b) => a.tipo === b.tipo && (a.tipo === 'rutina' ? a.id === b.id : a.clave === b.clave);
  const franjaOk = f => (FRANJAS.includes(f) ? f : 'manana');
  const idxFranja = i => FRANJAS.indexOf(franjaOk(i.franja));
  // Mapa {uid:item|null} → array de items vivos, ordenado por franja, o, uid.
  function lista(mapa) {
    if (!esObj(mapa)) return [];
    return Object.keys(mapa).filter(u => esItem(mapa[u])).map(u => ({ ...mapa[u], uid: mapa[u].uid || u, franja: franjaOk(mapa[u].franja) }))
      .sort((a, b) => (idxFranja(a) - idxFranja(b)) || ((a.o || 0) - (b.o || 0)) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  }
  const mapaDe = items => { const m = {}; items.forEach(i => { m[i.uid] = clone(i); }); return m; };
  function crearItem(base, uid, o) {
    if (!esItem(base)) throw new Error('item inválido');
    const it = base.tipo === 'rutina' ? { tipo: 'rutina', id: base.id } : { tipo: 'actividad', clave: base.clave };
    return { uid: uid || nuevoUid(), o: o == null ? 0 : o, franja: franjaOk(base.franja), ...it };
  }

  // ── Lectura ──
  const excepcionDe = (p, key) => (esObj(p.semanas[key]) ? p.semanas[key] : {});
  const diaVigente = (ex, d) => has(ex, d) && esObj(ex[d]) && !ex[d].anulada;
  // Plan "base" (fijo + excepciones de la semana, SIN corridas) de una fecha.
  // Una excepción de semana deja de valer DESDE ex.hasta (fecha del reset): lo anterior conserva lo que mostraba.
  const exVigente = (ex, fecha) => !(ex.hasta && fecha >= ex.hasta);
  const exDe = (p, fecha) => { const ex = excepcionDe(p, semanaISO(fecha)); return exVigente(ex, fecha) ? ex : {}; };
  // El descanso de una semana vale desde ex.descansoDesde (ausente = toda la semana).
  const descansa = (ex, fecha) => ex.descanso === true && (!ex.descansoDesde || fecha >= ex.descansoDesde);
  function baseDelDia(p, fecha) {
    const ex = exDe(p, fecha), d = diaDeSemana(fecha);
    if (descansa(ex, fecha)) return [];
    return lista(diaVigente(ex, d) ? ex[d] : p.fijo[d]);
  }
  // Cantidad de corridas vigentes en `fecha`: desde <= fecha y (sin hasta, o fecha < hasta). (anulada = formato viejo, se respeta.)
  const desfase = (plan, fecha) => { const co = norm(plan).corridas; return Object.keys(co).filter(u => { const c = co[u]; return esObj(c) && !c.anulada && c.desde && c.desde <= fecha && (!c.hasta || fecha < c.hasta); }).length; };
  // Items efectivos de una fecha: el plan base de (fecha − desfase). La semana "descansada" queda vacía (aunque el desfase traiga items).
  function itemsDelDia(plan, fecha) {
    const p = norm(plan);
    if (descansa(exDe(p, fecha), fecha)) return [];
    return baseDelDia(p, sumarDias(fecha, -desfase(p, fecha)));
  }
  const rutinasDelDia = (plan, fecha) => itemsDelDia(plan, fecha).filter(i => i.tipo === 'rutina').map(i => i.id);
  // 7 listas EFECTIVAS (con corridas) de las fechas de esa semana.
  const planDeSemana = (plan, semanaKey) => { const l = lunesDeSemana(semanaKey); return DIAS.map(d => itemsDelDia(plan, sumarDias(l, +d))); };

  // Sesiones → [{rutinaId, date}]. Acepta esa lista o S.routineLog ({rtnId:[{date,...}]}).
  function sesiones(h) {
    if (Array.isArray(h)) return h.map(s => ({ rutinaId: s && (s.rutinaId || s.routineId), date: s && s.date })).filter(s => s.rutinaId && s.date);
    if (!esObj(h)) return [];
    const out = [];
    Object.keys(h).forEach(rid => (Array.isArray(h[rid]) ? h[rid] : []).forEach(e => { if (e && e.date) out.push({ rutinaId: rid, date: e.date }); }));
    return out;
  }

  // Lo que quedó sin hacer AYER (items efectivos de ayer). Devuelve { fecha: ayer, items:[...] } o null.
  //  - solo se mira ayer (si no entró varios días, solo el día más reciente; los anteriores quedan "no hechos");
  //  - rutina hecha = hay sesión de ESA rutina ayer; actividad hecha = `hechas(fecha)` (array/Set de claves, ver hechasDe)
  //    la contiene. Si no se inyecta `hechas`, las actividades NO se evalúan (nunca generan pendiente);
  //  - null si pendientes[fecha] ya existe (resuelto) o si ayer cae en una semana descansada; nada se completa solo.
  function pendienteDe(plan, historial, fecha, hechas) {
    const p = norm(plan);
    if (p.pendientes[fecha]) return null;
    const ayer = sumarDias(fecha, -1);
    const ses = sesiones(historial);
    const claves = typeof hechas === 'function' ? new Set(hechas(ayer) || []) : null;
    const items = itemsDelDia(p, ayer).filter(it => it.tipo === 'rutina'
      ? !ses.some(s => s.rutinaId === it.id && s.date === ayer)
      : !!claves && !claves.has(it.clave));
    return items.length ? { fecha: ayer, items } : null;
  }

  // ── Escritura (devuelven plan NUEVO) ──
  // "Hacer la pendiente": agrega una CORRIDA desde HOY (el pasado no se reescribe; hoy ya muestra lo de ayer) → desde ahí toda la secuencia del plan se corre un día hacia
  // adelante, en cadena y cruzando semanas (lo de ayer pasa a hoy, lo de hoy a mañana… el domingo al lunes siguiente);
  // nada se suma a lo que toca ese día ni se pierde. Se mantiene hasta resetear(). uid determinístico por fecha
  // ('c'+fecha): dos dispositivos que corren el mismo día NO duplican la corrida al sincronizar.
  function aplicarCorrida(plan, fecha, historial, hechas) {
    const pend = pendienteDe(plan, historial, fecha, hechas);
    const p = norm(plan);
    if (!pend) return p;
    p.corridas['c' + fecha] = { desde: fecha };
    p.pendientes[fecha] = 'corrida';
    return p;
  }
  function resolverSeguir(plan, fecha) {
    const p = norm(plan);
    p.pendientes[fecha] = 'seguir';
    return p;
  }
  // "Resetear": vuelve al estado normal desde `fecha`. Anula las corridas, deja sin efecto las excepciones "solo esta
  // semana" (y "descansar semana") y resuelve la pendiente de hoy. SOLO desde `fecha`: el pasado no se reescribe.
  // No borra claves (merge): guarda hasta:fecha en cada corrida vigente y en cada excepción de semana que llega a `fecha`.
  function resetear(plan, fecha) {
    const p = norm(plan);
    const corta = o => { o.hasta = o.hasta && o.hasta < fecha ? o.hasta : fecha; };
    Object.keys(p.corridas).forEach(u => { const c = p.corridas[u]; if (esObj(c) && !c.anulada) corta(c); });
    Object.keys(p.semanas).forEach(k => {
      const ex = p.semanas[k]; if (!esObj(ex)) return;
      let fin; try { fin = sumarDias(lunesDeSemana(k), 6); } catch (e) { return; }
      if (fin >= fecha) corta(ex);   // las semanas enteramente pasadas se dejan como están
    });
    if (!p.pendientes[fecha]) p.pendientes[fecha] = 'reset';
    return p;
  }

  // Acción sobre la lista de un día. accion = {op:'agregar', dia, item, uid?} | {op:'quitar', dia, uid} |
  // {op:'mover', uid, de, a} | {op:'vaciar', dia} | {op:'franja', dia, uid, franja}. `obtener(dia)` da el mapa editable del día.
  function ejecutar(accion, obtener) {
    const sigO = m => lista(m).reduce((x, i) => Math.max(x, (i.o || 0) + 1), 0);
    if (accion.op === 'agregar') {
      const m = obtener(accion.dia);
      const it = crearItem(accion.item, accion.uid, sigO(m));
      m[it.uid] = it;
    } else if (accion.op === 'quitar') {
      const m = obtener(accion.dia);
      if (esItem(m[accion.uid])) m[accion.uid] = null;
    } else if (accion.op === 'vaciar') {
      tombstones(obtener(accion.dia));
    } else if (accion.op === 'franja') {
      const m = obtener(accion.dia);
      if (esItem(m[accion.uid])) m[accion.uid].franja = franjaOk(accion.franja);
    } else if (accion.op === 'mover') {
      const src = obtener(accion.de), dst = obtener(accion.a);
      const it = src[accion.uid];
      if (!esItem(it)) return;
      src[accion.uid] = null;
      dst[accion.uid] = { ...clone(it), o: sigO(dst) };
    } else throw new Error('acción inválida: ' + accion.op);
  }
  const tombstones = m => { Object.keys(m).forEach(u => { if (esItem(m[u])) m[u] = null; }); };
  const fijarUid = accion => (accion.op === 'agregar' && !accion.uid ? { ...accion, uid: nuevoUid() } : accion);

  // Cambia el plan fijo de ahí en adelante. Si se pasa semanaKey y esa semana ya tenía excepción vigente para el/los
  // día(s) afectado(s), se le aplica la misma acción (si no, la excepción taparía el cambio permanente).
  // (Opera sobre el plan BASE por día de la semana; el desplazamiento por corridas se aplica al leer.)
  function cambiarPermanente(plan, accion, semanaKey) {
    const p = norm(plan), ac = fijarUid(accion);
    ejecutar(ac, d => { if (!esObj(p.fijo[d])) p.fijo[d] = {}; return p.fijo[d]; });
    const ex = semanaKey && esObj(p.semanas[semanaKey]) ? p.semanas[semanaKey] : null;
    if (ex && [ac.dia, ac.de, ac.a].filter(d => d != null).some(d => diaVigente(ex, d))) ejecutar(ac, d => diaEditable(p, ex, d));
    return p;
  }
  // Mapa editable de un día de la excepción: la primera vez (o tras resetear) arranca como copia de la lista fija.
  function diaEditable(p, ex, d) {
    if (!esObj(ex[d])) ex[d] = mapaDe(lista(p.fijo[d]));
    else if (ex[d].anulada) { tombstones(ex[d]); ex[d].anulada = false; Object.assign(ex[d], mapaDe(lista(p.fijo[d]))); }
    return ex[d];
  }
  // Una excepción cortada por resetear (ex.hasta): al volver a editarla, los días desde `hasta` arrancan de nuevo desde el fijo
  // (sin resucitar lo anterior) y los anteriores conservan lo que mostraban.
  function revivir(p, key, ex) {
    if (!ex.hasta) return;
    const lunes = lunesDeSemana(key);
    DIAS.forEach(d => { if (esObj(ex[d]) && sumarDias(lunes, +d) >= ex.hasta) { tombstones(ex[d]); ex[d].anulada = false; Object.assign(ex[d], mapaDe(lista(p.fijo[d]))); } });
    ex.hasta = null;
    if (ex.descanso === true) ex.descanso = false;   // los días previos al reset ya son mapas vacíos: siguen de descanso
  }
  // Cambia solo esa semana (mismos uids que el fijo al copiar).
  function cambiarSoloSemana(plan, semanaKey, accion) {
    const p = norm(plan), ac = fijarUid(accion);
    if (!esObj(p.semanas[semanaKey])) p.semanas[semanaKey] = {};
    const ex = p.semanas[semanaKey];
    revivir(p, semanaKey, ex);
    if (ex.descanso === true) {   // semana descansada que se edita: deja de estar "descansada"; los días ya están vacíos
      ex.descanso = false;
    }
    ejecutar(ac, d => diaEditable(p, ex, d));
    return p;
  }
  // "Descansar esta semana": los días DESDE `fecha` (hoy) quedan sin items y sin pendientes; los anteriores conservan lo que mostraban
  // (lo ya hecho no se reescribe). Sin `fecha` = la semana entera. La semana siguiente vuelve al fijo (con el desfase vigente).
  function descansarSemana(plan, semanaKey, fecha) {
    const p = norm(plan);
    if (!esObj(p.semanas[semanaKey])) p.semanas[semanaKey] = {};
    const ex = p.semanas[semanaKey], lunes = lunesDeSemana(semanaKey);
    revivir(p, semanaKey, ex);
    DIAS.forEach(d => {
      if (fecha && sumarDias(lunes, +d) < fecha) return;
      if (esObj(ex[d])) { tombstones(ex[d]); ex[d].anulada = false; } else ex[d] = {};
    });
    ex.descanso = true;
    ex.descansoDesde = fecha && fecha > lunes ? fecha : null;
    return p;
  }

  const usaRutina = (plan, rutinaId) => {
    const p = norm(plan), es = m => lista(m).some(i => i.tipo === 'rutina' && i.id === rutinaId);
    return Object.keys(p.fijo).some(d => es(p.fijo[d])) || Object.keys(p.semanas).some(k => esObj(p.semanas[k]) && Object.keys(p.semanas[k]).some(d => es(p.semanas[k][d])));
  };
  // Rutina borrada: sus items pasan a null (tombstone) en fijo y excepciones.
  function limpiarRutinaBorrada(plan, rutinaId) {
    const p = norm(plan);
    const limpiar = m => { if (!esObj(m)) return; Object.keys(m).forEach(u => { if (esItem(m[u]) && m[u].tipo === 'rutina' && m[u].id === rutinaId) m[u] = null; }); };
    Object.keys(p.fijo).forEach(d => limpiar(p.fijo[d]));
    Object.keys(p.semanas).forEach(k => { if (esObj(p.semanas[k])) Object.keys(p.semanas[k]).forEach(d => limpiar(p.semanas[k][d])); });
    return p;
  }

  // ── Registro de actividades hechas (S.actividadesHechas = {uid: entrada|null}) ──
  // Escala 1-10 entera → número, o null si no vale (el UI valida con esto; también se usará en el detalle de la sesión de gimnasio).
  const escala10 = v => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 10 ? n : null; };
  const esClave = c => ACTIVIDADES.some(a => a.clave === c);
  const regNorm = r => (esObj(r) ? clone(r) : {});
  // Marca hecha con un toque. Devuelve { registro, uid } (uid determinístico por fecha+clave+franja: dos toques o dos dispositivos no duplican).
  function marcarActividad(registro, { fecha, clave, franja }) {
    if (!esClave(clave)) throw new Error('actividad inválida: ' + clave);
    parse(fecha);
    const r = regNorm(registro), f = franjaOk(franja), uid = 'ah' + fecha + clave + f;
    r[uid] = { ...(esObj(r[uid]) ? r[uid] : {}), fecha, clave, franja: f };
    return { registro: r, uid };
  }
  // Desmarca (tombstone: null; la clave no se borra).
  function desmarcarActividad(registro, uid) {
    const r = regNorm(registro);
    if (has(r, uid)) r[uid] = null;
    return r;
  }
  // Detalle opcional: duracionMin (1-1440), intensidad / concentracion (1-10 enteros), proposito (texto, máx 500).
  // undefined = no tocar; null = limpiar; valor inválido = se ignora (no se guarda).
  function detalleActividad(registro, uid, detalle) {
    const r = regNorm(registro);
    if (!esObj(r[uid])) return r;
    const e = r[uid], d = detalle || {};
    const num = (v, ok) => (ok(v) ? v : undefined);
    const set = (k, v) => { if (v === null) e[k] = null; else if (v !== undefined) e[k] = v; };
    if (has(d, 'duracionMin')) set('duracionMin', d.duracionMin === null ? null : num(Number(d.duracionMin), n => Number.isFinite(n) && n >= 1 && n <= 1440));
    if (has(d, 'intensidad')) set('intensidad', d.intensidad === null ? null : (escala10(d.intensidad) ?? undefined));
    if (has(d, 'concentracion')) set('concentracion', d.concentracion === null ? null : (escala10(d.concentracion) ?? undefined));
    if (has(d, 'proposito')) set('proposito', d.proposito === null ? null : (typeof d.proposito === 'string' ? d.proposito.trim().slice(0, 500) : undefined));
    return r;
  }
  // Claves de actividades hechas esa fecha (Set) — se pasa como `hechas` a pendienteDe: f => hechasDe(S.actividadesHechas, f).
  function hechasDe(registro, fecha) {
    const s = new Set();
    if (esObj(registro)) Object.keys(registro).forEach(u => { const e = registro[u]; if (esObj(e) && e.fecha === fecha && e.clave) s.add(e.clave); });
    return s;
  }

  // ── Edición del plan por borrador (UI "Editar plan") ──
  // Plan BASE de una semana (fijo + excepciones, SIN corridas): es sobre lo que opera "Editar plan".
  const planBaseDeSemana = (plan, semanaKey) => { const p = norm(plan), l = lunesDeSemana(semanaKey); return DIAS.map(d => baseDelDia(p, sumarDias(l, +d))); };
  // Item nuevo para un borrador (con uid): { uid, o, franja, tipo, id|clave }.
  const nuevoItem = (base, franja) => crearItem({ ...base, franja }, null, 0);
  // Diferencias entre dos semanas (7 listas de items con uid) → acciones para cambiarPermanente/cambiarSoloSemana.
  function accionesDeDiff(orig, draft) {
    const loc = sem => { const m = {}; sem.forEach((l, d) => (l || []).forEach(i => { m[i.uid] = { dia: d, item: i }; })); return m; };
    const o = loc(orig), n = loc(draft), out = [];
    Object.keys(o).forEach(u => { if (!n[u]) out.push({ op: 'quitar', dia: o[u].dia, uid: u }); });
    Object.keys(n).forEach(u => { if (o[u] && o[u].dia !== n[u].dia) out.push({ op: 'mover', uid: u, de: o[u].dia, a: n[u].dia }); });
    Object.keys(n).forEach(u => {
      const it = n[u].item;
      if (!o[u]) out.push({ op: 'agregar', dia: n[u].dia, uid: u, item: it.tipo === 'rutina' ? { tipo: 'rutina', id: it.id, franja: it.franja } : { tipo: 'actividad', clave: it.clave, franja: it.franja } });
      else if (franjaOk(o[u].item.franja) !== franjaOk(it.franja)) out.push({ op: 'franja', dia: n[u].dia, uid: u, franja: it.franja });
    });
    return out;
  }
  // modo 'siempre' (plan fijo) | 'semana' (solo esa semana).
  function aplicarAcciones(plan, modo, semanaKey, acciones) {
    let p = norm(plan);
    (acciones || []).forEach(a => { p = modo === 'semana' ? cambiarSoloSemana(p, semanaKey, a) : cambiarPermanente(p, a, semanaKey); });
    return p;
  }

  return { vacio, norm, ACTIVIDADES, FRANJAS, nombreActividad, semanaISO, lunesDeSemana, diaDeSemana, fechaLocal, sumarDias, fechaDeDia,
           planDeSemana, itemsDelDia, rutinasDelDia, desfase, sesiones, pendienteDe, aplicarCorrida, resolverSeguir, resetear,
           cambiarPermanente, cambiarSoloSemana, descansarSemana, usaRutina, limpiarRutinaBorrada, mismoItem,
           marcarActividad, desmarcarActividad, detalleActividad, hechasDe, escala10,
           planBaseDeSemana, nuevoItem, accionesDeDiff, aplicarAcciones };
})();

if (typeof window !== 'undefined') window.PlanEntreno = PlanEntreno;
if (typeof module !== 'undefined' && module.exports) module.exports = PlanEntreno;
