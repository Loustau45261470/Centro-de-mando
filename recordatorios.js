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
  pedido:      'var(--c-finanzas)',
  tarjeta:     'var(--c-finanzas)',
};
// Chip de tipo (Final / TP / Proyecto / Meta / …). Los TPs pisan el acento de
// cursada con el ámbar de alerta: entregan, no son solo agenda.
function remKindChip(r) {
  const accent = r.kindLabel === 'TP' ? 'var(--warn)' : (REM_KIND_ACCENT[r.kind] || 'var(--hud)');
  return `<span class="cm-kind" style="--k:${accent}"><span class="cm-kind-ico" aria-hidden="true">${r.icon || '🔔'}</span>${escHtml(r.kindLabel || 'Recordatorio')}</span>`;
}

// ── Todo lo que vence fuera de S.reminders (proyectos, finales, cursada, metas,
//    actividades del planner, proyecciones, pedidos) entra acá como
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
                <div class="rem-urgent-title">${escHtml(r.title)}${r.sub ? ` <span style="font-size:var(--fs-12-5);color:var(--tt)">· ${escHtml(r.sub)}</span>` : ''}</div>
                <div class="rem-urgent-countdown" style="${style}">${txt}</div>
              </div>
              ${r.doneAction ? `<button class="btn btn-ghost btn-sm" style="flex-shrink:0;font-size:var(--fs-12-5)" onclick="${r.doneAction}">✓ Completar</button>` : ''}
            </div>
          </div>`;
        }
        const hasDate = !!r.datetime;
        return `<div class="rem-urgent-item priority-${r.priority}">
          <div class="rem-urgent-row">
            <div>
              <div class="rem-urgent-title">${escHtml(r.title)}</div>
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
        <div class="rem-title">${escHtml(r.title)}</div>
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
      🔔 Vencimientos
      <div style="display:flex;gap:6px;align-items:center">
        ${_notifBtnHTML()}
        <button class="btn btn-ghost btn-sm" onclick="openAddReminder('${tab}')">+ Recordatorio</button>
      </div>
    </div>
    ${isEmpty ? '<div class="empty-state">Nada por vencer</div>' : urgentHTML + upcomingHTML + noDateHTML + pastHTML}
  </div>`;
  renderRemindersNotif(tab);
}

// Notificación de recordatorios en la sección. La tarjeta entera abre el panel completo
// (patrón .cc-card-link, como Crédito); lo de adentro que actúa por su cuenta corta la propagación.
// Arriba los REM_NOTIF_MAX próximos más cercanos (hoy incluido), "Ver más" despliega el resto en la
// misma tarjeta, y TODOS los vencidos quedan a la vista debajo.
const REM_NOTIF_MAX = 5;
const _remNotifMore = {};   // tab -> true si "Ver más" está desplegado (sobrevive al refresco de cada minuto)
function remNotifToggle(tab) { _remNotifMore[tab] = !_remNotifMore[tab]; renderRemindersNotif(tab); }

function renderRemindersNotif(tab) {
  const body = document.getElementById('reminders-notif-' + tab); if (!body) return;
  if (!S.reminders) S.reminders = {};
  const now = Date.now();
  const { virtImminent, virtUpcoming, virtPast } = remVirtualItems(tab);
  const rec = (S.reminders[tab] || []).filter(r => r.datetime)
    .map(r => ({ title: r.title, priority: r.priority, at: new Date(r.datetime).getTime(), datetime: r.datetime, kindLabel: 'Recordatorio', icon: '🔔' }));
  const vencidos = [...rec.filter(r => r.at - now <= 0), ...virtPast].sort((a, b) => b.at - a.at);
  const proximos = [...rec.filter(r => r.at - now > 0), ...virtImminent, ...virtUpcoming].sort((a, b) => a.at - b.at);
  const verAll = `<button class="rnotif-all" onclick="event.stopPropagation();if(window.openRemindersOverlay)openRemindersOverlay('${tab}')">Ver todo →</button>`;
  if (!vencidos.length && !proximos.length) {
    body.innerHTML = `<div class="rnotif-empty">Nada por vencer.</div>
      <button class="rnotif-all" onclick="event.stopPropagation();if(window.openRemindersOverlay)openRemindersOverlay('${tab}')">Crear un recordatorio →</button>`;
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
    // La fila con acción propia (abrir el proyecto, el final…) no debe abrir además el panel: corta la propagación.
    const act = r.openAction
      ? ` onclick="event.stopPropagation();${r.openAction}" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();this.click();}"`
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

  const resto = Math.max(0, proximos.length - REM_NOTIF_MAX);
  const abierto = resto > 0 && !!_remNotifMore[tab];
  const visibles = abierto ? proximos : proximos.slice(0, REM_NOTIF_MAX);
  let html = '';
  if (proximos.length) {
    html += `<div class="rnotif-group">Próximos · ${proximos.length}</div><div role="list" class="rnotif-next">${visibles.map(filaHTML).join('')}</div>`;
    if (resto) html += `<button class="rnotif-all rnotif-toggle" aria-expanded="${abierto}" onclick="event.stopPropagation();remNotifToggle('${tab}')">${abierto ? 'Ver menos' : `Ver más (${resto})`}</button>`;
  } else {
    html += `<div class="rnotif-empty">Nada próximo por vencer.</div>`;
  }
  if (vencidos.length) html += `<div class="rnotif-group is-overdue">Vencido · ${vencidos.length}</div><div role="list" class="rnotif-over">${vencidos.map(filaHTML).join('')}</div>`;
  body.innerHTML = html + verAll;
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
// Avisos ya mostrados: persisten en localStorage (podados a 3 días), se comparten entre pestañas (mismo localStorage) y se
// suman a lo que el push ya avisó en la nube (notifiedReminders, solo lectura). Misma forma de clave que deadlines.js (con fecha).
const _AV_LS = 'cdm_avisosVistos', _AV_TTL = 3 * 86400000;
const _avTab = Math.random().toString(36).slice(2);
const _avMem = {};            // respaldo si localStorage no está disponible
const _avisosNube = {};       // espejo de notifiedReminders del documento
function avisosNubeSet(m) {
  Object.keys(_avisosNube).forEach(k => delete _avisosNube[k]);
  if (m && typeof m === 'object') Object.keys(m).forEach(k => { if (m[k]) _avisosNube[k] = true; });
}
function _avLeer() {
  try { const o = JSON.parse(localStorage.getItem(_AV_LS) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return Object.assign({}, _avMem); }
}
function _avEscribir(o) {
  const lim = Date.now() - _AV_TTL;
  Object.keys(o).forEach(k => { if (!o[k] || o[k][0] < lim) delete o[k]; });
  Object.keys(_avMem).forEach(k => delete _avMem[k]); Object.assign(_avMem, o);
  try { localStorage.setItem(_AV_LS, JSON.stringify(o)); } catch (e) {}
}
const _notifiedSet = {
  has(k) { return !!_avisosNube[k] || !!_avLeer()[k]; },
  // Reserva la clave: true si esta pestaña es la que debe mostrar el aviso (otra pestaña o el push ya lo tomó → false).
  claim(k) {
    if (this.has(k)) return false;
    const o = _avLeer(); o[k] = [Date.now(), _avTab]; _avEscribir(o);
    const v = _avLeer()[k];
    return !v || v[1] === _avTab;
  },
};

function initNotifications() {
  if (!('Notification' in window)) { showToast('Este navegador no soporta notificaciones'); return; }
  if (Notification.permission === 'denied') { showToast('🔕 Notificaciones bloqueadas — habilítalas en Ajustes del navegador'); return; }
  if (Notification.permission === 'granted') {
    // El toast de éxito sale solo si se escribió; si falla, _subscribePush ya mostró el de error.
    _getOrCreateVapidKeys().then(k => k ? _subscribePush(k.pubKey) : false).then(ok => { if (ok) showToast('🔔 Notificaciones ya activas'); });
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
  // Con data.url (ej. chequeos de Foco) el clic navega al destino; sin url, solo enfoca.
  const _click = n => () => {
    window.focus(); n.close();
    const u = opts && opts.data && opts.data.url;
    // Mismo canal que el clic del SW (foco.js escucha 'abrir-destino'); la app ya está abierta.
    if (u && navigator.serviceWorker) { try { navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { tipo: 'abrir-destino', url: String(u) } })); } catch(e) {} }
  };
  if (_swReg) {
    _swReg.showNotification(title, opts).catch(() => {
      // Fallback: SW showNotification falló (ej. iOS foreground), usar API directa
      try { const n = new Notification(title, opts); n.onclick = _click(n); } catch(e) {}
    });
    return;
  }
  try { const n = new Notification(title, opts); n.onclick = _click(n); } catch(e) {}
}

// Notifica TODO lo que vence (recordatorios, proyectos, finales, cursada, metas,
// actividades, proyecciones, pedidos). Los avisos los calcula
// CMDeadlines; acá solo se disparan los que cayeron en los últimos 20 min.
// Corre cada 60 s con la app abierta; con la app cerrada lo cubre push-reminders.js.
// Lo que venció hace más (PC suspendida, pestaña dormida) lo junta avisosAlVolver() en un solo resumen.
function checkReminderNotifications() {
  if (typeof CMDeadlines === 'undefined') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') { avisoPermisoNotif(); return; }
  CMDeadlines.dueAlerts(S, { now: Date.now(), windowMs: 20 * 60000, seen: _notifiedSet })
    .forEach(a => {
      if (!_notifiedSet.claim(a.key)) return;
      const o = {
        body: a.body,
        tag: a.key,
        requireInteraction: !!a.lead,
        icon: './icon.svg',
      };
      if (a.url) o.data = { url: a.url };
      _showNotif(a.title, o);
    });
}

// ── Avisos dentro de la app (tarjetas arriba a la derecha) ──
function _avisoCard(id, build) {
  let c = document.getElementById('avisos-app');
  if (!c) { c = document.createElement('div'); c.id = 'avisos-app'; c.setAttribute('role', 'region'); c.setAttribute('aria-label', 'Avisos'); document.body.appendChild(c); }
  // Las tarjetas arrancan debajo de la barra de arriba (🎮, campanita) y de la franja de frases con su «+»: no tapan ningún botón.
  let top = 0;
  // También los botones fijos de arriba: sin franja de frases visible (antes del arranque o sin frase) la tarjeta tapaba 🎮.
  document.querySelectorAll('.cm-frase, #trophy-btn, .pr-avisos').forEach(f => { const b = f.getBoundingClientRect(); if (b.height > 0 && b.bottom > top) top = b.bottom; });
  c.style.setProperty('--av-top', Math.round(top + 8) + 'px');
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('div'); el.id = id; el.className = 'av-card'; c.appendChild(el); }
  el.textContent = '';
  build(el);
  return el;
}
function _avisoCerrar(id) {
  const el = document.getElementById(id); if (el) el.remove();
  const c = document.getElementById('avisos-app'); if (c && !c.children.length) c.remove();
  if (id === 'av-resumen') _avResumenItems = [];
}
function _avBtnCerrar(el, id) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'av-x'; b.setAttribute('aria-label', 'Cerrar aviso'); b.textContent = '×';
  b.onclick = () => _avisoCerrar(id);
  el.appendChild(b);
}

// Aviso «Mientras no estabas»: un único resumen; si llegan más ítems con el resumen abierto, se suman.
let _avResumenItems = [];
function _avisoResumen(lista) {
  // Cada fila: el nombre del ítem como título y, debajo, el tipo y la hora (el título del aviso es genérico: «Recordatorio — Centro de Mando»).
  _avResumenItems = _avResumenItems.concat(lista.map(a => {
    const it = a.item;
    if (!it || !it.title) return { title: a.title, body: a.body || '', url: a.url || '' };
    const cuando = it.allDay ? String(it.date).slice(8, 10) + '/' + String(it.date).slice(5, 7) : (it.cuandoTxt || it.time || '');
    return { title: it.title, body: [it.kindLabel, it.sub, cuando].filter(Boolean).join(' · '), url: a.url || '' };
  }));
  _avisoCard('av-resumen', el => {
    _avBtnCerrar(el, 'av-resumen');
    const h = document.createElement('div'); h.className = 'av-tit'; h.textContent = 'Mientras no estabas:'; el.appendChild(h);
    _avResumenItems.slice(0, 6).forEach(it => {
      const r = document.createElement('div'); r.className = 'av-row';
      const t = document.createElement('div'); t.className = 'av-row-txt';
      const b = document.createElement('b'); b.textContent = it.title; t.appendChild(b);
      if (it.body) { const sp = document.createElement('span'); sp.textContent = it.body; t.appendChild(sp); }
      r.appendChild(t);
      if (it.url) {
        const v = document.createElement('button'); v.type = 'button'; v.className = 'av-ver'; v.textContent = 'Ver';
        v.onclick = () => { try { navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { tipo: 'abrir-destino', url: String(it.url) } })); } catch (e) {} _avisoCerrar('av-resumen'); };
        r.appendChild(v);
      }
      el.appendChild(r);
    });
    if (_avResumenItems.length > 6) { const m = document.createElement('div'); m.className = 'av-mas'; m.textContent = 'y ' + (_avResumenItems.length - 6) + ' más'; el.appendChild(m); }
  });
}

// Lee notifiedReminders del servidor (solo lectura) para no repetir lo que el push ya avisó mientras la app dormía.
async function _avisosRefrescarNube() {
  try {
    const snap = await Promise.race([_DOC().get({ source: 'server' }), new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 3000))]);
    const d = snap && typeof snap.data === 'function' ? snap.data() : null;
    if (d && d.notifiedReminders) avisosNubeSet(d.notifiedReminders);
  } catch (e) {}
}
// Al volver a la app (visible, foco, conexión, pageshow, resume): junta lo que venció en la última hora sin aviso.
let _avBusy = false, _avUlt = 0;
async function avisosAlVolver() {
  if (_avBusy || typeof CMDeadlines === 'undefined' || typeof S === 'undefined' || !S) return;
  if (!(typeof _auth !== 'undefined' && _auth && _auth.currentUser)) return;
  if (Date.now() - _avUlt < 3000) return;
  _avUlt = Date.now();
  _avBusy = true;
  try {
    const opts = () => ({ now: Date.now(), windowMs: 60 * 60000, windowLeadMs: 60 * 60000, seen: _notifiedSet });
    if (!CMDeadlines.dueAlerts(S, opts()).length) { checkReminderNotifications(); return; }
    await _avisosRefrescarNube();
    const lista = CMDeadlines.dueAlerts(S, opts()).filter(a => _notifiedSet.claim(a.key));
    if (lista.length) _avisoResumen(lista);
  } catch (e) {
  } finally { _avBusy = false; }
}
['focus', 'pageshow', 'online'].forEach(ev => window.addEventListener(ev, () => { avisosAlVolver(); }));
document.addEventListener('resume', () => { avisosAlVolver(); });

// Permiso de notificaciones: si no se puede avisar en este dispositivo, se dice (una vez por día, cerrable).
function avisoPermisoNotif() {
  try {
    if (!(typeof _auth !== 'undefined' && _auth && _auth.currentUser)) return;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const instalada = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    const hayApi = 'Notification' in window;
    let txt;
    if (isIOS && !instalada && (!hayApi || Notification.permission !== 'granted')) txt = 'Para recibir avisos en el iPhone, agregá la app a la pantalla de inicio: tocá Compartir y después «Agregar a pantalla de inicio». Abrila desde ese ícono y activá las notificaciones.';
    else if (hayApi && Notification.permission === 'denied') txt = 'Las notificaciones están bloqueadas en este dispositivo, así que no te van a llegar los avisos. Para activarlas, tocá el candado de la barra de direcciones (o los ajustes del navegador) y permití las notificaciones de este sitio.';
    else return;
    const hoy = new Date().toLocaleDateString('sv-SE');
    if (localStorage.getItem('cdm_avisoNotifDia') === hoy) return;
    localStorage.setItem('cdm_avisoNotifDia', hoy);
    _avisoCard('av-permiso', el => {
      _avBtnCerrar(el, 'av-permiso');
      const h = document.createElement('div'); h.className = 'av-tit'; h.textContent = '🔕 Avisos desactivados'; el.appendChild(h);
      const p = document.createElement('div'); p.className = 'av-txt'; p.textContent = txt; el.appendChild(p);
    });
  } catch (e) {}
}

// ── Aviso de avisos caídos ──
// push-reminders.js (el cron) escribe en el documento: pushDead cuando el servicio push da por muerta la suscripción
// de TODOS los dispositivos (404/410), y pushHealth.fallos.<dispositivo> cuando a UN dispositivo no se le pudo enviar
// (suscripción muerta, o 3 corridas seguidas con VAPID/límite/servicio caído), aunque otro dispositivo sí reciba.
// app.js llama a pushDeadAviso() con esos campos en cada snapshot: el aviso queda visible hasta que el dispositivo
// afectado se resuscribe (eso borra su entrada) o se lo descarta tocándolo.
function pushHealthVisibles(ph) {
  const f = (ph && ph.fallos) || {};
  return Object.keys(f).filter(k => f[k] && (f[k].dead || f[k].n >= 3)).map(k => Object.assign({ id: k }, f[k]));
}
function pushDeadAviso(pd, ph) {
  let b = document.getElementById('pushdead-banner');
  const vis = pushHealthVisibles(ph);
  if (!pd && !vis.length) { if (b) b.remove(); return; }
  let txt, fn;
  if (pd) {
    txt = '🔕 Los avisos al celular dejaron de llegar. Tocá para reactivarlos.';
    fn = pushDeadReactivar;
  } else {
    const yo = typeof _pushDeviceId === 'function' ? _pushDeviceId() : null;
    const propio = vis.some(e => e.id === yo);
    const quien = vis.map(e => e.ua || 'otro dispositivo').filter((x, i, arr) => arr.indexOf(x) === i).join(', ');
    const dead = vis.every(e => e.dead);
    txt = propio
      ? '🔕 Las notificaciones de este dispositivo dejaron de funcionar. Tocá para reactivarlas.'
      : '🔕 Las notificaciones de ' + quien + ' ' + (dead ? 'dejaron de funcionar (suscripción vencida)' : 'están fallando') + '. Abrí la app en ese dispositivo para renovarlas. Tocá para ocultar este aviso.';
    fn = propio ? pushDeadReactivar : () => pushHealthDescartar(vis.map(e => e.id));
  }
  if (!b) {
    b = document.createElement('button');
    b.id = 'pushdead-banner';
    b.type = 'button';
    document.body.appendChild(b);
  }
  b.textContent = txt;
  b.onclick = fn;
}
// Oculta el aviso de dispositivos ajenos: borra solo sus entradas de pushHealth.fallos (campos puntuales, no toca `state`).
async function pushHealthDescartar(ids) {
  try {
    const upd = {};
    ids.forEach(id => { upd['pushHealth.fallos.' + id] = firebase.firestore.FieldValue.delete(); });
    await _DOC().update(upd);
  } catch (e) { if (typeof showToast === 'function') showToast('No pude ocultar el aviso. Probá de nuevo.', 4000); }
}
async function pushDeadReactivar() {
  if (!('Notification' in window)) { showToast('Este navegador no soporta notificaciones'); return; }
  if (Notification.permission !== 'granted') { initNotifications(); return; }   // pide permiso y se suscribe
  const keys = await _getOrCreateVapidKeys();
  const ok = keys ? await _subscribePush(keys.pubKey, true) : false;
  showToast(ok ? '🔔 Avisos reactivados' : 'No se pudieron reactivar los avisos. Probá de nuevo en un rato.', 5000);
}

function _notifBtnHTML() {
  if (!('Notification' in window)) return '';
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  if (Notification.permission === 'granted') {
    const iosHint = isIOS && !isStandalone
      ? `<button class="btn btn-ghost btn-sm" style="font-size:var(--fs-12-5);opacity:.6" onclick="showToast('En iPhone: abre desde el ícono de la pantalla de inicio para recibir push cuando la app está cerrada')">📱 Instalar</button>`
      : '';
    return `<span style="font-size:var(--fs-12-5);opacity:.5;cursor:default" title="Notificaciones activas">🔔</span>${iosHint}`;
  }
  if (Notification.permission === 'denied') return '<span style="font-size:var(--fs-12-5);opacity:.5;cursor:default" title="Notificaciones bloqueadas en el navegador">🔕</span>';
  if (isIOS && !isStandalone) return `<button class="btn btn-ghost btn-sm" style="font-size:var(--fs-12-5)" onclick="showToast('En iPhone: toca Compartir → Agregar a pantalla de inicio, luego abre la app instalada y activa notificaciones')">Instalar en iPhone 📱</button>`;
  return `<button class="btn btn-ghost btn-sm" style="font-size:var(--fs-12-5)" onclick="initNotifications()">Activar 🔔</button>`;
}
