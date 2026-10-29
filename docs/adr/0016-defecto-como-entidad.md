# ADR-0016 · El defecto como entidad propia (DEF-01)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las respuestas recomendadas). INT-05 (Jira, 0.8.0) depende de él.
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
CREATE UNIQUE INDEX defects_project_key_idx ON defects (project_id, defect_key) WHERE deleted_at IS NULL;

CREATE TABLE defect_links (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, defect_id TEXT NOT NULL REFERENCES defects (id),
  target_kind TEXT NOT NULL,                -- result | test_case | requirement | finding | session_note
  target_id TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1
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

- **Clientes 0.1.x.** Mientras el servidor los acepte (VERSIONING §6.5), un
  cliente 0.2.0 que reciba por pull una tarjeta `defect` la convierte al
  aplicarla con la misma función.
- **SYNC-04a (A1, 0.1.0)** sincroniza las tarjetas y los defectos tal como
  están hoy. DEF-01 no depende de ese diseño, pero su migración tiene que
  aceptar tarjetas ya sincronizadas.
- **Test de actualización:** un fixture 0.1.0 con defectos en las cuatro
  columnas, adjuntos y vínculos produce los mismos `DEF-xxx` y la misma matriz.

## Preguntas resueltas (2026-10-28)

El usuario aceptó la recomendación de cada pregunta; lo que sigue queda decidido.

1. **¿Se siguen viendo los defectos en el kanban del planificador?**
   Recomendación: no. El módulo `defects` tiene lista y tablero por estado; el
   planificador queda para tareas y datos de prueba.
2. **¿Ciclo de vida fijo en 0.2.0?** Recomendación: fijo (el de arriba);
   configurable más adelante, cuando haya Jira.
3. **¿Escala de severidad de 4 niveles** (`critical | major | minor | trivial`)?
   ¿O 5, añadiendo `blocker`?
