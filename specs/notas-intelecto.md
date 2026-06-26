# Spec: Apartado de Notas (Intelecto)

## Objective
Un apartado de notas dentro de la pestaña de Intelecto del Centro de Mando, dividido en tres categorías: **Reflexiones**, **Aprendizaje** y **Anotaciones personales**. Sirve para registrar reflexiones personales o de libros, anotaciones libres, y para documentar aciertos/errores y lo aprendido de cada situación. Se accede desde un ícono fijo en la pestaña de Intelecto que abre un panel flotante a pantalla completa (estilo "game mode"). Lo usa Tobías para su crecimiento personal e intelectual.

## Requirements

### Must-Have
- [ ] Ícono fijo en la pestaña de Intelecto que abre el panel flotante de notas.
- [ ] Panel flotante a pantalla completa estilo game mode (overlay sobre la app).
- [ ] Vista inicial del panel: tres rectángulos (Reflexiones, Aprendizaje, Anotaciones personales) con vista previa reducida de las notas que contiene cada uno.
- [ ] Al hacer clic en un rectángulo, se abre esa categoría completa con la lista de sus notas.
- [ ] Crear notas en cualquier categoría.
- [ ] Editar notas existentes.
- [ ] Borrar notas (con confirmación previa).
- [ ] Buscar notas por texto.
- [ ] Filtrar por categoría.
- [ ] Ordenar por fecha.
- [ ] Campos de nota según categoría:
  - **Reflexiones**: título, fecha, texto libre.
  - **Anotaciones personales**: título, fecha, texto libre.
  - **Aprendizaje**: título, fecha, suceso/hecho, qué hice bien, qué hice mal, qué aprendí, cómo lo haría mejor la próxima vez.
- [ ] Las notas se guardan en Firestore (estado `S`) y se sincronizan entre dispositivos como el resto del Centro de Mando.
- [ ] Cerrar el panel con la tecla **Escape**.
- [ ] Dentro de una categoría abierta: cruz (✕) en la esquina superior derecha que vuelve a la vista de los tres rectángulos.
- [ ] Permitir guardar una nota sin título; en la vista previa se muestra "(sin título)".

### Out of Scope
- Mensaje/placeholder cuando una categoría está vacía (debe quedar simplemente vacío, sin texto).
- Etiquetas/tags en las notas.
- Adjuntar imágenes o archivos a las notas.
- Compartir o exportar notas.

## Inputs & Outputs
- **Input**: datos que el usuario escribe en el formulario de cada nota (campos según categoría). La fecha se asocia a la nota (al crearla).
- **Output**: notas renderizadas en la UI — vista previa reducida en los rectángulos de categoría, y vista completa al abrir una categoría.
- **Persistencia**: cada nota es un objeto dentro del estado `S`, persistido en Firestore (colección `appdata`, documento `lifedash_v2`) y sincronizado entre dispositivos.
- **Shape sugerido por nota**:
  ```
  {
    id: string,
    categoria: "reflexiones" | "aprendizaje" | "personales",
    titulo: string,
    fecha: ISOstring,
    // reflexiones / personales:
    texto?: string,
    // aprendizaje:
    suceso?: string,
    hiceBien?: string,
    hiceMal?: string,
    aprendi?: string,
    mejorarProxima?: string
  }
  ```

## Constraints
- Stack del proyecto: HTML/CSS/JS puro, sin bundler ni framework.
- Integración en la pestaña de Intelecto existente (markup en `index.html`, lógica en `app.js` o módulo `jarvis-intel.js`, estilos en `styles.css`).
- Sincronización vía Firestore reutilizando la arquitectura de sync existente (`saveState`/`_fbSave`/`onSnapshot`). No tocar la lógica de sync.
- El panel flotante debe seguir el patrón visual del "game mode" ya existente en la app.
- Tras cualquier cambio de código: bumpear `const CACHE` en `sw.js` y push automático a main.

## Edge Cases
- **Categoría sin notas**: el rectángulo/área se muestra vacío, sin ningún texto placeholder.
- **Borrar una nota**: se pide confirmación ("¿Seguro?") antes de eliminar; si se cancela, la nota permanece.
- **Escape con panel abierto**: cierra el panel flotante y vuelve a la pestaña de Intelecto.
- **Cerrar categoría abierta**: la cruz (✕) en la esquina superior derecha vuelve a la vista de los tres rectángulos.
- **Escape dentro de una categoría abierta**: Escape cierra todo el panel flotante (vuelve a Intelecto).
- **Guardar nota sin título**: se permite; en la vista previa se muestra "(sin título)".
- **Búsqueda sin resultados**: la lista se muestra vacía, sin placeholder.

## Definition of Done
- [ ] Dado que estoy en la pestaña de Intelecto, cuando hago clic en el ícono de notas, entonces se abre el panel flotante a pantalla completa con tres rectángulos de categoría.
- [ ] Dado el panel abierto, cuando una categoría tiene notas, entonces su rectángulo muestra una vista previa reducida de esas notas.
- [ ] Dado el panel abierto, cuando hago clic en un rectángulo, entonces se abre esa categoría completa con su lista de notas.
- [ ] Dado una categoría abierta, cuando creo una nota con los campos correspondientes a esa categoría, entonces la nota se guarda y aparece en la lista.
- [ ] Dado una nota de Aprendizaje, cuando la creo/edito, entonces tiene los campos separados: suceso, qué hice bien, qué hice mal, qué aprendí, cómo mejorar.
- [ ] Dado una nota existente, cuando la edito y guardo, entonces se persisten los cambios.
- [ ] Dado una nota existente, cuando la borro, entonces se pide confirmación y solo se elimina si confirmo.
- [ ] Dado una lista de notas, cuando busco por texto, entonces se muestran solo las notas que coinciden.
- [ ] Dado una lista de notas, cuando ordeno por fecha, entonces se reordena correctamente.
- [ ] Dado una categoría abierta, cuando hago clic en la cruz (✕) de la esquina superior derecha, entonces vuelvo a la vista de los tres rectángulos.
- [ ] Dado el panel abierto, cuando presiono Escape, entonces el panel se cierra.
- [ ] Dado el formulario de una nota, cuando guardo sin título, entonces la nota se guarda y muestra "(sin título)" en la vista previa.
- [ ] Dado que creo una nota en un dispositivo, cuando abro la app en otro dispositivo, entonces la nota aparece (sync Firestore).
- [ ] Dado una categoría sin notas, cuando la veo, entonces aparece vacía sin texto placeholder.
