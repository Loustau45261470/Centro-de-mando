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
const GM_ICONS = {
  strength: '<path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/>',
  combat: '<path d="M4 4l9 9M4 8V4h4M20 4l-9 9M20 8V4h-4M14 14l4 4-2 2-4-4M10 14l-4 4 2 2 4-4"/>',
  nutrition: '<path d="M5 19C6 11 11 5 19 5c0 8-5 14-13 14M5 19c3-4 7-7 11-8"/>',
  endurance: '<path d="M13 2L5 13h6l-2 9 10-13h-6z"/>',
  intellect: '<path d="M4 5h7v15H4zM20 5h-7v15h7z"/>',
  focus: '<path d="M12 4a8 8 0 100 16 8 8 0 000-16M12 9a3 3 0 100 6 3 3 0 000-6"/>',
  mind: '<path d="M12 3l8 6-8 12-8-12zM4 9h16M12 3v18"/>',
  economist: '<path d="M4 4v16h16M7 15l4-4 3 2 5-6"/>',
  ledger: '<path d="M6 3h9l3 3v15H6zM9 9h6M9 12h6M9 15h4"/>',
  faith: '<path d="M10 3h4v5h5v4h-5v9h-4v-9H5V8h5z"/>',
  love: '<path d="M12 20S4 14 4 9a4 4 0 018-1 4 4 0 018 1c0 5-8 11-8 11z"/>',
  family: '<path d="M8 5a3 3 0 100 6 3 3 0 000-6M16 6a2.5 2.5 0 100 5 2.5 2.5 0 000-5M3 20c0-3 2-5 5-5s5 2 5 5M14 20c0-2 2-4 3.5-4S21 18 21 20"/>',
  cat: '<path d="M5 4l3 5M19 4l-3 5M5 9c0 6 3 11 7 11s7-5 7-11c0-2-3-3-7-3S5 7 5 9zM9 13h.01M15 13h.01"/>',
  execution: '<path d="M14 3l7 7-3 3-7-7zM11 6l-8 8 3 3 8-8"/>',
  responsibility: '<path d="M12 4a8 8 0 100 16 8 8 0 000-16M12 8v4l3 2"/>',
  tools: '<path d="M15 5a4 4 0 00-5 5l-7 7 3 3 7-7a4 4 0 005-5l-3 3-2-2z"/>',
  wealth: '<path d="M6 3h12l3 6-9 12L3 9zM3 9h18M9 3L6 9l6 12 6-12-3-6"/>',
  crown: '<path d="M3 17l1.5-9 5 5L12 5l2.5 8 5-5L21 17z"/>',
  weapon: '<path d="M12 4a8 8 0 100 16 8 8 0 000-16M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  license: '<path d="M6 3h12v18l-6-3-6 3zM12 6a3 3 0 100 6 3 3 0 000-6"/>',
  temperance: '<path d="M12 3l7 3v6c0 5-7 9-7 9s-7-4-7-9V6z"/>',
  graduate: '<path d="M2 8l10-4 10 4-10 4zM6 10v5c0 1 3 3 6 3s6-2 6-3v-5"/>',
  business: '<path d="M7 7h10v10H7zM10 10h4v4h-4zM10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3"/>',
  medal: '<path d="M9 3l3 7 3-7M12 21a5 5 0 100-10 5 5 0 000 10M12 14l1 1"/>',
  home: '<path d="M4 11l8-7 8 7M6 10v9h12v-9M10 19v-5h4v5"/>',
  star: '<path d="M12 3l2.5 6 6.5.5-5 4.2 1.7 6.3L12 18l-5.7 3.3 1.7-6.3-5-4.2L9.5 9z"/>',
  integrity: '<path d="M12 21V7M12 21c-4 0-6.5-3-6.5-6.5M12 21c4 0 6.5-3 6.5-6.5M9 13c-2 0-3-1.5-3-3.5M15 13c2 0 3-1.5 3-3.5"/>',
};
const GM_NODE_ICON = {
  hombre_de_hierro: 'strength', combatiente: 'combat', saludable: 'nutrition', resistente: 'endurance', estudiante: 'intellect', alerta: 'focus', sereno: 'mind', aprendiz_de_capital: 'economist', ordenado: 'ledger', creyente: 'faith', atento: 'love', hijo_presente_n: 'family', protector_felino: 'cat', hacedor: 'execution', confiable: 'responsibility', aprendiz: 'tools',
  hombre_de_acero: 'strength', veterano_de_combate: 'combat', nutricionista: 'nutrition', incansable: 'endurance', letrado: 'intellect', enfocado: 'focus', estoico: 'mind', inversor: 'economist', austero: 'ledger', devoto_n: 'faith', companero: 'love', hijo_ejemplar: 'family', padre_felino: 'cat', ejecutor: 'execution', responsable: 'responsibility', programador: 'tools',
  patrimonio_en_marcha: 'wealth', base_solida: 'wealth', capital_creciente: 'wealth', independencia_visible: 'wealth', umbral_de_libertad: 'wealth', patrimonio_de_elite: 'crown',
  hombre_de_titanio: 'strength', letal: 'combat', impecable: 'nutrition', inagotable: 'endurance', jurista: 'intellect', imperturbable: 'focus', inquebrantable: 'mind', visionario_del_capital: 'economist', patrimonial: 'ledger', consagrado: 'faith', incondicional: 'love', hijo_de_honor: 'family', guardian_felino: 'cat', implacable: 'execution', inflexible: 'responsibility', arquitecto_digital: 'tools',
  manejo_de_armas: 'weapon', tenencia: 'license', templanza_real: 'temperance', catolico_practicante: 'faith', graduado: 'graduate', primer_ingreso_negocio_ia: 'business', coleccionista: 'medal',
  comandante_de_combate: 'combat', cuerpo_operativo: 'strength', mente_templada: 'intellect', doctor_en_potencia: 'graduate', forjador_de_riqueza: 'wealth', vida_ordenada: 'temperance', pilar_del_hogar: 'home', arquitecto_de_sistemas: 'execution',
  centinela: 'weapon', calculador: 'economist', metodico: 'responsibility', sosten: 'home', templado: 'strength', estudioso_del_sistema: 'tools', recto: 'temperance', presente_en_casa: 'home', templado_de_acero: 'combat',
  protector: 'temperance', estratega_total: 'economist', disciplinado: 'focus', proveedor: 'home', resiliente: 'faith', visionario: 'tools', sobrio: 'temperance', lider_silencioso: 'crown', inquebrantable_total: 'mind',
  hombre_de_familia: 'home', polimata: 'star', guerrero_sabio: 'combat', hombre_integro: 'integrity',
};
function gmNodeSvg(n) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${GM_ICONS[GM_NODE_ICON[n.id]] || GM_ICONS.star}</svg>`; }
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
  // conectores curvos (parent abajo → child arriba)
  let paths = '';
  GM_TREE_NODES.forEach(n => ((n.requires && n.requires.nodes) || []).forEach(pid => {
    const p = pos[pid], c = pos[n.id]; if (!p || !c) return;
    const on = unlocked.has(n.id) && unlocked.has(pid);
    const x1 = p.x + cx, y1 = p.y + MEDAL - 6, x2 = c.x + cx, y2 = c.y + 6;   // padre (arriba) → hijo (abajo)
    const my = (y1 + y2) / 2;
    paths += `<path d="M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}" class="gm-tpath${on ? ' on' : ''}" style="${on ? '--pc:var(' + (GM_TREE_CAT_COLOR[n.cat] || '--accent') + ')' : ''}"/>`;
  }));
  // medallones
  let nodes = '';
  GM_TREE_NODES.forEach(n => {
    const p = pos[n.id]; if (!p) return;
    const on = unlocked.has(n.id);
    const claimable = !on && n.manual && gmTreeReqMet(n, unlocked) && !claimed.has(n.id);
    const reqTxt = ((n.requires && n.requires.metrics) || []).map(gmTreeMetricLabel).join(' · ');
    const tier = String(n.tier).replace('.', '·');
    const cls = on ? 'on' : (claimable ? 'claim' : 'off');
    nodes += `<div class="gm-tnode ${cls}" style="left:${p.x}px;top:${p.y}px;--nc:var(${GM_TREE_CAT_COLOR[n.cat] || '--accent'})">
      <div class="gm-tn-medal">
        <span class="gm-tn-ring"></span><span class="gm-tn-ring2"></span>
        <span class="gm-tn-core"><span class="gm-tn-ico">${gmNodeSvg(n)}</span></span>
        <span class="gm-tn-tier">T${tier}</span>
        ${on ? '<span class="gm-tn-badge">✓</span>' : (n.manual ? '<span class="gm-tn-badge lock">◈</span>' : '<span class="gm-tn-badge lock">🔒</span>')}
      </div>
      <div class="gm-tn-name">${_gmEsc(n.name)}</div>
      ${on ? '' : `<div class="gm-tn-req">${_gmEsc(reqTxt || (n.requires.nodes && n.requires.nodes.length ? 'unir ramas' : 'manual'))}</div>`}
      ${claimable ? `<button class="gm-tn-claim" onclick="event.stopPropagation();gmClaimNode('${n.id}')">⟡ Reclamar</button>` : ''}
    </div>`;
  });
  const tierY = {}; GM_TREE_NODES.forEach(n => { if (pos[n.id]) tierY[n.tier] = pos[n.id].y; });
  let labels = '';
  Object.keys(GM_TIER_LABELS).forEach(t => {
    const ty = tierY[t]; if (ty == null) return; const L = GM_TIER_LABELS[t];
    labels += `<div class="gm-tier-label" style="top:${ty + 18}px"><span class="gm-tier-num">${L[0]}</span><span class="gm-tier-name">${L[1]}</span></div>`;
  });
  world.style.width = W + 'px'; world.style.height = H + 'px';
  world.innerHTML = `<svg class="gm-tree-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${paths}</svg>${labels}${nodes}`;
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
