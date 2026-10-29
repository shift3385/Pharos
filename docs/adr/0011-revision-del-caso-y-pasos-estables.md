# ADR-0011 · El resultado apunta a la revisión del caso y a pasos con ID estable (DAT-02)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las
  respuestas recomendadas). Revisado el 2026-10-28 tras la revisión
  independiente de la rama (ver "Revisión"): **⚠ un punto requiere confirmación
  del usuario**, la excepción a VERSIONING §6.5. Bloquea EJE-01/EJE-02.
- **Diseño de conjunto:** [`docs/design/0.2.0-modelo-ejecucion.md`](../design/0.2.0-modelo-ejecucion.md).

## Contexto

El criterio de salida de 0.2.0 es que "editar un caso ejecutado no altera sus
resultados" (ROADMAP §3). Hoy no se puede cumplir:

- **Los pasos no tienen identidad.** `steps` es un `string[]` dentro del JSON
  `data` del caso (`src/modules/test-cases/model/types.ts`: `TestCaseData.steps`,
  `Flow.steps`, `background`). Un resultado de paso guardado por posición apunta
  a otro paso en cuanto alguien inserta, borra o reordena.
- **La revisión vigente no tiene fila.** `update_case`
  (`src-tauri/src/test_case.rs`) copia el estado **anterior** a
  `test_case_revisions` y sube `revision`. La versión actual solo existe en
  `test_cases`.
- **Las revisiones no se sincronizan.** No están en el conjunto de entidades que
  envía `sync.rs` (`CORE`: proyectos, planes y casos; con
  [ADR-0020](0020-sync-por-usuario-cascada-y-version.md), también requisitos y
  tarjetas). Un resultado sincronizado apuntaría a una revisión que en el otro
  equipo no existe.
- **El número de revisión no es único entre equipos.** Como los conflictos se
  resuelven por entidad ([ADR-0002](0002-conflictos-por-entidad.md)), dos
  equipos que editan sin conexión producen cada uno una "revisión 4" distinta.
- **La revisión solo guarda `title` y `data`** (`0003_test_cases.sql`).
- **Filas de Outline.** El índice `n` de `<scenario_id>[n]` (p. ej.
  `ATS_002[2]`) depende del orden de las filas de `Examples` (ING-01 R2).
- **Un caso avanzado son varios escenarios.** Todos los flujos llevan el mismo
  tag `@<scenario_id>` (`src/modules/test-cases/ui/gherkin.ts`, bucle
  `for (const flow of flows)`), así que el tag no basta para saber qué flujo se
  ejecutó.

## Opciones

| Opción                                                                                 | A favor                                                                                           | En contra                                                                                                                                              |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Copia completa dentro del Run.** Cada elemento del run copia el caso al empezar   | Autocontenido; no depende de sincronizar revisiones                                               | Duplica el caso en cada ejecución; no deja una revisión compartida para comparar ni para baselines (CAS-02); los resultados importados no la necesitan |
| **B. Revisiones inmutables y sincronizadas; el resultado apunta al id de la revisión** | Una sola fuente; permite comparar "lo ejecutado" con "lo actual"; CAS-02 reutiliza las revisiones | Cambia el repositorio de casos y el sync (entidad _append-only_ nueva); hace falta una migración de datos                                              |
| **C. Solo `(test_case_id, revision)`**                                                 | Cambio mínimo                                                                                     | Ambiguo entre equipos; no resuelve nada si la revisión no está sincronizada                                                                            |

## Decisión: B, con pasos, flujos y filas con ID estable

1. **Una fila por revisión guardada, incluida la vigente.** Al crear un caso se
   escribe la revisión 1, y cada guardado escribe la nueva.
2. **Contenido canónico de la revisión:**
   - `content_sha256` es el sha256 del JSON canónico RFC 8785 (JCS) de
     exactamente estos campos: `scenario_id`, `title`, `version`, `status`,
     `priority`, `case_type`, `automation_status` (ADR-0018) y `data`
     (incluido `data.custom`);
   - quedan fuera `workspace_id`, `project_id`, las marcas de tiempo, los
     autores y el `hlc`.
3. **Id determinista de la revisión:**
   `id = UUIDv5(NS_TEST_CASE_REVISION, test_case_id ‖ revision ‖ content_sha256)`.
   El mismo contenido en dos equipos da el mismo id, y dos "revisión 4"
   divergentes conviven sin pisarse.
4. **El resultado guarda `test_case_revision_id`.** El número de revisión
   (`case_revision`) se guarda solo para mostrarlo.
5. **Pasos como objetos:** `steps: { id, text, expected? }[]` en `data.steps`,
   `data.background` y `flows[].steps`.
   - El `id` tiene 8 caracteres base32, es único dentro del caso y no se
     reutiliza.
   - Se conserva al editar el texto o al reordenar.
   - Duplicar un caso genera ids nuevos.
6. **Flujos.** `Flow.id` ya existe. El resultado y el elemento del run guardan
   `flow_id`. Al importar, el flujo se identifica por el nombre del escenario
   **dentro de la revisión ejecutada**. Si no casa, `flow_id` queda nulo y el
   resultado conserva `test_key` (ADR-0013).
7. **Filas de Outline:** `examples.rows: { id, values }[]`.
   - El resultado guarda `example_row_id`, resuelto contra la revisión
     ejecutada: la fila `n` es la n-ésima fila de esa revisión, contando todos
     los bloques `Examples` de su escenario.
   - Guarda también `example_row` (el `n`, para mostrar) y `example_values`
     (copia de los valores).
   - Reordenar las filas en revisiones posteriores ya no cambia el histórico.
     El único riesgo que queda de ING-01 R2 es que el `.feature` del repositorio
     de automatización vaya por detrás de la revisión. En ese caso el resultado
     sale marcado como "revisión ejecutada ≠ vigente" (ADR-0013).
8. **Resultados automatizados.** `StepResult.step_id` es opcional. Se rellena
   cuando la revisión ejecutada se puede identificar y el paso del pickle casa
   por posición, sin contar los hooks (ING-01 §2.3).
9. **Casos avanzados en Gherkin crudo (`featureSource`).** Al reparsear se
   conserva el id de cada paso por escenario + posición + texto (si cambia el
   texto en la misma posición, el id se mantiene). Una línea insertada recibe id
   nuevo.

## Esquema (boceto)

SQLite local: migración aditiva y, después, migración de datos en Rust.

```sql
-- test_case_revisions pasa a ser inmutable y completa
ALTER TABLE test_case_revisions ADD COLUMN workspace_id      TEXT;
ALTER TABLE test_case_revisions ADD COLUMN scenario_id       TEXT;
ALTER TABLE test_case_revisions ADD COLUMN status            TEXT;
ALTER TABLE test_case_revisions ADD COLUMN priority          TEXT;
ALTER TABLE test_case_revisions ADD COLUMN version           TEXT;
ALTER TABLE test_case_revisions ADD COLUMN case_type         TEXT;
ALTER TABLE test_case_revisions ADD COLUMN automation_status TEXT;
ALTER TABLE test_case_revisions ADD COLUMN content_sha256    TEXT;   -- JCS de los campos de la regla 2
ALTER TABLE test_case_revisions ADD COLUMN hlc               TEXT NOT NULL DEFAULT '';
CREATE INDEX test_case_revisions_case_rev_idx ON test_case_revisions (test_case_id, revision);  -- no único
```

```ts
interface Step {
  id: string;
  text: string;
  expected?: string;
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

**Clase de sync nueva, `append_only`.** La reutilizan resultados, hallazgos,
métricas y auditoría (ADR-0012, ADR-0013, ADR-0015).

- Un documento `append_only` se inserta si no existe, nunca lleva
  `baseRevision` y nunca entra en conflicto.
- Lo inmutable es el **contenido**. La **ubicación** (`workspace_id`) no forma
  parte del contenido ni de ningún hash.
- El servidor solo admite tres operaciones sobre un documento existente, todas
  con `seq` nuevo y evento de auditoría:
  1. **lápida**: cascada del borrado de un proyecto
     ([ADR-0020](0020-sync-por-usuario-cascada-y-version.md)) o purga de
     SYNC-06;
  2. **redacción**: borra los campos indicados, conservando el
     `content_sha256` original y una marca `redacted_at` (ADR-0015);
  3. **cambio de ubicación**: mover un proyecto de workspace o la migración
     v2 (ADR-0019).
- Cualquier otro cambio de contenido se rechaza.
- Es un cambio de protocolo: viaja con la versión de protocolo de SYNC-08.
- **No hay índices `UNIQUE`** sobre filas sincronizadas salvo la clave primaria,
  igual que en la fase 2 de [ADR-0010](0010-claves-entre-equipos.md): un pull
  con un choque haría fallar `write_doc` y, con él, todo el pull. Si un choque
  importa, se detecta en el repositorio y va al panel de conflictos.

**Migración de datos determinista.**

- Convertir `string[]` en `Step[]` (y las filas y `featureSource`) se hace en
  Rust después de la migración SQL. Es idempotente.
- Los ids iniciales se derivan de `sha256(test_case_id ‖ ':' ‖ lista ‖ ':' ‖ índice)`.
  Dos equipos que migran el mismo caso producen los mismos ids.
- No sube `revision` ni escribe en el oplog.
- Por cada caso se inserta la fila de su revisión vigente, con id determinista.
- Las filas antiguas (estados previos, ids aleatorios) se conservan.

**Compatibilidad con clientes 0.1 (VERSIONING §6.5).** Un cliente 0.1 que
reciba `steps: {id, text}[]` reescribe `data` sin ellos: pierde `data.custom` y
los ids de paso. Si su push se aceptara, los ids se volverían a derivar por
posición y los resultados antiguos apuntarían a pasos equivocados. Por eso:

1. **⚠ Requiere confirmación del usuario (cambia VERSIONING §6.5).** El
   servidor 0.2 acepta clientes 0.1 **solo para leer**:
   - `pull` funciona;
   - todo `push` de un 0.1 se rechaza con
     `426 read_only_client_version` antes de escribir nada, y el cliente 0.1
     muestra "actualiza para enviar cambios";
   - sus cambios pendientes no se pierden: se envían al actualizar.

   La regla general propuesta para §6.5 es: _"una MENOR que cambia la forma
   de entidades existentes acepta la MENOR anterior solo en lectura"_.
   VERSIONING.md se modifica cuando el usuario lo confirme.

2. **Un campo que falta en el payload conserva el valor local.** Al aplicar un
   documento, `apply_doc` no pone el valor por defecto en las columnas o claves
   de `data` que el emisor no conoce (`data.custom`, `case_type`,
   `automation_status`, `risk_*`, los ids de pasos). Protege frente a clientes
   antiguos y a la web.
3. **El cursor vuelve a 0 en el primer sync de 0.2.** Un 0.1 avanza su cursor
   aunque `apply_doc` se salte entidades que no conoce, así que lo que otro
   equipo ya en 0.2 creó (runs, resultados, defectos) no se volvería a pedir.
   La regla general es: cada versión que añade entidades al conjunto que se
   aplica pone el cursor a 0 una vez. Es idempotente, como el reinicio de
   ADR-0020.
4. **Documentos antiguos que llegan por pull**, escritos por un 0.1 antes de
   actualizar el servidor, se normalizan al aplicarlos con la misma función
   determinista.

**Otros puntos.**

- **Copia previa (SEC-06)** y **test de actualización** desde un fixture 0.1.0
  con casos de los tres niveles de Gherkin (BASE-04).
- La web ([ADR-0004](0004-web-cliente-del-servidor.md)) lee la nueva forma desde
  el servidor. Su implementación sobre `localStorage` no se adapta (BASE-10 la
  elimina).

## Decisiones del usuario (2026-10-28)

1. Al reparsear un `featureSource`, el id de cada paso se conserva (regla 9).
2. Cada paso admite un resultado esperado opcional, `expected`, que la ejecución
   manual muestra junto al paso. No cambia la plantilla `.xlsx`.

## Revisión (2026-10-28, tras la revisión independiente)

- **Precisiones, sin cambiar la decisión:**
  - contenido canónico JCS y lista exacta de campos (regla 2);
  - `flow_id` (regla 6);
  - `example_row_id` resuelto contra la revisión ejecutada (regla 7);
  - definición de lo inmutable en `append_only` y sus tres operaciones de
    servidor;
  - sin índices `UNIQUE` en filas sincronizadas;
  - el campo que falta conserva el valor local;
  - el cursor vuelve a 0 en el primer sync;
  - nomenclatura `<scenario_id>` en lugar de `TC-xxx`.
- **⚠ Cambia una regla aceptada:** el servidor 0.2 acepta clientes 0.1 solo en
  lectura (excepción a VERSIONING §6.5). Pendiente de confirmar.
