# Spec: Notas de estudio + Ideas (Conocimiento) y Anotaciones de Finanzas

## Objective
Ampliar el sistema de notas del Centro de Mando con tres capacidades nuevas para Tobías:
1. **Ideas** — una categoría plana más dentro del overlay de Notas de **Conocimiento**, idéntica a las existentes.
2. **Notas de estudio** — una sección jerárquica dentro del mismo overlay de Conocimiento: carpetas de **materias** (autoagrupadas por un tag de **año**) que contienen **páginas** (título + anotaciones en texto plano), mostradas con vista previa.
3. **Anotaciones de Finanzas** — un overlay nuevo, simple y compacto, accesible desde el speed-dial de la sección Finanzas: lista plana de notas sin categorías, bien condensadas.

Reutiliza la infraestructura existente (`notas-intelecto.js`, clases CSS `.nt-*`, primitivo `CMOverlay`, `CMSpeedDial`) y el sync vía `S` + `saveState()`.

## Requirements

### Must-Have

#### A. Categoría "Ideas" (Conocimiento)
- [ ] Aparece como un rectángulo más en el home del overlay de Notas de Conocimiento (`notasOpen()`), junto a Reflexiones / Aprendizaje / Anotaciones personales.
- [ ] Comportamiento idéntico a las categorías de texto existentes: cada idea es una nota con **título, texto, fecha y etiqueta opcional**, en lista plana.
- [ ] Soporta el mismo CRUD, búsqueda, orden por fecha y filtro por etiqueta que las demás categorías.
- [ ] Se persiste en `S.notas` con `categoria: 'ideas'` (mismo array que las otras notas de Conocimiento).
- [ ] Tiene su propio ícono line-art (estilo JARVIS, stroke `currentColor`), accent y tag, coherentes con las demás.

#### B. Sección "Notas de estudio" (Conocimiento)
- [ ] Aparece como un rectángulo más en el home del overlay de Notas de Conocimiento, con su ícono/accent/tag propios.
- [ ] Al abrirla, muestra la lista de **materias** (carpetas), no notas planas.
- [ ] Cada materia tiene: **nombre** y un **tag de año** (texto libre, ej. `2024`, `3er año`).
- [ ] Las materias se **autoagrupan/filtran por el tag de año** usando una barra de etiquetas equivalente a la actual (`.nt-tagbar` / `.nt-tagchip`), con opción "Todas".
- [ ] CRUD de materias: crear, editar (nombre + año), borrar.
- [ ] Al abrir una materia, se muestran sus **páginas** en tarjetas con **vista previa** del contenido (estilo `nt-rect-prev` / preview de notas).
- [ ] Cada página tiene: **título** + **anotaciones** en **texto plano** (un textarea largo, sin formato rico).
- [ ] CRUD de páginas dentro de una materia: crear, editar, borrar.
- [ ] Navegación con retorno claro: home de notas → Notas de estudio (lista de materias) → materia (lista de páginas) → página (lectura/edición). Cada nivel puede volver al anterior.
- [ ] Se persiste en `S` sincronizado con Firestore en modelo relacional: `S.estudioMaterias` y `S.estudioPaginas` (ver Inputs & Outputs), respetando el patrón inmutable (`saveState()`).

#### C. Overlay "Anotaciones de Finanzas"
- [ ] Nuevo ítem **"Notas"** (o "Anotaciones") en el speed-dial de la sección **Finanzas** (`secciones-fab.js`, tab `finanzas`, accent `#22C55E`).
- [ ] Abre un overlay (vía `CMOverlay`) con una **lista plana de notas, sin categorías** (sin rectángulos de categoría).
- [ ] Cada nota: **título, texto, fecha y etiqueta opcional**.
- [ ] CRUD completo + búsqueda + orden por fecha + filtro por etiqueta (reutilizando el patrón de `salud-notas.js`).
- [ ] **Vista compacta**: en la lista, cada nota ocupa poco espacio. El texto de la nota **no se muestra completo** en la lista — se trunca a una sola línea corta (o se oculta), y el contenido completo se ve al abrir/editar la nota.
- [ ] Se persiste en `S.notasFinanzas` sincronizado con Firestore.

#### D. Integración / mantenimiento
- [ ] Al tocar cualquier `.js`/`.css`, **bumpear `const CACHE` en `sw.js`** y, si hay archivos nuevos, agregarlos al `SHELL`.
- [ ] `git add` + `commit` + `push origin main` al terminar (deploy automático GitHub Pages).

### Out of Scope
- Editor de texto rico (negritas, listas, imágenes, markdown) en cualquiera de las notas.
- Subcarpetas dentro de una materia (las páginas son una lista simple).
- Niveles de agrupación adicionales más allá del tag de año (no hay cuatrimestre/jerarquía extra).
- Categorías dentro del overlay de Finanzas.
- Adjuntar archivos, imágenes o audio a las notas/páginas.
- Compartir o exportar notas.

## Inputs & Outputs

### Ideas (Conocimiento)
- **Input:** formulario con título, etiqueta (opcional), fecha (default hoy), texto.
- **Output / storage:** objeto en `S.notas` → `{ id, categoria: 'ideas', titulo, tag, fecha, texto }`.

### Notas de estudio (Conocimiento)
- **Materia (input):** nombre + año (tag).
- **Página (input):** título + anotaciones (texto plano).
- **Output / storage (DEFINIDO — modelo relacional / plano):** dos arrays de nivel superior en `S`, sincronizados con Firestore:
  - `S.estudioMaterias = [ { id, nombre, anio } ]`
  - `S.estudioPaginas  = [ { id, materiaId, titulo, texto, fecha } ]`
- Las páginas de una materia se obtienen filtrando: `estudioPaginas.filter(p => p.materiaId === materia.id)` (mismo patrón que `_ntByCat`).
- **Borrado de materia en cascada:** eliminar la materia de `estudioMaterias` **y** todas sus páginas de `estudioPaginas` (`filter(p => p.materiaId !== id)`).
- **Filtro defensivo en render:** mostrar solo páginas cuya `materiaId` exista en `estudioMaterias` (evita huérfanas).
- Motivo de elegir relacional sobre anidado: consistencia con el patrón de arrays planos existente, actualizaciones inmutables más simples (filter/map/push sin spreads anidados), borrado en cascada trivial e IDs estables de nivel superior para los handlers.

### Anotaciones de Finanzas
- **Input:** formulario con título, etiqueta (opcional), fecha (default hoy), texto.
- **Output / storage:** objeto en `S.notasFinanzas` → `{ id, titulo, tag, fecha, texto }`.

Todos los datos viven en Firestore (colección `appdata`, doc `lifedash_v2`) vía el sync existente; nada se guarda en el repo.

## Constraints
- HTML/CSS/JS puro, sin bundler ni framework. Scripts clásicos → funciones globales.
- Reutilizar: clases CSS `.nt-*` (de `styles.css`), primitivo `CMOverlay`, `CMSpeedDial`, helpers `uid()`, `localStr()`, `fmtDate()`, `saveState()`.
- Patrón inmutable: nunca mutar arrays/objetos de `S` in-place; crear copias y reasignar (igual que `_ntPersist` / `_snPersist`).
- Escapar todo contenido de usuario en el render (igual que `_ntEsc` / `_snEsc`) — sin `innerHTML` con datos sin escapar.
- Respetar `prefers-reduced-motion` y los criterios de la dirección visual holográfica ya aprobada (sin gradient text, sin side-stripe).
- Archivos chicos y cohesivos (<800 líneas). Las notas de estudio y de finanzas pueden ir en sus propios archivos (`notas-estudio.js`, `finanzas-notas.js`) o integradas según lo decida el implementador, manteniendo cohesión.
- Bump de `CACHE` en `sw.js` obligatorio en cada cambio de `.js`/`.css`.

## Edge Cases
- **Categoría/lista vacía (Ideas, Finanzas, materia sin páginas):** mostrar estado vacío claro (no error), con el botón de "Nueva" disponible.
- **Notas de estudio sin materias:** la sección abre mostrando estado vacío + botón "Nueva materia".
- **Materia sin tag de año:** se agrupa bajo un grupo "Sin año" en la barra de etiquetas; no rompe el filtro.
- **Borrar una materia con páginas:** pedir confirmación (`confirm`) e indicar que se borran también sus páginas; al confirmar, se elimina la materia y todas sus páginas.
- **Borrar una página / nota:** confirmación previa (igual que el CRUD actual).
- **Título vacío:** se guarda igual y se muestra como `(sin título)` en listas y previews (consistente con el comportamiento actual).
- **Texto largo en la lista de Finanzas:** se trunca a una línea corta en la lista; el texto completo solo aparece al abrir/editar.
- **Búsqueda sin resultados:** lista vacía sin error.
- **Escape / cerrar overlay:** cierra el overlay actual sin perder datos guardados.

## Definition of Done
- [ ] Dado el overlay de Notas de Conocimiento abierto, cuando lo abro, entonces veo 5 rectángulos: Reflexiones, Aprendizaje, Anotaciones personales, **Ideas** y **Notas de estudio**.
- [ ] Dado que entro a **Ideas**, cuando creo una idea con título y texto, entonces aparece en la lista, persiste tras recargar (sync) y se puede editar/borrar/buscar/ordenar/filtrar por etiqueta igual que las otras categorías.
- [ ] Dado que entro a **Notas de estudio**, cuando creo una materia con nombre y año, entonces aparece en la lista de materias y se puede filtrar por el tag de año en la barra de etiquetas.
- [ ] Dado que abro una materia, cuando creo una página con título y anotaciones, entonces la página aparece como tarjeta con vista previa del contenido y persiste tras recargar.
- [ ] Dado que abro una página, cuando edito sus anotaciones (texto plano) y guardo, entonces los cambios persisten y se reflejan en la vista previa.
- [ ] Dado que borro una materia con páginas, cuando confirmo, entonces se eliminan la materia y todas sus páginas.
- [ ] Dado el speed-dial de **Finanzas**, cuando toco "Notas", entonces se abre el overlay de Anotaciones de Finanzas con lista plana, sin rectángulos de categoría.
- [ ] Dado el overlay de Finanzas, cuando creo varias notas, entonces la lista se ve compacta (cada nota ocupa poco espacio, el texto no se despliega completo en la lista) y puedo abrir una nota para ver/editar el texto completo.
- [ ] Dado cualquier cambio de `.js`/`.css`, cuando termino, entonces `sw.js` tiene `CACHE` bumpeado (y `SHELL` actualizado si hay archivos nuevos) y todo está commiteado y pusheado a `main`.
- [ ] Verificación visual: screenshot de los 3 flujos (Ideas, Notas de estudio con materia+página, Finanzas compacto) confirmando que respetan la estética holográfica y no rompen el layout en desktop ni móvil.
