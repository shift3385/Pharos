# ADR-0017 · Ciclo de pruebas y matriz de configuraciones (CYC-01)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las
  respuestas recomendadas). Revisado el 2026-10-28 tras la revisión
  independiente (ver "Revisión"): precisiones, sin cambio de decisión.
  **Recortable de 0.2.0** (decisión del usuario, 2026-10-28): si el hito se alarga, pasa a 0.3.0 y `runs.cycle_id` y `runs.configuration_id` quedan nulos hasta entonces.
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
- **Elementos del ciclo:** un caso, con su asignado. Opcionalmente puede
  limitarse a un flujo (`flow_id`) o a una fila de Outline (`example_row_id`,
  ADR-0011). "Añadir por filtro" (tags, requisito, prioridad, riesgo) inserta los
  casos que casan en ese momento; después la lista es estática.
- **Ejecutar un ciclo** crea un Run por configuración (`runs.cycle_id`,
  `runs.configuration_id`). Sus `run_items` copian los elementos y congelan la
  **revisión vigente al crear el Run** (ADR-0011).
- **Importar con `--cycle CYC-003`** asocia el Run al ciclo. Cada resultado se
  casa con su elemento por caso + flujo + fila + configuración (ADR-0013), usando
  `match_labels` sobre `configuration_label`.
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
  project_id TEXT NOT NULL,
  test_case_id TEXT NOT NULL,
  flow_id TEXT, example_row_id TEXT,        -- NULL = todos los flujos / todas las filas
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

## Decisiones del usuario (2026-10-28)

1. En 0.2.0 no hay test sets aparte del ciclo: se clona el ciclo, y las
   baselines de CAS-02 (0.3.0) cubrirán las suites congeladas.
2. Al añadir a un ciclo un caso que no está aprobado, se avisa pero no se
   bloquea. El flujo de aprobación llega en 0.3.0 (CAS-02).
3. La revisión se congela **al crear el Run**: se ejecuta la revisión vigente en
   ese momento.

## Revisión (2026-10-28, tras la revisión independiente)

- **Precisiones, sin cambio de decisión:**
  - `flow_id` y `example_row_id` en los elementos;
  - la importación casa por caso + flujo + fila + configuración;
  - `project_id` en los elementos, para derivar el dueño (ADR-0020);
  - las preguntas se reescriben como decisiones.
- **Simplificación aceptada (decisión del usuario, 2026-10-28):** ciclos y configuraciones son
  recortables de 0.2.0. El criterio de salida de 0.2.0 se cumple con runs sin
  ciclo; `runs.cycle_id` y `runs.configuration_id` quedan nulos hasta que se
  implementen. Las columnas sí existen desde 0.2.0, así que recortar no cambia
  el esquema base.

## Implementación (E4, paso 6, 2026-10-31)

Entra en 0.2.0 sin recortes (decisión del usuario). Migración local
`0028_cycles.sql`, `src-tauri/src/cycles.rs` (con `cycles/progress.rs`),
servidor `0009_documents_key_cycles.sql`, módulo `src/modules/cycles`.
Precisiones sobre el boceto y decisiones tomadas al implementarlo (aprobadas
por el coordinador con la recomendación de cada una):

- **Sin clave foránea `test_cycle_items → test_cycles`** (el boceto la tiene):
  un pull puede traer un elemento antes que su ciclo y el SQLite incluido
  aplica las claves foráneas (la lección de 0020 y 0024). El repositorio
  comprueba el vínculo. **Sin `CHECK` en `status`**: un estado que este build
  no conoce no hace fallar el pull; se lee como `planned`.
- **`configurations.position`** ordena las configuraciones en los selectores y
  en las columnas de progreso.
- **Configuraciones: se archivan, nunca se borran** (solo la cascada del
  proyecto pone `deleted_at`): runs y resultados apuntan a ellas. Una
  archivada sigue en los ciclos y runs que la tienen, no se ofrece para ciclos
  nuevos y «Ejecutar» la salta.
- **Etiquetas únicas por proyecto.** Crear o editar una configuración con una
  etiqueta (sin distinguir mayúsculas, sin espacios a los lados) que ya tiene
  otra configuración viva y no archivada se rechaza (`match-label-taken`).
  Como la unicidad solo se comprueba en cada equipo, **dos equipos sin
  conexión pueden crear la misma etiqueta**. Entonces:
  - una importación nunca casa con dos: `cycles::match_configuration` elige
    la configuración con el **id menor** (orden de texto), en todos los
    equipos y en el servidor por igual; si ninguna etiqueta casa, prueba con
    el nombre, con la misma regla;
  - las dos configuraciones lo muestran en Ajustes del proyecto (`labelClashes`:
    cuál gana y cuál no), para que el usuario quite la etiqueta de una.
- **Elementos estáticos.** Un elemento idéntico (caso + flujo + fila) ya
  presente se salta. El flujo y la fila se comprueban contra el caso **en ese
  momento**; la revisión se congela al crear el Run (decisión 3). Un caso no
  aprobado se añade y se informa (decisión 2). «Añadir por filtro» casa por
  etiquetas, requisitos, prioridad, estado y riesgo mínimo (el mayor
  `risk_likelihood × risk_impact` de los requisitos del caso) y resuelve una
  sola vez.
- **Estado del ciclo.** Se mueve libremente entre `planned`, `active` y
  `closed` (un ciclo cerrado se puede reabrir). Cerrado no admite elementos
  nuevos ni «Ejecutar» (`cycle-closed`). «Ejecutar» pasa un ciclo planificado a
  activo.
- **Ejecutar** crea un Run por configuración viva y no archivada del ciclo (o
  las elegidas; sin configuraciones, un solo Run sin ella), con `cycle_id`,
  `configuration_id`, título `CYC-001 · <título> · <configuración>`, y el
  build, el entorno y el plan del ciclo (se pueden cambiar en el diálogo). Sus
  `run_items` se crean con `runs::add_items`, que congela la revisión vigente.
  Todo o nada: si un caso no se puede congelar (p. ej. un conflicto de clave
  abierto), no se crea ningún Run. En 0.2.0 solo el escritorio crea runs; la
  web muestra el botón desactivado con una nota hasta que los runs tengan API
  web.
- **Progreso** (`cycles/progress.rs`; gemelo del servidor en
  `server/src/modules/domain/cycle-progress.ts`, comprobados con
  `src-tauri/tests/fixtures/cycle-progress-vectors.json`). Una celda es un
  elemento × una configuración del ciclo. Sus candidatos son los intentos
  **finales** de cada run del ciclo (`derive::final_attempts`) cuya
  configuración es la de la celda (la del run, o la del resultado si el run no
  tiene), cuyo caso efectivo es el del elemento (con la regla de enlace
  posterior) y cuyo flujo y fila casan (NULL en el elemento = cualquiera). Por
  cada test (`test_key` + `configuration_label`), el más reciente entre runs
  (tiempo, `attempt`, HLC); la celda es el **peor** de ellos, o `not_run`. Dos
  estados desconocidos empatados se deciden por orden de texto, igual en Rust
  y en TS. Se calcula al leer; nada se guarda.
- **Borrar un ciclo** borra (lógicamente) el ciclo y sus elementos; **sus runs
  se conservan** con su `cycle_id`. Tras la purga el id queda colgando: el run
  sigue siendo válido, se lee, se edita y se sincroniza igual (hay test), y
  solo un `cycle_id` que **cambia** se comprueba.
- **Vínculos de un Run.** `runs::insert_run` y `update_run` comprueban que un
  `cycle_id` dado es un ciclo vivo y no cerrado del mismo proyecto, y un
  `configuration_id` una configuración del proyecto. Un run pulled no se
  comprueba.
- **Sync.** Las tres entidades son LWW (`APPLIED_SET_VERSION = 5`) y viajan
  con la funcionalidad **`cycles`**: el escritorio las retiene y no pide
  bloques de claves `cycle` hasta que el servidor de la cuenta la lista
  (diagnóstico: `heldBackCycles`); el servidor solo las envía a quien manda
  `cycles` (los demás reciben exactamente lo de antes) y rechaza su push sin
  ella (400 `cycles_unsupported`). `runs.cycleId` y `configurationId` ya
  viajaban desde el paso 4, y los builds anteriores los conservan, así que el
  run no necesita `FEATURE_KEYS`. `cycleKey` es una clave como las demás: un
  choque en el pull es un conflicto de clave; en el servidor, `KEY_FIELD` y el
  índice `documents_key_idx` (0009) la cubren.
- **Cascada.** Borrar un proyecto borra sus configuraciones, ciclos y
  elementos; la purga los quita y retira las claves `CYC-` en
  `retired_keys`.
- **Web.** `/api/configurations` y `/api/cycles` aplican las mismas reglas
  sobre los documentos (crear, editar, archivar, ordenar, clonar, borrar,
  elementos a mano y por filtro, asignados, progreso y runs del ciclo).
- **Para el paso 9:** `cycles::match_configuration(conn, proyecto, etiqueta)`
  da la configuración de un `configuration_label`, y
  `cycles::item_for(conn, ciclo, caso, flujo, fila)` el elemento más
  específico (flujo y fila, luego flujo, luego el caso entero). Quien fusione
  segundo entre los pasos 6 y 9 los conecta al importador.
Tras la revisión independiente (2026-10-31):

- **Etiquetas repetidas entre equipos.** Editar una configuración solo
  comprueba las etiquetas que **gana** (las nuevas menos las que ya tenía):
  un choque creado sin conexión no bloquea cambiar el nombre ni los atributos
  de ninguna de las dos.
- **Desempate determinista.** Dos intentos iguales en tiempo, `attempt` y HLC
  (p. ej. HLC vacío) se deciden por el **id del resultado**, dentro de un run y
  entre runs, en Rust y en TS, sea cual sea el orden de lectura. Los vectores
  cubren ese empate, dos `configurationLabel` de un mismo `test_key` (dos
  tests) y años 0000–0099.
- **Elementos que se solapan.** No se añade un elemento que cubre un test que
  ya cubre otro del mismo caso (el caso entero y un flujo de él, un flujo y
  una fila de él): contaría dos veces los mismos resultados. Se informa en
  `overlapping` (clave del caso), como los no aprobados.
- **Ejecutar.** Antes de crear nada comprueba cada elemento y el error nombra
  el caso por su clave (`cycle-item-case-gone`, `cycle-item-flow-gone`,
  `cycle-item-row-gone`, `case-key-conflict`); la UI deja «Ejecutar»
  desactivado, con el motivo, mientras un elemento apunta a un caso eliminado.
  Las configuraciones elegidas se deduplican, una lista vacía se rechaza
  (`no-configuration-chosen`), y una configuración del ciclo que aún no ha
  llegado a este equipo se salta y se avisa (`missingConfigurations`).
- **Orden.** Configuraciones y elementos por posición y luego id; ciclos por
  el `createdAt` del documento (el del equipo que lo creó, que el pull
  conserva) y luego id, igual en el escritorio y en la web.
- **Clonar** no copia las configuraciones archivadas.
- **Web.** Clonar y borrar escriben **un** evento, con su resumen
  (`clonedFrom`, `items`; `cascade.test_cycle_items`), como el escritorio. El
  progreso de la lista lee una vez los runs, shards, reglas, resultados y
  elementos del proyecto y los agrupa por ciclo.
- **Purga.** Un elemento que sigue vivo bajo un ciclo borrado o ya purgado
  (otro equipo lo añadió mientras este borraba el ciclo) se purga cuando es
  más antiguo que la retención; uno que llegó antes que su ciclo espera.
- **Lectura del progreso.** El progreso lee el caso, el flujo y la fila de
  cada resultado en un solo sitio (`cycles::cycle_results`; servidor:
  `attemptOf`), para que el cambio del
  paso 9 (el vínculo caso/revisión sale del contenido inmutable del
  resultado) solo toque ahí.

- **UI.** No hay diseño en `docs/rediseno/` para estas pantallas: la sección
  «Ciclos» del proyecto y la tarjeta «Configuraciones» de Ajustes usan las
  primitivas existentes (tabla, píldoras, diálogos).
