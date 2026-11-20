---
section: Corregido
---

- **Sincronización.** Cuando los cambios hechos a la vez en dos sitios se combinan solos campo a campo, «Sincronizar ahora» ya no avisa también «Sincronizado con 1 conflicto por revisar»: solo cuenta como conflicto lo que de verdad hay que revisar. Al resolver el último conflicto, sus avisos de la campana se dan por leídos y ya no ofrecen «Resolver».
- **Informes de estado y de cierre.** En «Hallazgos y rendimiento», el valor de un umbral incumplido se escribe como en la pestaña «Métricas» del run («1,02 %», «1,53 s»), no «0.0102 ratio». El resumen dice «Hay 1 defecto abierto, 1 crítico» en singular, y la línea de hallazgos «1 nuevo · 1 triado». Lo mismo en el PDF y en el .xlsx.
- **Ayuda «?».** La burbuja de ayuda tiene un ancho de lectura (hasta 360 px) en lugar de cruzar la pantalla con una lista de formatos larga, y sigue a su «?» aunque la ventana que la contiene se mueva al cargar.
- **IA.** Los requisitos propuestos por la IA guardan en su procedencia la versión 2 de las instrucciones (`req-extract@2`, `req-synthesis@2`), que piden el requisito en el idioma de la persona. Los generados antes conservan la versión 1.
- **Tablero y métricas.** La barra de filtros del tablero (también en el móvil) y la línea «Umbrales cumplidos» de la pestaña «Métricas» usan la tarjeta común de la app sobre la imagen de fondo.
