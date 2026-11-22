# Cuando algo se rompe y no tenés IA a mano

## 1. Volver atrás el último cambio (desde el celular o la compu)
La forma más rápida: deshacer el commit que rompió todo.

**Desde la compu (terminal en la carpeta del proyecto):**
```
git log --oneline -5          # ver los últimos cambios; el de arriba es el más nuevo
git revert <codigo>           # deshace ESE cambio creando uno nuevo (no borra historia)
git push origin main
```
Si el último cambio fue el problema: `git revert HEAD` y `git push origin main`.

**Desde el iPhone (sin compu):**
1. Abrir github.com/Loustau45261470/Centro-de-mando → pestaña **Commits**.
2. Mirar en qué commit empezó el problema y abrir el archivo que cambió.
3. Tocar el lápiz (Edit), dejar el texto como estaba antes y **Commit changes**.
   Eso dispara el deploy igual que un push.

En 1–3 minutos la página se actualiza. Si el celular sigue mostrando lo viejo, cerrá la app
del todo y abrila de nuevo (la caché tarda una recarga en soltarse).

## 2. Confirmar que el sitio se actualizó
github.com/Loustau45261470/Centro-de-mando → pestaña **Actions** → "pages build and deployment"
tiene que estar en verde. Si está en rojo: abrirlo → **Re-run all jobs**.

## 3. Si perdiste datos
No toques nada más. Abrí la app en la compu → consola del navegador (F12):
- `listarSnaps()` muestra las últimas copias guardadas.
- `restaurarSnap('<id>')` vuelve a una de ellas.

## 4. Arreglar con IA pero sin la suscripción de Claude
Mismo Claude Code (con tus skills y agentes), pero con otro modelo. Solo afecta esa ventana:
```
.\tools\claude-sin-suscripcion.ps1              # Kimi: pago por uso
.\tools\claude-sin-suscripcion.ps1 openrouter   # modelo gratis de OpenRouter (con límites)
```
La primera vez te dice dónde sacar la clave y en qué archivo guardarla.
Adentro, `/status` confirma qué proveedor está usando.

Otras herramientas (OpenCode, Cline) leen `AGENTS.md` con las reglas del proyecto.
Pedile siempre: "leé AGENTS.md primero, diagnosticá antes de cambiar, y corré `npm test` antes de subir".
