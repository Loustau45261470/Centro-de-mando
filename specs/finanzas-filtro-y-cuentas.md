# Spec: Filtro de categoría en historial + gráfico de patrimonio por cuenta

## Objective
Dos mejoras a la pestaña Finanzas de Centro de Mando. Primero, permitir filtrar por categoría el overlay de "historial completo" de movimientos, que hoy muestra todas las transacciones sin forma de acotar por categoría. Segundo, permitir agregar al gráfico de patrimonio neto (línea, `nwLineChart`) la evolución individual de una o más cuentas específicas, además de la línea de patrimonio total — hoy el gráfico solo grafica el agregado (`S.nwHistory`), sin desglose por cuenta.

## Requirements

### Must-Have
- [ ] En el overlay de historial completo de movimientos, un dropdown/selector de categoría que filtre la lista mostrada (reutiliza las categorías ya definidas vía `getCatInfo`).
- [ ] El filtro de categoría se combina con el filtro de mes ya existente en el overlay (`txnHistMonthFilter`) — ambos acotan la misma lista.
- [ ] Opción "Todas las categorías" que quita el filtro.
- [ ] Nueva estructura de historial por cuenta (ej. `S.accountHistory` o campo por-cuenta agregado a cada snapshot), poblada a partir de ahora en adelante cada vez que se llama `snapshotNW()` — un punto por cuenta con `{date, accountId, balance}` (o equivalente), sin reconstrucción retroactiva.
- [ ] En el gráfico de patrimonio neto, un selector multi-select (checkboxes o similar) para elegir hasta 3 cuentas.
- [ ] Cada cuenta seleccionada se agrega como línea adicional (color distinto por cuenta, distinto del verde de "Patrimonio total"), sin reemplazar la línea del total — el total siempre visible.
- [ ] Al deseleccionar una cuenta, su línea se quita del gráfico.
- [ ] El límite de 3 cuentas seleccionadas simultáneas se enforce en la UI (deshabilitar más selección al llegar al máximo, o similar).

### Nice-to-Have (not required to pass review)
- Persistir qué cuentas estaban seleccionadas entre sesiones (localStorage/S).
- Leyenda visible identificando qué color corresponde a qué cuenta.

### Out of Scope
- Reconstrucción retroactiva del historial por cuenta a partir de transacciones pasadas.
- Buscador de texto libre por nombre de movimiento (solo filtro por categoría, no búsqueda).
- Cambios al filtro de mes/categoría de la lista del mes activo en la pestaña principal (solo aplica al overlay de historial).

## Inputs & Outputs
- Input: selección de categoría (dropdown) en el overlay de historial → filtra `S.transactions` mostradas ahí.
- Input: selección de hasta 3 cuentas (checkboxes) en la sección de patrimonio → agrega datasets al `nwLineChart`.
- Output: lista de movimientos filtrada por categoría (y mes) en el overlay; gráfico de línea con N+1 series (total + cuentas elegidas).
- Nuevo dato persistido: snapshot de saldo por cuenta en cada `snapshotNW()`, guardado en `S` (sincronizado por el mecanismo de sync existente, sin tratamiento especial).

## Constraints
- HTML/CSS/JS puro, sin framework — seguir el patrón de `finanzas.js` / `app.js` ya existente (funciones globales, Chart.js).
- No tocar la lógica de sync (`_fbSave`, `loadState`, etc.) — el nuevo campo de historial por cuenta es solo un array más dentro del estado `S`, se guarda igual que el resto.
- `snapshotNW()` ya se llama en varios puntos (ej. tras aplicar gasto pendiente) — el registro por cuenta debe colgar de esa misma función, no de un cron nuevo.
- Bumpear `CACHE` en `sw.js` al terminar (regla del proyecto).

## Edge Cases
- Cuenta seleccionada sin historial acumulado todavía (recién agregada la feature o cuenta nueva): su línea aparece con los puntos disponibles desde que existan, sin rellenar el pasado con ceros ni con el saldo actual.
- Cuenta eliminada mientras está seleccionada en el gráfico: se quita de la selección y su línea desaparece sin error.
- Overlay de historial sin transacciones de la categoría elegida: mostrar el estado vacío ya existente (`activityEmpty` o equivalente), no un error.
- Intentar seleccionar una 4ª cuenta: el selector bloquea la acción (no agrega la línea 4).
- Cambiar de mes en el overlay con un filtro de categoría activo: el filtro de categoría se mantiene aplicado sobre el nuevo mes.

## Definition of Done
- [ ] Dado el overlay de historial abierto, cuando se elige una categoría del dropdown, entonces la lista solo muestra transacciones de esa categoría (respetando también el mes activo del overlay).
- [ ] Dado el dropdown en "Todas las categorías", cuando se aplica, entonces se ven todas las transacciones del mes/rango activo sin restricción de categoría.
- [ ] Dado el gráfico de patrimonio, cuando se selecciona una cuenta en el multi-select, entonces aparece una línea nueva con su evolución de saldo (color propio) sin ocultar la línea de patrimonio total.
- [ ] Dado que ya hay 3 cuentas seleccionadas, cuando se intenta seleccionar una 4ª, entonces la UI lo impide.
- [ ] Dado que pasan varios días de uso normal de la app, cuando se abre el gráfico de patrimonio, entonces cada cuenta seleccionada muestra un punto por cada día en que se ejecutó `snapshotNW()` desde que se implementó la feature.
