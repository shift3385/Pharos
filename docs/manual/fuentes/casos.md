# Casos de prueba (fuente del capítulo 4)

## Para qué sirve

Un **caso de prueba** describe cómo comprobar un comportamiento: precondiciones,
pasos y resultado esperado. En Pharos cada caso tiene a la vez un formulario
(«Editor») y su escenario Gherkin, sincronizados: lo que escribes en uno
aparece en el otro, listo para la automatización con playwright-bdd o
Cucumber. Hay tres niveles de escenario (básico, Outline con ejemplos y
avanzado con flujos alternos) y un tipo checklist para revisiones rápidas.

## Consejos

- Empieza en «Básico»: siempre puedes subir de nivel, pero no bajar por
  debajo de lo que ya usa el Gherkin.
- Usa marcadores entre ángulos (`<importe>`) y la tabla de ejemplos cuando el
  mismo escenario deba probarse con varios datos.
- Ctrl+P salta a cualquier caso sin volver a la lista; la barra superior dice
  si hay cambios sin guardar.
- Al importar un .xlsx, los valores que no encajan con un campo personalizado
  se omiten y Pharos lo avisa.

## Véase también

- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.3.
- [Glosario](../GLOSARIO.md): «Caso de prueba», «ID de escenario», «Pasos de prueba», «Prioridad», «Estado (del caso)».
