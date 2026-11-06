'use strict';
// ════════════════════════════════════════════════════════════════════════
// RADAR DE EMPRESAS — pestaña "Radar" de Cartera (cartera-overlay.js; se monta con Radar.renderInto(contenedor)).
// Franja "EMPRESAS PARA EXPLORAR" → ficha de la empresa elegida (secciones de la lista de Tobías + indicadores propios de esa empresa)
// y, abajo, el gráfico "Crecimiento vs Valuación" con todas las empresas.
//
// Todo sale de archivos JSON del repo PRIVADO de datos, que el Worker sirve con login (GET /datos/<archivo>, vía CMDatos):
//   radar-config.json   empresas, KPIs generales por sección y KPIs específicos de cada una (se edita sin tocar código; `icono` = slug de
//                       Simple Icons, `aviso_margenes` = advertencia en el gráfico)
//   mercado-<T>.json · historia-<T>.json · kpis-<T>.json · pares-mercado.json · pe-forward-sa.json (job semanal: P/E fwd de hoy y media 5a, Stock Analysis) · radar-manual.json · reportes.json     (los arma radar-vista.js / el job de datos)
// Cálculo y formato: radar-vista.js (puro, con tests de Node). Acá solo hay DOM, red y el gráfico (Chart.js).
// Reportar un número: POST /radar/reportar { ticker, kpi_id, trimestre, valor_mostrado, comentario? } → queda «en revisión» en reportes.json
// hasta que la rutina lo resuelve («corregido de X a Y» o «confirmado»). Nada de esto toca S: el estado de la pestaña vive en memoria.
// El precio ya viene en mercado-<T>.json (diario): no se usa más /radar/precios.
// ════════════════════════════════════════════════════════════════════════

const Radar = (() => {
  const URL_WORKER = 'https://cdm-push-worker.tobiasloustau11.workers.dev';
  const TIMEOUT_MS = 12000;
  const ICONOS = 'https://cdn.jsdelivr.net/npm/simple-icons@14.15.0/icons/';   // logos monocromos, solo para identificar el ticker
  const CORTE_X = 15, CORTE_Y = 0.10;                                          // cuadrantes del gráfico: 15x de P/E fwd (12 meses) y 10% de crecimiento
  const MAX_SPARK = 16;                                                        // trimestres que dibuja la sparkline
  const V = () => window.RadarVista;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esNum = v => typeof v === 'number' && isFinite(v);
  const attrUrl = u => esc(u);

  // ── Estado en memoria ──
  let _box = null;
  let _cfg = null;                       // radar-config.json (último bueno)
  let _cfgEstado = { tipo: 'cargando', texto: '' };   // cargando | ok | vacio | error
  let _sel = null;                       // ticker elegido
  let _vista = null;                     // vista de la empresa elegida
  const _arch = {};                      // nombre → { data (último bueno), status (último intento), en (promesa) }
  const _items = new Map();              // 'T:rid' → ítem pintado (para reportar y abrir fuentes)
  const _abiertos = new Set();           // 'T:rid' con la fuente desplegada
  const _forms = new Map();              // 'T:rid' → { env: bool, msg: string, texto: string } (formulario de reporte abierto)
  const _logos = {};                     // slug → true (cargó) | false (no existe / sin red)
  let _chart = null, _grafPuntos = [], _grafEstado = 'cargando';
  let _n = 0;

  // ── Red ──
  async function archivo(nombre) {
    if (!window.CMDatos) return { data: null, status: 0 };
    return CMDatos.carteraDetalle(nombre);
  }
  function leer(nombre, forzar) {
    const a = _arch[nombre] || (_arch[nombre] = { data: null, status: null, en: null });
    if (a.en) return a.en;
    if (a.status !== null && !forzar) return Promise.resolve(a);
    a.en = archivo(nombre).then(r => { a.status = r.status; if (r.status === 200 && r.data) a.data = r.data; a.en = null; return a; }, () => { a.status = 0; a.en = null; return a; });
    return a.en;
  }
  const dato = nombre => (_arch[nombre] && _arch[nombre].data) || null;
  class ErrRadar extends Error { constructor(tipo, msg) { super(msg); this.tipo = tipo; } }
  async function wk(ruta, body) {
    if (typeof _auth === 'undefined' || !_auth || !_auth.currentUser) throw new ErrRadar('sesion', 'Iniciá sesión para reportar un número.');
    const token = await _auth.currentUser.getIdToken();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(URL_WORKER + ruta, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, cache: 'no-store', signal: ctrl.signal, body: JSON.stringify(body) });
    } catch (e) {
      throw new ErrRadar(e && e.name === 'AbortError' ? 'timeout' : 'red', e && e.name === 'AbortError' ? 'El servidor tardó demasiado en responder.' : 'No hay conexión con el servidor.');
    } finally { clearTimeout(timer); }
    if (res.ok) return res.json();
    const j = await res.json().catch(() => null);
    if (!j || !j.error) throw new ErrRadar('servidor', 'Falta publicar el servidor (Worker) con la ruta para reportar.');
    throw new ErrRadar(j.error, j.message || ('El servidor respondió ' + res.status));
  }
  const empresas = () => (_cfg && Array.isArray(_cfg.empresas) ? _cfg.empresas.filter(e => e && e.ticker) : []);
  const empresa = t => empresas().find(e => e.ticker === t) || null;

  async function cargarConfig() {
    _cfgEstado = { tipo: 'cargando', texto: '' };
    const a = await leer('radar-config.json', true);
    if (a.data && Array.isArray(a.data.empresas)) {   // a.data es el último archivo bueno: si una relectura falla, la franja sigue
      _cfg = a.data;
      _cfgEstado = { tipo: empresas().length ? 'ok' : 'vacio', texto: '' };
    } else _cfgEstado = { tipo: 'error', texto: a.status === 404 ? 'No encuentro radar-config.json en el repositorio de datos.' : a.status === 403 ? 'Esta cuenta no tiene permiso para ver el Radar.' : 'No se pudieron leer los datos (sin conexión o sin sesión).' };
  }
  async function cargarEmpresa(t, forzar) {
    await Promise.all([leer('mercado-' + t + '.json', forzar), leer('historia-' + t + '.json', forzar), leer('kpis-' + t + '.json', forzar), leer('pares-mercado.json', forzar)]);
  }
  const empresaCargando = t => ['mercado-', 'historia-', 'kpis-'].some(p => _arch[p + t + '.json'] && _arch[p + t + '.json'].en);
  async function cargarMercados(forzar) {
    _grafEstado = 'cargando'; pintarGrafico();
    await Promise.all(empresas().map(e => leer('mercado-' + e.ticker + '.json', forzar)));
    _grafEstado = 'ok'; pintarGrafico(); pintarEstado();
  }

  // ── Acceso a la vista de la empresa elegida ──
  function armarVista(t) {
    const emp = empresa(t); if (!emp) return null;
    const pares = {};
    const man = dato('radar-manual.json');
    const mp = man && man.empresas && man.empresas[t] && man.empresas[t].pares;
    const pm = dato('pares-mercado.json'), pe = pm && pm.empresas ? pm.empresas : {};   // mercado mínimo de los pares (lo baja el job)
    if (Array.isArray(mp)) for (const p of mp) if (pe[p]) pares[p] = pe[p];
    return V().vista({ config: _cfg, emp, mercado: dato('mercado-' + t + '.json'), historia: dato('historia-' + t + '.json'), kpis: dato('kpis-' + t + '.json'), manual: man, peSa: dato('pe-forward-sa.json'), paresMercado: pares });
  }
  const reportes = () => { const r = dato('reportes.json'); return Array.isArray(r) ? r : []; };

  // ════════════════════════════════════════════════════════════════════
  // Franja de empresas
  // ════════════════════════════════════════════════════════════════════
  const slugOk = s => typeof s === 'string' && /^[a-z0-9]{1,40}$/.test(s) ? s : null;
  function logoHtml(e) {
    const slug = slugOk(e.icono);
    const ok = slug && _logos[slug] === true;
    return `<span class="rd-logo${ok ? ' ok' : ''}"${slug ? ` data-slug="${slug}"` : ''}${ok ? ` style="--ico:url(${ICONOS}${slug}.svg)"` : ''} aria-hidden="true">${esc(V().monograma(e.nombre))}</span>`;
  }
  function pintarFranja() {
    const sl = _box.querySelector('.rd-strip-row'); if (!sl) return;
    if (_cfgEstado.tipo === 'cargando') { sl.innerHTML = '<p class="rd-muted rd-strip-msg">Cargando empresas…</p>'; return; }
    if (_cfgEstado.tipo === 'error') { sl.innerHTML = `<p class="rd-err rd-strip-msg">${esc(_cfgEstado.texto)} <button type="button" class="rd-btn rd-btn-ghost" data-act="reintentar-cfg">Reintentar</button></p>`; return; }
    if (_cfgEstado.tipo === 'vacio') { sl.innerHTML = '<p class="rd-muted rd-strip-msg">Todavía no hay empresas en radar-config.json.</p>'; return; }
    sl.innerHTML = empresas().map(e => `<button type="button" class="rd-emp${e.ticker === _sel ? ' on' : ''}" data-t="${esc(e.ticker)}" aria-pressed="${e.ticker === _sel}" title="${esc(e.nombre)}">${logoHtml(e)}<span class="rd-emp-n">${esc(e.nombre)}</span></button>`).join('');
    for (const e of empresas()) probarLogo(slugOk(e.icono));
  }
  // El ícono se pide una vez; si carga, el cuadrito con las iniciales pasa a ser el logo (teñido de gris por máscara CSS).
  function probarLogo(slug) {
    if (!slug || slug in _logos) return;
    _logos[slug] = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { _logos[slug] = true; if (!_box) return; for (const s of _box.querySelectorAll(`.rd-logo[data-slug="${slug}"]`)) { s.classList.add('ok'); s.style.setProperty('--ico', `url(${ICONOS}${slug}.svg)`); } };
    img.onerror = () => { _logos[slug] = false; };
    img.src = ICONOS + slug + '.svg';
  }

  function seleccionar(t) {
    if (!empresa(t)) return;
    _sel = t;
    _vista = null; _forms.clear();
    for (const b of _box.querySelectorAll('.rd-emp')) { const on = b.dataset.t === t; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    const carga = cargarEmpresa(t);
    pintarFicha(); pintarEstado(); resaltarGrafico();
    carga.then(() => { if (_sel === t) { pintarFicha(); pintarEstado(); } });
  }

  // ════════════════════════════════════════════════════════════════════
  // Estado de los datos
  // ════════════════════════════════════════════════════════════════════
  function pintarEstado() {
    const el = _box && _box.querySelector('.rd-estado'); if (!el) return;
    const fc = V().fc, dm = V().dm;
    if (_cfgEstado.tipo !== 'ok') { el.innerHTML = ''; return; }
    if (!_sel) {
      const fechas = empresas().map(e => dato('mercado-' + e.ticker + '.json')).filter(Boolean).map(m => m.generado).filter(Boolean).sort();
      el.innerHTML = '<span>Elegí una empresa para ver su ficha.</span>' + (fechas.length ? `<span>Datos de mercado del ${dm(fechas[fechas.length - 1])}</span>` : '');
      return;
    }
    const v = _vista || armarVista(_sel); if (!v) { el.innerHTML = ''; return; }
    const e = v.estado, am = _arch['mercado-' + _sel + '.json'];
    const partes = [];
    if (e.mercadoFecha) partes.push(`<span>Datos de mercado del <b>${dm(e.mercadoFecha)}</b></span>`);
    else partes.push('<span>Sin datos de mercado todavía</span>');
    if (e.mercadoStale) partes.push(`<span class="rd-warn">No se pudieron actualizar desde el ${dm(e.mercadoStale)}${e.mercadoError ? ' (' + esc(e.mercadoError) + ')' : ''}: se muestran los últimos datos buenos.</span>`);
    else if (am && am.data && am.status !== 200 && am.status !== null) partes.push('<span class="rd-warn">No se pudo leer la última versión: se muestran los últimos datos que llegaron.</span>');
    partes.push(e.comunicado ? `<span>Último comunicado: <b>${esc(e.comunicado.rotulo)}</b> (al ${fc(e.comunicado.fin)})</span>` : '<span>Último comunicado: ninguno cargado todavía</span>');
    if (e.historiaHasta) partes.push(`<span>Resultados trimestrales hasta el ${fc(e.historiaHasta)}</span>`);
    el.innerHTML = partes.join('');
  }

  // ════════════════════════════════════════════════════════════════════
  // Ficha
  // ════════════════════════════════════════════════════════════════════
  const ETQ_ESTADO = { pendiente: 'pendiente', no_informado: 'no informado', sin_datos: 'sin datos', ns: 'no significativo', no_aplica: 'no aplica' };

  function spark(it) {
    const pts = (it.serie || []).filter(p => esNum(p.v)).slice(-MAX_SPARK);
    if (pts.length < 2) return '';
    const W = 92, H = 24, P = 3;
    const vs = pts.map(p => p.v), mn = Math.min(...vs), mx = Math.max(...vs), rg = mx - mn || 1;
    const xy = pts.map((p, i) => [P + i * (W - 2 * P) / (pts.length - 1), mx === mn ? H / 2 : H - P - (p.v - mn) / rg * (H - 2 * P)]);
    const f = V().fmt;
    const desc = `${esc(it.nombre)}: ${pts.length} trimestres, de ${esc(f(it.kind, pts[0].v))} (${V().mesAnio(pts[0].fin)}) a ${esc(f(it.kind, pts[pts.length - 1].v))} (${V().mesAnio(pts[pts.length - 1].fin)})`;
    const ult = xy[xy.length - 1];
    return `<svg class="rd-sp" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${desc}"><title>${desc}</title><polyline points="${xy.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${ult[0].toFixed(1)}" cy="${ult[1].toFixed(1)}" r="2.6"/></svg>`;
  }
  function fuenteHtml(it) {
    const s = it.fuente; if (!s) return '';
    const link = s.url ? ` <a href="${attrUrl(s.url)}" target="_blank" rel="noopener noreferrer">ver el documento</a>` : '';
    let t;
    if (s.tipo === 'calculo') {
      const b = s.base ? ` Datos de: ${esc(s.base.titulo)}${s.base.detalle ? ' (' + esc(s.base.detalle) + ')' : ''}.` : '';
      t = `<b>Calculado:</b> ${esc(s.detalle)}.${b}`;
    } else if (s.tipo === 'manual') {
      t = `<b>${esc(s.titulo)}</b>${s.detalle ? ' · ' + esc(s.detalle) : ''}${link}`;
    } else {
      t = `<b>${esc(s.titulo)}</b>${s.detalle ? ' · ' + esc(s.detalle) : ''}${s.cita ? ` · «${esc(s.cita)}»` : ''}${link}`;
    }
    return `<p class="rd-src"><span class="rd-src-l">De dónde sale</span> ${t}</p>`;
  }
  function serieHtml(it) {
    const pts = (it.serie || []).filter(p => esNum(p.v)).slice(-MAX_SPARK);
    if (pts.length < 2) return it.desde ? `<p class="rd-sv"><span class="rd-src-l">Historia</span> ${esc(it.desde)}</p>` : '';
    const f = V().fmt;
    return `<p class="rd-sv"><span class="rd-src-l">Últimos ${pts.length} trimestres${it.desde ? ' (' + esc(it.desde) + ')' : ''}</span> ${pts.map(p => `<span class="rd-sv-i">${V().mesAnio(p.fin)} <b>${esc(f(it.kind, p.v))}</b></span>`).join('')}</p>`;
  }
  function repHistHtml(rs) {
    if (!rs.length) return '';
    return `<ul class="rd-reps">${rs.map(r => {
      const q = r.estado === 'en_revision' ? ['en revisión', 'Reportado el ' + V().fc(String(r.reportado_en || '').slice(0, 10)) + (r.comentario ? ': «' + r.comentario + '»' : '') + '. La próxima corrida vuelve a leer la fuente.']
        : r.estado === 'corregido' ? ['corregido', r.resolucion || ''] : r.estado === 'confirmado' ? ['confirmado', r.resolucion || ''] : [String(r.estado || ''), r.resolucion || ''];
      return `<li><span class="rd-badge rd-b-${esc(r.estado)}">${esc(q[0])}</span> ${esc(q[1])}</li>`;
    }).join('')}</ul>`;
  }
  function formHtml(key, it) {
    const f = _forms.get(key); if (!f) return '';
    const id = 'rd-rc-' + (++_n);
    return `<form class="rd-repf" data-k="${esc(key)}" novalidate>
      <label class="rd-repf-l" for="${id}">¿Qué parece mal en «${esc(it.nombre)}» (${esc(it.txt)})? <span class="rd-muted">Opcional</span></label>
      <textarea id="${id}" class="rd-repf-t" rows="2" maxlength="500" placeholder="Ej.: en el comunicado dice otro número">${esc(f.texto || '')}</textarea>
      <p class="rd-repf-msg${f.msg ? ' rd-err' : ''}" role="alert">${esc(f.msg || '')}</p>
      <div class="rd-repf-acts"><button type="submit" class="rd-btn"${f.env ? ' disabled' : ''}>${f.env ? 'Enviando…' : 'Enviar reporte'}</button><button type="button" class="rd-btn rd-btn-ghost" data-act="rep-cancel"${f.env ? ' disabled' : ''}>Cancelar</button></div>
    </form>`;
  }
  function panelHtml(key, it) {
    const rs = V().reportesDe(reportes(), _sel, it);
    const lineas = it.lineas && it.lineas.length ? `<dl class="rd-ln">${it.lineas.map(l => `<div><dt>${esc(l.k)}</dt><dd>${esc(l.txt)}</dd></div>`).join('')}</dl>` : '';
    const proxy = it.proxy ? '<p class="rd-note">Es un sustituto («proxy»): la empresa no informa este número tal cual.</p>' : '';
    const nota = it.nota ? `<p class="rd-note">${esc(it.nota)}</p>` : '';
    return `${it.detalle ? `<p class="rd-det">${esc(it.detalle)}</p>` : ''}${it.largo ? `<p class="rd-largo">${esc(it.txt)}</p>` : ''}${lineas}${proxy}${nota}${fuenteHtml(it)}${serieHtml(it)}${repHistHtml(rs)}${formHtml(key, it)}`;
  }
  function kpiHtml(it) {
    const key = _sel + ':' + it.rid;
    _items.set(key, it);
    const ok = it.estado === 'ok';
    const rs = ok ? V().reportesDe(reportes(), _sel, it) : [];
    const ult = rs.length ? rs[rs.length - 1] : null;
    const abierto = _abiertos.has(key) || _forms.has(key);
    const tieneDetalle = !!(it.fuente || it.detalle || (it.lineas && it.lineas.length) || it.largo || it.nota || it.desde || (it.serie && it.serie.length > 1));
    const fuenteTitle = it.fuente ? ('Fuente: ' + (it.fuente.tipo === 'calculo' ? 'cálculo' : it.fuente.titulo) + (it.fuente.detalle && it.fuente.tipo !== 'calculo' ? ' · ' + it.fuente.detalle : '')) : (it.detalle || '');
    const valor = it.largo ? '<span class="rd-k-largo">ver detalle</span>' : esc(it.txt);
    const vBtn = tieneDetalle
      ? `<button type="button" class="rd-k-v" data-act="fuente" aria-expanded="${abierto}" title="${esc(fuenteTitle)}">${valor}</button>`
      : `<span class="rd-k-v rd-k-v0">${valor}</span>`;
    const variac = ok && (it.tt || it.aa) ? `<span class="rd-k-d">${it.tt ? `<span title="Contra el trimestre anterior">t/t <b>${esc(it.tt)}</b></span>` : ''}${it.aa ? `<span title="Contra el mismo trimestre del año anterior">a/a <b>${esc(it.aa)}</b></span>` : ''}</span>` : '';
    const sp = ok ? spark(it) : '';
    const desde = ok && it.desde ? `<span class="rd-k-desde">${esc(it.desde)}</span>` : '';
    const badge = ult ? `<span class="rd-badge rd-b-${esc(ult.estado)}" title="${esc(ult.resolucion || '')}">${ult.estado === 'en_revision' ? 'en revisión' : ult.estado === 'corregido' ? 'corregido ' + esc(String(ult.resolucion || '').split(':')[0]) : ult.estado === 'confirmado' ? 'confirmado' : esc(ult.estado)}</span>` : '';
    const rep = ok && it.tri ? `<button type="button" class="rd-rep" data-act="rep" aria-label="Reportar este número: ${esc(it.nombre)}" title="Reportar un número que parece mal">reportar</button>` : '';
    return `<div class="rd-kpi rd-e-${it.estado}" data-k="${esc(key)}">
      <div class="rd-k-row">
        <span class="rd-k-n">${esc(it.nombre)}${it.proxy ? ' <span class="rd-tag">proxy</span>' : ''}${it.periodo ? `<small>${esc(it.periodo)}</small>` : ''}</span>
        <span class="rd-k-vb">${vBtn}${badge}</span>${variac}${sp || ''}${desde}${rep}
      </div>
      <div class="rd-k-f"${abierto ? '' : ' hidden'}>${abierto ? panelHtml(key, it) : ''}</div>
    </div>`;
  }
  function refrescarKpi(key) {
    const it = _items.get(key); const el = _box && _box.querySelector(`.rd-kpi[data-k="${CSS.escape(key)}"]`);
    if (!it || !el) return;
    el.outerHTML = kpiHtml(it);
  }

  function pintarFicha() {
    const cont = _box && _box.querySelector('.rd-ficha'); if (!cont) return;
    _items.clear();
    if (!_sel) { cont.innerHTML = ''; return; }
    const emp = empresa(_sel); if (!emp) { cont.innerHTML = ''; return; }
    const arch = ['mercado-', 'historia-', 'kpis-'].map(p => _arch[p + _sel + '.json']);
    if (empresaCargando(_sel) && !arch.some(a => a && a.data)) { cont.innerHTML = `<p class="rd-muted rd-cargando">Cargando los datos de ${esc(emp.nombre)}…</p>`; return; }
    if (!arch.some(a => a && a.data)) {
      const fallo = arch.some(a => a && a.status === 0 || a && a.status === 403);
      cont.innerHTML = fallo
        ? `<p class="rd-err">No se pudieron leer los datos de ${esc(emp.nombre)} (sin conexión o sin sesión). <button type="button" class="rd-btn rd-btn-ghost" data-act="reintentar">Reintentar</button></p>`
        : `<article class="rd-fi"><header class="rd-fh"><h2 class="rd-fn">${esc(emp.nombre)} <span class="rd-tk">${esc(emp.ticker)}</span></h2></header><p class="rd-vacio">Sin datos todavía. Cuando el job de mercado y la extracción de comunicados corran para ${esc(emp.ticker)}, aparecen acá.</p></article>`;
      _vista = armarVista(_sel);
      return;
    }
    _vista = armarVista(_sel);
    const v = _vista, fc = V().fc, f = V().fmt;
    const px = v.estado.precio;
    const secs = v.secciones.map(s => `<section class="rd-sec" aria-labelledby="rd-s-${esc(s.id)}"><h3 id="rd-s-${esc(s.id)}" class="rd-h3">${esc(s.nombre)}</h3><div class="rd-kpis">${s.items.map(kpiHtml).join('')}</div></section>`).join('');
    const esp = v.especificos.length ? `<section class="rd-sec" aria-labelledby="rd-s-esp"><h3 id="rd-s-esp" class="rd-h3">Indicadores de ${esc(emp.nombre)}</h3><div class="rd-kpis">${v.especificos.map(kpiHtml).join('')}</div></section>` : '';
    cont.innerHTML = `<article class="rd-fi">
      <header class="rd-fh">
        <div class="rd-fh-t"><h2 class="rd-fn">${esc(emp.nombre)} <span class="rd-tk">${esc(emp.ticker)}</span></h2>
          ${px ? `<p class="rd-fpx"><b>${esc(f('usdps', px.valor))}</b> <i>precio al ${fc(px.fecha)} · Yahoo Finance</i></p>` : ''}</div>
        <button type="button" class="rd-btn rd-btn-ghost rd-act" data-act="reintentar" title="Volver a leer los datos de esta empresa">Actualizar</button>
      </header>
      ${emp.notas ? `<p class="rd-nota">${esc(emp.notas)}</p>` : ''}
      ${secs}${esp}
    </article>`;
  }

  // ── Eventos ──
  function alClick(ev) {
    const b = ev.target.closest('button'); if (!b || !_box.contains(b)) return;
    if (b.classList.contains('rd-emp')) return seleccionar(b.dataset.t);
    const act = b.dataset.act;
    if (act === 'reintentar-cfg') { cargarConfig().then(() => { pintarFranja(); pintarEstado(); if (_cfgEstado.tipo === 'ok') { cargarMercados(true); cargarComplementos(); } }); return; }
    if (act === 'reintentar' && _sel) { const t = _sel; cargarEmpresa(t, true).then(() => { if (_sel === t) { pintarFicha(); pintarEstado(); } }); pintarFicha(); return; }
    if (act === 'grafico-reintentar') return void cargarMercados(true);
    const kp = b.closest('.rd-kpi'); if (!kp) return;
    const key = kp.dataset.k, it = _items.get(key); if (!it) return;
    if (act === 'fuente') {
      const panel = kp.querySelector('.rd-k-f'), abre = panel.hidden;
      if (abre) { _abiertos.add(key); panel.innerHTML = panelHtml(key, it); } else { _abiertos.delete(key); _forms.delete(key); }
      panel.hidden = !abre; b.setAttribute('aria-expanded', String(abre));
    } else if (act === 'rep') {
      if (!_forms.has(key)) _forms.set(key, { env: false, msg: '', texto: '' });
      _abiertos.add(key); refrescarKpi(key);
      const ta = _box.querySelector(`.rd-kpi[data-k="${CSS.escape(key)}"] .rd-repf-t`); if (ta) ta.focus();
    } else if (act === 'rep-cancel') { _forms.delete(key); refrescarKpi(key); }
  }
  function textoError(e) {
    switch (e.tipo) {
      case 'limite_diario': return 'Llegaste al límite de 20 reportes por día. Probá mañana.';
      case 'github_permiso': return 'El servidor no tiene permiso para guardar el reporte en GitHub (el token del Worker necesita escribir en el repositorio de datos). Avisá para arreglarlo.';
      case 'github_token': return 'GitHub rechazó el token del servidor (puede haber vencido). Avisá para renovarlo.';
      case 'bad_param': return 'El servidor no aceptó el reporte: ' + e.message;
      case 'conflicto': return 'El archivo de reportes cambió mientras se guardaba. Probá de nuevo.';
      default: return e.message || 'No se pudo enviar el reporte.';
    }
  }
  async function alSubmit(ev) {
    const form = ev.target.closest('.rd-repf'); if (!form) return;
    ev.preventDefault();
    const key = form.dataset.k, it = _items.get(key), f = _forms.get(key); if (!it || !f || f.env) return;
    f.texto = form.querySelector('.rd-repf-t').value.trim(); f.env = true; f.msg = '';
    refrescarKpi(key);
    const t = _sel;
    try {
      const body = { ticker: t, kpi_id: it.rid, trimestre: it.tri, valor_mostrado: String(it.txt).slice(0, 60) };
      if (f.texto) body.comentario = f.texto;
      const r = await wk('/radar/reportar', body);
      const a = _arch['reportes.json'] || (_arch['reportes.json'] = { data: null, status: 200, en: null });
      const lista = Array.isArray(a.data) ? a.data : (a.data = []);
      if (r && r.reporte && !lista.some(x => x.id === r.reporte.id)) lista.push(r.reporte);
      _forms.delete(key);
      refrescarKpi(key);
      const el = _box.querySelector(`.rd-kpi[data-k="${CSS.escape(key)}"] .rd-k-f`);
      if (el) { const p = document.createElement('p'); p.className = 'rd-ok'; p.setAttribute('role', 'status'); p.textContent = r && r.duplicado ? 'Ese número ya estaba reportado: sigue en revisión.' : 'Reporte enviado: el número queda en revisión hasta la próxima corrida.'; el.prepend(p); }
    } catch (e) {
      const ff = _forms.get(key); if (ff) { ff.env = false; ff.msg = textoError(e); }
      if (_sel === t) refrescarKpi(key);
    }
  }
  function alTecla(ev) {
    if (ev.target.closest && ev.target.closest('.rd-repf') && ev.key === 'Escape') { const key = ev.target.closest('.rd-repf').dataset.k; _forms.delete(key); refrescarKpi(key); return; }
    const b = ev.target.closest && ev.target.closest('.rd-emp'); if (!b) return;
    const todos = [..._box.querySelectorAll('.rd-emp')], i = todos.indexOf(b);
    let j = -1;
    if (ev.key === 'ArrowRight') j = Math.min(todos.length - 1, i + 1);
    else if (ev.key === 'ArrowLeft') j = Math.max(0, i - 1);
    else if (ev.key === 'Home') j = 0; else if (ev.key === 'End') j = todos.length - 1;
    if (j >= 0) { ev.preventDefault(); todos[j].focus(); }
  }

  // ════════════════════════════════════════════════════════════════════
  // Gráfico "Crecimiento vs Valuación"
  // ════════════════════════════════════════════════════════════════════
  const CUADRANTES = [   // [x alto?, y alto?, nombre, color]
    [false, true, 'Mayor crecimiento / Menor valuación', 'verde'], [true, true, 'Mayor crecimiento / Mayor valuación', 'azul'],
    [false, false, 'Menor crecimiento / Menor valuación', 'rojo'], [true, false, 'Menor crecimiento / Mayor valuación', 'violeta'],
  ];
  const cuadranteDe = p => CUADRANTES.find(c => c[0] === (p.x >= CORTE_X) && c[1] === (p.y >= CORTE_Y))[2];
  const css = (n, fb) => { const r = _box && _box.querySelector('.rd-root'); return (r ? getComputedStyle(r).getPropertyValue(n).trim() : '') || fb; };

  function puntos() {
    return empresas().map(e => V().puntoCrecimiento(dato('mercado-' + e.ticker + '.json'), e));
  }
  function escalaY(ps) {
    const ys = ps.map(p => p.y).sort((a, b) => b - a);
    let tope = ys[0], recorta = false;
    if (ys.length > 2 && ys[0] > ys[1] * 1.6 && ys[0] > 0.5) { tope = ys[1] * 1.3; recorta = true; }
    const max = Math.max(0.2, Math.ceil((tope + 0.05) / 0.05) * 0.05);
    const min = Math.min(0, Math.floor((ys[ys.length - 1] - 0.03) / 0.05) * 0.05);
    return { min, max, recorta };
  }
  function escalaX(ps) {
    const xs = ps.map(p => p.x);
    return { min: Math.floor((Math.min(...xs, CORTE_X) - 3) / 5) * 5, max: Math.ceil((Math.max(...xs) + 4) / 5) * 5 };
  }
  function tablaGrafico(todos) {
    const f = V().fmt;
    const filas = todos.map(p => p.ok
      ? `<tr><th scope="row">${esc(p.nombre)} <span class="rd-tk">${esc(p.ticker)}</span></th><td>${esc(f('x', p.x))}</td><td>${esc(f('pct', p.y))}</td><td>${esc(cuadranteDe(p))}</td></tr>`
      : `<tr class="rd-sd"><th scope="row">${esc(p.nombre)} <span class="rd-tk">${esc(p.ticker)}</span></th><td colspan="3">sin dato: ${esc(p.motivo)}</td></tr>`).join('');
    return `<details class="rd-tabla-det"><summary>Ver los números del gráfico</summary><div class="rd-tabla-wrap" tabindex="0"><table class="rd-tabla"><thead><tr><th scope="col">Empresa</th><th scope="col">P/E fwd (12 meses)</th><th scope="col">Crecimiento EPS (2 años)</th><th scope="col">Cuadrante</th></tr></thead><tbody>${filas}</tbody></table></div></details>`;
  }
  function pintarGrafico() {
    const cont = _box && _box.querySelector('.rd-graf-cuerpo'); if (!cont) return;
    if (_chart) { _chart.destroy(); _chart = null; }
    if (_cfgEstado.tipo !== 'ok') { cont.innerHTML = ''; return; }
    if (_grafEstado === 'cargando') { cont.innerHTML = '<p class="rd-muted">Cargando los datos de mercado de las empresas…</p>'; return; }
    const todos = puntos();
    const buenos = todos.filter(p => p.ok);
    _grafPuntos = buenos;
    const sin = todos.filter(p => !p.ok);
    if (!buenos.length) { cont.innerHTML = `<p class="rd-vacio">Todavía no hay datos de mercado para dibujar el gráfico.</p>${tablaGrafico(todos)}`; return; }
    const sy = escalaY(buenos);
    const marcas = buenos.filter(p => p.nota).map(p => `<p class="rd-aviso"><b>${esc(p.ticker)}*</b> ${esc(p.nota)}</p>`).join('');
    const mg = buenos.concat(sin).filter(p => p.aviso).map(p => p.ticker);
    const avisoMg = mg.length ? `<p class="rd-aviso"><b>${esc(mg.join(', '))}†</b> márgenes en expansión: el crecimiento del EPS puede exagerar el del negocio.</p>` : '';
    const recorte = sy.recorta ? `<p class="rd-aviso">${esc(buenos.filter(p => p.y > sy.max).map(p => p.ticker).join(', '))} ▲ queda fuera de escala hacia arriba: se dibuja en el borde y el rótulo trae el valor real.</p>` : '';
    const sinTxt = sin.length ? `<p class="rd-muted">Sin dato para el gráfico: ${esc(sin.map(p => p.ticker + ' (' + p.motivo + ')').join('; '))}.</p>` : '';
    const fechas = buenos.map(p => p.fecha).filter(Boolean).sort();
    cont.innerHTML = `<figure class="rd-fig"><div class="rd-cv-wrap"><canvas id="rd-cv" role="img" aria-label="Gráfico de dispersión de las empresas: P/E fwd de los próximos 12 meses en el eje horizontal y crecimiento esperado del EPS a 2 años en el vertical. Los números están en la tabla de abajo."></canvas></div>
      <ul class="rd-leyenda" aria-label="Cuadrantes del gráfico">${CUADRANTES.map(c => `<li><i class="rd-lq rd-lq-${c[3]}" aria-hidden="true"></i>${esc(c[2])}</li>`).join('')}<li class="rd-leyenda-nota">Los valores de cada punto: tocalo, o mirá la tabla de abajo.</li></ul>
      <figcaption class="rd-muted">Horizontal: P/E fwd de los próximos 12 meses (precio de hoy ÷ EPS que espera el consenso para los próximos 12 meses). Vertical: crecimiento anual esperado del EPS a 2 años. Cortes en ${CORTE_X}x y ${Math.round(CORTE_Y * 100)}%.${fechas.length ? ' Datos de mercado del ' + V().dm(fechas[fechas.length - 1]) + '.' : ''}</figcaption></figure>
      ${marcas}${avisoMg}${recorte}${sinTxt}${tablaGrafico(todos)}`;
    dibujarGrafico(buenos, sy);
  }
  function dibujarGrafico(ps, sy) {
    const cv = _box.querySelector('#rd-cv');
    if (!cv || typeof Chart === 'undefined') { if (cv) cv.closest('.rd-fig').insertAdjacentHTML('afterbegin', '<p class="rd-err">No se pudo cargar la librería de gráficos: usá la tabla de abajo.</p>'); return; }
    const sx = escalaX(ps), f = V().fmt;
    const esChico = w => w < 520, fig = cv.closest('.rd-fig');
    const yTitulo = w => (esChico(w) ? ['Crec. EPS esperado', '(2 años)'] : 'Crecimiento EPS esperado (2 años)');
    fig.classList.toggle('rd-chico', esChico(cv.parentElement.clientWidth));
    const verPlot = p => Math.min(p.y, sy.max * 0.97);
    const data = ps.map(p => ({ x: p.x, y: verPlot(p), t: p.ticker }));
    const tinta = css('--tp', '#EDF4FF'), tinta2 = css('--ts', '#8BA5C0'), acento = css('--accent', '#38BDF8'), borde = css('--border', 'rgba(100,155,220,.15)');
    const fondo = css('--bg2', '#070C16');
    const colQ = { verde: css('--rd-q-verde', '#10E07C'), azul: css('--rd-q-azul', '#38BDF8'), rojo: css('--rd-q-rojo', '#FF3358'), violeta: css('--rd-q-violeta', '#A78BFA') };
    const plugin = {
      id: 'rdCuadrantes',
      beforeDraw(ch) {
        const { ctx, chartArea: a, scales: { x, y } } = ch; if (!a) return;
        const cx = Math.min(Math.max(x.getPixelForValue(CORTE_X), a.left), a.right), cy = Math.min(Math.max(y.getPixelForValue(CORTE_Y), a.top), a.bottom);
        ctx.save();
        const rect = (x0, y0, x1, y1, c) => { ctx.globalAlpha = 0.13; ctx.fillStyle = c; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); };
        rect(a.left, a.top, cx, cy, colQ.verde); rect(cx, a.top, a.right, cy, colQ.azul); rect(a.left, cy, cx, a.bottom, colQ.rojo); rect(cx, cy, a.right, a.bottom, colQ.violeta);
        ctx.restore();
      },
      afterDatasetsDraw(ch) {
        const { ctx, chartArea: a, scales: { x, y } } = ch; if (!a) return;
        const chico = esChico(ch.width), fs = chico ? 10.5 : 12, fam = getComputedStyle(cv).fontFamily || 'sans-serif';
        const cx = x.getPixelForValue(CORTE_X), cy = y.getPixelForValue(CORTE_Y);
        ctx.save();
        // Cortes
        ctx.setLineDash([5, 4]); ctx.lineWidth = 1; ctx.strokeStyle = tinta2; ctx.globalAlpha = 0.7;
        ctx.beginPath(); if (cx > a.left && cx < a.right) { ctx.moveTo(cx, a.top); ctx.lineTo(cx, a.bottom); } if (cy > a.top && cy < a.bottom) { ctx.moveTo(a.left, cy); ctx.lineTo(a.right, cy); } ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        // Rótulos de cuadrante: en las esquinas (tinta de texto); si un punto cae encima, el rótulo se corre junto al corte. Cuentan como ocupados.
        const meta = ch.getDatasetMeta(0), R = 7, lh = chico ? 11 : 13, h2 = 2 * lh;
        const cruza = (r, lista) => lista.some(o => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]);
        const marcadores = meta.data.map(d => [d.x - R - 3, d.y - R - 3, d.x + R + 3, d.y + R + 3]);
        const ocupado = [], rects = []; ch.rdEtiquetas = rects;
        ctx.fillStyle = tinta2; ctx.font = `600 ${chico ? 9.5 : 11}px ${fam}`; ctx.textBaseline = 'top';
        const ancho = txt => Math.max(...txt.split(' / ').map(t => ctx.measureText(t).width));
        for (const [i, derecha, arribaQ] of chico ? [] : [[0, false, true], [1, true, true], [2, false, false], [3, true, false]]) {
          const txt = CUADRANTES[i][2], w = ancho(txt), x0 = derecha ? a.right - 6 - w : a.left + 6;
          const ys = arribaQ ? [a.top + 5, cy + 5] : [a.bottom - 5 - h2, cy - 5 - h2];
          const y0 = ys.find(y => !cruza([x0, y, x0 + w, y + h2], marcadores)) ?? ys[0];
          ocupado.push([x0, y0, x0 + w, y0 + h2]);
          const [t1, t2] = txt.split(' / ');
          ctx.textAlign = derecha ? 'right' : 'left';
          ctx.fillText(t1, derecha ? x0 + w : x0, y0); ctx.fillText(t2, derecha ? x0 + w : x0, y0 + lh);
        }
        // Etiquetas de los puntos, sin pisarse
        ctx.textBaseline = 'middle';
        const orden = ps.map((p, i) => i).sort((i, j) => meta.data[i].y - meta.data[j].y);
        for (const i of orden) ocupado.push([meta.data[i].x - R, meta.data[i].y - R, meta.data[i].x + R, meta.data[i].y + R]);
        const choca = (r) => ocupado.some(o => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]);
        for (const i of orden) {
          const p = ps[i], pt = meta.data[i];
          const arriba = p.y > sy.max * 0.97;
          const marca = (p.nota ? '*' : '') + (p.aviso ? '†' : '') + (arriba ? ' ▲' : '');
          const t1 = p.ticker, t2 = chico ? marca : `  ${f('x', p.x)}, ${f('pct', p.y)}${marca}`;
          ctx.font = `700 ${fs}px ${fam}`; const w1 = ctx.measureText(t1).width;
          ctx.font = `400 ${fs}px ${fam}`; const w = w1 + ctx.measureText(t2).width, h = fs + 3;
          const cands = [[R + 3, 0, 'l'], [-R - 3, 0, 'r'], [0, -R - h / 2 - 1, 'c'], [0, R + h / 2 + 1, 'c'], [R + 3, -h - 1, 'l'], [R + 3, h + 1, 'l'], [-R - 3, -h - 1, 'r'], [-R - 3, h + 1, 'r'],
            [0, -R - h * 1.5 - 2, 'c'], [0, R + h * 1.5 + 2, 'c'], [R + 3, -2 * h - 2, 'l'], [R + 3, 2 * h + 2, 'l'], [-R - 3, -2 * h - 2, 'r'], [-R - 3, 2 * h + 2, 'r']];
          let elegido = null;
          for (const c of cands) {
            const x0 = c[2] === 'l' ? pt.x + c[0] : c[2] === 'r' ? pt.x + c[0] - w : pt.x - w / 2, y0 = pt.y + c[1] - h / 2, r = [x0, y0, x0 + w, y0 + h];
            if (r[0] < 2 || r[2] > ch.width - 2 || r[1] < a.top - 14 || r[3] > a.bottom + 2) continue;
            if (!choca(r)) { elegido = r; break; }
          }
          if (!elegido) { const c = cands[0], x0 = pt.x + c[0], y0 = pt.y - h / 2; elegido = [Math.min(x0, ch.width - 2 - w), y0, Math.min(x0, ch.width - 2 - w) + w, y0 + h]; }
          ocupado.push(elegido); rects.push({ t: p.ticker, r: elegido });
          ctx.textAlign = 'left';
          ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = fondo; ctx.globalAlpha = 0.9;
          ctx.font = `700 ${fs}px ${fam}`; ctx.strokeText(t1, elegido[0], (elegido[1] + elegido[3]) / 2);
          ctx.font = `400 ${fs}px ${fam}`; ctx.strokeText(t2, elegido[0] + w1, (elegido[1] + elegido[3]) / 2);
          ctx.globalAlpha = 1; ctx.fillStyle = tinta;
          ctx.font = `700 ${fs}px ${fam}`; ctx.fillText(t1, elegido[0], (elegido[1] + elegido[3]) / 2);
          ctx.font = `400 ${fs}px ${fam}`; ctx.fillText(t2, elegido[0] + w1, (elegido[1] + elegido[3]) / 2);
        }
        ctx.restore();
      },
    };
    const radio = i => (ps[i].ticker === _sel ? 7.5 : 5.5);
    _chart = new Chart(cv, {
      type: 'scatter',
      data: { datasets: [{ data, parsing: false, pointRadius: ctx => radio(ctx.dataIndex), pointHoverRadius: 8,
        backgroundColor: ctx => (ps[ctx.dataIndex].nota ? 'transparent' : acento), borderColor: ctx => (ps[ctx.dataIndex].ticker === _sel ? tinta : (ps[ctx.dataIndex].nota ? acento : fondo)),
        borderWidth: ctx => (ps[ctx.dataIndex].ticker === _sel || ps[ctx.dataIndex].nota ? 2.5 : 2) }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        onResize: (ch, size) => { fig.classList.toggle('rd-chico', esChico(size.width)); const t = yTitulo(size.width); if (String(ch.options.scales.y.title.text) !== String(t)) { ch.options.scales.y.title.text = t; ch.update('none'); } },
        layout: { padding: { top: 6, right: 10, bottom: 2, left: 2 } },
        onClick: (_e, els) => { if (els.length) seleccionar(ps[els[0].index].ticker); },
        scales: {
          x: { type: 'linear', min: sx.min, max: sx.max, title: { display: true, text: 'P/E fwd (12 meses)', color: tinta2, font: { weight: '600' } }, ticks: { color: tinta2, callback: v => v + 'x', maxTicksLimit: 8 }, grid: { color: borde } },
          y: { type: 'linear', min: sy.min, max: sy.max, title: { display: true, text: yTitulo(cv.parentElement.clientWidth), color: tinta2, font: { weight: '600' } }, ticks: { color: tinta2, callback: v => Math.round(v * 100) + '%', maxTicksLimit: 8 }, grid: { color: borde } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: items => { const p = ps[items[0].dataIndex]; return `${p.nombre} (${p.ticker})`; },
            label: item => { const p = ps[item.dataIndex]; return [`P/E fwd (12 meses): ${f('x', p.x)}`, `Crecimiento del EPS (2 años): ${f('pct', p.y)}`, cuadranteDe(p)].concat(p.aviso ? ['† márgenes en expansión: el crecimiento del EPS puede exagerar el del negocio'] : []).concat(p.nota ? ['* ' + p.nota] : []); },
          } },
        },
      },
      plugins: [plugin],
    });
  }
  function resaltarGrafico() { if (_chart) _chart.update('none'); }

  // ════════════════════════════════════════════════════════════════════
  // Montaje
  // ════════════════════════════════════════════════════════════════════
  async function cargarComplementos() {
    await Promise.all([leer('radar-manual.json', true), leer('pe-forward-sa.json', true), leer('reportes.json', true)]);
    if (_sel) { pintarFicha(); pintarEstado(); }
  }
  function renderInto(el) {
    _box = el;
    el.innerHTML = `<div class="rd-root">
      <section class="rd-strip" aria-labelledby="rd-strip-t">
        <h3 id="rd-strip-t" class="rd-strip-t">Empresas para explorar</h3>
        <div class="rd-strip-row" role="group" aria-label="Empresas para explorar"></div>
      </section>
      <p class="rd-estado" role="status" aria-live="polite"></p>
      <div class="rd-ficha" aria-live="polite"></div>
      <section class="rd-graf" aria-labelledby="rd-graf-t">
        <h3 id="rd-graf-t" class="rd-h3">Crecimiento vs valuación</h3>
        <div class="rd-graf-cuerpo"></div>
      </section>
    </div>`;
    el.addEventListener('click', alClick);
    el.addEventListener('submit', alSubmit);
    el.addEventListener('keydown', alTecla);
    pintarFranja();
    cargarConfig().then(() => {
      pintarFranja(); pintarEstado();
      if (_cfgEstado.tipo === 'ok') { cargarMercados(); cargarComplementos(); }
      else pintarGrafico();
    });
  }
  // Al volver a la pestaña: los reportes pueden haber cambiado (la rutina los resuelve) y el gráfico necesita recalcular su tamaño.
  function alMostrar() {
    if (!_box) return;
    if (_cfgEstado.tipo === 'error') { cargarConfig().then(() => { pintarFranja(); pintarEstado(); if (_cfgEstado.tipo === 'ok') { cargarMercados(true); cargarComplementos(); } }); return; }
    leer('reportes.json', true).then(() => { if (_sel) pintarFicha(); });
    if (_chart) _chart.resize();
  }

  return { renderInto, alMostrar };
})();
window.Radar = Radar;
