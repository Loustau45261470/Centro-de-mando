# Centro de Mando — Instrucciones del proyecto

## Archivo principal
`index.html` — aplicación de una sola página, todo el código vive ahí.

## Regla de commits: acumular, no push por cambio
Durante una sesión con múltiples cambios, hacer commits locales pero NO hacer push después de cada uno.
Hacer UN SOLO push al final de la sesión, o cuando el usuario lo pida explícitamente.

Flujo correcto:
1. Cambio 1 → `git add index.html && git commit -m "descripción"`
2. Cambio 2 → `git add index.html && git commit -m "descripción"`
3. ...todos los cambios...
4. Al terminar la sesión → `git push origin main` (UNA VEZ)

Flujo incorrecto (evitar):
- Push después de cada cambio individual

## Repositorio
https://github.com/Loustau45261470/Centro-de-mando.git
Rama: main

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
