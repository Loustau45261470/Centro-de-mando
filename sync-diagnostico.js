'use strict';
// ════════════════════════════════════════════════════════════════════════
// DIAGNÓSTICO DE SINCRONIZACIÓN — pantalla para ver, sin consola (iPhone), qué hace ESTE dispositivo
// con los datos: últimos guardados, últimos eventos (con milisegundos) y un "Copiar todo" para pegar en el chat.
// Solo LEE los diarios que escribe app.js (_saveDiag, _syncDiag, _loadDiag, _applyDiag, _syncEvents):
// no decide ni cambia nada del sync. "Copiar todo" lleva nombres de claves y conteos, nunca el contenido del estado.
// API: CMSyncDiag.open() / CMSyncDiag.close()
// ════════════════════════════════════════════════════════════════════════
window.CMSyncDiag = (() => {
  const esc = s => (typeof escHtml === 'function' ? escHtml(s) : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
  const rd = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const arr = k => { const v = rd(k); return Array.isArray(v) ? v : []; };
  const p2 = n => String(n).padStart(2, '0');
  const hora = ts => { if (!ts) return '—'; const d = new Date(ts); return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()); };
  const horaMs = ts => { if (!ts) return '—'; const d = new Date(ts); return hora(ts) + '.' + String(d.getMilliseconds()).padStart(3, '0'); };
  const fechaHora = ts => { if (!ts) return '—'; const d = new Date(ts); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + ' ' + hora(ts); };
  const dur = ms => {
    if (ms == null || isNaN(ms)) return '?';
    const s = Math.round(ms / 1000);
    if (s < 60) return s + ' s';
    if (s < 3600) return Math.floor(s / 60) + ' min ' + (s % 60) + ' s';
    if (s < 86400) return Math.floor(s / 3600) + ' h ' + Math.floor((s % 3600) / 60) + ' min';
    return Math.floor(s / 86400) + ' d ' + Math.floor((s % 86400) / 3600) + ' h';
  };

  const SECCION = {
    routineLog: 'historial de rutinas', workoutLog: 'registro de entrenamientos', activeRtnSession: 'sesión de gimnasio en curso',
    routines: 'rutinas', exerciseHistory: 'historial de ejercicios', exerciseLibrary: 'biblioteca de ejercicios', habitTrackers: 'hábitos',
    transactions: 'movimientos', accounts: 'cuentas', goals: 'metas', tomorrowGoals: 'metas de mañana', sleepLog: 'sueño', bodyWeight: 'peso',
    nwHistory: 'patrimonio', subscriptions: 'suscripciones', wishlist: 'objetivos de compra', proyectos: 'proyectos',
  };
  const sec = k => SECCION[k] || k;
  const secs = (ks, max) => {
    if (!Array.isArray(ks)) return '—';
    if (!ks.length) return 'ninguna';
    max = max || 6;
    return ks.slice(0, max).map(sec).join(', ') + (ks.length > max ? ' y ' + (ks.length - max) + ' más' : '');
  };
  const RAMA = {
    overwrite: 'Guardó tal cual (la nube no había cambiado)',
    merge3way: 'Combinó los cambios de los dos dispositivos',
    'rescue-unconfirmed': 'Recuperó datos de la nube antes de guardar',
  };
  const FUENTE = {
    cloud: 'desde la nube', 'cloud-cache': 'desde la memoria del dispositivo (la nube no respondió)',
    'local-noDoc': 'desde este dispositivo (la nube no tenía documento)', 'local-error': 'desde este dispositivo (falló la nube)',
  };
  const RESULTADO_SYNC = {
    aplicado: 'Trajo los cambios de la nube y los aplicó',
    'sin-cambios-eco-propio': 'La nube no tenía nada nuevo (era lo último que guardó este dispositivo)',
    'descartado-save-en-vuelo': 'No miró la nube porque había un guardado pendiente o en curso',
    'sin-documento': 'La nube no tiene documento',
    error: 'Falló la lectura de la nube',
  };
  const RESULTADO_GUARDAR = {
    ok: 'Terminó de subir a la nube',
    abortado: 'Terminó sin escribir en la nube',
    'timeout-15s': 'La nube no confirmó en 15 s; queda pendiente',
    'pendiente-cache': 'No subió: no pudo leer la nube al día; queda pendiente',
    'pendiente-lectura-fallo': 'No subió: falló la lectura de la nube; queda pendiente',
    'bloqueado-estado-chico': 'Frenó: los datos locales parecen demasiado pocos',
    'bloqueado-tamano': 'Frenó: el documento supera el límite de tamaño',
  };

  const dispositivo = () => { try { return typeof _devInfo === 'function' ? _devInfo() : '?'; } catch (e) { return '?'; } };
  const metrica = () => { try { return typeof _dataMetric === 'function' ? _dataMetric(S) : null; } catch (e) { return null; } };

  function textoEvento(e) {
    const dev = e.dev ? ' (de ' + e.dev + ')' : '';
    switch (e.tipo) {
      case 'boot':
        return 'Arranque: cargó los datos ' + (FUENTE[e.src] || e.src || '?') + ' (' + (e.items != null ? e.items : '?') + ' datos' +
          (e.localItems != null ? '; la copia local tenía ' + e.localItems : '') + ')' +
          (e.sinUsoMs != null && e.sinUsoMs > 3600000 ? '. La app llevaba ' + dur(e.sinUsoMs) + ' sin usarse' : '') +
          (e.pend ? '. Había cambios sin subir' : '') + (e.err ? '. Error: ' + e.err : '');
      case 'oculta': return 'La app pasó a segundo plano' + (e.timer ? ' con un guardado en espera' : '') + (e.vuelo ? ' con un guardado en curso' : '');
      case 'visible': return 'La app volvió a primer plano' + (e.ocultaMs != null ? ' (estuvo oculta ' + dur(e.ocultaMs) + ')' : '');
      case 'pagehide': return 'La app se está cerrando o congelando' + (e.timer ? ' con un guardado en espera' : '');
      case 'sync-inicio':
        return 'Al volver: empieza a revisar si la nube tiene cambios' + (e.timer || e.vuelo ? ' (hay un guardado pendiente o en curso)' : '') +
          (e.conf === false ? ' (sesión sin confirmar con la nube)' : '');
      case 'sync-fin':
        return (RESULTADO_SYNC[e.res] || e.res || '?') + dev + (e.msg ? ': ' + e.msg : '') + (e.ms != null ? ' · ' + e.ms + ' ms' : '');
      case 'saveState':
        return 'Cambio guardado en este dispositivo' + (e.n > 1 ? ' ×' + e.n : '') + ' · lo pidió: ' + (e.origen || '?') +
          (e.conf === false ? ' · sesión sin confirmar' : '') + (e.vuelo ? ' · había un guardado en curso' : '');
      case 'guardar-inicio': return 'Empieza a subir a la nube' + (e.flush ? ' (por cierre o segundo plano)' : '') + (e.forzado ? ' (forzado)' : '');
      case 'guardar-rama':
        return (RAMA[e.rama] || e.rama || '?') + ' · datos: aquí ' + (e.items ? e.items.l : '?') + ', nube ' + (e.items ? e.items.c : '?') + ', guardó ' + (e.items ? e.items.s : '?');
      case 'guardado-ok': return 'La nube confirmó el guardado' + (e.ms != null ? ' · ' + e.ms + ' ms' : '');
      case 'guardar-fin': return (RESULTADO_GUARDAR[e.res] || (String(e.res || '').indexOf('error-') === 0 ? 'Falló la subida (' + e.res.slice(6) + ')' : e.res) || '?') + (e.ms != null ? ' · ' + e.ms + ' ms' : '');
      case 'snapshot-descartado': return 'Llegó un cambio de otro dispositivo' + dev + ' y se descartó porque este estaba guardando';
      case 'apply':
        return 'Aplicó cambios recibidos' + dev + ' [' + (e.src || '?') + ']: ' + secs(e.kRecibe, 4) +
          (e.kPisadas && e.kPisadas.length ? ' · PISÓ cambios locales sin subir en: ' + secs(e.kPisadas, 4) : '') +
          (e.items ? ' · datos ' + e.items.antes + ' → ' + e.items.despues : '');
      case 'apply-error': return 'Falló al aplicar cambios recibidos: ' + (e.msg || '?');
      default: return e.tipo || '?';
    }
  }

  function chips(ks) {
    if (!Array.isArray(ks) || !ks.length) return '<span class="sdiag-muted">ninguna</span>';
    return ks.slice(0, 8).map(k => '<span class="sdiag-chip">' + esc(sec(k)) + '</span>').join('') +
      (ks.length > 8 ? '<span class="sdiag-muted"> +' + (ks.length - 8) + ' más</span>' : '');
  }

  // Líneas "aquí / nube / guardó" solo de lo que difiere entre los tres (gimnasio y hábitos).
  function difConteos(cnt) {
    if (!cnt) return '';
    const ROT = { routineLog: 'rutinas registradas', workoutLog: 'días de entrenamiento', habitTrackers: 'días de hábitos', activeRtnSession: 'series de la sesión en curso' };
    const out = [];
    Object.keys(ROT).forEach(k => {
      const c = cnt[k]; if (!c) return;
      if (c.l === c.c && c.c === c.s) return;
      out.push(ROT[k] + ': aquí ' + c.l + ', nube ' + (c.c == null ? '?' : c.c) + ', guardó ' + c.s);
    });
    return out.length ? '<div class="sdiag-sub">' + out.map(esc).join(' · ') + '</div>' : '';
  }

  function filaGuardado(r) {
    const hora_ = r.ts ? hora(r.ts) : String(r.t || '').split(' ').pop();
    const cambia = r.kWrite != null ? r.kWrite : r.kLocal;
    return '<li class="sdiag-item">' +
      '<div class="sdiag-row"><span class="sdiag-time">' + esc(hora_) + '</span><span class="sdiag-what">' + esc(RAMA[r.branch] || r.branch || '?') + '</span></div>' +
      '<div class="sdiag-sub">Datos: aquí ' + esc(r.localItems) + ' · nube ' + esc(r.cloudItems) + ' · guardó ' + esc(r.saveItems) +
        (r.sessionConfirmed === false ? ' · sesión sin confirmar' : '') + (r.cloudDiverged ? ' · la nube había cambiado' : '') + (r.forced ? ' · forzado' : '') + (r.flush ? ' · por cierre/segundo plano' : '') + '</div>' +
      '<div class="sdiag-sub">Secciones que cambió: ' + chips(cambia) + '</div>' +
      (r.kFromLocal ? '<div class="sdiag-sub">Tomó de este dispositivo: ' + chips(r.kFromLocal) + '</div>' : '') +
      difConteos(r.cnt) + '</li>';
  }

  function filaEvento(e) {
    return '<li class="sdiag-item sdiag-ev sdiag-ev-' + esc(String(e.tipo || '').replace(/[^a-z-]/g, '')) + '">' +
      '<span class="sdiag-time">' + esc(horaMs(e.ts)) + '</span><span class="sdiag-what">' + esc(textoEvento(e)) + '</span></li>';
  }

  function pendiente() {
    let pend = false; try { pend = !!localStorage.getItem('_pendingCloudSave'); } catch (e) {}
    const timer = typeof _fbSaveTid !== 'undefined' && !!_fbSaveTid, vuelo = typeof _fbSaveInProgress !== 'undefined' && !!_fbSaveInProgress;
    if (vuelo) return 'Sí: está guardando ahora';
    if (timer) return 'Sí: se guarda en un instante';
    if (pend) return 'Sí: hay cambios sin subir a la nube';
    return 'No';
  }

  function resumenHtml() {
    const ld = rd('_loadDiag') || {};
    let sync = null; try { sync = typeof _lastSyncedSavedAt !== 'undefined' ? _lastSyncedSavedAt : null; } catch (e) {}
    return '<dl class="sdiag-dl">' +
      '<dt>Este dispositivo</dt><dd>' + esc(dispositivo()) + '</dd>' +
      '<dt>Última carga</dt><dd>' + esc(ld.t || '—') + (ld.src ? ' · ' + esc(FUENTE[ld.src] || ld.src) : '') + (ld.items != null ? ' · ' + esc(ld.items) + ' datos' : '') + (ld.err ? ' · error: ' + esc(ld.err) : '') + '</dd>' +
      '<dt>Guardado pendiente</dt><dd>' + esc(pendiente()) + '</dd>' +
      '<dt>Último estado de la nube que vio</dt><dd>' + (sync ? esc(fechaHora(sync)) : 'ninguno (sesión sin confirmar con la nube)') + '</dd>' +
      '<dt>Datos ahora en pantalla</dt><dd>' + esc(metrica()) + '</dd>' +
      '</dl>';
  }

  let ov = null, ta = null, msgEl = null;

  function pintar() {
    if (!ov) return;
    const guardados = arr('_saveDiag').slice(0, 15), eventos = arr('_syncEvents').slice(0, 30);
    ov.querySelector('.sdiag-resumen').innerHTML = resumenHtml();
    ov.querySelector('.sdiag-guardados').innerHTML = guardados.length ? guardados.map(filaGuardado).join('') : '<li class="sdiag-item sdiag-muted">Todavía no hay guardados registrados en este dispositivo.</li>';
    ov.querySelector('.sdiag-eventos').innerHTML = eventos.length ? eventos.map(filaEvento).join('') : '<li class="sdiag-item sdiag-muted">Todavía no hay eventos registrados.</li>';
  }

  // Lo que se copia: los 5 diarios + métrica actual. Nombres de claves y conteos; NUNCA el contenido del estado.
  function payload() {
    const ld = rd('_loadDiag'); if (ld && ld.uid) ld.uid = '[oculto]';
    let sync = null; try { sync = typeof _lastSyncedSavedAt !== 'undefined' ? _lastSyncedSavedAt : null; } catch (e) {}
    return {
      generado: new Date().toISOString(),
      dispositivo: dispositivo(),
      lastSyncedSavedAt: sync,
      dataMetric: metrica(),
      pendienteNube: (() => { try { return !!localStorage.getItem('_pendingCloudSave'); } catch (e) { return null; } })(),
      guardadoEnEspera: typeof _fbSaveTid !== 'undefined' ? !!_fbSaveTid : null,
      guardandoAhora: typeof _fbSaveInProgress !== 'undefined' ? !!_fbSaveInProgress : null,
      snapDrops: window._snapDrops || 0,
      saveDiag: arr('_saveDiag'), syncDiag: arr('_syncDiag'), loadDiag: ld, applyDiag: arr('_applyDiag'), syncEvents: arr('_syncEvents'),
    };
  }

  function aviso(t) { if (msgEl) msgEl.textContent = t; }

  async function copiarTodo() {
    let txt = '';
    try { txt = JSON.stringify(payload(), null, 1); } catch (e) { aviso('No se pudo armar el texto.'); return; }
    ta.value = txt;
    let ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(txt); ok = true; } } catch (e) {}
    if (!ok) {
      // iOS puede rechazar el portapapeles asíncrono: el textarea visible + execCommand es el plan B.
      try { ta.hidden = false; ta.focus(); ta.select(); ta.setSelectionRange(0, txt.length); ok = document.execCommand('copy'); } catch (e) {}
    }
    if (ok) { ta.hidden = true; aviso('Copiado (' + Math.round(txt.length / 1024) + ' KB). Pegalo en el chat.'); }
    else { ta.hidden = false; try { ta.focus(); ta.select(); ta.setSelectionRange(0, txt.length); } catch (e) {} aviso('No se pudo copiar solo: el texto quedó seleccionado. Mantené apretado y elegí Copiar.'); }
  }

  function construir() {
    ov = document.createElement('div');
    ov.id = 'sdiag-overlay'; ov.className = 'sdiag-ov';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Diagnóstico de sincronización');
    ov.innerHTML =
      '<div class="sdiag-panel">' +
        '<div class="sdiag-head"><h2 class="sdiag-title">Diagnóstico de sincronización</h2><button type="button" class="sdiag-x" aria-label="Cerrar">✕</button></div>' +
        '<p class="sdiag-intro">Qué hizo este dispositivo con tus datos. Si algo se pisa o se pierde, tocá «Copiar todo» y pegalo en el chat.</p>' +
        '<div class="sdiag-actions"><button type="button" class="sdiag-btn sdiag-copiar">Copiar todo</button><button type="button" class="sdiag-btn sdiag-btn-sec sdiag-act">Actualizar</button></div>' +
        '<div class="sdiag-msg" role="status" aria-live="polite"></div>' +
        '<textarea class="sdiag-copia" id="sdiag-copia" readonly hidden aria-label="Texto para copiar"></textarea>' +
        '<h3 class="sdiag-h">Este dispositivo</h3><div class="sdiag-resumen"></div>' +
        '<h3 class="sdiag-h">Últimos guardados</h3><ul class="sdiag-list sdiag-guardados"></ul>' +
        '<h3 class="sdiag-h">Últimos eventos</h3><ul class="sdiag-list sdiag-eventos"></ul>' +
      '</div>';
    document.body.appendChild(ov);
    ta = ov.querySelector('.sdiag-copia'); msgEl = ov.querySelector('.sdiag-msg');
    ov.addEventListener('click', e => { if (e.target === ov) cerrar(); });
    ov.querySelector('.sdiag-x').addEventListener('click', cerrar);
    ov.querySelector('.sdiag-copiar').addEventListener('click', copiarTodo);
    ov.querySelector('.sdiag-act').addEventListener('click', () => { pintar(); aviso('Actualizado.'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('open')) cerrar(); });
  }

  function abrir() {
    try {
      if (!ov) construir();
      const tp = document.getElementById('theme-panel'); if (tp) tp.classList.remove('open');
      aviso(''); ta.hidden = true;
      pintar();
      ov.classList.add('open');
      const sc = ov.querySelector('.sdiag-panel'); if (sc) sc.scrollTop = 0;
    } catch (e) { console.warn('[sync-diagnostico]', e); }
  }
  function cerrar() { if (ov) ov.classList.remove('open'); }

  return { open: abrir, close: cerrar };
})();
