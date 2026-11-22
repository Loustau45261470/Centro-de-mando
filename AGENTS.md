# Centro de Mando — instrucciones para cualquier agente de código

Este archivo es para cualquier herramienta: Claude Code, OpenCode, Gemini CLI, Cline, Kimi o la que sea.
El detalle completo está en `CLAUDE.md`; acá van las reglas que no se pueden romper.
Respondé siempre en español.

## Qué es
App personal (PWA) en HTML/CSS/JS puro, sin bundler ni framework. Datos en Firebase Firestore
(colección `appdata`, doc `lifedash_v2`). Hosting en GitHub Pages: cada push a `main` despliega.

## Estructura (no unir archivos)
- `index.html`: solo markup; carga todo por `<link>` / `<script src>`.
- `styles.css`: CSS global. `app.js`: núcleo (estado `S`, `loadState`/`saveState`, sync, utils, boot).
- Secciones en archivos propios (`rutinas.js`, `habitos.js`, `finanzas.js`, `recordatorios.js`, …).
  Se cargan después de `app.js` y antes de `gamemode.js` / `jarvis-*.js`. **No cambiar ese orden.**
- Todos los scripts son clásicos (no módulos): las funciones top-level son globales y compartidas.
- `deadlines.js`: fuente única de todo lo que tiene fecha. Es puro (sin DOM); también lo usa Node.
- `sw.js`: service worker con caché cache-first.

## Archivos grandes
`app.js` y `styles.css` son enormes. Nunca leerlos enteros: buscar el símbolo con grep y leer
solo esa zona. Editar solo lo que cambia; no reescribir archivos completos.

## Al cambiar cualquier .js o .css (OBLIGATORIO, si no el cambio no llega a los dispositivos)
1. Subir el número de `const CACHE = 'cdm-shell-vNNN'` en `sw.js`.
2. Subir el `?v=N` de ese archivo en `index.html` (ej: `finanzas.js?v=43` → `?v=44`).
   Chequeo: `grep -n '?v=' index.html`.

## Sync y datos: diagnóstico primero
No tocar `_fbSave`, `_applyRemoteState`, `loadState`, `saveState`, `_fbSaveInProgress`
ni el listener `onSnapshot` sin antes agregar visibilidad (toast o panel) y confirmar qué camino
toma el código. Un cambio a la vez. Nunca reemplazar el sistema de sync entero.
Un error acá puede borrar datos reales del usuario.

## Bugs
- Antes de arreglar, entender la causa con evidencia (consola, test, log). Nada de fixes a ciegas.
- `fixes.json` registra bugs ya arreglados: cada `marker` debe seguir presente en su `file`.
  Si un bug "vuelve", primero revisar si falta su marker.
- Al arreglar un bug no trivial, agregar su entrada a `fixes.json` en el mismo commit.

## Verificar antes de dar algo por terminado
- `npm test` (Playwright; levanta un servidor local en el puerto 4173). Si falla, no subir.
- Para correr un solo archivo: `npx playwright test tests/<archivo>.spec.js`.

## Subir el cambio
```
git add <archivos que tocaste>     # nunca git add -A
git commit -m "tipo: descripción"  # fix:, feat:, chore:, style:
git push origin main
```
Después confirmar el deploy: `gh run list --limit 3` → el run "pages build and deployment"
debe terminar en `success`. Nunca usar `--force` ni `--no-verify`.

## Prohibido
- Subir claves o secretos (nada de `.env`, credenciales de Firebase, API keys en el código).
- Agregar frameworks, bundlers o dependencias sin pedirlo.
- Tocar `firestore.rules` o `storage.rules` sin pedido explícito.
