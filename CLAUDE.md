# Centro de Mando — Instrucciones del proyecto

## Archivo principal
`index.html` — aplicación de una sola página, todo el código vive ahí.

## Regla obligatoria: push automático
Después de CADA cambio en el código, sin excepción y sin que el usuario lo pida:
1. `git add index.html`
2. `git commit -m "descripción breve del cambio"`
3. `git push origin main`

Esto dispara el deploy automático en GitHub Pages. No preguntar, no esperar confirmación — hacerlo siempre al terminar.

## Repositorio
https://github.com/Loustau45261470/Centro-de-mando.git
Rama: main (público)

## Hosting
GitHub Pages — deploy automático en cada push a main.
URL: https://loustau45261470.github.io/Centro-de-mando/

## Stack
- HTML/CSS/JS puro, sin bundler ni framework
- Firebase (Firestore) para sincronización de datos entre dispositivos
- Chart.js para gráficos
- SortableJS para drag & drop
- GitHub Pages para hosting

## Datos
Los datos del usuario viven en Firebase Firestore (colección `appdata`, documento `lifedash_v2`).
No están en el archivo HTML — no se suben a GitHub ni a GitHub Pages.

## Lectura de index.html
Nunca leer el archivo completo. Siempre:
1. `Grep` para ubicar el símbolo o la línea
2. `Read` con `offset` + `limit` para leer solo la sección relevante

## Disciplina de trabajo
- Piensa antes de actuar. Lee los archivos relevantes antes de escribir código.
- Edita solo lo que cambia; no reescribas archivos enteros.
- No releas archivos que ya hayas leído salvo que hayan cambiado.
- No repitas código sin cambios en las respuestas.
- Sin preámbulos ni resúmenes al final; no expliques lo obvio.
- Testea el comportamiento antes de dar una tarea por terminada.
