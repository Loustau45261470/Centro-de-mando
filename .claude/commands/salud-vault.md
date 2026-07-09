---
description: Chequeo de salud del vault — duplicados, huérfanas, tareas vencidas, plantillas sin completar
---

1. Ejecutá: `python ".claude/scripts/vault_health.py" --path "." --json`
2. Parseá el JSON y agrupá los hallazgos por severidad:
   - 🔴 error: sintaxis de plantilla sin completar
   - 🟡 warning: duplicados probables, tareas vencidas, sin frontmatter
   - ⚪ info: notas huérfanas, notas pedidas (wanted, no son error — son notas por escribir), carpetas vacías
3. Para arreglos seguros (frontmatter faltante evidente, duplicados obvios), ofrecé corregir automáticamente.
4. Para arreglos que implican borrar o fusionar contenido, listalos y pedí confirmación explícita antes de tocar nada.
5. Reportá un resumen: X críticos, Y warnings, Z info.
