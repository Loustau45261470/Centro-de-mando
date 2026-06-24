'use strict';
// ════════════════════════════════════════════════════════════════════════
// GAME MODE — UI (render de zonas, modal de logros, input manual, radar,
// microinteracciones). Consume GM/gmRunEngine de gamemode.js.
// ════════════════════════════════════════════════════════════════════════

let _gmRadar = null;
let _gmRadarMonths = 3;
const _gmEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function _gmThemeColor(varName) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || '#38BDF8';
}

// ── Entrada: abre la pestaña, corre el motor y renderiza ─────────────────
async function openGameMode() {
  if (!GM) await gmLoad();
  gmRunEngine();
  _gmShowTab();
  gmRenderAll();
  gmFlushFeedback();
}
function _gmShowTab() {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('tab-game');
  if (panel) panel.classList.add('active');
  if (typeof currentTab !== 'undefined') currentTab = 'game';
  window.scrollTo({ top: 0 });
}

// ── Render maestro ───────────────────────────────────────────────────────
function gmRenderAll() {
  const panel = document.getElementById('tab-game');
  if (!panel) return;
  panel.innerHTML =
    gmRenderHud() +
    gmRenderBuffs() +
    `<div class="gm-grid">` +
      gmRenderDaily() +
      gmRenderEpics() +
      gmRenderLogros() +
      gmRenderManual() +
      gmRenderRadar() +
    `</div>`;
  requestAnimationFrame(gmDrawRadar);
}

// ── Zona 1 — HUD compacto ────────────────────────────────────────────────
function gmRenderHud() {
  const dom = GM_STATS.map(s => ({ s, xp: GM.stats[s].xp })).sort((a, b) => b.xp - a.xp)[0];
  const avatar = GM_STAT_META[dom.s].icon;
  const bars = GM_STATS.map(s => {
    const st = GM.stats[s]; const info = gmLevelInfo(st.xp); const meta = GM_STAT_META[s];
    return `<div class="gm-stat" style="--sc:var(${meta.color})">
      <div class="gm-stat-top"><span class="gm-stat-ico">${meta.icon}</span><span class="gm-stat-name">${meta.short}</span><span class="gm-stat-lv">Nv ${st.nivel}</span></div>
      <div class="gm-bar"><div class="gm-bar-fill" style="width:${Math.round(info.pct * 100)}%"></div></div>
      <div class="gm-stat-xp">${info.xpEnNivel} / ${info.xpParaSiguiente} XP</div>
    </div>`;
  }).join('');
  return `<div class="gm-hud card">
    <div class="gm-hud-id">
      <div class="gm-avatar">${avatar}</div>
      <div class="gm-id-text">
        <div class="gm-name">${_gmEsc(GM_PLAYER_NAME)}</div>
        <div class="gm-title">${_gmEsc(GM.titulo_actual)}</div>
      </div>
      <div class="gm-genlevel"><span class="gm-genlevel-num">${GM.nivel_general}</span><span class="gm-genlevel-lbl">Nivel general</span></div>
    </div>
    <div class="gm-stats-grid">${bars}</div>
  </div>`;
}

// ── Zona 2 — Buffs ───────────────────────────────────────────────────────
function gmBuffVisual(dias) {
  if (dias >= 60) return { ico: '🔥👑', cls: 'b-gold' };
  if (dias >= 21) return { ico: '🔥🔥🔥', cls: 'b-orange' };
  if (dias >= 7) return { ico: '🔥🔥', cls: 'b-amber' };
  return { ico: '🔥', cls: 'b-sm' };
}
function gmRenderBuffs() {
  if (!GM.buffs_activos.length) {
    return `<div class="gm-buffs gm-buffs-empty">Sin rachas activas. Hoy es un buen día para empezar una.</div>`;
  }
  const chips = GM.buffs_activos.map(b => {
    const v = gmBuffVisual(b.dias);
    return `<div class="gm-buff ${v.cls}"><span class="gm-buff-ico">${v.ico}</span><span class="gm-buff-txt">${_gmEsc(b.label)}</span><span class="gm-buff-days">${b.dias}d</span></div>`;
  }).join('');
  return `<div class="gm-buffs">${chips}</div>`;
}

// ── Zona 3 — Misiones del día ────────────────────────────────────────────
function gmRenderDaily() {
  const dm = GM.misiones_diarias;
  const done = dm.filter(m => m.completada).length;
  const pct = dm.length ? Math.round(done / dm.length * 100) : 0;
  const rows = dm.map(m => `<div class="gm-mission ${m.completada ? 'done' : ''}">
      <span class="gm-check">${m.completada ? '✓' : ''}</span>
      <span class="gm-mission-txt">${_gmEsc(m.texto)}</span>
      ${m.xp ? `<span class="gm-mission-xp">+${m.xp}</span>` : ''}
    </div>`).join('');
  const perfect = GM.dia_perfecto_count ? `<span class="gm-perfect">★ ${GM.dia_perfecto_count} días perfectos</span>` : '';
  return `<div class="gm-card card gm-span">
    <div class="gm-card-h"><span>Misiones del día</span><span class="gm-prog-lbl">${done}/${dm.length}</span></div>
    <div class="gm-bar gm-bar-lg"><div class="gm-bar-fill" style="width:${pct}%"></div></div>
    ${perfect}
    <div class="gm-missions">${rows || '<div class="gm-empty">Sin misiones hoy.</div>'}</div>
    <div class="gm-weekly-h">Semanales</div>
    <div class="gm-missions">${GM.misiones_semanales.map(m => `<div class="gm-mission ${m.completada ? 'done' : ''}"><span class="gm-check">${m.completada ? '✓' : ''}</span><span class="gm-mission-txt">${_gmEsc(m.texto)}</span></div>`).join('')}</div>
  </div>`;
}

// ── Zona 4 — Misiones épicas ─────────────────────────────────────────────
function gmRenderEpics() {
  if (!GM.misiones_epicas.length) return `<div class="gm-card card"><div class="gm-card-h"><span>Misiones épicas</span></div><div class="gm-empty">No hay objetivos trimestrales activos.</div></div>`;
  const cards = GM.misiones_epicas.map(e => {
    const pct = Math.round(e.progreso * 100);
    const espPct = Math.round(e.esperado * 100);
    const boss = (e.esperado > e.progreso + 0.05) ? '⚔️' : '🏰';
    return `<div class="gm-epic">
      <div class="gm-epic-h"><span class="gm-epic-boss">${boss}</span><span class="gm-epic-name">${_gmEsc(e.nombre)}</span></div>
      <div class="gm-bar gm-bar-lg"><div class="gm-bar-fill" style="width:${pct}%"></div><div class="gm-bar-exp" style="left:${espPct}%" title="Esperado ${espPct}%"></div></div>
      <div class="gm-epic-meta">${e.done}/${e.total} · ${pct}% <span class="gm-epic-exp">esperado ${espPct}%</span></div>
    </div>`;
  }).join('');
  return `<div class="gm-card card gm-span"><div class="gm-card-h"><span>Misiones épicas</span></div><div class="gm-epics">${cards}</div></div>`;
}

// ── Zona 5 — Logros ──────────────────────────────────────────────────────
function gmLogroList() { return Object.keys(GM.logros).map(id => Object.assign({ id }, GM.logros[id])); }
function gmRenderLogroCard(l) {
  const r = GM_RARITY[l.rareza] || GM_RARITY.comun;
  const pct = l.meta ? Math.min(100, Math.round((l.progreso / l.meta) * 100)) : 0;
  return `<div class="gm-logro ${l.desbloqueado ? 'unlocked' : 'locked'}" style="--rc:${r.color}">
    <div class="gm-logro-top"><span class="gm-logro-name">${_gmEsc(l.name)}</span><span class="gm-logro-rar">${r.label}</span></div>
    <div class="gm-logro-desc">${_gmEsc(l.desc)}</div>
    ${l.desbloqueado ? `<div class="gm-logro-done">✓ Desbloqueado</div>` : `<div class="gm-bar"><div class="gm-bar-fill" style="width:${pct}%;background:var(--rc)"></div></div><div class="gm-logro-prog">${l.progreso}/${l.meta}</div>`}
  </div>`;
}
function gmRenderLogros() {
  const all = gmLogroList();
  const unlocked = all.filter(l => l.desbloqueado).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const closest = all.filter(l => !l.desbloqueado && l.meta).sort((a, b) => (b.progreso / b.meta) - (a.progreso / a.meta));
  const feat = unlocked.slice(0, 3).concat(closest.slice(0, 3)).slice(0, 6);
  return `<div class="gm-card card gm-span">
    <div class="gm-card-h"><span>Logros</span><button class="gm-link" onclick="gmOpenLogrosModal()">Ver todos (${all.length})</button></div>
    <div class="gm-logros-grid">${feat.map(gmRenderLogroCard).join('') || '<div class="gm-empty">Sin logros aún.</div>'}</div>
  </div>`;
}
function gmOpenLogrosModal(filter) {
  let all = gmLogroList();
  if (filter && filter !== 'all') all = all.filter(l => l.rareza === filter);
  const ov = document.getElementById('gm-logros-overlay');
  const body = document.getElementById('gm-logros-body');
  if (!ov || !body) return;
  const chips = ['all', 'comun', 'raro', 'epico', 'legendario'].map(f =>
    `<button class="gm-fchip ${(filter || 'all') === f ? 'on' : ''}" onclick="gmOpenLogrosModal('${f}')">${f === 'all' ? 'Todos' : (GM_RARITY[f] ? GM_RARITY[f].label : f)}</button>`).join('');
  body.innerHTML = `<div class="gm-filters">${chips}</div><div class="gm-logros-grid">${all.map(gmRenderLogroCard).join('') || '<div class="gm-empty">Sin logros.</div>'}</div>`;
  ov.classList.add('show');
}
function gmCloseLogrosModal() { const ov = document.getElementById('gm-logros-overlay'); if (ov) ov.classList.remove('show'); }

// ── Zona 6 — Comparativa (radar) + config ────────────────────────────────
function gmRenderRadar() {
  const sel = [1, 3, 12].map(mo => `<button class="gm-fchip ${_gmRadarMonths === mo ? 'on' : ''}" onclick="gmSetRadarPeriod(${mo})">${mo === 12 ? '1 año' : mo + ' mes' + (mo > 1 ? 'es' : '')}</button>`).join('');
  return `<div class="gm-card card gm-span">
    <div class="gm-card-h"><span>Comparativa histórica</span><div class="gm-filters">${sel}</div></div>
    <div class="gm-radar-wrap"><canvas id="gm-radar-canvas"></canvas></div>
    <div class="gm-config">
      <label class="gm-toggle"><input type="checkbox" ${GM.config.animaciones ? 'checked' : ''} onchange="gmToggleConfig('animaciones')"> Animaciones</label>
      <label class="gm-toggle"><input type="checkbox" ${GM.config.voz_jarvis_levelup ? 'checked' : ''} onchange="gmToggleConfig('voz_jarvis_levelup')"> Voz JARVIS al subir nivel</label>
    </div>
  </div>`;
}
function gmSnapshotForMonths(months) {
  const today = getActiveDate();
  const target = new Date(today + 'T12:00:00'); target.setMonth(target.getMonth() - months);
  const ts = localStr(target);
  let best = null;
  GM.snapshots.forEach(s => { if (s.fecha <= ts && (!best || s.fecha > best.fecha)) best = s; });
  if (!best && GM.snapshots.length) best = GM.snapshots[0];
  return best;
}
function gmDrawRadar() {
  const cv = document.getElementById('gm-radar-canvas');
  if (!cv || typeof Chart === 'undefined') return;
  if (_gmRadar) { _gmRadar.destroy(); _gmRadar = null; }
  const labels = GM_STATS.map(s => GM_STAT_META[s].short);
  const actual = GM_STATS.map(s => GM.stats[s].nivel);
  const past = gmSnapshotForMonths(_gmRadarMonths);
  const pastData = past ? GM_STATS.map(s => (past.stats[s] ? past.stats[s].nivel : 0)) : null;
  const accent = _gmThemeColor('--accent');
  const tt = _gmThemeColor('--tt') || 'rgba(255,255,255,.4)';
  const ds = [{ label: 'Actual', data: actual, borderColor: accent, backgroundColor: accent + '33', pointBackgroundColor: accent, borderWidth: 2 }];
  if (pastData) ds.push({ label: 'Antes', data: pastData, borderColor: tt, backgroundColor: 'transparent', borderDash: [5, 4], pointBackgroundColor: tt, borderWidth: 1.5 });
  _gmRadar = new Chart(cv.getContext('2d'), {
    type: 'radar',
    data: { labels, datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: _gmThemeColor('--ts') } } },
      scales: { r: { angleLines: { color: 'rgba(255,255,255,.08)' }, grid: { color: 'rgba(255,255,255,.08)' }, pointLabels: { color: _gmThemeColor('--ts'), font: { size: 11 } }, ticks: { display: false, beginAtZero: true } } },
    },
  });
}
function gmSetRadarPeriod(mo) { _gmRadarMonths = mo; gmRenderAll(); }

// ── Input manual Espíritu / Vínculos ─────────────────────────────────────
const GM_EV_FIELDS = [
  { key: 'mision', label: 'Misa / oración', stat: 'espiritu', xp: 10 },
  { key: 'lectura', label: 'Lectura espiritual', stat: 'espiritu', xp: 10 },
  { key: 'reflexion', label: 'Reflexión semanal', stat: 'espiritu', xp: 20 },
  { key: 'novia', label: 'Tiempo con novia', stat: 'vinculos', xp: 10 },
  { key: 'padres', label: 'Llamada/visita a padres', stat: 'vinculos', xp: 10 },
  { key: 'gatitas', label: 'Cuidado de las gatitas', stat: 'vinculos', xp: 5 },
];
function gmRenderManual() {
  const today = getActiveDate();
  const log = GM.espiritu_vinculos_log[today] || {};
  const rows = GM_EV_FIELDS.map(f => `<label class="gm-ev ${log[f.key] ? 'on' : ''}">
      <input type="checkbox" ${log[f.key] ? 'checked' : ''} onchange="gmToggleEV('${f.key}', this)">
      <span class="gm-ev-ico">${GM_STAT_META[f.stat].icon}</span>
      <span class="gm-ev-txt">${f.label}</span><span class="gm-ev-xp">+${f.xp}</span>
    </label>`).join('');
  return `<div class="gm-card card gm-span"><div class="gm-card-h"><span>Espíritu &amp; Vínculos · hoy</span></div><div class="gm-ev-list">${rows}</div></div>`;
}
function gmToggleEV(key, el) {
  const today = getActiveDate();
  const log = GM.espiritu_vinculos_log[today] = GM.espiritu_vinculos_log[today] || {};
  log[key] = !log[key];
  if (log[key] && el) {
    const f = GM_EV_FIELDS.find(x => x.key === key);
    if (f) gmFloatXp(el, f.xp);
  }
  gmRunEngine();
  gmRenderAll();
  gmFlushFeedback();
}
function gmToggleConfig(key) {
  GM.config[key] = !GM.config[key];
  gmSave();
}

// ── Microinteracciones / feedback ────────────────────────────────────────
function gmFlushFeedback() {
  if (!GM.config.animaciones) { _gmLevelUps = []; _gmNewLogros = []; return; }
  _gmLevelUps.forEach((lu, i) => setTimeout(() => gmLevelUpToast(lu), i * 700));
  _gmNewLogros.forEach((l, i) => setTimeout(() => gmLogroToast(l), (_gmLevelUps.length + i) * 700));
  if (GM.config.voz_jarvis_levelup && _gmLevelUps.length && window.JARVIS_VOICE && typeof JARVIS_VOICE.speak === 'function') {
    const lu = _gmLevelUps[0];
    try { JARVIS_VOICE.speak(`Subiste a nivel ${lu.to} en ${GM_STAT_META[lu.stat].short}`); } catch (e) {}
  }
  _gmLevelUps = []; _gmNewLogros = [];
}
function _gmToastEl() { let t = document.getElementById('gm-toast-stack'); if (!t) { t = document.createElement('div'); t.id = 'gm-toast-stack'; document.body.appendChild(t); } return t; }
function gmLevelUpToast(lu) {
  const meta = GM_STAT_META[lu.stat];
  const el = document.createElement('div');
  el.className = 'gm-toast gm-toast-lvl';
  el.style.setProperty('--sc', _gmThemeColor(meta.color));
  el.innerHTML = `<span class="gm-toast-ico">${meta.icon}</span><div><div class="gm-toast-t">¡Subiste a Nivel ${lu.to}!</div><div class="gm-toast-s">${meta.short}</div></div>`;
  _gmToastEl().appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 350); }, 2600);
}
function gmLogroToast(l) {
  const r = GM_RARITY[l.rareza] || GM_RARITY.comun;
  const el = document.createElement('div');
  el.className = 'gm-toast gm-toast-logro';
  el.style.setProperty('--rc', r.color);
  el.innerHTML = `<span class="gm-toast-ico">🏅</span><div><div class="gm-toast-t">${_gmEsc(l.name)}</div><div class="gm-toast-s">${r.label}</div></div>`;
  _gmToastEl().appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 350); }, 2800);
}
function gmFloatXp(anchor, xp) {
  if (!GM.config.animaciones) return;
  const r = anchor.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'gm-floatxp';
  el.textContent = '+' + xp + ' XP';
  el.style.left = (r.left + r.width / 2) + 'px';
  el.style.top = (r.top) + 'px';
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('go'));
  setTimeout(() => el.remove(), 1100);
}
