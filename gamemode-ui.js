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
    gmRenderTree() +
    gmRenderDaily() +
    gmRenderEpics() +
    gmRenderLogros() +
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
  return `<div class="gm-card card gm-tree-cta" onclick="gmOpenTree()">
    <div class="gm-tree-cta-l"><span class="gm-tree-cta-ico">🌳</span>
      <div><div class="gm-tree-cta-t">Árbol de habilidades</div>
      <div class="gm-tree-cta-s">${unl}/${total} desbloqueadas · combiná niveles, logros y rachas</div></div></div>
    <span class="gm-tree-cta-btn">Abrir ›</span>
  </div>`;
}
const GM_TREE_NODE_W = 124;
const GM_TREE_CAT_COLOR = { cuerpo: '--c-salud', mente: '--c-conocimiento', finanzas: '--c-finanzas', espiritu: '--c-jarvis', vinculos: '--c-vida', trabajo: '--c-ia', patrimonio: '--accent', cross: '--hud-bright' };
let _gmTreeTx = 0, _gmTreeTy = 0, _gmTreeScale = 1, _gmTreeW = 0, _gmTreeH = 0;
// Iconos estilo "focus icon" (videojuego RPG): marco HEXAGONAL biselado cuyo metal cambia por
// rareza/tier (bronce → plata → oro → azul → violeta → cian → fuego → prismático), con remaches en
// los vértices, plato hundido y brillo especular. Escena interior detallada y multicolor. viewBox 0 0 64 64.
// Los gradientes viven en GM_TREE_DEFS (un <defs> global inyectado una vez en el árbol).
const GM_TREE_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<radialGradient id="gm-plate" cx=".5" cy=".34" r=".75"><stop offset="0" stop-color="#1b2738"/><stop offset=".66" stop-color="#0c1420"/><stop offset="1" stop-color="#05080e"/></radialGradient>
<linearGradient id="gm-stud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3cf"/><stop offset="1" stop-color="#6e4710"/></linearGradient>
<linearGradient id="gm-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffeaa6"/><stop offset=".5" stop-color="#e6b34c"/><stop offset="1" stop-color="#8a5e14"/></linearGradient>
<linearGradient id="gm-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f8fd"/><stop offset=".5" stop-color="#b2c2d4"/><stop offset="1" stop-color="#56697e"/></linearGradient>
<linearGradient id="gm-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9d92"/><stop offset=".5" stop-color="#e23b46"/><stop offset="1" stop-color="#7c1620"/></linearGradient>
<linearGradient id="gm-green" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bdf0c2"/><stop offset=".5" stop-color="#46b65f"/><stop offset="1" stop-color="#176030"/></linearGradient>
<linearGradient id="gm-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d3ebff"/><stop offset=".5" stop-color="#3f9bff"/><stop offset="1" stop-color="#123f78"/></linearGradient>
<linearGradient id="gm-cyan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dafff9"/><stop offset=".5" stop-color="#2fd4c4"/><stop offset="1" stop-color="#0c6760"/></linearGradient>
<linearGradient id="gm-purple" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ecd6ff"/><stop offset=".5" stop-color="#9a55ff"/><stop offset="1" stop-color="#3f1a82"/></linearGradient>
<linearGradient id="gm-orange" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffdca6"/><stop offset=".5" stop-color="#ff8e2e"/><stop offset="1" stop-color="#a83f08"/></linearGradient>
<linearGradient id="gm-brown" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8ab6c"/><stop offset=".5" stop-color="#9a6630"/><stop offset="1" stop-color="#54350f"/></linearGradient>
<radialGradient id="gm-energy" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".55" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="gm-rim-novice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8c39a"/><stop offset=".45" stop-color="#9c7c46"/><stop offset=".78" stop-color="#6b4f25"/><stop offset="1" stop-color="#3c2a10"/></linearGradient>
<linearGradient id="gm-rim-adept" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfdff"/><stop offset=".44" stop-color="#c2d0df"/><stop offset=".78" stop-color="#7d8ea1"/><stop offset="1" stop-color="#41505f"/></linearGradient>
<linearGradient id="gm-rim-master" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffeaa6"/><stop offset=".42" stop-color="#e6b34c"/><stop offset=".74" stop-color="#a9781f"/><stop offset="1" stop-color="#5c3c08"/></linearGradient>
<linearGradient id="gm-rim-grand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dff1ff"/><stop offset=".42" stop-color="#6cc0ff"/><stop offset=".74" stop-color="#2a7fd6"/><stop offset="1" stop-color="#123f73"/></linearGradient>
<linearGradient id="gm-rim-epic" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1ddff"/><stop offset=".42" stop-color="#b984ff"/><stop offset=".74" stop-color="#7d3ce0"/><stop offset="1" stop-color="#3f1a7a"/></linearGradient>
<linearGradient id="gm-rim-mythic" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6fff5"/><stop offset=".42" stop-color="#54e6cf"/><stop offset=".74" stop-color="#1f9f93"/><stop offset="1" stop-color="#0c5a54"/></linearGradient>
<linearGradient id="gm-rim-legend" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe3b0"/><stop offset=".4" stop-color="#ff9d3c"/><stop offset=".74" stop-color="#e0560f"/><stop offset="1" stop-color="#7d2a06"/></linearGradient>
<linearGradient id="gm-rim-supreme" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6ec7"/><stop offset=".26" stop-color="#ffd84a"/><stop offset=".5" stop-color="#5dffa0"/><stop offset=".74" stop-color="#54c8ff"/><stop offset="1" stop-color="#b06bff"/></linearGradient>
<linearGradient id="gm-bevel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".6"/><stop offset=".5" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
</defs></svg>`;
// Hexágono apuntado (coincide con el clip-path del medallón). Coordenadas en viewBox 0-64.
const GM_HEX_OUT = '32 1.4 59 16.7 59 47.3 32 62.6 5 47.3 5 16.7';
const GM_HEX_IN = '32 6.3 54.6 19.1 54.6 44.9 32 57.7 9.4 44.9 9.4 19.1';
// Marco hexagonal biselado: aro de rareza + plato hundido + remaches en vértices + brillo especular.
function gmFrame(rim) {
  const r = rim || 'gm-rim-master';
  const verts = [[32, 5.2], [56, 18.2], [56, 45.8], [32, 58.8], [8, 45.8], [8, 18.2]];
  let studs = '';
  for (const [x, y] of verts) studs += `<circle cx="${x}" cy="${y}" r="1.5" fill="url(#gm-stud)"/><circle cx="${x}" cy="${(y - 0.45).toFixed(2)}" r=".55" fill="#fff8e0" opacity=".75"/>`;
  return `<polygon points="${GM_HEX_OUT}" fill="url(#${r})"/>`
    + `<polygon points="${GM_HEX_OUT}" fill="none" stroke="#120c02" stroke-opacity=".55" stroke-width="1.1"/>`
    + `<polygon points="${GM_HEX_IN}" fill="url(#gm-plate)"/>`
    + `<polygon points="${GM_HEX_IN}" fill="none" stroke="#ffffff" stroke-opacity=".15" stroke-width="1"/>`
    + `<path d="M9.4 19.1 L32 6.3 L54.6 19.1" fill="none" stroke="url(#gm-bevel)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`
    + studs;
}
// Rareza por tier → gradiente del aro + color del aura/glow (usado por CSS via --rar).
const GM_RARITY_RIM = { 0: 'gm-rim-novice', 1: 'gm-rim-adept', 1.5: 'gm-rim-master', 2: 'gm-rim-grand', 2.5: 'gm-rim-epic', 3: 'gm-rim-mythic', 4: 'gm-rim-legend', 5: 'gm-rim-supreme' };
const GM_RARITY_COLOR = { 0: '#c79a4e', 1: '#cdddec', 1.5: '#ffce58', 2: '#5db4ff', 2.5: '#b06bff', 3: '#3fd9c4', 4: '#ff9436', 5: '#ff5fc4' };
const GM_RARITY_KEY = { 0: 'novice', 1: 'adept', 1.5: 'master', 2: 'grand', 2.5: 'epic', 3: 'mythic', 4: 'legend', 5: 'supreme' };
const GM_ICONS = {
  strength: '<rect x="22" y="30" width="20" height="4" rx="2" fill="url(#gm-steel)"/><rect x="22" y="30" width="20" height="1.5" rx=".7" fill="#fff" opacity=".4"/><rect x="12" y="22" width="7.5" height="20" rx="3" fill="url(#gm-gold)"/><rect x="44.5" y="22" width="7.5" height="20" rx="3" fill="url(#gm-gold)"/><rect x="19" y="25.5" width="4" height="13" rx="2" fill="url(#gm-steel)"/><rect x="41" y="25.5" width="4" height="13" rx="2" fill="url(#gm-steel)"/><rect x="13.4" y="24" width="2" height="9" rx="1" fill="#fff" opacity=".35"/><rect x="45.9" y="24" width="2" height="9" rx="1" fill="#fff" opacity=".35"/>',
  combat: '<g transform="translate(32 32) rotate(45)"><path d="M0 -20 L2.6 -15 L2.6 9 L-2.6 9 L-2.6 -15Z" fill="url(#gm-steel)"/><path d="M0 -20 L.6 -15 L.6 9 L-2.6 9 L-2.6 -15Z" fill="#fff" opacity=".22"/><rect x="-7" y="8.5" width="14" height="3.4" rx="1.3" fill="url(#gm-gold)"/><rect x="-2" y="11.5" width="4" height="8.5" rx="1.7" fill="url(#gm-gold)"/><circle cx="0" cy="21" r="2.3" fill="url(#gm-gold)"/></g><g transform="translate(32 32) rotate(-45)"><path d="M0 -20 L2.6 -15 L2.6 9 L-2.6 9 L-2.6 -15Z" fill="url(#gm-steel)"/><path d="M0 -20 L.6 -15 L.6 9 L-2.6 9 L-2.6 -15Z" fill="#fff" opacity=".22"/><rect x="-7" y="8.5" width="14" height="3.4" rx="1.3" fill="url(#gm-gold)"/><rect x="-2" y="11.5" width="4" height="8.5" rx="1.7" fill="url(#gm-gold)"/><circle cx="0" cy="21" r="2.3" fill="url(#gm-gold)"/></g><circle cx="32" cy="31" r="2.4" fill="#fff" opacity=".5"/>',
  nutrition: '<path d="M32 12C20 18 17 36 31 51 45 36 44 18 32 12Z" fill="url(#gm-green)"/><path d="M32 12C26 16 22 23 22 31 22 39 26 46 31 51 31 38 31 24 32 12Z" fill="#fff" opacity=".12"/><path d="M32 16V49" stroke="#0c3a1c" stroke-width="1.5" opacity=".5"/><path d="M32 26 39 21M32 33 40 28M32 26 25 21M32 33 24 28" stroke="#0c3a1c" stroke-width="1.1" opacity=".45"/><ellipse cx="27" cy="22" rx="2.8" ry="5" fill="#fff" opacity=".3" transform="rotate(-32 27 22)"/>',
  endurance: '<path d="M36 11 L18 35 H29 L25 53 L47 27 H35 Z" fill="url(#gm-gold)"/><path d="M36 11 L18 35 H29 Z" fill="#fff" opacity=".25"/><path d="M34 16 L24 31 H31 L29 41 Z" fill="#fff7d2" opacity=".55"/>',
  intellect: '<path d="M32 21C27 17 19 17 13 19.5V44C19 41.5 27 41.5 32 45.5Z" fill="url(#gm-steel)"/><path d="M32 21C37 17 45 17 51 19.5V44C45 41.5 37 41.5 32 45.5Z" fill="url(#gm-steel)"/><path d="M11 43 L32 47 L53 43 L53 46.5 L32 50.5 L11 46.5Z" fill="url(#gm-gold)"/><path d="M32 21V45.5" stroke="#33485e" stroke-width="1.6"/><path d="M17 26H28M17 30H28M17 34H27M36 26H47M36 30H47M36 34H46" stroke="#46586e" stroke-width="1" opacity=".7"/><path d="M14 21C19 19 25 19 30 22" fill="none" stroke="#fff" stroke-width="1.3" opacity=".3"/>',
  focus: '<circle cx="32" cy="32" r="16" fill="none" stroke="url(#gm-gold)" stroke-width="3.4"/><circle cx="32" cy="32" r="10" fill="none" stroke="url(#gm-steel)" stroke-width="2.6"/><circle cx="32" cy="32" r="4.2" fill="url(#gm-red)"/><circle cx="32" cy="32" r="4.2" fill="none" stroke="#fff" stroke-width=".8" opacity=".5"/><path d="M32 9V18M32 46V55M9 32H18M46 32H55" stroke="url(#gm-gold)" stroke-width="2.6" stroke-linecap="round"/><circle cx="27" cy="27" r="1.8" fill="#fff" opacity=".45"/>',
  mind: '<circle cx="32" cy="32" r="15" fill="url(#gm-energy)" opacity=".7"/><path d="M40 15C29 13 19 19 19 30 19 35 22 37 22 42V49H38V43C45 41 48 34 46 25 45 20 44 17 40 15Z" fill="url(#gm-steel)"/><path d="M40 15C36 14 31 14 27 16 34 17 38 21 40 28 41 34 38 40 35 43V49H38V43C45 41 48 34 46 25 45 20 44 17 40 15Z" fill="#fff" opacity=".1"/><g stroke="url(#gm-cyan)" stroke-width="1.5" fill="none"><path d="M29 24 34 28 30 33 36 37"/><path d="M34 28 40 26"/></g><circle cx="29" cy="24" r="1.7" fill="url(#gm-cyan)"/><circle cx="36" cy="37" r="1.7" fill="url(#gm-cyan)"/><circle cx="40" cy="26" r="1.5" fill="#dafff9"/>',
  economist: '<rect x="15" y="36" width="6" height="13" rx="1" fill="url(#gm-steel)"/><rect x="26" y="30" width="6" height="19" rx="1" fill="url(#gm-steel)"/><rect x="37" y="23" width="6" height="26" rx="1" fill="url(#gm-gold)"/><rect x="38.4" y="25" width="1.7" height="20" fill="#fff" opacity=".28"/><path d="M15 33 L26 27 L34 30 L49 15" fill="none" stroke="url(#gm-green)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M43 14 H50 V21" fill="none" stroke="url(#gm-green)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>',
  ledger: '<rect x="17" y="13" width="30" height="38" rx="3" fill="url(#gm-gold)"/><rect x="44" y="13" width="3" height="38" fill="#7a4f12" opacity=".5"/><rect x="20.5" y="16.5" width="22" height="31" rx="2" fill="url(#gm-plate)"/><path d="M25 24H39M25 29H39M25 34H35" stroke="#9db0c4" stroke-width="1.6" opacity=".7"/><rect x="19" y="15" width="2.6" height="34" rx="1" fill="#fff" opacity=".28"/>',
  faith: '<circle cx="32" cy="32" r="14" fill="url(#gm-energy)" opacity=".55"/><path d="M28 13H36V25H47V34H36V51H28V34H17V25H28Z" fill="url(#gm-gold)"/><rect x="28" y="13" width="2.4" height="38" fill="#fff" opacity=".22"/><circle cx="32" cy="29.5" r="3.1" fill="url(#gm-red)"/><circle cx="31" cy="28.5" r="1" fill="#fff" opacity=".6"/>',
  love: '<path d="M32 50C15 38 12 29 12 22 12 16 16 12 22 12 27 12 30 14 32 18 34 14 37 12 42 12 48 12 52 16 52 22 52 29 49 38 32 50Z" fill="url(#gm-red)"/><path d="M22 12C16 12 12 16 12 22 12 28 15 34 21 40 17 33 18 23 25 17 21 14 22 12 22 12Z" fill="#fff" opacity=".12"/><ellipse cx="22" cy="20" rx="3.3" ry="5" fill="#fff" opacity=".4" transform="rotate(-28 22 20)"/>',
  family: '<circle cx="24" cy="22" r="6.5" fill="url(#gm-steel)"/><path d="M13 49C13 39 18 33 24 33 30 33 35 39 35 49Z" fill="url(#gm-steel)"/><circle cx="42" cy="26" r="5" fill="url(#gm-gold)"/><path d="M34 49C34 41 38 36 42 36 46 36 50 41 50 49Z" fill="url(#gm-gold)"/><circle cx="22" cy="20" r="2" fill="#fff" opacity=".3"/><circle cx="40.5" cy="24.5" r="1.5" fill="#fff" opacity=".35"/>',
  cat: '<path d="M15 19 L23 30 H41 L49 19 L47 37C47 45 40 50 32 50 24 50 17 45 17 37Z" fill="url(#gm-steel)"/><path d="M15 19 L23 30 H32 V50 C24 50 17 45 17 37Z" fill="#fff" opacity=".07"/><path d="M19 22 L23.5 30 H21Z" fill="#0c1521"/><path d="M45 22 L40.5 30 H43Z" fill="#0c1521"/><circle cx="26" cy="36" r="2.1" fill="#2fd4c4"/><circle cx="38" cy="36" r="2.1" fill="#2fd4c4"/><circle cx="25.3" cy="35.3" r=".7" fill="#fff"/><circle cx="37.3" cy="35.3" r=".7" fill="#fff"/><path d="M30 42 32 44 34 42" fill="none" stroke="#0c1521" stroke-width="1.4"/><path d="M22 40 16 39M22 43 17 44.5M42 40 48 39M42 43 47 44.5" stroke="#cfe0f2" stroke-width=".9" opacity=".55"/>',
  execution: '<g transform="rotate(40 32 32)"><rect x="29.5" y="20" width="5" height="30" rx="2.2" fill="url(#gm-brown)"/><rect x="30.6" y="21" width="1.5" height="28" rx=".7" fill="#fff" opacity=".18"/><rect x="20" y="14" width="24" height="11" rx="2.5" fill="url(#gm-steel)"/><rect x="20" y="14" width="24" height="3.2" rx="1.5" fill="#fff" opacity=".3"/></g>',
  responsibility: '<circle cx="32" cy="32" r="17" fill="url(#gm-plate)" stroke="url(#gm-gold)" stroke-width="3.2"/><circle cx="32" cy="32" r="13" fill="none" stroke="#fff" stroke-width=".8" opacity=".12"/><g stroke="url(#gm-gold)" stroke-width="1.8" stroke-linecap="round"><path d="M32 18.5V21.5"/><path d="M45.5 32H42.5"/><path d="M32 45.5V42.5"/><path d="M18.5 32H21.5"/></g><path d="M32 22V32 L40 36" fill="none" stroke="url(#gm-steel)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="32" r="2.1" fill="url(#gm-gold)"/>',
  tools: '<path d="M32 14l3 3 4-1 1 4 4 2-2 4 2 4-4 2-1 4-4-1-3 3-3-3-4 1-1-4-4-2 2-4-2-4 4-2 1-4 4 1z" fill="url(#gm-steel)"/><path d="M32 14l3 3 4-1 1 4 4 2-2 4 2 4-4 2-1 4-4-1-3 3-3-3-4 1-1-4-4-2 2-4-2-4 4-2 1-4 4 1z" fill="none" stroke="url(#gm-gold)" stroke-width="1.3" opacity=".65"/><circle cx="32" cy="32" r="6" fill="url(#gm-plate)"/><circle cx="32" cy="32" r="6" fill="none" stroke="url(#gm-gold)" stroke-width="1.6"/><circle cx="32" cy="32" r="2.2" fill="url(#gm-gold)"/><path d="M27 17l2 2" stroke="#fff" stroke-width="1.4" opacity=".3" stroke-linecap="round"/>',
  wealth: '<ellipse cx="23" cy="45" rx="11" ry="3.8" fill="url(#gm-gold)"/><ellipse cx="23" cy="40.5" rx="11" ry="3.8" fill="url(#gm-gold)"/><ellipse cx="23" cy="36" rx="11" ry="3.8" fill="url(#gm-gold)"/><ellipse cx="23" cy="36" rx="11" ry="3.8" fill="none" stroke="#7a4f12" stroke-width=".7"/><circle cx="40" cy="25" r="12" fill="url(#gm-gold)" stroke="#7a4f12" stroke-width="1.4"/><circle cx="40" cy="25" r="12" fill="none" stroke="#fff" stroke-width=".8" opacity=".22"/><path d="M40 18.5v13M44 21.5h-5a2 2 0 000 4h2.5a2 2 0 010 4h-5" fill="none" stroke="#7a4f12" stroke-width="1.7" stroke-linecap="round"/><ellipse cx="36" cy="20" rx="3" ry="2" fill="#fff" opacity=".35" transform="rotate(-20 36 20)"/>',
  crown: '<path d="M13 45 L16 21 L25 31 L32 17 L39 31 L48 21 L51 45 Z" fill="url(#gm-gold)"/><path d="M13 45 L16 21 L25 31 L32 17 L32 45Z" fill="#fff" opacity=".12"/><rect x="13" y="44" width="38" height="6" rx="2" fill="url(#gm-gold)"/><rect x="13" y="44" width="38" height="2" rx="1" fill="#fff" opacity=".3"/><circle cx="32" cy="17" r="2.6" fill="url(#gm-red)"/><circle cx="16" cy="21" r="2.1" fill="url(#gm-red)"/><circle cx="48" cy="21" r="2.1" fill="url(#gm-red)"/><circle cx="26" cy="47" r="1.5" fill="url(#gm-red)"/><circle cx="38" cy="47" r="1.5" fill="url(#gm-red)"/>',
  weapon: '<g transform="rotate(-20 32 32)"><rect x="15" y="29" width="32" height="5" rx="1.6" fill="url(#gm-steel)"/><rect x="15" y="29" width="32" height="1.6" rx=".7" fill="#fff" opacity=".3"/><rect x="45" y="30.2" width="8" height="2.6" rx="1" fill="url(#gm-steel)"/><path d="M19 34 L16 45 H22 L25 34Z" fill="url(#gm-brown)"/><path d="M32 34 L35 47 H39 L36 34Z" fill="url(#gm-brown)"/><rect x="37.5" y="33" width="3.2" height="7" rx="1" fill="url(#gm-gold)"/></g>',
  license: '<path d="M32 12 L49 17 V31 C49 41 42 48 32 52 22 48 15 41 15 31 V17 Z" fill="url(#gm-plate)" stroke="url(#gm-gold)" stroke-width="2.8"/><path d="M32 12 L49 17 V31 C49 38 45 43 39 47 33 40 31 26 32 12Z" fill="#fff" opacity=".05"/><path d="M32 21l2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-.9Z" fill="url(#gm-gold)"/>',
  temperance: '<rect x="30.5" y="15" width="3" height="32" rx="1.4" fill="url(#gm-gold)"/><circle cx="32" cy="15" r="2.6" fill="url(#gm-gold)"/><path d="M15 21H49" stroke="url(#gm-gold)" stroke-width="2.6" stroke-linecap="round"/><path d="M15 21 L10 31 H20 Z" fill="url(#gm-steel)"/><path d="M49 21 L44 31 H54 Z" fill="url(#gm-steel)"/><path d="M15 21 L10 31 H15Z" fill="#fff" opacity=".22"/><path d="M49 21 L44 31 H49Z" fill="#fff" opacity=".22"/><rect x="25" y="46" width="14" height="3.4" rx="1.4" fill="url(#gm-gold)"/>',
  graduate: '<path d="M32 17 L53 26 L32 35 L11 26 Z" fill="url(#gm-gold)"/><path d="M32 17 L53 26 L32 35 Z" fill="#fff" opacity=".12"/><path d="M19 30 V40 C19 43.5 25 46.5 32 46.5 39 46.5 45 43.5 45 40 V30 L32 35.5 Z" fill="url(#gm-steel)"/><path d="M19 30 V40 C19 42 22 44 26 45 22 41 22 35 24 31Z" fill="#fff" opacity=".08"/><path d="M53 26 V38" stroke="url(#gm-gold)" stroke-width="1.8"/><circle cx="53" cy="40" r="2.4" fill="url(#gm-red)"/>',
  business: '<rect x="14" y="24" width="36" height="25" rx="3.5" fill="url(#gm-steel)"/><rect x="14" y="24" width="36" height="3" rx="1.5" fill="#fff" opacity=".25"/><path d="M24 24V20a4 4 0 014-4h8a4 4 0 014 4v4" fill="none" stroke="url(#gm-gold)" stroke-width="2.8"/><rect x="14" y="33" width="36" height="4" fill="#33485e" opacity=".55"/><rect x="28.5" y="31.5" width="7" height="7" rx="1.4" fill="url(#gm-gold)"/>',
  medal: '<path d="M23 13 L31 31 L25 33 L18 15 Z" fill="url(#gm-blue)"/><path d="M41 13 L33 31 L39 33 L46 15 Z" fill="url(#gm-red)"/><circle cx="32" cy="40" r="12" fill="url(#gm-gold)" stroke="#7a4f12" stroke-width="1.5"/><circle cx="32" cy="40" r="12" fill="none" stroke="#fff" stroke-width=".8" opacity=".22"/><path d="M32 32l2.4 5 5.4.8-3.9 3.8.9 5.3-4.8-2.5-4.8 2.5.9-5.3-3.9-3.8 5.4-.8Z" fill="url(#gm-plate)"/>',
  home: '<path d="M32 13 L53 31 H47 V50 H17 V31 H11 Z" fill="url(#gm-steel)"/><path d="M32 13 L53 31 H11 Z" fill="url(#gm-gold)"/><path d="M32 13 L53 31 H32Z" fill="#fff" opacity=".12"/><rect x="27" y="37" width="10" height="13" rx="1" fill="url(#gm-brown)"/><circle cx="34.5" cy="44" r="1" fill="url(#gm-gold)"/><rect x="19" y="34" width="6" height="6" rx="1" fill="#2fd4c4" opacity=".85"/>',
  star: '<circle cx="32" cy="31" r="16" fill="url(#gm-energy)" opacity=".6"/><path d="M32 12l5.6 13 14 1.1-10.6 9.2 3.2 13.7L32 41.6 19.8 49 23 35.3 12.4 26.1l14-1.1Z" fill="url(#gm-gold)"/><path d="M32 12l5.6 13L32 28Z" fill="#fff" opacity=".3"/><path d="M32 19 L35 26 L32 30 Z" fill="#fff7d2" opacity=".6"/><circle cx="44" cy="20" r="1.3" fill="#fff" opacity=".7"/><circle cx="21" cy="40" r="1" fill="#fff" opacity=".5"/>',
  integrity: '<circle cx="32" cy="32" r="16" fill="url(#gm-energy)" opacity=".55"/><g fill="none" stroke="url(#gm-steel)" stroke-width="2.4"><ellipse cx="32" cy="32" rx="19" ry="8"/><ellipse cx="32" cy="32" rx="19" ry="8" transform="rotate(60 32 32)"/><ellipse cx="32" cy="32" rx="19" ry="8" transform="rotate(120 32 32)"/></g><circle cx="32" cy="32" r="4.5" fill="url(#gm-gold)"/><circle cx="30.5" cy="30.5" r="1.3" fill="#fff" opacity=".6"/><circle cx="51" cy="32" r="2" fill="url(#gm-cyan)"/><circle cx="22" cy="15.5" r="2" fill="url(#gm-cyan)"/><circle cx="22" cy="48.5" r="2" fill="url(#gm-cyan)"/>',
};
const GM_NODE_ICON = {
  hombre_de_hierro: 'strength_1', combatiente: 'combat_1', saludable: 'nutrition_1', resistente: 'endurance_1', estudiante: 'intellect_1', alerta: 'focus_1', sereno: 'mind_1', aprendiz_de_capital: 'economist_1', ordenado: 'ledger_1', creyente: 'faith_1', atento: 'love_1', hijo_presente_n: 'family_1', protector_felino: 'cat_1', hacedor: 'execution_1', confiable: 'responsibility_1', aprendiz: 'tools_1',
  hombre_de_acero: 'strength_2', veterano_de_combate: 'combat_2', nutricionista: 'nutrition_2', incansable: 'endurance_2', letrado: 'intellect_2', enfocado: 'focus_2', estoico: 'mind_2', inversor: 'economist_2', austero: 'ledger_2', devoto_n: 'faith_2', companero: 'love_2', hijo_ejemplar: 'family_2', padre_felino: 'cat_2', ejecutor: 'execution_2', responsable: 'responsibility_2', programador: 'tools_2',
  patrimonio_en_marcha: 'patrimony', base_solida: 'patrimony', capital_creciente: 'patrimony', independencia_visible: 'gem', umbral_de_libertad: 'gem', patrimonio_de_elite: 'crown',
  hombre_de_titanio: 'strength_3', letal: 'combat_3', impecable: 'nutrition_3', inagotable: 'endurance_3', jurista: 'law', imperturbable: 'focus_3', inquebrantable: 'mind_3', visionario_del_capital: 'economist_3', patrimonial: 'ledger_3', consagrado: 'faith_3', incondicional: 'love_3', hijo_de_honor: 'family_3', guardian_felino: 'cat_3', implacable: 'execution_3', inflexible: 'responsibility_3', arquitecto_digital: 'tools_3',
  manejo_de_armas: 'firearm', tenencia: 'firearm', marine: 'marine', templanza_real: 'temperance', catolico_practicante: 'church', graduado: 'graduate', primer_ingreso_negocio_ia: 'robot', coleccionista: 'medal',
  comandante_de_combate: 'commander', cuerpo_operativo: 'operative', mente_templada: 'tempered_mind', doctor_en_potencia: 'doctor', forjador_de_riqueza: 'wealth_forge', vida_ordenada: 'dove', pilar_del_hogar: 'home_pillar', arquitecto_de_sistemas: 'architect',
  centinela: 'sentinel', calculador: 'abacus', metodico: 'method', sosten: 'support', templado: 'forged', estudioso_del_sistema: 'coder', recto: 'righteous', presente_en_casa: 'presence_home', templado_de_acero: 'steel_swords',
  protector: 'guardian', estratega_total: 'strategist', disciplinado: 'discipline', proveedor: 'provider', resiliente: 'resilient_star', visionario: 'oracle', sobrio: 'dove', lider_silencioso: 'crown', inquebrantable_total: 'diamond_mind',
  hombre_de_familia: 'great_family', polimata: 'polymath', guerrero_sabio: 'wise_warrior', hombre_integro: 'temple',
  lector_casual: 'reader_1', lector_entusiasta: 'reader_2', amante_libros: 'reader_3', lector_supremo: 'crown',
};
function gmNodeSvg(n) { return `<svg viewBox="0 0 64 64" stroke-linejoin="round">${gmFrame(GM_RARITY_RIM[n.tier])}${GM_ICONS[GM_NODE_ICON[n.id]] || GM_ICONS.star}</svg>`; }
// Emblemas de imagen (PNG generados con IA) que reemplazan al glyph SVG interior.
// Agregar aquí la KEY de cada concepto cuyo archivo emblems/<key>.png ya esté disponible.
// Mientras una key no esté en el set, ese nodo usa el glyph SVG de fallback (gmNodeSvg).
const GM_EMBLEM_HAVE = new Set([
  // Per-tier (escala real Novato→Adepto→Maestro)
  'strength_1','strength_2','strength_3','combat_1','combat_2','combat_3','nutrition_1','nutrition_2','nutrition_3','endurance_1','endurance_2','endurance_3','focus_1','focus_2','focus_3','mind_1','mind_2','mind_3',
  'intellect_1','intellect_2','economist_1','economist_2','economist_3','ledger_1','ledger_2','ledger_3','faith_1','faith_2','faith_3','love_1','love_2','love_3','family_1','family_2','family_3',
  'cat_1','cat_2','cat_3','execution_1','execution_2','execution_3','responsibility_1','responsibility_2','responsibility_3','tools_1','tools_2','tools_3','reader_1','reader_2','reader_3',
  // Sueltos + convergencias (emblema único)
  'church','firearm','patrimony','gem','crown','law','marine','temperance','graduate','robot','medal','commander','operative','tempered_mind','doctor','wealth_forge','dove','home_pillar','architect','sentinel','abacus','method','support','forged','coder','righteous','presence_home','steel_swords','guardian','strategist','discipline','provider','resilient_star','oracle','diamond_mind','great_family','polymath','wise_warrior','temple']);
// Renderiza el medallón: marco hexagonal de rareza SIEMPRE + (imagen del emblema si existe, si no glyph SVG).
function gmNodeArt(n) {
  const key = GM_NODE_ICON[n.id] || 'star';
  const has = GM_EMBLEM_HAVE.has(key);
  const frame = `<svg class="gm-tn-frame" viewBox="0 0 64 64" stroke-linejoin="round">${gmFrame(GM_RARITY_RIM[n.tier])}${has ? '' : (GM_ICONS[key] || GM_ICONS.star)}</svg>`;
  return has ? `${frame}<img class="gm-tn-photo" src="emblems/${key}.png" alt="" loading="lazy">` : frame;
}
const GM_TIER_LABELS = { 0: ['T0', 'INICIADO'], 1: ['T1', 'PROFESIONAL'], 1.5: ['T1.5', 'MAESTRÍA'], 2: ['T2', 'TECHO'], 2.5: ['T2.5', 'COMBINACIÓN'], 3: ['T3', 'CRUZADA'], 4: ['T4', 'CONVERGENCIA'], 5: ['T5', 'CIMA'] };
// Layout automático: filas por tier (Tier 0 arriba). Cada skill (cadena T0→T1→T1.5) tiene su
// PROPIA columna, así toda la progresión de un mismo hábito cae en una línea vertical recta.
// Las raíces sin nodo-prereq se reparten en columnas agrupadas por categoría; los hijos con un
// solo padre heredan su x exacta (cadena recta) y las uniones se centran sobre sus padres.
function gmTreeLayout() {
  const ROW_H = 172, COL_W = GM_TREE_NODE_W + 60, MINGAP = GM_TREE_NODE_W + 16;
  const catOrder = { cuerpo: 0, mente: 1, finanzas: 2, patrimonio: 3, espiritu: 4, vinculos: 5, trabajo: 6, cross: 7 };
  const parentsOf = n => (n.requires && n.requires.nodes) || [];
  const idx = id => GM_TREE_NODES.findIndex(n => n.id === id);
  // Columna dedicada por raíz independiente (sin nodo-prereq), ordenadas por categoría → tier → orden.
  const roots = GM_TREE_NODES.filter(n => parentsOf(n).length === 0)
    .sort((a, b) => (catOrder[a.cat] - catOrder[b.cat]) || (a.tier - b.tier) || (idx(a.id) - idx(b.id)));
  const rootX = {}; roots.forEach((n, i) => rootX[n.id] = i * COL_W);
  const tiers = [...new Set(GM_TREE_NODES.map(n => n.tier))].sort((a, b) => a - b);
  const pos = {};
  tiers.forEach(t => {
    const row = tiers.indexOf(t);
    const y = row * ROW_H + 40;   // Tier 0 (iniciado) arriba → Cima abajo
    const nodesT = GM_TREE_NODES.filter(n => n.tier === t);
    nodesT.forEach(n => {
      const pre = parentsOf(n).map(id => pos[id]).filter(Boolean);
      const x = parentsOf(n).length === 0 ? (rootX[n.id] || 0)
        : (pre.length ? pre.reduce((a, p) => a + p.x, 0) / pre.length : 0);
      pos[n.id] = { x, y };
    });
    // Nudge solo si dos nodos del MISMO tier se solapan (afecta uniones, no las cadenas rectas).
    const arr = nodesT.map(n => pos[n.id]).sort((a, b) => a.x - b.x);
    for (let i = 1; i < arr.length; i++) if (arr[i].x - arr[i - 1].x < MINGAP) arr[i].x = arr[i - 1].x + MINGAP;
  });
  const minX = Math.min(...Object.values(pos).map(p => p.x));
  Object.values(pos).forEach(p => p.x -= minX - 170);   // margen izquierdo para las etiquetas de tier
  return pos;
}
function gmTreeMetricLabel(c) {
  if (c.metric === 'patrimonio') return '$' + (c.value / 1000000) + 'M';
  const cur = gmMetric(c.metric);
  if (c.metric.indexOf('lvl_') === 0) return 'Nv ' + Math.min(cur, c.value) + '/' + c.value;
  return Math.min(cur, c.value) + '/' + c.value;
}
// Render del mundo (svg de conectores + medallones). No resetea pan/zoom.
function gmTreeRender() {
  const world = document.getElementById('gm-tree-world'); if (!world) return;
  const unlocked = new Set((GM.tree && GM.tree.unlocked) || []);
  const claimed = new Set((GM.tree && GM.tree.claimed) || []);
  const pos = gmTreeLayout();
  const cx = GM_TREE_NODE_W / 2, MEDAL = 96;
  const W = Math.max(...Object.values(pos).map(p => p.x)) + GM_TREE_NODE_W + 40;
  const H = Math.max(...Object.values(pos).map(p => p.y)) + 170;
  _gmTreeW = W; _gmTreeH = H;
  // conectores curvos (padre arriba → hijo abajo) + partículas de energía en activos
  let paths = '', sparks = '', pi = 0;
  GM_TREE_NODES.forEach(n => ((n.requires && n.requires.nodes) || []).forEach(pid => {
    const p = pos[pid], c = pos[n.id]; if (!p || !c) return;
    const on = unlocked.has(n.id) && unlocked.has(pid);
    const x1 = p.x + cx, y1 = p.y + MEDAL - 6, x2 = c.x + cx, y2 = c.y + 6;
    const my = (y1 + y2) / 2, id = 'gmp' + (pi++), col = GM_TREE_CAT_COLOR[n.cat] || '--accent';
    paths += `<path id="${id}" d="M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}" class="gm-tpath${on ? ' on' : ''}" style="${on ? '--pc:var(' + col + ')' : ''}"/>`;
    if (on) sparks += `<circle class="gm-tspark" r="2.6" style="--pc:var(${col})"><animateMotion dur="${(2 + (pi % 5) * 0.3).toFixed(2)}s" repeatCount="indefinite" rotate="auto"><mpath href="#${id}"/></animateMotion></circle>`;
  }));
  // medallones data-core
  let nodes = '';
  GM_TREE_NODES.forEach(n => {
    const p = pos[n.id]; if (!p) return;
    const on = unlocked.has(n.id);
    const claimable = !on && n.manual && gmTreeReqMet(n, unlocked) && !claimed.has(n.id);
    const reqTxt = ((n.requires && n.requires.metrics) || []).map(gmTreeMetricLabel).join(' · ');
    const tier = String(n.tier).replace('.', '·');
    const cls = on ? 'on' : (claimable ? 'claim' : 'off');
    nodes += `<div class="gm-tnode ${cls}" data-rar="${GM_RARITY_KEY[n.tier] || 'master'}" style="left:${p.x}px;top:${p.y}px;--nc:var(${GM_TREE_CAT_COLOR[n.cat] || '--accent'});--rar:${GM_RARITY_COLOR[n.tier] || '#ffce58'}" onmouseenter="gmTreeHover('${n.id}')" onmouseleave="gmTreeHoverOut()" onclick="event.stopPropagation();gmTreeHover('${n.id}')">
      <div class="gm-tn-medal">
        <span class="gm-tn-bk tl"></span><span class="gm-tn-bk tr"></span><span class="gm-tn-bk bl"></span><span class="gm-tn-bk br"></span>
        <span class="gm-tn-ring"></span><span class="gm-tn-ring2"></span>
        <span class="gm-tn-core"><span class="gm-tn-scan"></span><span class="gm-tn-ico">${gmNodeArt(n)}</span></span>
        <span class="gm-tn-tier">T${tier}</span>
        ${on ? '<span class="gm-tn-badge">✓</span>' : (claimable ? '<span class="gm-tn-badge rdy">!</span>' : '<span class="gm-tn-badge lock">' + (n.manual ? '◈' : '✕') + '</span>')}
      </div>
      <div class="gm-tn-name">${_gmEsc(n.name)}</div>
      ${on ? '' : `<div class="gm-tn-req">${_gmEsc(reqTxt || (n.requires.nodes && n.requires.nodes.length ? 'unir ramas' : 'manual'))}</div>`}
      ${claimable ? `<button class="gm-tn-claim" onclick="event.stopPropagation();gmClaimNode('${n.id}')">⟡ RECLAMAR</button>` : ''}
    </div>`;
  });
  // estratos por tier + etiquetas
  const tierY = {}; GM_TREE_NODES.forEach(n => { if (pos[n.id]) tierY[n.tier] = pos[n.id].y; });
  let strata = '', labels = '', si = 0;
  Object.keys(GM_TIER_LABELS).forEach(t => {
    const ty = tierY[t]; if (ty == null) return; const L = GM_TIER_LABELS[t];
    strata += `<div class="gm-tier-band${si++ % 2 ? ' alt' : ''}" style="top:${ty - 30}px;height:${MEDAL + 56}px;width:${W}px"></div>`;
    labels += `<div class="gm-tier-label" style="top:${ty + 8}px"><span class="gm-tier-num">${L[0]}</span><span class="gm-tier-name">${L[1]}</span></div>`;
  });
  world.style.width = W + 'px'; world.style.height = H + 'px';
  world.innerHTML = `${GM_TREE_DEFS}${strata}<svg class="gm-tree-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${paths}${sparks}</svg>${labels}${nodes}`;
  const cnt = document.getElementById('gm-tree-counter');
  if (cnt) cnt.textContent = unlocked.size + ' / ' + GM_TREE_NODES.length + ' desbloqueadas';
}
function gmTreeApply() { const w = document.getElementById('gm-tree-world'); if (w) w.style.transform = `translate(${_gmTreeTx}px,${_gmTreeTy}px) scale(${_gmTreeScale})`; }
function gmTreeFit() {
  const vp = document.getElementById('gm-tree-viewport'); if (!vp || !_gmTreeW) return;
  const vw = vp.clientWidth, vh = vp.clientHeight;
  _gmTreeScale = Math.min(vw / _gmTreeW, vh / _gmTreeH, 1.1) * 0.94;
  _gmTreeTx = (vw - _gmTreeW * _gmTreeScale) / 2;
  _gmTreeTy = (vh - _gmTreeH * _gmTreeScale) / 2;
  gmTreeApply();
}
function gmTreeZoom(dir) {
  const vp = document.getElementById('gm-tree-viewport'); if (!vp) return;
  const f = dir > 0 ? 1.2 : 1 / 1.2;
  const ns = Math.max(0.2, Math.min(2.8, _gmTreeScale * f));
  const cx = vp.clientWidth / 2, cy = vp.clientHeight / 2;
  _gmTreeTx = cx - (cx - _gmTreeTx) * (ns / _gmTreeScale);
  _gmTreeTy = cy - (cy - _gmTreeTy) * (ns / _gmTreeScale);
  _gmTreeScale = ns; gmTreeApply();
}
function gmTreeInitPanZoom() {
  const vp = document.getElementById('gm-tree-viewport'); if (!vp || vp._gmInit) return; vp._gmInit = true;
  const pts = new Map(); let pinch = 0;
  vp.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { vp.setPointerCapture(e.pointerId); } catch (err) {} });
  vp.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { _gmTreeTx += e.clientX - prev.x; _gmTreeTy += e.clientY - prev.y; gmTreeApply(); }
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()]; const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const r = vp.getBoundingClientRect(); const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      if (pinch) { const ns = Math.max(0.2, Math.min(2.8, _gmTreeScale * (dist / pinch)));
        _gmTreeTx = mx - (mx - _gmTreeTx) * (ns / _gmTreeScale); _gmTreeTy = my - (my - _gmTreeTy) * (ns / _gmTreeScale); _gmTreeScale = ns; gmTreeApply(); }
      pinch = dist;
    }
  });
  const up = e => { pts.delete(e.pointerId); pinch = 0; };
  vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
  vp.addEventListener('wheel', e => {
    e.preventDefault(); const r = vp.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    const ns = Math.max(0.2, Math.min(2.8, _gmTreeScale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    _gmTreeTx = mx - (mx - _gmTreeTx) * (ns / _gmTreeScale); _gmTreeTy = my - (my - _gmTreeTy) * (ns / _gmTreeScale);
    _gmTreeScale = ns; gmTreeApply();
  }, { passive: false });
}
function gmOpenTree() {
  const ov = document.getElementById('gm-tree-overlay'); if (!ov) return;
  ov.classList.add('show');
  gmTreeRender();
  gmTreeInitPanZoom();
  requestAnimationFrame(() => requestAnimationFrame(gmTreeFit));
}
function gmCloseTree() { const ov = document.getElementById('gm-tree-overlay'); if (ov) ov.classList.remove('show'); }
function gmTreeHover(id) {
  const el = document.getElementById('gm-tree-detail'); if (!el) return;
  const n = GM_TREE_NODES.find(x => x.id === id); if (!n) return;
  const on = ((GM.tree && GM.tree.unlocked) || []).includes(id);
  const claimable = !on && n.manual && gmTreeReqMet(n, new Set((GM.tree && GM.tree.unlocked) || [])) && !((GM.tree && GM.tree.claimed) || []).includes(id);
  const catName = (GM_CAT_META[n.cat] && GM_CAT_META[n.cat].name) || (n.cat === 'patrimonio' ? 'Patrimonio' : n.cat === 'cross' ? 'Suprema' : n.cat);
  const reqM = ((n.requires && n.requires.metrics) || []).map(gmTreeMetricLabel).join(' · ');
  const reqN = ((n.requires && n.requires.nodes) || []).map(pid => { const m = GM_TREE_NODES.find(x => x.id === pid); return m ? m.name : pid; });
  const status = on ? '● ACTIVA' : (claimable ? '◈ LISTA PARA RECLAMAR' : '○ BLOQUEADA');
  el.style.setProperty('--nc', 'var(' + (GM_TREE_CAT_COLOR[n.cat] || '--accent') + ')');
  el.className = 'show' + (on ? ' on' : '');
  el.innerHTML = `<div class="gm-td-top">
      <div class="gm-td-ico" data-rar="${GM_RARITY_KEY[n.tier] || 'master'}" style="--rar:${GM_RARITY_COLOR[n.tier] || '#ffce58'}">${gmNodeArt(n)}</div>
      <div class="gm-td-titles">
        <div class="gm-td-h"><span class="gm-td-tier">TIER ${String(n.tier)}</span><span class="gm-td-status">${status}</span></div>
        <div class="gm-td-name">${_gmEsc(n.name)}</div>
        <div class="gm-td-cat">${_gmEsc(catName)}${n.manual ? ' · manual' : ''}</div>
      </div>
    </div>
    ${reqM ? `<div class="gm-td-req"><b>REQUIERE</b>${_gmEsc(reqM)}</div>` : ''}
    ${reqN.length ? `<div class="gm-td-req"><b>UNE</b>${_gmEsc(reqN.join('  +  '))}</div>` : ''}`;
  // re-disparar la animación de "pop" en cada apertura
  void el.offsetWidth; el.classList.add('pop');
}
function gmTreeHoverOut() { const el = document.getElementById('gm-tree-detail'); if (el && !('ontouchstart' in window)) el.classList.remove('show'); }
function gmClaimNode(id) {
  GM.tree.claimed = GM.tree.claimed || [];
  if (!GM.tree.claimed.includes(id)) GM.tree.claimed.push(id);
  gmRunEngine(); gmRenderAll(); gmTreeRender(); gmFlushFeedback();
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
