# Spec: Fichero de Personas (overlay en Vida)

## Objective
Overlay dentro de la pestaña "Vida" del Centro de Mando que funciona como un archivero de personas: permite guardar información personal de la gente del entorno de Tobías (nombre, cumpleaños, trabajo, familia, pareja, mascotas, intereses) para poder recordar detalles y mostrarse atento en el trato con ellos. Sigue el mismo patrón visual y de interacción que el overlay existente "Ideas".

## Requirements

### Must-Have
- [ ] Nuevo ícono en el abanico de overlays de la pestaña "Vida" que abre el overlay "Fichero".
- [ ] Listado de fichas de personas guardadas, con buscador por nombre/apellido.
- [ ] Botón "+ Nueva" para crear una ficha nueva (mismo estilo que "+ Nueva" de Ideas).
- [ ] Cada ficha tiene ícono de editar y de borrar (mismo estilo que Ideas).
- [ ] Formulario de alta/edición con los siguientes campos, todos obligatorios, en este orden:
  1. Nombre (texto corto)
  2. Apellido (texto corto)
  3. Fecha de nacimiento (date picker, texto corto) → Edad calculada automáticamente a partir de la fecha, mostrada como campo derivado (no editable)
  4. Trabajo o estudio (texto corto)
  5. Familia (texto largo / párrafo)
  6. Pareja (texto corto)
  7. Mascotas (texto corto)
  8. Intereses y gustos (texto largo / párrafo)
- [ ] La tarjeta de cada ficha en el listado muestra: título = Nombre + Apellido, y debajo cada apartado como `Etiqueta:` seguido de su valor, en el mismo orden del formulario (sin subtítulo ni extracto recortado — se listan todos los campos completos).
- [ ] La tarjeta debe verse bien (mismo look que la tarjeta "Mentores" de Ideas: fondo oscuro, borde superior dorado, iconos editar/borrar arriba a la derecha) sin importar cuánto texto tengan los campos largos (Familia, Intereses y gustos) — el layout debe acomodar contenido corto o extenso sin romperse.
- [ ] Persistencia de las fichas vía el mismo mecanismo de estado/sync ya usado por el resto de overlays de Vida (estado global `S` + `saveState()` + Firestore).

### Out of Scope
- Campos adicionales (foto, notas libres, cómo se conocieron, fecha de último contacto) — se evaluarán más adelante si surge la necesidad.
- Notificaciones o recordatorios de cumpleaños (posible mejora futura, no en este alcance).
- Ordenamiento/filtros más allá del buscador por nombre (ej. el "↓ Reciente" de Ideas no es requisito aquí, pero puede reutilizarse si no cuesta nada extra).

## Inputs & Outputs
- **Input**: datos ingresados por el usuario en el formulario (todos los campos son texto/fecha).
- **Output**: ficha renderizada en el listado del overlay "Fichero", persistida en el estado de la app y sincronizada a Firestore como el resto de los datos de Vida.
- **Edad**: derivada de "Fecha de nacimiento" vs. fecha actual, recalculada en cada render (no se guarda como dato aparte).

## Constraints
- Debe integrarse a la arquitectura existente: HTML en `index.html`, lógica en `app.js` (o archivo dedicado si el overlay lo amerita), estilos en `styles.css`.
- Sin bundler ni framework — JS/CSS/HTML puro, consistente con el resto del proyecto.
- Debe respetar el patrón visual ya establecido por el overlay "Ideas" (estructura de tarjeta, buscador, botón "+ Nueva", iconos editar/borrar).
- Si se agrega o modifica un `.js`/`.css`, bumpear `CACHE` en `sw.js` como indica la convención del proyecto.

## Edge Cases
- Ficha sin fecha de nacimiento válida: no debería poder guardarse (todos los campos son obligatorios) — el formulario debe validar y bloquear el guardado si falta algún campo.
- Texto muy largo en "Familia" o "Intereses y gustos": la tarjeta debe expandirse en alto para mostrar todo el contenido, sin cortar ni overflow roto.
- Búsqueda sin resultados: mostrar estado vacío (igual que el resto de overlays si ya existe un patrón para "sin resultados").
- Edición de una ficha existente: el formulario se precarga con los datos actuales y el guardado actualiza la ficha in-place (no crea una nueva).
- Borrado de ficha: debe pedir confirmación antes de eliminar (si ese es el patrón ya usado en Ideas) y no se puede deshacer.

## Definition of Done
- [ ] Dado que el usuario abre "Vida", cuando mira el abanico de overlays, entonces ve un ícono nuevo para "Fichero".
- [ ] Dado que el usuario abre el overlay "Fichero", cuando no hay fichas guardadas, entonces ve el buscador, el botón "+ Nueva" y un estado vacío.
- [ ] Dado que el usuario hace clic en "+ Nueva", cuando completa los 8 campos obligatorios y guarda, entonces aparece una nueva tarjeta con el nombre+apellido como título y todos los apartados listados en orden.
- [ ] Dado que el usuario intenta guardar con algún campo vacío, entonces el formulario bloquea el guardado y señala el campo faltante.
- [ ] Dado que una ficha tiene fecha de nacimiento cargada, cuando se muestra la tarjeta, entonces la edad se calcula y se muestra correctamente a partir de la fecha actual.
- [ ] Dado que el usuario escribe un texto largo en "Familia" o "Intereses y gustos", cuando guarda, entonces la tarjeta se ve completa y prolija, sin overflow ni corte de texto.
- [ ] Dado que el usuario escribe en el buscador un nombre o apellido, entonces el listado se filtra a las fichas coincidentes.
- [ ] Dado que el usuario hace clic en editar una ficha, cuando modifica algún campo y guarda, entonces la tarjeta refleja los cambios sin crear una ficha duplicada.
- [ ] Dado que el usuario hace clic en borrar una ficha, cuando confirma, entonces la ficha desaparece del listado y no vuelve tras recargar (persistida en Firestore).
- [ ] Los datos de las fichas sobreviven a un refresh de página y se sincronizan entre dispositivos, igual que el resto de datos de Vida.
