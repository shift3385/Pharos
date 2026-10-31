# ADR-0011 · El resultado apunta a la revisión del caso y a pasos con ID estable (DAT-02)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las
  respuestas recomendadas). Revisado el 2026-10-28 tras la revisión
  independiente de la rama (ver "Revisión"). La excepción a VERSIONING §6.5
  fue confirmado por el usuario el 2026-10-28. Bloquea EJE-01/EJE-02.
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

1. **Excepción a VERSIONING §6.5 (confirmado por el usuario el 2026-10-28).** El
   servidor 0.2 acepta clientes 0.1 **solo para leer**:
   - `pull` funciona;
   - todo `push` de un 0.1 se rechaza con
     `426 read_only_client_version` antes de escribir nada, y el cliente 0.1
     muestra "actualiza para enviar cambios";
   - sus cambios pendientes no se pierden: se envían al actualizar.

   La regla general queda escrita en VERSIONING §6.5: _"una MENOR que cambia
   la forma de entidades existentes acepta la MENOR anterior solo en lectura"_.

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
- **Cambio sobre lo aceptado, confirmado por el usuario el 2026-10-28:** el servidor 0.2 acepta clientes 0.1
  solo en lectura (excepción en VERSIONING §6.5).

## Nota de implementación: clase `append_only` (E1, 2026-10-31)

La clase `append_only` está hecha (paso 1 del diseño 0.2.0) y su primera
entidad es `audit_event` (ADR-0015). Lo que conviene saber para registrar
`test_case_revision` y las demás:

- **Registro de una línea por lado:** `APPEND_ONLY` en
  `src-tauri/src/sync_class.rs` (con sus funciones de lectura, inserción y
  dueño) y `APPEND_ONLY_ENTITIES` en `server/src/modules/sync/sync.schemas.ts`.
  Si borrar el proyecto debe dejar lápida, se añade también a
  `PROJECT_CHILDREN`; `audit_event` no está ahí, porque la auditoría sobrevive
  a lo que audita. Cada entidad nueva sube `APPLIED_SET_VERSION`, y con eso el
  cursor vuelve a 0 una vez.
- **En el protocolo** el documento viaja con `op: "append"` (solo las entidades
  append-only lo usan, y solo con ese op), `revision: 1` y sin base. El
  servidor responde `appendRejected` cuando ya tiene el id con otro contenido.
- **Interruptor:** además de la versión de SYNC-08, la cabecera
  `x-pharos-sync-features` con `append-only`. Dentro de una MENOR la cadena de
  versión no cambia entre builds, así que la cabecera es lo que distingue un
  0.2.0-alpha.1 de un build con la clase. El servidor responde `features`, y un
  cliente solo envía documentos append-only a un servidor que los lista.
- **De las tres operaciones de servidor, hoy solo existe el cambio de
  ubicación:** un push con el mismo contenido y otra ubicación se acepta con
  `seq` nuevo. No deja evento de auditoría en el servidor (AUD-01b solo audita
  las escrituras del dominio de la web), y el escritorio no aplica cambios de ubicación de documentos que ya tiene (solo
  inserta si no existen): llega con ADR-0019. La lápida y la redacción de
  servidor llegan con SYNC-06 y Admin > Auditoría.
- **La puerta de solo lectura para 0.1** (`426 read_only_client_version`) se
  hace en el paso 2, con el cambio de forma de los casos. E1 no cambia la forma
  de ninguna entidad existente.
- **El campo que falta conserva el valor guardado, solo para clientes
  antiguos.** El servidor lo aplica (`storeDoc`, con `data` a un nivel) a los
  push de clientes que no envían la funcionalidad `complete-payload` (0.1.x,
  0.2.0-alpha.1). Los clientes actuales y las escrituras de la web envían el
  estado completo y pueden vaciar un campo omitiéndolo; el escritorio aplica el
  pull tal cual llega. Enviar `null` para vaciar sigue siendo la práctica
  recomendada, no un requisito. (Revisión de E1: la fusión para todos devolvía
  campos que el usuario había vaciado.)

## Nota de implementación: revisiones y pasos estables (E2, paso 2, 2026-10-31)

Hecho en el paso 2 del diseño 0.2.0. Respuestas del coordinador a las
preguntas del plan (Q1–Q9) y lo que conviene saber:

- **Formas.** `Step = { id, text, expected? }` en `data.preconditions`,
  `data.background`, `data.steps` y `flows[].preconditions|steps` (Q1:
  también las precondiciones, que son pasos Given; añadirlas más tarde
  exigiría otra migración de datos). `ExampleRow = { id, values }` en
  `examples.rows` y `flows[].examples.rows`. Los ids son únicos dentro del
  caso (pasos y filas comparten espacio; los flujos tienen el suyo).
  `expected` viaja en el modelo, el hash y el normalizador; su campo en el
  editor llega con la ejecución manual (paso 7, Q2). `.feature` y `.xlsx`
  no cambian: un test dorado compara ambos formatos, escritos por el código
  anterior, con los casos en las dos formas.
- **Ids.** Tres implementaciones del mismo normalizador (`steps.rs`,
  `server/src/modules/sync/stable-steps.ts` y el lector tolerante del cliente)
  comprobadas contra `src-tauri/tests/fixtures/stable-steps-vectors.json`.
  - Datos antiguos (migración, pull de un documento antiguo, lectura en la
    API de la web): id derivado de `sha256("<caso>:<lista>:<índice>")`, 40
    bits en base32 de Crockford; mismo caso, mismos ids en todos los equipos.
    Nada se pierde: un elemento que no es texto ni paso pasa a ser un paso
    cuyo texto es su JSON canónico.
  - **Desviación:** al guardar, un paso sin id recibe uno aleatorio, no
    derivado: un id derivado podría ser el de un paso borrado en esa
    posición, y un id nunca se reutiliza.
  - El editor conserva los ids al editar, insertar, borrar y reordenar, y al
    reparsear el Gherkin crudo (regla 9): los textos iguales se emparejan por
    subsecuencia común; entre dos coincidencias, con tantos a cada lado se
    emparejan en orden (texto editado en su sitio) y, si no, por parecido del
    texto, para que una línea insertada junto a una editada no se quede con
    el id de esta. Los flujos se emparejan por nombre de escenario y, si no,
    por posición (escenario renombrado).
- **Revisiones.** Migración 0020: `test_case_revisions` se reconstruye con
  las columnas del contenido, `content_sha256` y `hlc`, y un trigger que
  impide cambiar el contenido de una fila con hash. **Sin la clave foránea a
  `test_cases`**: un pull puede traer revisiones antiguas antes que su caso
  (el documento del caso tiene un `seq` más nuevo), y el SQLite incluido
  aplica las claves foráneas. La purga borra las revisiones de un caso
  purgado. `revisions::ensure_current` es el único que escribe filas, en todo
  camino que da un estado nuevo al caso (crear, guardar, claves, conflictos,
  pull, migración). JCS completo (RFC 8785, números con `ryu-js`, Q7); un
  entero fuera de ±(2^53 − 1) se escribe como lo lee JavaScript, y dentro del
  subconjunto de la auditoría la salida es la misma que `audit::jcs`. Un
  `data` nulo se hashea como `{}` en los dos lados; un `data` que no es JSON
  no deja fila (se registra en el log). Un test recorre cada camino que sube
  `revision` y otro cuenta en el código las sentencias que la escriben, para
  que un sitio nuevo no se olvide de `ensure_current` (revisión S2).
- **Migración 0021 (Rust, mismo savepoint que su SQL).** Normaliza todos los
  casos (también los borrados) y los payloads de los conflictos abiertos, y
  escribe la fila de la revisión vigente de cada caso. No sube `revision` ni
  registra cambios de `test_case`. **Desviación (Q5):** sí deja en el oplog
  una fila `append` por esa revisión (casos vivos con dueño), para que el
  servidor y la web tengan la revisión de los casos que nadie vuelve a
  editar; dos equipos producen el mismo documento, que el servidor guarda una
  vez. Idempotente; probada desde los dos fixtures, con casos de los tres
  niveles añadidos, y en los dos órdenes posibles con 0022–0023.
- **Ids que el usuario no ve cambiar.** En un campo de lista (precondiciones,
  Background), mientras la lista conserva su longitud cada paso conserva el id
  de su fila, escriba lo que escriba (vaciar un paso no lo convierte en otro);
  solo una inserción o un borrado alinean los textos (revisión S1). En la
  alineación, dos elementos de un hueco con distinto número a cada lado solo se
  emparejan si su parecido llega a 0,3 (`MIN_SIMILARITY`): una línea
  reemplazada por completo recibe id nuevo. Mismo algoritmo en el escritorio,
  el servidor y el cliente, comprobado con los vectores compartidos. Un id
  reemplazado que no estaba vacío (un número de una importación antigua, un id
  repetido) se guarda en `legacyId`. Un flujo conserva las claves que el
  parser no conoce. El panel de conflictos muestra los pasos como texto
  (y su resultado esperado) y no marca como cambio dos versiones que solo
  difieren en ids (revisión S3).
- **Sync.** `test_case_revision` es `append_only`;
  `APPLIED_SET_VERSION = 2`. En el servidor, `createdAt`, `createdBy` y
  `hlc` quedan fuera del contenido comparado (Q8), y un cambio de ubicación
  conserva los valores guardados; los eventos de auditoría comparan igual que
  antes. Fuera de `PROJECT_CHILDREN` hasta SYNC-06 (Q9, SYNC-11 en el
  backlog); mientras tanto, el escritorio no vuelve a insertar las revisiones
  de un caso que purgó (`purged_case:<id>` en `sync_state`). Un pull de un caso guarda su revisión sin enviarla: la envía el
  equipo que la hizo.
- **Clientes antiguos en solo lectura** (excepción de VERSIONING §6.5,
  confirmada por el usuario el 2026-10-31: «Sí, acepto»). En cuanto el
  servidor tiene este paso, las apps **0.1.x y 0.2.0-alpha.1 solo pueden
  leer** hasta actualizarse. La puerta es la funcionalidad `stable-steps`:
  su push recibe `426 read_only_client_version` con el mensaje «Actualiza
  Pharos para enviar cambios; tus cambios pendientes se conservan», y su pull
  trae los casos con pasos de texto (Q4) **sin perder nada** (revisión B1):
  el servidor guarda las listas estables en `data.__stableSteps`, que esas
  apps almacenan con `data` y nunca envían. Al actualizar, 0021 (y el mismo
  normalizador en el servidor) devuelve a cada paso, fila y flujo su id y su
  `expected` desde ese depósito y lo quita; lo que el usuario cambió mientras
  estaba en solo lectura se alinea con la regla 9. Si el editor antiguo guardó
  el caso sin el depósito, se toma del estado anterior que el `update_case`
  antiguo copió al historial. Así el caso vuelve a tener el mismo contenido y
  el mismo hash que en el servidor, y la revisión que encola la migración es la
  que el servidor ya tiene: nada se duplica. El reinicio del cursor **no**
  bastaría (`apply_doc` no reescribe un documento cuya base coincide), por eso
  hace falta el depósito. Límite: esas apps hacen el push
  antes del pull y tratan el 426 como fatal, así que con un cambio pendiente
  dejan de recibir novedades hasta actualizar (VERSIONING §6.5).
- **Servidor antiguo.** El escritorio retiene casos y revisiones hasta ver
  `stable-steps` en una respuesta del servidor de esa cuenta (Q6; se guarda
  por cuenta, como el cursor); el diagnóstico exportado
  dice cuántos casos retiene y por qué (`heldBackCases`,
  `heldBackReason`). El primer sync tras actualizar los envía después del
  pull.
- **La web.** La API de dominio lee con ids derivados los casos guardados por
  un cliente antiguo, da ids aleatorios a los pasos nuevos y guarda el
  documento de la revisión en cada guardado, con el mismo id que el
  escritorio.
