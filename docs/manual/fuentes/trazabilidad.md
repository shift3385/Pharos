# Trazabilidad y requisitos (fuente del capítulo 5)

## Para qué sirve

La **trazabilidad** responde a «¿está probado este requisito?». Cada requisito
tiene un ID estable (`REQ-001`) que los casos enlazan como tag; la matriz
cruza requisitos, casos, su último resultado y los defectos, y marca en rojo
los requisitos sin ningún caso. Así sabes qué cubre tu plan y qué falta.

El **último resultado** de cada caso es el último resultado final de sus
ejecuciones, manuales o importadas (por ejemplo, de Playwright), con la clave
del run y la fecha. «Flaky» avisa de un test que pasó tras fallar,
«Desactualizado» de que se ejecutó una revisión anterior del caso y «Re-test»
de un caso que falló y cuyo defecto ya está corregido. El **riesgo** del
requisito (probabilidad × impacto) ordena la matriz: lo más arriesgado,
primero.

## Consejos

- Importa los requisitos de tu herramienta de gestión con un CSV: Pharos
  reconoce columnas en español o inglés («Título», «Title», «Clave», «ID»…) y
  actualiza los que ya existen por su ID.
- Si el proyecto ya está en marcha, en la app de escritorio «Importar / Exportar →
  Requisitos desde un proyecto (IA)» lee la carpeta del proyecto o de su
  documentación y propone requisitos nuevos, mejoras, posibles duplicados y
  redundantes, cada uno con su motivo y su archivo y líneas de origen. Antes de
  enviar nada ves qué archivos se leen; los secretos y las dependencias no se
  envían nunca. Lo deducido solo del código va marcado «Inferido»: confírmalo,
  porque el código puede tener un defecto.
- Un ID eliminado no se reutiliza nunca, para que ningún caso antiguo apunte
  a otro requisito por error.
- «Mostrar solo huecos» es la vista de trabajo antes de cerrar un ciclo.
- Evalúa el riesgo de los requisitos importantes: sin probabilidad e impacto,
  un requisito queda «Sin evaluar» al final de la matriz.
- Filtra por ciclo o por build para ver la foto de una ronda concreta; los
  filtros quedan en la dirección de la página, así que puedes guardarla o
  compartirla.
- La exportación a Excel trae la hoja «Resultados» con el run, la fecha y los
  defectos de cada caso, para revisarla fuera de la app.

## Véase también

- [Guía de pruebas de la beta](../guia-beta.md), apartados 4.4 «Trazabilidad» y 4.4e «Resultados en la matriz e informe de estado».
- Capítulo 13, «Ejecución manual»: los resultados en la matriz y el informe de estado.
- [Glosario](../GLOSARIO.md): «Requisito», «Clave de requisito», «Requisitos vinculados», «Trazabilidad (texto libre)», «Último resultado», «Desactualizado», «Re-test», «Banda de riesgo».
