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
//   cards        [{ id, name, limit, closeDay, dueDay, openingUsed }]
//   cardCharges  [{ id, cardId, date, amount, mode, installments, consumeMonths,
//                   category, name, toAccountId }]
//                mode: 'now1' | 'deferred' | 'nowInst' | 'advance'
//   cardPayments [{ id, cardId, date, amount, accountId, kind:'auto'|'manual', key }]
//                key = statementKey del resumen que se pagó
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

  // Suma de cuotas por vencimiento dentro de [fromISO, toISO] (inclusive),
  // para mostrar "a pagar el 10/11". Ignora cargos de otra tarjeta o inválidos.
  function dueTotals(card, charges, fromISO, toISO) {
    if (!validateCard(card).ok || !parseISO(fromISO) || !parseISO(toISO) || !Array.isArray(charges)) return [];
    const acc = new Map();
    charges.forEach(ch => {
      if (!ch || ch.cardId !== card.id ||!validateCharge(ch).ok) return;
      installmentSchedule(card, ch).forEach(q => {
        if (q.dueDate < fromISO || q.dueDate > toISO) return;
        const cur = acc.get(q.dueDate) || { dueDate: q.dueDate, statementKey: q.statementKey, cents: 0 };
        cur.cents += Math.round(q.amount * 100);
        acc.set(q.dueDate, cur);
      });
    });
    return [...acc.values()]
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
      .map(r => ({ dueDate: r.dueDate, statementKey: r.statementKey, amount: r.cents / 100 }));
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

  function validateCard(c) {
    const bad = error => ({ ok: false, error });
    if (!c || typeof c !== 'object') return bad('Tarjeta inválida.');
    if (!c.id) return bad('La tarjeta no tiene id.');
    if (typeof c.name !== 'string' || !c.name.trim()) return bad('Poné un nombre a la tarjeta.');
    if (!dayOk(c.closeDay)) return bad('El día de cierre tiene que ser un entero entre 1 y 31.');
    if (!dayOk(c.dueDay)) return bad('El día de vencimiento tiene que ser un entero entre 1 y 31.');
    return { ok: true, error: null };
  }

  return { statementFor, installmentSchedule, expenseSchedule, chargeEffects, dueTotals, validateCharge, validateCard };
})();

if (typeof window !== 'undefined') window.CMTarjetas = CMTarjetas;
if (typeof module !== 'undefined' && module.exports) module.exports = CMTarjetas;
