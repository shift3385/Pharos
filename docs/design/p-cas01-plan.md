# Pista P · 0.6.0 · CAS-01 (pasos compartidos, parámetros y datasets) · plan PROPUESTO (2026-11-19)

Estado: **propuesto**, pendiente de la aprobación del usuario y de las cinco preguntas del §7.
Bocetos: https://claude.ai/artifact/4r43GgYrREyp8cuGuB63sT (fuente: `p-cas01-bocetos.html` en esta carpeta).
ADR: [ADR-0055](../adr/0055-pasos-compartidos-parametros-y-datasets.md) (propuesto).
Criterio de ROADMAP: «Cambiar un paso compartido actualiza N casos; un dataset de 3 filas da 3 resultados».

## 0. Lo que encontré en `main` (y decide el diseño)

- **Las filas ya expanden resultados.** Un caso `outline` con 3 filas en `data.examples` da 3 objetivos (`manual::targets_of`), 3 `test_key`, 3 resultados con `example_row_id`, y la matriz y el ciclo cuentan por fila. Falta **compartir** la tabla, no inventar la expansión.
- **`<placeholder>` ya es la sintaxis de parámetros.** `placeholdersIn` la detecta, el editor añade columnas solo y `execution.ts` `fill` la sustituye al ejecutar.
- **Los pasos son JSON dentro del caso** (`Step {id, text, expected?}`, id estable, ADR-0011). La revisión del caso es inmutable y es lo que congelan los runs y las baselines.
- **Las reglas viven en dos núcleos:** Rust (`src-tauri/src`, el crate `pharos-core` comparte esas fuentes) y el servidor para la web (`server/src/modules/domain`), con vectores comunes.
- **El servidor guarda documentos genéricos:** una entidad nueva no necesita migración del servidor (baselines y hallazgos lo hicieron así).
- **La regla «editar un aprobado lo lleva a En revisión»** está en `case_review::after_save_with` (Rust) y `case-review.ts` `afterSave` (servidor). Nota: el comentario de `test_case.rs:426-427` todavía dice «back to draft»; lo corrijo en P1.
- **Hueco ajeno, anotado para el coordinador:** `roles.ts` `capabilityFor` del servidor no tiene `case_baseline` (cae en `members.manage`) mientras Rust da `case.edit`.

## 1. Diseño en una línea

Biblioteca por proyecto (`shared_step`, `dataset`, con versiones `append_only`). El caso guarda la referencia **y una copia materializada** con ids deterministas. Cambiar la biblioteca reescribe los casos que la siguen (regla de ADR-0049). Ejecución, baselines, matriz, exportes, importes y fusión siguen leyendo la revisión del caso como hoy. Detalle en el ADR-0055.

## 2. PRs

Cada PR lleva sus docs (ADR, ROADMAP, GLOSARIO, manual, `changes/CAS-01-*.md`) y sus pruebas. Los PRs P1 a P3 van en serie; P4 empieza cuando P1 está en `main`.

| PR | Contenido | Archivos principales |
| --- | --- | --- |
| **P0 · docs** (este) | ADR-0055 propuesto, este plan, bocetos, reserva de la migración local 0049, ROADMAP (CAS-01 en curso) y GLOSARIO | `docs/adr/0055-*`, `docs/adr/README.md`, `docs/design/p-cas01-*`, `docs/ROADMAP.md`, `docs/GLOSARIO.md`, `scripts/migration-registry.json` |
| **P1 · núcleo** | Migración 0049. `shared_library.rs` (entidades, revisiones, validación y límites, parámetros, materializar, propagar, reconciliar, integridad). Llamada a `case_review` en la propagación. Comandos Tauri `shared_step_*` y `dataset_*`. Contratos `ts-rs`. Vectores `shared-steps-vectors.json`. Registro en sync (`oplog::SYNCED`, `sync_class`, `read_payload`/`apply_doc`, papelera, purga, `restore_project_children`, `workspaces.rs`), retenidas hasta ver `shared-steps`. Entradas de `merge-fields.json` y la regla «derivado» en `sync_merge.rs` y `merge.ts`, con vectores. Prueba de actualización desde 0.5.0 | `src-tauri/migrations/0049_shared_library.sql`, `src-tauri/src/db.rs`, `src-tauri/src/shared_library.rs` (nuevo), `test_case.rs`, `case_review.rs`, `oplog.rs`, `sync_class.rs`, `sync.rs`, `sync_merge.rs`, `trash.rs`, `purge.rs`, `workspaces.rs`, `app.rs`, `src/shared/contracts/{merge-fields.json,generated/*,fixtures/sync/*}`, `src/modules/sync-offline/domain/merge.ts` |
| **P2 · servidor y web API** | Entidades en `sync.schemas.ts` (LWW, append-only, `PROJECT_CHILDREN`, `FEATURE_DATA_KEYS`, payloads zod), funcionalidad `shared-steps` (`sync.version.ts`, filtro de pull, 400 en push), `roles.ts`. Rutas de dominio `/api/shared-steps` y `/api/datasets` (CRUD, impacto, propagación, CSV) con el mismo algoritmo en TS y los vectores de P1. `transport.ts` anuncia la funcionalidad. Pruebas en `pharos_test_db_trackp2` | `server/src/modules/sync/{sync.schemas.ts,sync.version.ts,sync.routes.ts,sync.repository.ts}`, `server/src/modules/domain/{shared-library.ts (nuevo),domain.service.ts,domain.routes.ts}`, `server/src/modules/workspaces/roles.ts`, `src/modules/sync-offline/api/transport.ts` |
| **P3 · interfaz** | Sección «Biblioteca» (pestañas Pasos compartidos y Datasets): lista, ficha, editor de pasos con parámetros, rejilla de dataset (pegar, importar CSV/xlsx, exportar CSV) y «Usado en». En el editor de casos: «Insertar paso compartido», bloque con versión y acciones, argumentos, «Vincular dataset» y diálogo de impacto. Escritorio y web (adaptador `serverApi`). Pruebas de componente y de accesibilidad | `src/modules/library/` (nuevo: `api`, `model`, `ui`), `src/modules/test-cases/ui/{TestCaseEditor.tsx,SortableSteps*,ExamplesTable*}`, `src/modules/test-cases/model/steps.ts`, rutas del proyecto, i18n |
| **P4 · ejecución, exportes, manual** | `ExecutionPanel`: bloques y valores resaltados, «Fila n de m · columna = valor». `attributes.dataset` y `sharedStep` en el resultado manual (Rust y servidor). Diálogo «Añadir al run» con el número de filas. PDF, `.feature` y xlsx con goldens. Capítulo del manual y tour en el puerto 3130 | `src/modules/runs/{ui/ExecutionPanel.tsx,model/execution.ts}`, `src-tauri/src/runs.rs` (solo `attributes`), `server/src/modules/domain/runs.ts`, `src/modules/test-cases/export/*`, `docs/manual/*`, `e2e/` |
| **P5 · opcional, tras la pista F** | Fila explícita en JUnit, CTRF y Playwright, con `NORMALIZER_VERSION` (pregunta 3) | `packages/formats/src/importers/*` |

**Cruces con otras pistas:**
- P1 toca `sync.rs` y los motores de fusión, que eran de S (ya hecha).
- P2 toca `sync.schemas.ts` y el dominio del servidor, igual que A (webhooks); lo hablo con A antes de abrir el PR, y si A emite eventos de caso, la propagación tiene que emitir uno por caso.
- P4 toca los exportes de casos, que no son de F (F son los parsers).
- P5 espera a F.

## 3. Pruebas

- **Rust:**
  - materializar, propagar y reconciliar contra los vectores;
  - propagación con casos en los cuatro estados, y la regla de revisión;
  - id de paso y de fila estables entre versiones;
  - integridad y «Restaurar»;
  - borrar con casos en uso;
  - sync: ida y vuelta de las cuatro entidades, retención sin la funcionalidad, `FEATURE_DATA_KEYS`, la fusión «derivado» y la cascada con lápidas;
  - actualización desde el fixture 0.5.0;
  - un dataset de 3 filas da 3 objetivos y 3 resultados.
  - Todo con el cerrojo de cargo.
- **Servidor:**
  - los mismos vectores;
  - puerta de pull y push;
  - roles (un Viewer recibe `forbidden`);
  - propagación por la web.
  - En `pharos_test_db_trackp2`.
- **Vitest:** editor (insertar, argumentos, desvincular, impacto), rejilla (pegar, CSV), ejecución con filas, goldens de exportes y axe.
- **Tour (puerto 3130):**
  1. crear «Iniciar sesión» con `<usuario>` y `<clave>`;
  2. insertarlo en 3 casos;
  3. vincular un dataset de 3 filas;
  4. cambiar el paso compartido y comprobar que los 3 casos suben de revisión;
  5. ejecutar y ver 3 resultados en la matriz.

## 4. Compatibilidad de datos (VERSIONING §6)

- **§6.1 Migraciones:**
  - local **0049**, aditiva (cuatro tablas, índices y el trigger de inmutabilidad de las revisiones), reservada en `scripts/migration-registry.json`. Si otra pista fusiona antes una local, retiro la 0049 y tomo la siguiente por encima de la más alta (`inOrder`);
  - servidor: ninguna (documentos genéricos), así que no reservo número de servidor.
- **§6.2 Actualización:** prueba desde el fixture 0.5.0. Abre sin pérdida, ningún caso cambia de contenido ni de hash, y la biblioteca está vacía.
- **§6.3/6.4:** la copia previa y la negativa de una versión antigua ya cubren la 0049; una 0.5 se niega a abrir una base con la 0049.
- **§6.5 Sync:**
  - funcionalidad nueva `shared-steps`: sin ella el cliente no envía la biblioteca, el servidor no se la da en el pull, y un push con biblioteca recibe 400 `shared_steps_unsupported`;
  - `FEATURE_DATA_KEYS` protege `data.sharedRefs` y `data.datasetRefs` del caso frente a clientes sin la funcionalidad;
  - `APPLIED_SET_VERSION` pasa de 11 a 12 y el cursor vuelve a 0 una vez;
  - no cambia la forma de ninguna entidad existente: las claves nuevas del caso son opcionales y los lectores toleran su ausencia;
  - `attributes.dataset` y `sharedStep` van dentro de un JSON que ambos lados guardan tal cual, así que no necesitan puerta;
  - un cliente 0.5 que aún pueda enviar ve las copias como pasos normales, y lo que toque se detecta como «Modificado fuera de la biblioteca».
- **§6.6 Formatos:** el `.feature` añade comentarios, el xlsx una línea en B31 y el PDF etiquetas. Ninguno cambia de forma. Pharos Run JSON no cambia (P5 solo cambiaría lo que producen los parsers, con `NORMALIZER_VERSION`). Nota en el CHANGELOG.
- **§6.7:** sin cambio.

## 5. Migraciones reservadas

- Local `0049`: «0.6.0 track P (CAS-01): shared_steps, shared_step_revisions, datasets, dataset_revisions».
- Servidor: ninguna.

## 6. Disco, puertos y bases

- `CARGO_TARGET_DIR=D:/MI_AREA_DE_QA/pharos_target` con `CARGO_INCREMENTAL=0`, dentro del cerrojo `.cargo-lock`. Los tours usan `pharos_target/tours`.
- Base de datos del servidor: `pharos_test_db_trackp2`. API y tours en el puerto 3130.
- Nunca se para un `pharos.exe` que no haya lanzado la pista.

## 7. Preguntas para el usuario (con recomendación)

1. **Casos aprobados al cambiar un paso compartido o un dataset.**
   - **A (rec.):** se actualizan y vuelven a En revisión (ADR-0049), con aviso de impacto antes de guardar; el caso que no deba moverse se fija en su versión.
   - **B:** los aprobados esperan a un «Actualizar».
   - **C:** aprobación propia del paso compartido.
2. **Casos avanzados (varios flujos).**
   - **Rec.:** fuera de 0.6.0, con RUN-02 en 0.7.0.
   - **Alt.:** datasets por flujo ya en 0.6.0.
3. **Fila explícita en JUnit, CTRF y Playwright.** **Rec.:** sí, como P5, después de la pista F.
4. **Límites:** 50 pasos y 20 parámetros por paso compartido; 30 columnas, 500 filas y 4 KB por celda en un dataset. **Rec.:** estos.
5. **Dónde vive la biblioteca.**
   - **Rec.:** sección del proyecto «Biblioteca», con pestañas «Pasos compartidos» y «Datasets».
   - **Alt.:** dentro de «Casos».
