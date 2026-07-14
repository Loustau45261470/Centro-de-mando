/* ══════════════════════════════════════════════════════
   AI AGENT — Centro de Mando
   ══════════════════════════════════════════════════════ */
(function () {
  const KEY_STORE  = 'agent_api_key_v1';
  const HIST_STORE = 'agent_chat_v1';
  const HIST_CAP   = 40;   // máximo de mensajes guardados (acota tamaño y costo de tokens)
  const MODEL_FAST  = 'claude-haiku-4-5-20251001';
  const MODEL_SMART = 'claude-sonnet-5';
  const API_URL    = 'https://api.anthropic.com/v1/messages';

  // Heurística de ruteo: decide una vez por mensaje del usuario qué modelo usar para todo el turno.
  function _pickModel(userText) {
    const override = localStorage.getItem('jarvis_agent_model');
    if (override === 'fast') return MODEL_FAST;
    if (override === 'smart') return MODEL_SMART;
    const text = userText || '';
    if (text.length > 180) return MODEL_SMART;
    if (/analiz|anális|tendenc|estrateg|resum[ií\b]|compar[aá]|por qué|diagnos|proyect[aá]|evalu[aá]|revis[aá] (el|mi|todo)/i.test(text)) return MODEL_SMART;
    return MODEL_FAST;
  }

  let apiKey  = localStorage.getItem(KEY_STORE) || '';
  let apiHist = [];   // full API message history (role + content)
  let displayLog = []; // mensajes visibles {role, text} para re-render al restaurar
  let busy    = false;
  let _persistWarned = false; // toast de error de guardado, una sola vez por sesión

  /* ── panel open/close ── */
  window.agentToggle = function () {
    const panel = document.getElementById('agent-panel');
    const fab   = document.getElementById('agent-fab');
    const open  = panel.classList.toggle('open');
    fab.classList.toggle('active', open);
    if (open) {
      if (!apiKey) { _showSetup(); return; }
      _showChat();
      if (!document.getElementById('agent-messages').children.length) { if (!_restoreChat()) _welcome(); }
      _scrollBottom();
      setTimeout(() => document.getElementById('agent-input')?.focus(), 340);
    }
  };

  window.agentShowSetup = function () {
    _showSetup();
    const inp = document.getElementById('agent-key-inp');
    if (inp && apiKey) inp.value = apiKey;
  };

  window.agentSaveKey = function () {
    const val = document.getElementById('agent-key-inp').value.trim();
    if (!val.startsWith('sk-ant-')) {
      _sysmsg('La key debe empezar con sk-ant-'); return;
    }
    apiKey = val;
    localStorage.setItem(KEY_STORE, apiKey);
    _showChat();
    _welcome();
    setTimeout(() => document.getElementById('agent-input')?.focus(), 80);
  };

  window.agentClear = function () {
    apiHist = [];
    displayLog = [];
    localStorage.removeItem(HIST_STORE);
    if (typeof S !== 'undefined' && S) {
      S.agentChat = { apiHist: [], displayLog: [], updatedAt: Date.now() };
      if (typeof saveState === 'function') saveState();
    }
    document.getElementById('agent-messages').innerHTML = '';
    _welcome();
  };

  window.agentKeydown = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); agentSend(); }
  };

  window.agentSend = async function () {
    if (busy) return;
    const inp  = document.getElementById('agent-input');
    const text = inp.value.trim();
    if (!text) return;
    inp.value = ''; inp.style.height = 'auto';
    _addMsg('user', text);
    apiHist.push({ role: 'user', content: text });
    const model = _pickModel(text);
    await _run(model);
  };

  /* ── UI helpers ── */
  function _showSetup() {
    document.getElementById('agent-setup').style.display      = 'flex';
    document.getElementById('agent-messages').style.display   = 'none';
    document.getElementById('agent-input-area').style.display = 'none';
  }
  function _showChat() {
    document.getElementById('agent-setup').style.display      = 'none';
    document.getElementById('agent-messages').style.display   = 'flex';
    document.getElementById('agent-input-area').style.display = 'flex';
  }
  function _welcome() {
    if (document.getElementById('agent-messages').children.length) return;
    _addMsg('assistant', 'Hola, Señor. Soy tu asistente integrado en el dashboard.\n\nPuedo ayudarte a:\n• Crear, editar o eliminar proyectos\n• Agregar o completar tareas\n• Registrar tu bienestar\n• Responder preguntas sobre tus datos\n\n¿En qué te ayudo?');
  }
  function _renderMsg(role, text, model) {
    const el = document.createElement('div');
    el.className = 'agent-msg ' + role;
    let html = _fmt(text);
    if (role === 'assistant' && model) {
      const label = model === MODEL_SMART ? '🧠 sonnet' : '⚡ haiku';
      html += ` <span style="opacity:.45;font-size:9px">${label}</span>`;
    }
    el.innerHTML = html;
    document.getElementById('agent-messages').appendChild(el);
    _scrollBottom();
  }
  function _addMsg(role, text, model) {
    displayLog.push({ role, text, model });
    _renderMsg(role, text, model);
  }
  function _persist() {
    try {
      if (displayLog.length > HIST_CAP) displayLog = displayLog.slice(-HIST_CAP);
      if (apiHist.length > HIST_CAP) {
        // Recortar a un historial válido: debe empezar en un mensaje 'user' de texto
        const ah = apiHist.slice(-HIST_CAP);
        let i = 0;
        while (i < ah.length && !(ah[i].role === 'user' && typeof ah[i].content === 'string')) i++;
        apiHist = ah.slice(i);
      }
      const updatedAt = Date.now();
      localStorage.setItem(HIST_STORE, JSON.stringify({ apiHist, displayLog, updatedAt }));
      if (typeof S !== 'undefined' && S) {
        S.agentChat = { apiHist, displayLog, updatedAt };
        if (typeof saveState === 'function') saveState();
      }
    } catch (e) {
      console.warn('[agent] persist:', e);
      if (!_persistWarned) {
        _persistWarned = true;
        if (typeof showToast === 'function') showToast('⚠️ No se pudo guardar el historial del chat', 5000);
      }
    }
  }
  // Descarta un mensaje assistant colgante (tool_use sin su tool_result) al final del historial.
  // Puede quedar así si una sesión previa se cerró/crasheó justo entre el push del assistant y el del user con resultados.
  function _sanitizeApiHist(hist) {
    if (!Array.isArray(hist) || !hist.length) return hist;
    const last = hist[hist.length - 1];
    if (last && last.role === 'assistant' && Array.isArray(last.content) && last.content.some(b => b && b.type === 'tool_use')) {
      console.warn('[agent] historial restaurado con tool_use colgante al final — se descarta ese mensaje.');
      return hist.slice(0, -1);
    }
    return hist;
  }
  function _restoreChat() {
    try {
      const localSaved = JSON.parse(localStorage.getItem(HIST_STORE) || 'null');
      const cloudSaved  = (typeof S !== 'undefined' && S && S.agentChat) ? S.agentChat : null;
      let saved = null;
      if (localSaved && cloudSaved) {
        saved = (cloudSaved.updatedAt || 0) >= (localSaved.updatedAt || 0) ? cloudSaved : localSaved;
      } else {
        saved = cloudSaved || localSaved;
      }
      if (!saved || !Array.isArray(saved.displayLog) || !saved.displayLog.length) return false;
      apiHist    = _sanitizeApiHist(Array.isArray(saved.apiHist) ? saved.apiHist : []);
      displayLog = saved.displayLog;
      document.getElementById('agent-messages').innerHTML = '';
      displayLog.forEach(m => _renderMsg(m.role, m.text, m.model));
      return true;
    } catch { return false; }
  }
  function _sysmsg(text) {
    const el = document.createElement('div');
    el.className = 'agent-msg sys';
    el.textContent = text;
    document.getElementById('agent-messages').appendChild(el);
    _scrollBottom();
  }
  function _showTyping() {
    const el = document.createElement('div');
    el.className = 'agent-typing'; el.id = 'agent-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    document.getElementById('agent-messages').appendChild(el);
    document.getElementById('agent-send').disabled = true;
    _scrollBottom();
  }
  function _hideTyping() {
    document.getElementById('agent-typing')?.remove();
    document.getElementById('agent-send').disabled = false;
  }
  function _scrollBottom() {
    const el = document.getElementById('agent-messages');
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }
  function _setStatus(text, on) {
    const el = document.getElementById('agent-status-lbl');
    if (!el) return;
    el.textContent = text;
    el.className = 'agent-status ' + (on ? 'on' : 'off');
  }
  function _fmt(text) {
    const d = document.createElement('div');
    d.textContent = text;
    let h = d.innerHTML;
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\n/g, '<br>');
    return h;
  }

  /* ── state snapshot ── */
  function _snapshot() {
    const today = (typeof getActiveDate === 'function') ? getActiveDate() : new Date().toISOString().slice(0,10);
    const goals = (S.goals[today] || []).map(g => ({ id: g.id, text: g.text, done: g.done, priority: g.priority }));
    const TABS  = ['vida','finanzas','salud','conocimiento','ia'];
    const projects = {};
    TABS.forEach(tab => {
      try {
        projects[tab] = window.Proyectos ? _flatTree(window.Proyectos.get(tab) || []) : [];
      } catch { projects[tab] = []; }
    });
    const wellness = S.sleepLog?.[today]?.wellness || {};
    const wStr = (typeof WELLNESS_METRICS !== 'undefined')
      ? WELLNESS_METRICS.map(m => `${m.label}: ${wellness[m.id] || '—'}/5`).join(', ')
      : '';
    const sleep = S.sleepLog?.[today];

    // Finanzas del mes en curso (solo ARS para no mezclar monedas)
    const ym = today.slice(0, 7);
    let inc = 0, exp = 0;
    (S.transactions || []).forEach(t => {
      if (!(t.date || '').startsWith(ym)) return;
      if (t.currency && t.currency !== 'ARS') return;
      const a = +t.amount || 0;
      if (t.type === 'income') inc += a; else exp += a;
    });
    // Último peso registrado
    const bw = (S.bodyWeight || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    // Objetivos del trimestre activo
    const qo = S.quarterlyObjectives;
    let quarter = 'No definido';
    if (qo?.periods?.length) {
      const p = qo.periods.find(x => x.id === qo.activePeriod) || qo.periods[0];
      if (p) quarter = `${p.label}: ` + (p.objectives || []).map(o => `${o.done ? '✓' : '○'} ${o.text}`).join('; ');
    }
    // Hábitos de hoy (todas las secciones)
    const habitsToday = [];
    TABS.forEach(sec => (S.habitTrackers?.[sec] || []).forEach(h => {
      const st = h.days?.[today];
      habitsToday.push(`${st === 'done' ? '✓' : st === 'partial' ? '½' : st === 'rest' ? '—' : '○'} ${h.name}`);
    }));

    return {
      date: today,
      todayGoals: goals,
      projects,
      wellness: wStr,
      sleep: sleep?.hours ? `${sleep.hours}h (${sleep.bedtime||'?'} → ${sleep.waketime||'?'})` : 'No registrado',
      streak: S.streak,
      finanzasMes: `ingreso ${inc}, gasto ${exp}, balance ${inc - exp} ARS`,
      ultimoPeso: bw ? `${bw.value} ${bw.unit || 'kg'} (${bw.date})` : 'No registrado',
      objetivosTrimestre: quarter,
      habitosHoy: habitsToday.join(', ') || 'ninguno',
      jarvisMemory: S.jarvisMemory || [],
    };
  }

  function _flatTree(nodes, depth = 0) {
    const out = [];
    for (const n of nodes) {
      out.push({ id: n.id, label: n.label, depth, children: (n.children||[]).length });
      if (n.children?.length) out.push(..._flatTree(n.children, depth + 1));
    }
    return out;
  }

  /* ── tools ── */
  const TOOLS = [
    {
      name: 'get_app_state',
      description: 'Obtiene el estado actual del dashboard: metas del día, proyectos (todos los tabs), bienestar, sueño, racha, finanzas del mes (ingreso/gasto/balance), último peso, objetivos del trimestre y hábitos de hoy.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'add_goal',
      description: 'Agrega una nueva meta o tarea.',
      input_schema: {
        type: 'object',
        properties: {
          text:     { type: 'string', description: 'Texto de la meta' },
          when:     { type: 'string', enum: ['today','tomorrow'] },
          priority: { type: 'string', enum: ['high','medium','low'] },
        },
        required: ['text'],
      },
    },
    {
      name: 'complete_goal',
      description: 'Marca una meta de hoy como completada. Busca por texto parcial o ID.',
      input_schema: {
        type: 'object',
        properties: { search: { type: 'string', description: 'Texto o ID de la meta' } },
        required: ['search'],
      },
    },
    {
      name: 'delete_goal',
      description: 'Elimina una meta del día de hoy. Busca por texto parcial o ID.',
      input_schema: {
        type: 'object',
        properties: { search: { type: 'string' } },
        required: ['search'],
      },
    },
    {
      name: 'add_project',
      description: 'Crea un nuevo proyecto raíz en un tab del dashboard.',
      input_schema: {
        type: 'object',
        properties: {
          label:       { type: 'string' },
          tab:         { type: 'string', enum: ['vida','finanzas','salud','conocimiento','ia'] },
          description: { type: 'string' },
          icon:        { type: 'string', description: 'Emoji (ej: 🚀, 📊, 💡)' },
        },
        required: ['label','tab'],
      },
    },
    {
      name: 'add_project_task',
      description: 'Agrega una tarea/subtarea dentro de un proyecto existente.',
      input_schema: {
        type: 'object',
        properties: {
          tab:          { type: 'string', enum: ['vida','finanzas','salud','conocimiento','ia'] },
          project_name: { type: 'string', description: 'Nombre del proyecto padre (búsqueda parcial)' },
          task_label:   { type: 'string', description: 'Nombre de la tarea' },
        },
        required: ['tab','project_name','task_label'],
      },
    },
    {
      name: 'update_project',
      description: 'Modifica nombre, descripción o notas de un proyecto existente.',
      input_schema: {
        type: 'object',
        properties: {
          tab:         { type: 'string', enum: ['vida','finanzas','salud','conocimiento','ia'] },
          search:      { type: 'string', description: 'Nombre actual (búsqueda parcial)' },
          new_label:   { type: 'string' },
          description: { type: 'string' },
          notes:       { type: 'string' },
        },
        required: ['tab','search'],
      },
    },
    {
      name: 'delete_project',
      description: 'DESTRUCTIVO: primero preguntale al usuario si confirma; llamá esta tool con confirm:true SOLO después de que el usuario confirme en el chat.',
      input_schema: {
        type: 'object',
        properties: {
          tab:     { type: 'string', enum: ['vida','finanzas','salud','conocimiento','ia'] },
          search:  { type: 'string' },
          confirm: { type: 'boolean', description: 'true solo tras confirmación explícita del usuario' },
        },
        required: ['tab','search'],
      },
    },
    {
      name: 'undo_last',
      description: 'Deshace la última acción registrada (borrado, creación, cambio) — usar cuando el usuario pide deshacer/revertir',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'remember',
      description: 'Guarda un hecho o preferencia en la memoria persistente del asistente, para recordarlo en futuras conversaciones.',
      input_schema: {
        type: 'object',
        properties: { text: { type: 'string', description: 'El hecho o preferencia a recordar' } },
        required: ['text'],
      },
    },
    {
      name: 'forget',
      description: 'Elimina un hecho de la memoria persistente. Busca por texto parcial.',
      input_schema: {
        type: 'object',
        properties: { search: { type: 'string', description: 'Texto a buscar entre los recuerdos guardados' } },
        required: ['search'],
      },
    },
    {
      name: 'query_data',
      description: 'Consulta datos filtrados por rango de fechas/texto: transacciones, metas, hábitos, peso, recordatorios, auditoría, memoria — usar en vez de get_app_state cuando la pregunta es sobre un período o algo específico',
      input_schema: {
        type: 'object',
        properties: {
          area:  { type: 'string', enum: ['transactions','goals','habits','weight','reminders','audit','memory'] },
          from:  { type: 'string', description: 'Fecha desde (YYYY-MM-DD)' },
          to:    { type: 'string', description: 'Fecha hasta (YYYY-MM-DD)' },
          q:     { type: 'string', description: 'Texto de búsqueda' },
          limit: { type: 'integer', description: 'Máximo de resultados' },
        },
        required: ['area'],
      },
    },
    {
      name: 'set_wellness',
      description: 'Registra métricas de bienestar para hoy (valores 1-5). Solo incluí las métricas que se mencionaron.',
      input_schema: {
        type: 'object',
        properties: {
          sleepQuality: { type: 'integer', minimum: 1, maximum: 5 },
          energy:       { type: 'integer', minimum: 1, maximum: 5 },
          mood:         { type: 'integer', minimum: 1, maximum: 5 },
          pain:         { type: 'integer', minimum: 1, maximum: 5 },
          stress:       { type: 'integer', minimum: 1, maximum: 5 },
        },
      },
    },
  ];

  // Busca un nodo (proyecto o tarea) por texto parcial dentro del árbol REAL de la app (window.Proyectos),
  // no de una copia en localStorage — así lo que la tool lee/muta es lo mismo que ve la UI.
  function _findProjNode(tab, search) {
    if (!window.Proyectos) return null;
    const tree = window.Proyectos.get(tab) || [];
    const s = (search || '').toLowerCase();
    const walk = (nodes) => {
      for (const n of (nodes || [])) {
        if ((n.label || '').toLowerCase().includes(s)) return n;
        const f = walk(n.children);
        if (f) return f;
      }
      return null;
    };
    return walk(tree);
  }

  // Igual que _findProjNode pero también devuelve el parentId — lo necesita delete_project
  // para armar el inverse (restore_project) tal como lo hace jarvis-brain.js.
  function _findProjNodeWithParent(tab, search) {
    if (!window.Proyectos) return null;
    const tree = window.Proyectos.get(tab) || [];
    const s = (search || '').toLowerCase();
    const walk = (nodes, parentId) => {
      for (const n of (nodes || [])) {
        if ((n.label || '').toLowerCase().includes(s)) return { node: n, parentId };
        const f = walk(n.children, n.id);
        if (f) return f;
      }
      return null;
    };
    return walk(tree, null);
  }
  function _clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch { return x; } }

  /* ── tool execution ── */
  function _exec(name, input) {
    const today = (typeof getActiveDate === 'function') ? getActiveDate() : new Date().toISOString().slice(0,10);

    if (name === 'get_app_state') {
      return JSON.stringify(_snapshot(), null, 2);
    }

    if (name === 'add_goal') {
      const date = input.when === 'tomorrow' ? (typeof getTomorrow === 'function' ? getTomorrow() : today) : today;
      if (!S.goals[date]) S.goals[date] = [];
      S.goals[date].push({ id: uid(), text: input.text, done: false, priority: input.priority || 'medium', time: null });
      saveState();
      if (typeof renderGoals === 'function') renderGoals();
      window.JARVIS_BRAIN && JARVIS_BRAIN.audit({ ts: Date.now(), source: 'chat', action: 'add_goal', desc: `Agregó meta: ${input.text}`, inverse: null });
      return `Meta "${input.text}" agregada para ${input.when === 'tomorrow' ? 'mañana' : 'hoy'}.`;
    }

    if (name === 'complete_goal') {
      const list = S.goals[today] || [];
      const s = input.search.toLowerCase();
      const g = list.find(x => x.id === input.search || x.text.toLowerCase().includes(s));
      if (!g) return `No encontré ninguna meta que coincida con "${input.search}".`;
      if (g.done) return `"${g.text}" ya estaba completada.`;
      g.done = true;
      saveState();
      if (typeof renderGoals === 'function') renderGoals();
      window.JARVIS_BRAIN && JARVIS_BRAIN.audit({ ts: Date.now(), source: 'chat', action: 'complete_goal', desc: `Completó meta: ${g.text}`, inverse: null });
      return `"${g.text}" marcada como completada ✅`;
    }

    if (name === 'delete_goal') {
      const list = S.goals[today] || [];
      const s = input.search.toLowerCase();
      const idx = list.findIndex(x => x.id === input.search || x.text.toLowerCase().includes(s));
      if (idx === -1) return `No encontré ninguna meta que coincida con "${input.search}".`;
      const label = list[idx].text;
      list.splice(idx, 1);
      saveState();
      if (typeof renderGoals === 'function') renderGoals();
      window.JARVIS_BRAIN && JARVIS_BRAIN.audit({ ts: Date.now(), source: 'chat', action: 'delete_goal', desc: `Eliminó meta: ${label}`, inverse: null });
      return `Meta "${label}" eliminada.`;
    }

    if (name === 'add_project') {
      if (!window.Proyectos) return `Proyectos no disponible en esta vista.`;
      const tree = window.Proyectos.get(input.tab);
      const n = window.Proyectos.newNode(input.label, true);
      if (input.icon) n.icon = input.icon;
      n.description = input.description || '';
      tree.push(n);
      window.Proyectos.save(input.tab);
      window.JARVIS_BRAIN && JARVIS_BRAIN.audit({ ts: Date.now(), source: 'chat', action: 'add_project', desc: `Creó proyecto: ${input.label} (${input.tab})`, inverse: null });
      return `Proyecto "${input.label}" creado en ${input.tab}.`;
    }

    if (name === 'add_project_task') {
      if (!window.Proyectos) return `Proyectos no disponible en esta vista.`;
      const parent = _findProjNode(input.tab, input.project_name);
      if (!parent) return `No encontré "${input.project_name}" en ${input.tab}.`;
      if (!parent.children) parent.children = [];
      parent.children.push(window.Proyectos.newNode(input.task_label, false));
      parent.open = true;
      window.Proyectos.save(input.tab);
      window.JARVIS_BRAIN && JARVIS_BRAIN.audit({ ts: Date.now(), source: 'chat', action: 'add_project_task', desc: `Agregó tarea: ${input.task_label} a ${parent.label}`, inverse: null });
      return `Tarea "${input.task_label}" agregada a "${parent.label}".`;
    }

    if (name === 'update_project') {
      if (!window.Proyectos) return `Proyectos no disponible en esta vista.`;
      const node = _findProjNode(input.tab, input.search);
      if (!node) return `No encontré "${input.search}" en ${input.tab}.`;
      const old = node.label;
      if (input.new_label)                 node.label       = input.new_label;
      if (input.description !== undefined) node.description = input.description;
      if (input.notes       !== undefined) node.notes       = input.notes;
      window.Proyectos.save(input.tab);
      window.JARVIS_BRAIN && JARVIS_BRAIN.audit({ ts: Date.now(), source: 'chat', action: 'update_project', desc: `Actualizó proyecto: ${old}`, inverse: null });
      return `Proyecto "${old}" actualizado.`;
    }

    if (name === 'delete_project') {
      if (!window.Proyectos) return `Proyectos no disponible en esta vista.`;
      if (!input.confirm) return `Se requiere confirmación del usuario (confirm:true) para borrar.`;
      const found = _findProjNodeWithParent(input.tab, input.search);
      if (!found) return `No encontré "${input.search}" en ${input.tab}.`;
      const clone = _clone(found.node);
      window.Proyectos.removeById(input.tab, found.node.id);
      window.JARVIS_BRAIN && JARVIS_BRAIN.audit({
        ts: Date.now(), source: 'chat', action: 'delete_project',
        desc: `Borró proyecto: ${found.node.label}`,
        inverse: { type: 'restore_project', tab: input.tab, parentId: found.parentId, node: clone },
      });
      return `Proyecto "${found.node.label}" eliminado de ${input.tab}.`;
    }

    if (name === 'undo_last') {
      if (!window.JARVIS_BRAIN) return 'El sistema de deshacer no está disponible en esta vista.';
      return JSON.stringify(JARVIS_BRAIN.execute('undo_last', {}));
    }

    if (name === 'remember') {
      if (!window.JARVIS_BRAIN) return 'La memoria persistente no está disponible en esta vista.';
      return JSON.stringify(JARVIS_BRAIN.execute('remember', { text: input.text }));
    }

    if (name === 'forget') {
      if (!window.JARVIS_BRAIN) return 'La memoria persistente no está disponible en esta vista.';
      return JSON.stringify(JARVIS_BRAIN.execute('forget', { search: input.search }));
    }

    if (name === 'query_data') {
      if (!window.JARVIS_BRAIN) return 'La consulta de datos no está disponible en esta vista.';
      return JSON.stringify(JARVIS_BRAIN.query(input));
    }

    if (name === 'set_wellness') {
      if (!S.sleepLog[today]) S.sleepLog[today] = {};
      if (!S.sleepLog[today].wellness) S.sleepLog[today].wellness = {};
      const fields = ['sleepQuality','energy','mood','pain','stress'];
      const done = [];
      for (const f of fields) {
        if (input[f] !== undefined) {
          S.sleepLog[today].wellness[f] = Math.min(5, Math.max(1, Math.round(input[f])));
          done.push(f);
        }
      }
      saveState();
      if (typeof renderSleepTracker === 'function') renderSleepTracker();
      window.JARVIS_BRAIN && JARVIS_BRAIN.audit({ ts: Date.now(), source: 'chat', action: 'set_wellness', desc: `Actualizó bienestar: ${done.join(', ')}`, inverse: null });
      return `Bienestar actualizado: ${done.join(', ')}.`;
    }

    return `Tool "${name}" no reconocida.`;
  }

  /* ── API call ── */
  // Bloque estable: persona + instrucciones, byte-idéntico entre requests → se cachea (cache_control ephemeral).
  const SYS_STABLE = `Sos un asistente personal integrado en el "Centro de Mando" de Tobias — su dashboard personal. Hablás en español rioplatense (vos, che). Sos directo, conciso e inteligente.

El dashboard tiene: metas diarias, proyectos por sección (vida, finanzas, salud, conocimiento, ia), bienestar (calidad de sueño, energía, ánimo, dolor, estrés en escala 1-5), objetivos trimestrales, finanzas, salud y más.

Instrucciones:
- Si necesitás datos actuales, usá get_app_state primero
- Cuando el usuario pida crear/modificar/eliminar algo, ejecutalo directamente con las tools
- Los borrados (delete_project) requieren confirmación explícita del usuario antes de llamar la tool con confirm:true; si el usuario quiere deshacer/revertir la última acción, usá undo_last
- Tenés memoria persistente entre conversaciones: si el usuario te pide recordar algo usá remember; si pide olvidar algo usá forget; consultá tu memoria vía get_app_state o query_data antes de asumir que no sabés algo del usuario
- Para preguntas sobre un período de tiempo o un dato específico (transacciones, metas, hábitos, peso, recordatorios, auditoría, memoria), usá query_data en vez de get_app_state
- Confirmá brevemente lo que hiciste
- Si hay un error o no podés hacer algo, explicalo en una frase`;

  async function _call(msgs, model) {
    // Bloque dinámico: lo único que cambia por turno/día va DESPUÉS del breakpoint de caching.
    const today = (typeof getActiveDate === 'function') ? getActiveDate() : new Date().toISOString().slice(0, 10);
    const sys = [
      { type: 'text', text: SYS_STABLE, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `Fecha actual: ${today}.` },
    ];

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: model || MODEL_FAST, max_tokens: 1024, system: sys, tools: TOOLS, messages: msgs }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    return res.json();
  }

  /* ── agent loop ── */
  async function _run(model) {
    busy = true;
    _showTyping();
    _setStatus('● PROCESANDO', false);

    try {
      let data = await _call(apiHist, model);

      // tool-use loop
      while (data.stop_reason === 'tool_use') {
        // add assistant turn (may include tool_use blocks)
        apiHist.push({ role: 'assistant', content: data.content });

        const results = [];
        for (const blk of data.content) {
          if (blk.type !== 'tool_use') continue;
          try {
            const out = _exec(blk.name, blk.input);
            results.push({ type: 'tool_result', tool_use_id: blk.id, content: out });
          } catch (e) {
            console.error('[agent] tool_use falló:', blk.name, e);
            results.push({
              type: 'tool_result',
              tool_use_id: blk.id,
              content: JSON.stringify({ ok: false, error: String(e && e.message || e) }),
              is_error: true,
            });
          }
        }
        // Este push debe correr SIEMPRE que hubo bloques tool_use (incluso si _exec tiró),
        // para que el historial nunca quede con un tool_use sin su tool_result (400 en toda llamada futura).
        apiHist.push({ role: 'user', content: results });
        data = await _call(apiHist, model);
      }

      // final text
      const txt = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
      if (txt) {
        apiHist.push({ role: 'assistant', content: txt });
        _hideTyping();
        _addMsg('assistant', txt, model);
      } else {
        _hideTyping();
      }
    } catch (err) {
      _hideTyping();
      const msg = err.message || '';
      if (msg.includes('401') || msg.includes('invalid') || msg.includes('auth')) {
        _sysmsg('❌ API key inválida — actualizala en ⚙️');
        agentShowSetup();
      } else {
        _sysmsg('❌ ' + (msg || 'Error de conexión'));
      }
    }

    _persist();
    busy = false;
    _setStatus('● LISTO', true);
  }
})();
