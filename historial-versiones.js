'use strict';
// ════════════════════════════════════════════════════════════════════════
// HISTORIAL Y RESTAURAR — pantalla para elegir una versión anterior de los datos por fecha/hora y recuperarla,
// sin consola. Lee el índice liviano appdata/snapidx (lo mantienen _saveSnap y _maybeBackup en app.js) y recién
// al tocar una versión baja ese documento y lo compara contra lo que hay ahora.
//   snapidx = { items: [{ id: 'snap_<ms>' | 'bak_<fecha>', t: ms, dev: dispositivo, n: cantidad de datos }], rebuilt?: true }
// Dos acciones, ambas con confirmación y con una copia previa de lo actual (snap_<ahora>, dev 'antes de restaurar'):
//   "Recuperar lo que falta" → _merge3(undefined, versión, actual): lo actual + lo que la versión tenía y hoy no está.
//   "Volver a esta versión"  → reemplazo exacto (igual que restaurarSnap).
// API: CMHistorial.open() / .close() / .indice()  (indice() la usa _saveSnap para la retención).
// ════════════════════════════════════════════════════════════════════════
window.CMHistorial = (() => {
  const esc = s => (typeof escHtml === 'function' ? escHtml(s) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
  const p2 = n => String(n).padStart(2, '0');
  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const diaCorto = ts => { const d = new Date(ts); return DIAS[d.getDay()] + ' ' + p2(d.getDate()) + '/' + p2(d.getMonth() + 1); };
  const horaDe = ts => { const d = new Date(ts); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
  const fmtD = iso => (/^\d{4}-\d{2}-\d{2}/.test(iso || '') ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
  const arr = v => (Array.isArray(v) ? v : []);
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const col = () => _db.collection('appdata');
  const FV = () => firebase.firestore.FieldValue;
  const metrica = st => { try { return _dataMetric(st); } catch (e) { return 0; } };

  // ── Índice ────────────────────────────────────────────────────────────
  // Si el índice nunca se armó por completo (no existe, o solo tiene lo escrito desde que existe), se reconstruye UNA vez
  // leyendo los snap_/bak_ que haya y se deja marcado; después alcanza con leer ese documento chico.
  async function indice() {
    const ref = col().doc('snapidx');
    const d = await ref.get();
    const data = d.exists ? (d.data() || {}) : {};
    const items = arr(data.items).filter(i => i && i.id);
    if (data.rebuilt === true) return items;
    const docId = firebase.firestore.FieldPath.documentId();
    const tengo = new Set(items.map(i => i.id));
    const nuevos = [];
    for (const [pre, fin] of [['snap_', 'snap`'], ['bak_', 'bak`']]) {
      const q = await col().where(docId, '>=', pre).where(docId, '<', fin).get();
      q.docs.forEach(x => {
        if (!x.id.startsWith(pre) || tengo.has(x.id)) return;
        const v = x.data() || {};
        const t = pre === 'snap_' ? (parseInt(x.id.slice(5)) || v.savedAt || 0) : (v.savedAt || Date.parse(x.id.slice(4) + 'T12:00:00') || 0);
        let n = 0; try { n = metrica(JSON.parse(v.state)); } catch (e) {}
        nuevos.push({ id: x.id, t, dev: v._dev || '', n });
      });
    }
    const upd = { rebuilt: true };
    if (nuevos.length) upd.items = FV().arrayUnion(...nuevos);
    await ref.set(upd, { merge: true });
    return items.concat(nuevos);
  }

  // ── Comparación (qué cambia entre una versión vieja y lo de ahora) ──────
  const montoFmt = m => (typeof m === 'number' ? '$' + m.toLocaleString('es-AR') : '');
  const aplanarProyectos = (nodos, tab, out) => {
    arr(nodos).forEach(n => { if (!n || typeof n !== 'object') return; out.push({ k: tab + '|' + n.id, l: n.label }); aplanarProyectos(n.children, tab, out); });
    return out;
  };
  // Cada sección: nombre en lenguaje del usuario, claves de primer nivel que cubre y cómo sacar sus ítems (k = clave estable).
  const SECCIONES = [
    { nombre: 'Tareas', claves: ['goals'], ext: st => {
      const o = []; const g = obj(st.goals);
      Object.keys(g).forEach(f => arr(g[f]).forEach(x => o.push({ k: f + '|' + (x && x.id != null ? x.id : x && x.text), l: x && x.text, f })));
      return o; } },
    { nombre: 'Movimientos', claves: ['transactions'], ext: st => arr(st.transactions).map(t => ({ k: t && t.id, l: t && t.name, f: t && t.date, x: montoFmt(t && t.amount) })) },
    { nombre: 'Notas', claves: ['notas'], ext: st => arr(st.notas).map(n => ({ k: n && n.id, l: n && (n.titulo || n.texto), f: n && n.fecha })) },
    { nombre: 'Principios', claves: ['principios'], ext: st => arr(obj(st.principios).principios).map(p => ({ k: p && p.id, l: p && p.enunciado })) },
    { nombre: 'Libros', claves: ['libros'], ext: st => arr(obj(st.libros).items).map(b => ({ k: b && b.id, l: b && b.titulo })) },
    { nombre: 'Ideas, frases y cosas por aplicar de libros', claves: [], ext: st => {
      const o = [];
      arr(obj(st.libros).items).forEach(b => ['notas', 'frases', 'aplicar'].forEach(p => arr(b && b[p]).forEach(x => o.push({ k: (b && b.id) + '|' + p + '|' + (x && x.id), l: x && (x.titulo || x.texto), f: x && x.fecha }))));
      return o; } },
    { nombre: 'Objetivos trimestrales', claves: ['quarterlyObjectives'], ext: st => {
      const o = [];
      arr(obj(st.quarterlyObjectives).periods).forEach(p => arr(p && p.objectives).forEach(x => o.push({ k: (p && p.id) + '|' + (x && x.id), l: x && x.text })));
      return o; } },
    { nombre: 'Proyectos', claves: ['proyectos'], ext: st => {
      const o = []; const pr = obj(st.proyectos);
      Object.keys(pr).forEach(tab => aplanarProyectos(pr[tab], tab, o));
      return o; } },
    { nombre: 'Días de hábitos', claves: ['habitTrackers'], ext: st => {
      const o = []; const ht = obj(st.habitTrackers);
      Object.keys(ht).forEach(tab => arr(ht[tab]).forEach(h => Object.keys(obj(h && h.days)).forEach(dia => o.push({ k: tab + '|' + (h && h.id) + '|' + dia, l: h && h.name, f: dia }))));
      return o; } },
  ];
  // Nombres de las demás secciones (las que solo se avisan como "cambió").
  const NOMBRE = {
    routineLog: 'Historial de rutinas', workoutLog: 'Registro de entrenamientos', activeRtnSession: 'Sesión de gimnasio en curso',
    routines: 'Rutinas', exerciseHistory: 'Historial de ejercicios', exerciseLibrary: 'Biblioteca de ejercicios',
    accounts: 'Cuentas', tomorrowGoals: 'Tareas de mañana', sleepLog: 'Sueño', bodyWeight: 'Peso', nwHistory: 'Patrimonio',
    subscriptions: 'Suscripciones', wishlist: 'Objetivos de compra', budgets: 'Presupuesto', negocios: 'Negocios', radar: 'Radar',
    pomodoroHistory: 'Pomodoros', finObjectives: 'Objetivos de ahorro', studyCalendar: 'Calendario de estudio',
  };

  function detalle(items) {
    const sh = items.slice(0, 3).map(i => {
      const meta = [i.x, i.f ? fmtD(i.f) : ''].filter(Boolean).join(', ');
      const l = String(i.l == null ? '' : i.l); const corto = l.length > 40 ? l.slice(0, 40) + '…' : l;
      return "'" + corto + "'" + (meta ? ' (' + meta + ')' : '');
    });
    if (items.length <= 3) return sh.join(', ');
    const fs = items.map(i => fmtD(i.f)).filter(Boolean).sort();
    if (!fs.length) return '';
    return fs[0] === fs[fs.length - 1] ? fs[0] : 'del ' + fs[0] + ' al ' + fs[fs.length - 1];
  }

  // Devuelve { lineas: [{ txt, tipo: 'falta'|'extra'|'otro' }], hayFalta, igual }.
  function comparar(vieja, actual) {
    const lineas = []; let hayFalta = false;
    const cubiertas = new Set();
    SECCIONES.forEach(s => {
      s.claves.forEach(c => cubiertas.add(c));
      const a = new Map(), b = new Map();
      s.ext(actual).forEach(i => { if (i.k != null) a.set(String(i.k), i); });
      s.ext(vieja).forEach(i => { if (i.k != null) b.set(String(i.k), i); });
      const faltan = [...b].filter(([k]) => !a.has(k)).map(([, i]) => i);
      const sobran = [...a].filter(([k]) => !b.has(k)).map(([, i]) => i);
      if (faltan.length) {
        hayFalta = true;
        const d = detalle(faltan);
        lineas.push({ tipo: 'falta', txt: s.nombre + ': ' + faltan.length + (faltan.length === 1 ? ' que hoy no está' : ' que hoy no están') + (d ? ' (' + d + ')' : '') });
      }
      if (sobran.length) {
        const d = detalle(sobran);
        lineas.push({ tipo: 'extra', txt: s.nombre + ': esa versión no tiene ' + sobran.length + ' que cargaste después' + (d ? ' (' + d + ')' : '') });
      }
      if (!faltan.length && !sobran.length && s.claves.some(c => JSON.stringify(vieja[c]) !== JSON.stringify(actual[c]))) {
        lineas.push({ tipo: 'otro', txt: s.nombre + ': algunos datos son distintos' });
      }
    });
    const otras = [];
    new Set([...Object.keys(vieja), ...Object.keys(actual)]).forEach(k => {
      if (k.charAt(0) === '_' || cubiertas.has(k)) return;
      if (JSON.stringify(vieja[k]) !== JSON.stringify(actual[k])) otras.push(k);
    });
    const conNombre = otras.filter(k => NOMBRE[k]).map(k => NOMBRE[k]);
    conNombre.forEach(n => lineas.push({ tipo: 'otro', txt: n + ': cambió' }));
    if (otras.length > conNombre.length) lineas.push({ tipo: 'otro', txt: 'Otros datos: cambiaron' });
    return { lineas, hayFalta, igual: lineas.length === 0 };
  }

  // ── Panel ──────────────────────────────────────────────────────────────
  let ov = null, body = null, previo = null;
  const rotulo = e => diaCorto(e.t) + ' · ' + horaDe(e.t) + (e.dev && e.dev !== 'antes de restaurar' ? ' · ' + e.dev : '');
  const tipoDe = e => (String(e.id).startsWith('bak_') ? 'copia diaria' : e.dev === 'antes de restaurar' ? 'antes de restaurar' : 'guardado');
  // Cantidad de registros (tareas, movimientos, días de hábitos…): una versión con muchos menos que las vecinas delata una pisada.
  const regs = n => (Number(n) === 1 ? '1 registro' : Number(n || 0).toLocaleString('es-AR') + ' registros');
  const errAmable = () => '<p class="sdiag-muted">No se pudo leer el historial. Revisá la conexión y probá de nuevo.</p>';

  async function pintarLista() {
    body.innerHTML = '<p class="sdiag-muted">Cargando versiones…</p>';
    let items;
    try { items = await indice(); } catch (e) { console.warn('[historial]', e.code || e.message); body.innerHTML = errAmable(); return; }
    items = items.filter(i => i && i.t).sort((a, b) => b.t - a.t);
    let html = '<p class="sdiag-intro">Elegí una fecha para ver qué tenías en ese momento y recuperarlo. Antes de cambiar nada se guarda una copia de lo que tenés ahora, así siempre se puede deshacer.</p>' +
      '<h3 class="sdiag-h">Ahora</h3><ul class="sdiag-list"><li class="sdiag-item hv-ahora"><div class="sdiag-row"><span class="sdiag-what">Ahora</span><span class="hv-tag">lo que tenés en pantalla</span></div>' +
      '<div class="sdiag-sub">' + esc(regs(metrica(S))) + '</div></li></ul>';
    if (!items.length) html += '<p class="sdiag-muted">Todavía no hay versiones anteriores guardadas.</p>';
    let dia = '';
    items.forEach(e => {
      const dk = new Date(e.t).toDateString();
      if (dk !== dia) { if (dia) html += '</ul>'; dia = dk; html += '<h3 class="sdiag-h">' + esc(diaCorto(e.t)) + '</h3><ul class="sdiag-list">'; }
      html += '<li><button type="button" class="sdiag-item hv-item" data-id="' + esc(e.id) + '"><span class="sdiag-what">' + esc(rotulo(e)) + '</span><span class="hv-tag">' + esc(tipoDe(e)) + '</span>' + (e.n != null ? '<span class="sdiag-sub hv-regs">' + esc(regs(e.n)) + '</span>' : '') + '</button></li>';
    });
    if (dia) html += '</ul>';
    body.innerHTML = html;
    body.querySelectorAll('.hv-item').forEach(b => b.addEventListener('click', () => {
      const e = items.find(x => x.id === b.dataset.id); if (e) pintarDetalle(e);
    }));
  }

  async function pintarDetalle(e) {
    body.innerHTML = '<p class="sdiag-muted">Abriendo esa versión…</p>';
    let ver = null, raw = null;
    try {
      const d = await col().doc(e.id).get();
      raw = d.exists && d.data() ? d.data().state : null;
      ver = raw ? JSON.parse(raw) : null;
    } catch (err) { console.warn('[historial]', err.code || err.message); body.innerHTML = errAmable() + '<button type="button" class="sdiag-btn sdiag-btn-sec hv-back">← Volver a la lista</button>'; body.querySelector('.hv-back').addEventListener('click', pintarLista); return; }
    if (!ver) {
      try { await col().doc('snapidx').set({ items: FV().arrayRemove(e) }, { merge: true }); } catch (x) {}
      body.innerHTML = '<p class="sdiag-muted">Esa versión ya no está disponible.</p><button type="button" class="sdiag-btn sdiag-btn-sec hv-back">← Volver a la lista</button>';
      body.querySelector('.hv-back').addEventListener('click', pintarLista);
      return;
    }
    const actual = JSON.parse(JSON.stringify(S));
    const cmp = comparar(ver, actual);
    const cuando = rotulo(e);
    body.innerHTML =
      '<button type="button" class="sdiag-btn sdiag-btn-sec hv-back">← Volver a la lista</button>' +
      '<h3 class="sdiag-h">Versión del ' + esc(cuando) + ' · ' + esc(tipoDe(e)) + '</h3>' +
      '<p class="sdiag-sub">Comparada con lo que tenés ahora:</p>' +
      (cmp.igual ? '<p class="hv-igual">Esta versión es igual a lo que tenés ahora.</p>'
        : '<ul class="sdiag-list hv-cambios">' + cmp.lineas.map(l => '<li class="sdiag-item hv-l-' + l.tipo + '">' + esc(l.txt) + '</li>').join('') + '</ul>') +
      '<div class="hv-acciones sdiag-actions">' +
        '<button type="button" class="sdiag-btn hv-falta"' + (cmp.igual ? ' disabled' : '') + '>Recuperar lo que falta</button>' +
        '<button type="button" class="sdiag-btn sdiag-btn-sec hv-volver"' + (cmp.igual ? ' disabled' : '') + '>Volver a esta versión</button>' +
      '</div>' +
      '<div class="hv-confirmar" hidden></div><div class="sdiag-msg hv-msg" role="status" aria-live="polite"></div>';
    body.querySelector('.hv-back').addEventListener('click', pintarLista);
    const caja = body.querySelector('.hv-confirmar'), acc = body.querySelector('.hv-acciones'), msg = body.querySelector('.hv-msg');
    const pedir = (modo, texto, si) => {
      acc.hidden = true; caja.hidden = false;
      caja.innerHTML = '<p class="hv-texto">' + esc(texto) + '</p><div class="sdiag-actions"><button type="button" class="sdiag-btn hv-si">' + esc(si) + '</button><button type="button" class="sdiag-btn sdiag-btn-sec hv-no">Cancelar</button></div>';
      caja.querySelector('.hv-no').addEventListener('click', () => { caja.hidden = true; acc.hidden = false; });
      caja.querySelector('.hv-si').addEventListener('click', async ev => {
        ev.currentTarget.disabled = true; msg.textContent = 'Guardando una copia de lo de ahora…';
        try { await aplicar(modo, ver, raw, cuando); } catch (err) {
          console.warn('[historial]', err.code || err.message);
          msg.textContent = 'No se pudo recuperar (no se tocó nada). Probá de nuevo.'; caja.hidden = true; acc.hidden = false;
        }
      });
    };
    body.querySelector('.hv-falta').addEventListener('click', () => pedir('falta',
      'Vas a sumar a lo que tenés ahora todo lo que esa versión tenía y hoy no está. No se borra nada de lo nuevo. Antes de hacerlo guardamos una copia de lo de ahora, por si querés deshacerlo.',
      'Sí, recuperar lo que falta'));
    body.querySelector('.hv-volver').addEventListener('click', () => pedir('volver',
      'Tus datos van a quedar exactamente como estaban el ' + cuando + '. Todo lo que cargaste después deja de estar (queda una copia de lo de ahora para poder deshacerlo). ¿Seguro?',
      'Sí, volver a esta versión'));
  }

  // Guarda una copia de lo actual y recién después aplica. Si la copia falla, no se toca nada.
  async function aplicar(modo, ver, raw, cuando) {
    const t = Date.now(), id = 'snap_' + t;
    const actualStr = JSON.stringify(S);
    await col().doc(id).set({ state: actualStr, savedAt: t, _dev: 'antes de restaurar' });
    await col().doc('snapidx').set({ items: FV().arrayUnion({ id, t, dev: 'antes de restaurar', n: metrica(S) }) }, { merge: true });
    const nuevo = modo === 'falta' ? JSON.stringify(_merge3(undefined, ver, JSON.parse(actualStr))) : raw;
    _forceSaveOnce = true;
    _applyRemoteState(nuevo, Date.now());
    saveState();
    cerrar();
    if (typeof showToast === 'function') showToast(modo === 'falta' ? 'Listo: recuperé lo que faltaba de la versión del ' + cuando + '.' : 'Listo: tus datos quedaron como el ' + cuando + '.', 8000);
  }

  function construir() {
    ov = document.createElement('div');
    ov.id = 'hv-overlay'; ov.className = 'sdiag-ov';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Historial y restaurar');
    ov.innerHTML =
      '<div class="sdiag-panel"><div class="sdiag-head"><h2 class="sdiag-title">Historial y restaurar</h2><button type="button" class="sdiag-x" aria-label="Cerrar">✕</button></div><div class="hv-body"></div></div>';
    document.body.appendChild(ov);
    body = ov.querySelector('.hv-body');
    ov.addEventListener('click', e => { if (e.target === ov) cerrar(); });
    ov.querySelector('.sdiag-x').addEventListener('click', cerrar);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('open')) cerrar(); });
  }

  function abrir() {
    try {
      if (!ov) construir();
      previo = document.activeElement;
      const tp = document.getElementById('theme-panel'); if (tp) tp.classList.remove('open');
      ov.classList.add('open');
      const sc = ov.querySelector('.sdiag-panel'); if (sc) sc.scrollTop = 0;
      ov.querySelector('.sdiag-x').focus();
      pintarLista();
    } catch (e) { console.warn('[historial]', e); }
  }
  function cerrar() {
    if (!ov) return;
    ov.classList.remove('open');
    try { if (previo && previo.focus) previo.focus(); } catch (e) {}
  }

  return { open: abrir, close: cerrar, indice, comparar };
})();
