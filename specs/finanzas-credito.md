# Spec: Finanzas — Crédito, movimientos entre cuentas y balance real

## Objective
Agregar a la pestaña Finanzas del Centro de Mando el concepto de **crédito**: Tobías usa 3 tarjetas por conveniencia, respaldadas por plata en Ualá. Hoy no se ve cuánto crédito hay usado/disponible, las compras en cuotas no se reparten en los meses en que realmente se pagan, y los cambios de lugar de la plata (efectivo↔Ualá, Ualá↔inversiones, préstamos) se calculan a mano. El objetivo es que el cash disponible, los gastos por categoría, los presupuestos y el patrimonio reflejen la realidad sin cálculos mentales ni registros duplicados. Se integra como funciones dentro de las secciones actuales (no es una pestaña nueva).

## Requirements

### Must-Have

**1. Tarjetas y utilización de crédito**
- [ ] Alta/edición de tarjetas con: nombre, límite, día de cierre, día de vencimiento, usado inicial. Datos iniciales:
  - Naranja: límite 1.000.000, cierra 27, vence 10 del mes siguiente, usado 865.000.
  - Mercado Pago: límite 425.000, cierra 5, vence 10, usado 357.000.
  - Galicia: límite 1.000.000, cierra 29, vence 11, usado 0.
- [ ] Vista de utilización: por tarjeta y total, mostrando usado, disponible, límite y % de uso (aro/barra con la estética del Centro).
- [ ] "Usado" = todo lo consumido y aún no pagado (facturado + no facturado). El pago del resumen en su fecha libera el límite.
- [ ] Las cuotas viejas ya registradas como gasto (≈ $1,2M) NO se vuelven a registrar: el usado inicial es un saldo de apertura, sin impacto en gastos.

**2. Tres modalidades de compra con tarjeta**
- [ ] **Consumo inmediato, 1 pago:** el gasto cuenta en el mes de la compra (categorías y presupuesto); la salida de cash ocurre en la fecha de vencimiento del resumen correspondiente.
- [ ] **Consumo diferido en cuotas** (ej. alimento de mascotas para 5 meses, pagado en 3 cuotas): el gasto se reparte parejo en los N meses de consumo indicados; la salida de cash es 1 cuota por vencimiento, según las cuotas.
- [ ] **Consumo inmediato en cuotas** (ej. carne/jabón en 3 cuotas por beneficio): el gasto completo se registra en el mes de la compra; la salida de cash se reparte en las cuotas en sus vencimientos.
- [ ] El resumen en el que cae cada compra/cuota se determina con el día de cierre de la tarjeta (compra después del cierre → resumen siguiente).

**3. Calendario de salidas futuras**
- [ ] Calendario de gastos y vencimientos futuros de al menos 12 meses adelante, alimentado por cuotas, resúmenes de tarjeta y estacionales.
- [ ] Los registros futuros impactan en cash solo en el día de pago/mes que corresponde (nunca antes).

**4. Plata de terceros pasada por la tarjeta**
- [ ] Tipo de registro "Adelanto con tarjeta": un tercero da plata (efectivo o virtual) a cambio de usar el cupo de Tobías. Entra directo a la cuenta correspondiente, no es ingreso ni gasto, y la salida se programa por cuotas/vencimientos como cualquier compra con tarjeta.
- [ ] Equivalente para "cambio de compra por efectivo" (consumo de tarjeta que se convierte en efectivo): consume crédito, no cuenta como gasto.

**5. Movimientos entre cuentas ("Mover plata")**
- [ ] Función única que resta de una cuenta y suma a otra (efectivo, Ualá, inversiones, deudas a favor/en contra) sin tocar ingresos ni gastos y sin cálculo manual.
- [ ] Préstamos: prestar resta de Ualá y suma a la cuenta de deuda a favor de la persona (Didi/novia/etc.); cuando paga, la operación inversa. Idem deudas en contra.
- [ ] Efectivo↔digital (te dan efectivo, vos transferís digital) cubierto por la misma función.
- [ ] **Compra de activo:** mueve cash→inversiones, NO aparece en Movimientos; se registra en el historial de transacciones de la cartera.
- [ ] **Venta de activo:** capital vuelve de inversiones a Ualá; la **ganancia/pérdida** se agrega además a Movimientos bajo categoría "Inversiones".

**6. Historial de transacciones en el overlay de Cartera**
- [ ] Mientras un activo siga en cartera, se conservan todas sus compras y ventas (fecha, cantidad, precio).
- [ ] Al venderse por completo, el detalle se colapsa en un único registro: fecha de compra, fecha de venta, % de ganancia/pérdida.
- [ ] Costo de las ventas parciales por **precio promedio ponderado**.
- [ ] Vista de compras sobre el gráfico de precio del activo (referencia: imagen "Mis compras reales · GOOGL"), con la estética del Centro.

**7. Presupuestos**
- [ ] El día 1 de cada mes se crea la base del presupuesto copiando los límites tal como quedaron el último día del mes anterior (no meses viejos).
- [ ] Gastos estacionales (regalos de Navidad, Día de la Madre/Padre, aniversarios, cumpleaños, gastos de la facultad): se crean/editan/eliminan por persona o evento; en su mes se cargan solos en el presupuesto y Tobías solo ajusta el número final.

**8. Dos vistas de saldo + patrimonio**
- [ ] **Cash disponible:** efectivo + Ualá (virtual y físico) + deudas a favor (lo que otras personas le deben a Tobías). No incluye tarjetas ni inversiones. No existen "deudas en contra" con personas: Tobías no le debe a nadie; su única deuda es el crédito de las tarjetas.
- [ ] **Balance real:** Cash disponible − Crédito usado + Inversiones y bonos (las deudas a favor ya están dentro del Cash; no se suman dos veces).
- [ ] **Patrimonio total** = Balance real. Es el valor que usan gráficos, logros y JARVIS (hoy lee `nwHistory`). Solo pesos por ahora (sin dólares ni tipo de cambio).

**9. Historial de patrimonio**
- [ ] El gráfico de patrimonio conserva todos los puntos desde ahora (no se pierden meses anteriores) y ofrece vistas de 1, 3, 6, 9 y 12 meses y "todo". No se recupera lo ya perdido.
- [ ] Primero se diagnostica con evidencia por qué hoy se pierden los meses (regla global §0), antes de cambiar nada.

**10. Gráficos y estadísticas**
- [ ] Gráficos adaptados al estilo visual del Centro, inspirados en las capturas: utilización de crédito, relación deuda-ingresos, tabla de flujo de efectivo (cantidad, promedio por día, promedio por registro, total). Pronóstico de saldo y tendencia de presupuesto: fuera de alcance (ver abajo).
- [ ] Ratios: deuda / ingreso mensual promedio y deuda / patrimonio.

### Nice-to-Have (not required to pass review)
- Alertas push de cierre/vencimiento de cada tarjeta (vía `deadlines.js`).
- Sugerencia de qué tarjeta usar según cierre más favorable.

### Out of Scope
- Reconstruir el historial de patrimonio ya perdido.
- Pronóstico de saldo, tendencia de presupuesto y compras dibujadas sobre el gráfico de precio (recortado el 2026-10-20; quizás nunca).
- Dólares / tipo de cambio.
- Historial de compras y ventas de la cartera: se arma sobre los lotes que ya trae IOL (no carga manual).
- Registrar las cuotas anteriores (ya están contabilizadas como gasto).
- Conexión automática con bancos/Ualá.
- Pestaña nueva (todo va dentro de Finanzas / overlay de Cartera).

## Inputs & Outputs
- **Entrada:** datos de tarjetas; compras con modalidad (inmediato 1 pago / diferido en cuotas con N meses de consumo / inmediato en cuotas); adelantos con tarjeta; movimientos entre cuentas; compras/ventas de activos; estacionales.
- **Salida:** usado/disponible por tarjeta y total; calendario ≥12 meses de salidas; cash disponible, balance real y patrimonio; gastos distribuidos por categoría/mes; presupuestos mensuales; historial de transacciones; gráficos y ratios.
- **Persistencia:** dentro del estado `S` y Firestore (`appdata/lifedash_v2`), respetando la arquitectura de sync (no tocar `_fbSave`/`loadState`/`_applyRemoteState`).

## Constraints
- HTML/CSS/JS puro, scripts clásicos, Chart.js; sin bundler. Código en `finanzas.js` (y `app.js` solo donde ya vive el núcleo).
- Cada cambio de `.js`/`.css`: bumpear `const CACHE` en `sw.js` y el `?v=` correspondiente en `index.html`.
- Cualquier entidad con fecha se registra en `deadlines.js` (fuente única).
- Datos de sync: un cambio a la vez, con diagnóstico primero; agregar entradas a `fixes.json` por bugs no triviales.
- Deploy: push a main + verificar Actions `success`.
- Estética: la del Centro (no copiar la de la app de las capturas).
- Métricas honestas y sin jerga en pantalla (ver memoria del proyecto).

## Edge Cases
- Compra el día exacto del cierre: cae en el resumen siguiente (ante la duda, siempre el siguiente).
- Cuota que cae en día 31 o febrero: el vencimiento es el día configurado de la tarjeta; el mes de consumo no se corre.
- Borrar/editar una compra en cuotas: recalcula todas sus cuotas futuras y libera el crédito correspondiente; no toca cuotas ya pagadas sin confirmación.
- Pago del resumen anticipado: se registra como pago y libera límite en ese momento.
- Mover plata que deja una cuenta en negativo: se permite con aviso visible, no se bloquea.
- Vender más unidades de las que hay en cartera: se rechaza con mensaje.
- Venta total y posterior recompra del mismo activo: se abre un registro nuevo, el anterior queda cerrado.
- Estacional de persona eliminada: deja de cargarse; los meses ya pasados no cambian.
- Sin datos en el período en gráficos: mensaje claro, no ejes vacíos ni 0% engañoso.
- Usado > límite (sobregiro): se muestra >100% y se marca en rojo.

## Definition of Done
- [ ] Given las 3 tarjetas cargadas, when abro Finanzas, then veo usado/disponible/% de Naranja (865.000/135.000), Mercado Pago (357.000/68.000), Galicia (0/1.000.000) y el total.
- [ ] Given una compra de 50.000 inmediata en 1 pago el día 15 con Naranja, when se registra, then el gasto cuenta en octubre y el cash baja recién el día 10 del mes siguiente.
- [ ] Given una compra de 90.000 diferida (5 meses de consumo, 3 cuotas), when se registra, then cada uno de los 5 meses muestra 18.000 de gasto y el cash baja 30.000 en cada uno de los 3 vencimientos.
- [ ] Given una compra de 90.000 inmediata en 3 cuotas, when se registra, then el gasto completo está en el mes de compra y el cash baja 30.000 × 3 en los vencimientos.
- [ ] Given un adelanto con tarjeta de 100.000 en 2 cuotas, when se registra, then entra a la cuenta elegida, no suma ingreso ni gasto, y consume 100.000 de crédito.
- [ ] Given "Mover plata" Ualá→Inversiones de 200.000, when confirmo, then Ualá −200.000, Inversiones +200.000 y los totales de gastos/ingresos no cambian.
- [ ] Given una venta con ganancia, when confirmo, then el capital vuelve a Ualá y aparece en Movimientos solo la ganancia, categoría Inversiones.
- [ ] Given un activo vendido por completo, when miro el historial, then queda un único registro con fecha de compra, fecha de venta y % de resultado.
- [ ] Given el 1° de un mes, when se abre la app, then el presupuesto del mes nuevo tiene los límites del último día del anterior.
- [ ] Given un estacional "Navidad – mamá" en diciembre, when llega diciembre, then aparece precargado en el presupuesto y puedo editar el monto; si lo elimino no vuelve.
- [ ] Given efectivo, Ualá, deudas, crédito e inversiones cargados, when comparo vistas, then Cash = efectivo+Ualá+deudas a favor, Balance real = Cash − Crédito usado + Inversiones y bonos, Patrimonio = Balance real.
- [ ] Given pasan 2 meses, when abro el gráfico de patrimonio, then los puntos de ambos meses siguen y las vistas 1/3/6/9/12 meses filtran correctamente.
- [ ] Given el calendario, when lo abro, then muestra ≥12 meses con cuotas y resúmenes en sus fechas reales.
- [ ] Gate: la suite Playwright del proyecto pasa, el verificador ciego da PASS, y el run de Pages termina en `success`.

## Decisiones cerradas
- Deudas con personas: solo existen las que ellas tienen con Tobías (suman). Nunca resta.
- Compra el día del cierre → resumen siguiente.
- Usado inicial (865.000 / 357.000) = total pendiente de pago de ahí en adelante, incluido el vencimiento del 10 del mes próximo (facturado + por facturar).

## Open Questions
- Lista inicial de estacionales y montos: se carga después, desde la UI.
