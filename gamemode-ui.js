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
// Íconos SVG de línea (estilo HUD/RPG) — reemplazan los emojis.
// Emblemas SÓLIDOS (estilo insignia/RPG) — fill por defecto; algunos paths internos llevan stroke propio.
const GM_ICONS = {
  strength: '<path d="M2 9.5h2.2v5H2zM4.2 8.3h2v7.4h-2zM17.8 8.3h2v7.4h-2zM20 9.5h2.2v5H20zM6 10.8h12v2.4H6z"/>',
  combat: '<path d="M14.8 3.2l2 2-7.6 7.6-2-2zM4.4 13.6l-1.2 1.2 3.4 3.4 1.2-1.2zM9.2 3.2l-2 2 7.6 7.6 2-2zM19.6 13.6l1.2 1.2-3.4 3.4-1.2-1.2z"/>',
  nutrition: '<path d="M20.5 3.5c.5 9-6.2 17-16.5 17-.4-9.5 6.5-17 16.5-17z"/><path fill="none" stroke="currentColor" stroke-width="1.3" stroke-opacity=".55" d="M6 18C9.5 13 14 9.5 18.5 7.5"/>',
  endurance: '<path d="M13.5 2L4 14.2h6.3L8 22l10.5-13.5H12z"/>',
  intellect: '<path d="M3 4.6l8.2 1.5v14.3L3 18.9zM21 4.6l-8.2 1.5v14.3l8.2-1.4z"/>',
  focus: '<path fill-rule="evenodd" d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 4.4a4.6 4.6 0 100 9.2 4.6 4.6 0 000-9.2z"/><circle cx="12" cy="12" r="1.7"/>',
  mind: '<path d="M12 1.8l7.6 6.4L12 22.2 4.4 8.2z"/><path fill="none" stroke="#0a1220" stroke-width="1.2" d="M5 8.4h14M12 2.2v19"/>',
  economist: '<path d="M3.4 13h3.1v7H3.4zM10.5 8.8h3.1V20h-3.1zM17.5 4.6h3.1V20h-3.1z"/>',
  ledger: '<path fill-rule="evenodd" d="M6 2.5h8.2L18.5 7v14.5H6zm3 6.5h6.5v1.6H9zm0 3.4h6.5v1.6H9zm0 3.4h4.6v1.6H9z"/>',
  faith: '<path d="M10 2h4v5.6h5.6v4H14V22h-4V11.6H4.4v-4H10z"/>',
  love: '<path d="M12 21.4C4.9 16 2.8 12 2.8 8.5 2.8 5.8 4.9 3.7 7.5 3.7c1.8 0 3.4.9 4.5 2.5 1.1-1.6 2.7-2.5 4.5-2.5 2.6 0 4.7 2.1 4.7 4.8 0 3.5-2.1 7.5-9.2 12.9z"/>',
  family: '<path d="M8 4a3.2 3.2 0 100 6.4A3.2 3.2 0 008 4zM16.4 5a2.6 2.6 0 100 5.2 2.6 2.6 0 000-5.2zM2.2 20.5c0-3.4 2.4-5.8 5.8-5.8s5.8 2.4 5.8 5.8zM14.4 20.5c0-2.4 1.7-4.4 4-4.4s4 2 4 4.4z"/>',
  cat: '<path d="M3.6 3.2l3.8 5.2h9.2l3.8-5.2-1.5 8.2c0 5.2-3.2 8.8-6.9 8.8s-6.9-3.6-6.9-8.8z"/><circle cx="9.4" cy="12.4" r="1.05" fill="#0a1220"/><circle cx="14.6" cy="12.4" r="1.05" fill="#0a1220"/>',
  execution: '<path d="M14 1.8l8.2 8.2-3.4 3.4-8.2-8.2zM9.6 6.2L1.4 15l3.6 3.6 8.6-8.2z"/>',
  responsibility: '<path fill-rule="evenodd" d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 3a6 6 0 100 12 6 6 0 000-12z"/><path d="M11 7.4h2v5.2l3.4 2-1 1.7-4.4-2.6z"/>',
  tools: '<path fill-rule="evenodd" d="M13.6 1.8l.6 2.6 2.4 1 2.3-1.4 1.9 1.9-1.4 2.3 1 2.4 2.6.6v2.6l-2.6.6-1 2.4 1.4 2.3-1.9 1.9-2.3-1.4-2.4 1-.6 2.6h-2.6l-.6-2.6-2.4-1-2.3 1.4-1.9-1.9 1.4-2.3-1-2.4L1.6 13.4v-2.6l2.6-.6 1-2.4L3.8 5.5l1.9-1.9 2.3 1.4 2.4-1 .6-2.6zM12 8.6a3.4 3.4 0 100 6.8 3.4 3.4 0 000-6.8z"/>',
  wealth: '<path d="M6 2.6h12L21.8 9 12 21.6 2.2 9z"/><path fill="none" stroke="#0a1220" stroke-width="1.2" d="M2.4 9h19.2M9 2.8L6 9l6 12.4L18 9l-3-6.2"/>',
  crown: '<path d="M2.4 18.2l2-10.8 4.8 4.9L12 3.8l2.8 8.5 4.8-4.9 2 10.8zM4 19.6h16V22H4z"/>',
  weapon: '<path fill-rule="evenodd" d="M12 4a8 8 0 100 16 8 8 0 000-16zm0 2.4a5.6 5.6 0 100 11.2 5.6 5.6 0 000-11.2z"/><path d="M11 1.4h2v4.2h-2zM11 18.4h2v4.2h-2zM1.4 11h4.2v2H1.4zM18.4 11h4.2v2h-4.2z"/><circle cx="12" cy="12" r="1.7"/>',
  license: '<path fill-rule="evenodd" d="M6 2.4h12v15.2l-6 4-6-4zm6 3.6a3.2 3.2 0 100 6.4 3.2 3.2 0 000-6.4z"/>',
  temperance: '<path d="M12 1.8l8.4 3.2v6.6c0 6.8-8.4 11-8.4 11s-8.4-4.2-8.4-11V5z"/><path fill="none" stroke="#0a1220" stroke-width="1.6" d="M8.6 12l2.4 2.4 4.4-4.6"/>',
  graduate: '<path d="M2 8l10-4.2L22 8l-10 4.2z"/><path d="M5.4 10.4v4.4c0 1.4 3 3.4 6.6 3.4s6.6-2 6.6-3.4v-4.4L12 13.4z"/><path d="M21 8v5.4l-1 .2V8z"/>',
  business: '<path fill-rule="evenodd" d="M6.4 6.4h11.2v11.2H6.4zm3.6 3.6h4v4h-4z"/><path d="M8.8 2.6h1.5v3.6H8.8zM13.7 2.6h1.5v3.6h-1.5zM8.8 17.8h1.5v3.6H8.8zM13.7 17.8h1.5v3.6h-1.5zM2.6 8.8h3.6v1.5H2.6zM2.6 13.7h3.6v1.5H2.6zM17.8 8.8h3.6v1.5h-3.6zM17.8 13.7h3.6v1.5h-3.6z"/>',
  medal: '<path d="M9 2.5l2.6 6 1.5-.6L11 2.2zM15 2.5l-2.6 6-1.5-.6L13 2.2z"/><path fill-rule="evenodd" d="M12 8.5a6 6 0 100 12 6 6 0 000-12zm0 3a3 3 0 100 6 3 3 0 000-6z"/>',
  home: '<path d="M12 2.2L21.8 11H19v9.4h-5.2v-5.2h-3.6v5.2H5V11H2.2z"/>',
  star: '<path d="M12 1.8l2.9 7 7.5.6-5.7 4.9 1.8 7.3L12 17.7 5.5 21.6l1.8-7.3L1.6 9.4l7.5-.6z"/>',
  integrity: '<circle cx="12" cy="12" r="2.4"/><g fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="12" cy="12" rx="10" ry="4.3"/><ellipse cx="12" cy="12" rx="10" ry="4.3" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4.3" transform="rotate(120 12 12)"/></g>',
};
const GM_NODE_ICON = {
  hombre_de_hierro: 'strength', combatiente: 'combat', saludable: 'nutrition', resistente: 'endurance', estudiante: 'intellect', alerta: 'focus', sereno: 'mind', aprendiz_de_capital: 'economist', ordenado: 'ledger', creyente: 'faith', atento: 'love', hijo_presente_n: 'family', protector_felino: 'cat', hacedor: 'execution', confiable: 'responsibility', aprendiz: 'tools',
  hombre_de_acero: 'strength', veterano_de_combate: 'combat', nutricionista: 'nutrition', incansable: 'endurance', letrado: 'intellect', enfocado: 'focus', estoico: 'mind', inversor: 'economist', austero: 'ledger', devoto_n: 'faith', companero: 'love', hijo_ejemplar: 'family', padre_felino: 'cat', ejecutor: 'execution', responsable: 'responsibility', programador: 'tools',
  patrimonio_en_marcha: 'wealth', base_solida: 'wealth', capital_creciente: 'wealth', independencia_visible: 'wealth', umbral_de_libertad: 'wealth', patrimonio_de_elite: 'crown',
  hombre_de_titanio: 'strength', letal: 'combat', impecable: 'nutrition', inagotable: 'endurance', jurista: 'intellect', imperturbable: 'focus', inquebrantable: 'mind', visionario_del_capital: 'economist', patrimonial: 'ledger', consagrado: 'faith', incondicional: 'love', hijo_de_honor: 'family', guardian_felino: 'cat', implacable: 'execution', inflexible: 'responsibility', arquitecto_digital: 'tools',
  manejo_de_armas: 'weapon', tenencia: 'weapon', marine: 'medal', templanza_real: 'temperance', catolico_practicante: 'faith', graduado: 'graduate', primer_ingreso_negocio_ia: 'business', coleccionista: 'medal',
  comandante_de_combate: 'combat', cuerpo_operativo: 'strength', mente_templada: 'intellect', doctor_en_potencia: 'graduate', forjador_de_riqueza: 'wealth', vida_ordenada: 'temperance', pilar_del_hogar: 'home', arquitecto_de_sistemas: 'execution',
  centinela: 'weapon', calculador: 'economist', metodico: 'responsibility', sosten: 'home', templado: 'strength', estudioso_del_sistema: 'tools', recto: 'temperance', presente_en_casa: 'home', templado_de_acero: 'combat',
  protector: 'temperance', estratega_total: 'economist', disciplinado: 'focus', proveedor: 'home', resiliente: 'faith', visionario: 'tools', sobrio: 'temperance', lider_silencioso: 'crown', inquebrantable_total: 'mind',
  hombre_de_familia: 'home', polimata: 'star', guerrero_sabio: 'combat', hombre_integro: 'integrity',
  lector_casual: 'intellect', lector_entusiasta: 'intellect', amante_libros: 'intellect', lector_supremo: 'crown',
};
function gmNodeSvg(n) { return `<svg viewBox="0 0 24 24" fill="currentColor" stroke-linejoin="round">${GM_ICONS[GM_NODE_ICON[n.id]] || GM_ICONS.star}</svg>`; }
const GM_TIER_LABELS = { 0: ['T0', 'INICIADO'], 1: ['T1', 'PROFESIONAL'], 1.5: ['T1.5', 'MAESTRÍA'], 2: ['T2', 'TECHO'], 2.5: ['T2.5', 'COMBINACIÓN'], 3: ['T3', 'CRUZADA'], 4: ['T4', 'CONVERGENCIA'], 5: ['T5', 'CIMA'] };
// Layout automático: filas por tier (Tier 5 arriba), x por categoría en la base y promedio de los
// nodos previos en los tiers de combinación (las uniones convergen sobre sus padres).
function gmTreeLayout() {
  const ROW_H = 168, MINGAP = GM_TREE_NODE_W + 14, CATW = 260;
  const catX = { cuerpo: 0, mente: 1, finanzas: 2, patrimonio: 3, espiritu: 4, vinculos: 5, trabajo: 6, cross: 3 };
  const tiers = [...new Set(GM_TREE_NODES.map(n => n.tier))].sort((a, b) => a - b);
  const maxRow = tiers.length - 1;
  const pos = {};
  tiers.forEach(t => {
    const row = tiers.indexOf(t);
    const y = row * ROW_H + 40;   // Tier 0 (iniciado) arriba → Cima abajo
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
    nodes += `<div class="gm-tnode ${cls}" style="left:${p.x}px;top:${p.y}px;--nc:var(${GM_TREE_CAT_COLOR[n.cat] || '--accent'})" onmouseenter="gmTreeHover('${n.id}')" onmouseleave="gmTreeHoverOut()" onclick="event.stopPropagation();gmTreeHover('${n.id}')">
      <div class="gm-tn-medal">
        <span class="gm-tn-bk tl"></span><span class="gm-tn-bk tr"></span><span class="gm-tn-bk bl"></span><span class="gm-tn-bk br"></span>
        <span class="gm-tn-ring"></span><span class="gm-tn-ring2"></span>
        <span class="gm-tn-core"><span class="gm-tn-scan"></span><span class="gm-tn-ico">${gmNodeSvg(n)}</span></span>
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
  world.innerHTML = `${strata}<svg class="gm-tree-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${paths}${sparks}</svg>${labels}${nodes}`;
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
  el.innerHTML = `<div class="gm-td-h"><span class="gm-td-tier">TIER ${String(n.tier)}</span><span class="gm-td-status">${status}</span></div>
    <div class="gm-td-name">${_gmEsc(n.name)}</div>
    <div class="gm-td-cat">${_gmEsc(catName)}${n.manual ? ' · manual' : ''}</div>
    ${reqM ? `<div class="gm-td-req"><b>REQUIERE</b>${_gmEsc(reqM)}</div>` : ''}
    ${reqN.length ? `<div class="gm-td-req"><b>UNE</b>${_gmEsc(reqN.join('  +  '))}</div>` : ''}`;
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
