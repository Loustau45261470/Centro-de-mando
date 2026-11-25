'use strict';
// ════════════════════════════════════════════════════════════════════════
// REGISTRO DE COMIDA (Salud · Dieta) — reemplaza al tracker de reglas de comida sana.
//   Cuatro comidas por día (desayuno, almuerzo, merienda, cena). Cada alimento sale de una biblioteca única que se carga a mano
//   (nombre + unidad g/u + en qué comidas aparece); por día se marca «comí» y se escribe la cantidad.
//
// Estado (clave de primer nivel S.comidas; el guardado serializa todo S, sin tocar la lógica de sync):
//   S.comidas = { alimentos: [{ id, nombre, unidad:'g'|'u', sana:true|false (ausente = sin clasificar), comidas:['desayuno',...], archivado? }],
//                 registro: { 'YYYY-MM-DD': { desayuno: { <alimentoId>: { ok:true, cant:<número|null> } }, almuerzo:{}, merienda:{}, cena:{} } } }
//   - Escribir una cantidad marca la casilla sola; desmarcar conserva la cantidad pero el alimento no cuenta como comido.
//   - Archivar oculta el alimento de los bloques y conserva el historial; borrar de verdad solo si nunca se usó.
// Los datos viejos de la dieta por reglas (S.dieta) no se tocan: quedan guardados sin usarse.
// El día que se edita es getActiveDate() (igual que el resto de la app). Todo texto del usuario se escapa con escHtml.
// ════════════════════════════════════════════════════════════════════════

const COM_COMIDAS = [
  { id: 'desayuno', label: 'Desayuno' },
  { id: 'almuerzo', label: 'Almuerzo' },
  { id: 'merienda', label: 'Merienda' },
  { id: 'cena',     label: 'Cena' },
];
const COM_UNIDADES = { g: 'Gramos (g)', u: 'Unidades (u)' };

let _comEditId = null;       // alimento en edición (null = alta)
let _comBibAbierta = false;  // la biblioteca (details) recuerda si estaba abierta entre renders
let _comSaveT = null;

function comEnsure() {
  if (!S.comidas || typeof S.comidas !== 'object' || Array.isArray(S.comidas)) S.comidas = { alimentos: [], registro: {} };
  if (!Array.isArray(S.comidas.alimentos)) S.comidas.alimentos = [];
  if (!S.comidas.registro || typeof S.comidas.registro !== 'object' || Array.isArray(S.comidas.registro)) S.comidas.registro = {};
  return S.comidas;
}

// ── Datos ──
function comAlimentosDe(comida) {
  return comEnsure().alimentos.filter(a => a && !a.archivado && Array.isArray(a.comidas) && a.comidas.includes(comida));
}
function _comEntrada(ds, comida, id) {
  const dia = comEnsure().registro[ds];
  return (dia && dia[comida] && dia[comida][id]) || null;
}
function comComio(ds, comida, id) { const e = _comEntrada(ds, comida, id); return !!(e && e.ok); }
// Comidas del día con al menos un alimento marcado (solo cuentan los alimentos que hoy se ven en el bloque).
function comComidasCargadas(ds) {
  return COM_COMIDAS.filter(c => comAlimentosDe(c.id).some(a => comComio(ds, c.id, a.id))).length;
}
// ¿El día cumple para el hábito? true/false, o null si no hay registro ese día (así no toca el hábito). cfg = { minComidas:3, pctSano:90 } (por defecto).
// Una comida está «hecha» si tiene al menos un alimento con ok:true; hacen falta ≥minComidas y sanos/clasificados ≥ pctSano (sin clasificar no cuentan;
// sin ningún clasificado no hay base → false). Mira todo el registro del día, también alimentos archivados (archivar no reescribe el historial).
function comDiaCumple(ds, cfg) {
  const minC = (cfg && cfg.minComidas) || 3, pct = cfg && cfg.pctSano != null ? cfg.pctSano : 90;
  const c = comEnsure(), dia = c.registro[ds];
  if (!dia) return null;
  const porId = {}; c.alimentos.forEach(a => { if (a) porId[a.id] = a; });
  let hechas = 0, sanos = 0, clasif = 0;
  COM_COMIDAS.forEach(cm => {
    const b = dia[cm.id]; if (!b) return;
    let alguno = false;
    Object.keys(b).forEach(id => {
      if (!b[id] || !b[id].ok) return;
      alguno = true;
      const a = porId[id];
      if (a && a.sana === true) { sanos++; clasif++; } else if (a && a.sana === false) clasif++;
    });
    if (alguno) hechas++;
  });
  if (hechas < minC || !clasif) return false;
  return sanos * 100 >= clasif * pct;
}
// Recalcula el hábito automático de comidas y repinta sus tarjetas si cambió algo. `dias` = 1 → solo el día activo (forzado); si no, 60 días.
function _comSyncHabito(dias) {
  if (typeof _habitComidasSyncAll !== 'function') return;
  if (_habitComidasSyncAll(null, dias, dias === 1) && typeof renderHabitsCard === 'function') ['vida', 'salud', 'conocimiento'].forEach(sec => renderHabitsCard(sec));
}
// Cuenta lo marcado como comido en el día según la clasificación del alimento (sin clasificar no entra en ninguno).
function comConteoSana(ds) {
  let sanas = 0, noSanas = 0;
  COM_COMIDAS.forEach(c => comAlimentosDe(c.id).forEach(a => {
    if (!comComio(ds, c.id, a.id)) return;
    if (a.sana === true) sanas++; else if (a.sana === false) noSanas++;
  }));
  return { sanas, noSanas };
}
function _comTextoSana(ds) {
  const c = comConteoSana(ds);
  return c.sanas + (c.sanas === 1 ? ' sana' : ' sanas') + ' · ' + c.noSanas + (c.noSanas === 1 ? ' no sana' : ' no sanas');
}
// ¿El alimento tiene algún registro (marcado o con cantidad) en cualquier día?
function comUsado(id) {
  const reg = comEnsure().registro;
  return Object.keys(reg).some(ds => COM_COMIDAS.some(c => reg[ds] && reg[ds][c.id] && reg[ds][c.id][id]));
}
function _comParseCant(v) {
  const t = String(v == null ? '' : v).trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return isFinite(n) && n >= 0 ? n : undefined;   // undefined = no es un número válido
}
function _comEscribir(ds, comida, id, cambio) {
  const reg = comEnsure().registro;
  const dia = reg[ds] || (reg[ds] = {});
  const bloque = dia[comida] || (dia[comida] = {});
  const e = bloque[id] || (bloque[id] = { ok: false, cant: null });
  cambio(e);
  if (!e.ok && e.cant == null) delete bloque[id];           // sin marca ni cantidad: no deja basura
  if (!Object.keys(bloque).length) delete dia[comida];
  if (!Object.keys(dia).length) delete reg[ds];
}
function comSetCant(ds, comida, id, valor) {
  const n = _comParseCant(valor);
  if (n === undefined) return;
  _comEscribir(ds, comida, id, e => { e.cant = n; if (n != null && n > 0) e.ok = true; });
}
function comSetOk(ds, comida, id, ok) { _comEscribir(ds, comida, id, e => { e.ok = !!ok; }); }

// ── Guardado: al escribir se guarda diferido; al soltar el campo (change) se guarda ya ──
function _comGuardar(ya) {
  clearTimeout(_comSaveT);
  if (ya) saveState(); else _comSaveT = setTimeout(saveState, 600);
}

// ── Eventos de la fila ──
function _comFila(el) { return el.closest('.com-row'); }
function comOnCant(el, final) {
  const f = _comFila(el), ds = getActiveDate();
  comSetCant(ds, f.dataset.com, f.dataset.id, el.value);
  const on = comComio(ds, f.dataset.com, f.dataset.id);
  f.classList.toggle('on', on);
  f.querySelector('.ptask-check input').checked = on;
  _comResumenVivo();
  _comSyncHabito(1);
  _comQuitarBorrar(f.dataset.id);
  _comGuardar(final);
}
function comOnOk(el) {
  const f = _comFila(el), ds = getActiveDate();
  comSetOk(ds, f.dataset.com, f.dataset.id, el.checked);
  f.classList.toggle('on', el.checked);
  _comResumenVivo();
  _comSyncHabito(1);
  _comQuitarBorrar(f.dataset.id);
  _comGuardar(true);
}
// Un alimento que ya tiene registro deja de poder borrarse: se saca el botón sin re-renderizar (no pisa el foco del campo).
function _comQuitarBorrar(id) {
  document.querySelectorAll('.com-bib-row').forEach(r => { if (r.dataset.id === id) r.querySelectorAll('button[title="Borrar"]').forEach(b => b.remove()); });
}
function _comResumenVivo() {
  comPlatoVivo();
  const t = document.getElementById('comResumenDia');
  if (t) t.textContent = _comTextoDia(getActiveDate());
  const q = document.getElementById('comResumenSana');
  if (q) q.textContent = _comTextoSana(getActiveDate());
  renderDietaResumen();
}
function _comTextoDia(ds) {
  const hoy = typeof localStr === 'function' ? localStr(new Date()) : '';
  const cuando = ds === hoy ? 'Hoy' : (ds.slice(8, 10) + '/' + ds.slice(5, 7));
  const n = comComidasCargadas(ds);
  return cuando + ': ' + n + ' de ' + COM_COMIDAS.length + ' comidas cargadas';
}

// ── Modal de alta/edición de alimento ──
function comAbrirAlimento(id) {
  comEnsure();
  _comEditId = id || null;
  const a = id ? S.comidas.alimentos.find(x => x.id === id) : null;
  document.getElementById('comAlimTitle').textContent = a ? 'Editar alimento' : 'Nuevo alimento';
  document.getElementById('comAlimNombre').value = a ? a.nombre : '';
  document.querySelectorAll('#comAlimUnidad .com-chip').forEach(b => b.setAttribute('aria-pressed', String(!!a && a.unidad === b.dataset.v)));
  document.querySelectorAll('#comAlimSana .com-chip').forEach(b => b.setAttribute('aria-pressed', String(!!a && typeof a.sana === 'boolean' && String(a.sana) === b.dataset.v)));
  document.querySelectorAll('#comAlimComidas .com-chip').forEach(b => b.setAttribute('aria-pressed', String(!!a && Array.isArray(a.comidas) && a.comidas.includes(b.dataset.v))));
  openModal('modal-comida-alimento');
}
function comChipUnidad(btn) {
  document.querySelectorAll('#comAlimUnidad .com-chip').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
}
function comChipSana(btn) {
  document.querySelectorAll('#comAlimSana .com-chip').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
}
function comChipComida(btn) { btn.setAttribute('aria-pressed', String(btn.getAttribute('aria-pressed') !== 'true')); }

function comGuardarAlimento() {
  const nombre = document.getElementById('comAlimNombre').value.trim();
  const u = document.querySelector('#comAlimUnidad .com-chip[aria-pressed="true"]');
  const sn = document.querySelector('#comAlimSana .com-chip[aria-pressed="true"]');
  const comidas = [...document.querySelectorAll('#comAlimComidas .com-chip[aria-pressed="true"]')].map(b => b.dataset.v);
  if (!nombre) { showToast('Escribí el nombre del alimento'); return; }
  if (!u) { showToast('Elegí si se mide en gramos o en unidades'); return; }
  if (!sn && !_comEditId) { showToast('Elegí si es comida sana o no sana'); return; }   // al editar un alimento viejo sin clasificar se puede dejar así
  if (!comidas.length) { showToast('Elegí en qué comidas aparece'); return; }
  comEnsure();
  if (_comEditId) {
    const a = S.comidas.alimentos.find(x => x.id === _comEditId);
    if (a) {
      if (a.unidad !== u.dataset.v && comUsado(a.id) && !confirm('Este alimento ya tiene registros: las cantidades cargadas van a pasar a leerse en la unidad nueva. ¿Seguir?')) return;
      a.nombre = nombre; a.unidad = u.dataset.v; a.comidas = comidas;
      if (sn) a.sana = sn.dataset.v === 'true';
    }
  } else {
    S.comidas.alimentos.push({ id: uid(), nombre, unidad: u.dataset.v, sana: sn.dataset.v === 'true', comidas });
  }
  closeModal('modal-comida-alimento');
  _comSyncHabito(60);   // la clasificación cambió: se recalculan los días pasados
  saveState(); renderDieta(); renderDietaResumen();
}
function comArchivar(id, archivar) {
  const a = comEnsure().alimentos.find(x => x.id === id);
  if (!a) return;
  if (archivar) a.archivado = true; else delete a.archivado;
  saveState(); renderDieta(); renderDietaResumen();
}
function comBorrar(id) {
  if (comUsado(id)) return;   // con historial solo se archiva
  if (!confirm('¿Borrar este alimento de la biblioteca?')) return;
  S.comidas.alimentos = comEnsure().alimentos.filter(x => x.id !== id);
  saveState(); renderDieta(); renderDietaResumen();
}

// ── Plato (HUD E6): un anillo con una porción por comida. Cada porción se llena según lo marcado ese día, con el color de la sección (Salud):
//    sana = color pleno con brillo, no sana = el mismo color tenue, sin clasificar = casi apagado. Se anima solo al marcar/desmarcar (comPlatoVivo);
//    al pintar de nuevo (abrir, guardar un alimento) sale ya en su estado final. Solo dibuja: no escribe nada en S. ──
function _comPlatoDatos(ds) {
  return COM_COMIDAS.map(c => {
    let s = 0, n = 0, u = 0;
    comAlimentosDe(c.id).forEach(a => { if (!comComio(ds, c.id, a.id)) return; if (a.sana === true) s++; else if (a.sana === false) n++; else u++; });
    return { s, n, u, t: s + n + u };
  });
}
// Tramo de la porción (pathLength=1) que ocupa cada clase: sana primero, luego no sana, luego sin clasificar.
function _comPlatoDash(d, k) {
  if (!d.t) return '0 0 0 2';
  const fs = d.s / d.t, fn = d.n / d.t, fu = d.u / d.t;
  const [a, b] = k === 's' ? [0, fs] : k === 'n' ? [fs, fn] : [fs + fn, fu];
  return '0 ' + a.toFixed(4) + ' ' + b.toFixed(4) + ' 2';
}
function _comPlatoTexto(datos) {
  const c = datos.filter(d => d.t).length, s = datos.reduce((x, d) => x + d.s, 0), n = datos.reduce((x, d) => x + d.n, 0);
  return { n: c, aria: 'Plato: ' + c + ' de ' + COM_COMIDAS.length + ' comidas cargadas, ' + s + (s === 1 ? ' sana' : ' sanas') + ' y ' + n + (n === 1 ? ' no sana' : ' no sanas') };
}
function _comPlatoHTML(ds) {
  const datos = _comPlatoDatos(ds), R = 44, GAP = 0.05, N = COM_COMIDAS.length, TAU = Math.PI * 2, t = _comPlatoTexto(datos);
  const arc = i => {
    const a0 = i / N * TAU + GAP, a1 = (i + 1) / N * TAU - GAP;
    return 'M' + (60 + R * Math.cos(a0)).toFixed(2) + ' ' + (60 + R * Math.sin(a0)).toFixed(2) + ' A' + R + ' ' + R + ' 0 0 1 ' + (60 + R * Math.cos(a1)).toFixed(2) + ' ' + (60 + R * Math.sin(a1)).toFixed(2);
  };
  const bg = COM_COMIDAS.map((c, i) => '<path class="com-plato-bg" d="' + arc(i) + '"/>').join('');
  const seg = COM_COMIDAS.map((c, i) => ['s', 'n', 'u'].map(k => '<path class="com-plato-p ' + k + '" data-i="' + i + '" data-k="' + k + '" pathLength="1" d="' + arc(i) + '" style="stroke-dasharray:' + _comPlatoDash(datos[i], k) + '"/>').join('')).join('');
  return '<div class="com-plato" id="comPlato"><div class="com-plato-fig"><svg class="com-plato-svg" viewBox="0 0 120 120" role="img" aria-label="' + t.aria + '">' + bg + seg + '<circle class="com-plato-in" cx="60" cy="60" r="34"/></svg>'
    + '<div class="com-plato-ct" aria-hidden="true"><b>' + t.n + '/' + N + '</b><span>comidas</span></div></div>'
    + '<div class="com-plato-leg"><span><i></i>Sana</span><span><i class="n"></i>No sana</span><span><i class="u"></i>Sin clasificar</span></div></div>';
}
// Al marcar/desmarcar o escribir una cantidad: mueve las porciones del plato que ya está en pantalla (la transición CSS las anima).
function comPlatoVivo() {
  const fig = document.getElementById('comPlato'); if (!fig) return;
  const datos = _comPlatoDatos(getActiveDate()), t = _comPlatoTexto(datos);
  fig.querySelectorAll('.com-plato-p').forEach(p => { p.style.strokeDasharray = _comPlatoDash(datos[+p.dataset.i], p.dataset.k); });
  const b = fig.querySelector('.com-plato-ct b'); if (b) b.textContent = t.n + '/' + COM_COMIDAS.length;
  const sv = fig.querySelector('svg'); if (sv) sv.setAttribute('aria-label', t.aria);
}

// ── Render ──
function _comSanaTxt(a) { return a.sana === true ? 'Sana' : a.sana === false ? 'No sana' : 'Sin clasificar'; }
function _comMarcaSana(a) {
  const k = a.sana === true ? 'si' : a.sana === false ? 'no' : 'sc';
  return `<span class="com-sana ${k}" role="img" aria-label="${_comSanaTxt(a)}" title="${_comSanaTxt(a)}"></span>`;
}
function _comFilaHTML(ds, comida, a) {
  const e = _comEntrada(ds, comida, a.id);
  const on = !!(e && e.ok);
  const cant = e && e.cant != null ? e.cant : '';
  return `<div class="com-row${on ? ' on' : ''}" data-com="${comida}" data-id="${escHtml(a.id)}">
    ${_comMarcaSana(a)}<span class="com-name">${escHtml(a.nombre)}</span>
    <span class="com-qty"><input class="inp com-cant" type="number" inputmode="decimal" step="any" min="0" value="${cant}" aria-label="Cantidad de ${escHtml(a.nombre)}" oninput="comOnCant(this,false)" onchange="comOnCant(this,true)"><span class="com-unit">${a.unidad === 'u' ? 'u' : 'g'}</span></span>
    <label class="ptask-check"><input type="checkbox" ${on ? 'checked' : ''} aria-label="Comí ${escHtml(a.nombre)}" onchange="comOnOk(this)"></label>
  </div>`;
}
function _comBibFilaHTML(a) {
  const donde = (a.comidas || []).map(c => (COM_COMIDAS.find(x => x.id === c) || { label: c }).label).join(', ');
  const borrable = !comUsado(a.id);
  return `<div class="com-bib-row${a.archivado ? ' arch' : ''}" data-id="${escHtml(a.id)}">
    <div class="com-bib-info"><div class="com-bib-name">${escHtml(a.nombre)}${a.archivado ? ' <small>(archivado)</small>' : ''}</div><div class="com-bib-sub">${a.unidad === 'u' ? 'Unidades' : 'Gramos'} · ${_comSanaTxt(a).toLowerCase()} · ${escHtml(donde)}</div></div>
    <div class="com-bib-acts">
      <button class="icon-btn" onclick="comAbrirAlimento('${escHtml(a.id)}')" title="Editar" aria-label="Editar">✎</button>
      <button class="btn btn-ghost btn-sm" onclick="comArchivar('${escHtml(a.id)}',${a.archivado ? 'false' : 'true'})">${a.archivado ? 'Restaurar' : 'Archivar'}</button>
      ${borrable ? `<button class="icon-btn" onclick="comBorrar('${escHtml(a.id)}')" title="Borrar" aria-label="Borrar">${_DEL_SVG}</button>` : ''}
    </div>
  </div>`;
}

function renderDieta() {
  const body = document.getElementById('dietaBody');
  if (!body) return;
  const ds = getActiveDate();
  const bloques = COM_COMIDAS.map(c => {
    const alims = comAlimentosDe(c.id);
    const filas = alims.map(a => _comFilaHTML(ds, c.id, a)).join('') || '<p class="com-vacio">Sin alimentos en esta comida.</p>';
    return `<section class="com-bloque" data-com="${c.id}"><h3 class="com-bloque-t">${c.label}</h3>${filas}</section>`;
  }).join('');
  const todos = comEnsure().alimentos.filter(Boolean);
  const bib = todos.length
    ? todos.map(_comBibFilaHTML).join('')
    : '<p class="com-vacio">La biblioteca está vacía. Agregá el primer alimento con “+ Alimento”.</p>';
  body.innerHTML = `
    ${_comPlatoHTML(ds)}
    <div class="com-dia" id="comResumenDia">${_comTextoDia(ds)}</div>
    <div class="com-dia com-dia-sana" id="comResumenSana">${_comTextoSana(ds)}</div>
    ${bloques}
    <div class="com-foot"><button class="btn btn-ghost btn-sm" onclick="comAbrirAlimento(null)">+ Alimento</button></div>
    <details class="com-bib"${_comBibAbierta ? ' open' : ''} ontoggle="_comBibAbierta=this.open"><summary>Biblioteca de alimentos (${todos.length})</summary>${bib}</details>`;
}

// Resumen de la sección Salud: solo cuántas comidas del día tienen algo cargado.
function renderDietaResumen() {
  const body = document.getElementById('dietaResumenBody');
  if (!body) return;
  const ds = getActiveDate();
  const abrir = '<button class="ent-full" onclick="if(window.openDietaOverlay)openDietaOverlay()">Abrir registro de comida →</button>';
  if (!comEnsure().alimentos.some(a => a && !a.archivado)) {
    body.innerHTML = `<p class="empty-state">Todavía no cargaste alimentos. Armá tu biblioteca desde el registro.</p>${abrir}`;
    return;
  }
  body.innerHTML = `<div class="diet-state">${_comTextoDia(ds)}</div><div class="com-dia-sana" id="comResumenSanaCard">${_comTextoSana(ds)}</div>${abrir}`;
}
