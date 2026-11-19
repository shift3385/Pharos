# Ejecuciones e importación de resultados (fuente del capítulo 10)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/10-ejecuciones.tour.ts`. La ejecución manual paso a paso y el
informe de estado están en el capítulo 11.

## Para qué sirve

«Ejecuciones» reúne los **runs** del proyecto. Un run es una ejecución
concreta de pruebas, y puede salir de tres sitios:

- **De un ciclo:** «Ejecutar» crea un run por configuración (capítulo 9).
- **A mano:** «Nuevo run manual», con los casos que elijas (capítulo 11).
- **De tu automatización:** «Importar informe» lee los resultados de
  Playwright, Cucumber, JUnit o CTRF, los hallazgos de un SARIF (Semgrep,
  Trivy, ZAP, CodeQL, ESLint…) o de axe, y las métricas del resumen de k6.

Al importar, Pharos enlaza cada test con su caso por la clave del caso. Los
que no la llevan esperan en la bandeja **«Sin vincular»**: vinculándolos una
sola vez, sus resultados pasados y futuros cuentan para el caso.

En este manual, la automatización de Pharos deja dos informes:

- la regresión nocturna con Playwright, cuyos 4 tests no llevan clave y van a
  la bandeja;
- un JUnit de los tests de acceso, ya vinculados a PH-001 y PH-002, con la
  captura de un fallo, importado en el ciclo «Regresión 0.3.0».

## Hallazgos y métricas

Un SARIF o un informe de axe no traen tests, sino **hallazgos**: una regla
incumplida en un sitio (un archivo y una línea, o una página y un elemento).
Un resumen de k6 trae **métricas**, con sus umbrales. Al importarlos, la vista
previa cuenta los hallazgos por severidad y los umbrales incumplidos.

En el run, las pestañas **«Hallazgos»** y **«Métricas»** aparecen solo si
hay algo que mostrar:

- «Hallazgos» los agrupa por regla, con la severidad y las referencias (WCAG,
  CWE…). «Nuevo» marca los que no estaban en el run anterior de la misma
  herramienta. Los que axe no pudo decidir quedan «A revisar» y no cuentan
  como abiertos.
- **«Triaje»** decide qué hacer con un hallazgo: falso positivo, riesgo
  aceptado o corregido, siempre con un motivo, o reabrirlo. La decisión vale
  para ese hallazgo en todos los runs del proyecto, y las anteriores quedan
  en su historial.
- «Métricas» pone primero los umbrales incumplidos. «Ver todas» muestra cada
  agregación, y los *checks* de k6 van aparte.

Fuera del run, cuenta el **último escaneo de cada herramienta** (lo que ya no
aparece en él se dio por corregido):

- La **lista de runs** muestra los hallazgos abiertos de cada run, con el color
  de la peor severidad, y sus umbrales incumplidos. Un run que solo trae
  hallazgos o métricas ya no figura como «Sin resultados».
- En la **matriz de trazabilidad**, un caso con hallazgos abiertos lleva una
  insignia con cuántos son y el color del peor, y la nota «Hallazgos
  abiertos». El interruptor **«Con hallazgos abiertos»** deja solo los
  requisitos afectados.
- El **informe de estado** añade la sección «7.1 Hallazgos y rendimiento»
  (abiertos por severidad, nuevos, triados, a revisar, umbrales cumplidos y
  los incumplidos), y el **informe de cierre** los lista entre los riesgos
  residuales. Si no hay hallazgos ni umbrales, la sección no aparece.

## Cómo se vincula un test a su caso

| Formato | Dónde va la clave del caso |
| --- | --- |
| Cucumber Messages (NDJSON), playwright-bdd | Tag del escenario: `@PH-001` |
| JSON de Playwright | Tag del test (`@PH-001`) o la anotación `test_id` |
| CTRF | Sus `tags` |
| JUnit XML | Propiedad `test_id` del `<testcase>` (`<property name="test_id" value="PH-001"/>`) o las propiedades `tag` / `tags`. JUnit no tiene tags propios, así que `@PH-001` en el nombre del test no basta |
| Pharos Run JSON | Sus `tags` |

El detalle de cada formato está en [Formatos de importación](../formats/importers.md).

Si exportas los `.feature` desde Pharos (capítulo 8), cada escenario ya lleva
su tag.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| ← → | Pestañas «Runs» y «Sin vincular» | Cambian de pestaña |
| ← → | Filtros «Todos» / «Importados» y los de la bandeja | Cambian de filtro |
| Tab | Diálogo «Importar un informe» | Recorre el archivo, la carpeta, el destino y los datos del run |
| ↑ ↓ y Espacio | Lista de casos de «Vincular a un caso» | Eligen el caso |
| Esc | Diálogos de importar y de vincular | Los cierran, salvo mientras se importa |

## Si algo no sale

- **«Importar informe» está en gris.** En la versión web no se importan
  informes: usa la app de escritorio.
- **Todos los tests quedan «sin vincular».** El informe no lleva la clave de
  los casos (ver la tabla de arriba). Vincúlalos a mano en la bandeja o añade
  la clave en tu automatización.
- **«Dos etiquetas de caso».** Un test lleva dos claves de caso: Pharos no
  adivina cuál es y lo deja sin vincular. Deja una sola.
- **«… no es un caso del proyecto».** La clave no existe aquí; quizá es de
  otro proyecto o el caso se eliminó.
- **«Este archivo ya está importado en RUN-…».** Importar dos veces el mismo
  archivo no duplica nada. Con «Run abierto» puedes completar los adjuntos que
  falten; con «Run nuevo», marca la casilla si de verdad quieres importarlo
  otra vez.
- **«N adjuntos no se encontraron en la carpeta elegida.»** Elige la carpeta
  que contiene los archivos (por ejemplo, `test-results`).
- **«El archivo supera…».** El límite es 200 MB (50 MB si es JSON o XML).
- **«Run abierto» está en gris.** No hay ningún run en curso en el proyecto.
- **«No se pudieron cargar los runs.»** Pulsa «Reintentar».
- **Un run dice «Sin resultados».** Todavía no se ha ejecutado nada en él:
  ábrelo para ejecutarlo (capítulo 11).

## En el móvil

- Cada run es una tarjeta con su clave, su estado, su título y sus
  resultados.
- Los botones de la sección quedan en una fila sobre la lista.
- La importación y la bandeja «Sin vincular» son de la app de escritorio.

## Consejos

- Pon la clave del caso en tu automatización: con el tag (`@PH-001`) o la
  propiedad `test_id` en JUnit, cada importación se vincula sola.
- Si un informe enlaza capturas, vídeos o trazas, elige también su carpeta de
  adjuntos: se guardan como evidencias del resultado.
- Importa en el ciclo: elige «Ciclo» al importar y sus resultados cuentan en
  el progreso del ciclo.
- Los shards de una misma ejecución se importan en el mismo run: marca «Dejar
  el run abierto para importar más shards» en el primero y usa «Run abierto»
  en los demás.

## Véase también

- Capítulo 9, «Ciclos de prueba».
- Capítulo 11, «Ejecución manual» y el informe de estado.
- Capítulo 13, «Trazabilidad»: el último resultado de cada caso.
- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.4c «Importar
  resultados de pruebas automáticas».
- [Formatos de importación](../formats/importers.md).
- [Glosario](../GLOSARIO.md), sección «Execution model identifiers».
