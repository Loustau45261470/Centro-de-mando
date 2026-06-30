# Spec: Historial de movimientos en overlay (Finanzas)

## Objective
Aligerar la sección principal de Finanzas moviendo la **lista de transacciones** (el historial largo) fuera de la tarjeta "💳 Actividad" hacia un overlay inmersivo dedicado, accesible desde el FAB de Finanzas y desde un botón "Ver historial →" en la propia tarjeta. La sección principal conserva todo lo demás (alta de movimiento, filtro por mes, resumen, gráfico, balance mensual). No se elimina ni se migra ningún dato: solo se relocaliza el bloque del DOM que lista las transacciones, siguiendo el patrón de overlays ya existente en el proyecto (`CMOverlay.relocate` / reubicar-y-devolver).

Usuario: Tobías (uso personal, Centro de Mando). Problema: la lista de movimientos crece y ocupa demasiado espacio en la sección principal.

## Requirements

### Must-Have
- [ ] Agregar un item **"Historial"** al abanico del FAB de Finanzas (`sd-finanzas`), junto a Proyectos / Adquisición / Presupuesto / Notas / Recordatorios.
- [ ] El item abre un overlay inmersivo (mismo sistema `CMOverlay` que los demás) con eyebrow `FINANZAS · HISTORIAL` y título "Historial de movimientos".
- [ ] El overlay aloja **la lista de transacciones** (`#activityList` + su cabecera de columnas `#activityColHdr` + su estado vacío `#activityEmpty`). El bloque se reubica **una sola vez al montar** dentro del overlay y ya **no** ocupa espacio en `#activity-card`; abrir/cerrar el overlay solo muestra/oculta el overlay (no devuelve la lista a la sección). Así la sección queda **permanentemente aligerada** — que es el objetivo.
- [ ] En la sección principal **permanecen**: botón **+ Movimiento**, filtro por mes (`#txnMonthFilter`), resumen ingresos/gastos/balance (`#txnSummaryRow`), gráfico de gastos (`#txnChartWrap`), botón y lista de balance mensual (`#toggleMonthBalance` / `#monthBalanceList`).
- [ ] En la sección principal, donde estaba la lista, queda un botón **"Ver historial →"** que abre el mismo overlay.
- [ ] El overlay es el **archivo histórico completo**: ofrece un selector de mes con **todos los meses que tengan movimientos** (no solo el actual), y al elegir cualquiera muestra **todos** los movimientos de ese mes. Ningún mes con datos queda inaccesible.
- [ ] El overlay muestra inicialmente las transacciones del **mes activo** (`txnActiveMonth`, el mismo que controla el filtro de la sección).
- [ ] El overlay replica los chips de filtro por mes en su cabecera, **sincronizados** con el estado de la sección: cambiar de mes en el overlay actualiza `txnActiveMonth` y re-renderiza tanto la lista como el resumen/gráfico de la sección, y viceversa.
- [ ] `renderActivity()` sigue siendo la única fuente de render de la lista; sigue funcionando esté el bloque en la sección o reubicado en el overlay (busca los elementos por `id`).
- [ ] Las acciones existentes sobre cada transacción (editar `openEditTxn`, borrar) siguen funcionando dentro del overlay.
- [ ] `sw.js`: bumpear `const CACHE` por tocar JS/CSS/HTML.
- [ ] Commit + push a `main` al terminar.

### Out of Scope
- Unificar overlays de dominios distintos (Notas / Presupuesto / Proyectos) en uno solo. **Descartado**: ya están agrupados por sección en cada FAB.
- Combinar Historial dentro del overlay de Presupuesto como pestaña (era la opción B; se eligió overlay dedicado).
- Migrar las transacciones a otra colección/base de datos o archivo histórico separado. Los datos siguen en `S.transactions` (Firestore). "Histórico" aquí significa relocalización de UI, no de datos.
- Cualquier cambio en el alta/edición de movimientos (`modal-add-txn` / `modal-edit-txn`) más allá de que sigan operativos.
- Paginación, archivado por antigüedad o borrado masivo del historial.

## Inputs & Outputs
- **Entrada de datos:** `S.transactions` (array existente en estado, sincronizado con Firestore). Sin cambios de esquema.
- **Entrada de usuario:** click en FAB Finanzas → "Historial", o click en "Ver historial →"; selección de mes en los chips.
- **Salida:** overlay inmersivo con la lista de movimientos del mes activo, ordenada como hoy lo hace `renderActivity()`; resumen/gráfico de la sección reflejan el mismo mes.
- **Formato:** sin cambios de formato de datos. Solo se mueve markup ya renderizado.

## Constraints
- HTML/CSS/JS puro, sin bundler ni framework. Scripts clásicos (globals compartidos).
- Reutilizar el componente `CMOverlay` (overlay-core.js) y `CMSpeedDial` (speed-dial.js); seguir el patrón de `_sfOpenBudget` / `R(...)` en `secciones-fab.js`. No reescribir lógica de finanzas existente.
- Cambio quirúrgico: tocar `index.html` (botón "Ver historial"), `secciones-fab.js` (item + opener del overlay), y mínimos ajustes en `app.js` solo si la sincronización de los chips de mes lo requiere. Evitar refactors no relacionados.
- Respetar `reduced-motion` y las reglas visuales del proyecto.
- `app.js` y `styles.css` son grandes: localizar con Grep + leer por offset, nunca el archivo entero.

## Edge Cases
- **Sin transacciones:** el overlay muestra el estado vacío existente (`#activityEmpty`, "Sin movimientos registrados") y la sección no rompe.
- **Mes sin movimientos pero con otros meses con datos:** los chips siguen mostrando todos los meses disponibles; el mes vacío muestra estado vacío.
- **Overlay abierto y cambia el mes desde sus chips:** se actualiza `txnActiveMonth`, se re-renderiza la lista en el overlay y el resumen/gráfico en la sección quedan consistentes al cerrar.
- **Cerrar el overlay:** solo se oculta el overlay; la lista permanece alojada en él (no reaparece en `#activity-card`). La sección sigue mostrando el botón "Ver historial →".
- **Reapertura repetida:** abrir/cerrar varias veces no duplica el bloque ni deja nodos huérfanos (la reubicación ocurre una sola vez, al montar).
- **FAB visible solo en Finanzas:** el item "Historial" solo es accesible cuando la pestaña Finanzas está activa (igual que el resto del abanico).
- **Plegar/desplegar lista (`toggleActivityList`)** sigue funcionando dentro del overlay.

## Definition of Done
- [ ] Dado que estoy en la pestaña Finanzas, cuando abro el FAB, entonces veo el item "Historial" en el abanico.
- [ ] Dado que toco "Historial" (o "Ver historial →" en la tarjeta), cuando se abre el overlay, entonces veo la lista de movimientos del mes activo dentro del overlay y ya **no** aparece dentro de la tarjeta de la sección.
- [ ] Dado el overlay abierto, cuando miro la sección debajo (al cerrar), entonces el filtro por mes, el resumen, el gráfico y el balance mensual siguen estando en la sección.
- [ ] Dado el overlay abierto, cuando despliego el selector de mes, entonces aparecen **todos** los meses con movimientos registrados (no solo el actual).
- [ ] Dado el overlay abierto, cuando selecciono cualquier mes pasado, entonces veo **todos** los movimientos de ese mes.
- [ ] Dado el overlay abierto, cuando cambio de mes con los chips del overlay, entonces la lista del overlay se actualiza y el resumen/gráfico de la sección reflejan ese mes.
- [ ] Dado que cierro el overlay, cuando vuelvo a la sección, entonces la lista **no** reaparece en `#activity-card` (queda alojada en el overlay), la sección sigue aligerada mostrando el botón "Ver historial →", y "+ Movimiento" sigue operativo.
- [ ] Dado que creo o edito un movimiento, cuando se guarda, entonces la lista (esté en sección u overlay) se re-renderiza correctamente.
- [ ] Verificación visual (screenshot) de la sección con la tarjeta aligerada y del overlay con el historial, antes de commit+push.
- [ ] `const CACHE` de `sw.js` bumpeado; commit y push a `main` hechos.
