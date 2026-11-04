'use strict';
// ════════════════════════════════════════════════════════════════════════
// NEGOCIOS — overlay del abanico de Finanzas: una carpeta por negocio con sus ideas, plan,
// marketing, economía y tareas. Es un espacio APARTE de las finanzas personales: no toca
// S.transactions, el presupuesto ni las proyecciones.
//
// Estado (clave nueva de primer nivel, sincroniza como cualquier otra: el guardado serializa todo S):
//   S.negocios = {
//     items: [{
//       id, nombre, estado: 'idea'|'evaluando'|'en_marcha'|'pausado'|'descartado', creado,
//       notas: [{ id, cat: 'ideas'|'plan'|'marketing'|'otros', titulo, texto, fecha, creado }],   // texto = formato de rich-notes.js
//       eco:   [{ id, fecha, tipo: 'venta'|'ingreso'|'gasto'|'credito_favor'|'credito_contra',
//                 concepto, monto, moneda: 'ARS'|'USD', contraparte, vence,                      // vence solo en créditos
//                 saldado: bool, fechaSaldado }],
//       vinculo: { tab, id } | null     // carpeta de Proyectos (window.Proyectos) de donde salen las tareas
//     }],
//     sueltas: [{ id, titulo, texto, fecha, creado }]   // bandeja de ideas sin negocio; "Mover a…" las pasa a Ideas
//   }
// Las monedas NO se convierten: cada total se muestra por moneda. Los créditos no entran en el
// resultado del mes (solo ventas + ingresos − gastos); "Te deben" / "Debés" son totales pendientes.
// ════════════════════════════════════════════════════════════════════════

const NG_ACCENT = '#22C55E';
const NG_ESTADOS = [
  ['idea', 'Idea', '#FBBF24'],
  ['evaluando', 'Evaluando', '#38BDF8'],
  ['en_marcha', 'En marcha', '#22C55E'],
  ['pausado', 'Pausado', '#94A3B8'],
  ['descartado', 'Descartado', '#F43F5E'],
];
const NG_TABS = [['ideas', 'Ideas'], ['plan', 'Plan'], ['marketing', 'Marketing'], ['economia', 'Economía'], ['tareas', 'Tareas'], ['otros', 'Otros']];
const NG_NOTE_CATS = ['ideas', 'plan', 'marketing', 'otros'];
const NG_NOTE_HINT = { ideas: 'Escribí tu idea…', plan: 'Escribí el plan…', marketing: 'Escribí la acción o el mensaje…', otros: 'Escribí tu nota…' };
const NG_TIPOS = {
  venta: 'Venta', ingreso: 'Ingreso', gasto: 'Gasto',
  credito_favor: 'Crédito a favor (te deben)', credito_contra: 'Crédito en contra (debés)',
};
const NG_MONEDAS = ['ARS', 'USD'];
const NG_PROY_TABS = [['finanzas', 'Finanzas'], ['vida', 'Vida'], ['salud', 'Salud'], ['conocimiento', 'Conocimiento'], ['ia', 'IA']];

const _ngEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const _NG_IC = {
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z"/><path d="M14 6.5l3.5 3.5"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
};

// ── Estado de la vista (solo en memoria) ───────────────────────────────────
function _ngViewNew() { return { screen: 'list', id: null, tab: 'ideas', mes: '', filtro: '', nuevo: false, nota: null, mov: null }; }
let _ngV = _ngViewNew();

// ── Datos ──────────────────────────────────────────────────────────────────
function _ngData() {
  if (typeof S === 'undefined') return { items: [], sueltas: [] };
  let d = S.negocios;
  if (!d || typeof d !== 'object' || Array.isArray(d)) d = S.negocios = { items: [], sueltas: [] };
  if (!Array.isArray(d.items)) d.items = [];
  if (!Array.isArray(d.sueltas)) d.sueltas = [];
  return d;
}
function _ngSave() { if (typeof saveState === 'function') saveState(); }
function _ngToast(m) { if (typeof showToast === 'function') showToast(m); }
function _ngUid() { return (typeof uid === 'function') ? uid() : Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _ngToday() { return (typeof getActiveDate === 'function') ? getActiveDate() : new Date().toISOString().slice(0, 10); }
function _ngFmtDate(iso) { return (typeof fmtDate === 'function') ? fmtDate(iso) : (iso || ''); }
function _ngVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function _ngFocus(id) { const el = document.getElementById(id); if (el) el.focus(); }
function _ngCur() { return _ngData().items.find(n => n.id === _ngV.id) || null; }
function _ngEstado(k) { return NG_ESTADOS.find(e => e[0] === k) || NG_ESTADOS[0]; }
function _ngByDateDesc(a, b) { return (b.fecha || '').localeCompare(a.fecha || '') || (b.creado || 0) - (a.creado || 0); }

// ── Plata ──────────────────────────────────────────────────────────────────
// Todo se suma en centavos enteros (sin errores de coma flotante) y por moneda.
const _ngC = x => Math.round(Number(x) * 100) || 0;
function _ngCurOf(m) { return m && m.moneda === 'USD' ? 'USD' : 'ARS'; }
function _ngMoney(cents, cur) {
  const n = cents / 100, abs = Math.abs(n);
  const s = abs.toLocaleString('es-AR', { minimumFractionDigits: Number.isInteger(abs) ? 0 : 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + (cur === 'USD' ? 'US$ ' : '$') + s;
}
function _ngSigned(cents, cur) { return (cents > 0 ? '+' : '') + _ngMoney(cents, cur); }

function _ngMesActual() { return _ngToday().slice(0, 7); }
function _ngMesLabel(mes) {
  const [y, m] = mes.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function _ngMesShift(mes, d) {
  const [y, m] = mes.split('-').map(Number);
  const dt = new Date(y, m - 1 + d, 1);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
}
const _ngMesDe = m => (m.fecha || '').slice(0, 7);
const _ngEsCredito = m => m.tipo === 'credito_favor' || m.tipo === 'credito_contra';

// { ARS: { venta, ingreso, gasto, neto } } solo con las monedas que tuvieron movimientos ese mes.
function _ngResultadoMes(n, mes) {
  const out = {};
  (n.eco || []).forEach(m => {
    if (_ngMesDe(m) !== mes || !['venta', 'ingreso', 'gasto'].includes(m.tipo)) return;
    const cur = _ngCurOf(m);
    const o = out[cur] || (out[cur] = { venta: 0, ingreso: 0, gasto: 0, neto: 0 });
    o[m.tipo] += _ngC(m.monto);
  });
  Object.values(out).forEach(o => { o.neto = o.venta + o.ingreso - o.gasto; });
  return out;
}
// Créditos no saldados (de cualquier mes): { favor: { ARS: cents }, contra: { ... } }
function _ngPendientes(n) {
  const r = { favor: {}, contra: {} };
  (n.eco || []).forEach(m => {
    if (m.saldado || !_ngEsCredito(m)) return;
    const k = m.tipo === 'credito_favor' ? 'favor' : 'contra', cur = _ngCurOf(m);
    r[k][cur] = (r[k][cur] || 0) + _ngC(m.monto);
  });
  return r;
}
const _ngCurKeys = obj => NG_MONEDAS.filter(c => obj[c] != null);

// ── Apertura ───────────────────────────────────────────────────────────────
function negociosOpen() {
  if (typeof CMOverlay === 'undefined') return;
  const { overlay, body } = CMOverlay.build({ id: 'ov-negocios', accent: NG_ACCENT, onClose: () => { _ngV = _ngViewNew(); } });
  if (!overlay._ngBuilt) {
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Negocios');
    overlay._ngBuilt = true;
    _ngBind(body);
  }
  _ngV = _ngViewNew();
  _ngRender();
  CMOverlay.open(overlay);
}
window.Negocios = { open: negociosOpen };
window.openNegociosOverlay = negociosOpen;

function _ngBody() { const ov = document.getElementById('ov-negocios'); return ov ? ov.querySelector('.cm-ov-body') : null; }
function _ngRender() {
  const body = _ngBody(); if (!body) return;
  const top = body.scrollTop;
  body.innerHTML = `<div class="ng-root" style="--nt-accent:${NG_ACCENT}">${_ngV.screen === 'negocio' && _ngCur() ? _ngNegocio(_ngCur()) : _ngList()}</div>`;
  body.scrollTop = top;
}

// ── Lista de negocios ──────────────────────────────────────────────────────
function _ngChip(estado) {
  const e = _ngEstado(estado);
  return `<span class="ng-estado" style="--c:${e[2]}">${_ngEsc(e[1])}</span>`;
}
function _ngResumen(n) {
  const mes = _ngMesActual(), parts = [];
  const res = _ngResultadoMes(n, mes);
  const rk = _ngCurKeys(res);
  if (rk.length) parts.push('Este mes: ' + rk.map(c => _ngSigned(res[c].neto, c)).join(' · '));
  const p = _ngPendientes(n);
  const fk = _ngCurKeys(p.favor).filter(c => p.favor[c]);
  const ck = _ngCurKeys(p.contra).filter(c => p.contra[c]);
  if (fk.length) parts.push('Te deben: ' + fk.map(c => _ngMoney(p.favor[c], c)).join(' · '));
  if (ck.length) parts.push('Debés: ' + ck.map(c => _ngMoney(p.contra[c], c)).join(' · '));
  return parts;
}
function _ngList() {
  const d = _ngData();
  const counts = {}; d.items.forEach(n => { counts[n.estado] = (counts[n.estado] || 0) + 1; });
  const chips = d.items.length > 1 ? `<div class="nt-tagbar ng-filtros" role="group" aria-label="Filtrar por estado">
      <button class="nt-tagchip${!_ngV.filtro ? ' on' : ''}" data-act="filtro" data-v="">Todos</button>
      ${NG_ESTADOS.filter(e => counts[e[0]]).map(e => `<button class="nt-tagchip${_ngV.filtro === e[0] ? ' on' : ''}" data-act="filtro" data-v="${e[0]}">${_ngEsc(e[1])} · ${counts[e[0]]}</button>`).join('')}
    </div>` : '';
  const items = d.items.filter(n => !_ngV.filtro || n.estado === _ngV.filtro).slice().sort((a, b) => (b.creado || 0) - (a.creado || 0));
  const cards = items.map(n => {
    const res = _ngResumen(n);
    return `<button class="ng-card" data-act="abrir" data-id="${_ngEsc(n.id)}">
      <span class="ng-card-top"><span class="ng-card-ttl">${_ngEsc(n.nombre || '(sin nombre)')}</span>${_ngChip(n.estado)}</span>
      ${res.length ? `<span class="ng-card-sum">${res.map(r => `<span>${_ngEsc(r)}</span>`).join('')}</span>` : `<span class="ng-card-sum ng-muted"><span>Sin movimientos todavía</span></span>`}
    </button>`;
  }).join('');
  const empty = items.length ? '' : `<div class="nt-empty">${d.items.length ? 'No hay negocios con ese estado.' : 'Todavía no tenés negocios. Creá el primero para guardar sus ideas, plan y números.'}</div>`;
  const form = _ngV.nuevo ? `<div class="ng-formcard">
      <label class="nt-flbl" for="ng-nuevo-nombre">Nombre del negocio</label>
      <input class="nt-input" id="ng-nuevo-nombre" type="text" maxlength="80" placeholder="Ej: Venta de mermeladas" data-enter="crear">
      <label class="nt-flbl" for="ng-nuevo-estado">Estado</label>
      <select class="nt-input" id="ng-nuevo-estado">${NG_ESTADOS.map(e => `<option value="${e[0]}">${_ngEsc(e[1])}</option>`).join('')}</select>
      <div class="nt-form-acts"><button class="nt-btn nt-add" data-act="crear">Crear negocio</button><button class="nt-btn" data-act="nuevo">Cancelar</button></div>
    </div>` : '';
  const sueltas = d.sueltas.slice().sort(_ngByDateDesc);
  const opts = d.items.map(n => `<option value="${_ngEsc(n.id)}">${_ngEsc(n.nombre || '(sin nombre)')}</option>`).join('');
  const sueltasHtml = sueltas.map(s => `<div class="nt-note ng-note ng-suelta" data-id="${_ngEsc(s.id)}">
      <div class="nt-note-head"><div class="nt-note-ttl">${_ngEsc(s.titulo || '(sin título)')}</div>
        <div class="nt-note-acts"><button class="nt-ico nt-del" data-act="suelta-borrar" data-id="${_ngEsc(s.id)}" title="Borrar" aria-label="Borrar idea">${_NG_IC.del}</button></div></div>
      <div class="nt-note-meta"><span class="nt-note-date">${_ngEsc(_ngFmtDate(s.fecha))}</span></div>
      ${s.texto ? `<div class="ng-note-body">${_ngRich(s.texto, false)}</div>` : ''}
      ${d.items.length ? `<select class="nt-input ng-mover" data-chg="suelta-mover" data-id="${_ngEsc(s.id)}" aria-label="Mover idea a un negocio"><option value="">Mover a…</option>${opts}</select>` : ''}
    </div>`).join('');
  return `<div class="cm-ov-head"><div class="cm-ov-eyebrow">FINANZAS · NEGOCIOS</div><div class="cm-ov-title">Negocios</div></div>
    <div class="ng-bar">${chips}<button class="nt-btn nt-add ng-addbtn" data-act="nuevo"><span class="nt-add-plus">+</span> Negocio</button></div>
    ${form}
    <div class="ng-grid">${cards}</div>${empty}
    <div class="plov-sub ng-sub">Ideas sueltas</div>
    <div class="ng-formcard ng-suelta-form">
      <input class="nt-input" id="ng-s-titulo" type="text" maxlength="80" placeholder="Título de la idea" aria-label="Título de la idea suelta">
      <textarea class="nt-input nt-ta" id="ng-s-texto" rows="2" placeholder="Anotá una idea que todavía no es de ningún negocio…" aria-label="Texto de la idea suelta"></textarea>
      <div class="nt-form-acts"><button class="nt-btn nt-add" data-act="suelta-guardar">Guardar idea</button></div>
    </div>
    <div class="nt-list ng-sueltas">${sueltasHtml || '<div class="nt-empty">No tenés ideas sueltas.</div>'}</div>`;
}

function _ngRich(texto, interactive, onSave) {
  if (typeof rnRender !== 'function') return `<div class="nt-note-text">${_ngEsc(texto)}</div>`;
  return rnRender(texto || '', interactive ? { interactive: true, texto, onSave } : { interactive: false });
}

// ── Dentro de un negocio ───────────────────────────────────────────────────
function _ngNegocio(n) {
  const tabs = NG_TABS.map(t => `<button class="plov-tab${_ngV.tab === t[0] ? ' on' : ''}" id="ng-tab-${t[0]}" data-act="tab" data-t="${t[0]}" role="tab" aria-selected="${_ngV.tab === t[0]}" aria-controls="ng-pane">${t[1]}</button>`).join('');
  let pane;
  if (NG_NOTE_CATS.includes(_ngV.tab)) pane = _ngNotasPane(n, _ngV.tab);
  else if (_ngV.tab === 'economia') pane = _ngEcoPane(n);
  else pane = _ngTareasPane(n);
  return `<div class="cm-ov-head"><div class="cm-ov-eyebrow">FINANZAS · NEGOCIOS</div></div>
    <button class="nt-btn ng-back" data-act="volver">‹ Negocios</button>
    <div class="ng-titlerow">
      <input class="nt-input ng-name" id="ng-nombre" type="text" maxlength="80" value="${_ngEsc(n.nombre)}" data-chg="nombre" aria-label="Nombre del negocio">
      <select class="nt-input ng-estado-sel" id="ng-estado" data-chg="estado" aria-label="Estado del negocio" style="--c:${_ngEstado(n.estado)[2]}">${NG_ESTADOS.map(e => `<option value="${e[0]}"${n.estado === e[0] ? ' selected' : ''}>${_ngEsc(e[1])}</option>`).join('')}</select>
    </div>
    <div class="plov-tabs ng-tabs" role="tablist" aria-label="Secciones del negocio">${tabs}</div>
    <div class="plov-pane ng-pane" id="ng-pane" role="tabpanel" aria-labelledby="ng-tab-${_ngV.tab}">${pane}</div>
    <div class="ng-foot"><button class="nt-btn ng-borrar" data-act="borrar-neg">Borrar este negocio</button></div>`;
}

// ── Notas (Ideas · Plan · Marketing · Otros) ───────────────────────────────
function _ngNotasPane(n, cat) {
  if (_ngV.nota && _ngV.nota.cat === cat) return _ngNotaForm(n, cat);
  const notas = (n.notas || []).filter(x => x.cat === cat).sort(_ngByDateDesc);
  const cards = notas.map(x => `<div class="nt-note ng-note" data-id="${_ngEsc(x.id)}">
      <div class="nt-note-head"><div class="nt-note-ttl">${_ngEsc(x.titulo || '(sin título)')}</div>
        <div class="nt-note-acts">
          <button class="nt-ico" data-act="nota-editar" data-id="${_ngEsc(x.id)}" title="Editar" aria-label="Editar nota">${_NG_IC.edit}</button>
          <button class="nt-ico nt-del" data-act="nota-borrar" data-id="${_ngEsc(x.id)}" title="Borrar" aria-label="Borrar nota">${_NG_IC.del}</button>
        </div></div>
      <div class="nt-note-meta"><span class="nt-note-date">${_ngEsc(_ngFmtDate(x.fecha))}</span></div>
      ${x.texto ? `<div class="ng-note-body">${_ngRich(x.texto, true, t => _ngNotaTexto(n.id, x.id, t))}</div>` : ''}
    </div>`).join('');
  return `<div class="ng-panebar"><button class="nt-btn nt-add" data-act="nota-nueva"><span class="nt-add-plus">+</span> Nueva nota</button></div>
    <div class="nt-list">${cards}</div>
    ${notas.length ? '' : `<div class="nt-empty">Todavía no hay notas en ${_ngEsc((NG_TABS.find(t => t[0] === cat) || [, cat])[1])}. Creá la primera.</div>`}`;
}
function _ngNotaTexto(negId, notaId, texto) {
  const n = _ngData().items.find(x => x.id === negId); if (!n) return;
  const x = (n.notas || []).find(y => y.id === notaId); if (!x) return;
  x.texto = texto; _ngSave();
}
function _ngNotaForm(n, cat) {
  const ed = _ngV.nota.id !== 'new' ? (n.notas || []).find(x => x.id === _ngV.nota.id) : null;
  const v = ed || {};
  return `<div class="nt-form ng-form">
      <label class="nt-flbl" for="ng-n-titulo">Título</label>
      <input class="nt-input" id="ng-n-titulo" type="text" maxlength="120" value="${_ngEsc(v.titulo || '')}" placeholder="(sin título)">
      <div class="nt-flbl-row"><label class="nt-flbl" for="ng-n-texto">Texto</label><button type="button" class="nt-btn nt-preview-btn" data-act="nota-preview">Vista previa</button></div>
      <textarea class="nt-input nt-ta nt-ta-xl" id="ng-n-texto" rows="12" placeholder="${_ngEsc(NG_NOTE_HINT[cat])}">${_ngEsc(v.texto || '')}</textarea>
      <div class="rn-preview-box" id="ng-n-prev" style="display:none"></div>
      <div class="nt-form-acts"><button class="nt-btn nt-add" data-act="nota-guardar">Guardar</button><button class="nt-btn" data-act="nota-cancelar">Cancelar</button></div>
    </div>`;
}

// ── Economía ───────────────────────────────────────────────────────────────
function _ngEcoPane(n) {
  if (!_ngV.mes) _ngV.mes = _ngMesActual();
  const mes = _ngV.mes;
  const res = _ngResultadoMes(n, mes), pend = _ngPendientes(n);
  const rk = _ngCurKeys(res);
  const resHtml = rk.length ? rk.map(c => {
    const o = res[c];
    return `<div class="ng-sum-line"><span class="ng-cur">${c}</span><b class="ng-sum-val ${o.neto < 0 ? 'neg' : 'pos'}">${_ngSigned(o.neto, c)}</b></div>
      <div class="ng-sum-det">Ventas ${_ngMoney(o.venta, c)} · Ingresos ${_ngMoney(o.ingreso, c)} · Gastos ${_ngMoney(o.gasto, c)}</div>`;
  }).join('') : '<div class="ng-sum-empty">Sin movimientos este mes</div>';
  const pendHtml = (obj, vacio) => { const k = _ngCurKeys(obj).filter(c => obj[c]); return k.length ? k.map(c => `<div class="ng-sum-line"><span class="ng-cur">${c}</span><b class="ng-sum-val">${_ngMoney(obj[c], c)}</b></div>`).join('') : `<div class="ng-sum-empty">${vacio}</div>`; };
  const todos = (n.eco || []).slice().sort(_ngByDateDesc);
  const delMes = todos.filter(m => _ngMesDe(m) === mes);
  const otrosPend = todos.filter(m => _ngEsCredito(m) && !m.saldado && _ngMesDe(m) !== mes);
  return `<div class="ng-mes" role="group" aria-label="Mes">
      <button class="nt-btn ng-mes-btn" data-act="mes" data-d="-1" aria-label="Mes anterior">‹</button>
      <span class="ng-mes-lbl" id="ng-mes-lbl">${_ngEsc(_ngMesLabel(mes))}</span>
      <button class="nt-btn ng-mes-btn" data-act="mes" data-d="1" aria-label="Mes siguiente">›</button>
    </div>
    <div class="ng-sum">
      <div class="ng-sum-card" id="ng-res"><div class="ng-sum-lbl">Resultado del mes</div>${resHtml}<div class="ng-sum-note">Ventas + ingresos − gastos. No incluye créditos.</div></div>
      <div class="ng-sum-card" id="ng-deben"><div class="ng-sum-lbl">Te deben</div>${pendHtml(pend.favor, 'Nada pendiente')}</div>
      <div class="ng-sum-card" id="ng-debes"><div class="ng-sum-lbl">Debés</div>${pendHtml(pend.contra, 'Nada pendiente')}</div>
    </div>
    ${_ngV.mov ? _ngMovForm(n) : `<div class="ng-panebar"><button class="nt-btn nt-add" data-act="mov-nuevo"><span class="nt-add-plus">+</span> Movimiento</button></div>`}
    <div class="plov-sub ng-sub">Movimientos de ${_ngEsc(_ngMesLabel(mes))}</div>
    <div class="ng-movs" id="ng-movs">${delMes.map(_ngMovRow).join('') || '<div class="nt-empty">No hay movimientos en este mes.</div>'}</div>
    ${otrosPend.length ? `<div class="plov-sub ng-sub">Créditos pendientes de otros meses</div><div class="ng-movs" id="ng-movs-otros">${otrosPend.map(_ngMovRow).join('')}</div>` : ''}`;
}
function _ngMovRow(m) {
  const cur = _ngCurOf(m), cred = _ngEsCredito(m), cents = _ngC(m.monto);
  const hoy = _ngToday();
  const favor = m.tipo === 'credito_favor';
  const amt = m.tipo === 'gasto' ? '-' + _ngMoney(cents, cur) : (cred ? _ngMoney(cents, cur) : '+' + _ngMoney(cents, cur));
  const cls = m.tipo === 'gasto' ? 'neg' : (cred ? 'cred' : 'pos');
  const meta = [_ngFmtDate(m.fecha), m.contraparte ? (favor ? 'Te debe ' : (cred ? 'Le debés a ' : '')) + m.contraparte : ''].filter(Boolean);
  let estado = '';
  if (cred) {
    if (m.saldado) estado = `<span class="ng-saldado">${favor ? 'Cobrado' : 'Pagado'}${m.fechaSaldado ? ' el ' + _ngEsc(_ngFmtDate(m.fechaSaldado)) : ''}</span>`;
    else if (m.vence) estado = `<span class="${m.vence < hoy ? 'ng-vencido' : 'ng-vence'}">${m.vence < hoy ? 'Vencido' : 'Vence'} ${_ngEsc(_ngFmtDate(m.vence))}</span>`;
    else estado = '<span class="ng-vence">Pendiente</span>';
  }
  const btn = !cred ? '' : (m.saldado
    ? `<button class="nt-btn ng-mini" data-act="mov-reabrir" data-id="${_ngEsc(m.id)}">Deshacer</button>`
    : `<button class="nt-btn ng-mini ng-saldar" data-act="mov-saldar" data-id="${_ngEsc(m.id)}">${favor ? 'Cobrado' : 'Pagado'}</button>`);
  return `<div class="ng-mov${m.saldado ? ' is-saldado' : ''}" data-id="${_ngEsc(m.id)}">
      <div class="ng-mov-main">
        <div class="ng-mov-c">${_ngEsc(m.concepto || NG_TIPOS[m.tipo] || 'Movimiento')}</div>
        <div class="ng-mov-m"><span class="ng-tipo ng-tipo-${_ngEsc(m.tipo)}">${_ngEsc(NG_TIPOS[m.tipo] || m.tipo)}</span>${meta.map(x => `<span>${_ngEsc(x)}</span>`).join('')}${estado}</div>
      </div>
      <div class="ng-mov-amt ${cls}">${_ngEsc(amt)}</div>
      <div class="ng-mov-acts">${btn}
        <button class="nt-ico" data-act="mov-editar" data-id="${_ngEsc(m.id)}" title="Editar" aria-label="Editar movimiento">${_NG_IC.edit}</button>
        <button class="nt-ico nt-del" data-act="mov-borrar" data-id="${_ngEsc(m.id)}" title="Borrar" aria-label="Borrar movimiento">${_NG_IC.del}</button>
      </div>
    </div>`;
}
function _ngMovForm(n) {
  const ed = _ngV.mov.id !== 'new' ? (n.eco || []).find(m => m.id === _ngV.mov.id) : null;
  const hoy = _ngToday();
  const v = ed || { tipo: 'venta', fecha: hoy.slice(0, 7) === _ngV.mes ? hoy : _ngV.mes + '-01', moneda: 'ARS' };
  const cred = v.tipo === 'credito_favor' || v.tipo === 'credito_contra';
  return `<div class="nt-form ng-form ng-formcard" id="ng-mov-form">
      <div class="nt-form-row">
        <div><label class="nt-flbl" for="ng-m-tipo">Tipo</label>
          <select class="nt-input" id="ng-m-tipo" data-chg="mov-tipo">${Object.keys(NG_TIPOS).map(k => `<option value="${k}"${v.tipo === k ? ' selected' : ''}>${_ngEsc(NG_TIPOS[k])}</option>`).join('')}</select></div>
        <div><label class="nt-flbl" for="ng-m-fecha">Fecha</label><input class="nt-input" id="ng-m-fecha" type="date" value="${_ngEsc(v.fecha || hoy)}"></div>
      </div>
      <label class="nt-flbl" for="ng-m-concepto">Concepto</label>
      <input class="nt-input" id="ng-m-concepto" type="text" maxlength="120" value="${_ngEsc(v.concepto || '')}" placeholder="Ej: Pedido de 10 frascos">
      <div class="nt-form-row">
        <div><label class="nt-flbl" for="ng-m-monto">Monto</label><input class="nt-input" id="ng-m-monto" type="number" inputmode="decimal" min="0" step="0.01" value="${v.monto != null ? _ngEsc(v.monto) : ''}" placeholder="0"></div>
        <div><label class="nt-flbl" for="ng-m-moneda">Moneda</label>
          <select class="nt-input" id="ng-m-moneda">${NG_MONEDAS.map(c => `<option value="${c}"${_ngCurOf(v) === c ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
      </div>
      <label class="nt-flbl" for="ng-m-contra">Contraparte (opcional)</label>
      <input class="nt-input" id="ng-m-contra" type="text" maxlength="80" value="${_ngEsc(v.contraparte || '')}" placeholder="Cliente, proveedor…">
      <div id="ng-m-vence-wrap"${cred ? '' : ' hidden'}><label class="nt-flbl" for="ng-m-vence">Vence (opcional)</label><input class="nt-input" id="ng-m-vence" type="date" value="${_ngEsc(v.vence || '')}"></div>
      <div class="nt-form-acts"><button class="nt-btn nt-add" data-act="mov-guardar">Guardar</button><button class="nt-btn" data-act="mov-cancelar">Cancelar</button></div>
    </div>`;
}

// ── Tareas (carpeta de Proyectos vinculada) ────────────────────────────────
const _ngIsFolder = nd => (typeof _poIsFolder === 'function') ? _poIsFolder(nd)
  : (nd.tipo ? nd.tipo === 'carpeta' : !!(nd.children && nd.children.length));
// Busca la carpeta vinculada; si la movieron a otra pestaña de Proyectos, la sigue.
function _ngFolder(v) {
  if (!v || !window.Proyectos) return null;
  const tabs = [v.tab].concat(NG_PROY_TABS.map(t => t[0]).filter(t => t !== v.tab));
  for (const tab of tabs) {
    const node = window.Proyectos.findById(tab, v.id);
    if (node) return { tab, node };
  }
  return null;
}
function _ngTareasDe(folder) {
  const out = [], sort = window.Proyectos.sort || (x => x);
  (function walk(nd, trail) {
    sort(nd.children || []).forEach(c => { if (_ngIsFolder(c)) walk(c, trail.concat(c.label || '')); else out.push({ node: c, trail }); });
  })(folder, []);
  return out;
}
function _ngCarpetasOpts() {
  const groups = [];
  NG_PROY_TABS.forEach(([tab, label]) => {
    const opts = [];
    (function walk(list, trail) {
      (list || []).forEach(nd => {
        if (!_ngIsFolder(nd)) return;
        const t = trail.concat(nd.label || '(sin título)');
        opts.push(`<option value="${tab}|${_ngEsc(nd.id)}">${_ngEsc(t.join(' › '))}</option>`);
        walk(nd.children, t);
      });
    })(window.Proyectos.get(tab), []);
    if (opts.length) groups.push(`<optgroup label="${label}">${opts.join('')}</optgroup>`);
  });
  return groups.join('');
}
function _ngTareasPane(n) {
  if (!window.Proyectos) return '<div class="nt-empty">Proyectos no está disponible.</div>';
  const f = _ngFolder(n.vinculo);
  if (!f) {
    const opts = _ngCarpetasOpts();
    return `<div class="ng-vinc">
      ${n.vinculo ? '<div class="ng-aviso">La carpeta que estaba vinculada ya no existe en Proyectos. Elegí otra o creá una nueva.</div>' : '<p class="ng-lead">Este negocio todavía no tiene tareas. Vinculalo a una carpeta de Proyectos y las vas a ver acá.</p>'}
      <div class="ng-formcard">
        <label class="nt-flbl" for="ng-vinc-sel">Vincular a una carpeta existente</label>
        <select class="nt-input" id="ng-vinc-sel"><option value="">Elegí una carpeta…</option>${opts}</select>
        <div class="nt-form-acts"><button class="nt-btn nt-add" data-act="vinc-existente">Vincular</button></div>
      </div>
      <div class="ng-formcard">
        <div class="nt-flbl">O empezá de cero</div>
        <button class="nt-btn nt-add" data-act="vinc-crear">Crear carpeta para este negocio</button>
        <div class="ng-hint">Se crea en Proyectos, pestaña Finanzas.</div>
      </div>
    </div>`;
  }
  const tareas = _ngTareasDe(f.node);
  const pend = tareas.filter(t => !t.node.done).length;
  const rows = tareas.map(t => `<div class="ng-task${t.node.done ? ' done' : ''}" data-id="${_ngEsc(t.node.id)}">
      <div class="ng-task-main"><div class="ng-task-ttl">${_ngEsc(t.node.label || '(sin título)')}</div>
        ${(t.trail.length || t.node.dueDate) ? `<div class="ng-task-sub">${_ngEsc([t.trail.join(' › '), t.node.dueDate ? 'Vence ' + _ngFmtDate(t.node.dueDate) : ''].filter(Boolean).join(' · '))}</div>` : ''}</div>
      <button class="ng-check" data-act="tarea-toggle" data-tab="${f.tab}" data-id="${_ngEsc(t.node.id)}" role="checkbox" aria-checked="${!!t.node.done}" aria-label="Marcar como hecha: ${_ngEsc(t.node.label || '')}">${t.node.done ? _NG_IC.tick : ''}</button>
    </div>`).join('');
  return `<div class="ng-carpeta"><span class="ng-carpeta-n">📁 ${_ngEsc(f.node.label || '(sin título)')}</span>
      <span class="ng-carpeta-acts"><button class="nt-btn ng-mini" data-act="abrir-proy">Abrir en Proyectos</button><button class="nt-btn ng-mini" data-act="desvincular">Desvincular</button></span></div>
    <div class="ng-sum-note ng-contador">${tareas.length ? `${pend} pendiente${pend === 1 ? '' : 's'} · ${tareas.length - pend} hecha${tareas.length - pend === 1 ? '' : 's'}` : ''}</div>
    <div class="ng-addtask"><input class="nt-input" id="ng-t-nueva" type="text" maxlength="120" placeholder="Nueva tarea…" aria-label="Nueva tarea" data-enter="tarea-nueva"><button class="nt-btn nt-add" data-act="tarea-nueva">Agregar</button></div>
    <div class="ng-tasks" id="ng-tasks">${rows || '<div class="nt-empty">La carpeta no tiene tareas todavía.</div>'}</div>`;
}

// ── Eventos (delegados en el cuerpo del overlay) ───────────────────────────
function _ngBind(body) {
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b && body.contains(b)) _ngAct(b.dataset.act, b);
  });
  body.addEventListener('change', e => {
    const t = e.target.closest('[data-chg]');
    if (t && body.contains(t)) _ngChg(t.dataset.chg, t);
  });
  body.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    if (t.matches && t.matches('input[data-enter]')) { e.preventDefault(); _ngAct(t.dataset.enter, t); }
    else if (t.matches && t.matches('.ng-name')) { e.preventDefault(); t.blur(); }
  });
}

function _ngChg(what, el) {
  const d = _ngData();
  if (what === 'nombre') {
    const n = _ngCur(); if (!n) return;
    const v = el.value.trim();
    if (!v) { el.value = n.nombre || ''; _ngToast('El negocio necesita un nombre'); return; }
    n.nombre = v; _ngSave();
  } else if (what === 'estado') {
    const n = _ngCur(); if (!n) return;
    if (NG_ESTADOS.some(e => e[0] === el.value)) { n.estado = el.value; el.style.setProperty('--c', _ngEstado(n.estado)[2]); _ngSave(); }
  } else if (what === 'mov-tipo') {
    const w = document.getElementById('ng-m-vence-wrap');
    if (w) w.hidden = !(el.value === 'credito_favor' || el.value === 'credito_contra');
  } else if (what === 'suelta-mover') {
    const s = d.sueltas.find(x => x.id === el.dataset.id), n = d.items.find(x => x.id === el.value);
    if (!s || !n) return;
    const titulo = s.titulo || (s.texto || '').split('\n')[0].slice(0, 60);
    (n.notas || (n.notas = [])).push({ id: _ngUid(), cat: 'ideas', titulo, texto: s.texto || '', fecha: s.fecha || _ngToday(), creado: s.creado || Date.now() });
    d.sueltas = d.sueltas.filter(x => x.id !== s.id);
    _ngSave(); _ngRender();
    _ngToast('Pasó a «' + (n.nombre || 'negocio') + '», pestaña Ideas');
  }
}

function _ngAct(a, el) {
  const d = _ngData(), n = _ngCur();
  switch (a) {
    // Lista
    case 'nuevo': _ngV.nuevo = !_ngV.nuevo; _ngRender(); if (_ngV.nuevo) _ngFocus('ng-nuevo-nombre'); break;
    case 'crear': {
      const nombre = _ngVal('ng-nuevo-nombre');
      if (!nombre) { _ngToast('Poné un nombre para el negocio'); _ngFocus('ng-nuevo-nombre'); return; }
      const est = _ngVal('ng-nuevo-estado');
      d.items.push({ id: _ngUid(), nombre, estado: NG_ESTADOS.some(e => e[0] === est) ? est : 'idea', creado: Date.now(), notas: [], eco: [], vinculo: null });
      _ngSave(); _ngV.nuevo = false; _ngV.filtro = ''; _ngRender(); break;
    }
    case 'filtro': _ngV.filtro = el.dataset.v || ''; _ngRender(); break;
    case 'abrir': _ngV = Object.assign(_ngViewNew(), { screen: 'negocio', id: el.dataset.id, tab: 'ideas', mes: _ngMesActual() }); _ngRender(); break;
    case 'suelta-guardar': {
      const titulo = _ngVal('ng-s-titulo'), texto = _ngVal('ng-s-texto');
      if (!titulo && !texto) { _ngToast('Escribí algo para guardar la idea'); _ngFocus('ng-s-titulo'); return; }
      d.sueltas.push({ id: _ngUid(), titulo, texto, fecha: _ngToday(), creado: Date.now() });
      _ngSave(); _ngRender(); break;
    }
    case 'suelta-borrar':
      if (!confirm('¿Seguro que querés borrar esta idea?')) return;
      d.sueltas = d.sueltas.filter(x => x.id !== el.dataset.id); _ngSave(); _ngRender(); break;
    // Negocio
    case 'volver': _ngV = _ngViewNew(); _ngRender(); break;
    case 'tab': _ngV.tab = el.dataset.t; _ngV.nota = null; _ngV.mov = null; _ngRender(); break;
    case 'borrar-neg':
      if (!n || !confirm('¿Borrar el negocio «' + (n.nombre || '') + '» con todas sus notas y movimientos? La carpeta de Proyectos vinculada no se borra.')) return;
      d.items = d.items.filter(x => x.id !== n.id); _ngSave(); _ngV = _ngViewNew(); _ngRender(); break;
    // Notas
    case 'nota-nueva': _ngV.nota = { cat: _ngV.tab, id: 'new' }; _ngRender(); _ngFocus('ng-n-titulo'); break;
    case 'nota-editar': _ngV.nota = { cat: _ngV.tab, id: el.dataset.id }; _ngRender(); _ngFocus('ng-n-titulo'); break;
    case 'nota-cancelar': _ngV.nota = null; _ngRender(); break;
    case 'nota-preview': {
      const box = document.getElementById('ng-n-prev'), ta = document.getElementById('ng-n-texto'); if (!box || !ta) return;
      const show = box.style.display === 'none';
      if (show) box.innerHTML = _ngRich(ta.value, false);
      box.style.display = show ? '' : 'none'; break;
    }
    case 'nota-guardar': {
      if (!n || !_ngV.nota) return;
      const titulo = _ngVal('ng-n-titulo'), ta = document.getElementById('ng-n-texto'), texto = ta ? ta.value.trim() : '';
      if (!titulo && !texto) { _ngToast('Escribí un título o un texto'); _ngFocus('ng-n-titulo'); return; }
      if (!n.notas) n.notas = [];
      const ed = _ngV.nota.id !== 'new' ? n.notas.find(x => x.id === _ngV.nota.id) : null;
      if (ed) { ed.titulo = titulo; ed.texto = texto; }
      else n.notas.push({ id: _ngUid(), cat: _ngV.nota.cat, titulo, texto, fecha: _ngToday(), creado: Date.now() });
      _ngSave(); _ngV.nota = null; _ngRender(); break;
    }
    case 'nota-borrar':
      if (!n || !confirm('¿Seguro que querés borrar esta nota?')) return;
      n.notas = (n.notas || []).filter(x => x.id !== el.dataset.id); _ngSave(); _ngRender(); break;
    // Economía
    case 'mes': _ngV.mes = _ngMesShift(_ngV.mes || _ngMesActual(), Number(el.dataset.d) || 0); _ngV.mov = null; _ngRender(); break;
    case 'mov-nuevo': _ngV.mov = { id: 'new' }; _ngRender(); _ngFocus('ng-m-concepto'); break;
    case 'mov-editar': _ngV.mov = { id: el.dataset.id }; _ngRender(); _ngFocus('ng-m-concepto'); break;
    case 'mov-cancelar': _ngV.mov = null; _ngRender(); break;
    case 'mov-guardar': {
      if (!n || !_ngV.mov) return;
      const monto = Math.round(Number(document.getElementById('ng-m-monto').value) * 100) / 100;
      if (!(monto > 0)) { _ngToast('Poné un monto mayor a cero'); _ngFocus('ng-m-monto'); return; }
      const fecha = _ngVal('ng-m-fecha');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { _ngToast('Elegí la fecha del movimiento'); _ngFocus('ng-m-fecha'); return; }
      const tipo = _ngVal('ng-m-tipo'), cred = tipo === 'credito_favor' || tipo === 'credito_contra';
      const data = { fecha, tipo, concepto: _ngVal('ng-m-concepto'), monto, moneda: _ngVal('ng-m-moneda') === 'USD' ? 'USD' : 'ARS', contraparte: _ngVal('ng-m-contra'), vence: cred ? _ngVal('ng-m-vence') : '' };
      if (!n.eco) n.eco = [];
      const ed = _ngV.mov.id !== 'new' ? n.eco.find(m => m.id === _ngV.mov.id) : null;
      if (ed) {
        Object.assign(ed, data);
        if (!cred) { ed.saldado = false; ed.fechaSaldado = ''; }
      } else n.eco.push(Object.assign({ id: _ngUid(), saldado: false, fechaSaldado: '', creado: Date.now() }, data));
      _ngV.mes = fecha.slice(0, 7);   // salta al mes del movimiento: así se ve lo que se acaba de cargar
      _ngSave(); _ngV.mov = null; _ngRender(); break;
    }
    case 'mov-borrar':
      if (!n || !confirm('¿Seguro que querés borrar este movimiento?')) return;
      n.eco = (n.eco || []).filter(m => m.id !== el.dataset.id); _ngSave(); _ngRender(); break;
    case 'mov-saldar': case 'mov-reabrir': {
      const m = n && (n.eco || []).find(x => x.id === el.dataset.id); if (!m) return;
      m.saldado = a === 'mov-saldar'; m.fechaSaldado = m.saldado ? _ngToday() : '';
      _ngSave(); _ngRender(); break;
    }
    // Tareas
    case 'vinc-existente': {
      const v = _ngVal('ng-vinc-sel'); if (!n) return;
      if (!v) { _ngToast('Elegí una carpeta de la lista'); return; }
      const [tab, id] = v.split('|');
      n.vinculo = { tab, id }; _ngSave(); _ngRender(); break;
    }
    case 'vinc-crear': {
      if (!n || !window.Proyectos) return;
      const nodo = window.Proyectos.newNode(n.nombre || 'Negocio', true);
      window.Proyectos.get('finanzas').push(nodo);
      window.Proyectos.save('finanzas');
      n.vinculo = { tab: 'finanzas', id: nodo.id }; _ngSave(); _ngRender();
      _ngToast('Carpeta creada en Proyectos · Finanzas'); break;
    }
    case 'desvincular': if (!n) return; n.vinculo = null; _ngSave(); _ngRender(); break;
    case 'tarea-nueva': {
      const f = n && _ngFolder(n.vinculo), txt = _ngVal('ng-t-nueva'); if (!f) return;
      if (!txt) { _ngFocus('ng-t-nueva'); return; }
      (f.node.children || (f.node.children = [])).push(window.Proyectos.newNode(txt, false));
      window.Proyectos.save(f.tab); _ngRender(); _ngFocus('ng-t-nueva'); break;
    }
    case 'tarea-toggle': {
      const nd = window.Proyectos.findById(el.dataset.tab, el.dataset.id); if (!nd) return;
      window.Proyectos.setDone(el.dataset.tab, el.dataset.id, !nd.done); _ngRender(); break;
    }
    case 'abrir-proy': {
      const f = n && _ngFolder(n.vinculo); if (!f || !window.ProyectosOverlay) return;
      if (ProyectosOverlay.openNode) ProyectosOverlay.openNode(f.tab, f.node.id); else ProyectosOverlay.open(f.tab);
      const p = document.getElementById('proy-overlay');
      if (p) {
        document.body.appendChild(p);   // queda por encima de Negocios (mismo z-index: gana el último en el DOM)
        if (!p._ngObs) {
          p._ngObs = new MutationObserver(() => { const ov = document.getElementById('ov-negocios'); if (!p.classList.contains('show') && ov && ov.classList.contains('show')) _ngRender(); });
          p._ngObs.observe(p, { attributes: true, attributeFilter: ['class'] });
        }
      }
      break;
    }
  }
}
