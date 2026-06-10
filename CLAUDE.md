# Centro de Mando — Instrucciones del proyecto

## Archivo principal
`index.html` — aplicación de una sola página, todo el código vive ahí.

## Modo de trabajo
Trabajar de la forma más autónoma y automatizada posible. Usar herramientas, agents y skills disponibles sin necesidad de intervención del usuario. Solo interrumpir para decisiones genuinamente del usuario (credenciales inexistentes, conflictos irresolubles, acciones destructivas irreversibles).

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
