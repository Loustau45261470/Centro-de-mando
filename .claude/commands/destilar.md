---
description: Condensa una nota larga o fuente externa en afirmaciones clave citadas con su origen exacto
---

Fuente a destilar (nota del vault, `[[wikilink]]`, URL o archivo): $ARGUMENTS

Una destilación no es un resumen: un resumen descarta la fuente, una destilación deja un rastro verificable — cada afirmación apunta al bloque exacto de donde salió.

1. Si no se dio fuente, preguntá qué destilar (ofrecé las notas más largas/recientes de `conocimiento/` como candidatas).
2. Leé la fuente completa (nota del vault entera, o fetch de la URL/archivo). Si es muy larga, leela en tramos ordenados — no muestrees.
3. Segmentá la fuente en bloques citables (numerados B1, B2, ...) — secciones, párrafos o ideas — y anotá para cada uno un localizador (encabezado, posición).
4. Extraé las afirmaciones clave: una oración por afirmación, con su(s) bloque(s) de origen `(src: B3)`. Ninguna afirmación sin origen — si es tu inferencia y no está en la fuente, va aparte en "Inferencias" y no se cuenta como destilada.
5. Agrupá las afirmaciones por tema, conservando las etiquetas de origen.
6. Guardá la nota en `conocimiento/` con el nombre `Destilado - <fuente> (AAAA-MM-DD).md`, frontmatter mínimo (`name`, `description`, `tags: [aprendizaje]`), enlazada con `[[...]]` a la fuente original si es una nota del vault, y agregada a `conocimiento/Indice.md`.
7. Reportá: fuente, cantidad de bloques y afirmaciones, y cualquier afirmación descartada por falta de origen verificable.
