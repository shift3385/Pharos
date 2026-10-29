# ADR-0017 · Ciclo de pruebas y matriz de configuraciones (CYC-01)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las respuestas recomendadas).
- **Diseño de conjunto:** [`docs/design/0.2.0-modelo-ejecucion.md`](../design/0.2.0-modelo-ejecucion.md).

## Contexto

- Hoy no hay forma de decir **qué** se va a ejecutar, **dónde**, **contra qué
  build** y **cuándo**:
  - el plan (`test_plans.data`) tiene un cronograma de sprints e hitos en JSON,
    sin ids (GLOSARIO: `schedule`, `sprint`, `milestone`);
  - los casos solo están agrupados por proyecto.
- **El mercado lo da por supuesto:**
  - TestRail: test runs y test plans con configuraciones;
  - Xray: Test Execution, Test Plan y Test Set;
  - Zephyr: ciclos.
- **Las importaciones traen la configuración como texto.** En un run de
  Playwright con varios proyectos, cada resultado lleva su navegador o
  dispositivo (ING-01 §3: `Result.browser/device`), y en un mismo informe pueden
  venir varios.
- RUN-00 ([ADR-0013](0013-campos-del-run.md)) ya separa el **alcance previsto**
  (`run_items`) de los intentos (`results`).
- CAS-02 (0.3.0) traerá baselines de suite congeladas.

## Opciones

| Opción                                                                                                | A favor                                                                      | En contra                                                 |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| **A. Ciclo como selección estática** de casos × configuraciones, que genera Runs                      | Se sabe exactamente qué se planificó; progreso "x de y"; asignación por caso | Para regresión hay que clonar el ciclo                    |
| **B. Ciclo dinámico**: una consulta (tags, requisitos, prioridad, riesgo) que se resuelve al ejecutar | Las suites de regresión se mantienen solas                                   | Sin congelar, no queda claro qué se ejecutó; más complejo |
| **C. Sin entidad ciclo**: los runs se agrupan por build o etiqueta                                    | Nada nuevo                                                                   | Sin alcance previsto, sin progreso ni asignación          |

## Decisión: A, con "añadir por filtro" y "clonar"

- **Configuración:** entidad por proyecto con nombre y atributos
  (`{ browser, os, device, locale }`). Lleva `match_labels`, la lista de textos
  con los que una importación la reconoce: `chromium`, `Desktop Chrome`, el
  nombre de un proyecto de Playwright, `Pixel 8`.
- **Ciclo:** qué (elementos), dónde (configuraciones), contra qué (build y
  entorno objetivo) y cuándo (fechas, hito y sprint del plan como texto). Su
  estado es `planned | active | closed` y tiene una clave visible `CYC-001`.
- **Elementos del ciclo:** un caso (y opcionalmente una fila de Outline) con su
  asignado. "Añadir por filtro" (tags, requisito, prioridad, riesgo) inserta los
  casos que casan en ese momento; después la lista es estática.
- **Ejecutar un ciclo** crea un Run por configuración (`runs.cycle_id`,
  `runs.configuration_id`). Sus `run_items` copian los elementos y congelan la
  **revisión vigente al crear el Run** (ADR-0011).
- **Importar con `--cycle CYC-003`** asocia el Run al ciclo. Cada resultado se
  casa con su elemento por `case_key` + configuración, usando `match_labels`
  sobre `configuration_label`.
- **Progreso:** para cada elemento × configuración, el último Result final entre
  los Runs del ciclo.
- **Un Run sin ciclo sigue siendo válido:** ejecuciones ad hoc y de CI.
- **Clonar un ciclo** copia elementos y configuraciones. Es la vía para las
  regresiones repetidas, hasta que lleguen las baselines (CAS-02).

## Esquema (boceto)

SQLite local:

```sql
CREATE TABLE configurations (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  name TEXT NOT NULL,                       -- "Chrome · Windows 11"
  attributes TEXT NOT NULL DEFAULT '{}',    -- { browser, os, device, locale }
  match_labels TEXT NOT NULL DEFAULT '[]',  -- ["chromium", "Desktop Chrome"]
  archived_at TEXT,
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE test_cycles (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  cycle_key TEXT NOT NULL,                  -- CYC-001 (DAT-01)
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  test_plan_id TEXT, milestone TEXT, sprint TEXT,
  build TEXT, environment TEXT,
  configuration_ids TEXT NOT NULL DEFAULT '[]',
  starts_on TEXT, ends_on TEXT,
  status TEXT NOT NULL DEFAULT 'planned',   -- planned | active | closed
  data TEXT NOT NULL DEFAULT '{}',          -- campos personalizados (ADR-0018)
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE test_cycle_items (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, cycle_id TEXT NOT NULL REFERENCES test_cycles (id),
  test_case_id TEXT NOT NULL, example_row INTEGER,   -- NULL = todas las filas
  assignee TEXT, position INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1
);
```

Servidor: documentos `configuration`, `test_cycle` y `test_cycle_item` (LWW).

## Impacto en sync y migraciones

- Las tres entidades son LWW. Un elemento es su propia entidad, así que dos
  personas que añaden casos distintos al mismo ciclo no entran en conflicto (con
  conflictos por entidad, ADR-0002, una lista dentro del ciclo sí chocaría). Las
  configuraciones del ciclo sí son una lista: cambian poco.
- Migración aditiva, sin datos previos.

## Preguntas resueltas (2026-10-28)

El usuario aceptó la recomendación de cada pregunta; lo que sigue queda decidido.

1. **¿Hacen falta "test sets" reutilizables aparte del ciclo?** Recomendación:
   no en 0.2.0. Basta con clonar el ciclo, y las baselines de CAS-02 cubren las
   suites congeladas.
2. **¿Solo se pueden añadir casos aprobados a un ciclo?** El flujo de
   aprobación llega en 0.3.0 (CAS-02). Recomendación: avisar, no bloquear.
3. **¿Cuándo se congela la revisión?** ¿Al crear el Run (recomendado: se
   ejecuta lo último) o al añadir el caso al ciclo?
