---
section: Añadido
---

- **Matriz con resultados.** En «Trazabilidad → Matriz», cada caso muestra su último resultado final, venga de un run manual o de un informe importado (por ejemplo, de Playwright): el estado, la clave del run con enlace y la fecha, y los avisos «Flaky», «Desactualizado» (se ejecutó una revisión anterior del caso) y «Re-test» (falló y su defecto ya está corregido). Los defectos llevan su severidad.
- **Filtros y orden por riesgo en la matriz.** Los resultados se filtran por ciclo, configuración, build y entorno, y los filtros quedan en la dirección de la página. Por defecto, los requisitos de más riesgo van primero; también se puede ordenar por ID.
- **Riesgo del requisito.** El formulario del requisito pide la probabilidad y el impacto, de 1 a 5. Su producto es el nivel de riesgo (bajo hasta 4, medio hasta 12, alto por encima), en escritorio y en la web.
- **La matriz en Excel trae una hoja «Resultados»** con el último resultado de cada caso: run, fecha, configuración, origen, flaky, desactualizado y defectos con su severidad. La hoja «Matriz» sigue siendo la de la plantilla.
- **Informe de estado (ISO/IEC/IEEE 29119-3).** En «Ejecuciones» y en cada ciclo, «Informe de estado» resume el proyecto, un ciclo o el plan en un periodo: progreso, resultados por estado, defectos por severidad y estado (a fecha de hoy), cobertura y riesgos, los criterios de salida del plan (cumple / no cumple) y los bloqueos. El resumen se rellena con las cifras y se puede cambiar; con las recomendaciones, se guarda solo en ese equipo. Se exporta a Excel y a PDF en la carpeta de descargas.
