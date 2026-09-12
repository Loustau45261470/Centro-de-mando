# Convenciones obligatorias — Centro de Mando (leer antes de escribir código)

## Arquitectura
- HTML/CSS/JS **puro**. Sin bundler, sin framework, sin módulos ES.
- TODOS los `<script>` son clásicos → las funciones/consts top-level son **globales compartidas** entre archivos.
- El estado vive en la global `S` (schema en `app.js:12-240`, `DEFAULT_STATE`).
- Persistir SIEMPRE con `saveState()` (global). Nunca escribir a Firestore directo.
- `_initApp()` corre POST-login, así que todo está definido a tiempo.

## PROHIBIDO (regla crítica del proyecto)
- No tocar `_fbSave`, `_fbDoSave`, `_applyRemoteState`, `loadState`, `saveState`, `_mergeStates`, `_rescueLocal`.
- No agregar tu `<script>` a `index.html` — lo cablea el orquestador. Reportá la línea exacta que hace falta.
- No tocar `sw.js` ni el `?v=` de `index.html` — lo hace el orquestador.
- No correr git (add/commit/push). Lo hace el orquestador.

## Patrón de módulo nuevo (seguir a `telemetry.js`, `command-palette.js`, `hud-ambient.js`)
Un IIFE que se auto-inyecta: crea su `<style>` y su DOM, y expone su API en `window.NombreDelModulo`.
```js
(function () {
  'use strict';
  const style = document.createElement('style');
  style.textContent = `...`;
  document.head.appendChild(style);
  // ... montar DOM, exponer window.CMLoQueSea = { ... }
})();
```
Si el módulo necesita datos de `S` al arrancar, esperar: chequear que `S` tenga contenido o engancharse al render de la tab.

## Utilidades globales que YA existen (Ponytail Ladder: reusar, no reescribir)
- `showToast(msg, duration=3000)` — `app.js:1125`
- `openModal(id)` / `closeModal(id)` — `app.js:1136`
- `getActiveDate()` → 'YYYY-MM-DD' en hora local. **Nunca usar `toISOString().slice(0,10)`** (corre el día por zona horaria).
- `fmtMoney(n)`, `localStr(dateObj)`
- `window.CMDeadlines` (`deadlines.js`) — fuente ÚNICA de todo lo que tiene fecha.
- Escapado de HTML: copiar el helper `esc` que usan los módulos existentes. **Todo texto del usuario va escapado.**

## Diseño (PRODUCT.md)
- Estética: sala de control de misión. Preciso, premium, implacable. Denso pero elegante.
- Usar SOLO tokens de `styles.css`: `--hud`, `--hud-dim`, `--hud-bright`, `--tp`/`--ts`/`--tt` (texto primario/secundario/terciario), `--ok`, `--warn`, `--danger`, `--border`, `--mono`, `--fs-12-5`/`--fs-13`/`--fs-14`/`--fs-16`, `--c-vida`/`--c-finanzas`/`--c-salud`/`--c-conocimiento`/`--c-ia`/`--c-jarvis`.
- Clases existentes a reusar: `.card`, `.card-title`, `.kpi-strip`.
- **Nunca hardcodear colores** salvo que el módulo ya lo justifique.
- Mobile-first: se usa en celular vertical, sesiones de 10-60 segundos.
- WCAG AA + `@media (prefers-reduced-motion: reduce)` obligatorio en toda animación.

## Honestidad de métricas (memoria del usuario, regla dura)
- Un número que no se puede atribuir al período NO se muestra.
- Lo estacional no se compara mes a mes.
- Cero jerga interna en pantalla (nada de "pipeline", "hook", "telemetría", "orquestador").
- Si hay pocos datos, decirlo explícitamente en la UI (n bajo) en vez de mostrar un número que miente.

## Verificación que te toca a vos
- No podés correr la app. Verificá con: `node --check <archivo>.js` en cada archivo que escribas.
- Releé tu propio diff buscando: globals que no existen, `toISOString` para fechas locales, texto sin escapar, colores hardcodeados.
