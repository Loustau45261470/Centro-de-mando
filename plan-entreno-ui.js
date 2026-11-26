'use strict';
// ════════════════════════════════════════════════════════════════════════
// PLAN-ENTRENO-UI — pantalla inicial "Plan semanal" del overlay de Entrenamiento (etapa 2 del rediseño).
// Lógica del plan: plan-entreno.js (PlanEntreno, pura). Acá solo se arma el HTML y se conectan los botones.
// Datos: S.planEntreno (plan), S.actividadesHechas (registro), S.routines / S.routineLog (rutinas, existentes).
// renderRutinas() (rutinas.js) llama PlanUI.html(...) para la pestaña "Plan" y PlanUI.post() tras pintar.
// Scripts clásicos: se carga después de rutinas.js.
// ════════════════════════════════════════════════════════════════════════
const PlanUI = (() => {
  const P = () => window.PlanEntreno;
  const DIAS_N = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const DIAS_L = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const FR_N = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche', extra: 'Fuera del plan' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Estado de la pantalla (no se guarda en S: es solo vista)
  let sel = null;            // fecha seleccionada en el carrusel
  let modo = 'home';         // 'home' | 'editar'
  let orig = null, draft = null, eligiendo = false;   // borrador de "Editar plan"
  let addDia = 0, addItem = '', addFranja = 'manana';
  let menuRid = null;        // rutina con el menú ⋯ abierto (uid de ítem)
  let menuPlan = false;      // menú ⋯ del plan (Resetear / Descansar)
  let detalleUid = null;     // actividad hecha con el detalle abierto
  let animar = true;         // la próxima pintura descifra los números
  let flashUid = null;       // casilla de actividad recién tildada: la próxima pintura la enciende (destello)

  const hoy = () => getActiveDate();
  const plan = () => { if (!S.planEntreno) S.planEntreno = P().vacio(); return S.planEntreno; };
  const registro = () => { if (!S.actividadesHechas) S.actividadesHechas = {}; return S.actividadesHechas; };
  const rutina = id => (S.routines || []).find(r => r.id === id);
  const hechasFn = f => P().hechasDe(S.actividadesHechas, f);
  const nombreItem = it => it.tipo === 'rutina' ? (rutina(it.id) ? rutina(it.id).name : '(rutina borrada)') : (P().nombreActividad(it.clave) || it.clave);
  const claveHecha = (f, it) => 'ah' + f + it.clave + (it.franja || 'manana');

  // ── Datos derivados ──
  function sesionDe(rid, f) { const h = (S.routineLog && S.routineLog[rid]) || []; for (let i = h.length - 1; i >= 0; i--) if (h[i].date === f) return h[i]; return null; }
  // Sesiones registradas ese día de rutinas que NO estaban en el plan de ese día ("extra"): se muestran y cuentan igual.
  // Una rutina planeada otro día y hecha hoy es extra hoy; el día planeado sigue sin hacer (no se reasigna).
  function extrasDe(f) {
    const planeadas = P().itemsDelDia(plan(), f).filter(it => it.tipo === 'rutina').map(it => it.id);
    return (S.routines || []).filter(r => !planeadas.includes(r.id) && sesionDe(r.id, f)).map(r => ({ tipo: 'rutina', id: r.id, uid: 'extra-' + r.id, franja: 'extra', extra: true }));
  }
  const itemsConExtras = f => P().itemsDelDia(plan(), f).concat(extrasDe(f));
  function minTipicos(rid) {
    // Mediana (no promedio): una sesión que quedó abierta días (2687 min) no debe inflar el "~min" típico.
    const h = ((S.routineLog && S.routineLog[rid]) || []).filter(e => e.duration > 0).slice(-5).map(e => e.duration).sort((a, b) => a - b);
    if (!h.length) return null;
    const m = h.length % 2 ? h[(h.length - 1) / 2] : (h[h.length / 2 - 1] + h[h.length / 2]) / 2;
    return Math.max(1, Math.round(m / 60));
  }
  function hechoItem(it, f) {
    if (it.tipo === 'rutina') return sesionDe(it.id, f);
    const e = registro()[claveHecha(f, it)];
    return e && typeof e === 'object' ? e : null;
  }
  const hayPlan = () => Object.values(plan().fijo || {}).some(m => m && typeof m === 'object' && Object.values(m).some(i => i && i.tipo))
    || Object.values(plan().semanas || {}).some(ex => ex && Object.keys(ex).some(d => ex[d] && typeof ex[d] === 'object' && Object.values(ex[d]).some(i => i && i.tipo)));
  const semanaKey = () => P().semanaISO(hoy());
  const fechasSemana = () => { const l = P().lunesDeSemana(semanaKey()); return [0, 1, 2, 3, 4, 5, 6].map(d => P().sumarDias(l, d)); };

  // ── HTML ──
  function iconoItem(it) {
    if (it.tipo === 'rutina') { const r = rutina(it.id); return esc(r ? r.icon : '🏋️'); }
    return '<b>' + esc((P().nombreActividad(it.clave) || '?').charAt(0)) + '</b>';
  }
  function stripHtml(fechas) {
    const h = hoy();
    return '<div class="pe-strip" role="tablist">' + fechas.map((f, i) => {
      const items = itemsConExtras(f);
      const hechos = items.filter(it => hechoItem(it, f)).length;
      const ok = items.length > 0 && hechos === items.length;
      const ic = items.slice(0, 2).map(iconoItem).join('') + (items.length > 2 ? '<b>+</b>' : '');
      return `<button type="button" class="pe-s${f === h ? ' pe-hoy' : ''}${f === sel ? ' pe-sel' : ''}${ok ? ' pe-ok' : ''}" data-i="${i}" onclick="PlanUI.ir(${i})" aria-label="${DIAS_N[i]} ${f.slice(8)}${ok ? ' (hecho)' : ''}">
        <i>${DIAS_L[i]}</i><span class="pe-s-ic">${ic || '·'}</span><em>${ok ? '✓' : (hechos ? '•' : '')}</em></button>`;
    }).join('') + '</div>';
  }
  // c = día con 2+ ítems (se entrena dos veces por día): fila compacta, sin lista de ejercicios y con EMPEZAR al costado.
  function itemRutinaHtml(it, f, c) {
    const r = rutina(it.id), done = hechoItem(it, f), n = r ? r.exercises.length : 0;
    if (!r) return `<div class="pe-it"><div class="pe-it-h"><span class="pe-ico">?</span><div class="pe-it-t"><b>${esc(nombreItem(it))}</b></div></div></div>`;
    const min = minTipicos(it.id);
    const exs = r.exercises.slice(0, 3).map(e => `<li>${esc(exDisplay(e).name)}</li>`).join('') + (n > 3 ? `<li class="pe-mas">+${n - 3} más</li>` : '');
    const menu = menuRid === it.uid ? `<div class="pe-menu" role="menu">
        <button type="button" onclick="openEditRoutine('${r.id}')">Editar rutina</button>
        <button type="button" onclick="openExPicker('add','${r.id}')">+ Ejercicio</button>
        <button type="button" onclick="PlanUI.reordenar('${r.id}')">Reordenar / ejercicios</button>
        <button type="button" class="pe-del" data-hold="${r.id}" onpointerdown="PlanUI.holdIni(this)" onpointerup="PlanUI.holdFin(this)" onpointerleave="PlanUI.holdFin(this)" onpointercancel="PlanUI.holdFin(this)" oncontextmenu="return false"><span class="pe-hold-fill"></span><span class="pe-hold-txt">Borrar (mantener apretado)</span></button>
      </div>` : '';
    const hecho = done ? `<span class="pe-done">✓ Hecho · <span class="pe-num">${Math.round((done.duration || 0) / 60)}</span> min · <span class="pe-num">${done.sets || 0}</span> series</span>` : '';
    const go = `<button type="button" class="pe-go${done ? ' pe-go-2' : ''}" onclick="PlanUI.empezar('${r.id}')">${done ? 'REPETIR' : 'EMPEZAR'}</button>`;
    const sub = `<span class="pe-num">${n}</span> ejercicios${min ? ` · ~<span class="pe-num">${min}</span> min` : ''}`;
    const dots = `<button type="button" class="pe-dots" aria-label="Más opciones de ${esc(r.name)}" onclick="PlanUI.menu('${esc(it.uid)}')">⋯</button>`;
    if (c) return `<div class="pe-it pe-rut pe-c${done ? ' pe-hecho' : ''}" data-uid="${esc(it.uid)}">
      <div class="pe-it-h"><span class="pe-ico">${esc(r.icon)}</span>
        <div class="pe-it-t"><b>${esc(r.name)}</b><small>${done ? hecho : sub}</small></div>${go}${dots}</div>${menu}</div>`;
    return `<div class="pe-it pe-rut${done ? ' pe-hecho' : ''}" data-uid="${esc(it.uid)}">
      <div class="pe-it-h"><span class="pe-ico">${esc(r.icon)}</span>
        <div class="pe-it-t"><b>${esc(r.name)}</b><small>${sub}</small></div>${dots}</div>
      ${menu}
      ${n && !done ? `<ul class="pe-ex">${exs}</ul>` : (n ? '' : '<p class="pe-vacio">Sin ejercicios. Agregá uno desde ⋯.</p>')}
      ${hecho}${go}</div>`;
  }
  function itemActividadHtml(it, f, c) {
    const e = hechoItem(it, f), uid = claveHecha(f, it);
    const grupo = (P().ACTIVIDADES.find(a => a.clave === it.clave) || {}).grupo || '';
    const det = e && detalleUid === uid ? `<div class="pe-det">
        <label>Duración (min)<input id="pe-d-dur" type="number" min="1" max="1440" inputmode="numeric" value="${e.duracionMin || ''}"></label>
        <label>Intensidad (1-10)<input id="pe-d-int" type="number" min="1" max="10" inputmode="numeric" value="${e.intensidad || ''}"></label>
        <label>Concentración (1-10)<input id="pe-d-con" type="number" min="1" max="10" inputmode="numeric" value="${e.concentracion || ''}"></label>
        <label class="pe-det-w">Propósito<input id="pe-d-pro" type="text" maxlength="500" value="${esc(e.proposito || '')}"></label>
        <div class="pe-det-b"><button type="button" class="pe-btn" onclick="PlanUI.detalleCerrar()">Cerrar</button><button type="button" class="pe-btn pe-pri" onclick="PlanUI.detalleGuardar('${uid}')">Guardar</button></div></div>` : '';
    const resumen = e ? [e.duracionMin ? e.duracionMin + ' min' : '', e.intensidad ? 'int ' + e.intensidad : '', e.concentracion ? 'conc ' + e.concentracion : ''].filter(Boolean).join(' · ') : '';
    return `<div class="pe-it pe-act${c ? ' pe-c' : ''}${e ? ' pe-hecho' : ''}" data-uid="${esc(it.uid)}">
      <div class="pe-it-h"><span class="pe-ico">${iconoItem(it)}</span>
        <div class="pe-it-t"><b>${esc(nombreItem(it))}</b><small>${esc(grupo)}${e ? ' · ✓ Hecha' + (resumen ? ' · ' + esc(resumen) : '') : ''}</small></div>
        ${e ? `<button type="button" class="pe-lnk" onclick="PlanUI.detalle('${uid}')">Detalle</button>` : ''}
        ${e ? `<button type="button" class="pe-ck pe-ck-on${flashUid === uid ? ' pe-flash' : ''}" onclick="PlanUI.desmarcar('${uid}')" aria-label="Deshacer hecha"><b></b></button>`
            : `<button type="button" class="pe-ck" onclick="PlanUI.marcar('${f}','${esc(it.uid)}')" aria-label="Marcar ${esc(nombreItem(it))} como hecha"><b></b></button>`}
      </div>${det}</div>`;
  }
  function diaHtml(f, i) {
    const items = itemsConExtras(f), h = hoy(), plan0 = P().itemsDelDia(plan(), f).length;
    const chips = `<small>Entrenar igual:</small><div class="pe-chips">${(S.routines || []).map(r => `<button type="button" class="pe-chip" onclick="PlanUI.empezar('${r.id}')">${esc(r.icon)} ${esc(r.name)}</button>`).join('')}</div>`;
    let cuerpo;
    if (!items.length) {
      cuerpo = `<div class="pe-descanso"><b>Descanso</b>${chips}</div>`;
    } else {
      const c = items.length > 1 || !plan0, lbl = c || items.some(it => it.franja !== 'manana');
      let ult = null;
      cuerpo = items.map(it => {
        const cab = lbl && it.franja !== ult ? `<div class="pe-fr">${FR_N[it.franja]}</div>` : ''; ult = it.franja;
        return cab + (it.tipo === 'rutina' ? itemRutinaHtml(it, f, c) : itemActividadHtml(it, f, c));
      }).join('') + (plan0 ? '' : `<div class="pe-descanso">${chips}</div>`);
    }
    return `<section class="pe-day${items.length > 1 ? ' pe-day-c' : ''}${f === h ? ' pe-day-hoy' : ''}" data-f="${f}" data-i="${i}" aria-label="${DIAS_N[i]}">
      <div class="pe-day-h"><b>${DIAS_N[i]} ${f.slice(8)}</b>${f === h ? '<span class="pe-tag">HOY</span>' : (f < h ? '<span class="pe-tag pe-tag-p">PASADO</span>' : '')}</div>${cuerpo}</section>`;
  }
  // Solo escritorio (CSS la oculta en celu): la semana día por día + resumen rápido. Mismos datos que la tira (itemsDelDia / hechoItem).
  function semanaHtml(fechas) {
    const h = hoy();
    const filas = fechas.map((f, i) => {
      const items = itemsConExtras(f), hechos = items.filter(it => hechoItem(it, f)).length;
      const ok = items.length > 0 && hechos === items.length;
      const txt = items.length ? items.map(it => `<span class="pe-wk-i${hechoItem(it, f) ? ' pe-wk-ok' : ''}">${iconoItem(it)} ${esc(nombreItem(it))}</span>`).join('') : '<span class="pe-wk-rest">Descanso</span>';
      return `<button type="button" class="pe-wk${f === h ? ' pe-hoy' : ''}${f === sel ? ' pe-sel' : ''}${ok ? ' pe-ok' : ''}" data-i="${i}" onclick="PlanUI.ir(${i})" aria-label="Ver ${DIAS_N[i]} ${f.slice(8)}">
        <i>${DIAS_N[i].slice(0, 3)} ${f.slice(8)}</i><span class="pe-wk-t">${txt}</span><em>${items.length ? (ok ? '✓' : `<span class="pe-num">${hechos}</span>/${items.length}`) : ''}</em></button>`;
    }).join('');
    let tot = 0, ok = 0;
    fechas.forEach(f => itemsConExtras(f).forEach(it => { tot++; if (hechoItem(it, f)) ok++; }));
    let racha = 0;
    if (typeof _gymDays === 'function' && typeof _dStr === 'function') {
      const days = _gymDays(), n = new Date(), y = n.getFullYear(), m = n.getMonth(), t = n.getDate();
      for (let i = 0; i < 400; i++) {
        const dd = new Date(y, m, t - i), v = days[_dStr(dd.getFullYear(), dd.getMonth(), dd.getDate())];
        if (v === 'done') racha++; else if (v === 'rest') continue; else if (v === 'missed') break; else { if (i === 0) continue; break; }
      }
    }
    let ult = null;
    (S.routines || []).forEach(r => ((S.routineLog && S.routineLog[r.id]) || []).forEach(e => { if (e.date && (!ult || e.date > ult.date)) ult = { date: e.date, name: r.name }; }));
    const ultTxt = ult ? `${esc(ult.name)} · ${ult.date.slice(8)}/${ult.date.slice(5, 7)}` : 'Sin registros';
    return `<aside class="pe-colR" aria-label="Semana y resumen">
      <section class="pe-panel"><div class="pe-h3">Esta semana</div>${filas}</section>
      <section class="pe-panel"><div class="pe-h3">Resumen rápido</div>
        <div class="pe-kp"><div><span class="pe-num">${ok}</span>/<span class="pe-num">${tot}</span><small>Hechos esta semana</small></div><div><span class="pe-num">${racha}</span><small>Racha de días</small></div></div>
        <div class="pe-ult">Último entreno: <b>${ultTxt}</b></div></section></aside>`;
  }
  function pendienteHtml() {
    const pend = P().pendienteDe(plan(), S.routineLog, hoy(), hechasFn);
    if (!pend) return '';
    return `<div class="pe-pend" role="alert"><span>Te quedó <b>${pend.items.map(it => esc(nombreItem(it))).join(' + ')}</b> de ayer</span>
      <div><button type="button" class="pe-btn pe-pri" onclick="PlanUI.hacerPendiente()">Hacer la pendiente</button><button type="button" class="pe-btn" onclick="PlanUI.seguirPlan()">Seguir con el plan</button></div></div>`;
  }

  function editarHtml() {
    const key = semanaKey(), corrida = P().desfase(plan(), hoy()) > 0;
    const opts = `<optgroup label="Rutinas">${(S.routines || []).map(r => `<option value="r:${r.id}"${addItem === 'r:' + r.id ? ' selected' : ''}>${esc(r.icon)} ${esc(r.name)}</option>`).join('')}</optgroup>
      <optgroup label="Actividades">${P().ACTIVIDADES.map(a => `<option value="a:${a.clave}"${addItem === 'a:' + a.clave ? ' selected' : ''}>${esc(a.nombre)}</option>`).join('')}</optgroup>`;
    const franjaSel = (cur, handler) => `<select aria-label="Franja" onchange="${handler}">${P().FRANJAS.map(fr => `<option value="${fr}"${cur === fr ? ' selected' : ''}>${FR_N[fr]}</option>`).join('')}</select>`;
    const dias = draft.map((lista, d) => `<div class="pe-ed-day"><b>${DIAS_N[d]}</b>${lista.length ? lista.map(it => `<div class="pe-ed-it">
        <span class="pe-ed-n">${iconoItem(it)} ${esc(nombreItem(it))}</span>
        ${franjaSel(it.franja, `PlanUI.edFranja('${esc(it.uid)}',this.value)`)}
        <select aria-label="Mover a otro día" onchange="PlanUI.edMover('${esc(it.uid)}',this.value)"><option value="">Mover a…</option>${DIAS_N.map((n, k) => k === d ? '' : `<option value="${k}">${n}</option>`).join('')}</select>
        <button type="button" class="pe-x" aria-label="Quitar" onclick="PlanUI.edQuitar('${esc(it.uid)}')">✕</button></div>`).join('') : '<small class="pe-vacio">Descanso</small>'}</div>`).join('');
    const modoSel = eligiendo ? `<div class="pe-modo" role="group" aria-label="Cómo aplicar los cambios"><span>¿Cómo aplicar los cambios?</span>
        <button type="button" class="pe-btn pe-pri" onclick="PlanUI.edModo('siempre')">Para siempre</button>
        <button type="button" class="pe-btn pe-pri" onclick="PlanUI.edModo('semana')">Solo esta semana</button>
        <button type="button" class="pe-btn" onclick="PlanUI.edVolver()">Volver</button></div>` : '';
    return `<div class="pe-edit"><div class="pe-edit-h"><b>Editar plan</b><small>${esc(key)}</small></div>
      ${corrida ? '<p class="pe-note">Hay una corrida activa: acá se edita el plan sin correr.</p>' : ''}
      <div class="pe-add"><select aria-label="Día" onchange="PlanUI.edSet('dia',this.value)">${DIAS_N.map((n, k) => `<option value="${k}"${addDia === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <select aria-label="Rutina o actividad" onchange="PlanUI.edSet('item',this.value)">${opts}</select>
        ${franjaSel(addFranja, "PlanUI.edSet('franja',this.value)")}
        <button type="button" class="pe-btn pe-pri" onclick="PlanUI.edAgregar()">Agregar</button></div>
      <div class="pe-ed-list">${dias}</div>${modoSel}
      <div class="pe-ed-foot"><button type="button" class="pe-btn" onclick="PlanUI.edCancelar()">Cancelar</button><button type="button" class="pe-btn pe-pri" onclick="PlanUI.edGuardar()">Guardar</button></div></div>`;
  }

  // acc = HTML del acordeón "Mis rutinas" (viene de rutinas.js); cards = las tarjetas viejas sueltas (para "sin plan").
  function html(acc, cards) {
    if (modo === 'editar' && draft) return editarHtml();
    const h = hoy(), fechas = fechasSemana();
    if (!sel || !fechas.includes(sel)) sel = h;
    if (!hayPlan()) {
      return `<div class="pe-sinplan"><p>Todavía no armaste tu plan semanal.</p>
        <button type="button" class="pe-go" onclick="PlanUI.editar()">Armar mi plan</button></div>
        <div class="pe-sinplan-l"><div class="pe-h2">Tus rutinas <button type="button" class="pe-btn" onclick="openModal('modal-add-routine')">+ Nueva</button></div>${cards}</div>`;
    }
    return `<div class="pe-home">${pendienteHtml()}${stripHtml(fechas)}
      <div class="pe-cols"><div class="pe-colL">
      <div class="pe-car" id="pe-car">${fechas.map(diaHtml).join('')}</div>
      <div class="pe-acts"><button type="button" class="pe-btn pe-pri" onclick="PlanUI.editar()">Editar plan</button>
        <button type="button" class="pe-btn" onclick="openModal('modal-add-routine')">+ Nueva rutina</button>
        <button type="button" class="pe-btn pe-dots2" aria-label="Más opciones del plan" onclick="PlanUI.menuDelPlan()">⋯</button></div>
      ${menuPlan ? `<div class="pe-menu pe-menu-plan" role="menu"><button type="button" onclick="PlanUI.descansar()">Descansar esta semana</button><button type="button" onclick="PlanUI.resetear()">Resetear</button></div>` : ''}
      </div>${semanaHtml(fechas)}</div>
      ${acc}</div>`;
  }

  // Después de pintar: abre el carrusel en el día seleccionado, sincroniza la tira al deslizar, descifra los números.
  function post() {
    const car = document.getElementById('pe-car');
    if (car) {
      const idx = Math.max(0, fechasSemana().indexOf(sel));
      let tries = 0;
      const go = () => { if (car.clientWidth) car.scrollLeft = idx * car.clientWidth; else if (tries++ < 30) requestAnimationFrame(go); };
      go();
      let tid = null;
      car.addEventListener('scroll', () => {
        clearTimeout(tid);
        tid = setTimeout(() => {
          const i = Math.round(car.scrollLeft / Math.max(1, car.clientWidth)), f = fechasSemana()[i];
          if (f && f !== sel) { sel = f; document.querySelectorAll('.pe-s, .pe-wk').forEach(b => b.classList.toggle('pe-sel', +b.dataset.i === i)); }
        }, 90);
      }, { passive: true });
    }
    flashUid = null;
    if (animar && window.cmDescifrar) {
      animar = false;
      document.querySelectorAll('#rutinas-wrap .pe-num').forEach(el => { if (el.getClientRects().length) window.cmDescifrar(el, el.textContent, { full: true }); });
    }
  }

  const rer = () => { saveState(); renderRutinas(); };
  const refrescar = () => renderRutinas();

  // ── Acciones ──
  const api = {
    html, post,
    // Piezas para la tarjeta resumen de Salud (rutinas.js)
    hayPlan, hecho: hechoItem, icono: iconoItem, nombre: nombreItem, claveHecha, fechasSemana, hechasFn,
    entrar() { animar = true; sel = hoy(); modo = 'home'; menuRid = null; menuPlan = false; },
    ir(i) { const car = document.getElementById('pe-car'); sel = fechasSemana()[i]; document.querySelectorAll('.pe-s, .pe-wk').forEach(b => b.classList.toggle('pe-sel', +b.dataset.i === i)); if (car) car.scrollTo({ left: i * car.clientWidth, behavior: 'smooth' }); },
    empezar(rid) { menuRid = null; startRutinaSession(rid); },
    menu(uid) { menuRid = menuRid === uid ? null : uid; refrescar(); },
    menuDelPlan() { menuPlan = !menuPlan; refrescar(); },
    reordenar(rid) { _rtnSections.add('rutinas'); menuRid = null; refrescar(); const c = document.getElementById('rtn-card-' + rid); if (c) { c.classList.add('rtn-open'); c.scrollIntoView({ block: 'center' }); } },
    holdIni(btn) {
      api.holdFin(btn);
      btn.classList.add('pe-holding');
      btn._t = setTimeout(() => {
        btn._t = null; btn.classList.remove('pe-holding');
        if (btn.dataset.holdFn === 'cancelarSesion') cancelRtnSession(); else api.borrarRutina(btn.dataset.hold);   // mismo gesto para borrar rutina y cancelar sesión
      }, 500);
    },
    holdFin(btn) { if (btn._t) { clearTimeout(btn._t); btn._t = null; } btn.classList.remove('pe-holding'); },
    borrarRutina(rid) { menuRid = null; deleteRoutineById(rid, true); },
    marcar(f, uidItem) {
      if (f > hoy()) { showToast('Todavía no es ese día'); return; }
      const it = P().itemsDelDia(plan(), f).find(x => x.uid === uidItem); if (!it) return;
      const r = P().marcarActividad(registro(), { fecha: f, clave: it.clave, franja: it.franja });
      S.actividadesHechas = r.registro; flashUid = r.uid;
      rer();
    },
    desmarcar(uid) { S.actividadesHechas = P().desmarcarActividad(registro(), uid); if (detalleUid === uid) detalleUid = null; rer(); },
    detalle(uid) { detalleUid = detalleUid === uid ? null : uid; refrescar(); },
    detalleCerrar() { detalleUid = null; refrescar(); },
    detalleGuardar(uid) {
      const v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
      const num = s => (s === '' ? null : Number(s));
      const bad = [['pe-d-int', 'Intensidad'], ['pe-d-con', 'Concentración']].find(([id]) => v(id) !== '' && P().escala10(v(id)) === null);
      if (bad) { showToast(bad[1] + ': un entero de 1 a 10'); return; }
      if (v('pe-d-dur') !== '' && !(Number(v('pe-d-dur')) >= 1 && Number(v('pe-d-dur')) <= 1440)) { showToast('Duración: entre 1 y 1440 minutos'); return; }
      S.actividadesHechas = P().detalleActividad(registro(), uid, { duracionMin: num(v('pe-d-dur')), intensidad: v('pe-d-int') === '' ? null : P().escala10(v('pe-d-int')), concentracion: v('pe-d-con') === '' ? null : P().escala10(v('pe-d-con')), proposito: v('pe-d-pro') === '' ? null : v('pe-d-pro') });
      detalleUid = null; rer(); showToast('Detalle guardado');
    },
    hacerPendiente() { S.planEntreno = P().aplicarCorrida(plan(), hoy(), S.routineLog, hechasFn); sel = hoy(); rer(); showToast('Listo: el resto del plan se corrió un día'); },
    seguirPlan() { S.planEntreno = P().resolverSeguir(plan(), hoy()); rer(); },
    resetear() { if (!confirm('¿Resetear el plan? Desde hoy vuelve al plan fijo (se deshacen corridas y cambios "solo esta semana").')) return; S.planEntreno = P().resetear(plan(), hoy()); menuPlan = false; rer(); showToast('Plan reseteado'); },
    descansar() { if (!confirm('¿Descansar toda esta semana? Queda sin entrenamientos y sin pendientes; la próxima vuelve al plan.')) return; S.planEntreno = P().descansarSemana(plan(), semanaKey(), hoy()); menuPlan = false; rer(); showToast('Semana de descanso'); },
    // ── Editar plan (borrador) ──
    editar() { orig = P().planBaseDeSemana(plan(), semanaKey()); draft = JSON.parse(JSON.stringify(orig)); eligiendo = false; modo = 'editar'; menuPlan = false; if (!addItem) { const r = (S.routines || [])[0]; addItem = r ? 'r:' + r.id : 'a:boxeo'; } refrescar(); },
    edSet(k, v) { if (k === 'dia') addDia = +v; else if (k === 'item') addItem = v; else addFranja = v; },
    edAgregar() {
      const [t, id] = addItem.split(':'); if (!id) return;
      draft[addDia].push(P().nuevoItem(t === 'r' ? { tipo: 'rutina', id } : { tipo: 'actividad', clave: id }, addFranja));
      eligiendo = false; refrescar();
    },
    edQuitar(uid) { draft.forEach(l => { const k = l.findIndex(i => i.uid === uid); if (k >= 0) l.splice(k, 1); }); eligiendo = false; refrescar(); },
    edFranja(uid, fr) { draft.forEach(l => l.forEach(i => { if (i.uid === uid) i.franja = fr; })); eligiendo = false; refrescar(); },
    edMover(uid, a) {
      if (a === '') return;
      let it = null; draft.forEach(l => { const k = l.findIndex(i => i.uid === uid); if (k >= 0) it = l.splice(k, 1)[0]; });
      if (it) draft[+a].push(it);
      eligiendo = false; refrescar();
    },
    edGuardar() {
      if (!P().accionesDeDiff(orig, draft).length) { showToast('Sin cambios en el plan'); modo = 'home'; refrescar(); return; }
      eligiendo = true; refrescar();
    },
    edVolver() { eligiendo = false; refrescar(); },
    edModo(m) {
      S.planEntreno = P().aplicarAcciones(plan(), m, semanaKey(), P().accionesDeDiff(orig, draft));
      modo = 'home'; draft = orig = null; eligiendo = false; animar = true;
      rer(); showToast(m === 'siempre' ? 'Plan actualizado para siempre' : 'Plan actualizado solo esta semana');
    },
    edCancelar() { modo = 'home'; draft = orig = null; eligiendo = false; refrescar(); },
  };
  return api;
})();
window.PlanUI = PlanUI;
