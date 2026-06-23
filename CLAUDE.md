# Centro de Mando — Instrucciones del proyecto

## Estructura de archivos (reestructurado: ya NO es un solo archivo)
El monolito `index.html` se separó en varios archivos para aligerarlo. NO volver a unirlos.
- `index.html` — solo el HTML (markup de las pestañas, modales, nav). Carga todo lo demás por `<link>`/`<script src>`.
- `styles.css` — todo el CSS.
- `app.js` — JS principal (estado `S`, `loadState`/`saveState`, sync Firestore, render de todas las pestañas, finanzas, hábitos, etc.).
- `jarvis-*.js` — módulos de JARVIS: `jarvis-voice.js` (TTS/ElevenLabs), `jarvis-ears.js` (reconocimiento de voz), `jarvis-brain.js`, `jarvis-intel.js`, `jarvis-neural-fx.js`, `jarvis-agent.js`, `jarvis-core-stats.js`.
- `login.js`, `theme-switcher.js`, `telemetry.js`, `command-palette.js`, `hud-ambient.js` — features sueltas.
- `sw.js` — service worker (PWA). Su `SHELL` lista todos los archivos; al cambiar cualquier `.js`/`.css` hay que **bumpear `const CACHE`** (cache-first) para que el cambio llegue a los dispositivos.

Todos los `<script>` son clásicos (no módulos) → las funciones/vars top-level son globales y se comparten entre archivos.

## Regla obligatoria: push automático
Después de CADA cambio en el código, sin excepción y sin que el usuario lo pida:
1. `git add <archivos modificados>` (el/los archivos que tocaste: `app.js`, `styles.css`, `jarvis-*.js`, `index.html`, `sw.js`…)
2. `git commit -m "descripción breve del cambio"`
3. `git push origin main`

Esto dispara el deploy automático en GitHub Pages. No preguntar, no esperar confirmación — hacerlo siempre al terminar.
Si tocaste un `.js` o `.css`, **bumpear también `const CACHE` en `sw.js`** y commitearlo.

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

## Lectura de archivos grandes (app.js, styles.css)
Nunca leer el archivo completo. Siempre:
1. `Grep` para ubicar el símbolo o la línea (y para saber EN QUÉ archivo está)
2. `Read` con `offset` + `limit` para leer solo la sección relevante

## Disciplina de trabajo
- Piensa antes de actuar. Lee los archivos relevantes antes de escribir código.
- Edita solo lo que cambia; no reescribas archivos enteros.
- No releas archivos que ya hayas leído salvo que hayan cambiado.
- No repitas código sin cambios en las respuestas.
- Sin preámbulos ni resúmenes al final; no expliques lo obvio.
- Testea el comportamiento antes de dar una tarea por terminada.

## Regla crítica: bugs de sync/datos — DIAGNÓSTICO PRIMERO

El sistema de sync (Firestore ↔ localStorage ↔ múltiples dispositivos) es complejo. Ante cualquier problema de sincronización o pérdida de datos:

1. **No tocar `_fbSave`, `_applyRemoteState`, `loadState` ni ninguna lógica de sync sin primero agregar visibilidad** (panel de diagnóstico en UI, toasts con info de estado, etc.) y confirmar qué path está tomando el código.
2. **Un cambio a la vez.** Commitear y esperar confirmación del usuario de que el comportamiento cambió antes de hacer el siguiente cambio de lógica.
3. **No encadenar fixes.** Si el primer fix no resolvió el problema, volver al paso 1 (más diagnóstico), no proponer otro fix distinto.
4. **No reemplazar sistemas enteros** (ej: "cambio todo el sistema de sync") sin entender qué parte puntual falla. Siempre fix quirúrgico.

### Arquitectura de sync actual (no cambiar sin entender esto)
- `loadState()`: lee de Firestore al arrancar. Si falla → localStorage. Setea `_lastSyncedSavedAt`.
- `saveState()`: guarda en localStorage + llama `_fbSave()` (debounce 2s).
- `_fbSave()`: si `_lastSyncedSavedAt !== null` (sesión confirmada) → escribe local directo. Si es null (cargó de localStorage) → rescue desde cloud + guarda.
- `_fbSaveInProgress`: flag que bloquea `onSnapshot` y `_syncOnFocus` mientras hay un write en vuelo. **No eliminar.**
- `onSnapshot`: listener real-time. Solo aplica si no hay write en vuelo.
- `snap_<timestamp>`: snapshots post-write (últimos 20) para recuperación. `listarSnaps()` / `restaurarSnap()` en consola.
