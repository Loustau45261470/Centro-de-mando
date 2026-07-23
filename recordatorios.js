// ════════════════════════════════════════════════════════
// REMINDERS
// ════════════════════════════════════════════════════════
function remCountdown(datetimeStr) {
  const diff = new Date(datetimeStr) - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) return null;
  if (h > 0)  return `en ${h}h ${m}m`;
  if (m > 0)  return `en ${m}m`;
  return '¡Ahora!';
}

function remFormatDate(datetimeStr) {
  const d = new Date(datetimeStr);
  return d.toLocaleString('es-AR', { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

const REM_CFG = {
  critical: { label:'Crítico',    dot:'#ff3c3c',            icon:'🔴' },
  high:     { label:'Alto',       dot:'#FF8C3C',            icon:'🟠' },
  medium:   { label:'Medio',      dot:'var(--warn)',         icon:'🟡' },
  low:      { label:'Bajo',       dot:'var(--ok)',           icon:'🟢' },
  someday:  { label:'Algún día',  dot:'var(--accent)',       icon:'🔵' },
};
const REM_ORDER = { critical:0, high:1, medium:2, low:3, someday:4 };

// ── Nodos de Proyectos con fecha límite, como ítems virtuales de recordatorio (todas las secciones) ──
function remProyItems(tab) {
  const now = Date.now();
  let proyImminent = [], proyUpcoming = [], proyPast = [];
  if (window.Proyectos && typeof window.Proyectos.get === 'function') {
    const proyItems = [];
    const walkProy = nodes => (nodes || []).forEach(n => {
      if (n && n.dueDate && !n.done) {
        proyItems.push({ _isProject: true, _tab: tab, _nodeId: n.id, _icon: n.icon || '📁',
          id: 'proy_' + n.id, title: n.label || '(sin título)',
          datetime: n.dueDate + 'T23:59:59',
          priority: n.priority === '1' ? 'high' : n.priority === '3' ? 'low' : 'medium' });
      }
      if (n && n.children) walkProy(n.children);
    });
    try { walkProy(window.Proyectos.get(tab)); } catch (e) {}
    proyPast     = proyItems.filter(p => new Date(p.datetime) - now <= 0).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
    proyImminent = proyItems.filter(p => { const d = new Date(p.datetime) - now; return d > 0 && d < 86400000; }).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    proyUpcoming = proyItems.filter(p => new Date(p.datetime) - now >= 86400000).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  }
  return { proyImminent, proyUpcoming, proyPast };
}

function renderReminders(tab) {
  const wrap = document.getElementById('reminders-wrap-' + tab);
  if (!wrap) return;
  if (!S.reminders) S.reminders = {};
  const all = S.reminders[tab] || [];
  const now = Date.now();

  const PENCIL = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const TRASH  = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`;

  // ── Inject timed goals as virtual urgent items (vida only) ──
  let goalUrgent = [];
  if (tab === 'vida') {
    const today    = getActiveDate();
    const tomorrow = getTomorrow();

    const pushGoals = (date, isTomorrow) => {
      (S.goals[date] || []).forEach(g => {
        if (!g.time || g.done) return;
        const remPrio = g.priority === 'high' ? 'high' : g.priority === 'mid' ? 'medium' : 'low';
        goalUrgent.push({ _isGoal: true, _isTomorrow: isTomorrow,
          _date: date, _id: g.id, id: 'goal_' + g.id,
          title: g.text, datetime: date + 'T' + g.time, priority: remPrio });
      });
    };
    pushGoals(today,    false);
    pushGoals(tomorrow, true);
    goalUrgent.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  }

  // ── Inyecta nodos de Proyectos con fecha límite como ítems virtuales (todas las secciones) ──
  const { proyImminent, proyUpcoming, proyPast } = remProyItems(tab);

  // Categorize regular reminders
  const imminent = all.filter(r => r.datetime && (new Date(r.datetime) - now) > 0 && (new Date(r.datetime) - now) < 86400000);
  const critical = all.filter(r => !r.datetime && r.priority === 'critical');
  const upcoming = all.filter(r => r.datetime && (new Date(r.datetime) - now) >= 86400000).sort((a,b)=>new Date(a.datetime)-new Date(b.datetime));
  const noDate   = all.filter(r => !r.datetime && r.priority !== 'critical').sort((a,b)=>(REM_ORDER[a.priority]||2)-(REM_ORDER[b.priority]||2));
  const past     = all.filter(r => r.datetime && (new Date(r.datetime) - now) <= 0).sort((a,b)=>new Date(b.datetime)-new Date(a.datetime));

  const actionsHTML = (r) => `
    <div style="display:flex;gap:2px;flex-shrink:0">
      <button class="icon-btn" onclick="openEditReminder('${tab}','${r.id}')">${PENCIL}</button>
      <button class="icon-btn" onclick="deleteReminder('${tab}','${r.id}')">${TRASH}</button>
    </div>`;

  // Urgent block (critical no-date + imminent dated + timed goals)
  const urgentAll = [...critical, ...goalUrgent, ...proyPast, ...proyImminent, ...imminent.sort((a,b)=>new Date(a.datetime)-new Date(b.datetime))];
  const urgentHTML = urgentAll.length ? `
    <div class="rem-urgent-section">
      <div class="rem-urgent-label">⚠ Atención inmediata</div>
      ${urgentAll.map(r => {
        if (r._isProject) {
          const isPast = new Date(r.datetime) - now <= 0;
          const cd = remCountdown(r.datetime);
          const txt = isPast ? '¡Atrasada!' : (cd || 'Vence hoy');
          const style = isPast ? 'color:#FF6B6B;text-shadow:0 0 10px rgba(255,107,107,.7)' : '';
          const dstr = new Date(r.datetime).toLocaleDateString('es-AR', { weekday:'short', day:'numeric', month:'short' });
          return `<div class="rem-urgent-item priority-${r.priority}">
            <div class="rem-urgent-row">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
                  <span style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:2px 7px;border-radius:5px;background:rgba(255,255,255,.09);color:var(--ts)">${r._icon} Proyecto</span>
                  <span style="font-size:10px;color:var(--tt);font-family:var(--mono)">${dstr}</span>
                </div>
                <div class="rem-urgent-title">${escHtml(r.title)}</div>
                <div class="rem-urgent-countdown" style="${style}">${txt}</div>
              </div>
              <button class="btn btn-ghost btn-sm" style="flex-shrink:0;font-size:12px" onclick="Proyectos.setDone('${r._tab}','${r._nodeId}',true)">✓ Completar</button>
            </div>
          </div>`;
        }
        if (r._isGoal) {
          const cd = remCountdown(r.datetime);
          const isPast = new Date(r.datetime) - now <= 0;
          const countdownTxt = cd ? cd : isPast ? '¡Atrasada!' : '¡Ahora!';
          const countdownStyle = isPast ? 'color:#FF6B6B;text-shadow:0 0 10px rgba(255,107,107,.7)' : '';
          return `<div class="rem-urgent-item priority-${r.priority}">
            <div class="rem-urgent-row">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
                  <span style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:2px 7px;border-radius:5px;background:rgba(255,255,255,.09);color:var(--ts)">${r._isTomorrow ? '🗓 Mañana' : '🎯 Meta'}</span>
                  <span style="font-size:10px;color:var(--tt);font-family:var(--mono)">${fmtGoalTime(r.datetime.split('T')[1])}</span>
                </div>
                <div class="rem-urgent-title">${escHtml(r.title)}</div>
                <div class="rem-urgent-countdown" style="${countdownStyle}">${countdownTxt}</div>
              </div>
              <button class="btn btn-ghost btn-sm" style="flex-shrink:0;font-size:12px" onclick="toggleGoalById('${r._date}','${r._id}')">✓ Completar</button>
            </div>
          </div>`;
        }
        const hasDate = !!r.datetime;
        return `<div class="rem-urgent-item priority-${r.priority}">
          <div class="rem-urgent-row">
            <div>
              <div class="rem-urgent-title">${r.title}</div>
              ${hasDate ? `<div class="rem-urgent-countdown">${remCountdown(r.datetime)}</div>
              <div class="rem-urgent-when">${remFormatDate(r.datetime)}</div>` : `<div class="rem-urgent-countdown">Sin fecha — hacer ahora</div>`}
            </div>
            ${actionsHTML(r)}
          </div>
        </div>`;
      }).join('')}
    </div>` : '';

  const remItemHTML = r => {
    if (r._isProject) {
      const cfgP = REM_CFG[r.priority] || REM_CFG.medium;
      const dstr = new Date(r.datetime).toLocaleDateString('es-AR', { weekday:'short', day:'numeric', month:'short' });
      return `<div class="rem-item" style="cursor:pointer" onclick="Proyectos.openDetail('${r._tab}','${r._nodeId}')">
        <div class="rem-priority-dot" style="background:${cfgP.dot}"></div>
        <div class="rem-info">
          <div class="rem-title">${escHtml(r.title)}</div>
          <div class="rem-meta">${r._icon} Proyecto · ${dstr}</div>
        </div>
        <span class="rem-badge rem-badge-${r.priority}">${cfgP.label}</span>
        <div class="rem-actions">
          <button class="icon-btn" title="Completar" onclick="event.stopPropagation();Proyectos.setDone('${r._tab}','${r._nodeId}',true)">✓</button>
        </div>
      </div>`;
    }
    const cfg = REM_CFG[r.priority] || REM_CFG.medium;
    const isPast = r.datetime && (new Date(r.datetime) - now) <= 0;
    const dateStr = r.datetime ? remFormatDate(r.datetime) : 'Sin fecha';
    return `<div class="rem-item${isPast ? ' rem-past' : ''}">
      <div class="rem-priority-dot" style="background:${cfg.dot}"></div>
      <div class="rem-info">
        <div class="rem-title">${r.title}</div>
        <div class="rem-meta">${dateStr}</div>
      </div>
      <span class="rem-badge rem-badge-${r.priority}">${cfg.label}</span>
      <div class="rem-actions">
        <button class="icon-btn" onclick="openEditReminder('${tab}','${r.id}')">${PENCIL}</button>
        <button class="icon-btn" onclick="deleteReminder('${tab}','${r.id}')">${TRASH}</button>
      </div>
    </div>`;
  };

  const upcomingMerged = [...upcoming, ...proyUpcoming].sort((a,b)=>new Date(a.datetime)-new Date(b.datetime));
  const upcomingHTML = upcomingMerged.length ? upcomingMerged.map(remItemHTML).join('') : '';
  const noDateHTML   = noDate.length
    ? `<div class="rem-nodate-section">📌 Sin fecha asignada</div>${noDate.map(remItemHTML).join('')}`
    : '';
  const pastHTML = past.length
    ? `<div class="rem-nodate-section" style="margin-top:14px">✓ Pasados</div>${past.map(remItemHTML).join('')}`
    : '';

  const isEmpty = all.length === 0 && proyImminent.length === 0 && proyUpcoming.length === 0 && proyPast.length === 0;

  wrap.innerHTML = `<div class="card">
    <div class="card-title">
      🔔 Recordatorios
      <div style="display:flex;gap:6px;align-items:center">
        ${_notifBtnHTML()}
        <button class="btn btn-ghost btn-sm" onclick="openAddReminder('${tab}')">+ Recordatorio</button>
      </div>
    </div>
    ${isEmpty ? '<div class="empty-state">Sin recordatorios</div>' : urgentHTML + upcomingHTML + noDateHTML + pastHTML}
  </div>`;
  renderRemindersNotif(tab);
}

// Notificación de recordatorios en la sección (solo lectura). La creación vive en el overlay.
function renderRemindersNotif(tab) {
  const body = document.getElementById('reminders-notif-' + tab); if (!body) return;
  if (!S.reminders) S.reminders = {};
  const now = Date.now();
  const { proyImminent, proyUpcoming, proyPast } = remProyItems(tab);
  const dated = [...(S.reminders[tab] || []), ...proyImminent, ...proyUpcoming, ...proyPast]
    .filter(r => r.datetime)
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime)).slice(0, 5);
  if (!dated.length) {
    body.innerHTML = '<div class="rnotif-empty">Sin recordatorios próximos. Abrí <b>Recordatorios</b> desde el FAB para crear uno.</div>';
    return;
  }
  body.innerHTML = dated.map(r => {
    const diff = new Date(r.datetime) - now;
    const overdue  = diff <= 0;
    const imminent = !overdue && diff < 86400000;
    const cd = overdue ? 'Vencido' : ((typeof remCountdown === 'function') ? remCountdown(r.datetime) : '');
    const d = new Date(r.datetime);
    const when = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + d.toTimeString().slice(0, 5);
    const prioCfg = REM_CFG[r.priority] || REM_CFG.medium;
    const dotStyle = (overdue || imminent) ? '' : ` style="background:${prioCfg.dot};box-shadow:0 0 8px ${prioCfg.dot}"`;
    return `<div class="rnotif-item${overdue ? ' overdue' : imminent ? ' imminent' : ''}" title="${prioCfg.label}">
      <span class="rnotif-dot"${dotStyle}></span>
      <div class="rnotif-body"><div class="rnotif-title">${escHtml(r.title)}</div><div class="rnotif-when">${when}</div></div>
      ${cd ? `<span class="rnotif-cd">${cd}</span>` : ''}
    </div>`;
  }).join('');
}

function openAddReminder(tab) {
  document.getElementById('remModalTitle').textContent = 'Nuevo Recordatorio';
  document.getElementById('remTab').value      = tab;
  document.getElementById('remId').value       = '';
  document.getElementById('remTitle').value    = '';
  document.getElementById('remDatetime').value = '';
  document.getElementById('remPriority').value = 'medium';
  openModal('modal-reminder');
}

function openEditReminder(tab, id) {
  if (!S.reminders?.[tab]) return;
  const r = S.reminders[tab].find(r => r.id === id);
  if (!r) return;
  document.getElementById('remModalTitle').textContent = 'Editar Recordatorio';
  document.getElementById('remTab').value      = tab;
  document.getElementById('remId').value       = id;
  document.getElementById('remTitle').value    = r.title;
  document.getElementById('remDatetime').value = r.datetime ? r.datetime.slice(0, 16) : '';
  document.getElementById('remPriority').value = r.priority || 'medium';
  openModal('modal-reminder');
}

function saveReminder() {
  const tab      = document.getElementById('remTab').value;
  const id       = document.getElementById('remId').value;
  const title    = document.getElementById('remTitle').value.trim();
  const datetime = document.getElementById('remDatetime').value || '';
  const priority = document.getElementById('remPriority').value;
  if (!title) { showToast('Escribe el título'); return; }
  if (!S.reminders)      S.reminders = {};
  if (!S.reminders[tab]) S.reminders[tab] = [];
  if (id) {
    const r = S.reminders[tab].find(r => r.id === id);
    if (r) Object.assign(r, { title, datetime, priority });
  } else {
    S.reminders[tab].push({ id: uid(), title, datetime, priority });
  }
  saveState(); renderReminders(tab); closeModal('modal-reminder');
}

function deleteReminder(tab, id) {
  if (!S.reminders?.[tab]) return;
  S.reminders[tab] = S.reminders[tab].filter(r => r.id !== id);
  saveState(); renderReminders(tab);
}

// ── Reminder Notifications ──
const _notifiedSet = new Set();

function initNotifications() {
  if (!('Notification' in window)) { showToast('Este navegador no soporta notificaciones'); return; }
  if (Notification.permission === 'denied') { showToast('🔕 Notificaciones bloqueadas — habilítalas en Ajustes del navegador'); return; }
  if (Notification.permission === 'granted') {
    showToast('🔔 Notificaciones ya activas');
    _getOrCreateVapidKeys().then(k => k && _subscribePush(k.pubKey));
    return;
  }
  Notification.requestPermission().then(async perm => {
    ['vida','finanzas','salud','conocimiento','ia'].forEach(renderReminders);
    if (perm === 'granted') {
      showToast('🔔 Notificaciones activadas');
      const keys = await _getOrCreateVapidKeys();
      if (keys) await _subscribePush(keys.pubKey);
    } else {
      showToast('Notificaciones no habilitadas');
    }
  });
}

function _showNotif(title, opts) {
  if (_swReg) {
    _swReg.showNotification(title, opts).catch(() => {
      // Fallback: SW showNotification falló (ej. iOS foreground), usar API directa
      try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); n.close(); }; } catch(e) {}
    });
    return;
  }
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); n.close(); }; } catch(e) {}
}

function checkReminderNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const toMinStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const currentDT  = toMinStr(now);
  const in24hDT    = toMinStr(new Date(now.getTime() + 86400000));
  const PRIO_EMOJI = { critical:'⚡', high:'🔴', medium:'🟡', low:'🟢' };
  ['vida','finanzas','salud','conocimiento','ia'].forEach(tab => {
    (S.reminders?.[tab] || []).forEach(r => {
      if (!r.datetime) return;
      const remDT = r.datetime.slice(0, 16);
      // 24 h de anticipación
      if (remDT === in24hDT && !_notifiedSet.has(r.id + '_1d')) {
        _notifiedSet.add(r.id + '_1d');
        _showNotif('📅 Vence mañana — Centro de Mando', {
          body: `${PRIO_EMOJI[r.priority] || '🔵'} ${r.title}`,
          tag: r.id + '_1d',
          requireInteraction: true,
          icon: './icon.svg',
        });
      }
      // Al momento exacto
      if (remDT === currentDT && !_notifiedSet.has(r.id)) {
        _notifiedSet.add(r.id);
        _showNotif('🔔 Recordatorio — Centro de Mando', {
          body: `${PRIO_EMOJI[r.priority] || '🔵'} ${r.title}`,
          tag: r.id,
          requireInteraction: false,
          icon: './icon.svg',
        });
      }
    });
  });
}

function _notifBtnHTML() {
  if (!('Notification' in window)) return '';
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  if (Notification.permission === 'granted') {
    const iosHint = isIOS && !isStandalone
      ? `<button class="btn btn-ghost btn-sm" style="font-size:10px;opacity:.6" onclick="showToast('En iPhone: abre desde el ícono de la pantalla de inicio para recibir push cuando la app está cerrada')">📱 Instalar</button>`
      : '';
    return `<span style="font-size:11px;opacity:.5;cursor:default" title="Notificaciones activas">🔔</span>${iosHint}`;
  }
  if (Notification.permission === 'denied') return '<span style="font-size:11px;opacity:.5;cursor:default" title="Notificaciones bloqueadas en el navegador">🔕</span>';
  if (isIOS && !isStandalone) return `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="showToast('En iPhone: toca Compartir → Agregar a pantalla de inicio, luego abre la app instalada y activa notificaciones')">Instalar en iPhone 📱</button>`;
  return `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="initNotifications()">Activar 🔔</button>`;
}
