// ════════════════════════════════════════════════════════
// PLANNER MOTIVATIONAL QUOTES
// ════════════════════════════════════════════════════════
(function initPlannerQuotes() {
  const quotes = [
    'Planifica tu tiempo y tu concentración',
    '"Actuar sin planear es la causa de cada fracaso"',
    'Lista de 3: trabaja con máximo 3 tareas importantes al día; lo demás es secundario',
  ];
  let idx = 0;
  const BASE_FONT = 13.5, MIN_FONT = 8;
  function fitOneLine(el) {
    let size = BASE_FONT;
    el.style.fontSize = size + 'px';
    while (el.scrollWidth > el.clientWidth && size > MIN_FONT) {
      size -= 0.5;
      el.style.fontSize = size + 'px';
    }
  }
  function rotate() {
    const el = document.getElementById('plannerQuoteText');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => {
      el.textContent = quotes[idx];
      fitOneLine(el);
      el.style.opacity = '1';
      idx = (idx + 1) % quotes.length;
    }, 460);
  }
  rotate();
  setInterval(rotate, 7000);
})();

// ════════════════════════════════════════════════════════
// PROYECTOS WORKSPACE
// ════════════════════════════════════════════════════════
(function() {
  const TABS = ['vida', 'finanzas', 'salud', 'conocimiento', 'ia'];
  const storageKey = tab => 'proyectos_' + tab + '_v1';

  const ICONS = ['📁','📂','🚀','🎯','⭐','📋','🛠️','💡','📝','🔍','🌐','💼','📌','🔖','🏆','⚡','🧠','🔧','📊','✅'];

  const DEFAULTS = {
    vida:         [{ id: uid(), label: 'Proyectos personales', icon: '📁', open: true, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] }],
    finanzas:     [{ id: uid(), label: 'Proyectos financieros', icon: '📁', open: true, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] }],
    salud:        [{ id: uid(), label: 'Proyectos de salud', icon: '📁', open: true, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] }],
    conocimiento: [{ id: uid(), label: 'Proyectos de estudio', icon: '📁', open: true, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] }],
    ia:           [{ id: uid(), label: 'Proyectos de IA', icon: '📁', open: true, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] }],
  };

  function migrateOrDefault(tab) {
    const tree = JSON.parse(JSON.stringify(DEFAULTS[tab] || []));
    const ideas = (typeof S !== 'undefined' && S.ideas && S.ideas[tab]) ? S.ideas[tab] : [];
    if (ideas.length) {
      const folder = { id: uid(), label: 'Ideas migradas', icon: '💡', open: true, description: '', notes: '', detailOpen: false, children: [] };
      ideas.forEach(idea => {
        folder.children.push({ id: idea.id || uid(), label: idea.title || 'Sin título', icon: '📝', open: false, description: idea.description || '', notes: idea.notes || '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] });
      });
      tree.push(folder);
    }
    return tree;
  }

  function loadTree(tab) {
    // Prefer S.proyectos (Firebase-synced) when available
    if (typeof S !== 'undefined' && S.proyectos?.[tab] != null) return S.proyectos[tab];
    // Fall back to old localStorage key (will be migrated on next loadState)
    try { const r = localStorage.getItem(storageKey(tab)); return r ? JSON.parse(r) : migrateOrDefault(tab); }
    catch { return migrateOrDefault(tab); }
  }

  function saveTree(tab, tree) {
    localStorage.setItem(storageKey(tab), JSON.stringify(tree)); // cache local
    if (typeof S !== 'undefined') {
      if (!S.proyectos) S.proyectos = {};
      S.proyectos[tab] = tree;
      if (typeof saveState === 'function') saveState(); // sync a Firebase
    }
  }

  const trees = {};
  TABS.forEach(t => { trees[t] = loadTree(t); });

  function renderProyectos(tab) {
    const wrap = document.getElementById('proyectos-wrap-' + tab);
    if (!wrap) return;
    if (!trees[tab]) trees[tab] = loadTree(tab);
    wrap.innerHTML = '';
    const ws = document.createElement('div');
    ws.className = 'proy-workspace';

    const hdr = document.createElement('div');
    hdr.className = 'proy-header';
    hdr.style.cursor = 'pointer';
    hdr.innerHTML = `<div class="proy-header-title">🗂️ Proyectos</div>`;

    const hdrRight = document.createElement('div');
    hdrRight.style.cssText = 'display:flex;align-items:center;gap:8px';

    const addBtn = document.createElement('button');
    addBtn.className = 'proy-add-root-btn';
    addBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Nuevo proyecto`;
    addBtn.onclick = e => { e.stopPropagation(); addRootNode(tab); };

    const proyCKey = 'proy_collapsed_' + tab;
    const proyChevron = document.createElement('span');
    proyChevron.className = 'card-collapse-chevron';
    proyChevron.textContent = '▾';

    hdrRight.append(addBtn, proyChevron);
    hdr.appendChild(hdrRight);

    const treeEl = document.createElement('div');
    treeEl.className = 'proy-tree';
    trees[tab].forEach(node => treeEl.appendChild(buildNodeEl(tab, node, 0)));

    // Restore collapsed state
    if (localStorage.getItem(proyCKey) === '1') {
      treeEl.style.cssText = 'max-height:0;overflow:hidden;opacity:0';
      proyChevron.style.transform = 'rotate(-90deg)';
    }

    hdr.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const isCollapsed = treeEl.style.maxHeight === '0px';
      if (isCollapsed) {
        treeEl.style.cssText = 'max-height:4000px;overflow:hidden;opacity:1;transition:max-height .28s ease,opacity .22s ease';
        proyChevron.style.transform = '';
        localStorage.setItem(proyCKey, '');
      } else {
        treeEl.style.cssText = 'max-height:0;overflow:hidden;opacity:0;transition:max-height .28s ease,opacity .22s ease';
        proyChevron.style.transform = 'rotate(-90deg)';
        localStorage.setItem(proyCKey, '1');
      }
    });

    ws.appendChild(hdr);
    ws.appendChild(treeEl);
    wrap.appendChild(ws);
  }

  function buildNodeEl(tab, node, depth) {
    const wrapper = document.createElement('div');
    wrapper.className = 'proy-node';
    wrapper.dataset.depth = depth;
    wrapper.dataset.id = node.id;

    const headerEl = document.createElement('div');
    headerEl.className = 'proy-node-header';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'proy-toggle-btn' + (node.open ? ' open' : '');
    toggleBtn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`;
    toggleBtn.onclick = e => { e.stopPropagation(); toggleChildren(tab, node); };

    const checkEl = document.createElement('div');
    checkEl.className = 'proy-check' + (node.done ? ' done' : '');
    checkEl.title = node.done ? 'Marcar como pendiente' : 'Marcar como completado';
    checkEl.onclick = e => {
      e.stopPropagation();
      node.done = !node.done;
      if (node.done) { node.advances = node.advances || []; node.advances.push(getActiveDate()); }
      checkEl.classList.toggle('done', node.done);
      checkEl.title = node.done ? 'Marcar como pendiente' : 'Marcar como completado';
      labelEl.classList.toggle('done', node.done);
      if (node.done && window.JARVIS) JARVIS.onTaskDone();
      saveTree(tab, trees[tab]);
      if (typeof renderReminders === 'function') renderReminders(tab);
    };

    const iconEl = document.createElement('span');
    iconEl.className = 'proy-node-icon';
    iconEl.textContent = node.icon || '📁';

    const labelEl = document.createElement('span');
    labelEl.className = 'proy-node-label' + (node.done ? ' done' : '');
    labelEl.contentEditable = 'true';
    labelEl.spellcheck = false;
    labelEl.textContent = node.label;
    labelEl.onclick = e => e.stopPropagation();
    labelEl.onblur = () => { node.label = labelEl.textContent.trim() || node.label; labelEl.textContent = node.label; saveTree(tab, trees[tab]); };
    labelEl.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); labelEl.blur(); } };

    const countEl = document.createElement('span');
    countEl.className = 'proy-node-count';
    if ((node.children || []).length) countEl.textContent = node.children.length;

    const priorityEl = node.priority ? document.createElement('span') : null;
    if (priorityEl) {
      const labels = { '1': 'P1', '2': 'P2', '3': 'P3' };
      priorityEl.className = 'proy-priority p' + node.priority;
      priorityEl.textContent = labels[node.priority] || '';
    }

    const dueEl = node.dueDate ? document.createElement('span') : null;
    if (dueEl) {
      const today = new Date(); today.setHours(0,0,0,0);
      const due = new Date(node.dueDate + 'T00:00:00');
      const diff = Math.round((due - today) / 86400000);
      dueEl.className = 'proy-due' + (diff < 0 ? ' overdue' : diff <= 3 ? ' soon' : '');
      const [y, m, d] = node.dueDate.split('-');
      dueEl.textContent = d + '/' + m + '/' + y.slice(2);
      dueEl.title = diff < 0 ? 'Vencido hace ' + Math.abs(diff) + ' día(s)' : diff === 0 ? 'Vence hoy' : 'Vence en ' + diff + ' día(s)';
    }

    const actionsEl = document.createElement('div');
    actionsEl.className = 'proy-node-actions';

    const detailBtn = makeBtn(`<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`, 'Detalles');
    detailBtn.onclick = e => { e.stopPropagation(); openDetailModal(tab, node); };

    const addFolderBtn = makeBtn(`<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`, 'Subcarpeta');
    addFolderBtn.onclick = e => { e.stopPropagation(); addChildNode(tab, node, true); };

    const addItemBtn = makeBtn(`<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`, 'Agregar tarea');
    addItemBtn.onclick = e => { e.stopPropagation(); addChildNode(tab, node, false); };

    const iconBtn = makeBtn(`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`, 'Cambiar ícono');
    iconBtn.onclick = e => { e.stopPropagation(); pickIcon(tab, node, iconEl); };

    const delBtn = makeBtn(`<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`, 'Eliminar');
    delBtn.className += ' danger';
    delBtn.onclick = e => { e.stopPropagation(); deleteNode(tab, node.id); };

    actionsEl.append(detailBtn, addFolderBtn, addItemBtn, iconBtn, delBtn);
    const metaEls = [countEl];
    if (priorityEl) metaEls.push(priorityEl);
    if (dueEl) metaEls.push(dueEl);
    headerEl.append(toggleBtn, checkEl, iconEl, labelEl, ...metaEls, actionsEl);
    headerEl.onclick = () => toggleChildren(tab, node);

    // Detail panel
    const detailPanel = document.createElement('div');
    detailPanel.className = 'proy-detail-panel' + (node.detailOpen ? ' open' : '');
    detailPanel.dataset.detailFor = node.id;
    if (node.description || node.notes) {
      const body = document.createElement('div');
      body.className = 'proy-detail-body';
      if (node.description) body.innerHTML += `<div class="proy-detail-field"><div class="proy-detail-label">Descripción</div><div class="proy-detail-text">${esc(node.description)}</div></div>`;
      if (node.notes) body.innerHTML += `<div class="proy-detail-field"><div class="proy-detail-label">Notas</div><div class="proy-detail-text">${esc(node.notes)}</div></div>`;
      detailPanel.appendChild(body);
    }

    // Children
    const childrenEl = document.createElement('div');
    childrenEl.className = 'proy-children' + (node.open ? '' : ' collapsed');
    childrenEl.dataset.childrenFor = node.id;
    (node.children || []).forEach(child => childrenEl.appendChild(buildNodeEl(tab, child, depth + 1)));
    childrenEl.appendChild(buildAddRow(tab, node));

    const _prog = node.done ? 100 : (+node.progress || 0);
    let progEl = null;
    if (_prog > 0 && _prog < 100) {
      progEl = document.createElement('div');
      progEl.className = 'proy-progress';
      progEl.innerHTML = `<div class="proy-progress-track"><div class="proy-progress-fill" style="width:${_prog}%"></div></div><span class="proy-progress-pct">${_prog}%</span>`;
    }
    wrapper.append(headerEl, ...(progEl ? [progEl] : []), detailPanel, childrenEl);
    return wrapper;
  }

  function buildAddRow(tab, node) {
    const row = document.createElement('div');
    row.className = 'proy-add-row';
    const input = document.createElement('input');
    input.className = 'proy-add-input';
    input.placeholder = '+ Nueva tarea o sub-proyecto…';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'proy-add-confirm-btn';
    confirmBtn.innerHTML = `<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    const doAdd = () => {
      const val = input.value.trim(); if (!val) return;
      if (!node.children) node.children = [];
      node.children.push({ id: uid(), label: val, icon: '📄', open: false, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] });
      node.open = true;
      saveTree(tab, trees[tab]); renderProyectos(tab); input.value = '';
    };
    confirmBtn.onclick = doAdd;
    input.onkeydown = e => { if (e.key === 'Enter') doAdd(); };
    row.append(input, confirmBtn);
    return row;
  }

  function makeBtn(svg, title) {
    const b = document.createElement('button');
    b.className = 'proy-node-action-btn'; b.title = title; b.innerHTML = svg; return b;
  }

  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }

  function toggleChildren(tab, node) {
    node.open = !node.open;
    saveTree(tab, trees[tab]);
    const c = document.querySelector(`[data-children-for="${node.id}"]`);
    const t = document.querySelector(`[data-id="${node.id}"] > .proy-node-header .proy-toggle-btn`);
    if (c) c.classList.toggle('collapsed', !node.open);
    if (t) t.classList.toggle('open', node.open);
  }

  function addRootNode(tab) {
    const n = { id: uid(), label: 'Nuevo proyecto', icon: '📁', open: true, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] };
    trees[tab].push(n); saveTree(tab, trees[tab]); renderProyectos(tab);
    if (window.JARVIS) JARVIS.onNewProject();
    setTimeout(() => { const el = document.querySelector(`[data-id="${n.id}"] .proy-node-label`); if (el) { el.focus(); selAll(el); } }, 50);
  }

  function addChildNode(tab, parent, isFolder) {
    const n = { id: uid(), label: isFolder ? 'Nueva carpeta' : 'Nueva tarea', icon: isFolder ? '📁' : '📄', open: false, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] };
    if (!parent.children) parent.children = [];
    parent.children.push(n); parent.open = true;
    saveTree(tab, trees[tab]); renderProyectos(tab);
    setTimeout(() => { const el = document.querySelector(`[data-id="${n.id}"] .proy-node-label`); if (el) { el.focus(); selAll(el); } }, 50);
  }

  function deleteNode(tab, id) {
    if (!confirm('¿Eliminar este elemento y todo su contenido?')) return;
    if (window.JARVIS) JARVIS.onDeleteProject();
    trees[tab] = removeById(trees[tab], id);
    saveTree(tab, trees[tab]); renderProyectos(tab);
    if (typeof renderReminders === 'function') renderReminders(tab);
  }

  function removeById(nodes, id) {
    return nodes.filter(n => n.id !== id).map(n => ({ ...n, children: n.children ? removeById(n.children, id) : [] }));
  }

  function findById(nodes, id) {
    for (const n of nodes) { if (n.id === id) return n; const f = findById(n.children || [], id); if (f) return f; }
    return null;
  }

  function pickIcon(tab, node, iconEl) {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;z-index:9999;background:#1a1a1f;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px;display:grid;grid-template-columns:repeat(5,1fr);gap:4px;max-width:190px;box-shadow:0 8px 32px rgba(0,0,0,.6)';
    const rect = iconEl.getBoundingClientRect();
    p.style.top = Math.min(rect.bottom + 4, window.innerHeight - 160) + 'px';
    p.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
    ICONS.forEach(ic => {
      const b = document.createElement('button');
      b.textContent = ic;
      b.style.cssText = 'background:none;border:none;cursor:pointer;font-size:18px;padding:5px;border-radius:6px;transition:background .1s';
      b.onmouseover = () => b.style.background = 'rgba(255,255,255,.1)';
      b.onmouseout = () => b.style.background = 'none';
      b.onclick = () => { node.icon = ic; iconEl.textContent = ic; saveTree(tab, trees[tab]); document.body.removeChild(p); };
      p.appendChild(b);
    });
    document.body.appendChild(p);
    const close = e => { if (!p.contains(e.target)) { if (p.parentNode) document.body.removeChild(p); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  function selAll(el) { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }

  function openDetailModal(tab, node) {
    document.getElementById('proyDetailModalTitle').textContent = 'Detalles — ' + node.label;
    document.getElementById('proyDetailTab').value      = tab;
    document.getElementById('proyDetailId').value       = node.id;
    document.getElementById('proyDetailLabel').value    = node.label;
    document.getElementById('proyDetailDesc').value     = node.description || '';
    document.getElementById('proyDetailNotes').value    = node.notes || '';
    document.getElementById('proyDetailPriority').value = node.priority || '';
    document.getElementById('proyDetailDue').value      = node.dueDate || '';
    const _dp = node.done ? 100 : (+node.progress || 0);
    document.getElementById('proyDetailProg').value = _dp;
    document.getElementById('proyDetailProgVal').textContent = _dp;
    openModal('modal-proy-detail');
  }

  window.proyDetailSave = function() {
    const tab   = document.getElementById('proyDetailTab').value;
    const id    = document.getElementById('proyDetailId').value;
    const label = document.getElementById('proyDetailLabel').value.trim();
    if (!label) { showToast('Escribe un título'); return; }
    const node = findById(trees[tab], id);
    if (!node) return;
    node.label       = label;
    node.description = document.getElementById('proyDetailDesc').value.trim();
    node.notes       = document.getElementById('proyDetailNotes').value.trim();
    const newPriority = document.getElementById('proyDetailPriority').value;
    if (newPriority === '1' && node.priority !== '1' && window.JARVIS) JARVIS.onPrioritySet();
    node.priority    = newPriority;
    node.dueDate     = document.getElementById('proyDetailDue').value;
    const _newP = +document.getElementById('proyDetailProg').value || 0;
    const _oldP = node.done ? 100 : (+node.progress || 0);
    node.progress = _newP;
    if (_newP > _oldP) { node.advances = node.advances || []; node.advances.push(getActiveDate()); }
    saveTree(tab, trees[tab]);
    closeModal('modal-proy-detail');
    renderProyectos(tab);
    if (typeof renderReminders === 'function') renderReminders(tab);
  };

  window.renderProyectos = renderProyectos;
  // API compartida para el navegador inmersivo (proyectos-overlay.js): mismos datos, persistencia y re-render del árbol inline.
  window.Proyectos = {
    get: tab => (trees[tab] || (trees[tab] = loadTree(tab))),
    save: (tab) => { saveTree(tab, trees[tab]); renderProyectos(tab); },
    findById: (tab, id) => findById(trees[tab] || [], id),
    newNode: (label, isFolder) => ({ id: uid(), label: label || (isFolder ? 'Nueva carpeta' : 'Nueva tarea'), icon: isFolder ? '📁' : '📄', tipo: isFolder ? 'carpeta' : 'tarea', open: false, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', progress: 0, children: [] }),
    removeById: (tab, id) => { trees[tab] = removeById(trees[tab], id); saveTree(tab, trees[tab]); renderProyectos(tab); },
    // Marca done desde el board de recordatorios (y refresca el board para que salga de ahí).
    setDone: (tab, id, val) => {
      const n = findById(trees[tab] || [], id); if (!n) return;
      n.done = !!val;
      if (n.done) { n.advances = n.advances || []; n.advances.push(getActiveDate()); }
      saveTree(tab, trees[tab]); renderProyectos(tab);
      if (typeof renderReminders === 'function') renderReminders(tab);
      if (typeof renderGoals === 'function') try { renderGoals(); } catch (e) {}
      if (n.done && window.JARVIS) try { JARVIS.onTaskDone(); } catch (e) {}
    },
    // Abre el modal de detalle del nodo (para editar fecha/prioridad desde el board).
    openDetail: (tab, id) => { const n = findById(trees[tab] || [], id); if (n) openDetailModal(tab, n); },
  };

  // Recarga trees desde S.proyectos (llamado tras loadState o sync remoto)
  window._reloadProyectosFromState = function() {
    // [DIAG proyectos-borrado] detecta si un re-render por sync pierde nodos del árbol activo.
    const _countNodes = t => (t || []).reduce((a, x) => a + 1 + _countNodes(x.children || []), 0);
    const _activeTab = document.querySelector('.tab-panel.active')?.id?.replace('tab-', '') || 'vida';
    const _beforeN = _countNodes(trees[_activeTab]);
    TABS.forEach(tab => {
      if (typeof S !== 'undefined' && S.proyectos?.[tab] != null) {
        trees[tab] = S.proyectos[tab];
      }
    });
    const _afterN = _countNodes(trees[_activeTab]);
    if (_afterN < _beforeN && typeof showToast === 'function') {
      showToast(`⚠️ [diag] Sync recargó Proyectos y perdió nodos: ${_beforeN}→${_afterN}`, 8000);
    }
    renderProyectos(_activeTab);
  };

  // ── API para comandos de voz (JARVIS EARS) ──
  window.PROY_VOICE = {
    addProject(tab, name) {
      if (!TABS.includes(tab)) tab = 'vida';
      const n = { id: uid(), label: name, icon: '📁', open: true, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] };
      trees[tab].push(n); saveTree(tab, trees[tab]); renderProyectos(tab);
      return true;
    },
    // Borra por voz el nodo (proyecto o subtarea) cuyo label coincide mejor, en cualquier sección.
    deleteProject(query) {
      const q = (query || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      if (!q) return null;
      let best = null;
      TABS.forEach(tab => {
        (function walk(nodes) {
          (nodes || []).forEach(n => {
            const label = (n.label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            if (label && label.includes(q) && (!best || (n.label || '').length < (best.node.label || '').length)) best = { tab, node: n };
            walk(n.children);
          });
        })(trees[tab]);
      });
      if (!best) return null;
      // [DIAG proyectos-borrado] avisa si un comando de voz (mal escuchado) borró un nodo.
      if (typeof showToast === 'function') showToast(`🎙️ [diag] Voz borró proyecto: "${best.node.label}"`, 8000);
      trees[best.tab] = removeById(trees[best.tab], best.node.id);
      saveTree(best.tab, trees[best.tab]);
      try { renderProyectos(best.tab); } catch (e) {}
      if (window.JARVIS) try { JARVIS.onDeleteProject(); } catch (e) {}
      return best.node.label;
    },
    completeTask(query) {
      const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      let best = null;
      TABS.forEach(tab => {
        (function walk(nodes) {
          (nodes || []).forEach(n => {
            const label = (n.label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            if (!n.done && label.includes(q)) {
              if (!best || n.label.length < best.node.label.length) best = { tab, node: n };
            }
            walk(n.children);
          });
        })(trees[tab]);
      });
      if (!best) return null;
      best.node.done = true;
      saveTree(best.tab, trees[best.tab]); renderProyectos(best.tab);
      return best.node.label;
    },
    // Marca el día de hoy en un hábito por nombre (todas las secciones). status: 'done'|'partial'|'rest'
    markHabit(query, status) {
      status = status || 'done';
      const q = (query || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      if (!q) return null;
      let best = null;
      ['vida', 'finanzas', 'salud', 'conocimiento', 'ia'].forEach(sec => {
        _getHabits(sec).forEach(h => {
          const name = (h.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
          if (name && name.includes(q) && (!best || h.name.length < best.habit.name.length)) best = { sec, habit: h };
        });
      });
      if (!best) return null;
      best.habit.days = best.habit.days || {};
      best.habit.days[getActiveDate()] = status;
      saveState();
      try { renderHabitCal(best.sec); } catch (e) {}
      try { renderHabitsCard(best.sec); } catch (e) {}
      try { checkAchievements(); } catch (e) {}
      return best.habit.name;
    },
    stats() {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      let pending = 0, overdue = 0;
      TABS.forEach(tab => {
        (function walk(nodes) {
          (nodes || []).forEach(n => {
            if (!n.done && (!n.children || !n.children.length)) pending++;
            if (n.dueDate && !n.done && new Date(n.dueDate + 'T00:00:00') < today) overdue++;
            walk(n.children);
          });
        })(trees[tab]);
      });
      return { pending, overdue };
    },
    // Igual que stats() pero acotado a una sola sección
    statsFor(tab) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (!trees[tab]) trees[tab] = loadTree(tab);
      let pending = 0, overdue = 0;
      (function walk(nodes) {
        (nodes || []).forEach(n => {
          if (!n.done && (!n.children || !n.children.length)) pending++;
          if (n.dueDate && !n.done && new Date(n.dueDate + 'T00:00:00') < today) overdue++;
          walk(n.children);
        });
      })(trees[tab]);
      return { pending, overdue };
    }
  };

  setTimeout(() => renderProyectos('vida'), 0);
})();

// ════════════════════════════════════════════════════════
// NOTION WORKSPACE
// ════════════════════════════════════════════════════════
(function() {
  const STORAGE_KEY = 'notion_workspace_v2';

  const DEFAULT_TREE = [
    {
      id: 'notion', label: 'Notion', icon: '📓', open: true,
      children: [
        {
          id: 'proyectos', label: 'Proyectos', icon: '📁', open: true,
          children: [
            { id: uid(), label: 'Centro de Comando', icon: '📄', children: [] },
            { id: uid(), label: 'Automatizaciones', icon: '📄', children: [] }
          ]
        },
        {
          id: 'ideas', label: 'Ideas', icon: '💡', open: false,
          children: [
            { id: uid(), label: 'IA aplicada al trabajo', icon: '📄', children: [] }
          ]
        },
        {
          id: 'herramientas', label: 'Herramientas', icon: '🔧', open: false,
          children: []
        }
      ]
    }
  ];

  function loadTree() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_TREE));
    } catch { return JSON.parse(JSON.stringify(DEFAULT_TREE)); }
  }

  function saveTree(tree) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
  }

  let notionTree = loadTree();

  function renderNotion() {
    const container = document.getElementById('notion-tree');
    if (!container) return;
    container.innerHTML = '';
    notionTree.forEach((node, idx) => {
      container.appendChild(buildNodeEl(node, 0, idx));
    });
  }

  function buildNodeEl(node, depth, idx) {
    const wrapper = document.createElement('div');
    wrapper.className = 'notion-node';
    wrapper.dataset.depth = depth;
    wrapper.dataset.id = node.id;

    // Header row
    const header = document.createElement('div');
    header.className = 'notion-node-header';

    // Toggle chevron (only for nodes with children array)
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'notion-toggle-btn' + (node.open ? ' open' : '');
    toggleBtn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`;
    toggleBtn.onclick = (e) => { e.stopPropagation(); toggleNode(node); };

    // Icon
    const iconEl = document.createElement('span');
    iconEl.className = 'notion-node-icon';
    iconEl.textContent = node.icon || '📁';

    // Label (editable)
    const labelEl = document.createElement('span');
    labelEl.className = 'notion-node-label';
    labelEl.contentEditable = 'true';
    labelEl.spellcheck = false;
    labelEl.textContent = node.label;
    labelEl.onclick = (e) => e.stopPropagation();
    labelEl.onblur = () => {
      node.label = labelEl.textContent.trim() || node.label;
      labelEl.textContent = node.label;
      saveTree(notionTree);
    };
    labelEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); labelEl.blur(); } };

    // Children count badge
    const countEl = document.createElement('span');
    countEl.className = 'notion-node-count';
    const childCount = (node.children || []).length;
    if (childCount > 0) countEl.textContent = childCount;

    // Actions
    const actionsEl = document.createElement('div');
    actionsEl.className = 'notion-node-actions';

    // Add child folder btn
    const addFolderBtn = makeActionBtn(
      `<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
      'Agregar subcarpeta'
    );
    addFolderBtn.onclick = (e) => { e.stopPropagation(); addChildFolder(node); };

    // Add page btn
    const addPageBtn = makeActionBtn(
      `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
      'Agregar página'
    );
    addPageBtn.onclick = (e) => { e.stopPropagation(); addChildPage(node); };

    // Change icon btn
    const iconBtn = makeActionBtn(
      `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
      'Cambiar ícono'
    );
    iconBtn.onclick = (e) => { e.stopPropagation(); pickIcon(node, iconEl); };

    // Delete btn
    const delBtn = makeActionBtn(
      `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
      'Eliminar'
    );
    delBtn.onclick = (e) => { e.stopPropagation(); deleteNode(node, depth); };

    actionsEl.append(addFolderBtn, addPageBtn, iconBtn, delBtn);
    header.append(toggleBtn, iconEl, labelEl, countEl, actionsEl);
    header.onclick = () => toggleNode(node);

    // Children area
    const childrenEl = document.createElement('div');
    childrenEl.className = 'notion-children' + (node.open ? '' : ' collapsed');
    childrenEl.dataset.childrenFor = node.id;

    if (node.children && node.children.length > 0) {
      node.children.forEach((child, ci) => {
        childrenEl.appendChild(buildNodeEl(child, depth + 1, ci));
      });
    }

    // Add-item input row (for adding new items to this folder)
    childrenEl.appendChild(buildAddRowEl(node, depth + 1));

    wrapper.append(header, childrenEl);
    return wrapper;
  }

  function buildAddRowEl(node, depth) {
    const row = document.createElement('div');
    row.className = 'notion-add-item-row';
    row.dataset.addFor = node.id;

    const input = document.createElement('input');
    input.className = 'notion-add-item-input';
    input.placeholder = '+ Nueva página o nota…';
    input.type = 'text';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'notion-add-item-btn';
    confirmBtn.innerHTML = `<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    confirmBtn.title = 'Agregar';

    const doAdd = () => {
      const val = input.value.trim();
      if (!val) return;
      addChildPage(node, val);
      input.value = '';
    };
    confirmBtn.onclick = doAdd;
    input.onkeydown = (e) => { if (e.key === 'Enter') doAdd(); };

    row.append(input, confirmBtn);
    return row;
  }

  function makeActionBtn(svgHtml, title) {
    const btn = document.createElement('button');
    btn.className = 'notion-node-action-btn';
    btn.title = title;
    btn.innerHTML = svgHtml;
    return btn;
  }

  function toggleNode(node) {
    node.open = !node.open;
    saveTree(notionTree);
    const childrenEl = document.querySelector(`[data-children-for="${node.id}"]`);
    const toggleBtn = document.querySelector(`[data-id="${node.id}"] > .notion-node-header .notion-toggle-btn`);
    if (childrenEl) childrenEl.classList.toggle('collapsed', !node.open);
    if (toggleBtn) toggleBtn.classList.toggle('open', node.open);
  }

  function addChildFolder(node) {
    if (!node.children) node.children = [];
    const newNode = { id: uid(), label: 'Nueva carpeta', icon: '📁', open: true, children: [] };
    node.children.push(newNode);
    node.open = true;
    saveTree(notionTree);
    renderNotion();
    // Focus the new node's label after render
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${newNode.id}"] .notion-node-label`);
      if (el) { el.focus(); selectAll(el); }
    }, 50);
  }

  function addChildPage(node, labelText) {
    if (!node.children) node.children = [];
    const label = labelText || 'Nueva página';
    const newPage = { id: uid(), label, icon: '📄', open: false, children: [] };
    node.children.push(newPage);
    node.open = true;
    saveTree(notionTree);
    renderNotion();
    if (!labelText) {
      setTimeout(() => {
        const el = document.querySelector(`[data-id="${newPage.id}"] .notion-node-label`);
        if (el) { el.focus(); selectAll(el); }
      }, 50);
    }
  }

  function deleteNode(node, depth) {
    if (!confirm(`¿Eliminar "${node.label}" y todo su contenido?`)) return;
    notionTree = removeNodeById(notionTree, node.id);
    saveTree(notionTree);
    renderNotion();
  }

  function removeNodeById(nodes, id) {
    return nodes
      .filter(n => n.id !== id)
      .map(n => ({ ...n, children: n.children ? removeNodeById(n.children, id) : [] }));
  }

  function pickIcon(node, iconEl) {
    const icons = ['📁','📂','📄','📝','💡','🔧','🛠️','🤖','🧠','🚀','⭐','🎯','📊','🔍','🌐','💼','📌','🔖','🗂️','📋'];
    const current = node.icon || '📁';
    const picker = document.createElement('div');
    picker.style.cssText = 'position:fixed;z-index:9999;background:#1a1a1f;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px;display:grid;grid-template-columns:repeat(5,1fr);gap:4px;max-width:180px;box-shadow:0 8px 32px rgba(0,0,0,.6)';
    const rect = iconEl.getBoundingClientRect();
    picker.style.top = (rect.bottom + 6) + 'px';
    picker.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
    icons.forEach(ic => {
      const btn = document.createElement('button');
      btn.textContent = ic;
      btn.style.cssText = 'background:' + (ic === current ? 'rgba(255,255,255,.12)' : 'none') + ';border:none;cursor:pointer;font-size:18px;padding:5px;border-radius:6px;transition:background .1s';
      btn.onmouseover = () => btn.style.background = 'rgba(255,255,255,.1)';
      btn.onmouseout = () => btn.style.background = ic === current ? 'rgba(255,255,255,.12)' : 'none';
      btn.onclick = () => {
        node.icon = ic;
        iconEl.textContent = ic;
        saveTree(notionTree);
        document.body.removeChild(picker);
      };
      picker.appendChild(btn);
    });
    document.body.appendChild(picker);
    const close = (e) => { if (!picker.contains(e.target)) { if (picker.parentNode) document.body.removeChild(picker); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  function selectAll(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Public API
  window.notionAddRootItem = function() {
    const newNode = { id: uid(), label: 'Nueva sección', icon: '📁', open: true, children: [] };
    notionTree.push(newNode);
    saveTree(notionTree);
    renderNotion();
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${newNode.id}"] .notion-node-label`);
      if (el) { el.focus(); selectAll(el); }
    }, 50);
  };

  // Initial render (deferred to let DOM settle)
  setTimeout(renderNotion, 0);
})();

// ════════════════════════════════════════════════════════
// COLLAPSIBLE CARDS — sistema genérico
// ════════════════════════════════════════════════════════
(function() {
  function cardKey(card) {
    const titleEl = card.querySelector(':scope > .card-title');
    if (!titleEl) return null;
    const parentId = card.closest('[id]')?.id || 'root';
    const text = titleEl.textContent.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]/g, '').slice(0, 24);
    return 'cc_' + parentId + '_' + text;
  }

  function initCard(card) {
    if (card.dataset.ccInit) return;
    const titleEl = card.querySelector(':scope > .card-title');
    if (!titleEl) return;

    // Collect all non-title direct children
    const bodyChildren = Array.from(card.children).filter(c => c !== titleEl);
    if (!bodyChildren.length) { card.dataset.ccInit = '1'; return; }

    // Wrap in .card-body
    const body = document.createElement('div');
    body.className = 'card-body';
    bodyChildren.forEach(c => body.appendChild(c));
    card.appendChild(body);

    // Wrap title's existing content in inner group, add chevron alongside
    const innerNodes = Array.from(titleEl.childNodes);
    const innerWrap = document.createElement('div');
    innerWrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0;justify-content:space-between;';
    innerNodes.forEach(n => innerWrap.appendChild(n));

    const chevron = document.createElement('span');
    chevron.className = 'card-collapse-chevron';
    chevron.textContent = '▾';

    titleEl.appendChild(innerWrap);
    titleEl.appendChild(chevron);
    titleEl.style.cursor = 'pointer';
    titleEl.style.gap = '8px';

    // Restore state
    const key = cardKey(card);
    if (key && localStorage.getItem(key) === '1') {
      body.classList.add('collapsed');
      card.style.paddingBottom = '0';
      chevron.style.transform = 'rotate(-90deg)';
    }

    // Toggle on click
    titleEl.addEventListener('click', e => {
      if (e.target.closest('button, a, input, select, [contenteditable]')) return;
      const collapsed = body.classList.toggle('collapsed');
      card.style.paddingBottom = collapsed ? '0' : '';
      chevron.style.transform = collapsed ? 'rotate(-90deg)' : '';
      if (key) localStorage.setItem(key, collapsed ? '1' : '');
    });

    card.dataset.ccInit = '1';
  }

  function initAll() {
    document.querySelectorAll('.card').forEach(initCard);
  }

  // Watch for dynamically added cards
  new MutationObserver(muts => {
    muts.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.classList?.contains('card')) initCard(node);
        node.querySelectorAll?.('.card').forEach(initCard);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });

  // Initial pass after all dynamic renders settle
  setTimeout(initAll, 200);
})();
