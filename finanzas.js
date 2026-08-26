// ════════════════════════════════════════════════════════
// FINANCE TAB
// ════════════════════════════════════════════════════════
function calcNetWorth() {
  return S.accounts.reduce((sum,a)=>sum+(a.type!=='crypto'&&a.type!=='invest'?a.balance:a.balance),0);
}

function snapshotNW() {
  const today = getActiveDate();
  const val = calcNetWorth();
  const existing = S.nwHistory.find(h=>h.date===today);
  if (existing) existing.value = val;
  else S.nwHistory.push({ date:today, value:val });
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

  // Poda: solo se grafican los últimos 30 días, no hace falta acumular más de ~180
  // días de historial por cuenta (evita inflar el documento único de Firestore).
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 180);
  const cutoffStr = cutoff.toISOString().slice(0,10);
  S.accountHistory = S.accountHistory.filter(h => h.date >= cutoffStr);
}

function renderFinanzasTab() {
  ensureTxnCategories();
  pfCatchUp();   // antes de renderActivity: las acreditaciones de meses cerrados son transacciones
  fillTxnCategorySelect('txnCategory', document.getElementById('txnCategory')?.value);
  renderTabHeader('finanzasHeaderMeta');
  renderAccounts();
  renderSubscriptions();
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
  document.getElementById('nw1pct').textContent = `1% = ${fmtMoney(nw*0.01,'USD')}`;
  const list = document.getElementById('accountList');
  list.innerHTML = S.accounts.length ? S.accounts.map(a=>`
    <div class="account-row">
      <div class="account-icon">${a.icon||'🏦'}</div>
      <div class="account-info">
        <div class="account-name">${a.name}</div>
        <div class="account-type">${{bank:'Banco',invest:'Inversión',prestamo:'Préstamo',other:'Otro'}[a.type]}</div>
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

function deleteAccount(id) {
  if (!confirm('¿Eliminar esta cuenta?')) return;
  S.accounts=S.accounts.filter(a=>a.id!==id);
  if (typeof nwSelectedAccounts !== 'undefined') nwSelectedAccounts = nwSelectedAccounts.filter(aid=>aid!==id);
  S.accountHistory = (S.accountHistory || []).filter(h => h.accountId !== id);
  snapshotNW(); saveState(); renderFinanzasTab();
}

function renderSubscriptions() {
  const list=document.getElementById('subList');
  const empty=document.getElementById('subEmpty');
  if (!S.subscriptions.length) { list.innerHTML=''; empty.classList.remove('hidden'); document.getElementById('subTotal').textContent='$0'; return; }
  empty.classList.add('hidden');
  const now=new Date();
  let total=0;
  list.innerHTML = [...S.subscriptions].sort((a,b)=>a.billingDay-b.billingDay).map(sub=>{
    const days=daysUntil(sub.billingDay);
    const alert=days<=5;
    total+=sub.amount;
    return `<div class="sub-row ${alert?'sub-alert':''}">
      <div class="sub-info">
        <div class="sub-name">${sub.name} ${alert?'<span class="pill pill-danger" style="font-size:var(--fs-12-5)">⚠ '+days+'d</span>':''}</div>
        <div class="sub-detail">Día ${sub.billingDay} de cada mes</div>
      </div>
      <div class="sub-amount">${fmtMoney(sub.amount,sub.currency)}</div>
      <button class="icon-btn" onclick="openEditSub('${sub.id}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="icon-btn" onclick="deleteSub('${sub.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
    </div>`;
  }).join('');
  document.getElementById('subTotal').textContent=fmtMoney(total,'USD');
}

function addSubscription() {
  const name=document.getElementById('subName').value.trim();
  const amount=+document.getElementById('subAmount').value||0;
  const day=+document.getElementById('subBillingDay').value;
  if (!name||!day) { showToast('Completa nombre y día de cobro'); return; }
  S.subscriptions.push({ id:uid(), name, amount, currency:document.getElementById('subCurrency').value, billingDay:day, accountId:document.getElementById('subAccount').value });
  // [SUPABASE] await supabase.from('subscriptions').insert({ name, amount, currency, billing_day: day, account_id, user_id });
  saveState(); renderSubscriptions(); buildTickerAlerts(); closeModal('modal-add-sub');
  document.getElementById('subName').value=''; document.getElementById('subAmount').value='';
  showToast('Suscripción agregada');
}
function deleteSub(id) { S.subscriptions=S.subscriptions.filter(s=>s.id!==id); saveState(); renderSubscriptions(); buildTickerAlerts(); }

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
function deleteWish(id) { S.wishlist=S.wishlist.filter(w=>w.id!==id); saveState(); renderWishlist(); }

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
  S.fixedExpenses = S.fixedExpenses.filter(e => e.id !== id);
  saveState(); renderFixedExpenses();
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
  if (!cond || cond.type !== 'habito') return null;
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
  if (c.type === 'habito')   return !_pfFindHabit(c);
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

// Evalúa la condición del fondo para un mes. upToToday=true → proyección del mes en curso.
function pfEvalMonth(fund, mk, upToToday) {
  if (pfConditionBroken(fund)) return { met:false, broken:true, pct:null };
  const c = fund.condition;
  if (!c) return { met:true, pct:null };
  if (c.type === 'habito') {
    const pct = _pfHabitPct(_pfFindHabit(c), mk, !!upToToday);
    return { met: pct !== null && pct >= (+c.threshold || 0), pct };
  }
  const g = _pfFindGoal(c);
  return { met: !!(g && g.done), pct:null };
}

// ── Acreditación ──
// Acreditar registra el gasto fijo del mes (transacción con fecha del último día del mes)
// y debita la cuenta asociada: por eso la compra posterior contra el fondo ya no es un gasto.
function _pfCredit(fund, mk, manual) {
  const amount = _pfAmountFor(fund);
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
          if (r.met) _pfCredit(fund, mk, false); else _pfMarkNotMet(fund, mk);
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
  _pfCredit(fund, mk, true);
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
  list.innerHTML = S.purchaseFunds.map(f => {
    const acc = pfAccumulated(f.id);
    total += acc;
    const per = _pfIsQuarterly(f) ? `${fmtMoney(+f.monthlyAmount || 0, 'ARS')}/mes · ×3 al cierre del trimestre` : `${fmtMoney(+f.monthlyAmount || 0, 'ARS')}/mes`;
    return `<div class="fund-row">
      <span class="fund-tile" aria-hidden="true">${escHtml(f.emoji || '🪙')}</span>
      <div class="fund-main">
        <div class="fund-name">${escHtml(f.name)} ${_pfStatusPill(f)}</div>
        <div class="fund-meta">${per} · ${escHtml(pfConditionLabel(f))}</div>
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
  if (cond && cond.type === 'habito') el.value = `${cond.section}|${cond.habitId}`;
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
  document.getElementById('fundCondHabit').style.display = t === 'habito' ? '' : 'none';
  document.getElementById('fundCondObj').style.display   = t === 'objetivo' ? '' : 'none';
}
function pfObjScopeChanged() { _pfFillObjSel(null); }

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
  pfToggleCondFields();
  openModal('modal-fund');
}

function saveFund() {
  _pfEnsure();
  const name = document.getElementById('fundName').value.trim();
  if (!name) { showToast('Escribe el nombre'); return; }
  const monthlyAmount = +document.getElementById('fundAmount').value || 0;
  if (monthlyAmount <= 0) { showToast('El monto mensual tiene que ser mayor a 0'); return; }
  const emoji = document.getElementById('fundEmoji').value.trim();
  const accountId = document.getElementById('fundAccount').value;
  const type = document.getElementById('fundCondType').value;

  let condition = null;
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
        <span>${fmtMoney(+f.monthlyAmount || 0, 'ARS')} / mes</span>
        <span>${escHtml(pfConditionLabel(f))}</span>
      </div>
    </div>
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
function _pfBudgetTotal(mk) {
  return _pfFundsOfMonth(mk).reduce((s,f) => s + (+f.monthlyAmount || 0), 0);
}
function _pfBudgetRows(mk) {
  return _pfFundsOfMonth(mk).map(f => `<div class="sub-row">
      <div class="sub-info">
        <div class="sub-name">${escHtml(f.emoji || '🪙')} ${escHtml(f.name)} <span class="pill pill-ghost" style="font-size:var(--fs-12-5)">fondo</span></div>
        <div class="sub-detail">${escHtml(pfConditionLabel(f))}</div>
      </div>
      <div class="flex gap-8 items-center">
        <span class="mono bold">${fmtMoney(+f.monthlyAmount || 0, 'ARS')}</span>
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
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
}

// Año siguiente al dado, derivado con rollover nativo de Date (mes 12 = enero del año próximo).
function _nextYear(year) {
  return new Date(year, 12, 1).getFullYear();
}

function _emptyBudget() { return { fixed: [], reserved: [] }; }

function _budgetItemTotal(it) { return (+it.v1 || 0) * (+it.v2 || 0) * (+it.v3 || 0); }

// Crea el presupuesto del mes `mk` si no existe, copiando el último mes previo
// existente (con ids nuevos). Devuelve true si lo creó. Edge: sin mes previo → vacío.
function ensureBudgetMonth(mk) {
  if (!S.budgets) S.budgets = {};
  if (S.budgets[mk]) return false;
  const prevKeys = Object.keys(S.budgets).filter(k => k < mk).sort();
  const src = prevKeys.length ? S.budgets[prevKeys[prevKeys.length - 1]] : null;
  if (src) {
    S.budgets[mk] = {
      fixed:    (src.fixed    || []).map(it => ({ id: uid(), name: it.name, category: it.category, unit: it.unit, v1: it.v1, v2: it.v2, v3: it.v3 })),
      reserved: (src.reserved || []).map(it => ({ id: uid(), name: it.name, category: it.category, amount: it.amount })),
    };
  } else {
    S.budgets[mk] = _emptyBudget();
  }
  return true;
}

// Precrea en cascada los meses FUTUROS de `year` (idempotente por mes vía ensureBudgetMonth).
// Año calendario real actual: arranca en el mes real actual (nunca retro-crea meses pasados).
// Años futuros (>= año real actual): arrancan en enero (todos sus meses son futuros).
// Años pasados: no crea nada. Un solo saveState() al final si se creó algo, nunca uno por mes.
function ensureBudgetYear(year) {
  if (!S.budgets) S.budgets = {};
  const realCurYear = new Date().getFullYear();
  if (year < realCurYear) return false;
  const startMonth = (year === realCurYear) ? (new Date().getMonth() + 1) : 1;
  let changed = false;
  for (let m = startMonth; m <= 12; m++) {
    const mk = `${year}-${String(m).padStart(2,'0')}`;
    if (ensureBudgetMonth(mk)) changed = true;
  }
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
  const realCurYear = new Date().getFullYear();
  if (!budgetActiveYear) budgetActiveYear = realCurYear;
  // renderBudget es de solo lectura: la precreación en cascada corre en setBudgetYear()
  // (cambio explícito de año) y en el init de app.js (año calendario real al arrancar).

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
  const usedCats = [...new Set([...b.fixed, ...b.reserved].map(it => it.category).filter(Boolean))];
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
    <div class="budget-totals">
      <div class="budget-total-main">
        <span class="budget-total-lbl">Presupuesto total</span>
        <span class="budget-total-num">${fmtMoney(totalFijo + totalRes, 'ARS')}</span>
      </div>
      <div class="budget-total-sub">
        <span>Mínimo fijo: <b>${fmtMoney(totalFijo, 'ARS')}</b></span>
        <span>Reservados: <b>${fmtMoney(totalRes, 'ARS')}</b></span>
      </div>
    </div>
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
      <div class="bsum-cat-top"><span class="bsum-cat-name">${ci.icon} ${ci.label || c}</span><span class="bsum-cat-val mono ${ov ? 'text-danger' : ''}">${fmtMoney(real, 'ARS')} / ${fmtMoney(plan, 'ARS')}</span></div>
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
  body.innerHTML = `
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
    opts.push(`<option value="${id}" ${id === selected ? 'selected' : ''}>${escHtml(c.icon)} ${escHtml(c.label)}</option>`);
  });
  if (selected && !map[selected]) {
    opts.push(`<option value="${selected}" selected>💸 (categoría eliminada)</option>`);
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
    return `<option value="${c}" ${c === selected ? 'selected' : ''}>${escHtml(ci.icon)} ${escHtml(ci.label)}</option>`;
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
  saveState(); renderBudget(); closeModal('modal-budget-fixed');
  showToast('Ítem fijo guardado');
}

function deleteBudgetFixed(id) {
  const b = S.budgets[budgetActiveMonth];
  if (!b) return;
  b.fixed = b.fixed.filter(x => x.id !== id);
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
  saveState(); renderBudget(); closeModal('modal-budget-reserved');
  showToast('Gasto reservado guardado');
}

function deleteBudgetReserved(id) {
  const b = S.budgets[budgetActiveMonth];
  if (!b) return;
  b.reserved = b.reserved.filter(x => x.id !== id);
  saveState(); renderBudget(); closeModal('modal-budget-reserved');
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
  autoDeductSubscriptions();
  applyPendingScheduledExpenses();

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
  if (txnHistSort === 'amount') filteredForList = [...filteredForList].sort((a, b) => (+b.amount || 0) - (+a.amount || 0));

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
      return `<div class="activity-row">
        <div class="act-icon" style="background:${t.type==='income'?'rgba(107,227,164,.1)':'rgba(255,107,107,.1)'}">${cat.icon||(t.type==='income'?'💚':'🔴')}</div>
        <div class="act-info">
          <div class="act-name" style="display:flex;align-items:center;flex-wrap:wrap;gap:2px">${t.name}${catBadge}${pendingBadge}</div>
          <div class="act-date">${fmtDate(t.date)}${acc?` <span style="color:var(--ts)">· ${acc.icon||'🏦'} ${acc.name}</span>`:''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="act-amount ${t.type}">${t.type==='expense'?'-':'+'} ${fmtMoney(t.amount,t.currency)}</div>
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
  sel.innerHTML = '<option value="">— Ninguna —</option>' +
    S.accounts.filter(a=>a.type==='bank'||a.type==='invest')
      .map(a=>`<option value="${a.id}">${a.icon||'🏦'} ${a.name}</option>`).join('');
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
  txn.amount   = +document.getElementById('editTxnAmount').value || txn.amount;
  txn.currency = document.getElementById('editTxnCurrency').value;
  txn.category = document.getElementById('editTxnCategory').value;
  txn.accountId= newAccountId;

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
  if (!confirm('¿Eliminar este movimiento?')) return;
  const txn = S.transactions.find(t=>t.id===id);
  if (txn && !txn.pending && txn.accountId) {
    const acc = S.accounts.find(a=>a.id===txn.accountId);
    if (acc) acc.balance -= txn.type==='income' ? txn.amount : -txn.amount;
  }
  S.transactions = S.transactions.filter(t=>t.id!==id);
  snapshotNW(); saveState(); renderFinanzasTab(); closeModal('modal-edit-txn');
  showToast('Movimiento eliminado');
}

function addTransaction() {
  const name=document.getElementById('txnName').value.trim();
  if (!name) { showToast('Escribe la descripción'); return; }
  const type=document.getElementById('txnType').value;
  const amount=+document.getElementById('txnAmount').value||0;
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

function autoDeductSubscriptions() {
  const today=new Date();
  S.subscriptions.forEach(sub=>{
    if (sub.billingDay!==today.getDate()) return;
    const already=S.transactions.some(t=>t.name===`Sub: ${sub.name}`&&t.date===getActiveDate());
    if (already) return;
    if (sub.accountId) {
      const acc=S.accounts.find(a=>a.id===sub.accountId);
      if (acc) { acc.balance-=sub.amount; snapshotNW(); }
    }
    S.transactions.unshift({ id:uid(), date:getActiveDate(), name:`Sub: ${sub.name}`, type:'expense', amount:sub.amount, currency:sub.currency, accountId:sub.accountId });
    saveState();
  });
}

// Aplica gastos programados a mes futuro (ver specs/gastos-programados.md) cuando la fecha
// del sistema alcanza (o pasa) su día programado. A diferencia de autoDeductSubscriptions
// (que exige coincidencia exacta de día), acá el chequeo es "hoy >= fecha programada" para
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
