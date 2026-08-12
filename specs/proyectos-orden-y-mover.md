# Spec: Proyectos — orden automático y mover ítems

## Objective
La pestaña **Proyectos** de Centro de Mando muestra hoy los ítems en orden de creación: lo viejo y lo ya completado queda arriba y lo nuevo o urgente queda al fondo, obligando a scrollear para ver lo que importa. Además, cuando una tarea o carpeta quedó creada en el lugar equivocado, no hay forma de moverla: solo se puede borrar y volver a crear. Este cambio agrega (1) un **orden automático** en todos los niveles del árbol de Proyectos que pone arriba lo pendiente y urgente y hunde lo completado, y (2) un **modal "Mover a…"** que permite reubicar cualquier nodo (tarea, carpeta o proyecto entero) a cualquier destino del árbol, incluso a otra sección.

## Requirements

### Must-Have

**Orden automático (Problema 1)**
- [ ] El orden se aplica en **todos los niveles** del árbol de Proyectos: proyectos de primer nivel de cada sección, carpetas, subcarpetas y tareas, con la misma regla en todos.
- [ ] Se aplica en las 5 solapas de Proyectos: `vida`, `finanzas`, `salud`, `conocimiento`, `ia`.
- [ ] Orden exacto, de arriba hacia abajo, dentro de cada lista de hermanos:
  1. **Pendientes** (`done === false`) **con fecha de vencimiento vencida o que vence hoy** (`dueDate <= hoy`), ordenadas por fecha ascendente (la más vencida primero). Empate de fecha → prioridad (1 antes que 2, 2 antes que 3).
  2. **Pendientes con fecha futura**, ordenadas por fecha ascendente (la más próxima primero). Empate de fecha → prioridad.
  3. **Pendientes sin fecha pero con prioridad**, ordenadas por prioridad (1, 2, 3).
  4. **Pendientes sin prioridad y sin fecha**, en su orden de creación original.
  5. **Completadas** (`done === true`), al fondo, en su orden de creación original.
- [ ] El orden se recalcula **al renderizar**, sin reescribir el array guardado (ver Constraints). Marcar una tarea como hecha, cambiarle la prioridad o la fecha reordena la lista en el acto.
- [ ] Al crear una tarea/carpeta/proyecto nuevo (sin prioridad ni fecha, no completado), aparece en el grupo 4 — es decir, arriba de todo lo completado, sin necesidad de scrollear hasta el fondo.

**Mover ítems (Problema 2)**
- [ ] Cada nodo del árbol (tarea, carpeta, subcarpeta y proyecto de primer nivel) tiene una acción **"Mover a…"** que abre un modal.
- [ ] El modal permite navegar el árbol destino: elegir **sección** (Vida / Finanzas / Salud / Conocimiento / IA) → luego bajar por proyectos → carpetas → subcarpetas, con un botón de "subir un nivel" o breadcrumb para volver.
- [ ] Destinos válidos: la **raíz de cualquier sección** (el nodo pasa a ser proyecto de primer nivel de esa sección) o **cualquier proyecto/carpeta/subcarpeta de cualquier sección**.
- [ ] Un botón explícito confirma el destino actualmente abierto en el modal (ej. "Mover acá").
- [ ] Al mover una carpeta o proyecto, **se lleva todo su contenido** (subárbol completo, con propiedades intactas: `done`, `priority`, `dueDate`, `description`, `notes`, `advances`, `progress`, `children`).
- [ ] Está **bloqueado** mover un nodo dentro de sí mismo o dentro de cualquiera de sus descendientes: esos destinos aparecen deshabilitados en el modal y no son navegables como destino confirmable.
- [ ] Mover entre secciones distintas funciona: el nodo desaparece del árbol de origen y aparece en el de destino, y ambos árboles quedan guardados.
- [ ] Al confirmar el movimiento: se cierra el modal, se muestra un toast de confirmación con el nombre del destino, y la vista se re-renderiza con el nuevo orden aplicado.

### Nice-to-Have (not required to pass review)
- Ninguna solicitada.

### Out of Scope
- Recordatorios, Objetivos trimestrales, Abogacía/Plan de materias y cualquier otra lista de la app: mantienen su orden actual (decisión explícita de Tobías — siguen otra lógica y es un cambio más grande).
- El árbol legacy "Notion" de la sección Workspace (`notion_workspace_v2`, segundo IIFE de `workspace.js`): no tiene `done`/`priority`/`dueDate` y queda tal cual.
- Drag & drop para mover ítems.
- Reordenamiento manual dentro de una lista (el orden lo decide el algoritmo).
- Copiar/duplicar un nodo (el modal solo mueve).
- Toggle de usuario para desactivar el orden automático.

## Inputs & Outputs

**Entrada** — el árbol de cada sección, ya existente en el estado de la app. Cada nodo:

```js
{ id, label, icon, open, description, notes, detailOpen,
  done: false, priority: '' | '1' | '2' | '3',
  dueDate: '' | 'YYYY-MM-DD',
  progress, advances, children: [] }
```

**Salida del orden** — el mismo árbol, renderizado con los hermanos de cada nivel ordenados según la regla. Los datos persistidos no cambian de forma.

**Salida del movimiento** — el nodo removido de su array padre de origen y agregado al array `children` del destino (o al array raíz de la sección elegida). Ambas secciones afectadas se guardan por el flujo existente (`saveTree` → `saveState` → sync Firestore).

## Constraints
- Stack existente: HTML/CSS/JS puro, scripts clásicos, sin bundler. Sin dependencias nuevas.
- Archivos a tocar: `workspace.js` (lógica de orden y de mover), `index.html` (markup del modal), `styles.css` (estilos del modal, con tokens de tema existentes). Bumpear `const CACHE` en `sw.js`.
- **El orden es de capa de vista:** ordenar una copia de los hermanos al renderizar, sin mutar ni reescribir los arrays guardados. Motivo: reescribir el árbol en cada render generaría escrituras de sync innecesarias y riesgo sobre el estado compartido entre dispositivos (ver regla crítica de sync en `CLAUDE.md`).
- El movimiento **sí** muta el árbol y se persiste, usando `saveTree(tab, ...)` — el camino de guardado ya existente. No tocar `_fbSave`, `_applyRemoteState` ni `loadState`.
- El modal debe ser usable en celular (pantalla angosta, navegación por taps, sin arrastre).
- La comparación de "vencida o vence hoy" usa la fecha activa de la app (`getActiveDate()`), no `new Date()` directo, para respetar el modo de fecha simulada existente.

## Edge Cases
- **`dueDate` vacío, malformado o no parseable:** el nodo se trata como "sin fecha" (cae al grupo 3 si tiene prioridad, al 4 si tampoco tiene).
- **`priority` vacío o con valor desconocido:** se trata como "sin prioridad".
- **Dos nodos con misma fecha y misma prioridad:** se mantiene entre ellos el orden de creación original (orden estable, sin saltos aleatorios entre renders).
- **Una carpeta completada con hijos pendientes:** la carpeta va al fondo igual (el criterio es el `done` del propio nodo); sus hijos se ordenan normalmente adentro.
- **Nodo con `done === true` y fecha vencida:** va al fondo — `done` gana sobre cualquier otro criterio.
- **Destino = la carpeta donde el nodo ya está:** el modal lo permite pero el resultado es un no-op; se cierra sin duplicar ni perder el nodo.
- **Intento de mover un nodo dentro de sí mismo o de un descendiente:** ese destino aparece deshabilitado; si se intenta igual, la operación se rechaza y el árbol queda intacto.
- **Mover el único hijo de una carpeta:** la carpeta queda vacía y se conserva (no se borra automáticamente).
- **Mover un proyecto de primer nivel dentro de otro proyecto:** permitido; pasa a ser carpeta hija y su icono/propiedades no cambian.
- **Sección destino sin ningún proyecto todavía:** el modal muestra la raíz vacía y permite igualmente confirmar "Mover acá".
- **El nodo movido tenía el panel de detalle abierto:** el detalle se cierra al mover, para no quedar apuntando a una ruta vieja.
- **Sin conexión:** el movimiento se guarda en localStorage y sincroniza cuando vuelve la conexión, por el flujo de sync existente. No se agrega manejo especial.

## Definition of Done
- [ ] Dado un proyecto con 3 tareas — una completada, una sin fecha ni prioridad, y una con fecha de ayer — cuando se abre la solapa, entonces se ven en este orden: la vencida, la sin fecha ni prioridad, la completada.
- [ ] Dadas dos tareas pendientes con fecha de mañana y pasado mañana, cuando se renderiza, entonces la de mañana aparece arriba.
- [ ] Dadas dos tareas pendientes con la misma fecha de vencimiento y prioridades 1 y 3, cuando se renderiza, entonces la de prioridad 1 aparece arriba.
- [ ] Dada una tarea pendiente con prioridad 2 y sin fecha, y otra pendiente sin prioridad y sin fecha, cuando se renderiza, entonces la de prioridad 2 aparece arriba.
- [ ] Dada una tarea pendiente en el tope de la lista, cuando se la marca como completada, entonces baja al fondo sin recargar la página.
- [ ] Dado cualquier nivel del árbol (proyecto raíz, carpeta, subcarpeta), cuando se lo despliega, entonces sus hijos siguen exactamente el mismo orden.
- [ ] Dada una tarea creada nueva en un proyecto que ya tiene tareas completadas, cuando se la crea, entonces aparece por encima de las completadas sin necesidad de scrollear.
- [ ] Dada una tarea en Vida, cuando se usa "Mover a…" y se elige una carpeta de Finanzas, entonces la tarea desaparece de Vida, aparece en esa carpeta de Finanzas, y sigue ahí después de recargar la página.
- [ ] Dada una carpeta con 2 subcarpetas y 5 tareas, cuando se la mueve a otro proyecto, entonces llega con todo su contenido y sus propiedades (fechas, prioridades, notas, avances) intactas.
- [ ] Dada una carpeta abierta en el modal de mover, cuando se navega hacia su propio subárbol, entonces esos destinos están deshabilitados y no se puede confirmar el movimiento.
- [ ] Dado un nodo cualquiera, cuando se lo mueve a la raíz de una sección, entonces queda como proyecto de primer nivel de esa sección.
- [ ] Después de mover, en un segundo dispositivo con la misma cuenta, cuando se recarga, entonces el nodo aparece en su nueva ubicación (sync verificado).
- [ ] `const CACHE` de `sw.js` bumpeado y deploy de GitHub Pages verificado con `gh run list` en estado `success`.
