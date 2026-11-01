# ADR-0016 · El defecto como entidad propia (DEF-01)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las
  respuestas recomendadas). Revisado el 2026-10-28 tras la revisión
  independiente (ver "Revisión"): precisiones, sin cambio de decisión. INT-05 (Jira,
  0.8.0) depende de él.
- **Diseño de conjunto:** [`docs/design/0.2.0-modelo-ejecucion.md`](../design/0.2.0-modelo-ejecucion.md).

## Contexto

- **Hoy un defecto es una tarjeta del kanban.**
  - Es una fila de `planner_cards` con `kind = 'defect'` (`0006_planner.sql`).
  - La clave visible `card_key = DEF-001` se añadió y se rellenó en
    `0010_traceability.sql`.
  - `next_defect_key` (`src-tauri/src/planner.rs`) numera por proyecto con "el
    máximo + 1", así que se duplica entre equipos (DAT-01).
  - El vínculo con los casos es `data.testCaseIds` (GLOSARIO).
- **El estado del defecto es la columna del kanban**
  (`backlog | in_progress | in_review | done`). La matriz considera abierto un
  defecto que no está en `done` (`matrix.ts`). Esas columnas son las de una
  tarea, no el ciclo de vida de un defecto (reabrir, rechazar, _retest_).
- **Faltan campos básicos:**
  - severidad (distinta de la prioridad);
  - build y entorno donde se encontró;
  - resultado de origen;
  - clave externa para Jira.

  INT-05 (Jira bidireccional) depende de DEF-01.

- **El planificador filtra por `owner_id`.** Un defecto es del proyecto, no de
  quien lo creó.

## Opciones

| Opción                                                                                                 | A favor                                                                             | En contra                                                                                                                 |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **A. Enriquecer la tarjeta `defect`** (severidad y clave externa en `data`)                            | Poco trabajo                                                                        | Columnas del kanban ≠ ciclo de vida; `data` no se puede consultar bien; el planificador sigue mezclando tareas y defectos |
| **B. Entidad `defect` en su propio módulo `defects`**; el planificador queda para `task` y `test_data` | Ciclo de vida, severidad y vínculos propios; base limpia para Jira y para la matriz | Una migración de datos y un módulo nuevo                                                                                  |
| **C. Defectos solo en Jira**, sin entidad local                                                        | Nada que mantener                                                                   | Rompe el trabajo sin conexión y el modo aislado; la matriz necesita los defectos en local                                 |

## Decisión: B

- **Clave:** `defect_key` mantiene la serie `DEF-001` de cada proyecto, con el
  mecanismo de unicidad de DAT-01.
- **Severidad y prioridad, separadas:**
  - **severidad** es el impacto en el sistema: `critical | major | minor | trivial`;
  - **prioridad** es la urgencia del arreglo, con el vocabulario de los casos:
    `low | medium | high | critical`.
- **Ciclo de vida fijo en 0.2.0** (pregunta 2):

  - flujo principal: `new → open → in_progress → fixed → retest → closed`;
  - desde `retest`, si el arreglo falla, vuelve a `open`;
  - desde `new` u `open` se puede pasar a `rejected` o a `deferred`;
  - un defecto `closed` se reabre volviendo a `open`;
  - `resolution` (`fixed | duplicate | not_reproducible | wont_fix | by_design`)
    acompaña a `closed` y a `rejected`;
  - en la matriz, un defecto está abierto si no está en `closed` ni en
    `rejected`.

- **Vínculos tipados** en `defect_links`: el defecto apunta a un `result`,
  `test_case`, `requirement`, `finding` o `session_note`. Llega a una fila de la
  matriz por el caso, directamente o a través del resultado.
- **Crear desde un resultado fallido** rellena:
  - pasos, desde la revisión ejecutada (ADR-0011);
  - resultado obtenido, desde el StepResult;
  - build y entorno, desde el Run;
  - evidencias: nuevos `attachments` que apuntan al mismo `sha256` (ADR-0014),
    sin copiar bytes.
- **Jira (INT-05)** usa `external_system`, `external_key`, `external_url` y
  `external_synced_at`. La correspondencia de estados se define en INT-05.
- **Campos personalizados** en `data.custom` (ADR-0018).

## Esquema (boceto)

SQLite local:

```sql
CREATE TABLE defects (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  defect_key TEXT NOT NULL,                 -- DEF-001
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  steps_to_reproduce TEXT NOT NULL DEFAULT '', expected TEXT, actual TEXT,
  severity TEXT NOT NULL DEFAULT 'major',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'new', resolution TEXT,
  found_in_run_id TEXT, found_in_build TEXT, found_in_environment TEXT, fixed_in_build TEXT,
  reporter TEXT NOT NULL, assignee TEXT,
  external_system TEXT, external_key TEXT, external_url TEXT, external_synced_at TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX defects_project_key_idx ON defects (project_id, defect_key);   -- no único: ver "Claves repetidas"

CREATE TABLE defect_links (
  id TEXT PRIMARY KEY,                      -- UUIDv5(defect_id ‖ target_kind ‖ target_id)
  workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, defect_id TEXT NOT NULL REFERENCES defects (id),
  target_kind TEXT NOT NULL,                -- result | test_case | requirement | finding | session_note
  target_id TEXT NOT NULL,
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1
);
```

Servidor: documentos `defect` y `defect_link` (LWW).

## Impacto en sync y migraciones

- **Migración de datos determinista** (Rust, tras la SQL de 0.2.0). Por cada
  `planner_cards` con `kind = 'defect'`:
  1. `defects.id = planner_cards.id` y `defect_key = card_key`; se conservan
     `title` y `priority`.
  2. Estado: `backlog → new`, `in_progress → in_progress`, `in_review → retest`,
     `done → closed` (con `resolution = fixed`). `severity = major`.
  3. `data.testCaseIds` → `defect_links`, con
     `id = UUIDv5(NS_DEFECT_LINK, defect_id ‖ 'test_case' ‖ test_case_id)`.
  4. Sus adjuntos cambian a `owner_entity = 'defect'` (ADR-0014).
  5. La tarjeta se borra de forma lógica.

  Al ser determinista, dos equipos que migran por separado producen los mismos
  ids y convergen sin duplicados.

- **Claves repetidas.** No hay índice `UNIQUE` sobre `defect_key`, como en la
  fase 2 de [ADR-0010](0010-claves-entre-equipos.md): un pull con una clave que
  ya usa otro defecto vivo haría fallar el pull entero.
  - Crear un defecto en local sigue rechazando una clave repetida (comprobación
    en el repositorio).
  - Si un pull trae un defecto con una clave que ya usa otro defecto vivo, el
    defecto se guarda y va al panel de conflictos para que la persona elija
    otra clave. Nunca se renombra solo.
- **Vínculos.** El id de un `defect_link` siempre es determinista
  (`UUIDv5(defect_id ‖ target_kind ‖ target_id)`), así que vincular lo mismo
  en dos equipos da la misma entidad.
- **Dueño** (regla 1 de [ADR-0020](0020-sync-por-usuario-cascada-y-version.md),
  hasta 0.3.0): el dueño de `project_id`. Los defectos dejan de depender de
  `planner_cards.owner_id`.
- **Tarjetas `defect` de clientes 0.1.** Las escritas antes de actualizar el
  servidor llegan por pull, y un cliente 0.2.0 las convierte al aplicarlas con la
  misma función. Después, como el servidor 0.2 acepta los 0.1 solo en lectura
  (ADR-0011), un 0.1 ya no puede crear tarjetas `defect` nuevas en el servidor.
- **SYNC-04a (A1, 0.1.0)** sincroniza las tarjetas y los defectos tal como
  están hoy. DEF-01 no depende de ese diseño, pero su migración tiene que
  aceptar tarjetas ya sincronizadas.
- **Test de actualización:** un fixture 0.1.0 con defectos en las cuatro
  columnas, adjuntos y vínculos produce los mismos `DEF-xxx` y la misma matriz.

## Decisiones del usuario (2026-10-28)

1. Los defectos salen del kanban. El módulo `defects` tiene lista y tablero por
   estado, y el planificador queda para tareas y datos de prueba.
2. En 0.2.0 el ciclo de vida es fijo (el descrito arriba). Será configurable más
   adelante, cuando haya Jira.
3. La severidad tiene 4 niveles: `critical | major | minor | trivial`.

## Revisión (2026-10-28, tras la revisión independiente)

Son precisiones; la decisión no cambia.

- El índice de `defect_key` deja de ser único; los choques que traiga el pull
  van al panel de conflictos.
- `defect_links` lleva id determinista y los campos LWW completos.
- El dueño se toma de `project_id`.
- Se acota la conversión de tarjetas que llegan de clientes 0.1.

## Implementación (E4, paso 8, 2026-10-31)

El esquema, el módulo, la migración de las tarjetas, el sync y la UI están en el
código (migración local `0029_defects.sql` con su paso Rust,
`src-tauri/src/defects.rs`, servidor `0010_defects.sql` con su paso de datos,
`src/modules/defects/`). Decisiones del usuario del 2026-10-31 (las respuestas
recomendadas del plan) y precisiones sobre el boceto:

- **Enmienda: índice `UNIQUE` parcial sobre la clave viva.** Sustituye a «sin
  índice único» de «Claves repetidas» y de «Revisión». Es el mecanismo de todas
  las demás claves desde la [Enmienda A3 de ADR-0010](0010-claves-entre-equipos.md):
  un pull nunca falla en el índice, porque antes de escribir el documento la
  fila local que tenía esa clave la deja (`key_sync::vacate`), recibe una clave
  provisional y un conflicto de clave, y la persona elige otra en el panel de
  conflictos. Una clave definitiva nunca se renombra sola.
- **Enmienda: dos transiciones más.** `deferred → open` y `rejected → open`
  (reactivar), además de `closed → open`; sin ellas, Aplazado y Rechazado eran
  callejones sin salida (Jira y Azure DevOps permiten reactivar). La tabla vive
  en `tests/fixtures/defect-vectors.json` y la comprueban Rust, el cliente y el
  servidor. Un defecto `deferred` cuenta como abierto en la matriz.
- **«Críticos» en Inicio** son los de severidad `critical` (el impacto), no los
  de prioridad crítica.
- **Sin claves foráneas hacia `defects`** desde `defect_links`: un pull puede
  traer el vínculo antes que su defecto (la lección de 0020 y 0024). El
  repositorio comprueba los vínculos. Un valor de un pull fuera de los enums
  (severidad, estado…) se normaliza en lugar de hacer fallar el pull.
- **No hizo falta un tipo de clave nuevo:** `defect` ya estaba en
  `key_counters`, `retired_keys` y `key_blocks`; la serie pasa de
  `planner_cards.card_key` a `defects.defect_key`. La clave de una tarea que fue
  defecto queda en `retired_keys`.
- **El servidor también convierte** (decisión del usuario): la migración de
  servidor `0010` tiene un paso de datos en TypeScript (`DATA_STEPS` de
  `migrate.ts`, en la misma transacción que su SQL) que convierte cada
  documento `planner_card` de tipo `defect` con la misma función que el
  escritorio (`fromCard`), **conservando la revisión y el HLC** de la tarjeta, y
  deja la tarjeta como lápida. Sin esto, la web y las cuentas cuyo escritorio
  aún no se ha actualizado verían los defectos como tarjetas para siempre. Es
  TypeScript porque el id de un vínculo es UUIDv5 y el Postgres base no tiene
  SHA-1.
- **La migración local** (paso Rust de 0029, en el mismo savepoint) convierte
  las tarjetas vivas y borradas, pasa sus adjuntos al defecto (mismos ids) y
  borra la tarjeta de forma lógica **sin fila de oplog** (el servidor convierte
  su copia). Para que nada se pierda ni choque, la base de sync de la tarjeta
  pasa al defecto, sus filas de oplog pendientes pasan a ser del defecto, los
  vínculos de una tarjeta que el servidor no conocía (o con cambios pendientes)
  se encolan, y los conflictos de clave y de versión abiertos pasan al defecto.
  Un vínculo quitado sin conexión justo antes de actualizar puede volver con el
  pull: el escritorio no sabe qué vínculos tiene el servidor.
- **Tarjetas que llegan de un servidor anterior** (o escritas antes de su 0010)
  se convierten al aplicarlas con la misma función y por el camino lww normal:
  un cambio local pendiente se vuelve conflicto. Una tarjeta nunca pisa un
  defecto que ya está en esa revisión o en una posterior.
- **Funcionalidad de sync `defects`** (decisión del usuario):
  - el escritorio retiene defectos y vínculos hasta que el servidor de esa
    cuenta lista `defects`;
  - el servidor no envía defectos, vínculos ni tarjetas de defecto a quien no
    la manda: un 0.1.x o un 0.2.0-alpha.1, que solo leen, conservan la copia
    congelada de su planificador hasta que se actualizan (VERSIONING §6.5);
  - un push sin `defects` que trae un `defect`, un `defect_link` o cualquier
    cambio de una tarjeta de defecto recibe 400 `defects_unsupported` y no se
    guarda nada del lote;
  - `APPLIED_SET_VERSION = 5`: el cursor vuelve a 0 y trae lo convertido.
- **El dueño es el del proyecto** (ADR-0020 regla 1), no el `owner_id` de la
  tarjeta; los comandos filtran por el dueño del proyecto.
- **Crear desde un resultado** (`defect_draft_from_result`, solo lectura, y
  `fromResult` en `defect_create`): pasos de la revisión ejecutada (del flujo
  del resultado), lo obtenido del paso fallido (o el mensaje de error), build y
  entorno del run, vínculos al resultado y a su caso, y una fila nueva de
  `attachments` por evidencia del resultado y de sus pasos, con el mismo
  `sha256` (ADR-0014). En la web no existe hasta que la API lea resultados
  (INT-02).
- **Caso de un resultado, en un solo sitio:** el caso, la revisión y el flujo
  de un resultado se leen solo en `defects::result_link` (hoy: el del
  resultado o la regla de enlace de su `test_key`). Los resultados importados
  los resuelven al leer (paso 9, `runs/link.rs::resolve`): pasar a ese
  resolvedor es un cambio en esa función.
- **UI:** `docs/rediseno/` no tiene diseño de estas pantallas; se construyen
  con los componentes de la lista de casos y del tablero del planificador. El
  tablero tiene las seis columnas del flujo principal y «Otros» para Rechazado
  y Aplazado; un movimiento que el ciclo no admite se rechaza con un aviso, y
  cerrar, rechazar o soltar en «Otros» preguntan antes. `DefectEditor` y
  `createDefectFromResult` se exportan para la pantalla de ejecución (EJE-02).
- **Campos personalizados** (`data.custom`): el editor muestra los campos
  definidos para la entidad `defect`. Ajustes del proyecto solo define hoy
  campos de casos; definirlos para defectos queda como tarea aparte.
- **Pendiente para INT-05:** `external_system`, `external_key`, `external_url`
  y `external_synced_at` existen y se editan a mano (clave y enlace); la
  correspondencia de estados con Jira la define INT-05.
