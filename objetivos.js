// ════════════════════════════════════════════════════════
// QUARTERLY OBJECTIVES
// ════════════════════════════════════════════════════════
const QOBJ_TAB_CATS = {
  vida:         ['Vida'],
  finanzas:     ['Economía'],
  conocimiento: ['Facultad', 'Conocimiento'],
  salud:        ['Entrenamiento'],
  ia:           ['IA']
};

const _MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function _periodMonths(periodId) {
  const m = periodId.match(/^t([1-4])-(\d{4})$/);
  if (!m) return [];
  const q = parseInt(m[1]), yr = m[2];
  const start = (q - 1) * 3;
  return [0, 1, 2].map(i => `${yr}-${String(start + i + 1).padStart(2, '0')}`);
}

const _qobjActiveMonth = {}; // tabName → 'trim' | 'YYYY-MM'

function selectMonthView(tabName, view) {
  _qobjActiveMonth[tabName] = view;
  renderQObjForTab(tabName);
}

// ── Metas mensuales POR SECCIÓN ──────────────────────────────
// Forma: S.monthlyGoals = { <sec>: { 'YYYY-MM': [{ id, text, done }] } }
const _MG_SECTIONS = Object.keys(QOBJ_TAB_CATS); // vida, finanzas, salud, conocimiento, ia
function _migrateMonthlyGoals() {
  if (!S.monthlyGoals || typeof S.monthlyGoals !== 'object') { S.monthlyGoals = {}; return false; }
  const keys = Object.keys(S.monthlyGoals);
  // Formato viejo (global por mes): claves 'YYYY-MM' en el primer nivel → mover a 'vida'
  if (!keys.some(k => /^\d{4}-\d{2}$/.test(k))) return false;
  const old = S.monthlyGoals, next = {};
  _MG_SECTIONS.forEach(s => next[s] = {});
  keys.forEach(k => {
    if (/^\d{4}-\d{2}$/.test(k)) next.vida[k] = old[k];
    else if (old[k] && typeof old[k] === 'object') next[k] = old[k];
  });
  S.monthlyGoals = next;
  return true;
}
function _mgSection(sec) {
  _migrateMonthlyGoals();
  if (!S.monthlyGoals[sec]) S.monthlyGoals[sec] = {};
  return S.monthlyGoals[sec];
}
function getMonthlyGoals(sec, monthKey) {
  return _mgSection(sec)[monthKey] || [];
}
function _refreshMonthly(sec) {
  renderQObjForTab(sec);
  if (window.JARVIS_INTEL) try { JARVIS_INTEL.renderCard(sec); } catch (e) {}
}

function toggleMonthlyGoal(tabName, monthKey, idx) {
  const goals = getMonthlyGoals(tabName, monthKey);
  if (!goals[idx]) return;
  goals[idx].done = !goals[idx].done;
  saveState(); _refreshMonthly(tabName);
}

function deleteMonthlyGoal(tabName, monthKey, idx) {
  const goals = getMonthlyGoals(tabName, monthKey);
  if (!goals[idx]) return;
  goals.splice(idx, 1);
  saveState(); _refreshMonthly(tabName);
}

let _mgoalAddTab = null, _mgoalAddMonth = null;

function openAddMonthlyGoal(tabName, monthKey) {
  _mgoalAddTab = tabName;
  _mgoalAddMonth = monthKey;
  const [yr, mn] = monthKey.split('-');
  const secLbl = (QOBJ_TAB_CATS[tabName] || []).join(' & ') || tabName;
  document.getElementById('mgoal-modal-title').textContent =
    `Meta de ${secLbl} — ${_MONTH_SHORT[parseInt(mn) - 1]} ${yr}`;
  document.getElementById('mgoal-input-text').value = '';
  openModal('modal-add-mgoal');
}

function saveNewMonthlyGoal() {
  const text = document.getElementById('mgoal-input-text').value.trim();
  if (!text || !_mgoalAddMonth || !_mgoalAddTab) return;
  const m = _mgSection(_mgoalAddTab);
  if (!m[_mgoalAddMonth]) m[_mgoalAddMonth] = [];
  const goals = m[_mgoalAddMonth];
  const nextId = goals.length ? Math.max(...goals.map(g => g.id)) + 1 : 1;
  goals.push({ id: nextId, text, done: false });
  saveState();
  closeModal('modal-add-mgoal');
  _refreshMonthly(_mgoalAddTab);
}

function renderQObjForTab(tabName) {
  const wrap = document.getElementById('qobj-wrap-' + tabName);
  if (!wrap) return;

  const qo = S.quarterlyObjectives;
  const period = qo.periods.find(p => p.id === qo.activePeriod) || qo.periods[0];
  const cats = QOBJ_TAB_CATS[tabName];
  const isVida = tabName === 'vida';

  const activeView = _qobjActiveMonth[tabName] || 'trim';
  const months = _periodMonths(period.id);

  const ddId = `qobj-dd-${tabName}`;
  const dropdownHTML = `<div class="qobj-period-dropdown" id="${ddId}" style="margin-bottom:0">
    <button class="qobj-period-trigger" onclick="toggleQObjDropdown('${ddId}')">
      ${period.label}<span class="qobj-period-chevron">▾</span>
    </button>
    <div class="qobj-period-menu">
      ${qo.periods.map(p => `<button class="qobj-period-option${p.id===qo.activePeriod?' active':''}" onclick="selectQPeriod('${p.id}');closeQObjDropdown('${ddId}')">${p.label}</button>`).join('')}
    </div>
  </div>`;

  let monthTabsHTML = '';
  if (months.length) {
    const tabs = [
      `<button class="qobj-month-tab${activeView==='trim'?' active':''}" onclick="selectMonthView('${tabName}','trim')">Trim</button>`,
      ...months.map(m => {
        const label = _MONTH_SHORT[parseInt(m.split('-')[1]) - 1];
        return `<button class="qobj-month-tab${activeView===m?' active':''}" onclick="selectMonthView('${tabName}','${m}')">${label}</button>`;
      })
    ].join('');
    monthTabsHTML = `<div class="qobj-month-tabs">${tabs}</div>`;
  }

  const titleCats = cats.length === 1 ? cats[0] : cats.join(' & ');
  const addPeriodBtn = isVida
    ? `<button class="btn btn-ghost btn-sm" onclick="openModal('modal-add-period')">+ Período</button>`
    : '';

  let contentHTML;
  if (activeView === 'trim') {
    const objs = (period.flat && !isVida) ? []
      : period.flat ? period.objectives
      : period.objectives.filter(o => cats.includes(o.category));

    const total = objs.length;
    const done  = objs.filter(o => o.done).length;
    const barWidth = total ? Math.round(done / total * 100) : 0;
    const noteHTML = period.note ? `<div class="qobj-note">${period.note}</div>` : '';

    let listHTML;
    if (period.flat && !isVida) {
      listHTML = `<div class="empty-state" style="font-size:11px;padding:16px 0">Sin categorías en este período</div>`;
    } else if (period.flat) {
      listHTML = objs.map(o => qobjItemHTML(period.id, o)).join('');
    } else {
      listHTML = cats.map(cat => {
        const items = period.objectives.filter(o => o.category === cat);
        const bodyId = `qobj-body-${period.id}-${cat.replace(/\W+/g,'_')}`;
        return `<div class="qobj-category-row" onclick="toggleQObjCat('${bodyId}',this)">
          <span class="qobj-category-label">${cat}<span class="qobj-category-chevron">▾</span></span>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openAddQObj('${period.id}','${cat}')">+</button>
        </div>
        <div class="qobj-category-body" id="${bodyId}">
          ${items.length ? items.map(o => qobjItemHTML(period.id, o)).join('') : ''}
        </div>`;
      }).join('');
    }

    contentHTML = `${noteHTML}
    <div class="qobj-progress-row">
      <span class="qobj-progress-num">${done}</span>
      <span class="qobj-progress-den">/${total}</span>
      <div class="qobj-progress-bar-wrap">
        <div class="qobj-progress-bar" style="width:${barWidth}%"></div>
      </div>
    </div>
    <div>${listHTML}</div>`;
  } else {
    const monthKey = activeView;
    const goals = getMonthlyGoals(tabName, monthKey);
    const mn = parseInt(monthKey.split('-')[1]) - 1;
    const yr = monthKey.split('-')[0];
    const totalM = goals.length;
    const doneM = goals.filter(g => g.done).length;
    const barWM = totalM ? Math.round(doneM / totalM * 100) : 0;

    const progressHTML = totalM ? `<div class="qobj-progress-row">
      <span class="qobj-progress-num">${doneM}</span>
      <span class="qobj-progress-den">/${totalM}</span>
      <div class="qobj-progress-bar-wrap">
        <div class="qobj-progress-bar" style="width:${barWM}%"></div>
      </div>
    </div>` : '';

    const goalsHTML = goals.length
      ? goals.map((g, i) => `<div class="monthly-goal-item${g.done?' done':''}">
          <input type="checkbox" ${g.done?'checked':''} onchange="toggleMonthlyGoal('${tabName}','${monthKey}',${i})">
          <span class="mg-text">${g.text}</span>
          <button class="mg-del" onclick="deleteMonthlyGoal('${tabName}','${monthKey}',${i})">✕</button>
        </div>`).join('')
      : `<div class="empty-state" style="font-size:12px;padding:14px 0;text-align:center">Sin metas para ${_MONTH_SHORT[mn]} ${yr}</div>`;

    contentHTML = `${progressHTML}
    <div>${goalsHTML}</div>
    <button class="btn btn-ghost btn-sm" onclick="openAddMonthlyGoal('${tabName}','${monthKey}')" style="margin-top:8px">+ Meta mensual</button>`;
  }

  wrap.innerHTML = `<div class="card">
    <div class="card-title">🏆 Objetivos · ${titleCats}${addPeriodBtn}</div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${dropdownHTML}
      ${monthTabsHTML}
    </div>
    ${contentHTML}
  </div>`;
}

function renderQuarterlyObjectives() {
  Object.keys(QOBJ_TAB_CATS).forEach(t => renderQObjForTab(t));
}

function toggleQObjDropdown(ddId) {
  const dd = document.getElementById(ddId);
  if (!dd) return;
  const menu = dd.querySelector('.qobj-period-menu');
  const trigger = dd.querySelector('.qobj-period-trigger');
  const isOpen = menu.classList.toggle('open');
  trigger.classList.toggle('open', isOpen);
  if (isOpen) {
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!dd.contains(e.target)) {
          closeQObjDropdown(ddId);
          document.removeEventListener('click', handler);
        }
      });
    }, 0);
  }
}

function closeQObjDropdown(ddId) {
  const dd = document.getElementById(ddId);
  if (!dd) return;
  dd.querySelector('.qobj-period-menu').classList.remove('open');
  dd.querySelector('.qobj-period-trigger').classList.remove('open');
}

function toggleQObjCat(bodyId, rowEl) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  const collapsed = body.classList.toggle('collapsed');
  const chevron = rowEl.querySelector('.qobj-category-chevron');
  if (chevron) chevron.style.transform = collapsed ? 'rotate(-90deg)' : '';
}

function qobjItemHTML(periodId, o) {
  return `<div class="qobj-item${o.done?' done':''}">
    <input type="checkbox" ${o.done?'checked':''} onchange="toggleQObj('${periodId}',${o.id})">
    <span class="qobj-item-text">${o.text}</span>
    <div class="qobj-item-actions">
      <button class="qobj-act-btn" onclick="openEditQObj('${periodId}',${o.id})" title="Editar">✎</button>
      <button class="qobj-act-btn" onclick="deleteQObj('${periodId}',${o.id})" title="Eliminar">✕</button>
    </div>
  </div>`;
}

function selectQPeriod(id) {
  S.quarterlyObjectives.activePeriod = id;
  saveState(); renderQuarterlyObjectives();
}

function toggleQObj(periodId, objId) {
  const period = S.quarterlyObjectives.periods.find(p=>p.id===periodId);
  const o = period.objectives.find(o=>o.id===objId);
  o.done = !o.done; saveState(); renderQuarterlyObjectives();
  if (o.done) {
    const allDone = period.objectives.every(o => o.done);
    if (allDone) {
      showConfetti(5000);
      const el = document.createElement('div');
      el.style.cssText = `
        position:fixed; top:16%; left:50%; transform:translateX(-50%);
        background:linear-gradient(135deg,rgba(242,192,99,.2),rgba(255,183,106,.14));
        border:2px solid rgba(242,192,99,.55); border-radius:20px;
        padding:20px 36px; text-align:center; pointer-events:none; z-index:10000;
        backdrop-filter:blur(20px); box-shadow:0 0 70px rgba(242,192,99,.4),0 20px 60px rgba(0,0,0,.4);
        animation:missionBanner 4s cubic-bezier(.22,1,.36,1) forwards; white-space:nowrap;
      `;
      el.innerHTML = `
        <div style="font-size:38px;line-height:1;margin-bottom:8px">🏅</div>
        <div style="font-size:22px;font-weight:900;letter-spacing:.06em;color:#F2C063;text-shadow:0 0 35px rgba(242,192,99,.9)">¡${period.label} COMPLETADO!</div>
        <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:6px;font-weight:600">Todos los objetivos del trimestre logrados</div>
      `;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4200);
      showToast(`🏅 ¡${period.label} completado!`, 4000);
    } else {
      showToast('✓ Objetivo logrado');
    }
  }
}

let _qobjAddPeriod = null, _qobjAddCat = null;
function openAddQObj(periodId, cat) {
  _qobjAddPeriod = periodId; _qobjAddCat = cat || null;
  document.getElementById('qobj-input-text').value = '';
  const catSel = document.getElementById('qobj-input-cat');
  if (cat) { catSel.value = cat; catSel.style.display = 'none'; }
  else catSel.style.display = 'block';
  openModal('modal-add-qobj');
}
function saveNewQObj() {
  const text = document.getElementById('qobj-input-text').value.trim();
  if (!text) return;
  const period = S.quarterlyObjectives.periods.find(p=>p.id===_qobjAddPeriod);
  const nextId = period.objectives.length ? Math.max(...period.objectives.map(o=>o.id)) + 1 : 1;
  const cat = _qobjAddCat || (period.flat ? null : document.getElementById('qobj-input-cat').value);
  period.objectives.push({ id: nextId, text, done: false, category: cat });
  saveState(); closeModal('modal-add-qobj'); renderQuarterlyObjectives();
}

function openEditQObj(periodId, objId) {
  const o = S.quarterlyObjectives.periods.find(p=>p.id===periodId).objectives.find(o=>o.id===objId);
  document.getElementById('qobj-edit-text').value = o.text;
  document.getElementById('qobj-edit-period').value = periodId;
  document.getElementById('qobj-edit-id').value = objId;
  openModal('modal-edit-qobj');
}
function saveEditQObj() {
  const text = document.getElementById('qobj-edit-text').value.trim();
  if (!text) return;
  const periodId = document.getElementById('qobj-edit-period').value;
  const objId = parseInt(document.getElementById('qobj-edit-id').value);
  const o = S.quarterlyObjectives.periods.find(p=>p.id===periodId).objectives.find(o=>o.id===objId);
  o.text = text;
  saveState(); closeModal('modal-edit-qobj'); renderQuarterlyObjectives();
}

function deleteQObj(periodId, objId) {
  const period = S.quarterlyObjectives.periods.find(p=>p.id===periodId);
  period.objectives = period.objectives.filter(o=>o.id!==objId);
  saveState(); renderQuarterlyObjectives();
}

function saveNewPeriod() {
  const label = document.getElementById('period-input-label').value.trim();
  if (!label) return;
  const note  = document.getElementById('period-input-note').value.trim() || null;
  const flat  = document.getElementById('period-input-flat').checked;
  const id    = 'p-' + Date.now();
  S.quarterlyObjectives.periods.push({ id, label, flat, note, objectives: [] });
  S.quarterlyObjectives.activePeriod = id;
  saveState(); closeModal('modal-add-period'); renderQuarterlyObjectives();
}
