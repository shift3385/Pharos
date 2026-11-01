---
section: Añadido
---

- **Importar resultados de pruebas automáticas.** La nueva sección **Ejecuciones** de cada proyecto importa informes de Cucumber Messages, CTRF, JUnit XML, el JSON de Playwright y Pharos Run JSON. Cada test se vincula a su caso por la etiqueta del caso (`@TC-001`), a la versión del caso vigente al ejecutarse. Una vista previa dice qué se va a vincular antes de guardar nada. Importar el mismo archivo en el mismo run no duplica nada, y los informes de varios shards pueden ir al mismo run.
- **Bandeja «Sin vincular».** Los tests sin etiqueta de caso (o con una que no existe en el proyecto) quedan en una bandeja y se pueden vincular a un caso a mano; sus resultados no cambian.
- **Evidencias de los informes.** El archivo importado y sus capturas, vídeos y trazas (incluidos en el informe o en la carpeta que elijas) se guardan cifrados como evidencias.
