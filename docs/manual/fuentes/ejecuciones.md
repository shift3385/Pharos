# Ejecuciones e importación de resultados (fuente del capítulo 8)

## Para qué sirve

«Ejecuciones» reúne los **runs** del proyecto: los que crea un ciclo y los
que importas de tus pruebas automáticas. Pharos lee los informes de las
herramientas habituales (Cucumber Messages, CTRF, JUnit XML, JSON de
Playwright y su propio Pharos Run JSON), enlaza cada test con su caso por la
etiqueta (`@BM-001`) y deja en la bandeja «Sin vincular» los que no la
tienen, para que los vincules a mano una sola vez.

## Consejos

- Etiqueta tus escenarios con el ID del caso (`@BM-001`): se vinculan solos
  en cada importación.
- Si un informe enlaza capturas, vídeos o trazas, elige también su carpeta de
  adjuntos: se guardan como evidencias del resultado.
- Importar el mismo archivo dos veces no duplica nada: Pharos lo reconoce.
- Los shards de una misma ejecución se importan en el mismo run abierto
  («Dejar el run abierto para importar más shards»).

## Véase también

- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.4c «Importar resultados de pruebas automáticas».
- [Formatos de importación](../formats/importers.md).
- [Glosario](../GLOSARIO.md), sección «Execution model identifiers».
