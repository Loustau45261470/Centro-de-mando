// ════════════════════════════════════════════════════════
// FINANCE TAB
// ════════════════════════════════════════════════════════
// Patrimonio (etapa 7). Una sola definición: calcNetWorth() = calcBalanceReal(); todo lo que lee el patrimonio llama a calcNetWorth.
//   Cash disponible = efectivo (cash) + cuentas digitales/bancarias (bank) + deudas a favor (prestamo). Sin tarjetas ni inversiones.
//   Balance real    = Cash − Crédito usado + Inversiones (invest) + cuentas de otro tipo (other y cualquier tipo no reconocido).
// Se suma el saldo de cada cuenta tal cual, sin distinguir moneda (por ahora solo importan los pesos).
function _nwParts() {
  const sum = (f) => (S.accounts || []).filter(f).reduce((s, a) => s + (+a.balance || 0), 0);
  const cash = sum(a => a.type === 'cash' || a.type === 'bank' || a.type === 'prestamo');
  const invest = sum(a => a.type === 'invest');
  const other = sum(a => !['cash', 'bank', 'prestamo', 'invest'].includes(a.type));
  return { cash, invest, other, credit: calcCreditUsed() };
}
function calcCash() { return Math.round(_nwParts().cash * 100) / 100; }
function calcCreditUsed() {
  return Math.round((Array.isArray(S.cards) ? S.cards : []).reduce((s, c) => s + cardUsed(c), 0) * 100) / 100;
}
function calcBalanceReal() {
  const p = _nwParts();
  return Math.round((p.cash - p.credit + p.invest + p.other) * 100) / 100;
}
function calcNetWorth() { return calcBalanceReal(); }

function snapshotNW() {
  const today = getActiveDate();
  const val = calcNetWorth();
  const existing = S.nwHistory.find(h=>h.date===today);
  // c:1 = método nuevo (el patrimonio descuenta el crédito usado). Los puntos viejos no llevan la marca.
  if (existing) { existing.value = val; existing.c = 1; }
  else S.nwHistory.push({ date:today, value:val, c:1 });
  S.nwHistory.sort((a,b)=>a.date.localeCompare(b.date));

  // Snapshot por cuenta (S.accountHistory): sin reconstrucción retroactiva, arranca
  // a registrarse desde la primera vez que se llame snapshotNW() con esta feature activa.
  if (!Array.isArray(S.accountHistory)) S.accountHistory = [];
  S.accounts.forEach(a => {
    const existingAcc = S.accountHistory.find(h=>h.date===today && h.accountId===a.id);
    if (existingAcc) existingAcc.balance = a.balance;
    else S.accountHistory.push({ date:today, accountId:a.id, balance:a.balance });
  });
  S.accountHistory.sort((a,b)=>a.date.localeCompare(b.date));

  // Poda: el selector de rango del gráfico llega hasta 12M, así que se conservan ~400
  // días de historial por cuenta (evita inflar el documento único de Firestore).
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 400);
  const cutoffStr = cutoff.toISOString().slice(0,10);
  S.accountHistory = S.accountHistory.filter(h => h.date >= cutoffStr);
}

function renderFinanzasTab() {
  ensureTxnCategories();
  cardsCatchUp();   // gastos y pagos de tarjeta que ya tocan (idempotente)
  pfCatchUp();   // antes de renderActivity: las acreditaciones de meses cerrados son transacciones
  fillTxnCategorySelect('txnCategory', document.getElementById('txnCategory')?.value);
  renderTabHeader('finanzasHeaderMeta');
  renderAccounts();
  renderCredit();
  renderDebtFlow();
  renderMonthFlow();
  renderWishlist();
  renderWishTop5();
  renderPurchaseFunds();
  renderActivity();
  renderFinObjectives();
  renderBudget();
  renderBudgetSummary();
  if (nwPieInst) updateNWCharts();
}

function renderAccounts() {
  const nw = calcNetWorth();
  document.getElementById('nwTotal').textContent = fmtMoney(nw, 'USD');
  document.getElementById('nwCash').textContent = fmtMoney(calcCash(), 'USD');
  document.getElementById('nw1pct').textContent = `1% = ${fmtMoney(nw*0.01,'USD')}`;
  const list = document.getElementById('accountList');
  list.innerHTML = S.accounts.length ? S.accounts.map(a=>`
    <div class="account-row">
      <div class="account-icon">${a.icon||'🏦'}</div>
      <div class="account-info">
        <div class="account-name">${a.name}</div>
        <div class="account-type">${{bank:'Banco',cash:'Efectivo',invest:'Inversión',prestamo:'Préstamo',other:'Otro'}[a.type]}</div>
      </div>
      <div class="account-bal pos">${fmtMoney(a.balance,a.currency)}</div>
      <button class="icon-btn" onclick="openEditAccount('${a.id}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="icon-btn" onclick="deleteAccount('${a.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
    </div>`).join('') : '<p class="empty-state">Sin cuentas registradas</p>';
  if (typeof renderAccountChartToggles === 'function') renderAccountChartToggles();
  if (nwPieInst) updateNWCharts();
}

function fmtMoney(val, cur) {
  if (cur==='BTC') return `₿${val.toFixed(6)}`;
  return new Intl.NumberFormat('en-US',{style:'currency',currency:cur||'USD',minimumFractionDigits:0,maximumFractionDigits:0}).format(val);
}

function addAccount() {
  const name=document.getElementById('accName').value.trim();
  const balance=+document.getElementById('accBalance').value||0;
  if (!name) { showToast('Escribe el nombre de la cuenta'); return; }
  S.accounts.push({
    id:uid(), name, type:document.getElementById('accType').value,
    balance, currency:document.getElementById('accCurrency').value,
    icon:document.getElementById('accIcon').value||'🏦'
  });
  snapshotNW();
  // [SUPABASE] await supabase.from('accounts').insert({ name, type, balance, currency, user_id });
  saveState(); renderFinanzasTab(); closeModal('modal-add-account');
  document.getElementById('accName').value='';document.getElementById('accBalance').value='';
  showToast('Cuenta agregada');
}

// ── Mover plata: pasa un monto de una cuenta a otra. No es ingreso ni gasto (no toca S.transactions). ──
function openMoveMoney() {
  const opts = S.accounts.map(a => `<option value="${a.id}">${a.icon||'🏦'} ${a.name} · ${fmtMoney(a.balance,a.currency)}</option>`).join('');
  const blank = '<option value="">— Elegí una cuenta —</option>';
  document.getElementById('moveFrom').innerHTML = blank + opts;
  document.getElementById('moveTo').innerHTML = blank + opts;
  document.getElementById('moveAmount').value = '';
  document.getElementById('moveNote').value = '';
  updateMoveWarn();
  openModal('modal-move-money');
}

// Aviso en vivo: si el monto deja el origen en negativo (se permite, pero se avisa).
function updateMoveWarn() {
  const el = document.getElementById('moveWarn');
  const from = S.accounts.find(a => a.id === document.getElementById('moveFrom').value);
  const amount = +document.getElementById('moveAmount').value;
  if (from && amount > 0 && from.balance - amount < 0) {
    el.textContent = `Ojo: "${from.name}" va a quedar en negativo (${fmtMoney(Math.round((from.balance - amount)*100)/100, from.currency)}). Igual se puede mover.`;
    el.style.display = '';
  } else { el.textContent = ''; el.style.display = 'none'; }
}

// Resta `amount` de `from` y lo suma a `to` (objetos de S.accounts) y deja el registro en S.moves.
// No valida ni guarda: lo usan moverPlata() y la venta de activos (registrarVentaCartera).
function _moverCuentas(from, to, amount, note) {
  from.balance = Math.round((from.balance - amount)*100)/100;
  to.balance = Math.round((to.balance + amount)*100)/100;
  if (!Array.isArray(S.moves)) S.moves = [];
  S.moves.push({ id:uid(), date:getActiveDate(), from:from.id, to:to.id, amount, note });
}

function moverPlata() {
  const fromId = document.getElementById('moveFrom').value;
  const toId = document.getElementById('moveTo').value;
  const amount = Math.round((+document.getElementById('moveAmount').value)*100)/100;
  const note = document.getElementById('moveNote').value.trim();
  if (!fromId || !toId) { showToast('Elegí las dos cuentas'); return; }
  if (fromId === toId) { showToast('La cuenta de origen y la de destino no pueden ser la misma'); return; }
  if (!(amount > 0)) { showToast('El monto tiene que ser mayor a cero'); return; }
  const from = S.accounts.find(a => a.id === fromId);
  const to = S.accounts.find(a => a.id === toId);
  if (!from || !to) { showToast('Esa cuenta ya no existe'); return; }
  if (from.currency !== to.currency) { showToast('Las dos cuentas tienen que estar en la misma moneda'); return; }
  _moverCuentas(from, to, amount, note);
  snapshotNW(); saveState(); renderFinanzasTab(); closeModal('modal-move-money');
  if (from.balance < 0) showToast(`Listo. Ojo: "${from.name}" quedó en negativo (${fmtMoney(from.balance, from.currency)})`, 5000);
  else showToast('Plata movida');
}

// ── Cartera: venta de un activo (etapa 9 de specs/finanzas-credito.md) ──
// La cuenta de inversiones es manual y guarda el CAPITAL aportado (no el valor de mercado). Vender mueve el
// COSTO (unidades × costo unitario) de esa cuenta a la de destino, igual que Mover plata, y la ganancia o
// pérdida entra como movimiento de categoría "Inversión" en la cuenta destino: ahí queda costo + resultado = lo vendido.
// Las compras no se cargan: salen de los lotes que ya trae data/cartera/tenencias.json. S.carteraTx es SOLO
// de agregado (un dispositivo desactualizado resucitaría lo borrado vía _rescueLocal); un error se corrige con un movimiento inverso.
const _cent = n => Math.round(n * 100) / 100;
const CARTERA_TOL = 1e-6; // tolerancia de redondeo en unidades

const _carteraNum = v => (v == null || v === '' || isNaN(v)) ? null : Number(v);
const _carteraTs = x => isFinite(+x.ts) ? +x.ts : Date.parse(x.fecha);

// Ventas registradas de un símbolo, en orden cronológico.
function carteraVentasDe(simbolo) {
  return (Array.isArray(S.carteraTx) ? S.carteraTx : [])
    .filter(x => x && x.simbolo === simbolo)
    .sort((a, b) => (_carteraTs(a) - _carteraTs(b)) || String(a.id).localeCompare(String(b.id)));
}

// Escala del precio: el JSON valoriza como cantidad × precio. Los bonos y letras que vienen de IOL en vivo cotizan cada 100
// nominales (valorizado = cantidad × precio / 100); el JSON semanal ya viene por unidad (commit 28df696). Se deduce del propio
// dato (valorizado / (cantidad × precio)) y no del tipo. Sin valorizado, solo CEDEARs/acciones se dan por escala 1.
function carteraEscala(t) {
  const q = _carteraNum(t.cantidad), p = _carteraNum(t.precio), v = _carteraNum(t.valorizado);
  if (q > 0 && p > 0 && v > 0) {
    const r = v / (q * p);
    if (Math.abs(r - 1) < 0.02) return 1;
    if (Math.abs(r - 0.01) < 0.0005) return 0.01;
    return null;
  }
  return ['CEDEARS', 'ACCIONES'].includes(String(t.tipo ?? '').trim().toUpperCase()) ? 1 : null;
}

// Costo unitario = promedio ponderado de los lotes SOLO si los lotes son confiables (todos con cantidad y precio > 0 y
// cuyas cantidades suman la `cantidad` del activo). Si no (un lote sin precio, suma distinta, sin lotes) usa el ppc que informa IOL;
// sin ppc válido devuelve null. origen: 'lotes' | 'ppc'. avisoLotes: había lotes pero no coinciden (el costo sale del ppc).
// fechaCompra = lote válido (cantidad y precio > 0) más antiguo, aunque el costo salga del ppc; 's/d' si no hay ninguno.
function carteraCostoUnit(t) {
  const todos = (Array.isArray(t.lotes) ? t.lotes : []);
  const validos = todos.filter(lo => lo && typeof lo === 'object' && _carteraNum(lo.cantidad) > 0 && _carteraNum(lo.precio) > 0);
  const fechas = validos.map(lo => /^\d{4}-\d{2}-\d{2}/.test(String(lo.fecha)) ? String(lo.fecha).slice(0, 10) : null).filter(Boolean).sort();
  const fechaCompra = fechas[0] || 's/d';
  const cantTotal = _carteraNum(t.cantidad);
  const cantLotes = validos.reduce((s, lo) => s + Number(lo.cantidad), 0);
  const confiables = todos.length > 0 && validos.length === todos.length && cantTotal > 0 && Math.abs(cantLotes - cantTotal) <= 1e-6 * cantTotal;
  if (confiables) {
    const costoUnit = validos.reduce((s, lo) => s + Number(lo.cantidad) * Number(lo.precio), 0) / cantLotes;
    return { costoUnit, fechaCompra, origen: 'lotes', avisoLotes: false };
  }
  const ppc = _carteraNum(t.ppc);
  return ppc > 0 ? { costoUnit: ppc, fechaCompra, origen: 'ppc', avisoLotes: todos.length > 0 } : null;
}

// Unidades que se pueden vender: las del JSON menos las ya vendidas DESPUÉS de que se generó (el JSON se actualiza
// los lunes; hasta entonces todavía las cuenta). Las vendidas antes de `generado` ya no están en `cantidad`.
function carteraDisponibles(t, generado) {
  const cant = _carteraNum(t && t.cantidad);
  if (!(cant > 0)) return 0;
  const g = Date.parse(generado);
  const vendidas = isFinite(g) ? carteraVentasDe(t.simbolo).filter(x => _carteraTs(x) > g).reduce((s, x) => s + (+x.unidades || 0), 0) : 0;
  const d = Math.round((cant - vendidas) * 1e8) / 1e8;
  return d > CARTERA_TOL ? d : 0;
}

// Cuenta de cálculo, sin efectos: valida unidades y precio y devuelve costo, vendido y resultado en centavos.
function carteraCalcVenta({ t, generado, unidades, precio }) {
  const fail = msg => ({ ok: false, msg });
  if (!t || !t.simbolo) return fail('No encuentro ese activo en la cartera');
  const u = Number(unidades), p = Number(precio);
  if (!(isFinite(u) && u > 0)) return fail('Las unidades tienen que ser un número mayor a cero');
  if (!(isFinite(p) && p > 0)) return fail('El precio de venta tiene que ser mayor a cero');
  if (Math.abs(p * 10000 - Math.round(p * 10000)) > 1e-6) return fail('El precio admite hasta 4 decimales');
  const escala = carteraEscala(t);
  if (escala == null) return fail('No puedo confirmar en qué escala viene el precio de este activo (¿cotiza en dólares?). Por ahora solo se registran ventas en pesos');
  const c = carteraCostoUnit(t);
  if (!c) return fail('No hay un costo confiable para este activo: falta su precio de compra, así que no puedo calcular la ganancia');
  const disp = carteraDisponibles(t, generado);
  if (disp <= 0) return fail(`No te quedan unidades de ${t.simbolo} para vender hasta la próxima actualización de la cartera`);
  if (u > disp + CARTERA_TOL) return fail(`Solo tenés ${disp.toLocaleString('es-AR')} unidades disponibles de ${t.simbolo}`);
  const costoTot = _cent(u * c.costoUnit * escala);
  const vendido = _cent(u * p * escala);
  if (!(costoTot > 0 && vendido > 0)) return fail('El monto de la venta es demasiado chico');
  const resultado = _cent(vendido - costoTot);
  return { ok: true, u, p, costoUnit: c.costoUnit, escala, costoTot, vendido, resultado, pct: resultado / costoTot * 100,
           fechaCompra: c.fechaCompra, costoOrigen: c.origen, avisoLotes: c.avisoLotes, disp, cierra: disp - u <= CARTERA_TOL };
}

// Registra la venta: mueve el costo entre cuentas, agrega la ganancia/pérdida a Movimientos (categoría Inversión)
// y deja el registro en S.carteraTx. Devuelve { ok:false, msg } o { ok:true, rec, from, to, ... }.
function registrarVentaCartera({ t, generado, unidades, precio, fromId, toId }) {
  const c = carteraCalcVenta({ t, generado, unidades, precio });
  if (!c.ok) return c;
  const fail = msg => ({ ok: false, msg });
  if (!fromId || !toId) return fail('Elegí las dos cuentas');
  if (fromId === toId) return fail('La cuenta de origen y la de destino no pueden ser la misma');
  const from = S.accounts.find(a => a.id === fromId);
  const to = S.accounts.find(a => a.id === toId);
  if (!from || !to) return fail('Esa cuenta ya no existe');
  if ((from.currency || 'ARS') !== 'ARS' || (to.currency || 'ARS') !== 'ARS') return fail('Las dos cuentas tienen que estar en pesos');
  _moverCuentas(from, to, c.costoTot, 'Venta ' + t.simbolo);
  if (c.resultado !== 0) {
    ensureTxnCategories();
    if (!S.txnCategories.invest) { // si Tobías la borró, se recrea
      S.txnCategories.invest = { label: 'Inversión', icon: '📈', color: '#16B364', section: 'finanzas' };
      _invalidateCatCache();
    }
    const type = c.resultado > 0 ? 'income' : 'expense';
    const amount = Math.abs(c.resultado);
    to.balance = _cent(to.balance + (type === 'income' ? amount : -amount));
    S.transactions.unshift({ id: uid(), date: getActiveDate(), name: 'Venta ' + t.simbolo, type, amount, currency: 'ARS', accountId: to.id, category: 'invest' });
  }
  if (!Array.isArray(S.carteraTx)) S.carteraTx = [];
  const rec = { id: uid(), simbolo: t.simbolo, fecha: getActiveDate(), ts: Date.now(), unidades: c.u, precio: c.p,
                costoUnit: Math.round(c.costoUnit * 1e6) / 1e6, costo: c.costoTot, resultado: c.resultado,
                fechaCompra: c.fechaCompra, cierra: c.cierra };
  S.carteraTx.push(rec);
  snapshotNW(); saveState(); renderFinanzasTab();
  return { ...c, ok: true, rec, from, to };
}

// Ciclos de un símbolo: cada ciclo termina en la venta que lo cierra; una venta posterior abre uno nuevo.
function _carteraCiclos(simbolo) {
  const ciclos = [];
  let actual = [];
  for (const r of carteraVentasDe(simbolo)) {
    actual.push(r);
    if (r.cierra) { ciclos.push({ recs: actual, cerrado: true }); actual = []; }
  }
  if (actual.length) ciclos.push({ recs: actual, cerrado: false });
  return ciclos;
}

// Un registro por activo vendido por completo: fecha de compra (la más antigua del ciclo), fecha de venta, resultado y %.
function carteraCiclosCerrados() {
  const simbolos = [...new Set((Array.isArray(S.carteraTx) ? S.carteraTx : []).filter(x => x && x.simbolo).map(x => x.simbolo))];
  const out = [];
  for (const sim of simbolos) {
    for (const c of _carteraCiclos(sim).filter(c => c.cerrado)) {
      const resultado = _cent(c.recs.reduce((s, r) => s + (+r.resultado || 0), 0));
      const base = _cent(c.recs.reduce((s, r) => s + (+r.costo || 0), 0));
      const fechas = c.recs.map(r => r.fechaCompra).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(String(f))).sort();
      out.push({ simbolo: sim, fechaCompra: fechas[0] || 's/d', fechaVenta: c.recs[c.recs.length - 1].fecha,
                 resultado, pct: base > 0 ? resultado / base * 100 : null });
    }
  }
  return out.sort((a, b) => String(b.fechaVenta).localeCompare(String(a.fechaVenta)));
}

// Ventas parciales del ciclo abierto de un activo (las que se muestran bajo su historial de compras).
function carteraVentasAbiertas(simbolo) {
  const c = _carteraCiclos(simbolo).filter(c => !c.cerrado)[0];
  return c ? c.recs : [];
}

function deleteAccount(id) {
  if (!confirm('¿Eliminar esta cuenta?')) return;
  S.accounts=S.accounts.filter(a=>a.id!==id);
  if (typeof nwSelectedAccounts !== 'undefined') nwSelectedAccounts = nwSelectedAccounts.filter(aid=>aid!==id);
  S.accountHistory = (S.accountHistory || []).filter(h => h.accountId !== id);
  snapshotNW(); saveState(); renderFinanzasTab();
}

// ── Crédito: tarjetas, compras con tarjeta y pagos de resumen (etapas 4 y 5b) ──
// Usado = saldo inicial + Σ cargos (monto completo) − Σ pagos. Las cuotas y el reparto del gasto los
// calcula tarjetas-motor.js (window.CMTarjetas); acá solo se conecta con el estado y la pantalla.
function cardUsed(card) {
  const sum = (arr) => (arr || []).filter(x => x && x.cardId === card.id).reduce((s, x) => s + (+x.amount || 0), 0);
  return Math.round(((+card.openingUsed || 0) + sum(S.cardCharges) - sum(S.cardPayments)) * 100) / 100;
}
function cardAvailable(card) { return Math.round(((+card.limit || 0) - cardUsed(card)) * 100) / 100; }
function _creditPesos(n) { return (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR'); }
function _creditTone(pct) { return pct > 100 ? 'danger' : pct >= 80 ? 'warn' : 'ok'; }

const _CC_MODES = {
  now1: 'Consumo inmediato, 1 pago',
  deferred: 'En cuotas, uso diferido',
  nowInst: 'En cuotas, uso inmediato',
  advance: 'Plata de un tercero con mi tarjeta',
};
const _CC_MODE_HINTS = {
  now1: 'El gasto cuenta en el mes de la compra y la plata sale cuando vence el resumen.',
  deferred: 'Lo pagás en cuotas, pero el gasto se reparte parejo en los meses en que lo vas a usar.',
  nowInst: 'Lo pagás en cuotas, pero el gasto completo cuenta en el mes de la compra.',
  advance: 'Alguien te da plata a cambio de usar tu tarjeta. Entra a una cuenta; no es ingreso ni gasto.',
};
const _CC_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const _ccDate = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const _ccDM = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const _ccMonthLabel = (mk) => `${_CC_MONTHS[+mk.slice(5, 7) - 1]} ${mk.slice(0, 4)}`;
const _ccRound = (n) => Math.round(n * 100) / 100;
const _ccPesos = (n) => (Number.isInteger(n) ? _creditPesos(n)
  : (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
// Solo cuentas en pesos: el módulo de tarjetas es solo en pesos.
const _ccAccounts = () => (S.accounts || []).filter(a => a.currency === 'ARS');
function _ccAccountOptions(selected, blankLabel) {
  const blank = blankLabel ? `<option value="">${blankLabel}</option>` : '';
  return blank + _ccAccounts().map(a => `<option value="${escHtml(a.id)}"${a.id === selected ? ' selected' : ''}>${a.icon || '🏦'} ${escHtml(a.name)} · ${fmtMoney(a.balance, a.currency)}</option>`).join('');
}
// Monto con 2 decimales como máximo (rechaza 0,001 y 1,005).
const _ccTwoDecimals = (n) => Math.round(n * 100) / 100 === n;

// Gastos y pagos que dependen de la fecha de hoy: se corren al abrir Finanzas y al renderizar Actividad.
// Ambas son idempotentes (ids determinísticos), así dos dispositivos que corran lo mismo no duplican.
function cardsCatchUp() {
  if (!window.CMTarjetas || !Array.isArray(S.transactions) || !Array.isArray(S.accounts)) return;
  materializeCardExpenses();
  applyCardAutoPayments();
}

// Crea (una por mes de gasto) las transacciones de las compras con tarjeta cuyo mes ya llegó.
// Los meses futuros no se crean hasta que el mes llega. id = cc:<cargo>:<YYYY-MM>: si ya existe, no se toca.
function materializeCardExpenses() {
  if (!window.CMTarjetas || !Array.isArray(S.cardCharges) || !Array.isArray(S.transactions)) return false;
  const thisMonth = getActiveDate().slice(0, 7);
  const have = new Set(S.transactions.map(t => t && t.id));
  let made = 0;
  S.cardCharges.forEach(ch => {
    const sched = CMTarjetas.expenseSchedule(ch);
    sched.forEach((e, i) => {
      if (e.month > thisMonth) return;
      const id = `cc:${ch.id}:${e.month}`;
      if (have.has(id)) return;
      const base = ch.name || 'Compra con tarjeta';
      S.transactions.unshift({
        id, date: e.month === ch.date.slice(0, 7) ? ch.date : `${e.month}-01`,
        name: sched.length > 1 ? `${base} (${i + 1}/${sched.length})` : base,
        type: 'expense', amount: e.amount, currency: 'ARS', accountId: null,
        category: ch.category || '', cardChargeId: ch.id,
      });
      have.add(id); made++;
    });
  });
  if (made) saveState();
  return made > 0;
}

// Paga solo cada vencimiento ya llegado: baja el saldo de la cuenta de pago de la tarjeta.
// No es gasto ni ingreso. id = key = auto:<tarjeta>:<fecha de vencimiento>; la creación del pago y la
// baja de saldo ocurren en el mismo bloque, y si el id ya existe no se hace ninguna de las dos.
function applyCardAutoPayments() {
  if (!window.CMTarjetas || !Array.isArray(S.cards) || !Array.isArray(S.cardCharges) || !S.cardCharges.length) return false;
  if (!Array.isArray(S.cardPayments)) S.cardPayments = [];
  const today = getActiveDate();
  const have = new Set();
  S.cardPayments.forEach(p => { if (p) { have.add(p.id); have.add(p.key); } });
  let made = 0;
  S.cards.forEach(card => {
    const acc = card.payAccountId && (S.accounts || []).find(a => a.id === card.payAccountId);
    if (!acc) return;
    CMTarjetas.dueTotals(card, S.cardCharges, '1900-01-01', today).forEach(d => {
      const key = `auto:${card.id}:${d.dueDate}`;
      if (have.has(key)) return;
      S.cardPayments.push({ id: key, key, cardId: card.id, date: d.dueDate, amount: d.amount, accountId: acc.id, kind: 'auto' });
      acc.balance = _ccRound(acc.balance - d.amount);
      have.add(key); made++;
    });
  });
  if (made) {
    snapshotNW(); saveState();
    showToast(made === 1 ? 'Se pagó un resumen de tarjeta desde tu cuenta' : `Se pagaron ${made} resúmenes de tarjeta desde tus cuentas`, 4000);
  }
  return made > 0;
}

function _ccChargeHtml(ch) {
  const card = (S.cards || []).find(c => c.id === ch.cardId);
  const paidKeys = new Set((S.cardPayments || []).map(p => p && p.key));
  const sched = card ? CMTarjetas.installmentSchedule(card, ch) : [];
  const exp = CMTarjetas.expenseSchedule(ch);
  const cuotas = sched.map(q => `<li>${sched.length === 1 ? 'Pago único' : `Cuota ${q.n} de ${sched.length}`} · vence el ${_ccDate(q.dueDate)} · ${_ccPesos(q.amount)}${paidKeys.has(`auto:${ch.cardId}:${q.dueDate}`) ? ' · <span class="cc-paid">pagada</span>' : ''}</li>`).join('');
  let gasto;
  if (ch.mode === 'advance') {
    const acc = (S.accounts || []).find(a => a.id === ch.toAccountId);
    gasto = `No cuenta como gasto ni ingreso${acc ? `. Entró a ${escHtml(acc.name)}` : ''}.`;
  } else if (exp.length > 1) {
    gasto = `Gasto repartido en ${exp.length} meses desde ${_ccMonthLabel(exp[0].month)} (${_ccPesos(exp[0].amount)} por mes).`;
  } else if (exp.length === 1) {
    gasto = `Gasto completo en ${_ccMonthLabel(exp[0].month)}.`;
  } else gasto = '';
  return `<div class="cc-chg" data-charge-id="${escHtml(ch.id)}">
    <div class="cc-chg-head">
      <div class="cc-chg-name">${escHtml(ch.name || 'Compra con tarjeta')}</div>
      <div class="cc-chg-amt">${_ccPesos(ch.amount)}${_discTagHtml(ch)}</div>
      <button class="icon-btn" aria-label="Borrar compra" onclick="deleteCardCharge('${escHtml(ch.id)}')">${_DEL_SVG}</button>
    </div>
    <div class="cc-meta">${escHtml(card ? card.name : 'Tarjeta eliminada')} · ${_ccDate(ch.date)} · ${_CC_MODES[ch.mode] || ''}</div>
    <details class="cc-chg-cal"><summary>Ver cuotas</summary>
      <ul class="cc-chg-list">${cuotas}</ul>
      <div class="cc-meta">${gasto}</div>
    </details>
  </div>`;
}

// Calendario de pagos (etapa 6): 12 meses desde hoy. Solo muestra; no toca saldos ni crea gastos.
// A pagar = cuotas que vencen ese mes y todavía no tienen pago automático. Gasto previsto = meses
// futuros de compras con uso diferido que todavía no son un gasto real (el mes en curso ya lo es).
function _ccCalendarHtml(today) {
  const head = '<div class="cc-sec">Calendario de pagos</div>';
  const charges = (S.cardCharges || []).filter(Boolean);
  if (!window.CMTarjetas || !charges.length) {
    return head + '<p class="cc-hint" id="cardCalendar">Cuando cargues compras con tarjeta, acá vas a ver cuánto pagás cada mes.</p>';
  }
  const y0 = +today.slice(0, 4), m0 = +today.slice(5, 7);
  const byMonth = {}, months = [];
  for (let i = 0; i < 12; i++) {
    const idx = y0 * 12 + (m0 - 1) + i;
    const mk = Math.floor(idx / 12) + '-' + String(idx % 12 + 1).padStart(2, '0');
    months.push(mk); byMonth[mk] = { dues: [], cents: 0, planned: 0 };
  }
  const lastMk = months[11], ly = +lastMk.slice(0, 4), lm = +lastMk.slice(5, 7);
  const end = lastMk + '-' + new Date(Date.UTC(ly, lm, 0)).getUTCDate();
  const paidKeys = new Set((S.cardPayments || []).map(p => p && p.key));
  (S.cards || []).forEach(card => CMTarjetas.dueTotals(card, charges, today, end).forEach(d => {
    const m = byMonth[d.dueDate.slice(0, 7)];
    if (!m || paidKeys.has(`auto:${card.id}:${d.dueDate}`)) return;
    m.dues.push({ dueDate: d.dueDate, name: card.name, amount: d.amount });
    m.cents += Math.round(d.amount * 100);
  }));
  const thisMonth = today.slice(0, 7);
  charges.forEach(ch => CMTarjetas.expenseSchedule(ch).forEach(e => {
    if (e.month > thisMonth && byMonth[e.month]) byMonth[e.month].planned += Math.round(e.amount * 100);
  }));
  const max = Math.max(...months.map(mk => byMonth[mk].cents));
  const maxPlanned = Math.max(...months.map(mk => byMonth[mk].planned));
  if (!max && !maxPlanned) {
    return head + '<p class="cc-hint" id="cardCalendar">No tenés pagos pendientes en los próximos 12 meses.</p>' + _CC_CAL_NOTE;
  }
  const rows = months.map(mk => {
    const m = byMonth[mk], total = m.cents / 100;
    m.dues.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : (a.name < b.name ? -1 : 1)));
    const dues = m.dues.map(d => `<li class="cc-cal-due">${_ccDM(d.dueDate)} · ${escHtml(d.name)} · ${_ccPesos(d.amount)}</li>`).join('');
    const pct = max ? Math.round(m.cents * 100 / max) : 0;
    return `<div class="cc-cal-m" data-month="${mk}">
      <div class="cc-cal-head"><span class="cc-cal-label">${_ccMonthLabel(mk)}</span>${m.cents
        ? `<span class="cc-cal-total">A pagar <b>${_ccPesos(total)}</b></span>` : '<span class="cc-cal-none">Nada para pagar</span>'}</div>
      <div class="cc-cal-bar" role="img" aria-label="${m.cents ? 'A pagar ' + _ccPesos(total) : 'Nada para pagar'}"><i style="width:${pct}%"></i></div>
      ${dues ? `<ul class="cc-cal-dues">${dues}</ul>` : ''}
      ${m.planned ? `<div class="cc-cal-exp">Gasto previsto: <b>${_ccPesos(m.planned / 100)}</b></div>` : ''}
    </div>`;
  }).join('');
  return head + `<div id="cardCalendar">${rows}</div>` + _CC_CAL_NOTE;
}
const _CC_CAL_NOTE = `<p class="cc-hint cc-cal-note">El saldo inicial cargado sin fecha no figura acá: se paga con 'Registrar pago de resumen'.</p>`;

// Card "Crédito" (sección): solo estadísticas, chica. Todo el detalle (compras, calendario, alta y baja
// de tarjetas) vive en el overlay de Tarjetas (secciones-fab.js); acá se pinta su contenido en renderCardsOverlay.
function renderCredit() {
  const el = document.getElementById('creditBody');
  if (el) el.innerHTML = _ccCompactHtml();
  renderCardsOverlay();
}

function _ccCompactHtml() {
  const cards = Array.isArray(S.cards) ? S.cards : [];
  if (!cards.length) return '<div class="cc-empty-min">Sin tarjetas · tocá para agregar</div>';
  const tUsed = cards.reduce((s, c) => s + cardUsed(c), 0);
  const tLimit = cards.reduce((s, c) => s + (+c.limit || 0), 0);
  const tPct = tLimit > 0 ? Math.round(tUsed * 100 / tLimit) : 0, tTone = _creditTone(tPct);
  const R = 20, C = 2 * Math.PI * R, off = C * (1 - Math.max(0, Math.min(100, tPct)) / 100);
  const lines = cards.map(c => {
    const used = cardUsed(c), avail = cardAvailable(c);
    const pct = Math.round(used * 100 / c.limit), tone = _creditTone(pct);
    return `<div class="cc-line cc-${tone}" data-card-id="${escHtml(c.id)}">
      <div class="cc-line-top">
        <span class="cc-name">${escHtml(c.name)}</span>
        <span class="cc-line-nums"><b class="cc-used">${_creditPesos(used)}</b> / <b class="cc-avail">${_creditPesos(avail)}</b></span>
      </div>
      <div class="cc-line-bar">
        <div class="cc-bar" role="img" aria-label="${pct}% del límite usado"><i style="width:${Math.min(100, Math.max(0, pct))}%"></i></div>
        <span class="cc-pct" data-tone="${tone}">${pct}%</span>
      </div>
    </div>`;
  }).join('');
  return `<div class="cc-total cc-${tTone}" id="creditTotal">
      <svg class="cc-ring" viewBox="0 0 48 48" width="48" height="48" role="img" aria-label="${tPct}% del límite total usado">
        <circle class="cc-ring-track" cx="24" cy="24" r="${R}" fill="none" stroke-width="5"/>
        <circle class="cc-ring-prog" cx="24" cy="24" r="${R}" fill="none" stroke-width="5" stroke-linecap="round"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 24 24)"/>
        <text x="24" y="24" text-anchor="middle" dominant-baseline="central" class="cc-ring-txt">${tPct}%</text>
      </svg>
      <div class="cc-total-txt">
        <div class="cc-total-nums"><b class="cc-used">${_creditPesos(tUsed)}</b> / <span class="cc-limit">${_creditPesos(tLimit)}</span></div>
        <div class="cc-total-cap">usado / límite</div>
      </div>
    </div>
    <div class="cc-lines-hdr"><span>Tarjeta</span><span>usado / disponible</span></div>
    <div class="cc-lines">${lines}</div>`;
}

// Contenido del overlay de Tarjetas (el armazón y las pestañas están en secciones-fab.js).
// Reusa los mismos bloques de siempre: lista de compras, calendario de pagos y filas de cada tarjeta.
function renderCardsOverlay() {
  const pCompras = document.getElementById('tj-pane-compras');
  const pCal = document.getElementById('tj-pane-calendario');
  const pTarj = document.getElementById('tj-pane-tarjetas');
  if (!pCompras || !pCal || !pTarj) return;
  const cards = Array.isArray(S.cards) ? S.cards : [];
  const today = getActiveDate();
  const paidKeys = new Set((S.cardPayments || []).map(p => p && p.key));

  // Compras
  const charges = [...(S.cardCharges || [])].filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? 1 : -1)));
  pCompras.innerHTML = `<div class="cc-pane-bar"><button class="btn btn-primary btn-sm" onclick="openTxnCardForm()">+ Compra con tarjeta</button></div>
    <div id="cardChargeList">${charges.length ? charges.map(_ccChargeHtml).join('') : '<p class="cc-hint">Todavía no cargaste compras con tarjeta.</p>'}</div>`;

  // Calendario: lo que se paga en cada tarjeta y los 12 meses
  const dueCards = cards.map(c => {
    const dues = window.CMTarjetas
      ? CMTarjetas.dueTotals(c, S.cardCharges || [], today, '2999-12-31').filter(d => !paidKeys.has(`auto:${c.id}:${d.dueDate}`)).slice(0, 2)
      : [];
    if (!dues.length) return '';
    return `<div class="cc-due-card" data-card-id="${escHtml(c.id)}"><div class="cc-name">${escHtml(c.name)}</div>${
      dues.map(d => `<div class="cc-due">A pagar el ${_ccDM(d.dueDate)}: <b>${_ccPesos(d.amount)}</b></div>`).join('')}</div>`;
  }).join('');
  pCal.innerHTML = dueCards + _ccCalendarHtml(today);

  // Tarjetas
  if (!cards.length) {
    pTarj.innerHTML = `<div class="cc-empty">
      <p>Todavía no cargaste ninguna tarjeta. Agregá una para ver cuánto usaste y cuánto te queda.</p>
      <button class="btn btn-primary btn-sm" onclick="openCardModal()">+ Agregar tarjeta</button></div>`;
    return;
  }
  const rows = cards.map(c => {
    const used = cardUsed(c), avail = cardAvailable(c);
    const pct = Math.round(used * 100 / c.limit), tone = _creditTone(pct);
    const payAcc = c.payAccountId && (S.accounts || []).find(a => a.id === c.payAccountId);
    const payHtml = payAcc
      ? ''
      : '<div class="cc-warnline" role="status">Elegí desde qué cuenta se paga (editá la tarjeta) para que los resúmenes se descuenten solos.</div>';
    return `<div class="cc-row cc-${tone}" data-card-id="${c.id}">
      <div class="cc-head">
        <div class="cc-name">${escHtml(c.name)}</div>
        <div class="cc-pct" data-tone="${tone}">${pct}% usado</div>
        <button class="icon-btn" aria-label="Editar tarjeta" onclick="openCardModal('${c.id}')">${_EDIT_SVG}</button>
        <button class="icon-btn" aria-label="Eliminar tarjeta" onclick="deleteCard('${c.id}')">${_DEL_SVG}</button>
      </div>
      <div class="cc-bar" role="img" aria-label="${pct}% del límite usado"><i style="width:${Math.min(100, Math.max(0, pct))}%"></i></div>
      <div class="cc-nums">
        <span>Usado <b class="cc-used">${_creditPesos(used)}</b></span>
        <span>Disponible <b class="cc-avail">${_creditPesos(avail)}</b></span>
        <span>Límite <b class="cc-limit">${_creditPesos(c.limit)}</b></span>
      </div>
      <div class="cc-meta">Cierra el día ${c.closeDay} · Vence el día ${c.dueDay}${pct > 100 ? ' · <b class="cc-over">Te pasaste del límite</b>' : ''}</div>
      ${payHtml}
    </div>`;
  }).join('');
  pTarj.innerHTML = `<div class="cc-pane-bar">
      <button class="btn btn-primary btn-sm" onclick="openCardModal()">+ Tarjeta</button>
      <button class="btn btn-ghost btn-sm" onclick="openCardPaymentModal()">Registrar pago de resumen</button>
    </div>${rows}`;
}

// ── Deuda y flujo (etapa 10) ──
// Deuda = crédito usado total (calcCreditUsed). Ingreso mensual promedio = promedio de los ingresos de los 3 meses
// cerrados anteriores al actual; solo cuentan los meses de esa ventana que tienen ingresos. El mes en curso nunca entra.
// Todo en pesos: se ignoran los movimientos en otra moneda. Solo se muestran números calculados (ningún texto del usuario).
const _dfIsPeso = (t) => !t.currency || t.currency === 'ARS';
const _dfNum = (n) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
const _dfMonthsTxt = (n) => `${_dfNum(n)} ${Math.abs(n - 1) < 0.05 ? 'mes' : 'meses'}`;
function _dfClosedMonths(today, count) {
  let y = +today.slice(0, 4), m = +today.slice(5, 7);
  const out = [];
  for (let i = 0; i < count; i++) {
    m--; if (m < 1) { m = 12; y--; }
    out.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return out;
}
function dfIncomeAverage(today) {
  const win = _dfClosedMonths(today, 3);
  const byMonth = {};
  (Array.isArray(S.transactions) ? S.transactions : []).forEach(t => {
    if (!t || t.type !== 'income' || !t.date || !_dfIsPeso(t)) return;
    const mk = String(t.date).slice(0, 7);
    if (win.includes(mk)) byMonth[mk] = (byMonth[mk] || 0) + (+t.amount || 0);
  });
  const vals = win.map(mk => byMonth[mk]).filter(v => v > 0);
  const n = vals.length;
  return { n, avg: n ? _ccRound(vals.reduce((s, v) => s + v, 0) / n) : 0 };
}
// Ingresos y gastos del mes en curso hasta hoy.
function dfMonthFlow(today) {
  const mk = today.slice(0, 7), day = +today.slice(8, 10);
  const side = { count: 0, total: 0 };
  const res = { day, income: { ...side }, expense: { ...side } };
  (Array.isArray(S.transactions) ? S.transactions : []).forEach(t => {
    if (!t || !t.date || !_dfIsPeso(t) || String(t.date).slice(0, 7) !== mk || t.date > today) return;
    const bucket = t.type === 'income' ? res.income : t.type === 'expense' ? res.expense : null;
    if (!bucket) return;
    bucket.count++; bucket.total += (+t.amount || 0);
  });
  res.income.total = _ccRound(res.income.total); res.expense.total = _ccRound(res.expense.total);
  return res;
}

function _dfDebtIncomeHtml(debt, today) {
  const inc = dfIncomeAverage(today);
  let body;
  if (debt <= 0) {
    body = '<div class="df-big">Sin deuda</div><div class="df-sub">No tenés crédito usado en las tarjetas.</div>';
  } else if (!inc.n) {
    body = `<div class="df-big">Sin datos suficientes</div>
      <div class="df-sub">Para esta cuenta hace falta al menos un mes cerrado con ingresos cargados. Deuda actual: <b>${_creditPesos(debt)}</b>.</div>`;
  } else {
    const ratio = debt / inc.avg, pct = Math.round(ratio * 100);
    const R = 28, C = 2 * Math.PI * R, off = C * (1 - Math.max(0, Math.min(100, pct)) / 100);
    body = `<div class="df-ratio">
      <svg class="df-ring" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="La deuda equivale al ${pct}% de un mes de ingresos">
        <circle class="df-ring-track" cx="32" cy="32" r="${R}" fill="none" stroke-width="6"/>
        <circle class="df-ring-prog" cx="32" cy="32" r="${R}" fill="none" stroke-width="6" stroke-linecap="round"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 32 32)"/>
        <text x="32" y="32" text-anchor="middle" dominant-baseline="central" class="df-ring-txt">${pct > 999 ? '999%+' : pct + '%'}</text>
      </svg>
      <div class="df-ratio-txt">
        <div class="df-big" id="dfDebtMonths">Tu deuda equivale a ${_dfMonthsTxt(ratio)} de ingresos</div>
        <div class="df-sub"><b id="dfDebtPct">${pct}%</b> de un mes de ingresos</div>
      </div>
    </div>
    <div class="df-nums">
      <span>Deuda <b>${_creditPesos(debt)}</b></span>
      <span>Ingreso mensual promedio <b>${_creditPesos(inc.avg)}</b></span>
    </div>
    <div class="df-sub" id="dfDebtBasis">Según el promedio de ${inc.n} ${inc.n === 1 ? 'mes cerrado' : 'meses cerrados'}.</div>`;
  }
  return `<div class="df-block" id="dfDebtIncome"><div class="df-h">Deuda sobre ingresos</div>${body}</div>`;
}

function _dfNetDebtHtml(debt) {
  const nw = calcNetWorth();
  let body;
  if (debt <= 0) {
    body = '<div class="df-big">Sin deuda</div>';
  } else if (nw > 0) {
    const r = nw / debt;
    body = `<div class="df-big">Tu patrimonio equivale a ${Math.abs(r - 1) < 0.05 ? '1 vez' : _dfNum(r) + ' veces'} tu deuda</div>
      <div class="df-nums"><span>Patrimonio <b>${_creditPesos(nw)}</b></span><span>Deuda <b>${_creditPesos(debt)}</b></span></div>`;
  } else {
    body = `<div class="df-big df-neg">Tu patrimonio es ${nw < 0 ? 'negativo' : 'cero'}: ${_creditPesos(nw)}</div>
      <div class="df-sub">No alcanza para cubrir la deuda de <b>${_creditPesos(debt)}</b>.</div>`;
  }
  return `<div class="df-block" id="dfNetDebt"><div class="df-h">Patrimonio sobre deuda</div>${body}</div>`;
}

function _dfFlowHtml(today) {
  const f = dfMonthFlow(today);
  const mo = _CC_MONTHS[+today.slice(5, 7) - 1];
  if (!f.income.count && !f.expense.count) {
    return `<div class="df-block" id="dfFlow"><div class="df-big">Sin movimientos este mes</div>
      <div class="df-sub">Cuando cargues ingresos o gastos de ${mo}, vas a ver acá el resumen.</div></div>`;
  }
  const avgDay = (s) => _creditPesos(Math.round(s.total / f.day));
  const avgRec = (s) => (s.count ? _creditPesos(Math.round(s.total / s.count)) : '—');
  const flow = _ccRound(f.income.total - f.expense.total);
  const flowTxt = (flow > 0 ? '+' : '') + _creditPesos(flow);
  const flowMsg = flow > 0 ? 'Entró más de lo que salió' : flow < 0 ? 'Salió más de lo que entró' : 'Entró lo mismo que salió';
  return `<div class="df-block" id="dfFlow">
    <div class="df-sub">Del 1 al ${f.day} de ${mo}${f.day === 1 ? ' (1 día)' : ` (${f.day} días)`}.</div>
    <table class="df-table" id="dfFlowTable">
      <thead><tr><th scope="col"><span class="sr-only">Concepto</span></th><th scope="col">Ingreso</th><th scope="col">Gasto</th></tr></thead>
      <tbody>
        <tr><th scope="row">Cantidad de registros</th><td>${f.income.count}</td><td>${f.expense.count}</td></tr>
        <tr><th scope="row">Promedio por día</th><td>${avgDay(f.income)}</td><td>${avgDay(f.expense)}</td></tr>
        <tr><th scope="row">Promedio por registro</th><td>${avgRec(f.income)}</td><td>${avgRec(f.expense)}</td></tr>
        <tr class="df-total"><th scope="row">Total</th><td>${_creditPesos(f.income.total)}</td><td>${_creditPesos(f.expense.total)}</td></tr>
      </tbody>
    </table>
    <div class="df-flow" id="dfFlowNet"><span>Flujo de efectivo</span><b>${flowTxt}</b></div>
    <div class="df-sub">${flowMsg}.</div></div>`;
}

function renderDebtFlow() {
  const el = document.getElementById('debtFlowBody');
  if (!el) return;
  const today = getActiveDate();
  const debt = calcCreditUsed();
  el.innerHTML = _dfDebtIncomeHtml(debt, today) + _dfNetDebtHtml(debt);
}

// "Flujo del mes": bloque plegable dentro de Movimientos (mismos números de siempre).
function renderMonthFlow() {
  const el = document.getElementById('txnFlowBody');
  if (el) el.innerHTML = _dfFlowHtml(getActiveDate());
}

// Cambiar el cierre/vencimiento de una tarjeta con compras movería todas sus cuotas de fecha.
function _cardHasCharges(cardId) {
  return !!cardId && (S.cardCharges || []).some(ch => ch && ch.cardId === cardId);
}

function openCardModal(id) {
  const c = id ? (S.cards || []).find(x => x.id === id) : null;
  document.getElementById('cardId').value = c ? c.id : '';
  document.getElementById('cardModalTitle').textContent = c ? 'Editar tarjeta' : 'Agregar tarjeta';
  document.getElementById('cardName').value = c ? c.name : '';
  document.getElementById('cardLimit').value = c ? c.limit : '';
  document.getElementById('cardCloseDay').value = c ? c.closeDay : '';
  document.getElementById('cardDueDay').value = c ? c.dueDay : '';
  document.getElementById('cardOpeningUsed').value = c ? c.openingUsed : '';
  document.getElementById('cardPayAccount').innerHTML = _ccAccountOptions(c && c.payAccountId, '— Todavía no elijo —');
  document.getElementById('cardErr').textContent = '';
  const locked = !!c && _cardHasCharges(c.id);
  document.getElementById('cardCloseDay').disabled = locked;
  document.getElementById('cardDueDay').disabled = locked;
  document.getElementById('cardCycleNote').style.display = locked ? '' : 'none';
  openModal('modal-card');
}

function saveCard() {
  const err = (m) => { document.getElementById('cardErr').textContent = m; };
  const name = document.getElementById('cardName').value.trim();
  const limit = Number(document.getElementById('cardLimit').value);
  const closeDay = Number(document.getElementById('cardCloseDay').value);
  const dueDay = Number(document.getElementById('cardDueDay').value);
  const usedRaw = document.getElementById('cardOpeningUsed').value.trim();
  const openingUsed = usedRaw === '' ? 0 : Number(usedRaw);
  const payAccountId = document.getElementById('cardPayAccount').value;
  const okDay = (d) => Number.isInteger(d) && d >= 1 && d <= 31;
  if (!name) return err('Escribí el nombre de la tarjeta');
  if (!(limit > 0) || !isFinite(limit)) return err('El límite tiene que ser mayor a cero');
  if (!okDay(closeDay)) return err('El día de cierre tiene que ser un número del 1 al 31');
  if (!okDay(dueDay)) return err('El día de vencimiento tiene que ser un número del 1 al 31');
  if (!(openingUsed >= 0) || !isFinite(openingUsed)) return err('Lo que ya usaste no puede ser negativo');
  if (!Array.isArray(S.cards)) S.cards = [];
  const id = document.getElementById('cardId').value;
  const data = { name, limit: Math.round(limit * 100) / 100, closeDay, dueDay, openingUsed: Math.round(openingUsed * 100) / 100 };
  const existing = id ? S.cards.find(c => c.id === id) : null;
  if (existing && _cardHasCharges(existing.id) && (closeDay !== existing.closeDay || dueDay !== existing.dueDay)) {
    return err('No se pueden cambiar el cierre ni el vencimiento mientras la tarjeta tenga compras cargadas. Borrá las compras o creá una tarjeta nueva.');
  }
  if (existing) {
    Object.assign(existing, data);
    if (payAccountId) existing.payAccountId = payAccountId; else delete existing.payAccountId;
  } else {
    S.cards.push({ id: uid(), ...data, ...(payAccountId ? { payAccountId } : {}) });
  }
  snapshotNW(); saveState(); renderFinanzasTab(); closeModal('modal-card');
  showToast(existing ? 'Tarjeta actualizada' : 'Tarjeta agregada');
}

function deleteCard(id) {
  const c = (S.cards || []).find(x => x.id === id);
  if (!c || !confirm(`¿Eliminar la tarjeta "${c.name}"?`)) return;
  S.cards = S.cards.filter(x => x.id !== id);
  snapshotNW(); saveState(); renderFinanzasTab();
}

// ── Compra con tarjeta (dentro del formulario de Movimientos) ──
// El medio de pago de un gasto puede ser una cuenta o una tarjeta (valor "card:<id>"). Al elegir tarjeta
// aparece #txnCardPanel con las modalidades; fecha de compra, monto, descripción y categoría salen del formulario.
const _TXN_CARD_PREFIX = 'card:';
const _txnPayCardId = () => {
  const el = document.getElementById('txnAccount');
  const v = el ? el.value : '';
  return v.startsWith(_TXN_CARD_PREFIX) ? v.slice(_TXN_CARD_PREFIX.length) : null;
};

// Opciones del medio de pago: cuentas (como siempre, más efectivo) y, solo en gastos, una por tarjeta.
// Las mismas cuentas para el alta y para la edición de un movimiento (la edición no ofrece tarjetas).
function _txnAccountOptionsHtml(cards) {
  const accs = (S.accounts || []).filter(a => a.type === 'bank' || a.type === 'invest' || a.type === 'cash');
  return '<option value="">— Ninguna —</option>'
    + accs.map(a => `<option value="${escHtml(a.id)}">${a.icon || '🏦'} ${escHtml(a.name)}</option>`).join('')
    + '<option value="prestamos_amorcito">💙 Prestamos amorcito</option>'
    + (cards || []).map(c => `<option value="${_TXN_CARD_PREFIX}${escHtml(c.id)}">💳 ${escHtml(c.name)}</option>`).join('');
}

function fillTxnPaymentSelect(selected) {
  const sel = document.getElementById('txnAccount');
  if (!sel) return;
  const expense = document.getElementById('txnType').value === 'expense';
  sel.innerHTML = _txnAccountOptionsHtml(expense ? (S.cards || []) : []);
  sel.value = [...sel.options].some(o => o.value === selected) ? selected : '';
}

// La llama openModal('modal-add-txn'): deja el formulario en su estado inicial.
function initTxnForm() {
  const g = (id) => document.getElementById(id);
  fillTxnPaymentSelect('');
  g('ccChDate').value = getActiveDate();
  g('ccChMode').value = 'now1';
  g('ccChInst').value = '3';
  g('ccChMonths').value = '3';
  g('ccChToAcc').innerHTML = _ccAccountOptions('', '— Elegí una cuenta —');
  g('ccChErr').textContent = '';
  setTxnDiscount(0);   // el formulario siempre arranca en "Sin descuento"
  onTxnPaymentChange();
}

function onTxnTypeChange() {
  fillTxnPaymentSelect(document.getElementById('txnAccount').value);
  onTxnPaymentChange();
}

function onTxnPaymentChange() {
  const expense = document.getElementById('txnType').value === 'expense';
  const card = !!_txnPayCardId();
  document.getElementById('txnAccountLbl').textContent = expense ? 'Medio de pago' : 'Cuenta';
  document.getElementById('txnCardPanel').style.display = card ? '' : 'none';
  document.getElementById('txnCurrencyRow').style.display = card ? 'none' : '';   // las compras con tarjeta son en pesos
  if (card) onCardChargeModeChange();
  else document.getElementById('txnCategoryRow').style.display = '';
  syncTxnDiscount();
  updateTxnMonthNotice();
}

// ── Descuento porcentual (solo gastos reales, no "plata de un tercero") ──
// El usuario carga el TOTAL; todo lo demás (movimiento, saldo, cargo de tarjeta, cuotas) usa el final con descuento.
// Final = total × (1 − pct/100) redondeado a centavos, mitad hacia arriba (cuentas en centavos enteros: sin error de coma flotante).
const _TXN_DISCOUNTS = [10, 15, 20, 25, 50];
function _discountFinal(total, pct) {
  return Math.floor((Math.round(total * 100) * (100 - pct) + 50) / 100) / 100;
}
function _txnDiscountAllowed() {
  if (document.getElementById('txnType').value !== 'expense') return false;
  return !_txnPayCardId() || document.getElementById('ccChMode').value !== 'advance';
}
// Porcentaje elegido (0 si no hay o si el formulario no admite descuento).
function _txnDiscountPct() {
  if (!_txnDiscountAllowed()) return 0;
  const el = document.querySelector('#txnDiscount [aria-checked="true"]');
  const p = el ? Number(el.dataset.pct) : 0;
  return _TXN_DISCOUNTS.includes(p) ? p : 0;
}
function setTxnDiscount(pct) {
  pct = _TXN_DISCOUNTS.includes(+pct) ? +pct : 0;
  document.querySelectorAll('#txnDiscount button').forEach(b => {
    const on = Number(b.dataset.pct) === pct;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  });
  updateTxnDiscountPreview();
  updateCardChargePreview();
}
// Radiogrupo: las flechas mueven y eligen; Espacio/Enter eligen el chip enfocado (son botones).
function onTxnDiscountKey(e) {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  const btns = [...document.querySelectorAll('#txnDiscount button')];
  let i = btns.indexOf(document.activeElement);
  if (i < 0) return;
  if (e.key === 'Home') i = 0;
  else if (e.key === 'End') i = btns.length - 1;
  else if (keys[e.key]) i = (i + keys[e.key] + btns.length) % btns.length;
  else return;
  e.preventDefault();
  setTxnDiscount(btns[i].dataset.pct);
  btns[i].focus();
}
function updateTxnDiscountPreview() {
  const el = document.getElementById('txnDiscountPreview');
  if (!el) return;
  const pct = _txnDiscountPct();
  if (!pct) { el.textContent = ''; return; }
  const total = Number(document.getElementById('txnAmount').value);
  if (!(total > 0) || !_ccTwoDecimals(total)) { el.textContent = 'Cargá el total para ver cuánto pagás.'; return; }
  const fin = _discountFinal(total, pct);
  el.textContent = `Total ${_ccPesos(total)} → pagás ${_ccPesos(fin)} (ahorrás ${_ccPesos(_ccRound(total - fin))})`;
}
// Muestra u oculta el selector según el tipo y el medio de pago; si ya no corresponde, vuelve a "Sin descuento".
function syncTxnDiscount() {
  const ok = _txnDiscountAllowed();
  document.getElementById('txnDiscountRow').style.display = ok ? '' : 'none';
  if (!ok) setTxnDiscount(0); else updateTxnDiscountPreview();
}
function onTxnAmountInput() { updateTxnDiscountPreview(); updateCardChargePreview(); }
// Etiqueta chica "−20%" junto al monto final (movimientos y compras con tarjeta que tienen descuento).
function _discTagHtml(rec) {
  const p = Number(rec && rec.discountPct);
  if (!(p > 0)) return '';
  const orig = Number(rec.amountOriginal);
  const label = (orig > 0 ? `Total ${_ccPesos(orig)}, ` : '') + `descuento ${p}%`;
  return `<span class="disc-tag" role="img" aria-label="${label}" title="${label}">−${p}%</span>`;
}

// "+ Compra con tarjeta" de la pestaña Compras: abre Movimientos como gasto con la tarjeta ya elegida
// (si hay una sola). Con varias, deja el medio de pago para que se elija.
function openTxnCardForm() {
  const cards = S.cards || [];
  if (!cards.length) { showToast('Primero agregá una tarjeta'); return; }
  openModal('modal-add-txn');
  document.getElementById('txnType').value = 'expense';
  fillTxnPaymentSelect(cards.length === 1 ? _TXN_CARD_PREFIX + cards[0].id : '');
  onTxnPaymentChange();
  if (cards.length > 1) document.getElementById('txnAccount').focus();
}

function onCardChargeModeChange() {
  const mode = document.getElementById('ccChMode').value;
  const show = (id, on) => { document.getElementById(id).style.display = on ? '' : 'none'; };
  show('ccChInstRow', mode !== 'now1');
  show('ccChMonthsRow', mode === 'deferred');
  show('ccChToAccRow', mode === 'advance');
  show('txnCategoryRow', mode !== 'advance');
  document.getElementById('ccChModeHint').textContent = _CC_MODE_HINTS[mode] || '';
  syncTxnDiscount();   // "plata de un tercero" no es gasto: sin descuento
  updateCardChargePreview();
}

function _ccReadCharge() {
  const v = (id) => document.getElementById(id).value;
  const mode = v('ccChMode');
  // Con descuento, el cargo guarda el FINAL (lo que usan cuotas, límite y gasto) y el total cargado como referencia.
  const total = Number(v('txnAmount')), pct = _txnDiscountPct();
  const disc = pct > 0 && total > 0 && _ccTwoDecimals(total);
  const ch = {
    cardId: _txnPayCardId() || '', date: v('ccChDate'), amount: disc ? _discountFinal(total, pct) : total, mode,
    installments: mode === 'now1' ? 1 : Number(v('ccChInst')),
    category: mode === 'advance' ? '' : v('txnCategory'), name: v('txnName').trim(),
  };
  if (mode === 'deferred') ch.consumeMonths = Number(v('ccChMonths'));
  if (mode === 'advance') ch.toAccountId = v('ccChToAcc');
  if (disc) { ch.discountPct = pct; ch.amountOriginal = total; }
  return ch;
}

// Error de la compra tal como está en el formulario, o null si se puede guardar.
function _ccChargeError(ch) {
  const card = (S.cards || []).find(c => c.id === ch.cardId);
  if (!card) return 'Elegí una tarjeta.';
  const vc = CMTarjetas.validateCard(card);
  if (!vc.ok) return vc.error;
  if (!_ccTwoDecimals(ch.amount)) return 'El monto puede tener como máximo 2 decimales.';
  if (ch.name.length > 80) return 'La descripción puede tener hasta 80 caracteres.';
  const v = CMTarjetas.validateCharge(ch);
  if (!v.ok) return v.error;
  if (ch.mode === 'advance' && !_ccAccounts().some(a => a.id === ch.toAccountId)) return 'Elegí una cuenta en pesos donde entra la plata.';
  return null;
}

function updateCardChargePreview() {
  const el = document.getElementById('ccChPreview');
  if (!el || !_txnPayCardId()) return;
  const ch = _ccReadCharge();
  const card = (S.cards || []).find(c => c.id === ch.cardId);
  if (!card || _ccChargeError(ch)) { el.innerHTML = '<span class="cc-hint">Completá los datos para ver cómo queda.</span>'; return; }
  const st = CMTarjetas.statementFor(card, ch.date);
  const fx = CMTarjetas.chargeEffects(card, ch);
  const n = fx.installments.length;
  const cuotas = fx.installments.map(q => `<li>${n === 1 ? 'Pago único' : `Cuota ${q.n} de ${n}`} · vence el ${_ccDate(q.dueDate)} · ${_ccPesos(q.amount)}</li>`).join('');
  let gasto;
  if (ch.mode === 'advance') {
    const acc = (S.accounts || []).find(a => a.id === ch.toAccountId);
    gasto = `<div>No es ingreso ni gasto. Entran ${_ccPesos(ch.amount)} a ${escHtml(acc ? acc.name : 'la cuenta')} y usás ${_ccPesos(ch.amount)} de tu límite.</div>`;
  } else {
    const shown = fx.expenses.slice(0, 12).map(e => `<li>${_ccMonthLabel(e.month)} · ${_ccPesos(e.amount)}</li>`).join('');
    const more = fx.expenses.length > 12 ? `<li>…y ${fx.expenses.length - 12} meses más</li>` : '';
    gasto = `<div class="cc-pv-title">Gasto por mes</div><ul class="cc-chg-list">${shown}${more}</ul>`;
  }
  el.innerHTML = `<div>Cae en el resumen que cierra el ${_ccDate(st.closeDate)} y vence el ${_ccDate(st.dueDate)}.</div>
    <div class="cc-pv-title">Qué pagás</div><ul class="cc-chg-list">${cuotas}</ul>${gasto}`;
}

// Guardar de un gasto cuyo medio de pago es una tarjeta (lo llama addTransaction).
function _saveTxnCardCharge() {
  // Doble clic: la segunda llamada llega con el formulario ya cerrado y no hace nada.
  if (!document.getElementById('modal-add-txn').classList.contains('open')) return;
  const errEl = document.getElementById('ccChErr');
  const ch = _ccReadCharge();
  const error = _ccChargeError(ch);
  if (error) { errEl.textContent = error; return; }
  errEl.textContent = '';
  ch.id = uid();
  if (ch.mode === 'now1') delete ch.installments;
  if (!Array.isArray(S.cardCharges)) S.cardCharges = [];
  S.cardCharges.push(ch);
  if (ch.mode === 'advance') {
    const acc = S.accounts.find(a => a.id === ch.toAccountId);
    acc.balance = _ccRound(acc.balance + ch.amount);
  }
  snapshotNW();   // cambia el crédito usado (y, si es adelanto, el saldo de la cuenta)
  closeModal('modal-add-txn');
  document.getElementById('txnName').value = '';
  document.getElementById('txnAmount').value = '';
  materializeCardExpenses();
  saveState(); renderFinanzasTab();
  const card = S.cards.find(c => c.id === ch.cardId);
  if (cardUsed(card) > card.limit) showToast('Compra guardada. Ojo: te pasaste del límite de la tarjeta', 5000);
  else showToast('Compra con tarjeta guardada');
}

function deleteCardCharge(id) {
  const ch = (S.cardCharges || []).find(c => c.id === id);
  if (!ch) return;
  const card = (S.cards || []).find(c => c.id === ch.cardId);
  const today = getActiveDate();
  const paidKeys = new Set((S.cardPayments || []).map(p => p && p.key));
  const paid = (card ? CMTarjetas.installmentSchedule(card, ch) : [])
    .filter(q => q.dueDate <= today && paidKeys.has(`auto:${ch.cardId}:${q.dueDate}`));
  const acc = ch.mode === 'advance' ? S.accounts.find(a => a.id === ch.toAccountId) : null;
  let msg = `¿Borrar la compra "${ch.name || 'Compra con tarjeta'}" de ${_ccPesos(ch.amount)}? Se quitan sus cuotas y sus gastos.`;
  if (acc) msg += `\n\nSe descuentan ${_ccPesos(ch.amount)} de "${acc.name}", que son los que habían entrado.`;
  if (paid.length) {
    const sum = paid.reduce((s, q) => s + q.amount, 0);
    msg += `\n\nOjo: ya se pagaron ${paid.length} ${paid.length === 1 ? 'cuota' : 'cuotas'} (${_ccPesos(_ccRound(sum))}). Esos pagos no se deshacen: la plata ya salió de tu cuenta y quedan registrados.`;
  }
  if (!confirm(msg)) return;
  S.cardCharges = S.cardCharges.filter(c => c.id !== id);
  S.transactions = (S.transactions || []).filter(t => t.cardChargeId !== id);
  if (acc) acc.balance = _ccRound(acc.balance - ch.amount);
  snapshotNW();
  saveState(); renderFinanzasTab();
  showToast(paid.length ? 'Compra borrada. Los pagos ya hechos quedaron registrados' : 'Compra borrada', 4500);
}

// ── Pago de resumen manual (lo que ya se debía antes de empezar a usar el Centro, o pagos anticipados) ──
function openCardPaymentModal() {
  const cards = S.cards || [];
  if (!cards.length) { showToast('Primero agregá una tarjeta'); return; }
  document.getElementById('ccPayCard').innerHTML = cards.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('');
  document.getElementById('ccPayAmount').value = '';
  document.getElementById('ccPayDate').value = getActiveDate();
  document.getElementById('ccPayNote').value = '';
  document.getElementById('ccPayErr').textContent = '';
  onCardPaymentCardChange();
  openModal('modal-card-payment');
}

function onCardPaymentCardChange() {
  const card = (S.cards || []).find(c => c.id === document.getElementById('ccPayCard').value);
  document.getElementById('ccPayAccount').innerHTML = _ccAccountOptions(card && card.payAccountId, '— Elegí una cuenta —');
  updateCardPaymentWarn();
}

// Avisos en vivo (no bloquean): paga más de lo usado, o deja la cuenta en negativo.
function updateCardPaymentWarn() {
  const el = document.getElementById('ccPayWarn');
  const card = (S.cards || []).find(c => c.id === document.getElementById('ccPayCard').value);
  const amount = Number(document.getElementById('ccPayAmount').value);
  const acc = S.accounts.find(a => a.id === document.getElementById('ccPayAccount').value);
  const msgs = [];
  if (card && amount > 0 && amount > cardUsed(card)) msgs.push(`Ojo: es más de lo que figura usado en ${card.name} (${_ccPesos(cardUsed(card))}). Igual se puede registrar.`);
  if (acc && amount > 0 && acc.balance - amount < 0) msgs.push(`Ojo: "${acc.name}" va a quedar en negativo. Igual se puede registrar.`);
  el.textContent = msgs.join(' ');
  el.style.display = msgs.length ? '' : 'none';
}

function saveCardPayment() {
  if (!document.getElementById('modal-card-payment').classList.contains('open')) return;
  const errEl = document.getElementById('ccPayErr');
  const err = (m) => { errEl.textContent = m; };
  const card = (S.cards || []).find(c => c.id === document.getElementById('ccPayCard').value);
  const amount = Number(document.getElementById('ccPayAmount').value);
  const acc = _ccAccounts().find(a => a.id === document.getElementById('ccPayAccount').value);
  const date = document.getElementById('ccPayDate').value;
  const note = document.getElementById('ccPayNote').value.trim();
  if (!card) return err('Elegí una tarjeta.');
  if (!(amount > 0) || !isFinite(amount)) return err('El monto tiene que ser mayor a 0.');
  if (!_ccTwoDecimals(amount)) return err('El monto puede tener como máximo 2 decimales.');
  if (!acc) return err('Elegí la cuenta en pesos desde la que se paga.');
  const dt = new Date(date + 'T00:00:00');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(dt) || localStr(dt) !== date) return err('Fecha inválida.');
  if (date > getActiveDate()) return err('La fecha del pago no puede ser futura.');
  errEl.textContent = '';
  const over = amount > cardUsed(card);
  const id = uid();
  if (!Array.isArray(S.cardPayments)) S.cardPayments = [];
  S.cardPayments.push({ id, key: `manual:${id}`, cardId: card.id, date, amount, accountId: acc.id, kind: 'manual', note });
  acc.balance = _ccRound(acc.balance - amount);
  snapshotNW();
  closeModal('modal-card-payment');
  saveState(); renderFinanzasTab();
  showToast(over ? 'Pago registrado. Ojo: es más de lo que figuraba usado' : 'Pago registrado', over ? 5000 : 3000);
}

function renderWishlist() {
  const list=document.getElementById('wishList');
  const empty=document.getElementById('wishEmpty');
  const nw=calcNetWorth();
  _populateWishCatDatalist();
  if (!S.wishlist.length) { list.innerHTML=''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  const _esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  const _attr = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const PRIO_ORDER = ['urgente','importante','normal','poco_importante','irrelevante'];
  const PRIO_INFO  = {
    urgente:         { label:'Urgente',        color:'var(--danger)' },
    importante:      { label:'Importante',     color:'var(--warn)'   },
    // Los tres niveles bajos comparten color legible (WCAG AA): la jerarquía la
    // dice la etiqueta y el puntaje, no un gris que no se lee.
    normal:          { label:'Normal',         color:'var(--ts)'     },
    poco_importante: { label:'Poco importante',color:'var(--ts)'     },
    irrelevante:     { label:'Irrelevante',    color:'var(--ts)'     },
  };

  // Sort: by category (alpha, "Sin categoría" last), luego por importancia dentro
  // de la categoría: puntaje (5→1, deriva de la prioridad si no está seteado),
  // desempate por prioridad y por monto ascendente — mismo criterio que el Top 5.
  const sorted = [...S.wishlist].sort((a,b) => {
    const cA = a.category || '￿', cB = b.category || '￿';
    if (cA !== cB) return cA.localeCompare(cB, 'es');
    const d = _wishScore(b) - _wishScore(a);
    if (d) return d;
    const p = (PRIO_ORDER.indexOf(a.priority||'normal')) - (PRIO_ORDER.indexOf(b.priority||'normal'));
    if (p) return p;
    return (+a.amount || 0) - (+b.amount || 0);
  });

  // Group by category
  const groups = {}, groupOrder = [];
  for (const w of sorted) {
    const cat = w.category || 'Sin categoría';
    if (!groups[cat]) { groups[cat]=[]; groupOrder.push(cat); }
    groups[cat].push(w);
  }

  const DETAIL_SVG = `<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
  const EDIT_SVG   = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const DEL_SVG    = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`;

  const catId = cat => 'wcat_' + cat.replace(/[^a-zA-Z0-9]/g, '_');
  // Color por categoría: token del tema (--wcat-1..8), estable por orden alfabético.
  const CAT_SLOTS = 8;

  let html = '';
  for (const cat of groupOrder) {
    const cid = catId(cat);
    const collapsed = localStorage.getItem('wish_cat_' + cid) === '1';
    // "Sin categoría" queda neutra: no compite con las categorías reales.
    const catVars = cat === 'Sin categoría'
      ? '--wcat:var(--ts)'
      : `--wcat:var(--wcat-${(groupOrder.indexOf(cat) % CAT_SLOTS) + 1})`;
    html += `<div class="wish-category-hdr${collapsed?' collapsed':''}" style="${catVars}" role="button" tabindex="0"
      aria-expanded="${collapsed?'false':'true'}" aria-controls="${cid}"
      onclick="toggleWishCat('${cid}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleWishCat('${cid}');}">
      <span class="wish-cat-name"><span class="wish-cat-dot"></span>${_esc(cat)}<span class="wish-cat-count">${groups[cat].length}</span></span>
      <span class="wish-cat-chevron${collapsed?' collapsed':''}" aria-hidden="true">▾</span>
    </div>`;
    html += `<div class="wish-cat-body${collapsed?' collapsed':''}" style="${catVars}" id="${cid}">`;
    for (const w of groups[cat]) {
      const pctOfNW = nw > 0 ? (w.amount / nw * 100).toFixed(1) : '∞';
      const saved   = nw > 0 ? Math.min(100, nw / w.amount * 100) : 0;
      const affordable = nw >= w.amount;
      const pi = PRIO_INFO[w.priority||'normal'] || PRIO_INFO.normal;
      const hasNotes = w.notes && w.notes.trim();
      html += `<div class="wish-row">
        <div class="flex items-center justify-between">
          <div class="wish-name">${_esc(w.name)}${affordable?' <span class="pill pill-ok" style="font-size:var(--fs-12-5)">¡Puedes comprarlo!</span>':''}</div>
          <div class="flex gap-8 items-center">
            <span class="wish-priority-badge" style="color:${pi.color}">${pi.label}</span>
            <span class="mono text-sm">${fmtMoney(w.amount,w.currency)}</span>
            ${hasNotes?`<button class="icon-btn" onclick="toggleWishDetail('${w.id}')" title="Detalles" aria-label="Detalles de ${_attr(w.name)}">${DETAIL_SVG}</button>`:''}
            <button class="icon-btn" onclick="openEditWish('${w.id}')" aria-label="Editar ${_attr(w.name)}">${EDIT_SVG}</button>
            <button class="icon-btn" onclick="deleteWish('${w.id}')" aria-label="Eliminar ${_attr(w.name)}">${DEL_SVG}</button>
          </div>
        </div>
        <div class="wish-pct">Representa el <strong>${pctOfNW}%</strong> de tu patrimonio · Ahorrado: ${saved.toFixed(0)}%</div>
        <div class="wish-bar"><div class="prog-bar"><div class="prog-fill" style="width:${saved}%;background:${affordable?'var(--ok)':'var(--accent)'}"></div></div></div>
        <div class="wish-score"><span class="wish-score-lbl">Puntaje</span>${[1,2,3,4,5].map(n=>`<button class="ws-dot${n<=_wishScore(w)?' on':''}" onclick="setWishScore('${w.id}',${n})" title="${n} de 5" aria-label="Puntaje ${n}"></button>`).join('')}</div>
        ${hasNotes?`<div class="wish-detail-panel" id="wish-detail-${w.id}"><div class="wish-detail-body">${_esc(w.notes)}</div></div>`:''}
      </div>`;
    }
    html += `</div>`;
  }
  list.innerHTML = html;
  renderWishTop5();
}

// Categorías: 9 predefinidas + cualquier categoría nueva ya usada en la wishlist
// (el campo es de texto libre con autocompletado, así el usuario "crea" categorías
// con solo escribir un nombre nuevo al agregar/editar un objetivo).
const WISH_CAT_DEFAULTS = ['Salud','Ropa','Comida','Deporte','Tecnología','Hogar','Trabajo','Estudio','Otros'];
function _populateWishCatDatalist() {
  const dl = document.getElementById('wishCatList');
  if (!dl) return;
  const used = (S.wishlist || []).map(w => w.category).filter(Boolean);
  const all = [...new Set([...WISH_CAT_DEFAULTS, ...used])].sort((a,b) => a.localeCompare(b, 'es'));
  dl.innerHTML = all.map(c => `<option value="${String(c).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"></option>`).join('');
}

// Puntaje de adquisición (1–5). Si no está seteado, se deriva de la prioridad.
const _WISH_PRIO_SCORE = { urgente: 5, importante: 4, normal: 3, poco_importante: 2, irrelevante: 1 };
function _wishScore(w) {
  if (w.score >= 1 && w.score <= 5) return w.score;
  return _WISH_PRIO_SCORE[w.priority || 'normal'] || 3;
}
function setWishScore(id, n) {
  const w = (S.wishlist || []).find(x => x.id === id); if (!w) return;
  w.score = (w.score === n) ? 0 : n; // volver a tocar el mismo punto lo limpia (vuelve a derivar de prioridad)
  saveState(); renderWishlist(); renderWishTop5();
}
// Top 5 adquisiciones más importantes/urgentes (por puntaje) — vista de sección.
function renderWishTop5() {
  const body = document.getElementById('wishTop5Body'); if (!body) return;
  const items = [...(S.wishlist || [])].sort((a, b) => _wishScore(b) - _wishScore(a) || ((+a.amount || 0) - (+b.amount || 0))).slice(0, 5);
  if (!items.length) { body.innerHTML = '<div class="wt-empty">Sin objetivos de adquisición. Abrí <b>Adquisición</b> (📈 → Adquisición) para cargarlos y puntuarlos.</div>'; return; }
  const nw = (typeof calcNetWorth === 'function') ? calcNetWorth() : 0;
  body.innerHTML = items.map((w, i) => {
    const sc = _wishScore(w), affordable = nw >= (+w.amount || 0);
    return `<div class="wt-item">
      <span class="wt-rank">${i + 1}</span>
      <div class="wt-body">
        <div class="wt-name">${escHtml(w.name)}${affordable ? '<span class="wt-ok">alcanzable</span>' : ''}</div>
        <div class="wt-dots" aria-label="Puntaje ${sc} de 5">${[1, 2, 3, 4, 5].map(n => `<span class="wt-dot${n <= sc ? ' on' : ''}"></span>`).join('')}</div>
      </div>
      <span class="wt-amt mono">${fmtMoney(w.amount, w.currency)}</span>
    </div>`;
  }).join('');
}

function toggleWishCat(cid) {
  const body    = document.getElementById(cid);
  const hdr     = body?.previousElementSibling;
  const chevron = hdr?.querySelector('.wish-cat-chevron');
  if (!body) return;
  const nowCollapsed = body.classList.toggle('collapsed');
  if (chevron) chevron.classList.toggle('collapsed', nowCollapsed);
  if (hdr) { hdr.classList.toggle('collapsed', nowCollapsed); hdr.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true'); }
  localStorage.setItem('wish_cat_' + cid, nowCollapsed ? '1' : '');
}

function toggleWishDetail(id) {
  const p = document.getElementById('wish-detail-'+id);
  if (p) p.classList.toggle('open');
}

function addWish() {
  const name = document.getElementById('wishName').value.trim();
  if (!name) { showToast('Escribe el nombre'); return; }
  S.wishlist.push({
    id:       uid(),
    name,
    amount:   +document.getElementById('wishAmount').value || 0,
    currency: document.getElementById('wishCurrency').value,
    category: document.getElementById('wishCategory').value,
    priority: document.getElementById('wishPriority').value || 'normal',
    notes:    document.getElementById('wishNotes').value.trim(),
  });
  saveState(); renderWishlist(); closeModal('modal-add-wish');
  document.getElementById('wishName').value  = '';
  document.getElementById('wishNotes').value = '';
  showToast('Objetivo agregado');
}
function deleteWish(id) {
  const idx = S.wishlist.findIndex(w=>w.id===id);
  const wish = idx > -1 ? S.wishlist[idx] : null;
  S.wishlist=S.wishlist.filter(w=>w.id!==id); saveState(); renderWishlist();
  if (window.CMUndo && wish) CMUndo.registrar({
    descripcion: 'Objetivo eliminado',
    deshacer: () => { S.wishlist.splice(idx, 0, wish); renderWishlist(); }
  });
}

// ── Fixed Expenses ──
function renderFixedExpenses() {
  const list = document.getElementById('fixedExpenseList');
  const empty = document.getElementById('fixedExpenseEmpty');
  if (!list) return;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const log = S.fixedExpenseLog[monthKey] || {};
  if (!S.fixedExpenses.length) {
    list.innerHTML = ''; empty.classList.remove('hidden');
    document.getElementById('fixedExpenseTotal').textContent = '$0'; return;
  }
  empty.classList.add('hidden');
  let total = 0;
  list.innerHTML = S.fixedExpenses.map(exp => {
    const paid = !!log[exp.id];
    total += exp.amount;
    return `<div class="sub-row">
      <div class="sub-info">
        <div class="sub-name">${exp.name}</div>
        <div class="sub-detail">Día ${exp.dayOfMonth} · ${fmtMoney(exp.amount, exp.currency)}</div>
      </div>
      <div class="flex gap-8 items-center">
        ${paid
          ? '<span class="pill pill-ok" style="font-size:var(--fs-12-5)">✓ Pagado</span>'
          : `<button class="btn btn-ghost btn-sm" onclick="markFixedExpensePaid('${exp.id}')" style="font-size:var(--fs-12-5)">Marcar pagado</button>`}
        <button class="icon-btn" onclick="openEditFixedExpense('${exp.id}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="icon-btn" onclick="deleteFixedExpense('${exp.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
      </div>
    </div>`;
  }).join('');
  document.getElementById('fixedExpenseTotal').textContent = fmtMoney(total, 'ARS');
}

function addFixedExpense() {
  const name = document.getElementById('fexpName').value.trim();
  if (!name) { showToast('Escribe el nombre'); return; }
  S.fixedExpenses.push({
    id: uid(), name,
    amount: +document.getElementById('fexpAmount').value || 0,
    currency: document.getElementById('fexpCurrency').value,
    dayOfMonth: +document.getElementById('fexpDay').value || 1
  });
  saveState(); renderFixedExpenses(); closeModal('modal-add-fixed-expense');
  document.getElementById('fexpName').value = ''; document.getElementById('fexpAmount').value = '';
  showToast('Gasto fijo agregado');
}

function deleteFixedExpense(id) {
  const idx = S.fixedExpenses.findIndex(e => e.id === id);
  const exp = idx > -1 ? S.fixedExpenses[idx] : null;
  S.fixedExpenses = S.fixedExpenses.filter(e => e.id !== id);
  saveState(); renderFixedExpenses();
  if (window.CMUndo && exp) CMUndo.registrar({
    descripcion: 'Gasto fijo eliminado',
    deshacer: () => { S.fixedExpenses.splice(idx, 0, exp); renderFixedExpenses(); }
  });
}

function markFixedExpensePaid(id) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  if (!S.fixedExpenseLog[monthKey]) S.fixedExpenseLog[monthKey] = {};
  S.fixedExpenseLog[monthKey][id] = true;
  saveState(); renderFixedExpenses(); showToast('Marcado como pagado');
}

// ════════════════════════════════════════════════════════
// FONDOS DE COMPRA — gasto fijo mensual acumulable sujeto a condición
// Ver specs/fondos-de-compra.md
//   S.purchaseFunds       [{ id, name, emoji, monthlyAmount, accountId, condition, createdMonth }]
//   S.purchaseFundLog     { [fundId]: { 'YYYY-MM': { credited, met, txnId?, manual? } } }
//   S.purchaseFundSpends  [{ id, fundId, date, desc, amount }]
// La presencia de la clave del mes en el log = "mes ya evaluado" (idempotencia entre dispositivos).
// ════════════════════════════════════════════════════════
const _PF_SECTIONS = ['vida', 'finanzas', 'salud', 'conocimiento', 'ia'];
const _PF_SEC_LBL  = { vida:'Vida', finanzas:'Finanzas', salud:'Salud', conocimiento:'Conocimiento', ia:'IA' };

function _pfEnsure() {
  if (!Array.isArray(S.purchaseFunds)) S.purchaseFunds = [];
  if (!S.purchaseFundLog || typeof S.purchaseFundLog !== 'object') S.purchaseFundLog = {};
  if (!Array.isArray(S.purchaseFundSpends)) S.purchaseFundSpends = [];
}
function _pfMonthKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function _pfMonthLabel(mk) { const [y,m] = mk.split('-'); return `${CAL_MONTHS[+m-1]} ${y}`; }
function _pfDaysInMonth(mk) { const [y,m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function _pfLastDay(mk) { return `${mk}-${String(_pfDaysInMonth(mk)).padStart(2,'0')}`; }
function _pfNextMonth(mk) {
  const [y,m] = mk.split('-').map(Number);
  return m === 12 ? `${y+1}-01` : `${y}-${String(m+1).padStart(2,'0')}`;
}
function _pfLog(fundId) { _pfEnsure(); if (!S.purchaseFundLog[fundId]) S.purchaseFundLog[fundId] = {}; return S.purchaseFundLog[fundId]; }
function _pfSpendsOf(fundId) { _pfEnsure(); return S.purchaseFundSpends.filter(s => s.fundId === fundId); }
function _pfFund(id) { _pfEnsure(); return S.purchaseFunds.find(f => f.id === id) || null; }

// acumulado = Σ acreditado − Σ compras (nunca menor a 0)
function pfAccumulated(fundId) {
  const credited = Object.values(_pfLog(fundId)).reduce((s,e) => s + (+e.credited || 0), 0);
  const spent = _pfSpendsOf(fundId).reduce((s,x) => s + (+x.amount || 0), 0);
  return Math.max(0, credited - spent);
}

// ── Resolución de la condición ──
function _pfFindHabit(cond) {
  if (!cond || (cond.type !== 'habito' && cond.type !== 'diario')) return null;
  const arr = (S.habitTrackers && S.habitTrackers[cond.section]) || [];
  return arr.find(h => h.id === cond.habitId) || null;
}
function _pfFindGoal(cond) {
  if (!cond || cond.type !== 'objetivo') return null;
  if (cond.scope === 'trimestral') {
    const p = ((S.quarterlyObjectives && S.quarterlyObjectives.periods) || []).find(x => x.id === cond.periodKey);
    return p ? (p.objectives || []).find(o => String(o.id) === String(cond.goalId)) || null : null;
  }
  const arr = ((S.monthlyGoals || {})[cond.section] || {})[cond.periodKey] || [];
  return arr.find(g => String(g.id) === String(cond.goalId)) || null;
}
function pfConditionBroken(fund) {
  const c = fund.condition;
  if (!c) return false;
  if (c.type === 'habito' || c.type === 'diario') return !_pfFindHabit(c);
  if (c.type === 'objetivo') return !_pfFindGoal(c);
  return false;
}
function pfConditionLabel(fund) {
  const c = fund.condition;
  if (!c) return 'Sin condición';
  if (c.type === 'habito') {
    const h = _pfFindHabit(c);
    return h ? `${h.emoji || '📅'} ${h.name} ≥ ${+c.threshold || 0}%` : 'Hábito eliminado';
  }
  if (c.type === 'diario') {
    const h = _pfFindHabit(c);
    return h ? `${h.emoji || '📅'} ${h.name} · ${fmtMoney(+c.perDay || 0, 'ARS')}/día + rachas` : 'Hábito eliminado';
  }
  const g = _pfFindGoal(c);
  const scope = c.scope === 'trimestral' ? 'Objetivo trimestral' : 'Objetivo mensual';
  return g ? `${scope}: ${g.text}` : `${scope} eliminado`;
}

// % del mes: done = 1, partial = 0,5; los días 'rest' se excluyen del total.
// Devuelve null si el denominador es 0 (mes entero en descanso / sin días computables).
function _pfHabitPct(habit, mk, upToToday) {
  const total = _pfDaysInMonth(mk);
  const today = getActiveDate();
  let num = 0, den = 0;
  for (let d = 1; d <= total; d++) {
    const ds = `${mk}-${String(d).padStart(2,'0')}`;
    if (upToToday && ds > today) break;
    const st = habit.days ? habit.days[ds] : null;
    if (st === 'rest') continue;
    den++;
    if (st === 'done' || st === 'studied') num += 1;
    else if (st === 'partial') num += 0.5;
  }
  return den > 0 ? (num / den) * 100 : null;
}

// Fondos atados a un objetivo trimestral: solo acreditan en el mes de cierre del trimestre,
// y ahí acreditan los 3 meses juntos (monto × 3).
function _pfIsQuarterly(fund) {
  return !!(fund.condition && fund.condition.type === 'objetivo' && fund.condition.scope === 'trimestral');
}
function _pfAppliesToMonth(fund, mk) {
  const c = fund.condition;
  if (_pfIsQuarterly(fund)) return [3,6,9,12].includes(+mk.split('-')[1]);
  // Objetivo mensual: acredita SOLO en el mes de ese objetivo, no en los siguientes.
  if (c && c.type === 'objetivo') return mk === c.periodKey;
  return true;
}
function _pfAmountFor(fund) {
  const base = +fund.monthlyAmount || 0;
  return _pfIsQuarterly(fund) ? base * 3 : base;
}

// ── Modo diario: devengo por día cumplido + bonos de racha (specs addendum "devengo diario") ──
// Hito válido: days > 0 y bonus > 0 (uno con cualquiera de los dos en 0/vacío se ignora,
// tanto en el devengado como en el tope — así el tope siempre es alcanzable).
function _pfValidMilestones(c) {
  return ((c && c.milestones) || [])
    .filter(m => (+m.days > 0) && (+m.bonus > 0))
    .slice().sort((a, b) => (+a.days) - (+b.days));
}
// Tope de seguridad del mes: perDay × días del mes + Σ bonus de los hitos válidos.
function pfMonthlyCap(fund, mk) {
  const c = fund && fund.condition;
  if (!c || c.type !== 'diario') return 0;
  const perDay = +c.perDay || 0;
  const bonusSum = _pfValidMilestones(c).reduce((s, m) => s + (+m.bonus || 0), 0);
  return perDay * _pfDaysInMonth(mk) + bonusSum;
}
// Racha consecutiva arrastrada desde los días inmediatamente anteriores al día 1 del mes
// (mirando hacia atrás en habit.days, tope 400 días). 'rest' no suma ni corta; cualquier
// otro estado corta y detiene el arrastre.
function _pfStreakCarryIn(habit, mk) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    d.setDate(d.getDate() - 1);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const st = habit.days ? habit.days[ds] : null;
    if (st === 'done' || st === 'studied' || st === 'partial') { streak++; continue; }
    if (st === 'rest') continue;
    break;
  }
  return streak;
}
// Función pura y derivada de habit.days — se recalcula en cada render, nunca lleva contador
// incremental persistido. upToToday=true corta en getActiveDate() (proyección del mes en curso).
function pfDailyEarned(fund, mk, upToToday) {
  const c = fund.condition;
  const habit = _pfFindHabit(c);
  const perDay = +(c && c.perDay) || 0;
  const milestones = _pfValidMilestones(c);

  let streak = habit ? _pfStreakCarryIn(habit, mk) : 0;
  let maxStreak = streak; // racha más alta del mes (arrastre incluido) — define qué bonos se pagan
  let earned = 0;

  if (habit) {
    const totalDays = _pfDaysInMonth(mk);
    const today = getActiveDate();
    for (let day = 1; day <= totalDays; day++) {
      const ds = `${mk}-${String(day).padStart(2, '0')}`;
      if (upToToday && ds > today) break;
      const st = habit.days ? habit.days[ds] : null;
      if (st === 'done' || st === 'studied') { earned += perDay; streak++; }
      else if (st === 'partial') { earned += perDay / 2; streak++; }
      else if (st === 'rest') { /* no suma, no corta */ }
      else { streak = 0; }
      if (streak > maxStreak) maxStreak = streak;
    }
  }

  // Bonos de racha: se pagan todos los hitos con days <= maxStreak, uno por mes cada uno.
  // Se renuevan cada mes (sin registro de "ya cruzado") — sostener la racha vuelve a pagarlos.
  for (const ms of milestones) {
    if (+ms.days <= maxStreak) earned += (+ms.bonus || 0);
  }

  earned = Math.min(earned, pfMonthlyCap(fund, mk));
  let nextMilestone = null;
  for (const ms of milestones) {
    if (+ms.days > maxStreak) { nextMilestone = { days: +ms.days, bonus: +ms.bonus || 0, remaining: +ms.days - maxStreak }; break; }
  }
  return { earned, streak, maxStreak, nextMilestone, hasMilestones: milestones.length > 0 };
}

// Evalúa la condición del fondo para un mes. upToToday=true → proyección del mes en curso.
function pfEvalMonth(fund, mk, upToToday) {
  if (pfConditionBroken(fund)) return { met:false, broken:true, pct:null };
  const c = fund.condition;
  if (!c) return { met:true, pct:null };
  if (c.type === 'habito') {
    const pct = _pfHabitPct(_pfFindHabit(c), mk, !!upToToday);
    return { met: pct !== null && pct >= (+c.threshold || 0), pct };
  }
  if (c.type === 'diario') {
    const d = pfDailyEarned(fund, mk, !!upToToday);
    return { met: d.earned > 0, pct:null, earned: d.earned, streak: d.streak, nextMilestone: d.nextMilestone };
  }
  const g = _pfFindGoal(c);
  return { met: !!(g && g.done), pct:null };
}

// ── Acreditación ──
// Acreditar registra el gasto fijo del mes (transacción con fecha del último día del mes)
// y debita la cuenta asociada: por eso la compra posterior contra el fondo ya no es un gasto.
function _pfCredit(fund, mk, manual, amountOverride) {
  const amount = amountOverride !== undefined ? amountOverride : _pfAmountFor(fund);
  const txn = { id:uid(), date:_pfLastDay(mk), name:`Fondo: ${fund.name}`, type:'expense', amount, currency:'ARS', accountId: fund.accountId || '' };
  if (fund.accountId) {
    const acc = S.accounts.find(a => a.id === fund.accountId);
    if (acc) { acc.balance -= amount; snapshotNW(); }
  }
  S.transactions.unshift(txn);
  _pfLog(fund.id)[mk] = { credited:amount, met:true, txnId:txn.id, manual: !!manual };
}
function _pfMarkNotMet(fund, mk) { _pfLog(fund.id)[mk] = { credited:0, met:false }; }

// Catch-up: evalúa y acredita todos los meses YA CERRADOS que no tengan registro.
// Un mes con registro nunca se vuelve a evaluar (no hay doble acreditación).
function pfCatchUp() {
  _pfEnsure();
  if (!Array.isArray(S.transactions)) return;
  const curMK = _pfMonthKey(new Date());
  let changed = false;
  S.purchaseFunds.forEach(fund => {
    const log = _pfLog(fund.id);
    let mk = fund.createdMonth || curMK, guard = 0;
    while (mk < curMK && guard++ < 600) {
      if (log[mk] === undefined && _pfAppliesToMonth(fund, mk)) {
        const r = pfEvalMonth(fund, mk, false);
        if (!r.broken) {                      // condición rota → no acredita ni marca el mes
          const isDaily = fund.condition && fund.condition.type === 'diario';
          if (r.met) _pfCredit(fund, mk, false, isDaily ? r.earned : undefined); else _pfMarkNotMet(fund, mk);
          changed = true;
        }
      }
      mk = _pfNextMonth(mk);
    }
  });
  if (changed) saveState();
}

function pfForceCredit(fundId, mk) {
  const fund = _pfFund(fundId); if (!fund) return;
  const e = _pfLog(fundId)[mk];
  if (e && +e.credited > 0) { showToast('Ese mes ya está acreditado'); return; }
  if (fund.condition && fund.condition.type === 'diario') {
    const d = pfDailyEarned(fund, mk, false);
    if (!(d.earned > 0)) { showToast('No hay nada devengado ese mes'); return; }
    _pfCredit(fund, mk, true, d.earned);
  } else {
    _pfCredit(fund, mk, true);
  }
  saveState(); renderFinanzasTab(); renderFundDetail();
  showToast('Acreditación forzada');
}
function pfCancelCredit(fundId, mk) {
  const log = _pfLog(fundId), e = log[mk];
  if (!e || !(+e.credited > 0)) return;
  if (pfAccumulated(fundId) - (+e.credited) < 0) {
    showToast('No se puede anular: esa plata ya se gastó del fondo', 3500); return;
  }
  if (e.txnId) {
    const i = S.transactions.findIndex(t => t.id === e.txnId);
    if (i >= 0) {
      const t = S.transactions[i];
      if (t.accountId) { const acc = S.accounts.find(a => a.id === t.accountId); if (acc) { acc.balance += (+t.amount || 0); snapshotNW(); } }
      S.transactions.splice(i, 1);
    }
  }
  log[mk] = { credited:0, met:false, manual:true };
  saveState(); renderFinanzasTab(); renderFundDetail();
  showToast('Acreditación anulada');
}

// ── Render de la tarjeta de la sección ──
function _pfStatusPill(fund) {
  if (pfConditionBroken(fund)) return '<span class="pill pill-danger" style="font-size:var(--fs-12-5)">Condición rota</span>';
  const curMK = _pfMonthKey(new Date());
  const cur = _pfLog(fund.id)[curMK];
  if (cur && +cur.credited > 0) return '<span class="pill pill-ok" style="font-size:var(--fs-12-5)">Acreditado</span>';
  if (!_pfAppliesToMonth(fund, curMK)) {
    const txt = _pfIsQuarterly(fund) ? 'Acredita al cierre del trimestre' : `Acredita en ${_pfMonthLabel(fund.condition.periodKey)}`;
    return `<span class="pill pill-ghost" style="font-size:var(--fs-12-5)">${txt}</span>`;
  }
  if (!fund.condition) return '<span class="pill pill-ghost" style="font-size:var(--fs-12-5)">Sin condición</span>';
  if (fund.condition.type === 'diario') {
    const d = pfDailyEarned(fund, curMK, true);
    const cls = d.earned > 0 ? 'pill-ok' : 'pill-warn';
    return `<span class="pill ${cls}" style="font-size:var(--fs-12-5)">Ganado: ${fmtMoney(d.earned, 'ARS')}</span>`;
  }
  const r = pfEvalMonth(fund, curMK, true);
  const pct = r.pct === null || r.pct === undefined ? '' : ` ${Math.round(r.pct)}%`;
  return r.met
    ? `<span class="pill pill-ok" style="font-size:var(--fs-12-5)">Cumpliendo${pct}</span>`
    : `<span class="pill pill-warn" style="font-size:var(--fs-12-5)">No cumple${pct}</span>`;
}

function renderPurchaseFunds() {
  const list = document.getElementById('fundsList');
  if (!list) return;
  _pfEnsure();
  const empty = document.getElementById('fundsEmpty');
  const totalEl = document.getElementById('fundsTotal');
  if (!S.purchaseFunds.length) {
    list.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    if (totalEl) totalEl.textContent = '$0';
    return;
  }
  if (empty) empty.classList.add('hidden');
  let total = 0;
  const curMK = _pfMonthKey(new Date());
  list.innerHTML = S.purchaseFunds.map(f => {
    const acc = pfAccumulated(f.id);
    total += acc;
    const isDaily = f.condition && f.condition.type === 'diario';
    const per = isDaily
      ? `${fmtMoney(+f.condition.perDay || 0, 'ARS')}/día · tope ${fmtMoney(pfMonthlyCap(f, curMK), 'ARS')}/mes`
      : (_pfIsQuarterly(f) ? `${fmtMoney(+f.monthlyAmount || 0, 'ARS')}/mes · ×3 al cierre del trimestre` : `${fmtMoney(+f.monthlyAmount || 0, 'ARS')}/mes`);
    return `<div class="fund-row">
      <span class="fund-tile" aria-hidden="true">${escHtml(f.emoji || '🪙')}</span>
      <div class="fund-main">
        <div class="fund-name">${escHtml(f.name)} ${_pfStatusPill(f)}</div>
        <div class="fund-meta">${per} · ${escHtml(pfConditionLabel(f))}</div>
        ${_pfDailyWidgetHTML(f, curMK)}
      </div>
      <div class="fund-right">
        <span class="fund-acc">${fmtMoney(acc, 'ARS')}</span>
        <div class="fund-actions">
          <button class="btn btn-ghost btn-sm fund-detail-btn" onclick="openFundDetail('${f.id}')">Detalle</button>
          <button class="icon-btn" onclick="openFundModal('${f.id}')" aria-label="Editar ${escHtml(f.name)}">${_EDIT_SVG}</button>
          <button class="icon-btn" onclick="deleteFund('${f.id}')" aria-label="Eliminar ${escHtml(f.name)}">${_DEL_SVG}</button>
        </div>
      </div>
    </div>`;
  }).join('');
  if (totalEl) totalEl.textContent = fmtMoney(total, 'ARS');
}

// Widget del "estímulo inmediato" del modo diario: barra ganado/tope, racha, próximo hito.
// '' si el fondo no es diario o su condición está rota (hábito borrado).
function _pfDailyWidgetHTML(fund, mk) {
  if (!fund.condition || fund.condition.type !== 'diario' || pfConditionBroken(fund)) return '';
  const d = pfDailyEarned(fund, mk, true);
  const cap = pfMonthlyCap(fund, mk);
  const pct = cap > 0 ? Math.min(100, Math.round((d.earned / cap) * 100)) : 0;
  const nextTxt = d.nextMilestone
    ? `Faltan ${d.nextMilestone.remaining} día${d.nextMilestone.remaining === 1 ? '' : 's'} para +${fmtMoney(d.nextMilestone.bonus, 'ARS')}`
    : (d.hasMilestones ? 'Todos los hitos del mes cobrados' : 'Sin hitos configurados');
  const ariaLabel = `Ganado este mes: ${fmtMoney(d.earned, 'ARS')} de ${fmtMoney(cap, 'ARS')} tope`;
  return `<div class="fund-daily">
    <div class="fund-daily-bar-wrap" role="progressbar" aria-valuenow="${Math.round(d.earned)}" aria-valuemin="0" aria-valuemax="${Math.round(cap)}" aria-label="${escHtml(ariaLabel)}">
      <div class="fund-daily-bar-fill" style="width:${pct}%"></div>
    </div>
    <div class="fund-daily-stats">
      <span class="fund-daily-amt">${fmtMoney(d.earned, 'ARS')} <span class="fund-daily-cap">de ${fmtMoney(cap, 'ARS')}</span></span>
      <span class="fund-daily-streak">🔥 ${d.streak} día${d.streak === 1 ? '' : 's'}</span>
    </div>
    <div class="fund-daily-next">${escHtml(nextTxt)}</div>
  </div>`;
}

// ── Alta / edición de fondo ──
let _pfEditId = null;

function _pfFillHabitSel(sel, cond) {
  const el = document.getElementById(sel); if (!el) return;
  const opts = _PF_SECTIONS.map(sec => {
    const arr = (S.habitTrackers && S.habitTrackers[sec]) || [];
    if (!arr.length) return '';
    return `<optgroup label="${_PF_SEC_LBL[sec]}">` + arr.map(h =>
      `<option value="${sec}|${h.id}">${escHtml(h.emoji || '📅')} ${escHtml(h.name)}</option>`).join('') + '</optgroup>';
  }).join('');
  el.innerHTML = opts || '<option value="">— Sin hábitos —</option>';
  if (cond && (cond.type === 'habito' || cond.type === 'diario')) el.value = `${cond.section}|${cond.habitId}`;
}
function _pfFillObjSel(cond) {
  const scope = document.getElementById('fundObjScope').value;
  const el = document.getElementById('fundObjSel'); if (!el) return;
  let opts = '';
  if (scope === 'trimestral') {
    opts = ((S.quarterlyObjectives && S.quarterlyObjectives.periods) || []).map(p => {
      if (!(p.objectives || []).length) return '';
      return `<optgroup label="${escHtml(p.label)}">` + p.objectives.map(o =>
        `<option value="${p.id}|${o.id}">${escHtml(o.text)}</option>`).join('') + '</optgroup>';
    }).join('');
  } else {
    const mg = S.monthlyGoals || {};
    opts = _PF_SECTIONS.map(sec => {
      const byMonth = mg[sec] || {};
      return Object.keys(byMonth).sort().reverse().map(mk => {
        const arr = byMonth[mk] || [];
        if (!arr.length) return '';
        return `<optgroup label="${_PF_SEC_LBL[sec]} · ${_pfMonthLabel(mk)}">` + arr.map(g =>
          `<option value="${sec}|${mk}|${g.id}">${escHtml(g.text)}</option>`).join('') + '</optgroup>';
      }).join('');
    }).join('');
  }
  el.innerHTML = opts || '<option value="">— Sin objetivos cargados —</option>';
  if (cond && cond.type === 'objetivo' && cond.scope === scope) {
    el.value = scope === 'trimestral' ? `${cond.periodKey}|${cond.goalId}` : `${cond.section}|${cond.periodKey}|${cond.goalId}`;
  }
}
function pfToggleCondFields() {
  const t = document.getElementById('fundCondType').value;
  document.getElementById('fundCondHabit').style.display  = t === 'habito' ? '' : 'none';
  document.getElementById('fundCondObj').style.display    = t === 'objetivo' ? '' : 'none';
  document.getElementById('fundCondDiario').style.display = t === 'diario' ? '' : 'none';
  document.getElementById('fundAmountField').style.display = t === 'diario' ? 'none' : '';
  document.getElementById('fundCapField').style.display     = t === 'diario' ? '' : 'none';
  if (t === 'diario') pfUpdateDailyCap();
}
function pfObjScopeChanged() { _pfFillObjSel(null); }
function pfUpdateDailyCap() {
  const perDay = +document.getElementById('fundPerDay').value || 0;
  const mk = _pfMonthKey(new Date());
  const bonusSum = [1,2,3].reduce((s,n) => s + (+document.getElementById(`fundMs${n}Bonus`).value || 0), 0);
  const cap = perDay * _pfDaysInMonth(mk) + bonusSum;
  const el = document.getElementById('fundCapDisplay');
  if (el) el.value = fmtMoney(cap, 'ARS');
}

function openFundModal(id) {
  _pfEnsure();
  _pfEditId = id || null;
  const f = id ? _pfFund(id) : null;
  populateAccountSelects();
  document.getElementById('fund-modal-title').textContent = f ? 'Editar fondo' : 'Nuevo fondo';
  document.getElementById('fundName').value = f ? f.name : '';
  document.getElementById('fundEmoji').value = f ? (f.emoji || '') : '';
  document.getElementById('fundAmount').value = f ? (+f.monthlyAmount || '') : '';
  document.getElementById('fundAccount').value = f ? (f.accountId || '') : '';
  const c = f ? f.condition : null;
  document.getElementById('fundCondType').value = c ? c.type : 'ninguna';
  document.getElementById('fundThreshold').value = c && c.type === 'habito' ? (+c.threshold || 75) : 75;
  document.getElementById('fundObjScope').value = c && c.type === 'objetivo' ? c.scope : 'mensual';
  _pfFillHabitSel('fundHabitSel', c);
  _pfFillObjSel(c);
  _pfFillHabitSel('fundDailyHabitSel', c);
  document.getElementById('fundPerDay').value = c && c.type === 'diario' ? (+c.perDay || '') : '';
  const msDefaults = [{days:7,bonus:0},{days:14,bonus:0},{days:30,bonus:0}];
  const ms = c && c.type === 'diario' && Array.isArray(c.milestones) && c.milestones.length ? c.milestones : msDefaults;
  [1,2,3].forEach((n,i) => {
    document.getElementById(`fundMs${n}Days`).value = ms[i] ? (+ms[i].days || msDefaults[i].days) : msDefaults[i].days;
    document.getElementById(`fundMs${n}Bonus`).value = ms[i] && +ms[i].bonus ? +ms[i].bonus : '';
  });
  pfToggleCondFields();
  openModal('modal-fund');
}

function saveFund() {
  _pfEnsure();
  const name = document.getElementById('fundName').value.trim();
  if (!name) { showToast('Escribe el nombre'); return; }
  const emoji = document.getElementById('fundEmoji').value.trim();
  const accountId = document.getElementById('fundAccount').value;
  const type = document.getElementById('fundCondType').value;

  let condition = null;
  let monthlyAmount = 0;
  if (type === 'diario') {
    const v = document.getElementById('fundDailyHabitSel').value;
    if (!v) { showToast('Elegí un hábito para la condición'); return; }
    const [section, habitId] = v.split('|');
    const perDay = +document.getElementById('fundPerDay').value || 0;
    if (perDay <= 0) { showToast('El monto por día tiene que ser mayor a 0'); return; }
    const milestones = [1,2,3].map(n => ({
      days: +document.getElementById(`fundMs${n}Days`).value || 0,
      bonus: +document.getElementById(`fundMs${n}Bonus`).value || 0
    }));
    condition = { type:'diario', section, habitId, perDay, milestones };
  } else {
    monthlyAmount = +document.getElementById('fundAmount').value || 0;
    if (monthlyAmount <= 0) { showToast('El monto mensual tiene que ser mayor a 0'); return; }
    if (type === 'habito') {
      const v = document.getElementById('fundHabitSel').value;
      if (!v) { showToast('Elegí un hábito para la condición'); return; }
      const [section, habitId] = v.split('|');
      condition = { type:'habito', section, habitId, threshold: +document.getElementById('fundThreshold').value || 0 };
    } else if (type === 'objetivo') {
      const scope = document.getElementById('fundObjScope').value;
      const v = document.getElementById('fundObjSel').value;
      if (!v) { showToast('Elegí un objetivo para la condición'); return; }
      const parts = v.split('|');
      condition = scope === 'trimestral'
        ? { type:'objetivo', scope, periodKey: parts[0], goalId: parts[1] }
        : { type:'objetivo', scope, section: parts[0], periodKey: parts[1], goalId: parts[2] };
    }
  }

  if (_pfEditId) {
    const f = _pfFund(_pfEditId);
    if (f) Object.assign(f, { name, emoji, monthlyAmount, accountId, condition });
  } else {
    S.purchaseFunds.push({ id:uid(), name, emoji, monthlyAmount, accountId, condition, createdMonth: _pfMonthKey(new Date()) });
  }
  saveState(); closeModal('modal-fund'); renderFinanzasTab();
  showToast(_pfEditId ? 'Fondo actualizado' : 'Fondo creado');
  _pfEditId = null;
}

function deleteFund(id) {
  const f = _pfFund(id); if (!f) return;
  const acc = pfAccumulated(id);
  if (!confirm(`¿Eliminar el fondo "${f.name}"? Se pierde el acumulado de ${fmtMoney(acc, 'ARS')} y su historial de compras.`)) return;
  S.purchaseFunds = S.purchaseFunds.filter(x => x.id !== id);
  delete S.purchaseFundLog[id];
  S.purchaseFundSpends = S.purchaseFundSpends.filter(s => s.fundId !== id);
  saveState(); closeModal('modal-fund-detail'); renderFinanzasTab();
  showToast('Fondo eliminado');
}

// ── Compras contra el fondo (no computan como gasto: el gasto ya se registró al acreditar) ──
let _pfSpendFundId = null, _pfSpendId = null;

function openFundSpend(fundId, spendId) {
  _pfEnsure();
  const f = _pfFund(fundId); if (!f) return;
  _pfSpendFundId = fundId; _pfSpendId = spendId || null;
  const sp = spendId ? S.purchaseFundSpends.find(s => s.id === spendId) : null;
  const avail = pfAccumulated(fundId) + (sp ? (+sp.amount || 0) : 0);
  document.getElementById('fund-spend-title').textContent = sp ? 'Editar compra' : `Compra de ${f.name}`;
  document.getElementById('fundSpendAvail').textContent = `Disponible en el fondo: ${fmtMoney(avail, 'ARS')}`;
  document.getElementById('fundSpendDesc').value = sp ? sp.desc : '';
  document.getElementById('fundSpendAmount').value = sp ? (+sp.amount || '') : '';
  document.getElementById('fundSpendDate').value = sp ? sp.date : getActiveDate();
  openModal('modal-fund-spend');
}

function saveFundSpend() {
  _pfEnsure();
  const fundId = _pfSpendFundId;
  const f = _pfFund(fundId); if (!f) return;
  const desc = document.getElementById('fundSpendDesc').value.trim();
  if (!desc) { showToast('Escribe la descripción'); return; }
  const amount = +document.getElementById('fundSpendAmount').value || 0;
  if (amount <= 0) { showToast('El monto tiene que ser mayor a 0'); return; }
  const date = document.getElementById('fundSpendDate').value || getActiveDate();
  const prev = _pfSpendId ? (+(S.purchaseFundSpends.find(s => s.id === _pfSpendId) || {}).amount || 0) : 0;
  const avail = pfAccumulated(fundId) + prev;
  if (amount > avail) { showToast(`No alcanza: el fondo tiene ${fmtMoney(avail, 'ARS')}`, 3500); return; }

  if (_pfSpendId) {
    const sp = S.purchaseFundSpends.find(s => s.id === _pfSpendId);
    if (sp) Object.assign(sp, { date, desc, amount });
  } else {
    S.purchaseFundSpends.push({ id:uid(), fundId, date, desc, amount });
  }
  saveState(); closeModal('modal-fund-spend'); renderFinanzasTab(); renderFundDetail();
  showToast('Compra registrada');
  _pfSpendId = null;
}

function deleteFundSpend(id) {
  _pfEnsure();
  if (!confirm('¿Borrar esta compra? El monto vuelve al acumulado del fondo.')) return;
  S.purchaseFundSpends = S.purchaseFundSpends.filter(s => s.id !== id);
  saveState(); renderFinanzasTab(); renderFundDetail();
  showToast('Compra borrada');
}

// ── Detalle del fondo ──
let _pfDetailId = null;

function openFundDetail(id) { _pfDetailId = id; renderFundDetail(); openModal('modal-fund-detail'); }

function renderFundDetail() {
  const body = document.getElementById('fundDetailBody');
  if (!body || !_pfDetailId) return;
  const f = _pfFund(_pfDetailId);
  if (!f) { body.innerHTML = '<p class="empty-state">Fondo eliminado</p>'; return; }
  const log = _pfLog(f.id);
  // Meses cerrados desde la creación del fondo: los que no tienen entrada en el log
  // (p. ej. quedaron sin evaluar por condición rota) también se listan, para poder forzarlos.
  const curMK = _pfMonthKey(new Date());
  const closed = [];
  for (let mk = f.createdMonth || curMK, g = 0; mk < curMK && g++ < 600; mk = _pfNextMonth(mk)) {
    if (_pfAppliesToMonth(f, mk)) closed.push(mk);
  }
  const months = [...new Set([...Object.keys(log), ...closed])].sort().reverse();
  const rows = months.length ? months.map(mk => {
    const e = log[mk];
    const ok = !!e && +e.credited > 0;
    return `<div class="sub-row">
      <div class="sub-info">
        <div class="sub-name">${_pfMonthLabel(mk)} ${e && e.manual ? '<span class="pill pill-ghost" style="font-size:var(--fs-12-5)">manual</span>' : ''}</div>
        <div class="sub-detail">${ok ? 'Cumplido' : (e ? 'No cumplido' : 'Sin evaluar')}</div>
      </div>
      <div class="flex gap-8 items-center">
        <span class="mono bold ${ok ? 'text-ok' : 'text-ter'}">${fmtMoney(e ? (+e.credited || 0) : 0, 'ARS')}</span>
        ${ok
          ? `<button class="btn btn-ghost btn-sm" onclick="pfCancelCredit('${f.id}','${mk}')" style="font-size:var(--fs-12-5)">Anular</button>`
          : `<button class="btn btn-ghost btn-sm" onclick="pfForceCredit('${f.id}','${mk}')" style="font-size:var(--fs-12-5)">Forzar</button>`}
      </div>
    </div>`;
  }).join('') : '<p class="empty-state">Sin meses evaluados todavía</p>';

  const spends = _pfSpendsOf(f.id).slice().sort((a,b) => (b.date || '').localeCompare(a.date || ''));
  const spendRows = spends.length ? spends.map(s => `<div class="sub-row">
      <div class="sub-info">
        <div class="sub-name">${escHtml(s.desc)}</div>
        <div class="sub-detail">${escHtml(s.date || '')}</div>
      </div>
      <div class="flex gap-8 items-center">
        <span class="mono bold text-danger">−${fmtMoney(+s.amount || 0, 'ARS')}</span>
        <button class="icon-btn" onclick="openFundSpend('${f.id}','${s.id}')">${_EDIT_SVG}</button>
        <button class="icon-btn" onclick="deleteFundSpend('${s.id}')">${_DEL_SVG}</button>
      </div>
    </div>`).join('') : '<p class="empty-state">Sin compras registradas</p>';

  body.innerHTML = `
    <div class="budget-totals">
      <div class="budget-total-main">
        <span class="budget-total-lbl">${escHtml(f.emoji || '🪙')} ${escHtml(f.name)} · acumulado</span>
        <span class="budget-total-num">${fmtMoney(pfAccumulated(f.id), 'ARS')}</span>
      </div>
      <div class="budget-total-sub">
        <span>${f.condition && f.condition.type === 'diario' ? `Tope: ${fmtMoney(pfMonthlyCap(f, _pfMonthKey(new Date())), 'ARS')} / mes` : `${fmtMoney(+f.monthlyAmount || 0, 'ARS')} / mes`}</span>
        <span>${escHtml(pfConditionLabel(f))}</span>
      </div>
    </div>
    ${_pfDailyWidgetHTML(f, _pfMonthKey(new Date()))}
    <div class="budget-block-hdr">
      <span>Compras del fondo</span>
      <button class="btn btn-ghost btn-sm" onclick="openFundSpend('${f.id}')">+ Compra</button>
    </div>
    ${spendRows}
    <div class="budget-block-hdr"><span>Acreditaciones</span></div>
    ${rows}`;
}

// Los fondos vigentes en el mes suman al mínimo fijo del presupuesto de ese mes.
function _pfFundsOfMonth(mk) {
  _pfEnsure();
  return S.purchaseFunds.filter(f => !f.createdMonth || f.createdMonth <= mk);
}
function _pfFundBudgetAmount(f, mk) {
  return f.condition && f.condition.type === 'diario' ? pfMonthlyCap(f, mk) : (+f.monthlyAmount || 0);
}
function _pfBudgetTotal(mk) {
  return _pfFundsOfMonth(mk).reduce((s,f) => s + _pfFundBudgetAmount(f, mk), 0);
}
function _pfBudgetRows(mk) {
  return _pfFundsOfMonth(mk).map(f => `<div class="sub-row">
      <div class="sub-info">
        <div class="sub-name">${escHtml(f.emoji || '🪙')} ${escHtml(f.name)} <span class="pill pill-ghost" style="font-size:var(--fs-12-5)">fondo</span></div>
        <div class="sub-detail">${escHtml(pfConditionLabel(f))}</div>
      </div>
      <div class="flex gap-8 items-center">
        <span class="mono bold">${fmtMoney(_pfFundBudgetAmount(f, mk), 'ARS')}</span>
        <button class="btn btn-ghost btn-sm" onclick="openFundDetail('${f.id}')" style="font-size:var(--fs-12-5)">Detalle</button>
      </div>
    </div>`).join('');
}

// ════════════════════════════════════════════════════════
// CATEGORÍAS DE TRANSACCIÓN — datos gestionables por el usuario (S.txnCategories)
// Ver specs/finanzas-categorias-personalizables.md
// ════════════════════════════════════════════════════════
const CAT_SECTIONS = [
  { id:'salud',         label:'Salud',         color:'#F43F5E' },
  { id:'vida',          label:'Vida',          color:'#0FB9D6' },
  { id:'conocimiento',  label:'Conocimiento',  color:'#3B82F6' },
  { id:'finanzas',      label:'Finanzas',      color:'#16B364' },
  { id:'ia',            label:'IA',            color:'#8B5CF6' },
];
// Categorías cuyo tipo natural es ingreso: excluidas de los selectores de presupuesto
// (el presupuesto solo planifica gastos). No configurable desde la pantalla de gestión.
const _BUDGET_EXCLUDED_CATS = ['salary','invest'];

function _defaultTxnCategories() {
  return {
    sports:       { label:'Deporte / Gym',         icon:'🏋️', color:'#F43F5E', section:'salud' },
    clean_food:   { label:'Alimentación Sana',      icon:'🥩', color:'#F43F5E', section:'salud' },
    hydration:    { label:'Hidratación Limpia',     icon:'💧', color:'#F43F5E', section:'salud' },
    junk_food:    { label:'Comida Chatarra',        icon:'🍟', color:'#F43F5E', section:'salud' },
    health:       { label:'Salud',                  icon:'⚕️', color:'#F43F5E', section:'salud' },
    girlfriend:   { label:'Novia',                  icon:'💑', color:'#0FB9D6', section:'vida' },
    pet:          { label:'Mascota',                icon:'🐱', color:'#0FB9D6', section:'vida' },
    mama:         { label:'Mamá',                   icon:'👩', color:'#0FB9D6', section:'vida' },
    papa:         { label:'Papá',                   icon:'👨', color:'#0FB9D6', section:'vida' },
    friends:      { label:'Amigos',                 icon:'🎉', color:'#0FB9D6', section:'vida' },
    study:        { label:'Estudio',                icon:'📚', color:'#3B82F6', section:'conocimiento' },
    books:        { label:'Libros',                 icon:'📖', color:'#3B82F6', section:'conocimiento' },
    business:     { label:'Negocio',                icon:'💼', color:'#16B364', section:'finanzas' },
    productivity: { label:'Productividad / Fijos',  icon:'⚡', color:'#16B364', section:'finanzas' },
    salary:       { label:'Ingreso',                icon:'💰', color:'#16B364', section:'finanzas' },
    invest:       { label:'Inversión',               icon:'📈', color:'#16B364', section:'finanzas' },
    ai:           { label:'IA',                     icon:'🤖', color:'#8B5CF6', section:'ia' },
    home:         { label:'Hogar / Insumos',        icon:'🏠', color:'#D4DCE8', section:null },
    other:        { label:'Otro',                   icon:'💸', color:'#FFFFFF', section:null },
  };
}

// Siembra S.txnCategories la primera vez (idempotente). Se llama al inicio de cualquier
// función que lea/muestre categorías, sin tocar loadState().
function ensureTxnCategories() {
  if (S.txnCategoriesSeeded) return false;
  S.txnCategories = _defaultTxnCategories();
  S.txnCategoriesSeeded = true;
  return true;
}

function _hexToRgba(hex, alpha) {
  const h = (hex || '#FFFFFF').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const parsed = n => { const v = parseInt(n, 16); return isNaN(v) ? 255 : v; };
  const r = parsed(full.slice(0,2));
  const g = parsed(full.slice(2,4));
  const b = parsed(full.slice(4,6));
  return `rgba(${r},${g},${b},${alpha})`;
}

// Devuelve el mapa vivo de categorías con color/border/chartColor derivados del hex
// guardado en S.txnCategories — memoizado (se invalida en saveTxnCategory/deleteTxnCategory/
// ensureTxnCategories y al llegar estado remoto, ver _invalidateCatCache).
let _catMapCache = null;
function _invalidateCatCache() { _catMapCache = null; }
window._invalidateCatCache = _invalidateCatCache;
function _liveCatMap() {
  if (ensureTxnCategories()) _catMapCache = null;
  if (_catMapCache) return _catMapCache;
  const out = {};
  Object.entries(S.txnCategories).forEach(([id, c]) => {
    out[id] = {
      label: c.label, icon: c.icon, section: c.section || null, hex: c.color,
      color: _hexToRgba(c.color, .15), border: _hexToRgba(c.color, .4), chartColor: _hexToRgba(c.color, .85),
    };
  });
  _catMapCache = out;
  return out;
}

// Compat: código existente sigue leyendo TXN_CATEGORIES[k] / BUDGET_EXPENSE_CATS como si
// fueran constantes — ahora son getters que derivan del set dinámico en S.txnCategories.
Object.defineProperty(window, 'TXN_CATEGORIES', { configurable: true, get: _liveCatMap });
Object.defineProperty(window, 'BUDGET_EXPENSE_CATS', {
  configurable: true,
  get() { return Object.keys(_liveCatMap()).filter(id => !_BUDGET_EXCLUDED_CATS.includes(id)); }
});

function getCatInfo(cat, type) {
  return _liveCatMap()[cat] || { label:'', icon: type==='income'?'💚':'🔴', color:'rgba(255,255,255,.06)', border:'rgba(255,255,255,.1)' };
}

// ════════════════════════════════════════════════════════
// PRESUPUESTO MENSUAL
// ════════════════════════════════════════════════════════

const _EDIT_SVG = '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const _DEL_SVG  = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>';

let budgetActiveMonth = null;
let budgetActiveYear = null;

function _curMonthKey() {
  return getActiveDate().slice(0, 7);
}

// Año siguiente al dado, derivado con rollover nativo de Date (mes 12 = enero del año próximo).
function _nextYear(year) {
  return new Date(year, 12, 1).getFullYear();
}

function _emptyBudget() { return { fixed: [], reserved: [] }; }

function _budgetItemTotal(it) { return (+it.v1 || 0) * (+it.v2 || 0) * (+it.v3 || 0); }

// ── Armado mensual del presupuesto ──
// Regla de oro: la app NUNCA pisa un mes que no creó ella. Banderas de cada mes:
//  · `auto:true` = borrador que armó el código nuevo y nadie tocó (se rehace solo al llegar el mes).
//  · `touched:true` = Tobías lo editó o eligió dejarlo como está (nunca se pisa).
//  · `auto:false, touched:false` = ya resuelto (se armó solo al llegar el mes, o Tobías pidió rehacerlo).
//  · sin banderas = lo creó la versión anterior o Tobías: es suyo, no se toca solo (ver _budgetPendingMonths).
// Las líneas estacionales viven aparte (b.seasonal) para que NO viajen al mes siguiente con la copia de límites.
function _budgetAutoOf(b) { return !!(b && b.auto === true && !b.touched); }
function _touchBudget(b) { if (b) { b.touched = true; delete b.auto; } }
function _prevBudgetKey(mk) {
  const ks = Object.keys(S.budgets || {}).filter(k => k < mk).sort();
  return ks.length ? ks[ks.length - 1] : null;
}
// Copia los límites tal como quedaron (ids nuevos). No copia estacionales.
function _copyBudgetLimits(src) {
  return {
    fixed:    ((src && src.fixed)    || []).map(it => ({ id: uid(), name: it.name, category: it.category, unit: it.unit, v1: it.v1, v2: it.v2, v3: it.v3 })),
    reserved: ((src && src.reserved) || []).map(it => ({ id: uid(), name: it.name, category: it.category, amount: it.amount })),
  };
}
function _limitsKey(b) {
  return JSON.stringify([
    ((b && b.fixed) || []).map(it => [it.name, it.category, it.unit, it.v1, it.v2, it.v3]),
    ((b && b.reserved) || []).map(it => [it.name, it.category, it.amount]),
  ]);
}
function _limitsSummary(b) {
  const fx = (b && b.fixed) || [], rs = (b && b.reserved) || [];
  let total = 0;
  fx.forEach(it => { total += _budgetItemTotal(it); });
  rs.forEach(it => { total += (+it.amount || 0); });
  return { n: fx.length + rs.length, total };
}
function _calPrevMonthKey(mk) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Crea el presupuesto del mes `mk` si no existe, copiando el último mes previo existente
// (con ids nuevos) y marcándolo como armado por la app. Devuelve true si lo creó.
// Edge: sin mes previo → vacío.
function ensureBudgetMonth(mk) {
  if (!S.budgets) S.budgets = {};
  if (S.budgets[mk]) return false;
  const pk = _prevBudgetKey(mk);
  const b = pk ? _copyBudgetLimits(S.budgets[pk]) : _emptyBudget();
  b.auto = true;
  S.budgets[mk] = b;
  return true;
}

// Mantenimiento de los meses hasta `curMk` (inclusive). Devuelve true si cambió algo (no guarda).
//  1) Solo se rehace un mes con `auto:true` (borrador que armó el código nuevo, sin editar) que ya llegó:
//     parte de cómo quedó el mes inmediatamente anterior (o el más reciente anterior si falta), en orden.
//     Un mes sin banderas nunca se toca acá: lo resuelve Tobías con el aviso (_budgetPendingMonths).
//  2) Si el mes actual no existe, se arma igual desde el anterior.
function _rollBudgets(curMk) {
  let changed = false;
  Object.keys(S.budgets).sort().forEach(mk => {
    if (mk > curMk) return;
    const b = S.budgets[mk];
    if (!_budgetAutoOf(b)) return;
    const pk = _prevBudgetKey(mk);
    if (pk) { Object.assign(b, _copyBudgetLimits(S.budgets[pk])); b.base = pk; b.seasonal = []; }
    b.auto = false; b.touched = false;
    changed = true;
  });
  if (!S.budgets[curMk]) {
    const pk = _prevBudgetKey(curMk);
    ensureBudgetMonth(curMk);
    const c = S.budgets[curMk];
    c.auto = false; c.touched = false;
    if (pk) c.base = pk;
    changed = true;
  }
  return changed;
}

// Meses sin banderas (de la versión anterior o de Tobías), futuros o el actual, cuyos límites difieren del
// mes anterior (o cuyo mes anterior, también futuro, está pendiente: al rehacerlo cambia el de este): se
// ofrecen para rehacer con un aviso, nunca automático. Si son iguales al anterior no hay nada que decidir;
// si el anterior cambia después, el aviso aparece.
function _budgetPendingMonths(curMk) {
  const out = [];
  Object.keys(S.budgets || {}).sort().forEach(mk => {
    const b = S.budgets[mk], pk = _prevBudgetKey(mk);
    if (mk < curMk || !b || b.auto !== undefined || b.touched !== undefined || !pk) return;
    if (_limitsKey(b) !== _limitsKey(S.budgets[pk]) || (pk > curMk && out.includes(pk))) out.push(mk);
  });
  return out;
}

// Copia en memoria de los meses rehechos con el aviso, para "Deshacer" (dura hasta recargar o editar el mes).
let _budgetUndo = null;
let _budgetPendOff = [];   // meses de la lista que Tobías dejó sin marcar (para no volver a marcarlos al repintar)
function _budgetUndoValid() {
  return (_budgetUndo || []).filter(u => { const b = S.budgets[u.mk]; return b && b.auto === false && b.touched === false; });
}

function budgetPendingResolve(action) {
  const curMk = getActiveDate().slice(0, 7);
  const pending = _budgetPendingMonths(curMk);
  const picked = [...document.querySelectorAll('#budgetPending input[data-pend]:checked')].map(i => i.dataset.pend).filter(mk => pending.includes(mk)).sort();
  if (action === 'redo') {
    if (!picked.length) { showToast('Marcá al menos un mes'); return; }
    const undo = [];
    picked.forEach(mk => {
      const b = S.budgets[mk], pk = _prevBudgetKey(mk);
      undo.push({ mk, snap: JSON.parse(JSON.stringify(b)) });
      Object.assign(b, _copyBudgetLimits(S.budgets[pk]));
      b.base = pk; b.auto = false; b.touched = false;
    });
    _budgetUndo = undo;
    _budgetPendOff = pending.filter(mk => !picked.includes(mk));   // lo que dejó sin marcar sigue sin marcar al repintar
    _syncSeasonalLines(curMk);
  } else {
    // "Dejar los demás como están": todo mes de la lista que NO está marcado queda resuelto y no se vuelve a preguntar.
    pending.filter(mk => !picked.includes(mk)).forEach(mk => { S.budgets[mk].touched = true; });
    _budgetUndo = null; _budgetPendOff = [];
  }
  saveState(); renderBudget();
}

// El botón de rehacer solo sirve si hay algún mes marcado.
function budgetPendingSync() {
  const redo = document.getElementById('budgetPendingRedo');
  if (redo) redo.disabled = !document.querySelector('#budgetPending input[data-pend]:checked');
}

function budgetUndoRedo() {
  _budgetUndoValid().forEach(u => { S.budgets[u.mk] = u.snap; });
  _budgetUndo = null;
  saveState(); renderBudget();
}

// Carga solos los gastos estacionales en los meses desde `curMk` en adelante (los pasados no se tocan):
// agrega la línea que falta (salvo que Tobías la haya quitado de ese mes), pone al día las que no ajustó
// y saca las de un estacional que ya no existe o cambió de mes. Devuelve true si cambió algo.
function _syncSeasonalLines(curMk) {
  const seas = Array.isArray(S.seasonals) ? S.seasonals : [];
  const byId = new Map(seas.map(s => [s.id, s]));
  let changed = false;
  Object.keys(S.budgets || {}).forEach(mk => {
    const b = S.budgets[mk];
    if (!b || mk < curMk) return;
    const mNum = +mk.slice(5, 7);
    const lines = Array.isArray(b.seasonal) ? b.seasonal : [];
    const skip = Array.isArray(b.skipSeasonal) ? b.skipSeasonal : [];
    const keep = lines.filter(l => { const s = byId.get(l.seasonalId); return s && s.month === mNum; });
    let dirty = keep.length !== lines.length;
    keep.forEach(l => {
      const s = byId.get(l.seasonalId);
      if (!l.adjusted && (l.name !== s.name || l.amount !== s.amount || l.category !== s.category)) {
        l.name = s.name; l.amount = s.amount; l.category = s.category; dirty = true;
      }
    });
    seas.forEach(s => {
      if (s.month === mNum && !skip.includes(s.id) && !keep.some(l => l.seasonalId === s.id)) {
        keep.push({ id: uid(), seasonalId: s.id, name: s.name, category: s.category, amount: s.amount });
        dirty = true;
      }
    });
    if (dirty) { b.seasonal = keep; changed = true; }
  });
  return changed;
}

// Mantiene al día el presupuesto (rehacer meses que llegaron + estacionales) y guarda solo si cambió algo.
function rollBudgets() {
  if (!S.budgets) S.budgets = {};
  const curMk = getActiveDate().slice(0, 7);
  let changed = _rollBudgets(curMk);
  if (_syncSeasonalLines(curMk)) changed = true;
  if (changed) saveState();
  return changed;
}

// Precrea en cascada los meses FUTUROS de `year` como borradores (idempotente por mes vía ensureBudgetMonth);
// llegado el mes, rollBudgets los rehace con cómo quedó el mes anterior mientras nadie los haya editado.
// Año calendario real actual: arranca en el mes real actual (nunca retro-crea meses pasados).
// Años futuros (>= año real actual): arrancan en enero (todos sus meses son futuros).
// Años pasados: no crea nada. Un solo saveState() al final si se cambió algo, nunca uno por mes.
function ensureBudgetYear(year) {
  if (!S.budgets) S.budgets = {};
  const today = getActiveDate();
  const curMk = today.slice(0, 7);
  const realCurYear = +today.slice(0, 4);
  let changed = _rollBudgets(curMk);
  if (year >= realCurYear) {
    const startMonth = (year === realCurYear) ? +today.slice(5, 7) : 1;
    for (let m = startMonth; m <= 12; m++) {
      if (ensureBudgetMonth(`${year}-${String(m).padStart(2,'0')}`)) changed = true;
    }
  }
  if (_syncSeasonalLines(curMk)) changed = true;
  if (changed) saveState();
  return changed;
}

function getBudgetMonths() {
  const year = budgetActiveYear || new Date().getFullYear();
  const months = [];
  for (let m = 1; m <= 12; m++) months.push(`${year}-${String(m).padStart(2,'0')}`);
  return months.reverse();
}

function setBudgetMonth(m) { budgetActiveMonth = m; renderBudget(); }

function setBudgetYear(y) {
  const year = +y;
  if (year === budgetActiveYear) return;
  budgetActiveYear = year;
  budgetActiveMonth = null;
  ensureBudgetYear(year);
  renderBudget();
}

// Controles de vista del presupuesto (no se persisten: son de lectura del mes).
let budgetSort = 'manual';   // 'manual' | 'amount' (mayor a menor)
let budgetCatFilter = '';    // '' = todas
function setBudgetSort(v) { budgetSort = v; renderBudget(); }
function setBudgetCatFilter(v) { budgetCatFilter = v; renderBudget(); }

function renderBudget() {
  const body = document.getElementById('budgetBody');
  if (!body) return;
  if (!S.budgets) S.budgets = {};
  const realCurYear = +getActiveDate().slice(0, 4);
  if (!budgetActiveYear) budgetActiveYear = realCurYear;
  // La precreación en cascada corre en setBudgetYear() (cambio explícito de año) y en el init de
  // app.js. Acá solo se rehace lo que ya llegó (por si la app quedó abierta pasando el día 1).
  rollBudgets();

  const months = getBudgetMonths();
  if (!budgetActiveMonth || !months.includes(budgetActiveMonth)) {
    const curMk = _curMonthKey();
    budgetActiveMonth = (budgetActiveYear === realCurYear && months.includes(curMk)) ? curMk : `${budgetActiveYear}-01`;
  }
  const b = S.budgets[budgetActiveMonth] || _emptyBudget();

  // Selector de año: año actual + siguiente + cualquier año con datos ya guardados en S.budgets
  const yearSel = document.getElementById('budgetYearSel');
  if (yearSel) {
    const nextY = _nextYear(realCurYear);
    const savedYears = Object.keys(S.budgets).map(k => +k.split('-')[0]);
    const years = Array.from(new Set([...savedYears, realCurYear, nextY])).sort((a, b) => a - b);
    yearSel.innerHTML = years.map(y =>
      `<option value="${y}" ${y === budgetActiveYear ? 'selected' : ''}>${y}</option>`
    ).join('');
  }

  // Selector de mes
  const sel = document.getElementById('budgetMonthSel');
  if (sel) {
    sel.innerHTML = months.map(m => {
      const [y, mo] = m.split('-');
      return `<option value="${m}" ${m === budgetActiveMonth ? 'selected' : ''}>${CAL_MONTHS[+mo-1]} ${y}</option>`;
    }).join('');
  }
  const [my, mmo] = budgetActiveMonth.split('-');
  const monthLabel = `${CAL_MONTHS[+mmo-1]} ${my}`;

  // Vista: el filtro y el orden afectan SOLO qué filas se listan.
  // Los totales siguen siendo los del mes completo (si no, "Presupuesto total" mentiría).
  const _viewRows = (items, amountOf) => {
    let out = budgetCatFilter ? items.filter(it => (it.category || '') === budgetCatFilter) : [...items];
    if (budgetSort === 'amount') out.sort((a, b2) => amountOf(b2) - amountOf(a));
    return out;
  };

  // Ítems fijos (incluye los fondos de compra: su monto mensual es gasto fijo del presupuesto)
  let totalFijo = _pfBudgetTotal(budgetActiveMonth);
  b.fixed.forEach(it => { totalFijo += _budgetItemTotal(it); });
  // Los fondos no tienen categoría: se ocultan si hay un filtro de categoría activo.
  const fundRows = budgetCatFilter ? '' : _pfBudgetRows(budgetActiveMonth);
  const fixedView = _viewRows(b.fixed, _budgetItemTotal);
  const fixedRows = fundRows + (fixedView.length ? fixedView.map(it => {
    const ci = getCatInfo(it.category, 'expense');
    const tot = _budgetItemTotal(it);
    return `<div class="sub-row">
      <div class="sub-info">
        <div class="sub-name">${it.name}</div>
        <div class="sub-detail">${escHtml(ci.icon)} ${escHtml(ci.label) || '—'} · ${(+it.v1||0)} × ${(+it.v2||0)} × ${(+it.v3||0)} ${it.unit || ''}</div>
      </div>
      <div class="flex gap-8 items-center">
        <span class="mono bold">${fmtMoney(tot, 'ARS')}</span>
        <button class="icon-btn" onclick="openBudgetFixed('${it.id}')">${_EDIT_SVG}</button>
        <button class="icon-btn" onclick="deleteBudgetFixed('${it.id}')">${_DEL_SVG}</button>
      </div>
    </div>`;
  }).join('') : (fundRows ? '' : `<p class="empty-state">${budgetCatFilter ? 'Sin ítems fijos en esta categoría' : 'Sin ítems fijos'}</p>`));

  // Gastos reservados
  let totalRes = 0;
  b.reserved.forEach(it => { totalRes += (+it.amount || 0); });
  const resView = _viewRows(b.reserved, it => (+it.amount || 0));
  const resRows = resView.length ? resView.map(it => {
    const ci = getCatInfo(it.category, 'expense');
    return `<div class="sub-row">
      <div class="sub-info">
        <div class="sub-name">${it.name}</div>
        <div class="sub-detail">${escHtml(ci.icon)} ${escHtml(ci.label) || '—'}</div>
      </div>
      <div class="flex gap-8 items-center">
        <span class="mono bold">${fmtMoney(+it.amount || 0, 'ARS')}</span>
        <button class="icon-btn" onclick="openBudgetReserved('${it.id}')">${_EDIT_SVG}</button>
        <button class="icon-btn" onclick="deleteBudgetReserved('${it.id}')">${_DEL_SVG}</button>
      </div>
    </div>`;
  }).join('') : `<p class="empty-state">${budgetCatFilter ? 'Sin reservados en esta categoría' : 'Sin gastos reservados'}</p>`;

  // Gastos estacionales cargados en este mes (línea propia por estacional, monto editable por mes)
  const seasLines = b.seasonal || [];
  let totalSeas = 0;
  seasLines.forEach(it => { totalSeas += (+it.amount || 0); });
  const seasView = _viewRows(seasLines, it => (+it.amount || 0));
  const seasRows = seasView.map(it => {
    const ci = getCatInfo(it.category, 'expense');
    return `<div class="sub-row" data-seasonal-line="${escHtml(it.id)}">
      <div class="sub-info">
        <div class="sub-name">${escHtml(it.name)}</div>
        <div class="sub-detail">${escHtml(ci.icon)} ${escHtml(ci.label) || '—'} · ${it.adjusted ? 'Ajustado para este mes' : 'Monto del estacional'}</div>
      </div>
      <div class="flex gap-8 items-center">
        <span class="mono bold">${fmtMoney(+it.amount || 0, 'ARS')}</span>
        <button class="icon-btn" aria-label="Cambiar el monto de este mes" onclick="openSeasonalLine('${escHtml(it.id)}')">${_EDIT_SVG}</button>
        <button class="icon-btn" aria-label="Quitar de este mes" onclick="deleteSeasonalLine('${escHtml(it.id)}')">${_DEL_SVG}</button>
      </div>
    </div>`;
  }).join('');
  const seasBlock = seasLines.length ? `
    <div class="budget-block-hdr"><span>Estacionales de ${monthLabel}</span></div>
    ${seasRows || '<p class="empty-state">Sin estacionales en esta categoría</p>'}` : '';

  // Lista base de estacionales (se repiten cada año en su mes)
  const seasBase = [...(S.seasonals || [])].sort((a2, c2) => (a2.month - c2.month) || String(a2.name).localeCompare(String(c2.name)));
  const seasBaseRows = seasBase.length ? seasBase.map(s => {
    const ci = getCatInfo(s.category, 'expense');
    return `<div class="sub-row" data-seasonal="${escHtml(s.id)}">
      <div class="sub-info">
        <div class="sub-name">${escHtml(s.name)}</div>
        <div class="sub-detail">${escHtml(CAL_MONTHS[(+s.month || 1) - 1])} · ${escHtml(ci.icon)} ${escHtml(ci.label) || '—'}</div>
      </div>
      <div class="flex gap-8 items-center">
        <span class="mono bold">${fmtMoney(+s.amount || 0, 'ARS')}</span>
        <button class="icon-btn" aria-label="Editar estacional" onclick="openSeasonal('${escHtml(s.id)}')">${_EDIT_SVG}</button>
        <button class="icon-btn" aria-label="Eliminar estacional" onclick="deleteSeasonal('${escHtml(s.id)}')">${_DEL_SVG}</button>
      </div>
    </div>`;
  }).join('') : '<p class="empty-state">Todavía no cargaste ninguno. Ej.: regalo de Navidad, Día de la Madre, un cumpleaños.</p>';

  // Aviso: un mes futuro armado por la app es un borrador, no el presupuesto final
  const curMkNow = getActiveDate().slice(0, 7);
  const provNote = (_budgetAutoOf(b) && budgetActiveMonth > curMkNow)
    ? (() => { const [py, pm] = _calPrevMonthKey(budgetActiveMonth).split('-'); return `<p class="budget-prov">Borrador: el día 1 de ${monthLabel} se arma de nuevo con cómo quede ${CAL_MONTHS[+pm - 1]} ${py}. Si cambiás algo acá, queda como lo dejes.</p>`; })()
    : '';

  // Aviso (uno solo, nunca automático): meses que ya existían sin que los haya armado el código nuevo y cuyos
  // límites difieren del mes anterior. Más, si se acaba de rehacer alguno, el botón para deshacerlo.
  const _mLbl = mk => { const [y, mo] = mk.split('-'); return `${CAL_MONTHS[+mo - 1]} ${y}`; };
  const _sumTxt = s => `${s.n} ${s.n === 1 ? 'ítem' : 'ítems'} · ${fmtMoney(s.total, 'ARS')}`;
  const pendMks = _budgetPendingMonths(curMkNow);
  const pendOn = pendMks.filter(mk => mk > curMkNow && !_budgetPendOff.includes(mk));   // marcados de entrada: los futuros
  const undoMks = _budgetUndoValid().map(u => u.mk);
  let noticeBox = '';
  if (pendMks.length || undoMks.length) {
    const doneHtml = undoMks.length
      ? `<div class="budget-notice-done"><span>Se rehizo ${undoMks.map(_mLbl).join(', ')} con cómo quedó el mes anterior.</span>
           <button class="btn btn-ghost btn-sm" onclick="budgetUndoRedo()">Deshacer</button></div>` : '';
    let pendHtml = '';
    if (pendMks.length) {
      const one = pendMks.length === 1;
      const rows = pendMks.map(mk => {
        const pk = _prevBudgetKey(mk);
        const prevTxt = pendMks.includes(pk) ? `se arma desde cómo quede ${_mLbl(pk)}` : `${_mLbl(pk)} quedó con ${_sumTxt(_limitsSummary(S.budgets[pk]))}`;
        return `<label class="budget-notice-row">
          <input type="checkbox" data-pend="${mk}" ${pendOn.includes(mk) ? 'checked' : ''} onchange="budgetPendingSync()">
          <span><b>${_mLbl(mk)}</b> hoy tiene ${_sumTxt(_limitsSummary(S.budgets[mk]))}; ${prevTxt}.</span>
        </label>`;
      }).join('');
      pendHtml = `<div id="budgetPending">
        <p class="budget-notice-t">${one
          ? `${_mLbl(pendMks[0])} ya tenía un presupuesto armado antes, con límites de otros meses. ¿Querés rehacerlo con cómo quedó ${_mLbl(_prevBudgetKey(pendMks[0]))}?`
          : 'Estos meses ya tenían un presupuesto armado antes, con límites de otros meses. ¿Querés rehacerlos con cómo quedó el mes anterior? Se rehacen en orden.'}</p>
        ${rows}
        <div class="budget-notice-btns">
          <button class="btn btn-primary btn-sm" id="budgetPendingRedo" onclick="budgetPendingResolve('redo')" ${pendOn.length ? '' : 'disabled'}>Rehacer los marcados</button>
          <button class="btn btn-ghost btn-sm" onclick="budgetPendingResolve('keep')">Dejar los demás como están</button>
        </div>
        <p class="budget-notice-n">"Dejar los demás como están" cierra la lista: los meses sin marcar ya no se vuelven a preguntar. Lo rehecho se puede deshacer mientras no edites ese mes ni recargues la app.</p>
      </div>`;
    }
    noticeBox = `<div class="budget-notice" role="region" aria-label="Aviso de presupuesto">${doneHtml}${pendHtml}</div>`;
  }

  // Comparación plan vs real (solo ARS, mes activo)
  const realByCat = {};
  S.transactions.forEach(t => {
    if (t.type === 'expense' && t.currency === 'ARS' && t.date && t.date.slice(0,7) === budgetActiveMonth) {
      const c = t.category || 'other';
      realByCat[c] = (realByCat[c] || 0) + (+t.amount || 0);
    }
  });
  const budByCat = {};
  b.fixed.forEach(it => { if (it.category) budByCat[it.category] = (budByCat[it.category] || 0) + _budgetItemTotal(it); });
  b.reserved.forEach(it => { if (it.category) budByCat[it.category] = (budByCat[it.category] || 0) + (+it.amount || 0); });
  seasLines.forEach(it => { if (it.category) budByCat[it.category] = (budByCat[it.category] || 0) + (+it.amount || 0); });
  const allCats = [...new Set([...Object.keys(budByCat), ...Object.keys(realByCat)])]
    .filter(c => !budgetCatFilter || c === budgetCatFilter)
    .sort((a, c) => ((budByCat[c]||0)+(realByCat[c]||0)) - ((budByCat[a]||0)+(realByCat[a]||0)));
  const compRows = allCats.map(c => {
    const ci = getCatInfo(c, 'expense');
    const plan = budByCat[c] || 0, real = realByCat[c] || 0, saldo = plan - real;
    return `<div class="budget-cmp-row">
      <span class="budget-cmp-cat">${escHtml(ci.icon)} ${escHtml(ci.label) || escHtml(c)}</span>
      <span class="budget-cmp-num">${fmtMoney(plan, 'ARS')}</span>
      <span class="budget-cmp-num">${fmtMoney(real, 'ARS')}</span>
      <span class="budget-cmp-num ${saldo < 0 ? 'text-danger' : 'text-ok'}">${fmtMoney(saldo, 'ARS')}</span>
    </div>`;
  }).join('');
  const comparison = allCats.length ? `
    <div class="budget-cmp-hdr"><span>Categoría</span><span>Plan</span><span>Real</span><span>Saldo</span></div>
    ${compRows}` : '<p class="empty-state">Sin datos para comparar</p>';

  // Controles de vista (orden + categoría). Las categorías ofrecidas son las que
  // realmente aparecen en este mes: un desplegable con opciones vacías no sirve.
  const usedCats = [...new Set([...b.fixed, ...b.reserved, ...seasLines].map(it => it.category).filter(Boolean))];
  const catOpts = usedCats.map(c => {
    const ci = getCatInfo(c, 'expense');
    return `<option value="${escHtml(c)}" ${c === budgetCatFilter ? 'selected' : ''}>${escHtml(ci.icon)} ${escHtml(ci.label) || escHtml(c)}</option>`;
  }).join('');
  const controls = `<div class="budget-view-controls">
    <select class="inp budget-view-sel" id="budgetSortSel" aria-label="Ordenar ítems del presupuesto" onchange="setBudgetSort(this.value)">
      <option value="manual" ${budgetSort === 'manual' ? 'selected' : ''}>Orden de carga</option>
      <option value="amount" ${budgetSort === 'amount' ? 'selected' : ''}>Monto: mayor a menor</option>
    </select>
    <select class="inp budget-view-sel" id="budgetCatSel" aria-label="Filtrar por categoría" onchange="setBudgetCatFilter(this.value)">
      <option value="">Todas las categorías</option>${catOpts}
    </select>
  </div>`;

  body.innerHTML = `
    ${noticeBox}
    <div class="budget-totals">
      <div class="budget-total-main">
        <span class="budget-total-lbl">Presupuesto total</span>
        <span class="budget-total-num">${fmtMoney(totalFijo + totalRes + totalSeas, 'ARS')}</span>
      </div>
      <div class="budget-total-sub">
        <span>Mínimo fijo: <b>${fmtMoney(totalFijo, 'ARS')}</b></span>
        <span>Reservados: <b>${fmtMoney(totalRes, 'ARS')}</b></span>
        ${seasLines.length ? `<span>Estacionales: <b>${fmtMoney(totalSeas, 'ARS')}</b></span>` : ''}
      </div>
    </div>
    ${provNote}
    ${controls}
    <div class="budget-block-hdr">
      <span>Mínimo fijo</span>
      <button class="btn btn-ghost btn-sm" onclick="openBudgetFixed()">+ Ítem fijo</button>
    </div>
    ${fixedRows}
    <div class="budget-block-hdr">
      <span>Gastos reservados</span>
      <button class="btn btn-ghost btn-sm" onclick="openBudgetReserved()">+ Reservado</button>
    </div>
    ${resRows}
    ${seasBlock}
    <div class="budget-block-hdr">
      <span>Gastos estacionales</span>
      <button class="btn btn-ghost btn-sm" onclick="openSeasonal()">+ Estacional</button>
    </div>
    ${seasBaseRows}
    <div class="budget-block-hdr"><span>Plan vs. real · ${monthLabel}</span></div>
    ${comparison}`;
  if (typeof renderBudgetSummary === 'function') renderBudgetSummary();
}

// ── Resumen comparativo de presupuesto (vista de sección; el detalle vive en el overlay) ──
function _budgetMonthTotal(mk) {
  const b = S.budgets && S.budgets[mk]; if (!b) return _pfBudgetTotal(mk);
  let t = _pfBudgetTotal(mk);
  (b.fixed || []).forEach(it => t += _budgetItemTotal(it));
  (b.reserved || []).forEach(it => t += (+it.amount || 0));
  (b.seasonal || []).forEach(it => t += (+it.amount || 0));
  return t;
}
function _spentMonth(mk) {
  return (S.transactions || []).filter(t => t.type === 'expense' && t.currency === 'ARS' && t.date && t.date.slice(0, 7) === mk)
    .reduce((s, t) => s + (+t.amount || 0), 0);
}
function renderBudgetSummary() {
  const body = document.getElementById('budgetSummaryBody'); if (!body) return;
  if (!S.budgets) S.budgets = {};
  const mk = _curMonthKey();
  const budget = _budgetMonthTotal(mk), spent = _spentMonth(mk);
  const ratio = budget > 0 ? spent / budget : 0;
  const over = budget > 0 && spent > budget;

  // Por categoría (plan vs real), top 5 por gasto real
  const realByCat = {}, budByCat = {};
  (S.transactions || []).forEach(t => {
    if (t.type === 'expense' && t.currency === 'ARS' && t.date && t.date.slice(0, 7) === mk) {
      const c = t.category || 'other'; realByCat[c] = (realByCat[c] || 0) + (+t.amount || 0);
    }
  });
  const b = S.budgets[mk];
  if (b) {
    (b.fixed || []).forEach(it => { if (it.category) budByCat[it.category] = (budByCat[it.category] || 0) + _budgetItemTotal(it); });
    (b.reserved || []).forEach(it => { if (it.category) budByCat[it.category] = (budByCat[it.category] || 0) + (+it.amount || 0); });
    (b.seasonal || []).forEach(it => { if (it.category) budByCat[it.category] = (budByCat[it.category] || 0) + (+it.amount || 0); });
  }
  const cats = [...new Set([...Object.keys(budByCat), ...Object.keys(realByCat)])]
    .sort((a, c) => (realByCat[c] || 0) - (realByCat[a] || 0)).slice(0, 5);

  // Tendencia últimos 6 meses
  const months = []; const now = new Date();
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const trend = months.map(m => ({ m, spent: _spentMonth(m), budget: _budgetMonthTotal(m) }));
  const maxT = Math.max(1, ...trend.map(t => Math.max(t.spent, t.budget)));

  const catRows = cats.map(c => {
    const ci = getCatInfo(c, 'expense'); const plan = budByCat[c] || 0, real = realByCat[c] || 0;
    const w = plan > 0 ? Math.min(real / plan * 100, 100) : (real > 0 ? 100 : 0);
    const ov = plan > 0 && real > plan;
    return `<div class="bsum-cat">
      <div class="bsum-cat-top"><span class="bsum-cat-name">${escHtml(ci.icon)} ${escHtml(ci.label) || escHtml(c)}</span><span class="bsum-cat-val mono ${ov ? 'text-danger' : ''}">${fmtMoney(real, 'ARS')} / ${fmtMoney(plan, 'ARS')}</span></div>
      <div class="bsum-cat-bar"><div class="bsum-cat-fill${ov ? ' over' : ''}" style="width:${w}%"></div></div>
    </div>`;
  }).join('') || '<p class="empty-state">Sin movimientos este mes</p>';

  const trendCols = trend.map(t => {
    const h = Math.round(t.spent / maxT * 100), bh = Math.round(t.budget / maxT * 100);
    const [, mm] = t.m.split('-'); const ov = t.budget > 0 && t.spent > t.budget;
    return `<div class="bsum-tcol" title="${CAL_MONTHS[+mm - 1]}: gastado ${fmtMoney(t.spent, 'ARS')} / plan ${fmtMoney(t.budget, 'ARS')}">
      <div class="bsum-tbars"><div class="bsum-tbudget" style="height:${Math.max(bh, 2)}%"></div><div class="bsum-tspent${ov ? ' over' : ''}" style="height:${Math.max(h, 2)}%"></div></div>
      <div class="bsum-tlbl">${CAL_MONTHS[+mm - 1].slice(0, 3)}</div>
    </div>`;
  }).join('');

  // Medidor radial (arco 270°). C = 2·π·50 ≈ 314.16; arco visible = 0.75·C ≈ 235.6.
  const ARC = 235.6, FULL = 314.16;
  const valDash = `${(ARC * Math.min(ratio, 1)).toFixed(1)} ${FULL}`;
  // Aviso corto (solo si hay meses por decidir) que lleva a la pantalla de presupuestos, donde está la lista.
  const pendN = _budgetPendingMonths(mk).length;
  const pendLine = pendN
    ? `<button class="bsum-pend" onclick="if(window.openBudgetOverlay)openBudgetOverlay()">Tenés ${pendN} ${pendN === 1 ? 'mes' : 'meses'} con presupuesto armado antes: revisalos →</button>`
    : '';
  body.innerHTML = `
    ${pendLine}
    <div class="bsum-top">
      <div class="bsum-gauge-wrap">
        <svg class="bsum-gauge" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="bsum-gauge-track" cx="60" cy="60" r="50"/>
          <circle class="bsum-gauge-val${over ? ' over' : ''}" cx="60" cy="60" r="50" style="--dash:${valDash}"/>
        </svg>
        <div class="bsum-gauge-center">
          <div class="bsum-gauge-pct${over ? ' over' : ''}">${budget > 0 ? Math.round(ratio * 100) : 0}<span>%</span></div>
          <div class="bsum-gauge-sub">usado</div>
        </div>
      </div>
      <div class="bsum-figs">
        <div class="bsum-fig"><span class="bsum-fig-lbl">Gastado</span><span class="bsum-fig-num${over ? ' over' : ''}">${fmtMoney(spent, 'ARS')}</span></div>
        <div class="bsum-fig"><span class="bsum-fig-lbl">Presupuesto</span><span class="bsum-fig-num2">${fmtMoney(budget, 'ARS')}</span></div>
        <div class="bsum-fig"><span class="bsum-fig-lbl">${over ? 'Excedido' : 'Disponible'}</span><span class="bsum-fig-num3 ${over ? 'text-danger' : 'text-ok'}">${fmtMoney(Math.abs(budget - spent), 'ARS')}</span></div>
      </div>
    </div>
    <div class="bsum-sec">Por categoría · real / plan</div>
    ${catRows}
    <div class="bsum-sec">Gastado · últimos 6 meses</div>
    <div class="bsum-trend">${trendCols}</div>
    <button class="bsum-full" onclick="if(window.openBudgetOverlay)openBudgetOverlay()">Ver presupuesto completo →</button>`;
}

// Llena un <select> de categoría de transacción (#txnCategory / #editTxnCategory) desde
// el set dinámico. Si `selected` referencia una categoría borrada, la agrega igual como
// opción huérfana (fallback) para no perder de vista qué tenía cargado el movimiento.
function fillTxnCategorySelect(elId, selected) {
  const el = document.getElementById(elId);
  if (!el) return;
  const map = _liveCatMap();
  const opts = ['<option value="">— Sin categoría —</option>'];
  Object.entries(map).forEach(([id, c]) => {
    opts.push(`<option value="${escHtml(id)}" ${id === selected ? 'selected' : ''}>${escHtml(c.icon)} ${escHtml(c.label)}</option>`);
  });
  if (selected && !map[selected]) {
    opts.push(`<option value="${escHtml(selected)}" selected>💸 (categoría eliminada)</option>`);
  }
  el.innerHTML = opts.join('');
}

// ════════════════════════════════════════════════════════
// GESTIONAR CATEGORÍAS
// ════════════════════════════════════════════════════════
function openCatManager() {
  ensureTxnCategories();
  renderCatManagerList();
  openModal('modal-cat-manager');
}

function renderCatManagerList() {
  const el = document.getElementById('catMgrList');
  if (!el) return;
  const groups = [...CAT_SECTIONS, { id: null, label: 'Sin sección', color: 'rgba(255,255,255,.3)' }];
  const html = groups.map(sec => {
    const cats = Object.entries(S.txnCategories).filter(([, c]) => (c.section || null) === sec.id);
    if (!cats.length) return '';
    const rows = cats.map(([id, c]) => `
      <div class="sub-row catmgr-row">
        <div class="catmgr-swatch" style="background:${_hexToRgba(c.color || '#fff', 1)}"></div>
        <div class="sub-info">
          <div class="sub-name">${escHtml(c.icon || '💸')} ${escHtml(c.label)}</div>
        </div>
        <button class="icon-btn" onclick="openCatEdit('${id}')" title="Editar">${_EDIT_SVG}</button>
      </div>`).join('');
    return `<div class="catmgr-sec-hdr" style="color:${sec.color}">${sec.label}</div>${rows}`;
  }).join('');
  el.innerHTML = html || '<p class="empty-state">Sin categorías</p>';
}

function openCatEdit(id) {
  ensureTxnCategories();
  const c = id ? S.txnCategories[id] : null;
  document.getElementById('catEditTitle').textContent = c ? 'Editar categoría' : 'Nueva categoría';
  document.getElementById('catEditId').value = id || '';
  document.getElementById('catEditName').value = c ? c.label : '';
  document.getElementById('catEditIcon').value = c ? c.icon : '';
  document.getElementById('catEditColor').value = (c && c.color) || '#8B5CF6';
  document.getElementById('catEditSection').value = c ? (c.section || '') : '';
  document.getElementById('catEditDel').style.display = c ? '' : 'none';
  closeModal('modal-cat-manager');
  openModal('modal-cat-edit');
}

function saveTxnCategory() {
  const name = document.getElementById('catEditName').value.trim();
  if (!name) { showToast('Escribe el nombre de la categoría'); return; }
  ensureTxnCategories();
  const id = document.getElementById('catEditId').value || uid();
  const icon = document.getElementById('catEditIcon').value.trim() || '💸';
  const color = document.getElementById('catEditColor').value || 'rgba(255,255,255,.06)';
  const section = document.getElementById('catEditSection').value || null;
  S.txnCategories[id] = { label: name, icon, color, section };
  _invalidateCatCache();
  saveState();
  closeModal('modal-cat-edit');
  openModal('modal-cat-manager');
  renderCatManagerList();
  renderFinanzasTab();
  showToast('Categoría guardada');
}

function deleteTxnCategory(id) {
  if (!id) return;
  if (!confirm('¿Borrar esta categoría? Las transacciones y renglones de presupuesto que ya la usan no se modifican, solo deja de estar disponible para cargas nuevas.')) return;
  delete S.txnCategories[id];
  _invalidateCatCache();
  saveState();
  closeModal('modal-cat-edit');
  openModal('modal-cat-manager');
  renderCatManagerList();
  renderFinanzasTab();
  showToast('Categoría eliminada');
}

function fillBudgetCatSelect(elId, selected) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = BUDGET_EXPENSE_CATS.map(c => {
    const ci = getCatInfo(c, 'expense');
    return `<option value="${escHtml(c)}" ${c === selected ? 'selected' : ''}>${escHtml(ci.icon)} ${escHtml(ci.label)}</option>`;
  }).join('');
}

function openBudgetFixed(id) {
  const b = S.budgets[budgetActiveMonth];
  const it = id && b ? b.fixed.find(x => x.id === id) : null;
  document.getElementById('budgetFixedTitle').textContent = it ? 'Editar ítem fijo' : 'Nuevo ítem fijo';
  document.getElementById('budgetFixedId').value = it ? it.id : '';
  document.getElementById('budgetFixedName').value = it ? it.name : '';
  fillBudgetCatSelect('budgetFixedCat', it ? it.category : BUDGET_EXPENSE_CATS[0]);
  document.getElementById('budgetFixedUnit').value = it ? (it.unit || 'unidades') : 'unidades';
  document.getElementById('budgetFixedV1').value = it ? it.v1 : '';
  document.getElementById('budgetFixedV2').value = it ? it.v2 : '';
  document.getElementById('budgetFixedV3').value = it ? it.v3 : '';
  document.getElementById('budgetFixedDel').style.display = it ? '' : 'none';
  updateBudgetFixedPreview();
  openModal('modal-budget-fixed');
}

function updateBudgetFixedPreview() {
  const el = document.getElementById('budgetFixedPreview');
  if (!el) return;
  const v1 = +document.getElementById('budgetFixedV1').value || 0;
  const v2 = +document.getElementById('budgetFixedV2').value || 0;
  const v3 = +document.getElementById('budgetFixedV3').value || 0;
  el.textContent = `${v1} × ${v2} × ${v3} = ${fmtMoney(v1 * v2 * v3, 'ARS')}`;
}

function saveBudgetFixed() {
  const name = document.getElementById('budgetFixedName').value.trim();
  if (!name) { showToast('Escribe el nombre'); return; }
  ensureBudgetMonth(budgetActiveMonth);
  const b = S.budgets[budgetActiveMonth];
  const id = document.getElementById('budgetFixedId').value;
  const data = {
    name,
    category: document.getElementById('budgetFixedCat').value,
    unit: document.getElementById('budgetFixedUnit').value,
    v1: +document.getElementById('budgetFixedV1').value || 0,
    v2: +document.getElementById('budgetFixedV2').value || 0,
    v3: +document.getElementById('budgetFixedV3').value || 0,
  };
  if (id) { const it = b.fixed.find(x => x.id === id); if (it) Object.assign(it, data); }
  else { b.fixed.push({ id: uid(), ...data }); }
  _touchBudget(b);
  saveState(); renderBudget(); closeModal('modal-budget-fixed');
  showToast('Ítem fijo guardado');
}

function deleteBudgetFixed(id) {
  const b = S.budgets[budgetActiveMonth];
  if (!b) return;
  b.fixed = b.fixed.filter(x => x.id !== id);
  _touchBudget(b);
  saveState(); renderBudget(); closeModal('modal-budget-fixed');
}

function openBudgetReserved(id) {
  const b = S.budgets[budgetActiveMonth];
  const it = id && b ? b.reserved.find(x => x.id === id) : null;
  document.getElementById('budgetReservedTitle').textContent = it ? 'Editar gasto reservado' : 'Nuevo gasto reservado';
  document.getElementById('budgetReservedId').value = it ? it.id : '';
  document.getElementById('budgetReservedName').value = it ? it.name : '';
  fillBudgetCatSelect('budgetReservedCat', it ? it.category : BUDGET_EXPENSE_CATS[0]);
  document.getElementById('budgetReservedAmount').value = it ? it.amount : '';
  document.getElementById('budgetReservedDel').style.display = it ? '' : 'none';
  openModal('modal-budget-reserved');
}

function saveBudgetReserved() {
  const name = document.getElementById('budgetReservedName').value.trim();
  if (!name) { showToast('Escribe el nombre'); return; }
  ensureBudgetMonth(budgetActiveMonth);
  const b = S.budgets[budgetActiveMonth];
  const id = document.getElementById('budgetReservedId').value;
  const data = {
    name,
    category: document.getElementById('budgetReservedCat').value,
    amount: +document.getElementById('budgetReservedAmount').value || 0,
  };
  if (id) { const it = b.reserved.find(x => x.id === id); if (it) Object.assign(it, data); }
  else { b.reserved.push({ id: uid(), ...data }); }
  _touchBudget(b);
  saveState(); renderBudget(); closeModal('modal-budget-reserved');
  showToast('Gasto reservado guardado');
}

function deleteBudgetReserved(id) {
  const b = S.budgets[budgetActiveMonth];
  if (!b) return;
  b.reserved = b.reserved.filter(x => x.id !== id);
  _touchBudget(b);
  saveState(); renderBudget(); closeModal('modal-budget-reserved');
}

// ── Gastos estacionales (S.seasonals): regalos, cumpleaños, Día de la Madre... ──
// Se crean/editan/eliminan acá; en su mes se cargan solos como línea del presupuesto (rollBudgets).
// Monto válido: mayor a 0 y con hasta 2 decimales. Devuelve null si no sirve.
function _parseMoney2(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = +s;
  return n > 0 ? n : null;
}
const _SEAS_MONEY_MSG = 'Escribí un monto mayor a 0, con hasta 2 decimales';

function openSeasonal(id) {
  if (!Array.isArray(S.seasonals)) S.seasonals = [];
  const s = id ? S.seasonals.find(x => x.id === id) : null;
  document.getElementById('seasonalTitle').textContent = s ? 'Editar estacional' : 'Nuevo estacional';
  document.getElementById('seasonalId').value = s ? s.id : '';
  document.getElementById('seasonalName').value = s ? s.name : '';
  document.getElementById('seasonalMonth').innerHTML = CAL_MONTHS.map((m, i) =>
    `<option value="${i + 1}" ${s && s.month === i + 1 ? 'selected' : ''}>${m}</option>`).join('');
  fillBudgetCatSelect('seasonalCat', s ? s.category : BUDGET_EXPENSE_CATS[0]);
  document.getElementById('seasonalAmount').value = s ? s.amount : '';
  document.getElementById('seasonalDel').style.display = s ? '' : 'none';
  openModal('modal-seasonal');
}

function saveSeasonal() {
  const name = document.getElementById('seasonalName').value.trim();
  if (!name) { showToast('Escribí un nombre'); return; }
  if (name.length > 60) { showToast('El nombre es muy largo (máximo 60 letras)'); return; }
  const mRaw = document.getElementById('seasonalMonth').value;
  const month = /^\d{1,2}$/.test(mRaw) ? +mRaw : 0;
  if (month < 1 || month > 12) { showToast('Elegí un mes del 1 al 12'); return; }
  const amount = _parseMoney2(document.getElementById('seasonalAmount').value);
  if (amount === null) { showToast(_SEAS_MONEY_MSG); return; }
  const category = document.getElementById('seasonalCat').value;
  if (!BUDGET_EXPENSE_CATS.includes(category)) { showToast('Elegí una categoría'); return; }
  if (!Array.isArray(S.seasonals)) S.seasonals = [];
  const idEl = document.getElementById('seasonalId');
  const cur = idEl.value ? S.seasonals.find(x => x.id === idEl.value) : null;
  if (cur) Object.assign(cur, { name, month, amount, category });
  else {
    const id = uid();
    S.seasonals.push({ id, name, month, amount, category });
    idEl.value = id;   // un segundo clic guarda sobre este mismo, no crea otro
  }
  _syncSeasonalLines(getActiveDate().slice(0, 7));
  saveState(); renderBudget(); closeModal('modal-seasonal');
  showToast('Estacional guardado');
}

function deleteSeasonal(id) {
  const s = (S.seasonals || []).find(x => x.id === id);
  if (!s) return;
  if (!confirm(`¿Eliminar "${s.name}"? Se saca de este mes y de los próximos. Los meses que ya pasaron no cambian.`)) return;
  S.seasonals = S.seasonals.filter(x => x.id !== id);
  _syncSeasonalLines(getActiveDate().slice(0, 7));
  saveState(); renderBudget(); closeModal('modal-seasonal');
  showToast('Estacional eliminado');
}

function _seasonalLineOf(lineId) {
  const b = S.budgets && S.budgets[budgetActiveMonth];
  const line = b && (b.seasonal || []).find(x => x.id === lineId);
  return { b, line };
}

function openSeasonalLine(lineId) {
  const { line } = _seasonalLineOf(lineId);
  if (!line) return;
  document.getElementById('seasonalLineId').value = line.id;
  document.getElementById('seasonalLineTitle').textContent = line.name;
  document.getElementById('seasonalLineAmount').value = line.amount;
  openModal('modal-seasonal-line');
}

// updateBase=false: el monto vale solo para este mes (el estacional no cambia).
// updateBase=true: además pasa a ser el monto base del estacional (los próximos años y meses).
function saveSeasonalLine(updateBase) {
  const { b, line } = _seasonalLineOf(document.getElementById('seasonalLineId').value);
  if (!line) return;
  const amount = _parseMoney2(document.getElementById('seasonalLineAmount').value);
  if (amount === null) { showToast(_SEAS_MONEY_MSG); return; }
  line.amount = amount;
  line.adjusted = !updateBase;
  if (updateBase) {
    const s = (S.seasonals || []).find(x => x.id === line.seasonalId);
    if (s) s.amount = amount;
  }
  _touchBudget(b);
  _syncSeasonalLines(getActiveDate().slice(0, 7));
  saveState(); renderBudget(); closeModal('modal-seasonal-line');
  showToast(updateBase ? 'Monto base actualizado' : 'Monto de este mes guardado');
}

// Quita la línea solo de este mes (el estacional sigue existiendo y vuelve a cargarse otros meses).
function deleteSeasonalLine(lineId) {
  const { b, line } = _seasonalLineOf(lineId);
  if (!line) return;
  if (!confirm(`¿Quitar "${line.name}" del presupuesto de este mes? El estacional sigue guardado.`)) return;
  b.seasonal = b.seasonal.filter(x => x.id !== lineId);
  if (!Array.isArray(b.skipSeasonal)) b.skipSeasonal = [];
  if (!b.skipSeasonal.includes(line.seasonalId)) b.skipSeasonal.push(line.seasonalId);
  _touchBudget(b);
  saveState(); renderBudget(); closeModal('modal-seasonal-line');
}

let txnActiveMonth = null;
// Filtro de categoría exclusivo del overlay de historial completo (secciones-fab.js).
// Por defecto vacío ("todas") — así la lista del mes activo en la pestaña principal de
// Finanzas nunca se ve afectada; se resetea a '' al cerrar el overlay.
let txnHistCatFilter = '';
function setTxnHistCat(cat) { txnHistCatFilter = cat; renderActivity(); }
// Orden de la lista del historial: 'date' (default, como se cargó) o 'amount' (mayor a menor).
let txnHistSort = 'date';
function setTxnHistSort(mode) { txnHistSort = mode; renderActivity(); }
// Filtro por veredicto del gasto: '' (todos), 'good', 'bad' o 'none' (gastos sin clasificar).
// Mismo ciclo de vida que txnHistCatFilter: vive solo mientras el overlay está abierto.
let txnHistVerdictFilter = '';
function setTxnHistVerdict(v) { txnHistVerdictFilter = v; renderActivity(); }

// Veredicto de un gasto: 👍 vale la pena / 👎 recortable. Es transversal a la categoría
// (un gasto de "Comida" puede ser cualquiera de los dos), por eso no vive en TXN_CATEGORIES.
// Solo aplica a type==='expense'; volver a tocar el mismo pulgar lo deja sin clasificar.
function toggleTxnVerdict(id, v) {
  const txn = S.transactions.find(t => t.id === id);
  if (!txn || txn.type !== 'expense') return;
  if (txn.verdict === v) delete txn.verdict; else txn.verdict = v;
  saveState(); renderActivity();
}

function getAvailableMonths() {
  const months = new Set();
  S.transactions.forEach(t => { if (t.date) months.add(t.date.slice(0,7)); });
  // El mes actual siempre está disponible aunque no tenga movimientos todavía,
  // así Actividad rota al mes en curso el día 1 en vez de quedarse en el último mes con datos.
  const now = new Date();
  months.add(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  // El mes siguiente también está siempre disponible: es donde se paran para cargar gastos
  // programados (specs/gastos-programados.md) — sin esto no hay forma de entrar a esa pestaña.
  const next = new Date(now.getFullYear(), now.getMonth()+1, 1);
  months.add(`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`);
  return [...months].sort().reverse();
}

function setTxnMonth(m) { txnActiveMonth = m; renderActivity(); }

// Mes destino del modal "Nuevo movimiento" / edición: mes actual + próximos N meses futuros
// (a diferencia de getAvailableMonths(), que solo mira meses con transacciones ya cargadas).
function getTxnMonthOptions(futureCount = 6) {
  const now = new Date();
  const months = [];
  for (let i = 0; i <= futureCount; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  return months;
}

// El "Mes destino" (con su semántica de gasto programado) solo aplica a gastos — los ingresos
// programados a futuro quedan fuera del alcance del spec. Oculta el campo cuando el Tipo es
// Ingreso, para no dejar que el usuario elija un mes que después se descarta en silencio.
// Usada hoy solo por el modal de edición (#editTxnMonth es un <select>, sigue existiendo).
function toggleTxnMonthField(fieldId, type) {
  const field = document.getElementById(fieldId);
  if (field) field.closest('.field').style.display = type === 'income' ? 'none' : '';
}

// Modal "Nuevo movimiento": sin selector de mes (ver revisión 2026-07-22 del spec) — el mes
// destino es siempre txnActiveMonth (la pestaña activa de Actividad). Este aviso de texto es
// el único indicio del mes destino cuando esa pestaña es futura; para income nunca dice
// "pendiente" porque los ingresos programados se aplican de inmediato (fuera de alcance).
function updateTxnMonthNotice() {
  const notice = document.getElementById('txnMonthNotice');
  if (!notice) return;
  if (_txnPayCardId()) { notice.style.display = 'none'; return; }   // compra con tarjeta: manda la fecha de la compra
  const now = new Date();
  const curMK = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const targetMonth = txnActiveMonth || curMK;
  if (targetMonth === curMK) { notice.style.display = 'none'; return; }
  const type = document.getElementById('txnType')?.value;
  const [y, mo] = targetMonth.split('-');
  const lbl = CAL_MONTHS[+mo-1] + ' ' + y;
  notice.textContent = type === 'income'
    ? `Se va a cargar en ${lbl}.`
    : `Se va a cargar en ${lbl} · quedará pendiente hasta esa fecha.`;
  notice.style.display = '';
}

// currentMonth: mes ('YYYY-MM') que debe quedar seleccionado por defecto (ej. el mes destino
// ya guardado de una transacción existente al editar). Si no está entre las opciones futuras
// (ej. es un mes pasado), se agrega igual para no perder la selección real del movimiento.
function populateTxnMonthSelect(selId, currentMonth) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const curMK = getTxnMonthOptions()[0];
  let months = getTxnMonthOptions();
  if (currentMonth && !months.includes(currentMonth)) months = [currentMonth, ...months];
  sel.innerHTML = months.map(m => {
    const [y,mo] = m.split('-');
    const lbl = CAL_MONTHS[+mo-1] + ' ' + y;
    return `<option value="${m}">${lbl}${m===curMK?' (actual)':''}</option>`;
  }).join('');
  sel.value = currentMonth || curMK;
}

let activityListCollapsed = false;

function toggleActivityList() {
  activityListCollapsed = !activityListCollapsed;
  const list = document.getElementById('activityList');
  const icon = document.getElementById('activityCollapseIcon');
  if (list) list.classList.toggle('collapsed', activityListCollapsed);
  if (icon) icon.classList.toggle('collapsed', activityListCollapsed);
}

function renderActivity() {
  if (!Array.isArray(S.transactions)) return; // estado aún no cargado (loadState es async; _sfMount puede llamar antes)
  applyPendingScheduledExpenses();
  cardsCatchUp();

  const months = getAvailableMonths();
  const now = new Date();
  const curMK = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  if (!txnActiveMonth || !months.includes(txnActiveMonth)) txnActiveMonth = curMK;

  // Month filter tabs (sección + espejo en el overlay de historial)
  const chipsHtml = months.map(m => {
    const [y,mo] = m.split('-');
    const lbl = CAL_MONTHS[+mo-1].slice(0,3)+' '+y.slice(2);
    return `<button class="txn-month-btn${m===txnActiveMonth?' active':''}" onclick="setTxnMonth('${m}')">${lbl}</button>`;
  }).join('');
  const filterEl = document.getElementById('txnMonthFilter');
  if (months.length > 1) { filterEl.style.display = ''; filterEl.innerHTML = chipsHtml; }
  else { filterEl.style.display = 'none'; }
  // Overlay de historial = archivo completo: muestra siempre todos los meses con datos.
  const histFilterEl = document.getElementById('txnHistMonthFilter');
  if (histFilterEl) histFilterEl.innerHTML = chipsHtml;

  const filtered = S.transactions.filter(t => t.date && t.date.startsWith(txnActiveMonth));

  // Summary
  let totalInc = 0, totalExp = 0;
  filtered.forEach(t => { if (t.type==='income') totalInc+=t.amount; else totalExp+=t.amount; });
  const bal = totalInc - totalExp;
  const sumRow = document.getElementById('txnSummaryRow');
  sumRow.style.display = filtered.length ? '' : 'none';
  document.getElementById('txnSumIncome').textContent = '+'+fmtMoney(totalInc, filtered[0]?.currency||'ARS');
  document.getElementById('txnSumExpense').textContent = '-'+fmtMoney(totalExp, filtered[0]?.currency||'ARS');
  const balEl = document.getElementById('txnSumBalance');
  balEl.textContent = (bal>=0?'+':'')+fmtMoney(Math.abs(bal), filtered[0]?.currency||'ARS');
  balEl.className = 'fin-summary-num '+(bal>=0?'text-ok':'text-danger');

  // Transaction list — el filtro de categoría solo aplica acá (overlay de historial);
  // summary y chart de arriba siguen usando `filtered` (mes) sin categoría, ya que
  // esa porción también se ve desde la pestaña principal de Finanzas.
  const list = document.getElementById('activityList');
  const empty = document.getElementById('activityEmpty');
  const accMap = {};
  S.accounts.forEach(a => accMap[a.id] = a);

  let filteredForList = txnHistCatFilter ? filtered.filter(t => t.category === txnHistCatFilter) : filtered;
  if (txnHistVerdictFilter === 'none') filteredForList = filteredForList.filter(t => t.type === 'expense' && !t.verdict);
  else if (txnHistVerdictFilter) filteredForList = filteredForList.filter(t => t.verdict === txnHistVerdictFilter);
  if (txnHistSort === 'amount') filteredForList = [...filteredForList].sort((a, b) => (+b.amount || 0) - (+a.amount || 0));

  // Total recortable del mes: solo ARS (mismo criterio que getMonthlyExpenses) para no
  // sumar monedas distintas en un solo número. Se calcula sobre `filtered` (el mes entero),
  // no sobre la lista filtrada, así el número no cambia al filtrar por categoría.
  const badTotEl = document.getElementById('txnHistBadTotal');
  if (badTotEl) {
    const badTot = filtered
      .filter(t => t.type === 'expense' && t.verdict === 'bad' && t.currency === 'ARS')
      .reduce((s, t) => s + (+t.amount || 0), 0);
    badTotEl.style.display = badTot ? '' : 'none';
    badTotEl.textContent = `👎 Recortable: ${fmtMoney(badTot, 'ARS')}`;
  }

  const colHdr = document.getElementById('activityColHdr');
  if (!filteredForList.length) {
    list.innerHTML=''; empty.classList.remove('hidden');
    if (colHdr) colHdr.style.display = 'none';
  } else {
    empty.classList.add('hidden');
    if (colHdr) colHdr.style.display = '';
    list.innerHTML = filteredForList.map(t => {
      const cat = getCatInfo(t.category, t.type);
      const acc = t.accountId ? accMap[t.accountId] : null;
      const catBadge = t.category
        ? `<span style="font-size:var(--fs-12-5);padding:1px 7px;border-radius:99px;font-weight:700;background:${cat.color};border:1px solid ${cat.border};color:var(--ts);margin-left:4px">${escHtml(cat.icon)} ${escHtml(cat.label)}</span>`
        : '';
      const pendingBadge = t.pending ? `<span class="txn-pending-badge">⏳ Pendiente</span>` : '';
      const verdictBtns = t.type === 'expense'
        ? `<div class="txn-verdict">
            <button class="txn-verdict-btn${t.verdict==='good'?' on':''}" onclick="toggleTxnVerdict('${t.id}','good')" title="Gasto que vale la pena" aria-label="Marcar como gasto que vale la pena" aria-pressed="${t.verdict==='good'}">👍</button>
            <button class="txn-verdict-btn${t.verdict==='bad'?' on':''}" onclick="toggleTxnVerdict('${t.id}','bad')" title="Gasto recortable" aria-label="Marcar como gasto recortable" aria-pressed="${t.verdict==='bad'}">👎</button>
          </div>`
        : '';
      return `<div class="activity-row">
        <div class="act-icon" style="background:${t.type==='income'?'rgba(107,227,164,.1)':'rgba(255,107,107,.1)'}">${escHtml(cat.icon||(t.type==='income'?'💚':'🔴'))}</div>
        <div class="act-info">
          <div class="act-name" style="display:flex;align-items:center;flex-wrap:wrap;gap:2px">${escHtml(t.name)}${catBadge}${pendingBadge}</div>
          <div class="act-date">${fmtDate(t.date)}${acc?` <span style="color:var(--ts)">· ${acc.icon||'🏦'} ${acc.name}</span>`:''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${verdictBtns}
          <div class="act-amount ${t.type}">${t.type==='expense'?'-':'+'} ${fmtMoney(t.amount,t.currency)}${t.type==='expense'?_discTagHtml(t):''}</div>
          <div class="txn-actions"><button class="icon-btn" onclick="openEditTxn('${t.id}')" title="Editar"><svg viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></div>
        </div>
      </div>`;
    }).join('');
  }

  // Expense chart
  renderTxnChart(filtered);

  // "Ver historial →" en la sección (abre el overlay que aloja la lista)
  const verHistBtn = document.getElementById('verHistorialBtn');
  if (verHistBtn) verHistBtn.style.display = S.transactions.length ? '' : 'none';

  // Monthly balance toggle button
  const histBtn = document.getElementById('toggleMonthBalance');
  histBtn.style.display = S.transactions.length ? '' : 'none';

  // Render month balance if visible
  const histEl = document.getElementById('monthBalanceList');
  if (histEl.style.display !== 'none') renderMonthBalanceList();
}

function renderTxnChart(transactions) {
  const wrap = document.getElementById('txnChartWrap');
  const canvas = document.getElementById('txnExpenseChart');
  if (!wrap || !canvas) return;

  const expenses = transactions.filter(t => t.type === 'expense');
  if (!expenses.length) {
    wrap.style.display = 'none';
    if (txnChartInst) { txnChartInst.destroy(); txnChartInst = null; }
    return;
  }
  wrap.style.display = '';

  // Group expenses by category
  const byCat = {};
  expenses.forEach(t => {
    const k = t.category || 'other';
    byCat[k] = (byCat[k] || 0) + t.amount;
  });

  // Sort by amount descending
  const sorted = Object.entries(byCat).sort((a,b) => b[1]-a[1]);
  const labels  = sorted.map(([k]) => { const c = TXN_CATEGORIES[k]; return c ? c.icon+' '+c.label : k; });
  const data    = sorted.map(([,v]) => v);
  const colors  = sorted.map(([k]) => (TXN_CATEGORIES[k]?.chartColor || 'rgba(255,255,255,.4)'));
  const total   = data.reduce((a,b)=>a+b,0);

  if (txnChartInst) { txnChartInst.destroy(); txnChartInst = null; }
  txnChartInst = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      _noCrosshair: true,
      interaction: { mode: 'nearest', intersect: true },
      animation: { animateRotate: true, animateScale: true, duration: 900, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          position: 'right',
          labels: {
            font: { size: _cfs(13), weight: '600' },
            padding: 10,
            boxWidth: 10,
            color: '#FFFFFF',
            generateLabels(chart) {
              // Solo las 5 categorías con más gasto (el donut conserva todas las porciones)
              return chart.data.labels.slice(0, 5).map((label, i) => ({
                text: label + '  ' + fmtMoney(data[i], 'ARS'),
                fillStyle: colors[i],
                strokeStyle: 'transparent',
                fontColor: '#FFFFFF',
                color: '#FFFFFF',
                hidden: false,
                index: i,
              }));
            }
          }
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const pct = total ? ((ctx.raw/total)*100).toFixed(1) : 0;
              return ` ${fmtMoney(ctx.raw,'ARS')}  (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderMonthBalanceList() {
  const el = document.getElementById('monthBalanceList');
  if (!el) return;
  const monthData = {};
  S.transactions.forEach(t => {
    if (!t.date) return;
    const mk = t.date.slice(0,7);
    if (!monthData[mk]) monthData[mk] = { inc:0, exp:0 };
    if (t.type==='income') monthData[mk].inc += t.amount;
    else monthData[mk].exp += t.amount;
  });
  const months = Object.keys(monthData).sort().reverse();
  if (!months.length) { el.innerHTML='<div class="empty-state" style="padding:16px 0">Sin historial aún</div>'; return; }
  el.innerHTML = months.map(mk => {
    const { inc, exp } = monthData[mk];
    const bal = inc - exp;
    const [y,m] = mk.split('-');
    return `<div class="month-balance-row">
      <div>
        <div class="month-balance-label">${CAL_MONTHS[+m-1]} ${y}</div>
        <div class="month-balance-sub">Ingr: +${fmtMoney(inc,'ARS')} · Gast: -${fmtMoney(exp,'ARS')}</div>
      </div>
      <div class="month-balance-val ${bal>=0?'text-ok':'text-danger'}">${bal>=0?'+':''}${fmtMoney(Math.abs(bal),'ARS')}</div>
    </div>`;
  }).join('');
}

function toggleMonthBalanceView() {
  const el = document.getElementById('monthBalanceList');
  const btn = document.getElementById('toggleMonthBalance');
  if (!el) return;
  const visible = el.style.display !== 'none';
  el.style.display = visible ? 'none' : '';
  btn.textContent = visible ? '↓ Ver historial mensual' : '↑ Ocultar historial';
  if (!visible) renderMonthBalanceList();
}

function openEditTxn(id) {
  const txn = S.transactions.find(t=>t.id===id);
  if (!txn) return;
  document.getElementById('editTxnId').value = txn.id;
  document.getElementById('editTxnName').value = txn.name;
  document.getElementById('editTxnType').value = txn.type;
  document.getElementById('editTxnAmount').value = txn.amount;
  document.getElementById('editTxnCurrency').value = txn.currency;
  fillTxnCategorySelect('editTxnCategory', txn.category);
  const sel = document.getElementById('editTxnAccount');
  sel.innerHTML = _txnAccountOptionsHtml();
  // Cuenta que ya no existe: se conserva tal cual al guardar (sin saldo que mover).
  if (txn.accountId && ![...sel.options].some(o => o.value === txn.accountId)) {
    const o = document.createElement('option'); o.value = txn.accountId; o.textContent = '— Cuenta eliminada —'; sel.appendChild(o);
  }
  sel.value = txn.accountId || '';
  populateTxnMonthSelect('editTxnMonth', txn.date ? txn.date.slice(0,7) : null);
  toggleTxnMonthField('editTxnMonth', txn.type);
  openModal('modal-edit-txn');
}

function saveEditTxn() {
  const id = document.getElementById('editTxnId').value;
  const txn = S.transactions.find(t=>t.id===id);
  if (!txn) return;

  // Validar ANTES de mutar nada: si el cambio de "Mes destino" va a dejar el movimiento
  // "pending" (mismo criterio que el bloque de más abajo), necesita cuenta asociada — igual
  // que exige addTransaction() para un gasto programado nuevo (specs/gastos-programados.md).
  const monthEl = document.getElementById('editTxnMonth');
  const newType = document.getElementById('editTxnType').value;
  const newAccountId = document.getElementById('editTxnAccount').value;
  const origMonth = txn.date ? txn.date.slice(0,7) : null;
  const newMonth = monthEl ? (monthEl.value || origMonth) : origMonth;
  const willBePending = !!(monthEl && origMonth && newMonth !== origMonth && newType === 'expense');
  if (willBePending && !newAccountId) {
    showToast('Un gasto programado necesita una cuenta asociada');
    return;
  }

  // Reverse original account impact — solo si ya estaba aplicado (un movimiento "pending"
  // nunca llegó a debitar la cuenta, así que no hay nada que revertir).
  if (!txn.pending && txn.accountId) {
    const acc = S.accounts.find(a=>a.id===txn.accountId);
    if (acc) acc.balance -= txn.type==='income' ? txn.amount : -txn.amount;
  }
  txn.name     = document.getElementById('editTxnName').value.trim() || txn.name;
  txn.type     = newType;
  const newAmount = +document.getElementById('editTxnAmount').value || txn.amount;
  // El monto editado es el final: no reaplica descuento. Si cambia, el "total y descuento" de referencia ya no vale.
  if (newAmount !== txn.amount) { delete txn.discountPct; delete txn.amountOriginal; }
  txn.amount   = newAmount;
  txn.currency = document.getElementById('editTxnCurrency').value;
  txn.category = document.getElementById('editTxnCategory').value;
  txn.accountId= newAccountId;
  if (txn.type !== 'expense') delete txn.verdict; // el veredicto solo existe para gastos

  // Cambio de mes destino: si difiere del mes actual del movimiento Y es un gasto, se refecha
  // al día 1 del nuevo mes y queda "pending" — el próximo render (applyPendingScheduledExpenses)
  // se encarga de aplicarlo si ese mes ya llegó (actual/pasado) o de dejarlo diferido (futuro).
  // Los ingresos programados quedan fuera de alcance (ver addTransaction): para income, el mes
  // destino solo edita la fecha del movimiento, sin la semántica de "programado".
  if (monthEl && origMonth && newMonth !== origMonth) {
    txn.date = `${newMonth}-01`;
    if (txn.type === 'expense') txn.pending = true;
  }

  // Apply new account impact — solo si el movimiento no quedó pendiente
  if (!txn.pending && txn.accountId) {
    const acc = S.accounts.find(a=>a.id===txn.accountId);
    if (acc) acc.balance += txn.type==='income' ? txn.amount : -txn.amount;
  }
  snapshotNW(); saveState(); renderFinanzasTab(); closeModal('modal-edit-txn');
  showToast('Movimiento actualizado');
}

function deleteTransaction(id) {
  const linked = S.transactions.find(t => t.id === id);
  if (linked && linked.cardChargeId) { showToast('Este gasto viene de una compra con tarjeta. Borralo desde la compra en Tarjetas.', 4500); return; }
  if (!confirm('¿Eliminar este movimiento?')) return;
  const idx = S.transactions.findIndex(t=>t.id===id);
  const txn = idx > -1 ? S.transactions[idx] : null;
  if (txn && !txn.pending && txn.accountId) {
    const acc = S.accounts.find(a=>a.id===txn.accountId);
    if (acc) acc.balance -= txn.type==='income' ? txn.amount : -txn.amount;
  }
  S.transactions = S.transactions.filter(t=>t.id!==id);
  snapshotNW(); saveState(); renderFinanzasTab(); closeModal('modal-edit-txn');
  if (window.CMUndo && txn) CMUndo.registrar({
    descripcion: 'Movimiento eliminado',
    deshacer: () => {
      S.transactions.splice(idx, 0, txn);
      if (!txn.pending && txn.accountId) {
        const acc = S.accounts.find(a=>a.id===txn.accountId);
        if (acc) acc.balance += txn.type==='income' ? txn.amount : -txn.amount;
      }
      snapshotNW(); renderFinanzasTab();
    }
  });
  else showToast('Movimiento eliminado');
}

function addTransaction() {
  if (_txnPayCardId()) return _saveTxnCardCharge();
  const name=document.getElementById('txnName').value.trim();
  if (!name) { showToast('Escribe la descripción'); return; }
  const type=document.getElementById('txnType').value;
  const total=+document.getElementById('txnAmount').value||0;
  const pct=_txnDiscountPct();
  if (pct && !(total > 0)) { showToast('El monto tiene que ser mayor a 0'); return; }
  if (pct && !_ccTwoDecimals(total)) { showToast('El monto puede tener como máximo 2 decimales'); return; }
  const amount = pct ? _discountFinal(total, pct) : total;   // con descuento, el gasto real es el final
  const currency=document.getElementById('txnCurrency').value;
  const accountId=document.getElementById('txnAccount').value;
  const category=document.getElementById('txnCategory').value;

  // Mes destino: viene de la pestaña activa de Actividad (txnActiveMonth), no de un selector
  // dentro del modal (ver revisión 2026-07-22 del spec). "pending" solo aplica a gastos: si el
  // mes destino es futuro, el gasto queda "pending" (se ve en Actividad de ese mes pero no
  // impacta cuenta/inventario todavía). Un ingreso a mes futuro también se guarda con date del
  // mes destino, pero nunca queda pending — impacta balance de inmediato (ver Edge Cases de
  // specs/gastos-programados.md).
  const now = new Date();
  const curMK = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const targetMonth = txnActiveMonth || curMK;
  const pending = type === 'expense' && targetMonth !== curMK;
  if (pending && !accountId) { showToast('Un gasto programado necesita una cuenta asociada'); return; }
  const date = targetMonth !== curMK ? `${targetMonth}-01` : getActiveDate();

  if (!pending && accountId) {
    const acc=S.accounts.find(a=>a.id===accountId);
    if (acc) { acc.balance += type==='income'?amount:-amount; snapshotNW(); }
  }
  const txn = { id:uid(), date, name, type, amount, currency, accountId, category };
  if (pending) txn.pending = true;
  if (pct) { txn.discountPct = pct; txn.amountOriginal = total; }
  S.transactions.unshift(txn);
  saveState(); renderFinanzasTab(); closeModal('modal-add-txn');
  document.getElementById('txnName').value='';
  document.getElementById('txnAmount').value='';

  if (type === 'income') {
    // Sparkle near the modal close button / center of screen
    showSparkle(window.innerWidth/2, window.innerHeight*0.4);
    showToast('💰 ¡Ingreso registrado!', 2500);
  } else {
    // Check budget alert (June 2026 mode: $500k limit)
    const now = new Date();
    const mk = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const monthExp = S.transactions.filter(t => t.type==='expense' && t.date && t.date.startsWith(mk)).reduce((s,t)=>s+t.amount,0);
    const BUDGET_LIMIT = 500000;
    if (monthExp >= BUDGET_LIMIT) {
      showFireEffect();
      const el = document.createElement('div');
      el.style.cssText = `
        position:fixed; top:20%; left:50%; transform:translateX(-50%);
        background:linear-gradient(135deg,rgba(255,60,60,.2),rgba(255,107,107,.12));
        border:2px solid rgba(255,60,60,.6); border-radius:20px;
        padding:16px 28px; text-align:center; pointer-events:none; z-index:10000;
        backdrop-filter:blur(20px); box-shadow:0 0 60px rgba(255,60,60,.4),0 20px 60px rgba(0,0,0,.4);
        animation:failBanner 4s cubic-bezier(.22,1,.36,1) forwards; white-space:nowrap;
      `;
      el.innerHTML = `
        <div style="font-size:32px;line-height:1;margin-bottom:6px">🔥💸🔥</div>
        <div style="font-size:18px;font-weight:900;letter-spacing:.06em;color:#ff3c3c;text-shadow:0 0 30px rgba(255,60,60,.9)">¡PRESUPUESTO SUPERADO!</div>
        <div style="font-size:var(--fs-12-5);color:rgba(255,255,255,.7);margin-top:5px;font-weight:600">Gastos del mes: ${fmtMoney(monthExp,'ARS')} / $500.000</div>
      `;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4200);
      showToast('🔥 ¡Límite mensual superado!', 4000);
    } else if (monthExp >= BUDGET_LIMIT * 0.9) {
      showToast(`⚠ Gastos al ${Math.round(monthExp/BUDGET_LIMIT*100)}% del límite mensual`, 3500);
    } else {
      showToast('Movimiento registrado');
    }
  }
}

// Aplica gastos programados a mes futuro (ver specs/gastos-programados.md) cuando la fecha
// del sistema alcanza (o pasa) su día programado. El chequeo es "hoy >= fecha programada" para
// recuperarse aunque el usuario no haya abierto la app justo ese día.
function applyPendingScheduledExpenses() {
  const today = getActiveDate();
  let applied = false;
  S.transactions.forEach(t => {
    if (!t.pending || !t.date || t.date > today) return;
    if (t.accountId) {
      const acc = S.accounts.find(a=>a.id===t.accountId);
      if (acc) { acc.balance += t.type==='income' ? t.amount : -t.amount; snapshotNW(); }
    }
    t.pending = false;
    applied = true;
  });
  if (applied) saveState();
}
