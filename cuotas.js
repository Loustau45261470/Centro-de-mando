'use strict';
// ════════════════════════════════════════════════════════════════════════
// CUOTAS — vista propia (overlay) de las compras en cuotas con tarjeta.
// Une dos maquetas aprobadas:
//   F7 · "Todavía debés en cuotas": total que baja al pagar, una fila de luces por compra
//        (verde pagada, ámbar la que toca, apagadas las que vienen) y una casilla para pagar el mes.
//   J4 · "Cuándo quedás libre": total de cuotas de cada mes, una fila por compra sobre la misma
//        línea de meses con la marca de fin, y el mes en que ya no pagás ninguna cuota.
// No tiene cálculo propio de tarjetas: lee CMTarjetas (tarjetas-motor.js) y _ccCuotasEstados
// (finanzas.js). Pagar el mes es el mismo registro que hace applyCardAutoPayments el día del
// vencimiento (key auto:<tarjeta>:<vencimiento>), adelantado a mano; solo se puede con el resumen
// ya cerrado, así el monto es el definitivo. Acceso: botón "Cuotas" de la card Crédito (Finanzas).
// ════════════════════════════════════════════════════════════════════════

const CMCuotas = (() => {
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const pad = n => String(n).padStart(2, '0');
  const mIdx = mk => (+mk.slice(0, 4)) * 12 + (+mk.slice(5, 7)) - 1;   // 'YYYY-MM' → número de mes
  const mKey = i => `${Math.floor(i / 12)}-${pad(i % 12 + 1)}`;
  const mName = i => `${MES[i % 12]} ${Math.floor(i / 12)}`;
  const esc = s => (typeof escHtml === 'function' ? escHtml(s) : String(s));
  const pesos = n => (typeof _ccPesos === 'function' ? _ccPesos(n) : '$' + Math.round(n).toLocaleString('es-AR'));
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const today = () => (typeof getActiveDate === 'function' ? getActiveDate() : new Date().toISOString().slice(0, 10));

  let _hl = -1;            // mes resaltado en el calendario (-1 = el actual)
  let _shown = null;       // total que se ve en pantalla (para que baje contando)
  let _raf = 0;

  // Cierre del resumen 'YYYY-MM' de la tarjeta (mismo criterio que statementOfMonth del motor).
  function _cierre(card, key) {
    const y = +key.slice(0, 4), m = +key.slice(5, 7);
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${key}-${pad(Math.min(card.closeDay, dim))}`;
  }

  // ══════════ Datos ══════════
  function datos() {
    const hoy = today(), cur = mIdx(hoy.slice(0, 7));
    const out = { hoy, cur, items: [], cards: [] };
    if (!window.CMTarjetas || typeof _ccCuotasEstados !== 'function' || typeof _ccCuotasPagadasKeys !== 'function') return out;
    const cards = Array.isArray(S.cards) ? S.cards : [];
    const charges = Array.isArray(S.cardCharges) ? S.cardCharges : [];
    const byId = new Map(cards.map(c => [c.id, c]));
    // Pagada: mismo criterio que la barra de Compras (finanzas.js): pago automático o vencimiento ya cubierto a mano.
    const paidKeys = _ccCuotasPagadasKeys();
    charges.forEach(ch => {
      const card = ch && byId.get(ch.cardId);
      if (!card || !CMTarjetas.chargeCounts(card, ch)) return;
      const sched = CMTarjetas.installmentSchedule(card, ch);
      if (sched.length < 2) return;   // en cuotas = 2 o más (igual que la barra de Compras)
      const est = _ccCuotasEstados(sched, paidKeys, ch.cardId, hoy);
      const resta = sched.reduce((s, q, i) => s + (est[i] === 'pagada' ? 0 : q.amount), 0);
      const fin = mIdx(sched[sched.length - 1].dueDate.slice(0, 7));
      if (resta <= 0 && fin < cur - 1) return;   // terminadas hace más de un mes: ya no se muestran
      let ti = -1;   // cuota de la casilla: la del último resumen ya cerrado
      sched.forEach((q, i) => { if (_cierre(card, q.statementKey) <= hoy) ti = i; });
      out.items.push({ ch, card, sched, est, resta: Math.round(resta * 100) / 100, fin, ti,
        pag: est.filter(e => e === 'pagada').length, ini: mIdx(sched[0].dueDate.slice(0, 7)) });
    });
    // Orden fijo (no salta al pagar): las terminadas al final; el resto, la que termina antes primero.
    out.items.sort((a, b) => ((a.resta <= 0) - (b.resta <= 0)) || (a.fin - b.fin) || (a.ini - b.ini));
    out.cards = cards.filter(c => out.items.some(it => it.card.id === c.id));
    out.total = Math.round(out.items.reduce((s, it) => s + it.resta, 0) * 100) / 100;
    // Por mes: total de cuotas que vencen (pagadas o no) y el mes en que ya no queda ninguna.
    out.porMes = new Map();
    out.items.forEach(it => it.sched.forEach(q => {
      const m = mIdx(q.dueDate.slice(0, 7));
      out.porMes.set(m, Math.round(((out.porMes.get(m) || 0) + q.amount) * 100) / 100);
    }));
    const ultimo = out.items.filter(it => it.resta > 0).reduce((mx, it) => Math.max(mx, it.fin), -1);
    out.libre = ultimo < cur ? cur : ultimo + 1;
    return out;
  }

  // Estado de la casilla de una compra.
  function casilla(it, hoy) {
    if (it.ti < 0) {
      const q = it.sched[0];
      return { st: 'espera', txt: `El primer resumen cierra el ${_ccDM(_cierre(it.card, q.statementKey))}: desde ese día la podés marcar` };
    }
    const q = it.sched[it.ti], key = `auto:${it.card.id}:${q.dueDate}`;
    if (it.est[it.ti] === 'pagada') {
      const p = (S.cardPayments || []).find(x => x && x.key === key);
      const undo = !!(p && p.via === 'cuotas' && q.dueDate > hoy);
      return { st: 'paga', undo, q, key, txt: undo ? `Pagaste el resumen del ${_ccDM(q.dueDate)}. Tocá para deshacer` : `Cuota ${q.n} pagada (resumen del ${_ccDM(q.dueDate)})` };
    }
    const acc = it.card.payAccountId && (S.accounts || []).find(a => a.id === it.card.payAccountId);
    if (!acc) return { st: 'sincuenta', q, txt: `Para pagar desde acá, elegí en ${it.card.name} desde qué cuenta se paga` };
    return { st: 'pagar', q, key, acc, txt: `Pagar el resumen de ${it.card.name} del ${_ccDM(q.dueDate)} desde ${acc.name}` };
  }

  // ══════════ Acciones ══════════
  function toggle(chargeId) {
    const d = datos(), it = d.items.find(x => x.ch.id === chargeId);
    if (!it) return;
    const c = casilla(it, d.hoy);
    if (c.st === 'espera' || c.st === 'sincuenta') { showToast(c.txt, 4500); return; }
    if (c.st === 'paga' && !c.undo) { showToast(c.txt, 3000); return; }
    const antes = d.total;
    if (c.st === 'paga') {   // deshacer un pago adelantado desde acá
      const i = S.cardPayments.findIndex(p => p && p.key === c.key && p.via === 'cuotas');
      if (i < 0) return;
      const p = S.cardPayments[i], acc = (S.accounts || []).find(a => a.id === p.accountId);
      if (acc) acc.balance = _ccRound(acc.balance + p.amount);
      S.cardPayments.splice(i, 1);
      snapshotNW(); saveState();
      _refrescar(antes, null, chargeId);
      showToast(`Pago del resumen del ${_ccDM(c.q.dueDate)} deshecho`, 3000);
      return;
    }
    // Pagar: lo que falta de ese vencimiento (toda la tarjeta), igual que el pago automático.
    const charges = S.cardCharges || [], dues = Array.isArray(S.cardDues) ? S.cardDues : [];
    const pend = CMTarjetas.pendingDues(it.card, charges, c.q.dueDate, c.q.dueDate, dues, S.cardPayments)[0];
    if (!pend || !(pend.amount > 0)) { showToast('Ese resumen ya está cubierto', 3000); return; }
    if (!Array.isArray(S.cardPayments)) S.cardPayments = [];
    if (S.cardPayments.some(p => p && p.key === c.key)) return;
    S.cardPayments.push({ id: c.key, key: c.key, cardId: it.card.id, date: c.q.dueDate, amount: pend.amount, accountId: c.acc.id, kind: 'auto', via: 'cuotas' });
    c.acc.balance = _ccRound(c.acc.balance - pend.amount);
    snapshotNW(); saveState();
    const n = d.items.filter(x => x.card.id === it.card.id && x.sched.some(q => q.dueDate === c.q.dueDate)).length;
    _refrescar(antes, `${it.card.id}|${c.q.dueDate}`, chargeId);
    showToast(`Pagaste el resumen de ${it.card.name} del ${_ccDM(c.q.dueDate)}: ${pesos(pend.amount)}${n > 1 ? ` (${n} compras en cuotas)` : ''}`, 4500);
  }

  function _refrescar(antes, destello, focoId) {
    if (typeof renderFinanzasTab === 'function') renderFinanzasTab();
    render({ desde: antes, destello });
    if (focoId) {
      const b = document.querySelector(`#ov-cuotas .cq-row[data-charge-id="${CSS.escape(focoId)}"] .cq-ck`);
      if (b) b.focus({ preventScroll: true });
    }
  }

  // ══════════ Render ══════════
  function _ledsF7(it) {
    return it.sched.map((q, i) => {
      const e = it.est[i];
      return `<i class="cq-l cq-${e === 'pagada' ? 'pa' : e === 'corriente' ? 'cu' : 'fu'}" data-k="${esc(it.card.id)}|${q.dueDate}"></i>`;
    }).join('');
  }

  function _rowF7(it, hoy) {
    const c = casilla(it, hoy), tot = it.sched.length, fin = it.resta <= 0;
    const prox = it.est.indexOf('corriente');
    const em = fin ? 'Terminada' : `cuota ${(prox < 0 ? it.pag : prox) + 1} de ${tot}`;
    const faltan = it.est.filter(e => e !== 'pagada').length;
    const sub = fin ? `${esc(it.card.name)} · sin deuda en esta compra`
      : `${esc(it.card.name)} · ${faltan === 1 ? 'falta 1 cuota' : `faltan ${faltan} cuotas`} · ${pesos(it.resta)}`;
    const on = c.st === 'paga', lock = (on && !c.undo) || c.st === 'espera' || c.st === 'sincuenta';
    return `<div class="cq-row${fin ? ' dn' : ''}" data-charge-id="${esc(it.ch.id)}">
      <div class="cq-rh"><span class="cq-n">${esc(it.ch.name || 'Compra con tarjeta')}</span><em>${em}</em>
        <button class="cq-ck${on ? ' on' : ''}${lock ? ' lock' : ''}" type="button" role="checkbox" aria-checked="${on}" title="${esc(c.txt)}" aria-label="${esc(c.txt)}" onclick="CMCuotas.toggle('${esc(it.ch.id)}')"></button></div>
      <div class="cq-leds" role="img" aria-label="${it.pag} de ${tot} cuotas pagadas">${_ledsF7(it)}</div>
      <div class="cq-sub">${sub}</div>
    </div>`;
  }

  function _calendario(d) {
    const from = d.cur - 2;
    const lastAll = d.items.reduce((mx, it) => Math.max(mx, it.fin), d.cur);
    const to = Math.min(d.cur + 21, Math.max(d.cur + 7, d.libre, lastAll));
    const ms = []; for (let m = from; m <= to; m++) ms.push(m);
    const tot = m => d.porMes.get(m) || 0;
    const mx = Math.max(1, ...ms.map(tot));
    const st = m => (m < d.cur ? 'pa' : m === d.cur ? 'cu' : 'fu');
    const head = ms.map((m, i) => `<span data-m="${m}" class="${m === d.cur ? 'cu' : ''}${i === 0 || m % 12 === 0 ? ' yr' : ''}" data-y="${Math.floor(m / 12)}" data-i="${MES[m % 12][0]}">${MES[m % 12]}</span>`).join('');
    const miles = t => { const k = Math.round(t / 1000); return k ? k.toLocaleString('es-AR') : '&lt;1'; };
    const bars = ms.map((m, i) => {
      const t = tot(m);
      if (!t && m >= d.cur) return `<div class="cq-free" data-m="${m}"><b>LIBRE</b></div>`;
      if (!t) return `<div class="cq-b cq-b0" data-m="${m}"></div>`;
      return `<div class="cq-b ${st(m)}" data-m="${m}" style="--h:${Math.max(4, Math.round(t / mx * 62))}px;--dl:${i * 45}ms"><span>${miles(t)}</span></div>`;
    }).join('');
    let g = `<div class="cq-r cq-mh"><div class="cq-nm"></div><div class="cq-cs">${head}</div></div>
      <div class="cq-r cq-tot"><div class="cq-nm"><b class="cq-tl">Total del mes</b><span>en miles</span></div><div class="cq-cs">${bars}</div></div><div class="cq-sep"></div>`;
    d.items.forEach(it => {
      const done = it.resta <= 0;
      const byM = new Map(it.sched.map((q, i) => [mIdx(q.dueDate.slice(0, 7)), it.est[i]]));
      const cells = ms.map(m => {
        const e = byM.get(m);
        const cls = e ? (e === 'pagada' ? 'pa' : e === 'corriente' ? 'cu' : 'fu') : '';
        return `<span class="cq-c ${cls}${m === it.fin ? ' end' : ''}" data-m="${m}"${e ? ` data-k="${esc(it.card.id)}|${it.sched.find(q => mIdx(q.dueDate.slice(0, 7)) === m).dueDate}"` : ''}></span>`;
      }).join('');
      const cuota = it.sched[it.sched.length - 1].amount;
      g += `<div class="cq-r"><div class="cq-nm"><b${done ? ' class="dn"' : ''}>${esc(it.ch.name || 'Compra con tarjeta')}</b><span>${done ? 'pagada' : `${pesos(cuota)} · fin ${MES[it.fin % 12]}`}</span></div><div class="cq-cs">${cells}</div></div>`;
    });
    return `<div class="cq-g${ms.length > 12 ? " cq-dense" : ""}" style="--cols:${ms.length}">${g}</div>`;
  }

  function _kpis(d) {
    const now = d.porMes.get(d.cur) || 0, nxt = d.porMes.get(d.cur + 1) || 0;
    const meses = d.libre - d.cur;
    const act = d.items.filter(it => it.resta > 0);
    const prox = act.slice().sort((a, b) => a.fin - b.fin)[0];
    return `<div class="cq-k">
      <div><span class="cq-lbl">Este mes pagás · ${mName(d.cur)}</span><div class="v am">${now ? pesos(now) : '$0'}</div>
        <div class="s">${now ? `El mes que viene ${pesos(nxt)}${nxt < now ? ` (−${Math.round((1 - nxt / now) * 100)} %)` : ''}` : 'Sin cuotas este mes'}</div></div>
      <div><span class="cq-lbl">Libre de cuotas</span><div class="v">${meses > 0 ? mName(d.libre) : 'Ya'}</div>
        <div class="s">${meses > 0 ? `en ${meses} ${meses === 1 ? 'mes' : 'meses'}` : 'no te queda ninguna cuota'}</div></div>
      <div><span class="cq-lbl">Compras activas</span><div class="v">${act.length}</div>
        <div class="s">${prox ? `La próxima en terminar: ${esc(prox.ch.name || 'compra')} (${MES[prox.fin % 12]})` : 'Ninguna en curso'}</div></div>
    </div>`;
  }

  function _vacio() {
    const leds = '<i class="cq-l cq-fu"></i>'.repeat(12);
    const sinTarjeta = !(Array.isArray(S.cards) && S.cards.length);
    return `<section class="cq-card cq-empty">
      <div class="cq-cardt"><span>Cuotas</span><small>Sin deuda</small></div>
      <div class="cq-top"><div><small class="cq-lbl">Todavía debés en cuotas</small><b class="cq-total">$0</b></div><small class="cq-lbl cq-meta">Libre de cuotas</small></div>
      <div class="cq-leds cq-leds-vacio" aria-hidden="true">${leds}</div>
      <p class="cq-empty-p">${sinTarjeta ? 'Todavía no cargaste ninguna tarjeta.' : 'No tenés compras en cuotas.'} Cuando cargues una compra en cuotas, acá vas a ver cuánto debés, qué cuota toca este mes y en qué mes quedás libre.</p>
      <button class="cq-btn" type="button" onclick="CMCuotas.nuevaCompra()">${sinTarjeta ? '+ Agregar tarjeta' : '+ Compra con tarjeta'}</button>
    </section>`;
  }

  function render(opts = {}) {
    const host = document.getElementById('cq-host');
    if (!host) return;
    const d = datos();
    if (!d.items.length) { host.innerHTML = _vacio(); _shown = 0; return; }
    const nombres = d.cards.map(c => esc(c.name)).join(' + ');
    // "Pagas este mes": compras cuya cuota del último resumen cerrado vence este mes o después.
    const conCasilla = d.items.filter(it => it.ti >= 0 && mIdx(it.sched[it.ti].dueDate.slice(0, 7)) >= d.cur);
    const pagas = conCasilla.filter(it => it.est[it.ti] === 'pagada').length;
    host.innerHTML = `
      <section class="cq-card cq-f7" aria-label="Lo que todavía debés en cuotas">
        <div class="cq-cardt"><span>Cuotas · lo que debés</span><small>${nombres}</small></div>
        <div class="cq-top">
          <div><small class="cq-lbl">Todavía debés en cuotas</small><b class="cq-total" id="cq-total" aria-live="polite">${pesos(d.total)}</b></div>
          <small class="cq-lbl cq-meta">${pagas} de ${conCasilla.length} pagas este mes</small>
        </div>
        <div class="cq-rows">${d.items.map(it => _rowF7(it, d.hoy)).join('')}</div>
      </section>
      <section class="cq-card cq-j4" aria-label="Cuándo quedás libre de cuotas">
        <div class="cq-cardt"><span>Cuotas · cuándo quedás libre</span><small>${nombres}</small></div>
        ${_kpis(d)}
        ${_calendario(d)}
        <div class="cq-ro" id="cq-ro" aria-live="polite"></div>
      </section>`;
    host._d = d;
    _hover(_hl < 0 ? d.cur : _hl);
    // Total que baja contando (F7). Sin movimiento: el número final directo.
    const el = document.getElementById('cq-total');
    const desde = opts.desde != null ? opts.desde : null;
    cancelAnimationFrame(_raf);
    if (desde != null && desde !== d.total && !reduced()) {
      let v = desde, t0 = performance.now();
      el.textContent = pesos(Math.round(v));
      const step = t => {
        const dt = Math.min(.05, (t - t0) / 1000); t0 = t;
        v += (d.total - v) * Math.min(1, dt * 7);
        if (Math.abs(d.total - v) < 1) { el.textContent = pesos(d.total); _shown = d.total; return; }
        el.textContent = pesos(Math.round(v)); _shown = v;
        _raf = requestAnimationFrame(step);
      };
      _raf = requestAnimationFrame(step);
    } else _shown = d.total;
    // Destello en las luces del vencimiento que se acaba de pagar (o deshacer).
    if (opts.destello && !reduced()) {
      host.querySelectorAll('[data-k]').forEach(x => { if (x.dataset.k === opts.destello) x.classList.add('po'); });
    }
    // Barras que suben al abrir la vista
    if (opts.entrada && !reduced()) {
      const g = host.querySelector('.cq-g');
      if (g) { g.classList.add('cq-play'); setTimeout(() => g.classList.remove('cq-play'), 1900); }
    }
  }

  // Lectura del mes bajo el dedo/mouse (J4)
  function _hover(m) {
    const host = document.getElementById('cq-host'), d = host && host._d, ro = document.getElementById('cq-ro');
    if (!d || !ro) return;
    _hl = m;
    host.querySelectorAll('.cq-c').forEach(c => c.classList.toggle('hl', +c.dataset.m === m && !!c.dataset.k));
    host.querySelectorAll('.cq-mh .cq-cs span').forEach(s => s.classList.toggle('hl', +s.dataset.m === m));
    const t = d.porMes.get(m) || 0;
    const ends = d.items.filter(it => it.fin === m).map(it => esc(it.ch.name || 'compra'));
    const starts = d.items.filter(it => it.ini === m).map(it => esc(it.ch.name || 'compra'));
    const when = m < d.cur ? 'ya pasó' : m === d.cur ? 'este mes' : 'por venir';
    ro.innerHTML = `<b>${mName(m)}</b> · ${when} · ${t ? `<b>${pesos(t)}</b> en cuotas` : '<b class="ok">sin cuotas</b>'}${ends.length ? ` · última cuota de <b>${ends.join(', ')}</b>` : ''}${starts.length ? ` · empieza ${starts.join(', ')}` : ''}`;
  }

  function nuevaCompra() {
    const sinTarjeta = !(Array.isArray(S.cards) && S.cards.length);
    if (window.CMOverlay) CMOverlay.close('ov-cuotas');
    if (sinTarjeta) { if (typeof openCardModal === 'function') openCardModal(); }
    else if (typeof openTxnCardForm === 'function') openTxnCardForm();
  }

  // ══════════ Overlay ══════════
  function ensureOverlay() {
    if (typeof CMOverlay === 'undefined') return null;
    const { overlay, body } = CMOverlay.build({ id: 'ov-cuotas', accent: 'var(--c-finanzas)', onClose: () => cancelAnimationFrame(_raf) });
    if (!overlay._cqBuilt) {
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Cuotas');
      body.innerHTML = `<div class="cm-ov-head"><div class="cm-ov-eyebrow">FINANZAS · CRÉDITO</div><div class="cm-ov-title">Cuotas</div></div><div id="cq-host"></div>`;
      const host = body.querySelector('#cq-host');
      host.addEventListener('pointerover', e => { const x = e.pointerType === 'mouse' && e.target.closest('.cq-g [data-m]'); if (x) _hover(+x.dataset.m); });
      host.addEventListener('click', e => { const x = e.target.closest('.cq-g [data-m]'); if (x) _hover(+x.dataset.m); });
      host.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && host._d) _hover(host._d.cur); });
      overlay._cqBuilt = true;
    }
    return overlay;
  }

  function open() {
    const ov = ensureOverlay(); if (!ov) return;
    _hl = -1;
    render({ entrada: true });
    CMOverlay.open(ov);
    const b = ov.querySelector('.cm-ov-close'); if (b) b.focus({ preventScroll: true });
  }

  // Resumen para el botón de acceso en la card Crédito.
  function resumen() {
    const d = datos();
    return { total: d.total || 0, compras: d.items.filter(it => it.resta > 0).length, libre: d.items.length && d.libre > d.cur ? mName(d.libre) : '' };
  }

  return { open, render, toggle, resumen, nuevaCompra, datos };
})();
window.CMCuotas = CMCuotas;
