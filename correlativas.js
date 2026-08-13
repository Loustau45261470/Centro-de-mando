'use strict';
// ════════════════════════════════════════════════════════════════════════
// CORRELATIVAS — plan de estudio 2019 de Abogacía (UCASAL, campus virtual).
//
// Núcleo de datos + motor de estado. Portado de un dashboard externo: allí el
// estado vivía en `window.storage` (API de artifacts); acá vive en el estado
// sincronizado de la app y NO se duplica:
//   · "aprobada"     → S.lawProgress[..].done  (misma fuente que KPIs, logros,
//                      Game Mode, JARVIS y core-stats — no se migra nada)
//   · "regularizada" → S.carrera.regular[code] (dimensión nueva, no existía)
// La nota sigue en S.lawProgress[..].grade.
//
// SUBJECTS es la transcripción del PDF oficial de correlatividades:
//   reqCursar: [[tipo, código]] con tipo 'Regularizada' | 'Aprobada' | 'Aprobada-OR'
//              ('Aprobada-OR' = grupo de opciones excluyentes: basta una aprobada)
//   reqRendir: [código] — todas deben estar APROBADAS para rendir el final.
// ════════════════════════════════════════════════════════════════════════

const CORR_SUBJECTS = [
  { code:'60-1351', nombre:'DERECHO PRIVADO PARTE GENERAL', anio:1, regimen:'1° Semestre', optativa:'', reqCursar:[], reqRendir:[] },
  { code:'10-550',  nombre:'HISTORIA CONSTITUCIONAL ARGENTINA', anio:1, regimen:'1° Semestre', optativa:'', reqCursar:[], reqRendir:[] },
  { code:'5-100',   nombre:'INTRODUCCIÓN A LA FILOSOFÍA', anio:1, regimen:'1° Semestre', optativa:'', reqCursar:[], reqRendir:[] },
  { code:'60-250',  nombre:'INTRODUCCIÓN AL DERECHO', anio:1, regimen:'1° Semestre', optativa:'', reqCursar:[], reqRendir:[] },
  { code:'60-510',  nombre:'DERECHO POLÍTICO', anio:1, regimen:'2° Semestre', optativa:'', reqCursar:[], reqRendir:[] },
  { code:'60-200',  nombre:'DERECHO ROMANO', anio:1, regimen:'2° Semestre', optativa:'', reqCursar:[], reqRendir:[] },
  { code:'60-4300', nombre:'LÓGICA Y ARGUMENTACIÓN JURÍDICA', anio:1, regimen:'2° Semestre', optativa:'', reqCursar:[['Regularizada','5-100']], reqRendir:['5-100'] },
  { code:'20-100',  nombre:'SOCIOLOGÍA', anio:1, regimen:'2° Semestre', optativa:'', reqCursar:[], reqRendir:[] },

  { code:'60-4320', nombre:'CONSTITUCIÓN, DERECHOS HUMANOS Y GARANTÍAS', anio:2, regimen:'1° Semestre', optativa:'', reqCursar:[['Regularizada','10-550'],['Regularizada','60-510']], reqRendir:['10-550','60-510'] },
  { code:'60-410',  nombre:'DERECHO PENAL PARTE GENERAL', anio:2, regimen:'1° Semestre', optativa:'', reqCursar:[['Regularizada','60-250']], reqRendir:['60-250'] },
  { code:'0-10',    nombre:'TEOLOGÍA I', anio:2, regimen:'1° Semestre', optativa:'', reqCursar:[['Regularizada','60-4300']], reqRendir:['60-4300'] },
  { code:'60-4310', nombre:'TEORÍA GENERAL DE LAS OBLIGACIONES', anio:2, regimen:'1° Semestre', optativa:'', reqCursar:[['Regularizada','60-1351']], reqRendir:['60-1351'] },
  { code:'60-4340', nombre:'DERECHO CONSTITUCIONAL DEL PODER', anio:2, regimen:'2° Semestre', optativa:'', reqCursar:[['Regularizada','60-4320']], reqRendir:['60-4320'] },
  { code:'60-4330', nombre:'DERECHO DE DAÑOS Y RESPONSABILIDAD', anio:2, regimen:'2° Semestre', optativa:'', reqCursar:[['Regularizada','60-1351'],['Regularizada','60-4310']], reqRendir:['60-1351','60-4310'] },
  { code:'45-750',  nombre:'ECONOMÍA POLÍTICA', anio:2, regimen:'2° Semestre', optativa:'', reqCursar:[['Regularizada','60-510']], reqRendir:['60-510'] },
  { code:'9-3000',  nombre:'METODOLOGÍA DE LA INVESTIGACIÓN', anio:2, regimen:'2° Semestre', optativa:'', reqCursar:[['Regularizada','60-250']], reqRendir:['60-250'] },

  { code:'60-4360', nombre:'DERECHO EMPRESARIAL', anio:3, regimen:'1° Semestre', optativa:'', reqCursar:[['Regularizada','45-750'],['Regularizada','60-4310'],['Regularizada','60-4330']], reqRendir:['45-750'] },
  { code:'60-420',  nombre:'DERECHO PENAL PARTE ESPECIAL', anio:3, regimen:'1° Semestre', optativa:'', reqCursar:[['Regularizada','60-410'],['Regularizada','60-4320']], reqRendir:['60-410'] },
  { code:'60-811',  nombre:'DERECHO PROCESAL CIVIL I', anio:3, regimen:'1° Semestre', optativa:'', reqCursar:[['Aprobada','60-1351'],['Regularizada','60-4330'],['Regularizada','60-4340']], reqRendir:['60-4310'] },
  { code:'0-20',    nombre:'TEOLOGÍA II', anio:3, regimen:'1° Semestre', optativa:'', reqCursar:[['Regularizada','0-10']], reqRendir:['0-10'] },
  { code:'60-4350', nombre:'TEORÍA GENERAL DE LOS CONTRATOS', anio:3, regimen:'1° Semestre', optativa:'', reqCursar:[['Aprobada','60-1351'],['Aprobada','60-200'],['Regularizada','60-4310'],['Regularizada','60-4330']], reqRendir:['60-4330'] },
  { code:'60-4540', nombre:'CONTRATOS EN PARTICULAR', anio:3, regimen:'2° Semestre', optativa:'', reqCursar:[['Regularizada','60-4330'],['Regularizada','60-4350']], reqRendir:['60-4350'] },
  { code:'60-4380', nombre:'DERECHO AMBIENTAL Y DE LOS RECURSOS NATURALES', anio:3, regimen:'2° Semestre', optativa:'', reqCursar:[['Regularizada','60-4310'],['Regularizada','60-4320']], reqRendir:['60-4310'] },
  { code:'60-4370', nombre:'DERECHO COMERCIAL Y DE LOS USUARIOS Y CONSUMIDORES', anio:3, regimen:'2° Semestre', optativa:'', reqCursar:[['Regularizada','60-4360']], reqRendir:['60-4360'] },
  { code:'60-812',  nombre:'DERECHO PROCESAL CIVIL II', anio:3, regimen:'2° Semestre', optativa:'', reqCursar:[['Regularizada','60-811']], reqRendir:['60-811'] },
  { code:'60-4960', nombre:'ORATORIA JURÍDICA (SEMINARIO ELECTIVO I)', anio:3, regimen:'2° Semestre', optativa:'Optativa excluyente con 60-4970', reqCursar:[['Regularizada','60-1351'],['Regularizada','60-250'],['Regularizada','60-410'],['Regularizada','60-4320'],['Regularizada','60-510']], reqRendir:['60-1351','60-250','60-410','60-4320','60-510'] },
  { code:'60-4970', nombre:'TEORÍA DE LA ARGUMENTACIÓN JURÍDICA Y ANÁLISIS JURISPRUDENCIAL (SEMINARIO ELECTIVO I)', anio:3, regimen:'2° Semestre', optativa:'Optativa excluyente con 60-4960', reqCursar:[['Regularizada','60-1351'],['Regularizada','60-250'],['Regularizada','60-410'],['Regularizada','60-4320'],['Regularizada','60-510']], reqRendir:['60-1351','60-250','60-410','60-4320','60-510'] },

  { code:'60-4390', nombre:'DERECHO ADMINISTRATIVO', anio:4, regimen:'1° Semestre', optativa:'', reqCursar:[['Aprobada','60-4320'],['Regularizada','60-4350']], reqRendir:['60-4320'] },
  { code:'60-821',  nombre:'DERECHO PROCESAL PENAL I', anio:4, regimen:'1° Semestre', optativa:'', reqCursar:[['Aprobada','60-410'],['Aprobada','60-4320'],['Regularizada','60-420'],['Regularizada','60-4340']], reqRendir:['60-410'] },
  { code:'60-4400', nombre:'DERECHOS REALES', anio:4, regimen:'1° Semestre', optativa:'', reqCursar:[['Aprobada','60-4330'],['Regularizada','60-4540']], reqRendir:['60-4330'] },
  { code:'60-4410', nombre:'PRÁCTICA PROFESIONAL I', anio:4, regimen:'1° Semestre', optativa:'', reqCursar:[['Regularizada','60-4540'],['Regularizada','60-812']], reqRendir:['60-4540','60-812'] },
  { code:'60-4440', nombre:'DERECHO INDIVIDUAL Y COLECTIVO DEL TRABAJO Y DE LA SEGURIDAD SOCIAL', anio:4, regimen:'2° Semestre', optativa:'', reqCursar:[['Aprobada','60-4340'],['Regularizada','60-4350']], reqRendir:['60-4340'] },
  { code:'60-4450', nombre:'DERECHO INTERNACIONAL PÚBLICO Y DE LA INTEGRACIÓN', anio:4, regimen:'2° Semestre', optativa:'', reqCursar:[['Aprobada','60-4340'],['Regularizada','60-4380']], reqRendir:['60-4340'] },
  { code:'60-822',  nombre:'DERECHO PROCESAL PENAL II', anio:4, regimen:'2° Semestre', optativa:'', reqCursar:[['Regularizada','60-821']], reqRendir:['60-821'] },
  { code:'60-4430', nombre:'DERECHO SOCIETARIO', anio:4, regimen:'2° Semestre', optativa:'', reqCursar:[['Aprobada','60-4330'],['Regularizada','60-4360']], reqRendir:['60-4360'] },
  { code:'0-100',   nombre:'DOCTRINA SOCIAL DE LA IGLESIA', anio:4, regimen:'2° Semestre', optativa:'', reqCursar:[['Aprobada','0-10'],['Regularizada','0-20']], reqRendir:['0-20'] },
  { code:'60-4530', nombre:'MÉTODOS PARTICIPATIVOS DE RESOLUCIÓN DE CONFLICTOS', anio:4, regimen:'2° Semestre', optativa:'', reqCursar:[['Regularizada','60-4350'],['Regularizada','60-812']], reqRendir:['60-4350'] },

  { code:'60-4420', nombre:'PRÁCTICA PROFESIONAL II', anio:5, regimen:'Anual', optativa:'', reqCursar:[['Aprobada','60-812'],['Regularizada','60-4410']], reqRendir:['60-812','60-4410'] },
  { code:'60-4470', nombre:'DERECHO CONCURSAL', anio:5, regimen:'1° Semestre', optativa:'', reqCursar:[['Aprobada','60-4360'],['Regularizada','60-4430']], reqRendir:['60-4360','60-4430'] },
  { code:'60-4460', nombre:'DERECHO DE FAMILIA', anio:5, regimen:'1° Semestre', optativa:'', reqCursar:[['Aprobada','60-4540'],['Regularizada','60-4400']], reqRendir:['60-4540','60-4400'] },
  { code:'60-4490', nombre:'DERECHO FINANCIERO Y TRIBUTARIO', anio:5, regimen:'1° Semestre', optativa:'', reqCursar:[['Regularizada','60-4390']], reqRendir:['60-4390'] },
  { code:'60-4480', nombre:'DERECHO PÚBLICO PROVINCIAL Y MUNICIPAL', anio:5, regimen:'1° Semestre', optativa:'', reqCursar:[['Aprobada','60-4340'],['Regularizada','60-4390']], reqRendir:['60-4340','60-4390'] },
  { code:'5-300',   nombre:'FILOSOFÍA DEL DERECHO', anio:5, regimen:'1° Semestre', optativa:'', reqCursar:[['Aprobada','5-100'],['Aprobada','60-1351'],['Aprobada','60-250'],['Aprobada','60-4300'],['Aprobada','60-510'],['Regularizada','0-100']], reqRendir:['0-100'] },
  { code:'60-6130', nombre:'DERECHO DE LAS NUEVAS TECNOLOGÍAS (SEMINARIO ELECTIVO II)', anio:5, regimen:'2° Semestre', optativa:'Optativa excluyente con 60-6120 y 60-6140', reqCursar:[['Aprobada','60-4340'],['Aprobada','60-4540'],['Aprobada-OR','60-4960'],['Aprobada-OR','60-4970'],['Aprobada','60-812'],['Regularizada','60-4400'],['Regularizada','60-4440']], reqRendir:['60-4400','60-4440'] },
  { code:'60-550',  nombre:'DERECHO INTERNACIONAL PRIVADO', anio:5, regimen:'2° Semestre', optativa:'', reqCursar:[['Aprobada','60-4340'],['Regularizada','60-4450']], reqRendir:['60-4450'] },
  { code:'60-6120', nombre:'DERECHO PREVISIONAL (SEMINARIO ELECTIVO II)', anio:5, regimen:'2° Semestre', optativa:'Optativa excluyente con 60-6130 y 60-6140', reqCursar:[['Aprobada','60-4340'],['Aprobada','60-4540'],['Aprobada-OR','60-4960'],['Aprobada-OR','60-4970'],['Aprobada','60-812'],['Regularizada','60-4400'],['Regularizada','60-4440']], reqRendir:['60-4400','60-4440'] },
  { code:'60-6140', nombre:'DERECHO REGISTRAL (SEMINARIO ELECTIVO II)', anio:5, regimen:'2° Semestre', optativa:'Optativa excluyente con 60-6120 y 60-6130', reqCursar:[['Aprobada','60-4340'],['Aprobada','60-4540'],['Aprobada-OR','60-4960'],['Aprobada-OR','60-4970'],['Aprobada','60-812'],['Regularizada','60-4400'],['Regularizada','60-4440']], reqRendir:['60-4400','60-4440'] },
  { code:'60-4500', nombre:'DERECHO SUCESORIO', anio:5, regimen:'2° Semestre', optativa:'', reqCursar:[['Aprobada','60-4540'],['Regularizada','60-4460']], reqRendir:['60-4460'] },
  { code:'5-250',   nombre:'ÉTICA PROFESIONAL', anio:5, regimen:'2° Semestre', optativa:'', reqCursar:[['Regularizada','0-100'],['Regularizada','60-4410']], reqRendir:['0-100','60-4410'] },
];

// Puente código de materia → fila de S.lawProgress (yearId/subId), que sigue
// siendo el almacén de `done` (aprobada) y `grade` (nota) de toda la app.
// Las materias sin fila propia (seminarios excluyentes) comparten la fila
// genérica del electivo correspondiente.
const CORR_SUBID = {
  '5-100':'s1_1', '10-550':'s1_2', '60-250':'s1_3', '60-1351':'s1_4', '20-100':'s1_5',
  '60-200':'s1_6', '60-510':'s1_7', '60-4300':'s1_8',
  '0-10':'s2_1', '60-410':'s2_2', '60-4310':'s2_3', '60-4320':'s2_4', '9-3000':'s2_5',
  '45-750':'s2_6', '60-4330':'s2_7', '60-4340':'s2_8',
  '0-20':'s3_1', '60-420':'s3_2', '60-811':'s3_3', '60-4350':'s3_4', '60-4360':'s3_5',
  '60-812':'s3_6', '60-4370':'s3_7', '60-4380':'s3_8', '60-4960':'s3_9', '60-4970':'s3_9',
  '60-4540':'s3_10',
  '60-4390':'s4_1', '60-4400':'s4_2', '60-4410':'s4_3', '0-100':'s4_4', '60-822':'s4_5',
  '60-4430':'s4_6', '60-4440':'s4_7', '60-4450':'s4_8', '60-4530':'s4_9',
  '60-4420':'s5_1', '5-300':'s5_2', '60-4460':'s5_3', '60-4470':'s5_4', '60-4480':'s5_6',
  '60-4490':'s5_7', '5-250':'s5_8', '60-550':'s5_9', '60-4500':'s5_10',
  '60-6130':'s5_11', '60-6120':'s5_11', '60-6140':'s5_11',
};
// Sin fila en lawProgress: 60-821 (Procesal Penal I) — se agrega en ensureCarrera().
// CORR_SUBID no trae esa entrada (dato provisto tal cual); el puente extra vive
// en _EXTRA_SUBID más abajo, sin tocar CORR_SUBID.

const Correlativas = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Puente código→subId que falta en CORR_SUBID (ver comentario arriba).
  const _EXTRA_SUBID = { '60-821': 's4_10' };
  const _SUBID_ALL = Object.assign({}, CORR_SUBID, _EXTRA_SUBID);
  const _BY_CODE = {};
  CORR_SUBJECTS.forEach(s => { _BY_CODE[s.code] = s; });

  const STATUS_META = {
    aprobada:  { badge: '✅ Aprobada',     color: 'var(--ok)' },
    rendir:    { badge: '📝 Podés rendir', color: 'var(--accent)' },
    libre:     { badge: '🆓 Rendir libre', color: 'var(--warn)' },
    cursar:    { badge: '📘 Podés cursar', color: 'var(--c-conocimiento)' },
    cursando:  { badge: '🎓 Cursando',     color: 'var(--ts)' },
    bloqueada: { badge: '🔒 Bloqueada',    color: 'var(--tt)' },
  };
  const ANIOS = [{ v: 'todos', l: 'Todos' }, { v: '1', l: '1°' }, { v: '2', l: '2°' }, { v: '3', l: '3°' }, { v: '4', l: '4°' }, { v: '5', l: '5°' }];
  const ESTADOS = [
    { v: 'todas', l: 'Todas' }, { v: 'cursar', l: 'Puedo cursar' }, { v: 'rendir', l: 'Puedo rendir' },
    { v: 'libre', l: 'Rendir libre' }, { v: 'aprobada', l: 'Aprobadas' }, { v: 'bloqueadas', l: 'Bloqueadas' },
  ];

  let _filtAnio = 'todos';
  let _filtEstado = 'todas';
  let _search = '';

  // ══════════ Estado (fuente única: S.lawProgress[..].done + S.carrera.regular) ══════════
  const _norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();

  function ensureCarrera() {
    if (!S.carrera) S.carrera = {};
    if (!S.carrera.regular) S.carrera.regular = {};
    if (!S.carrera.pick) S.carrera.pick = {};
    const y4 = S.lawProgress && S.lawProgress.years && S.lawProgress.years.find(y => y.id === 'y4');
    if (y4 && !y4.subjects.some(s => _norm(s.name) === 'derecho procesal penal i')) {
      y4.subjects.push({ id: 's4_10', name: 'Derecho procesal penal I', done: false });
    }
  }

  function _row(code) {
    const subId = _SUBID_ALL[code];
    if (!subId || !S.lawProgress || !S.lawProgress.years) return null;
    for (const y of S.lawProgress.years) {
      const sub = y.subjects.find(s => s.id === subId);
      if (sub) return { year: y, sub };
    }
    return null;
  }

  function _siblings(code) {
    const subId = _SUBID_ALL[code];
    if (!subId) return [];
    return Object.keys(_SUBID_ALL).filter(c => _SUBID_ALL[c] === subId && c !== code);
  }

  function estado(code) {
    const siblings = _siblings(code);
    if (siblings.length) {
      const pick = S.carrera && S.carrera.pick ? S.carrera.pick[_SUBID_ALL[code]] : null;
      if (pick && pick !== code) return 'ninguna'; // opción excluyente no elegida
    }
    const row = _row(code);
    if (row && row.sub.done) return 'aprobada';
    if (S.carrera && S.carrera.regular && S.carrera.regular[code]) return 'regular';
    return 'ninguna';
  }

  function setEstado(code, val) {
    ensureCarrera();
    const cur = estado(code);
    const target = cur === val ? 'ninguna' : val; // click sobre el estado activo → toggle a ninguna
    const row = _row(code);
    const subId = _SUBID_ALL[code];
    const siblings = _siblings(code);

    if (target === 'aprobada') {
      if (row) row.sub.done = true;
      delete S.carrera.regular[code];
    } else if (target === 'regular') {
      if (row) row.sub.done = false;
      S.carrera.regular[code] = true;
    } else {
      if (row) row.sub.done = false;
      delete S.carrera.regular[code];
    }

    if (siblings.length) {
      if (target === 'ninguna') {
        if (S.carrera.pick[subId] === code) delete S.carrera.pick[subId];
      } else {
        S.carrera.pick[subId] = code;
        siblings.forEach(sc => { delete S.carrera.regular[sc]; });
      }
    }

    saveState();
    if (typeof renderLawProgress === 'function') renderLawProgress();
    render();
  }

  // ══════════ Motor de correlatividades (portado tal cual del dashboard original) ══════════
  function evalReqCursar(reqCursar) {
    if (!reqCursar || !reqCursar.length) return true;
    let i = 0;
    while (i < reqCursar.length) {
      const [tipo, code] = reqCursar[i];
      if (tipo === 'Aprobada-OR') {
        let ok = false;
        while (i < reqCursar.length && reqCursar[i][0] === 'Aprobada-OR') {
          if (estado(reqCursar[i][1]) === 'aprobada') ok = true;
          i++;
        }
        if (!ok) return false;
      } else {
        const ok = tipo === 'Aprobada'
          ? estado(code) === 'aprobada'
          : (estado(code) === 'regular' || estado(code) === 'aprobada'); // 'Regularizada'
        if (!ok) return false;
        i++;
      }
    }
    return true;
  }

  function evalCorrelativasRendir(reqRendir) {
    if (!reqRendir || !reqRendir.length) return true;
    return reqRendir.every(code => estado(code) === 'aprobada');
  }

  function computeStatus(subj) {
    const own = estado(subj.code);
    if (own === 'aprobada') return 'aprobada';
    const rendirOk = evalCorrelativasRendir(subj.reqRendir);
    if (own === 'regular' && rendirOk) return 'rendir';
    if (own !== 'aprobada' && rendirOk) return 'libre';
    if (own === 'ninguna' && evalReqCursar(subj.reqCursar)) return 'cursar';
    if (own === 'regular') return 'cursando';
    return 'bloqueada';
  }

  // ══════════ Nombres ══════════
  function _titleCase(str) {
    const s = String(str || '').toLowerCase();
    const cap = s.charAt(0).toLocaleUpperCase('es') + s.slice(1);
    return cap.replace(/\b(i|ii)\b/g, m => m.toUpperCase());
  }
  const dispName = subj => _titleCase(subj.nombre);
  function nombrePorCodigo(code) {
    const s = _BY_CODE[code];
    return s ? _titleCase(s.nombre) : code;
  }

  // ══════════ Overlay ══════════
  function ensureOverlay() {
    if (typeof CMOverlay === 'undefined') return null;
    const { overlay, body } = CMOverlay.build({ id: 'ov-carrera', accent: '#3B82F6' });
    if (!overlay._crBuilt) {
      body.innerHTML = `<div class="cm-ov-head"><div class="cm-ov-eyebrow">CONOCIMIENTO · CARRERA</div><div class="cm-ov-title">Plan de carrera</div></div>
        <div class="cm-ov-host">
          <div class="corr-counters" id="corr-counters"></div>
          <div class="corr-filters">
            <div class="corr-chips" id="corr-chips-anio"></div>
            <div class="corr-chips" id="corr-chips-estado"></div>
            <input id="corr-search" class="corr-search" placeholder="Buscar materia o código…" oninput="Correlativas.setSearch(this.value)">
          </div>
          <div id="corr-list"></div>
        </div>`;
      overlay._crBuilt = true;
    }
    return overlay;
  }

  function open() {
    ensureCarrera();
    const ov = ensureOverlay(); if (!ov) return;
    render();
    CMOverlay.open(ov);
  }

  function setFiltroAnio(v) { _filtAnio = v; render(); }
  function setFiltroEstado(v) { _filtEstado = v; render(); }
  function setSearch(v) { _search = v; render(); }

  function _reqCumple(tipo, code) {
    return (tipo === 'Aprobada' || tipo === 'Aprobada-OR')
      ? estado(code) === 'aprobada'
      : (estado(code) === 'regular' || estado(code) === 'aprobada');
  }

  function _reqBlockCursar(title, req) {
    if (!req || !req.length) return `<div class="corr-req-block"><div class="corr-req-title">${title}</div><div class="corr-req-empty">Sin correlativas</div></div>`;
    const rows = req.map(([tipo, code]) => {
      const ok = _reqCumple(tipo, code);
      const tipoLbl = tipo === 'Regularizada' ? 'regularizada' : (tipo === 'Aprobada-OR' ? 'aprobada — opción' : 'aprobada');
      return `<div class="corr-req-row ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${esc(nombrePorCodigo(code))} <span class="corr-req-tipo">(${tipoLbl})</span></div>`;
    }).join('');
    return `<div class="corr-req-block"><div class="corr-req-title">${title}</div>${rows}</div>`;
  }

  function _reqBlockRendir(title, reqRendir) {
    if (!reqRendir || !reqRendir.length) return `<div class="corr-req-block"><div class="corr-req-title">${title}</div><div class="corr-req-empty">Sin correlativas</div></div>`;
    const rows = reqRendir.map(code => {
      const ok = estado(code) === 'aprobada';
      return `<div class="corr-req-row ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${esc(nombrePorCodigo(code))} <span class="corr-req-tipo">(aprobada)</span></div>`;
    }).join('');
    return `<div class="corr-req-block"><div class="corr-req-title">${title}</div>${rows}</div>`;
  }

  function _cardHTML(subj, status, idx) {
    const meta = STATUS_META[status];
    const own = estado(subj.code);
    return `<div class="corr-card" style="animation-delay:${idx * 25}ms">
      <div class="corr-card-top">
        <div class="corr-card-name">${esc(dispName(subj))}</div>
        <span class="corr-badge" style="--cb:${meta.color}">${meta.badge}</span>
      </div>
      <div class="corr-card-meta"><span class="corr-code">${esc(subj.code)}</span> · ${subj.anio}° año · ${esc(subj.regimen)}</div>
      ${subj.optativa ? `<div class="corr-optativa">${esc(subj.optativa)}</div>` : ''}
      <div class="corr-btns">
        <button class="corr-btn ${own === 'ninguna' ? 'on' : ''}" onclick="Correlativas.setEstado('${subj.code}','ninguna')">No cursada</button>
        <button class="corr-btn ${own === 'regular' ? 'on' : ''}" onclick="Correlativas.setEstado('${subj.code}','regular')">Regularizada</button>
        <button class="corr-btn ${own === 'aprobada' ? 'on' : ''}" onclick="Correlativas.setEstado('${subj.code}','aprobada')">Aprobada</button>
      </div>
      <details class="corr-details">
        <summary>Ver correlativas</summary>
        ${_reqBlockCursar('Para cursar', subj.reqCursar)}
        ${_reqBlockRendir('Para rendir el final', subj.reqRendir)}
        ${_reqBlockRendir('Para rendir libre', subj.reqRendir)}
      </details>
    </div>`;
  }

  function render() {
    const listEl = document.getElementById('corr-list');
    if (!listEl) return;
    ensureCarrera();

    const countersEl = document.getElementById('corr-counters');
    const chipsA = document.getElementById('corr-chips-anio');
    const chipsE = document.getElementById('corr-chips-estado');

    const stats = { aprobada: 0, rendir: 0, libre: 0, cursar: 0, bloqueadas: 0 };
    const all = CORR_SUBJECTS.map(subj => {
      const status = computeStatus(subj);
      const bucket = (status === 'cursando' || status === 'bloqueada') ? 'bloqueadas' : status;
      stats[bucket]++;
      return { subj, status };
    });

    if (countersEl) countersEl.innerHTML = `
      <div class="corr-ctr" style="--cc:var(--ok)"><b>${stats.aprobada}</b><span>Aprobadas</span></div>
      <div class="corr-ctr" style="--cc:var(--accent)"><b>${stats.rendir}</b><span>Podés rendir</span></div>
      <div class="corr-ctr" style="--cc:var(--warn)"><b>${stats.libre}</b><span>Rendir libre</span></div>
      <div class="corr-ctr" style="--cc:var(--c-conocimiento)"><b>${stats.cursar}</b><span>Podés cursar</span></div>
      <div class="corr-ctr" style="--cc:var(--tt)"><b>${stats.bloqueadas}</b><span>Bloqueadas</span></div>`;

    if (chipsA) chipsA.innerHTML = ANIOS.map(a => `<button class="corr-chip ${_filtAnio === a.v ? 'on' : ''}" onclick="Correlativas.setFiltroAnio('${a.v}')">${a.l}</button>`).join('');
    if (chipsE) chipsE.innerHTML = ESTADOS.map(e => `<button class="corr-chip ${_filtEstado === e.v ? 'on' : ''}" onclick="Correlativas.setFiltroEstado('${e.v}')">${e.l}</button>`).join('');

    const q = _search.trim().toLowerCase();
    const filtered = all.filter(({ subj, status }) => {
      if (_filtAnio !== 'todos' && subj.anio !== Number(_filtAnio)) return false;
      if (_filtEstado !== 'todas') {
        const bucket = (status === 'cursando' || status === 'bloqueada') ? 'bloqueadas' : status;
        if (bucket !== _filtEstado) return false;
      }
      if (q && !dispName(subj).toLowerCase().includes(q) && !subj.code.toLowerCase().includes(q)) return false;
      return true;
    });

    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty-state" style="padding:24px 4px">Ninguna materia coincide con el filtro.</div>`;
      return;
    }

    const byYear = {};
    filtered.forEach(item => { (byYear[item.subj.anio] = byYear[item.subj.anio] || []).push(item); });
    let idx = 0;
    listEl.innerHTML = Object.keys(byYear).sort((a, b) => a - b).map(anio => {
      const rows = byYear[anio].map(item => _cardHTML(item.subj, item.status, idx++)).join('');
      return `<div class="corr-year-group"><div class="corr-year-hd">${anio}° año</div>${rows}</div>`;
    }).join('');
  }

  return { open, setEstado, setFiltroAnio, setFiltroEstado, setSearch, ensureCarrera, estado, computeStatus, evalReqCursar, evalCorrelativasRendir };
})();
window.Correlativas = Correlativas;
