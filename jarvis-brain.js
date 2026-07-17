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

  // Cartera de inversión (CEDEARs) — cargada una vez desde el JSON publicado por la routine cloud IOL.
  let _cartera = null;
  try {
    fetch('data/cartera/latest.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { _cartera = j; })
      .catch(() => {});
  } catch (e) {}

  // Timers hablados: viven en memoria del dispositivo — si se cierra la página, mueren (aceptado).
  const _timers = [];

  const _norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const _today = () => (typeof getActiveDate === 'function') ? getActiveDate() : new Date().toISOString().slice(0, 10);
  const _qMatch = (str, q) => !q || _norm(str).includes(_norm(q));

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

  // Busca un nodo de proyecto/tarea por label en todas las secciones (mismo algoritmo que PROY_VOICE:
  // mejor match = label más corto que contiene la query). Usado para capturar refs ANTES de mutar
  // (auditoría/inverse) sin duplicar la mutación real, que sigue haciendo PROY_VOICE.
  function _findProjectNode(q, onlyNotDone) {
    q = _norm(q); if (!q || !window.Proyectos) return null;
    let best = null;
    TABS.forEach(tab => {
      const tree = window.Proyectos.get(tab) || [];
      (function walk(nodes, parentId) {
        (nodes || []).forEach(n => {
          const label = _norm(n.label);
          if (label && label.includes(q) && (!onlyNotDone || !n.done) && (!best || (n.label || '').length < (best.node.label || '').length)) best = { tab, node: n, parentId };
          walk(n.children, n.id);
        });
      })(tree, null);
    });
    return best;
  }

  // Busca un hábito por nombre en todas las secciones (mismo algoritmo que PROY_VOICE.markHabit).
  function _findHabitByName(q) {
    q = _norm(q); if (!q || typeof _getHabits !== 'function') return null;
    let best = null;
    TABS.forEach(sec => {
      _getHabits(sec).forEach(h => {
        const name = _norm(h.name);
        if (name && name.includes(q) && (!best || (h.name || '').length < (best.habit.name || '').length)) best = { sec, habit: h };
      });
    });
    return best;
  }

  // Período trimestral activo de forma segura (evita crashear si no hay objetivos cargados)
  function _activePeriod() {
    const qo = S && S.quarterlyObjectives;
    if (!qo || !Array.isArray(qo.periods) || !qo.periods.length) return null;
    return qo.periods.find(x => x.id === qo.activePeriod) || qo.periods[0];
  }

  // Suma/resta días a una fecha 'YYYY-MM-DD' (aritmética en UTC para evitar corrimientos de huso)
  function _addDays(dateStr, delta) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  // Racha de un hábito: días consecutivos 'done'/'partial' hasta hoy, saltando 'rest' (no corta), hoy vacío no corta.
  function _habitStreak(days, today) {
    let streak = 0;
    for (let i = 0; i < 400; i++) {
      const ds = _addDays(today, -i);
      const v = (days || {})[ds];
      if (v === 'done' || v === 'partial') streak++;
      else if (v === 'rest') continue;
      else { if (i === 0) continue; break; }
    }
    return streak;
  }

  // Parte un string con placeholders {{campo}} en segmentos [{d:false,t:"estático"},{d:true,t:"valor"}].
  // d=false → texto estático, siempre cacheable en TTS; d=true → valor dinámico, no garantizado cacheable.
  function _buildSegments(template, values) {
    values = values || {};
    return (template || '').split(/(\{\{\w+\}\})/g).filter(s => s !== '').map(s => {
      const m = s.match(/^\{\{(\w+)\}\}$/);
      if (m) return { d: true, t: String(values[m[1]] != null ? values[m[1]] : '') };
      return { d: false, t: s };
    });
  }

  /* ── Tendencias compactas: contexto temporal más allá de la foto de hoy ── */
  function _trends() {
    if (typeof S === 'undefined' || !S) return [];
    const today = _today();
    const T = [];

    // Rachas de hábitos
    try {
      const habLines = [];
      TABS.forEach(sec => ((S.habitTrackers && S.habitTrackers[sec]) || []).forEach(h => {
        habLines.push(`${h.name} ${_habitStreak(h.days, today)}d`);
      }));
      if (habLines.length) T.push('Rachas hábitos: ' + habLines.join(' | '));
    } catch (e) {}

    // Finanzas: mes actual vs mes anterior
    try {
      const mk = today.slice(0, 7);
      let [py, pm] = mk.split('-').map(Number); pm--; if (pm < 1) { pm = 12; py--; }
      const pmk = py + '-' + String(pm).padStart(2, '0');
      let inc = 0, exp = 0, pinc = 0, pexp = 0;
      (S.transactions || []).forEach(t => {
        const tm = (t.date || '').slice(0, 7), amt = +t.amount || 0;
        if (tm === mk) { if (t.type === 'income') inc += amt; else exp += amt; }
        else if (tm === pmk) { if (t.type === 'income') pinc += amt; else pexp += amt; }
      });
      if (inc || exp || pinc || pexp) {
        const pct = (cur, prev) => prev ? (Math.round((cur - prev) / prev * 100) + '%') : (cur ? '+100%' : '0%');
        T.push(`Finanzas mes: ingresos ${inc} (Δ${pct(inc, pinc)}) · gastos ${exp} (Δ${pct(exp, pexp)}) vs mes ant.`);
      }
    } catch (e) {}

    // Peso corporal: último valor y delta vs ~7 y ~30 días atrás
    try {
      const bw = S.bodyWeight || [];
      if (bw.length) {
        const last = bw[bw.length - 1];
        const near = (n, tol) => {
          const target = _addDays(today, -n);
          let best = null, bestDiff = Infinity;
          bw.forEach(e => {
            if (e.date === last.date) return;
            const diff = Math.abs((new Date(e.date) - new Date(target)) / 86400000);
            if (diff <= tol && diff < bestDiff) { best = e; bestDiff = diff; }
          });
          return best;
        };
        const w7 = near(7, 3), w30 = near(30, 8);
        let s = `Peso: ${last.value}${last.unit} (${last.date})`;
        if (w7) { const d = Math.round((last.value - w7.value) * 10) / 10; s += ` · Δ7d ${d >= 0 ? '+' : ''}${d}${last.unit}`; }
        if (w30) { const d = Math.round((last.value - w30.value) * 10) / 10; s += ` · Δ30d ${d >= 0 ? '+' : ''}${d}${last.unit}`; }
        T.push(s);
      }
    } catch (e) {}

    // Metas diarias completadas: últimos 7 días vs 7 anteriores
    try {
      let d1 = 0, t1 = 0, d2 = 0, t2 = 0;
      for (let i = 0; i < 7; i++) { const g = (S.goals && S.goals[_addDays(today, -i)]) || []; t1 += g.length; d1 += g.filter(x => x.done).length; }
      for (let i = 7; i < 14; i++) { const g = (S.goals && S.goals[_addDays(today, -i)]) || []; t2 += g.length; d2 += g.filter(x => x.done).length; }
      if (t1 || t2) {
        const rate = (d, t) => t ? (Math.round(d / t * 100) + '%') : 'n/d';
        T.push(`Metas diarias: ${rate(d1, t1)} últimos 7d (${d1}/${t1}) vs ${rate(d2, t2)} 7d previos (${d2}/${t2})`);
      }
    } catch (e) {}

    return T;
  }

  /* ── Anomalías: señales que merecen atención, no solo la foto de hoy ── */
  function _anomalies() {
    const out = [];
    if (typeof S === 'undefined' || !S) return out;
    const today = _today();
    const yesterday = _addDays(today, -1);
    const twoDaysAgo = _addDays(today, -2);

    // (a) rachas de hábitos en riesgo: eran ≥5 hace 2 días y hoy/ayer quedaron sin marcar
    try {
      TABS.forEach(sec => {
        ((S.habitTrackers && S.habitTrackers[sec]) || []).forEach(h => {
          try {
            const days = h.days || {};
            const streak2 = _habitStreak(days, twoDaysAgo);
            if (streak2 >= 5) {
              const atRisk = v => v !== 'done' && v !== 'partial' && v !== 'rest';
              if (atRisk(days[today]) || atRisk(days[yesterday])) {
                out.push(`⚠ Racha de ${h.name} en riesgo (era ${streak2}d)`);
              }
            }
          } catch (e) {}
        });
      });
    } catch (e) {}

    // (b) gastos del mes ya 30%+ arriba del total del mes anterior completo
    try {
      const mk = today.slice(0, 7);
      let [py, pm] = mk.split('-').map(Number); pm--; if (pm < 1) { pm = 12; py--; }
      const pmk = py + '-' + String(pm).padStart(2, '0');
      let exp = 0, pexp = 0;
      (S.transactions || []).forEach(t => {
        if (t.type === 'income') return;
        const tm = (t.date || '').slice(0, 7);
        if (tm === mk) exp += (+t.amount || 0);
        else if (tm === pmk) pexp += (+t.amount || 0);
      });
      if (pexp > 0 && exp > pexp * 1.3) out.push('⚠ Gastos del mes 30%+ arriba del anterior');
    } catch (e) {}

    // (c) variación de peso en 7 días > 1.5kg
    try {
      const bw = S.bodyWeight || [];
      if (bw.length) {
        const last = bw[bw.length - 1];
        const target = _addDays(today, -7);
        let best = null, bestDiff = Infinity;
        bw.forEach(e => {
          if (e.date === last.date) return;
          const diff = Math.abs((new Date(e.date) - new Date(target)) / 86400000);
          if (diff <= 3 && diff < bestDiff) { best = e; bestDiff = diff; }
        });
        if (best) {
          const d = Math.round((last.value - best.value) * 10) / 10;
          if (Math.abs(d) > 1.5) out.push(`⚠ Peso varió ${d >= 0 ? '+' : ''}${d}${last.unit} en 7 días`);
        }
      }
    } catch (e) {}

    return out;
  }

  /* ── Snapshot legible del estado completo ── */
  function snapshot() {
    if (typeof S === 'undefined' || !S) return 'Estado no disponible.';
    const today = _today();
    const L = ['FECHA DE HOY: ' + today];
    const _activeTab = (typeof currentTab !== 'undefined' && currentTab)
      || (((document.querySelector('.tab-panel.active') || {}).id) || '').replace('tab-', '');
    if (_activeTab) L.push('TAB ACTIVO: ' + _activeTab);

    // Alertas (anomalías detectadas)
    const anomalies = _anomalies();
    if (anomalies.length) L.push('\nALERTAS:\n' + anomalies.map(x => '  ' + x).join('\n'));

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

    // Tendencias (contexto temporal, no solo hoy)
    const trendLines = _trends();
    if (trendLines.length) L.push('\nTENDENCIAS:\n' + trendLines.map(t => '  ' + t).join('\n'));

    // Memoria persistente de JARVIS
    if (S.jarvisMemory && S.jarvisMemory.length) {
      L.push('\nMEMORIA DE JARVIS:\n' + S.jarvisMemory.map(m => `  - [${m.fecha}] ${m.text}`).join('\n'));
    }

    // Cartera de inversión (CEDEARs)
    if (_cartera && Array.isArray(_cartera.cedears) && _cartera.cedears.length) {
      L.push('\nCARTERA (CEDEARs, mes ' + _cartera.mes + '):');
      _cartera.cedears.slice(0, 12).forEach(c => {
        L.push(`  ${c.simbolo}: $${c.precio} (m/m ${c.variacionPct >= 0 ? '+' : ''}${c.variacionPct}% · 12m ${c.rend12m >= 0 ? '+' : ''}${c.rend12m}%)`);
      });
    }

    // Capturas pendientes para el vault
    if (S.capturas && S.capturas.length) {
      L.push('\nCAPTURAS PARA EL VAULT: ' + S.capturas.length + ' pendientes');
    }

    // Timers activos
    if (_timers.length) {
      L.push('\nTIMERS ACTIVOS:\n' + _timers.map(t => `  ${t.label}: ${Math.max(0, Math.round((t.endsAt - Date.now()) / 60000))} min restantes`).join('\n'));
    }

    // Últimas acciones (audit log local)
    try {
      const log = auditLog();
      if (log.length) {
        const last3 = log.slice(-3).reverse();
        L.push('\nÚLTIMAS ACCIONES:\n' + last3.map(e => {
          let ts; try { ts = new Date(e.ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); } catch (err) { ts = String(e.ts); }
          return `  [${ts}] ${e.desc || e.action}${e.undone ? ' (deshecha)' : ''}`;
        }).join('\n'));
      }
    } catch (e) {}

    return L.join('\n');
  }

  /* ── Audit log (localStorage, device-local, cap 50) ── */
  const AUDIT_KEY = 'jarvis_audit_v1';

  function _auditLoad() {
    try {
      const raw = localStorage.getItem(AUDIT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function _auditSave(arr) {
    try { localStorage.setItem(AUDIT_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  // API pública: registra una entrada (usada por el chat también). Devuelve la entrada normalizada.
  function audit(entry) {
    try {
      const log = _auditLoad();
      const e = Object.assign({ ts: Date.now(), source: 'voice', undone: false }, entry || {});
      log.push(e);
      while (log.length > 50) log.shift();
      _auditSave(log);
      return e;
    } catch (e) { return null; }
  }
  function auditLog() { return _auditLoad(); }
  // Helper interno: arma la entrada a partir del arg de la acción (a._source) y la registra.
  function _logAudit(a, action, desc, inverse) {
    audit({ source: (a && a._source) || 'voice', action, desc, inverse: inverse || null });
  }
  function _clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return x; } }

  /* ── Deshacer: aplica el inverse guardado en una entrada de audit ── */
  function _applyInverse(inv) {
    if (!inv || !inv.type) return { ok: false };
    try {
      switch (inv.type) {
        case 'move_goals_back': {
          if (!S.goals[inv.toDate]) S.goals[inv.toDate] = [];
          if (!S.goals[inv.fromDate]) S.goals[inv.fromDate] = [];
          const moved = [];
          S.goals[inv.toDate] = S.goals[inv.toDate].filter(g => {
            if ((inv.ids || []).includes(g.id)) { moved.push(g); return false; }
            return true;
          });
          S.goals[inv.fromDate] = S.goals[inv.fromDate].concat(moved);
          saveState(); if (typeof renderGoals === 'function') renderGoals();
          return { ok: true, msg: `Moved ${moved.length} goals back, sir.` };
        }
        case 'restore_goal': {
          if (!S.goals[inv.date]) S.goals[inv.date] = [];
          S.goals[inv.date].push(inv.item);
          saveState(); if (typeof renderGoals === 'function') renderGoals();
          return { ok: true, msg: `Restored the goal '${inv.item.text}', sir.` };
        }
        case 'restore_reminder': {
          if (!S.reminders[inv.tab]) S.reminders[inv.tab] = [];
          S.reminders[inv.tab].push(inv.item);
          saveState(); if (typeof renderReminders === 'function') renderReminders(inv.tab);
          return { ok: true, msg: `Restored the reminder '${inv.item.title}', sir.` };
        }
        case 'restore_wishlist': {
          S.wishlist.push(inv.item);
          saveState(); if (typeof renderWishlist === 'function') renderWishlist();
          return { ok: true, msg: `Restored the wishlist item '${inv.item.name}', sir.` };
        }
        case 'restore_transaction': {
          S.transactions.unshift(inv.item);
          if (inv.item.accountId) { const acc = (S.accounts || []).find(x => x.id === inv.item.accountId); if (acc) acc.balance += inv.item.type === 'income' ? inv.item.amount : -inv.item.amount; }
          if (typeof snapshotNW === 'function') snapshotNW();
          saveState(); if (typeof renderFinanzasTab === 'function') renderFinanzasTab();
          return { ok: true, msg: `Restored the transaction '${inv.item.name}', sir.` };
        }
        case 'restore_habit': {
          if (!S.habitTrackers[inv.section]) S.habitTrackers[inv.section] = [];
          S.habitTrackers[inv.section].push(inv.item);
          saveState(); if (typeof renderHabitsCard === 'function') renderHabitsCard(inv.section);
          return { ok: true, msg: `Restored the habit '${inv.item.name}', sir.` };
        }
        case 'restore_monthly_goal': {
          if (typeof _mgSection !== 'function') return { ok: false, msg: 'Monthly goals unavailable, sir.' };
          const m = _mgSection(inv.section);
          if (!m[inv.month]) m[inv.month] = [];
          m[inv.month].push(inv.item);
          saveState(); if (typeof renderQObjForTab === 'function') renderQObjForTab(inv.section);
          return { ok: true, msg: `Restored the monthly goal '${inv.item.text}', sir.` };
        }
        case 'restore_quarterly': {
          const p = _activePeriod();
          if (!p) return { ok: false, msg: 'No quarter set up yet, sir.' };
          p.objectives.push(inv.item);
          saveState(); if (typeof renderQuarterlyObjectives === 'function') renderQuarterlyObjectives();
          return { ok: true, msg: `Restored the quarterly objective '${inv.item.text}', sir.` };
        }
        case 'restore_memory': {
          if (!S.jarvisMemory) S.jarvisMemory = [];
          const idx = Math.min(inv.idx == null ? S.jarvisMemory.length : inv.idx, S.jarvisMemory.length);
          S.jarvisMemory.splice(idx, 0, inv.item);
          while (S.jarvisMemory.length > 40) S.jarvisMemory.shift();
          saveState();
          return { ok: true, msg: `Restored the memory '${inv.item.text}', sir.` };
        }
        case 'restore_project': {
          if (!window.Proyectos) return { ok: false, msg: 'Projects unavailable, sir.' };
          const arr = window.Proyectos.get(inv.tab);
          let placed = false;
          if (inv.parentId) { const parent = window.Proyectos.findById(inv.tab, inv.parentId); if (parent) { parent.children = parent.children || []; parent.children.push(inv.node); placed = true; } }
          if (!placed) arr.push(inv.node);
          window.Proyectos.save(inv.tab);
          return { ok: true, msg: `Restored the project '${inv.node.label}', sir.` };
        }
        case 'delete_created': {
          switch (inv.kind) {
            case 'daily_goal': S.goals[inv.date] = (S.goals[inv.date] || []).filter(x => x.id !== inv.id); saveState(); if (typeof renderGoals === 'function') renderGoals(); break;
            case 'quarterly': { const p = _activePeriod(); if (p) p.objectives = p.objectives.filter(x => x.id !== inv.id); saveState(); if (typeof renderQuarterlyObjectives === 'function') renderQuarterlyObjectives(); break; }
            case 'monthly_goal': { if (typeof _mgSection !== 'function') return { ok: false, msg: 'Monthly goals unavailable, sir.' }; const m = _mgSection(inv.section); if (m[inv.month]) m[inv.month] = m[inv.month].filter(x => x.id !== inv.id); saveState(); if (typeof renderQObjForTab === 'function') renderQObjForTab(inv.section); break; }
            case 'project': if (window.Proyectos) window.Proyectos.removeById(inv.tab, inv.id); break;
            case 'habit': S.habitTrackers[inv.section] = (S.habitTrackers[inv.section] || []).filter(h => h.id !== inv.id); saveState(); if (typeof renderHabitsCard === 'function') renderHabitsCard(inv.section); break;
            case 'transaction': { if (inv.accountId) { const acc = (S.accounts || []).find(x => x.id === inv.accountId); if (acc) acc.balance -= inv.txnType === 'income' ? inv.amount : -inv.amount; } S.transactions = (S.transactions || []).filter(x => x.id !== inv.id); if (typeof snapshotNW === 'function') snapshotNW(); saveState(); if (typeof renderFinanzasTab === 'function') renderFinanzasTab(); break; }
            case 'wishlist': S.wishlist = (S.wishlist || []).filter(x => x.id !== inv.id); saveState(); if (typeof renderWishlist === 'function') renderWishlist(); break;
            case 'reminder': S.reminders[inv.tab] = (S.reminders[inv.tab] || []).filter(x => x.id !== inv.id); saveState(); if (typeof renderReminders === 'function') renderReminders(inv.tab); break;
            case 'memory': S.jarvisMemory = (S.jarvisMemory || []).filter(x => x.id !== inv.id); saveState(); break;
            case 'capture': S.capturas = (S.capturas || []).filter(x => x.id !== inv.id); saveState(); break;
            default: return { ok: false, msg: "I couldn't undo that, sir." };
          }
          return { ok: true, msg: 'Removed what I created, sir.' };
        }
        case 'toggle_back': {
          switch (inv.kind) {
            case 'daily_goal': { const it = ((S.goals || {})[inv.date] || []).find(x => x.id === inv.id); if (!it) return { ok: false, msg: "I couldn't find that goal anymore, sir." }; it.done = inv.prevValue; saveState(); if (typeof renderGoals === 'function') renderGoals(); return { ok: true, msg: `Reverted the goal '${it.text}', sir.` }; }
            case 'quarterly': { const p = (S.quarterlyObjectives && S.quarterlyObjectives.periods || []).find(x => x.id === inv.periodId); const it = p && p.objectives.find(x => x.id === inv.id); if (!it) return { ok: false, msg: "I couldn't find that objective anymore, sir." }; it.done = inv.prevValue; saveState(); if (typeof renderQuarterlyObjectives === 'function') renderQuarterlyObjectives(); return { ok: true, msg: `Reverted the quarterly objective '${it.text}', sir.` }; }
            case 'monthly_goal': { if (typeof _mgSection !== 'function') return { ok: false, msg: 'Monthly goals unavailable, sir.' }; const m = _mgSection(inv.section); const it = ((m && m[inv.month]) || []).find(x => x.id === inv.id); if (!it) return { ok: false, msg: "I couldn't find that monthly goal anymore, sir." }; it.done = inv.prevValue; saveState(); if (typeof renderQObjForTab === 'function') renderQObjForTab(inv.section); return { ok: true, msg: `Reverted the monthly goal '${it.text}', sir.` }; }
            case 'task': { if (!window.Proyectos) return { ok: false, msg: 'Projects unavailable, sir.' }; const node = window.Proyectos.findById(inv.tab, inv.id); if (!node) return { ok: false, msg: "I couldn't find that task anymore, sir." }; node.done = inv.prevValue; window.Proyectos.save(inv.tab); return { ok: true, msg: `Reverted the task '${node.label}', sir.` }; }
            case 'habit_day': { const habit = (typeof _getHabits === 'function' ? _getHabits(inv.section) : []).find(h => h.id === inv.habitId); if (!habit) return { ok: false, msg: "I couldn't find that habit anymore, sir." }; habit.days = habit.days || {}; if (inv.prevValue == null) delete habit.days[inv.date]; else habit.days[inv.date] = inv.prevValue; saveState(); if (typeof renderHabitCal === 'function') renderHabitCal(inv.section); if (typeof renderHabitsCard === 'function') renderHabitsCard(inv.section); return { ok: true, msg: `Reverted the habit '${habit.name}', sir.` }; }
            case 'law_subject': { const y = (S.lawProgress && S.lawProgress.years || []).find(x => x.id === inv.yearId); const sub = y && y.subjects.find(x => x.id === inv.subId); if (!sub) return { ok: false, msg: "I couldn't find that subject anymore, sir." }; sub.done = inv.prevValue; saveState(); if (typeof renderLawProgress === 'function') renderLawProgress(); return { ok: true, msg: `Reverted the subject '${sub.name}', sir.` }; }
            default: return { ok: false, msg: "I couldn't undo that, sir." };
          }
        }
        default:
          return { ok: false, msg: "I couldn't undo that, sir." };
      }
    } catch (e) {
      console.error('[JARVIS_BRAIN] undo', e);
      return { ok: false, msg: "I couldn't undo that, sir." };
    }
  }

  /* ── Catálogo de acciones (para el prompt) ── */
  const ACTIONS_HELP = [
    'NOTA: toda acción delete_*  requiere confirm:true — pedí confirmación en lenguaje natural al usuario y esperá su sí antes de reintentar con confirm:true.',
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
    'delete_monthly_goal {search, section?}',
    'remember {text}  — guarda un hecho para recordar siempre (ej: "acordate que prefiero entrenar a la mañana"). Sincroniza entre dispositivos.',
    'forget {search}  — borra una memoria guardada, buscando por texto',
    'capture {text}  — guarda una idea/nota rápida para el inbox del segundo cerebro',
    'start_timer {minutes, label?}  — inicia un timer hablado (minutes puede ser fraccionario)',
    'cancel_timer {search?}  — cancela un timer por label, o el último si no se especifica',
    'start_pomodoro {}  — inicia el Pomodoro (fases fijas, sin duración custom)',
    'undo_last {}  — deshace la última acción reversible del log de auditoría',
    'close_day {}  — cierre del día: resume y ofrece pasar pendientes a mañana',
    'report_balance {}  — informa el saldo de las cuentas (respuesta con plantilla fija, no necesitás redactar el reply)',
    'report_goals_today {}  — informa cuántas metas de hoy están completadas (respuesta con plantilla fija, no necesitás redactar el reply)',
    'report_habits {}  — informa cuántos hábitos están marcados hoy (respuesta con plantilla fija, no necesitás redactar el reply)'
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
          const ng = { id: uid(), text: a.text || '', done: false, priority: a.priority || 'medium', time: null };
          S.goals[date].push(ng);
          saveState(); if (typeof renderGoals === 'function') renderGoals();
          _logAudit(a, action, `Agregó meta diaria: ${ng.text}`, { type: 'delete_created', kind: 'daily_goal', date, id: ng.id });
          return { ok: true };
        }
        case 'complete_daily_goal': {
          const td = _today(), tm = (typeof getTomorrow === 'function' ? getTomorrow() : td);
          let date = td, f = _find(S.goals[td] || [], a.search, 'text');
          if (!f) { f = _find(S.goals[tm] || [], a.search, 'text'); if (f) date = tm; }
          if (!f) return { ok: false, msg: "I couldn't find that goal, sir." };
          if (!f.item.done) {
            f.item.done = true; saveState(); if (typeof renderGoals === 'function') renderGoals();
            _logAudit(a, action, `Completó meta diaria: ${f.item.text}`, { type: 'toggle_back', kind: 'daily_goal', date, id: f.item.id, prevValue: false });
          }
          return { ok: true };
        }
        case 'delete_daily_goal': {
          const td = _today(), tm = (typeof getTomorrow === 'function' ? getTomorrow() : td);
          let date = td, f = _find(S.goals[td] || [], a.search, 'text');
          if (!f) { f = _find(S.goals[tm] || [], a.search, 'text'); if (f) date = tm; }
          if (!f) return { ok: false, msg: "I couldn't find that goal, sir." };
          if (!a.confirm) return { ok: false, confirm_required: true, summary: f.item.text, msg: `Shall I delete the goal '${f.item.text}', sir?` };
          const clone = _clone(f.item);
          S.goals[date].splice(f.idx, 1); saveState(); if (typeof renderGoals === 'function') renderGoals();
          _logAudit(a, action, `Borró meta diaria: ${clone.text}`, { type: 'restore_goal', date, item: clone });
          return { ok: true };
        }
        case 'toggle_quarterly': {
          const p = _activePeriod();
          if (!p) return { ok: false, msg: 'No quarter set up yet, sir.' };
          const f = _find(p.objectives, a.search, 'text');
          if (!f) return { ok: false, msg: "I couldn't find that quarterly objective, sir." };
          const prevValue = !!f.item.done;
          if (typeof toggleQObj === 'function') toggleQObj(p.id, f.item.id);
          else { f.item.done = !f.item.done; saveState(); if (typeof renderQuarterlyObjectives === 'function') renderQuarterlyObjectives(); }
          _logAudit(a, action, `Cambió objetivo trimestral: ${f.item.text} → ${f.item.done ? 'hecho' : 'pendiente'}`, { type: 'toggle_back', kind: 'quarterly', periodId: p.id, id: f.item.id, prevValue });
          return { ok: true, done: f.item.done };
        }
        case 'add_quarterly': {
          const p = _activePeriod();
          if (!p) return { ok: false, msg: 'No quarter set up yet, sir.' };
          const nid = p.objectives.length ? Math.max(...p.objectives.map(o => +o.id || 0)) + 1 : 1;
          const nq = { id: nid, text: a.text || '', done: false, category: a.category || null };
          p.objectives.push(nq);
          saveState(); if (typeof renderQuarterlyObjectives === 'function') renderQuarterlyObjectives();
          _logAudit(a, action, `Agregó objetivo trimestral: ${nq.text}`, { type: 'delete_created', kind: 'quarterly', periodId: p.id, id: nq.id });
          return { ok: true };
        }
        case 'delete_quarterly': {
          const p = _activePeriod();
          if (!p) return { ok: false, msg: 'No quarter set up yet, sir.' };
          const f = _find(p.objectives, a.search, 'text');
          if (!f) return { ok: false, msg: "I couldn't find that objective, sir." };
          if (!a.confirm) return { ok: false, confirm_required: true, summary: f.item.text, msg: `Shall I delete the quarterly objective '${f.item.text}', sir?` };
          const clone = _clone(f.item);
          if (typeof deleteQObj === 'function') deleteQObj(p.id, f.item.id);
          else { p.objectives.splice(f.idx, 1); saveState(); if (typeof renderQuarterlyObjectives === 'function') renderQuarterlyObjectives(); }
          _logAudit(a, action, `Borró objetivo trimestral: ${clone.text}`, { type: 'restore_quarterly', item: clone });
          return { ok: true };
        }
        case 'add_monthly_goal': {
          const mk = a.month || _today().slice(0, 7);
          let sec = _norm(a.section || a.tab || 'vida'); if (!TABS.includes(sec)) sec = 'vida';
          if (typeof _mgSection !== 'function') return { ok: false, msg: 'Monthly goals unavailable, sir.' };
          const m = _mgSection(sec);
          if (!m[mk]) m[mk] = [];
          const g = m[mk];
          const ng = { id: g.length ? Math.max(...g.map(x => +x.id || 0)) + 1 : 1, text: a.text || '', done: false };
          g.push(ng);
          saveState();
          if (typeof renderQObjForTab === 'function') renderQObjForTab(sec);
          if (window.JARVIS_INTEL) try { JARVIS_INTEL.renderCard(sec); } catch (e) {}
          _logAudit(a, action, `Agregó meta mensual: ${ng.text}`, { type: 'delete_created', kind: 'monthly_goal', section: sec, month: mk, id: ng.id });
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
              if (!f.item.done) {
                f.item.done = true; saveState(); if (typeof renderQObjForTab === 'function') renderQObjForTab(s); if (window.JARVIS_INTEL) try { JARVIS_INTEL.renderCard(s); } catch (e) {}
                _logAudit(a, action, `Completó meta mensual: ${f.item.text}`, { type: 'toggle_back', kind: 'monthly_goal', section: s, month: mk2, id: f.item.id, prevValue: false });
              }
              return { ok: true };
            }
          }
          return { ok: false, msg: "I couldn't find that monthly goal, sir." };
        }
        case 'add_project': {
          if (!window.PROY_VOICE) return { ok: false, msg: 'Projects unavailable, sir.' };
          let tab = _norm(a.tab); if (!TABS.includes(tab)) tab = 'vida';
          PROY_VOICE.addProject(tab, a.name || a.label || '');
          const arr = window.Proyectos ? window.Proyectos.get(tab) : [];
          const created = arr[arr.length - 1];
          if (created) _logAudit(a, action, `Agregó proyecto: ${created.label}`, { type: 'delete_created', kind: 'project', tab, id: created.id });
          return { ok: true };
        }
        case 'complete_task': {
          if (!window.PROY_VOICE) return { ok: false, msg: 'Projects unavailable, sir.' };
          const found = _findProjectNode(a.search || a.name || '', true);
          const r = PROY_VOICE.completeTask(a.search || a.name || '');
          if (!r) return { ok: false, msg: "I couldn't find that task, sir." };
          if (found) _logAudit(a, action, `Completó tarea: ${r}`, { type: 'toggle_back', kind: 'task', tab: found.tab, id: found.node.id, prevValue: false });
          return { ok: true };
        }
        case 'mark_habit': {
          if (!window.PROY_VOICE) return { ok: false, msg: 'Habits unavailable, sir.' };
          const status = a.status || 'done';
          const today = getActiveDate ? getActiveDate() : _today();
          const foundHabit = _findHabitByName(a.search || a.name || '');
          const prevValue = foundHabit ? (foundHabit.habit.days || {})[today] : undefined;
          const r = PROY_VOICE.markHabit(a.search || a.name || '', status);
          if (!r) return { ok: false, msg: "I couldn't find that habit, sir." };
          if (foundHabit) _logAudit(a, action, `Marcó hábito '${r}' como ${status}`, { type: 'toggle_back', kind: 'habit_day', section: foundHabit.sec, habitId: foundHabit.habit.id, date: today, prevValue: prevValue == null ? null : prevValue });
          return { ok: true };
        }
        case 'add_habit': {
          let sec = _norm(a.section); if (!TABS.includes(sec)) sec = 'vida';
          if (!S.habitTrackers[sec]) S.habitTrackers[sec] = [];
          const nh = { id: uid(), name: a.name || '', emoji: a.emoji || '📌', days: {} };
          S.habitTrackers[sec].push(nh);
          saveState();
          if (typeof renderHabitsCard === 'function') renderHabitsCard(sec);
          if (typeof renderHabitCal === 'function') renderHabitCal(sec);
          _logAudit(a, action, `Agregó hábito: ${nh.name}`, { type: 'delete_created', kind: 'habit', section: sec, id: nh.id });
          return { ok: true };
        }
        case 'add_transaction': {
          const amt = parseFloat(a.amount);
          if (isNaN(amt)) return { ok: false, msg: 'I need a valid amount, sir.' };
          let accId = null;
          if (a.account) { const af = _find(S.accounts || [], a.account, 'name'); if (af) accId = af.item.id; }
          if (!accId && S.accounts && S.accounts.length) accId = S.accounts[0].id;
          const cur = a.currency || (S.accounts && S.accounts[0] && S.accounts[0].currency) || 'ARS';
          const nt = { id: uid(), date: _today(), name: a.name || '', type: a.type === 'income' ? 'income' : 'expense', amount: amt, currency: cur, accountId: accId, category: a.category || '' };
          if (accId) { const acc = (S.accounts || []).find(x => x.id === accId); if (acc) { acc.balance += nt.type === 'income' ? amt : -amt; if (typeof snapshotNW === 'function') snapshotNW(); } }
          S.transactions.unshift(nt);
          saveState(); if (typeof renderFinanzasTab === 'function') renderFinanzasTab();
          _logAudit(a, action, `Agregó movimiento: ${nt.name}`, { type: 'delete_created', kind: 'transaction', id: nt.id, accountId: nt.accountId, txnType: nt.type, amount: nt.amount });
          return { ok: true };
        }
        case 'add_wishlist': {
          const nw = { id: uid(), name: a.name || '', amount: parseFloat(a.amount) || 0, currency: a.currency || 'ARS' };
          S.wishlist.push(nw);
          saveState(); if (typeof renderWishlist === 'function') renderWishlist();
          _logAudit(a, action, `Agregó objetivo de adquisición: ${nw.name}`, { type: 'delete_created', kind: 'wishlist', id: nw.id });
          return { ok: true };
        }
        case 'add_reminder': {
          let tab = _norm(a.tab); if (!TABS.includes(tab)) tab = 'vida';
          if (!S.reminders[tab]) S.reminders[tab] = [];
          const nr = { id: uid(), title: a.title || '', datetime: a.datetime || '', priority: a.priority || 'medium' };
          S.reminders[tab].push(nr);
          saveState(); if (typeof renderReminders === 'function') renderReminders(tab);
          _logAudit(a, action, `Agregó recordatorio: ${nr.title}`, { type: 'delete_created', kind: 'reminder', tab, id: nr.id });
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
          _logAudit(a, action, `Registró peso: ${v}${a.unit || 'kg'}`, null);
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
          _logAudit(a, action, `Registró sueño (${date})`, null);
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
          _logAudit(a, action, `Bienestar: ${key} = ${S.sleepLog[date].wellness[key]}`, null);
          return { ok: true };
        }
        case 'toggle_law_subject': {
          let found = null;
          (S.lawProgress && S.lawProgress.years || []).forEach(y => {
            if (found) return;
            const f = _find(y.subjects, a.search, 'name');
            if (f) found = { yearId: y.id, subId: f.item.id, item: f.item };
          });
          if (!found) return { ok: false, msg: "I couldn't find that subject, sir." };
          const prevValue = !!found.item.done;
          if (typeof toggleLawSubject === 'function') toggleLawSubject(found.yearId, found.subId);
          _logAudit(a, action, `Cambió materia: ${found.item.name} → ${found.item.done ? 'aprobada' : 'pendiente'}`, { type: 'toggle_back', kind: 'law_subject', yearId: found.yearId, subId: found.subId, prevValue });
          return { ok: true };
        }
        case 'delete_reminder': {
          for (const tab of TABS) {
            const f = _find((S.reminders && S.reminders[tab]) || [], a.search, 'title');
            if (f) {
              if (!a.confirm) return { ok: false, confirm_required: true, summary: f.item.title, msg: `Shall I delete the reminder '${f.item.title}', sir?` };
              const clone = _clone(f.item);
              if (typeof deleteReminder === 'function') deleteReminder(tab, f.item.id);
              else { S.reminders[tab].splice(f.idx, 1); saveState(); if (typeof renderReminders === 'function') renderReminders(tab); }
              _logAudit(a, action, `Borró recordatorio: ${clone.title}`, { type: 'restore_reminder', tab, item: clone });
              return { ok: true };
            }
          }
          return { ok: false, msg: "I couldn't find that reminder, sir." };
        }
        case 'delete_wishlist': {
          const f = _find(S.wishlist || [], a.search, 'name');
          if (!f) return { ok: false, msg: "I couldn't find that wishlist item, sir." };
          if (!a.confirm) return { ok: false, confirm_required: true, summary: f.item.name, msg: `Shall I delete the wishlist item '${f.item.name}', sir?` };
          const clone = _clone(f.item);
          S.wishlist.splice(f.idx, 1); saveState(); if (typeof renderWishlist === 'function') renderWishlist();
          _logAudit(a, action, `Borró objetivo de adquisición: ${clone.name}`, { type: 'restore_wishlist', item: clone });
          return { ok: true };
        }
        case 'delete_transaction': {
          const f = _find(S.transactions || [], a.search, 'name');
          if (!f) return { ok: false, msg: "I couldn't find that transaction, sir." };
          if (!a.confirm) return { ok: false, confirm_required: true, summary: f.item.name, msg: `Shall I delete the transaction '${f.item.name}', sir?` };
          const clone = _clone(f.item);
          const txn = f.item;
          if (txn.accountId) { const acc = (S.accounts || []).find(x => x.id === txn.accountId); if (acc) acc.balance -= txn.type === 'income' ? txn.amount : -txn.amount; }
          S.transactions = S.transactions.filter(x => x.id !== txn.id);
          if (typeof snapshotNW === 'function') snapshotNW();
          saveState(); if (typeof renderFinanzasTab === 'function') renderFinanzasTab();
          _logAudit(a, action, `Borró movimiento: ${clone.name}`, { type: 'restore_transaction', item: clone });
          return { ok: true };
        }
        case 'delete_habit': {
          for (const sec of TABS) {
            const f = _find((S.habitTrackers && S.habitTrackers[sec]) || [], a.search, 'name');
            if (f) {
              if (!a.confirm) return { ok: false, confirm_required: true, summary: f.item.name, msg: `Shall I delete the habit '${f.item.name}', sir?` };
              const clone = _clone(f.item);
              S.habitTrackers[sec] = S.habitTrackers[sec].filter(h => h.id !== f.item.id);
              if (typeof _habitActiveId !== 'undefined' && _habitActiveId[sec] === f.item.id) _habitActiveId[sec] = (S.habitTrackers[sec][0] || {}).id || null;
              saveState(); if (typeof renderHabitsCard === 'function') renderHabitsCard(sec);
              _logAudit(a, action, `Borró hábito: ${clone.name}`, { type: 'restore_habit', section: sec, item: clone });
              return { ok: true };
            }
          }
          return { ok: false, msg: "I couldn't find that habit, sir." };
        }
        case 'delete_project': {
          if (!window.PROY_VOICE || !PROY_VOICE.deleteProject) return { ok: false, msg: 'Projects unavailable, sir.' };
          const found = _findProjectNode(a.search || a.name || '');
          if (!found) return { ok: false, msg: "I couldn't find that project, sir." };
          if (!a.confirm) return { ok: false, confirm_required: true, summary: found.node.label, msg: `Shall I delete the project '${found.node.label}', sir?` };
          const clone = _clone(found.node);
          const r = PROY_VOICE.deleteProject(a.search || a.name || '');
          if (!r) return { ok: false, msg: "I couldn't find that project, sir." };
          _logAudit(a, action, `Borró proyecto: ${r}`, { type: 'restore_project', tab: found.tab, parentId: found.parentId, node: clone });
          return { ok: true };
        }
        case 'delete_monthly_goal': {
          if (typeof _mgSection !== 'function') return { ok: false, msg: 'Monthly goals unavailable, sir.' };
          const mk3 = a.month || _today().slice(0, 7);
          const sec1 = _norm(a.section || a.tab || '');
          const secs2 = TABS.includes(sec1) ? [sec1] : TABS;
          for (const s of secs2) {
            const m = _mgSection(s);
            const f = _find((m && m[mk3]) || [], a.search, 'text');
            if (f) {
              if (!a.confirm) return { ok: false, confirm_required: true, summary: f.item.text, msg: `Shall I delete the monthly goal '${f.item.text}', sir?` };
              const clone = _clone(f.item);
              m[mk3].splice(f.idx, 1); saveState(); if (typeof renderQObjForTab === 'function') renderQObjForTab(s); if (window.JARVIS_INTEL) try { JARVIS_INTEL.renderCard(s); } catch (e) {}
              _logAudit(a, action, `Borró meta mensual: ${clone.text}`, { type: 'restore_monthly_goal', section: s, month: mk3, item: clone });
              return { ok: true };
            }
          }
          return { ok: false, msg: "I couldn't find that monthly goal, sir." };
        }
        case 'remember': {
          const text = (a.text || '').toString().trim();
          if (!text) return { ok: false, msg: 'What should I remember, sir?' };
          if (!S.jarvisMemory) S.jarvisMemory = [];
          const nm = { id: uid(), text, fecha: _today() };
          S.jarvisMemory.push(nm);
          while (S.jarvisMemory.length > 40) S.jarvisMemory.shift();
          saveState();
          _logAudit(a, action, `Guardó memoria: ${nm.text}`, { type: 'delete_created', kind: 'memory', id: nm.id });
          return { ok: true };
        }
        case 'forget': {
          if (!S.jarvisMemory) S.jarvisMemory = [];
          const f = _find(S.jarvisMemory, a.search, 'text');
          if (!f) return { ok: false, msg: "I couldn't find that memory, sir." };
          const clone = _clone(f.item);
          S.jarvisMemory.splice(f.idx, 1);
          saveState();
          _logAudit(a, action, `Olvidó memoria: ${clone.text}`, { type: 'restore_memory', item: clone, idx: f.idx });
          return { ok: true };
        }
        case 'capture': {
          const text = (a.text || '').toString().trim();
          if (!text) return { ok: false, msg: 'What should I capture, sir?' };
          if (!S.capturas) S.capturas = [];
          const nc = { id: uid(), text, fecha: _today() };
          S.capturas.push(nc);
          while (S.capturas.length > 100) S.capturas.shift();
          saveState();
          _logAudit(a, action, `Capturó idea: ${nc.text}`, { type: 'delete_created', kind: 'capture', id: nc.id });
          return { ok: true, msg: 'Captured, sir.' };
        }
        case 'start_timer': {
          const minutes = parseFloat(a.minutes);
          if (isNaN(minutes) || minutes <= 0) return { ok: false, msg: 'I need a valid number of minutes, sir.' };
          const label = (a.label || '').toString().trim() || 'Timer';
          const id = uid();
          const endsAt = Date.now() + minutes * 60000;
          const timer = { id, label, endsAt, handle: null };
          timer.handle = setTimeout(() => {
            const idx = _timers.findIndex(t => t.id === id);
            if (idx !== -1) _timers.splice(idx, 1);
            if (typeof showToast === 'function') showToast('⏰ ' + label + ' terminado', 10000);
            if (window.JARVIS && JARVIS.speak) JARVIS.speak('Sir, your ' + label + ' timer is up.', { dynamic: true });
          }, minutes * 60000);
          _timers.push(timer);
          return { ok: true, msg: `Timer set for ${minutes} minutes, sir.` };
        }
        case 'cancel_timer': {
          if (!_timers.length) return { ok: false, msg: 'No timers running, sir.' };
          let idx = -1;
          if (a.search) {
            const f = _find(_timers, a.search, 'label');
            if (f) idx = f.idx;
          } else {
            idx = _timers.length - 1;
          }
          if (idx === -1) return { ok: false, msg: "I couldn't find that timer, sir." };
          const t = _timers[idx];
          clearTimeout(t.handle);
          _timers.splice(idx, 1);
          return { ok: true, msg: `Cancelled the '${t.label}' timer, sir.` };
        }
        case 'start_pomodoro': {
          if (!window.Pomodoro) return { ok: false, msg: 'Pomodoro unavailable, sir.' };
          window.Pomodoro.start();
          return { ok: true };
        }
        case 'undo_last': {
          const log = auditLog();
          let idx = -1;
          for (let i = log.length - 1; i >= 0; i--) { if (log[i] && log[i].inverse && !log[i].undone) { idx = i; break; } }
          if (idx === -1) return { ok: false, msg: 'Nothing to undo, sir.' };
          const entry = log[idx];
          const r = _applyInverse(entry.inverse);
          if (!r.ok) return { ok: false, msg: r.msg || "I couldn't undo that, sir." };
          entry.undone = true;
          _auditSave(log);
          return { ok: true, msg: r.msg || 'Undone, sir.' };
        }
        case 'close_day': {
          const today = _today();
          const tomorrow = (typeof getTomorrow === 'function') ? getTomorrow() : _addDays(today, 1);
          const dg = (S.goals && S.goals[today]) || [];
          const doneCount = dg.filter(g => g.done).length;
          const totalCount = dg.length;
          const pending = dg.filter(g => !g.done);
          const unmarkedHabits = [];
          TABS.forEach(sec => {
            ((S.habitTrackers && S.habitTrackers[sec]) || []).forEach(h => {
              if (!(h.days || {})[today]) unmarkedHabits.push(h.name);
            });
          });
          const bits = [`Goals today: ${doneCount}/${totalCount} done.`];
          if (unmarkedHabits.length) bits.push(`Unmarked habits: ${unmarkedHabits.slice(0, 5).join(', ')}.`);
          const summaryMsg = bits.join(' ');
          const N = pending.length;
          if (N > 0) {
            if (!a.confirm) return { ok: false, confirm_required: true, summary: 'move ' + N + ' goals', msg: `${summaryMsg} Shall I move the ${N} pending goals to tomorrow, sir?` };
            if (!S.goals[tomorrow]) S.goals[tomorrow] = [];
            const movedIds = [];
            pending.forEach(g => { S.goals[tomorrow].push(g); movedIds.push(g.id); });
            S.goals[today] = dg.filter(g => g.done);
            saveState(); if (typeof renderGoals === 'function') renderGoals();
            _logAudit(a, action, `Cierre del día: movió ${N} metas a mañana`, { type: 'move_goals_back', fromDate: today, toDate: tomorrow, ids: movedIds });
            return { ok: true, msg: `${summaryMsg} Moved ${N} goals to tomorrow. Good night, sir.` };
          }
          return { ok: true, msg: `${summaryMsg} Nothing pending. Good night, sir.` };
        }
        case 'report_balance': {
          const accs = S.accounts || [];
          if (!accs.length) return { ok: false, msg: 'You have no accounts set up, sir.' };
          const intros = ['You currently have:', "Here's where things stand, sir:", 'Your account balances, sir:'];
          let segments = [{ d: false, t: intros[Math.floor(Math.random() * intros.length)] + ' ' }];
          let totalARS = 0;
          accs.forEach(acc => {
            const amount = Math.round(acc.balance || 0).toLocaleString('en-US');
            segments = segments.concat(_buildSegments('{{name}}: {{amount}} {{currency}}. ', { name: acc.name, amount, currency: acc.currency }));
            if (acc.currency === 'ARS') totalARS += (+acc.balance || 0);
          });
          const closers = ['Total: {{total}} ARS, sir.', 'That brings the total to {{total}} ARS, sir.'];
          const closer = closers[Math.floor(Math.random() * closers.length)];
          segments = segments.concat(_buildSegments(closer, { total: Math.round(totalARS).toLocaleString('en-US') }));
          return { ok: true, segments };
        }
        case 'report_goals_today': {
          const dg = (S.goals && S.goals[_today()]) || [];
          const total = dg.length, done = dg.filter(g => g.done).length;
          const variants = [
            "You've completed {{done}} of {{total}} goals today, sir.",
            '{{done}} out of {{total}} tasks are done today, sir.',
            "Today's board shows {{done}} of {{total}} completed, sir."
          ];
          return { ok: true, segments: _buildSegments(variants[Math.floor(Math.random() * variants.length)], { done, total }) };
        }
        case 'report_habits': {
          const today = _today();
          let total = 0, done = 0;
          TABS.forEach(sec => {
            _getHabits(sec).forEach(h => { total++; if ((h.days || {})[today] === 'done') done++; });
          });
          const variants = [
            '{{done}} of {{total}} habits checked off today, sir.',
            "You're at {{done}} out of {{total}} habits today, sir.",
            "Today's habit count: {{done}} of {{total}}, sir."
          ];
          return { ok: true, segments: _buildSegments(variants[Math.floor(Math.random() * variants.length)], { done, total }) };
        }
        default:
          return { ok: false, msg: 'Unknown action, sir.' };
      }
    } catch (e) {
      console.error('[JARVIS_BRAIN] ' + action, e);
      return { ok: false, msg: 'That action failed, sir.', error: String(e && e.message || e) };
    }
  }

  /* ── Motor de consulta de datos: filtros por rango/texto sobre el estado ── */
  function query(params) {
    params = params || {};
    const area = params.area;
    const from = params.from || null;
    const to = params.to || null;
    const q = params.q || '';
    const limit = params.limit || 50;
    const st = (typeof S !== 'undefined' && S) ? S : {};
    const _inRange = d => { if (!d) return false; if (from && d < from) return false; if (to && d > to) return false; return true; };
    try {
      switch (area) {
        case 'transactions': {
          let total_income = 0, total_expense = 0;
          const items = [];
          (st.transactions || []).forEach(t => {
            if (!_inRange(t.date)) return;
            if (!_qMatch(t.name, q)) return;
            if (t.type === 'income') total_income += (+t.amount || 0); else total_expense += (+t.amount || 0);
            items.push({ date: t.date, name: t.name, type: t.type, amount: t.amount });
          });
          return { total_income, total_expense, count: items.length, items: items.slice(0, limit) };
        }
        case 'goals': {
          const days = [];
          const gobj = st.goals || {};
          Object.keys(gobj).sort().forEach(date => {
            if (!_inRange(date)) return;
            const arr = gobj[date] || [];
            days.push({ date, done: arr.filter(g => g.done).length, total: arr.length, items: arr.map(g => ({ text: g.text, done: !!g.done })) });
          });
          return { days: days.slice(0, limit) };
        }
        case 'habits': {
          const habits = [];
          TABS.forEach(sec => {
            ((st.habitTrackers && st.habitTrackers[sec]) || []).forEach(h => {
              if (!_qMatch(h.name, q)) return;
              const days = {};
              Object.keys(h.days || {}).forEach(d => { if (_inRange(d)) days[d] = h.days[d]; });
              habits.push({ name: h.name, section: sec, days });
            });
          });
          return { habits: habits.slice(0, limit) };
        }
        case 'weight': {
          const items = (st.bodyWeight || []).filter(e => _inRange(e.date)).map(e => ({ date: e.date, value: e.value, unit: e.unit }));
          return { items: items.slice(0, limit) };
        }
        case 'reminders': {
          const items = [];
          TABS.forEach(tab => {
            ((st.reminders && st.reminders[tab]) || []).forEach(r => {
              if (!_qMatch(r.title, q)) return;
              items.push({ tab, title: r.title, datetime: r.datetime, priority: r.priority, done: !!r.done });
            });
          });
          return { items: items.slice(0, limit) };
        }
        case 'audit': {
          const log = auditLog();
          const items = log.slice(-limit).reverse().map(e => {
            let ts; try { ts = new Date(e.ts).toLocaleString('es-AR'); } catch (err) { ts = String(e.ts); }
            return { ts, source: e.source, action: e.action, desc: e.desc, undone: !!e.undone };
          });
          return { items };
        }
        case 'memory': {
          return { items: st.jarvisMemory || [] };
        }
        case 'cartera': {
          if (!_cartera) return { mes: null, generado: null, items: [] };
          return { mes: _cartera.mes, generado: _cartera.generado, items: _cartera.cedears || [] };
        }
        case 'capturas': {
          return { items: st.capturas || [] };
        }
        default:
          return { error: 'unknown area' };
      }
    } catch (e) {
      console.error('[JARVIS_BRAIN] query', e);
      return { items: [] };
    }
  }

  window.JARVIS_BRAIN = { snapshot, execute, ACTIONS_HELP, audit, auditLog, query };
})();
