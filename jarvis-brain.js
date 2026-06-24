/* ══════════════════════════════════════════════════════
   JARVIS BRAIN — conocimiento + acciones para el asistente de voz
   Da a JARVIS (voz) acceso de lectura a TODO el estado del centro de
   mando y la capacidad de crear/marcar/editar/eliminar cualquier cosa.
   Reusa las funciones globales verificadas; cuando la función original
   lee de inputs del DOM, muta S directamente + render.
   ══════════════════════════════════════════════════════ */
(function () {
  const TABS = ['vida', 'finanzas', 'salud', 'conocimiento', 'ia'];
  const THEMES = { '': '', original: '', normal: '', clasico: '', bloomberg: 'bloomberg', ambar: 'amber', amber: 'amber', radar: 'radar', infrarrojo: 'infrared', infrared: 'infrared' };

  const _norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const _today = () => (typeof getActiveDate === 'function') ? getActiveDate() : new Date().toISOString().slice(0, 10);

  // Busca el item cuyo texto contiene la consulta (prioriza el nombre más corto = match más específico)
  function _find(list, q, key) {
    key = key || 'text'; q = _norm(q);
    if (!q || !Array.isArray(list)) return null;
    let best = null;
    list.forEach((it, idx) => {
      const v = _norm(it[key]);
      if (v && v.includes(q) && (!best || (it[key] || '').length < (best.item[key] || '').length)) best = { item: it, idx };
    });
    return best;
  }

  // Período trimestral activo de forma segura (evita crashear si no hay objetivos cargados)
  function _activePeriod() {
    const qo = S && S.quarterlyObjectives;
    if (!qo || !Array.isArray(qo.periods) || !qo.periods.length) return null;
    return qo.periods.find(x => x.id === qo.activePeriod) || qo.periods[0];
  }

  /* ── Snapshot legible del estado completo ── */
  function snapshot() {
    if (typeof S === 'undefined' || !S) return 'Estado no disponible.';
    const today = _today();
    const L = ['FECHA DE HOY: ' + today];
    const _activeTab = (typeof currentTab !== 'undefined' && currentTab)
      || (((document.querySelector('.tab-panel.active') || {}).id) || '').replace('tab-', '');
    if (_activeTab) L.push('TAB ACTIVO: ' + _activeTab);

    // Objetivos del trimestre (período activo) — la falla original
    const qo = S.quarterlyObjectives;
    if (qo && qo.periods) {
      const p = qo.periods.find(x => x.id === qo.activePeriod) || qo.periods[0];
      if (p) {
        L.push('\nOBJETIVOS DEL TRIMESTRE [' + p.label + ']' + (p.note ? ' (' + p.note + ')' : '') + ':');
        (p.objectives || []).forEach(o => L.push(`  [${o.done ? 'HECHO' : 'pendiente'}] ${o.text}${o.category ? ' — ' + o.category : ''}`));
      }
    }

    // Metas del mes (por sección)
    const mk = today.slice(0, 7);
    Object.keys(QOBJ_TAB_CATS).forEach(sec => {
      const mg = (typeof getMonthlyGoals === 'function') ? getMonthlyGoals(sec, mk) : [];
      if (mg.length) { L.push('\nMETAS DEL MES — ' + sec.toUpperCase() + ' [' + mk + ']:'); mg.forEach(g => L.push(`  [${g.done ? 'HECHO' : 'pendiente'}] ${g.text}`)); }
    });

    // Metas de hoy
    const dg = (S.goals && S.goals[today]) || [];
    L.push('\nMETAS DE HOY (' + dg.filter(g => g.done).length + '/' + dg.length + '):');
    dg.forEach(g => L.push(`  [${g.done ? 'HECHO' : 'pendiente'}] ${g.text}`));

    // Hábitos y su estado de hoy
    const habLines = [];
    TABS.forEach(sec => {
      const hs = (S.habitTrackers && S.habitTrackers[sec]) || [];
      hs.forEach(h => habLines.push(`  ${h.name} [${sec}]: ${(h.days || {})[today] || 'sin marcar'}`));
    });
    if (habLines.length) L.push('\nHÁBITOS (estado de hoy):\n' + habLines.join('\n'));

    // Proyectos (raíz, pendientes) por sección
    const projLines = [];
    TABS.forEach(tab => {
      try {
        const raw = localStorage.getItem('proyectos_' + tab + '_v1');
        const tree = raw ? JSON.parse(raw) : [];
        const names = tree.filter(n => !n.done).map(n => n.label);
        if (names.length) projLines.push('  ' + tab + ': ' + names.slice(0, 10).join(', '));
      } catch (e) {}
    });
    if (projLines.length) L.push('\nPROYECTOS:\n' + projLines.join('\n'));

    // Finanzas
    if (S.accounts && S.accounts.length) {
      L.push('\nCUENTAS:');
      S.accounts.forEach(ac => L.push(`  ${ac.name}: ${ac.balance} ${ac.currency || ''}`));
    }
    let inc = 0, exp = 0;
    (S.transactions || []).forEach(t => { if ((t.date || '').slice(0, 7) === mk) { if (t.type === 'income') inc += (+t.amount || 0); else exp += (+t.amount || 0); } });
    L.push('MOVIMIENTOS DEL MES: ingresos ' + inc + ' · gastos ' + exp);
    if (S.wishlist && S.wishlist.length) L.push('OBJETIVOS DE ADQUISICIÓN: ' + S.wishlist.map(w => `${w.name} (${w.amount} ${w.currency || ''})`).join(', '));

    // Gastos fijos del mes y su estado de pago
    const fe = (S.fixedExpenses || []).map(e => {
      const paid = S.fixedExpenseLog && S.fixedExpenseLog[mk] && S.fixedExpenseLog[mk][e.id];
      return `  [${paid ? 'PAGADO' : 'pendiente'}] ${e.name} ${e.amount} ${e.currency || ''} (día ${e.dayOfMonth || '?'})`;
    });
    if (fe.length) L.push('\nGASTOS FIJOS [' + mk + ']:\n' + fe.join('\n'));

    // Salud
    const healthBits = [];
    if (S.bodyWeight && S.bodyWeight.length) { const last = S.bodyWeight[S.bodyWeight.length - 1]; healthBits.push('peso: ' + last.value + last.unit + ' (' + last.date + ')'); }
    // Sueño y bienestar de hoy
    const sl = (S.sleepLog && S.sleepLog[today]) || {};
    if (sl.hours) healthBits.push('dormí ' + sl.hours + 'h' + (sl.bedtime ? ' (' + sl.bedtime + '→' + (sl.waketime || '?') + ')' : ''));
    if (sl.wellness) {
      const w = sl.wellness, ws = [];
      if (w.energy) ws.push('energía ' + w.energy + '/5');
      if (w.mood) ws.push('ánimo ' + w.mood + '/5');
      if (w.sleepQuality) ws.push('calidad sueño ' + w.sleepQuality + '/5');
      if (w.stress) ws.push('estrés ' + w.stress + '/5');
      if (w.pain) ws.push('dolor ' + w.pain + '/5');
      if (ws.length) healthBits.push('bienestar: ' + ws.join(', '));
    }
    L.push('\nSALUD: ' + healthBits.join(' · '));

    // Facultad
    if (S.lawProgress && S.lawProgress.years) {
      let done = 0, total = 0;
      S.lawProgress.years.forEach(y => (y.subjects || []).forEach(s => { total++; if (s.done) done++; }));
      L.push('\nFACULTAD (Derecho): ' + done + '/' + total + ' materias aprobadas');
    }

    // Recordatorios
    const rem = [];
    TABS.forEach(tab => ((S.reminders && S.reminders[tab]) || []).forEach(r => rem.push(r.title + (r.datetime ? ' (' + r.datetime + ')' : ''))));
    if (rem.length) L.push('\nRECORDATORIOS: ' + rem.slice(0, 12).join(' · '));

    if (S.streak) L.push('\nRACHA DE METAS: ' + S.streak.count + ' días');
    return L.join('\n');
  }

  /* ── Catálogo de acciones (para el prompt) ── */
  const ACTIONS_HELP = [
    'switch_tab {tab}  — tab: vida|finanzas|salud|conocimiento|ia',
    'set_theme {theme}  — theme: original|bloomberg|amber(ámbar)|radar|infrared(infrarrojo)',
    'add_daily_goal {text, when?(today|tomorrow), priority?(high|medium|low)}',
    'complete_daily_goal {search}  — busca en metas de hoy y de mañana',
    'delete_daily_goal {search}  — busca en metas de hoy y de mañana',
    'toggle_quarterly {search}  — marca/desmarca un objetivo del trimestre activo',
    'add_quarterly {text, category?(Vida|Economía|Facultad|Conocimiento|Entrenamiento|IA)}',
    'delete_quarterly {search}',
    'add_monthly_goal {text, section?(vida|finanzas|salud|conocimiento|ia), month?(YYYY-MM)}',
    'complete_monthly_goal {search, section?(vida|finanzas|salud|conocimiento|ia)}',
    'add_project {tab, name}',
    'complete_task {search}',
    'mark_habit {search, status?(done|partial|rest)}',
    'add_habit {section, name, emoji?}',
    'add_transaction {name, type(income|expense), amount, currency?, account?}',
    'add_wishlist {name, amount, currency?}',
    'add_reminder {tab, title, datetime(YYYY-MM-DDTHH:MM), priority?(critical|high|medium|low)}',
    'log_bodyweight {value, unit?(kg|lb)}',
    'log_sleep {hours?, bedtime?(HH:MM), waketime?(HH:MM)}  — registra el sueño de hoy',
    'set_wellness {metric(energia|animo|dolor|estres|calidad_sueno), value(1-5)}  — bienestar de hoy',
    'toggle_law_subject {search}',
    'delete_reminder {search}',
    'delete_wishlist {search}',
    'delete_transaction {search}  — revierte el saldo de la cuenta',
    'delete_habit {search}',
    'delete_project {search}  — borra el proyecto o subtarea (y su contenido)',
    'delete_monthly_goal {search, section?}'
  ].join('\n- ');

  /* ── Ejecutor de acciones ── */
  function execute(action, a) {
    a = a || {};
    try {
      switch (action) {
        case 'switch_tab': {
          const btn = document.querySelector(`.nav-btn[data-tab="${_norm(a.tab)}"]`);
          if (!btn) return { ok: false, msg: 'Unknown section, sir.' };
          btn.click(); return { ok: true };
        }
        case 'set_theme': {
          const th = THEMES[_norm(a.theme)];
          if (th === undefined) return { ok: false, msg: 'Unknown theme, sir.' };
          if (typeof applyTheme === 'function') applyTheme(th);
          return { ok: true };
        }
        case 'add_daily_goal': {
          const date = a.when === 'tomorrow' ? (typeof getTomorrow === 'function' ? getTomorrow() : _today()) : _today();
          if (!S.goals[date]) S.goals[date] = [];
          S.goals[date].push({ id: uid(), text: a.text || '', done: false, priority: a.priority || 'medium', time: null });
          saveState(); if (typeof renderGoals === 'function') renderGoals();
          return { ok: true };
        }
        case 'complete_daily_goal': {
          const td = _today(), tm = (typeof getTomorrow === 'function' ? getTomorrow() : td);
          let date = td, f = _find(S.goals[td] || [], a.search, 'text');
          if (!f) { f = _find(S.goals[tm] || [], a.search, 'text'); if (f) date = tm; }
          if (!f) return { ok: false, msg: "I couldn't find that goal, sir." };
          if (!f.item.done) { f.item.done = true; saveState(); if (typeof renderGoals === 'function') renderGoals(); }
          return { ok: true };
        }
        case 'delete_daily_goal': {
          const td = _today(), tm = (typeof getTomorrow === 'function' ? getTomorrow() : td);
          let date = td, f = _find(S.goals[td] || [], a.search, 'text');
          if (!f) { f = _find(S.goals[tm] || [], a.search, 'text'); if (f) date = tm; }
          if (!f) return { ok: false, msg: "I couldn't find that goal, sir." };
          S.goals[date].splice(f.idx, 1); saveState(); if (typeof renderGoals === 'function') renderGoals();
          return { ok: true };
        }
        case 'toggle_quarterly': {
          const p = _activePeriod();
          if (!p) return { ok: false, msg: 'No quarter set up yet, sir.' };
          const f = _find(p.objectives, a.search, 'text');
          if (!f) return { ok: false, msg: "I couldn't find that quarterly objective, sir." };
          if (typeof toggleQObj === 'function') toggleQObj(p.id, f.item.id);
          else { f.item.done = !f.item.done; saveState(); if (typeof renderQuarterlyObjectives === 'function') renderQuarterlyObjectives(); }
          return { ok: true, done: f.item.done };
        }
        case 'add_quarterly': {
          const p = _activePeriod();
          if (!p) return { ok: false, msg: 'No quarter set up yet, sir.' };
          const nid = p.objectives.length ? Math.max(...p.objectives.map(o => +o.id || 0)) + 1 : 1;
          p.objectives.push({ id: nid, text: a.text || '', done: false, category: a.category || null });
          saveState(); if (typeof renderQuarterlyObjectives === 'function') renderQuarterlyObjectives();
          return { ok: true };
        }
        case 'delete_quarterly': {
          const p = _activePeriod();
          if (!p) return { ok: false, msg: 'No quarter set up yet, sir.' };
          const f = _find(p.objectives, a.search, 'text');
          if (!f) return { ok: false, msg: "I couldn't find that objective, sir." };
          if (typeof deleteQObj === 'function') deleteQObj(p.id, f.item.id);
          else { p.objectives.splice(f.idx, 1); saveState(); if (typeof renderQuarterlyObjectives === 'function') renderQuarterlyObjectives(); }
          return { ok: true };
        }
        case 'add_monthly_goal': {
          const mk = a.month || _today().slice(0, 7);
          let sec = _norm(a.section || a.tab || 'vida'); if (!TABS.includes(sec)) sec = 'vida';
          if (typeof _mgSection !== 'function') return { ok: false, msg: 'Monthly goals unavailable, sir.' };
          const m = _mgSection(sec);
          if (!m[mk]) m[mk] = [];
          const g = m[mk];
          g.push({ id: g.length ? Math.max(...g.map(x => +x.id || 0)) + 1 : 1, text: a.text || '', done: false });
          saveState();
          if (typeof renderQObjForTab === 'function') renderQObjForTab(sec);
          if (window.JARVIS_INTEL) try { JARVIS_INTEL.renderCard(sec); } catch (e) {}
          return { ok: true };
        }
        case 'complete_monthly_goal': {
          if (typeof _mgSection !== 'function') return { ok: false, msg: 'Monthly goals unavailable, sir.' };
          const mk2 = a.month || _today().slice(0, 7);
          const sec0 = _norm(a.section || a.tab || '');
          const secs = TABS.includes(sec0) ? [sec0] : TABS;
          for (const s of secs) {
            const m = _mgSection(s);
            const f = _find((m && m[mk2]) || [], a.search, 'text');
            if (f) {
              if (!f.item.done) { f.item.done = true; saveState(); if (typeof renderQObjForTab === 'function') renderQObjForTab(s); if (window.JARVIS_INTEL) try { JARVIS_INTEL.renderCard(s); } catch (e) {} }
              return { ok: true };
            }
          }
          return { ok: false, msg: "I couldn't find that monthly goal, sir." };
        }
        case 'add_project': {
          if (!window.PROY_VOICE) return { ok: false, msg: 'Projects unavailable, sir.' };
          let tab = _norm(a.tab); if (!TABS.includes(tab)) tab = 'vida';
          PROY_VOICE.addProject(tab, a.name || a.label || '');
          return { ok: true };
        }
        case 'complete_task': {
          if (!window.PROY_VOICE) return { ok: false, msg: 'Projects unavailable, sir.' };
          const r = PROY_VOICE.completeTask(a.search || a.name || '');
          return r ? { ok: true } : { ok: false, msg: "I couldn't find that task, sir." };
        }
        case 'mark_habit': {
          if (!window.PROY_VOICE) return { ok: false, msg: 'Habits unavailable, sir.' };
          const r = PROY_VOICE.markHabit(a.search || a.name || '', a.status || 'done');
          return r ? { ok: true } : { ok: false, msg: "I couldn't find that habit, sir." };
        }
        case 'add_habit': {
          let sec = _norm(a.section); if (!TABS.includes(sec)) sec = 'vida';
          if (!S.habitTrackers[sec]) S.habitTrackers[sec] = [];
          S.habitTrackers[sec].push({ id: uid(), name: a.name || '', emoji: a.emoji || '📌', days: {} });
          saveState();
          if (typeof renderHabitsCard === 'function') renderHabitsCard(sec);
          if (typeof renderHabitCal === 'function') renderHabitCal(sec);
          return { ok: true };
        }
        case 'add_transaction': {
          const amt = parseFloat(a.amount);
          if (isNaN(amt)) return { ok: false, msg: 'I need a valid amount, sir.' };
          let accId = null;
          if (a.account) { const af = _find(S.accounts || [], a.account, 'name'); if (af) accId = af.item.id; }
          if (!accId && S.accounts && S.accounts.length) accId = S.accounts[0].id;
          const cur = a.currency || (S.accounts && S.accounts[0] && S.accounts[0].currency) || 'ARS';
          S.transactions.unshift({ id: uid(), date: _today(), name: a.name || '', type: a.type === 'income' ? 'income' : 'expense', amount: amt, currency: cur, accountId: accId, category: a.category || '' });
          saveState(); if (typeof renderFinanzasTab === 'function') renderFinanzasTab();
          return { ok: true };
        }
        case 'add_wishlist': {
          S.wishlist.push({ id: uid(), name: a.name || '', amount: parseFloat(a.amount) || 0, currency: a.currency || 'ARS' });
          saveState(); if (typeof renderWishlist === 'function') renderWishlist();
          return { ok: true };
        }
        case 'add_reminder': {
          let tab = _norm(a.tab); if (!TABS.includes(tab)) tab = 'vida';
          if (!S.reminders[tab]) S.reminders[tab] = [];
          S.reminders[tab].push({ id: uid(), title: a.title || '', datetime: a.datetime || '', priority: a.priority || 'medium' });
          saveState(); if (typeof renderReminders === 'function') renderReminders(tab);
          return { ok: true };
        }
        case 'log_bodyweight': {
          const v = parseFloat(a.value);
          if (isNaN(v)) return { ok: false, msg: 'I need a valid weight, sir.' };
          const date = _today();
          S.bodyWeight = (S.bodyWeight || []).filter(e => e.date !== date);
          S.bodyWeight.push({ id: uid(), date, value: v, unit: a.unit || 'kg' });
          S.bodyWeight.sort((x, y) => x.date.localeCompare(y.date));
          saveState(); if (typeof renderBodyWeight === 'function') renderBodyWeight();
          return { ok: true };
        }
        case 'log_sleep': {
          const date = _today();
          if (!S.sleepLog) S.sleepLog = {};
          if (!S.sleepLog[date]) S.sleepLog[date] = {};
          if (a.hours != null) { const h = parseFloat(a.hours); if (!isNaN(h)) S.sleepLog[date].hours = h; }
          if (a.bedtime) S.sleepLog[date].bedtime = a.bedtime;
          if (a.waketime) S.sleepLog[date].waketime = a.waketime;
          saveState(); if (typeof renderSleepTracker === 'function') renderSleepTracker();
          return { ok: true };
        }
        case 'set_wellness': {
          const date = _today();
          if (!S.sleepLog) S.sleepLog = {};
          if (!S.sleepLog[date]) S.sleepLog[date] = {};
          if (!S.sleepLog[date].wellness) S.sleepLog[date].wellness = {};
          const M = { energia: 'energy', energy: 'energy', animo: 'mood', humor: 'mood', mood: 'mood', dolor: 'pain', pain: 'pain', estres: 'stress', stress: 'stress', sueno: 'sleepQuality', calidad: 'sleepQuality', calidad_sueno: 'sleepQuality', sleepquality: 'sleepQuality', sleep: 'sleepQuality' };
          const key = M[_norm(a.metric).replace(/\s+/g, '_')] || M[_norm(a.metric)];
          const val = parseInt(a.value, 10);
          if (!key || isNaN(val)) return { ok: false, msg: 'Which metric and value from 1 to 5, sir?' };
          S.sleepLog[date].wellness[key] = Math.max(1, Math.min(5, val));
          saveState(); if (typeof renderSleepTracker === 'function') renderSleepTracker();
          return { ok: true };
        }
        case 'toggle_law_subject': {
          let found = null;
          (S.lawProgress && S.lawProgress.years || []).forEach(y => {
            if (found) return;
            const f = _find(y.subjects, a.search, 'name');
            if (f) found = { yearId: y.id, subId: f.item.id };
          });
          if (!found) return { ok: false, msg: "I couldn't find that subject, sir." };
          if (typeof toggleLawSubject === 'function') toggleLawSubject(found.yearId, found.subId);
          return { ok: true };
        }
        case 'delete_reminder': {
          for (const tab of TABS) {
            const f = _find((S.reminders && S.reminders[tab]) || [], a.search, 'title');
            if (f) {
              if (typeof deleteReminder === 'function') deleteReminder(tab, f.item.id);
              else { S.reminders[tab].splice(f.idx, 1); saveState(); if (typeof renderReminders === 'function') renderReminders(tab); }
              return { ok: true };
            }
          }
          return { ok: false, msg: "I couldn't find that reminder, sir." };
        }
        case 'delete_wishlist': {
          const f = _find(S.wishlist || [], a.search, 'name');
          if (!f) return { ok: false, msg: "I couldn't find that wishlist item, sir." };
          S.wishlist.splice(f.idx, 1); saveState(); if (typeof renderWishlist === 'function') renderWishlist();
          return { ok: true };
        }
        case 'delete_transaction': {
          const f = _find(S.transactions || [], a.search, 'name');
          if (!f) return { ok: false, msg: "I couldn't find that transaction, sir." };
          const txn = f.item;
          if (txn.accountId) { const acc = (S.accounts || []).find(x => x.id === txn.accountId); if (acc) acc.balance -= txn.type === 'income' ? txn.amount : -txn.amount; }
          S.transactions = S.transactions.filter(x => x.id !== txn.id);
          if (typeof snapshotNW === 'function') snapshotNW();
          saveState(); if (typeof renderFinanzasTab === 'function') renderFinanzasTab();
          return { ok: true };
        }
        case 'delete_habit': {
          for (const sec of TABS) {
            const f = _find((S.habitTrackers && S.habitTrackers[sec]) || [], a.search, 'name');
            if (f) {
              S.habitTrackers[sec] = S.habitTrackers[sec].filter(h => h.id !== f.item.id);
              if (typeof _habitActiveId !== 'undefined' && _habitActiveId[sec] === f.item.id) _habitActiveId[sec] = (S.habitTrackers[sec][0] || {}).id || null;
              saveState(); if (typeof renderHabitsCard === 'function') renderHabitsCard(sec);
              return { ok: true };
            }
          }
          return { ok: false, msg: "I couldn't find that habit, sir." };
        }
        case 'delete_project': {
          if (!window.PROY_VOICE || !PROY_VOICE.deleteProject) return { ok: false, msg: 'Projects unavailable, sir.' };
          const r = PROY_VOICE.deleteProject(a.search || a.name || '');
          return r ? { ok: true } : { ok: false, msg: "I couldn't find that project, sir." };
        }
        case 'delete_monthly_goal': {
          if (typeof _mgSection !== 'function') return { ok: false, msg: 'Monthly goals unavailable, sir.' };
          const mk3 = a.month || _today().slice(0, 7);
          const sec1 = _norm(a.section || a.tab || '');
          const secs2 = TABS.includes(sec1) ? [sec1] : TABS;
          for (const s of secs2) {
            const m = _mgSection(s);
            const f = _find((m && m[mk3]) || [], a.search, 'text');
            if (f) { m[mk3].splice(f.idx, 1); saveState(); if (typeof renderQObjForTab === 'function') renderQObjForTab(s); if (window.JARVIS_INTEL) try { JARVIS_INTEL.renderCard(s); } catch (e) {} return { ok: true }; }
          }
          return { ok: false, msg: "I couldn't find that monthly goal, sir." };
        }
        default:
          return { ok: false, msg: 'Unknown action, sir.' };
      }
    } catch (e) {
      return { ok: false, msg: 'That action failed, sir.' };
    }
  }

  window.JARVIS_BRAIN = { snapshot, execute, ACTIONS_HELP };
})();
