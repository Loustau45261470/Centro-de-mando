'use strict';
// ════════════════════════════════════════════════════════════════════════
// RADAR DE EMPRESAS — pestaña "Radar" de Cartera (cartera-overlay.js; se monta con Radar.renderInto(contenedor), igual que Tenencias).
// Una ficha por empresa (las de la cartera + las que sumás al radar) con categoría propia, ⭐ seguir, tesis, historial de cambios
// de categoría y los fundamentals de la SEC. Múltiplos al vuelo: el precio llega en vivo (Worker /radar/precios) y el denominador
// (EPS, ventas, EBITDA, FCF TTM) sale de la última ficha de la SEC → si el precio se mueve, el P/E se mueve; nada queda congelado.
//
// Datos y dónde viven:
//   S.radar = { items: [{ id, t, cat, star, tesis, tesisF, hist: [{ f, de, a, m }], creado }] }   ← chico, va en el estado como el resto.
//     t = ticker en EE.UU. · cat = clave de CATS ('' = sin categoría) · star = 0|1 · f = 'YYYY-MM-DD' · de/a = claves de categoría · m = motivo.
//     Las posiciones de la cartera (CEDEARs de tenencias.json) aparecen solas, "en cartera", y recién entran a S.radar cuando les ponés
//     categoría, ⭐ o tesis.
//   Fundamentals: NO van en S. Los calcula un workflow de GitHub Actions en el repo privado de datos (tools/radar-job/) y quedan en
//     fund-index.json (resumen de todas, para la lista) y fund-<TICKER>.json (ficha de 10 años), que se leen con GET /datos/<archivo>.
//   Precio: GET /radar/precios del Worker (Yahoo Finance, USD, caché 60 s). Empresa nueva: POST /radar/pedir lanza el workflow.
// Cálculo (RadarCalc, radar-calc.js): fórmulas documentadas arriba de ese archivo.
// ════════════════════════════════════════════════════════════════════════

// ── Configuración de la ficha: para sacar o agregar una fila o una métrica, cambiar UNA línea acá (el render no se toca) ──
// Tabla "Estados financieros". k = clave en RadarCalc.completar() (anual[k] y ttm[k]) · f = formato (m millones de US$ · p porcentaje ·
// x US$ por acción · a millones de acciones) · neg = mostrar como salida de caja (negativo) · col = 'TTM' (flujos) o 'Último informe' (balance).
const FILAS = [
  { grupo: 'Resultados', col: 'TTM' },
  { k: 'ingresos', t: 'Ingresos', f: 'm' },
  { k: 'mBruto', t: 'Margen bruto', f: 'p' },
  { k: 'ebit', t: 'EBIT', f: 'm' },
  { k: 'neto', t: 'Resultado neto', f: 'm' },
  { k: 'eps', t: 'EPS diluido', f: 'x' },
  { grupo: 'Balance', col: 'Último informe' },
  { k: 'caja', t: 'Caja', f: 'm' },
  { k: 'deuda', t: 'Deuda total', f: 'm' },
  { k: 'deudaNeta', t: 'Deuda neta', f: 'm' },
  { k: 'patrimonio', t: 'Patrimonio', f: 'm' },
  { k: 'acciones', t: 'Acciones diluidas', f: 'a' },
  { grupo: 'Flujo de caja', col: 'TTM' },
  { k: 'cfo', t: 'Flujo operativo', f: 'm' },
  { k: 'capex', t: 'Capex', f: 'm', neg: true },
  { k: 'fcf', t: 'Flujo libre (FCF)', f: 'm' },
];
// Tarjetas. Cada métrica: [etiqueta, formato, 'ttm.<clave>' (RadarCalc.completar) o 'vivo.<clave>' (RadarCalc.multiplos con el precio en vivo)]. Formatos: mm (US$ millones), p, mult.
const TARJETAS = [
  { titulo: 'Valuación', vivo: true, items: [['P/E', 'mult', 'vivo.pe'], ['P/S', 'mult', 'vivo.ps'], ['EV/EBITDA', 'mult', 'vivo.evEbitda'], ['FCF yield', 'p', 'vivo.fcfYield']] },
  { titulo: 'Rentabilidad', items: [['Margen bruto', 'p', 'ttm.mBruto'], ['Margen EBIT', 'p', 'ttm.mOper'], ['Margen neto', 'p', 'ttm.mNeto'], ['ROE (TTM)', 'p', 'ttm.roe'], ['ROA (TTM)', 'p', 'ttm.roa'], ['ROIC (TTM)', 'p', 'ttm.roic']] },
  { titulo: 'Estructura de capital', items: [['Cap. bursátil', 'mm', 'vivo.marketCap'], ['Deuda total', 'mm', 'ttm.deuda'], ['Efectivo', 'mm', 'ttm.caja'], ['Valor de empresa', 'mm', 'vivo.ev']] },
];
// Categorías propias: [clave, nombre, color]. El nombre va siempre escrito en el chip (el color no es lo único que informa).
const CATS = [
  ['top', 'Empresa top', '#F5A623'], ['solida', 'Sólida', '#38BDF8'], ['mediocre', 'Mediocre', '#94A3B8'], ['obs', 'En observación', '#A78BFA'],
  ['venta', 'Venta o posible venta', '#FF3358'], ['compra', 'Compra o posible compra', '#22C55E'], ['ganancias', 'Tomar ganancias parciales', '#14B8A6'],
  ['aumentar', 'Aumentar posición', '#84CC16'], ['reducir', 'Reducir posición', '#FB923C'],
];
const RD_TABS = [['resumen', 'Resumen'], ['tesis', 'Tesis'], ['historial', 'Historial']];

const Radar = (() => {
  const URL_WORKER = 'https://cdm-push-worker.tobiasloustau11.workers.dev';
  const TIMEOUT_MS = 12000;
  const PRECIOS_MS = 60000;        // el precio se renueva solo cada minuto mientras la pestaña está a la vista
  const POLL_MS = 20000;           // mientras faltan datos de la SEC se vuelve a mirar el índice
  const POLL_MAX_MS = 12 * 60000;
  const MAX_PRECIOS = 30;          // tope del Worker por consulta

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esNum = v => typeof v === 'number' && isFinite(v);
  const C = () => window.RadarCalc;
  const catDe = k => CATS.find(c => c[0] === k) || null;

  // ── Estado en memoria ──
  let _box = null;
  let _v = vistaNueva();
  let _tenencias = [];                 // [{ t, nombre }] CEDEARs de la cartera
  let _tenEstado = 'cargando';         // cargando | ok | error
  let _indice = null;                  // { empresas: {} } | null (sin cargar)
  let _indiceEstado = { tipo: 'cargando', texto: '' };   // tipo: cargando | ok | vacio | error
  let _precios = {};                   // T -> { precio, previo, hora, moneda }
  let _preciosErr = {};                // T -> 'not_found' | 'unavailable'
  let _preciosEstado = { tipo: 'cargando', texto: '' };  // cargando | ok | error
  let _fichas = {};                    // T -> { estado: 'cargando'|'ok'|'pendiente'|'no_sec'|'sin_datos'|'error', data, texto }
  const _pedidos = new Set();
  let _pedirError = '';
  let _pollHasta = 0, _pollTimer = null, _pxTimer = null;

  function vistaNueva() { return { screen: 'lista', t: null, tab: 'resumen', fCat: '', fStar: false, fCartera: false, q: '', nuevo: false, nuevoErr: '', catPend: null, tesisEd: false }; }

  // ── Datos (S.radar) ──
  function data() {
    if (typeof S === 'undefined') return { items: [] };
    let d = S.radar;
    if (!d || typeof d !== 'object' || Array.isArray(d)) d = S.radar = { items: [] };
    if (!Array.isArray(d.items)) d.items = [];
    return d;
  }
  const item = t => data().items.find(x => x.t === t) || null;
  function asegurar(t) {
    let it = item(t);
    if (!it) { it = { id: uid(), t, cat: '', star: 0, tesis: '', hist: [], creado: Date.now() }; data().items.push(it); }
    return it;
  }
  const uid = () => (typeof window.uid === 'function' ? window.uid() : Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const guardar = () => { if (typeof saveState === 'function') saveState(); };
  const toast = m => { if (typeof showToast === 'function') showToast(m); };
  const hoy = () => (typeof getActiveDate === 'function' ? getActiveDate() : new Date().toISOString().slice(0, 10));
  const enCartera = t => _tenencias.some(x => x.t === t);

  // Lista = cartera + items del radar, sin repetir.
  function filas() {
    const m = new Map();
    for (const x of _tenencias) m.set(x.t, { t: x.t, it: null, cartera: true, nombre: x.nombre });
    for (const it of data().items) { const p = m.get(it.t); if (p) p.it = it; else m.set(it.t, { t: it.t, it, cartera: false, nombre: '' }); }
    return [...m.values()];
  }
  const todosTickers = () => filas().map(f => f.t);

  // ── Red ──
  class ErrRadar extends Error { constructor(tipo, msg) { super(msg); this.tipo = tipo; } }
  async function wk(ruta, opts) {
    if (typeof _auth === 'undefined' || !_auth || !_auth.currentUser) throw new ErrRadar('sesion', 'Iniciá sesión para usar el radar.');
    const token = await _auth.currentUser.getIdToken();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      const init = { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: ctrl.signal };
      if (opts && opts.body) { init.method = 'POST'; init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
      res = await fetch(URL_WORKER + ruta, init);
    } catch (e) {
      throw new ErrRadar(e && e.name === 'AbortError' ? 'timeout' : 'red', e && e.name === 'AbortError' ? 'El servidor tardó demasiado en responder.' : 'No hay conexión con el servidor.');
    } finally { clearTimeout(timer); }
    if (res.ok) return res.json();
    const j = await res.json().catch(() => null);
    // Un Worker viejo (sin las rutas nuevas) contesta 401/404 sin JSON de error.
    if (!j || !j.error) throw new ErrRadar('servidor', 'Falta publicar el servidor (Worker) con las rutas del radar.');
    throw new ErrRadar(j.error, j.message || ('El servidor respondió ' + res.status));
  }

  async function cargarTenencias() {
    _tenEstado = 'cargando';
    try {
      const d = window.CMDatos ? await CMDatos.cartera('tenencias.json') : null;
      if (!d || !Array.isArray(d.tenencias)) throw new Error('sin datos');
      const vistos = new Set();
      _tenencias = [];
      for (const x of d.tenencias) {
        const t = C().tickerDeCedear(x && x.simbolo, x && x.tipo);
        if (t && !vistos.has(t) && Number(x.cantidad) !== 0) { vistos.add(t); _tenencias.push({ t, nombre: String(x.descripcion || '').replace(/^cedear\s+/i, '').trim() }); }
      }
      _tenEstado = 'ok';
    } catch (_) { _tenencias = []; _tenEstado = 'error'; }
  }

  async function cargarIndice() {
    try {
      const j = await wk('/datos/fund-index.json');
      _indice = j && j.empresas ? j : { empresas: {} };
      _indiceEstado = { tipo: Object.keys(_indice.empresas).length ? 'ok' : 'vacio', texto: '' };
    } catch (e) {
      if (e.tipo === 'not_found') { _indice = { empresas: {} }; _indiceEstado = { tipo: 'vacio', texto: '' }; }
      else { if (!_indice) _indice = { empresas: {} }; _indiceEstado = { tipo: 'error', texto: e.message }; }
    }
  }

  async function cargarPrecios(tickers) {
    const lista = (tickers || todosTickers()).slice(0, 60);
    if (!lista.length) { _preciosEstado = { tipo: 'ok', texto: '' }; return; }
    try {
      for (let i = 0; i < lista.length; i += MAX_PRECIOS) {
        const j = await wk('/radar/precios?t=' + lista.slice(i, i + MAX_PRECIOS).map(encodeURIComponent).join(','));
        for (const t of Object.keys(j.precios || {})) {
          if (j.precios[t]) { _precios[t] = j.precios[t]; delete _preciosErr[t]; }
          else _preciosErr[t] = (j.errores && j.errores[t]) || 'unavailable';
        }
      }
      _preciosEstado = { tipo: 'ok', texto: '' };
    } catch (e) { _preciosEstado = { tipo: 'error', texto: e.message }; }
  }

  // Pide al Worker que el workflow baje los datos de las empresas que todavía no están en el índice.
  async function pedirFaltantes() {
    if (!_indice || _indiceEstado.tipo === 'error') return;
    const faltan = todosTickers().filter(t => !_indice.empresas[t] && !_pedidos.has(t));
    if (!faltan.length) return;
    faltan.forEach(t => _pedidos.add(t));
    try {
      for (let i = 0; i < faltan.length; i += 25) await wk('/radar/pedir', { body: { tickers: faltan.slice(i, i + 25) } });
      _pedirError = '';
      _pollHasta = Date.now() + POLL_MAX_MS;
      programarPoll();
    } catch (e) { faltan.forEach(t => _pedidos.delete(t)); _pedirError = e.message; }
  }

  function programarPoll() {
    clearTimeout(_pollTimer);
    if (!_box || !_box.isConnected || Date.now() > _pollHasta) return;
    _pollTimer = setTimeout(async () => {
      if (!_box || !_box.isConnected) return;
      await cargarIndice();
      if (_v.screen === 'ficha' && _v.t) await cargarFicha(_v.t, true);
      pintar();
      if (todosTickers().some(t => _indice && !_indice.empresas[t])) programarPoll();
    }, POLL_MS);
  }

  // Ficha completa de una empresa (10 años) desde el repo privado, o el motivo por el que no hay.
  async function cargarFicha(t, forzar) {
    const f = _fichas[t];
    if (!forzar && f && (f.estado === 'ok' || f.estado === 'cargando')) return;
    const e = _indice && _indice.empresas[t];
    if (e && e.error) { _fichas[t] = { estado: e.error === 'no_sec' ? 'no_sec' : 'sin_datos' }; return; }
    if (_indice && !e) { _fichas[t] = { estado: _indiceEstado.tipo === 'error' ? 'error' : 'pendiente', texto: _indiceEstado.texto }; return; }
    _fichas[t] = { estado: 'cargando' };
    try {
      const j = await wk('/datos/fund-' + encodeURIComponent(t) + '.json');
      _fichas[t] = j && j.error ? { estado: j.error === 'no_sec' ? 'no_sec' : 'sin_datos' } : { estado: 'ok', data: j };
    } catch (err) {
      _fichas[t] = err.tipo === 'not_found' ? { estado: 'pendiente' } : { estado: 'error', texto: err.message };
    }
  }

  async function cargarTodo() {
    await Promise.all([cargarTenencias(), cargarIndice()]);
    pintar();
    await cargarPrecios();
    pintar();
    await pedirFaltantes();
    pintar();
    if (_v.screen === 'ficha' && _v.t) { await cargarFicha(_v.t, true); pintar(); }
  }

  // ── Formato (es-AR; null → "—"; negativos entre paréntesis) ──
  const nf = (v, dec) => Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const conSigno = (s, v) => (v < 0 ? '(' + s + ')' : s);
  function fmt(v, f) {
    if (!esNum(v)) return '—';
    if (f === 'm') return conSigno(nf(Math.round(v / 1e6), 0), Math.round(v / 1e6));
    if (f === 'p') return conSigno(nf(v * 100, 1) + '%', v);
    if (f === 'x') return conSigno(nf(v, 2), v);
    if (f === 'a') { const m = v / 1e6; return nf(m, Math.abs(m) >= 100 ? 0 : 1); }
    if (f === 'mult') return nf(v, 1) + 'x';
    if (f === 'mm') return 'US$ ' + conSigno(nf(Math.round(v / 1e6), 0), v) + ' M';
    return String(v);
  }
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const colFecha = iso => (iso ? MESES[Number(iso.slice(5, 7)) - 1] + ' ' + iso.slice(0, 4) : '');
  const fechaLarga = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
  function hace(ms) {
    if (!esNum(ms)) return '';
    const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (m < 1) return 'recién';
    if (m < 60) return 'hace ' + m + ' min';
    if (m < 48 * 60) return 'hace ' + Math.round(m / 60) + ' h';
    return 'del ' + new Date(ms).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' });
  }
  const usd = v => (esNum(v) ? 'US$ ' + nf(v, 2) : '—');

  // Precio utilizable (USD) de un ticker.
  function precioDe(t) { const p = _precios[t]; return p && esNum(p.precio) && (!p.moneda || p.moneda === 'USD') ? p.precio : null; }
  function resumenDe(t) { const e = _indice && _indice.empresas[t]; return e && !e.error ? e : null; }

  // ── Piezas ──
  function chip(k) {
    const c = catDe(k);
    return c ? `<span class="rd-chip" style="--c:${c[2]}">${esc(c[1])}</span>` : '';
  }
  const starBtn = (t, on) => `<button class="rd-star${on ? ' on' : ''}" data-act="star" data-t="${esc(t)}" role="switch" aria-checked="${!!on}" aria-label="Seguir ${esc(t)}" title="${on ? 'Dejar de seguir' : 'Seguir'}">★</button>`;

  function sparkline(vals, f) {
    const v = vals.slice(-10);
    const num = v.filter(esNum);
    if (num.length < 2) return '<span class="rd-spark rd-spark-vacio" aria-hidden="true"></span>';
    const W = 4, G = 2, H = 20, hayNeg = num.some(x => x < 0), max = Math.max(...num.map(Math.abs)) || 1;
    const base = hayNeg ? H / 2 : H - 1, esc_ = (hayNeg ? H / 2 - 1 : H - 2) / max;
    let ultimo = -1; v.forEach((x, i) => { if (esNum(x)) ultimo = i; });
    const barras = v.map((x, i) => {
      if (!esNum(x)) return '';
      const h = Math.max(1, Math.abs(x) * esc_), y = x >= 0 ? base - h : base;
      return `<rect class="${i === ultimo ? 'ult' : ''}" x="${i * (W + G)}" y="${y.toFixed(1)}" width="${W}" height="${h.toFixed(1)}" rx="1"/>`;
    }).join('');
    return `<svg class="rd-spark" viewBox="0 0 ${v.length * (W + G) - G} ${H}" width="${v.length * (W + G) - G}" height="${H}" aria-hidden="true" focusable="false">${barras}</svg>`;
  }

  // ── Lista ──
  function ordenar(arr) {
    return arr.sort((a, b) => ((b.it && b.it.star ? 1 : 0) - (a.it && a.it.star ? 1 : 0)) || ((b.cartera ? 1 : 0) - (a.cartera ? 1 : 0)) || a.t.localeCompare(b.t));
  }
  function filtrar(arr) {
    const q = _v.q.trim().toUpperCase();
    return arr.filter(r => {
      if (_v.fCat === '_sin' ? !!(r.it && r.it.cat) : _v.fCat && !(r.it && r.it.cat === _v.fCat)) return false;
      if (_v.fStar && !(r.it && r.it.star)) return false;
      if (_v.fCartera && !r.cartera) return false;
      if (q) { const e = resumenDe(r.t); if (!(r.t.includes(q) || String(r.nombre || (e && e.nombre) || '').toUpperCase().includes(q))) return false; }
      return true;
    });
  }
  function estadoFila(r) {
    const e = _indice && _indice.empresas[r.t];
    if (!_indice || _indiceEstado.tipo === 'cargando') return 'Cargando…';
    if (e && e.error === 'no_sec') return 'No presenta en la SEC';
    if (e && e.error) return 'Sin estados contables legibles';
    if (!e) return _indiceEstado.tipo === 'error' ? 'No pude leer los datos' : 'Pidiendo datos a la SEC…';
    return '';
  }
  function tarjeta(r) {
    const e = resumenDe(r.t), px = precioDe(r.t), p = _precios[r.t];
    const m = e ? C().multiplos(e, px) : null;   // sin precio devuelve todo null: la tarjeta muestra «—», nunca un número inventado
    const nombre = r.nombre || (e && e.nombre) || '';
    const mult = m ? [['P/E', m.pe, 'mult'], ['EV/EBITDA', m.evEbitda, 'mult'], ['FCF yield', m.fcfYield, 'p']] : [];
    const estado = estadoFila(r);
    const precioTxt = _preciosErr[r.t] === 'not_found' ? 'Sin precio' : p && !esNum(precioDe(r.t)) ? 'Cotiza en ' + esc(p.moneda) : esNum(px) ? usd(px) + ` <i>${esc(hace(p.hora))}</i>` : (_preciosEstado.tipo === 'cargando' ? '…' : 'Sin precio');
    return `<div class="rd-card" data-t="${esc(r.t)}">
      <button class="rd-card-main" data-act="abrir" data-t="${esc(r.t)}">
        <span class="rd-card-top"><span class="rd-tk">${esc(r.t)}</span><span class="rd-nom">${esc(nombre)}</span></span>
        <span class="rd-chips">${r.it && r.it.cat ? chip(r.it.cat) : '<span class="rd-sincat">Sin categoría</span>'}${r.cartera ? '<span class="rd-cart">En cartera</span>' : ''}</span>
        <span class="rd-px">${precioTxt}</span>
        ${estado ? `<span class="rd-estado">${esc(estado)}</span>` : `<span class="rd-mult">${mult.map(x => `<span><b>${esc(x[0])}</b> ${esc(fmt(x[1], x[2]))}</span>`).join('')}</span>`}
      </button>
      ${starBtn(r.t, r.it && r.it.star)}
    </div>`;
  }
  function avisos() {
    const a = [];
    if (_preciosEstado.tipo === 'error') a.push(_preciosEstado.texto);
    if (_indiceEstado.tipo === 'error') a.push('No pude leer los datos de la SEC: ' + _indiceEstado.texto);
    if (_pedirError && _preciosEstado.texto !== _pedirError) a.push(_pedirError);
    if (_indiceEstado.tipo === 'vacio') a.push('Todavía no hay datos de la SEC cargados. Si es la primera vez, falta activar la actualización automática (pasos en el README del Worker).');
    if (_tenEstado === 'error') a.push('No pude leer tus tenencias: la lista muestra solo las empresas que sumaste al radar.');
    return a.map(t => `<div class="rd-aviso" role="status">${esc(t)}</div>`).join('');
  }
  function listaHtml() {
    const todas = filas();
    const vis = ordenar(filtrar(todas));
    const cats = `<option value="">Todas las categorías</option><option value="_sin"${_v.fCat === '_sin' ? ' selected' : ''}>Sin categoría</option>` +
      CATS.map(c => `<option value="${c[0]}"${_v.fCat === c[0] ? ' selected' : ''}>${esc(c[1])}</option>`).join('');
    const form = _v.nuevo ? `<div class="rd-formcard">
        <label class="nt-flbl" for="rd-nuevo-t">Ticker (el de EE. UU., ej. NVDA o BRK-B)</label>
        <input class="nt-input" id="rd-nuevo-t" type="text" maxlength="10" autocomplete="off" autocapitalize="characters" placeholder="Ej: NVDA" data-enter="crear">
        ${_v.nuevoErr ? `<div class="rd-err" role="alert">${esc(_v.nuevoErr)}</div>` : ''}
        <div class="nt-form-acts"><button class="nt-btn nt-add" data-act="crear">Agregar</button><button class="nt-btn" data-act="nuevo">Cancelar</button></div>
      </div>` : '';
    return `<div class="rd-bar">
        <div class="nt-search-wrap rd-search"><svg class="nt-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
          <input class="nt-input nt-search" id="rd-q" type="search" maxlength="40" value="${esc(_v.q)}" data-inp="buscar" placeholder="Buscar empresa…" aria-label="Buscar empresa"></div>
        <button class="nt-btn nt-add rd-addbtn" data-act="nuevo"><span class="nt-add-plus">+</span> Empresa</button>
      </div>
      ${form}
      <div class="rd-filtros">
        <select class="nt-input rd-sel" data-chg="f-cat" aria-label="Filtrar por categoría">${cats}</select>
        <button class="nt-tagchip${_v.fStar ? ' on' : ''}" data-act="f-star" aria-pressed="${_v.fStar}">★ Siguiendo</button>
        <button class="nt-tagchip${_v.fCartera ? ' on' : ''}" data-act="f-cartera" aria-pressed="${_v.fCartera}">En cartera</button>
        <button class="nt-btn rd-refrescar" data-act="refrescar" title="Actualizar precios y datos" aria-label="Actualizar precios y datos">↻</button>
      </div>
      ${avisos()}
      <div id="rd-lista">${vis.length ? `<div class="rd-grid">${vis.map(tarjeta).join('')}</div>` : `<div class="nt-empty">${todas.length ? 'No hay empresas con ese filtro.' : 'Todavía no hay empresas. Sumá una con «+ Empresa» (también aparecen solas las de tu cartera).'}</div>`}</div>`;
  }

  // ── Ficha ──
  function cabeza(r) {
    const t = r.t, p = _precios[t], px = precioDe(t), e = resumenDe(t);
    const nombre = r.nombre || (e && e.nombre) || (_fichas[t] && _fichas[t].data && _fichas[t].data.nombre) || '';
    let precio;
    if (_preciosErr[t] === 'not_found') precio = 'Sin precio en vivo';
    else if (p && px == null) precio = 'Cotiza en ' + esc(p.moneda) + ': no calculo múltiplos en dólares';
    else if (esNum(px)) {
      const dif = esNum(p.previo) && p.previo > 0 ? px / p.previo - 1 : null;
      precio = `<b>${usd(px)}</b>${dif != null ? ` <span class="${dif < 0 ? 'rd-neg' : 'rd-pos'}">${dif < 0 ? '−' : '+'}${nf(dif * 100, 2)}%</span>` : ''} <i>${esc(hace(p.hora))}</i>`;
    } else precio = _preciosEstado.tipo === 'cargando' ? 'Cargando precio…' : 'Sin precio en vivo';
    const cat = (r.it && r.it.cat) || '';
    return `<div class="rd-fhead">
        <div class="rd-ftitle"><span class="rd-tk rd-tk-big">${esc(t)}</span><span class="rd-nom">${esc(nombre)}</span>${r.cartera ? '<span class="rd-cart">En cartera</span>' : ''}</div>
        ${starBtn(t, r.it && r.it.star)}
      </div>
      <div class="rd-fpx">${precio}</div>
      <div class="rd-fcat"><label class="nt-flbl" for="rd-cat">Categoría</label>
        <select class="nt-input" id="rd-cat" data-chg="cat" aria-label="Categoría de ${esc(t)}"><option value="">Sin categoría</option>${CATS.map(c => `<option value="${c[0]}"${cat === c[0] ? ' selected' : ''}>${esc(c[1])}</option>`).join('')}</select></div>
      ${_v.catPend != null ? catForm(cat) : ''}`;
  }
  function catForm(actual) {
    const a = catDe(actual), n = catDe(_v.catPend);
    return `<div class="rd-formcard rd-catform">
        <div class="rd-catform-ttl">Cambiar de «${esc(a ? a[1] : 'Sin categoría')}» a «${esc(n ? n[1] : 'Sin categoría')}»</div>
        <label class="nt-flbl" for="rd-motivo">Motivo (opcional)</label>
        <input class="nt-input" id="rd-motivo" type="text" maxlength="200" placeholder="Ej: bajó el margen dos trimestres seguidos" data-enter="cat-ok">
        <div class="nt-form-acts"><button class="nt-btn nt-add" data-act="cat-ok">Guardar cambio</button><button class="nt-btn" data-act="cat-cancel">Cancelar</button></div>
      </div>`;
  }

  function valorTarjeta(ruta, calc, vivo) {
    const [src, k] = ruta.split('.');
    return src === 'vivo' ? (vivo ? vivo[k] : null) : (calc ? calc.ttm[k] : null);
  }
  function tarjetasHtml(ficha, t) {
    const calc = C().completar(ficha), px = precioDe(t), vivo = px != null ? C().multiplos(ficha, px) : null;
    return `<div class="rd-tarjetas">${TARJETAS.map(g => `<section class="rd-tcard"><h4>${esc(g.titulo)}</h4><dl>${g.items.map(([lbl, f, ruta]) => {
      const v = valorTarjeta(ruta, calc, vivo), motivo = vivo && vivo.motivos && vivo.motivos[ruta.split('.')[1]];
      const nota = g.vivo && px == null ? 'sin precio' : !esNum(v) && motivo ? motivo.toLowerCase() : '';
      return `<div><dt>${esc(lbl)}</dt><dd>${esc(fmt(v, f))}${nota ? `<small>${esc(nota)}</small>` : ''}</dd></div>`;
    }).join('')}</dl></section>`).join('')}</div>`;
  }

  function tablaHtml(ficha) {
    const calc = C().completar(ficha), n = calc.anual.fin.length, desde = Math.max(0, n - 10);
    const idx = []; for (let i = n - 1; i >= desde; i--) idx.push(i);   // más reciente a la izquierda
    const lectura = (k, i) => calc.anual[k] ? calc.anual[k][i] : null;
    const neg = (f, v) => (f && esNum(v) ? -Math.abs(v) : v);
    const head = `<tr><th class="rd-th-lbl" scope="col">Millones de US$</th><th scope="col" class="rd-th-t">${ficha.ttm && ficha.ttm.fuente === 'trimestres' ? 'TTM' : 'Último año'}</th>${idx.map(i => `<th scope="col" title="Cierre ${esc(fechaLarga(calc.anual.fin[i]))}">${esc(colFecha(calc.anual.fin[i]))}</th>`).join('')}</tr>`;
    const cuerpo = FILAS.map(fl => {
      if (fl.grupo) return `<tr class="rd-grp"><th class="rd-th-lbl" scope="rowgroup">${esc(fl.grupo)}</th><td colspan="${1 + idx.length}">${esc(fl.col === 'TTM' && ficha.ttm && ficha.ttm.fuente !== 'trimestres' ? 'último año' : fl.col)}</td></tr>`;
      const serie = []; for (let i = desde; i < n; i++) serie.push(neg(fl.neg, lectura(fl.k, i)));
      const actual = neg(fl.neg, calc.ttm[fl.k]);
      const unidad = fl.f === 'x' ? ' (US$)' : fl.f === 'a' ? ' (M)' : '';
      return `<tr><th class="rd-th-lbl" scope="row"><span class="rd-lbl">${esc(fl.t + unidad)}</span>${sparkline(serie, fl.f)}</th><td class="rd-td-t">${esc(fmt(actual, fl.f))}</td>${idx.map(i => `<td>${esc(fmt(neg(fl.neg, lectura(fl.k, i)), fl.f))}</td>`).join('')}</tr>`;
    }).join('');
    return `<div class="rd-tabla-wrap" tabindex="0" role="region" aria-label="Estados financieros (se desplaza hacia los costados)"><table class="rd-tabla"><thead>${head}</thead><tbody>${cuerpo}</tbody></table></div>`;
  }

  function notasHtml(ficha) {
    const sc = ficha.anual && ficha.anual.sinComparar;
    const ttmTxt = ficha.ttm && ficha.ttm.fuente === 'trimestres' ? 'TTM = últimos 4 trimestres.' : 'Esta empresa no presenta trimestres en la SEC: TTM = último año fiscal.';
    return `<p class="rd-nota">Datos al ${esc(fechaLarga(ficha.datosAl))}${ficha.presentado ? ` (presentado el ${esc(fechaLarga(ficha.presentado))})` : ''} · SEC EDGAR · ${esc(ttmTxt)} «—» = la empresa no informa ese dato con las etiquetas que leemos; no se estima.${sc ? ` EPS y acciones hasta ${esc(colFecha(sc))} no son comparables (split o cambio fuerte en la cantidad de acciones).` : ''}</p>
      <details class="rd-det"><summary>Cómo se calcula</summary><p class="rd-nota">FCF = flujo operativo − capex. EBITDA = EBIT + D&amp;A. Deuda neta = deuda total − caja (caja incluye inversiones corrientes; la deuda no incluye arrendamientos).
      ROIC ≈ EBIT × (1 − tasa) / (deuda + patrimonio − caja), con la tasa efectiva del año (0–40 %; si no se puede calcular, 21 %). ROE y ROA = resultado neto TTM / patrimonio o activos del último balance.
      Cap. bursátil = precio × acciones diluidas del último período. P/E = precio / EPS TTM. EV = cap. bursátil + deuda − caja. Los múltiplos usan el precio en vivo y se recalculan solos.</p></details>`;
  }

  function resumenHtml(t) {
    const f = _fichas[t] || { estado: 'cargando' };
    if (f.estado === 'cargando') return '<div class="nt-empty">Cargando datos…</div>';
    if (f.estado === 'no_sec') return '<div class="nt-empty">Esta empresa no presenta en la SEC (puede ser un fondo, un ETF o una empresa que no cotiza en EE. UU.). Podés seguir usando categoría, tesis e historial.</div>';
    if (f.estado === 'sin_datos') return '<div class="nt-empty">La SEC no trae estados contables que pueda leer para esta empresa.</div>';
    if (f.estado === 'pendiente') return `<div class="nt-empty">Pidiendo los datos a la SEC… suele tardar 1 o 2 minutos y se actualiza sola.${_pedirError ? `<br><span class="rd-err">${esc(_pedirError)}</span>` : ''}<br><button class="nt-btn rd-mini" data-act="pedir-de-nuevo" data-t="${esc(t)}">Pedir de nuevo</button></div>`;
    if (f.estado === 'error') return `<div class="nt-empty"><span class="rd-err">${esc(f.texto || 'No pude leer los datos.')}</span><br><button class="nt-btn rd-mini" data-act="reintentar" data-t="${esc(t)}">Reintentar</button></div>`;
    return tarjetasHtml(f.data, t) + `<h3 class="rd-h3">Estados financieros</h3>` + tablaHtml(f.data) + notasHtml(f.data);
  }
  function tesisHtml(r) {
    const it = r.it, texto = it ? it.tesis : '';
    if (_v.tesisEd || !texto) {
      return `<div class="nt-form"><div class="nt-flbl-row"><label class="nt-flbl" for="rd-tesis">Tesis de inversión</label><button type="button" class="nt-btn nt-preview-btn" data-act="tesis-preview">Vista previa</button></div>
        <textarea class="nt-input nt-ta nt-ta-xl" id="rd-tesis" rows="12" placeholder="Por qué la tenés o la seguís, qué te tiene que seguir pasando, qué te haría salir…">${esc(texto)}</textarea>
        <div class="rn-preview-box" id="rd-tesis-prev" style="display:none"></div>
        <div class="nt-form-acts"><button class="nt-btn nt-add" data-act="tesis-guardar">Guardar</button>${texto ? '<button class="nt-btn" data-act="tesis-cancelar">Cancelar</button>' : ''}</div></div>`;
    }
    const rich = typeof rnRender === 'function' ? rnRender(texto, { interactive: true, texto, onSave: tx => { const i = item(r.t); if (i) { i.tesis = tx; guardar(); } } }) : `<div class="nt-note-text">${esc(texto)}</div>`;
    return `<div class="rd-panebar"><span class="rd-muted">${it.tesisF ? 'Actualizada el ' + esc(fechaLarga(it.tesisF)) : ''}</span><button class="nt-btn" data-act="tesis-editar">Editar</button></div><div class="rd-tesis">${rich}</div>`;
  }
  function historialHtml(r) {
    const h = r.it && Array.isArray(r.it.hist) ? r.it.hist.slice().reverse() : [];
    if (!h.length) return '<div class="nt-empty">Todavía no cambiaste la categoría de esta empresa. Cada cambio queda acá con su fecha y su motivo.</div>';
    return `<ol class="rd-hist">${h.map(x => `<li><span class="rd-hist-f">${esc(fechaLarga(x.f))}</span><span class="rd-hist-c">${x.de ? chip(x.de) : '<span class="rd-sincat">Sin categoría</span>'}<span aria-hidden="true">→</span>${x.a ? chip(x.a) : '<span class="rd-sincat">Sin categoría</span>'}</span>${x.m ? `<span class="rd-hist-m">${esc(x.m)}</span>` : ''}</li>`).join('')}</ol>`;
  }
  function fichaHtml() {
    const r = filas().find(x => x.t === _v.t);
    if (!r) return '<div class="nt-empty">Esa empresa ya no está en la lista.</div>';
    const tabs = RD_TABS.map(([k, l]) => `<button class="plov-tab${_v.tab === k ? ' on' : ''}" id="rd-tab-${k}" data-act="tab" data-k="${k}" role="tab" aria-selected="${_v.tab === k}" aria-controls="rd-pane">${esc(l)}</button>`).join('');
    const pane = _v.tab === 'tesis' ? tesisHtml(r) : _v.tab === 'historial' ? historialHtml(r) : resumenHtml(r.t);
    return `<button class="nt-btn rd-back" data-act="volver">‹ Radar</button>
      <div id="rd-cabeza">${cabeza(r)}</div>
      <div class="plov-tabs rd-tabs" role="tablist" aria-label="Secciones de la ficha">${tabs}</div>
      <div class="plov-pane rd-pane" id="rd-pane" role="tabpanel" aria-labelledby="rd-tab-${_v.tab}">${pane}</div>
      ${r.it ? `<div class="rd-foot"><button class="nt-btn rd-borrar" data-act="quitar">Quitar del radar</button></div>` : ''}`;
  }

  // ── Pintado ──
  function pintar() {
    if (!_box || !_box.isConnected) return;
    const root = _box.querySelector('.rd-root');
    if (!root) return;
    const enfocado = document.activeElement && document.activeElement.id;
    const top = _box.scrollTop;
    // Si se está escribiendo (tesis, motivo, ticker nuevo, búsqueda) un repintado por datos que llegan no debe pisar el texto.
    const escribiendo = document.activeElement && /^(rd-tesis|rd-motivo|rd-nuevo-t|rd-q)$/.test(document.activeElement.id);
    if (escribiendo && !_v.forzar) { pintarParcial(); return; }
    const tw = _box.querySelector('.rd-tabla-wrap'), sl = tw ? tw.scrollLeft : 0;   // un repintado (llegó el precio) no debe devolver la tabla al principio
    root.innerHTML = _v.screen === 'ficha' ? fichaHtml() : listaHtml();
    _box.scrollTop = top;
    const tw2 = sl ? _box.querySelector('.rd-tabla-wrap') : null;
    if (tw2) tw2.scrollLeft = sl;
    if (enfocado) { const el = document.getElementById(enfocado); if (el && el.focus) { try { el.focus(); } catch (_) {} } }
  }
  // Solo las partes que dependen de datos externos (no tocan los campos de texto).
  function pintarParcial() {
    if (_v.screen === 'lista') pintarLista();
    else { const c = _box.querySelector('#rd-cabeza'); const r = filas().find(x => x.t === _v.t); if (c && r && _v.catPend == null) c.innerHTML = cabeza(r); }
  }
  const pintarLista = () => { const l = _box && _box.querySelector('#rd-lista'); if (!l) return; const vis = ordenar(filtrar(filas())); l.innerHTML = vis.length ? `<div class="rd-grid">${vis.map(tarjeta).join('')}</div>` : '<div class="nt-empty">No hay empresas con ese filtro.</div>'; };

  // ── Eventos ──
  function bind(box) {
    if (box._rdBound) return;
    box._rdBound = true;
    box.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && box.contains(b)) accion(b.dataset.act, b); });
    box.addEventListener('change', e => { const t = e.target.closest('[data-chg]'); if (t && box.contains(t)) cambio(t.dataset.chg, t); });
    box.addEventListener('input', e => { const t = e.target; if (t.matches && t.matches('[data-inp="buscar"]')) { _v.q = t.value; pintarLista(); } });
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('input[data-enter]')) { e.preventDefault(); accion(e.target.dataset.enter, e.target); } });
  }
  const valor = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const repintar = () => { _v.forzar = true; pintar(); _v.forzar = false; };

  async function abrirFicha(t) {
    _v = Object.assign(vistaNueva(), { screen: 'ficha', t, q: _v.q, fCat: _v.fCat, fStar: _v.fStar, fCartera: _v.fCartera });
    repintar();
    await cargarFicha(t, true);
    repintar();
    if (_indice && !_indice.empresas[t] && !_pedidos.has(t)) { await pedirFaltantes(); repintar(); }
    cargarPrecios([t]).then(() => { if (_v.t === t) pintar(); });
  }

  function cambio(que, el) {
    if (que === 'f-cat') { _v.fCat = el.value; pintarLista(); return; }
    if (que === 'cat') {
      const r = filas().find(x => x.t === _v.t); if (!r) return;
      const actual = (r.it && r.it.cat) || '';
      if (el.value === actual) { _v.catPend = null; } else _v.catPend = el.value;
      repintar();
      if (_v.catPend != null) { const m = document.getElementById('rd-motivo'); if (m) m.focus(); }
    }
  }

  async function accion(a, el) {
    switch (a) {
      case 'abrir': return abrirFicha(el.dataset.t);
      case 'volver': _v = Object.assign(vistaNueva(), { q: _v.q, fCat: _v.fCat, fStar: _v.fStar, fCartera: _v.fCartera }); repintar(); return;
      case 'star': {
        const t = el.dataset.t, it = asegurar(t);
        it.star = it.star ? 0 : 1; guardar(); repintar(); return;
      }
      case 'f-star': _v.fStar = !_v.fStar; repintar(); return;
      case 'f-cartera': _v.fCartera = !_v.fCartera; repintar(); return;
      case 'tab': _v.tab = el.dataset.k; _v.catPend = null; _v.tesisEd = false; repintar(); return;
      case 'nuevo': _v.nuevo = !_v.nuevo; _v.nuevoErr = ''; repintar(); if (_v.nuevo) { const i = document.getElementById('rd-nuevo-t'); if (i) i.focus(); } return;
      case 'crear': return crear();
      case 'refrescar': return refrescar(true);
      case 'reintentar': await cargarFicha(el.dataset.t, true); repintar(); return;
      case 'pedir-de-nuevo': {
        _pedidos.delete(el.dataset.t); _pedirError = '';
        try { await wk('/radar/pedir', { body: { tickers: [el.dataset.t] } }); _pedidos.add(el.dataset.t); _pollHasta = Date.now() + POLL_MAX_MS; programarPoll(); toast('Pedido enviado: los datos llegan en 1 o 2 minutos'); }
        catch (e) { _pedirError = e.message; toast(e.message); }
        repintar(); return;
      }
      case 'cat-ok': {
        const r = filas().find(x => x.t === _v.t); if (!r || _v.catPend == null) return;
        const it = asegurar(r.t), de = it.cat || '', nuevo = _v.catPend;
        const motivo = valor('rd-motivo');
        (it.hist || (it.hist = [])).push({ f: hoy(), de, a: nuevo, m: motivo });
        it.cat = nuevo; _v.catPend = null; guardar(); repintar(); return;
      }
      case 'cat-cancel': _v.catPend = null; repintar(); return;
      case 'tesis-editar': _v.tesisEd = true; repintar(); { const t = document.getElementById('rd-tesis'); if (t) t.focus(); } return;
      case 'tesis-cancelar': _v.tesisEd = false; repintar(); return;
      case 'tesis-preview': {
        const box = document.getElementById('rd-tesis-prev'), ta = document.getElementById('rd-tesis'); if (!box || !ta) return;
        const show = box.style.display === 'none';
        if (show) box.innerHTML = typeof rnRender === 'function' ? rnRender(ta.value, { interactive: false }) : esc(ta.value);
        box.style.display = show ? '' : 'none'; return;
      }
      case 'tesis-guardar': {
        const ta = document.getElementById('rd-tesis'); if (!ta) return;
        const texto = ta.value.trim();
        if (!texto && !item(_v.t)) { toast('Escribí la tesis'); return; }
        const it = asegurar(_v.t); it.tesis = texto; it.tesisF = hoy();
        _v.tesisEd = false; guardar(); repintar(); return;
      }
      case 'quitar': {
        if (!confirm('¿Quitar ' + _v.t + ' del radar? Se borran su categoría, su tesis y su historial. Si está en tu cartera, sigue apareciendo sin categoría.')) return;
        data().items = data().items.filter(x => x.t !== _v.t); guardar();
        _v = Object.assign(vistaNueva(), { q: _v.q }); repintar(); return;
      }
    }
  }

  async function crear() {
    const t = C().normalizarTicker(valor('rd-nuevo-t'));
    if (!t) { _v.nuevoErr = 'Escribí un ticker válido (letras y números, ej. NVDA o BRK-B).'; repintar(); return; }
    if (filas().some(x => x.t === t)) { _v.nuevo = false; repintar(); toast(t + ' ya está en la lista'); return abrirFicha(t); }
    // Validación contra el mercado: Yahoo tiene que conocer el ticker. Si el servicio no responde no se bloquea: se agrega igual.
    _v.nuevoErr = '';
    try {
      const j = await wk('/radar/precios?t=' + encodeURIComponent(t));
      if (j.errores && j.errores[t] === 'not_found') { _v.nuevoErr = 'No encontré «' + t + '». Revisá que sea el ticker de EE. UU. (ej. BRK-B, no BRKB).'; repintar(); return; }
      if (j.precios && j.precios[t]) { _precios[t] = j.precios[t]; delete _preciosErr[t]; }
    } catch (_) { toast('No pude verificar el ticker ahora; lo agrego igual.'); }
    asegurar(t); guardar();
    _v.nuevo = false;
    await abrirFicha(t);
  }

  async function refrescar(manual) {
    if (!_box) return;
    await Promise.all([cargarIndice(), cargarPrecios()]);
    if (_v.screen === 'ficha' && _v.t) await cargarFicha(_v.t, true);
    pintar();
    await pedirFaltantes();
    if (manual) pintar();
  }

  function renderInto(contenedor) {
    clearTimeout(_pollTimer); clearInterval(_pxTimer);
    _box = contenedor;
    _v = vistaNueva(); _fichas = {}; _indiceEstado = { tipo: 'cargando', texto: '' }; _preciosEstado = { tipo: 'cargando', texto: '' };
    contenedor.innerHTML = '<div class="rd-root"></div>';
    bind(contenedor);
    pintar();
    // Precio al día mientras la pestaña esté a la vista.
    _pxTimer = setInterval(() => {
      if (!_box || !_box.isConnected) { clearInterval(_pxTimer); return; }
      if (_box.hidden || document.hidden || !_box.closest('.cm-overlay.show')) return;   // pestaña oculta, pantalla en segundo plano o Cartera cerrada: no se gasta una consulta
      cargarPrecios().then(() => pintar());
    }, PRECIOS_MS);
    return cargarTodo();
  }
  // Al volver a la pestaña (ya cargada): precios y datos al día.
  function alMostrar() { if (_box && _box.isConnected) refrescar(false); }

  return { renderInto, refrescar: () => refrescar(true), alMostrar, _estado: () => ({ v: _v, indice: _indice, precios: _precios, pedidos: [..._pedidos] }) };
})();
window.Radar = Radar;
