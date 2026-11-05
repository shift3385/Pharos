# Trazabilidad y requisitos (fuente del capítulo 5)

## Para qué sirve

La **trazabilidad** responde a «¿está probado este requisito?». Cada requisito
tiene un ID estable (`REQ-001`) que los casos enlazan como tag; la matriz
cruza requisitos, casos, su último resultado y los defectos, y marca en rojo
los requisitos sin ningún caso. Así sabes qué cubre tu plan y qué falta.

## Consejos

- Importa los requisitos de tu herramienta de gestión con un CSV: Pharos
  reconoce columnas en español o inglés («Título», «Title», «Clave», «ID»…) y
  actualiza los que ya existen por su ID.
- Un ID eliminado no se reutiliza nunca, para que ningún caso antiguo apunte
  a otro requisito por error.
- «Mostrar solo huecos» es la vista de trabajo antes de cerrar un ciclo.

## Véase también

- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.4 «Trazabilidad».
- [Glosario](../GLOSARIO.md): «Requisito», «Clave de requisito», «Requisitos vinculados», «Trazabilidad (texto libre)».
