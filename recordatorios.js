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

// Acento del chip de tipo. Sale de los tokens del tema — nada de hex sueltos salvo
// el rojo de finales, que es el mismo de --danger pero necesita ser literal acá.
const REM_KIND_ACCENT = {
  final:       'var(--danger)',
  cursada:     'var(--c-conocimiento)',
  proy:        'var(--hud)',
  meta:        'var(--c-vida)',
  actividad:   'var(--indigo)',
  rec:         'var(--hud-bright)',
  proyeccion:  'var(--c-finanzas)',
  suscripcion: 'var(--c-finanzas)',
  pedido:      'var(--c-finanzas)',
};
// Chip de tipo (Final / TP / Proyecto / Meta / …). Los TPs pisan el acento de
// cursada con el ámbar de alerta: entregan, no son solo agenda.
function remKindChip(r) {
  const accent = r.kindLabel === 'TP' ? 'var(--warn)' : (REM_KIND_ACCENT[r.kind] || 'var(--hud)');
  return `<span class="cm-kind" style="--k:${accent}"><span class="cm-kind-ico" aria-hidden="true">${r.icon || '🔔'}</span>${escHtml(r.kindLabel || 'Recordatorio')}</span>`;
}

// ── Todo lo que vence fuera de S.reminders (proyectos, finales, cursada, metas,
//    actividades del planner, proyecciones, suscripciones, pedidos) entra acá como
//    ítem virtual de recordatorio. Fuente única: CMDeadlines (deadlines.js).
function remVirtualItems(tab) {
  const now = Date.now();
  if (typeof CMDeadlines === 'undefined') return { virtImminent: [], virtUpcoming: [], virtPast: [] };
  const hoy = new Date(now).toDateString();
  // Las actividades del planner solo cuentan acá si son de HOY y todavía no pasaron:
  // las cumplidas no son deuda y las recurrentes de mañana/pasado llenarían la lista.
  const vale = d => d.kind !== 'actividad' || (d.at > now && new Date(d.at).toDateString() === hoy);
  const items = CMDeadlines.collect(S, { now, pastDays: 7 })
    .filter(d => d.kind !== 'rec' && d.tab === tab && vale(d))
    .map(d => Object.assign({ _virtual: true }, d));
  return {
    virtPast:     items.filter(d => d.at - now <= 0).sort((a, b) => b.at - a.at),
    virtImminent: items.filter(d => d.at - now > 0 && d.at - now < 86400000),
    virtUpcoming: items.filter(d => d.at - now >= 86400000),
  };
}

function renderReminders(tab) {
  const wrap = document.getElementById('reminders-wrap-' + tab);
  if (!wrap) return;
  if (!S.reminders) S.reminders = {};
  const all = S.reminders[tab] || [];
  const now = Date.now();

  const PENCIL = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const TRASH  = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`;

  // ── Inyecta todo lo que vence (proyectos, finales, cursada, metas, actividades…) ──
  const { virtImminent, virtUpcoming, virtPast } = remVirtualItems(tab);

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

  // Urgent block (critical no-date + imminent dated + todo lo que vence ya)
  const urgentAll = [...critical, ...virtPast, ...virtImminent, ...imminent.sort((a,b)=>new Date(a.datetime)-new Date(b.datetime))];
  const urgentHTML = urgentAll.length ? `
    <div class="rem-urgent-section">
      <div class="rem-urgent-label">⚠ Atención inmediata</div>
      ${urgentAll.map(r => {
        if (r._virtual) {
          const isPast = r.at - now <= 0;
          const cd = remCountdown(r.datetime);
          const txt = isPast ? '¡Atrasada!' : (cd || (r.allDay ? 'Vence hoy' : '¡Ahora!'));
          const style = isPast ? 'color:#FF6B6B;text-shadow:0 0 10px rgba(255,107,107,.7)' : '';
          const when = r.allDay
            ? new Date(r.at).toLocaleDateString('es-AR', { weekday:'short', day:'numeric', month:'short' })
            : r.time;
          return `<div class="rem-urgent-item priority-${r.priority}">
            <div class="rem-urgent-row">
              <div style="flex:1;min-width:0">
                <div class="rem-urgent-kind">
                  ${remKindChip(r)}
                  <span class="rem-urgent-at">${when}</span>
                </div>
                <div class="rem-urgent-title">${escHtml(r.title)}${r.sub ? ` <span style="font-size:11px;color:var(--tt)">· ${escHtml(r.sub)}</span>` : ''}</div>
                <div class="rem-urgent-countdown" style="${style}">${txt}</div>
              </div>
              ${r.doneAction ? `<button class="btn btn-ghost btn-sm" style="flex-shrink:0;font-size:12px" onclick="${r.doneAction}">✓ Completar</button>` : ''}
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
    if (r._virtual) {
      const cfgP = REM_CFG[r.priority] || REM_CFG.medium;
      const dstr = new Date(r.at).toLocaleDateString('es-AR', { weekday:'short', day:'numeric', month:'short' })
        + (r.allDay ? '' : ' · ' + r.time);
      return `<div class="rem-item"${r.openAction ? ` style="cursor:pointer" onclick="${r.openAction}"` : ''}>
        <div class="rem-priority-dot" style="background:${cfgP.dot}"></div>
        <div class="rem-info">
          <div class="rem-title">${escHtml(r.title)}</div>
          <div class="rem-meta">${remKindChip(r)}<span>${r.sub ? escHtml(r.sub) + ' · ' : ''}${dstr}</span></div>
        </div>
        <span class="rem-badge rem-badge-${r.priority}">${cfgP.label}</span>
        ${r.doneAction ? `<div class="rem-actions">
          <button class="icon-btn" title="Completar" onclick="event.stopPropagation();${r.doneAction}">✓</button>
        </div>` : ''}
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

  const upcomingMerged = [...upcoming, ...virtUpcoming].sort((a,b)=>new Date(a.datetime)-new Date(b.datetime));
  const upcomingHTML = upcomingMerged.length ? upcomingMerged.map(remItemHTML).join('') : '';
  const noDateHTML   = noDate.length
    ? `<div class="rem-nodate-section">📌 Sin fecha asignada</div>${noDate.map(remItemHTML).join('')}`
    : '';
  const pastHTML = past.length
    ? `<div class="rem-nodate-section" style="margin-top:14px">✓ Pasados</div>${past.map(remItemHTML).join('')}`
    : '';

  const isEmpty = all.length === 0 && virtImminent.length === 0 && virtUpcoming.length === 0 && virtPast.length === 0;

  wrap.innerHTML = `<div class="card">
    <div class="card-title">
      🔔 Recordatorios
      <div style="display:flex;gap:6px;align-items:center">
        ${_notifBtnHTML()}
        <button class="btn btn-ghost btn-sm" onclick="openAddReminder('${tab}')">+ Recordatorio</button>
      </div>
    </div>
    ${isEmpty ? '<div class="empty-state">Nada por vencer</div>' : urgentHTML + upcomingHTML + noDateHTML + pastHTML}
  </div>`;
  renderRemindersNotif(tab);
}

// Notificación de recordatorios en la sección (solo lectura). La creación vive en el overlay.
function renderRemindersNotif(tab) {
  const body = document.getElementById('reminders-notif-' + tab); if (!body) return;
  if (!S.reminders) S.reminders = {};
  const now = Date.now();
  const { virtImminent, virtUpcoming, virtPast } = remVirtualItems(tab);
  // Los vencidos primero (son los que hay que mirar), después lo que viene por fecha.
  const rec = (S.reminders[tab] || []).filter(r => r.datetime)
    .map(r => ({ title: r.title, priority: r.priority, at: new Date(r.datetime).getTime(), datetime: r.datetime, kindLabel: 'Recordatorio', icon: '🔔' }));
  const recPast = rec.filter(r => r.at - now <= 0).sort((a, b) => b.at - a.at);
  const recNext = rec.filter(r => r.at - now > 0);
  const finDia = new Date(now); finDia.setHours(23, 59, 59, 999);

  // Tres grupos: lo vencido primero (es lo que hay que mirar), lo de hoy, y lo que
  // viene. Sin este corte, seis filas de horizontes distintos se leen todas iguales.
  const vencidos = [...recPast, ...virtPast].sort((a, b) => b.at - a.at);
  const resto    = [...recNext, ...virtImminent, ...virtUpcoming].sort((a, b) => a.at - b.at);
  const hoy      = resto.filter(r => r.at <= finDia.getTime());
  const proximos = resto.filter(r => r.at > finDia.getTime());
  if (!vencidos.length && !resto.length) {
    body.innerHTML = `<div class="rnotif-empty">Nada por vencer.</div>
      <button class="rnotif-all" onclick="if(window.openRemindersOverlay)openRemindersOverlay('${tab}')">Crear un recordatorio →</button>`;
    return;
  }

  let i = 0;   // índice global: la aparición escalonada no se reinicia por grupo
  const filaHTML = r => {
    const diff = r.at - now;
    const overdue  = diff <= 0;
    // Ámbar solo para lo que es YA (3 h). Con el umbral de 24 h, todo el grupo "Hoy"
    // se pintaba de ámbar y el color dejaba de avisar nada.
    const imminent = !overdue && diff < 3 * 3600000;
    const cd = overdue ? 'Vencido' : ((typeof remCountdown === 'function') ? remCountdown(r.datetime) : '');
    const d = new Date(r.at);
    const when = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
      + (r.allDay ? '' : ' · ' + d.toTimeString().slice(0, 5));
    const prioCfg = REM_CFG[r.priority] || REM_CFG.medium;
    const dotStyle = (overdue || imminent) ? '' : ` style="background:${prioCfg.dot};box-shadow:0 0 8px ${prioCfg.dot}"`;
    const act = r.openAction
      ? ` onclick="${r.openAction}" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}"`
      : '';
    return `<div class="rnotif-item${overdue ? ' overdue' : imminent ? ' imminent' : ''}" role="listitem" style="--i:${i++}"${act} title="Prioridad ${prioCfg.label.toLowerCase()}">
      <span class="rnotif-dot"${dotStyle}></span>
      <div class="rnotif-body">
        <span class="sr-only">Prioridad ${prioCfg.label}.</span>
        <div class="rnotif-head">${remKindChip(r)}<div class="rnotif-title">${escHtml(r.title)}</div></div>
        <div class="rnotif-when"><span class="rnotif-date">${when}</span>${r.sub ? ` · ${escHtml(r.sub)}` : ''}</div>
      </div>
      ${cd ? `<span class="rnotif-cd">${cd}</span>` : ''}
    </div>`;
  };
  // El contador del encabezado cuenta TODO el grupo, aunque se muestren menos filas.
  const grupoHTML = (all, max, label, cls) => all.length
    ? `<div class="rnotif-group ${cls}">${label} · ${all.length}</div><div role="list">${all.slice(0, max).map(filaHTML).join('')}</div>`
      + (all.length > max ? `<div class="rnotif-more">+${all.length - max} más</div>` : '')
    : '';

  body.innerHTML =
    grupoHTML(vencidos, 3, 'Vencido',  'is-overdue') +
    grupoHTML(hoy,      4, 'Hoy',      'is-today') +
    grupoHTML(proximos, 4, 'Próximo',  '') +
    `<button class="rnotif-all" onclick="if(window.openRemindersOverlay)openRemindersOverlay('${tab}')">Ver todo →</button>`;
}

// Re-dibuja los vencimientos de la sección visible. Lo llaman el intervalo de un
// minuto (mantiene frescos los "en 3h") y las secciones que cargan fechas nuevas.
function refreshRemindersView(tab) {
  const t = tab || (typeof currentTab === 'string' ? currentTab : '');
  if (t && document.getElementById('reminders-notif-' + t)) renderReminders(t);
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

// Notifica TODO lo que vence (recordatorios, proyectos, finales, cursada, metas,
// actividades, proyecciones, suscripciones, pedidos). Los avisos los calcula
// CMDeadlines; acá solo se disparan los que cayeron en los últimos 5 min.
// Corre cada 60 s con la app abierta; con la app cerrada lo cubre push-reminders.js.
function checkReminderNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (typeof CMDeadlines === 'undefined') return;
  CMDeadlines.dueAlerts(S, { now: Date.now(), windowMs: 5 * 60000, seen: _notifiedSet })
    .forEach(a => {
      _notifiedSet.add(a.key);
      _showNotif(a.title, {
        body: a.body,
        tag: a.key,
        requireInteraction: !!a.lead,
        icon: './icon.svg',
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
