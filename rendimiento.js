'use strict';
// ════════════════════════════════════════════════════════════════════════
// RENDIMIENTO COMO INVERSOR — pestaña "Rendimiento" del overlay de Cartera (ver cartera-overlay.js).
// Lee TODO por el Worker (cf-worker/, rutas /rendimiento/* + /cartera) con el ID token de Firebase, y el punto de partida
// (rendimiento-base.json) del repo privado vía CMDatos. El cálculo vive en rendimiento-calc.js (puro, con tests).
// Único estado propio: S.rendimientoFlujos (aportes/retiros/cobros cargados a mano, porque la API de IOL no los informa).
// No opera nada en IOL: solo lectura.
// ════════════════════════════════════════════════════════════════════════

const Rendimiento = (() => {
  const URL_WORKER = 'https://cdm-push-worker.tobiasloustau11.workers.dev';
  const ARCHIVO_BASE = 'rendimiento-base.json';
  const TIMEOUT_MS = 25000;
  const C = () => window.RendimientoCalc;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mesLabel = ym => { const m = /^(\d{4})-(\d{2})/.exec(String(ym || '')); return m ? MESES[+m[2] - 1] + ' ' + m[1] : '—'; };
  const fechaCorta = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(s); };
  const hoyLocal = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const finDeMes = ym => { const [y, m] = ym.split('-').map(Number); return ym + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0'); };

  const dinero = (v, mon, dec) => {
    if (v == null || !isFinite(v)) return '—';
    const d = dec ?? (mon === 'USD' ? 2 : 0);
    return (v < 0 ? '−' : '') + (mon === 'USD' ? 'US$' : '$') + Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const pct = v => (v == null || !isFinite(v)) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(2).replace('.', ',') + '%';
  const puntos = v => (v == null || !isFinite(v)) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(2).replace('.', ',') + ' pts';
  const cls = v => (v == null || !isFinite(v) || Math.abs(v) < 1e-9) ? 'text-ter' : v > 0 ? 'text-ok' : 'text-danger';

  let _moneda = 'ARS';
  let _datos = null;       // lo traído de la red: { base, ops, cierres, mercado, cartera, errores, cargadoEn }
  let _box = null;
  let _cargando = false;
  let _estado = null;      // { tipo:'error', texto, reintentar:true } mientras no hay datos

  function errTipado(tipo, mensaje) { const e = new Error(mensaje); e.tipo = tipo; return e; }

  // GET autenticado al Worker. Un Worker viejo (sin las rutas nuevas) contesta 401/404 SIN JSON de error → "falta publicar".
  async function wk(ruta) {
    if (typeof _auth === 'undefined' || !_auth || !_auth.currentUser) throw errTipado('sesion', 'Iniciá sesión para ver el rendimiento.');
    const token = await _auth.currentUser.getIdToken();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(URL_WORKER + ruta, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: ctrl.signal });
    } catch (e) {
      throw errTipado(e && e.name === 'AbortError' ? 'timeout' : 'red', e && e.name === 'AbortError' ? 'El servidor tardó demasiado en responder.' : 'No hay conexión con el servidor.');
    } finally { clearTimeout(timer); }
    if (res.ok) return res.json();
    const j = await res.json().catch(() => null);
    if (!j || !j.error) throw errTipado('servidor', 'Falta publicar el servidor (Worker) con las rutas de rendimiento.');
    throw errTipado(j.error, j.message || ('El servidor respondió ' + res.status));
  }

  function validarBase(b) {
    if (!b || typeof b !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha || '')) || !Array.isArray(b.posiciones)) {
      throw errTipado('base', 'El archivo del punto de partida (rendimiento-base.json) tiene un formato inesperado.');
    }
    return b;
  }

  async function traer() {
    const r = await CMDatos.carteraDetalle(ARCHIVO_BASE);
    if (r.status === 404) throw errTipado('base', 'No encuentro rendimiento-base.json en el repositorio privado de datos.');
    if (r.status === 403) throw errTipado('base', 'Esta cuenta no está autorizada para ver los datos privados.');
    if (!r.data) throw errTipado('base', 'No se pudo leer el punto de partida (rendimiento-base.json). Revisá la conexión.');
    const base = validarBase(r.data);
    const items = base.posiciones.filter(p => p && p.simbolo).map(p => encodeURIComponent(p.simbolo) + ':' + encodeURIComponent(p.mercado || 'BCBA')).join(',');
    const f = encodeURIComponent(base.fecha);
    // Operaciones y cartera son imprescindibles; cierres y fuentes de mercado fallan "con gracia" (precio intradía marcado aprox. / sin comparación).
    const [ops, cartera, cierres, mercado] = await Promise.allSettled([
      wk('/rendimiento/operaciones?desde=' + f),
      wk('/cartera'),
      items ? wk('/rendimiento/cierres?fecha=' + f + '&s=' + items) : Promise.resolve({ cierres: {} }),
      wk('/rendimiento/mercado?desde=' + f),
    ]);
    for (const x of [ops, cartera]) if (x.status === 'rejected') throw x.reason;
    if (!cartera.value || !Array.isArray(cartera.value.tenencias)) throw errTipado('formato', 'La cartera en vivo llegó con un formato inesperado.');
    const errores = {};
    if (cierres.status === 'rejected') errores.cierres = cierres.reason && cierres.reason.message;
    if (mercado.status === 'rejected') errores.mercado = mercado.reason && mercado.reason.message;
    return {
      base, ops: ops.value, cartera: cartera.value,
      cierres: cierres.status === 'fulfilled' ? (cierres.value.cierres || {}) : {},
      mercado: mercado.status === 'fulfilled' ? mercado.value : null,
      errores, cargadoEn: new Date(),
    };
  }

  function flujos() { return Array.isArray(S.rendimientoFlujos) ? S.rendimientoFlujos : []; }

  // Calcula la vista de la moneda elegida a partir de lo ya traído.
  function computar(d, moneda) {
    const base = {
      ...d.base,
      posiciones: d.base.posiciones.map(p => ({ ...p, precioBase: d.cierres[p.simbolo] != null ? d.cierres[p.simbolo] : undefined })),
    };
    const ef = d.ops && d.ops.efectivo;
    const actual = {
      fecha: hoyLocal(),
      posiciones: d.cartera.tenencias.map(t => ({ simbolo: t.simbolo, cantidad: t.cantidad, valorizado: t.valorizado })),
      efectivo: ef ? { ARS: ef.ARS && ef.ARS.saldo, USD: ef.USD && ef.USD.saldo } : null,
    };
    const mepIn = d.mercado && d.mercado.mep ? d.mercado.mep : null;
    const mep = mepIn ? { serie: mepIn.serie, actual: mepIn.actual } : { serie: [] };
    const res = C().calcular({ base, operaciones: d.ops.operaciones || [], actual, flujos: flujos(), mep, moneda, hoy: actual.fecha });
    if (d.ops && d.ops.comisionesPendientes) res.advertencias.push({ codigo: 'comision-pendiente', texto: d.ops.comisionesPendientes + ' operación(es) todavía sin comisión: se completan en la próxima actualización.' });
    if (d.errores.cierres) res.advertencias.push({ codigo: 'sin-cierres', texto: 'No llegaron los precios de cierre de la base: se usó el precio intradía (aprox.).' });
    res.referencias = referencias(d, moneda, base.fecha, mep);
    return res;
  }

  // S&P 500 e inflación del mismo período. Todo lo que no se pueda atribuir al período queda como "sin dato" con su motivo.
  function referencias(d, moneda, baseFecha, mep) {
    const m = d.mercado;
    const out = { spy: null, inflacion: null };
    if (!m || !m.spy) out.spy = { sinDato: true, motivo: 'No llegó la cotización del S&P 500.' };
    else {
      const r = C().retornoSpy(m.spy, baseFecha, moneda, mep);
      out.spy = r.sinDato ? { sinDato: true, motivo: 'Sin cotización del S&P 500 para el período.' } : r;
    }
    const etiqueta = moneda === 'USD' ? 'Inflación EE.UU. (CPI)' : 'Inflación INDEC (IPC)';
    const mensual = moneda === 'USD' ? (m && m.cpi ? C().nivelesAMensual(m.cpi) : null) : (m && m.ipc ? m.ipc : null);
    if (!mensual) out.inflacion = { sinDato: true, etiqueta, motivo: 'No llegó el dato de inflación.' };
    else {
      const r = C().inflacionAcum(mensual, baseFecha);
      out.inflacion = r.sinDato
        ? { sinDato: true, etiqueta, motivo: `Todavía no hay IPC publicado de ${mesLabel(r.mesBase)} (el mes de la base): ${moneda === 'USD' ? 'el BLS lo publica a mediados del mes siguiente' : 'el INDEC lo publica a mediados del mes siguiente'}. No se compara para no inventar un dato.` }
        : { ...r, etiqueta };
    }
    return out;
  }

  // ── Render ──
  function tarjeta(titulo, valor, sub, claseValor, extra) {
    return `<div class="rnd-card"><div class="rnd-card-lbl">${esc(titulo)}</div><div class="rnd-card-num mono ${claseValor || ''}">${valor}</div><div class="rnd-card-sub">${sub}</div>${extra || ''}</div>`;
  }

  function filaReferencia(nombre, ref, twr, hoy, nota) {
    if (ref.sinDato) {
      return `<div class="rnd-ref"><div class="rnd-ref-top"><span class="rnd-ref-nom">${esc(nombre)}</span><span class="mono text-ter">Sin dato</span></div><div class="rnd-ref-nota">${esc(ref.motivo)}</div></div>`;
    }
    const dif = twr == null ? null : twr - ref.valor;
    return `<div class="rnd-ref"><div class="rnd-ref-top"><span class="rnd-ref-nom">${esc(nombre)}</span><span class="mono ${cls(ref.valor)}">${pct(ref.valor)}</span><span class="mono rnd-ref-dif ${cls(dif)}" title="Tu TWR menos esta referencia">${dif == null ? '—' : puntos(dif)}</span></div>${nota ? `<div class="rnd-ref-nota">${nota}</div>` : ''}</div>`;
  }

  function seccionFlujos() {
    const lista = flujos().slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    const etiqueta = { aporte: 'Aporte', retiro: 'Retiro', cobro: 'Cobro (renta / dividendo)' };
    const filas = lista.map(f => `<div class="rnd-flujo"><span class="mono rnd-flujo-f">${fechaCorta(f.fecha)}</span><span class="rnd-flujo-t">${esc(etiqueta[f.tipo] || f.tipo)}</span><span class="mono rnd-flujo-m">${esc(f.moneda === 'USD' ? 'US$' : '$')}${Number(f.monto).toLocaleString('es-AR')}</span><button type="button" class="btn btn-ghost btn-sm rnd-flujo-del" data-id="${esc(f.id)}" aria-label="Quitar ${esc(etiqueta[f.tipo] || 'movimiento')} del ${fechaCorta(f.fecha)}">✕</button></div>`).join('');
    return `<div class="rnd-sec">
      <div class="sec-label">Aportes y retiros</div>
      <div class="rnd-nota">IOL no informa los depósitos ni los retiros: cargalos acá con su fecha para que no se cuenten como ganancia. Lo que sea del mismo día de la base ya está en el punto de partida.</div>
      <div class="rnd-flujos">${filas || '<div class="rnd-vacio">Todavía no cargaste ninguno.</div>'}</div>
      <form class="rnd-form" autocomplete="off">
        <input class="inp rnd-f-fecha" type="date" value="${hoyLocal()}" aria-label="Fecha">
        <select class="rnd-f-tipo" aria-label="Tipo"><option value="aporte">Aporte</option><option value="retiro">Retiro</option><option value="cobro">Cobro (renta)</option></select>
        <input class="inp rnd-f-monto" type="number" min="0" step="any" inputmode="decimal" placeholder="Monto" aria-label="Monto">
        <select class="rnd-f-mon" aria-label="Moneda"><option value="ARS">ARS</option><option value="USD">USD</option></select>
        <button type="submit" class="btn btn-ghost btn-sm rnd-f-add">Agregar</button>
      </form>
    </div>`;
  }

  function render() {
    if (!_box) return;
    if (_cargando && !_datos) { _box.innerHTML = '<div class="empty-state">Calculando tu rendimiento…</div>'; return; }
    if (_estado && !_datos) {
      _box.innerHTML = `<div class="empty-state rnd-error"><div>${esc(_estado.texto)}</div><button type="button" class="btn btn-ghost btn-sm rnd-retry">Reintentar</button></div>`;
      return;
    }
    if (!_datos) return;
    let r, falla = null;
    try { r = computar(_datos, _moneda); } catch (e) { falla = e && e.message ? e.message : String(e); }
    const mon = _moneda;
    const barra = `<div class="rnd-bar">
        <div class="ten-orden-chips rnd-mon" role="group" aria-label="Moneda">
          <button type="button" class="ten-orden-chip ${mon === 'ARS' ? 'on' : ''}" data-mon="ARS" aria-pressed="${mon === 'ARS'}">ARS</button>
          <button type="button" class="ten-orden-chip ${mon === 'USD' ? 'on' : ''}" data-mon="USD" aria-pressed="${mon === 'USD'}">USD MEP</button>
        </div>
        <button type="button" class="btn btn-ghost btn-sm rnd-act"${_cargando ? ' disabled' : ''}>${_cargando ? 'Actualizando…' : 'Actualizar'}</button>
      </div>`;
    if (falla) {
      _box.innerHTML = `<div class="rnd">${barra}<div class="empty-state rnd-error">${esc(falla)}</div>${seccionFlujos()}</div>`;
      return;
    }
    const dias = r.dias;
    const periodo = `Desde ${fechaCorta(r.desde)} · ${dias} ${dias === 1 ? 'día' : 'días'}`;
    const hora = _datos.cargadoEn.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    const tirTxt = r.tirPeriodo == null ? '—' : pct(r.tirPeriodo);
    const tirSub = r.tirPeriodo == null ? 'Se calcula con al menos un día de historia.' : `Ponderada por cuándo estuvo invertida cada plata${r.tirAnual != null ? ` · ${pct(r.tirAnual)} anualizada` : ''}.`;
    const ref = r.referencias;
    const spyNota = ref.spy.sinDato ? '' : `Del ${fechaCorta(ref.spy.desde)} al ${fechaCorta(ref.spy.hasta)} · retorno total${mon === 'ARS' ? ', pasado a pesos al MEP' : ''}.`;
    let infNota = '';
    if (!ref.inflacion.sinDato) {
      const finInf = finDeMes(ref.inflacion.hasta);
      infNota = `Del ${fechaCorta(r.desde)} hasta fin de ${mesLabel(ref.inflacion.hasta)} (último dato publicado).`;
      if (finInf !== r.hasta) infNota += ` Tu rendimiento llega hasta ${fechaCorta(r.hasta)}: son ventanas distintas.`;
    }
    const advs = r.advertencias.filter((a, i, arr) => arr.findIndex(b => b.texto === a.texto) === i);
    const advHtml = advs.length ? `<div class="rnd-sec"><div class="sec-label">Para tener en cuenta</div><ul class="rnd-advs">${advs.slice(0, 6).map(a => `<li class="${a.codigo === 'descuadre' ? 'text-warn' : ''}">${esc(a.texto)}</li>`).join('')}${advs.length > 6 ? `<li>y ${advs.length - 6} más.</li>` : ''}</ul></div>` : '';
    const otrosFila = Math.abs(r.otros) > Math.max(Math.abs(r.v0) * 0.005, 1) ? `<div class="rnd-otros">Otros (efectivo, dólar sobre el efectivo, diferencias): <span class="mono ${cls(r.otros)}">${dinero(r.otros, mon)}</span></div>` : '';
    const ventas = r.ventas.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const ventasHtml = ventas.length
      ? ventas.map(v => `<div class="rnd-venta"><span class="mono rnd-venta-f">${fechaCorta(v.fecha)}</span><span class="mono bold rnd-venta-s">${esc(v.simbolo)}</span><span class="mono rnd-venta-c">${Number(v.cantidad).toLocaleString('es-AR')}</span><span class="mono rnd-venta-g ${cls(v.ganancia)}">${dinero(v.ganancia, mon)}${v.pct == null ? '' : ` <span class="rnd-venta-p">(${pct(v.pct)})</span>`}</span></div>`).join('')
      : '<div class="rnd-vacio">Todavía no vendiste nada desde la fecha base.</div>';

    _box.innerHTML = `<div class="rnd">
      ${barra}
      <div class="ci-meta">${periodo} · Actualizado a las ${hora}</div>
      <div class="ten-hero rnd-hero">
        <div class="ten-hero-lbl">Resultado total en ${mon === 'USD' ? 'dólares MEP' : 'pesos'}</div>
        <div class="ten-hero-num mono ${cls(r.resultado)}">${dinero(r.resultado, mon)}</div>
        <div class="ten-hero-var rnd-hero-sub">Ganancia o pérdida en plata, sin contar lo que depositaste o retiraste.</div>
      </div>
      <div class="rnd-grid">
        ${tarjeta('Realizado', dinero(r.realizado, mon), 'Ventas contra su costo.', cls(r.realizado))}
        ${tarjeta('No realizado', dinero(r.noRealizado, mon), 'Lo que sigue en cartera contra su costo.', cls(r.noRealizado))}
        ${tarjeta('Rentas y dividendos', dinero(r.rentas, mon), 'Cobrados desde la base.', cls(r.rentas))}
        ${tarjeta('Comisiones', dinero(-r.comisiones, mon), 'Aranceles de las operaciones.', cls(-r.comisiones))}
      </div>
      ${otrosFila}
      <div class="rnd-grid rnd-grid-2">
        ${tarjeta('TWR (Modified Dietz)', pct(r.twr), 'Rendimiento de la cartera sin que importe cuándo pusiste o sacaste plata.', cls(r.twr))}
        ${tarjeta('TIR del período', tirTxt, tirSub, cls(r.tirPeriodo))}
      </div>
      <div class="rnd-sec">
        <div class="sec-label">Contra qué compararlo</div>
        ${filaReferencia('S&P 500 (SPY)', ref.spy, r.twr, r.hasta, spyNota)}
        ${filaReferencia(ref.inflacion.etiqueta, ref.inflacion, r.twr, r.hasta, infNota)}
        <div class="rnd-nota">La diferencia es tu TWR menos la referencia, en puntos porcentuales.</div>
      </div>
      <div class="rnd-sec">
        <div class="sec-label">Ventas realizadas</div>
        <div class="rnd-ventas">${ventasHtml}</div>
      </div>
      ${seccionFlujos()}
      ${advHtml}
      <div class="rnd-nota rnd-pie">Costo de lo que tenías el ${fechaCorta(r.desde)}: precio de cierre de ese día. Costo promedio ponderado por símbolo. Valores en ${mon === 'USD' ? 'dólares MEP, cada movimiento al MEP de su fecha' : 'pesos'}. El rendimiento no está anualizado salvo que se indique.</div>
    </div>`;
  }

  function agregarFlujo(form) {
    const fecha = form.querySelector('.rnd-f-fecha').value;
    const tipo = form.querySelector('.rnd-f-tipo').value;
    const monto = parseFloat(form.querySelector('.rnd-f-monto').value);
    const moneda = form.querySelector('.rnd-f-mon').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !(monto > 0)) { showToast('Poné una fecha y un monto mayor a cero.', 3000); return; }
    if (!Array.isArray(S.rendimientoFlujos)) S.rendimientoFlujos = [];
    S.rendimientoFlujos.push({ id: uid(), fecha, tipo, monto, moneda });
    saveState();
    render();
  }

  function quitarFlujo(id) {
    S.rendimientoFlujos = flujos().filter(f => f.id !== id);
    saveState();
    render();
  }

  async function cargar() {
    if (_cargando) return;
    _cargando = true;
    _estado = null;
    render();
    try {
      _datos = await traer();
    } catch (e) {
      console.warn('[rendimiento]', e && e.message ? e.message : e);
      if (!_datos) _estado = { tipo: 'error', texto: e && e.message ? e.message : 'No se pudo calcular el rendimiento.' };
      else showToast('No se pudo actualizar: ' + (e && e.message ? e.message : 'error'), 5000);
    } finally {
      _cargando = false;
      render();
    }
  }

  function renderInto(box) {
    _box = box;
    _datos = null;
    _estado = null;
    box.onclick = ev => {
      const t = ev.target.closest('button');
      if (!t) return;
      if (t.dataset.mon) { _moneda = t.dataset.mon; render(); }
      else if (t.classList.contains('rnd-act') || t.classList.contains('rnd-retry')) cargar();
      else if (t.classList.contains('rnd-flujo-del')) quitarFlujo(t.dataset.id);
    };
    box.onsubmit = ev => {
      const form = ev.target.closest('.rnd-form');
      if (!form) return;
      ev.preventDefault();
      agregarFlujo(form);
    };
    return cargar();
  }

  return { renderInto };
})();
window.Rendimiento = Rendimiento;
