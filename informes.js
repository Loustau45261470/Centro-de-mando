'use strict';
// ════════════════════════════════════════════════════════════════════════
// INFORMES — UI del overlay de informes periódicos (PARTE B del contrato).
// Consume window.CMInformesData (informes-datos.js, motor puro sin DOM).
// API pública: CMInformes.open(claveFoco?) / CMInformes.close()
// No toca Chart.defaults (ya tematizado en app.js). No agrega dependencias.
// ════════════════════════════════════════════════════════════════════════

const CMInformes = (() => {
  const SECCIONES = [
    { id: 'vida', label: 'Vida', accent: '#0FB9D6' },
    { id: 'finanzas', label: 'Finanzas', accent: '#16B364' },
    { id: 'conocimiento', label: 'Conocimiento', accent: '#3B82F6' },
    { id: 'salud', label: 'Salud', accent: '#F43F5E' },
    { id: 'ia', label: 'IA', accent: '#8B5CF6' },
  ];
  const GRANS = [
    { g: 'M', label: 'Mes' },
    { g: 'T', label: 'Trimestre' },
    { g: 'S', label: 'Semestre' },
    { g: 'A', label: 'Año' },
  ];
  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const MODEL = 'llama-3.3-70b-versatile';

  // Íconos SVG estilo _SF_ICONS (stroke 1.6, currentColor)
  const ICO = {
    prev: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>`,
    next: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
    ia: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="3"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 5V2.5M15 5V2.5M9 21.5V19M15 21.5V19M5 9H2.5M5 15H2.5M21.5 9H19M21.5 15H19"/></svg>`,
    up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>`,
    down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`,
  };

  // Estado del módulo
  let _overlay = null, _body = null;
  let _claveFoco = null;
  let _gran = 'M';
  let _charts = [];        // instancias Chart.js vivas
  let _io = null;           // IntersectionObserver de capítulos (lazy charts)
  let _navIo = null;        // IntersectionObserver del índice (capítulo visible)
  let _iaAbort = null;      // AbortController de la llamada IA en curso
  let _capIo = null;        // IntersectionObserver de la animación de entrada de capítulos
  let _iaOn = false;
  let _onResize = null;     // handler de resize que resincroniza el offset del sticky

  // ── Utilidades de texto seguras: nunca dejar pasar NaN/Infinity/undefined/null ──
  function safeTxt(v, fallback) {
    if (v === null || v === undefined) return fallback || '—';
    const s = String(v);
    if (s === 'NaN' || s === 'Infinity' || s === '-Infinity' || s === 'undefined' || s === 'null') return fallback || '—';
    return s;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Ciclo de vida del overlay ──
  function open(claveFoco) {
    if (typeof CMOverlay === 'undefined') { if (typeof showToast === 'function') showToast('Overlay no disponible'); return; }
    const D = window.CMInformesData;
    const { overlay, body } = CMOverlay.build({ id: 'ov-informes', accent: '#38BDF8', onClose: _onClose });
    _overlay = overlay; _body = body;

    if (!D || typeof D.claveDe !== 'function') {
      // Dependencia ausente: mensaje claro, sin excepción, sin romper el overlay.
      body.innerHTML = `
        <div class="cm-ov-head">
          <div class="cm-ov-eyebrow">INFORME</div>
          <div class="cm-ov-title">Informes no disponibles</div>
        </div>
        <div class="inf-empty">
          El motor de datos de informes todavía no está cargado en esta sesión.
          Recargá la app; si el problema persiste, avisá.
        </div>`;
      CMOverlay.open(overlay);
      return;
    }

    // El cierre de períodos no debe impedir abrir el informe, pero tampoco puede
    // desaparecer sin dejar rastro: si falla, el informe se ve igual y queda el aviso.
    try {
      if (typeof D.cerrarPeriodosVencidos === 'function') D.cerrarPeriodosVencidos();
    } catch (e) {
      console.warn('[informes] no se pudieron cerrar los períodos vencidos:', e);
      if (typeof showToast === 'function') showToast('No se pudo cerrar el período anterior');
    }

    _gran = claveFoco ? (D.parseClave(claveFoco) || {}).gran || 'M' : 'M';
    _claveFoco = claveFoco || D.claveDe('M', _todayStr());
    _iaOn = _groqKeyDisponible();

    CMOverlay.open(overlay);
    _render();

    // Cartera de inversión: sus datos NO están en S sino en data/cartera/<YYYY-MM>.json,
    // así que se piden por red. Se hace DESPUÉS del primer render para no demorar la
    // apertura; cuando llegan, se repinta. precargarCartera() nunca rechaza: un mes que
    // falta queda como 'sin datos' y el resto del informe sigue igual.
    if (typeof D.precargarCartera === 'function') {
      D.precargarCartera().then(() => {
        if (_overlay && _overlay.classList.contains('show')) _render();
      }, err => { console.warn('[informes] cartera no disponible:', err); });
    }
  }

  function close() { if (_overlay) CMOverlay.close(_overlay); }

  function _onClose() {
    _destroyCharts();
    if (_io) { _io.disconnect(); _io = null; }
    if (_navIo) { _navIo.disconnect(); _navIo = null; }
    if (_capIo) { _capIo.disconnect(); _capIo = null; }
    if (_iaAbort) { _iaAbort.abort(); _iaAbort = null; }
    if (_onResize) { window.removeEventListener('resize', _onResize); _onResize = null; }
  }

  // La barra de control es sticky dentro de .cm-ov-body: mide su alto real y lo
  // publica como --inf-bar-h para que .inf-section (CSS) pueda usar scroll-margin-top
  // y así el <h2> de cada capítulo no quede tapado al navegar por el índice.
  function _syncStickyOffset() {
    const bar = document.getElementById('inf-controlbar');
    if (!bar || !_body) return;
    _body.style.setProperty('--inf-bar-h', `${bar.offsetHeight}px`);
  }

  function _todayStr() {
    const d = new Date();
    return typeof _dStr === 'function' ? _dStr(d.getFullYear(), d.getMonth(), d.getDate())
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function _destroyCharts() {
    _charts.forEach(c => { try { c.destroy(); } catch (e) { /* instancia ya destruida */ } });
    _charts = [];
  }

  // ── Render principal ──
  function _render() {
    const D = window.CMInformesData;
    _destroyCharts();
    if (_io) { _io.disconnect(); _io = null; }
    if (_navIo) { _navIo.disconnect(); _navIo = null; }
    if (_capIo) { _capIo.disconnect(); _capIo = null; }
    if (_iaAbort) { _iaAbort.abort(); _iaAbort = null; }

    const disponibles = _safeCall(D.periodosDisponibles, [_gran], []);
    if (!disponibles || !disponibles.length) {
      _body.innerHTML = `
        <div class="cm-ov-head"><div class="cm-ov-eyebrow">INFORME</div><div class="cm-ov-title">Sin datos todavía</div></div>
        <div class="inf-empty">Todavía no hay ningún período con datos registrados. Volvé cuando la app tenga uso acumulado.</div>`;
      return;
    }
    if (!disponibles.includes(_claveFoco)) _claveFoco = disponibles[disponibles.length - 1];

    const parsed = D.parseClave(_claveFoco) || {};
    const cobertura = _safeCall(D.cobertura, [_claveFoco], {});
    const enCurso = _safeCall(D.enCurso, [_claveFoco], false);
    const label = safeTxt(_safeCall(D.labelDe, [_claveFoco], null), _claveFoco);
    const eyebrowGran = { M: 'MES', T: 'TRIMESTRE', S: 'SEMESTRE', A: 'AÑO' }[_gran] || 'PERÍODO';

    _body.innerHTML = `
      <div class="cm-ov-head">
        <div class="cm-ov-eyebrow">INFORME · ${eyebrowGran}</div>
        <div class="cm-ov-title inf-title-row">
          <span>${esc(label)}</span>
          ${enCurso ? '<span class="inf-chip inf-chip-live">EN CURSO</span>' : ''}
        </div>
        ${cobertura && cobertura.parcial ? `<div class="inf-parcial-note">Cobertura parcial: ${esc(cobertura.desde || '')} a ${esc(cobertura.hasta || '')}</div>` : ''}
      </div>
      <div class="inf-controlbar" id="inf-controlbar">
        <div class="inf-gran-tabs" role="tablist" aria-label="Granularidad del período">
          ${GRANS.map(g => `<button type="button" class="inf-gran-tab${g.g === _gran ? ' on' : ''}" role="tab" aria-selected="${g.g === _gran}" aria-label="Ver por ${g.label}" data-gran="${g.g}">${g.label}</button>`).join('')}
        </div>
        <div class="inf-period-nav">
          <button type="button" class="inf-nav-btn" id="inf-prev" aria-label="Período anterior">${ICO.prev}</button>
          <select class="inf-period-sel" id="inf-period-sel" aria-label="Elegir período"></select>
          <button type="button" class="inf-nav-btn" id="inf-next" aria-label="Período siguiente">${ICO.next}</button>
        </div>
        <button type="button" class="inf-ia-toggle${_iaOn ? ' on' : ''}" id="inf-ia-toggle" aria-pressed="${_iaOn}" aria-label="Alternar análisis por IA">${ICO.ia}<span>IA</span></button>
      </div>
      <div class="inf-layout">
        <nav class="inf-index" id="inf-index" aria-label="Índice del informe">
          <a href="#inf-sec-resumen" class="inf-index-item on" data-target="inf-sec-resumen">Resumen</a>
          ${SECCIONES.map(s => `<a href="#inf-sec-${s.id}" class="inf-index-item" data-target="inf-sec-${s.id}" style="--idx-accent:${s.accent}">${esc(s.label)}</a>`).join('')}
        </nav>
        <div class="inf-content" id="inf-content"></div>
      </div>`;

    _fillPeriodSelect(disponibles);
    _wireControlbar(disponibles);

    const content = document.getElementById('inf-content');
    content.appendChild(_buildResumen());
    SECCIONES.forEach(s => content.appendChild(_buildCapitulo(s)));

    _wireLazyCharts();
    _wireIndexObserver();
    _renderIaSlots();

    _syncStickyOffset();
    if (_onResize) window.removeEventListener('resize', _onResize);
    _onResize = () => _syncStickyOffset();
    window.addEventListener('resize', _onResize);
  }

  function _safeCall(fn, args, fallback) {
    if (typeof fn !== 'function') return fallback;
    try { const r = fn.apply(null, args); return r === undefined ? fallback : r; } catch (e) { return fallback; }
  }

  function _fillPeriodSelect(disponibles) {
    const sel = document.getElementById('inf-period-sel');
    const D = window.CMInformesData;
    sel.innerHTML = disponibles.map(c => `<option value="${c}"${c === _claveFoco ? ' selected' : ''}>${esc(safeTxt(_safeCall(D.labelDe, [c], null), c))}</option>`).join('');
  }

  function _wireControlbar(disponibles) {
    const bar = document.getElementById('inf-controlbar');
    bar.querySelectorAll('.inf-gran-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = btn.dataset.gran;
        if (g === _gran) return;
        const D = window.CMInformesData;
        _gran = g;
        const conts = _safeCall(D.contenedores, [_claveFoco], null);
        _claveFoco = (conts && conts.find(c => c && D.parseClave(c).gran === g)) || D.claveDe(g, _todayStr());
        _render();
      });
    });
    const sel = document.getElementById('inf-period-sel');
    sel.addEventListener('change', () => { _claveFoco = sel.value; _render(); });
    document.getElementById('inf-prev').addEventListener('click', () => {
      const idx = disponibles.indexOf(_claveFoco);
      if (idx > 0) { _claveFoco = disponibles[idx - 1]; _render(); }
    });
    document.getElementById('inf-next').addEventListener('click', () => {
      const idx = disponibles.indexOf(_claveFoco);
      if (idx >= 0 && idx < disponibles.length - 1) { _claveFoco = disponibles[idx + 1]; _render(); }
    });
    const iaBtn = document.getElementById('inf-ia-toggle');
    iaBtn.addEventListener('click', () => {
      _iaOn = !_iaOn;
      iaBtn.classList.toggle('on', _iaOn);
      iaBtn.setAttribute('aria-pressed', String(_iaOn));
      _renderIaSlots();
    });
  }

  // ── Resumen ejecutivo ──
  function _buildResumen() {
    const D = window.CMInformesData;
    const r = _safeCall(D.resumenEjecutivo, [_claveFoco], null);
    const sec = document.createElement('section');
    sec.id = 'inf-sec-resumen';
    sec.className = 'inf-section inf-resumen';
    sec.setAttribute('aria-labelledby', 'inf-sec-resumen-h');
    if (!r) {
      sec.innerHTML = `<h2 id="inf-sec-resumen-h" class="inf-sec-h">Resumen ejecutivo</h2><div class="inf-empty-mini">Sin datos suficientes para el resumen.</div>`;
      return sec;
    }
    const highlights = Array.isArray(r.highlights) ? r.highlights : [];
    const alertas = Array.isArray(r.alertas) ? r.alertas : [];
    const rachas = Array.isArray(r.rachas) ? r.rachas : [];
    sec.innerHTML = `
      <h2 id="inf-sec-resumen-h" class="inf-sec-h">Resumen ejecutivo</h2>
      <div class="inf-resumen-grid">
        <div class="inf-resumen-col">
          <div class="inf-resumen-lbl">Highlights</div>
          ${highlights.length ? highlights.map(h => `<div class="inf-resumen-row inf-ok"><span>${esc(h.label || h.metricaId || '')}</span><span>${esc(safeTxt(h.texto))}</span></div>`).join('') : '<div class="inf-empty-mini">Sin highlights este período.</div>'}
        </div>
        <div class="inf-resumen-col">
          <div class="inf-resumen-lbl">Alertas</div>
          ${alertas.length ? alertas.map(a => `<div class="inf-resumen-row inf-danger"><span>${esc(a.label || a.metricaId || '')}</span><span>${esc(safeTxt(a.texto))}</span></div>`).join('') : '<div class="inf-empty-mini">Sin alertas este período.</div>'}
        </div>
        <div class="inf-resumen-col">
          <div class="inf-resumen-lbl">Rachas</div>
          ${rachas.length ? rachas.map(rc => `<div class="inf-resumen-row"><span>${esc(rc.label || '')}</span><span>${esc(safeTxt(rc.actual))}${rc.record != null ? ` / récord ${esc(safeTxt(rc.record))}` : ''}</span></div>`).join('') : '<div class="inf-empty-mini">Sin rachas activas.</div>'}
        </div>
        <div class="inf-resumen-col inf-resumen-stats">
          <div class="inf-resumen-lbl">Balance de métricas</div>
          <div class="inf-stat-row"><span class="inf-ok">${esc(safeTxt(r.sobrePromedio, '0'))}</span> sobre promedio</div>
          <div class="inf-stat-row"><span class="inf-danger">${esc(safeTxt(r.bajoPromedio, '0'))}</span> bajo promedio</div>
          <div class="inf-stat-row"><span class="inf-tt">${esc(safeTxt(r.sinDatos, '0'))}</span> sin datos</div>
        </div>
      </div>`;
    return sec;
  }

  // ── Capítulos ──
  function _buildCapitulo(seccion) {
    const D = window.CMInformesData;
    const sec = document.createElement('section');
    sec.id = `inf-sec-${seccion.id}`;
    sec.className = 'inf-section inf-capitulo';
    sec.style.setProperty('--cap-accent', seccion.accent);
    sec.setAttribute('aria-labelledby', `inf-sec-${seccion.id}-h`);

    const metricas = (D.CATALOGO || []).filter(m => m.seccion === seccion.id);
    const narrativa = _safeCall(D.narrativaSeccion, [seccion.id, _claveFoco], []);

    sec.innerHTML = `
      <h2 id="inf-sec-${seccion.id}-h" class="inf-sec-h">${esc(seccion.label)}</h2>
      <div class="inf-narrativa">
        ${(narrativa || []).length ? narrativa.map(n => `<p class="inf-frase inf-tono-${esc(n.tono || 'neutral')}">${esc(safeTxt(n.texto))}</p>`).join('') : `<p class="inf-frase inf-tono-neutral inf-frase-vacia">Sin narrativa suficiente para este capítulo.</p>`}
      </div>
      <div class="inf-ia-slot" id="inf-ia-${seccion.id}"></div>
      ${metricas.length ? `<div class="inf-metric-grid" data-sec="${seccion.id}"></div>` : `<div class="inf-empty-mini">Este capítulo todavía no tiene métricas registradas.</div>`}
    `;

    const grid = sec.querySelector('.inf-metric-grid');
    if (grid) metricas.forEach(m => grid.appendChild(_buildTarjetaMetrica(m, seccion)));
    return sec;
  }

  // ── Tarjeta de métrica (matriz de ventanas + sparkline + desglose) ──
  function _buildTarjetaMetrica(metrica, seccion) {
    const D = window.CMInformesData;
    const card = document.createElement('article');
    card.className = 'inf-metric-card';
    card.dataset.metricaId = metrica.id;

    const matriz = _safeCall(D.matriz, [metrica.id, _claveFoco], null);
    const filas = (matriz && Array.isArray(matriz.filas)) ? matriz.filas : [];
    const filaFoco = filas.find(f => f.clave === _claveFoco) || filas[filas.length - 1] || null;
    const valorPrincipal = filaFoco ? _safeCall(D.fmt, [filaFoco.valor, metrica.unidad], 'sin datos') : 'sin datos';
    const sinDatos = !filaFoco || filaFoco.valor === null || filaFoco.valor === undefined;

    card.innerHTML = `
      <div class="inf-mc-head">
        <div class="inf-mc-lbl">${esc(metrica.label)}</div>
        <div class="inf-mc-valwrap${sinDatos ? ' inf-sin-datos' : ''}">
          <span class="inf-mc-val">${esc(safeTxt(valorPrincipal, 'sin datos'))}</span>
          <span class="inf-mc-unidad">${esc(metrica.unidad || '')}</span>
        </div>
      </div>
      <div class="inf-matrix" role="table" aria-label="Matriz de ventanas de ${esc(metrica.label)}">
        <div class="inf-matrix-head" role="row">
          <span role="columnheader">Ventana</span><span role="columnheader">Valor</span>
          <span role="columnheader" title="Variación contra la ventana anterior">Intra</span><span role="columnheader" title="Variación interanual: contra la misma ventana del año anterior">Interan.</span><span role="columnheader" title="Contra el promedio histórico">Prom</span>
        </div>
        ${filas.map(f => _filaMatrizHtml(f, metrica)).join('')}
      </div>
      <div class="inf-mc-serie" data-metrica="${metrica.id}"></div>
      <div class="inf-mc-desglose" data-metrica="${metrica.id}"></div>
    `;

    // Serie desagregada (ventanas más finas que el foco): sparkline + micro-stats
    if (matriz && Array.isArray(matriz.serie) && matriz.serie.length) {
      const serieBox = card.querySelector('.inf-mc-serie');
      matriz.serie.forEach(s => serieBox.appendChild(_buildSerieBlock(s, metrica, seccion)));
    }

    // Desglose (si la métrica lo trae)
    if (typeof metrica.desglose === 'function') {
      const rango = _safeCall(D.rangoDe, [_claveFoco], null);
      const desg = rango ? _safeCall(metrica.desglose, [rango.desde, rango.hasta], null) : null;
      if (Array.isArray(desg) && desg.length) {
        const box = card.querySelector('.inf-mc-desglose');
        box.appendChild(_buildDesgloseBlock(desg, metrica, seccion));
      }
    }
    return card;
  }

  function _filaMatrizHtml(f, metrica) {
    const D = window.CMInformesData;
    const sinDatos = f.valor === null || f.valor === undefined;
    // En la fila de la matriz el importe va compacto ($ 1,60 M): con 5 columnas en
    // una tarjeta de ~360px la cifra entera se cortaba a la mitad. La exacta queda
    // en el title de la celda y en el número grande del encabezado de la tarjeta.
    const val = sinDatos ? 'sin datos'
      : _safeCall(D.fmtCompacto || D.fmt, [f.valor, metrica.unidad], 'sin datos');
    const valExacto = sinDatos ? '' : _safeCall(D.fmt, [f.valor, metrica.unidad], '');
    return `
      <div class="inf-matrix-row${sinDatos ? ' inf-sin-datos' : ''}" role="row">
        <span role="cell" class="inf-mx-ventana">${esc(f.label || f.clave)}${f.parcial ? ' <em class="inf-parcial-tag">parcial</em>' : ''}${f.enCurso ? ' <em class="inf-encurso-tag">en curso</em>' : ''}</span>
        <span role="cell" class="inf-mx-val"${valExacto && valExacto !== val ? ` title="${esc(valExacto)}" aria-label="${esc(valExacto)}"` : ''}>${esc(safeTxt(val, 'sin datos'))}</span>
        ${_deltaCell(f.dIntra, 'Intra')}
        ${_deltaCell(f.dInter, 'Interanual')}
        ${_deltaCell(f.dProm, 'Prom')}
      </div>`;
  }

  // label: etiqueta de la comparación (Intra/Interanual/Prom). En desktop la da
  // el header de la matriz; en el layout colapsado de móvil (<560px) se muestra
  // inline junto al valor para no perder qué comparación es cada delta.
  //
  // Estados 'sin-dato'/'suprimido': el texto completo de Delta.texto (p. ej.
  // "— sin dato comparable") rompe la grilla en desktop (varias líneas por celda).
  // En desktop se abrevia a un guión con el texto completo en title/aria-label;
  // en móvil (<560px, donde ya hay espacio vertical y etiqueta inline) se sigue
  // mostrando entero. El texto no se reescribe ni se recalcula, solo se elige
  // qué versión queda visible según el viewport (puro CSS, sin JS de resize).
  function _deltaCell(d, label) {
    if (!d) return `<span role="cell" class="inf-delta inf-d-tt"><em class="inf-delta-lbl">${esc(label)}</em>—</span>`;
    let cls = 'inf-d-tt';
    if (d.estado === 'mejor') cls = 'inf-d-ok';
    else if (d.estado === 'peor') cls = 'inf-d-danger';
    else if (d.estado === 'igual') cls = 'inf-d-tt';
    else if (d.estado === 'nuevo') cls = 'inf-d-accent';
    const texto = safeTxt(d.texto, '— sin dato comparable');
    const proRataTag = d.proRata ? ' <em class="inf-prorata-tag">pro-rata</em>' : '';
    const abreviable = d.estado === 'sin-dato' || d.estado === 'suprimido';
    if (abreviable) {
      const full = esc(texto);
      return `<span role="cell" class="inf-delta ${cls} inf-d-abbr" title="${full}" aria-label="${esc(label)}: ${full}">` +
        `<em class="inf-delta-lbl" aria-hidden="true">${esc(label)}</em>` +
        `<span class="inf-delta-short" aria-hidden="true">—</span>` +
        `<span class="inf-delta-full" aria-hidden="true">${full}</span>` +
        `</span>`;
    }
    return `<span role="cell" class="inf-delta ${cls}"><em class="inf-delta-lbl">${esc(label)}</em>${esc(texto)}${proRataTag}</span>`;
  }

  function _buildSerieBlock(serie, metrica, seccion) {
    const D = window.CMInformesData;
    const box = document.createElement('div');
    box.className = 'inf-serie-block';
    const puntos = Array.isArray(serie.puntos) ? serie.puntos : [];
    const canvasId = `inf-spark-${metrica.id}-${serie.gran}-${uidLike()}`;
    box.innerHTML = `
      <div class="inf-serie-top">
        <span class="inf-serie-lbl">${esc(serie.label || '')}</span>
        <div class="inf-serie-stats">
          <span>mejor <b>${esc(safeTxt(_fmtOrNull(D, serie.mejor, metrica.unidad)))}</b></span>
          <span>peor <b>${esc(safeTxt(_fmtOrNull(D, serie.peor, metrica.unidad)))}</b></span>
          <span>prom <b>${esc(safeTxt(_fmtOrNull(D, serie.prom, metrica.unidad)))}</b></span>
        </div>
      </div>
      <div class="inf-spark-wrap"><canvas id="${canvasId}"></canvas></div>`;
    if (puntos.length) {
      box.dataset.lazyChart = 'spark';
      box._lazyBuild = () => _buildSparkline(canvasId, puntos, seccion.accent);
    }
    return box;
  }

  function _fmtOrNull(D, v, unidad) {
    if (v === null || v === undefined) return 'sin datos';
    return _safeCall(D.fmt, [v, unidad], 'sin datos');
  }

  function _buildDesgloseBlock(desg, metrica, seccion) {
    const box = document.createElement('div');
    box.className = 'inf-desglose-block';
    const canvasId = `inf-desg-${metrica.id}-${uidLike()}`;
    box.innerHTML = `<div class="inf-desglose-title">Desglose</div><div class="inf-desglose-chart-wrap"><canvas id="${canvasId}"></canvas></div>`;
    box.dataset.lazyChart = 'desglose';
    box._lazyBuild = () => _buildDesgloseChart(canvasId, desg, metrica, seccion.accent);
    return box;
  }

  function uidLike() { return typeof uid === 'function' ? uid() : Math.random().toString(36).slice(2, 9); }

  // ── Charts (lazy, con registro para destroy) ──
  function _buildSparkline(canvasId, puntos, accent) {
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return;
    const ch = new Chart(el.getContext('2d'), {
      type: 'line',
      data: {
        labels: puntos.map(p => p.label || p.clave),
        datasets: [{
          data: puntos.map(p => p.valor),
          borderColor: accent, backgroundColor: 'transparent',
          borderWidth: 1.6, pointRadius: 0, tension: 0.35, spanGaps: true,
        }],
      },
      options: {
        maintainAspectRatio: false, responsive: true,
        layout: { padding: { left: 4, right: 4, top: 3, bottom: 3 } },
        animation: { duration: _reducedMotion() ? 0 : 400 },
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: { x: { display: false }, y: { display: false } },
      },
    });
    _charts.push(ch);
  }

  function _buildDesgloseChart(canvasId, desg, metrica, accent) {
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return;
    const colores = desg.map((d, i) => d.color || _rampaColor(accent, i, desg.length));
    const ch = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels: desg.map(d => d.label),
        datasets: [{ data: desg.map(d => d.valor), backgroundColor: colores, borderRadius: 4 }],
      },
      options: {
        indexAxis: 'y', maintainAspectRatio: false, responsive: true,
        animation: { duration: _reducedMotion() ? 0 : 400 },
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false } }, y: { grid: { display: false } } },
      },
    });
    _charts.push(ch);
  }

  function _rampaColor(accentHex, i, total) {
    // Variar opacidad del acento en vez de inventar colores random.
    const min = 0.35, max = 0.95;
    const t = total > 1 ? i / (total - 1) : 0;
    const op = min + (max - min) * t;
    return `color-mix(in oklab, ${accentHex} ${Math.round(op * 100)}%, transparent)`;
  }

  function _reducedMotion() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ── Lazy: instanciar charts cuando el capítulo/bloque entra en viewport ──
  function _wireLazyCharts() {
    const targets = Array.from(document.querySelectorAll('.inf-serie-block[data-lazy-chart], .inf-desglose-block[data-lazy-chart]'));
    if (!targets.length) return;
    if (!('IntersectionObserver' in window)) { targets.forEach(t => { if (t._lazyBuild) t._lazyBuild(); }); return; }
    _io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const t = entry.target;
        if (t._lazyBuild && !t._lazyBuilt) { t._lazyBuilt = true; t._lazyBuild(); }
        _io.unobserve(t);
      });
    }, { root: null, rootMargin: '200px' });
    targets.forEach(t => _io.observe(t));

    // Animación de entrada escalonada por capítulo visible (respeta reduced-motion)
    if (!_reducedMotion() && ('IntersectionObserver' in window)) {
      const caps = document.querySelectorAll('.inf-capitulo, .inf-resumen');
      _capIo = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting || entry.target.classList.contains('inf-in')) return;
          entry.target.classList.add('inf-in');
          const cards = entry.target.querySelectorAll('.inf-metric-card');
          cards.forEach((c, i) => { c.style.setProperty('--inf-delay', `${Math.min(i, 8) * 40}ms`); });
        });
        // threshold 0 + isIntersecting a secas. NO usar un threshold > 0: la ratio se
        // calcula sobre el área DEL PROPIO elemento, no del viewport, así que un
        // capítulo más alto que viewport/threshold nunca puede alcanzarlo y sus
        // tarjetas quedan en opacity:0 para siempre (pasaba con Finanzas a 390px,
        // que mide ~15 viewports de alto).
      }, { threshold: 0 });
      // .inf-anim la pone el JS recién acá: si el observer no llega a montarse, el
      // contenido queda visible por defecto en vez de invisible.
      caps.forEach(c => { c.classList.add('inf-anim'); _capIo.observe(c); });
    }
  }

  // ── Índice lateral: marcar capítulo visible ──
  function _wireIndexObserver() {
    const idx = document.getElementById('inf-index');
    const items = Array.from(idx.querySelectorAll('.inf-index-item'));
    items.forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(a.dataset.target);
      if (target) target.scrollIntoView({ behavior: _reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }));
    const sections = Array.from(document.querySelectorAll('.inf-section'));
    if (!('IntersectionObserver' in window) || !sections.length) return;
    _navIo = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        items.forEach(a => a.classList.toggle('on', a.dataset.target === entry.target.id));
      });
    }, { root: _body, rootMargin: '-20% 0px -70% 0px', threshold: 0 });
    sections.forEach(s => _navIo.observe(s));
  }

  // ── Capa IA (Groq) ──
  function _groqKeyDisponible() {
    const key = _leerKey();
    return !!key && key.startsWith('gsk_');
  }
  function _leerKey() {
    try { return localStorage.getItem('agent_api_key_v1') || ''; } catch (e) { return ''; }
  }

  function _renderIaSlots() {
    if (_iaAbort) { _iaAbort.abort(); _iaAbort = null; }
    SECCIONES.forEach(s => {
      const slot = document.getElementById(`inf-ia-${s.id}`);
      if (!slot) return;
      if (!_iaOn) {
        const key = _leerKey();
        slot.innerHTML = key && !key.startsWith('gsk_')
          ? `<div class="inf-ia-aviso">Análisis IA disponible con key de Groq (gratis).</div>`
          : '';
        return;
      }
      if (!_groqKeyDisponible()) {
        slot.innerHTML = `<div class="inf-ia-aviso">Análisis IA disponible con key de Groq (gratis).</div>`;
        return;
      }
      slot.innerHTML = `<div class="inf-ia-skel"><span></span><span></span><span></span></div>`;
      _pedirAnalisisIa(s.id, slot);
    });
  }

  function _pedirAnalisisIa(seccionId, slot) {
    const D = window.CMInformesData;
    const metricas = (D.CATALOGO || []).filter(m => m.seccion === seccionId && m.destacada);
    const payload = metricas.map(m => {
      const matriz = _safeCall(D.matriz, [m.id, _claveFoco], null);
      const filaFoco = matriz && Array.isArray(matriz.filas) ? matriz.filas.find(f => f.clave === _claveFoco) : null;
      if (!filaFoco) return null;
      return {
        seccion: seccionId, label: m.label, valor: filaFoco.valor, unidad: m.unidad,
        dIntra: filaFoco.dIntra ? { texto: filaFoco.dIntra.texto, estado: filaFoco.dIntra.estado } : null,
        dInter: filaFoco.dInter ? { texto: filaFoco.dInter.texto, estado: filaFoco.dInter.estado } : null,
      };
    }).filter(Boolean);

    if (!payload.length) { slot.innerHTML = `<div class="inf-ia-aviso">Sin métricas suficientes para el análisis IA de este capítulo.</div>`; return; }

    const key = _leerKey();
    const ctrl = new AbortController();
    _iaAbort = ctrl;
    const timeoutId = setTimeout(() => ctrl.abort(), 20000);

    fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'Sos un analista personal. Español rioplatense. Redactá 4 a 6 frases breves analizando estas métricas agregadas de un período. No inventes datos que no estén en el JSON. Sin consejos genéricos de autoayuda. Sin markdown.' },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        temperature: 0.4,
      }),
    }).then(res => {
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`groq ${res.status}`);
      return res.json();
    }).then(data => {
      const texto = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!texto || !String(texto).trim()) { slot.innerHTML = `<div class="inf-ia-aviso">La IA no devolvió análisis para este capítulo.</div>`; return; }
      slot.innerHTML = `<div class="inf-ia-block"><div class="inf-ia-eyebrow">Análisis IA</div><p>${esc(texto).replace(/\n+/g, '</p><p>')}</p></div>`;
    }).catch(err => {
      clearTimeout(timeoutId);
      const motivo = err && err.name === 'AbortError' ? 'tiempo agotado' : 'error de conexión';
      slot.innerHTML = `<div class="inf-ia-aviso">Análisis IA no disponible (${esc(motivo)}). La narrativa por reglas de arriba sigue siendo válida.</div>`;
    });
  }

  return { open, close };
})();
window.CMInformes = CMInformes;
