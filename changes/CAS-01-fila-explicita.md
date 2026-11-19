---
section: Añadido
---

- **Los informes de JUnit, CTRF y Playwright pueden decir qué fila del dataset ejecutaron.** Si un caso tiene un dataset y lo automatizas sin Cucumber, añade a cada test la fila (contando desde 1): la propiedad `example_row` en JUnit, `extra.exampleRow` en CTRF o la anotación `example_row` en Playwright. Al importar el informe, cada resultado va a su fila del caso en la matriz.
