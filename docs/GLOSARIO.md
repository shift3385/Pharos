# GLOSARIO — Ubiquitous language (spec §15)

One domain concept = one identifier, used identically across every module,
layer and table. No module may introduce synonyms. Register every new
identifier here **before** using it in code.

Code, comments and identifiers are in English; only UI strings live in the i18n
files (`es`/`en`).

## Domain concepts

| Concepto (ES)               | Identifier                                               | Notes                                                                                                                             |
| --------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Proyecto                    | `project` / `project_id`                                 | Carpeta contenedora: 1 plan + sus casos (§5.1). El plan es su definición                                                          |
| Prefijo de ID de caso       | `case_id_prefix`                                         | literal, por proyecto (`ATS_`, `FT`, `TC-`); + `case_id_digits` (relleno)                                                         |
| Espacio de trabajo          | `workspace` / `workspace_id`                             | Multi-user from day 1 (spec §3)                                                                                                   |
| Plan de pruebas             | `test_plan` / `TestPlan`                                 |                                                                                                                                   |
| Caso de prueba              | `test_case` / `TestCase`                                 |                                                                                                                                   |
| Plantilla                   | `template`                                               |                                                                                                                                   |
| Planificador                | `planner`                                                | Local kanban por proyecto (spec §7)                                                                                               |
| Tarjeta del planificador    | `planner_card`                                           | task / defect / test_data; con status, priority, position                                                                         |
| Columna del kanban          | `card_status`                                            | `backlog` / `in_progress` / `in_review` / `done`                                                                                  |
| Tipo de tarjeta             | `card_kind`                                              | `task` / `defect` / `test_data`                                                                                                   |
| Adjunto                     | `attachment`                                             | hoy, blob dentro de la BD cifrada; desde 0.2.0, uso de un blob de `evidence/` (ADR-0014)                                          |
| Título                      | `title`                                                  | Same in plan AND test case — never `name`                                                                                         |
| Versión                     | `version`                                                |                                                                                                                                   |
| Fecha                       | `date`                                                   |                                                                                                                                   |
| Elaborado por / Autor       | `author`                                                 | Always official `first_name` + `last_name` (spec §3)                                                                              |
| Resumen / Introducción      | `summary`                                                |                                                                                                                                   |
| Alcance                     | `scope`                                                  | in / out of scope                                                                                                                 |
| Tipo de prueba              | `test_type`                                              |                                                                                                                                   |
| Nivel de prueba             | `test_level`                                             | unit / integration / system / acceptance                                                                                          |
| Entregable                  | `deliverable`                                            |                                                                                                                                   |
| Riesgo                      | `risk`                                                   |                                                                                                                                   |
| ID de escenario             | `scenario_id`                                            | e.g. `ATS_001`; **inmutable** y nunca reutilizado (ADR-0010); viaja como tag `@ATS_001`                                           |
| Caso de uso mapeado         | `mapped_use_case`                                        |                                                                                                                                   |
| Descripción                 | `description`                                            |                                                                                                                                   |
| Precondiciones              | `preconditions`                                          |                                                                                                                                   |
| Pasos de prueba             | `test_steps`                                             | ordered, reorderable                                                                                                              |
| Resultado esperado          | `expected_result`                                        |                                                                                                                                   |
| Postcondiciones             | `postconditions`                                         |                                                                                                                                   |
| Criterios de aceptación     | `acceptance_criteria`                                    |                                                                                                                                   |
| Datos de prueba             | `test_data`                                              |                                                                                                                                   |
| Notas                       | `notes`                                                  |                                                                                                                                   |
| Prioridad                   | `priority`                                               | ISTQB CTFL 5.1.5                                                                                                                  |
| Trazabilidad (texto libre)  | `traceability`                                           | Free-text "other references" of a case (campo original de los casos); los vínculos estructurados van en `requirement_keys`        |
| Estado (del caso)           | `status`                                                 | draft / reviewed / approved / obsolete                                                                                            |
| Requisito                   | `requirement` / `Requirement`                            | Elemento de la base de pruebas (ISTQB 1.4.4), por proyecto (0.1.0, TRZ-01)                                                        |
| Clave de requisito          | `requirement_key`                                        | `REQ-001` autonumerada por proyecto; **inmutable** y nunca reutilizada; viaja como tag `@REQ-001`                                 |
| Requisitos vinculados       | `requirement_keys`                                       | Lista de `requirement_key` en `data` del caso de prueba (vínculo requisito ↔ caso)                                                |
| Clave de tarjeta            | `card_key`                                               | `DEF-001`: ID visible de una tarjeta `defect`, numerado por proyecto y nunca reutilizado; en 0.2.0 pasa a `defect_key` (ADR-0016) |
| Contador de claves          | `key_counters` / `KeyKind`                               | Siguiente número por proyecto y tipo (`case`/`requirement`/`defect`); solo avanza: la clave identifica, no cuenta                 |
| Bloque de claves            | `key_blocks` / `KeyBlock` / `block_end`                  | Rango de 50 números que el servidor entrega a un equipo por proyecto y tipo (`POST /sync/key-blocks`); nunca se repite (DAT-01) |
| Clave provisional           | `<prefijo>?XXXX` / `is_provisional`                      | `ATS_?KQZD`: clave creada sin conexión y sin bloque; nunca va como tag y recibe la definitiva en el siguiente sync (ADR-0010)   |
| Conflicto de clave          | `key_conflicts` / `KeyConflict` / `keyConflicts`         | Fila que perdió su clave porque otro documento del proyecto la tiene; lleva una provisional hasta que la persona elige otra     |
| Bloque de claves            | `block_end`                                              | Último número del bloque reservado en el servidor para un equipo (ADR-0010, fase 2 de A2)                                         |
| Casos vinculados (defecto)  | `test_case_ids`                                          | Ids de los casos a los que se vincula un defecto (en `data` de la tarjeta)                                                        |
| Matriz de trazabilidad      | `traceability_matrix`                                    | Requisito ↔ caso ↔ defecto; módulo `traceability`                                                                                 |
| Cobertura                   | `coverage`                                               | `covered` / `not_covered` (un caso `obsolete` no cubre)                                                                           |
| Hueco de cobertura          | `coverage_gap`                                           | requisito sin caso, caso sin requisito, clave desconocida, defecto sin caso                                                       |
| Estado de ejecución         | `execution_status`                                       | `passed` / `failed` / `blocked` / `not_run` (hasta 0.2.0: siempre `not_run`; luego, del último Result)                            |
| Etiqueta Gherkin            | `tag`                                                    | `@TC-001`; `feature_tags` / `scenario_tags` = tags propios del usuario                                                            |
| Procedencia IA              | `ai_provenance`                                          | `{ provider, model, generated_at, reviewed_by?, reviewed_at? }` por campo                                                         |
| Proveedor IA                | `provider`                                               | Online: `gemini` / `openai` / `anthropic` / `openrouter` / `custom` (compatible con OpenAI); offline: `ollama`                    |
| Proveedor online activo     | `online_provider` / `onlineProvider`                     | El proveedor online elegido; solo uno a la vez (IA-08)                                                                            |
| Modelos por proveedor       | `online_models` / `onlineModels`                         | Modelo elegido para cada proveedor online, para conservarlo al cambiar de proveedor                                               |
| URL base personalizada      | `base_url` / `customBaseUrl`                             | Endpoint compatible con OpenAI del proveedor `custom`; https, o http solo en localhost                                            |
| IA pendiente de revisión    | `ai_pending`                                             | Listado de casos: algún contenido IA del caso aún sin revisar                                                                     |
| Salida estructurada IA      | `aiJson` / `AiOutputError`                              | Respuesta JSON validada con zod antes de usarla; inválida = se rechaza entera (ADR-0023)                                          |
| Propuesta de escenario      | `ScenarioProposal` / `GeneratedCase`                    | Caso propuesto por la IA desde un requisito: `given` / `when` / `then` → precondiciones / pasos / resultado (IA-05)             |
| Rechazo de la IA            | `refusal`                                               | La IA no propone nada: prosa sin JSON o lista vacía con `reason`                                                                  |
| Perfil                      | `profile`                                                |                                                                                                                                   |
| Alias / nombre para mostrar | `display_name`                                           | UI only, never in official documents                                                                                              |
| Nombre oficial              | `first_name`, `last_name`                                | Mandatory (spec §3)                                                                                                               |
| Idioma                      | `language`                                               | `es` (default) / `en`                                                                                                             |
| Tema                        | `theme`                                                  | `light` / `dark` — "Faro Nocturno"                                                                                                |
| Usuario                     | `user` / `User`                                          | auth (spec §4)                                                                                                                    |
| Espacio de trabajo          | `workspace` / `Workspace`                                | contenedor multi-usuario (§3)                                                                                                     |
| Perfil                      | `profile` / `Profile`                                    | alias + nombre oficial (§3)                                                                                                       |
| Revisión (snapshot)         | `test_plan_revision`                                     | historial de versiones del plan                                                                                                   |
| Revisión de caso (snapshot) | `test_case_revision`                                     | historial de versiones del caso                                                                                                   |
| Gherkin / .feature          | `gherkin` / `feature`                                    | Feature/Scenario/Given/When/Then; export `${scenario_id}.feature`                                                                 |
| Nivel de Gherkin            | `gherkin_level`                                          | `basic` / `outline` / `advanced` — elegido al crear el caso (enmienda §5.3)                                                       |
| Escenario parametrizado     | `scenario_outline`                                       | `Scenario Outline` + `examples` (nivel outline)                                                                                   |
| Tabla de datos              | `examples`                                               | `{ headers[], rows[][] }`; cada columna es un `<placeholder>`                                                                     |
| Contexto común              | `background`                                             | nivel advanced (varios escenarios por Feature)                                                                                    |
| Regla de negocio            | `rule`                                                   | `Rule:` agrupa escenarios; nivel advanced                                                                                         |
| Feature crudo               | `feature_source`                                         | texto Gherkin autoritativo cuando `gherkin_level = advanced`                                                                      |
| Cronograma                  | `schedule`                                               | sprints + hitos                                                                                                                   |
| Sprint                      | `sprint`                                                 | `{ name, start, end }`                                                                                                            |
| Hito                        | `milestone`                                              | `{ name, date }`                                                                                                                  |
| Riesgo / Mitigación         | `risk` / `mitigation`                                    |                                                                                                                                   |
| Correo electrónico          | `email`                                                  | almacenado en minúsculas, único                                                                                                   |
| Hash de contraseña          | `password_hash`                                          | Argon2id                                                                                                                          |
| Rol                         | `role`                                                   | `test_manager`, `tester`, … (§3)                                                                                                  |
| Token de acceso             | `access_token`                                           | JWT (HS256), corto                                                                                                                |
| Token de refresco           | `refresh_token`                                          | opaco; hash SHA-256 en BD, con rotación                                                                                           |
| Sesión                      | `session`                                                | `{ accessToken, refreshToken, user }`                                                                                             |
| Usuario actual              | `user_id` / `userId`                                     | Usuario con sesión que hace el cambio: va a `created_by`/`updated_by` y se compara con el dueño (FIX-06/08)                       |
| Dueño                       | `owner_id` / `ownerId`                                   | Usuario dueño de un proyecto o tarjeta; casos, planes y requisitos heredan el dueño de su proyecto                                |
| Copia previa a migrar       | `pharos.db.enc.bak-<versión>-<migración>`                | Archivo cifrado tal cual estaba antes de migrar (SEC-06); se guardan las 3 más recientes                                          |
| BD de versión más nueva     | `db-newer-than-app` / `dbError`                          | Error al abrir una base con migraciones desconocidas; la UI muestra `dbError.*` y no la toca (SEC-06)                             |
| Journal de cambios          | `oplog`                                                  | un delta por mutación local; `synced_at` NULL = pendiente (§9)                                                                    |
| Delta                       | `delta` / `Delta`                                        | estado completo de una entidad (o tombstone) que se envía en el push                                                              |
| Lápida                      | `tombstone` / `deleted`                                  | documento del servidor que marca una entidad borrada; se conserva siempre para que un registro purgado no resucite (SYNC-06)   |
| Purga                       | `purge` / `purge_deleted` / `PurgeSummary`               | borrado definitivo en el escritorio de lo borrado hace más de `retentionDays` días; espera a que el servidor tenga el borrado (SYNC-06) |
| Clave retirada              | `retired_keys`                                           | clave de un caso, requisito o defecto purgado; sigue contando como usada (ADR-0010, SYNC-06)                                    |
| Compactar lápidas           | `compactTombstones` / `SYNC_TOMBSTONE_DAYS`              | el servidor vacía el `payload` de las lápidas con más de N días; la lápida queda (SYNC-06)                                      |
| Reloj lógico híbrido (HLC)  | `hlc`                                                    | `<wall_ms:15>-<counter:5>-<device_id>`; orden de texto = orden del reloj (SYNC-01)                                                |
| Dispositivo                 | `device_id` / `deviceId`                                 | id de la instalación (o del navegador); desempate final del HLC                                                                   |
| Revisión base               | `base_revision` / `baseRevision`, `base_hlc` / `baseHlc` | versión sobre la que se hizo el cambio local; el servidor la compara para detectar conflictos                                     |
| Base de sincronización      | `sync_base`                                              | última versión de cada entidad que coincide con el servidor                                                                       |
| Conflicto de sincronización | `sync_conflict` / `SyncConflict`                         | cambio local pendiente y cambio remoto divergentes desde la misma base (8C)                                                       |
| Resolución                  | `resolution`                                             | `local` (conservar la mía) / `remote` (usar la del servidor); SYNC-02 podrá añadir `merged`                                       |
| Entidades sincronizadas     | `SYNCED` / `SYNCED_ENTITIES`                             | project, test_plan, test_case, requirement, planner_card; lo único que cuenta como pendiente (FIX-01)                             |
| Usuario del cambio          | `user_id` (oplog, sync_base, sync_conflicts)             | dueño de la entidad; `''` = sin dueño, nunca se envía (FIX-07, ADR-0020)                                                          |
| Cursor de pull              | `cursor:<user_id>` / `pharos.sync.cursor:<userId>`       | último `seq` recibido, por cuenta; el pull pide páginas hasta `hasMore = false` (FIX-02)                                          |
| Lote de push                | `batch`                                                  | hasta 200 deltas y ~512 KiB por petición; el servidor acepta 500 (FIX-03)                                                         |
| Bandeja de salida (web)     | `outbox` / `pharos.sync.outbox:<userId>`                 | cambios web pendientes de enviar; se reintentan hasta que el servidor los acepta (FIX-04)                                         |
| Conflicto web               | `WebConflict` / `pharos.sync.conflicts:<userId>`         | edición web que perdió LWW; se conserva junto a la del servidor hasta que se resuelve (FIX-04)                                    |
| Versión del cliente         | `x-pharos-version` / `APP_VERSION`                       | versión de la app en cada petición de sync; 426 `unsupported_client_version` si no se admite (SYNC-08)                            |
| Capacidades de sync         | `x-pharos-sync-features`                                 | lo que entiende el cliente; `key-conflicts`: lee `keyConflicts` del push. Sin ella, un choque de clave da 426 (DAT-01)             |
| Cambio sin dueño            | `orphans`                                                | cambio pendiente cuyo dueño aún no se puede derivar (p. ej. su proyecto no ha llegado); se reclama al derivarse (ADR-0020)        |
| Delta rechazado             | `skipped` / `refused`                                    | delta que el servidor rechaza por su contenido (413, 400); se aísla, queda pendiente y se avisa (`pharos:sync-skipped`)           |
| Dueño de la caché web       | `pharos.sync.cacheOwner`                                 | cuenta cuyos datos guarda la caché del navegador; se vacía al cerrar sesión (`pharos:signed-out`) o al cambiar de cuenta          |

## Execution model identifiers (gate C, ADR-0011…0019)

**Aceptados** el 2026-10-28 junto con los ADR de la compuerta C. Son los nombres
obligatorios para el código de 0.2.0 en adelante; ninguno está implementado
todavía. Cuando se implementen, cada fila puede pasar a la tabla de arriba. Diseño de conjunto: `docs/design/0.2.0-modelo-ejecucion.md`.

| Concepto (ES)                | Identifier                                                             | Notes                                                                                                                                                      | ADR  |
| ---------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Paso (con identidad)         | `step` / `Step`, `step_id`                                             | `{ id, text }` en `data.steps`, `background`, `flows[].steps`; id corto, estable, nunca reutilizado                                                        | 0011 |
| Fila de ejemplo              | `example_row` / `ExampleRow`, `example_row_id`, `example_values`       | `{ id, values }`; en un resultado: `example_row_id` (resuelto contra la revisión ejecutada), `n` de `<scenario_id>[n]` para mostrar y copia de los valores | 0011 |
| Revisión de caso (inmutable) | `test_case_revision_id`, `content_sha256`                              | Una fila por guardado, incluida la vigente; id = UUIDv5(caso, revisión, hash)                                                                              | 0011 |
| Clase de sync                | `sync_class`                                                           | `lww` / `append_only` / `local`                                                                                                                            | 0011 |
| Ejecución                    | `run` / `Run`, `run_key`                                               | `RUN-001`; sobre común de todos los tipos de resultado, con su contexto                                                                                    | 0013 |
| Disparador                   | `trigger`                                                              | `manual` / `local` / `agent` / `ci` / `cloud` / `import`                                                                                                   | 0013 |
| Herramienta de origen        | `source_tool`, `source_tool_version`                                   | `playwright`, `cucumber-js`, `pharos`…                                                                                                                     | 0013 |
| Formato de origen            | `source_format`                                                        | `cucumber_messages` / `ctrf` / `junit` / `playwright_json` / `pharos_run_json` / `sarif` / `k6` / `axe`                                                    | 0013 |
| Entorno / build / dataset    | `environment`, `build`, `commit_sha`, `dataset`                        | Texto en el Run; el resto del contexto en `context` (JSON)                                                                                                 | 0013 |
| Shard                        | `run_shard`, `shard_index`, `shard_total`                              | Una subida o trozo de un Run; `source_file_sha256` da la idempotencia                                                                                      | 0013 |
| Elemento del run             | `run_item`                                                             | Caso + revisión congelada + fila + configuración + asignado: el alcance previsto                                                                           | 0013 |
| Resultado                    | `result` / `Result`, `result_status`                                   | Un intento, inmutable: `passed` / `failed` / `blocked` / `skipped` / `other` (+ `raw_status`)                                                              | 0013 |
| Intento                      | `attempt`                                                              | 0-based, solo para mostrar; el final es el último por tiempo, `attempt` y `hlc` (derivado)                                                                 | 0013 |
| Flaky                        | `flaky`                                                                | Derivado: el final pasó y algún intento previo falló (CTRF). Si la herramienta solo envía el final, `attributes.flaky`                                     | 0013 |
| Clave del caso en un informe | `case_key`                                                             | `<scenario_id>` (p. ej. `ATS_002`) tal como llega en el tag                                                                                                | 0013 |
| Identidad del test           | `test_key`                                                             | Siempre presente. Importado: ruta normalizada + nombre + fila; manual: `manual:<caso>/<flujo>/<fila>`. Sustituye a `unlinked_key`                          | 0013 |
| Regla de enlace              | `unlinked_mapping`                                                     | `test_key → test_case_id`; id = UUIDv5(proyecto, `test_key`); enlaza sin modificar resultados                                                              | 0013 |
| Flujo ejecutado              | `flow_id`                                                              | `Flow.id` de un caso avanzado en un resultado, elemento de run o de ciclo                                                                                  | 0011 |
| Resultado de paso            | `step_result`                                                          | Estado y `actual` por paso; viaja dentro del documento de su resultado                                                                                     | 0013 |
| Borrador de ejecución        | `execution_draft`                                                      | Estado local de un intento manual abierto; no se sincroniza                                                                                                | 0013 |
| Riesgo del requisito         | `risk_likelihood`, `risk_impact`, `risk_level`                         | ISTQB: probabilidad × impacto; `risk_level` derivado                                                                                                       | 0013 |
| Hallazgo                     | `finding` / `Finding`, `rule_id`, `fingerprint`                        | Regla incumplida en una ubicación (SARIF, axe); inmutable                                                                                                  | 0012 |
| Severidad                    | `severity`                                                             | Hallazgo: `critical` / `high` / `medium` / `low` / `info`; defecto: `critical` / `major` / `minor` / `trivial`                                             | 0012 |
| Referencia normativa         | `standard_refs`                                                        | `WCAG2.2:1.4.3`, `ASVS5:V2.1.1`, `MASVS2:STORAGE-1`                                                                                                        | 0012 |
| Triaje de hallazgo           | `finding_triage`                                                       | `open` / `false_positive` / `accepted_risk` / `fixed`, por `fingerprint`                                                                                   | 0012 |
| Métrica                      | `metric` / `Metric`, `threshold`                                       | Valor medido (k6, mutación, LLM); `passed` NULL sin umbral                                                                                                 | 0012 |
| Sesión exploratoria          | `exploratory_session`, `session_note`, `charter`                       | Extensión 1:1 de un Run. **No** `session` (ya es la sesión de autenticación)                                                                               | 0012 |
| Pharos Run JSON              | `pharos_run_json`                                                      | Formato normalizado de importación/exportación, superconjunto de CTRF, con `schemaVersion`                                                                 | 0012 |
| Contenido de evidencia       | `blob`, `sha256`                                                       | Archivo `.pev` cifrado en `evidence/`, nombrado por HMAC del sha256                                                                                        | 0014 |
| Adjunto (nuevo modelo)       | `attachment`, `owner_entity`, `owner_id`, `blob_purged_at`             | Uso de un blob por una entidad; `blob_purged_at` = contenido caducado por la retención, metadato conservado                                                | 0014 |
| Registro de auditoría        | `audit_log` / `audit_event`, `action`, `changes`, `chain_workspace_id` | Append-only; `changes = { campo: [antes, después] }`; cadena `prev_hash` / `hash` por `(device_id, chain_workspace_id)`                                    | 0015 |
| Actor                        | `actor`, `on_behalf_of`                                                | `user:<uuid>` / `agent:<client_id>` / `system:<componente>` / `ci:<token_id>`                                                                              | 0015 |
| Defecto                      | `defect` / `Defect`, `defect_key`                                      | `DEF-001` (continúa la serie de `card_key`); estados `new` … `closed`, `resolution`                                                                        | 0016 |
| Vínculo de defecto           | `defect_link`, `target_kind`                                           | `result` / `test_case` / `requirement` / `finding` / `session_note`                                                                                        | 0016 |
| Clave externa                | `external_system`, `external_key`, `external_url`                      | Jira u otro gestor (INT-05)                                                                                                                                | 0016 |
| Configuración                | `configuration`, `match_labels`                                        | Navegador × SO × dispositivo por proyecto; `configuration_label` = texto que trae el informe                                                               | 0017 |
| Ciclo de pruebas             | `test_cycle`, `cycle_key`, `test_cycle_item`                           | `CYC-001`; qué, dónde, contra qué build y cuándo                                                                                                           | 0017 |
| Campo personalizado          | `custom_field`, `field_key`, `field_type`                              | Definición por proyecto y entidad; valores en `data.custom`                                                                                                | 0018 |
| Tipo de caso                 | `case_type`                                                            | `standard` / `checklist`                                                                                                                                   | 0018 |
| Estado de automatización     | `automation_status`                                                    | `manual` / `to_automate` / `automated`                                                                                                                     | 0018 |
| Tipo de workspace            | `workspace_kind`                                                       | `local` / `personal` / `shared`; columna `workspaces.kind` (como `card_kind`)                                                                              | 0019 |
| Miembro / rol de workspace   | `workspace_member`, `workspace_role`                                   | `test_manager` / `test_analyst` / `automation_engineer` / `product_owner` / `viewer`                                                                       | 0019 |
| Invitación                   | `workspace_invitation`                                                 | Enlace o código de un solo uso (hash en BD)                                                                                                                | 0019 |

> API JSON usa camelCase (`accessToken`, `displayName`); las columnas de BD usan snake_case (`access_token`, `display_name`). Mismo concepto, misma raíz.

## Observability and testing (BASE-08, BASE-13, BASE-14 — ADR-0022)

| Concepto (ES)              | Identifier                               | Notes                                                                                  |
| -------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Versión de la app          | `APP_VERSION`                            | `@shared/version`; leída del `package.json` raíz, la única fuente de versión           |
| Paquete de diagnóstico     | `DiagnosticBundle` / `diagnostic bundle` | `.zip` con `diagnostic.json` + `logs/`; nunca datos de usuario, claves ni tokens       |
| Exportar diagnóstico       | `diag_export` / `exportDiagnostics`      | comando Tauri que arma el paquete / acción del frontend que lo descarga                |
| Registrar error de cliente | `diag_log` / `logClientError`            | lleva un error del frontend, redactado, al log del escritorio                          |
| Redacción                  | `redact`                                 | enmascara correos, tokens, claves, secretos y el usuario de Windows en rutas           |
| Filtro de logs             | `PHAROS_LOG`                             | directiva `EnvFilter` (p. ej. `debug`, `pharos_lib=debug`); por defecto `info`         |
| Perfil E2E                 | `PHAROS_E2E_PROFILE`                     | solo debug: datos, logs y sesión del keychain aislados por ejecución del smoke         |
| Cuenta del keychain        | `instance::account(base)`                | toda cuenta pasa por aquí: `base` o `<base>-e2e-<perfil>` (sesión, claves de IA)       |
| Clave de la BD local       | `db-key` / `KeyStore` / `Keychain`       | 32 bytes en el keychain, compartida por todas las instancias; `KeyStore` en tests      |
| Clave de recuperación      | `recovery key` / `recovery::encode`      | la `db-key` + comprobación, 56 caracteres base32 en 14 grupos de 4 (ADR-0024, SEC-03)  |
| Recuperar la BD            | `db_recover` / `recoverDb`               | abre la BD con la clave de recuperación y la vuelve a guardar en el keychain           |
| Clave reemplazada          | `db-key.prev`                            | la clave que sustituyó la última recuperación, guardada una vez en el keychain         |
| Exportar clave             | `recovery_key_export` / `recoveryKeyApi` | muestra la clave una vez en Perfil, tras confirmar; nunca a logs ni sync               |
| Errores de clave           | `db-key-missing` / `db-key-mismatch`     | la BD no abrió por la clave: falta en el keychain / no la descifra                     |
| Errores de recuperación    | `recovery-key-invalid` / `-wrong`        | errata (falla la comprobación) / clave válida que no abre esta BD o archivo dañado     |
| Error al abrir la BD       | `openError`                              | en `diagnostic.json` cuando la base local no abrió; redactado, sin migraciones         |
| Log de panics              | `pharos.panic.log`                       | se escribe de forma síncrona en cada panic; viaja en el paquete de diagnóstico         |
| Proyecto de prueba E2E     | `TEST_PROJECT_PREFIX` (`E2E `)           | los specs borran al final todo proyecto con este prefijo en la cuenta de test          |
| Límite de error            | `ErrorBoundary` / `ErrorFallback`        | captura errores de render y muestra reintentar, recargar y "Exportar diagnóstico"      |
| Smoke E2E                  | `smoke` (`e2e/specs/smoke.e2e.ts`)       | arrancar → login → crear proyecto → reabrir, con el binario real (WDIO + tauri-driver) |

## Audit fields (every business entity — spec §3)

`workspace_id`, `created_by`, `updated_by`, `created_at`, `updated_at`,
`deleted_at` (soft delete), `revision` (sync).

## Module identifiers (spec §2)

Folder names in English, kebab-case: `projects`, `test-plan`, `test-cases`,
`planner`, `templates`, `integrations`, `ai`, `sync-offline`, `admin`, `auth`,
`traceability` (0.1.0).

## Design token naming (spec §12.1)

`--color-*` (colors), `--font-*` / `--fs-*` / `--fw-*` (typography),
`--space-*` (spacing), `--radius-*` (radii), `--shadow-*` (elevation).
Only `src/shared/theme/tokens.css` declares raw color values.
