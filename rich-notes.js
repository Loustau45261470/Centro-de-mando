'use strict';
// ════════════════════════════════════════════════════════════════════════
// RICH NOTES — parser/renderer de formato enriquecido estilo Notion sobre
// el texto plano ya guardado en cada módulo de notas (notas-intelecto.js,
// notas-estudio.js, finanzas-notas.js, salud-notas.js). NO cambia el schema:
// sigue siendo un string; esto solo lo interpreta para mostrarlo con estilo.
//
// Sintaxis soportada (por inicio de línea):
//   # / ## / ###      → encabezados h1/h2/h3
//   - texto / * texto → lista con viñetas
//   1. texto          → lista numerada
//   [] texto / [x] texto → checklist (clickeable si es interactivo)
//   > texto           → cita
//   >> Título         → bloque desplegable (toggle); líneas siguientes
//                       indentadas con espacio/tab = contenido colapsable
//                       (usa <details>/<summary> nativo del navegador)
//   ---               → separador
//   **negrita** *cursiva* `code` → inline
//   cualquier otra línea → párrafo
//
// API pública:
//   rnRender(texto, opts) → string HTML
//     opts.interactive (default true)
//     opts.texto        → texto original (para el toggle de checkboxes)
//     opts.onSave(nuevoTexto) → callback al tildar/destildar un checkbox
//   rnToggleCheckLine(el, lineIndex) → invocado desde el onclick del checkbox
// ════════════════════════════════════════════════════════════════════════

const _rnRegistry = {};
let _rnCounter = 0;

const _rnEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function rnInline(text) {
  let t = _rnEsc(text);
  t = t.replace(/`([^`]+)`/g, '<code class="rn-code">$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return t;
}

function _rnParse(lines, interactive, rnId) {
  const out = [];
  let listType = null;   // 'ul' | 'ol' | 'todo'
  let listBuf = [];
  let quoteBuf = [];

  const flushList = () => {
    if (!listType) return;
    const cls = listType === 'todo' ? 'rn-todo-list' : listType === 'ol' ? 'rn-numbered-list' : 'rn-bullet-list';
    const tag = listType === 'ol' ? 'ol' : 'ul';
    out.push(`<${tag} class="rn-list ${cls}">${listBuf.join('')}</${tag}>`);
    listBuf = []; listType = null;
  };
  const flushQuote = () => {
    if (!quoteBuf.length) return;
    out.push(`<blockquote class="rn-quote">${quoteBuf.join('<br>')}</blockquote>`);
    quoteBuf = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    let m;

    // Toggle / bloque desplegable: ">> Título" + líneas indentadas
    if ((m = /^>>\s?(.*)$/.exec(line))) {
      flushList(); flushQuote();
      const body = [];
      let j = i + 1;
      while (j < lines.length && /^[ \t]+\S/.test(lines[j])) { body.push(lines[j].replace(/^[ \t]/, '')); j++; }
      out.push(`<details class="rn-toggle"><summary class="rn-toggle-summary">${rnInline(m[1])}</summary><div class="rn-toggle-body">${body.map(b => rnInline(b)).join('<br>')}</div></details>`);
      i = j;
      continue;
    }

    if (trimmed === '') { flushList(); flushQuote(); i++; continue; }

    if (/^-{3,}$/.test(trimmed)) { flushList(); flushQuote(); out.push('<hr class="rn-divider">'); i++; continue; }

    if ((m = /^(#{1,3})\s+(.*)$/.exec(trimmed))) {
      flushList(); flushQuote();
      const lvl = m[1].length;
      out.push(`<h${lvl} class="rn-h${lvl}">${rnInline(m[2])}</h${lvl}>`);
      i++; continue;
    }

    if ((m = /^\[( |x|X)?\]\s+(.*)$/.exec(trimmed))) {
      flushQuote();
      if (listType !== 'todo') { flushList(); listType = 'todo'; }
      const checked = /x/i.test(m[1] || '');
      const check = (interactive && rnId)
        ? `<input type="checkbox" class="rn-todo-check" ${checked ? 'checked' : ''} onclick="rnToggleCheckLine(this, ${i})">`
        : `<span class="rn-todo-check-static${checked ? ' checked' : ''}"></span>`;
      listBuf.push(`<li class="rn-todo-item${checked ? ' rn-todo-done' : ''}">${check}<span class="rn-todo-text">${rnInline(m[2])}</span></li>`);
      i++; continue;
    }

    if ((m = /^[-*]\s+(.*)$/.exec(trimmed))) {
      flushQuote();
      if (listType !== 'ul') { flushList(); listType = 'ul'; }
      listBuf.push(`<li class="rn-bullet-item">${rnInline(m[1])}</li>`);
      i++; continue;
    }

    if ((m = /^\d+\.\s+(.*)$/.exec(trimmed))) {
      flushQuote();
      if (listType !== 'ol') { flushList(); listType = 'ol'; }
      listBuf.push(`<li class="rn-numbered-item">${rnInline(m[1])}</li>`);
      i++; continue;
    }

    if ((m = /^>\s?(.*)$/.exec(trimmed))) {
      flushList();
      quoteBuf.push(rnInline(m[1]));
      i++; continue;
    }

    flushList(); flushQuote();
    out.push(`<p class="rn-p">${rnInline(trimmed)}</p>`);
    i++;
  }
  flushList(); flushQuote();
  return out.join('');
}

/**
 * Renderiza texto plano estilo Notion.
 * @param {string} texto
 * @param {{interactive?: boolean, texto?: string, onSave?: (nuevo:string)=>void}} [opts]
 * @returns {string} HTML
 */
function rnRender(texto, opts) {
  opts = opts || {};
  const interactive = opts.interactive !== false;
  const rawTexto = opts.texto != null ? opts.texto : texto;
  const lines = String(texto == null ? '' : texto).split('\n');

  let rnId = null;
  if (interactive && typeof opts.onSave === 'function') {
    rnId = 'rn' + (_rnCounter++);
    _rnRegistry[rnId] = { texto: rawTexto, onSave: opts.onSave };
  }

  const inner = _rnParse(lines, interactive, rnId);
  return `<div class="rn-content"${rnId ? ` data-rn-id="${rnId}"` : ''}>${inner}</div>`;
}

/**
 * Invocado desde el onclick de un checkbox generado por rnRender.
 * Invierte [ ]/[x] en la línea indicada del texto original y llama a onSave.
 */
function rnToggleCheckLine(el, lineIndex) {
  const container = el.closest && el.closest('[data-rn-id]');
  if (!container) return;
  const entry = _rnRegistry[container.dataset.rnId];
  if (!entry) return;
  const lines = entry.texto.split('\n');
  const line = lines[lineIndex];
  if (line == null) return;
  const m = /^(\s*)\[( |x|X)?\](.*)$/.exec(line);
  if (!m) return;
  const checked = /x/i.test(m[2] || '');
  lines[lineIndex] = `${m[1]}[${checked ? '' : 'x'}]${m[3]}`;
  entry.texto = lines.join('\n');
  entry.onSave(entry.texto);
}
