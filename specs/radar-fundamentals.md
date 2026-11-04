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
- **Calendario (idea del usuario)**: una vez por mes se buscan las fechas oficiales de presentación de resultados de cada empresa; solo en esas fechas se busca el reporte en EDGAR (si la empresa movió la fecha y no está, se reintenta a diario hasta 7 días). ~4 chequeos por empresa por año.
- **Sin suscripción de IA**: números, variaciones q/q e interanual, márgenes, FCF, múltiplos, gráficos, calendario y avisos son deterministas (XBRL de EDGAR) y corren en el cron gratuito del Worker de Cloudflare. Solo el resumen escrito (guidance, comentarios de la gerencia) necesita IA: base = resumen armado con números + link al comunicado; extra opcional = resumen escrito por las routines de Claude del plan actual (sin costo adicional). Si se deja el plan, todo lo demás sigue andando.
- **Resumen con IA (aprobado)**: primario = routine del plan de Claude (sin costo extra); respaldo = el Worker llama a la API de Claude (Sonnet 5.5) solo si unas horas después de la presentación no hay resumen (suscripción inactiva o routine fallida). Saldo prepago (~US$ 5, alcanza para años: ~US$ 0,04 por reporte, ~US$ 2,30/año con 15 empresas). El usuario no quiere interpretación larga.
- **Esperado vs real (aprobado)**: tabla por reporte con EPS e ingresos esperados (consenso) vs reales, sorpresa %, ✅/❌, + 1–2 líneas de guidance vs lo esperado. Fuente de consenso: Financial Modeling Prep (earnings calendar/surprises, plan gratuito).
- **"Analista ayudante" (aprobado)**: sin fine-tuning; perfil del analista editable en el Centro (qué quiere y qué no) que va en cada pedido + resúmenes marcados "así sí" como ejemplos + 👍/👎 con comentario que agrega reglas al perfil. El perfil queda visible y editable.
- **Noticias diarias (aprobado)**: por empresa con ⭐ (cartera o radar): Google News RSS + presentaciones a la SEC (8-K, etc.) + comunicados de la página de inversores; deduplicar; Haiku 5.5 filtra relevancia y resume en una línea con fuente y link. Costo < US$ 2/año.
- **Cuentas de X (le encanta la idea; falta dato)**: API oficial de X pago por uso (~US$ 0,005 por post leído, verificar en docs.x.com); opción de traer solo posts que mencionen empresas del radar para abaratar. Cuenta principal: Lorenzo Couget, ~20–25 posts/día. Opciones de costo (a definir por el usuario): todo (~660 posts/mes, ~US$ 3,30/mes, ~US$ 40/año); solo menciones de empresas del radar (~US$ 6–9/año); recomendada = empresas del radar + temas elegidos (Fed, tasas, elecciones EE.UU., Argentina) (~US$ 15–25/año). Medir el primer mes antes de fijar. Grok descartado por el usuario (resumen semanal no le gusta).
- **Reportes Q rápidos** (reemplazado por el calendario de arriba; queda como referencia): tarea automática diaria que detecta presentaciones nuevas en EDGAR (8-K con el comunicado de resultados = mismo día; 10-Q/10-K después) para las empresas del radar → actualiza números, genera resumen (vs trimestre anterior y mismo trimestre del año anterior, guidance, puntos clave), lo guarda en la ficha y manda push. Calendario de próximas presentaciones. Transcripciones de calls: sin fuente gratis confiable; evaluar con las referencias del usuario.

## Pendiente del usuario
- Ejemplos de páginas de referencia y qué tomar de cada una.
- Lista de lo que "sí o sí" tiene que estar.
- Lista inicial de empresas en radar (además de la cartera).
