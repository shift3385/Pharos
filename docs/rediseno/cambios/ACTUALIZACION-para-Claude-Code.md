# Actualización para Claude Code · Rediseño Pharos

Pega este mensaje en Claude Code:

---

Actualiza la implementación con los últimos cambios del rediseño Pharos. Lee primero estos archivos del proyecto de diseño (son la fuente de verdad) y aplica lo que falte:

1. `templates/rediseno-app/handoff/CAMBIO-vista-adaptativa.md`: la vista se elige por el ancho real del contenedor de la app.
   - < 600 px → móvil: sin Sidebar, cabecera móvil, barra inferior y secciones por pestañas.
   - 600–1279 px → tablet: Sidebar solo con iconos.
   - ≥ 1280 px → escritorio.
   - Un `device` forzado (mobile/tablet) nunca sube a una vista más ancha.
   - Implementación: `ResizeObserver` sobre el contenedor raíz (no sobre `window`), re-render solo al cambiar de tramo y `disconnect()` al desmontar. Mejor como hook `useBreakpoint` en el layout raíz que dé `device` por contexto a todas las pantallas.

2. Gráfica «Ejecuciones diarias» en el Inicio (`templates/rediseno-app/Dashboard.dc.html`):
   - Cabecera con `flex-wrap`: el total y la variación bajan de línea en pantallas estrechas. El texto pasa a «+18 % vs. anterior».
   - Etiquetas de día alineadas con su barra: cada columna `flex:1 1 0; min-width:0`, mismo `gap` que las barras (`clamp(2px, 0.6cqi, 8px)`).
   - En tablet y móvil se muestra un día sí y otro no, contando hacia atrás desde hoy; el día de hoy siempre se muestra en negrita.
   - Barras con `max-width: 28px`, centradas en su columna.
   - Los días sin datos se marcan con una raya gris de 2 px en la base.
   - Leyenda: Pasa · Falla · Sin ejecuciones, con el mes («Octubre») a la derecha. `flex-wrap` y `gap: 6px 14px`; cada elemento `white-space: nowrap`; los cuadritos de color `flex: none`.

3. «Ejecución por proyecto»: la leyenda se ajusta igual (`gap: 6px 14px`, `nowrap`, cuadritos `flex: none`) y el bloque del título lleva `min-width: 0`.

4. Tokens (`tokens/tokens.css`): añade `/* @kind font */` a `--fw-regular`, `--fw-medium`, `--fw-semibold`, `--lh-tight` y `--lh-normal`.

5. Plan de pruebas · navegación de los 19 pasos (`templates/rediseno-app/ScrPlan.dc.html`). Antes, la lista vertical de pasos pasaba encima del contenido al hacer scroll (sticky sin z-index dentro de un flex con wrap).
   - ≥ 1360 px de contenedor: lista vertical a la izquierda (`position: sticky; z-index: 2`, ancho `clamp(220px, 24cqi, 272px)`, scroll propio). Nunca baja de línea.
   - 600–1359 px: stepper horizontal encima del formulario: «Paso N de 19 · X completados», título del paso, barra de progreso y una tira desplazable de círculos (hechos con check, el actual como píldora con número y nombre, pendientes con número). El paso actual queda centrado en la tira.
   - < 600 px: barra compacta «Paso N de 19» + botón «Ver pasos» (sin cambios).
   - El panel derecho (Estado del plan, Revisiones) baja debajo del formulario cuando no cabe (`flex: 1 1 260px`; formulario `flex: 999 1 400px`).

6. Pantallas afectadas por el punto 1: Inicio, Login, Proyectos, Ajustes de proyecto, Plan (19 pasos), Casos (lista y editor), Trazabilidad, Planificador, Administración y Perfil.

Comprobación:
- Estrecha la ventana de escritorio: por debajo de 1280 px el Sidebar pasa a iconos; por debajo de 600 px se ve la vista móvil completa.
- La gráfica no se corta, los días quedan bajo su barra y la leyenda no se solapa.

Cuando termines, ejecuta `/design-sync` para que el design system recoja los tokens corregidos.

---
