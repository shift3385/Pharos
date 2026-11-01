# ADR-0013 · El Run nace con su contexto: entorno, build, commit, dataset, origen e identidad CTRF (RUN-00)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las
  respuestas recomendadas). Revisado el 2026-10-28 tras la revisión
  independiente (ver "Revisión"): precisiones de identidad, sin cambio de
  decisión. Absorbe EJE-05 y los campos de TRZ-04. Bloquea EJE-01, EJE-02 e
  ING-02..05.
- **Diseño de conjunto:** [`docs/design/0.2.0-modelo-ejecucion.md`](../design/0.2.0-modelo-ejecucion.md).

## Contexto

- **Contexto de ejecución.** El estudio del arte propone
  `Run(run_id, project, plan_id?, build/commit, environment, trigger, source_tool)`
  → `Shard` → `Result(case_id? | unlinked_key, attempt, status, flaky…)`. Un run
  sin entorno, build ni dataset no permite reproducir ni informar.
- **Lo que mostró el spike ING-01** (§3, §4):
  - ningún formato trae un `run_id` común, así que lo asigna Pharos;
  - el shard solo aparece en CTRF por shard o en el comando de subida;
  - los reintentos solo están completos en Cucumber Messages y CTRF;
  - resubir un archivo exige el hash del archivo para no duplicar;
  - el estado se calcula ignorando los hooks.
- **El tag de caso no identifica un test.** Un caso avanzado pone el mismo
  `@<scenario_id>` en todos sus flujos (`src/modules/test-cases/ui/gherkin.ts`,
  bucle `for (const flow of flows)`), así que un run produce N tests con la
  misma clave de caso.
- **Índices únicos.** Un `UNIQUE` sobre filas sincronizadas con ids aleatorios
  hace fallar el pull entero cuando dos equipos escriben la "misma" fila. Le pasa
  a dos equipos que registran el intento n del mismo elemento, o que importan el
  mismo archivo en el mismo run. Es lo que [ADR-0010](0010-claves-entre-equipos.md)
  aplazó y [ADR-0020](0020-sync-por-usuario-cascada-y-version.md) quitó.
- **Resultados sin vínculo.** Un test sin tag va a una bandeja y se enlaza
  después (ING-05). El enlace no puede modificar el resultado (ROADMAP §8).
- **Riesgo.** `requirements` (`0010_traceability.sql`) solo tiene `priority`.
  TRZ-04 pide probabilidad × impacto (ISTQB CTFL 4.0 §5.2).
- **Ejecución manual.** Necesita saber qué se iba a ejecutar ("3 de 12"), no
  solo qué se ejecutó.

## Opciones

| Opción                                                                                                        | A favor                        | En contra                                                      |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------- |
| **A. Run mínimo** (proyecto, fecha, estado)                                                                   | Menos trabajo ahora            | Migraciones con datos reales; los runs históricos sin contexto |
| **B. Run con todo el contexto desde el día 1**: columnas para lo que se filtra y `context` JSON para el resto | Informes y filtros desde 0.2.0 | Más campos opcionales en la UI del run manual                  |
| **C. Contexto normalizado** (tablas `environments`, `builds`, `datasets`)                                     | Integridad y listas cerradas   | Mucha UI; desde CI llegan como texto libre                     |

## Decisión: B

La **configuración** (navegador × SO × dispositivo) sí es una entidad
(ADR-0017). El entorno, el build y el dataset son texto.

- **Run:** una ejecución contra un contexto. Su cabecera es LWW y solo se edita
  mientras está `in_progress`. Tiene una clave visible `RUN-001`.
- **Shard:** una subida o importación dentro de un Run.
  - `id = UUIDv5(NS_RUN_SHARD, run_id ‖ source_file_sha256)`: el mismo archivo
    en el mismo run da el mismo shard en cualquier equipo, así que resubirlo no
    duplica nada.
  - Guarda el informe en bruto como evidencia (ADR-0014).
  - Los resultados manuales no tienen shard.
- **Run item:** lo previsto, es decir, caso + revisión congelada + flujo + fila +
  configuración + asignado. Lo crea la ejecución manual o el ciclo (ADR-0017).
- **Result:** un intento, inmutable.
- **`test_key` siempre presente** (identidad del test, haya caso o no):
  - **importado**: ruta normalizada (`/`, relativa al repositorio) +
    nombre del escenario o test + índice de fila (ING-01 §3);
  - **manual**: `manual:<test_case_id>/<flow_id|->/<example_row_id|->`.

  Sustituye a `unlinked_key`. Un resultado sin caso es simplemente uno con
  `test_case_id` nulo.

- **Clave natural** `(run_id, test_key, configuration_label, attempt)`. Es un
  índice **no único**: la deduplicación la hacen los ids deterministas y la capa
  de importación, nunca la base de datos.
- **Ids de resultado:**
  - **importado**:
    `id = UUIDv5(NS_RESULT, shard_id ‖ test_key ‖ configuration_label ‖ attempt)`.
    Dos equipos que importan el mismo archivo producen los mismos ids, y
    `append_only` inserta solo si no existe;
  - **manual**: UUID aleatorio. Dos equipos que registran a la vez "el intento 2"
    del mismo elemento conservan los dos.
- **Intento final:** el último de cada `(run_id, test_key, configuration_label)`,
  ordenando por `coalesce(finished_at, started_at, shard.imported_at)`, después
  por `attempt` y después por `hlc`. No se guarda: se deriva. `attempt` (desde 0)
  es el número que da la herramienta o el orden local, y solo se muestra.
- **Flaky:** se deriva cuando hay varios intentos (el final pasó y alguno
  anterior falló). Cuando la herramienta solo envía el intento final (CTRF
  `flaky`, `flakyFailure` de JUnit/Surefire), vale lo que diga
  `attributes.flaky`.
- **Estados de Result:** `passed | failed | blocked | skipped | other`, más
  `raw_status` con el valor original. `blocked` solo lo usa la ejecución manual.
- **StepResult:** se escribe a la vez que su Result y es igual de inmutable.
  Referencia el `step_id` de ADR-0011 cuando lo hay.
- **Enlace posterior (ING-05):** no toca el Result. Una regla
  `unlinked_mapping (project_id, test_key → test_case_id)` vale para los
  resultados pasados y futuros con ese `test_key`.
  - `id = UUIDv5(NS_UNLINKED_MAPPING, project_id ‖ test_key)`: hay una regla por
    clave en todos los equipos y el último cambio gana.
  - El caso efectivo de un resultado es
    `coalesce(results.test_case_id, mapping.test_case_id)`.
- **Ejecución manual:**
  - el estado de los pasos vive en un borrador local (`execution_drafts`, que no
    se sincroniza) hasta cerrar el intento;
  - al cerrarlo se escriben el Result y sus StepResult;
  - para corregir hay que hacer un nuevo intento.
- **Riesgo del requisito:**
  - `risk_likelihood` y `risk_impact` son enteros de 1 a 5;
  - `risk_level = likelihood × impact` (1–25) se deriva, no se guarda;
  - las bandas se configuran por proyecto (por defecto: bajo ≤ 4, medio ≤ 12,
    alto > 12).
- **Estado en la matriz (EJE-04).** Para cada caso:
  1. se toman sus resultados finales y se elige el run del más reciente por
     `coalesce(result.finished_at, run.started_at)` (incluye runs en curso);
  2. dentro de ese run, el estado es el peor entre los resultados finales del
     caso (todos los flujos, filas y configuraciones) y las métricas vinculadas
     con umbral (ADR-0012);
  3. un resultado cuya `test_case_revision_id` no es la revisión vigente se marca
     como **desactualizado**.

  Se puede filtrar por ciclo, configuración y build.

## Esquema (boceto)

SQLite local. Ninguna tabla tiene índices `UNIQUE` aparte de la clave primaria
(ADR-0011, "Clase de sync").

```sql
CREATE TABLE runs (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  run_key TEXT NOT NULL,                    -- RUN-001 (DAT-01)
  title TEXT NOT NULL,
  trigger TEXT NOT NULL,                    -- manual | local | agent | ci | cloud | import
  source_tool TEXT, source_tool_version TEXT,
  test_plan_id TEXT, cycle_id TEXT, configuration_id TEXT,   -- ADR-0017
  environment TEXT, build TEXT, commit_sha TEXT, branch TEXT, repository_url TEXT, ci_url TEXT,
  dataset TEXT,                             -- nombre@versión o hash
  context TEXT NOT NULL DEFAULT '{}',       -- variables permitidas, protocolVersion, config de la herramienta
  status TEXT NOT NULL DEFAULT 'in_progress',     -- in_progress | completed | aborted
  started_at TEXT, finished_at TEXT,
  summary TEXT NOT NULL DEFAULT '{}',       -- recuentos en caché, recalculables
  data TEXT NOT NULL DEFAULT '{}',          -- campos personalizados (ADR-0018)
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE run_shards (                   -- append-only; id = UUIDv5(run_id ‖ source_file_sha256)
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs (id),
  shard_index INTEGER, shard_total INTEGER,
  source_format TEXT NOT NULL,              -- cucumber_messages | ctrf | junit | playwright_json | pharos_run_json | sarif | k6 | axe
  source_file_sha256 TEXT NOT NULL, source_attachment_id TEXT,
  format_version TEXT,                      -- protocolVersion de Messages, specVersion de CTRF
  imported_by TEXT NOT NULL, imported_at TEXT NOT NULL, hlc TEXT NOT NULL
);
CREATE INDEX run_shards_file_idx ON run_shards (run_id, source_file_sha256);   -- no único

CREATE TABLE run_items (                    -- LWW
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs (id),
  test_case_id TEXT NOT NULL, test_case_revision_id TEXT NOT NULL,
  flow_id TEXT, example_row_id TEXT, example_row INTEGER,
  configuration_id TEXT, assignee TEXT, position INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE results (                      -- append-only
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs (id), shard_id TEXT, run_item_id TEXT,
  test_key TEXT NOT NULL,                   -- identidad del test (importado o manual)
  test_case_id TEXT, test_case_revision_id TEXT, case_revision INTEGER,
  case_key TEXT,                            -- <scenario_id> tal como llegó en el tag (ATS_002)
  flow_id TEXT,                             -- flujo de un caso avanzado (ADR-0011)
  example_row_id TEXT, example_row INTEGER, example_values TEXT,
  configuration_id TEXT, configuration_label TEXT,  -- proyecto de Playwright, navegador, dispositivo
  attempt INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, raw_status TEXT,
  duration_ms INTEGER, started_at TEXT, finished_at TEXT,
  error_message TEXT, error_trace TEXT,
  executed_by TEXT NOT NULL,                -- user:<id> o la herramienta
  external_id TEXT,                         -- testId de CTRF/Playwright: informativo, nunca clave
  attributes TEXT NOT NULL DEFAULT '{}',    -- incluye flaky declarado por la herramienta
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, hlc TEXT NOT NULL
);
CREATE INDEX results_natural_idx ON results
  (run_id, test_key, coalesce(configuration_label, ''), attempt);   -- no único
CREATE INDEX results_case_idx ON results (test_case_id);

CREATE TABLE step_results (                 -- append-only, dentro del documento de su Result
  id TEXT PRIMARY KEY, result_id TEXT NOT NULL REFERENCES results (id),
  position INTEGER NOT NULL, step_id TEXT,  -- ADR-0011
  keyword TEXT, text TEXT NOT NULL,
  status TEXT NOT NULL, actual TEXT, duration_ms INTEGER, gherkin_line INTEGER
);

CREATE TABLE unlinked_mappings (            -- LWW; id = UUIDv5(project_id ‖ test_key)
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  test_key TEXT NOT NULL, test_case_id TEXT,  -- NULL = enlace retirado
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE execution_drafts (             -- solo local, no se sincroniza
  run_item_id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at TEXT NOT NULL
);

ALTER TABLE requirements ADD COLUMN risk_likelihood INTEGER;   -- 1..5; NULL = sin evaluar
ALTER TABLE requirements ADD COLUMN risk_impact INTEGER;
```

Servidor: documentos `run`, `run_shard`, `run_item`, `result` (con sus
`step_results` dentro) y `unlinked_mapping`. Las tablas reales llegan con INT-02
(0.5.0).

## Impacto en sync y migraciones

- **Clases de sync:**
  - LWW: `run`, `run_item` y `unlinked_mapping`;
  - `append_only` (ADR-0011): `run_shard` y `result`;
  - fuera del sync: `execution_drafts`.
- **Dueño ([ADR-0020](0020-sync-por-usuario-cascada-y-version.md), regla 1):**
  hasta 0.3.0, todas estas entidades derivan su dueño de `project_id` →
  `projects.owner_id`. Por eso todas llevan `project_id`, incluso las que
  cuelgan de un run.
- **Claves `RUN-` y `CYC-` con DAT-01.** `key_counters.kind` tiene un `CHECK`
  limitado a `case`, `requirement` y `defect` (migración `0016` de A2). La
  migración de 0.2.0 **reconstruye** esa tabla (crear, copiar, borrar, renombrar;
  es pequeña) para añadir `run` y `cycle`. Los bloques del servidor de ADR-0010
  (`key_blocks`) deben aceptar esos tipos. Hay que coordinarlo con A2.
- **Volumen.** Un resultado viaja como **un documento con sus pasos dentro**. El
  push por lotes (FIX-03) y el pull paginado (FIX-02) son requisito previo.
- **El servidor no recalcula nada.** Valida el esquema y aplica las reglas de
  `append_only`.
- **Migración solo aditiva**, salvo la reconstrucción de `key_counters`. Los
  `risk_*` de un requisito que llega de un cliente sin esos campos conservan el
  valor local (ADR-0011, compatibilidad).
- **Tests de actualización:**
  - abrir una base 0.1.0 crea las tablas y conserva requisitos y contadores;
  - importar el mismo archivo en dos equipos y sincronizar deja una sola copia;
  - dos intentos manuales simultáneos se conservan los dos y el pull no falla.

## Decisiones del usuario (2026-10-28)

1. El riesgo usa una escala de 1 a 5 por factor, con bandas configurables por
   proyecto.
2. En la ejecución manual, el estado de los pasos queda en un borrador local
   hasta cerrar el intento.
3. Los runs llevan la clave visible `RUN-001`, con el mecanismo de DAT-01.
4. La matriz muestra el último resultado por fecha, con filtros de ciclo,
   configuración y build. No se limita al ciclo activo por defecto.

## Revisión (2026-10-28, tras la revisión independiente)

Son precisiones; la decisión no cambia.

- `test_key` siempre presente, que sustituye a `unlinked_key`.
- `flow_id` y `example_row_id`.
- Clave natural no única.
- Ids deterministas para shards, resultados importados y reglas de enlace.
- Intento final ordenado por tiempo, `attempt` y `hlc`.
- Flaky tomado de la herramienta cuando solo llega el intento final.
- Estado de la matriz: el run más reciente y, dentro de él, el peor resultado;
  con marca de desactualizado.
- `project_id` en todas las tablas por la regla del dueño de ADR-0020.
- Reconstrucción de `key_counters` para `run` y `cycle`.

## Implementación (E3, paso 4, 2026-10-31)

El esquema, los repositorios, el sync y las derivaciones están en el código
(migración local `0024_execution.sql`, `src-tauri/src/runs.rs`, servidor
`0008_key_blocks_runs.sql`). La UI llega con EJE-02 (paso 7). Precisiones sobre
el boceto:

- **Una sola migración** (0024): las seis tablas, `execution_drafts`, los
  `risk_*` y la reconstrucción de las claves. 0025 se retiró sin usar.
- **Sin claves foráneas hacia `runs`** en las tablas sincronizadas (solo
  `step_results → results`): un pull puede traer un resultado antes que su run,
  cuyo encabezado editado tiene un `seq` más nuevo, y el SQLite incluido aplica
  las claves foráneas (la misma lección que 0020). El repositorio comprueba los
  vínculos.
- **Inmutabilidad en la base:** triggers impiden cambiar el contenido de
  `run_shards`, `results` y `step_results`; solo pueden cambiar
  `workspace_id`/`project_id` (ADR-0019). La purga es el único código que los
  borra, junto con su run.
- **También se reconstruye `retired_keys`**, que tiene el mismo `CHECK` que
  `key_counters` (0017) y hace falta para purgar runs. Ambas admiten `run` y
  `cycle`; en el servidor, `key_blocks` también (0008), y el índice de claves
  de `documents` cubre `runKey`.
- **Ids deterministas:** UUIDv5 sobre el JCS de las partes como arreglo JSON
  (`[run, sha256]`, `[shard, test_key, configuration_label, attempt]`,
  `[proyecto, test_key]`), para que ningún separador dentro de un `test_key`
  produzca choques. Gemelos en Rust (`runs/ids.rs`) y TS
  (`src/shared/contracts/pharos-run/ids.ts`) con vectores compartidos.
- **El intento manual** lo registra `result_record` sobre un elemento del run:
  el `test_key` es `manual:<caso>/<flujo|->/<fila|->`, `attempt` es el siguiente
  número de ese test en el run, y un `step_id`, flujo o fila que no esté en la
  revisión congelada se rechaza. Solo con el run `in_progress`.
- **El riesgo** tiene su propio comando (`requirement_risk_set`, 1..5 o nulo),
  para no cambiar el `RequirementInput` que envía el editor.
- **Bandas por proyecto aplazadas a TRZ-04** (decisión del usuario,
  2026-10-31). Por ahora solo existe la función pura con las bandas por defecto
  (≤ 4 bajo, ≤ 12 medio, > 12 alto). Guardarlas ya cambiaría la forma del
  proyecto que se sincroniza sin una UI para editarlas. Como `risk_level` se
  deriva, añadir el almacenamiento después no exige migrar datos.
- **Sin `run_delete` en 0.2:** un run se borra con la cascada de su proyecto.
  El paso 7 decide el borrado con su UI (borrado lógico con evento); los
  resultados nunca se borran.
- **Sync:** `run`, `run_item` y `unlinked_mapping` son LWW; `run_shard` y
  `result` (con sus pasos dentro) son `append_only`, y para ellos `createdAt`/
  `importedAt`, `createdBy`/`importedBy` y `hlc` quedan fuera del contenido
  comparado, así que dos equipos que importan el mismo archivo convergen.
  `APPLIED_SET_VERSION = 3`.
- **Funcionalidad de sync `runs`** (decisión del usuario, 2026-10-31):
  - un escritorio retiene sus entidades de ejecución y no pide bloques `run`
    hasta que el servidor de esa cuenta lista `runs` (un servidor anterior
    rechazaría todo el push o toda la petición de bloques);
  - el servidor solo envía esas entidades a quien manda `runs` (los demás
    reciben exactamente la respuesta de antes) y rechaza su push sin ella
    (400 `runs_unsupported`);
  - el push de un requisito desde un cliente sin `runs` conserva
    `riskLikelihood`/`riskImpact` aunque envíe su estado completo;
  - al actualizar, el reinicio del cursor trae lo que el cliente antiguo se
    saltó.
- **Cascada:** borrar un proyecto borra (lógicamente) sus runs, elementos y
  reglas en el escritorio, y en el servidor pone lápida también a shards y
  resultados (a diferencia de las revisiones, SYNC-11). Los recuentos del
  evento de auditoría son los de las tablas del escritorio.
- **El servidor valida, no interpreta:** comprueba los campos obligatorios y
  los estados de los documentos de ejecución (`EXECUTION_PAYLOADS`). El
  escritorio comprueba los mismos límites antes de escribir (título 500,
  `test_key` 2000, 5000 pasos, en unidades UTF-16 como zod): un documento que
  el servidor rechazara quedaría pendiente para siempre.

Tras la revisión independiente (2026-10-31):

- **Ids comprobados por tipo.** Un `flow_id` tiene que ser un flujo de la
  revisión; un `example_row_id`, una fila de ese flujo (o del caso, sin
  flujo); y un `step_id`, un paso de ese flujo. El flujo principal son las
  precondiciones, el Background y los pasos del caso; cada flujo de un caso
  avanzado, el Background y sus propias precondiciones y pasos. Un resultado
  atribuido al paso equivocado no se podría corregir después.
- **Un caso con un conflicto de clave abierto no se congela**
  (`case-key-conflict`): su revisión con clave provisional solo existe en este
  equipo.
- **El peor estado** (`worst_status`) ordena `failed` > `blocked` > `other`
  (y cualquier valor desconocido) > `skipped` > `passed`.
- **Tiempos.** Se comparan como instantes: RFC 3339 (también `+0530` y más de
  tres decimales, que se truncan a milisegundos) o la forma de SQLite. Un valor
  que no se puede leer cuenta como ausente y se usa el siguiente de
  `coalesce`; nunca se compara como texto junto a valores leídos.
- **Borrado.** No hay trigger de `DELETE`: la purga es el único código que
  borra shards, resultados y pasos (lo comprueba un test que busca esas
  sentencias en el código). Un run espera en la purga mientras alguno de sus
  shards o resultados no haya llegado al servidor, y al purgarse se lleva
  también sus filas del oplog. La purga barre además los shards y resultados
  sin run cuyo proyecto ya no existe (o está borrado y caducado) y que son más
  antiguos que la retención; los recientes esperan a su run.
- **Servidor.** Un shard o resultado que llega después de borrar su proyecto se
  guarda como lápida, como lo habría dejado la cascada.
- **Para el paso 9:** los importadores tienen que dar ids **deterministas** a
  los resultados de paso (p. ej. UUIDv5 del resultado y la posición), igual que
  a los resultados: si no, dos equipos que importan el mismo archivo
  producirían el mismo resultado con pasos distintos y el servidor lo
  rechazaría (`content_changed`).

**Nota (E4, paso 6, CYC-01, 2026-10-31).** `runs.cycle_id` y
`runs.configuration_id` se llenan desde ADR-0017: `run_create`/`run_update`
comprueban que un ciclo dado está vivo, no cerrado y es del mismo proyecto, y
que la configuración es del proyecto (solo cuando el valor cambia: un run
conserva el id de un ciclo borrado y purgado). «Ejecutar» un ciclo crea los
runs con `runs::add_items`, sin cambios en su lógica.

## Implementación (E4, paso 9: importadores, 2026-10-31)

Los importadores de ING-02..05 están en el código: los parsers en TypeScript
(`src/shared/contracts/pharos-run/importers/`) y un único persistente en
`src-tauri/src/runs/import.rs`. Precisiones:

- **Ids de los resultados de paso:** `UUIDv5(NS_STEP_RESULT, [result_id,
  posición])`, con gemelo en TS y vectores compartidos (la nota de arriba).
  Dos equipos que importan el mismo archivo en el mismo run escriben los mismos
  documentos (lo comprueba un test que compara las cargas de dos bases).
- **El mismo archivo como run nuevo en dos equipos da dos runs.** El id del
  shard depende del run, y cada equipo crea el suyo. La vista previa avisa
  («ya está en RUN-004») y el commit lo rechaza salvo que el usuario lo pida,
  pero esa comprobación es **solo local**: no ve lo que otro equipo importó y
  aún no se ha sincronizado. Para varios shards de una misma ejecución, se
  importa el primero como run nuevo («dejar abierto») y los demás en ese run.
- **El vínculo no se guarda: se deriva al leer** (ver «Vínculo derivado»,
  abajo). Dos equipos que importan el mismo archivo en el mismo run guardan
  siempre el mismo contenido, tengan o no el caso.
- **Revisión:** la del elemento del run para ese caso, flujo y fila (el
  resultado lo «cumple»); si no, la revisión sincronizada vigente en
  `run.started_at`; si no hay ninguna anterior, la más antigua (nunca el
  estado actual). El flujo se elige por el nombre del escenario; la fila del Outline,
  por su índice; un `step_id`, solo si el texto coincide con el de la revisión
  (los `<parámetros>` del Outline casan con cualquier valor).
- **`executed_by`** de un resultado importado es `tool:<herramienta>` (o el
  formato), igual en todos los equipos.
- **Intentos de CTRF sin tiempos.** El reporter no da tiempos a los
  `retryAttempts`; sin ellos el intento final derivado caería en la hora de
  importación. El parser pone `finishedAt` = inicio del intento final, con
  `attributes.finishedAtInferred`.
- **Límites:** además de los del servidor (título, `test_key`, pasos), los
  textos se recortan de forma determinista (mensaje 8 000, traza 64 000, paso
  4 000, atributos 16 KiB) y ningún documento de resultado pasa de 1 MiB. Un
  `test_key` de más de 2 000 caracteres conserva el principio y un hash. Dos
  tests del mismo archivo con la misma identidad se numeran (` #2`).
- **Configuración (paso 6):** el `configurationLabel` (proyecto de
  Playwright, `browser` de CTRF) se guarda; la configuración y el elemento del
  ciclo se derivan al leer (`cycles::match_configuration` y
  `cycles::pick_item` dentro del resolvedor; ver «Vínculo derivado»).

Tras la revisión independiente del paso 9 (2026-10-31):

- **El shard sale solo del informe.** Es contenido inmutable del shard: la
  interfaz lo muestra y no lo deja editar, y un índice fuera de 1..total se
  rechaza (`invalid-shard`).
- **Etiquetas contra las claves vivas.** Una etiqueta vincula si es un
  `scenario_id` vivo del proyecto (clave libre o con un prefijo antiguo
  incluidas); la expresión del prefijo solo marca las que parecen clave y no
  lo son. La lógica del vínculo vive en `runs/link.rs`, con las expresiones
  compiladas una vez y los pasos de cada revisión cacheados; si el informe
  omite el Background, se compara desde el primer paso tras él.
- **`test_key` estable entre shard e informe fusionado:** solo se quitan
  prefijos estables (carpeta del usuario, espacios de trabajo de CI, letra de
  unidad), nunca el directorio común del archivo.
- **La bandeja** muestra una clave solo si su resultado importado más reciente
  sigue sin caso: un test etiquetado después sale de ella.
- **Purga:** borrar un run borra también los adjuntos de sus shards,
  resultados y pasos; la recogida de evidencias libera los archivos.
- **Re-importar en un equipo que recibió el shard** adjunta la subida como su
  informe en bruto, así que su archivo nunca queda huérfano.

#### Vínculo derivado (B1, aprobado 2026-10-31)

El vínculo de un resultado **importado** dependía de los datos locales del
equipo que importaba (un caso o una revisión aún no recibidos, un conflicto
de clave conocido solo allí). Por eso no forma parte de su contenido:

- **Lo que guarda el resultado importado** (`append_only`): solo lo que dijo el
  informe: `testKey`, `caseKey` (si el informe lo trae), las etiquetas,
  el nombre y la suite en `attributes`, `exampleRow`, intentos, tiempos,
  errores y los pasos con su texto. `testCaseId`, `testCaseRevisionId`,
  `caseRevision`, `flowId`, `exampleRowId`, `runItemId` y el `stepId` de los
  pasos van siempre vacíos. El servidor rechaza un `result` con `shardId` que
  los traiga (VERSIONING §6.5).
- **Un solo resolvedor**, `runs/link.rs` (`Resolver`), lee por proyecto en
  consultas de conjunto (casos, claves, revisiones sincronizadas, reglas de
  enlace, runs y elementos) y deriva el vínculo de cualquier cantidad de
  resultados: la lista de resultados, la bandeja, los recuentos, la vista
  previa, el progreso de ciclos (`cycles::cycle_results`) y los defectos
  (`defects::result_links`).
- **Gemelo del servidor:** `server/src/modules/domain/resultLink.ts`, puro y
  con índices por proyecto, aplica las mismas reglas para lo que la web lee:
  el progreso de ciclos (`attemptOf`) y el caso de un resultado enlazado a un
  defecto (`resultCase`). No deriva `stepId` (solo los muestra la pantalla
  del run del escritorio) ni ve conflictos de clave (son locales). Los dos lo
  comprueban con los mismos vectores, `src-tauri/tests/fixtures/link-vectors.json`
  (caso renombrado, borrado, dos antiguos portadores de una clave, regla de
  enlace, elemento del run, flujo y fila, configuración por etiqueta o
  nombre, elemento del ciclo), y los dos ignoran los shards que supera un
  normalizador más nuevo.
- **Caso.** Gana una regla de enlace posterior viva (`unlinked_mapping`). Si
  no, cada etiqueta (y el `caseKey`) nombra **el caso vivo que la lleva
  ahora** como `scenario_id`; solo si ningún caso la lleva ahora, los casos que
  la llevaron antes (claves de sus revisiones sincronizadas y la última clave
  de un caso borrado). Un cambio de prefijo no desvincula una importación
  antigua, y una clave que otro caso toma después pasa a ese caso (decisión
  del coordinador en la segunda revisión, 2026-10-31). Si las etiquetas
  nombran **más de un caso** (dos que la llevaron antes y ninguno ahora, o
  etiquetas de casos distintos), o un caso y una clave con forma de clave que
  no es de nadie, queda sin vincular con aviso (`two-case-tags`): nunca se
  adivina. Un **caso borrado** sigue
  vinculado y se muestra como «caso borrado» (`caseDeleted`); no va a la
  bandeja. Un caso purgado ya no existe: su resultado queda como «clave
  desconocida». Un conflicto de clave abierto deja el resultado sin vincular
  mientras dure, **solo en el equipo que lo tiene** (`case-key-conflict` es
  local, como el conflicto): al resolverse, el resultado sigue a su caso.
- **Revisión:** la congelada del elemento del run para ese caso, flujo y fila
  (su número queda vacío hasta que esa revisión llega por pull); si no, entre
  las revisiones que tienen todos los equipos escritas en o antes de
  `run.started_at` (solo `started_at`, nunca la hora local de guardado), la
  de número más alto, después la escrita más tarde y después el id; si no hay
  ninguna, la más antigua. Una edición posterior al inicio del run nunca mueve
  un resultado. `created_at` tiene precisión de segundos: una revisión escrita
  en el mismo segundo en que empieza el run cuenta como anterior.
- **Revisiones que no ven los demás:** una fila escrita sin push
  (`ensure_current(.., push = false)`: el estado que trajo un pull o una clave
  provisional con conflicto abierto) queda marcada `local_only` (migración
  0031) y el resolvedor no la usa, ni su clave, hasta que la misma fila llega
  por pull.
- **Configuración:** el `configuration_id` de un resultado importado también se
  deriva (de su `configurationLabel`, con los ganchos del paso 6 dentro del
  resolvedor), nunca se guarda; el servidor lo rechaza en un resultado con
  `shardId`. En el progreso de ciclos gana la configuración del run; si no
  tiene, la de la etiqueta. El **elemento del ciclo** del run se deriva con la
  misma regla que `cycles::item_for` (caso + flujo + fila, luego flujo, luego
  el caso): `cycles::pick_item`, sobre los elementos leídos una vez.
- **Versión del normalizador:** el shard lleva `normalizerVersion` (la de los
  parsers TS) en su contenido y en su id,
  `UUIDv5([run, sha256, normalizerVersion])`. Dos equipos con el mismo build
  convergen; dos builds distintos dan dos shards, nunca un `appendRejected`.
  Los lectores ignoran los resultados de un shard si el mismo run tiene el
  mismo archivo leído por una versión mayor. **Todo cambio en lo que produce un
  parser sube `NORMALIZER_VERSION`** (VERSIONING §6.5).
- **Orden de la bandeja:** el resultado «más reciente» de cada `test_key` es el
  de hora del informe (si no, inicio del run) más tardía y después el id: lo
  mismo en todos los equipos.
- **`createdAt` de las revisiones converge:** la misma revisión congelada en
  dos equipos (su id es su contenido) toma, al recibirse, el `createdAt` del
  servidor, que guarda el primero. Solo filas de revisión con id por
  contenido.
- **Lectura:** `ResultView` lleva `effectiveTestCaseId`, `effectiveRevisionId`,
  `effectiveCaseRevision`, `effectiveFlowId`, `effectiveExampleRowId`,
  `effectiveRunItemId`, `effectiveStepIds`, `linkReason` y `caseDeleted`. El
  vínculo puede cambiar tras un pull (converge), nunca por una edición
  posterior.
- **Los resultados manuales** (paso 7, sin `shardId`) no cambian: su vínculo
  es parte de su contenido, como se escribió; sus `effective*` son los
  guardados.
- **Rendimiento:** 20 000 resultados se resuelven en consultas de conjunto
  (test con un proyecto de 200 casos). De paso, `flaky_tests` pasa a ser
  lineal y `results_list` lee los pasos de un run en una consulta.
