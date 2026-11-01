# Importadores de resultados → Pharos Run JSON

ING-02..05, paso 9 del [diseño 0.2.0](../design/0.2.0-modelo-ejecucion.md).
Código: `src/shared/contracts/pharos-run/importers/` (parsers) y
`src-tauri/src/runs/import.rs` (persistente). Se basa en el spike
[ING-01](../spikes/ING-01-formatos-resultados.md) §3. Las muestras reales del
spike, saneadas, son tests de contrato. Su salida normalizada está en
`src/shared/contracts/pharos-run/fixtures/ing01/normalized/`, y un port de
los parsers (el CLI de INT-01) tiene que reproducirla.

## Detección

Se detecta por el **contenido**, nunca por la extensión:

| Contenido                                               | Formato                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| La primera línea es un sobre de Messages (`{"meta":…}`) | `cucumber_messages` (se lee línea a línea)                    |
| XML con `<testsuites>` o `<testsuite>`                  | `junit`                                                       |
| JSON con `reportFormat: "CTRF"`                         | `ctrf`                                                        |
| JSON con `schemaVersion`                                | `pharos_run_json`                                             |
| JSON con `config` y `suites`                            | `playwright_json`                                             |
| Arreglo JSON de features (Cucumber JSON)                | Se rechaza: hay que usar Messages (conserva reintentos y filas) |

Límites: 200 MB por archivo (el límite de evidencia), 50 MB si es JSON o XML
(se leen enteros) y 20 000 resultados por importación.

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
