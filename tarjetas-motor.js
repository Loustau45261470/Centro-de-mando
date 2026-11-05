'use strict';
// ════════════════════════════════════════════════════════════════════════
// TARJETAS-MOTOR — cálculo puro de compras con tarjeta de crédito.
//
// Sin DOM y sin leer el estado global S: todo entra por parámetro
// (card, charge, fechas). Lo cargan DOS lados, igual que deadlines.js:
//   · navegador → window.CMTarjetas (finanzas.js, UI de la etapa 5b)
//   · Node/cron → require('./tarjetas-motor.js') (deadlines.js / push, etapa 6)
//
// Modelo (claves de primer nivel en el estado):
//   cards        [{ id, name, limit, closeDay, dueDay, openingUsed, planZ?, resetAt?, resetDay? }]
//                resetAt (ms) + resetDay ('YYYY-MM-DD') = "arranque": foto del usado de hoy (openingUsed) y de su cronograma
//                (cardDues). Desde ahí solo cuentan los cargos y pagos registrados DESPUÉS (ver chargeCounts/paymentCounts).
//   cardCharges  [{ id, cardId, date, amount, mode, installments, consumeMonths,
//                   category, name, toAccountId, z? }]   z:true = Plan Z (en cuotas sin interés; solo nowInst/deferred)
//                mode: 'now1' | 'deferred' | 'nowInst' | 'advance'
//   cardPayments [{ id, cardId, date, amount, accountId, kind:'auto'|'manual', key }]
//                key = statementKey del resumen que se pagó
//   cardDues     [{ id, cardId, due, amount }] — lo ya usado (saldo inicial) con la fecha en que vence:
//                un registro por tarjeta y mes; due = día de vencimiento de la tarjeta en ese mes.
//                setAt (opcional) = día en que se cargó: el monto ya incluye las cuotas de compras hasta ese día
//
// Fechas = 'YYYY-MM-DD'. Plata en pesos; los repartos se hacen en centavos
// enteros (sin errores de float) y el resto va a la última cuota/mes.
//
// Entradas inválidas: los cálculos devuelven null (statementFor, chargeEffects) o []
// (listas), sin lanzar. El llamador debe usar validateCard/validateCharge antes de persistir.
// ════════════════════════════════════════════════════════════════════════

const CMTarjetas = (() => {
  const MODES = ['now1', 'deferred', 'nowInst', 'advance'];
  const MAX_N = 60;

  const pad = n => String(n).padStart(2, '0');
  const isInt = n => typeof n === 'number' && Number.isInteger(n);
  const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m = 1..12
  const clampDay = (y, m, d) => Math.min(d, dim(y, m));
  const fmt = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

  function parseISO(s) {
    const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === 'string' ? s : '');
    if (!mt) return null;
    const y = +mt[1], m = +mt[2], d = +mt[3];
    if (y < 1900 || y > 2999 || m < 1|| m > 12 || d < 1 || d > dim(y, m)) return null;
    return { y, m, d };
  }

  // (y, m) + k meses → {y, m}
  function addMonths(y, m, k) {
    const idx = y * 12 + (m - 1) + k;
    return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
  }

  // Reparte `total` pesos en n partes iguales en centavos; el resto va a la última.
  function splitCents(total, n) {
    const cents = Math.round(total * 100);
    const base = Math.floor(cents / n);
    const out = [];
    for (let i = 0; i < n; i++) out.push(i === n - 1 ? cents - base * (n - 1) : base);
    return out.map(c => c / 100);
  }

  // ── Arranque (resetAt) ──
  // Una tarjeta con `resetAt` arrancó de cero con una foto: openingUsed + cardDues ya incluyen todo lo registrado hasta
  // ese momento. Los cargos/pagos anteriores quedan de historial y no suman al Usado, al calendario ni al pago automático.
  const MS_MIN = Date.UTC(2020, 0, 1), MS_MAX = Date.UTC(2100, 0, 1);
  const hasReset = card => !!card && typeof card.resetAt === 'number' && isFinite(card.resetAt) && card.resetAt > 0;
  // Momento en que se creó un registro: los ids son uid() = Date.now().toString(36) + 4 al azar. null si no se puede leer.
  function idTs(id) {
    if (typeof id !== 'string' || id.length < 8) return null;
    const ms = parseInt(id.slice(0, 8), 36);
    return isFinite(ms) && ms >= MS_MIN && ms <= MS_MAX ? ms : null;
  }
  // Día (local) del arranque; resetDay lo guarda cardArranque con el "hoy" de la app.
  function resetDayOf(card) {
    if (!hasReset(card)) return null;
    if (parseISO(card.resetDay)) return card.resetDay;
    const d = new Date(card.resetAt);
    return fmt(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  // ¿Este cargo suma después del arranque? Por momento de registro (id); si el id no se lee, por fecha del cargo.
  function chargeCounts(card, ch) {
    if (!hasReset(card)) return true;
    if (!ch || typeof ch !== 'object') return false;
    const ts = idTs(ch.id);
    if (ts !== null) return ts > card.resetAt;
    return typeof ch.date === 'string' && ch.date > resetDayOf(card);
  }
  // ¿Este pago suma después del arranque? El automático (key auto:<tarjeta>:<fecha>) por la fecha de su vencimiento;
  // el manual por el momento de registro (id) o, si no se lee, por su fecha.
  function paymentCounts(card, p) {
    if (!hasReset(card)) return true;
    if (!p || typeof p !== 'object') return false;
    const day = resetDayOf(card);
    if (typeof p.key === 'string' && p.key.startsWith('auto:')) {
      const due = typeof p.date === 'string' && p.date ? p.date : p.key.slice(p.key.lastIndexOf(':') + 1);
      return due >= day;
    }
    const ts = idTs(p.id);
    if (ts !== null) return ts > card.resetAt;
    return typeof p.date === 'string' && p.date > day;
  }

  // Usado = openingUsed + Σ cargos − Σ pagos (con arranque: solo los posteriores). Es el cálculo de cardUsed (finanzas.js).
  function used(card, charges, payments) {
    const sum = (arr, ok) => (Array.isArray(arr) ? arr : [])
      .filter(x => x && x.cardId === card.id && ok(x)).reduce((s, x) => s + (+x.amount || 0), 0);
    return Math.round(((+card.openingUsed || 0) + sum(charges, c => chargeCounts(card, c)) - sum(payments, p => paymentCounts(card, p))) * 100) / 100;
  }

  // Día de cierre/vencimiento: entero 1..31 (el UI guarda enteros; '27' se rechaza).
  const dayOk = n => isInt(n) && n >= 1 && n <= 31;
  const cycleOk = card => !!card && typeof card === 'object' && dayOk(card.closeDay) && dayOk(card.dueDay);

  // Resumen que cierra en el mes (y, m): fechas de cierre y vencimiento.
  // Vence el mismo mes del cierre si dueDay > closeDay; si no, el mes siguiente.
  function statementOfMonth(card, y, m) {
    const closeDate = fmt(y, m, clampDay(y, m, card.closeDay));
    const dm = card.dueDay > card.closeDay ? addMonths(y, m, 0) : addMonths(y, m, 1);
    const dueDate = fmt(dm.y, dm.m, clampDay(dm.y, dm.m, card.dueDay));
    return { closeDate, dueDate, key: `${y}-${pad(m)}` };
  }

  // Resumen en el que cae una compra hecha en dateISO.
  // día < cierre → resumen que cierra ese mes; día >= cierre (incluido el día
  // exacto) → el del mes siguiente. El cierre se clampa al último día del mes.
  function statementFor(card, dateISO) {
    if (!cycleOk(card)) return null;
    const p = parseISO(dateISO);
    if (!p) return null;
    const close = clampDay(p.y, p.m, card.closeDay);
    const cm = p.d < close ? { y: p.y, m: p.m } : addMonths(p.y, p.m, 1);
    return statementOfMonth(card, cm.y, cm.m);
  }

  const effInstallments = c => (c.mode === 'now1' ? 1 : (c.installments == null ? 1 : c.installments));

  // Cuotas: la k-ésima va al resumen k-1 posiciones después del primero.
  function installmentSchedule(card, charge) {
    if (!cycleOk(card) || chargeError(charge)) return [];
    const first = statementFor(card, charge.date);
    if (!first) return [];
    const n = effInstallments(charge);
    const [fy, fm] = first.key.split('-').map(Number);
    const amounts = splitCents(charge.amount, n);
    return amounts.map((amount, i) => {
      const mo = addMonths(fy, fm, i);
      const st = statementOfMonth(card, mo.y, mo.m);
      return { n: i + 1, dueDate: st.dueDate, statementKey: st.key, amount };
    });
  }

  // Gasto que ve categorías/presupuesto, por mes de consumo.
  function expenseSchedule(charge) {
    if (chargeError(charge)) return [];
    const p = parseISO(charge.date);
    if (!p || charge.mode === 'advance') return [];
    if (charge.mode === 'deferred') {
      const n = charge.consumeMonths == null ? 1 : charge.consumeMonths;
      return splitCents(charge.amount, n).map((amount, i) => {
        const mo = addMonths(p.y, p.m, i);
        return { month: `${mo.y}-${pad(mo.m)}`, amount };
      });
    }
    return [{ month: `${p.y}-${pad(p.m)}`, amount: charge.amount }];
  }

  // Todo lo que provoca un cargo. Consume SIEMPRE el monto completo del límite.
  function chargeEffects(card, charge) {
    if (!cycleOk(card) || chargeError(charge)) return null;
    return {
      creditUsedDelta: charge.amount,
      cashIn: charge.mode === 'advance' ? { accountId: charge.toAccountId, amount: charge.amount } : null,
      installments: installmentSchedule(card, charge),
      expenses: expenseSchedule(charge),
    };
  }

  const amountOk = a => typeof a === 'number' && isFinite(a) && a > 0 && a * 100 <= Number.MAX_SAFE_INTEGER;

  // Fecha de vencimiento de la tarjeta en el mes (y, m), con el día clampado al último del mes.
  const dueDateOf = (card, y, m) => fmt(y, m, clampDay(y, m, card.dueDay));

  // Resumen al que pertenece un vencimiento (misma regla que statementOfMonth, al revés).
  function statementKeyOfDue(card, p) {
    const sm = addMonths(p.y, p.m, card.dueDay > card.closeDay ? 0 : -1);
    return `${sm.y}-${pad(sm.m)}`;
  }

  // Próximos `count` vencimientos de la tarjeta a partir de fromISO (inclusive), por ejemplo para elegir uno en pantalla.
  function upcomingDueDates(card, fromISO, count) {
    const p = parseISO(fromISO);
    if (!validateCard(card).ok || !p || !isInt(count) || count < 1 || count > MAX_N) return [];
    const out = [];
    for (let i = 0; i <= count && out.length < count; i++) {
      const mo = addMonths(p.y, p.m, i);
      const d = dueDateOf(card, mo.y, mo.m);
      if (d >= fromISO) out.push(d);
    }
    return out;
  }

  // Suma por vencimiento dentro de [fromISO, toISO] (inclusive), para mostrar "a pagar el 10/11".
  // Ignora cargos de otra tarjeta o inválidos. Con `dues` (lista de { cardId, due, amount }) suma también
  // la deuda ya usada con fecha, y cada fila trae el detalle: installmentsAmount (cuotas) y debtAmount (deuda cargada).
  // Sin `dues` (undefined o null) el resultado es el de siempre. `dues` que no sea lista da [].
  function dueTotals(card, charges, fromISO, toISO, dues) {
    if (!validateCard(card).ok || !parseISO(fromISO) || !parseISO(toISO) || !Array.isArray(charges)) return [];
    const withDues = dues !== undefined && dues !== null;
    if (withDues && !Array.isArray(dues)) return [];
    const acc = new Map();
    // Vencimiento cargado a mano con fecha de carga (setAt): ese monto ya incluye las cuotas de las compras hechas
    // hasta ese día; solo se suman las de compras posteriores.
    // Con arranque no se usa: lo anterior al arranque ya se descarta por completo (chargeCounts).
    const reset = hasReset(card), resetDay = resetDayOf(card);
    const setAtOf = new Map();
    if (withDues && !reset) dues.forEach(d => { if (d && d.cardId === card.id && parseISO(d.setAt)) setAtOf.set(d.due, d.setAt); });
    const slot = (dueDate, statementKey) => {
      const cur = acc.get(dueDate) || { dueDate, statementKey, cents: 0, inst: 0, debt: 0 };
      acc.set(dueDate, cur);
      return cur;
    };
    charges.forEach(ch => {
      if (!ch || ch.cardId !== card.id ||!validateCharge(ch).ok || !chargeCounts(card, ch)) return;
      installmentSchedule(card, ch).forEach(q => {
        if (q.dueDate < fromISO || q.dueDate > toISO) return;
        if (reset && q.dueDate < resetDay) return;   // vencía antes del arranque: no se vuelve a pagar
        if (setAtOf.has(q.dueDate) && ch.date <= setAtOf.get(q.dueDate)) return;
        const cur = slot(q.dueDate, q.statementKey), c = Math.round(q.amount * 100);
        cur.cents += c; cur.inst += c;
      });
    });
    if (withDues) {
      dues.forEach(d => {
        const p = d && typeof d === 'object' ? parseISO(d.due) : null;
        if (!p || d.cardId !== card.id || !amountOk(d.amount) || d.due < fromISO || d.due > toISO) return;
        const cur = slot(d.due, statementKeyOfDue(card, p)), c = Math.round(d.amount * 100);
        cur.cents += c; cur.debt += c;
      });
    }
    return [...acc.values()]
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
      .map(r => (withDues
        ? { dueDate: r.dueDate, statementKey: r.statementKey, amount: r.cents / 100, installmentsAmount: r.inst / 100, debtAmount: r.debt / 100 }
        : { dueDate: r.dueDate, statementKey: r.statementKey, amount: r.cents / 100 }));
  }

  // Lo que falta pagar de cada vencimiento en [fromISO, toISO], descontando los pagos de `payments`.
  // El pago automático (key auto:<tarjeta>:<fecha>) cierra su vencimiento. Cada pago manual (adelanto, reintegro a la tarjeta)
  // se aplica primero al vencimiento de su ciclo: el primer día de vencimiento de la tarjeta igual o posterior a la fecha
  // del pago (como en el resumen del banco). Si ese vencimiento no tiene nada pendiente (o no le alcanza), lo que sobra
  // pasa al siguiente vencimiento con saldo, y así sucesivamente, en orden cronológico de pagos ("arrastre"): así, con arranque,
  // la suma de lo pendiente del calendario sigue igualando al Usado. Excepción: una tarjeta SIN arranque no conoce sus
  // vencimientos viejos, así que un pago de un vencimiento que la app no tiene cargado no se arrastra a los que sí tiene.
  // Mismas filas que dueTotals con amount = lo que falta y paidAmount = lo ya cubierto; los vencimientos ya cubiertos no salen.
  function pendingDues(card, charges, fromISO, toISO, dues, payments) {
    if (!parseISO(fromISO)) return [];
    const all = dueTotals(card, charges, '1900-01-01', toISO, dues);
    const autoBy = new Map(), manuals = [];
    (Array.isArray(payments) ? payments : []).forEach(p => {
      if (!p || !paymentCounts(card, p)) return;
      const c = Math.round((+p.amount || 0) * 100);
      // El automático se reconoce por la key (ya trae la tarjeta), igual que antes; el manual, por cardId.
      if (typeof p.key === 'string' && p.key.startsWith(`auto:${card.id}:`)) autoBy.set(p.key, (autoBy.get(p.key) || 0) + c);
      else if (p.cardId === card.id && !(typeof p.key === 'string' && p.key.startsWith('auto:')) && parseISO(p.date) && c > 0) {
        manuals.push({ date: p.date, id: String(p.id || ''), cents: c });
      }
    });
    const rows = all.map(r => {
      const total = Math.round(r.amount * 100), auto = autoBy.get(`auto:${card.id}:${r.dueDate}`);
      // Cuánto pueden cubrir los pagos manuales: lo que el automático no cerró.
      return { r, total, auto, room: auto === undefined ? total : Math.max(0, total - auto), applied: 0 };
    });
    manuals.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const reset = hasReset(card);
    manuals.forEach(m => {
      let rem = m.cents;
      if (!reset) {
        const first = upcomingDueDates(card, m.date, 1)[0];
        if (!first || !rows.some(x => x.r.dueDate === first)) return;   // vencimiento que la app no tiene: el pago no se arrastra
      }
      for (let i = 0; i < rows.length && rem > 0; i++) {
        const x = rows[i];
        if (x.r.dueDate < m.date) continue;
        const take = Math.min(rem, x.room - x.applied);
        if (take > 0) { x.applied += take; rem -= take; }
      }
    });
    const out = [];
    rows.forEach(x => {
      const left = x.auto !== undefined ? 0 : x.total - x.applied;
      if (x.r.dueDate >= fromISO && left > 0) out.push({ ...x.r, amount: left / 100, paidAmount: (x.total - left) / 100 });
    });
    return out;
  }

  // Forma del cargo (todo menos cardId): mensaje de error, o null si está bien.
  function chargeError(c) {
    if (!c || typeof c !== 'object') return 'Cargo inválido.';
    if (!MODES.includes(c.mode)) return 'Modalidad de compra inválida.';
    if (typeof c.amount !== 'number' || !isFinite(c.amount) || c.amount <= 0 || c.amount * 100 > Number.MAX_SAFE_INTEGER) return 'El monto tiene que ser mayor a 0.';
    if (!parseISO(c.date)) return 'Fecha inválida.';
    const n = c.installments == null ? 1 : c.installments;
    if (!isInt(n) || n < 1 || n > MAX_N) return `Las cuotas tienen que ser un entero entre 1 y ${MAX_N}.`;
    if (c.mode === 'deferred') {
      const m = c.consumeMonths;
      if (!isInt(m) || m < 1 || m > MAX_N) return `Los meses de consumo tienen que ser un entero entre 1 y ${MAX_N}.`;
    }
    if (c.mode === 'advance' && !c.toAccountId) return 'Elegí la cuenta donde entra la plata.';
    if (c.z != null && typeof c.z !== 'boolean') return 'Plan Z inválido.';
    if (c.z === true) {
      if (c.mode !== 'nowInst' && c.mode !== 'deferred') return 'El Plan Z solo va en compras en cuotas.';
      if (n < 2) return 'El Plan Z necesita al menos 2 partes.';
    }
    return null;
  }

  function validateCharge(c) {
    if (!c || typeof c !== 'object') return { ok: false, error: 'Cargo inválido.' };
    if (!c.cardId) return { ok: false, error: 'Elegí una tarjeta.' };
    const error = chargeError(c);
    if (error) return { ok: false, error };
    // El motor tolera now1 con cuotas (las ignora); persistir eso sí se rechaza.
    if (c.mode === 'now1' && c.installments != null && c.installments !== 1) return { ok: false, error: 'Un solo pago no puede tener cuotas.' };
    return { ok: true, error: null };
  }

  // Para persistir un vencimiento de lo ya usado: la fecha tiene que ser el día de vencimiento de la tarjeta
  // en ese mes (con clamp) y el monto mayor a 0 con 2 decimales como máximo. dueTotals es más permisivo
  // a propósito: lo ya guardado sigue sumando aunque después se cambie el día de vencimiento.
  function validateDue(card, d) {
    const bad = error => ({ ok: false, error });
    if (!validateCard(card).ok) return bad('Tarjeta inválida.');
    if (!d || typeof d !== 'object') return bad('Vencimiento inválido.');
    if (d.cardId !== card.id) return bad('El vencimiento es de otra tarjeta.');
    const p = parseISO(d.due);
    if (!p) return bad('Fecha inválida.');
    if (d.due !== dueDateOf(card, p.y, p.m)) return bad('La fecha tiene que ser el día de vencimiento de la tarjeta.');
    if (!amountOk(d.amount)) return bad('El monto tiene que ser mayor a 0.');
    if (Math.round(d.amount * 100) / 100 !== d.amount) return bad('El monto puede tener como máximo 2 decimales.');
    return { ok: true, error: null };
  }

  function validateCard(c) {
    const bad = error => ({ ok: false, error });
    if (!c || typeof c !== 'object') return bad('Tarjeta inválida.');
    if (!c.id) return bad('La tarjeta no tiene id.');
    if (typeof c.name !== 'string' || !c.name.trim()) return bad('Poné un nombre a la tarjeta.');
    if (!dayOk(c.closeDay)) return bad('El día de cierre tiene que ser un entero entre 1 y 31.');
    if (!dayOk(c.dueDay)) return bad('El día de vencimiento tiene que ser un entero entre 1 y 31.');
    return { ok: true, error: null };
  }

  return { hasReset, resetDayOf, idTs, chargeCounts, paymentCounts, used, statementFor, installmentSchedule, expenseSchedule, chargeEffects, dueTotals, pendingDues, upcomingDueDates, validateCharge, validateCard, validateDue };
})();

if (typeof window !== 'undefined') window.CMTarjetas = CMTarjetas;
if (typeof module !== 'undefined' && module.exports) module.exports = CMTarjetas;
