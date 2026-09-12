/* ══════════════════════════════════════════════════════════════════════════
   ARCHIVO HISTÓRICO — mantiene el documento de estado lejos del techo de
   Firestore (1 MiB por documento).

   El estado entero (S) viaja como UN string en UN documento. Las claves
   históricas crecen para siempre y nunca se podan: el día que el documento
   toca el techo, Firestore RECHAZA la escritura completa — no se degrada
   suave, se pierde todo lo cargado desde el último guardado.

   Este módulo generaliza el `archivarAno()` que ya existía en app.js (que
   solo movía routineLog y había que llamarlo a mano desde la consola):
     · mide el peso real por clave,
     · mueve los años cerrados a documentos `archive_<año>`,
     · avisa solo cuando hace falta,
     · deja los datos archivados legibles bajo demanda.

   REGLA CENTRAL: lo archivado NUNCA vuelve a S. Si volviera, la próxima
   escritura re-inflaría el documento y estaríamos igual. Las vistas que
   necesiten historia vieja la piden con CMArchivo.cargar(año).
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const LIMITE  = 1048576;   // techo duro de Firestore por documento
  const AVISO   = 0.70;      // desde acá conviene archivar
  const BLOQUEO = 1000000;   // desde acá no se escribe: el write fallaría y perderíamos el cambio

  // Claves históricas: append-only, de alto volumen y que casi nunca se leen enteras.
  // Deliberadamente NO se archivan los calendarios ni los días de hábitos (pesan
  // pocos bytes por día) ni presupuestos/objetivos (se consultan hacia atrás seguido).
  const CLAVES = [
    { k: 'routineLog',      tipo: 'grupos',   label: 'sesiones de entrenamiento' },
    { k: 'workoutLog',      tipo: 'porFecha', label: 'días de gimnasio' },
    { k: 'transactions',    tipo: 'lista',    label: 'movimientos de dinero' },
    { k: 'goals',           tipo: 'porFecha', label: 'metas del día' },
    { k: 'dayPlan',         tipo: 'porFecha', label: 'planificaciones del día' },
    { k: 'dayPlanner',      tipo: 'porFecha', label: 'planificaciones viejas' },
    { k: 'sleepLog',        tipo: 'porFecha', label: 'registros de sueño' },
    { k: 'pomodoroHistory', tipo: 'lista',    label: 'sesiones de foco' },
    { k: 'nwHistory',       tipo: 'lista',    label: 'puntos de patrimonio' },
    { k: 'accountHistory',  tipo: 'lista',    label: 'saldos de cuentas' },
  ];

  const esDelAnio = (fecha, anio) => String(fecha || '').slice(0, 4) === String(anio);
  const pesar = o => { try { return JSON.stringify(o).length; } catch (e) { return 0; } };
  const fmtKB = b => b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.round(b / 1024) + ' KB';
  const listo = () => typeof S !== 'undefined' && S && Object.keys(S).length > 5;
  const tipoDe = k => (CLAVES.find(c => c.k === k) || {}).tipo;

  // ── Partir una clave en {dentro, fuera} según el año ────────────────────────
  function partir(valor, tipo, anio) {
    if (tipo === 'porFecha') {
      const dentro = {}, fuera = {};
      Object.keys(valor || {}).forEach(f => { (esDelAnio(f, anio) ? dentro : fuera)[f] = valor[f]; });
      return { dentro, fuera, n: Object.keys(dentro).length };
    }
    if (tipo === 'lista') {
      const dentro = [], fuera = [];
      (valor || []).forEach(e => { (esDelAnio(e && e.date, anio) ? dentro : fuera).push(e); });
      return { dentro, fuera, n: dentro.length };
    }
    // grupos: { idGrupo: [ {date, ...} ] }
    const dentro = {}, fuera = {};
    let n = 0;
    Object.keys(valor || {}).forEach(id => {
      const d = [], f = [];
      (valor[id] || []).forEach(e => { (esDelAnio(e && e.date, anio) ? d : f).push(e); });
      if (d.length) { dentro[id] = d; n += d.length; }
      if (f.length) fuera[id] = f;
    });
    return { dentro, fuera, n };
  }

  // Cuántos registros de `anio` hay en un valor ya guardado (para verificar el archivo).
  function contarEn(valor, tipo, anio) {
    if (!valor) return 0;
    if (tipo === 'porFecha') return Object.keys(valor).filter(f => esDelAnio(f, anio)).length;
    if (tipo === 'lista')    return valor.filter(e => esDelAnio(e && e.date, anio)).length;
    return Object.keys(valor).reduce((acc, id) =>
      acc + (valor[id] || []).filter(e => esDelAnio(e && e.date, anio)).length, 0);
  }

  // ── Medición ───────────────────────────────────────────────────────────────
  function medir() {
    if (!listo()) return null;
    const total = pesar(S);
    const porClave = Object.keys(S)
      .map(k => ({ clave: k, bytes: pesar(S[k]) }))
      .sort((a, b) => b.bytes - a.bytes);
    return { total, pct: total / LIMITE, limite: LIMITE, porClave };
  }

  // Años con datos archivables, del más viejo al más nuevo. Nunca el año en curso.
  function aniosArchivables() {
    if (!listo()) return [];
    const actual = new Date().getFullYear();
    const anios = new Set();
    CLAVES.forEach(({ k, tipo }) => {
      const v = S[k];
      if (!v) return;
      let fechas = [];
      if (tipo === 'porFecha') fechas = Object.keys(v);
      else if (tipo === 'lista') fechas = (v || []).map(e => e && e.date);
      else Object.keys(v).forEach(id => { (v[id] || []).forEach(e => fechas.push(e && e.date)); });
      fechas.forEach(f => {
        const a = parseInt(String(f || '').slice(0, 4), 10);
        if (a && a < actual) anios.add(a);
      });
    });
    return [...anios].sort((a, b) => a - b);
  }

  function vistaPrevia(anio) {
    if (!listo()) return null;
    const detalle = [], extracto = {};
    let items = 0;
    CLAVES.forEach(({ k, tipo, label }) => {
      if (!S[k]) return;
      const { dentro, n } = partir(S[k], tipo, anio);
      if (!n) return;
      extracto[k] = dentro;
      detalle.push({ clave: k, label, n, bytes: pesar(dentro) });
      items += n;
    });
    return { anio, items, bytes: pesar(extracto), detalle, extracto };
  }

  // ── Archivar (destructivo sobre S: el orden de los pasos es la seguridad) ───
  const _cache = {};

  async function archivar(anio, opts) {
    opts = opts || {};
    anio = parseInt(anio, 10);
    const actual = new Date().getFullYear();
    if (!anio || anio >= actual) {
      console.warn('[archivo] año inválido:', anio, '— nunca el año en curso');
      return { ok: false, motivo: 'anio-invalido' };
    }
    const prev = vistaPrevia(anio);
    if (!prev || !prev.items) return { ok: false, motivo: 'sin-datos' };

    if (!opts.sinConfirmar) {
      const lineas = prev.detalle.map(d => '· ' + d.n + ' ' + d.label).join('\n');
      if (!confirm(
        'Guardar ' + anio + ' en el archivo:\n' + lineas + '\n\n' +
        'Son ' + fmtKB(prev.bytes) + ' que salen del documento principal.\n' +
        'Los datos NO se borran: quedan guardados aparte y se pueden consultar.\n\n¿Seguimos?'
      )) return { ok: false, motivo: 'cancelado' };
    }

    const ref = _db.collection('appdata').doc('archive_' + anio);

    // 1) Combinar con lo que ya hubiera de ese año: archivar dos veces no puede
    //    pisar la tanda anterior.
    let previo = {};
    try {
      const d = await ref.get();
      if (d.exists) previo = d.data() || {};
    } catch (e) {
      console.error('[archivo] no se pudo leer el archivo existente, se aborta sin tocar nada:', e.code || e.message);
      if (typeof showToast === 'function') showToast('⚠️ No se pudo leer el archivo de ' + anio + ' — no se movió nada', 8000);
      return { ok: false, motivo: 'lectura-fallida' };
    }

    const payload = { anio, archivadoEl: Date.now() };
    CLAVES.forEach(({ k, tipo }) => {
      const nuevo = prev.extracto[k];
      const viejo = previo[k];
      if (!nuevo && !viejo) return;
      if (!viejo) { payload[k] = nuevo; return; }
      if (!nuevo) { payload[k] = viejo; return; }
      if (tipo === 'lista') {
        const vistos = new Set((viejo || []).map(e => e && e.id).filter(Boolean));
        payload[k] = (viejo || []).concat((nuevo || []).filter(e => !e || !e.id || !vistos.has(e.id)));
      } else if (tipo === 'porFecha') {
        payload[k] = Object.assign({}, viejo, nuevo);
      } else {
        const out = Object.assign({}, viejo);
        Object.keys(nuevo).forEach(id => {
          const vistos = new Set((out[id] || []).map(e => e && e.id).filter(Boolean));
          out[id] = (out[id] || []).concat(nuevo[id].filter(e => !e || !e.id || !vistos.has(e.id)));
        });
        payload[k] = out;
      }
    });

    // 2) Escribir el archivo PRIMERO. Si falla, S queda intacto.
    try {
      await ref.set(payload);
    } catch (e) {
      console.error('[archivo] falló la escritura, no se tocó ningún dato:', e.code || e.message);
      if (typeof showToast === 'function') showToast('⚠️ No se pudo guardar el archivo de ' + anio + ' — no se borró nada', 8000);
      return { ok: false, motivo: 'escritura-fallida' };
    }

    // 3) Releer y comprobar que quedó COMPLETO antes de podar. Podar contra un
    //    archivo incompleto sería pérdida de datos irreversible.
    try {
      const check = await ref.get();
      const guardado = check.exists ? (check.data() || {}) : {};
      const faltan = prev.detalle.filter(d => contarEn(guardado[d.clave], tipoDe(d.clave), anio) < d.n);
      if (faltan.length) {
        console.error('[archivo] el archivo quedó incompleto, NO se poda nada:', faltan);
        if (typeof showToast === 'function') showToast('⚠️ El archivo quedó incompleto — no se borró nada', 8000);
        return { ok: false, motivo: 'verificacion-fallida', faltan };
      }
    } catch (e) {
      console.error('[archivo] no se pudo verificar el archivo, NO se poda nada:', e.code || e.message);
      if (typeof showToast === 'function') showToast('⚠️ No se pudo verificar el archivo — no se borró nada', 8000);
      return { ok: false, motivo: 'verificacion-fallida' };
    }

    // 4) Recién ahora: podar S y guardar por el flujo normal (saveState → _fbSave).
    CLAVES.forEach(({ k, tipo }) => {
      if (!S[k] || !prev.extracto[k]) return;
      const { fuera } = partir(S[k], tipo, anio);
      S[k] = fuera;
    });
    _cache[anio] = payload;
    if (typeof saveState === 'function') saveState();

    const despues = medir();
    if (typeof showToast === 'function') {
      showToast('✅ ' + anio + ' guardado en el archivo · ' + fmtKB(prev.bytes) + ' liberados', 7000);
    }
    console.log('[archivo] ' + anio + ' archivado:', prev.items, 'registros,', fmtKB(prev.bytes),
                '→ documento ahora en', despues ? Math.round(despues.pct * 100) + '%' : '?');
    _descartado = false;
    _pintarBanner(false);
    return { ok: true, anio, items: prev.items, bytes: prev.bytes };
  }

  // ── Lectura bajo demanda (NUNCA vuelve a S) ────────────────────────────────
  async function cargar(anio) {
    anio = parseInt(anio, 10);
    if (_cache[anio]) return _cache[anio];
    try {
      const d = await _db.collection('appdata').doc('archive_' + anio).get();
      if (!d.exists) return null;
      _cache[anio] = d.data() || {};
      return _cache[anio];
    } catch (e) {
      console.warn('[archivo] cargar', anio, e.code || e.message);
      return null;
    }
  }
  function obtener(clave, anio) {
    const a = _cache[parseInt(anio, 10)];
    return a ? (a[clave] || null) : null;
  }
  async function aniosArchivados() {
    try {
      const q = await _db.collection('appdata').get();
      return q.docs.map(d => d.id)
        .filter(id => id.startsWith('archive_'))
        .map(id => parseInt(id.slice(8), 10))
        .filter(Boolean).sort();
    } catch (e) { return []; }
  }

  // ── Aviso en pantalla ──────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = [
    '#archivo-banner{position:fixed;left:12px;right:12px;bottom:calc(var(--nav-h,64px) + 12px);z-index:8800;',
    '  display:none;align-items:center;gap:10px;padding:11px 13px;border-radius:11px;',
    '  background:linear-gradient(180deg,rgba(16,13,6,.97),rgba(10,8,4,.98));',
    '  border:1px solid var(--warn);box-shadow:0 10px 34px rgba(0,0,0,.5);',
    '  font-size:var(--fs-13);color:var(--ts);animation:arcIn .22s ease-out}',
    '#archivo-banner.crit{border-color:var(--danger);background:linear-gradient(180deg,rgba(22,8,10,.97),rgba(12,5,6,.98))}',
    '#archivo-banner.abierto{display:flex}',
    '#archivo-banner .ab-txt{flex:1;min-width:0;line-height:1.4}',
    '#archivo-banner .ab-txt b{color:var(--tp);font-weight:700}',
    '#archivo-banner button{flex-shrink:0;padding:7px 11px;border-radius:8px;cursor:pointer;',
    '  font-family:var(--mono);font-size:var(--fs-12-5);font-weight:700;letter-spacing:.05em;',
    '  background:var(--warn);border:none;color:#0a0800}',
    '#archivo-banner.crit button{background:var(--danger);color:#fff}',
    '#archivo-banner .ab-x{background:none;border:1px solid var(--border);color:var(--tt);padding:7px 9px}',
    '@keyframes arcIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    '@media (prefers-reduced-motion: reduce){#archivo-banner{animation:none}}',
  ].join('\n');
  document.head.appendChild(style);

  let _banner = null, _descartado = false;

  function _crearBanner() {
    if (_banner && document.body.contains(_banner)) return _banner;
    _banner = document.createElement('div');
    _banner.id = 'archivo-banner';
    _banner.setAttribute('role', 'status');
    document.body.appendChild(_banner);
    return _banner;
  }

  function _pintarBanner(critico) {
    const m = medir();
    if (!m) return;
    if (!critico && (m.pct < AVISO || _descartado)) {
      if (_banner) _banner.classList.remove('abierto');
      return;
    }
    const b = _crearBanner();
    const anios = aniosArchivables();
    const pct = Math.round(m.pct * 100);
    b.classList.toggle('crit', !!critico);

    const cabeza = critico
      ? '<b>No se puede guardar en la nube: el espacio está lleno (' + pct + '%).</b> Tus datos están a salvo en este dispositivo. '
      : '<b>El espacio de guardado está al ' + pct + '%.</b> ';

    if (!anios.length) {
      b.innerHTML = '<div class="ab-txt">' + cabeza +
        'No hay años cerrados para mover al archivo — hace falta revisar qué ocupa lugar (escribí <b>espacio()</b> en la consola).</div>' +
        '<button class="ab-x" type="button">Cerrar</button>';
      b.querySelector('.ab-x').onclick = () => { _descartado = true; b.classList.remove('abierto'); };
    } else {
      const anio = anios[0];
      const prev = vistaPrevia(anio);
      b.innerHTML = '<div class="ab-txt">' + cabeza +
        'Puedo mover ' + (prev ? prev.items : 0) + ' registros de ' + anio + ' al archivo y liberar ' +
        (prev ? fmtKB(prev.bytes) : '') + '. No se borra nada.</div>' +
        '<button type="button">Archivar ' + anio + '</button>' +
        '<button class="ab-x" type="button">Ahora no</button>';
      b.querySelector('button').onclick = () => { archivar(anio); };
      b.querySelector('.ab-x').onclick = () => { _descartado = true; b.classList.remove('abierto'); };
    }
    b.classList.add('abierto');
  }

  // La llama el guard de tamaño de app.js cuando una escritura queda bloqueada.
  function alertaCritica() { _descartado = false; _pintarBanner(true); }
  function revisarUmbral()  { _pintarBanner(false); }

  // Chequeo al arrancar: espera a que el estado esté poblado, sin tocar el arranque.
  let _intentos = 0;
  const _esperar = setInterval(() => {
    if (++_intentos > 40) { clearInterval(_esperar); return; }   // ~40s y desiste
    if (!listo()) return;
    clearInterval(_esperar);
    setTimeout(revisarUmbral, 2500);   // que no pelee con el render inicial
  }, 1000);

  window.CMArchivo = {
    medir, aniosArchivables, vistaPrevia, archivar, cargar, obtener,
    aniosArchivados, revisarUmbral, alertaCritica, LIMITE, BLOQUEO, CLAVES,
  };

  // Consola: espacio() muestra qué ocupa lugar, de mayor a menor.
  window.espacio = function () {
    const m = medir();
    if (!m) { console.warn('El estado todavía no cargó.'); return; }
    console.log('Documento: ' + fmtKB(m.total) + ' de ' + fmtKB(LIMITE) + ' (' + Math.round(m.pct * 100) + '%)');
    console.table(m.porClave.slice(0, 15).map(x => ({ clave: x.clave, peso: fmtKB(x.bytes) })));
    console.log('Años que se pueden archivar:', aniosArchivables().join(', ') || 'ninguno');
    return m;
  };
})();
