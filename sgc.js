// ════════════════════════════════════════════════════════
// SGC — Sistema de Gestión de Calidad
// Métricas de desempeño sobre 3 procesos: inversiones (precisión de
// proyecciones), estudio (retención a 7 días) y entrenamiento
// (progresión mensual de peso, sobre el log del gym existente).
// Datos en S.sgc (clave aislada del estado; no toca el sync).
// ════════════════════════════════════════════════════════
const SGC = (() => {

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const hoy = () => (typeof getActiveDate === 'function' ? getActiveDate() : new Date().toISOString().slice(0, 10));
  const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const addMeses = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
  const diasEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  const fmtF = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—';

  const STD = { inv: 85, est: 85, gym: 5 };   // estándares del SGC
  const WARN = { inv: 80, est: 80, gym: 4 };  // umbral ⚠️

  function ensureState() {
    if (!S.sgc) S.sgc = { proyecciones: [], estudio: [] };
    if (!Array.isArray(S.sgc.proyecciones)) S.sgc.proyecciones = [];
    if (!Array.isArray(S.sgc.estudio)) S.sgc.estudio = [];
  }

  const badge = (val, std, warn) => val == null ? '<span class="text-ter">—</span>'
    : val >= std ? '✅' : val >= warn ? '⚠️' : '❌';

  // ── Cartera (precios reales para auto-resolver proyecciones) ──
  let _cartera = null, _carteraP = null;
  function fetchCartera() {
    if (_carteraP) return _carteraP;
    _carteraP = fetch('data/cartera/latest.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(d => { _cartera = d; return d; })
      .catch(() => null);
    return _carteraP;
  }
  function precioCartera(simbolo) {
    const c = (_cartera?.cedears || []).find(x => (x.simbolo || '').toUpperCase() === simbolo.toUpperCase());
    return c ? { precio: c.precio, mes: _cartera.mes } : null;
  }

  // ══════════ MÉTRICAS ══════════

  // proyección porcentual: varProy (%) vs variación real desde precioBase.
  // precisión = 100 - error RELATIVO a la proyección (proy 5% / real 4% → 20% error → 80%).
  // Soporta legacy (precioProy absoluto, error relativo al precio real).
  const varRealDe = p => (p.precioReal - p.precioBase) / p.precioBase * 100;
  const precisionDe = p => {
    if (p.varProy != null) {
      const err = Math.abs(p.varProy - varRealDe(p));
      if (p.varProy === 0) return err < 0.05 ? 100 : 0;   // proyección plana: evita /0
      return Math.max(0, 100 - err / Math.abs(p.varProy) * 100);
    }
    return Math.max(0, 100 - Math.abs(p.precioProy - p.precioReal) / p.precioReal * 100);
  };
  const fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

  function resolverProyecciones() {
    // proyecciones vencidas sin precio real → intentar resolver con el JSON del agente IOL
    let cambio = false;
    (S.sgc.proyecciones || []).forEach(p => {
      if (p.precioReal == null && hoy() >= p.fechaVence) {
        const c = precioCartera(p.simbolo);
        if (c) { p.precioReal = c.precio; p.fuente = 'IOL ' + c.mes; cambio = true; }
      }
    });
    if (cambio) saveState();
  }

  function metricInv() {
    const yr = hoy().slice(0, 4);
    const res = (S.sgc.proyecciones || []).filter(p => p.precioReal != null && p.fechaVence.slice(0, 4) === yr);
    const val = res.length ? res.reduce((a, p) => a + precisionDe(p), 0) / res.length : null;
    return { val, n: res.length, resueltas: res };
  }

  function metricEst() {
    const desde = addDias(hoy(), -28);
    const ses = (S.sgc.estudio || []).filter(s => s.retencion != null && s.fecha >= desde);
    const val = ses.length ? ses.reduce((a, s) => a + s.retencion, 0) / ses.length : null;
    // temas débiles: promedio por tema < estándar
    const porTema = {};
    ses.forEach(s => { (porTema[s.tema] = porTema[s.tema] || []).push(s.retencion); });
    const debiles = Object.entries(porTema)
      .map(([t, arr]) => [t, arr.reduce((a, b) => a + b, 0) / arr.length])
      .filter(([, v]) => v < STD.est).sort((a, b) => a[1] - b[1]);
    const pendientes = (S.sgc.estudio || []).filter(s => s.retencion == null && hoy() >= addDias(s.fecha, 7));
    return { val, n: ses.length, debiles, pendientes };
  }

  function volMes(mes) {
    // { exId: volumen total (Σ peso×reps) } para un 'YYYY-MM' sobre S.routineLog
    const out = {};
    Object.values(S.routineLog || {}).forEach(hist => (hist || []).forEach(e => {
      if (!e.date || e.date.slice(0, 7) !== mes || !e.exSets) return;
      Object.entries(e.exSets).forEach(([exId, sets]) => (sets || []).forEach(s => {
        out[exId] = (out[exId] || 0) + (s.weight || 0) * (s.reps || 0);
      }));
    }));
    return out;
  }

  function metricGym() {
    const mesAct = hoy().slice(0, 7);
    const mesAnt = addMeses(hoy().slice(0, 8) + '01', -1).slice(0, 7);
    const act = volMes(mesAct), ant = volMes(mesAnt);
    const nombres = {};
    (S.routines || []).forEach(r => (r.exercises || []).forEach(ex => { nombres[ex.id] = ex.name; }));
    const items = Object.keys(ant).filter(id => act[id] != null && ant[id] > 0)
      .map(id => ({ id, nombre: nombres[id] || id, ant: ant[id], act: act[id], prog: (act[id] - ant[id]) / ant[id] * 100 }))
      .sort((a, b) => a.prog - b.prog);
    // valor global: volumen total del mes vs mes anterior (no promedio por ejercicio)
    const totAnt = Object.values(ant).reduce((a, b) => a + b, 0);
    const totAct = Object.keys(ant).reduce((a, id) => a + (act[id] || 0), 0);
    const val = totAnt > 0 ? (totAct - totAnt) / totAnt * 100 : null;
    return { val, items, mesAct, mesAnt, totAnt, totAct };
  }

  function tendencia4Sem(items, fechaFn, valFn) {
    // promedio semanal (4 semanas hacia atrás desde hoy); null si sin datos
    const out = [];
    for (let w = 3; w >= 0; w--) {
      const desde = addDias(hoy(), -7 * (w + 1) + 1), hasta = addDias(hoy(), -7 * w);
      const arr = items.filter(x => fechaFn(x) >= desde && fechaFn(x) <= hasta).map(valFn);
      out.push(arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    }
    return out;
  }

  function barras(tend, std) {
    const max = Math.max(std, ...tend.filter(v => v != null), 1);
    return `<div style="display:flex;gap:5px;align-items:flex-end;height:34px;margin:6px 0 2px">` + tend.map((v, i) => {
      const h = v == null ? 3 : Math.max(4, v / max * 34);
      const col = v == null ? 'var(--tt)' : v >= std ? 'var(--ok, #22C55E)' : '#F43F5E';
      return `<div title="Semana -${3 - i}: ${v == null ? 'sin datos' : v.toFixed(1)}" style="flex:1;height:${h}px;border-radius:2px;background:${col};opacity:${v == null ? .25 : .8}"></div>`;
    }).join('') + `</div><div style="font-size:8px;color:var(--tt);letter-spacing:.08em">TENDENCIA 4 SEMANAS · línea de estándar ${std}${std === STD.gym ? '%' : '%'}</div>`;
  }

  // ══════════ INFORME EN CARDS DE ANÁLISIS ══════════

  function bloque(titulo, m, std, warn, unidad, alerta, extra, csvKey) {
    const semana = `Semana del ${fmtF(addDias(hoy(), -6))} al ${fmtF(hoy())}`;
    const valTxt = m.val == null ? 'Sin datos aún' : (m.val >= 0 && std === STD.gym ? '+' : '') + m.val.toFixed(1) + unidad;
    const alertHtml = (m.val != null && m.val < warn) ? `<div style="font-size:10px;color:#F43F5E;margin-top:4px">🔔 ${alerta}</div>` : '';
    return `<div style="border-top:1px solid rgba(255,255,255,.06);margin-top:10px;padding-top:8px">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <span style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--tt)">🛡️ SGC · ${titulo}</span>
        <span style="font-size:8px;color:var(--tt)">${semana}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
        <span style="font-family:var(--mono);font-size:16px;font-weight:800">${valTxt} <span style="font-size:12px">${badge(m.val, std, warn)}</span></span>
        <span style="font-size:9px;color:var(--tt)">estándar ${std === STD.gym ? '+' + std + '% mensual' : std + '%'}</span>
      </div>
      ${extra || ''}${alertHtml}
      <div style="text-align:right;margin-top:4px"><button class="btn btn-ghost btn-sm" style="font-size:9px;padding:2px 8px" onclick="SGC.exportCSV('${csvKey}')">⬇ CSV</button></div>
    </div>`;
  }

  function renderAnalisis(sec) {
    ensureState();
    const el = document.getElementById('sgc-analisis-' + sec); if (!el) return;
    if (sec === 'finanzas') {
      resolverProyecciones();
      const m = metricInv();
      const pend = (S.sgc.proyecciones || []).filter(p => p.precioReal == null).length;
      const tend = tendencia4Sem(m.resueltas, p => p.fechaVence, precisionDe);
      el.innerHTML = bloque('Precisión de proyecciones (YTD)', m, STD.inv, WARN.inv, '%',
        'Revisar análisis fundamental',
        `${barras(tend, STD.inv)}<div style="font-size:10px;color:var(--tt);margin-top:3px">${m.n} resueltas · ${pend} pendientes — registro en la <b>Cartera de inversión</b></div>`, 'inv');
    }
    if (sec === 'conocimiento') {
      const m = metricEst();
      const tend = tendencia4Sem((S.sgc.estudio || []).filter(s => s.retencion != null), s => s.fecha, s => s.retencion);
      const deb = m.debiles.length ? `<div style="font-size:10px;color:var(--tt);margin-top:3px">Temas débiles: ${m.debiles.slice(0, 3).map(([t, v]) => `<b>${esc(t)}</b> (${v.toFixed(0)}%)`).join(' · ')}</div>` : '';
      el.innerHTML = bloque('Retención de estudio (4 sem.)', m, STD.est, WARN.est, '%',
        'Técnica de estudio menos efectiva' + (m.debiles.length ? ' — días débiles: ' + esc(m.debiles[0][0]) : ''),
        barras(tend, STD.est) + deb + (m.pendientes.length ? `<div style="font-size:10px;color:#FBBF24;margin-top:3px">📝 ${m.pendientes.length} repaso(s) pendiente(s) en la card Sesiones de estudio</div>` : ''), 'est');
    }
    if (sec === 'salud') {
      const m = metricGym();
      const peores = m.items.slice(0, 2).map(x => `<b>${esc(x.nombre)}</b> ${fmtPct(x.prog)}`).join(' · ');
      el.innerHTML = bloque(`Progresión de volumen (${m.mesAnt} → ${m.mesAct})`, m, STD.gym, WARN.gym, '%',
        'Revisar descanso/nutrición',
        `<div style="font-size:10px;color:var(--tt);margin-top:3px">${m.items.length
          ? `${(m.totAct / 1000).toFixed(1)}t vs ${(m.totAnt / 1000).toFixed(1)}t · ${m.items.length} ejercicios comparados` + (peores ? ' · rezagados: ' + peores : '')
          : 'Se necesitan registros en dos meses consecutivos'}</div>`, 'gym');
    }
  }

  function renderTodo() { ['finanzas', 'conocimiento', 'salud'].forEach(renderAnalisis); renderEstudioCard(); }

  // ══════════ ESTUDIO — registro, repasos y quiz ══════════

  let _estForm = false, _quiz = null, _importForm = false; // _quiz = { id, idx, revelada }

  function renderEstudioCard() {
    ensureState();
    const el = document.getElementById('sgc-estudio-wrap'); if (!el) return;
    const pendientes = (S.sgc.estudio || []).filter(s => s.retencion == null && hoy() >= addDias(s.fecha, 7));
    const ultimas = (S.sgc.estudio || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);
    let inner;
    if (_quiz) inner = quizHtml();
    else if (_estForm) inner = formHtml();
    else if (_importForm) inner = importHtml();
    else inner = `
      ${pendientes.length ? `<div class="est-sec-lbl pend">⚡ Repasos pendientes</div>` +
        pendientes.map(s => `<div class="est-review" onclick="SGC.iniciarQuiz('${s.id}')">
          <div style="min-width:0"><div class="est-review-tema">📝 ${esc(s.tema)}</div>
            <div class="est-review-meta">hace ${diasEntre(s.fecha, hoy())} días · ${s.preguntas.length} preguntas</div></div>
          <span class="est-review-go">Repasar ▸</span></div>`).join('') : ''}
      ${ultimas.length ? `<div class="est-sec-lbl">Últimas sesiones</div>` +
        ultimas.map(s => {
          const right = s.retencion == null
            ? (hoy() >= addDias(s.fecha, 7) ? '<span class="est-ret-pend">repaso listo</span>' : `<span class="est-ret-wait">repaso ${fmtF(addDias(s.fecha, 7))}</span>`)
            : `<span class="est-ret ${s.retencion >= STD.est ? 'ok' : 'bad'}">${s.retencion.toFixed(0)}<span style="font-size:10px">%</span></span>`;
          return `<div class="est-sess">
            <div style="min-width:0"><div class="est-sess-tema">${s.origen === 'dominio' ? '📋 ' : ''}${esc(s.tema)}</div>
              <div class="est-sess-sub">${s.duracionMin}′ · ${fmtF(s.fecha)}</div></div>
            <div style="text-align:right;flex-shrink:0">${right}</div></div>`;
        }).join('')
        : '<div class="empty-state" style="padding:14px 0">Sin sesiones registradas. Registrá la primera con sus preguntas de repaso.</div>'}
      <div class="est-actions">
        <button class="est-btn est-btn-primary" onclick="SGC.abrirForm()">+ Sesión de estudio</button>
        <button class="est-btn est-btn-ghost" onclick="SGC.abrirImport()">📋 Importar de Dominio</button>
      </div>`;
    el.innerHTML = `<div class="card"><div class="card-title">🎓 Sesiones de estudio <span class="est-card-sub">SGC · retención a 7 días</span></div>${inner}</div>`;
  }

  function formHtml() {
    return `
      <input id="sgc-e-tema" class="est-input" placeholder="Tema estudiado (ej: Obligaciones — mora)">
      <input id="sgc-e-dur" class="est-input" type="number" min="5" placeholder="Duración (min)">
      <div class="est-hint">3 a 5 preguntas con respuesta — son tu test de retención del día 7:</div>
      <div id="sgc-e-qs">${[0, 1, 2].map(i => qRow(i)).join('')}</div>
      <button class="est-btn est-btn-ghost" style="flex:none;font-size:11px;padding:7px 13px;margin-top:2px" onclick="SGC.masPregunta()">+ pregunta</button>
      <div class="est-actions">
        <button class="est-btn est-btn-primary" onclick="SGC.guardarSesion()">Guardar sesión</button>
        <button class="est-btn est-btn-ghost" onclick="SGC.cerrarForm()">Cancelar</button>
      </div>`;
  }
  const qRow = i => `<div class="est-qrow">
    <input id="sgc-e-q${i}" class="est-input" style="flex:1.2" placeholder="Pregunta ${i + 1}">
    <input id="sgc-e-a${i}" class="est-input" style="flex:1" placeholder="Respuesta"></div>`;

  let _nQs = 3;
  function masPregunta() { if (_nQs >= 5) return; const c = document.getElementById('sgc-e-qs'); if (c) { c.insertAdjacentHTML('beforeend', qRow(_nQs)); _nQs++; } }
  function abrirForm() { _estForm = true; _nQs = 3; renderEstudioCard(); }
  function cerrarForm() { _estForm = false; renderEstudioCard(); }

  // ── Importar simulacro terminado desde Dominio (puente por clipboard) ──
  function importHtml() {
    return `
      <div class="est-hint">Pegá el JSON copiado en Dominio (botón <b>📋 Copiar para Centro de Mando</b> al terminar un simulacro). La retención ya viene resuelta por el SRS de Dominio.</div>
      <textarea id="sgc-imp-json" class="est-input" rows="4" style="font-family:var(--mono);resize:vertical" placeholder='{"origen":"dominio","tema":"...","retencion":85,...}'></textarea>
      <div class="est-actions">
        <button class="est-btn est-btn-primary" onclick="SGC.importarDominio()">Importar</button>
        <button class="est-btn est-btn-ghost" onclick="SGC.cerrarImport()">Cancelar</button>
      </div>`;
  }
  function abrirImport() { _importForm = true; renderEstudioCard(); }
  function cerrarImport() { _importForm = false; renderEstudioCard(); }

  function importarDominio() {
    const notify = m => (typeof showToast === 'function' ? showToast(m) : alert(m));
    const el = document.getElementById('sgc-imp-json');
    const raw = el ? el.value.trim() : '';
    if (!raw) { notify('Pegá el JSON de Dominio'); return; }
    let d;
    try { d = JSON.parse(raw); } catch (e) { notify('JSON inválido — copialo completo desde Dominio'); return; }
    const rNum = Number(d && d.retencion);
    if (!d || d.origen !== 'dominio' || typeof d.tema !== 'string' || !d.tema.trim()
        || !Number.isFinite(rNum) || rNum < 0 || rNum > 100
        || !d.fecha || isNaN(new Date(d.fecha).getTime())) {
      notify('JSON de Dominio inválido — revisá que sea el que copió el simulacro'); return;
    }
    const fecha = new Date(d.fecha).toISOString().slice(0, 10);       // 'YYYY-MM-DD', como el resto de S.sgc.estudio
    const dur = Math.max(1, parseInt(d.duracion, 10) || 1);
    ensureState();
    // Entrada compatible con metricEst: retención YA resuelta → nunca cae en "pendientes" (retencion == null + 7 días).
    const mk = (tema, duracionMin, retencion) => ({
      id: uid(), tema, duracionMin, fecha, preguntas: [],
      retencion: Math.max(0, Math.min(100, retencion)), repasadoEl: fecha, origen: 'dominio'
    });
    // Decisión: por UNIDAD (temas[]) cuando existe — la métrica de "temas débiles" se vuelve accionable a nivel unidad.
    const temas = Array.isArray(d.temas)
      ? d.temas.filter(t => t && typeof t.tema === 'string' && t.tema.trim() && Number.isFinite(Number(t.retencion)))
      : [];
    if (temas.length) {
      const durU = Math.max(1, Math.round(dur / temas.length));
      temas.forEach(t => S.sgc.estudio.push(mk(d.tema.trim() + ' — ' + t.tema.trim(), durU, Number(t.retencion))));
    } else {
      S.sgc.estudio.push(mk(d.tema.trim(), dur, rNum));
    }
    saveState();
    _importForm = false;
    notify(`📋 Importado de Dominio: ${d.tema.trim()} (${rNum.toFixed(0)}%)`);
    renderEstudioCard(); renderAnalisis('conocimiento');
  }

  function guardarSesion() {
    const v = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
    const tema = v('sgc-e-tema'), dur = parseInt(v('sgc-e-dur'), 10);
    const preguntas = [];
    for (let i = 0; i < _nQs; i++) { const q = v('sgc-e-q' + i), a = v('sgc-e-a' + i); if (q && a) preguntas.push({ q, a, ok: null }); }
    if (!tema) { showToast('Escribí el tema estudiado'); return; }
    if (!dur) { showToast('Cargá la duración en minutos'); return; }
    if (preguntas.length < 3) { showToast('Cargá al menos 3 preguntas con respuesta'); return; }
    ensureState();
    S.sgc.estudio.push({ id: uid(), tema, duracionMin: dur, fecha: hoy(), preguntas, retencion: null, repasadoEl: null });
    // marca el hábito de estudio del día (mismo patrón que el gym)
    const h = (S.habitTrackers?.conocimiento || []).find(x => x.id === 'habit-estudio');
    if (h) { h.days[hoy()] = 'done'; if (typeof _habitActiveId !== 'undefined') _habitActiveId['conocimiento'] = 'habit-estudio'; }
    saveState();
    if (typeof renderHabitsCard === 'function') try { renderHabitsCard('conocimiento'); } catch (e) {}
    _estForm = false;
    showToast('🎓 Sesión guardada — repaso el ' + fmtF(addDias(hoy(), 7)));
    renderEstudioCard(); renderAnalisis('conocimiento');
  }

  // ── Quiz de repaso (día 7) ──
  function iniciarQuiz(id) { _quiz = { id, idx: 0, revelada: false }; renderEstudioCard(); }
  function quizHtml() {
    const s = S.sgc.estudio.find(x => x.id === _quiz.id); if (!s) { _quiz = null; return ''; }
    const p = s.preguntas[_quiz.idx];
    const dots = s.preguntas.map((_, i) => `<span class="est-quiz-dot ${i === _quiz.idx ? 'active' : i < _quiz.idx ? 'done' : ''}"></span>`).join('');
    return `<div class="est-quiz">
      <div class="est-quiz-tag">⚡ Repaso · ${esc(s.tema)} · ${_quiz.idx + 1}/${s.preguntas.length}</div>
      <div class="est-quiz-prog">${dots}</div>
      <div class="est-quiz-q">${esc(p.q)}</div>
      ${_quiz.revelada
        ? `<div class="est-quiz-a">${esc(p.a)}</div>
           <div class="est-quiz-actions">
             <button class="est-q-ok" onclick="SGC.respuestaQuiz(true)">✔ La recordé</button>
             <button class="est-q-bad" onclick="SGC.respuestaQuiz(false)">✘ No la recordé</button></div>`
        : `<button class="est-btn est-btn-primary" style="width:100%" onclick="SGC.revelarQuiz()">Ver respuesta</button>`}
      <div class="est-quiz-exit"><button class="est-btn est-btn-ghost" style="flex:none;font-size:10px;padding:6px 13px" onclick="SGC.salirQuiz()">Salir (retomar después)</button></div>
    </div>`;
  }
  function revelarQuiz() { _quiz.revelada = true; renderEstudioCard(); }
  function salirQuiz() { _quiz = null; renderEstudioCard(); }
  function respuestaQuiz(ok) {
    const s = S.sgc.estudio.find(x => x.id === _quiz.id); if (!s) { _quiz = null; renderEstudioCard(); return; }
    s.preguntas[_quiz.idx].ok = ok;
    if (_quiz.idx + 1 < s.preguntas.length) { _quiz.idx++; _quiz.revelada = false; renderEstudioCard(); return; }
    // fin del quiz → calcular retención
    const okN = s.preguntas.filter(p => p.ok).length;
    s.retencion = okN / s.preguntas.length * 100;
    s.repasadoEl = hoy();
    saveState(); _quiz = null;
    showToast(`📝 Retención de "${s.tema}": ${s.retencion.toFixed(0)}% ${s.retencion >= STD.est ? '✅' : '— a reforzar'}`, 4000);
    renderEstudioCard(); renderAnalisis('conocimiento');
  }

  // ══════════ PROYECCIONES — overlay de cartera ══════════

  function renderProyecciones(el, carteraData) {
    ensureState();
    if (!el) return;
    if (carteraData) _cartera = carteraData;
    resolverProyecciones();
    const pend = (S.sgc.proyecciones || []).filter(p => p.precioReal == null).sort((a, b) => a.fechaVence.localeCompare(b.fechaVence));
    const res = (S.sgc.proyecciones || []).filter(p => p.precioReal != null).sort((a, b) => b.fechaVence.localeCompare(a.fechaVence));
    const m = metricInv();
    const inp = 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:6px 8px;font-size:12px;color:inherit';
    const activos = (_cartera?.cedears || []).slice().sort((a, b) => (a.simbolo || '').localeCompare(b.simbolo || ''));

    const proyTxt = p => p.varProy != null ? fmtPct(p.varProy) : '$' + (p.precioProy || 0).toLocaleString('es-AR');
    const realTxt = p => p.varProy != null ? fmtPct(varRealDe(p)) : '$' + (p.precioReal || 0).toLocaleString('es-AR');

    const filaPend = p => {
      const vencida = hoy() >= p.fechaVence;
      return `<div class="ci-row" style="grid-template-columns:1fr .9fr 1fr 1.3fr">
        <span><b>${esc(p.simbolo)}</b></span>
        <span class="${p.varProy >= 0 ? 'text-ok' : 'text-danger'}" style="font-weight:700">${proyTxt(p)}</span>
        <span style="font-size:11.5px;color:var(--text-ter,#8b93a7)">${fmtF(p.fechaCreada)} → ${fmtF(p.fechaVence)}</span>
        <span style="text-align:right">${vencida
          ? `<input id="sgc-pr-${p.id}" type="number" step="any" placeholder="precio real $" style="${inp};width:100px"> <button class="btn btn-ghost btn-sm" onclick="SGC.cargarReal('${p.id}')">✓</button>`
          : `<span style="font-size:11px;color:var(--text-ter,#8b93a7)">en ${diasEntre(hoy(), p.fechaVence)} días</span>`}
          <button class="btn btn-ghost btn-sm" style="opacity:.6" onclick="SGC.borrarProyeccion('${p.id}')">🗑</button></span>
      </div>`;
    };

    const filaHist = p => { const prec = precisionDe(p); return `<div class="ci-row" style="grid-template-columns:1fr .9fr .9fr .9fr .6fr">
      <span><b>${esc(p.simbolo)}</b> <span style="font-size:10px;color:var(--text-ter,#8b93a7)">${fmtF(p.fechaVence)}</span></span>
      <span>${proyTxt(p)}</span>
      <span>${realTxt(p)}</span>
      <span style="font-size:11px;color:var(--text-ter,#8b93a7)">${esc(p.fuente || 'manual')}</span>
      <span class="ci-est ${prec >= STD.inv ? 'text-ok' : 'text-danger'}">${prec.toFixed(1)}%</span>
    </div>`; };

    el.innerHTML = `
      <div class="ci-sub" style="margin-top:16px">🎯 Mis proyecciones (SGC)</div>
      <div class="ci-kpis" style="grid-template-columns:repeat(3,1fr)">
        <div class="ci-kpi"><div class="ci-kpi-num ${m.val == null ? '' : m.val >= STD.inv ? 'text-ok' : 'text-danger'}">${m.val == null ? '—' : m.val.toFixed(1) + '%'} ${badge(m.val, STD.inv, WARN.inv)}</div><div class="ci-kpi-lbl">Precisión YTD · estándar 85%</div></div>
        <div class="ci-kpi"><div class="ci-kpi-num">${res.length}</div><div class="ci-kpi-lbl">Resueltas</div></div>
        <div class="ci-kpi"><div class="ci-kpi-num">${pend.length}</div><div class="ci-kpi-lbl">Pendientes</div></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:12px 0">
        ${activos.length
          ? `<select id="sgc-p-sim" style="${inp};min-width:110px">${activos.map(a => `<option value="${esc(a.simbolo)}" data-precio="${a.precio}">${esc(a.simbolo)} · $${(a.precio || 0).toLocaleString('es-AR')}</option>`).join('')}</select>`
          : `<span style="font-size:11px;color:var(--text-ter,#8b93a7)">Sin datos de cartera para elegir activo (reabrí el overlay con conexión)</span>`}
        <input id="sgc-p-var" type="number" step="any" placeholder="Variación proyectada %" style="${inp};width:160px">
        <select id="sgc-p-hor" style="${inp}"><option value="1">1 mes</option><option value="3" selected>3 meses</option><option value="6">6 meses</option></select>
        <button class="btn btn-sm" onclick="SGC.guardarProyeccion()" ${activos.length ? '' : 'disabled'}>+ Proyectar</button>
      </div>
      <div class="ci-hdr ci-row" style="grid-template-columns:1fr .9fr 1fr 1.3fr"><span>Activo</span><span>Proyección</span><span>Período</span><span style="text-align:right">Estado</span></div>
      ${pend.length ? pend.map(filaPend).join('') : '<div style="font-size:12px;color:var(--text-ter,#8b93a7);padding:6px 2px">Sin proyecciones pendientes — cargá la primera arriba.</div>'}
      ${res.length ? `
        <div class="ci-sub">Historial (${res.length})</div>
        <div class="ci-hdr ci-row" style="grid-template-columns:1fr .9fr .9fr .9fr .6fr"><span>Activo</span><span>Proyectado</span><span>Real</span><span>Fuente</span><span style="text-align:right">Precisión</span></div>
        <div style="max-height:220px;overflow-y:auto">${res.map(filaHist).join('')}</div>` : ''}`;
  }

  function guardarProyeccion() {
    const sel = document.getElementById('sgc-p-sim');
    const sim = (sel?.value || '').trim().toUpperCase();
    const precioBase = parseFloat(sel?.selectedOptions?.[0]?.dataset?.precio);
    const varProy = parseFloat(document.getElementById('sgc-p-var')?.value);
    const hor = parseInt(document.getElementById('sgc-p-hor')?.value, 10) || 3;
    if (!sim || !precioBase) { showToast('Elegí un activo de la cartera'); return; }
    if (isNaN(varProy)) { showToast('Cargá la variación proyectada en %'); return; }
    ensureState();
    S.sgc.proyecciones.push({ id: uid(), simbolo: sim, varProy, precioBase, fechaCreada: hoy(), fechaVence: addMeses(hoy(), hor), precioReal: null, fuente: null });
    saveState();
    showToast(`🎯 ${sim} ${fmtPct(varProy)} a ${hor} ${hor === 1 ? 'mes' : 'meses'} — vence ${fmtF(addMeses(hoy(), hor))}`);
    renderProyecciones(document.getElementById('sgc-proyecciones'));
    renderAnalisis('finanzas');
  }

  function cargarReal(id) {
    const p = S.sgc.proyecciones.find(x => x.id === id); if (!p) return;
    const val = parseFloat(document.getElementById('sgc-pr-' + id)?.value);
    if (!val || val <= 0) { showToast('Cargá el precio real'); return; }
    p.precioReal = val; p.fuente = 'manual';
    saveState();
    showToast(`Precisión de ${p.simbolo}: ${precisionDe(p).toFixed(1)}%`);
    renderProyecciones(document.getElementById('sgc-proyecciones'));
    renderAnalisis('finanzas');
  }

  function borrarProyeccion(id) {
    if (!confirm('¿Borrar esta proyección?')) return;
    S.sgc.proyecciones = S.sgc.proyecciones.filter(x => x.id !== id);
    saveState();
    renderProyecciones(document.getElementById('sgc-proyecciones'));
    renderAnalisis('finanzas');
  }

  // ══════════ EXPORT CSV ══════════

  function exportCSV(que) {
    ensureState();
    let rows, nombre;
    if (que === 'inv') {
      nombre = 'sgc-inversiones';
      rows = [['simbolo', 'var_proyectada_pct', 'precio_base', 'precio_real', 'var_real_pct', 'fecha_creada', 'fecha_vence', 'fuente', 'precision_pct'],
        ...S.sgc.proyecciones.map(p => [p.simbolo, p.varProy ?? '', p.precioBase ?? '', p.precioReal ?? '', (p.varProy != null && p.precioReal != null) ? varRealDe(p).toFixed(2) : '', p.fechaCreada, p.fechaVence, p.fuente ?? '', p.precioReal != null ? precisionDe(p).toFixed(2) : ''])];
    } else if (que === 'est') {
      nombre = 'sgc-estudio';
      rows = [['tema', 'duracion_min', 'fecha', 'repasado_el', 'preguntas', 'retencion_pct'],
        ...S.sgc.estudio.map(s => [s.tema, s.duracionMin, s.fecha, s.repasadoEl ?? '', s.preguntas.length, s.retencion != null ? s.retencion.toFixed(0) : ''])];
    } else {
      nombre = 'sgc-entrenamiento';
      const m = metricGym();
      rows = [['ejercicio', 'volumen_' + m.mesAnt, 'volumen_' + m.mesAct, 'progresion_pct'],
        ...m.items.map(x => [x.nombre, x.ant, x.act, x.prog.toFixed(2)])];
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${nombre}-${hoy()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ══════════ INIT ══════════

  function init() {
    // esperar a que loadState() haya poblado S (habitTrackers existe tras las migraciones)
    const t = setInterval(() => {
      if (typeof S === 'object' && S && S.habitTrackers) {
        clearInterval(t);
        ensureState();
        fetchCartera().then(() => { resolverProyecciones(); renderAnalisis('finanzas'); });
        renderTodo();
        // re-render al cambiar de pestaña (app.js re-pinta las cards)
        if (typeof window.switchTab === 'function' && !window._sgcTabHook) {
          window._sgcTabHook = true;
          const orig = window.switchTab;
          window.switchTab = function (tab, btn) { orig(tab, btn); try { renderTodo(); } catch (e) {} };
        }
      }
    }, 400);
  }
  init();

  return { renderAnalisis, renderTodo, renderEstudioCard, renderProyecciones, abrirForm, cerrarForm, abrirImport, cerrarImport, importarDominio, masPregunta, guardarSesion, iniciarQuiz, revelarQuiz, salirQuiz, respuestaQuiz, guardarProyeccion, cargarReal, borrarProyeccion, exportCSV };
})();
window.SGC = SGC;
