# ADR-0055 · Pasos compartidos, parámetros y datasets: biblioteca versionada y copia materializada en el caso (CAS-01)

> Completa [ADR-0011](0011-revision-del-caso-y-pasos-estables.md) (pasos, filas y revisiones con id estable) y [ADR-0013](0013-campos-del-run.md) (objetivos de ejecución por fila). Aplica la regla de edición de [ADR-0049](0049-estados-del-plan-y-aprobacion-independiente.md) (opción A) a los cambios que llegan desde la biblioteca. No cambia ninguna decisión anterior.

- **Estado:** Aceptado (decisión del usuario, 2026-11-19: el plan y las cinco respuestas recomendadas; ver «Decisiones del usuario»). Pista P de 0.6.0, ola 2.
- **Relacionados:**
  - [ADR-0011](0011-revision-del-caso-y-pasos-estables.md) (pasos `{id, text, expected?}`, filas `{id, values}`, revisiones inmutables con id determinista, clase `append_only`);
  - [ADR-0013](0013-campos-del-run.md) (`run_items` congelan la revisión; `manual::targets_of` da un objetivo por flujo y fila; el resultado guarda `example_row_id`, `example_row` y `example_values`);
  - [ADR-0047](0047-revision-de-casos-y-baselines.md) y [ADR-0049](0049-estados-del-plan-y-aprobacion-independiente.md) (revisión del caso, editar uno aprobado lo lleva a «En revisión»);
  - [ADR-0051](0051-fusion-por-campo-oplog-y-lapidas-de-revisiones.md) (fusión por campo, `merge-fields.json`, lápidas de revisiones);
  - [ADR-0050](0050-pharos-core-y-sqlite-en-disco-cifrado.md) (`pharos-core`, `journal::record` como única puerta de escritura);
  - [ADR-0042](0042-revision-workspaces-sync-v2.md) (funcionalidades de sync, roles por delta);
  - VERSIONING §6.
- **Plan:** [`docs/design/p-cas01-plan.md`](../design/p-cas01-plan.md); bocetos en [`p-cas01-bocetos.html`](../design/p-cas01-bocetos.html).

## Contexto

- **Los pasos viven dentro del caso.** `test_cases.data` guarda `preconditions`, `steps`, `background` y `flows[].steps` como `Step[]` con id estable (ADR-0011). No hay tabla de pasos ni forma de reutilizar un paso entre casos: quien tiene «Iniciar sesión» en 40 casos lo copia 40 veces y, cuando cambia el login, edita 40 casos.
- **Los parámetros y las filas ya existen, pero solo dentro de un caso.**
  - El nivel `outline` usa `<placeholder>` en pasos y resultado esperado, y una tabla `data.examples` (`{headers, rows: {id, values}[]}`); un flujo avanzado tiene la suya en `flows[].examples`.
  - El editor añade una columna por cada `<placeholder>` (`withPlaceholderColumns`), y la ejecución manual sustituye los valores (`execution.ts` `fill`).
  - **Una fila ya da un resultado:** `manual::targets_of` expande un elemento del run en un objetivo por fila, con `test_key` `manual:<caso>/<flujo>/<fila>`, y la matriz y el progreso del ciclo cuentan cada fila. Lo que falta es compartir la tabla entre casos.
- **El resultado apunta a la revisión congelada** (`run_items.test_case_revision_id`), y las baselines (CAS-02) también. Todo lo que muestre un resultado o una baseline tiene que poder reconstruirse desde la revisión del caso.
- **`runs.dataset`** es un texto libre de cabecera (ADR-0013) que no se muestra; no sirve como modelo.
- **Exportes:** el PDF, la hoja `.xlsx` (B19 pasos, B31 datos de prueba con la tabla de ejemplos) y el `.feature` se generan desde `data`.
- **Importes:** el vínculo a caso, flujo y fila se deriva al leer (`link.rs`). La fila sale del índice `exampleRow` contra las filas de la revisión; solo se reconoce en Cucumber Messages, `Example #n` y el JUnit de cucumber-js.

## Opciones (cómo referencia un caso a un paso compartido)

| Opción | A favor | En contra |
| --- | --- | --- |
| **A. Referencia viva sin copia.** El caso guarda `{sharedStepId}`; la ejecución, los exportes y la revisión resuelven el contenido al leer | Ningún dato duplicado; cambiar el paso «cambia» todos los casos sin escribirlos | La revisión del caso deja de describir lo que se ejecutó: hay que congelar también la versión del paso en `run_items`, en `results` y en las baselines (cambio de forma de entidades existentes, puerta y solo lectura para 0.5); cada lector (PDF, `.feature`, xlsx, matriz, importes, web, CLI) tiene que resolver referencias; un cliente sin la biblioteca ve pasos vacíos |
| **B. Referencia fijada a una versión, con copia materializada en el caso** (rec.). El caso guarda la referencia y la versión, y además los pasos copiados con id estable; cambiar el paso compartido reescribe los casos que lo siguen | La revisión del caso sigue siendo autosuficiente: ejecución, baselines, matriz, exportes, importes y fusión no cambian; un cliente que no conoce la biblioteca ve pasos normales; «cambiar un paso compartido actualiza N casos» es literal, con historial en cada caso | Escribe N casos por cada cambio (sync de N documentos); hay que reconciliar la copia si alguien la toca sin pasar por la biblioteca |
| **C. Solo copiar («insertar plantilla»)**, sin vínculo | Trivial | No cumple CAS-01: cambiar el paso no actualiza nada |

Para los datasets el razonamiento es el mismo: las filas ya expanden resultados, así que un dataset se **materializa** en la tabla de ejemplos del caso.

## Decisión: B. Biblioteca del proyecto, versiones inmutables y copia materializada

### 1. Entidades nuevas (por proyecto)

| Entidad | Clase de sync | Contenido |
| --- | --- | --- |
| `shared_step` | LWW, hijo del proyecto | `name` (único en el proyecto, comprobado en el repositorio), `description` (texto largo), `params: {id, name, default?}[]`, `steps: Step[]` (`{id, text, expected?}`), `status` (`active` \| `obsolete`), `version` (entero, sube con cada cambio de contenido), `contentSha256` |
| `shared_step_revision` | `append_only` | Copia inmutable de cada versión: `sharedStepId`, `version`, `name`, `params`, `steps`, `contentSha256`; id `UUIDv5(NS_SHARED_STEP_REVISION, sharedStepId ‖ version ‖ contentSha256)` |
| `dataset` | LWW, hijo del proyecto | `name` (único), `description`, `columns: {id, name}[]`, `rows: {id, values: {<columnId>: string}}[]`, `status`, `version`, `contentSha256` |
| `dataset_revision` | `append_only` | Igual que la de arriba, con `columns` y `rows` |

- **Versión.** `version` sube solo cuando cambia el contenido canónico (JCS de `name`, `params`/`columns`, `steps`/`rows`); describir o marcar obsoleto no la sube. Dos equipos que llegan a la misma versión con el mismo contenido producen el mismo id de revisión; con contenido distinto conviven, como las revisiones de caso (ADR-0011 regla 3).
- **Sin claves visibles** (`SS-001`) en 0.6.0: se identifican por nombre, y los exportes citan «nombre (vN)». Las claves exigirían bloques de claves nuevos en el servidor (ADR-0010).
- **Sin anidar:** un paso compartido no contiene otro.
- **Límites:** un paso compartido, hasta 50 pasos y 20 parámetros; un dataset, hasta 30 columnas y 500 filas, y 4 KB por celda. Los comprueban el núcleo y el servidor.
- **Borrar** un paso compartido o un dataset solo se permite cuando ningún caso vivo lo usa; si no, se marca obsoleto. Si el borrado llega por sync con casos que aún lo usan, los casos conservan su copia y muestran «Paso compartido borrado» con «Desvincular».

### 2. Cómo lo referencia un caso

Dos claves nuevas en `data` del caso, ambas listas con id:

```ts
// data.sharedRefs: una entrada por inserción («llamada») de un paso compartido
interface SharedRef {
  id: string;                 // id de la llamada, 8 base32 como un paso
  sharedStepId: string;
  version: number;            // versión materializada
  revisionId: string;         // shared_step_revision.id de esa versión
  follow: boolean;            // true: sigue la última versión; false: fijada
  list: "preconditions" | "steps";   // dónde está la copia
  stepIds: string[];          // ids de los pasos copiados, en orden
  args: Record<string, string>;      // por nombre de parámetro; ver §3
}
// data.datasetRefs: como mucho una por tabla de ejemplos (en 0.6.0, la del caso)
interface DatasetRef {
  id: string;                 // "case" en 0.6.0; el id del flujo cuando lleguen los avanzados
  datasetId: string;
  version: number;
  revisionId: string;
  follow: boolean;
  rowIds?: string[];          // subconjunto de filas del dataset; ausente = todas
  columnMap?: Record<string, string>; // parámetro → columna, si no coinciden por nombre
}
```

- **La copia es la fuente para todo lo demás.** Los pasos de la llamada están en `data.preconditions` o `data.steps` como pasos normales. Su id es determinista: `crockford32(sha256("<caseId>:shared:<refId>:<stepIdEnLaBiblioteca>"))[..8]`. Por eso un paso conserva su id entre versiones mientras conserve el suyo en la biblioteca, y su historial de resultados sigue apuntando al mismo paso.
- **La tabla materializada** sustituye a `data.examples`. Las cabeceras son los parámetros del caso y las filas son las del dataset, ya filtradas. El id de cada fila es `crockford32(sha256("<caseId>:dataset:<refId>:<rowIdDelDataset>"))[..8]`, así que `example_row_id` se mantiene aunque cambien los valores o el orden.
- **El editor no deja editar la copia.** La muestra como un bloque con «Abrir en la biblioteca», «Fijar en vN» o «Seguir la última», y «Desvincular», que convierte el bloque en pasos propios y quita la referencia. Una tabla vinculada se ve de solo lectura, con «Desvincular (copiar filas)».
- **Integridad.** Al cargar o guardar, el núcleo comprueba que la copia coincide con la revisión referenciada y los argumentos. Si no coincide (por ejemplo, porque la editó un cliente que no conoce la biblioteca, o desde la pestaña Gherkin), la llamada se marca «Modificado fuera de la biblioteca» y ofrece «Restaurar» o «Desvincular». Guardar no la corrige sola; la siguiente propagación sí la restaura.

### 3. Parámetros: la sintaxis de Gherkin, `<nombre>`

- **Una sola sintaxis** en pasos, resultado esperado, precondiciones y pasos compartidos: `<nombre>`, la de `Scenario Outline`. Es la que ya reconocen `placeholdersIn` y `fill`: `<` seguido de un carácter que no es espacio ni `>`, hasta el siguiente `>`; el nombre se recorta. No se introduce `{{…}}`.
- **Parámetros de un paso compartido:** se declaran en su ficha y se detectan al escribir. Un `<x>` sin declarar se añade como parámetro, y uno declarado que no aparece en ningún paso da un aviso.
- **Argumentos al insertar** (`args`), por parámetro:
  - **vacío (por defecto): pasa tal cual.** El texto copiado conserva `<usuario>`, que pasa a ser un parámetro del caso y toma su valor de la fila de ejemplos o del dataset. Así «Iniciar sesión con `<usuario>` y `<clave>`» encaja sin configurar nada con un dataset de columnas `usuario` y `clave`;
  - **un literal** (`ana@acme.test`): se sustituye en la copia;
  - **otro parámetro** (`<cliente>`): renombra; la copia lleva `<cliente>`.
  - Si el parámetro tiene valor por defecto y el argumento está vacío, gana el **paso** (pasa tal cual), no el valor por defecto. El valor por defecto solo rellena el campo al insertar.
- **Un caso con parámetros pasa al nivel `outline`**, como hoy con `detectLevel`. Los parámetros del caso son la unión de los `<x>` de sus textos, incluidos los de las copias. Cada uno es una columna de la tabla de ejemplos, propia o del dataset.
- **Columnas y parámetros.** Coinciden por nombre exacto (con mayúsculas y tildes) o por `columnMap`. Un parámetro sin columna bloquea «Enviar a revisión» y la ejecución de ese caso, con el aviso «Falta la columna `<clave>` en el dataset». Una columna sin parámetro se muestra en gris y se exporta igual.

### 4. Propagación: «cambiar un paso compartido actualiza N casos»

- **Al guardar** un paso compartido o un dataset con un cambio de contenido, el núcleo hace en **una transacción**:
  1. sube `version` y escribe la revisión `append_only`;
  2. para cada caso vivo del proyecto con una referencia `follow: true` a esa entidad, rematerializa la copia (pasos o tabla), actualiza `version` y `revisionId` de la referencia y guarda el caso por el camino normal (`update_case`): sube `revision`, escribe la `test_case_revision` con `ensure_current`, deja su evento de auditoría con `summary.cause = { sharedStep | dataset, id, version }` y entra en el oplog.
  - Los casos con la referencia fijada (`follow: false`) no cambian; la ficha del caso muestra «Hay una versión nueva (v5)» con «Actualizar».
  - Lo mismo hace el servidor para la web (`domain.service.ts`), con el mismo algoritmo y los mismos vectores.
- **Antes de guardar, el editor muestra el impacto:** «Este cambio actualiza 12 casos: 4 en Borrador, 3 En revisión, 5 Aprobados, que volverán a En revisión», con la lista y la opción de cancelar.
- **Reconciliación tras el pull.** Si un equipo recibe un caso que sigue una versión anterior a la que tiene en su biblioteca (alguien insertó la llamada sin conexión mientras otro cambiaba el paso), lo rematerializa con la misma función. Lo puede hacer cualquier equipo con `case.edit`. Como el resultado es determinista, dos equipos que reconcilian el mismo caso escriben el mismo contenido, y la fusión por campo no ve conflicto.
- **Revisión de casos (ADR-0049, opción A):** la rematerialización es un cambio de contenido, así que se aplica `case_review::after_save`:
  - un caso **Aprobado** pasa a **En revisión** y sube la versión, con `reopenedFrom` y la causa;
  - uno **En revisión** sigue En revisión, y «Cambios pedidos» pasa a pendiente;
  - uno en **Borrador** sigue en Borrador;
  - las **baselines no cambian**: apuntan a revisiones congeladas.

  Lo eligió el usuario (decisión 1).
- **Permisos:** `shared_step`, `shared_step_revision`, `dataset` y `dataset_revision` piden `case.edit`, igual que los casos (`workspace-roles.json`, `workspaces.rs` `capability_for` y `roles.ts` `capabilityFor`). Quien no puede editar casos tampoco puede cambiar la biblioteca: un Viewer o un Product Owner la ven en solo lectura.

### 5. Ejecución: un dataset de 3 filas da 3 resultados

- **Sin cambios de esquema en runs.** Un caso vinculado a un dataset de 3 filas tiene 3 filas en su tabla de ejemplos. `targets_of` da 3 objetivos, la ejecución manual guarda 3 resultados con su `example_row_id`, `example_row` y `example_values`, y la matriz y el progreso del ciclo los cuentan por fila, como hoy.
- **El elemento del run puede limitarse a una fila** (`example_row_id`) al añadirlo, como hoy. Al añadir un caso con dataset, el diálogo muestra «3 filas · Usuarios válidos (v2)».
- **Trazabilidad del dataset en el resultado:** el resultado manual añade a `attributes` `{"dataset": {"id", "name", "version"}}` y, por cada paso que viene de una llamada, `{"sharedStep": {"id", "version"}}` en el atributo del paso. Es una clave nueva dentro de un JSON que ambos lados guardan tal cual, así que no necesita puerta (VERSIONING §6.5).
- **La pantalla de ejecución** muestra los pasos ya sustituidos con los valores resaltados, el bloque del paso compartido con su nombre y su versión, y las filas como objetivos («Fila 2 de 3 · usuario = luis»).
- **Las métricas no cambian:** el progreso sin ciclo cuenta casos y con ciclo cuenta celdas. 3 filas son 3 resultados y 3 objetivos en la matriz, pero un solo caso en el progreso.

### 6. Informes importados

- **Sin cambios en el vínculo:** la fila de un resultado importado se resuelve por su índice contra las filas de la revisión ejecutada (`link.rs`). La tabla materializada es la que exporta el `.feature`, así que un repositorio que ejecuta ese `.feature` produce los mismos índices.
- **Fila explícita, en P5 después de la pista F** (decisión del usuario 3): se admitirá una fila explícita fuera de Cucumber, con la propiedad JUnit `example_row`, `extra.exampleRow` en CTRF y la anotación `row` de Playwright. Cambia lo que producen los parsers, así que sube `NORMALIZER_VERSION`.

### 7. Sync y fusión

- **Funcionalidad nueva `shared-steps`** en `x-pharos-sync-features`:
  - sin ella, el cliente no envía las cuatro entidades nuevas (las retiene, y el diagnóstico las cuenta) y el servidor no se las da en el pull; un push que las traiga recibe 400 `shared_steps_unsupported`;
  - `FEATURE_DATA_KEYS` protege `data.sharedRefs` y `data.datasetRefs` del caso frente a clientes sin la funcionalidad: su push conserva lo que el servidor tenga en esas claves;
  - las cuatro entidades entran en `PROJECT_CHILDREN` (cascada y restauración del proyecto, papelera y purga). Las revisiones reciben lápidas `deletedWith`, como las de caso (SYNC-11);
  - `APPLIED_SET_VERSION` sube (de 11 a 12) y el cursor vuelve a 0 una vez.
- **Servidor sin migración:** las cuatro son documentos de `documents` (como las baselines, ADR-0047). Validación con zod en `*_PAYLOADS`, con los límites del §1.
- **Fusión (`merge-fields.json`):**
  - `shared_step`: `description` texto; `steps` y `params` `idList`; el resto escalar;
  - `dataset`: `description` texto; `columns` `idList`; `rows` `idList` cuyos `values` son un `map` (dos personas que cambian celdas distintas de la misma fila se fusionan sin preguntar);
  - `test_case`: `data.sharedRefs` y `data.datasetRefs` `idList`;
  - **regla nueva, «derivado»:** los pasos de una copia y su tabla materializada no se fusionan campo a campo. Tras fusionar las referencias, los dos motores (`merge.ts`, `sync_merge.rs`) **rematerializan** desde la biblioteca local, y un conflicto que solo tocaba esa copia desaparece. Si la versión referenciada aún no está en el equipo, queda el conflicto normal. Va con vectores nuevos en `merge-vectors.json`.
- **Clientes 0.5** (frente a un servidor 0.6, si siguen pudiendo enviar): ven los pasos y la tabla como datos normales, no reciben la biblioteca y no pueden borrar las referencias. Lo que toquen de una copia se detecta como «Modificado fuera de la biblioteca» (§2) y lo arregla la siguiente propagación o «Restaurar».

### 8. Exportes e importes de casos

- **`.feature`:** pasos expandidos. Antes de cada bloque, un comentario `# Paso compartido: Iniciar sesión (v4)`, y antes de `Examples`, `# Dataset: Usuarios válidos (v2)`. Un caso con dataset sale como `Scenario Outline`. Los comentarios no cambian lo que ejecuta Cucumber; RUN-02 (0.7.0) podrá leerlos de vuelta.
- **PDF:** los pasos expandidos y, sobre cada bloque, una etiqueta «Paso compartido · Iniciar sesión · v4». La tabla de datos lleva el título «Datos de prueba · Usuarios válidos (v2)».
- **`.xlsx`:** la plantilla no cambia de forma. B19 lleva los pasos expandidos (como texto) y B31 la tabla materializada, que ya escribe hoy. Se añade una línea a B31: «Dataset: Usuarios válidos (v2)».
- **Importar un caso** (xlsx, `.feature`) da pasos y filas propios, sin vínculo: no se adivina una biblioteca.
- **Dataset:** importar desde CSV o `.xlsx` (primera hoja, primera fila como cabecera), pegar desde una hoja de cálculo y exportar a CSV. El CSV es UTF-8 con BOM y `;` o `,` detectado.
- **Golden tests:** se regeneran los de PDF, `.feature` y xlsx con casos que usan la biblioteca. Los casos sin biblioteca dan exactamente lo mismo que hoy.

### 9. Fuera de 0.6.0

- **Casos avanzados** (varios flujos, `featureSource`): sin pasos compartidos ni datasets hasta RUN-02 (0.7.0, Gherkin de ida y vuelta). Decisión del usuario 2.
- Anidar pasos compartidos, claves visibles (`SS-001`), datasets entre proyectos o del workspace, valores secretos o enmascarados en datasets, y generar datos con IA.
- Leer la biblioteca desde la API v1 (pista A) o el MCP (IA-06): se anota para esas pistas.

## Consecuencias

- Cumple el criterio de CAS-01 con el modelo actual: cambiar un paso compartido escribe una revisión nueva en cada caso que lo sigue, y un dataset de 3 filas da 3 objetivos y 3 resultados.
- Los resultados, las baselines, la matriz, los exportes, los importes y la fusión siguen leyendo la revisión del caso como hoy. No hay cambio de forma en `run_items`, `results` ni las revisiones.
- Coste: cada cambio en la biblioteca escribe N casos (N documentos en el siguiente sync) y, si hay casos aprobados, los reabre. El diálogo de impacto lo dice antes de guardar.
- Hay una tercera implementación de un algoritmo compartido (materializar y propagar): en Rust (núcleo), en el servidor (web) y en el cliente (vista previa del editor), con vectores comunes en `src-tauri/tests/fixtures/shared-steps-vectors.json`.
- Datos duplicados: la copia vive en cada caso y en cada revisión. Con los límites del §1, el coste es pequeño.

## Impacto en sync y migraciones (VERSIONING §6)

- **Local:** una migración aditiva, **0049** (reservada en `scripts/migration-registry.json`): tablas `shared_steps`, `shared_step_revisions` (con el trigger de inmutabilidad), `datasets` y `dataset_revisions`, más sus índices por proyecto. No hay migración de datos: ningún caso existente tiene referencias. Si otra pista fusiona antes una local por encima de 0048, la reserva se retira y se toma el número siguiente (regla `inOrder`).
- **Servidor:** sin migración (documentos genéricos).
- **Funcionalidad de sync** `shared-steps`, `APPLIED_SET_VERSION` 12, y `FEATURE_DATA_KEYS` para `data.sharedRefs` y `data.datasetRefs`.
- **Prueba de actualización** desde un fixture 0.5.0: abre sin pérdida, los casos no cambian de hash y la biblioteca empieza vacía.
- **Formatos exportados** (§6.6): el `.feature` y el xlsx añaden comentarios o líneas, pero no cambian de forma. Pharos Run JSON no cambia. Nota en el CHANGELOG.

## Decisiones del usuario (2026-11-19)

El usuario aprobó el plan y eligió las cinco recomendaciones («Sí, apruebo»; lo transmitió el coordinador):

1. **Casos aprobados cuando cambia un paso compartido o un dataset: opción A.** Se actualizan y vuelven a En revisión (regla de ADR-0049). Antes de guardar se muestra el aviso de impacto, y un caso que no deba moverse se fija en su versión. Se descartaron:
   - **B:** los aprobados esperan a «Actualizar»;
   - **C:** el paso compartido tiene su propia aprobación.
2. **Casos avanzados (varios flujos):** fuera de 0.6.0; llegan con RUN-02 (0.7.0).
3. **Fila explícita en informes que no son Cucumber** (JUnit `example_row`, `extra.exampleRow` de CTRF y la anotación `row` de Playwright): sí, en un PR aparte (P5), después de la pista F, porque toca sus parsers y sube `NORMALIZER_VERSION`.
4. **Límites:** 50 pasos y 20 parámetros por paso compartido; 30 columnas, 500 filas y 4 KB por celda en un dataset.
5. **La biblioteca en la interfaz:** una sección del proyecto, «Biblioteca», con las pestañas «Pasos compartidos» y «Datasets», en `/projects/:projectId/library?tab=` (ADR-0029).

## Implementación: núcleo (P1, 2026-11-19)

Hecho en `src-tauri/src/shared_library.rs` y `shared_library/materialize.rs`, con la migración local 0049. Precisiones sobre la decisión, sin cambiarla:

- **Guardar siempre rehace la copia.** Cada guardado local de un caso (`test_case::prepare_data`) reconstruye la copia desde la biblioteca, así que en este equipo la copia nunca se separa de su versión.
  - Esto concreta el §2: «Modificado fuera de la biblioteca» solo puede aparecer en lo que llega por sync de un cliente que no conoce la biblioteca.
  - «Restaurar» es guardar el caso. «Desvincular» es quitar la referencia.
  - El editor avisa antes de que una línea de un bloque editada en la pestaña Gherkin se pierda al guardar (P3).
- **Ids de los parámetros.** Un parámetro sin id (declarado sin id o detectado en un paso) lo recibe derivado de su nombre: `short_hash("param:<nombre>")`. Así, volver a guardar lo mismo no crea una versión nueva.
- **Versión y revisión.** `version` sube solo si cambia el hash del contenido canónico (`name` + `params`/`columns` + `steps`/`rows`). La descripción y el estado no lo cambian.
  - Al recibir un `shared_step` o un `dataset` por pull, el equipo guarda también la fila de su versión (id determinista), sin encolarla: así puede reconstruir un caso aunque el documento de la versión llegue después.
  - Una versión recibida cuyo id no corresponde a su contenido se descarta.
- **Propagación.** `update_item` sube la versión, escribe la versión `append_only` y guarda de nuevo cada caso vivo que sigue el elemento (`test_case::refresh_from_library`), en la misma transacción.
  - Cada guardado deja en su evento de auditoría `summary.cause = { shared_step | dataset: id, version }` y aplica la regla de revisión.
  - Al final de cada página de pull, `reconcile` hace lo mismo con los casos de los proyectos tocados que van por detrás de la biblioteca local. Se salta los casos que la cuenta no puede editar.
- **Fusión.** `merge-fields.json` añade:
  - para el caso, `data.sharedRefs` y `data.datasetRefs` (`idList`) y un bloque `derived`;
  - para `shared_step`, `description`, `params` y `steps`;
  - para `dataset`, `description`, `columns` y `rows`, con `values` como `map`, así que dos celdas distintas de una fila se fusionan solas.

  Con `derived`, un conflicto que solo toca un paso copiado (`data.steps#<id>` de un `stepIds`), la tabla de un caso con dataset o las claves `version`, `revisionId`, `stepIds` y `name` de una referencia se resuelve por el lado remoto. El siguiente guardado o `reconcile` lo reescribe. Los argumentos y `follow` siguen siendo conflictos normales. Los vectores nuevos están en `merge-vectors.json`.
- **Sync en el escritorio.**
  - `shared_step` y `dataset` entran en `oplog::SYNCED`, y sus versiones en `APPEND_ONLY`; `APPLIED_SET_VERSION` pasa a 12.
  - Todo se retiene hasta que el servidor de la cuenta lista `shared-steps`.
  - Las cuatro tablas siguen al proyecto: papelera, purga (`PurgeSummary.library`), restaurar, mover de workspace y borrar el proyecto.
  - Permiso: `case.edit`.
- **Comandos Tauri:** `library_list`, `library_get`, `library_create`, `library_update`, `library_impact`, `library_set_status`, `library_delete`, `library_versions`, `library_case_status` y `library_preview` (la vista previa de una inserción en el editor).
- **Vectores comunes:** `src-tauri/tests/fixtures/shared-steps-vectors.json` (materializar e ids derivados). `PHAROS_WRITE_VECTORS=1 cargo test vectors_match` los regenera.

## Implementación: servidor y web (P2, 2026-11-19)

- **Mismas reglas en el servidor.** Están en `server/src/modules/domain/shared-library.ts` (reglas puras) y `shared-library.service.ts` (API web), con los mismos vectores que el núcleo (`tests/shared-library.vectors.test.ts`).
- **Guardar un caso desde la web** (`casePayload`) rehace la copia, igual que el escritorio. Un caso avanzado con referencias recibe 400 `shared_library.advanced_unsupported`.
- **Rutas web** (una para los dos tipos):
  - `GET /api/library?projectId&kind`, `GET /api/library/:id`, `POST /api/library` y `PUT /api/library/:id` (con `revision`, 409 si cambió);
  - `GET /api/library/:id/impact`, `GET /api/library/:id/versions`, `POST /api/library/:id/status`, `DELETE /api/library/:id` (409 `shared_library.in_use` si se usa) y `POST /api/library/preview`;
  - `GET /api/test-cases/:id/library-status`.

  Un cambio de contenido reescribe en la misma transacción los casos que siguen el elemento. Cada caso pasa por el guardado normal (`afterSave`, revisión del caso) y su evento de auditoría lleva `summary.cause`.
- **Sync:**
  - funcionalidad `shared-steps` en `SERVER_FEATURES`;
  - `shared_step` y `dataset` son `lww`; `shared_step_revision` y `dataset_revision` son `append_only`, con `createdAt`, `createdBy` y `hlc` fuera del contenido;
  - las cuatro van en `PROJECT_CHILDREN`;
  - un cliente sin la funcionalidad no las recibe en el pull, y si las envía recibe 400 `shared_steps_unsupported`;
  - `FEATURE_DATA_KEYS` conserva `data.sharedRefs` y `data.datasetRefs` del caso que guarda un cliente sin la funcionalidad;
  - los payloads se validan con los límites del §1, y el id de una versión tiene que corresponder a su contenido;
  - permiso: `case.edit`.
- **El cliente anuncia `shared-steps`** (`transport.ts`).

## Implementación: interfaz (P3, 2026-11-19)

Hecho en el módulo `src/modules/library` y en el editor de casos. Sigue los bocetos 1 a 6; el 7 (ejecución) es de P4.

- **Sección «Biblioteca»** del proyecto (`/projects/:id/library?tab=steps|datasets&item=<id|new>`), después de «Casos». Cada pestaña lista sus elementos con búsqueda, «Nuevo…» y «Mostrar obsoletos». El elemento abierto también va en la dirección, así que «Abrir en la biblioteca» desde un caso lleva a él.
- **Editores** de un paso compartido (pasos con resultado esperado opcional, subir, bajar y quitar, y los parámetros encontrados con su valor al insertar) y de un dataset (rejilla con flechas e Intro, pegar desde una hoja de cálculo, importar CSV o `.xlsx`, exportar CSV). Los dos tienen las pestañas «Usado en» y «Versiones», y los botones «Marcar obsoleto» o «Reactivar» y «Eliminar», que está desactivado si algún caso lo usa.
- **Aviso de impacto.** Solo se muestra si cambia el contenido canónico (nombre, parámetros o columnas, pasos o filas) y algún caso sigue el elemento. Un cambio de descripción se guarda sin aviso.
- **En el caso** (básico y Outline):
  - «Insertar paso compartido…» elige el paso, sus argumentos y la lista (Pasos o Precondiciones). Añade la llamada y llama a `library_preview` para ver la copia al momento.
  - Cada llamada se ve como un bloque de solo lectura con sus acciones y su estado (`library_case_status`).
  - «Vincular dataset…» enlaza la tabla de ejemplos, que pasa a verse de solo lectura, con «Elegir filas…», «Fijar» o «Seguir», «Desvincular (copiar filas)» y la columna para un parámetro que falta (`columnMap`).
  - Los casos avanzados muestran una nota en lugar de las acciones.
- **Precisiones:**
  - **«Actualizar» y «Restaurar» guardan el caso.** «Actualizar» lo guarda siguiendo la última versión; «Restaurar» lo guarda sin más, porque guardar rehace la copia (P1).
  - **«Fijar en vN» y «Desvincular»** cambian el formulario, y se aplican al guardar.
  - **Los bloques no se mueven** como una unidad: los pasos propios se reordenan entre ellos, y para cambiar el sitio de un bloque se desvincula y se vuelve a insertar.
  - **Reimportar un CSV o un `.xlsx`** sobre un dataset conserva el id de cada columna por su nombre y el de cada fila por su posición, para que los resultados sigan apuntando a la misma fila.
  - **Exportar CSV** usa `;` con la interfaz en español y `,` en inglés, y lleva BOM.
  - **Solo lectura para quien no puede editar casos:** la interfaz no oculta los botones; el núcleo y el servidor rechazan el cambio y se muestra su mensaje.

## Implementación: ejecución y exportes (P4, 2026-11-19)

Sigue el boceto 7 y los §5 y §8. Precisiones, sin cambiar la decisión:

- **Atributos del resultado.** `step_results` no tiene columna JSON y no se añade migración: los datos de cada paso van en el resultado, como un mapa.
  - `attributes.dataset = {id, name, version}` cuando el intento ejecuta la tabla del caso (flujo principal) y la revisión congelada la vincula (`datasetRefs`, entrada `"case"`).
  - `attributes.sharedSteps = {<stepId>: {id, version}}` para cada paso registrado que es copia de una llamada.
  - Los calcula `runs::record_result` desde la revisión congelada (`manual::library_attributes`), y el servidor igual (`runs-targets.ts` `libraryAttributes`). Las claves `dataset` y `sharedSteps` que mande el cliente se descartan. Un reintento con el mismo `attemptId` devuelve el resultado guardado sin recalcular nada.
- **Pantalla del run.** `RunItemRow.dataset` (y el resumen del caso, `TestCaseSummary.dataset`) da «Usuarios válidos v2 · 3 filas». Ambos campos son opcionales y solo aparecen cuando hay dataset. «Añadir casos» muestra «3 filas · Usuarios válidos (v2)».
- **Ejecución.** Cada fila se lista como «Fila n de m», con su primer valor («usuario = luis»). Los pasos de una llamada llevan encima «Paso compartido · nombre · vN», y su nombre también va en la etiqueta accesible del paso. Los valores sustituidos se resaltan (`<mark>`, con «Valor de `<nombre>`» como título).
- **Exportes.**
  - Los comentarios del `.feature` solo los escribe la exportación (`toGherkin(…, {library: true})`). La pestaña Gherkin del editor no los muestra, para que no entren en el texto que se edita.
  - Un caso sin referencias exporta lo mismo que antes (los golden de `ATS_001` a `ATS_005` no cambian). El nuevo `ATS_006` cubre una llamada y un dataset.
  - En B31 del `.xlsx`, la línea «Dataset: nombre (vN)» va al final.
- **Manual:** sección «Biblioteca: pasos compartidos y datasets» en `docs/manual/fuentes/casos.md`. Los pasos con captura de la biblioteca siguen pendientes en `e2e/tours/manifest.ts` hasta que un tour la recorra.
