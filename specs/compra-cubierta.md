# Compra con tarjeta que cubre otra persona ("La cubre Papá")

Pedido 2026-10-27. Caso real: cuota de la facultad (~320 mil/mes) pagada con tarjeta en 12 cuotas. Papá da a fin de
mes entre 400 y 500 mil: la cuota del mes + un extra. En oct-2026 se compra la cuota de octubre + la de febrero 2027
(oferta) en una sola compra de ~570 mil en 12 cuotas. Papá va a pagar la de febrero recién en febrero 2027.

## Objetivo
- La compra ocupa el crédito y genera las cuotas/vencimientos igual que cualquier compra.
- NO cuenta como gasto (ni en el mes, ni en presupuesto, ni en informes).
- El patrimonio no baja: lo que Papá debe queda como saldo a cobrar.
- Cuando Papá paga, la parte que cubre la cuota cancela lo pendiente (no es ingreso) y el resto entra como ingreso.
- En la compra queda escrito qué meses cubre y cuáles están cobrados.

## Modelo
- Cargo: `cover: { accountId, periods: [{ month:'YYYY-MM', amount, collected: 0 }] }`. Suma de `amount` = total de la compra.
- Cuenta a cobrar: cuenta existente de tipo `prestamo` (ya suma al patrimonio en `_nwParts`). Al elegir quién paga
  (texto, ej. "Papá") se usa la cuenta `prestamo` llamada `A cobrar · <nombre>`; si no existe se crea.
- Alta: saldo de la cuenta a cobrar += total. `materializeCardExpenses` NO genera gastos `cc:` para cargos con `cover`.
  Límite, cuotas, vencimientos y pagos automáticos no cambian (salen del cargo).
- Edición: si ningún período tiene `collected > 0`, se puede editar todo y el saldo a cobrar se ajusta por la diferencia
  de lo no cobrado. Con algo cobrado: no se editan monto, cuotas ni períodos (mensaje claro).
- Borrado: solo sin cobros (si no, mensaje "deshacé los cobros primero"); resta del saldo a cobrar lo no cobrado.
- No combinable con descuento/reintegro ni con el modo adelanto de efectivo.

## Cobro
- En la fila de la cuenta a cobrar (Finanzas → cuentas): botón "Registrar cobro".
- Modal: monto total recibido + cuenta donde entra. Muestra la división en vivo:
  "320.000 cubren la cuota de octubre 2026 · 130.000 entran como ingreso".
- Reparto: a los períodos pendientes con `month <= mes actual`, del más viejo al más nuevo, hasta agotar el monto;
  lo que sobra es ingreso (transacción `income` normal, nombre `Extra · <nombre>`, en la cuenta elegida).
- Parte aplicada: saldo cuenta destino += aplicado, saldo cuenta a cobrar −= aplicado, `collected` del período sube.
  Se guarda el detalle en `S.coverCollections: [{ id, date, accountId, toAccountId, applied:[{chargeId, month, amount}], extraTxnId }]`.
- Si no hay períodos vencidos pendientes, todo es ingreso (y se avisa en la división).
- Deshacer un cobro (desde la compra en Tarjetas → Compras): revierte saldos y `collected`; el ingreso extra se borra
  junto con él.

## UI
- Formulario de compra con tarjeta: opción "La cubre otra persona" → campo "Quién" (default "Papá") + lista de meses
  que cubre (mes + monto). Default: una fila con el mes de la compra y el total. Botón "+ otro mes". Validar suma = total.
- Tarjetas → Compras: etiqueta "La cubre Papá" y estado por mes: "Oct 2026 ✓ cobrado · Feb 2027 pendiente".
- Todo usable a 375px (iPhone).

## Aceptación (caso real)
1. Compra 570.000 en 12 cuotas, cubre oct-2026 320.000 + feb-2027 250.000 → crédito usado +570.000, sin gastos `cc:`,
   "A cobrar · Papá" = 570.000, patrimonio igual que antes de la compra.
2. Cobro de 450.000 en oct-2026 → 320.000 aplicados a octubre, ingreso de 130.000; "A cobrar" = 250.000.
3. Cobro en feb-2027 de 480.000 → 250.000 a febrero, 230.000 ingreso; "A cobrar" = 0.
4. Deshacer el cobro 2 → todo vuelve como estaba en 1 (saldo, collected, sin el ingreso).
5. Borrar la compra sin cobros → crédito, saldo a cobrar y patrimonio vuelven al estado previo.
