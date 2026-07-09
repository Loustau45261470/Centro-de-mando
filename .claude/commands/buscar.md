---
description: Búsqueda en el vault con contexto, no solo nombres de archivo
---

Buscá en el vault (esta carpeta: `context/`, `inbox/`, `conocimiento/`, `proyectos/`, `plantillas/`) lo siguiente: $ARGUMENTS

1. Usá `Grep` sobre el vault para encontrar coincidencias (contenido, no solo nombre de archivo). Probá variaciones si los resultados son escasos (sinónimos, términos relacionados).
2. Ignorá `plantillas/` salvo que la búsqueda sea explícitamente sobre plantillas.
3. Devolvé resultados con contexto: título de la nota, carpeta, un extracto relevante (no solo el nombre del archivo).
4. Si los resultados son ambiguos, agrupalos por tipo (idea, decisión, aprendizaje, proyecto).
5. Ofrecé abrir, actualizar o enlazar cualquiera de las notas encontradas.
