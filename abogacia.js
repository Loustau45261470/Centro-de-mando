// ════════════════════════════════════════════════════════
// LAW PROGRESS
// ════════════════════════════════════════════════════════
let _lawSlide = 0;

function renderLawProgress() {
  const wrap = document.getElementById('law-progress-wrap');
  if (!wrap) return;
  const years = S.lawProgress.years;
  const totalSubs = years.reduce((s, y) => s + y.subjects.length, 0);
  const totalDone = years.reduce((s, y) => s + y.subjects.filter(sub => sub.done).length, 0);
  const totalPct  = totalSubs ? Math.round(totalDone / totalSubs * 100) : 0;
  const allGrades = years.flatMap(y => y.subjects.map(s => s.grade)).filter(g => g != null && !isNaN(g));
  const careerAvg = allGrades.length ? allGrades.reduce((a, b) => a + (+b), 0) / allGrades.length : null;

  const slideHTML = years.map((y, yi) => {
    const yDone  = y.subjects.filter(s => s.done).length;
    const yTotal = y.subjects.length;
    const yPct   = yTotal ? Math.round(yDone / yTotal * 100) : 0;
    const yGrades = y.subjects.map(s => s.grade).filter(g => g != null && !isNaN(g));
    const yAvg = yGrades.length ? yGrades.reduce((a, b) => a + (+b), 0) / yGrades.length : null;
    return `<div class="law-year-slide">
      <div class="law-nav">
        <button class="law-nav-btn" onclick="lawNav(-1)" ${yi === 0 ? 'style="visibility:hidden"' : ''}>‹ Anterior</button>
        <span class="law-nav-label">${yi + 1} / ${years.length}</span>
        <button class="law-nav-btn" onclick="lawNav(1)" ${yi === years.length - 1 ? 'style="visibility:hidden"' : ''}>Siguiente ›</button>
      </div>
      <div class="law-year-top">
        <span class="law-year-name">${y.label}</span>
        <span class="law-year-pct">${yAvg != null ? `<span class="law-year-avg">prom ${yAvg.toFixed(1)}</span>` : ''}${yPct}%</span>
      </div>
      <div class="law-year-bar"><div class="law-year-bar-fill" style="width:${yPct}%"></div></div>
      <div class="law-subjects">
        ${y.subjects.map(sub => `
          <div class="law-subject-row${sub.done ? ' done' : ''}">
            <span class="law-subject-name">${sub.name}</span>
            <input type="number" class="law-grade" min="1" max="10" step="0.1"
              value="${sub.grade != null ? sub.grade : ''}" placeholder="–" title="Nota del final"
              onclick="event.stopPropagation()" onchange="setLawGrade('${y.id}','${sub.id}',this.value)">
            <input type="checkbox" class="law-check" ${sub.done ? 'checked' : ''}
              onchange="toggleLawSubject('${y.id}','${sub.id}')">
          </div>`).join('')}
      </div>
    </div>`;
  });

  const dots = years.map((_, i) =>
    `<div class="law-dot${i === _lawSlide ? ' active' : ''}" onclick="lawGoTo(${i})"></div>`
  ).join('');

  wrap.innerHTML = `<div class="card">
    <div class="card-title">⚖ Abogacía — Progreso</div>
    <div class="law-total-row">
      <div>
        <div class="law-total-pct">${totalPct}%</div>
        <div class="law-total-sub">progreso total</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:800;letter-spacing:-.04em">${totalDone}<span style="font-size:14px;font-weight:500;color:var(--tt);font-family:var(--mono)">/${totalSubs}</span></div>
        <div class="law-total-sub">materias aprobadas</div>
      </div>
    </div>
    <div class="law-total-bar"><div class="law-total-bar-fill" style="width:${totalPct}%"></div></div>
    <div class="law-total-caption">
      <span>${years.filter(y => y.subjects.every(s => s.done)).length} años completos</span>
      ${careerAvg != null ? `<span>Promedio carrera: <strong style="color:var(--c-conocimiento)">${careerAvg.toFixed(2)}</strong></span>` : ''}
      <span>${totalSubs - totalDone} materias restantes</span>
    </div>
    <div class="law-scroller" id="law-scroller">${slideHTML.join('')}</div>
    <div class="law-dots">${dots}</div>
  </div>`;

  // Restore scroll position and add listener
  const sc = document.getElementById('law-scroller');
  if (sc) {
    sc.scrollLeft = _lawSlide * sc.offsetWidth;
    sc.addEventListener('scroll', () => {
      const idx = Math.round(sc.scrollLeft / (sc.offsetWidth || 1));
      if (idx !== _lawSlide) { _lawSlide = idx; _updateLawDots(); }
    }, { passive: true });
  }
}

function _updateLawDots() {
  document.querySelectorAll('.law-dot').forEach((d, i) => d.classList.toggle('active', i === _lawSlide));
  // re-render slides so nav buttons update visibility
  const sc = document.getElementById('law-scroller');
  if (!sc) return;
  sc.querySelectorAll('.law-nav-btn').forEach(btn => {
    const slide = btn.closest('.law-year-slide');
    const idx   = [...sc.children].indexOf(slide);
    if (btn.textContent.includes('Anterior')) btn.style.visibility = idx === 0 ? 'hidden' : '';
    else btn.style.visibility = idx === S.lawProgress.years.length - 1 ? 'hidden' : '';
  });
}

function lawNav(dir) {
  _lawSlide = Math.max(0, Math.min(S.lawProgress.years.length - 1, _lawSlide + dir));
  const sc = document.getElementById('law-scroller');
  if (sc) sc.scrollTo({ left: _lawSlide * sc.offsetWidth, behavior: 'smooth' });
  setTimeout(_updateLawDots, 350);
}

function lawGoTo(idx) {
  _lawSlide = idx;
  const sc = document.getElementById('law-scroller');
  if (sc) sc.scrollTo({ left: idx * sc.offsetWidth, behavior: 'smooth' });
  setTimeout(_updateLawDots, 350);
}

function setLawGrade(yearId, subId, value) {
  const y = S.lawProgress.years.find(y => y.id === yearId);
  if (!y) return;
  const sub = y.subjects.find(s => s.id === subId);
  if (!sub) return;
  const v = parseFloat(String(value).replace(',', '.'));
  sub.grade = (value === '' || isNaN(v)) ? null : Math.max(1, Math.min(10, Math.round(v * 10) / 10));
  saveState(); renderLawProgress();
}

function toggleLawSubject(yearId, subId) {
  const y = S.lawProgress.years.find(y => y.id === yearId);
  if (!y) return;
  const sub = y.subjects.find(s => s.id === subId);
  if (!sub) return;
  sub.done = !sub.done;
  saveState(); renderLawProgress();
  if (sub.done) {
    const allYearDone = y.subjects.every(s => s.done);
    if (allYearDone) {
      showConfetti(4500);
      const el = document.createElement('div');
      el.style.cssText = `
        position:fixed; top:18%; left:50%; transform:translateX(-50%);
        background:linear-gradient(135deg,rgba(75,123,236,.2),rgba(124,142,232,.14));
        border:2px solid rgba(75,123,236,.5); border-radius:20px;
        padding:18px 32px; text-align:center; pointer-events:none; z-index:10000;
        backdrop-filter:blur(20px); box-shadow:0 0 60px rgba(75,123,236,.35),0 20px 60px rgba(0,0,0,.4);
        animation:missionBanner 3.8s cubic-bezier(.22,1,.36,1) forwards; white-space:nowrap;
      `;
      el.innerHTML = `
        <div style="font-size:36px;line-height:1;margin-bottom:6px">🎓</div>
        <div style="font-size:20px;font-weight:900;letter-spacing:.06em;color:#4B7BEC;text-shadow:0 0 30px rgba(75,123,236,.9)">¡${y.label.toUpperCase()} COMPLETADO!</div>
        <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:5px;font-weight:600">Todas las materias aprobadas</div>
      `;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
      showToast('🎓 ¡Año completo!', 4000);
    } else {
      showToast(`✓ ${sub.name}`);
    }
  }
}

// ════════════════════════════════════════════════════════
// LAW TABLES
// ════════════════════════════════════════════════════════
let _lawMilestoneChart = null;

function _parseMilestoneDate(str) {
  const [d, m, y] = str.split('/').map(Number);
  return new Date(2000 + y, m - 1, d);
}

function _lawTargetTag(target) {
  const t = target.toLowerCase();
  if (t === 'sin fecha')       return `<span class="law-tag law-tag-none">${target}</span>`;
  if (t.includes('promoción')) return `<span class="law-tag law-tag-promo">${target}</span>`;
  if (t.includes('online') || t.includes('libre')) return `<span class="law-tag law-tag-online">${target}</span>`;
  return `<span class="law-tag law-tag-date">${target}</span>`;
}

function renderLawMilestones() {
  const wrap = document.getElementById('law-milestones-wrap');
  if (!wrap) return;
  const ms   = S.lawMilestones;
  const today = new Date();
  const currentDone = S.lawProgress.years.reduce((s, y) => s + y.subjects.filter(sub => sub.done).length, 0);

  // Expected at most-recent past milestone
  let expectedToday = 0;
  for (const m of ms) {
    if (_parseMilestoneDate(m.date) <= today) expectedToday = m.expected;
  }
  const lag = currentDone - expectedToday;
  const lagColor = lag >= 0 ? 'var(--ok)' : 'var(--danger)';
  const lagSign  = lag > 0 ? '+' : '';

  const PENCIL = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const TRASH  = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`;

  // Table rows
  const rowsHTML = ms.map(m => {
    const isPast   = _parseMilestoneDate(m.date) <= today;
    const realVal  = m.real !== null ? m.real : (isPast ? currentDone : null);
    const realDisp = realVal !== null ? realVal : '—';
    const diff     = realVal !== null ? realVal - m.expected : null;
    let diffClass = 'diff-neu', diffDisp = '—';
    if (diff !== null) {
      diffDisp  = diff > 0 ? `+${diff}` : `${diff}`;
      diffClass = diff >= 0 ? 'diff-ok' : 'diff-bad';
    }
    return `<tr>
      <td style="font-family:var(--mono);font-size:12px">${m.date}</td>
      <td class="num">${realDisp}${m.real === null && isPast ? '<sup style="font-size:9px;color:var(--tt)">*</sup>' : ''}</td>
      <td class="num" style="color:var(--ok)">${m.expected}</td>
      <td class="diff ${diffClass}">${diffDisp}</td>
      <td style="padding:4px 4px 4px 0;white-space:nowrap">
        <div style="display:flex;gap:2px">
          <button class="icon-btn" onclick="openEditMilestone('${m.id}')">${PENCIL}</button>
          <button class="icon-btn" onclick="deleteMilestone('${m.id}')">${TRASH}</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<div class="card">
    <div class="card-title">
      📊 Seguimiento de Avance
      <button class="btn btn-ghost btn-sm" onclick="openAddMilestone()">+ Punto</button>
    </div>
    <div class="law-lag-banner">
      <div class="law-lag-stat">
        <div class="law-lag-num" style="color:var(--accent)">${currentDone}</div>
        <div class="law-lag-lbl">materias reales</div>
      </div>
      <div class="law-lag-stat">
        <div class="law-lag-num" style="color:var(--ok)">${expectedToday}</div>
        <div class="law-lag-lbl">esperadas hoy</div>
      </div>
      <div class="law-lag-stat">
        <div class="law-lag-num" style="color:${lagColor}">${lagSign}${lag}</div>
        <div class="law-lag-lbl">rezago</div>
      </div>
    </div>
    <div style="position:relative;height:150px;margin-bottom:14px"><canvas id="law-milestone-chart"></canvas></div>
    <table class="law-tbl">
      <thead><tr><th>Fecha</th><th style="text-align:center">Real</th><th style="text-align:center">Esperado</th><th style="text-align:center">Dif.</th><th></th></tr></thead>
      <tbody>${rowsHTML}</tbody>
    </table>
    <div style="font-size:11px;color:var(--tt);margin-top:8px">* Valor actual del progreso registrado</div>
  </div>`;

  // Chart
  requestAnimationFrame(() => {
    const canvas = document.getElementById('law-milestone-chart');
    if (!canvas) return;
    if (_lawMilestoneChart) { _lawMilestoneChart.destroy(); _lawMilestoneChart = null; }
    const labels  = ms.map(m => m.label);
    const planned = ms.map(m => m.expected);
    const real    = ms.map(m => {
      if (m.real !== null) return m.real;
      if (_parseMilestoneDate(m.date) <= today) return currentDone;
      return null;
    });
    _lawMilestoneChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'Planificado', data:planned,
            borderColor:'rgba(107,227,164,.75)', backgroundColor:'rgba(107,227,164,.07)',
            borderDash:[5,4], tension:.3, pointRadius:4, pointBackgroundColor:'rgba(107,227,164,.8)' },
          { label:'Real', data:real,
            borderColor:'rgba(75,123,236,.9)',  backgroundColor:'rgba(75,123,236,.08)',
            tension:.3, pointRadius:4, pointBackgroundColor:'rgba(75,123,236,.9)',
            spanGaps:false }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{ color:'#B8B6B0', font:{ size:11 }, boxWidth:12 } } },
        scales:{
          x:{ ticks:{ color:'#76746E', font:{ size:10 } }, grid:{ color:'rgba(255,255,255,.05)' } },
          y:{ ticks:{ color:'#76746E', font:{ size:10 }, stepSize:2 }, grid:{ color:'rgba(255,255,255,.05)' }, min:0 }
        }
      }
    });
  });
}

function openAddMilestone() {
  document.getElementById('lmModalTitle').textContent = 'Nuevo Punto';
  document.getElementById('lmId').value       = '';
  document.getElementById('lmDate').value     = '';
  document.getElementById('lmLabel').value    = '';
  document.getElementById('lmReal').value     = '';
  document.getElementById('lmExpected').value = '';
  openModal('modal-law-milestone');
}

function openEditMilestone(id) {
  const m = S.lawMilestones.find(m => m.id === id);
  if (!m) return;
  document.getElementById('lmModalTitle').textContent = 'Editar Punto';
  document.getElementById('lmId').value       = id;
  document.getElementById('lmDate').value     = m.date;
  document.getElementById('lmLabel').value    = m.label;
  document.getElementById('lmReal').value     = m.real !== null ? m.real : '';
  document.getElementById('lmExpected').value = m.expected;
  openModal('modal-law-milestone');
}

function saveMilestone() {
  const id       = document.getElementById('lmId').value;
  const date     = document.getElementById('lmDate').value.trim();
  const label    = document.getElementById('lmLabel').value.trim();
  const realRaw  = document.getElementById('lmReal').value.trim();
  const expRaw   = document.getElementById('lmExpected').value.trim();
  if (!date || !label) { showToast('Completa fecha y etiqueta'); return; }
  const real     = realRaw === '' ? null : parseInt(realRaw) || 0;
  const expected = parseInt(expRaw) || 0;
  if (id) {
    const m = S.lawMilestones.find(m => m.id === id);
    if (m) Object.assign(m, { date, label, real, expected });
  } else {
    S.lawMilestones.push({ id: uid(), date, label, real, expected });
    S.lawMilestones.sort((a, b) => _parseMilestoneDate(a.date) - _parseMilestoneDate(b.date));
  }
  saveState(); renderLawMilestones(); closeModal('modal-law-milestone');
}

function deleteMilestone(id) {
  S.lawMilestones = S.lawMilestones.filter(m => m.id !== id);
  saveState(); renderLawMilestones();
}

// ── Law Plan ──
function renderLawPlan() {
  const wrap = document.getElementById('law-plan-wrap');
  if (!wrap) return;
  const plan = S.lawPlan;
  const PENCIL = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const TRASH  = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`;

  wrap.innerHTML = `<div class="card">
    <div class="card-title">
      📅 Plan de Materias
      <button class="btn btn-ghost btn-sm" onclick="openAddLawPlan()">+ Materia</button>
    </div>
    <table class="law-tbl">
      <thead><tr><th>Materia</th><th>Fecha / Modalidad</th><th></th></tr></thead>
      <tbody>
        ${plan.map(e => `<tr>
          <td class="law-plan-name">${e.subject}</td>
          <td>${_lawTargetTag(e.target)}</td>
          <td style="padding:4px 8px;white-space:nowrap">
            <div style="display:flex;gap:2px">
              <button class="icon-btn" onclick="openEditLawPlan('${e.id}')">${PENCIL}</button>
              <button class="icon-btn" onclick="deleteLawPlan('${e.id}')">${TRASH}</button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function openAddLawPlan() {
  document.getElementById('lawPlanModalTitle').textContent = 'Nueva Materia';
  document.getElementById('lawPlanId').value      = '';
  document.getElementById('lawPlanSubject').value = '';
  document.getElementById('lawPlanTarget').value  = '';
  openModal('modal-law-plan');
}

function openEditLawPlan(id) {
  const e = S.lawPlan.find(e => e.id === id);
  if (!e) return;
  document.getElementById('lawPlanModalTitle').textContent = 'Editar Materia';
  document.getElementById('lawPlanId').value      = id;
  document.getElementById('lawPlanSubject').value = e.subject;
  document.getElementById('lawPlanTarget').value  = e.target;
  openModal('modal-law-plan');
}

function saveLawPlanEntry() {
  const id      = document.getElementById('lawPlanId').value;
  const subject = document.getElementById('lawPlanSubject').value.trim();
  const target  = document.getElementById('lawPlanTarget').value.trim();
  if (!subject) { showToast('Escribe el nombre'); return; }
  if (id) {
    const e = S.lawPlan.find(e => e.id === id);
    if (e) Object.assign(e, { subject, target: target || 'Sin fecha' });
  } else {
    S.lawPlan.push({ id: uid(), subject, target: target || 'Sin fecha' });
  }
  saveState(); renderLawPlan(); closeModal('modal-law-plan');
}

function deleteLawPlan(id) {
  S.lawPlan = S.lawPlan.filter(e => e.id !== id);
  saveState(); renderLawPlan();
}
