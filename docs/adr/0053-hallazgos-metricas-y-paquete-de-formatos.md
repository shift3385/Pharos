# ADR-0053 · Hallazgos y métricas importados: un paquete de formatos, sus tablas y sus vínculos (ING-06, ING-07)

> Completa [ADR-0012](0012-tipos-de-resultado-genericos.md): fija lo que ese ADR dejó «para ING-06» (las reglas de vínculo, la severidad y la huella) y crea las tablas que aplazó. No cambia ninguna de sus decisiones.

- **Estado:** Aceptado (decisión del usuario, 2026-11-18: la opción A y las seis respuestas recomendadas; ver «Decisiones del usuario»).
- **Relacionados:**
  - [ADR-0005](0005-alcance-hasta-1-0.md) (pocos formatos, tipos genéricos);
  - [ADR-0012](0012-tipos-de-resultado-genericos.md) (Finding y Metric);
  - [ADR-0013](0013-campos-del-run.md) (ids deterministas, vínculo derivado, estado de la matriz);
  - [ADR-0014](0014-evidencias-cifradas-por-hash.md) (`raw_report`);
  - [ADR-0041](0041-quality-gate-y-tendencia-entre-ciclos.md) (gates);
  - VERSIONING §6.6.
- **Plan:** [`docs/design/f-formatos-plan.md`](../design/f-formatos-plan.md); bocetos en [`f-formatos-bocetos.html`](../design/f-formatos-bocetos.html).

## Contexto

- **El formato ya está, las tablas no.** Pharos Run JSON 1.0.0 ya lleva `findings[]` y `metrics[]`, y su `sourceFormat` admite `sarif`, `k6` y `axe`, pero esos datos solo se validan y se guardan como `raw_report`. Las tablas de ADR-0012 se aplazaron.
- **Los parsers no corren fuera del webview.** Viven en `src/shared/contracts/pharos-run/importers/` y JUnit usa el `DOMParser` del webview, así que no corren en Node.
- **El servidor no puede importarlos tal cual.** Su imagen se construye solo desde `server/`.
- **Tres consumidores en 0.6.0:**
  - la importación del escritorio y la web;
  - la subida por la API v1 (INT-02);
  - el CLI (INT-01, Rust, ola 2).

  El criterio de salida es que un PR de GitHub reporte JUnit, SARIF, k6 y axe, y ese camino pasa por el CLI y la API.

- **`.xcresult` solo se lee en macOS.** Es un paquete propio de macOS, y solo `xcrun xcresulttool` lo lee.

## Opciones (dónde viven los parsers)

| Opción                                                                                                               | A favor                                                                                                                             | En contra                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **A. Paquete TS `packages/formats`, sin DOM** (XML inyectado: `DOMParser` en el navegador, `@xmldom/xmldom` en Node) | Una implementación. Los parsers que ya existen solo se mueven. El servidor los reutiliza. El CLI remoto sube el archivo y no parsea | El modo local del CLI necesita un port o delegar en otro                                                         |
| B. Crate Rust `pharos-formats`, nativo y en WASM                                                                     | Una implementación en todas partes, el CLI incluido                                                                                 | Port de unas 1.100 líneas que funcionan, toolchain wasm en Vite y en el servidor, y choque con CORE-01 en marcha |
| C. Espejo en `server/`                                                                                               | Sin cambiar el build                                                                                                                | Unas 2.000 líneas duplicadas                                                                                     |

## Decisión

1. **Opción A.** `@pharos/formats` es la única implementación de los parsers, de `parsePharosRun`, de `ids.ts`, de los límites y de `NORMALIZER_VERSION`.
   - El servidor se construye desde la raíz y copia `server/` y `packages/formats/`.
   - Los snapshots `normalized/` de cada formato son el contrato de cualquier port (el CLI local, L).
2. **Tablas.** `findings`, `finding_triage` y `metrics` llevan la forma de ADR-0012, con una migración local aditiva.
   - `finding` y `metric` son `append_only`; `finding_triage` es LWW por `UUIDv5(project ‖ fingerprint)`.
   - En el servidor son documentos.
   - Ids: hallazgo `UUIDv5(shard ‖ fingerprint ‖ n)`; métrica `UUIDv5(shard ‖ name ‖ aggregation ‖ scope)`.
   - Límites: 20.000 hallazgos y 5.000 métricas por importación, con recorte determinista.
3. **Severidad.** La escala común es `critical | high | medium | low | info`, con el valor de origen en `rawSeverity`.
   - SARIF: primero `security-severity` (≥9, ≥7, ≥4, >0); si no, `level` (`error` alta, `warning` media, `note` baja, `none` info).
   - axe: `critical`, `serious`, `moderate` y `minor`, en ese orden.
4. **Huella.** La del origen (`partialFingerprints`, `fingerprints`). Si no la hay, `sha256(herramienta ‖ ruleId ‖ ubicación normalizada)`: ruta relativa y región, o URL sin query más selector. Nunca incluye el mensaje.
5. **Vínculos (derivados al leer, como Result).** Un hallazgo o una métrica se vincula a un caso por:
   - `caseKey` en el documento;
   - «Vincular a un caso» al importar (`--case` en el CLI);
   - la etiqueta `@<prefijo>n`: en `properties.tags` de SARIF, en el nombre de un _check_ de k6 o en el tag de submétrica `case`.

   El vínculo a requisitos por `standardRefs` queda fuera de 0.6.0 (decisión 3).

6. **Matriz (sin cambios respecto de ADR-0012 y ADR-0013).**
   - Una Metric vinculada **con umbral incumplido** cuenta como `failed`.
   - Los Finding son un recuento por severidad de los hallazgos **abiertos**. Abierto quiere decir sin triaje o en `open`; un `incomplete` de axe no cuenta.
   - «Nuevo» se deriva: la huella no estaba en el run anterior del proyecto con la misma herramienta.
7. **Formato.**
   - ING-06 no cambia Pharos Run JSON.
   - ING-07 añade `allure`, `trx` y `xcresult` a `sourceFormat`, así que el formato pasa a **1.1.0**.
   - Cada parser nuevo o modificado sube `NORMALIZER_VERSION`.
8. **`.xcresult`.** Se importa el JSON de `xcresulttool get test-results tests` (Xcode 16+), generado en el Mac de CI. El paquete se rechaza con instrucciones. Solo entra en 0.6.0 si hay una muestra real con licencia compatible; si no, se aplaza a RUN-04 (decisión 5).

## Consecuencias

- La pista A importa el paquete y no copia nada. El `Dockerfile` cambia de contexto (DEU-01).
- Un Pharos Run JSON con `findings[]` importado antes de 0.6.0 no se reindexa: ningún parser los producía.
- Cuatro sitios crecen:
  - `defect_links` puede apuntar a `finding` (el servidor ya lo admite);
  - el resolver `runs/link.rs` y su gemelo `resultLink.ts` cubren los nuevos tipos, con vectores;
  - el informe de estado y el de cierre ganan la sección «Hallazgos y rendimiento»;
  - la app 0.5 rechaza un shard 1.1.0 con `sourceFormat` nuevo, con mensaje claro.

## Impacto en sync y migraciones

- **Local:** la migración 0048 (reservada en `scripts/migration-registry.json`). Tiene prueba de actualización desde 0.5.0.
- **Servidor:** sin migración. Son documentos de tres entidades nuevas en `sync.schemas.ts`, salvo que INT-02 decida tablas.
- **Sin datos previos que migrar.**

## Decisiones del usuario (2026-11-18)

1. Los parsers viven en el paquete TS `@pharos/formats` (opción A).
2. Un umbral de k6 incumplido marca como fallido el caso vinculado en la matriz.
3. En 0.6.0 los hallazgos no se vinculan a requisitos por `standardRefs`: queda para un ítem posterior.
4. El `incomplete` de axe se importa como hallazgo «A revisar» (`info`, `attributes.needsReview`) y no cuenta como abierto.
5. `.xcresult` entra en 0.6.0 solo con una muestra real; si no, se aplaza a RUN-04.
6. Las quality gates (ADR-0041) suman «hallazgos críticos o altos abiertos» y «umbrales de rendimiento cumplidos (%)» en un PR opcional (F8).

## Implementación

- **F1 (#105, 2026-11-18).** `@pharos/formats` en `packages/formats/`, sin DOM
  y compilable como NodeNext. El servidor lo reutiliza con `@xmldom/xmldom`
  (`configureXml`). La imagen se construye desde la raíz.
- **F3 (2026-11-18).** Parsers de SARIF, axe y k6, con muestras reales y
  snapshots (tablas en [`docs/formats/importers.md`](../formats/importers.md)).
  Lo que cambió respecto de la decisión, al implementar:
  - **Huella derivada:** `pharos:` + UUIDv5 (`derivedFingerprint`), no
    sha256. Los parsers son síncronos y en el navegador sha256 solo existe
    asíncrono. UUIDv5 ya es la función de los ids (`ids.ts`) y basta para
    deduplicar.
  - **Huella de SARIF:** la de la herramienta va precedida de la herramienta y
    la regla (`sarif:<herramienta>:<regla>:<clave>=<valor>`), porque
    `primaryLocationLineHash` identifica una línea, no una regla. Sin eso, dos
    reglas en la misma línea compartirían el triaje.
  - **Rechazo de DTD:** todo XML con `<!DOCTYPE` en el prólogo se rechaza
    (`invalid-xml: doctype`) antes de llegar a cualquier DOMParser. Así la app
    y el servidor no pueden sufrir XXE ni bombas de entidades.
  - **k6:** el `--summary-export` marca con `true` el umbral superado (falló),
    al revés que el `ok` de `handleSummary`; se comprobó con una exportación
    real de k6 v2.4.0. Las dos formas dan las mismas métricas, y una rate se
    llama siempre `rate`.
  - **Etiquetas de caso:** los parsers no vinculan. Las dejan en
    `attributes.tags` y el persistente las resuelve con el prefijo del proyecto.
- **F2 (2026-11-19).** Migración local 0048 (`findings`, `metrics`) y entidades
  `finding` y `metric` (append-only) detrás de la función de sync `findings`.
  El persistente (`runs/findings.rs`) las escribe en la transacción de la
  importación. Ids y huella derivada tienen gemelo en Rust (`runs/ids.rs`)
  con vectores compartidos.
  - Un Pharos Run JSON con un hallazgo sin huella recibe la derivada al
    leerse (`fingerprintOf`), así que los persistentes siempre tienen una.
  - El triaje (`finding_triage`) queda fuera de F2, a la espera de decidir si
    es LWW (como dice ADR-0012) o una serie de eventos append-only.
  - Vectores para puertos: `fixtures/detection-vectors.json` (formato o
    error de cada muestra) y `fixtures/schema-vectors.json`.
