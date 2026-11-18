# Pista F · Formatos (ING-06, ING-07) · plan APROBADO (2026-11-18)

Estado: **aprobado por el usuario el 2026-11-18**, con las seis respuestas recomendadas de §10.
Bocetos: https://claude.ai/artifact/UdgokqmtDyT7iUWCP3sHWC (fuente: `f-formatos-bocetos.html` en esta carpeta).
ADR: [ADR-0053](../adr/0053-hallazgos-metricas-y-paquete-de-formatos.md) (aceptado).

## 1. Qué hay hoy (leído en `main`)

- **Parsers en TypeScript** (`src/shared/contracts/pharos-run/importers/`): Messages, CTRF, JUnit, Playwright JSON y Pharos Run JSON. Producen un Pharos Run JSON 1.0.0 que valida `parsePharosRun`. JUnit usa el `DOMParser` del webview, así que **no corre en Node**.
- **Un persistente en Rust** (`src-tauri/src/runs/import.rs`). Solo acepta 5 `sourceFormat` (`FORMATS`), escribe run, shard y resultados, y guarda el archivo entero como `raw_report` del shard.
- **`findings[]` y `metrics[]` ya están en el formato 1.0.0** (`schema.ts`), pero solo se validan: **no hay tablas** (ADR-0012 las dejó para «0.5.0», y ING-06 pasó a 0.6.0). El enum `sourceFormat` ya admite `sarif`, `k6` y `axe`.
- El servidor ya reserva `finding` y `session_note` como destino de `defect_links` (`server/src/modules/sync/defects.ts`), pero no tiene esas entidades de sync.
- La imagen del servidor se construye solo desde `server/`. Por eso `roles.ts` es un espejo de `workspace-roles.json`.
- Estados de un Result: `passed | failed | blocked | skipped | other`.

## 2. Decisión 1: dónde viven los parsers

**Propuesta: un paquete del monorepo, `packages/formats` (`@pharos/formats`). Es TypeScript puro y no necesita DOM. Es la única implementación.**

| Consumidor                                 | Cómo lo usa                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Escritorio y web (Vite)                    | Importa el paquete, igual que hoy importa `src/shared/contracts/pharos-run`. El XML se lee con el `DOMParser` nativo, que se inyecta.                                                                                                                                                                                                                                                                                     |
| Servidor, subida por API (pista A, INT-02) | Importa el mismo paquete. El XML se lee con `@xmldom/xmldom` (MIT, sin dependencias nativas), también inyectado. El `Dockerfile` pasa a construirse desde la raíz y copia solo `server/` y `packages/formats/` (DEU-01 lo compila con `tsc`).                                                                                                                                                                             |
| CLI en Rust (pista L, INT-01, ola 2)       | `pharos upload` en modo remoto **envía el archivo tal cual** a la API, y el servidor lo parsea, así que el criterio de salida de 0.6.0 no necesita un port. El modo local (escribir con la app abierta) acepta Pharos Run JSON. Para otros formatos, L decide entre un port en Rust y delegar. Si porta, los vectores `normalized/` de cada formato son el contrato que tiene que reproducir (ya lo dice `importers.md`). |

Alternativas descartadas:

- **Rust (`pharos-core`) compilado a WASM para la web y el servidor:** una sola implementación en todas partes, pero obliga a portar unas 1.100 líneas que ya funcionan, añade toolchain wasm a Vite y al servidor y choca con CORE-01 (pista N) mientras se mueve. Es más trabajo que toda la pista.
- **Copia espejo en `server/`:** son unas 2.000 líneas duplicadas.

El paquete también exporta `ids.ts` (ids deterministas), los límites y `NORMALIZER_VERSION`, para que la API de A dé los mismos ids que el escritorio.

## 3. Decisión 2: cómo se guardan (ING-06: «se guardan sin cambiar el formato»)

- **Migración local** (**0048**, reservada en `scripts/migration-registry.json`; la 0047 es de S, SYNC-02): tablas `findings`, `finding_triage` y `metrics` con la forma del boceto de ADR-0012, sin columnas nuevas.
- **Sync:**
  - `finding` y `metric` son `append_only` (`sync_class.rs` y una línea en `sync.schemas.ts` del servidor);
  - `finding_triage` es LWW, con id `UUIDv5(NS_FINDING_TRIAGE, project_id ‖ fingerprint)` (ADR-0012);
  - en el servidor son documentos, así que no hace falta migración (ver §8, A).
- **Persistente:** `runs/import.rs` escribe hallazgos y métricas en la misma transacción que el run y el shard. `FORMATS` suma `sarif`, `k6`, `axe` y, con ING-07, `allure` y `trx`.
- **Ids deterministas:**
  - hallazgo: `UUIDv5(shard ‖ fingerprint ‖ n)`, donde `n` es la ocurrencia dentro del shard;
  - métrica: `UUIDv5(shard ‖ name ‖ aggregation ‖ scope)`.

  El mismo archivo en el mismo run no cambia nada, como hoy con los resultados.

- **Límites:** 20.000 hallazgos y 5.000 métricas por importación (Semgrep o Trivy sobre un monorepo pueden dar miles). Los textos se recortan de forma determinista: `message` a 8.000 caracteres y el `html` de axe a 1.000. Lo que sobra va a un aviso en la vista previa.
- **Un Pharos Run JSON que ya trae `findings[]` y `metrics[]` se guarda en tablas a partir de esta versión.** No se reindexan los `raw_report` antiguos: antes de 0.6.0 ningún parser producía hallazgos, y un Pharos Run JSON con hallazgos importado en 0.5 es improbable. Se documenta como límite.
- **Pharos Run JSON:**
  - ING-06 no lo cambia: 1.0.0 ya tiene `findings[]` y `metrics[]` y los `sourceFormat` `sarif`, `k6` y `axe`;
  - ING-07 suma `allure`, `trx` y `xcresult` al enum, así que el formato pasa a **1.1.0** (MENOR, VERSIONING §6.6);
  - los lectores 1.x existentes aceptan 1.1, salvo un shard con uno de esos `sourceFormat`, que la app 0.5 rechaza con mensaje claro;
  - `NORMALIZER_VERSION` sube en F3 y en F6.

## 4. Decisión 3: vínculos (los fija ING-06, según ADR-0012)

Como con los resultados, **el vínculo se deriva al leer** (`runs/link.rs` y su gemelo `resultLink.ts`); nunca se guarda.

| Fuente del vínculo                                                                                | Hallazgo                                               | Métrica                                                                                                      |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `caseKey` en el documento (Pharos Run JSON)                                                       | sí                                                     | sí                                                                                                           |
| «Vincular a un caso» en «Importar informe», o `--case TC-12` en el CLI: se aplica a todo el shard | sí                                                     | sí                                                                                                           |
| Etiqueta `@TC-12`                                                                                 | en `properties.tags` de la regla o del resultado SARIF | en el nombre de un _check_ de k6, o en el tag de submétrica `{case:TC-12}` (`http_req_duration{case:TC-12}`) |
| Requisito por `standardRefs` (un requisito con la etiqueta `WCAG2:1.4.3`)                         | **pregunta 3**                                         | —                                                                                                            |

**Matriz (ADR-0012 y ADR-0013, sin cambios):**

- un caso toma el peor estado entre sus Result finales y las Metric vinculadas **con umbral**, así que un umbral incumplido lo marca como fallido;
- los Finding no cambian el estado: se muestran como recuento por severidad.

## 5. Decisión 4: cómo se muestran (bocetos)

1. **«Importar informe»:** detecta SARIF, k6, axe, Allure y TRX. La vista previa cuenta hallazgos por severidad, métricas y umbrales incumplidos, además de los resultados. Lleva un selector opcional «Vincular hallazgos y métricas a un caso». Allure se importa como `.zip` o como carpeta (desktop, diálogo de directorio).
2. **Detalle del run:** pestañas `Casos | Hallazgos (n) | Métricas (n)`, que solo aparecen si hay algo que mostrar.
   - **Hallazgos:** chips por severidad, filtros (severidad, herramienta, estado de triaje, «solo nuevos») y una lista agrupada por regla que se despliega en ubicaciones. Cada ubicación lleva su archivo y línea, o la URL y el selector. Las insignias «Nuevo» (la huella no estaba en el run anterior de la misma herramienta) y «Suprimido en origen» (SARIF `suppressions`) también van aquí, junto con las acciones de triaje y «Crear defecto».
   - **Métricas:** una tabla con nombre, agregación, ámbito, valor, unidad, umbral y estado. Los umbrales incumplidos van primero, y los _checks_ de k6 en un bloque aparte.
3. **Diálogo de triaje:** estados `Abierto`, `Falso positivo`, `Riesgo aceptado` y `Corregido`, con motivo obligatorio salvo en «Abierto». Se aplica a esa huella en todos los runs del proyecto (ADR-0012).
4. **Lista de runs:** bajo el progreso, «12 hallazgos · 2 umbrales incumplidos», y un icono por tipo (escudo para seguridad, persona para accesibilidad, velocímetro para rendimiento).
5. **Matriz:** junto al estado del caso, una insignia con el recuento de hallazgos abiertos, del color de la peor severidad. Al pasar el cursor se ve el desglose. Hay un filtro «Con hallazgos abiertos». Un caso fallido por umbral lleva una nota con el umbral («p(95)<500 ms: 742 ms»).
6. **Informe de estado:** una sección nueva, «Hallazgos y rendimiento». Recoge los hallazgos abiertos por severidad (nuevos frente al período anterior y triajados) y los umbrales cumplidos (n/m), con la lista de los incumplidos. El informe de cierre (ADR-0044) reutiliza el mismo bloque.

## 6. PRs (orden y dependencias)

| PR     | Contenido                                                                                                                                                                                                                                                                                                              | Depende de                       | Tamaño            |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------- |
| **F0** | Documentación: este plan, ADR aceptado, `importers.md` con las tablas de mapeo, ROADMAP (ING-06/07) y reserva de migración.                                                                                                                                                                                            | aprobación                       | S                 |
| **F1** | Extraer `packages/formats` (mover `pharos-run/` con importers y fixtures, sin cambiar su salida: los snapshots no se tocan), inyectar el XML, `@xmldom/xmldom` en el servidor y build del servidor desde la raíz. **Desbloquea a A.**                                                                                  | F0                               | M (diff mecánico) |
| **F2** | Migración local, entidades de sync `finding`, `metric` y `finding_triage` en escritorio y servidor, persistente y comandos de lectura (`findings_list`, `metrics_list`, `finding_triage_set`). Con esto un Pharos Run JSON con hallazgos ya se guarda. Incluye la prueba de actualización desde 0.5 (VERSIONING §6.2). | F0; coordinar con N y S          | M                 |
| **F3** | Parsers de SARIF, axe y k6 con detección por contenido, muestras reales, snapshots `normalized/` y avisos.                                                                                                                                                                                                             | F1 (puede ir en paralelo con F2) | M                 |
| **F4** | UI: «Importar informe», pestañas del detalle del run, triaje, contadores en la lista de runs, i18n y a11y.                                                                                                                                                                                                             | F2, F3                           | M                 |
| **F5** | Vínculo derivado (Rust y servidor, con vectores), insignia y filtro en la matriz, sección del informe de estado y del de cierre.                                                                                                                                                                                       | F4                               | M                 |
| **F6** | ING-07: Allure (zip o carpeta) y TRX, formato 1.1.0.                                                                                                                                                                                                                                                                   | F3                               | M                 |
| **F7** | `.xcresult`: JSON de `xcresulttool` si hay muestra real (ver §9), o el aplazamiento documentado.                                                                                                                                                                                                                       | F6                               | S                 |

**Hito de la pista:** F1 a F5 cumplen ING-06 y la parte de F del criterio de 0.6.0. F6 y F7 cumplen ING-07.

## 7. Tablas de mapeo

Comunes:

- **Severidad:** `critical | high | medium | low | info`, con el valor de origen en `rawSeverity`.
- **Ubicación:** las rutas pasan por el mismo `relativizer` que `filePath`.
- **Huella** (si el origen no trae una): `sha256(herramienta ‖ ruleId ‖ ubicación normalizada)`, y nunca incluye el mensaje.

### 7.1 SARIF 2.1.0 → Finding

| Pharos                            | SARIF                                                                                                                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| run (contexto)                    | `runs[].tool.driver.name`/`version` → `run.context.tools[]`; `versionControlProvenance[0]` → `commit`/`branch`; `automationDetails.id` → `attributes`                                                                             |
| shard                             | un archivo es un shard (`sourceFormat: sarif`, `formatVersion: "2.1.0"`); con varios `runs[]`, cada hallazgo lleva `attributes.tool`                                                                                              |
| `ruleId` / `ruleName`             | `result.ruleId` (o `rule.id` por `ruleIndex`) / `rule.name` o `shortDescription.text`                                                                                                                                             |
| `severity`                        | 1.º `rule.properties["security-severity"]` (convención de GitHub: ≥9 crítica, ≥7 alta, ≥4 media, >0 baja); si no hay, `result.level` o `rule.defaultConfiguration.level`: `error` alta, `warning` media, `note` baja, `none` info |
| `rawSeverity`                     | `level`, y `security-severity` si lo hay                                                                                                                                                                                          |
| `message`                         | `message.text` (o `markdown`, o el `messageStrings` de la regla, con los `{0}` sustituidos por `arguments`)                                                                                                                       |
| `location`                        | `physicalLocation.artifactLocation.uri` (resuelto contra `originalUriBaseIds`) → `uri`; `region.startLine`/`startColumn`/`endLine`; `logicalLocations[0].fullyQualifiedName` → `component`; `webRequest.target` → `url` (ZAP)     |
| `fingerprint`                     | `partialFingerprints` (por orden de clave) → `sarif:<clave>=<valor>`; si no, `fingerprints`; si no, la huella común                                                                                                               |
| `standardRefs`                    | etiquetas `external/cwe/cwe-79` → `CWE:79`; `taxa[]` contra `taxonomies` (CWE, OWASP)                                                                                                                                             |
| `helpUri`                         | `rule.helpUri`                                                                                                                                                                                                                    |
| `caseKey`                         | etiqueta `@TC-n` en `properties.tags` (de la regla o del resultado)                                                                                                                                                               |
| `attributes`                      | `kind`, `baselineState`, `suppressed` (`suppressions[]` con `status` `accepted` o ausente), `tool`, `rank`                                                                                                                        |
| se descarta (contado en un aviso) | `kind` ≠ `fail`/`open`/`review` (por ejemplo `pass` o `notApplicable`); `baselineState: absent`                                                                                                                                   |
| Result / Metric                   | ninguno. `invocations[].executionSuccessful: false` → aviso `tool-failed`                                                                                                                                                         |

### 7.2 axe-core JSON → Finding (+ Metric)

Entrada: el objeto de resultados de axe-core (`@axe-core/playwright`, `axe.run`) o el arreglo de `@axe-core/cli` (uno por URL). Se detecta por `testEngine.name == "axe-core"` y `violations[]`.

| Pharos                        | axe                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| run (contexto)                | `testEngine.version`, `testEnvironment` (`userAgent`, `windowWidth`/`Height`), `timestamp` → `startedAt`                                                      |
| Finding                       | uno por **violación × nodo**                                                                                                                                  |
| `ruleId` / `ruleName`         | `violation.id` / `violation.help`                                                                                                                             |
| `severity` / `rawSeverity`    | `node.impact` o, si no, `violation.impact`: `critical` crítica, `serious` alta, `moderate` media, `minor` baja / el `impact` tal cual                         |
| `message`                     | `node.failureSummary` (si no, `violation.description`)                                                                                                        |
| `location`                    | `url`; `selector` = `target` unido con `>>` (sombra y marcos incluidos); `html` (recortado)                                                                   |
| `fingerprint`                 | huella común con la URL sin query ni fragmento, más el selector                                                                                               |
| `standardRefs`                | `wcag143` → `WCAG2:1.4.3`; `EN-9.1.4.3` → `EN301549:9.1.4.3`; `section508.22.a` → `S508:22.a`; nivel (`wcag2aa`, `wcag22aa`…) → `attributes.wcagLevel`        |
| `helpUri`                     | `helpUrl`                                                                                                                                                     |
| `incomplete[]`                | Finding con `severity: info`, `rawSeverity` = impact y `attributes.needsReview: true` (axe no pudo decidir: revisión manual) — **pregunta 4**                 |
| `passes[]` / `inapplicable[]` | no son Finding. Dan Metric de recuento por URL: `axe.rules_passed`, `axe.rules_violated`, `axe.rules_incomplete` (`unit: count`, sin umbral; para tendencias) |

### 7.3 k6 → Metric

Entradas: `--summary-export` (formato «legacy», plano) y el `data` de `handleSummary` (`JSON.stringify(data)`, con `type` y `values` por métrica). Se detectan por `metrics` + `root_group`.

| Pharos                 | k6                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| run (contexto)         | `state.testRunDurationMs` → `durationMs`; `options.summaryTrendStats`; sin hora de inicio: se usa la de importación (`attributes.startedAtInferred`)                                                                                                                                                                                                                 |
| Metric                 | una por **métrica × agregación** presente                                                                                                                                                                                                                                                                                                                            |
| `name` / `scope`       | `http_req_duration{expected_response:true}` → `name: http_req_duration`, `scope: expected_response:true`                                                                                                                                                                                                                                                             |
| `aggregation`          | trend: `avg`, `min`, `med`, `max`, `p(90)`, `p(95)`… → `avg`, `min`, `med`, `max`, `p90`, `p95`; counter: `count`, `rate`; rate: `rate`; gauge: `value` (y `min`/`max`)                                                                                                                                                                                              |
| `value` / `unit`       | el valor / `contains: time` → `ms`, `data` → `B`, rate → `ratio`, `rate` de un counter → `/s`, otro → sin unidad                                                                                                                                                                                                                                                     |
| `threshold` / `passed` | cada expresión de `thresholds` se asigna a la agregación que nombra (`p(95)<500` → `p95`, `rate<0.01` → `rate`): `threshold` = la expresión, `passed` = su `ok` (en el `legacy`, el booleano se comprueba con la muestra que falla, **ver §9**). Si la agregación no está en el resumen, aviso `threshold-without-value` y el umbral va a `attributes` de la métrica |
| checks                 | por _check_ (`root_group` y grupos anidados): Metric `checks`, `aggregation: rate`, `scope` = ruta del grupo + nombre, `value` = passes/(passes+fails), `attributes {passes, fails}`. Sin umbral propio (el umbral global de `checks` va a la métrica `checks` sin scope)                                                                                            |
| `caseKey`              | `@TC-n` en el nombre del _check_ o tag `case` de la submétrica                                                                                                                                                                                                                                                                                                       |
| Result / Finding       | ninguno                                                                                                                                                                                                                                                                                                                                                              |

### 7.4 Allure results (ING-07) → Result

Entrada: la carpeta `allure-results` (escritorio) o un `.zip` (escritorio, web, API y CLI). Se leen `*-result.json`, `*-container.json`, `executor.json` y `environment.properties`. Formato de Allure 2, que Allure 3 también lee.

| Pharos                                    | Allure                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `testKey`                                 | ruta = label `package` o `testClass` (con `/`), o el archivo si `fullName` lo trae; títulos = `parentSuite`, `suite`, `subSuite` (los que no repitan la ruta) + `name`. Se ajusta con las muestras para que allure-playwright dé la misma clave que el reporter JSON de Playwright |
| intentos                                  | resultados con el mismo `historyId`, por `start`: el último es el final                                                                                                                                                                                                            |
| `status` / `rawStatus`                    | `passed`; `failed` y `broken` → `failed`; `skipped`; `unknown` → `other` / el original                                                                                                                                                                                             |
| `startedAt` / `finishedAt` / `durationMs` | `start` / `stop` (ms epoch) / `stop − start`                                                                                                                                                                                                                                       |
| `message` / `trace`                       | `statusDetails.message` / `.trace`                                                                                                                                                                                                                                                 |
| flaky                                     | `statusDetails.flaky` → `flaky: true`                                                                                                                                                                                                                                              |
| etiquetas                                 | labels `tag`, `AS_ID`/`ALLURE_ID` y los `links` de tipo `tms` (su `name`) → `tags`                                                                                                                                                                                                 |
| `exampleRow`                              | `parameters[]` (no `excluded`) → `attributes.parameters`; varios resultados con el mismo `testCaseId` y distintos parámetros → filas `[n]`                                                                                                                                         |
| pasos                                     | `steps[]` de primer nivel (`name`, `status`, duración); los anidados van a `attributes`                                                                                                                                                                                            |
| adjuntos                                  | `attachments[].source` → el archivo de la carpeta o del zip (`ref`)                                                                                                                                                                                                                |
| contexto                                  | `executor.json` (`buildName`, `buildUrl`, `reportUrl`) y `environment.properties` → `run.context`                                                                                                                                                                                  |
| `*-container.json`                        | un `befores` o `afters` fallido marca el intento como `failed` (como un hook en Messages)                                                                                                                                                                                          |

### 7.5 TRX (VSTest) (ING-07) → Result

Detección: XML con `<TestRun>` en el namespace `…/TeamTest/2010`. Se lee con el mismo `DOMParser` inyectado.

| Pharos                 | TRX                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `testKey`              | ruta = `TestMethod@className` (`.` → `/`) o `storage`; título = `UnitTestResult@testName`                                                                                  |
| intentos               | varios `UnitTestResult` con el mismo `testId` (reintentos de herramientas externas), por `startTime`                                                                       |
| filas                  | `InnerResults` (_data-driven_: MSTest `DataRow`, xUnit `Theory`) → una fila `[n]` por resultado interior                                                                   |
| `status` / `rawStatus` | `Passed`; `Failed`, `Error`, `Timeout` y `Aborted` → `failed`; `NotExecuted` → `skipped`; `Inconclusive` y otros → `other` / `outcome`                                     |
| tiempos                | `startTime`, `endTime`; `duration` (`hh:mm:ss.fffffff` → ms)                                                                                                               |
| `message` / `trace`    | `Output/ErrorInfo/Message` / `StackTrace`                                                                                                                                  |
| etiquetas              | `TestCategory/TestCategoryItem@TestCategory` (MSTest `[TestCategory]`, NUnit `[Category]`, xUnit `[Trait("Category", …)]`) → `tags`: así `[TestCategory("TC-12")]` vincula |
| adjuntos               | `ResultFiles/ResultFile@path` (ruta; se adjunta si llega en el zip)                                                                                                        |
| contexto               | `TestRun@name`, `Times` (`start`/`finish`), `computerName` → `run.context`                                                                                                 |

### 7.6 `.xcresult` (ING-07)

Un `.xcresult` es un **paquete de macOS** (una carpeta con un almacén de objetos comprimidos sin documentar). Solo `xcrun xcresulttool` lo lee, y solo hay en macOS con Xcode. En Windows no se puede leer.

**Propuesta:** aceptar el **JSON de `xcrun xcresulttool get test-results tests`** (Xcode 16+, formato documentado: `testNodes[]` con `nodeType` `Test Suite`, `Test Case`, `Repetition`, `Arguments` o `Failure Message`, más `result` y `duration`).

- Se genera en el Mac de CI con una línea en la plantilla de GitHub Actions (INT-04), o lo hace el CLI en macOS (L, ola 2).
- Mapeo: `Test Case` → Result (`testKey` = ruta de suites + nombre); `Repetition` → intentos; `Arguments` → filas; `Expected Failure` → `passed` con `rawStatus`; `Failure Message` → `message`.
- Si se sube el paquete entero (una carpeta), se rechaza con un mensaje que explica el paso en el Mac.
- **Si no se encuentra una muestra real con licencia compatible** (§9), `.xcresult` se aplaza a RUN-04 (agente en Mac, 0.9.0) y queda documentado: **pregunta 5**.

## 8. Lo que toca a otras pistas

| Pista                       | Qué                                                                                                    | Propuesta                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** (API v1)              | La subida por API parsea con `@pharos/formats` y escribe hallazgos y métricas como documentos de sync. | F1 va primero. A importa `parseReport*`, `ids.ts` y los límites, y no copia nada. Si A quiere tablas reales en Postgres para `finding` y `metric`, la migración del servidor es suya y F aporta la forma. |
| **N** (`pharos-core` y WAL) | F2 añade una migración y toca `runs/import.rs`, que N va a mover al crate.                             | Pedir el orden: lo ideal es que F2 entre antes de que N mueva `runs/`, o encima de N si N ya lo movió. La reserva de la migración se acuerda antes.                                                       |
| **S** (sync y cuentas)      | Tres entidades nuevas (`sync_class.rs`, `sync.schemas.ts`).                                            | Son líneas sueltas y aditivas, pero S debería saberlo por si cambia el registro (SYNC-02 y SYNC-10).                                                                                                      |
| **L** (CLI, ola 2)          | `pharos upload` de SARIF, k6, axe, Allure (zip) y TRX.                                                 | Modo remoto: el archivo tal cual. Modo local: Pharos Run JSON. El port, si lo hay, sigue los vectores.                                                                                                    |
| **D** / DEU-01              | El `Dockerfile` del servidor pasa a construirse desde la raíz.                                         | Se hace en F1. Si DEU-01 ya cambia el `Dockerfile`, que vaya en la misma línea.                                                                                                                           |

## 9. Muestras para los tests de contrato

Regla de ING-01: reales, saneadas (sin rutas de usuario, hosts internos ni secretos), con un `README` de origen y licencia por carpeta (`fixtures/<formato>/`), y su `normalized/` comprometido.

**Preferencia:** generarlas sobre **Pharos mismo**. La salida de una herramienta sobre código propio es nuestra y no tiene problema de licencia. Como complemento, fixtures de proyectos MIT o Apache-2.0 con atribución. **Nunca AGPL** (no se copian fixtures del repo de k6).

| Formato  | Muestras                                                                                                                                                                                                                                                                                                              | Cómo                                                            | Licencia                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| SARIF    | (1) ESLint sobre `src/` con `@microsoft/eslint-formatter-sarif`; (2) Semgrep `p/typescript` sobre `server/src`, con `security-severity`; (3) Trivy `fs` sobre `package-lock.json`, con CVE, `security-severity` y `partialFingerprints`; (4) un ejemplo de `microsoft/sarif-sdk` con `suppressions` y `baselineState` | Ejecutar las herramientas en local (no en CI)                   | Salida nuestra; sarif-sdk es MIT                  |
| axe      | (1) `@axe-core/playwright` sobre 3 pantallas de la web de Pharos en el puerto 3100, una con violaciones; (2) el arreglo de `@axe-core/cli` sobre dos URLs locales, con `incomplete`                                                                                                                                   | Una ejecución local                                             | Salida nuestra (axe-core ya es dependencia)       |
| k6       | Un script contra la API local en el puerto 3100, con un umbral que pasa (`p(95)<2000`) y otro que falla (`rate<0`), _checks_ en grupos y una submétrica `{case:TC-1}`. Se exporta con `--summary-export` y con `handleSummary`                                                                                        | Instalar k6 en local                                            | Salida nuestra (k6 es AGPL, pero solo se ejecuta) |
| Allure   | (1) `allure-playwright` sobre 3 specs de `e2e/`, con un fallo, un reintento, un paso y un adjunto; (2) un ejemplo de `allure-framework/allure-js` o `allure2` (Apache-2.0) con `broken` y parámetros                                                                                                                  | Local, zip y carpeta                                            | Salida nuestra / Apache-2.0                       |
| TRX      | (1) un proyecto MSTest mínimo con `DataRow`, `[TestCategory("TC-1")]`, un fallo y un `Ignore`; (2) `dorny/test-reporter`, `__tests__/fixtures/dotnet-trx.trx` y xUnit (MIT)                                                                                                                                           | El SDK de .NET (hoy en la máquina solo está el host, no el SDK) | Salida nuestra / MIT                              |
| xcresult | El JSON de `xcresulttool get test-results tests` de un proyecto MIT que lo publique como fixture. Si no lo hay, solo podría generarse en un runner macOS de GitHub, que gasta minutos ×10 y hoy no hay presupuesto                                                                                                    | Buscar; si no aparece, se aplaza                                | —                                                 |

**Descargas que pediré permiso para hacer al implementar:** k6, Semgrep y Trivy (binarios oficiales), el SDK de .NET y los paquetes npm de desarrollo `@axe-core/playwright`, `@microsoft/eslint-formatter-sarif` y `allure-playwright`. Ninguno entra en las dependencias de runtime; solo `@xmldom/xmldom` y un lector de zip (`fflate`, MIT) entran en el paquete.

## 10. Preguntas para el usuario (respondidas el 2026-11-18: sí a la propuesta de cada una)

1. **¿Dónde viven los parsers?** La propuesta es el paquete `packages/formats` en TS, que el servidor reutiliza y del que el CLI remoto no necesita port. La alternativa, Rust/WASM, es una sola implementación pero cuesta más que toda la pista.
2. **¿Un umbral incumplido de k6 marca el caso vinculado como fallido en la matriz?** ADR-0012 dice que sí. Se propone mantenerlo.
3. **¿Se vinculan hallazgos a requisitos por `standardRefs`** (un requisito etiquetado `WCAG2:1.4.3` recibe los hallazgos de axe de esa regla) en 0.6.0? Se propone que **no**: queda para un ítem P2 posterior y en 0.6.0 solo se vincula a casos.
4. **¿Se importa `incomplete` de axe?** Se propone que sí, como hallazgo `info` «A revisar», que no cuenta como abierto en la matriz ni en el informe salvo con el filtro.
5. **¿`.xcresult` llega en 0.6.0?** Se propone que sí, como JSON de `xcresulttool`, si hay muestra real. Si no, se aplaza a RUN-04 (0.9.0) con la nota.
6. **¿Se suman a las quality gates (ADR-0041)** las métricas «hallazgos críticos o altos abiertos» y «umbrales de rendimiento cumplidos (%)»? Se propone hacerlo como un PR **F8** opcional, si el usuario lo quiere en 0.6.0.
