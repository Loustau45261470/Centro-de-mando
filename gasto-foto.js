/* ══════════════════════════════════════════════════════
   GASTO POR FOTO — sacale una foto al ticket y Gemini lo lee.
   La imagen se redimensiona en el cliente, se manda a Gemini 2.5 Flash (única IA
   configurable acá que lee imágenes), y el resultado cae en un formulario editable
   que el usuario tiene que confirmar. La foto NUNCA se guarda en S ni en Firestore —
   se procesa en memoria y se descarta apenas se usa o se cancela.
   ══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const MAX_MONTO = 50000000;      // mismo techo sano que jarvis-agent.js add_transaction
  const MAX_SIDE   = 1200;          // lado mayor tras redimensionar, en px
  const JPEG_Q     = 0.8;
  const FETCH_TIMEOUT_MS = 25000;

  const esc = s => (s || '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  /* ── estilos propios (además de reusar .modal-overlay/.modal/.field/.inp/.btn de styles.css) ── */
  const style = document.createElement('style');
  style.textContent = `
    #gf-overlay .modal { max-width: 440px; margin: 0 auto; }
    .gf-hint { font-size: var(--fs-12-5); color: var(--tt); line-height: 1.5; margin: 0 0 14px; }
    .gf-camera-btn {
      width: 100%; padding: 22px 14px; border-radius: 16px; border: 1px dashed var(--hud-dim);
      background: var(--card-h); color: var(--hud); font-size: var(--fs-16); font-weight: 700;
      cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px;
      font-family: inherit;
    }
    .gf-camera-btn:hover, .gf-camera-btn:focus-visible { border-color: var(--hud); outline: 2px solid var(--hud-dim); outline-offset: 2px; }
    .gf-camera-btn .gf-ic { font-size: 30px; line-height: 1; }
    .gf-status { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 18px 4px; text-align: center; }
    .gf-spin {
      width: 34px; height: 34px; border-radius: 50%;
      border: 3px solid var(--border); border-top-color: var(--hud);
      animation: gf-spin-rot .8s linear infinite;
    }
    @keyframes gf-spin-rot { to { transform: rotate(360deg); } }
    .gf-status-txt { font-size: var(--fs-14); color: var(--ts); font-weight: 600; }
    .gf-error { color: var(--danger); font-size: var(--fs-13); font-weight: 600; }
    .gf-preview-thumb { max-width: 140px; max-height: 140px; border-radius: 10px; border: 1px solid var(--border); }
    .gf-actions-row { display: flex; gap: 10px; width: 100%; margin-top: 6px; }
    .gf-actions-row .btn { flex: 1; }
    .gf-note { font-size: var(--fs-12-5); color: var(--tt); margin-top: 10px; }
    @media (prefers-reduced-motion: reduce) {
      .gf-spin { animation-duration: 1.6s; }
    }
  `;
  document.head.appendChild(style);

  /* ── DOM base (overlay reusa las clases globales .modal-overlay/.modal) ── */
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'gf-overlay';
  overlay.setAttribute('role', 'presentation');
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="gf-title">
      <div class="modal-handle"></div>
      <div class="modal-title" id="gf-title">📷 Gasto por foto</div>
      <div id="gf-body"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.setAttribute('capture', 'environment');
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  const body = () => document.getElementById('gf-body');

  let _abortCtrl = null;

  function abrir() {
    _abortCtrl = null;
    fileInput.value = '';
    _renderCapture();
    overlay.classList.add('open');
  }
  function cerrar() {
    if (_abortCtrl) { try { _abortCtrl.abort(); } catch (e) {} _abortCtrl = null; }
    overlay.classList.remove('open');
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) cerrar(); });

  /* ── estado 1: elegir/tomar foto ── */
  function _renderCapture(errorMsg) {
    body().innerHTML = `
      <p class="gf-hint">Sacale una foto al ticket. La imagen se achica antes de mandarse y se descarta apenas se lee — no queda guardada.</p>
      ${errorMsg ? `<p class="gf-error">${esc(errorMsg)}</p>` : ''}
      <button type="button" class="gf-camera-btn" id="gf-take-btn"><span class="gf-ic">📷</span>Tomar o elegir foto</button>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" id="gf-cancel-btn">Cancelar</button></div>
    `;
    document.getElementById('gf-take-btn').onclick = _startCapture;
    document.getElementById('gf-cancel-btn').onclick = cerrar;
  }

  function _startCapture() {
    const key = _resolveGeminiKey();
    if (!key.ok) { _renderCapture(key.msg); return; }
    fileInput.onchange = () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) _procesar(file, key.key);
    };
    fileInput.click();
  }

  // Misma key/mecanismo que jarvis-ears.js (localStorage 'jarvis_gemini_key', panel ◐ Modo Visual)
  // pero acá SOLO sirve el formato Gemini (AIza.../AQ....): Groq y OpenRouter no leen imágenes.
  function _resolveGeminiKey() {
    const key = (localStorage.getItem('jarvis_gemini_key') || '').trim();
    if (!key) {
      return { ok: false, msg: 'No hay ninguna API key de IA cargada. Abrí el panel ◐ (arriba a la derecha, "Modo Visual") y pegá una key de Gemini gratis (aistudio.google.com/apikey) en el campo "API key de IA".' };
    }
    if (key.startsWith('gsk_') || key.startsWith('sk-or-')) {
      return { ok: false, msg: 'Tu key de IA cargada es de Groq/OpenRouter, que no leen fotos. Cargá una key de Gemini (empieza con "AIza") en el panel ◐ para usar esta función.' };
    }
    return { ok: true, key };
  }

  /* ── estado 2/3: subiendo → leyendo ── */
  function _renderStatus(text) {
    body().innerHTML = `
      <div class="gf-status">
        <div class="gf-spin" aria-hidden="true"></div>
        <div class="gf-status-txt" role="status">${esc(text)}</div>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" id="gf-cancel-btn2">Cancelar</button></div>
    `;
    document.getElementById('gf-cancel-btn2').onclick = cerrar;
  }

  async function _procesar(file, geminiKey) {
    _renderStatus('Subiendo imagen…');
    let base64;
    try {
      base64 = await _resizeToBase64(file);
    } catch (e) {
      _renderFallo('No pude leer esa imagen. Probá con otra foto.');
      return;
    }
    if (!overlay.classList.contains('open')) return; // se canceló mientras redimensionaba

    _renderStatus('Leyendo el ticket…');
    _abortCtrl = new AbortController();
    const timer = setTimeout(() => _abortCtrl && _abortCtrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const catList = _catLabelsList();
      const prompt = 'Sos un lector de tickets/recibos de compra argentinos. Mirá la imagen y extraé estos datos:\n' +
        '- monto: el TOTAL pagado, como número (sin símbolo de moneda, con punto decimal, ej: 15320.5)\n' +
        '- comercio: nombre del comercio o negocio\n' +
        '- fecha: fecha del ticket en formato YYYY-MM-DD si es legible, si no null\n' +
        '- categoria: elegí la que mejor encaje EXACTAMENTE de esta lista (o null si ninguna encaja bien): ' + catList + '\n\n' +
        'Respondé ÚNICAMENTE con un JSON válido, sin texto antes ni después, con exactamente estas 4 claves: ' +
        '{"monto": number|null, "comercio": string|null, "fecha": string|null, "categoria": string|null}. ' +
        'Si no podés leer algo con confianza, poné null en ese campo — nunca inventes un valor.';

      const url = geminiKey.startsWith('AQ.')
        ? 'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent'
        : 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64 } }] }],
          generationConfig: { maxOutputTokens: 500, temperature: 0, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: _abortCtrl.signal,
      });
      clearTimeout(timer);
      if (!overlay.classList.contains('open')) return; // se canceló mientras esperaba la respuesta
      if (!res.ok) {
        let detail = '';
        try { const err = await res.json(); detail = (err.error && err.error.message) || ''; } catch (e) {}
        _renderFallo(`La IA devolvió un error (HTTP ${res.status}). ${esc(detail)}`.trim(), { retryFile: file, retryKey: geminiKey });
        return;
      }
      const data = await res.json();
      const rawText = (data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';
      const parsed = _parseModelJSON(rawText);
      if (!parsed) {
        // No pudimos parsear un JSON válido: se lo decimos al usuario y abrimos el formulario
        // manual con lo que se pueda rescatar del texto crudo (nunca se traga el error en silencio).
        showToastSafe('⚠️ No pude leer el ticket automáticamente — completá los datos a mano.');
        _renderForm({
          monto: _rescueNumber(rawText, 'monto'),
          comercio: _rescueString(rawText, 'comercio'),
          fecha: _rescueString(rawText, 'fecha'),
          categoria: _rescueString(rawText, 'categoria'),
        });
        return;
      }
      _renderForm(parsed);
    } catch (e) {
      clearTimeout(timer);
      if (!overlay.classList.contains('open')) return;
      const msg = (e && e.name === 'AbortError') ? 'La IA tardó demasiado y se canceló (timeout).' : ('No se pudo contactar a la IA (' + (e && e.message || 'error de red') + ').');
      _renderFallo(msg, { retryFile: file, retryKey: geminiKey });
    }
  }

  function _renderFallo(msg, retry) {
    body().innerHTML = `
      <div class="gf-status">
        <div class="gf-error">${esc(msg)}</div>
      </div>
      <div class="gf-actions-row">
        ${retry ? '<button type="button" class="btn btn-primary" id="gf-retry-btn">Reintentar</button>' : ''}
        <button type="button" class="btn btn-ghost" id="gf-cancel-btn3">Cancelar</button>
      </div>
    `;
    document.getElementById('gf-cancel-btn3').onclick = cerrar;
    if (retry) document.getElementById('gf-retry-btn').onclick = () => _procesar(retry.retryFile, retry.retryKey);
  }

  /* ── redimensionado cliente-side vía canvas ── */
  function _resizeToBase64(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (!width || !height) { reject(new Error('imagen vacía')); return; }
        if (width > height && width > MAX_SIDE) { height = Math.round(height * MAX_SIDE / width); width = MAX_SIDE; }
        else if (height >= width && height > MAX_SIDE) { width = Math.round(width * MAX_SIDE / height); height = MAX_SIDE; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_Q);
        const comma = dataUrl.indexOf(',');
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('no se pudo decodificar la imagen')); };
      img.src = url;
    });
  }

  /* ── parseo defensivo de la respuesta del modelo ── */
  function _parseModelJSON(text) {
    if (!text) return null;
    const match = text.match(/\{[\s\S]*\}/);
    const raw = match ? match[0] : text;
    try {
      const obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : null;
    } catch (e) { return null; }
  }
  function _rescueNumber(text, key) {
    const m = (text || '').match(new RegExp('"' + key + '"\\s*:\\s*"?(-?[0-9]+(?:\\.[0-9]+)?)"?', 'i'));
    return m ? m[1] : '';
  }
  function _rescueString(text, key) {
    const m = (text || '').match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"', 'i'));
    return m ? m[1] : '';
  }

  function _catLabelsList() {
    if (typeof ensureTxnCategories === 'function') ensureTxnCategories();
    const cats = (typeof S !== 'undefined' && S && S.txnCategories) ? S.txnCategories : {};
    return Object.values(cats).map(c => c.label).join(', ') || '(el usuario no tiene categorías cargadas)';
  }

  /* ── estado 4: formulario editable de confirmación ── */
  function _renderForm(prefill) {
    const cats = (typeof S !== 'undefined' && S && S.txnCategories) ? S.txnCategories : {};
    const accs = (typeof S !== 'undefined' && S && Array.isArray(S.accounts)) ? S.accounts : [];

    // La categoría/cuenta sugerida por el modelo se matchea contra las reales por nombre —
    // igual que add_transaction en jarvis-agent.js: nunca se inventa una categoría nueva.
    let matchedCatId = '';
    if (prefill.categoria) {
      const q = norm(prefill.categoria);
      const entries = Object.entries(cats);
      const hit = entries.find(([id, c]) => norm(c.label) === q) || entries.find(([id, c]) => norm(c.label).includes(q) || q.includes(norm(c.label)));
      if (hit) matchedCatId = hit[0];
    }

    const montoVal = (prefill.monto !== undefined && prefill.monto !== null) ? String(prefill.monto).replace(/[^0-9.,-]/g, '').replace(',', '.') : '';
    const fechaVal = (typeof prefill.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(prefill.fecha)) ? prefill.fecha
      : (typeof getActiveDate === 'function' ? getActiveDate() : new Date().toISOString().slice(0, 10));

    const catOptions = ['<option value="">— Sin categoría —</option>']
      .concat(Object.entries(cats).map(([id, c]) => `<option value="${esc(id)}" ${id === matchedCatId ? 'selected' : ''}>${esc(c.icon || '')} ${esc(c.label)}</option>`));
    const accOptions = ['<option value="">— Ninguna —</option>']
      .concat(accs.map(a => `<option value="${esc(a.id)}">${esc(a.icon || '🏦')} ${esc(a.name)}</option>`));

    body().innerHTML = `
      <p class="gf-hint">Revisá y corregí lo que haga falta antes de confirmar. No se carga nada todavía.</p>
      <div class="field"><label>Descripción / comercio</label><input class="inp" id="gf-desc" value="${esc(prefill.comercio || '')}" placeholder="Ej: Supermercado, Farmacia…" maxlength="200"></div>
      <div class="field"><label>Tipo</label>
        <select class="inp" id="gf-tipo"><option value="expense" selected>Gasto 🔴</option><option value="income">Ingreso 💚</option></select>
      </div>
      <div class="input-row">
        <div class="field" style="flex:1"><label>Monto (ARS)</label><input class="inp" type="number" step="0.01" min="0" id="gf-monto" value="${esc(montoVal)}" placeholder="0.00"></div>
        <div class="field" style="flex:1"><label>Fecha</label><input class="inp" type="date" id="gf-fecha" value="${esc(fechaVal)}"></div>
      </div>
      <div class="field"><label>Categoría</label><select class="inp" id="gf-cat">${catOptions.join('')}</select></div>
      <div class="field"><label>Cuenta</label><select class="inp" id="gf-acc">${accOptions.join('')}</select></div>
      <div id="gf-form-error" class="gf-error" style="display:none"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="gf-cancel-btn4">Cancelar</button>
        <button type="button" class="btn btn-primary" id="gf-confirm-btn">Confirmar y cargar</button>
      </div>
    `;
    document.getElementById('gf-cancel-btn4').onclick = cerrar;
    document.getElementById('gf-confirm-btn').onclick = _confirmarForm;
  }

  function _confirmarForm() {
    const errEl = document.getElementById('gf-form-error');
    errEl.style.display = 'none';
    const desc = document.getElementById('gf-desc').value.trim().slice(0, 200);
    const tipo = document.getElementById('gf-tipo').value === 'income' ? 'income' : 'expense';
    const monto = +document.getElementById('gf-monto').value;
    const fecha = document.getElementById('gf-fecha').value || (typeof getActiveDate === 'function' ? getActiveDate() : '');
    const categoryId = document.getElementById('gf-cat').value;
    const accountId = document.getElementById('gf-acc').value;

    if (!desc) { errEl.textContent = 'Falta la descripción.'; errEl.style.display = 'block'; return; }
    if (!Number.isFinite(monto) || monto <= 0 || monto > MAX_MONTO) {
      errEl.textContent = `El monto tiene que ser un número positivo y razonable (máx ${MAX_MONTO.toLocaleString('es-AR')}).`;
      errEl.style.display = 'block'; return;
    }
    if (!fecha) { errEl.textContent = 'Falta la fecha.'; errEl.style.display = 'block'; return; }

    // Misma forma de txn que finanzas.js:577 / finanzas.js:2076.
    const txn = { id: uid(), date: fecha, name: desc, type: tipo, amount: monto, currency: 'ARS', accountId, category: categoryId };
    if (accountId && typeof S !== 'undefined' && Array.isArray(S.accounts)) {
      const acc = S.accounts.find(a => a.id === accountId);
      if (acc) { acc.balance += tipo === 'income' ? monto : -monto; if (typeof snapshotNW === 'function') snapshotNW(); }
    }
    S.transactions.unshift(txn);
    saveState();
    if (typeof renderFinanzasTab === 'function') renderFinanzasTab();
    // Deshacer: un monto mal leído del ticket es el caso donde más hace falta (ver undo.js).
    if (window.CMUndo) {
      window.CMUndo.registrar({
        descripcion: (tipo === 'income' ? 'Ingreso' : 'Gasto') + ' cargado desde la foto',
        deshacer: () => {
          const i = S.transactions.findIndex(t => t.id === txn.id);
          if (i !== -1) S.transactions.splice(i, 1);
          if (accountId && Array.isArray(S.accounts)) {
            const acc = S.accounts.find(a => a.id === accountId);
            if (acc) { acc.balance -= tipo === 'income' ? monto : -monto; if (typeof snapshotNW === 'function') snapshotNW(); }
          }
          if (typeof renderFinanzasTab === 'function') renderFinanzasTab();
        },
      });
    } else {
      showToastSafe(tipo === 'income' ? '💰 Ingreso registrado desde la foto' : '🧾 Gasto registrado desde la foto');
    }
    cerrar();
  }

  function showToastSafe(msg) { if (typeof showToast === 'function') showToast(msg); }

  window.CMGastoFoto = { abrir };
  window.abrirGastoFoto = abrir;
})();
