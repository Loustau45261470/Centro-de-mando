---
description: Clasifica lo pendiente en inbox/, elige carpeta destino, aplica plantilla y enlaza
---

Ordená todo lo que esté pendiente en `inbox/` (excepto `README.md` y `.base`).

Primero leé `context/perfil.md` y `context/objetivos.md` si no están ya en contexto (puede que el hook de sesión ya los haya cargado vía `_CLAUDE.md`).

Agrupá las notas de `inbox/` por categoría (idea / decisión / proyecto / aprendizaje / recurso) y lanzá sub-agentes `general-purpose` con `model: sonnet` en paralelo, uno por categoría con notas pendientes (no lances uno vacío). Cada sub-agente debe, para las notas de su categoría:

1. Elegir la carpeta destino correcta (`conocimiento/`, `proyectos/`, `context/`) según el contenido.
2. Aplicar la plantilla correspondiente de `plantillas/` (`plantilla-idea.md`, `plantilla-decision.md`, `plantilla-proyecto.md`, `plantilla-aprendizaje.md`).
3. Agregar tags de estado (`#idea #pendiente #importante #recurso #aprendizaje`) según corresponda.
4. Enlazar la nota con `[[wikilinks]]` a notas relacionadas existentes.
5. Si la nota es de `conocimiento/`, agregar su enlace en `conocimiento/Indice.md`.
6. Mover (no copiar) el archivo original de `inbox/` a su destino final, eliminando el original del inbox.

Al final, mostrame un resumen: qué se movió, a qué carpeta, y con qué tags — sin volver a mostrar el contenido completo de cada nota.
