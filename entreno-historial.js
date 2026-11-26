'use strict';
// ════════════════════════════════════════════════════════════════════════
// ENTRENO-HISTORIAL — notas rápidas, medidas por ejercicio y propósito durante la sesión (EntrenoNotas) + pestaña
// "Historial" del overlay de Entrenamiento (EntrenoHist). Prefijos CSS: .eno- (sesión) y .eh- (historial).
// Datos nuevos, todos ADITIVOS (entradas viejas sin estos campos se ven igual):
//   S.activeRtnSession: { …, notas:[{id,t,instId|null,texto,exNom?}], exMedidas:{instId:{int,con,sens}}, proposito?, proKey? }
//   routineLog[rid][i] (al finalizar): + exMedidas, + notas, + exInfo:{instId:{libId,n}}, + propositoPrevio, + cumplido('si'|'medias'|'no')
//   S.entrenoPropositos: { 'AAAA-MM-DD|rid': texto } — propósito cargado de antemano desde el plan (objeto por clave: se une bien entre dispositivos).
// Scripts clásicos: se carga después de entreno-progreso.js. rutinas.js y plan-entreno-ui.js lo llaman por window.
// ════════════════════════════════════════════════════════════════════════
const esc_eh = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SENS_LBL = ['', 'Mal', 'Flojo', 'Normal', 'Bien', 'Genial'];
const CUMP_LBL = { si: 'Cumplido', medias: 'A medias', no: 'No cumplido' };

// ── Durante la sesión ──
const EntrenoNotas = (() => {
  const esc = esc_eh;
  let pide = null;   // ejercicio recién terminado al que se le ofrece cargar "cómo salió" (solo vista)
  const ses = () => S.activeRtnSession;
  const orden = () => (ses() && ses().exOrder) || [];
  const nm = id => sessExInfo(id).name;
  const notas = () => { const s = ses(); if (!s.notas) s.notas = []; return s.notas; };
  const medDe = id => (ses().exMedidas || {})[id] || null;
  const hayMed = m => !!(m && (m.int || m.con || m.sens));
  const medTxt = m => m ? [m.int ? 'Intensidad ' + m.int : '', m.con ? 'Concentración ' + m.con : '', m.sens ? SENS_LBL[m.sens] : ''].filter(Boolean).join(' · ') : '';
  const hora = t => new Date(t).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  // HTML
  function xbHtml(id) {
    const ns = notas().filter(n => n.instId === id), m = medDe(id);
    return `<div class="eno-xb" id="ses-xb-${id}">${ns.map(n => `<button type="button" class="eno-nt" onclick="EntrenoNotas.abrir('${id}','${n.id}')"><i>✎</i><span>${esc(n.texto)}</span></button>`).join('')}
      <div class="eno-xbr"><button type="button" class="eno-med${hayMed(m) ? ' on' : ''}" onclick="EntrenoNotas.ficha('${id}')">${hayMed(m) ? esc(medTxt(m)) : 'Cómo salió'}</button>
      <button type="button" class="eno-nb" onclick="EntrenoNotas.abrir('${id}')">+ Nota</button></div></div>`;
  }
  const tag = id => medTxt(medDe(id));
  const tagHtml = id => `<span class="eno-hm" id="ses-ht-${id}">${esc(tag(id))}</span>`;
  const nCnt = () => notas().length;
  function notaBtnHtml() {
    return `<button type="button" class="eno-nota" id="ses-nota" onclick="EntrenoNotas.abrir()" aria-label="Anotar una nota rápida"><span>✎ NOTA</span><em id="ses-nota-n">${nCnt() || ''}</em></button>`;
  }
  function pideInner() {
    if (!pide || !orden().includes(pide)) return '';
    return `<span>¿Cómo salió <b>${esc(nm(pide))}</b>?</span><button type="button" class="pe-btn pe-pri" onclick="EntrenoNotas.ficha('${pide}')">Cargar</button><button type="button" class="eno-x" aria-label="Saltear" onclick="EntrenoNotas.saltear()">✕</button>`;
  }
  const pideHtml = () => `<div class="eno-pide" id="ses-pide">${pideInner()}</div>`;
  function proHtml() {
    const p = ses().proposito;
    return `<button type="button" class="eno-pro${p ? ' on' : ''}" id="ses-pro" onclick="EntrenoNotas.pro()">${p ? `<small>Propósito de hoy</small><b>${esc(p)}</b>` : '+ Propósito de hoy (opcional)'}</button>`;
  }

  // Actualiza en el lugar lo que se ve de la sesión sin re-armar todo (no pisa lo que se está tipeando en las series).
  function pintar() {
    if (!ses()) return;
    orden().forEach(id => {
      const el = document.getElementById('ses-xb-' + id); if (el) el.outerHTML = xbHtml(id);
      const t = document.getElementById('ses-ht-' + id); if (t) t.textContent = tag(id);
    });
    const n = document.getElementById('ses-nota-n'); if (n) n.textContent = nCnt() || '';
    const p = document.getElementById('ses-pide'); if (p) p.innerHTML = pideInner();
    const pr = document.getElementById('ses-pro'); if (pr) pr.outerHTML = proHtml();
  }

  // Hoja inferior (misma pinta que la de FINALIZAR). Una sola abierta.
  function hoja(titulo, html) {
    cerrar();
    const root = document.getElementById('ses-root'); if (!root) return false;
    root.insertAdjacentHTML('beforeend', `<div class="ses-sheet" id="ses-hoja" role="dialog" aria-label="${esc(titulo)}" onclick="if(event.target===this)EntrenoNotas.cerrar()"><div class="ses-sheet-p"><b class="ses-sheet-h">${esc(titulo)}</b>${html}</div></div>`);
    return true;
  }
  let editando = null;
  function cerrar() { const h = document.getElementById('ses-hoja'); if (h) h.remove(); editando = null; }

  function listaHtml() {
    const l = notas().slice().sort((a, b) => b.t - a.t);
    if (!l.length) return '';
    return `<div class="eno-ln">${l.map(n => `<div class="eno-li" id="eno-li-${n.id}"><div><small>${esc(n.instId ? nm(n.instId) : (n.exNom || 'General'))} · ${hora(n.t)}</small><p>${esc(n.texto)}</p></div>
      <button type="button" class="pe-lnk" onclick="EntrenoNotas.abrir('${n.instId || ''}','${n.id}')">Editar</button><button type="button" class="pe-lnk" onclick="EntrenoNotas.borrar('${n.id}')">Borrar</button></div>`).join('')}</div>`;
  }

  const api = {
    xbHtml, tagHtml, notaBtnHtml, pideHtml, proHtml, pintar, cerrar,
    // exId: ejercicio al que se liga ('' = general; sin argumento = el que está abierto); noteId: editar esa nota.
    abrir(exId, noteId) {
      if (!ses()) return;
      const n = noteId ? notas().find(x => x.id === noteId) : null;
      let dest = n ? n.instId : (exId !== undefined ? (exId || null) : ([...(typeof _rtnExpandedEx !== 'undefined' ? _rtnExpandedEx : [])][0] || null));
      if (dest && !orden().includes(dest)) dest = null;
      const ops = `<option value="">General (toda la sesión)</option>` + orden().map(id => `<option value="${id}"${id === dest ? ' selected' : ''}>${esc(nm(id))}</option>`).join('');
      if (!hoja(n ? 'Editar nota' : 'Nota rápida', `<select id="eno-n-ex" class="eno-sel" aria-label="Ligada a">${ops}</select>
        <textarea id="eno-n-txt" class="eno-txt" rows="3" maxlength="1000" placeholder="Algo que descubriste, cómo te posicionaste, cómo te sentiste…" aria-label="Texto de la nota">${esc(n ? n.texto : '')}</textarea>
        <div class="pe-det-b"><button type="button" class="pe-btn" onclick="EntrenoNotas.cerrar()">Cerrar</button><button type="button" class="pe-btn pe-pri" onclick="EntrenoNotas.guardar()">Guardar nota</button></div>${listaHtml()}`)) return;
      editando = n ? n.id : null;
      const t = document.getElementById('eno-n-txt'); if (t) t.focus();
    },
    guardar() {
      if (!ses()) return;
      const t = (document.getElementById('eno-n-txt') || {}).value;
      const texto = (t || '').trim();
      if (!texto) { showToast('Escribí la nota'); return; }
      const inst = (document.getElementById('eno-n-ex') || {}).value || null;
      const n = editando ? notas().find(x => x.id === editando) : null;
      if (n) { n.texto = texto.slice(0, 1000); n.instId = inst; delete n.exNom; }
      else notas().push({ id: uid(), t: Date.now(), instId: inst, texto: texto.slice(0, 1000) });
      saveState(); cerrar(); pintar(); showToast('Nota guardada');
    },
    borrar(id) {
      if (!ses()) return;
      ses().notas = notas().filter(n => n.id !== id);
      saveState();
      const li = document.getElementById('eno-li-' + id); if (li) li.remove();
      if (editando === id) editando = null;
      pintar();
    },
    // Ficha "cómo salió" de un ejercicio: intensidad 1-10, concentración 1-10, sensación 1-5. Cada toque guarda; tocar el mismo valor lo quita.
    ficha(id) {
      if (!ses() || !orden().includes(id)) return;
      if (pide === id) { pide = null; const p = document.getElementById('ses-pide'); if (p) p.innerHTML = ''; }
      const m = medDe(id) || {};
      const fila = (k, lbl) => `<div class="eno-ml">${lbl} <b>${m[k] || '—'}</b></div><div class="eno-mg">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => `<button type="button" class="eno-mb${m[k] === v ? ' on' : ''}" aria-pressed="${m[k] === v}" aria-label="${lbl} ${v}" onclick="EntrenoNotas.setMed('${id}','${k}',${v})">${v}</button>`).join('')}</div>`;
      hoja('Cómo salió · ' + nm(id), `${fila('int', 'Intensidad')}${fila('con', 'Concentración')}
        <div class="eno-ml">Sensación (comodidad y técnica) <b>${m.sens ? SENS_LBL[m.sens] : '—'}</b></div>
        <div class="eno-mg eno-m5">${[1, 2, 3, 4, 5].map(v => `<button type="button" class="eno-mb${m.sens === v ? ' on' : ''}" aria-pressed="${m.sens === v}" onclick="EntrenoNotas.setMed('${id}','sens',${v})">${SENS_LBL[v]}</button>`).join('')}</div>
        <div class="pe-det-b"><button type="button" class="pe-btn pe-pri" onclick="EntrenoNotas.cerrar()">Listo</button></div>`);
    },
    setMed(id, k, v) {
      if (!ses()) return;
      if (!ses().exMedidas) ses().exMedidas = {};
      const m = ses().exMedidas[id] || (ses().exMedidas[id] = {});
      if (m[k] === v) delete m[k]; else m[k] = v;
      if (!hayMed(m)) delete ses().exMedidas[id];
      saveState(); api.ficha(id); pintar();
    },
    saltear() { pide = null; const p = document.getElementById('ses-pide'); if (p) p.innerHTML = ''; },
    // Al tildar la última serie de un ejercicio sin medidas: se ofrece cargarlas (tira chica en el dock, no tapa nada).
    alTerminar(id) {
      if (!ses() || hayMed(medDe(id))) return;
      pide = id; const p = document.getElementById('ses-pide'); if (p) p.innerHTML = pideInner();
    },
    pro() {
      if (!ses()) return;
      hoja('Propósito de hoy', `<p class="ses-sheet-s">Qué querés lograr en este entreno. Al terminar te pregunto si se cumplió.</p>
        <input id="eno-p-in" class="eno-sel" type="text" maxlength="500" value="${esc(ses().proposito || '')}" aria-label="Propósito">
        <div class="pe-det-b"><button type="button" class="pe-btn" onclick="EntrenoNotas.cerrar()">Cerrar</button><button type="button" class="pe-btn pe-pri" onclick="EntrenoNotas.proGuardar()">Guardar</button></div>`);
      const i = document.getElementById('eno-p-in'); if (i) i.focus();
    },
    proGuardar() {
      if (!ses()) return;
      const v = ((document.getElementById('eno-p-in') || {}).value || '').trim().slice(0, 500);
      if (v) ses().proposito = v; else delete ses().proposito;
      saveState(); cerrar(); pintar();
    },
    // Al sacar un ejercicio de la sesión sus notas no se pierden: pasan a generales con el nombre.
    alQuitar(id, nombre) {
      if (!ses()) return;
      notas().forEach(n => { if (n.instId === id) { n.instId = null; n.exNom = nombre; } });
      if (ses().exMedidas) delete ses().exMedidas[id];
      if (pide === id) pide = null;
    },
    reset() { pide = null; editando = null; },
    // Hoja de FINALIZAR: si había propósito, se pregunta si se cumplió; si no, se pregunta el propósito como siempre.
    finalHtml() {
      const s = ses(), p = s.proposito, n = nCnt(), nm_ = Object.values(s.exMedidas || {}).filter(hayMed).length;
      const resumen = (n || nm_) ? `<p class="ses-sheet-n eno-fres">${n ? n + (n === 1 ? ' nota' : ' notas') : ''}${n && nm_ ? ' · ' : ''}${nm_ ? nm_ + (nm_ === 1 ? ' ejercicio' : ' ejercicios') + ' con medidas' : ''} en esta sesión</p>` : '';
      if (!p) return `<label class="pe-det-w">Propósito<input id="ses-d-pro" type="text" maxlength="500"></label>${resumen ? `<div class="pe-det-w">${resumen}</div>` : ''}`;
      return `<div class="pe-det-w eno-cump"><span class="eno-cp">Propósito de hoy</span><b>${esc(p)}</b><span class="eno-cp">¿Se cumplió?</span>
        <div class="eno-seg" id="ses-d-cum" role="group" aria-label="¿Se cumplió el propósito?">${[['si', 'Sí'], ['medias', 'A medias'], ['no', 'No']].map(([v, t]) => `<button type="button" class="eno-mb" data-v="${v}" aria-pressed="false" onclick="EntrenoNotas.cump(this)">${t}</button>`).join('')}</div></div>${resumen ? `<div class="pe-det-w">${resumen}</div>` : ''}`;
    },
    cump(btn) {
      const on = btn.classList.contains('on');
      document.querySelectorAll('#ses-d-cum .eno-mb').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
      if (!on) { btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true'); }
    },
    cumpValor() { const b = document.querySelector('#ses-d-cum .eno-mb.on'); return b ? b.dataset.v : null; },
    // Lo que se vuelca a la entrada del historial al terminar (solo para ejercicios que quedaron en la sesión).
    volcar(sess, exMeta) {
      const ids = Object.keys(sess.exSets || {}), out = {};
      const med = {};
      ids.forEach(id => { const m = (sess.exMedidas || {})[id]; if (hayMed(m)) { med[id] = {}; ['int', 'con', 'sens'].forEach(k => { if (m[k]) med[id][k] = m[k]; }); } });
      if (Object.keys(med).length) out.exMedidas = med;
      const ns = (sess.notas || []).filter(n => n && n.texto).map(n => {
        const o = { id: n.id, t: n.t, instId: n.instId && ids.includes(n.instId) ? n.instId : null, texto: n.texto };
        if (!o.instId && n.exNom) o.exNom = n.exNom;
        return o;
      });
      if (ns.length) out.notas = ns;
      // exInfo (libId y nombre por ejercicio) solo cuando hace falta: hay notas/medidas, o el ejercicio no es de la rutina (reemplazado/agregado). Si no, la entrada queda con el formato de siempre.
      const rt = (S.routines || []).find(r => r.id === sess.routineId), enRutina = id => !!(rt && rt.exercises.some(x => x.id === id));
      const info = {}, todos = !!(out.exMedidas || out.notas);
      ids.forEach(id => { const libId = exMeta && exMeta[id] && exMeta[id].libId; if (libId && (todos || !enRutina(id))) info[id] = { libId, n: (exLibById(libId) || {}).name || 'Ejercicio' }; });
      if (Object.keys(info).length) out.exInfo = info;
      return out;
    },
  };
  return api;
})();
window.EntrenoNotas = EntrenoNotas;

// ── Pestaña Historial ──
const EntrenoHist = (() => {
  const esc = esc_eh;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const coma = n => String(n).replace('.', ',');
  const PAGINA = 20;

  // Estado de la vista (no se guarda en S)
  let fRut = '', fEj = '', q = '', detalle = null, limite = PAGINA;

  const rutinaDe = rid => (S.routines || []).find(r => r.id === rid) || null;
  // Todas las sesiones, la más reciente primero (misma fecha: la cargada después arriba).
  function entradas() {
    const out = [];
    Object.entries(S.routineLog || {}).forEach(([rid, h]) => (h || []).forEach((e, i) => { if (e && e.date) out.push({ rid, e, i }); }));
    return out.sort((a, b) => b.e.date.localeCompare(a.e.date) || b.i - a.i);
  }
  // Ejercicios de una sesión: nombre y biblioteca salen de exInfo (sesiones nuevas) o de la rutina (viejas).
  function ejerciciosDe(rid, e) {
    const rt = rutinaDe(rid);
    return Object.keys(e.exSets || {}).map(id => {
      let libId = null, nombre = 'Ejercicio';
      const inf = e.exInfo && e.exInfo[id];
      if (inf) { libId = inf.libId; nombre = (exLibById(libId) || {}).name || inf.n || nombre; }
      else { const ex = rt && rt.exercises.find(x => x.id === id); if (ex) { const d = exDisplay(ex); libId = d.libId; nombre = d.name; } }
      const sets = (e.exSets[id] || []).filter(s => (s.reps || 0) > 0);
      const med = e.exMedidas && e.exMedidas[id] || null;
      const nts = (e.notas || []).filter(n => n.instId === id);
      return { id, libId, nombre, sets, med, notas: nts };
    }).filter(x => x.sets.length || x.med || x.notas.length);
  }
  const notasGenerales = e => (e.notas || []).filter(n => !n.instId);
  const fmtFecha = f => { const d = new Date(f + 'T12:00:00'); return isNaN(d) ? f : d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', ''); };
  const fmtVol = v => v >= 1000 ? coma((v / 1000).toFixed(1)) + ' t' : (v || 0) + ' kg';
  const mins = e => (e.duration > 0 && e.duration <= 8 * 3600) ? Math.max(1, Math.round(e.duration / 60)) : null;   // una sesión que quedó abierta horas no tiene duración real
  const medTxt = m => m ? [m.int ? 'Intensidad ' + m.int : '', m.con ? 'Concentración ' + m.con : '', m.sens ? 'Sensación: ' + SENS_LBL[m.sens] : ''].filter(Boolean).join(' · ') : '';
  const setTxt = s => (s.weight > 0 ? coma(s.weight) + '×' + s.reps : s.reps + ' reps');
  const cumpHtml = e => e.cumplido ? `<span class="eh-cp eh-cp-${e.cumplido}">${CUMP_LBL[e.cumplido] || ''}</span>` : '';

  function filtradas() {
    const nq = norm(q.trim());
    return entradas().filter(({ rid, e }) => {
      if (fRut && rid !== fRut) return false;
      const exs = ejerciciosDe(rid, e);
      if (fEj && !exs.some(x => x.libId === fEj)) return false;
      if (nq) {
        const hay = (e.notas || []).some(n => norm(n.texto).includes(nq)) || norm(e.proposito).includes(nq);
        if (!hay) return false;
      }
      return true;
    });
  }
  function opcionesEj() {
    const m = new Map();
    entradas().forEach(({ rid, e }) => ejerciciosDe(rid, e).forEach(x => { if (x.libId && !m.has(x.libId)) m.set(x.libId, x.nombre); }));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }

  function tarjeta({ rid, e }) {
    const rt = rutinaDe(rid), exs = ejerciciosDe(rid, e), nq = norm(q.trim());
    const nNotas = (e.notas || []).length, nMed = Object.keys(e.exMedidas || {}).length;
    const meta = [mins(e) ? mins(e) + ' min' : '', e.sets ? e.sets + ' series' : '', e.vol ? fmtVol(e.vol) : '', e.intensidad ? 'Intensidad ' + e.intensidad : '', e.concentracion ? 'Concentración ' + e.concentracion : ''].filter(Boolean).join(' · ');
    let extra = '';
    if (nq) extra += (e.notas || []).filter(n => norm(n.texto).includes(nq)).slice(0, 2).map(n => { const x = n.instId && exs.find(y => y.id === n.instId); return `<p class="eh-sn"><small>${esc(x ? x.nombre : (n.exNom || 'General'))}</small>${esc(n.texto)}</p>`; }).join('');
    if (fEj) exs.filter(x => x.libId === fEj).forEach(x => { const t = medTxt(x.med); extra += (t ? `<p class="eh-sn"><small>${esc(x.nombre)}</small>${esc(t)}</p>` : '') + x.notas.slice(0, 2).map(n => `<p class="eh-sn">${esc(n.texto)}</p>`).join(''); });
    return `<button type="button" class="eh-card" data-rid="${esc(rid)}" data-id="${esc(e.id)}" onclick="EntrenoHist.abrir('${rid}','${e.id}')">
      <div class="eh-top"><b>${esc(rt ? (rt.icon || '🏋️') + ' ' + rt.name : '(rutina borrada)')}</b><span class="eh-fecha">${esc(fmtFecha(e.date))}</span></div>
      ${meta ? `<div class="eh-meta">${esc(meta)}</div>` : ''}
      ${e.proposito ? `<p class="eh-pro"><small>Propósito</small>${esc(e.proposito)} ${cumpHtml(e)}</p>` : ''}${extra}
      ${(nNotas || nMed) ? `<div class="eh-tags">${nNotas ? `<span>${nNotas} ${nNotas === 1 ? 'nota' : 'notas'}</span>` : ''}${nMed ? `<span>${nMed} ${nMed === 1 ? 'ejercicio' : 'ejercicios'} con medidas</span>` : ''}</div>` : ''}</button>`;
  }
  function listaHtml() {
    const l = filtradas();
    if (!entradas().length) return '<p class="prg-vacio">Todavía no hay entrenos guardados. Cuando termines una sesión aparece acá.</p>';
    if (!l.length) return '<p class="prg-vacio">No hay entrenos con ese filtro.</p>';
    return `<p class="eh-cuenta">${l.length} ${l.length === 1 ? 'entreno' : 'entrenos'}</p>` + l.slice(0, limite).map(tarjeta).join('') +
      (l.length > limite ? `<button type="button" class="prg-lnk" onclick="EntrenoHist.mas()">Ver más (${l.length - limite})</button>` : '');
  }

  function detalleHtml() {
    const it = ((S.routineLog || {})[detalle.rid] || []).find(x => x.id === detalle.id);
    if (!it) { detalle = null; return null; }
    const e = it, rt = rutinaDe(detalle.rid), exs = ejerciciosDe(detalle.rid, e), gen = notasGenerales(e);
    const meta = [mins(e) ? mins(e) + ' min' : '', e.sets ? e.sets + ' series' : '', e.vol ? fmtVol(e.vol) : ''].filter(Boolean).join(' · ');
    const gens = [e.intensidad ? `<div><span>Intensidad</span><b>${e.intensidad}</b></div>` : '', e.concentracion ? `<div><span>Concentración</span><b>${e.concentracion}</b></div>` : ''].join('');
    const exH = exs.map(x => `<section class="prg-card eh-ex"><div class="eh-exh"><b>${esc(x.nombre)}</b>${x.libId ? `<button type="button" class="pe-lnk" onclick="openExHistByLib('${esc(x.libId)}')">Evolución</button>` : ''}</div>
      ${x.sets.length ? `<div class="eh-sets">${x.sets.map(s => `<span>${esc(setTxt(s))}</span>`).join('')}</div>` : ''}
      ${x.med ? `<div class="eh-med">${x.med.int ? `<span>Intensidad <b>${x.med.int}</b></span>` : ''}${x.med.con ? `<span>Concentración <b>${x.med.con}</b></span>` : ''}${x.med.sens ? `<span>Sensación <b>${SENS_LBL[x.med.sens]}</b></span>` : ''}</div>` : ''}
      ${x.notas.map(n => `<p class="eh-nt">${esc(n.texto)}</p>`).join('')}</section>`).join('');
    return `<div class="pe-h2"><button type="button" class="pe-btn" onclick="EntrenoHist.volver()">← Historial</button></div>
      <section class="prg-card eh-det" id="eh-detalle"><div class="eh-top"><b class="eh-t">${esc(rt ? (rt.icon || '🏋️') + ' ' + rt.name : '(rutina borrada)')}</b><span class="eh-fecha">${esc(fmtFecha(e.date))}</span></div>
        ${meta ? `<div class="eh-meta">${esc(meta)}</div>` : ''}
        ${gens ? `<div class="eh-gen">${gens}</div>` : ''}
        ${e.proposito ? `<p class="eh-pro"><small>Propósito${e.propositoPrevio ? '' : ' (al terminar)'}</small>${esc(e.proposito)} ${cumpHtml(e)}</p>` : ''}</section>
      ${gen.length ? `<section class="prg-card"><span class="prg-h">Notas generales</span>${gen.map(n => `<p class="eh-nt">${n.exNom ? `<small>${esc(n.exNom)}</small>` : ''}${esc(n.texto)}</p>`).join('')}</section>` : ''}
      ${exH || '<p class="prg-vacio">Esta sesión no tiene ejercicios registrados.</p>'}`;
  }

  function html() {
    if (detalle) { const d = detalleHtml(); if (d) return d; }
    const rutinas = Object.keys(S.routineLog || {}).filter(rid => (S.routineLog[rid] || []).length).map(rid => [rid, rutinaDe(rid)]);
    const chipR = (v, t) => `<button type="button" class="prg-chip${fRut === v ? ' on' : ''}" aria-pressed="${fRut === v}" onclick="EntrenoHist.setR('${v}')">${t}</button>`;
    const ej = opcionesEj();
    return `<div class="pe-h2">Historial</div>
      <input class="prg-srch" id="eh-q" type="search" placeholder="Buscar en notas y propósitos" value="${esc(q)}" aria-label="Buscar en notas y propósitos" autocomplete="off" oninput="EntrenoHist.buscar(this.value)">
      <div class="prg-flbl">Rutina</div><div class="prg-chips">${chipR('', 'Todas')}${rutinas.map(([rid, r]) => chipR(rid, esc(r ? r.name : '(borrada)'))).join('')}</div>
      <div class="prg-flbl">Ejercicio</div>
      <select class="eno-sel eh-sel" id="eh-ej" aria-label="Filtrar por ejercicio" onchange="EntrenoHist.setE(this.value)"><option value="">Todos los ejercicios</option>${ej.map(([id, n]) => `<option value="${esc(id)}"${fEj === id ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <div id="eh-lista">${listaHtml()}</div>`;
  }

  // Sesiones donde estuvo un ejercicio de la biblioteca, con sus medidas y notas (para el historial por ejercicio).
  function deEjercicio(libId) {
    const out = [];
    entradas().forEach(({ rid, e }) => ejerciciosDe(rid, e).forEach(x => { if (x.libId === libId && (x.med || x.notas.length)) out.push({ rid, e, med: x.med, notas: x.notas }); }));
    return out;
  }
  function bloqueEjercicio(libId) {
    const l = deEjercicio(libId);
    if (!l.length) return '';
    return `<div class="eh-bl"><div class="ex-hud-chart-title">◈ SENSACIONES Y NOTAS</div>${l.slice(0, 12).map(x => `<button type="button" class="eh-row" onclick="EntrenoHist.irA('${x.rid}','${x.e.id}')"><small>${esc(fmtFecha(x.e.date))}</small>${x.med ? `<span>${esc(medTxt(x.med))}</span>` : ''}${x.notas.map(n => `<p>${esc(n.texto)}</p>`).join('')}</button>`).join('')}</div>`;
  }

  const lista = () => { const l = document.getElementById('eh-lista'); if (l) l.innerHTML = listaHtml(); };
  return {
    html, bloqueEjercicio, deEjercicio,
    entrar() { detalle = null; limite = PAGINA; },
    setR(v) { fRut = v; limite = PAGINA; renderRutinas(); },
    setE(v) { fEj = v; limite = PAGINA; lista(); },
    buscar(v) { q = v; limite = PAGINA; lista(); },
    mas() { limite += PAGINA; lista(); },
    abrir(rid, id) { detalle = { rid, id }; renderRutinas(); const m = document.querySelector('#rutinas-wrap .pe-main'); if (m) m.scrollIntoView({ block: 'start' }); },
    volver() { detalle = null; renderRutinas(); },
    // Desde otra pantalla (historial de un ejercicio): abre esa sesión en la pestaña Historial.
    irA(rid, id) { if (typeof closeModal === 'function') closeModal('modal-ex-hist'); if (window.openGymOverlay) openGymOverlay(); setEntTab('historial'); EntrenoHist.abrir(rid, id); },
  };
})();
window.EntrenoHist = EntrenoHist;
