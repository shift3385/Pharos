# ADR-0011 · El resultado apunta a la revisión del caso y a pasos con ID estable (DAT-02)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las respuestas recomendadas). Bloquea EJE-01/EJE-02.
- **Diseño de conjunto:** [`docs/design/0.2.0-modelo-ejecucion.md`](../design/0.2.0-modelo-ejecucion.md).

## Contexto

El criterio de salida de 0.2.0 es que "editar un caso ejecutado no altera sus
resultados" (ROADMAP §3). Hoy no se puede cumplir:

- **Pasos sin identidad.** `steps` es `string[]` dentro del JSON `data` del caso
  (`src/modules/test-cases/model/types.ts`: `TestCaseData.steps`,
  `Flow.steps`, `background`). Un resultado por paso guardado por posición
  apunta a otro paso en cuanto alguien inserta, borra o reordena.
- **La revisión vigente no tiene fila.** `update_case`
  (`src-tauri/src/test_case.rs`) copia el estado **anterior** a
  `test_case_revisions` y sube `revision`. La versión actual solo existe en
  `test_cases`, y se pierde en la siguiente edición si nadie la ha copiado.
- **Las revisiones no se sincronizan.** `CORE` en `src-tauri/src/sync.rs` es
  `project`, `test_plan`, `test_case`. Un resultado sincronizado a otro equipo
  apuntaría a una revisión que allí no existe.
- **El número de revisión no es único entre equipos.** Con conflictos por
  entidad ([ADR-0002](0002-conflictos-por-entidad.md)), dos equipos que editan
  sin conexión producen cada uno una "revisión 4" con contenido distinto.
- **La revisión solo guarda `title` y `data`** (`0003_test_cases.sql`). Faltan
  `scenario_id`, `status`, `priority` y `version`.
- **Filas de Outline.** El spike ING-01 (R2) muestra que `TC-002[n]` depende del
  orden de las filas de `Examples`.

## Opciones

| Opción                                                                                                          | A favor                                                                                                          | En contra                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Copia completa dentro del Run.** Cada elemento del run copia título, pasos y resultado esperado al empezar | Autocontenido; no depende de sincronizar revisiones                                                              | Duplica el caso en cada ejecución; no hay una revisión compartida con la que comparar ni sobre la que montar baselines (CAS-02); los resultados importados no la necesitan |
| **B. Revisiones inmutables y sincronizadas; el resultado apunta al id de la revisión**                          | Una sola fuente; permite comparar "lo ejecutado" con "lo actual"; CAS-02 reutiliza las revisiones como baselines | Cambia el repositorio de casos y el sync (entidad nueva _append-only_); exige una migración de datos                                                                       |
| **C. Solo `(test_case_id, revision)`**                                                                          | Mínimo cambio                                                                                                    | Ambiguo entre equipos; no resuelve nada si la revisión no está sincronizada                                                                                                |

## Decisión: B, con pasos y filas con ID estable

1. **Una fila por revisión guardada, incluida la vigente.** Al crear un caso se
   escribe la revisión 1; cada guardado escribe la revisión nueva. Las filas
   nunca se modifican.
2. **Id determinista de la revisión:**
   `id = UUIDv5(NS_TEST_CASE_REVISION, test_case_id ‖ revision ‖ content_sha256)`.
   El mismo contenido en dos equipos da el mismo id, y uno distinto da otro, así
   que dos "revisión 4" divergentes conviven sin pisarse.
3. **El resultado guarda `test_case_revision_id`** (y `case_revision`, el
   número, solo para mostrar).
4. **Pasos como objetos:** `steps: { id, text }[]` en `data.steps`,
   `data.background` y `flows[].steps`. El `id` es corto (8 caracteres base32),
   único dentro del caso y no se reutiliza nunca. Se conserva al editar el
   texto o reordenar; un paso nuevo recibe uno nuevo; duplicar un caso genera
   ids nuevos.
5. **Filas de Outline con id:** `examples.rows: { id, values }[]`. El resultado
   guarda `example_row` (el `n` de `TC-002[n]`, como lo emiten las
   herramientas) y una copia `example_values` de los valores ejecutados, para
   que un reordenamiento posterior no cambie lo que se ve en el histórico.
6. **Resultados automatizados.** `StepResult.step_id` es opcional: se rellena
   cuando la revisión ejecutada se puede identificar y el paso del pickle casa
   por posición (excluidos los hooks, ING-01 §2.3). Si no, solo se guardan
   `text` y `position`.

## Esquema (boceto)

SQLite local (migración aditiva + migración de datos en Rust):

```sql
-- test_case_revisions pasa a ser inmutable y completa
ALTER TABLE test_case_revisions ADD COLUMN workspace_id   TEXT;
ALTER TABLE test_case_revisions ADD COLUMN scenario_id    TEXT;
ALTER TABLE test_case_revisions ADD COLUMN status         TEXT;
ALTER TABLE test_case_revisions ADD COLUMN priority       TEXT;
ALTER TABLE test_case_revisions ADD COLUMN version        TEXT;
ALTER TABLE test_case_revisions ADD COLUMN content_sha256 TEXT;   -- sha256 del JSON canónico
ALTER TABLE test_case_revisions ADD COLUMN hlc            TEXT NOT NULL DEFAULT '';
CREATE INDEX test_case_revisions_case_rev_idx ON test_case_revisions (test_case_id, revision);
```

```ts
interface Step {
  id: string;
  text: string;
}
interface ExampleRow {
  id: string;
  values: string[];
}
// TestCaseData.steps / background: Step[]; Flow.steps: Step[]; ExampleTable.rows: ExampleRow[]
```

Servidor (Postgres): sin tabla nueva hasta 0.5.0. Las revisiones viajan como
documentos `entity = 'test_case_revision'` en `documents`.

## Impacto en sync y migraciones (VERSIONING §6)

- **Clase de sync nueva, `append_only`**, que reutilizan resultados y auditoría
  (ADR-0013, ADR-0015). Un documento _append-only_ se inserta si no existe,
  nunca lleva `baseRevision` y nunca entra en conflicto. El servidor rechaza un
  push que intente cambiar su contenido. Es un cambio de protocolo: va con la
  versión de protocolo de SYNC-08.
- **Migración de datos determinista.** Convertir `string[]` en `Step[]` se hace
  en Rust tras la migración SQL, y es idempotente (si ya son objetos, no hace
  nada). Los ids iniciales se derivan de `sha256(test_case_id ‖ ':' ‖ índice)`.
  Así dos equipos que migran el mismo caso producen los mismos ids y el sync no
  ve diferencias. La migración no sube `revision` ni escribe en el oplog.
- **Documentos antiguos.** Un documento de caso con pasos `string[]` que llegue
  por pull (de un cliente 0.1.x que el servidor aún acepta) se normaliza al
  aplicarlo con la misma función determinista.
- **Relleno.** Por cada caso se inserta la fila de su revisión vigente con el id
  determinista. Las filas antiguas (estados previos, ids aleatorios) se
  conservan y se sincronizan tal cual.
- **Copia previa (SEC-06)** y **test de actualización** desde un fixture 0.1.0
  con casos de los tres niveles de Gherkin (BASE-04).
- La web ([ADR-0004](0004-web-cliente-del-servidor.md)) debe leer la nueva forma
  de los pasos desde el servidor; su implementación de `localStorage` no se
  adapta (BASE-10 la elimina).

## Preguntas resueltas (2026-10-28)

El usuario aceptó la recomendación de cada pregunta; lo que sigue queda decidido.

1. **Casos avanzados escritos en Gherkin crudo (`featureSource`).** Al
   reparsear, ¿se intenta conservar el id de cada paso? Recomendación: sí, por
   escenario + posición + texto (si cambia el texto en la misma posición, se
   conserva el id); las líneas insertadas reciben id nuevo.
2. **¿Resultado esperado por paso?** Hoy solo hay uno por caso.
   Recomendación: añadir `expected?` opcional a `Step`, que la ejecución manual
   muestra junto al paso. No es obligatorio y no cambia la plantilla `.xlsx`.
