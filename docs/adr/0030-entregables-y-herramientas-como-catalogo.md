# ADR-0030 · Entregables y herramientas del plan como catálogo con claves

- **Estado:** Aceptado (pista V2 del rediseño, 2026-10-30; RED-V2)
- **Contexto:** el rediseño del Plan de pruebas (SPEC §8, `ScrPlan`) cambia dos
  pasos:
  - **Paso 8, Entregables:** casillas con los entregables de ISO/IEC/IEEE
    29119-3 por grupos, más «Otro entregable», que el equipo añade marcado como
    «Propio».
  - **Paso 10, Herramientas:** las 10 más usadas, «Más herramientas (65)» con
    buscador por categorías y un campo libre.

  Hasta ahora `data.deliverables` guardaba **textos traducidos** (la lista por
  defecto se escribía en el idioma de quien creaba el plan). `data.tools`
  guardaba claves de un catálogo de 7, con su nombre en i18n
  (`testPlan.toolLabel.*`), y aceptaba nombres libres.
  - Un plan creado en español exportado en inglés seguía mostrando los
    entregables en español.
  - Con textos no se puede marcar una casilla de forma fiable.

## Decisión

- Los dos campos guardan **claves del catálogo** y, aparte, las entradas
  propias **tal cual se escribieron**. El catálogo vive en
  `src/modules/test-plan/model/catalogs.ts`:
  - `DELIVERABLE_GROUPS`: 15 entregables en 5 grupos. Conserva las 8 claves de
    antes (`testPlan`, `testCasesScripts`, `statusReports`, `summaryReports`,
    `defectReports`, `uatSignoff`, `testData`, `incidentReports`).
  - `TOOL_NAMES`: 75 herramientas (10 en `TOP_TOOLS` y 65 en
    `MORE_TOOL_GROUPS`, en 14 categorías). Conserva las 7 claves de antes.
- Los **nombres de herramientas son marcas** y no se traducen. Están en
  `TOOL_NAMES`, no en i18n, y desaparece `testPlan.toolLabel.*`. Solo se
  traducen las categorías.
- **Compatibilidad sin migración**, porque `data` es JSON libre (ADR-0026):
  - al leer un plan, `normalizeDeliverables` convierte en su clave cualquier
    entrada que coincida con una etiqueta del catálogo en español o en inglés
    (o con la propia clave). El resto se trata como entregable propio;
  - el plan se guarda con claves en el siguiente guardado;
  - la importación `.xlsx` usa la misma tabla inversa (`DELIVERABLE_REV`,
    `TOOL_REV`).
- **Exportar** (PDF, `.xlsx` y el ZIP del proyecto) traduce las claves al
  idioma de la exportación y deja las entradas propias como están
  (`deliverableLabels`, `toolLabels`).

## Alternativas

- **Seguir con textos y comparar por etiqueta en la interfaz:** la casilla
  dependería del idioma con el que se guardó y no se podría traducir al
  exportar. Descartado.
- **Migración de datos** que reescriba los entregables guardados: haría falta
  una migración en Rust y en el servidor para algo que la lectura ya resuelve.
  Además, la sincronización llevaría versiones mixtas. Descartado.
- **Herramientas en i18n como antes:** 75 marcas repetidas en dos idiomas, con
  el mismo texto. Descartado.

## Consecuencias

- Un plan antiguo se abre con sus casillas marcadas. Las entradas que no
  estaban en el catálogo aparecen como «Propio» o «Propia».
- Añadir un entregable o una herramienta al catálogo es añadir una clave en
  `catalogs.ts`, más su etiqueta en `es.json`/`en.json` si es un entregable.
- Una entrada propia que coincida con una del catálogo pasa a ser esa entrada
  del catálogo (comparación sin mayúsculas ni acentos).
