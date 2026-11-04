# Radar de empresas y fundamentals — borrador (2026-11-04)

Estado: plan aprobado por el usuario; falta que pase ejemplos de páginas de referencia y lo que "sí o sí" tiene que estar. Después: `/spec` para cerrar detalles y recién ahí construir.

## Objetivo
Tener a mano los fundamentals y reportes de las empresas en cartera y en radar, con una categoría propia por empresa, para decidir con software propio.

## Categorías (del usuario)
Empresa top · Sólida · Mediocre · En observación · Venta o posible venta · Compra o posible compra · Tomar ganancias parciales · Aumentar posición · Reducir posición.
Guardar historial de cambios de categoría (fecha + motivo).

## Fases aprobadas
1. **Radar**: ficha por empresa (cartera + radar) con categoría, tesis, historial de categoría y métricas clave de 10 años (ingresos, márgenes, FCF, ROIC, deuda, crecimiento, acciones en circulación).
2. **Reportes**: gráficos por empresa con el formato de las páginas de referencia; resumen de cada presentación de resultados.
3. **Herramientas de decisión**: DCF inverso, precio objetivo, avisos al cruzar precios de compra/venta.

## Decisiones técnicas
- **Fuente base**: SEC EDGAR (companyfacts XBRL, submissions) — oficial, gratis, 10+ años; cubre las empresas actuales (incluida NU vía 20-F, IFRS). Múltiplos/precio: API con plan gratuito (ej. Financial Modeling Prep) y/o precio en vivo que ya trae el Worker. No scrapear otras páginas (condiciones de uso y fragilidad); sí imitar su presentación.
- **Almacenamiento**: repo privado `centro-de-mando-datos` vía Worker con login (no en `S`: el documento principal ya está cerca del límite de 900 KB).
- **Múltiplos vivos**: separar datos trimestrales (EPS TTM, FCF TTM, deuda neta, acciones, EBITDA TTM) del precio (en vivo al abrir). Múltiplos calculados al vuelo: P/E, EV/EBITDA, FCF yield, market cap. Solo el denominador cambia con cada reporte.
- **Reportes Q rápidos**: tarea automática diaria que detecta presentaciones nuevas en EDGAR (8-K con el comunicado de resultados = mismo día; 10-Q/10-K después) para las empresas del radar → actualiza números, genera resumen (vs trimestre anterior y mismo trimestre del año anterior, guidance, puntos clave), lo guarda en la ficha y manda push. Calendario de próximas presentaciones. Transcripciones de calls: sin fuente gratis confiable; evaluar con las referencias del usuario.

## Pendiente del usuario
- Ejemplos de páginas de referencia y qué tomar de cada una.
- Lista de lo que "sí o sí" tiene que estar.
- Lista inicial de empresas en radar (además de la cartera).
