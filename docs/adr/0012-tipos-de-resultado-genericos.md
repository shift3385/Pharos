# ADR-0012 · Tipos de resultado genéricos: Result, Finding, Metric y sesión exploratoria (KND-01)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las
  respuestas recomendadas). Revisado el 2026-10-28 tras la revisión
  independiente (ver "Revisión"). Después se aceptó una simplificación (decisión del usuario, 2026-10-28):
  las tablas de Finding, Metric y sesión exploratoria se aplazan a 0.4.0/0.5.0,
  y en 0.2.0 su forma queda fijada en Pharos Run JSON. Bloquea EJE-01; ING-06
  (0.5.0) e ING-07 dependen de él.
- **Diseño de conjunto:** [`docs/design/0.2.0-modelo-ejecucion.md`](../design/0.2.0-modelo-ejecucion.md).

## Contexto

- [ADR-0005](0005-alcance-hasta-1-0.md) cubre "cualquier tipo de QA" con tipos
  de resultado genéricos y pocos formatos, sin un adaptador por herramienta.
- El criterio de ING-06 es que "un SARIF y un k6 summary se guardan **sin migrar
  el esquema**" (ROADMAP §5). Por tanto, las tablas tienen que existir antes de
  esos importadores.
- El estudio del arte (§"Modelo de ejecución inspirado en CTRF") propone `Result`
  y `StepResult` para pruebas, `Finding` para SARIF/axe y `Metric` para
  k6/mutación. Las sesiones exploratorias (EXP-01, 0.4.0) "generan un Run".
- Lo que distingue a cada familia:
  - **pruebas funcionales**: un veredicto por test e intento;
  - **seguridad y accesibilidad**: violaciones de una regla en una ubicación,
    que se repiten entre ejecuciones y se triagean;
  - **rendimiento, mutación y evaluaciones de LLM**: valores numéricos con
    umbral;
  - **exploratorio**: un charter, un tiempo y notas.
- La matriz actual (`src/modules/traceability/model/matrix.ts`) solo conoce
  `ExecutionStatus = passed | failed | blocked | not_run`.
- **Choque de vocabulario:** `session` ya significa la sesión de autenticación
  (GLOSARIO). La sesión exploratoria necesita otro identificador.

## Opciones

| Opción                                                                                                                       | A favor                                                                                                                                                 | En contra                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **A. Una tabla polimórfica `results` con `kind` y `details` JSON**                                                           | Una tabla y una entidad de sync                                                                                                                         | Columnas que no aplican; deduplicar hallazgos o filtrar por severidad sobre JSON; obliga a dar un pasa/falla a cada métrica |
| **B. El Run como sobre común y una tabla por tipo** (`results`, `findings`, `metrics`; la sesión como extensión 1:1 del Run) | Cada tipo con sus columnas e índices; la matriz lee `results`; un formato nuevo encaja en uno de los tipos sin migrar; lo específico va en `attributes` | Cuatro tablas y cuatro entidades de sync                                                                                    |
| **C. Esquema por herramienta**                                                                                               | Fidelidad total                                                                                                                                         | Descartada por ADR-0005                                                                                                     |

## Decisión: B

| Tipo                      | Qué es                                            | Productores                                                                                                     | Campos propios                                                     |
| ------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Result** (+ StepResult) | Veredicto de un test en un intento                | Manual, Cucumber Messages, CTRF, JUnit, Playwright JSON, Karate, Maestro, promptfoo (por test)                  | `status`, `attempt`, `duration_ms`, `error_*`; detalle en ADR-0013 |
| **Finding**               | Una regla incumplida en una ubicación             | SARIF (ZAP, Semgrep, Trivy, CodeQL), axe JSON, Lighthouse a11y                                                  | `rule_id`, `severity`, `location`, `fingerprint`, `standard_refs`  |
| **Metric**                | Un valor medido, con o sin umbral                 | k6 summary (métricas y thresholds), Stryker (mutation score), Macrobenchmark, puntuaciones de evaluación de LLM | `name`, `value`, `unit`, `threshold`, `passed`                     |
| **Sesión exploratoria**   | Un Run hecho a mano con charter y tiempo limitado | Pharos (EXP-01, móvil)                                                                                          | `charter`, `timebox_minutes`, notas con evidencias                 |

Reglas:

- **Todos cuelgan de un Run** (ADR-0013) y comparten su contexto: entorno,
  build, commit y configuración.
- **Vínculos.** Los tres tipos admiten `test_case_id` opcional. Finding y Metric
  pueden además llegar a un requisito por `standard_refs` o por tag; las reglas
  de mapeo se fijan en ING-06.
- **Inmutables.** Finding y Metric son _append-only_, como Result. El triaje de
  un hallazgo (falso positivo, riesgo aceptado) no modifica el hallazgo: vive
  en `finding_triage`, por `fingerprint`, y se aplica a todas las ejecuciones.
  Su id es determinista,
  `UUIDv5(NS_FINDING_TRIAGE, project_id ‖ fingerprint)`, así que dos equipos
  que triagean el mismo hallazgo escriben la misma entidad y gana el último
  cambio, sin duplicados.
- **Estado en la matriz** (regla completa en ADR-0013):
  - se toma el run más reciente del caso;
  - dentro de ese run, el estado es el peor entre sus Result finales y las
    Metric vinculadas que tienen umbral;
  - los Finding no cambian el estado: se muestran como recuento por severidad;
  - si un hallazgo bloquea o no la release lo deciden las quality gates
    (DOC-02).
- **`skipped` se muestra como `not_run`** en la matriz, con nota.
- **Un formato nuevo no crea tablas:** se mapea a uno de los cuatro tipos y lo
  que sobra va a `attributes` (JSON). Por eso las evaluaciones de LLM son Result
  (por test) más Metric (por puntuación), no un quinto tipo.
- **Pharos Run JSON** (ROADMAP §8) es el formato normalizado de importación y de
  exportación:
  - lleva `schemaVersion`, `run`, `shards[]`, `results[]` (con `steps[]`),
    `findings[]`, `metrics[]`, `exploratorySession?` y `attachments[]`;
  - es un superconjunto de CTRF: `results[]` acepta los campos de
    `results.tests[]` de CTRF;
  - se versiona según VERSIONING §6.6.

## Esquema (boceto)

SQLite local (`results` y `step_results` en ADR-0013). Estas tablas **no se
crean en 0.2.0** (ver "Impacto"): la de sesiones llega en 0.4.0 y las de
hallazgos y métricas en 0.5.0, con esta forma:

```sql
CREATE TABLE findings (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs (id), shard_id TEXT,
  test_case_id TEXT,                        -- opcional
  rule_id TEXT NOT NULL, rule_name TEXT,
  severity TEXT NOT NULL,                   -- critical | high | medium | low | info
  raw_severity TEXT,                        -- SARIF level / axe impact tal cual
  message TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '{}',      -- JSON: uri, line, column, url, selector, component
  fingerprint TEXT NOT NULL,                -- SARIF partialFingerprints o sha256(rule_id + location normalizada)
  standard_refs TEXT NOT NULL DEFAULT '[]', -- ["WCAG2.2:1.4.3", "ASVS5:V2.1.1", "MASVS2:STORAGE-1"]
  help_uri TEXT, attributes TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX findings_fp_idx ON findings (project_id, fingerprint);

CREATE TABLE finding_triage (               -- LWW; id = UUIDv5(project_id ‖ fingerprint)
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  state TEXT NOT NULL,                      -- open | false_positive | accepted_risk | fixed
  reason TEXT, defect_id TEXT,
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE metrics (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs (id), shard_id TEXT, test_case_id TEXT,
  name TEXT NOT NULL,                       -- http_req_duration, mutation_score, faithfulness
  aggregation TEXT,                         -- p95 | avg | rate | count | score
  scope TEXT,                               -- endpoint, módulo, prompt o fila del dataset
  value REAL NOT NULL, unit TEXT,           -- ms | % | req/s | ratio
  threshold TEXT,                           -- expresión de origen, p. ej. "p(95)<500"
  passed INTEGER,                           -- NULL si no hay umbral
  attributes TEXT NOT NULL DEFAULT '{}', created_by TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE exploratory_sessions (         -- extensión 1:1 de un Run
  run_id TEXT PRIMARY KEY REFERENCES runs (id), workspace_id TEXT NOT NULL,
  charter TEXT NOT NULL, areas TEXT NOT NULL DEFAULT '[]',
  timebox_minutes INTEGER, tester TEXT NOT NULL, started_at TEXT, ended_at TEXT
);
CREATE TABLE session_notes (                -- línea de tiempo append-only
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, run_id TEXT NOT NULL,
  kind TEXT NOT NULL,                       -- note | bug | question | idea
  text TEXT NOT NULL, at TEXT NOT NULL, created_by TEXT NOT NULL
);
```

Servidor: documentos `finding`, `finding_triage`, `metric`,
`exploratory_session` y `session_note` hasta que INT-02 (0.5.0) dé tablas
reales a la API.

## Impacto en sync y migraciones

- `finding`, `metric` y `session_note` son `append_only` (ADR-0011).
  `finding_triage` y `exploratory_session` son LWW (las fechas y el charter de
  la sesión se editan mientras está abierta).
- **En 0.2.0 no se crean estas tablas** (decisión del usuario, 2026-10-28). Lo que se fija ya es el formato:
  - el esquema versionado de Pharos Run JSON incluye `findings[]`, `metrics[]`
    y `exploratorySession` con la forma de arriba;
  - un Pharos Run JSON que las traiga se importa igual: los resultados se
    guardan y el archivo completo queda como `raw_report` del shard
    (ADR-0014);
  - cuando lleguen las tablas, una migración aditiva las crea y se pueden
    reindexar los informes en bruto que sigan guardados.
- **Calendario:**
  - `exploratory_sessions` y `session_notes` en 0.4.0 (EXP-01);
  - `findings`, `finding_triage` y `metrics` en 0.5.0 (ING-06).

  El criterio de ING-06 pasa a ser "un SARIF y un k6 summary se guardan sin
  cambiar el formato Pharos Run JSON".

- Hasta entonces, `defect_links` (ADR-0016) no admite `finding` ni
  `session_note` como destino.
- No hay datos previos que migrar.

## Decisiones del usuario (2026-10-28)

1. Un hallazgo no marca como fallido el caso vinculado. Se muestra con su
   severidad, y si bloquea la release lo decide una quality gate (DOC-02).
2. La UI de las sesiones exploratorias llega en 0.4.0 (EXP-01).

## Revisión (2026-10-28, tras la revisión independiente)

- **Precisiones, sin cambio de decisión:**
  - `finding_triage` con id determinista por `fingerprint`;
  - la regla de estado de la matriz se alinea con ADR-0013 (el run más
    reciente y, dentro de él, el peor resultado);
  - `project_id` en `session_notes`, para derivar el dueño (ADR-0020).
- **Simplificación aceptada (decisión del usuario, 2026-10-28):** las tablas `findings`,
  `finding_triage`, `metrics`, `exploratory_sessions` y `session_notes` no
  se crean en 0.2.0. Su forma queda fijada en Pharos Run JSON, y las tablas
  llegan con una migración aditiva en 0.4.0 (sesiones) y 0.5.0 (SARIF, k6,
  axe). Cambia el criterio de ING-06 en el ROADMAP.
