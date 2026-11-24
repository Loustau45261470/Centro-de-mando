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

// categoría de objetivo → tab/sección (inverso de QOBJ_TAB_CATS)
const QOBJ_CAT_TO_TAB = {};
Object.entries(QOBJ_TAB_CATS).forEach(([tab, cats]) => cats.forEach(c => QOBJ_CAT_TO_TAB[c] = tab));

// Categorías de transacciones disponibles para enlazar (gasto/presupuesto)
function _qobjTxnCats() {
  if (typeof ensureTxnCategories === 'function') ensureTxnCategories();
  return Object.entries(S.txnCategories || {});
}
function _qobjCatLabel(id) {
  if (typeof ensureTxnCategories === 'function') ensureTxnCategories();
  const c = (S.txnCategories || {})[id];
  return c ? `${c.icon || ''} ${c.label}`.trim() : id;
}

// ── Enlace de objetivos con hábitos / abogacía / finanzas ────────
// o.link = null
//   | {type:'habit', section, habitId}
//   | {type:'law', subjects:[{yearId,subId}]}
//   | {type:'finance', metric:'patrimonio'|'cuenta'|'gasto'|'ingreso'|'presupuesto'|'gasto_total'|'superavit', accountId?, category?, target?, modo?:'total'|'promedio'}
//   | {type:'sleep', metric:'wake_in', desde:'HH:MM', hasta:'HH:MM', target:%} | {type:'sleep', metric:'bed_before', hora:'HH:MM', target:%} | {type:'sleep', metric:'hours_min', horas:n, target:%}
//   | {type:'gym', metric:'sesiones', target:n} | {type:'estudio', metric:'horas', target:n}
// Se calcula sobre un período: id de trimestre ('t4-2026'), de mes ('2026-11') o personalizado ('p-…', sin fechas → últimos 90 días).
function _periodDateRange(periodId) {
  const months = _periodMonths(periodId);
  if (!months.length) return null;
  const [lyr, lmn] = months[months.length - 1].split('-');
  const lastDay = new Date(parseInt(lyr), parseInt(lmn), 0).getDate();
  return [months[0] + '-01', `${months[months.length - 1]}-${String(lastDay).padStart(2, '0')}`];
}

// Rango {desde,hasta,fin} de un período; `fin` = hasta recortado a hoy. Período sin fechas (p-…) → últimos 90 días.
function _qobjRange(periodId) {
  const today = getActiveDate();
  let r = _periodDateRange(periodId);
  if (!r) { const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - 89); r = [d.toISOString().slice(0, 10), today]; }
  return { desde: r[0], hasta: r[1], fin: r[1] < today ? r[1] : today };
}
function _qobjDays(rg) {
  const out = [];
  for (let d = new Date(rg.desde + 'T00:00:00'); d.toISOString().slice(0, 10) <= rg.fin; d.setDate(d.getDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
function _qobjCountPct(value, target) { return target ? Math.min(100, Math.max(0, Math.round(value / target * 100))) : 0; }

function _sleepLinkProgress(link, periodId) {
  const C = window.CMSueno;
  if (!C) return null;
  const rg = _qobjRange(periodId), rango = { desde: rg.desde, hasta: rg.fin };
  const D = _qobjDays(rg).length;
  const log = S.sleepLog || {};
  const ns = C.noches(log, rango);
  const target = +link.target || 0;
  let pctReg, reg, que;
  if (link.metric === 'wake_in') {
    reg = ns.filter(n => n.wake != null).length; pctReg = C.pctDiasLevantarEnFranja(log, rango, link.desde, link.hasta);
    que = `😴 Levantarte ${link.desde}–${link.hasta}`;
  } else if (link.metric === 'bed_before') {
    reg = ns.filter(n => n.bed != null).length; pctReg = C.pctNochesAcostarseAntes(log, rango, link.hora);
    que = `😴 Acostarte antes de las ${link.hora}`;
  } else if (link.metric === 'hours_min') {
    reg = ns.filter(n => n.horas != null).length; pctReg = C.pctNochesHorasMin(log, rango, link.horas);
    que = `😴 Dormir ${link.horas} h o más`;
  } else return null;
  const ok = pctReg == null ? 0 : Math.round(pctReg * reg / 100);   // días que cumplen; un día sin registro cuenta como no cumplido
  const val = D ? Math.round(ok / D * 100) : 0;
  return { label: `${que} · ${val}% de los días (meta ${target}%) · ${reg} de ${D} días registrados`, pct: _qobjCountPct(val, target) };
}

function _gymLinkProgress(link, periodId) {
  const rg = _qobjRange(periodId);
  let n = 0;
  Object.values(S.routineLog || {}).forEach(arr => (Array.isArray(arr) ? arr : []).forEach(e => { if (e && e.date >= rg.desde && e.date <= rg.fin) n++; }));
  const target = +link.target || 0;
  return { label: `🏋 Entrenamientos · ${n}/${target} sesiones`, pct: _qobjCountPct(n, target) };
}

function _estudioLinkProgress(link, periodId) {
  const rg = _qobjRange(periodId);
  const min = (S.pomodoroHistory || []).reduce((a, e) => (e && e.date >= rg.desde && e.date <= rg.fin) ? a + (+e.minutes || 0) : a, 0);
  const h = Math.round(min / 6) / 10, target = +link.target || 0;
  return { label: `📚 Estudio · ${h}/${target} h`, pct: _qobjCountPct(h, target) };
}

function _habitLinkProgress(link) {
  const habit = (S.habitTrackers?.[link.section] || []).find(h => h.id === link.habitId);
  if (!habit) return null;
  const days = habit.days || {};
  const today = getActiveDate();
  const range = _periodDateRange(link.periodId);
  let start = range ? range[0] : (Object.keys(days).sort()[0] || today);
  let end = (range && range[1] < today) ? range[1] : today;
  let done = 0, total = 0;
  for (let d = new Date(start + 'T00:00:00'); d <= new Date(end + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    const v = days[ds];
    if (v === 'done' || v === 'studied') { done++; total++; }
    else if (v !== 'rest') total++;
  }
  return { label: `${habit.emoji || '📌'} ${habit.name} · ${done}/${total} días`, pct: total ? Math.round(done / total * 100) : 0 };
}

function _lawLinkProgress(link) {
  const years = S.lawProgress?.years || [];
  const subs = link.subjects || [];
  const done = subs.filter(s => {
    const y = years.find(y => y.id === s.yearId);
    const sub = y && y.subjects.find(x => x.id === s.subId);
    return sub && sub.done;
  }).length;
  return { label: `⚖ ${done}/${subs.length} finales`, pct: subs.length ? Math.round(done / subs.length * 100) : 0 };
}

function _financeLinkProgress(link, periodId) {
  if (link.metric === 'patrimonio') {
    const current = calcNetWorth();
    const target = +link.target || 0;
    const pct = target ? Math.round(current / target * 100) : 0;
    return { label: `💰 Patrimonio · ${fmtMoney(current,'ARS')}/${fmtMoney(target,'ARS')}`, pct: Math.min(100, pct) };
  }
  if (link.metric === 'cuenta') {
    const acc = (S.accounts || []).find(a => a.id === link.accountId);
    if (!acc) return null;
    const target = +link.target || 0;
    const pct = target ? Math.round(acc.balance / target * 100) : 0;
    return { label: `${acc.icon||'🏦'} ${acc.name} · ${fmtMoney(acc.balance,acc.currency)}/${fmtMoney(target,acc.currency)}`, pct: Math.min(100, pct) };
  }
  const range = _periodDateRange(periodId);
  const inRange = t => !range || (t.date >= range[0] && t.date <= range[1]);
  // Reintegros (reintegros.js): nunca son ingreso; restan del gasto de su compra, en su categoría y mes. Devuelve lo que hay que restar.
  const reint = pred => {
    if (!window.CMReintegros) return 0;
    const vivas = new Set((S.transactions || []).map(t => t && t.id));
    return CMReintegros.partes(S).filter(p => vivas.has(p.txnId) && pred(p)).reduce((s, p) => s + p.cents, 0) / 100;
  };
  if (link.metric === 'gasto') {
    const spent = Math.round(((S.transactions || [])
      .filter(t => t.type === 'expense' && t.category === link.category && t.currency === 'ARS' && inRange(t))
      .reduce((s, t) => s + (+t.amount || 0), 0) - reint(p => p.category === link.category && inRange(p))) * 100) / 100;
    const target = +link.target || 0;
    const pct = target ? Math.round(spent / target * 100) : 0;
    return { label: `${_qobjCatLabel(link.category)} · ${fmtMoney(spent,'ARS')}/${fmtMoney(target,'ARS')} tope`, pct: Math.min(100, pct), exceeded: pct > 100 };
  }
  if (link.metric === 'gasto_total' || link.metric === 'superavit') {
    // Ingreso sin reintegros; gasto neto de reintegros.
    const sum = type => Math.round(((S.transactions || []).filter(t => t.type === type && !t.refundOf && t.currency === 'ARS' && inRange(t)).reduce((s, t) => s + (+t.amount || 0), 0)
      - (type === 'expense' ? reint(inRange) : 0)) * 100) / 100;
    const target = +link.target || 0;
    if (link.metric === 'gasto_total') {
      const spent = sum('expense'), pct = target ? Math.round(spent / target * 100) : 0;
      return { label: `🔴 Gasto total · ${fmtMoney(spent,'ARS')}/${fmtMoney(target,'ARS')} tope`, pct: Math.min(100, pct), exceeded: pct > 100 };
    }
    const neto = sum('income') - sum('expense');
    const meses = _periodMonths(periodId).filter(m => m + '-01' <= getActiveDate()).length || 1;
    const prom = link.modo === 'promedio' && meses > 1;
    const val = prom ? Math.round(neto / meses) : neto;
    return { label: `📈 Superávit${prom ? ' promedio por mes' : ''} · ${fmtMoney(val,'ARS')}/${fmtMoney(target,'ARS')}`, pct: target > 0 ? Math.min(100, Math.max(0, Math.round(val / target * 100))) : 0 };
  }
  if (link.metric === 'ingreso') {
    const total = (S.transactions || [])
      .filter(t => t.type === 'income' && !t.refundOf && t.currency === 'ARS' && inRange(t))
      .reduce((s, t) => s + (+t.amount || 0), 0);
    const target = +link.target || 0;
    const pct = target ? Math.round(total / target * 100) : 0;
    return { label: `💚 Ingresos · ${fmtMoney(total,'ARS')}/${fmtMoney(target,'ARS')}`, pct: Math.min(100, pct) };
  }
  if (link.metric === 'presupuesto') {
    const months = _periodMonths(periodId);
    const monthKeys = months.length ? months : [_curMonthKey()];
    let budgeted = 0;
    monthKeys.forEach(mk => {
      const b = (S.budgets || {})[mk];
      if (!b) return;
      (b.fixed || []).forEach(it => { if (it.category === link.category) budgeted += _budgetItemTotal(it); });
      (b.reserved || []).forEach(it => { if (it.category === link.category) budgeted += (+it.amount || 0); });
      (b.seasonal || []).forEach(it => { if (it.category === link.category) budgeted += (+it.amount || 0); });
    });
    const real = Math.round(((S.transactions || [])
      .filter(t => t.type === 'expense' && t.category === link.category && t.currency === 'ARS' && monthKeys.includes((t.date || '').slice(0,7)))
      .reduce((s, t) => s + (+t.amount || 0), 0) - reint(p => p.category === link.category && monthKeys.includes(p.month))) * 100) / 100;
    const pct = budgeted ? Math.round(real / budgeted * 100) : 0;
    return { label: `${_qobjCatLabel(link.category)} · ${fmtMoney(real,'ARS')}/${fmtMoney(budgeted,'ARS')} presup.`, pct: Math.min(100, pct), exceeded: pct > 100 };
  }
  return null;
}

function qobjLinkProgress(periodId, link) {
  if (!link) return null;
  if (link.type === 'habit')   return _habitLinkProgress({ ...link, periodId });
  if (link.type === 'law')     return _lawLinkProgress(link);
  if (link.type === 'finance') return _financeLinkProgress(link, periodId);
  if (link.type === 'sleep')   return _sleepLinkProgress(link, periodId);
  if (link.type === 'gym')     return _gymLinkProgress(link, periodId);
  if (link.type === 'estudio') return _estudioLinkProgress(link, periodId);
  return null;
}

function qobjLinkHTML(periodId, link) {
  const p = qobjLinkProgress(periodId, link);
  if (!p) return '';
  return `<div class="qobj-link-progress">
    <span class="qobj-link-label">${p.label}</span>
    <div class="qobj-link-bar-wrap"><div class="qobj-link-bar${p.exceeded?' exceeded':''}" style="width:${p.pct}%"></div></div>
  </div>`;
}

// ── Selector de enlace (un solo selector "Enlazar a" para todas las pestañas y para metas mensuales) ──
// El prefijo 'mgoal…' identifica al modal de metas mensuales (período = mes).
const QOBJ_KIND_LABEL = { habit: 'Hábito', law: 'Materias', sleep: 'Sueño', gym: 'Entrenamiento', estudio: 'Estudio', finance: 'Finanzas' };
// Todos los tipos están en todas las pestañas; el orden pone primero los más naturales de cada una.
const QOBJ_KIND_ORDER = {
  vida:         ['habit', 'sleep', 'gym', 'estudio', 'finance', 'law'],
  salud:        ['habit', 'gym', 'sleep', 'estudio', 'finance', 'law'],
  finanzas:     ['finance', 'habit', 'sleep', 'gym', 'estudio', 'law'],
  conocimiento: ['law', 'habit', 'estudio', 'sleep', 'gym', 'finance'],
  ia:           ['habit', 'estudio', 'sleep', 'gym', 'finance', 'law']
};
const _qobjPer = idPrefix => idPrefix.indexOf('mgoal') === 0 ? 'mes' : 'trimestre';

// Select de hábitos de una sección
function _qobjHabitSelectHTML(idPrefix, section, link) {
  const sec = (link && link.type === 'habit' && link.section) || section;
  const habits = _getHabits(sec);
  const curId = (link && link.type === 'habit') ? link.habitId : '';
  return `<select class="inp" id="${idPrefix}-habit" data-section="${sec}" style="width:100%">
    <option value="">Elegí un hábito</option>
    ${habits.map(h => `<option value="${h.id}" ${h.id===curId?'selected':''}>${h.emoji||'📌'} ${h.name}</option>`).join('')}
  </select>`;
}

// Sub-campos según la métrica financiera elegida (cuenta/categoría/monto meta o tope)
function qobjFinanceSubFieldsHTML(idPrefix, metric, link) {
  const accounts = (S.accounts || []).filter(a => acctVisible(a) || a.id === (link && link.accountId));
  const cats = _qobjTxnCats();
  const curAccount = (link && link.accountId) || '';
  const curCat = (link && link.category) || '';
  const curTarget = (link && link.target != null) ? link.target : '';
  const per = _qobjPer(idPrefix);
  if (metric === 'cuenta') {
    return `<select class="inp" id="${idPrefix}-fin-acc" style="width:100%;margin-bottom:8px">
      ${accounts.map(a => `<option value="${a.id}" ${a.id===curAccount?'selected':''}>${a.icon||'🏦'} ${a.name}</option>`).join('')}
    </select>
    <input class="inp" type="number" id="${idPrefix}-fin-target" placeholder="Monto meta" value="${curTarget}" style="width:100%">`;
  }
  if (metric === 'gasto') {
    return `<select class="inp" id="${idPrefix}-fin-cat" style="width:100%;margin-bottom:8px">
      ${cats.map(([id,c]) => `<option value="${id}" ${id===curCat?'selected':''}>${c.icon||''} ${c.label}</option>`).join('')}
    </select>
    <input class="inp" type="number" id="${idPrefix}-fin-target" placeholder="Monto tope del ${per}" value="${curTarget}" style="width:100%">`;
  }
  if (metric === 'presupuesto') {
    return `<select class="inp" id="${idPrefix}-fin-cat" style="width:100%">
      ${cats.map(([id,c]) => `<option value="${id}" ${id===curCat?'selected':''}>${c.icon||''} ${c.label}</option>`).join('')}
    </select>`;
  }
  if (metric === 'gasto_total') {
    return `<input class="inp" type="number" id="${idPrefix}-fin-target" placeholder="Tope de gasto total del ${per}" value="${curTarget}" style="width:100%">`;
  }
  if (metric === 'superavit') {
    const modo = (link && link.modo) || 'total';
    const sel = per === 'mes' ? '' : `<select class="inp" id="${idPrefix}-fin-modo" style="width:100%;margin-bottom:8px">
      <option value="total" ${modo==='total'?'selected':''}>Total del trimestre</option>
      <option value="promedio" ${modo==='promedio'?'selected':''}>Promedio por mes</option>
    </select>`;
    return `${sel}<input class="inp" type="number" id="${idPrefix}-fin-target" placeholder="Superávit meta" value="${curTarget}" style="width:100%">`;
  }
  if (metric === 'patrimonio' || metric === 'ingreso') {
    return `<input class="inp" type="number" id="${idPrefix}-fin-target" placeholder="Monto meta" value="${curTarget}" style="width:100%">`;
  }
  return '';
}

function _qobjFinMetricChange(idPrefix) {
  const metric = document.getElementById(`${idPrefix}-fin-metric`).value;
  document.getElementById(`${idPrefix}-fin-sub`).innerHTML = qobjFinanceSubFieldsHTML(idPrefix, metric, null);
}

// Select de métrica + sus sub-campos (usado dentro del picker de finanzas)
function qobjFinanceMetricHTML(idPrefix, link) {
  const metric = (link && link.type === 'finance') ? link.metric : '';
  const per = _qobjPer(idPrefix);
  const opt = (v, lbl) => `<option value="${v}" ${metric===v?'selected':''}>${lbl}</option>`;
  return `<select class="inp" id="${idPrefix}-fin-metric" style="width:100%;margin-bottom:8px" onchange="_qobjFinMetricChange('${idPrefix}')">
    <option value="">Elegí una métrica</option>
    ${opt('patrimonio','💰 Patrimonio total')}
    ${opt('cuenta','🏦 Una cuenta')}
    ${opt('gasto_total','🔴 Gasto total (tope, todas las categorías)')}
    ${opt('superavit','📈 Superávit (ingresos − gastos)')}
    ${opt('gasto','🔴 Gasto por categoría (tope)')}
    ${opt('ingreso','💚 Ingresos del ' + per)}
    ${opt('presupuesto','📋 Presupuesto de una categoría')}
  </select>
  <div id="${idPrefix}-fin-sub">${qobjFinanceSubFieldsHTML(idPrefix, metric, link)}</div>`;
}

// Sueño: tres métricas, cada una con su % de días meta
function qobjSleepFieldsHTML(p, metric, l) {
  const v = (k, d) => (l && l.metric === metric && l[k] != null) ? l[k] : d;
  let f = '';
  if (metric === 'wake_in') f = `<div class="qobj-link-row"><span>Entre</span><input class="inp" type="time" id="${p}-sl-desde" value="${v('desde','07:00')}"><span>y</span><input class="inp" type="time" id="${p}-sl-hasta" value="${v('hasta','07:30')}"></div>`;
  else if (metric === 'bed_before') f = `<div class="qobj-link-row"><span>Antes de las</span><input class="inp" type="time" id="${p}-sl-hora" value="${v('hora','23:30')}"></div>`;
  else f = `<div class="qobj-link-row"><span>Al menos</span><input class="inp" type="number" min="1" max="14" step="0.5" id="${p}-sl-horas" value="${v('horas',8)}"><span>horas</span></div>`;
  return f + `<div class="qobj-link-row"><span>En el</span><input class="inp" type="number" min="1" max="100" id="${p}-sl-target" value="${(l && l.target) || 80}"><span>% de los días</span></div>`;
}
function qobjSleepSubHTML(p, link) {
  const l = (link && link.type === 'sleep') ? link : null;
  const m = l ? l.metric : 'wake_in';
  const opt = (v, t) => `<option value="${v}" ${m===v?'selected':''}>${t}</option>`;
  return `<select class="inp" id="${p}-sl-metric" style="width:100%;margin-bottom:8px" onchange="_qobjSleepMetricChange('${p}')">
    ${opt('wake_in','Levantarme en una franja horaria')}${opt('bed_before','Acostarme antes de una hora')}${opt('hours_min','Dormir un mínimo de horas')}
  </select>
  <div id="${p}-sl-sub">${qobjSleepFieldsHTML(p, m, l)}</div>`;
}
function _qobjSleepMetricChange(p) {
  document.getElementById(`${p}-sl-sub`).innerHTML = qobjSleepFieldsHTML(p, document.getElementById(`${p}-sl-metric`).value, null);
}

// Sub-HTML según el tipo de enlace elegido
function qobjKindSubHTML(p, tab, kind, link) {
  const l = (link && link.type === kind) ? link : null;
  if (kind === 'habit') return _qobjHabitSelectHTML(p, tab, l);
  if (kind === 'finance') return qobjFinanceMetricHTML(p, l);
  if (kind === 'sleep') return qobjSleepSubHTML(p, l);
  if (kind === 'law') {
    const years = S.lawProgress?.years || [];
    const checked = (yId, sId) => (l && l.subjects.some(s => s.yearId === yId && s.subId === sId)) ? 'checked' : '';
    const rows = years.map(y => `
      <div class="qobj-link-year-label">${y.label}</div>
      ${y.subjects.map(sub => `
        <label class="qobj-link-subj-row">
          <input type="checkbox" id="${p}-subj-${y.id}-${sub.id}" data-year="${y.id}" data-sub="${sub.id}" ${checked(y.id, sub.id)}>
          <span>${sub.name}${sub.done ? ' ✓' : ''}</span>
        </label>`).join('')}`).join('');
    return `<div class="qobj-link-subj-list">${rows || '<div class="empty-state" style="padding:8px 0">Sin materias cargadas</div>'}</div>`;
  }
  const cnt = { gym: 'Sesiones de entrenamiento meta', estudio: 'Horas de estudio meta' }[kind];
  if (cnt) return `<input class="inp" type="number" min="1" id="${p}-cnt-target" placeholder="${cnt}" value="${l && l.target != null ? l.target : ''}" style="width:100%">`;
  return '';
}

function _qobjLinkKindChange(idPrefix) {
  const sel = document.getElementById(`${idPrefix}-kind`);
  document.getElementById(`${idPrefix}-kind-sub`).innerHTML = qobjKindSubHTML(idPrefix, sel.dataset.tab, sel.value, null);
}

// HTML del selector de enlace dentro de los modales de agregar/editar (trimestrales y mensuales)
function qobjLinkPickerHTML(idPrefix, tabName, link) {
  const order = QOBJ_KIND_ORDER[tabName] || QOBJ_KIND_ORDER.vida;
  const cur = (link && QOBJ_KIND_LABEL[link.type]) ? link.type : '';
  return `<div class="qobj-link-picker">
    <div class="qobj-link-picker-title">Enlazar a</div>
    <select class="inp" id="${idPrefix}-kind" data-tab="${tabName}" style="width:100%;margin-bottom:8px" onchange="_qobjLinkKindChange('${idPrefix}')">
      <option value="">Sin enlace</option>
      ${order.map(k => `<option value="${k}" ${cur===k?'selected':''}>${QOBJ_KIND_LABEL[k]}</option>`).join('')}
    </select>
    <div id="${idPrefix}-kind-sub">${qobjKindSubHTML(idPrefix, tabName, cur, link)}</div>
  </div>`;
}

function qobjReadLinkFromPicker(idPrefix, tabName) {
  const kind = document.getElementById(`${idPrefix}-kind`)?.value;
  const el = id => document.getElementById(`${idPrefix}-${id}`);
  if (kind === 'habit') {
    const sel = el('habit');
    return (sel && sel.value) ? { type: 'habit', section: sel.dataset.section || tabName, habitId: sel.value } : null;
  }
  if (kind === 'law') {
    const subjects = [...document.querySelectorAll(`[id^="${idPrefix}-subj-"]:checked`)]
      .map(e => ({ yearId: e.dataset.year, subId: e.dataset.sub }));
    return subjects.length ? { type: 'law', subjects } : null;
  }
  if (kind === 'sleep') {
    const metric = el('sl-metric')?.value;
    const target = Math.min(100, Math.max(1, Math.round(+el('sl-target')?.value || 80)));
    if (metric === 'wake_in') { const desde = el('sl-desde')?.value, hasta = el('sl-hasta')?.value; return (desde && hasta) ? { type: 'sleep', metric, desde, hasta, target } : null; }
    if (metric === 'bed_before') { const hora = el('sl-hora')?.value; return hora ? { type: 'sleep', metric, hora, target } : null; }
    if (metric === 'hours_min') { const horas = +el('sl-horas')?.value; return horas > 0 ? { type: 'sleep', metric, horas, target } : null; }
    return null;
  }
  if (kind === 'gym' || kind === 'estudio') {
    const target = +el('cnt-target')?.value || 0;
    if (target <= 0) return null;
    return { type: kind, metric: { gym: 'sesiones', estudio: 'horas' }[kind], target };
  }
  if (kind === 'finance') {
    const metric = el('fin-metric')?.value;
    if (!metric) return null;
    const targetEl = el('fin-target');
    const target = targetEl ? (+targetEl.value || 0) : null;
    if (metric === 'cuenta') {
      const accountId = el('fin-acc')?.value;
      return accountId ? { type: 'finance', metric, accountId, target } : null;
    }
    if (metric === 'gasto' || metric === 'presupuesto') {
      const category = el('fin-cat')?.value;
      if (!category) return null;
      return metric === 'presupuesto' ? { type: 'finance', metric, category } : { type: 'finance', metric, category, target };
    }
    if (metric === 'superavit') return { type: 'finance', metric, modo: el('fin-modo')?.value || 'total', target };
    return { type: 'finance', metric, target };
  }
  return null;
}

function _periodMonths(periodId) {
  if (/^\d{4}-\d{2}$/.test(periodId)) return [periodId];
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

function _quarterLabel(q, yr) { return `T${q} ${yr}`; }

function _adjacentQuarterId(periodId, dir) {
  const m = periodId.match(/^t([1-4])-(\d{4})$/);
  if (!m) return null;
  let q = parseInt(m[1]) + dir, yr = parseInt(m[2]);
  if (q > 4) { q = 1; yr++; }
  else if (q < 1) { q = 4; yr--; }
  return { id: `t${q}-${yr}`, q, yr };
}

function navQPeriod(dir) {
  const qo = S.quarterlyObjectives;
  if (!qo || !Array.isArray(qo.periods) || !qo.periods.length) return;
  const current = qo.periods.find(p => p.id === qo.activePeriod) || qo.periods[0];
  const adj = _adjacentQuarterId(current.id, dir);
  if (!adj) return;
  let period = qo.periods.find(p => p.id === adj.id);
  if (!period) {
    period = { id: adj.id, label: _quarterLabel(adj.q, adj.yr), flat: false, note: null, objectives: [] };
    const insertAt = qo.periods.findIndex(p => {
      const m = p.id.match(/^t([1-4])-(\d{4})$/);
      if (!m) return false;
      const yr = parseInt(m[2]), q = parseInt(m[1]);
      return yr > adj.yr || (yr === adj.yr && q > adj.q);
    });
    if (insertAt === -1) qo.periods.push(period);
    else qo.periods.splice(insertAt, 0, period);
  }
  qo.activePeriod = period.id;
  Object.keys(_qobjActiveMonth).forEach(k => _qobjActiveMonth[k] = 'trim');
  saveState(); renderQuarterlyObjectives();
}

let _mgoalAddTab = null, _mgoalAddMonth = null, _mgoalEditIdx = null;

function _openMonthlyGoalModal(tabName, monthKey, idx) {
  _mgoalAddTab = tabName;
  _mgoalAddMonth = monthKey;
  _mgoalEditIdx = idx;
  const g = idx == null ? null : getMonthlyGoals(tabName, monthKey)[idx];
  const [yr, mn] = monthKey.split('-');
  const secLbl = (QOBJ_TAB_CATS[tabName] || []).join(' & ') || tabName;
  document.getElementById('mgoal-modal-title').textContent =
    `${g ? 'Editar meta' : 'Meta'} de ${secLbl} — ${_MONTH_SHORT[parseInt(mn) - 1]} ${yr}`;
  document.getElementById('mgoal-input-text').value = g ? g.text : '';
  document.getElementById('mgoal-save-btn').textContent = g ? 'Guardar' : 'Agregar';
  document.getElementById('mgoal-link-wrap').innerHTML = qobjLinkPickerHTML('mgoal-link', tabName, g ? g.link : null);
  openModal('modal-add-mgoal');
}
function openAddMonthlyGoal(tabName, monthKey) { _openMonthlyGoalModal(tabName, monthKey, null); }
function openEditMonthlyGoal(tabName, monthKey, idx) { if (getMonthlyGoals(tabName, monthKey)[idx]) _openMonthlyGoalModal(tabName, monthKey, idx); }

function saveNewMonthlyGoal() {
  const text = document.getElementById('mgoal-input-text').value.trim();
  if (!text || !_mgoalAddMonth || !_mgoalAddTab) return;
  const link = qobjReadLinkFromPicker('mgoal-link', _mgoalAddTab);
  const m = _mgSection(_mgoalAddTab);
  if (!m[_mgoalAddMonth]) m[_mgoalAddMonth] = [];
  const goals = m[_mgoalAddMonth];
  if (_mgoalEditIdx != null && goals[_mgoalEditIdx]) {
    goals[_mgoalEditIdx].text = text;
    if (link) goals[_mgoalEditIdx].link = link; else delete goals[_mgoalEditIdx].link;
  } else {
    const nextId = goals.length ? Math.max(...goals.map(g => g.id)) + 1 : 1;
    goals.push(link ? { id: nextId, text, done: false, link } : { id: nextId, text, done: false });
  }
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
  const canNav = !!_adjacentQuarterId(period.id, 1);
  const navBtn = (dir, label, title) => canNav
    ? `<button class="btn btn-ghost btn-sm" onclick="navQPeriod(${dir})" title="${title}">${label}</button>`
    : `<button class="btn btn-ghost btn-sm" disabled title="Este período no es un trimestre calendario">${label}</button>`;
  const dropdownHTML = `<div style="display:flex;align-items:center;gap:4px">
    ${navBtn(-1, '‹', 'Trimestre anterior')}
    <div class="qobj-period-dropdown" id="${ddId}" style="margin-bottom:0">
      <button class="qobj-period-trigger" onclick="toggleQObjDropdown('${ddId}')">
        ${period.label}<span class="qobj-period-chevron">▾</span>
      </button>
      <div class="qobj-period-menu">
        ${qo.periods.map(p => `<button class="qobj-period-option${p.id===qo.activePeriod?' active':''}" onclick="selectQPeriod('${p.id}');closeQObjDropdown('${ddId}')">${p.label}</button>`).join('')}
      </div>
    </div>
    ${navBtn(1, '›', 'Trimestre siguiente')}
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
      listHTML = `<div class="empty-state" style="font-size:var(--fs-12-5);padding:16px 0">Sin categorías en este período</div>`;
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
          <div class="mg-body"><span class="mg-text">${g.text}</span>${qobjLinkHTML(monthKey, g.link)}</div>
          <button class="mg-del" onclick="openEditMonthlyGoal('${tabName}','${monthKey}',${i})" title="Editar">✎</button>
          <button class="mg-del" onclick="deleteMonthlyGoal('${tabName}','${monthKey}',${i})">✕</button>
          <input type="checkbox" ${g.done?'checked':''} onchange="toggleMonthlyGoal('${tabName}','${monthKey}',${i})" aria-label="Marcar meta mensual">
        </div>`).join('')
      : `<div class="empty-state" style="font-size:var(--fs-12-5);padding:14px 0;text-align:center">Sin metas para ${_MONTH_SHORT[mn]} ${yr}</div>`;

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
    <div class="qobj-item-body">
      <span class="qobj-item-text">${o.text}</span>
      ${qobjLinkHTML(periodId, o.link)}
    </div>
    <div class="qobj-item-actions">
      <button class="qobj-act-btn" onclick="openEditQObj('${periodId}',${o.id})" title="Editar">✎</button>
      <button class="qobj-act-btn" onclick="deleteQObj('${periodId}',${o.id})" title="Eliminar">✕</button>
    </div>
    <input type="checkbox" ${o.done?'checked':''} onchange="toggleQObj('${periodId}',${o.id})" aria-label="Marcar objetivo">
  </div>`;
}

function selectQPeriod(id) {
  S.quarterlyObjectives.activePeriod = id;
  saveState(); renderQuarterlyObjectives();
}

function toggleQObj(periodId, objId) {
  const period = S.quarterlyObjectives.periods.find(p=>p.id===periodId);
  const o = period.objectives.find(o=>o.id===objId);
  o.done = !o.done;
  if (o.done) { const n = new Date(), q = x => String(x).padStart(2, '0'); o.doneAt = n.getFullYear() + '-' + q(n.getMonth() + 1) + '-' + q(n.getDate()); } else delete o.doneAt;
  saveState(); renderQuarterlyObjectives();
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
        <div style="font-size:var(--fs-13);color:rgba(255,255,255,.7);margin-top:6px;font-weight:600">Todos los objetivos del trimestre logrados</div>
      `;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4200);
      showToast(`🏅 ¡${period.label} completado!`, 4000);
    } else {
      showToast('✓ Objetivo logrado');
    }
  }
}

let _qobjAddPeriod = null, _qobjAddCat = null, _qobjAddTab = null;
function openAddQObj(periodId, cat) {
  _qobjAddPeriod = periodId; _qobjAddCat = cat || null;
  _qobjAddTab = cat ? QOBJ_CAT_TO_TAB[cat] : 'vida';
  document.getElementById('qobj-input-text').value = '';
  const catSel = document.getElementById('qobj-input-cat');
  if (cat) { catSel.value = cat; catSel.style.display = 'none'; }
  else catSel.style.display = 'block';
  document.getElementById('qobj-add-link-wrap').innerHTML = qobjLinkPickerHTML('qobj-add', _qobjAddTab, null);
  openModal('modal-add-qobj');
}
function saveNewQObj() {
  const text = document.getElementById('qobj-input-text').value.trim();
  if (!text) return;
  const period = S.quarterlyObjectives.periods.find(p=>p.id===_qobjAddPeriod);
  const nextId = period.objectives.length ? Math.max(...period.objectives.map(o=>o.id)) + 1 : 1;
  const cat = _qobjAddCat || (period.flat ? null : document.getElementById('qobj-input-cat').value);
  const link = qobjReadLinkFromPicker('qobj-add', _qobjAddTab);
  period.objectives.push({ id: nextId, text, done: false, category: cat, link });
  saveState(); closeModal('modal-add-qobj'); renderQuarterlyObjectives();
}

let _qobjEditTab = null;
function openEditQObj(periodId, objId) {
  const o = S.quarterlyObjectives.periods.find(p=>p.id===periodId).objectives.find(o=>o.id===objId);
  document.getElementById('qobj-edit-text').value = o.text;
  document.getElementById('qobj-edit-period').value = periodId;
  document.getElementById('qobj-edit-id').value = objId;
  _qobjEditTab = o.category ? QOBJ_CAT_TO_TAB[o.category] : 'vida';
  document.getElementById('qobj-edit-link-wrap').innerHTML = qobjLinkPickerHTML('qobj-edit', _qobjEditTab, o.link);
  openModal('modal-edit-qobj');
}
function saveEditQObj() {
  const text = document.getElementById('qobj-edit-text').value.trim();
  if (!text) return;
  const periodId = document.getElementById('qobj-edit-period').value;
  const objId = parseInt(document.getElementById('qobj-edit-id').value);
  const o = S.quarterlyObjectives.periods.find(p=>p.id===periodId).objectives.find(o=>o.id===objId);
  o.text = text;
  o.link = qobjReadLinkFromPicker('qobj-edit', _qobjEditTab);
  saveState(); closeModal('modal-edit-qobj'); renderQuarterlyObjectives();
}

function deleteQObj(periodId, objId) {
  const period = S.quarterlyObjectives.periods.find(p=>p.id===periodId);
  period.objectives = period.objectives.filter(o=>o.id!==objId);
  if (S.principios && S.principios.extras) delete S.principios.extras['q:'+periodId+':'+objId];
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
