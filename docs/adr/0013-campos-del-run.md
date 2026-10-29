# ADR-0013 · El Run nace con su contexto: entorno, build, commit, dataset, origen e identidad CTRF (RUN-00)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las respuestas recomendadas). Absorbe EJE-05 y los campos de
  TRZ-04. Bloquea EJE-01, EJE-02 e ING-02..05.
- **Diseño de conjunto:** [`docs/design/0.2.0-modelo-ejecucion.md`](../design/0.2.0-modelo-ejecucion.md).

## Contexto

- **Contexto de ejecución.** El estudio del arte propone
  `Run(run_id, project, plan_id?, build/commit, environment, trigger, source_tool)`
  → `Shard` → `Result(case_id? | unlinked_key, attempt, status, flaky…)`. Un run
  sin entorno, build ni dataset no sirve para reproducir ni para informar
  (§"Lo que le falta": gestión de entornos y datos por ejecución).
- **Lo que mostró el spike ING-01** (§3, §4):
  - ningún formato trae un `run_id` común: lo asigna Pharos al subir;
  - el shard solo aparece en CTRF por shard (`environment.shardId`) o en el
    comando de subida;
  - los reintentos solo están completos en Cucumber Messages y CTRF;
  - la clave natural es `(run_id, case_key, attempt)`, con `case_key = TC-002[n]`;
  - para que resubir un archivo no duplique, hace falta guardar el hash del
    archivo;
  - el estado debe calcularse ignorando los pasos de hook.
- **Resultados sin vínculo.** Un test sin `@TC` va a una bandeja y se enlaza a
  mano después (ING-05). Si el enlace modificara el resultado, este dejaría de
  ser append-only (ROADMAP §8).
- **Riesgo.** `requirements` (`0010_traceability.sql`) solo tiene `priority`.
  TRZ-04 pide probabilidad × impacto (ISTQB CTFL 4.0 §5.2) y sus campos entran
  en 0.2.0 con RUN-00.
- **Ejecución manual.** Necesita saber qué se iba a ejecutar ("3 de 12"), y no
  solo qué se ejecutó.

## Opciones

| Opción                                                                                                        | A favor                                                                              | En contra                                                                                           |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **A. Run mínimo** (proyecto, fecha, estado); los campos se añaden cuando hagan falta                          | Menos trabajo ahora                                                                  | Migraciones con datos reales; los runs históricos se quedan sin contexto y los informes salen cojos |
| **B. Run con todo el contexto desde el día 1**: columnas para lo que se filtra y `context` JSON para el resto | Informes y filtros desde 0.2.0; los importadores rellenan lo que traiga cada formato | Más campos en la UI del run manual, aunque casi todos son opcionales                                |
| **C. Contexto normalizado** (tablas `environments`, `builds`, `datasets`)                                     | Integridad y listas cerradas                                                         | Mucha UI; desde CI estos valores llegan como texto libre                                            |

## Decisión: B

Se queda la parte útil de C: la **configuración** (navegador × SO × dispositivo)
sí es una entidad, definida en ADR-0017. El entorno, el build y el dataset son
texto.

- **Run:** una ejecución contra un contexto. Su cabecera es LWW y solo se edita
  mientras está `in_progress`. Tiene una clave visible `RUN-001` (mecanismo de
  unicidad de DAT-01).
- **Shard:** una subida o importación dentro de un Run (o un trozo con
  `--shard 2/2`). Guarda el formato, el `source_file_sha256` (resubir el mismo
  archivo no duplica nada) y el informe en bruto como evidencia (ADR-0014).
  Los resultados manuales no tienen shard.
- **Run item:** lo que se tenía previsto ejecutar, es decir, caso + revisión
  congelada + fila + configuración + asignado. Lo crea la ejecución manual o el
  ciclo (ADR-0017). Las importaciones no lo necesitan.
- **Result:** un intento, inmutable. `attempt` empieza en 0. El intento
  **final** y el **flaky** no se guardan, se derivan:
  - final = el `attempt` máximo para la misma clave natural;
  - flaky = el final pasó y algún intento anterior falló.

  Si la herramienta declara `flaky` (CTRF), se guarda también en `attributes`.

- **Estados de Result:** `passed | failed | blocked | skipped | other`, más
  `raw_status` con el valor original. `blocked` solo lo usa la ejecución manual.
- **StepResult:** se guarda en el mismo momento que su Result y es igual de
  inmutable. Referencia el `step_id` de ADR-0011 cuando lo hay.
- **Enlace posterior (ING-05):** no toca el Result. Se crea una regla
  `unlinked_mapping (project_id, unlinked_key → test_case_id)` que vale para los
  resultados pasados y futuros con esa clave. El caso efectivo de un resultado
  es `coalesce(results.test_case_id, mapping.test_case_id)`.
- **Ejecución manual:**
  - mientras el intento está abierto, el estado de los pasos vive en un
    borrador local (`execution_drafts`, que no se sincroniza);
  - al cerrarlo se escriben el Result y sus StepResult inmutables;
  - para corregir después hay que hacer un nuevo intento.
- **Riesgo del requisito:** `risk_likelihood` y `risk_impact` (enteros) y
  `risk_level = likelihood × impact`, que se deriva y no se guarda. Ordena la
  matriz y, en 0.8.0, la cobertura ponderada.
- **Estado en la matriz (EJE-04):** el último Result final del caso, por
  `finished_at` del Run. Se puede filtrar por ciclo, configuración y build.

## Esquema (boceto)

SQLite local:

```sql
CREATE TABLE runs (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  run_key TEXT NOT NULL,                    -- RUN-001 (DAT-01)
  title TEXT NOT NULL,
  trigger TEXT NOT NULL,                    -- manual | local | agent | ci | cloud | import
  source_tool TEXT, source_tool_version TEXT,     -- playwright 1.64.1, cucumber-js 13.3.0, pharos
  test_plan_id TEXT, cycle_id TEXT, configuration_id TEXT,   -- ADR-0017
  environment TEXT,                         -- staging, qa-2…
  build TEXT, commit_sha TEXT, branch TEXT, repository_url TEXT, ci_url TEXT,
  dataset TEXT,                             -- nombre@versión o hash
  context TEXT NOT NULL DEFAULT '{}',       -- resto: variables permitidas, protocolVersion, config de la herramienta
  status TEXT NOT NULL DEFAULT 'in_progress',     -- in_progress | completed | aborted
  started_at TEXT, finished_at TEXT,
  summary TEXT NOT NULL DEFAULT '{}',       -- recuentos en caché, recalculables
  data TEXT NOT NULL DEFAULT '{}',          -- campos personalizados (ADR-0018)
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE run_shards (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES runs (id),
  shard_index INTEGER, shard_total INTEGER,
  source_format TEXT NOT NULL,              -- cucumber_messages | ctrf | junit | playwright_json | pharos_run_json | sarif | k6 | axe
  source_file_sha256 TEXT NOT NULL, source_attachment_id TEXT,
  format_version TEXT,                      -- protocolVersion de Messages, specVersion de CTRF
  imported_by TEXT NOT NULL, imported_at TEXT NOT NULL,
  UNIQUE (run_id, source_file_sha256)
);

CREATE TABLE run_items (                    -- LWW: se añaden o quitan casos mientras el run está abierto
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES runs (id),
  test_case_id TEXT NOT NULL, test_case_revision_id TEXT NOT NULL,
  example_row INTEGER, configuration_id TEXT, assignee TEXT, position INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE results (                      -- append-only
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs (id), shard_id TEXT, run_item_id TEXT,
  test_case_id TEXT, test_case_revision_id TEXT, case_revision INTEGER,
  case_key TEXT,                            -- TC-002 tal como llegó en el tag
  example_row INTEGER, example_values TEXT, -- TC-002[n] + copia de la fila
  unlinked_key TEXT,                        -- uri normalizada + nombre + fila (ING-01 §3)
  configuration_id TEXT, configuration_label TEXT,  -- proyecto de Playwright, navegador, dispositivo
  attempt INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, raw_status TEXT,
  duration_ms INTEGER, started_at TEXT, finished_at TEXT,
  error_message TEXT, error_trace TEXT,
  executed_by TEXT NOT NULL,                -- user:<id> o la herramienta
  external_id TEXT,                         -- testId de CTRF/Playwright: informativo, nunca clave
  attributes TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX results_natural_key ON results
  (run_id, coalesce(case_key, unlinked_key), coalesce(example_row, 0),
   coalesce(configuration_label, ''), attempt);
CREATE INDEX results_case_idx ON results (test_case_id);

CREATE TABLE step_results (                 -- append-only, se escriben con su Result
  id TEXT PRIMARY KEY, result_id TEXT NOT NULL REFERENCES results (id),
  position INTEGER NOT NULL, step_id TEXT,  -- ADR-0011
  keyword TEXT, text TEXT NOT NULL,
  status TEXT NOT NULL, actual TEXT, duration_ms INTEGER, gherkin_line INTEGER
);

CREATE TABLE unlinked_mappings (            -- LWW
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  unlinked_key TEXT NOT NULL, test_case_id TEXT NOT NULL,
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE execution_drafts (             -- solo local, no se sincroniza
  run_item_id TEXT PRIMARY KEY, attempt INTEGER NOT NULL,
  state TEXT NOT NULL,                      -- JSON: estado y nota por paso, adjuntos ya guardados
  updated_at TEXT NOT NULL
);

ALTER TABLE requirements ADD COLUMN risk_likelihood INTEGER;   -- NULL = sin evaluar
ALTER TABLE requirements ADD COLUMN risk_impact INTEGER;
```

Servidor: documentos `run`, `run_shard`, `run_item`, `result` (con sus
`step_results` dentro del payload) y `unlinked_mapping`. Las tablas reales
llegan con INT-02 (0.5.0), cuando la API y la web consulten resultados.

## Impacto en sync y migraciones

- **Clases de sync:**
  - LWW: `run`, `run_item` y `unlinked_mapping`;
  - `append_only` (ADR-0011): `run_shard` y `result`;
  - fuera del sync: `execution_drafts`.
- **Volumen.** Un resultado viaja como **un documento con sus pasos dentro**, de
  modo que 5.000 resultados son 5.000 documentos y no 30.000. El push por lotes
  (FIX-03) y el pull paginado (FIX-02) son requisito previo.
- **El servidor no recalcula nada.** Valida el esquema (ROADMAP §8) y rechaza
  modificar un documento `append_only`.
- **Migración solo aditiva.** Las tablas son nuevas y `risk_*` son columnas
  nulas en `requirements`, que sigue siendo LWW. Los requisitos sincronizados
  desde 0.1.x llegan sin riesgo, y es correcto.
- **Test de actualización:** abrir una base 0.1.0 crea las tablas vacías y
  conserva los requisitos.

## Preguntas resueltas (2026-10-28)

El usuario aceptó la recomendación de cada pregunta; lo que sigue queda decidido.

1. **Escala del riesgo:** ¿1–3 o 1–5? Recomendación: 1–5 por factor (nivel
   1–25), con bandas configurables por proyecto (bajo ≤ 4, medio ≤ 12,
   alto > 12).
2. **Ejecución manual.** ¿El estado de los pasos queda en un borrador local
   hasta cerrar el intento (recomendado; simple y sin conflictos)? ¿O cada paso
   se sincroniza al momento, para seguir en otro dispositivo a medias?
3. **¿Clave visible `RUN-001`?** Recomendación: sí, con el mismo mecanismo que
   DAT-01 use para `TC`, `REQ` y `DEF`.
4. **Último resultado en la matriz.** El último por fecha es lo recomendado,
   con filtros de ciclo, configuración y build. ¿Prefieres que por defecto se
   limite al ciclo activo?
