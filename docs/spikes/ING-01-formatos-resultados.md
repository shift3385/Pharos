# ING-01 — Dónde viven los IDs `@TC-xxx` en los informes reales

Spike del 2026-10-26. Alcance: solo investigación; no se tocó código de la app. Desbloquea EJE-01 (modelo Run/Shard/Result) y ING-02..04 (importadores).
Muestras reales y proyecto reproducible: carpeta de notas de la sesión (`ING-01-evidence/`, fuera del repo).

## 1. Conclusión

1. **El ID llega por el tag del pickle, no por JUnit.** Los JUnit nativos de Playwright 1.64.1 y de cucumber-js 13.3.0 **no llevan los tags** (ni en `<properties>`, ni en `name`, ni en `classname`). La hipótesis del estado del arte ("playwright-bdd emite tags en `<properties>`") es **falsa** de serie.
2. **Cucumber Messages y CTRF sí los conservan**, también tras `merge-reports` (con una trampa, ver §4).
3. **Un Outline = un pickle por fila**, con los tags del Outline (y de la Feature, y de cada bloque `Examples`) copiados en cada pickle. La fila se identifica por `pickle.astNodeIds[1]` → `gherkinDocument`.
4. **Los IDs de ejecución de las herramientas no sirven como ID de caso**: `testId` de CTRF y `testCase.id` de playwright-bdd son un hash de archivo + título y cambian al renombrar el escenario (demostrado). El tag sobrevive.
5. **Reintentos y shards solo se ven completos en Cucumber Messages y CTRF**; JUnit y Cucumber JSON los pierden.

Versiones fijadas (todas permisivas): `playwright-bdd@9.2.1` (MIT), `@playwright/test@1.64.1` (Apache-2.0), `@cucumber/cucumber@13.3.0` (MIT), `playwright-ctrf-json-reporter@0.2.0` (MIT; emite `specVersion: "0.2.0"`, tipos `ctrf@0.5.0` MIT). Árbol completo de 138 paquetes: MIT, Apache-2.0, ISC, BSD, BlueOak-1.0.0 (5 paquetes, solo herramientas del spike, no del producto), CC0/CC-BY-3.0 (datos SPDX). Ninguno GPL/AGPL. Node 24.11, Windows 11.

## 2. Hallazgos con evidencia

Fixture: `@REQ-014` en la Feature, `@TC-001` en un Scenario, `@TC-002` en un Scenario Outline con 2 filas (una pasa, una falla) y un `@TC-003` que falla en el primer intento y pasa en el reintento.

### 2.1 JUnit (Playwright, `reporter: junit`)
```xml
<testcase name="Autenticacion › Login rechazado › Example #2" classname="features\auth.feature.spec.js" time="0.007">
  <system-out>[[ATTACHMENT|..\..\test-results\...\error-context.md]]</system-out>
  <error message="Expected values to be strictly equal:" type="AssertionError">…
```
- Sin tags. `classname` = ruta del spec **generado**; `name` = `Feature › Scenario [› Example #n]`. Con reintentos el flaky sale como `testcase` limpio (sin traza del fallo).
- La opción `omitTags` de 1.64 existe pero **no afecta** al JUnit (solo a list/dot/github).
- `includeRetries: true` (o `PLAYWRIGHT_JUNIT_INCLUDE_RETRIES=1`) añade `<flakyError>` y `<rerunError>`.
- **Receta que sí funciona** (verificada): fixture `auto` que copia `@TC-n`/`@REQ-n` a `testInfo.annotations`; requiere `importTestFrom` en `defineBddConfig`:
```xml
<testcase name="Autenticacion › Login con credenciales validas" …>
  <properties><property name="requirement" value="REQ-014"/><property name="test_id" value="TC-001"/></properties>
```
  Es la convención `test_id` de TestRail. Pharos puede ofrecerla como snippet, pero **no puede exigirla**.

### 2.2 JUnit de Cucumber (cucumber-js `--format junit` y reporter `junit` de playwright-bdd)
```xml
<testcase classname="Autenticacion" name="Login rechazado - #1.2">
<testcase classname="Extra" name="Dos bloques &lt;n> - Bloque B - #2.1: Dos bloques c">
```
Sin tags. `classname` = nombre de la Feature (¡no un archivo!). Fila de Outline = sufijo `- #<bloque>.<fila>` (cucumber-js) y `Example #n` (Playwright).

### 2.3 Cucumber Messages (NDJSON) — cucumber-js y reporter `message` de playwright-bdd
```jsonc
// pickle del Outline, fila 2
{"uri":"features\\auth.feature","name":"Login rechazado",
 "tags":[{"name":"@REQ-014","astNodeId":"…"},{"name":"@priority:high",…},{"name":"@TC-002","astNodeId":"9eda78cc…"}],
 "astNodeIds":["65037524…" /*Scenario Outline*/, "4de8c73a…" /*fila Examples*/]}
// gherkinDocument: Outline con rows[{id:"544c431d…",line:17},{id:"4de8c73a…",line:18}]
{"testCaseStartedId":"8e7ca6f9…","willBeRetried":true}          // testCaseFinished, intento 0
{"attempt":0,"testCaseId":"a79391c2…","id":"8e7ca6f9…"}         // testCaseStarted
```
- Los tags viven en `pickle.tags[].name` **con `@`**. Cada tag lleva `astNodeId` → permite saber si vino de Feature, Scenario u `Examples`.
- Cadena de enlace: `pickle.id` ← `testCase.pickleId`; `testCase.id` ← `testCaseStarted.testCaseId`; `testCaseStarted.id` ← `testCaseFinished.testCaseStartedId` y `testStepFinished.testCaseStartedId`.
- Reintentos: un `testCaseStarted` por intento (`attempt` 0,1,…); el resultado válido es el `testCaseFinished` con `willBeRetried:false`. Flaky = último intento OK y algún intento previo fallido.
- **Outline**: dos pickles con el mismo `name` ("Login rechazado") y el mismo tag `@TC-002`; solo difieren en `astNodeIds[1]`. El índice de fila `n` = posición de esa fila en `examples[*].tableBody` del escenario (contando entre bloques `Examples`). Si el nombre usa `<param>` el nombre sí difiere, pero no se debe depender de eso.
- **Tags de `Examples` se fusionan en el pickle**: con `@TC-011` sobre un bloque, el pickle trae `@TC-010` **y** `@TC-011` → ambigüedad que hay que detectar.
- `pickle.id`, `testCase.id` y `uri` no son estables: UUID aleatorio por ejecución en cucumber-js; en playwright-bdd `testCase.id` = `test.id` de Playwright (hash archivo+título). `uri` usa `\` en Windows y es relativo al cwd.
- Los adjuntos cuelgan de un paso sintético "After Hooks" en playwright-bdd (`attachment.testStepId = …-after-test-run-0`), con `contentEncoding: BASE64`.
- `meta.implementation` identifica la herramienta; `meta.protocolVersion` difiere: cucumber-js 13.3.0 → `34.2.1`; playwright-bdd 9.2.1 → `32.2.0`. El parser debe tolerar ambas.
- **Rareza de playwright-bdd 9.2.1**: en el último intento de un flaky, el paso sintético "After Hooks" llega como `SKIPPED` (pasos `PASSED,PASSED,SKIPPED`), y su `cucumber.json`/`junit` marcan el escenario como `skipped` aunque pasó. El estado del Result debe calcularse ignorando pasos de hook, no por "peor estado de los pasos".

### 2.4 Cucumber JSON (cucumber-js `--format json`, o reporter `json` de playwright-bdd)
```jsonc
{"id":"autenticacion;login-rechazado","keyword":"Scenario Outline","line":18,
 "tags":[{"name":"@REQ-014"},{"name":"@priority:high"},{"name":"@TC-002"}],
 "steps":[{"result":{"status":"passed"}},{"result":{"status":"failed","error_message":"…"}}]}
```
Tags correctos y completos (heredados incluidos), pero **las filas del Outline comparten `id`** y solo se distinguen por `line`; los reintentos desaparecen (solo se ve el último intento). Formato en mantenimiento: usarlo solo como entrada secundaria.

### 2.5 JSON nativo de Playwright
`specs[].tags` = `["REQ-014","priority:high","TC-001","smoke"]` (**sin `@`**), `tests[].status` ∈ `expected|unexpected|flaky|skipped`, `results[]` con `retry` 0..n, `config.shard = {"current":2,"total":2}` solo en el informe del shard (en el fusionado es `null`).

### 2.6 CTRF (`playwright-ctrf-json-reporter@0.2.0`)
```jsonc
{"reportFormat":"CTRF","specVersion":"0.2.0","reportId":"bf37a73c-…","generatedBy":"playwright-ctrf-json-reporter",
 "results":{"tool":{"name":"playwright","version":"1.64.1"},"summary":{…},"environment":{"shardId":"2-of-2"},
  "tests":[{"testId":"8730573857dc6259c5ba-aaef8b1bf326aff6ec89","executionId":"…","attemptId":"…",
    "name":"Reintento de sesion expirada","status":"passed","rawStatus":"passed",
    "tags":["@REQ-015","@TC-003","@flaky-demo"],"retries":1,"flaky":true,
    "retryAttempts":[{"attempt":1,"status":"failed","attemptId":"…","message":"Error: first attempt fails (flaky demo)"}],
    "suite":["features\\flaky.feature.spec.js","Sesion"],"steps":[{"name":"Given …","status":"passed"}],"attachments":[…]}]}}
```
- `tags` con `@`, tags de Feature + Scenario (+ Examples) ya fusionados. **`testId` no es el ID de caso**: es el hash de Playwright y cambió al renombrar el escenario (`…e4375238…` → `…165f099d…`) mientras `@TC-001` siguió igual.
- Outline: `name` = `Example #n`; el nombre del Outline va solo en `suite[]` (último elemento). `n` es 1-based global del Outline.
- Shard: **solo** `results.environment.shardId = "2-of-2"` en el informe de cada shard. No hay `runId`: `reportId` es aleatorio por archivo. Pharos debe asignar el `run_id` al subir (`--run`).
- Reintentos: `retries`, `flaky`, `retryAttempts[]` (los intentos fallidos previos). El estado final está en `status`.
- Pasos solo con `name`+`status` (sin duración ni líneas); sin números de línea Gherkin.
- Cuidado: el tag `@TC` en `tags` está bien, pero `type:"e2e"` y `filePath` apuntan al spec generado, no al `.feature`.

## 3. Mapeo campo a campo al modelo EJE-01

Fuente preferente por formato: **Messages > CTRF > Cucumber JSON > JUnit**. Para cada campo: dónde sale y qué hacer si falta.

| Modelo Pharos | Cucumber Messages | CTRF 0.2 | JUnit (Playwright) | Cucumber JSON |
|---|---|---|---|---|
| `Run.source_tool` | `meta.implementation.name` (+`version`) | `results.tool.name`/`version`, `generatedBy` | no está (inferir por cabecera/CLI) | no está |
| `Run.run_id` | no existe: lo asigna `pharos upload --run` | no existe (`reportId` es por archivo) | no existe | no existe |
| `Run.started_at/finished_at` | `testRunStarted`/`testRunFinished.timestamp` | `summary.start`/`stop` (ms; **erróneo tras merge**) | `testsuite@timestamp` + `time` | no está |
| `Shard.shard_id` | no existe | `results.environment.shardId` (`"2-of-2"`) solo en informes por shard | no existe | no existe |
| `Result.case_id` (vínculo) | tag `@TC-\d+` en `pickle.tags[].name` | tag en `tests[].tags` (con `@`) | `<property name="test_id">` **solo con la receta**; si no, sin vínculo | tag en `elements[].tags[].name` |
| `Result.requirement_ids` (informativo) | tag `@REQ-\d+` (de Feature, heredado) | ídem | `<property name="requirement">` solo con receta | ídem |
| `Result.unlinked_key` | `uri` normalizada + `pickle.name` + índice de fila | `filePath` + `suite[]` + `name` | `classname` + `name` | `uri` + `id` + `line` |
| Fila de Outline (`TC-002[n]`) | índice de `pickle.astNodeIds[1]` en `gherkinDocument…examples[*].tableBody` | número de `Example #n` en `name` | `Example #n` (Playwright) o `#b.f` (Cucumber JUnit) | orden por `line` entre elementos con mismo `id` |
| `Result.attempt` | `testCaseStarted.attempt` (0-based) | `retryAttempts[].attempt` (1-based) + el final | no (con `includeRetries`: `<flakyError>`/`<rerunError>`) | no |
| `Result.status` | último `testCaseFinished` con `willBeRetried:false`; estado por pasos **ignorando hooks** | `tests[].status` (`passed/failed/skipped/pending/other`) | `<error>`/`<failure>`/`<skipped>`; si no, passed | peor estado de `steps[].result.status` (¡cuidado con hooks!) |
| `Result.flaky` | último OK y algún intento previo con `willBeRetried:true` | `tests[].flaky` | solo con `includeRetries` (`<flakyError>`) | no |
| `Result.duration` | `testStepFinished.testStepResult.duration` sumada (s+ns) | `tests[].duration` (ms) | `testcase@time` (s) | `steps[].result.duration` (ns) |
| `Result.error` | `testStepResult.message` / `.exception` del paso FAILED | `message`, `trace`, `snippet` | `<error@message>` + CDATA | `error_message` |
| `Result.browser/device` | no | `extra`/proyecto (no emitido por el reporter probado) | `testsuite` por proyecto (con `includeProjectInTestName`) | no |
| `StepResult.n/name/status` | `pickle.steps[]` ↔ `testCase.testSteps[]` (excluir los que tienen `hookId`) | `tests[].steps[]` (solo nombre y estado) | no | `steps[]` |
| `StepResult.duration/line` | `testStepFinished` / `pickleStep.astNodeIds` → línea Gherkin | no | no | `line` (observado); `match.location` (esquema estándar, no observado) |
| `Attachment` (sha256, mime, uri) | `attachment` envelope: `mediaType`, `fileName`, `body` (BASE64 o texto), `testCaseStartedId`, `testStepId`; **calcular `sha256` al ingerir** | `attachments[]`: `name`, `contentType`, `path` (ruta local absoluta) | `[[ATTACHMENT|ruta]]` dentro de `<system-out>` | `embeddings[]` (esquema estándar, no observado) |

Reglas de modelo que se desprenden:
- `Result` es **append-only por intento**: guardar todos los intentos y marcar el final; no sobrescribir.
- `Shard` no es un dato de los formatos: nace del comando de subida (`--shard 2/2`) o de `environment.shardId` de CTRF. Para sharding con `merge-reports` el resultado fusionado **ya no lo trae** (§4).
- La clave natural de importación es `(run_id, case_key, attempt)` con `case_key = TC-002[n]`. La idempotencia de re-subir el mismo archivo requiere un hash del archivo o `(run_id, source_file_sha256)`.

## 4. Sharding y `merge-reports`

Comandos: `playwright test --shard=1/2` y `2/2` con reporter `blob`, luego `playwright merge-reports --config merge.config.js <dir>`.

- Con `fullyParallel` el reparto fue 2+2 tests (TC-001 y `Example #1` en el shard 1; `Example #2` y TC-003 en el 2): **las filas de un mismo Outline pueden caer en shards distintos**, así que el vínculo se hace por pickle, nunca por fichero.
- El reporter `blob` **borra su `outputDir`** en cada ejecución: cada shard necesita su propio directorio (o nombre) y juntarlos después. Con el mismo directorio solo quedó el último shard.
- Tags tras merge: **conservados** en Playwright JSON, JUnit, CTRF y Cucumber (4/4 tests con sus `@TC`).
- **Trampa**: si `merge.config.js` no llama a `defineBddConfig`, los reporters Cucumber de playwright-bdd generan archivos **vacíos sin error** (`tests="0"`, `[]`, NDJSON con solo `meta`/`testRun*`). Con `testDir: defineBddConfig(…)` en el config de merge salieron los 4 pickles y 6 `testCaseStarted`.
- Se pierde al fusionar: `config.shard` (null), `environment.shardId` de CTRF (desaparece `environment`), y el `summary` de CTRF sale con duración errónea (14 ms vs 4612 ms reales) y `suites: 8`.
- Decisión recomendada: **ingerir los informes por shard** (cada subida con `--run` y `--shard`) y no el fusionado; el fusionado solo como último recurso (sin shard, con duración poco fiable).

## 5. Expresión de tag recomendada

El prefijo del ID es configurable por proyecto (`case_id_prefix`, p. ej. `ATS_`, `FT`, `TC-`; ver GLOSARIO), así que la regex se **construye** desde la configuración:

```text
caso:        ^@(?<id>{PREFIX}[0-9]{1,9})$        PREFIX = escapeRegex(case_id_prefix)   # por defecto "TC-"
requisito:   ^@(?<id>{REQ_PREFIX}[0-9]{1,9})$    # por defecto "REQ-"
fila:        id + "[" + n + "]"                   # TC-002[2]
```
Reglas: comparar el tag completo (anclado; `@TC-0011x` no casa), sensible a mayúsculas, quitar la `@` solo para guardar. Sin mirar `name`/`classname`/título. Si el pickle trae **0** tags de caso → bandeja de no vinculados (ING-05). Si trae **más de uno** (p. ej. `@TC` en `Examples`) → no vincular y avisar. Para Playwright JSON, que quita la `@`, normalizar antes de aplicar la regex.
Exportación: coherente con TRZ-03, `@TC-xxx` solo a nivel de Scenario/Outline y `@REQ-xxx` a nivel de Feature; no poner `@TC` en `Examples`. Filtrado verificado: `playwright test --grep "@TC-002"` ejecuta las 2 filas; `cucumber-js --tags "@TC-001 or @TC-003"` ejecuta esos escenarios.

## 6. Riesgos abiertos

| # | Riesgo | Mitigación propuesta |
|---|---|---|
| R1 | JUnit sin tags: el camino más universal no vincula por sí solo | Exigir Messages/CTRF para vincular automático; JUnit → solo con la receta `test_id` o como no vinculado |
| R2 | `Example #n` y `#b.f` dependen del orden de filas: insertar/reordenar filas reasigna `TC-002[n]` | Aceptable en v0.0.3; documentar. Alternativa: tag `@TC-002.1` por fila (rompe la regla "ID a nivel de escenario"); decidir en EJE-01 |
| R3 | `testId`/`testCase.id` cambian al renombrar | No usarlos como clave de caso |
| R4 | Rareza `SKIPPED` en playwright-bdd 9.2.1 (hook) y salto de la próxima major `10.0.0-next.x` | Ignorar hooks al calcular estado; test de regresión con muestra real; fijar versión en la guía |
| R5 | Dos versiones de protocolo de Messages (32.2.0 y 34.2.1) | Parser tolerante por campos; guardar `protocolVersion` en el Run |
| R6 | CTRF: reporter 0.2.0 sin `runId`, `environment` mínimo, `path` de adjuntos locales y absolutos, `specVersion` 0.2.0 aún Working Draft | Adaptador mínimo y opcional; tests de contrato con las muestras |
| R7 | Adjuntos: Messages los trae embebidos en BASE64 (pesados); CTRF/JUnit solo rutas locales que el CLI debe leer | `pharos upload` resuelve rutas y calcula `sha256`; tope de tamaño |
| R8 | Muestras de una sola herramienta, de un solo entorno (Windows, sin navegador, sin proyectos múltiples) | Repetir con proyectos Playwright multi-navegador y con cucumber-js `--parallel`, Reqnroll y Karate antes de congelar el esquema |
| R9 | Rutas `uri`/`filePath` con `\` y relativas al cwd | Normalizar a `/` y relativizar al repo antes de usar como `unlinked_key` |
| R10 | Sin probar: Allure results, JVM Cucumber, `@retries:N` de playwright-bdd, tags de Playwright por `test.describe` | Ítems de seguimiento si se prioriza |

## 7. Reproducir

Proyecto en `ING-01-evidence/project/` (no en el repo). `npm i` con las versiones de la §1; `npx bddgen && npx playwright test` (variables `RETRIES`, `OUT`, `BLOB`, `BLOBDIR`, `TAG_ANN`); `npx cucumber-js --format message:…`; `merge.config.js` para §4; `analyze-messages.js` para recorrer el NDJSON.
