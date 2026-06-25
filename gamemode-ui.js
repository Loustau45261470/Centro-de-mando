'use strict';
// ════════════════════════════════════════════════════════════════════════
// GAME MODE — UI. Modelo de 2 niveles: categorías (barras grandes) → skills.
// ════════════════════════════════════════════════════════════════════════

let _gmRadar = null;
let _gmRadarMonths = 3;
let _gmCollapsed = {};   // cat -> true si está colapsada
const _gmEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function _gmThemeColor(varName) { const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); return v || '#38BDF8'; }

// ── Entrada ──────────────────────────────────────────────────────────────
async function openGameMode() {
  if (typeof S === 'undefined' || !S || !S.habitTrackers) { if (typeof showToast === 'function') showToast('Cargando datos…'); return; }
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
  if (_gmRadar) { _gmRadar.destroy(); _gmRadar = null; }
  panel.innerHTML =
    gmRenderHud() +
    gmRenderBuffs() +
    gmRenderDaily() +
    gmRenderEpics() +
    gmRenderLogros() +
    gmRenderTree() +
    gmRenderManual() +
    gmRenderRadar();
  requestAnimationFrame(gmDrawRadar);
}

// ── Zona 1 — HUD: identidad + 6 categorías expandibles a skills ──────────
function gmRenderHud() {
  const dom = GM_CATEGORIES.map(c => ({ c, xp: GM.cats[c].xp })).sort((a, b) => b.xp - a.xp)[0];
  const avatar = GM_CAT_META[dom.c].icon;
  const cats = GM_CATEGORIES.map(gmRenderCatBlock).join('');
  return `<div class="gm-hud card">
    <div class="gm-hud-id">
      <div class="gm-avatar">${avatar}</div>
      <div class="gm-id-text">
        <div class="gm-name">${_gmEsc(GM_PLAYER_NAME)}</div>
        <div class="gm-title">${_gmEsc(GM.titulo_actual)}</div>
      </div>
      <div class="gm-genlevel"><span class="gm-genlevel-num">${GM.nivel_general}</span><span class="gm-genlevel-lbl">Nivel general</span></div>
    </div>
    <div class="gm-cats">${cats}</div>
  </div>`;
}
function gmRenderCatBlock(cat) {
  const meta = GM_CAT_META[cat];
  const c = GM.cats[cat];
  const info = gmLevelInfo(c.xp);
  const collapsed = !!_gmCollapsed[cat];
  const skills = GM_SKILLS_BY_CAT(cat).map(s => {
    const st = GM.skills[s.id];
    const si = gmLevelInfo(st.xp);
    const noTrack = !st.hasTracker;
    return `<div class="gm-skill${noTrack ? ' gm-skill-off' : ''}">
      <div class="gm-skill-top"><span class="gm-skill-name">${_gmEsc(s.name)}</span>${noTrack ? '<span class="gm-skill-tag">sin tracker</span>' : `<span class="gm-skill-lv">Nv ${st.nivel}</span>`}</div>
      <div class="gm-bar gm-bar-sm"><div class="gm-bar-fill" style="width:${noTrack ? 0 : Math.round(si.pct * 100)}%"></div></div>
    </div>`;
  }).join('');
  return `<div class="gm-cat" style="--sc:var(${meta.color})">
    <div class="gm-cat-h" onclick="gmToggleCat('${cat}')">
      <span class="gm-cat-ico">${meta.icon}</span>
      <span class="gm-cat-name">${meta.name}</span>
      <span class="gm-cat-lv">Nv ${c.nivel}</span>
      <span class="gm-cat-chev">${collapsed ? '▸' : '▾'}</span>
    </div>
    <div class="gm-bar gm-bar-lg"><div class="gm-bar-fill" style="width:${Math.round(info.pct * 100)}%"></div></div>
    ${collapsed ? '' : `<div class="gm-skills">${skills}</div>`}
  </div>`;
}
function gmToggleCat(cat) { _gmCollapsed[cat] = !_gmCollapsed[cat]; gmRenderAll(); }

// ── Zona 2 — Buffs ───────────────────────────────────────────────────────
function gmBuffVisual(dias) {
  if (dias >= 60) return { ico: '🔥👑', cls: 'b-gold' };
  if (dias >= 21) return { ico: '🔥🔥🔥', cls: 'b-orange' };
  if (dias >= 7) return { ico: '🔥🔥', cls: 'b-amber' };
  return { ico: '🔥', cls: 'b-sm' };
}
function gmRenderBuffs() {
  if (!GM.buffs_activos.length) return `<div class="gm-buffs gm-buffs-empty">Sin rachas activas. Hoy es un buen día para empezar una.</div>`;
  const chips = GM.buffs_activos.map(b => { const v = gmBuffVisual(b.dias); return `<div class="gm-buff ${v.cls}"><span class="gm-buff-ico">${v.ico}</span><span class="gm-buff-txt">${_gmEsc(b.label)}</span><span class="gm-buff-days">${b.dias}d</span></div>`; }).join('');
  return `<div class="gm-buffs">${chips}</div>`;
}

// ── Zona 3 — Misiones del día (agrupadas por categoría) ──────────────────
function _gmMissionRow(m) {
  return `<div class="gm-mission ${m.completada ? 'done' : ''}"><span class="gm-check">${m.completada ? '✓' : ''}</span><span class="gm-mission-txt">${_gmEsc(m.texto)}</span>${m.xp ? `<span class="gm-mission-xp">+${m.xp}</span>` : ''}</div>`;
}
function gmRenderDaily() {
  const groups = GM.misiones_diarias || [];
  const general = GM.misiones_generales || [];
  let done = 0, total = 0;
  groups.forEach(g => (g.items || []).forEach(m => { total++; if (m.completada) done++; }));
  general.forEach(m => { total++; if (m.completada) done++; });
  const pct = total ? Math.round(done / total * 100) : 0;
  const groupHtml = groups.map(g => {
    const meta = GM_CAT_META[g.cat]; if (!meta || !g.items.length) return '';
    return `<div class="gm-mgroup"><div class="gm-mgroup-h" style="--sc:var(${meta.color})"><span class="gm-mgroup-ico">${meta.icon}</span><span>${meta.name}</span></div>${g.items.map(_gmMissionRow).join('')}</div>`;
  }).join('');
  const generalHtml = general.length ? `<div class="gm-mgroup"><div class="gm-mgroup-h gm-mgroup-gen"><span class="gm-mgroup-ico">📋</span><span>General</span></div>${general.map(_gmMissionRow).join('')}</div>` : '';
  const perfect = GM.dia_perfecto_count ? `<span class="gm-perfect">★ ${GM.dia_perfecto_count} días perfectos</span>` : '';
  return `<div class="gm-card card">
    <div class="gm-card-h"><span>Misiones del día</span><span class="gm-prog-lbl">${done}/${total}</span></div>
    <div class="gm-bar gm-bar-lg"><div class="gm-bar-fill" style="width:${pct}%"></div></div>
    ${perfect}
    <div class="gm-missions-grouped">${(groupHtml + generalHtml) || '<div class="gm-empty">Sin misiones hoy.</div>'}</div>
    <div class="gm-weekly-h">Semanales</div>
    <div class="gm-missions">${GM.misiones_semanales.map(_gmMissionRow).join('')}</div>
  </div>`;
}

// ── Zona 4 — Épicas ──────────────────────────────────────────────────────
function gmRenderEpics() {
  if (!GM.misiones_epicas.length) return `<div class="gm-card card"><div class="gm-card-h"><span>Misiones épicas</span></div><div class="gm-empty">No hay objetivos trimestrales activos.</div></div>`;
  const cards = GM.misiones_epicas.map(e => {
    const pct = Math.round(e.progreso * 100), espPct = Math.round(e.esperado * 100);
    const boss = (e.esperado > e.progreso + 0.05) ? '⚔️' : '🏰';
    return `<div class="gm-epic"><div class="gm-epic-h"><span class="gm-epic-boss">${boss}</span><span class="gm-epic-name">${_gmEsc(e.nombre)}</span></div>
      <div class="gm-bar gm-bar-lg"><div class="gm-bar-fill" style="width:${pct}%"></div><div class="gm-bar-exp" style="left:${espPct}%"></div></div>
      <div class="gm-epic-meta">${e.done}/${e.total} · ${pct}% <span class="gm-epic-exp">esperado ${espPct}%</span></div></div>`;
  }).join('');
  return `<div class="gm-card card"><div class="gm-card-h"><span>Misiones épicas</span></div><div class="gm-epics">${cards}</div></div>`;
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
  const unlocked = all.filter(l => l.desbloqueado).length;
  const feat = all.filter(l => l.desbloqueado).slice(0, 3).concat(all.filter(l => !l.desbloqueado).sort((a, b) => (b.progreso / b.meta) - (a.progreso / a.meta)).slice(0, 3)).slice(0, 6);
  return `<div class="gm-card card">
    <div class="gm-card-h"><span>Logros</span><button class="gm-link" onclick="gmOpenLogrosModal()">Ver todos (${unlocked}/${all.length})</button></div>
    <div class="gm-logros-grid">${feat.map(gmRenderLogroCard).join('') || '<div class="gm-empty">Sin logros aún.</div>'}</div>
  </div>`;
}
let _gmLogroFilterCat = 'all', _gmLogroFilterRar = 'all';
function gmOpenLogrosModal(catF, rarF) {
  if (catF !== undefined) _gmLogroFilterCat = catF;
  if (rarF !== undefined) _gmLogroFilterRar = rarF;
  const ov = document.getElementById('gm-logros-overlay'), body = document.getElementById('gm-logros-body');
  if (!ov || !body) return;
  let list = gmLogroList();
  if (_gmLogroFilterCat !== 'all') list = list.filter(l => l.cat === _gmLogroFilterCat);
  if (_gmLogroFilterRar !== 'all') list = list.filter(l => l.rareza === _gmLogroFilterRar);
  const catChips = ['all'].concat(GM_CATEGORIES, ['general']).map(c => `<button class="gm-fchip ${_gmLogroFilterCat === c ? 'on' : ''}" onclick="gmOpenLogrosModal('${c}', undefined)">${c === 'all' ? 'Todas' : (GM_CAT_META[c] ? GM_CAT_META[c].name : 'General')}</button>`).join('');
  const rarChips = ['all', 'comun', 'raro', 'epico', 'legendario'].map(f => `<button class="gm-fchip ${_gmLogroFilterRar === f ? 'on' : ''}" onclick="gmOpenLogrosModal(undefined, '${f}')">${f === 'all' ? 'Rareza' : GM_RARITY[f].label}</button>`).join('');
  const unlocked = list.filter(l => l.desbloqueado).length;
  body.innerHTML = `<div class="gm-filters">${catChips}</div><div class="gm-filters">${rarChips}</div>
    <div class="gm-logros-count">${unlocked}/${list.length} desbloqueados</div>
    <div class="gm-logros-grid">${list.map(gmRenderLogroCard).join('') || '<div class="gm-empty">Sin logros.</div>'}</div>`;
  ov.classList.add('show');
}
function gmCloseLogrosModal() { const ov = document.getElementById('gm-logros-overlay'); if (ov) ov.classList.remove('show'); }

// ── Árbol de habilidades ─────────────────────────────────────────────────
function gmRenderTree() {
  const total = GM_TREE_NODES.length;
  const unl = ((GM.tree && GM.tree.unlocked) || []).length;
  return `<div class="gm-card card"><div class="gm-card-h"><span>Árbol de habilidades</span><button class="gm-link" onclick="gmOpenTree()">Abrir (${unl}/${total})</button></div>
    <div class="gm-empty">Desbloqueá habilidades especiales combinando entrenamientos, logros y rachas. Las ramas se unen.</div></div>`;
}
const GM_TREE_NODE_W = 116;
const GM_TREE_CAT_COLOR = { cuerpo: '--c-salud', mente: '--c-conocimiento', finanzas: '--c-finanzas', espiritu: '--c-jarvis', vinculos: '--c-vida', trabajo: '--c-ia', patrimonio: '--accent', cross: '--accent' };
// Layout automático: filas por tier (Tier 5 arriba), x por categoría en la base y promedio de los
// nodos previos en los tiers de combinación (así las uniones convergen sobre sus padres).
function gmTreeLayout() {
  const ROW_H = 132, MINGAP = GM_TREE_NODE_W + 18, CATW = 250;
  const catX = { cuerpo: 0, mente: 1, finanzas: 2, patrimonio: 3, espiritu: 4, vinculos: 5, trabajo: 6, cross: 3 };
  const tiers = [...new Set(GM_TREE_NODES.map(n => n.tier))].sort((a, b) => a - b);
  const maxRow = tiers.length - 1;
  const pos = {};
  tiers.forEach(t => {
    const row = tiers.indexOf(t);
    const y = (maxRow - row) * ROW_H + 16;
    const nodesT = GM_TREE_NODES.filter(n => n.tier === t);
    nodesT.forEach(n => {
      const pre = ((n.requires && n.requires.nodes) || []).map(id => pos[id]).filter(Boolean);
      const x = pre.length ? pre.reduce((a, p) => a + p.x, 0) / pre.length : (catX[n.cat] != null ? catX[n.cat] : 3) * CATW;
      pos[n.id] = { x, y };
    });
    const arr = nodesT.map(n => pos[n.id]).sort((a, b) => a.x - b.x);
    for (let i = 1; i < arr.length; i++) if (arr[i].x - arr[i - 1].x < MINGAP) arr[i].x = arr[i - 1].x + MINGAP;
  });
  const minX = Math.min(...Object.values(pos).map(p => p.x));
  Object.values(pos).forEach(p => p.x -= minX - 16);
  return pos;
}
function gmTreeMetricLabel(c) {
  if (c.metric === 'patrimonio') return '$' + (c.value / 1000000) + 'M';
  const cur = gmMetric(c.metric);
  if (c.metric.indexOf('lvl_') === 0) return 'Nv ' + Math.min(cur, c.value) + '/' + c.value;
  return Math.min(cur, c.value) + '/' + c.value;
}
function gmOpenTree() {
  const ov = document.getElementById('gm-tree-overlay'), body = document.getElementById('gm-tree-body');
  if (!ov || !body) return;
  const unlocked = new Set((GM.tree && GM.tree.unlocked) || []);
  const claimed = new Set((GM.tree && GM.tree.claimed) || []);
  const pos = gmTreeLayout();
  const cx = GM_TREE_NODE_W / 2;
  const W = Math.max(...Object.values(pos).map(p => p.x)) + GM_TREE_NODE_W + 24;
  const H = Math.max(...Object.values(pos).map(p => p.y)) + 100;
  let lines = '';
  GM_TREE_NODES.forEach(n => ((n.requires && n.requires.nodes) || []).forEach(pid => {
    const p = pos[pid], c = pos[n.id]; if (!p || !c) return;
    const on = unlocked.has(n.id) && unlocked.has(pid);
    lines += `<line x1="${p.x + cx}" y1="${p.y}" x2="${c.x + cx}" y2="${c.y + 64}" class="gm-tline${on ? ' on' : ''}"/>`;
  }));
  let nodes = '';
  GM_TREE_NODES.forEach(n => {
    const p = pos[n.id]; if (!p) return;
    const on = unlocked.has(n.id);
    const reqOk = gmTreeReqMet(n, unlocked);
    const claimable = !on && n.manual && reqOk && !claimed.has(n.id);
    const reqTxt = ((n.requires && n.requires.metrics) || []).map(gmTreeMetricLabel).join(' · ');
    const tip = (n.requires && n.requires.nodes && n.requires.nodes.length) ? 'Une: ' + n.requires.nodes.join(', ') + (reqTxt ? ' · ' + reqTxt : '') : (reqTxt || (n.manual ? 'manual' : ''));
    nodes += `<div class="gm-tnode${on ? ' on' : ''}${n.manual ? ' manual' : ''}" style="left:${p.x}px;top:${p.y}px;--nc:var(${GM_TREE_CAT_COLOR[n.cat] || '--accent'})" title="${_gmEsc(n.name + ' — ' + tip)}">
      <span class="gm-tnode-ico">${n.icon}</span>
      <span class="gm-tnode-name">${_gmEsc(n.name)}</span>
      ${on ? '<span class="gm-tnode-on">✓</span>' : `<span class="gm-tnode-req">${_gmEsc(reqTxt || (n.manual ? 'manual' : 'unir ramas'))}</span>`}
      ${claimable ? `<button class="gm-tnode-claim" onclick="gmClaimNode('${n.id}')">Reclamar</button>` : ''}
    </div>`;
  });
  body.innerHTML = `<div class="gm-tree-scroll"><div class="gm-tree-canvas" style="width:${W}px;height:${H}px"><svg class="gm-tree-svg" width="${W}" height="${H}">${lines}</svg>${nodes}</div></div>`;
  ov.classList.add('show');
}
function gmCloseTree() { const ov = document.getElementById('gm-tree-overlay'); if (ov) ov.classList.remove('show'); }
function gmClaimNode(id) {
  GM.tree.claimed = GM.tree.claimed || [];
  if (!GM.tree.claimed.includes(id)) GM.tree.claimed.push(id);
  gmRunEngine(); gmRenderAll(); gmOpenTree(); gmFlushFeedback();
}

// ── Zona 6 — Radar por categoría + config ────────────────────────────────
function gmRenderRadar() {
  const sel = [1, 3, 12].map(mo => `<button class="gm-fchip ${_gmRadarMonths === mo ? 'on' : ''}" onclick="gmSetRadarPeriod(${mo})">${mo === 12 ? '1 año' : mo + ' mes' + (mo > 1 ? 'es' : '')}</button>`).join('');
  return `<div class="gm-card card">
    <div class="gm-card-h"><span>Comparativa histórica</span><div class="gm-filters">${sel}</div></div>
    <div class="gm-radar-wrap"><canvas id="gm-radar-canvas"></canvas></div>
    <div class="gm-config">
      <label class="gm-toggle"><input type="checkbox" ${GM.config.animaciones ? 'checked' : ''} onchange="gmToggleConfig('animaciones')"> Animaciones</label>
      <label class="gm-toggle"><input type="checkbox" ${GM.config.voz_jarvis_levelup ? 'checked' : ''} onchange="gmToggleConfig('voz_jarvis_levelup')"> Voz JARVIS al subir nivel</label>
    </div>
  </div>`;
}
function gmSnapshotForMonths(months) {
  const target = new Date(getActiveDate() + 'T12:00:00'); target.setMonth(target.getMonth() - months);
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
  const labels = GM_CATEGORIES.map(c => GM_CAT_META[c].name);
  const actual = GM_CATEGORIES.map(c => GM.cats[c].nivel);
  const past = gmSnapshotForMonths(_gmRadarMonths);
  const pastData = past ? GM_CATEGORIES.map(c => (past.cats && past.cats[c]) || 0) : null;
  const accent = _gmThemeColor('--accent'), tt = _gmThemeColor('--tt') || 'rgba(255,255,255,.4)';
  const ds = [{ label: 'Actual', data: actual, borderColor: accent, backgroundColor: accent + '33', pointBackgroundColor: accent, borderWidth: 2 }];
  if (pastData) ds.push({ label: 'Antes', data: pastData, borderColor: tt, backgroundColor: 'transparent', borderDash: [5, 4], pointBackgroundColor: tt, borderWidth: 1.5 });
  _gmRadar = new Chart(cv.getContext('2d'), {
    type: 'radar', data: { labels, datasets: ds },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: _gmThemeColor('--ts') } } },
      scales: { r: { angleLines: { color: 'rgba(255,255,255,.08)' }, grid: { color: 'rgba(255,255,255,.08)' }, pointLabels: { color: _gmThemeColor('--ts'), font: { size: 11 } }, ticks: { display: false, beginAtZero: true } } } },
  });
}
function gmSetRadarPeriod(mo) { _gmRadarMonths = mo; gmRenderAll(); }

// ── Input manual Espíritu / Vínculos ─────────────────────────────────────
function gmRenderManual() {
  const today = getActiveDate();
  const log = GM.espiritu_vinculos_log[today] || {};
  const rows = GM_EV_FIELDS.map(f => `<label class="gm-ev ${log[f.key] ? 'on' : ''}">
      <input type="checkbox" ${log[f.key] ? 'checked' : ''} onchange="gmToggleEV('${f.key}', this)">
      <span class="gm-ev-ico">${GM_CAT_META[f.cat].icon}</span>
      <span class="gm-ev-txt">${_gmEsc(f.label)}</span><span class="gm-ev-xp">+${f.xp}</span>
    </label>`).join('');
  return `<div class="gm-card card"><div class="gm-card-h"><span>Espíritu &amp; Vínculos · hoy</span></div><div class="gm-ev-list">${rows}</div></div>`;
}
function gmToggleEV(key, el) {
  const today = getActiveDate();
  const log = GM.espiritu_vinculos_log[today] = GM.espiritu_vinculos_log[today] || {};
  log[key] = !log[key];
  if (log[key] && el) { const f = GM_EV_FIELDS.find(x => x.key === key); if (f) gmFloatXp(el, f.xp); }
  gmRunEngine(); gmRenderAll(); gmFlushFeedback();
}
function gmToggleConfig(key) { GM.config[key] = !GM.config[key]; gmSave(); }

// ── Microinteracciones ───────────────────────────────────────────────────
function _gmSkillMeta(skillId) { const s = GM_SKILLS.find(x => x.id === skillId); return s ? { name: s.name, cat: s.cat } : { name: skillId, cat: 'mente' }; }
function gmFlushFeedback() {
  if (!GM.config.animaciones) { _gmLevelUps = []; _gmNewLogros = []; _gmNewTreeNodes = []; return; }
  _gmLevelUps.forEach((lu, i) => setTimeout(() => gmLevelUpToast(lu), i * 700));
  _gmNewLogros.forEach((l, i) => setTimeout(() => gmLogroToast(l), (_gmLevelUps.length + i) * 700));
  _gmNewTreeNodes.forEach((n, i) => setTimeout(() => gmTreeToast(n), (_gmLevelUps.length + _gmNewLogros.length + i) * 700));
  if (GM.config.voz_jarvis_levelup && _gmLevelUps.length && window.JARVIS_VOICE && typeof JARVIS_VOICE.speak === 'function') {
    const m = _gmSkillMeta(_gmLevelUps[0].skill);
    try { JARVIS_VOICE.speak(`Subiste a nivel ${_gmLevelUps[0].to} en ${m.name}`); } catch (e) {}
  }
  _gmLevelUps = []; _gmNewLogros = []; _gmNewTreeNodes = [];
}
function gmTreeToast(n) {
  const el = document.createElement('div');
  el.className = 'gm-toast gm-toast-tree';
  el.innerHTML = `<span class="gm-toast-ico">${n.icon}</span><div><div class="gm-toast-t">¡Habilidad desbloqueada!</div><div class="gm-toast-s">${_gmEsc(n.name)}</div></div>`;
  _gmToastEl().appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 350); }, 3000);
}
function _gmToastEl() { let t = document.getElementById('gm-toast-stack'); if (!t) { t = document.createElement('div'); t.id = 'gm-toast-stack'; document.body.appendChild(t); } return t; }
function gmLevelUpToast(lu) {
  const m = _gmSkillMeta(lu.skill), meta = GM_CAT_META[m.cat];
  const el = document.createElement('div');
  el.className = 'gm-toast gm-toast-lvl'; el.style.setProperty('--sc', _gmThemeColor(meta.color));
  el.innerHTML = `<span class="gm-toast-ico">${meta.icon}</span><div><div class="gm-toast-t">¡Subiste a Nivel ${lu.to}!</div><div class="gm-toast-s">${_gmEsc(m.name)}</div></div>`;
  _gmToastEl().appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 350); }, 2600);
}
function gmLogroToast(l) {
  const r = GM_RARITY[l.rareza] || GM_RARITY.comun;
  const el = document.createElement('div');
  el.className = 'gm-toast gm-toast-logro'; el.style.setProperty('--rc', r.color);
  el.innerHTML = `<span class="gm-toast-ico">🏅</span><div><div class="gm-toast-t">${_gmEsc(l.name)}</div><div class="gm-toast-s">${r.label}</div></div>`;
  _gmToastEl().appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 350); }, 2800);
}
function gmFloatXp(anchor, xp) {
  if (!GM.config.animaciones) return;
  const r = anchor.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'gm-floatxp'; el.textContent = '+' + xp + ' XP';
  el.style.left = (r.left + r.width / 2) + 'px'; el.style.top = r.top + 'px';
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('go'));
  setTimeout(() => el.remove(), 1100);
}
