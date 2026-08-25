'use strict';
// ════════════════════════════════════════════════════════════════════════
// MAPA DE IDEAS — opiniones/valores/posturas del usuario en texto plano,
// conectadas a mano ([[links]] por ID) y por similitud semántica (Voyage AI).
// Ver specs/mapa-de-ideas.md. Overlay inmersivo (CMOverlay), grafo con
// vis-network (CDN, sin bundler). Se integra con Jarvis vía window.MapaIdeas.
//
// Embeddings: si no hay key de Voyage cargada (Ajustes → 🔑 Voyage AI API key),
// _viEmbed() devuelve null y la nota queda con embeddingPending:true — se
// reintenta solo en el próximo guardado/edición (edge case del spec).
// ════════════════════════════════════════════════════════════════════════

const MI_ACCENT = '#8B5CF6';

const _miEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MI_LINK_RE = /\[\[([a-z0-9]+):([^\]]*)\]\]/gi;

let _miView = 'list';        // 'list' | 'detail' | 'graph'
let _miCurrentId = null;
let _miDetailMode = 'view';  // 'view' | 'edit'
let _miSearchQ = '';
let _miQuickOpen = false;
let _miNetwork = null;
const _miPending = {};       // { [noteId]: [{ note, score, sharedTags }] } — sugerencias en memoria (sesión actual)

function _miEnsureState() {
  if (!S.mapaIdeas) S.mapaIdeas = { notes: [], suggestionLog: [], debateMode: false, lastIdeaDelDia: null };
  if (!S.mapaIdeas.notes) S.mapaIdeas.notes = [];
  if (!S.mapaIdeas.suggestionLog) S.mapaIdeas.suggestionLog = [];
}
function _miNotes() { _miEnsureState(); return S.mapaIdeas.notes; }
function _miTitle(n) { const t = (n && n.texto || '').split('\n')[0].trim(); return t ? t.slice(0, 70) : '(sin texto)'; }
function _miFmtDate(ts) { try { return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }); } catch (e) { return ''; } }

// ── Voyage AI: embeddings ───────────────────────────────────────────────
async function _viEmbed(texts) {
  const key = (localStorage.getItem('voyage_api_key_v1') || '').trim();
  if (!key) return null;
  try {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ input: texts, model: 'voyage-3-lite', input_type: 'document' }),
    });
    if (!res.ok) { console.warn('[mapa-ideas] Voyage respondió', res.status); return null; }
    const data = await res.json();
    return (data.data || []).sort((a, b) => a.index - b.index).map(d => d.embedding);
  } catch (e) { console.warn('[mapa-ideas] Voyage falló (sin conexión / rate limit):', e); return null; }
}

// ── LLM liviano (reusa la key ya cargada de jarvis-agent.js — Groq o Anthropic) ──
async function _miLLMJudge(userText) {
  const key = (localStorage.getItem('agent_api_key_v1') || '').trim();
  if (!key) return null;
  try {
    if (key.startsWith('gsk_')) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 8, messages: [{ role: 'user', content: userText }] }),
      });
      if (!res.ok) return null;
      const d = await res.json();
      return ((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim();
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 8, messages: [{ role: 'user', content: userText }] }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return ((d.content || []).filter(c => c.type === 'text').map(c => c.text).join('')).trim();
  } catch (e) { console.warn('[mapa-ideas] LLM judge falló:', e); return null; }
}

// ── Links [[id:label]] ──────────────────────────────────────────────────
function _miExtractLinkIds(texto) {
  const ids = []; let m; MI_LINK_RE.lastIndex = 0;
  while ((m = MI_LINK_RE.exec(texto || ''))) ids.push(m[1]);
  return ids;
}
function _miStripLinksTo(id) {
  const re = new RegExp('\\[\\[' + id + ':[^\\]]*\\]\\]', 'g');
  _miNotes().forEach(n => { n.texto = (n.texto || '').replace(re, ''); });
}
function _miRenderTextHtml(texto) {
  const esc = _miEsc(texto);
  return esc.replace(MI_LINK_RE, (full, id) => {
    const n = _miNotes().find(x => x.id === id);
    if (!n) return '';
    return `<button type="button" class="mi-link" onclick="miOpenNote('${id}')">${_miEsc(_miTitle(n))}</button>`;
  }).replace(/\n/g, '<br>');
}
function _miAlreadyLinked(note, targetId) {
  if ((note.links || []).includes(targetId)) return true;
  if (_miExtractLinkIds(note.texto).includes(targetId)) return true;
  return false;
}

// ── Similitud coseno + ranking con sesgo de aprendizaje ─────────────────
function _miCos(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den ? dot / den : 0;
}
function _miSharedTags(a, b) { return (a.tags || []).some(t => (b.tags || []).includes(t)); }
// Últimas 20-30 decisiones de aceptar/rechazar → few-shot del criterio de conexión de Tobías.
// Heurística: si tiende a aceptar sugerencias con tags compartidos, se boostean esas.
function _miAcceptanceBias() {
  const log = (S.mapaIdeas.suggestionLog || []).slice(-30);
  if (!log.length) return { tagBoost: 0.03 };
  const accepted = log.filter(l => l.decision === 'accept');
  if (!accepted.length) return { tagBoost: 0.01 };
  const sharedTagAccepts = accepted.filter(l => l.sharedTags).length;
  return { tagBoost: 0.02 + 0.08 * (sharedTagAccepts / accepted.length) };
}
function _miTopSimilarRanked(note, n) {
  if (!note.embedding) return [];
  const bias = _miAcceptanceBias();
  return _miNotes()
    .filter(o => o.id !== note.id && o.embedding)
    .map(o => {
      const shared = _miSharedTags(note, o);
      const score = _miCos(note.embedding, o.embedding) + (shared ? bias.tagBoost : 0);
      return { note: o, score, sharedTags: shared };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

// ── Grafo: aristas = links manuales + sugerencias aceptadas ─────────────
function _miEdges() {
  const edges = [], seen = new Set(), ids = new Set(_miNotes().map(n => n.id));
  _miNotes().forEach(n => {
    const linked = new Set([..._miExtractLinkIds(n.texto), ...(n.links || [])]);
    linked.forEach(id => {
      if (id === n.id || !ids.has(id)) return;
      const key = [n.id, id].sort().join('|');
      if (seen.has(key)) return;
      seen.add(key); edges.push({ from: n.id, to: id });
    });
  });
  return edges;
}

// ── CRUD ──────────────────────────────────────────────────────────────
function miCreateNote(texto, tagsStr) {
  _miEnsureState();
  texto = (texto || '').trim();
  if (!texto) return null;
  const tags = (tagsStr || '').split(',').map(t => t.trim()).filter(Boolean);
  const note = { id: uid(), texto, tags, creado: Date.now(), editado: Date.now(), links: [], embedding: null, embeddingPending: true };
  S.mapaIdeas.notes.push(note);
  saveState();
  _miProcessNote(note.id);
  return note;
}
function miUpdateNote(id, texto, tagsStr) {
  const n = _miNotes().find(x => x.id === id); if (!n) return;
  texto = (texto || '').trim(); if (!texto) return;
  n.texto = texto;
  n.tags = (tagsStr || '').split(',').map(t => t.trim()).filter(Boolean);
  n.editado = Date.now();
  n.embeddingPending = true;
  n._contradictionWarn = null;
  saveState();
  _miProcessNote(id);
}
function miDeleteNote(id) {
  const n = _miNotes().find(x => x.id === id); if (!n) return;
  if (!confirm('¿Eliminar esta idea? Los [[enlaces]] que apuntaban a ella se limpian solos, sin dejar rastro.')) return;
  _miStripLinksTo(id);
  S.mapaIdeas.notes = _miNotes().filter(x => x.id !== id);
  S.mapaIdeas.notes.forEach(x => { if (x.links) x.links = x.links.filter(l => l !== id); });
  saveState();
  _miView = 'list'; _miCurrentId = null;
  if (typeof showToast === 'function') showToast('Idea eliminada');
  _miRender();
}
window.miCreateNote = miCreateNote;
window.miDeleteNote = miDeleteNote;

// ── Pipeline post-guardado: embedding → sugerencias → contradicción ─────
async function _miProcessNote(id) {
  const note = _miNotes().find(n => n.id === id); if (!note) return;
  const emb = await _viEmbed([note.texto]);
  if (emb && emb[0]) {
    note.embedding = emb[0];
    note.embeddingPending = false;
    saveState();
    const top = _miTopSimilarRanked(note, 6).filter(c => !_miAlreadyLinked(note, c.note.id)).slice(0, 3);
    _miPending[note.id] = top;
    _miCheckContradiction(note, top);
  } else {
    note.embeddingPending = true;  // sin key o falló la llamada — reintenta en el próximo guardado/edición
    saveState();
  }
  if (_miCurrentId === note.id && _miView === 'detail') _miRender();
  if (_miView === 'list') _miRender();
}
async function _miCheckContradiction(note, top) {
  if (!top || !top.length || top[0].score < 0.78) return;
  const best = top[0].note;
  const ans = await _miLLMJudge(
    `Idea A: "${note.texto}"\nIdea B: "${best.texto}"\n\n¿La Idea A contradice a la Idea B (son posturas opuestas sobre el mismo tema)? Respondé una sola palabra: si o no.`
  );
  if (ans && /^s/i.test(ans)) {
    note._contradictionWarn = best.id;
    saveState();
    if (typeof showToast === 'function') showToast('⚠️ Posible contradicción con una idea guardada — revisala en Mapa de Ideas', 7000);
    if (_miCurrentId === note.id) _miRender();
  }
}

// ── Sugerencias de conexión: aceptar / rechazar ─────────────────────────
function miAcceptSuggestion(noteId, targetId) {
  const note = _miNotes().find(n => n.id === noteId); if (!note) return;
  if (!note.links) note.links = [];
  if (!note.links.includes(targetId)) note.links.push(targetId);
  _miLogDecision(noteId, targetId, 'accept');
  saveState();
  if (typeof showToast === 'function') showToast('🔗 Conexión aceptada');
  _miRender();
}
function miRejectSuggestion(noteId, targetId) {
  _miLogDecision(noteId, targetId, 'reject');
  _miRender();
}
function _miLogDecision(noteId, targetId, decision) {
  const cand = (_miPending[noteId] || []).find(c => c.note.id === targetId);
  _miPending[noteId] = (_miPending[noteId] || []).filter(c => c.note.id !== targetId);
  S.mapaIdeas.suggestionLog.push({
    ts: Date.now(), noteId, targetId,
    score: cand ? Math.round(cand.score * 1000) / 1000 : null,
    sharedTags: cand ? cand.sharedTags : false,
    decision,
  });
  S.mapaIdeas.suggestionLog = S.mapaIdeas.suggestionLog.slice(-30);
  saveState();
}
window.miAcceptSuggestion = miAcceptSuggestion;
window.miRejectSuggestion = miRejectSuggestion;

// ── Idea del día: nota huérfana/poco conectada, una por día ─────────────
function _miIdeaDelDia() {
  const today = (typeof getActiveDate === 'function') ? getActiveDate() : new Date().toISOString().slice(0, 10);
  const st = S.mapaIdeas.lastIdeaDelDia;
  if (st && st.date === today) return _miNotes().find(n => n.id === st.noteId) || null;
  const degree = {};
  _miEdges().forEach(e => { degree[e.from] = (degree[e.from] || 0) + 1; degree[e.to] = (degree[e.to] || 0) + 1; });
  const candidates = _miNotes().filter(n => (degree[n.id] || 0) <= 1);
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  S.mapaIdeas.lastIdeaDelDia = { date: today, noteId: pick.id };
  saveState();
  return pick;
}

// ── Búsqueda full-text client-side ──────────────────────────────────────
function _miSearch(q) {
  q = (q || '').trim().toLowerCase();
  const notes = _miNotes().slice().sort((a, b) => b.editado - a.editado);
  if (!q) return notes;
  return notes.filter(n => n.texto.toLowerCase().includes(q) || (n.tags || []).some(t => t.toLowerCase().includes(q)));
}

// ── Autocompletado [[ ── al tipear dentro del textarea de edición ───────
function _miAttachAutocomplete(ta, currentId) {
  let box = null;
  const close = () => { if (box) { box.remove(); box = null; } };
  ta.addEventListener('input', () => {
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const m = before.match(/\[\[([^\]]{0,40})$/);
    close();
    if (!m) return;
    const q = m[1].toLowerCase();
    const cands = _miNotes().filter(n => n.id !== currentId && _miTitle(n).toLowerCase().includes(q)).slice(0, 6);
    if (!cands.length) return;
    box = document.createElement('div');
    box.className = 'mi-autocomplete';
    box.innerHTML = cands.map(n => `<button type="button" class="mi-ac-item" data-id="${n.id}">${_miEsc(_miTitle(n))}</button>`).join('');
    const r = ta.getBoundingClientRect();
    box.style.position = 'fixed';
    box.style.left = r.left + 'px';
    box.style.width = r.width + 'px';
    box.style.top = (r.bottom + 4) + 'px';
    document.body.appendChild(box);
    box.querySelectorAll('.mi-ac-item').forEach(btn => {
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        const n = _miNotes().find(x => x.id === id); if (!n) return;
        const label = _miTitle(n).replace(/[\[\]]/g, '');
        const newBefore = before.slice(0, before.length - m[0].length) + `[[${id}:${label}]]`;
        const after = ta.value.slice(pos);
        ta.value = newBefore + after;
        ta.selectionStart = ta.selectionEnd = newBefore.length;
        close(); ta.focus();
      });
    });
  });
  ta.addEventListener('blur', () => setTimeout(close, 150));
}

// ── Grafo (vis-network, standalone UMD por CDN — ver index.html) ────────
function _miRenderGraph(host) {
  if (typeof vis === 'undefined') { host.innerHTML = '<div class="mi-empty">No se pudo cargar la librería del grafo (sin conexión).</div>'; return; }
  const notes = _miNotes();
  if (!notes.length) { host.innerHTML = '<div class="mi-empty">Todavía no hay ideas para graficar.</div>'; return; }
  const nodes = new vis.DataSet(notes.map(n => {
    const t = _miTitle(n);
    return { id: n.id, label: t.length > 26 ? t.slice(0, 26) + '…' : t, shape: 'dot', size: 9 + Math.min(9, (n.tags || []).length * 2) };
  }));
  const edges = new vis.DataSet(_miEdges().map(e => ({ from: e.from, to: e.to })));
  if (_miNetwork) { try { _miNetwork.destroy(); } catch (e) {} _miNetwork = null; }
  _miNetwork = new vis.Network(host, { nodes, edges }, {
    autoResize: true, height: '460px',
    nodes: {
      color: { background: '#8B5CF6', border: '#C4B5FD', highlight: { background: '#C4B5FD', border: '#fff' } },
      font: { color: '#EDF4FF', size: 12 }, borderWidth: 1.5,
      shadow: { enabled: true, color: 'rgba(139,92,246,.5)', size: 10 },
    },
    edges: { color: { color: 'rgba(139,92,246,.4)', highlight: '#C4B5FD' }, smooth: { type: 'continuous' }, width: 1.3 },
    physics: { stabilization: { iterations: 120 }, barnesHut: { gravitationalConstant: -2600, springLength: 120, springConstant: .04 } },
    interaction: { hover: true, tooltipDelay: 120 },
  });
  _miNetwork.on('click', p => { if (p.nodes && p.nodes.length) miOpenNote(p.nodes[0]); });
}

// ── Navegación / render ──────────────────────────────────────────────────
function miOpenNote(id) { _miCurrentId = id; _miView = 'detail'; _miDetailMode = 'view'; _miRender(); }
function miBackToList() { _miView = 'list'; _miCurrentId = null; _miRender(); }
function miOpenGraph() { _miView = 'graph'; _miRender(); }
function miEditNote(id) { _miCurrentId = id; _miDetailMode = 'edit'; _miRender(); }
function miCancelEdit() { _miDetailMode = 'view'; _miRender(); }
function miSaveEdit(id) {
  const ta = document.getElementById('mi-edit-ta'), tg = document.getElementById('mi-edit-tags');
  miUpdateNote(id, ta ? ta.value : '', tg ? tg.value : '');
  _miDetailMode = 'view';
  _miRender();
}
function miToggleDebate(on) {
  _miEnsureState();
  S.mapaIdeas.debateMode = !!on;
  saveState();
  if (typeof showToast === 'function') showToast(on ? '🗣️ Modo debate ON (piloto)' : '🗣️ Modo debate OFF');
  _miRender();
}
// Re-render reemplaza el innerHTML (y con él, el propio input) — sin esto se pierde
// el foco/cursor a cada tecla mientras se busca.
function miSetSearch(q) {
  _miSearchQ = q;
  _miRender();
  const inp = document.querySelector('.mi-search');
  if (inp) { inp.focus(); inp.selectionStart = inp.selectionEnd = inp.value.length; }
}
function miQcToggle() { _miQuickOpen = !_miQuickOpen; _miRender(); }
function miQcClose() { _miQuickOpen = false; _miRender(); }
function miQcSave() {
  const t = document.getElementById('mi-qc-text'), g = document.getElementById('mi-qc-tags');
  const texto = t ? t.value : '';
  if (!texto.trim()) { if (t) t.focus(); return; }
  miCreateNote(texto, g ? g.value : '');
  _miQuickOpen = false;
  if (typeof showToast === 'function') showToast('💡 Idea guardada');
  _miRender();
}
function miQcKeydown(e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); miQcSave(); } }
window.miOpenNote = miOpenNote; window.miBackToList = miBackToList; window.miOpenGraph = miOpenGraph;
window.miEditNote = miEditNote; window.miCancelEdit = miCancelEdit; window.miSaveEdit = miSaveEdit;
window.miToggleDebate = miToggleDebate; window.miSetSearch = miSetSearch;
window.miQcToggle = miQcToggle; window.miQcClose = miQcClose; window.miQcSave = miQcSave; window.miQcKeydown = miQcKeydown;

function _miRenderListHtml() {
  const idd = _miIdeaDelDia();
  const iddHtml = idd ? `<button type="button" class="mi-idd" onclick="miOpenNote('${idd.id}')">
      <span class="mi-idd-ico">💡</span>
      <span class="mi-idd-body"><b>Idea del día</b><span>${_miEsc(_miTitle(idd))}</span></span>
    </button>` : '';
  const results = _miSearch(_miSearchQ);
  const cards = results.map(n => `
    <button type="button" class="mi-card" onclick="miOpenNote('${n.id}')">
      <span class="mi-card-body">
        <span class="mi-card-text">${_miEsc(_miTitle(n))}</span>
        ${(n.tags || []).length ? `<span class="mi-card-tags">${n.tags.map(t => `<span class="mi-tag">${_miEsc(t)}</span>`).join('')}</span>` : ''}
        <span class="mi-card-meta">${_miFmtDate(n.editado)}${n.embeddingPending ? ' · ⏳ embedding pendiente' : ''}${n._contradictionWarn ? ' · ⚠️ posible contradicción' : ''}</span>
      </span>
    </button>`).join('') || `<div class="mi-empty">${_miSearchQ ? 'Sin resultados para esa búsqueda.' : 'Todavía no hay ideas guardadas. Usá el botón + para empezar.'}</div>`;

  return `<div class="cm-ov-head">
      <div class="cm-ov-eyebrow">IA · MAPA DE IDEAS</div>
      <div class="cm-ov-title">Mapa de Ideas</div>
    </div>
    ${iddHtml}
    <div class="mi-toolbar">
      <div class="mi-tabs">
        <button type="button" class="mi-tab on">Lista</button>
        <button type="button" class="mi-tab" onclick="miOpenGraph()">Grafo</button>
      </div>
      <input class="inp mi-search" placeholder="Buscar por texto o tag…" value="${_miEsc(_miSearchQ)}" oninput="miSetSearch(this.value)">
    </div>
    <label class="mi-debate-toggle" title="Piloto: Jarvis argumenta en contra de una postura guardada, usando tus propias notas como restricción">
      <input type="checkbox" ${S.mapaIdeas.debateMode ? 'checked' : ''} onchange="miToggleDebate(this.checked)">
      <span class="mi-debate-slider"></span>
      <span class="mi-debate-label">🗣️ Modo debate (piloto) — ${S.mapaIdeas.debateMode ? 'ON' : 'OFF'}</span>
    </label>
    <div class="mi-grid">${cards}</div>
    <div id="mi-quickcap" class="mi-quickcap${_miQuickOpen ? ' show' : ''}">
      <textarea id="mi-qc-text" class="mi-textarea" placeholder="¿Qué pensás? Escribí tu idea, opinión o postura… (Ctrl+Enter guarda)" onkeydown="miQcKeydown(event)"></textarea>
      <input id="mi-qc-tags" class="inp" placeholder="Tags (opcional, separados por coma)">
      <div class="mi-qc-actions">
        <button class="btn btn-ghost btn-sm" onclick="miQcClose()">Cancelar</button>
        <button class="btn btn-primary btn-sm" onclick="miQcSave()">Guardar idea</button>
      </div>
    </div>
    <button type="button" class="mi-fab" onclick="miQcToggle()" title="Nueva idea" aria-label="Nueva idea">+</button>`;
}

function _miRenderDetailHtml(note) {
  const warn = note._contradictionWarn ? (() => {
    const other = _miNotes().find(x => x.id === note._contradictionWarn);
    return other ? `<div class="mi-warn">⚠️ Postura posiblemente contradictoria con: <button type="button" class="mi-link" onclick="miOpenNote('${other.id}')">${_miEsc(_miTitle(other))}</button></div>` : '';
  })() : '';

  const pend = _miPending[note.id] || [];
  const suggestions = pend.length ? `<div class="mi-suggestions">
      <div class="mi-sec-h">Sugerencias de conexión</div>
      ${pend.map(c => `<div class="mi-sugg">
          <button type="button" class="mi-link" onclick="miOpenNote('${c.note.id}')">${_miEsc(_miTitle(c.note))}</button>
          <span class="mi-sugg-score">${Math.round(c.score * 100)}%</span>
          <span class="mi-sugg-actions">
            <button class="btn btn-sm btn-primary" onclick="miAcceptSuggestion('${note.id}','${c.note.id}')">Conectar</button>
            <button class="btn btn-sm btn-ghost" onclick="miRejectSuggestion('${note.id}','${c.note.id}')">Descartar</button>
          </span>
        </div>`).join('')}
    </div>` : '';

  const body = _miDetailMode === 'edit'
    ? `<textarea id="mi-edit-ta" class="mi-textarea mi-textarea-lg" placeholder="Tu idea, opinión o postura…">${_miEsc(note.texto)}</textarea>
       <input id="mi-edit-tags" class="inp" style="margin-top:8px" value="${_miEsc((note.tags || []).join(', '))}" placeholder="Tags (separados por coma)">
       <div class="mi-detail-actions">
         <button class="btn btn-ghost btn-sm" onclick="miCancelEdit()">Cancelar</button>
         <button class="btn btn-primary btn-sm" onclick="miSaveEdit('${note.id}')">Guardar</button>
       </div>`
    : `<div class="mi-detail-text">${_miRenderTextHtml(note.texto)}</div>
       ${(note.tags || []).length ? `<div class="mi-card-tags" style="margin-top:10px">${note.tags.map(t => `<span class="mi-tag">${_miEsc(t)}</span>`).join('')}</div>` : ''}
       ${warn}
       ${suggestions}
       <div class="mi-detail-actions">
         <button class="btn btn-ghost btn-sm" onclick="miEditNote('${note.id}')">✏️ Editar</button>
         <button class="btn btn-danger btn-sm" onclick="miDeleteNote('${note.id}')">🗑 Eliminar</button>
       </div>`;

  return `<button class="po-back" onclick="miBackToList()">◂ Volver</button>
    <div class="mi-detail">
      <div class="mi-detail-meta">Creado ${_miFmtDate(note.creado)} · Editado ${_miFmtDate(note.editado)}${note.embeddingPending ? ' · ⏳ embedding pendiente (Voyage AI sin key o sin respuesta)' : ''}</div>
      ${body}
    </div>`;
}

function _miRenderGraphShell() {
  return `<button class="po-back" onclick="miBackToList()">◂ Volver</button>
    <div class="cm-ov-head" style="margin-top:8px">
      <div class="cm-ov-eyebrow">IA · MAPA DE IDEAS</div>
      <div class="cm-ov-title">Grafo</div>
    </div>
    <div id="mi-graph-host" class="mi-graph-host"></div>`;
}

function _miRender() {
  const ov = document.getElementById('mi-overlay'); if (!ov) return;
  const body = ov.querySelector('.cm-ov-body'); if (!body) return;
  _miEnsureState();

  if (_miView === 'detail') {
    const note = _miNotes().find(n => n.id === _miCurrentId);
    if (!note) { _miView = 'list'; _miRender(); return; }
    body.innerHTML = _miRenderDetailHtml(note);
    if (_miDetailMode === 'edit') {
      const ta = document.getElementById('mi-edit-ta');
      if (ta) _miAttachAutocomplete(ta, note.id);
    }
    return;
  }
  if (_miView === 'graph') {
    body.innerHTML = _miRenderGraphShell();
    setTimeout(() => { const host = document.getElementById('mi-graph-host'); if (host) _miRenderGraph(host); }, 0);
    return;
  }
  body.innerHTML = _miRenderListHtml();
  if (_miQuickOpen) setTimeout(() => { const t = document.getElementById('mi-qc-text'); if (t) t.focus(); }, 30);
}

// ── Apertura del overlay ─────────────────────────────────────────────────
const MapaIdeasUI = {
  open() {
    if (typeof CMOverlay === 'undefined') return;
    _miEnsureState();
    const { overlay } = CMOverlay.build({ id: 'mi-overlay', accent: MI_ACCENT, onClose: () => { _miView = 'list'; _miQuickOpen = false; } });
    _miView = 'list'; _miCurrentId = null;
    _miRender();
    CMOverlay.open(overlay);
  },
};
window.MapaIdeasUI = MapaIdeasUI;
window.openMapaIdeasOverlay = () => MapaIdeasUI.open();

// ── Integración con Jarvis (jarvis-agent.js: tools consultar_mapa_ideas / debatir_postura) ──
async function miConsultar(pregunta) {
  _miEnsureState();
  const notes = _miNotes();
  if (!notes.length) return { ok: true, resultados: [], msg: 'No hay notas guardadas en el Mapa de Ideas todavía.' };
  let scored = null;
  const qEmb = await _viEmbed([pregunta || '']);
  if (qEmb && qEmb[0]) {
    const v = qEmb[0];
    scored = notes.filter(n => n.embedding).map(n => ({ n, score: _miCos(v, n.embedding) })).sort((a, b) => b.score - a.score);
  }
  if (!scored || !scored.length) {
    const q = (pregunta || '').toLowerCase();
    const words = q.split(/\s+/).filter(w => w.length > 3);
    scored = notes.map(n => {
      const t = n.texto.toLowerCase();
      const score = words.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0);
      return { n, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  }
  const top = scored.slice(0, 5);
  if (!top.length) return { ok: true, resultados: [], msg: 'No encontré ninguna idea guardada relacionada con esa pregunta.' };
  return { ok: true, resultados: top.map(x => ({ id: x.n.id, texto: x.n.texto, tags: x.n.tags, score: Math.round(x.score * 100) / 100 })) };
}
function miDebatir(search) {
  _miEnsureState();
  const s = (search || '').toLowerCase();
  const note = _miNotes().find(n => n.id === search || n.texto.toLowerCase().includes(s));
  if (!note) return { ok: false, msg: 'No encontré ninguna nota que coincida con esa búsqueda en el Mapa de Ideas.' };
  const otras = _miNotes().filter(n => n.id !== note.id).slice(0, 6).map(n => n.texto.slice(0, 140));
  return {
    ok: true, postura: note.texto, otras_notas_del_usuario: otras,
    instruccion: 'Argumentá en contra de "postura" con lógica sólida y evidencia, en tono respetuoso. No contradigas las otras ideas/valores del usuario salvo el punto puntual en debate — usalas como restricción del argumento.',
  };
}
window.MapaIdeas = { consultar: miConsultar, debatir: miDebatir };
