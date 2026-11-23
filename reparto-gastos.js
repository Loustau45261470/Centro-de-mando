'use strict';
// ════════════════════════════════════════════════════════════════════════
// REPARTO DE GASTOS — un gasto común (cuenta/débito) que cuenta repartido en varios meses, y "Ya comprometido".
//
//   S.repartos = [{ id, date, name, amount, currency:'ARS', accountId, category, desde:'YYYY-MM', meses:n }]
//   · La cuenta se debita YA por el monto completo (al crear), igual que un gasto común.
//   · Cada parte es una transacción type:'expense', accountId:null (no vuelve a tocar la cuenta), id rp:<id>:<YYYY-MM>,
//     repartoId. Se crea sola cuando su mes llega (materializeRepartos, idempotente; la llama cardsCatchUp de finanzas.js).
//   · comprometidoDelMes(mk): lo que ya está decidido para un mes FUTURO (partes sin materializar de repartos + gasto
//     diferido de tarjeta) y las cuotas de tarjeta que se pagan ese mes. Lo usan Actividad, Presupuesto y el historial.
// Depende de finanzas.js (_ccPesos, _ccRound, _ccAccounts, _ccTwoDecimals, snapshotNW, …) y tarjetas-motor.js.
// Carga después de finanzas.js y antes de gamemode.js / jarvis-*.js.
// ════════════════════════════════════════════════════════════════════════

const REP_MAX_MESES = 24;

function _repAddMonths(mk, k) {
  const [y, m] = mk.split('-').map(Number), idx = y * 12 + (m - 1) + k;
  return Math.floor(idx / 12) + '-' + String(idx % 12 + 1).padStart(2, '0');
}
const _repMonthShort = (mk) => CAL_MONTHS[+mk.slice(5, 7) - 1].slice(0, 3).toLowerCase();
const _repMonthLong = (mk) => `${CAL_MONTHS[+mk.slice(5, 7) - 1].toLowerCase()} ${mk.slice(0, 4)}`;

function _repValid(r) {
  return !!r && typeof r === 'object' && typeof r.id === 'string' && r.id && typeof r.date === 'string'
    && typeof r.amount === 'number' && isFinite(r.amount) && r.amount > 0
    && Number.isInteger(r.meses) && r.meses >= 1 && r.meses <= REP_MAX_MESES
    && /^\d{4}-(0[1-9]|1[0-2])$/.test(r.desde || '');
}

// Partes del reparto: centavos exactos; el resto de centavos va a la primera parte.
function repartoSchedule(r) {
  const cents = CMTarjetas.splitCents(r.amount, r.meses).map(a => Math.round(a * 100));   // splitCents deja el resto en la última
  if (cents.length > 1) { const rem = cents[cents.length - 1] - cents[0]; cents[0] += rem; cents[cents.length - 1] -= rem; }
  return cents.map((c, i) => ({ month: _repAddMonths(r.desde, i), amount: c / 100, i: i + 1, n: r.meses }));
}
const _repPartName = (r, p) => (p.n > 1 ? `${r.name} (${p.i}/${p.n})` : r.name);

// Crea (una por mes) las partes cuyo mes ya llegó. Los meses futuros no se crean hasta que el mes llega.
function materializeRepartos() {
  if (!window.CMTarjetas || !Array.isArray(S.repartos) || !Array.isArray(S.transactions)) return false;
  const cur = getActiveDate().slice(0, 7);
  const have = new Set(S.transactions.map(t => t && t.id));
  let made = 0;
  S.repartos.forEach(r => {
    if (!_repValid(r)) return;
    repartoSchedule(r).forEach(p => {
      if (p.month > cur) return;
      const id = `rp:${r.id}:${p.month}`;
      if (have.has(id)) return;
      S.transactions.unshift({
        id, date: p.month === r.date.slice(0, 7) ? r.date : `${p.month}-01`, name: _repPartName(r, p),
        type: 'expense', amount: p.amount, currency: 'ARS', accountId: null, category: r.category || '', repartoId: r.id,
      });
      have.add(id); made++;
    });
  });
  if (made) saveState();
  return made > 0;
}

// ── Ya comprometido ──
// Para un mes futuro (> mes actual): gasto = partes de repartos sin materializar + gasto diferido de tarjeta (sin las
// compras `cover`), por categoría y en total; pagos = cuotas de tarjeta que se pagan ese mes. Mes actual o pasado: ya está
// materializado, así que no hay nada comprometido (evita contar doble).
function comprometidoDelMes(mk) {
  const out = { mes: mk, gasto: 0, gastoReparto: 0, gastoTarjeta: 0, porCategoria: {}, items: [], pagos: 0, pagosItems: [] };
  if (!(typeof mk === 'string' && mk > getActiveDate().slice(0, 7))) return out;
  let cG = 0, cR = 0, cT = 0;
  const add = (tipo, name, cat, amount) => {
    const c = Math.round(amount * 100), k = cat || 'other';
    cG += c; if (tipo === 'reparto') cR += c; else cT += c;
    out.porCategoria[k] = (out.porCategoria[k] || 0) + c;
    out.items.push({ tipo, name, category: cat || '', amount });
  };
  (Array.isArray(S.repartos) ? S.repartos : []).forEach(r => {
    if (!_repValid(r)) return;
    repartoSchedule(r).forEach(p => { if (p.month === mk) add('reparto', _repPartName(r, p), r.category, p.amount); });
  });
  if (window.CMTarjetas) {
    (Array.isArray(S.cardCharges) ? S.cardCharges : []).forEach(ch => {
      if (!ch || ch.cover) return;   // la que cubre otra persona no es gasto
      const sched = CMTarjetas.expenseSchedule(ch);
      sched.forEach((e, i) => { if (e.month === mk) add('tarjeta', sched.length > 1 ? `${ch.name || 'Compra con tarjeta'} (${i + 1}/${sched.length})` : (ch.name || 'Compra con tarjeta'), ch.category, e.amount); });
    });
    const charges = Array.isArray(S.cardCharges) ? S.cardCharges : [], dues = Array.isArray(S.cardDues) ? S.cardDues : [];
    const [y, m] = mk.split('-').map(Number);
    const from = `${mk}-01`, to = `${mk}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
    let cP = 0;
    (Array.isArray(S.cards) ? S.cards : []).forEach(card => CMTarjetas.pendingDues(card, charges, from, to, dues, S.cardPayments).forEach(d => {
      cP += Math.round(d.amount * 100);
      out.pagosItems.push({ dueDate: d.dueDate, name: card.name, amount: d.amount });
    }));
    out.pagos = cP / 100;
  }
  out.gasto = cG / 100; out.gastoReparto = cR / 100; out.gastoTarjeta = cT / 100;
  Object.keys(out.porCategoria).forEach(k => { out.porCategoria[k] /= 100; });
  return out;
}

// Bloque "Ya comprometido" arriba de Actividad (solo en meses futuros).
function renderComprometido() {
  const el = document.getElementById('txnComprometido');
  if (!el) return;
  const mk = typeof txnActiveMonth === 'string' ? txnActiveMonth : '';
  const c = mk ? comprometidoDelMes(mk) : null;
  if (!c || (!c.gasto && !c.pagos)) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const gItems = c.items.map(it => {
    const ci = getCatInfo(it.category, 'expense');
    return `<li><span>${escHtml(it.name)}${it.category ? ` · ${escHtml(ci.icon)} ${escHtml(ci.label)}` : ''}</span><b>${_ccPesos(it.amount)}</b></li>`;
  }).join('');
  const pItems = c.pagosItems.map(d => `<li><span>${_ccDM(d.dueDate)} · ${escHtml(d.name)}</span><b>${_ccPesos(d.amount)}</b></li>`).join('');
  el.style.display = '';
  el.innerHTML = `<div class="rep-comp-t">Ya comprometido para ${escHtml(_repMonthLong(mk))}</div>
    <details class="rep-comp-d" id="repCompGasto"><summary><span>Gasto que ya cuenta este mes</span><b>${_ccPesos(c.gasto)}</b></summary>
      <ul>${gItems || '<li><span>Nada todavía</span></li>'}</ul></details>
    <details class="rep-comp-d" id="repCompPagos"><summary><span>Pagos de tarjetas</span><b>${_ccPesos(c.pagos)}</b></summary>
      <ul>${pItems || '<li><span>Nada todavía</span></li>'}</ul></details>`;
}

// ── Alta, edición y baja (sin UI) ──
function _repAccount(id) { return _ccAccounts().find(a => a.id === id) || null; }

// Error del reparto, o '' si se puede guardar. baseMonth = mes de la compra.
function _repError(cfg) {
  if (!cfg.name) return 'Escribí la descripción.';
  if (cfg.name.length > 80) return 'La descripción puede tener hasta 80 caracteres.';
  if (!(cfg.amount > 0)) return 'El monto tiene que ser mayor a 0.';
  if (!_ccTwoDecimals(cfg.amount)) return 'El monto puede tener como máximo 2 decimales.';
  if (!_repAccount(cfg.accountId)) return 'Elegí una cuenta en pesos: de ahí sale la plata.';
  if (!Number.isInteger(cfg.meses) || cfg.meses < 1 || cfg.meses > REP_MAX_MESES) return `La cantidad de meses va de 1 a ${REP_MAX_MESES}.`;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(cfg.desde || '')) return 'Elegí desde qué mes cuenta.';
  if (cfg.desde < cfg.date.slice(0, 7)) return 'El gasto no puede empezar a contar antes del mes de la compra.';
  return '';
}

// Crea el reparto: debita la cuenta por el total y materializa las partes que ya tocan.
function _repCreate(cfg) {
  if (!Array.isArray(S.repartos)) S.repartos = [];
  const r = { id: cfg.id || uid(), date: cfg.date, name: cfg.name, amount: cfg.amount, currency: 'ARS', accountId: cfg.accountId, category: cfg.category || '', desde: cfg.desde, meses: cfg.meses };
  S.repartos.push(r);
  const acc = _repAccount(r.accountId);
  acc.balance = _ccRound(acc.balance - r.amount);
  materializeRepartos();
  snapshotNW();
  return r;
}

// Quita el reparto y sus partes y le devuelve el monto a la cuenta. Devuelve lo necesario para deshacer.
function _repRemove(id) {
  const idx = (S.repartos || []).findIndex(r => r && r.id === id);
  if (idx < 0) return null;
  const rep = S.repartos[idx];
  const parts = [];
  S.transactions.forEach((t, i) => { if (t && t.repartoId === id) parts.push({ t, i }); });
  S.transactions = S.transactions.filter(t => !(t && t.repartoId === id));
  S.repartos.splice(idx, 1);
  const acc = (S.accounts || []).find(a => a.id === rep.accountId);
  if (acc) acc.balance = _ccRound(acc.balance + rep.amount);
  return { rep, idx, parts, hadAcc: !!acc };
}

function _repRestore(snap) {
  if (!Array.isArray(S.repartos)) S.repartos = [];
  S.repartos.splice(Math.min(snap.idx, S.repartos.length), 0, snap.rep);
  snap.parts.forEach(({ t, i }) => S.transactions.splice(Math.min(i, S.transactions.length), 0, t));
  const acc = (S.accounts || []).find(a => a.id === snap.rep.accountId);
  if (acc && snap.hadAcc) acc.balance = _ccRound(acc.balance - snap.rep.amount);
}

function _repDone() { snapshotNW(); saveState(); renderFinanzasTab(); }

function deleteReparto(id) {
  const r = (S.repartos || []).find(x => x && x.id === id);
  if (!r) return;
  if (!confirm(`¿Borrar el reparto "${r.name}"? Se devuelven ${_ccPesos(r.amount)} a la cuenta y se quitan sus partes.`)) return;
  const snap = _repRemove(id);
  closeModal('modal-reparto');
  _repDone();
  if (window.CMUndo && snap) CMUndo.registrar({ descripcion: 'Reparto borrado', deshacer: () => { _repRestore(snap); _repDone(); } });
  else showToast('Reparto borrado');
}

// ── Formulario de reparto (se inyecta en 3 lugares: gasto nuevo, editar gasto y editar reparto) ──
const _REP_UI = {
  txnRep: { amount: 'txnAmount', acc: 'txnAccount', cur: 'txnCurrency', toggle: true, label: 'Este mes', verb: 'Sale hoy de' },
  editRep: { amount: 'editTxnAmount', acc: 'editTxnAccount', cur: 'editTxnCurrency', toggle: true, label: 'Mes de la compra', verb: 'Ya salió de' },
  repEd: { amount: 'repEdAmount', acc: 'repEdAccount', cur: null, toggle: false, label: 'Mes de la compra', verb: 'Ya salió de' },
};
const _repBase = { txnRep: '', editRep: '', repEd: '' };   // mes de la compra de cada formulario
const _repById = (id) => document.getElementById(id);

function _repUiHtml(p) {
  const cfg = _REP_UI[p];
  return `${cfg.toggle ? `<div class="field rep-row" id="${p}Row" style="display:none"><label class="rep-opt" for="${p}On"><span>Repartir en meses</span><input type="checkbox" id="${p}On" onchange="repUiSync('${p}')"></label></div>` : ''}
    <div class="rep-box field" id="${p}Box" style="${cfg.toggle ? 'display:none' : ''}">
      <label for="${p}Desde">Desde</label>
      <div class="rep-desde"><select class="inp" id="${p}Desde" onchange="repUiSync('${p}')"><option value="cur">${cfg.label}</option><option value="next">Mes siguiente</option><option value="pick">Elegir mes…</option></select>
      <input class="inp" type="month" id="${p}Mes" style="display:none" oninput="repUiSync('${p}')" aria-label="Mes desde el que cuenta"></div>
      <label for="${p}Meses">Cantidad de meses</label>
      <input class="inp" type="number" step="1" min="1" max="${REP_MAX_MESES}" id="${p}Meses" value="3" oninput="repUiSync('${p}')">
      <div class="cc-hint" id="${p}Prev" aria-live="polite"></div>
    </div>`;
}
function repUiMount() {
  Object.keys(_REP_UI).forEach(p => { const slot = _repById(`${p}Slot`); if (slot && !slot.dataset.mounted) { slot.innerHTML = _repUiHtml(p); slot.dataset.mounted = '1'; } });
  ['txnAmount', 'editTxnAmount', 'editTxnType', 'editTxnCurrency', 'editTxnAccount', 'repEdAmount', 'repEdAccount'].forEach(id => {
    const el = _repById(id), p = id.startsWith('txn') ? 'txnRep' : id.startsWith('editTxn') ? 'editRep' : 'repEd';
    if (el) { el.addEventListener('input', () => repUiSync(p)); el.addEventListener('change', () => repUiSync(p)); }
  });
}

// ¿El gasto del formulario se puede repartir? (la opción solo se ofrece cuando sí)
function _repEligible(p) {
  const cfg = _REP_UI[p], v = (id) => (_repById(id) ? _repById(id).value : '');
  if (p === 'repEd') return true;
  if (p === 'txnRep') {
    if (v('txnType') !== 'expense' || _txnPayCardId() || _txnEditChargeId) return false;
    if (_txnDiscountPct() > 0) return false;   // no se combina con descuento ni reintegro
    const now = new Date(), curMK = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if ((txnActiveMonth || curMK) !== curMK) return false;   // en un mes futuro el gasto queda pendiente
  } else if (!_repEditOk || v('editTxnType') !== 'expense') return false;
  return v(cfg.cur) === 'ARS' && !!_repAccount(v(cfg.acc));
}
let _repEditOk = false;   // el gasto que se abrió en "Editar movimiento" se puede convertir (no pendiente, sin reintegro…)

function repUiOn(p) {
  const cfg = _REP_UI[p];
  if (!_repById(`${p}Box`)) return false;
  if (!cfg.toggle) return true;
  return _repEligible(p) && !!_repById(`${p}On`).checked;
}

// Lee desde/meses del formulario. base = mes de la compra.
function _repRead(p) {
  const cfg = _REP_UI[p], mode = _repById(`${p}Desde`).value;
  const base = _repBase[p] || getActiveDate().slice(0, 7);
  const desde = mode === 'cur' ? base : mode === 'next' ? _repAddMonths(base, 1) : _repById(`${p}Mes`).value;
  return { desde, meses: Number(_repById(`${p}Meses`).value), amount: Number(_repById(cfg.amount).value), accountId: _repById(cfg.acc).value, base };
}

function _repPreviewText(p) {
  const cfg = _REP_UI[p], r = _repRead(p);
  if (!(r.amount > 0) || !_ccTwoDecimals(r.amount)) return 'Cargá el monto para ver cómo queda.';
  if (!Number.isInteger(r.meses) || r.meses < 1 || r.meses > REP_MAX_MESES) return `La cantidad de meses va de 1 a ${REP_MAX_MESES}.`;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.desde)) return 'Elegí desde qué mes cuenta.';
  if (r.desde < r.base) return 'El gasto no puede empezar a contar antes del mes de la compra.';
  const acc = _repAccount(r.accountId);
  const sched = repartoSchedule({ amount: r.amount, meses: r.meses, desde: r.desde });
  const iguales = sched.every(s => s.amount === sched[0].amount);
  const meses = sched.length <= 4 ? sched.map(s => _repMonthShort(s.month)) : null;
  const lista = meses ? (meses.length > 1 ? `${meses.slice(0, -1).join(', ')} y ${meses[meses.length - 1]}` : meses[0])
    : `${sched.length} meses, de ${_repMonthShort(sched[0].month)} a ${_repMonthShort(sched[sched.length - 1].month)}`;
  const monto = iguales ? `${_ccPesos(sched[0].amount)} por mes` : `${_ccPesos(sched[0].amount)} el primero y ${_ccPesos(sched[sched.length - 1].amount)} los demás`;
  return `${cfg.verb} ${acc ? acc.name : 'la cuenta'} ${_ccPesos(r.amount)} · ${sched.length === 1 ? `cuenta ${_ccPesos(r.amount)} en ${lista}` : `cuenta ${monto} en ${lista}`}`;
}

function repUiSync(p) {
  const cfg = _REP_UI[p];
  if (!_repById(`${p}Box`)) return;
  if (cfg.toggle) {
    const ok = _repEligible(p);
    _repById(`${p}Row`).style.display = ok ? '' : 'none';
    if (!ok) _repById(`${p}On`).checked = false;
    _repById(`${p}Box`).style.display = ok && _repById(`${p}On`).checked ? '' : 'none';
  }
  _repById(`${p}Mes`).style.display = _repById(`${p}Desde`).value === 'pick' ? '' : 'none';
  if (_repById(`${p}Box`).style.display === 'none') return;
  if (p === 'txnRep') _repBase.txnRep = getActiveDate().slice(0, 7);
  _repById(`${p}Prev`).textContent = _repPreviewText(p);
}

function repUiReset(p) {
  if (!_repById(`${p}Box`)) return;
  if (_REP_UI[p].toggle) _repById(`${p}On`).checked = false;
  _repById(`${p}Desde`).value = 'cur'; _repById(`${p}Mes`).value = ''; _repById(`${p}Meses`).value = '3';
  if (p === 'txnRep') _repBase.txnRep = getActiveDate().slice(0, 7);
}

// Gasto nuevo con "Repartir en meses" tildado (lo llama addTransaction).
function _repAddFromTxnForm(base) {
  const r = _repRead('txnRep');
  const cfg = { date: getActiveDate(), name: base.name, amount: base.amount, accountId: base.accountId, category: base.category, desde: r.desde, meses: r.meses };
  const err = _repError(cfg);
  if (err) { showToast(err, 4500); return; }
  _rememberTxnAccount();
  const rep = _repCreate(cfg);
  _repDone();
  closeModal('modal-add-txn');
  _repById('txnName').value = ''; _repById('txnAmount').value = '';
  showToast(`Gasto repartido en ${rep.meses} ${rep.meses === 1 ? 'mes' : 'meses'}`);
}

// Prepara el formulario de "Editar movimiento" (lo llama openEditTxn).
function repUiOpenEdit(txn) {
  repUiMount();
  repUiReset('editRep');
  _repBase.editRep = txn.date ? txn.date.slice(0, 7) : getActiveDate().slice(0, 7);
  _repEditOk = txn.type === 'expense' && txn.currency === 'ARS' && !!txn.accountId && !txn.pending && !txn.refund && !txn.repartoId
    && !txn.cardChargeId && !txn.refundOf && !!_repAccount(txn.accountId);
  repUiSync('editRep');
}

// Convierte un gasto ya cargado en reparto: devuelve su impacto a la cuenta y crea el reparto con la misma fecha y cuenta.
function repConvertTxn(txn) {
  const r = _repRead('editRep');
  const cfg = {
    date: txn.date, name: _repById('editTxnName').value.trim() || txn.name, amount: r.amount, accountId: r.accountId,
    category: _repById('editTxnCategory').value, desde: r.desde, meses: r.meses,
  };
  const err = _repError(cfg);
  if (err) { showToast(err, 4500); return; }
  const old = (S.accounts || []).find(a => a.id === txn.accountId);
  if (old) old.balance = _ccRound(old.balance + txn.amount);   // revierte el gasto original
  S.transactions = S.transactions.filter(t => t.id !== txn.id);
  const rep = _repCreate(cfg);
  _repDone();
  closeModal('modal-edit-txn');
  showToast(`Gasto repartido en ${rep.meses} ${rep.meses === 1 ? 'mes' : 'meses'}`);
}

// ── Editar / borrar un reparto (modal-reparto) ──
let _repEditId = null;
function openReparto(id) {
  const r = (S.repartos || []).find(x => x && x.id === id);
  if (!r) { showToast('Ese reparto ya no existe'); return; }
  repUiMount();
  _repEditId = id;
  _repBase.repEd = r.date.slice(0, 7);
  _repById('repEdName').value = r.name;
  _repById('repEdAmount').value = r.amount;
  const sel = _repById('repEdAccount');
  sel.innerHTML = _ccAccountOptions(r.accountId, '— Elegí una cuenta —');
  fillTxnCategorySelect('repEdCategory', r.category || '');
  _repById('repEdDesde').value = 'pick';
  _repById('repEdMes').value = r.desde;
  _repById('repEdMeses').value = String(r.meses);
  openModal('modal-reparto');
  repUiSync('repEd');
}

// Editar = borrar y recrear de forma atómica: se valida todo antes de tocar nada.
function saveReparto() {
  const old = (S.repartos || []).find(x => x && x.id === _repEditId);
  if (!old) { closeModal('modal-reparto'); return; }
  const r = _repRead('repEd');
  const cfg = {
    id: old.id, date: old.date, name: _repById('repEdName').value.trim(), amount: r.amount, accountId: r.accountId,
    category: _repById('repEdCategory').value, desde: r.desde, meses: r.meses,
  };
  const err = _repError(cfg);
  if (err) { showToast(err, 4500); return; }
  _repRemove(old.id);
  _repCreate(cfg);
  _repDone();
  closeModal('modal-reparto');
  showToast('Reparto actualizado');
}

// Etiqueta "Repartido i/n" de una parte en Actividad.
function repBadgeHtml(t) {
  if (!t || !t.repartoId) return '';
  const r = (S.repartos || []).find(x => x && x.id === t.repartoId);
  const mk = String(t.id).split(':')[2];
  const p = r && _repValid(r) ? repartoSchedule(r).find(s => s.month === mk) : null;
  if (!p) return '';
  return `<button type="button" class="rep-badge" onclick="openReparto('${escHtml(t.repartoId)}')" aria-label="Repartido en ${p.n} meses, parte ${p.i}: abrir el reparto">Repartido ${p.i}/${p.n}</button>`;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', repUiMount); else repUiMount();
}
