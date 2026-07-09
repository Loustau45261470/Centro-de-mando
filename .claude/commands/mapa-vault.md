---
description: Genera un mapa visual (.canvas) del vault — grado de conexión, hubs y notas huérfanas
---

Alcance opcional (nombre de nota/proyecto/tema, o vacío para todo el vault): $ARGUMENTS

1. Ejecutá: `python ".claude/scripts/link_graph.py" --path "."` (agregá `--scope "<alcance>"` si se dio uno).
2. Con el JSON devuelto (`nodes`, `edges`, `stats`), generá un archivo Canvas de Obsidian (`.canvas`) en la raíz del vault, nombrado `mapa.canvas` (o `mapa-<tema>.canvas` si hay alcance):
   - Nodos hub (más conexiones) al centro, más grandes.
   - Agrupar por carpeta: `conocimiento/` a un lado, `proyectos/` a otro, `context/` aparte.
   - Grosor de línea proporcional a cantidad de conexiones.
   - Notas huérfanas en los bordes, marcadas.
3. Además del canvas, dame un resumen en texto: total de nodos/enlaces, top 5 hubs, notas huérfanas, y cualquier "dangling link" (enlace a algo que no existe).
