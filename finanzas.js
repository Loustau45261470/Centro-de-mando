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
}

function renderFinanzasTab() {
  renderTabHeader('finanzasHeaderMeta');
  renderAccounts();
  renderSubscriptions();
  renderWishlist();
  renderWishTop5();
  renderActivity();
  renderFinObjectives();
  renderBudget();
  renderBudgetSummary();
  renderInventory();
  renderInventarioResumen();
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
        <div class="account-type">${{bank:'Banco',invest:'Inversión',crypto:'Cripto',other:'Otro'}[a.type]}</div>
      </div>
      <div class="account-bal pos">${fmtMoney(a.balance,a.currency)}</div>
      <button class="icon-btn" onclick="openEditAccount('${a.id}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="icon-btn" onclick="deleteAccount('${a.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
    </div>`).join('') : '<p class="empty-state">Sin cuentas registradas</p>';
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
        <div class="sub-name">${sub.name} ${alert?'<span class="pill pill-danger" style="font-size:10px">⚠ '+days+'d</span>':''}</div>
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
  if (!S.wishlist.length) { list.innerHTML=''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  const _esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  const PRIO_ORDER = ['urgente','importante','normal','poco_importante','irrelevante'];
  const PRIO_INFO  = {
    urgente:         { label:'Urgente',        color:'var(--danger)' },
    importante:      { label:'Importante',     color:'var(--warn)'   },
    normal:          { label:'Normal',         color:'var(--ts)'     },
    poco_importante: { label:'Poco importante',color:'var(--tt)'     },
    irrelevante:     { label:'Irrelevante',    color:'rgba(255,255,255,.25)' },
  };

  // Sort: by category (alpha, "Sin categoría" last), then by priority rank
  const sorted = [...S.wishlist].sort((a,b) => {
    const cA = a.category || '￿', cB = b.category || '￿';
    if (cA !== cB) return cA.localeCompare(cB, 'es');
    return (PRIO_ORDER.indexOf(a.priority||'normal')) - (PRIO_ORDER.indexOf(b.priority||'normal'));
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

  let html = '';
  for (const cat of groupOrder) {
    const cid = catId(cat);
    const collapsed = localStorage.getItem('wish_cat_' + cid) === '1';
    html += `<div class="wish-category-hdr" onclick="toggleWishCat('${cid}')">
      <span>${_esc(cat)} <span style="opacity:.45">(${groups[cat].length})</span></span>
      <span class="wish-cat-chevron${collapsed?' collapsed':''}">▾</span>
    </div>`;
    html += `<div class="wish-cat-body${collapsed?' collapsed':''}" id="${cid}">`;
    for (const w of groups[cat]) {
      const pctOfNW = nw > 0 ? (w.amount / nw * 100).toFixed(1) : '∞';
      const saved   = nw > 0 ? Math.min(100, nw / w.amount * 100) : 0;
      const affordable = nw >= w.amount;
      const pi = PRIO_INFO[w.priority||'normal'] || PRIO_INFO.normal;
      const hasNotes = w.notes && w.notes.trim();
      html += `<div class="wish-row">
        <div class="flex items-center justify-between">
          <div class="wish-name">${_esc(w.name)}${affordable?' <span class="pill pill-ok" style="font-size:10px">¡Puedes comprarlo!</span>':''}</div>
          <div class="flex gap-8 items-center">
            <span class="wish-priority-badge" style="color:${pi.color}">${pi.label}</span>
            <span class="mono text-sm">${fmtMoney(w.amount,w.currency)}</span>
            ${hasNotes?`<button class="icon-btn" onclick="toggleWishDetail('${w.id}')" title="Detalles">${DETAIL_SVG}</button>`:''}
            <button class="icon-btn" onclick="openEditWish('${w.id}')">${EDIT_SVG}</button>
            <button class="icon-btn" onclick="deleteWish('${w.id}')">${DEL_SVG}</button>
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
  const chevron = body?.previousElementSibling?.querySelector('.wish-cat-chevron');
  if (!body) return;
  const nowCollapsed = body.classList.toggle('collapsed');
  if (chevron) chevron.classList.toggle('collapsed', nowCollapsed);
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
          ? '<span class="pill pill-ok" style="font-size:10px">✓ Pagado</span>'
          : `<button class="btn btn-ghost btn-sm" onclick="markFixedExpensePaid('${exp.id}')" style="font-size:10px">Marcar pagado</button>`}
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

const TXN_CATEGORIES = {
  clean_food:   { label:'Alimentación Sana',     icon:'🥩', color:'rgba(107,227,164,.15)', border:'rgba(107,227,164,.4)',  chartColor:'rgba(107,227,164,.85)' },
  hydration:    { label:'Hidratación Limpia',     icon:'💧', color:'rgba(0,212,255,.12)',   border:'rgba(0,212,255,.35)',   chartColor:'rgba(0,212,255,.8)'    },
  sports:       { label:'Deporte / Gym',          icon:'🏋️', color:'rgba(124,142,232,.15)', border:'rgba(124,142,232,.4)',  chartColor:'rgba(124,142,232,.85)' },
  productivity: { label:'Productividad / Fijos',  icon:'⚡', color:'rgba(242,192,99,.15)',  border:'rgba(242,192,99,.4)',   chartColor:'rgba(242,192,99,.85)'  },
  girlfriend:   { label:'Novia',                  icon:'💑', color:'rgba(244,63,94,.12)',   border:'rgba(244,63,94,.35)',   chartColor:'rgba(244,63,94,.85)'   },
  pet:          { label:'Mascota',                icon:'🐱', color:'rgba(75,123,236,.15)',  border:'rgba(75,123,236,.4)',   chartColor:'rgba(75,123,236,.85)'  },
  junk_food:    { label:'Comida Chatarra',        icon:'🍟', color:'rgba(255,107,107,.15)', border:'rgba(255,107,107,.4)',  chartColor:'rgba(255,107,107,.85)' },
  home:         { label:'Hogar / Insumos',        icon:'🏠', color:'rgba(212,220,232,.1)',  border:'rgba(212,220,232,.3)',  chartColor:'rgba(212,220,232,.7)'  },
  mama:         { label:'Mamá',                   icon:'👩', color:'rgba(244,114,182,.15)', border:'rgba(244,114,182,.4)',  chartColor:'rgba(244,114,182,.85)' },
  papa:         { label:'Papá',                   icon:'👨', color:'rgba(56,189,248,.15)',  border:'rgba(56,189,248,.4)',   chartColor:'rgba(56,189,248,.85)'  },
  business:     { label:'Negocio',                icon:'💼', color:'rgba(251,191,36,.15)',  border:'rgba(251,191,36,.4)',   chartColor:'rgba(251,191,36,.85)'  },
  study:        { label:'Estudio',                icon:'📚', color:'rgba(167,139,250,.15)', border:'rgba(167,139,250,.4)',  chartColor:'rgba(167,139,250,.85)' },
  salary:       { label:'Ingreso',                icon:'💰', color:'rgba(107,227,164,.2)',  border:'rgba(107,227,164,.5)',  chartColor:'rgba(107,227,164,.9)'  },
  invest:       { label:'Inversión',              icon:'📈', color:'rgba(124,142,232,.18)', border:'rgba(124,142,232,.45)', chartColor:'rgba(124,142,232,.9)'  },
  other:        { label:'Otro',                   icon:'💸', color:'rgba(255,255,255,.06)', border:'rgba(255,255,255,.2)',  chartColor:'rgba(255,255,255,.5)'  },
};

function getCatInfo(cat, type) {
  return TXN_CATEGORIES[cat] || { label:'', icon: type==='income'?'💚':'🔴', color:'rgba(255,255,255,.06)', border:'rgba(255,255,255,.1)' };
}

// ════════════════════════════════════════════════════════
// PRESUPUESTO MENSUAL
// ════════════════════════════════════════════════════════
const BUDGET_EXPENSE_CATS = ['clean_food','hydration','sports','productivity','girlfriend','pet','junk_food','home','mama','papa','business','study','other'];

const _EDIT_SVG = '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const _DEL_SVG  = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>';

let budgetActiveMonth = null;

function _curMonthKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
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

function getBudgetMonths() {
  const set = new Set(Object.keys(S.budgets || {}));
  set.add(_curMonthKey());
  return [...set].sort().reverse();
}

function setBudgetMonth(m) { budgetActiveMonth = m; renderBudget(); }

function renderBudget() {
  const body = document.getElementById('budgetBody');
  if (!body) return;
  if (!S.budgets) S.budgets = {};
  // Auto-copia del mes actual (una sola vez)
  if (ensureBudgetMonth(_curMonthKey())) saveState();

  const months = getBudgetMonths();
  if (!budgetActiveMonth || !months.includes(budgetActiveMonth)) budgetActiveMonth = months[0];
  ensureBudgetMonth(budgetActiveMonth);
  const b = S.budgets[budgetActiveMonth] || _emptyBudget();

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

  // Ítems fijos
  let totalFijo = 0;
  const fixedRows = b.fixed.length ? b.fixed.map(it => {
    const ci = getCatInfo(it.category, 'expense');
    const tot = _budgetItemTotal(it);
    totalFijo += tot;
    return `<div class="sub-row">
      <div class="sub-info">
        <div class="sub-name">${it.name}</div>
        <div class="sub-detail">${ci.icon} ${ci.label || '—'} · ${(+it.v1||0)} × ${(+it.v2||0)} × ${(+it.v3||0)} ${it.unit || ''}</div>
      </div>
      <div class="flex gap-8 items-center">
        <span class="mono bold">${fmtMoney(tot, 'ARS')}</span>
        <button class="icon-btn" onclick="openBudgetFixed('${it.id}')">${_EDIT_SVG}</button>
        <button class="icon-btn" onclick="deleteBudgetFixed('${it.id}')">${_DEL_SVG}</button>
      </div>
    </div>`;
  }).join('') : '<p class="empty-state">Sin ítems fijos</p>';

  // Gastos reservados
  let totalRes = 0;
  const resRows = b.reserved.length ? b.reserved.map(it => {
    const ci = getCatInfo(it.category, 'expense');
    totalRes += (+it.amount || 0);
    return `<div class="sub-row">
      <div class="sub-info">
        <div class="sub-name">${it.name}</div>
        <div class="sub-detail">${ci.icon} ${ci.label || '—'}</div>
      </div>
      <div class="flex gap-8 items-center">
        <span class="mono bold">${fmtMoney(+it.amount || 0, 'ARS')}</span>
        <button class="icon-btn" onclick="openBudgetReserved('${it.id}')">${_EDIT_SVG}</button>
        <button class="icon-btn" onclick="deleteBudgetReserved('${it.id}')">${_DEL_SVG}</button>
      </div>
    </div>`;
  }).join('') : '<p class="empty-state">Sin gastos reservados</p>';

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
    .sort((a, c) => ((budByCat[c]||0)+(realByCat[c]||0)) - ((budByCat[a]||0)+(realByCat[a]||0)));
  const compRows = allCats.map(c => {
    const ci = getCatInfo(c, 'expense');
    const plan = budByCat[c] || 0, real = realByCat[c] || 0, saldo = plan - real;
    return `<div class="budget-cmp-row">
      <span class="budget-cmp-cat">${ci.icon} ${ci.label || c}</span>
      <span class="budget-cmp-num">${fmtMoney(plan, 'ARS')}</span>
      <span class="budget-cmp-num">${fmtMoney(real, 'ARS')}</span>
      <span class="budget-cmp-num ${saldo < 0 ? 'text-danger' : 'text-ok'}">${fmtMoney(saldo, 'ARS')}</span>
    </div>`;
  }).join('');
  const comparison = allCats.length ? `
    <div class="budget-cmp-hdr"><span>Categoría</span><span>Plan</span><span>Real</span><span>Saldo</span></div>
    ${compRows}` : '<p class="empty-state">Sin datos para comparar</p>';

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
  const b = S.budgets && S.budgets[mk]; if (!b) return 0;
  let t = 0;
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

function fillBudgetCatSelect(elId, selected) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = BUDGET_EXPENSE_CATS.map(c => {
    const ci = getCatInfo(c, 'expense');
    return `<option value="${c}" ${c === selected ? 'selected' : ''}>${ci.icon} ${ci.label}</option>`;
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

function getAvailableMonths() {
  const months = new Set();
  S.transactions.forEach(t => { if (t.date) months.add(t.date.slice(0,7)); });
  // El mes actual siempre está disponible aunque no tenga movimientos todavía,
  // así Actividad rota al mes en curso el día 1 en vez de quedarse en el último mes con datos.
  const now = new Date();
  months.add(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  return [...months].sort().reverse();
}

function setTxnMonth(m) { txnActiveMonth = m; renderActivity(); }

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

  const months = getAvailableMonths();
  const now = new Date();
  const curMK = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  if (!txnActiveMonth || !months.includes(txnActiveMonth)) txnActiveMonth = months[0] || curMK;

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

  // Transaction list
  const list = document.getElementById('activityList');
  const empty = document.getElementById('activityEmpty');
  const accMap = {};
  S.accounts.forEach(a => accMap[a.id] = a);

  const colHdr = document.getElementById('activityColHdr');
  if (!filtered.length) {
    list.innerHTML=''; empty.classList.remove('hidden');
    if (colHdr) colHdr.style.display = 'none';
  } else {
    empty.classList.add('hidden');
    if (colHdr) colHdr.style.display = '';
    list.innerHTML = filtered.map(t => {
      const cat = getCatInfo(t.category, t.type);
      const acc = t.accountId ? accMap[t.accountId] : null;
      const catBadge = t.category
        ? `<span style="font-size:10px;padding:1px 7px;border-radius:99px;font-weight:700;background:${cat.color};border:1px solid ${cat.border};color:var(--ts);margin-left:4px">${cat.icon} ${cat.label}</span>`
        : '';
      return `<div class="activity-row">
        <div class="act-icon" style="background:${t.type==='income'?'rgba(107,227,164,.1)':'rgba(255,107,107,.1)'}">${cat.icon||(t.type==='income'?'💚':'🔴')}</div>
        <div class="act-info">
          <div class="act-name" style="display:flex;align-items:center;flex-wrap:wrap;gap:2px">${t.name}${catBadge}</div>
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
            font: { size: 11, weight: '600' },
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
  document.getElementById('editTxnCategory').value = txn.category || '';
  const sel = document.getElementById('editTxnAccount');
  sel.innerHTML = '<option value="">— Ninguna —</option>' +
    S.accounts.filter(a=>a.type==='bank'||a.type==='invest')
      .map(a=>`<option value="${a.id}">${a.icon||'🏦'} ${a.name}</option>`).join('');
  sel.value = txn.accountId || '';
  openModal('modal-edit-txn');
}

function saveEditTxn() {
  const id = document.getElementById('editTxnId').value;
  const txn = S.transactions.find(t=>t.id===id);
  if (!txn) return;
  // Reverse original account impact
  if (txn.accountId) {
    const acc = S.accounts.find(a=>a.id===txn.accountId);
    if (acc) acc.balance -= txn.type==='income' ? txn.amount : -txn.amount;
  }
  txn.name     = document.getElementById('editTxnName').value.trim() || txn.name;
  txn.type     = document.getElementById('editTxnType').value;
  txn.amount   = +document.getElementById('editTxnAmount').value || txn.amount;
  txn.currency = document.getElementById('editTxnCurrency').value;
  txn.category = document.getElementById('editTxnCategory').value;
  txn.accountId= document.getElementById('editTxnAccount').value;
  // Apply new account impact
  if (txn.accountId) {
    const acc = S.accounts.find(a=>a.id===txn.accountId);
    if (acc) acc.balance += txn.type==='income' ? txn.amount : -txn.amount;
  }
  snapshotNW(); saveState(); renderFinanzasTab(); closeModal('modal-edit-txn');
  showToast('Movimiento actualizado');
}

function deleteTransaction(id) {
  if (!confirm('¿Eliminar este movimiento?')) return;
  const txn = S.transactions.find(t=>t.id===id);
  if (txn?.accountId) {
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
  const invQtyEl = document.getElementById('txnInvQty');
  const invQty = invQtyEl ? (+invQtyEl.value || 0) : 0;
  if (accountId) {
    const acc=S.accounts.find(a=>a.id===accountId);
    if (acc) { acc.balance += type==='income'?amount:-amount; snapshotNW(); }
  }
  S.transactions.unshift({ id:uid(), date:getActiveDate(), name, type, amount, currency, accountId, category });
  if (type === 'expense' && invQty > 0) invApplyPurchase(name, invQty);
  saveState(); renderFinanzasTab(); closeModal('modal-add-txn');
  document.getElementById('txnName').value='';
  document.getElementById('txnAmount').value='';
  if (invQtyEl) invQtyEl.value = '';

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
        <div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:5px;font-weight:600">Gastos del mes: ${fmtMoney(monthExp,'ARS')} / $500.000</div>
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
