# Importadores de resultados → Pharos Run JSON

ING-02..05, paso 9 del [diseño 0.2.0](../design/0.2.0-modelo-ejecucion.md).
Código: `packages/formats/src/importers/` (parsers, paquete `@pharos/formats`
que comparten la app, la web y el servidor) y
`src-tauri/src/runs/import.rs` (persistente). Se basa en el spike
[ING-01](../spikes/ING-01-formatos-resultados.md) §3. Las muestras reales del
spike, saneadas, son tests de contrato. Su salida normalizada está en
`packages/formats/src/fixtures/ing01/normalized/`, y un port de
los parsers (el CLI de INT-01) tiene que reproducirla.

## Formatos de 0.6.0 (ING-06, ING-07)

SARIF, axe y k6 (hallazgos y métricas), Allure y TRX (resultados) y `.xcresult`
están aprobados en [ADR-0053](../adr/0053-hallazgos-metricas-y-paquete-de-formatos.md).
SARIF, axe y k6 ya tienen parser (abajo); Allure, TRX y `.xcresult` siguen en el
[plan de la pista F](../design/f-formatos-plan.md) §7 hasta que se implementen.
Los tres dan `findings[]` y `metrics[]` sin `results[]`, así que no cambian
Pharos Run JSON 1.0.0. No suben `NORMALIZER_VERSION`: antes nadie podía
importar esos archivos, así que ningún contenido cambia bajo un id ya escrito.

Comunes:

- **Severidad:** `critical | high | medium | low | info`, con el valor de origen
  en `rawSeverity`.
- **Huella** (si la herramienta no trae una): `pharos:` + UUIDv5 de la
  herramienta, la regla y la ubicación normalizada (`derivedFingerprint` en
  `ids.ts`). Nunca incluye el mensaje. Es UUIDv5 y no sha256 porque los parsers
  son síncronos y en el navegador sha256 solo es asíncrono.
- **Ids** (para los persistentes, F2): `findingId(shard, huella, n)`,
  `metricId(shard, nombre, agregación, ámbito)` y
  `findingTriageId(proyecto, huella)` en `ids.ts`.
- **Etiquetas de caso:** los parsers no vinculan. Dejan las etiquetas
  (`@TC-1`) en `attributes.tags`, y el persistente las resuelve con el prefijo
  del proyecto, como con los resultados.
- **Límites:** 20.000 hallazgos y 5.000 métricas por importación.
- **Persistente:** `runs/findings.rs` los guarda en la transacción de la
  importación (tablas `findings` y `metrics`, migración 0048) y los
  sincroniza como `finding` y `metric`. Un Pharos Run JSON con un hallazgo
  sin `fingerprint` recibe la derivada al leerse (`fingerprintOf`).
- **Vectores para puertos** (el CLI): `fixtures/detection-vectors.json` (el
  formato o el error de cada muestra y de entradas en línea, por contenido) y
  `fixtures/schema-vectors.json` (documentos válidos e inválidos, con sus
  errores). Los genera y comprueba `vectors.test.ts`.

### SARIF 2.x → hallazgos

Se detecta por `version` `2.x` y `runs[]`.

| Pharos | SARIF |
| --- | --- |
| uno por | resultado con `kind` `fail` (por defecto), `open` o `review`, y sin `baselineState: absent`. Los demás se cuentan en el aviso `sarif-skipped` |
| `ruleId` / `ruleName` | `ruleId` (o `rule.id`) / `rule.name` o `shortDescription`. La regla se busca por `rule.index`/`ruleIndex` en el `toolComponent` del resultado o en `extensions`, y si no por id |
| `severity` | `security-severity` del resultado o de la regla (≥9 crítica, ≥7 alta, ≥4 media, >0 baja); si no, `level` del resultado o `defaultConfiguration.level`: `error` alta, `warning` media (también por defecto), `note` baja, `none` info |
| `rawSeverity` | `level` y `security-severity n`, unidos con ` · ` |
| `message` | `message.text`, `markdown`, o el `messageStrings` de la regla con `{n}` sustituidos |
| `location` | `uri` relativa al repo (`file://`, `%20`, `uriBaseId` y prefijos de CI o de usuario fuera), `line`, `column`, `endLine`, `component` (ubicación lógica), `url` (`webRequest.target`) |
| `fingerprint` | `partialFingerprints` (o `fingerprints`), la primera clave por orden, como `sarif:<herramienta>:<regla>:<clave>=<valor>`: la huella de la herramienta identifica una línea, no una regla. Si no hay, la derivada |
| `standardRefs` | etiquetas `external/cwe/cwe-79` y `CWE-79`, `owasp…A03`, y `relationships`/`taxa` de CWE u OWASP |
| `attributes` | `tool`, `kind`, `tags`, `baselineState`, `suppressed` (todas las `suppressions` aceptadas o sin estado), `rank`, `automationId` |
| run | herramientas (`sourceTool`), `versionControlProvenance` (`commitSha`, `branch`, `repositoryUrl`), `invocations` (horas). `executionSuccessful: false` da el aviso `tool-failed` |

### axe-core → hallazgos y métricas

Se detecta por `testEngine.name: "axe-core"` y `violations[]`, o un arreglo de
esos (uno por página, `@axe-core/cli`).

| Pharos | axe |
| --- | --- |
| hallazgo | uno por **regla violada × nodo** |
| `severity` | `impact` del nodo, o de la regla: `critical` crítica, `serious` alta, `moderate` media, `minor` baja |
| `message` / `location` | `failureSummary` / `url`, `selector` (`target` unido con ` >> `, ` >>> ` dentro de un shadow DOM), `html` |
| `fingerprint` | derivada de la página **sin query ni fragmento** y el selector |
| `standardRefs` | `wcag143` → `WCAG2:1.4.3`, `EN-9.1.4.3` → `EN301549:9.1.4.3`, `section508.22.a` → `S508:22.a`; el nivel (`wcag21aa`) va a `attributes.wcagLevel` |
| `incomplete[]` | hallazgo `info` con `attributes.needsReview` («A revisar»): no cuenta como abierto (decisión 4 del usuario) |
| métricas | por página: `axe.rules_violated`, `axe.rules_incomplete` y `axe.rules_passed` (`count`, ámbito = URL) |

### k6 → métricas

Se detecta por `metrics` y `root_group`. Lee el `data` de `handleSummary` y el
`--summary-export` (formato antiguo), y los dos dan las mismas métricas.

| Pharos | k6 |
| --- | --- |
| métrica | una por **métrica × agregación** presente, en orden fijo (avg, min, med, max, percentiles) |
| `name` / `scope` | `http_req_duration{expected_response:true}` → `http_req_duration` / `expected_response:true` |
| `aggregation` | `p(95)` → `p95`; contador: `count` y `rate`; rate: siempre `rate` (el formato antiguo la llama `value`); gauge: `value`, `min` y `max` |
| `unit` | `time` → `ms`, `data` → `B`, rate → `ratio`, `rate` de un contador → `/s`. En el formato antiguo, que no dice qué contiene, se deduce de las métricas propias de k6 |
| `threshold` / `passed` | cada expresión va a la agregación que nombra; varias se unen con ` && `. `passed`: `ok` en `handleSummary`; en el formato antiguo, **`true` es que el umbral se superó (falló)**, comprobado con una exportación real |
| umbral sin valor | `p(99)` fuera de `summaryTrendStats`: aviso `threshold-without-value`, y el umbral queda en `attributes.thresholdsWithoutValue` |
| checks | uno por check: `checks`, `rate`, ámbito = ruta del grupo y el nombre, `attributes {passes, fails}` |
| etiquetas | el tag `case` de una submétrica (`{case:TC-1}`) y `@TC-1` en el nombre de un check |

## Detección

Se detecta por el **contenido**, nunca por la extensión:

| Contenido                                               | Formato                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| La primera línea es un sobre de Messages (`{"meta":…}`) | `cucumber_messages` (se lee línea a línea)                    |
| XML con `<testsuites>` o `<testsuite>`                  | `junit`                                                       |
| JSON con `reportFormat: "CTRF"`                         | `ctrf`                                                        |
| JSON con `testEngine.name: "axe-core"` y `violations`, o un arreglo de ellos | `axe` |
| JSON con `version` `2.x` y `runs[]`                     | `sarif`                                                       |
| JSON con `metrics` y `root_group`                        | `k6`                                                          |
| JSON con `schemaVersion`                                | `pharos_run_json`                                             |
| JSON con `config` y `suites`                            | `playwright_json`                                             |
| Arreglo JSON de features (Cucumber JSON)                | Se rechaza: hay que usar Messages (conserva reintentos y filas) |
| XML con un DTD (`<!DOCTYPE` en el prólogo)              | Se rechaza (`invalid-xml: doctype`): un DTD es la vía de XXE y de las bombas de entidades, y ningún formato lo necesita. Un `<!DOCTYPE html>` dentro de la salida capturada de un test es contenido y no cuenta |

Límites: 200 MB por archivo (el límite de evidencia), 50 MB si es JSON o XML
(se leen enteros), y por importación 20 000 resultados, 20 000 hallazgos y
5 000 métricas.

## Identidad (`test_key`) e intentos

`test_key` = ruta relativa (`/`, sin `./`) + `::` + títulos unidos por ` › `,
y `[n]` (1-based) solo cuando los títulos no distinguen la fila (los pickles
de un Outline de Cucumber comparten nombre).

- Las rutas absolutas se relativizan contra `config.rootDir` de Playwright, si
  lo hay. Si no, se quitan solo **prefijos estables**: la carpeta del usuario
  (`C:/Users/<u>/`, `/home/<u>/`, `/Users/<u>/`), los espacios de trabajo de
  CI (GitHub Actions, GitLab, Jenkins, Azure Pipelines, Bitbucket, CircleCI,
  `/workspace/`…) y la letra de unidad. Nunca depende de qué otros archivos
  trae el informe: el informe de un shard y el fusionado dan la misma clave.
  El `filePath` de un Pharos Run JSON se relativiza igual, porque va a los
  atributos sincronizados.
- Los reporters de Playwright (JSON, CTRF y JUnit) dan la **misma** clave a un
  mismo test.

| Formato           | Ruta                                          | Títulos                                    | Intentos (`attempt`, 0-based)                                                              |
| ----------------- | --------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Cucumber Messages | `pickle.uri`                                  | `pickle.name` (+ `[n]`)                    | uno por `testCaseStarted.attempt`                                                          |
| CTRF              | `suite[0]` si es un archivo; si no, `filePath` | resto de `suite[]` + `name`                | `retryAttempts[].attempt` (1-based) − 1; el test es el intento `retries`                   |
| Playwright JSON   | `spec.file`                                   | `describe`s + `spec.title`                 | uno por `tests[].results[].retry`; `projectName` → `configurationLabel`                    |
| JUnit XML         | `classname` (o `file`, o el `testsuite`)      | `name`                                     | `flakyFailure`/`flakyError` preceden a un pase; en un test fallido, `<failure>` es la 1.ª ejecución y cada `rerun*` la siguiente |
| Pharos Run JSON   | el suyo                                       | `testKey`, o `filePath` + `suite` + `name` | `attempt`                                                                                  |

## Campos

| Pharos (resultado)            | Messages                                                                         | CTRF                                     | Playwright JSON                        | JUnit                                          |
| ----------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------- | ---------------------------------------------- |
| `status`                      | peor paso **sin hooks**; un hook FAILED falla el intento                         | `status` (`pending` → `skipped` + raw)   | `passed`, `failed`/`timedOut` → failed | `failure`/`error` → failed, `skipped`, passed  |
| `rawStatus`                   | estado del paso que decide                                                       | `rawStatus`                              | `status`                               | nombre del elemento                            |
| etiquetas (`tags`)            | `pickle.tags[].name`                                                             | `tags`                                   | `spec.tags` + `@`, anotación `test_id` | propiedad `test_id` (receta), `tag`/`tags`     |
| `exampleRow`                  | posición de `astNodeIds[1]` en las filas del Outline                             | `Example #n`                             | `Example #n`                           | `Example #n`; `- #1.f` de cucumber-js          |
| `startedAt` / `finishedAt`    | `testCaseStarted` / `testCaseFinished`                                           | `start`/`stop` (ms)¹                     | `startTime` + `duration`               | —                                              |
| `duration`                    | suma de los pasos                                                                | `duration`                               | `duration`                             | `time` (s → ms)                                |
| `message` / `trace`           | `exception.message` / `message` del paso fallido                                 | `message` / `trace`                      | `error.message` / `error.stack`        | `@message` / texto                             |
| pasos                         | pasos del pickle (keyword y línea de Gherkin)                                    | `steps[]` (`name`, `status`)             | `steps[]` de primer nivel              | —                                              |
| flaky declarado               | — (se deriva de los intentos)                                                    | `flaky`                                  | `status: flaky` en el último           | `flakyFailure` sin `failure` final             |
| adjuntos                      | `attachment` (base64 o texto), al paso o al resultado                            | `attachments[].path`                     | `body` (base64) o `path`               | `[[ATTACHMENT\|ruta]]` en `system-out`         |
| run                           | `meta.implementation`, `testRunStarted/Finished`, `protocolVersion`              | `tool`, `summary`, `environment`         | `config.version`, `stats`              | `testsuite@timestamp`                          |
| shard                         | —                                                                                | `environment.shardId` (`2-of-2`)         | `config.shard`                         | —                                              |

¹ CTRF no da tiempos a `retryAttempts`. Se toma `finishedAt` = inicio del
intento final (`attributes.finishedAtInferred`) para que el intento final
derivado no caiga en la hora de importación.

Cada shard lleva `normalizerVersion`, la versión de estos parsers: todo cambio
en lo que producen la sube (ADR-0013).

Un adjunto de Messages enviado por URL se guarda como ruta y no se descarga (aviso
`attachment-url`). El shard (`shardIndex`/`shardTotal`) sale solo del informe:
es contenido inmutable; un índice fuera de 1..total se rechaza.

Un informe fusionado con `merge-reports` (Playwright, `argv` vacío) se importa
con un aviso: pierde el shard y su duración no es fiable (ING-01 §4).

## Vínculo (se deriva al leer, `runs/link.rs`)

El resultado importado no guarda el vínculo (ADR-0013, «Vínculo derivado»):
se deriva igual en todos los equipos.

- **Caso:** gana una regla de enlace posterior. Si no, cada etiqueta (con o
  sin `@`) y el `caseKey` nombran el caso vivo que lleva esa clave ahora; si
  ninguno, los que la llevaron antes (claves de sus revisiones), así que una
  clave libre, un prefijo antiguo o un cambio de prefijo siguen vinculando. Una etiqueta
  con la forma `<case_id_prefix><n>` que no es de nadie es «clave
  desconocida». Un caso vincula; sin ninguno, con dos o con un conflicto de
  clave abierto, el test va a la bandeja con su motivo. Un caso borrado sigue
  vinculado («caso borrado»).
- **Revisión:** la del elemento del run para ese caso, flujo y fila; si no, la
  revisión sincronizada vigente en `run.started_at`; si no hay ninguna, la más
  antigua.
- **Flujo:** el del caso avanzado que se llama como el escenario (`Example #n`
  toma el nombre del Outline de `suite`; `- #b.f` se quita).
- **Fila y pasos:** la fila por índice. El `step_id` solo se pone si el texto
  coincide con el paso de la revisión en esa posición; un `<parámetro>` del
  Outline casa con cualquier valor, y la palabra clave (`Given`, `Dado`…) se
  separa antes de comparar.
