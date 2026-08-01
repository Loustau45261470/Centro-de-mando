# Spec: Orden por fecha en Plan de Materias

## Objective
En la pestaña **Conocimiento** del Centro de Mando, la tarjeta "📅 Plan de Materias" muestra hoy las materias en el orden fijo del array `S.lawPlan` (el orden del plan de estudios, por año y semestre). Tobías quiere poder hacer clic en el encabezado **Fecha / Modalidad** para reordenar la tabla por fecha real de rendición — de más cercano a más lejano y viceversa — sin perder la posibilidad de volver al orden original. Es una ayuda de lectura: sirve para ver de un vistazo qué materia viene primero, sin importar a qué año del plan pertenece.

## Requirements

### Must-Have
- [ ] El `<th>` de "Fecha / Modalidad" en la tabla de Plan de Materias es clickeable y se ve clickeable (cursor pointer + indicador de estado de orden, ej. ▲ / ▼ / neutro).
- [ ] Ciclo de tres estados al hacer clic, en este orden: **1er clic** → ascendente (más cercano en el tiempo primero) → **2do clic** → descendente (más lejano primero) → **3er clic** → orden original del plan (el orden tal cual está en `S.lawPlan`) → y vuelve a empezar.
- [ ] El parser de `target` (texto libre) produce una fecha comparable con estas reglas:
  - Mes + año (`"Septiembre 2026"`, `"Noviembre 2026"`, `"Diciembre 2026"`) → día 1 de ese mes de ese año.
  - `"Promoción 1° sem. YYYY"` (o cualquier variante que indique **1er semestre**) → **junio** de ese año.
  - `"Promoción 2° sem. YYYY"` (o variante de **2do semestre**) → **noviembre** de ese año.
  - `"Libre / Online YYYY"` y cualquier otro texto **sin mes ni semestre pero con año** → tratado por año; se ubica al final de ese año (diciembre).
  - `"Sin fecha"` y cualquier texto no parseable (sin año) → **siempre al final de la tabla**, tanto en orden ascendente como descendente.
- [ ] El orden **no se persiste**: no se guarda en `S`, no se escribe en Firestore, y al recargar la app o volver a entrar a la pestaña la tabla arranca en el orden original del plan.
- [ ] Reordenar **no altera** `S.lawPlan` ni dispara `saveState()` — es solo una vista.
- [ ] Los botones de editar (✏️) y borrar (🗑️) de cada fila siguen funcionando correctamente con la tabla ordenada (operan sobre el `id` correcto de la materia, no sobre la posición).
- [ ] Agregar, editar o borrar una materia mientras hay un orden activo re-renderiza la tabla **conservando el orden activo**.

### Nice-to-Have (not required to pass review)
- Ninguna.

### Out of Scope
- Ordenar por la columna **Materia** (alfabético) — explícitamente descartado.
- Persistir el orden entre sesiones o sincronizarlo entre dispositivos.
- Cambiar el formato de `target` de texto libre a un campo de fecha estructurado.
- Ordenar cualquier otra tabla de la app (hitos/`lawMilestones`, etc.).

## Inputs & Outputs

**Input:** `S.lawPlan` — array de objetos `{ id, subject, target }`, donde `target` es un string libre. Valores reales observados en los datos:
- `"Septiembre 2026"`, `"Noviembre 2026"`, `"Diciembre 2026"` (mes + año)
- `"Promoción 1° sem. 2026"`, `"Promoción 2° sem. 2026"` (semestre + año)
- `"Libre / Online 2027"` (solo año)
- `"Sin fecha"`

**Input de usuario:** clics sobre el `<th>` de Fecha / Modalidad.

**Output:** el mismo HTML de tabla que ya genera `renderLawPlan()`, con las filas reordenadas según el estado de orden actual (variable de módulo, no parte de `S`), y el encabezado mostrando el indicador del estado activo.

## Constraints
- HTML/CSS/JS puro, sin bundler ni framework. Scripts clásicos, scope global compartido.
- El cambio va en [abogacia.js](abogacia.js) (función `renderLawPlan()` en la línea ~329 y helpers cercanos como `_lawTargetTag()` en la línea ~165). Si hace falta CSS para el encabezado clickeable, va en [styles.css](styles.css) siguiendo el estilo existente de `.law-tbl`.
- El estado del orden vive en una variable de módulo/global del propio archivo (ej. `_lawPlanSort`), **nunca** dentro de `S`.
- Cambio quirúrgico: no refactorizar `renderLawPlan()` más allá de lo necesario, no tocar la lógica de sync, no tocar `S.lawPlan`.
- Al tocar `.js` o `.css` hay que bumpear `const CACHE` en [sw.js](sw.js) y hacer commit + push a `main`, y verificar el deploy de GitHub Pages con `gh run list` antes de dar el cambio por terminado.

## Edge Cases
- **`target` es `"Sin fecha"`**: la materia va al final de la tabla, en ambos sentidos del orden (asc y desc). Nunca al principio.
- **`target` no parseable / vacío / sin año**: mismo tratamiento que `"Sin fecha"` — al final.
- **Dos materias con la misma fecha resuelta** (ej. cuatro materias en `"Septiembre 2026"`): mantienen entre sí el orden original del plan (sort estable).
- **Materia con solo año** (`"Libre / Online 2027"`): se ubica en diciembre de ese año, es decir después de todas las materias con mes concreto de ese mismo año.
- **`S.lawPlan` vacío**: la tabla se renderiza vacía y el encabezado sigue siendo clickeable sin romper nada (ningún error en consola).
- **Una sola materia**: hacer clic cambia el indicador del encabezado pero la tabla se ve igual; no rompe.
- **Se agrega/edita/borra una materia con orden activo**: la tabla se vuelve a renderizar aplicando el mismo estado de orden que estaba activo.
- **Mayúsculas/acentos en `target`**: el parser normaliza a minúsculas antes de matchear meses y semestres (`"septiembre"`, `"promoción"`, `"promocion"`).

## Definition of Done
- [ ] Dado el plan de materias cargado con los datos reales, cuando hago clic una vez en "Fecha / Modalidad", entonces las materias quedan de más cercana a más lejana en el tiempo: las de `"Promoción 1° sem. 2026"` (junio) antes que las de `"Septiembre 2026"`, esas antes que `"Promoción 2° sem. 2026"` y `"Noviembre 2026"`, esas antes que `"Diciembre 2026"`, y `"Libre / Online 2027"` después de todo 2026.
- [ ] Dado ese orden ascendente, cuando hago clic una segunda vez, entonces el orden se invierte (más lejano primero) y las materias `"Sin fecha"` siguen al final, no al principio.
- [ ] Dado el orden descendente, cuando hago clic una tercera vez, entonces la tabla vuelve exactamente al orden original de `S.lawPlan` (mismo orden fila por fila que antes del primer clic).
- [ ] Dado cualquier orden aplicado, cuando recargo la página, entonces la tabla vuelve al orden original del plan.
- [ ] Dado un orden aplicado, cuando reviso `S.lawPlan` en consola, entonces el array conserva su orden original y no se disparó ningún guardado a Firestore.
- [ ] Dado el orden ascendente activo, cuando hago clic en editar (✏️) sobre una fila, entonces se abre el modal con los datos de **esa** materia (no de otra), y al guardar la tabla se re-renderiza manteniendo el orden ascendente.
- [ ] Dado el orden ascendente activo, cuando borro una materia, entonces desaparece la fila correcta y el orden ascendente se mantiene.
- [ ] El encabezado "Fecha / Modalidad" muestra visualmente en cuál de los tres estados está (asc / desc / sin orden).
- [ ] No hay errores en la consola del navegador en ninguno de los tres estados.
- [ ] `sw.js` con `CACHE` bumpeado, commit y push a `main` hechos, y el run de "pages build and deployment" verificado en `success`.
