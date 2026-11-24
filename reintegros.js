'use strict';
// ════════════════════════════════════════════════════════════════════════
// REINTEGROS — regla única de cómo cuenta un reintegro en balances, presupuesto, objetivos, reportes y Jarvis.
//
// Un reintegro se guarda como transacción type:'income' con `refundOf` = id de la compra con tarjeta (S.cardCharges) o del gasto
// común (S.transactions) que lo originó (finanzas.js, _addRefund). REGLA:
//   1. NUNCA es ingreso (esReintegro). Sigue moviendo el saldo de su cuenta; eso no se toca acá.
//   2. RESTA del gasto de su origen, en la misma categoría y en el/los MESES en que ese gasto cuenta:
//        · gasto común  → el mes de su fecha;
//        · compra con tarjeta → los meses de CMTarjetas.expenseSchedule, proporcional al monto de cada mes (centavos exactos:
//          cada mes recibe floor(reintegro × parte / total) y el resto de centavos va a la ÚLTIMA parte, igual que splitCents).
//          Las compras `cover` (las cubre otra persona) y los adelantos (mode 'advance') no son gasto → no restan nada.
//   3. Origen inexistente (huérfano) → no cuenta ni como ingreso ni como gasto.
// Los repartos (S.repartos) no admiten reintegro (reparto-gastos.js _repEligible/repUiOpenEdit lo impiden), así que no se consideran.
// Los descuentos (discountPct) ya guardan el monto neto en la compra/gasto: no pasan por acá.
//
// Puro: sin DOM ni S global. Lo cargan el navegador (window.CMReintegros) y Node (require, para reportes.js y los tests).
// ════════════════════════════════════════════════════════════════════════
const CMReintegros = (() => {
  const _tm = () => (typeof window !== 'undefined' && window.CMTarjetas) || (typeof require === 'function' ? require('./tarjetas-motor.js') : null);
  const _ars = (t) => !t || !t.currency || t.currency === 'ARS';

  // ¿Es un reintegro (nunca ingreso)?
  const esReintegro = (t) => !!(t && t.refundOf);
  // Ingreso real: income que no es reintegro.
  const esIngreso = (t) => !!(t && t.type === 'income' && !t.refundOf);
  // Lista sin los reintegros (para sumas de ingresos/gastos con el patrón `income … else gasto`).
  const sinReintegros = (txs) => (Array.isArray(txs) ? txs : []).filter((t) => !esReintegro(t));

  // Partes de gasto sobre las que se reparte un reintegro: [{ txnId, date, month, category, cents, cuotaDia1 }].
  // txnId = id de la transacción de gasto que la representa (cc:<cargo>:<mes> para tarjeta; el propio gasto si es común).
  function _partesDeOrigen(origen, esCargo, centsReintegro) {
    if (!(centsReintegro > 0)) return [];
    let partes;
    if (esCargo) {
      if (origen.cover || origen.mode === 'advance') return [];
      const TM = _tm();
      const sched = TM ? TM.expenseSchedule(origen) : [];
      if (!sched.length) return [];
      partes = sched.map((e, i) => ({
        txnId: `cc:${origen.id}:${e.month}`, month: e.month, cents: Math.round(e.amount * 100),
        date: e.month === String(origen.date).slice(0, 7) ? origen.date : `${e.month}-01`,
        cuotaDia1: sched.length > 1 && e.month !== String(origen.date).slice(0, 7), i,
      }));
    } else {
      if (origen.type !== 'expense' || !_ars(origen) || !origen.date) return [];
      partes = [{ txnId: origen.id, month: String(origen.date).slice(0, 7), date: origen.date, cents: Math.round((+origen.amount || 0) * 100), cuotaDia1: false }];
    }
    const total = partes.reduce((s, p) => s + p.cents, 0);
    if (!(total > 0)) return [];
    const r = Math.min(centsReintegro, total);
    let usado = 0;
    partes.forEach((p, i) => {
      p.cents = i === partes.length - 1 ? r - usado : Math.floor(r * p.cents / total);
      usado += p.cents; p.category = origen.category || ''; p.origenId = origen.id;
    });
    return partes.filter((p) => p.cents > 0);
  }

  // Todas las partes de gasto a restar. st = { transactions, cardCharges }.
  function partes(st) {
    const txs = (st && Array.isArray(st.transactions)) ? st.transactions : [];
    const cargos = (st && Array.isArray(st.cardCharges)) ? st.cardCharges : [];
    const porOrigen = {};
    txs.forEach((t) => { if (esReintegro(t) && _ars(t)) porOrigen[t.refundOf] = (porOrigen[t.refundOf] || 0) + Math.round((+t.amount || 0) * 100); });
    const out = [];
    Object.keys(porOrigen).forEach((id) => {
      const cargo = cargos.find((c) => c && c.id === id);
      if (cargo) { out.push(..._partesDeOrigen(cargo, true, porOrigen[id])); return; }
      const gasto = txs.find((t) => t && t.id === id && !t.refundOf);
      if (gasto) out.push(..._partesDeOrigen(gasto, false, porOrigen[id]));
      // sin origen: huérfano → nada
    });
    return out;
  }

  // Monto a restar del gasto, por mes: { 'YYYY-MM': { total, porCategoria: { <categoría || 'other'>: monto } } } (pesos).
  // opts.soloExistentes: solo las partes cuyo gasto ya es una transacción (S.transactions). Es lo que hay que usar al sumar
  // movimientos reales; las partes de meses futuros (todavía sin materializar) ya vienen netas en comprometidoDelMes.
  function porMes(st, opts) {
    const cents = {};
    const ids = opts && opts.soloExistentes ? new Set(((st && st.transactions) || []).map((t) => t && t.id)) : null;
    partes(st).forEach((p) => {
      if (ids && !ids.has(p.txnId)) return;
      const m = cents[p.month] || (cents[p.month] = { total: 0, porCategoria: {} }), k = p.category || 'other';
      m.total += p.cents; m.porCategoria[k] = (m.porCategoria[k] || 0) + p.cents;
    });
    const out = {};
    Object.keys(cents).forEach((mk) => {
      out[mk] = { total: cents[mk].total / 100, porCategoria: {} };
      Object.keys(cents[mk].porCategoria).forEach((k) => { out[mk].porCategoria[k] = cents[mk].porCategoria[k] / 100; });
    });
    return out;
  }

  // Atajo: lo que hay que restar del gasto de un mes ({ total, porCategoria } o ceros).
  function delMes(st, mk, opts) { return porMes(st, opts)[mk] || { total: 0, porCategoria: {} }; }

  // Lo que hay que restar del gasto REAL (movimientos existentes) de un mes: número en pesos.
  function restarMes(st, mk) { return delMes(st, mk, { soloExistentes: true }).total; }

  return { esReintegro, esIngreso, sinReintegros, partes, porMes, delMes, restarMes };
})();

if (typeof window !== 'undefined') window.CMReintegros = CMReintegros;
if (typeof module !== 'undefined' && module.exports) module.exports = CMReintegros;
