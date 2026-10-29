# GLOSARIO — Ubiquitous language (spec §15)

One domain concept = one identifier, used identically across every module,
layer and table. No module may introduce synonyms. Register every new
identifier here **before** using it in code.

Code, comments and identifiers are in English; only UI strings live in the i18n
files (`es`/`en`).

## Domain concepts

| Concepto (ES)               | Identifier                                               | Notes                                                                                                                      |
| --------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Proyecto                    | `project` / `project_id`                                 | Carpeta contenedora: 1 plan + sus casos (§5.1). El plan es su definición                                                   |
| Prefijo de ID de caso       | `case_id_prefix`                                         | literal, por proyecto (`ATS_`, `FT`, `TC-`); + `case_id_digits` (relleno)                                                  |
| Espacio de trabajo          | `workspace` / `workspace_id`                             | Multi-user from day 1 (spec §3)                                                                                            |
| Plan de pruebas             | `test_plan` / `TestPlan`                                 |                                                                                                                            |
| Caso de prueba              | `test_case` / `TestCase`                                 |                                                                                                                            |
| Plantilla                   | `template`                                               |                                                                                                                            |
| Planificador                | `planner`                                                | Local kanban por proyecto (spec §7)                                                                                        |
| Tarjeta del planificador    | `planner_card`                                           | task / defect / test_data; con status, priority, position                                                                  |
| Columna del kanban          | `card_status`                                            | `backlog` / `in_progress` / `in_review` / `done`                                                                           |
| Tipo de tarjeta             | `card_kind`                                              | `task` / `defect` / `test_data`                                                                                            |
| Adjunto                     | `attachment`                                             | blob dentro de la BD cifrada (name, mime, bytes)                                                                           |
| Título                      | `title`                                                  | Same in plan AND test case — never `name`                                                                                  |
| Versión                     | `version`                                                |                                                                                                                            |
| Fecha                       | `date`                                                   |                                                                                                                            |
| Elaborado por / Autor       | `author`                                                 | Always official `first_name` + `last_name` (spec §3)                                                                       |
| Resumen / Introducción      | `summary`                                                |                                                                                                                            |
| Alcance                     | `scope`                                                  | in / out of scope                                                                                                          |
| Tipo de prueba              | `test_type`                                              |                                                                                                                            |
| Nivel de prueba             | `test_level`                                             | unit / integration / system / acceptance                                                                                   |
| Entregable                  | `deliverable`                                            |                                                                                                                            |
| Riesgo                      | `risk`                                                   |                                                                                                                            |
| ID de escenario             | `scenario_id`                                            | e.g. `ATS_001`                                                                                                             |
| Caso de uso mapeado         | `mapped_use_case`                                        |                                                                                                                            |
| Descripción                 | `description`                                            |                                                                                                                            |
| Precondiciones              | `preconditions`                                          |                                                                                                                            |
| Pasos de prueba             | `test_steps`                                             | ordered, reorderable                                                                                                       |
| Resultado esperado          | `expected_result`                                        |                                                                                                                            |
| Postcondiciones             | `postconditions`                                         |                                                                                                                            |
| Criterios de aceptación     | `acceptance_criteria`                                    |                                                                                                                            |
| Datos de prueba             | `test_data`                                              |                                                                                                                            |
| Notas                       | `notes`                                                  |                                                                                                                            |
| Prioridad                   | `priority`                                               | ISTQB CTFL 5.1.5                                                                                                           |
| Trazabilidad (texto libre)  | `traceability`                                           | Free-text "other references" of a case (campo original de los casos); los vínculos estructurados van en `requirement_keys` |
| Estado (del caso)           | `status`                                                 | draft / reviewed / approved / obsolete                                                                                     |
| Requisito                   | `requirement` / `Requirement`                            | Elemento de la base de pruebas (ISTQB 1.4.4), por proyecto (0.1.0, TRZ-01)                                                 |
| Clave de requisito          | `requirement_key`                                        | `REQ-001` autonumerada por proyecto; **inmutable** tras crearla; viaja como tag `@REQ-001`                                 |
| Requisitos vinculados       | `requirement_keys`                                       | Lista de `requirement_key` en `data` del caso de prueba (vínculo requisito ↔ caso)                                         |
| Clave de tarjeta            | `card_key`                                               | `DEF-001`: ID visible de una tarjeta `defect`, numerado por proyecto                                                       |
| Casos vinculados (defecto)  | `test_case_ids`                                          | Ids de los casos a los que se vincula un defecto (en `data` de la tarjeta)                                                 |
| Matriz de trazabilidad      | `traceability_matrix`                                    | Requisito ↔ caso ↔ defecto; módulo `traceability`                                                                          |
| Cobertura                   | `coverage`                                               | `covered` / `not_covered` (un caso `obsolete` no cubre)                                                                    |
| Hueco de cobertura          | `coverage_gap`                                           | requisito sin caso, caso sin requisito, clave desconocida, defecto sin caso                                                |
| Estado de ejecución         | `execution_status`                                       | `passed` / `failed` / `blocked` / `not_run` (hasta 0.2.0: siempre `not_run`)                                               |
| Etiqueta Gherkin            | `tag`                                                    | `@TC-001`; `feature_tags` / `scenario_tags` = tags propios del usuario                                                     |
| Procedencia IA              | `ai_provenance`                                          | `{ provider, model, generated_at, reviewed_by?, reviewed_at? }` por campo                                                  |
| Proveedor IA                | `provider`                                               | Online: `gemini` / `openai` / `anthropic` / `openrouter` / `custom` (compatible con OpenAI); offline: `ollama`             |
| Proveedor online activo     | `online_provider` / `onlineProvider`                     | El proveedor online elegido; solo uno a la vez (IA-08)                                                                     |
| Modelos por proveedor       | `online_models` / `onlineModels`                         | Modelo elegido para cada proveedor online, para conservarlo al cambiar de proveedor                                        |
| URL base personalizada      | `base_url` / `customBaseUrl`                             | Endpoint compatible con OpenAI del proveedor `custom`; https, o http solo en localhost                                     |
| IA pendiente de revisión    | `ai_pending`                                             | Listado de casos: algún contenido IA del caso aún sin revisar                                                              |
| Perfil                      | `profile`                                                |                                                                                                                            |
| Alias / nombre para mostrar | `display_name`                                           | UI only, never in official documents                                                                                       |
| Nombre oficial              | `first_name`, `last_name`                                | Mandatory (spec §3)                                                                                                        |
| Idioma                      | `language`                                               | `es` (default) / `en`                                                                                                      |
| Tema                        | `theme`                                                  | `light` / `dark` — "Faro Nocturno"                                                                                         |
| Usuario                     | `user` / `User`                                          | auth (spec §4)                                                                                                             |
| Espacio de trabajo          | `workspace` / `Workspace`                                | contenedor multi-usuario (§3)                                                                                              |
| Perfil                      | `profile` / `Profile`                                    | alias + nombre oficial (§3)                                                                                                |
| Revisión (snapshot)         | `test_plan_revision`                                     | historial de versiones del plan                                                                                            |
| Revisión de caso (snapshot) | `test_case_revision`                                     | historial de versiones del caso                                                                                            |
| Gherkin / .feature          | `gherkin` / `feature`                                    | Feature/Scenario/Given/When/Then; export `${scenario_id}.feature`                                                          |
| Nivel de Gherkin            | `gherkin_level`                                          | `basic` / `outline` / `advanced` — elegido al crear el caso (enmienda §5.3)                                                |
| Escenario parametrizado     | `scenario_outline`                                       | `Scenario Outline` + `examples` (nivel outline)                                                                            |
| Tabla de datos              | `examples`                                               | `{ headers[], rows[][] }`; cada columna es un `<placeholder>`                                                              |
| Contexto común              | `background`                                             | nivel advanced (varios escenarios por Feature)                                                                             |
| Regla de negocio            | `rule`                                                   | `Rule:` agrupa escenarios; nivel advanced                                                                                  |
| Feature crudo               | `feature_source`                                         | texto Gherkin autoritativo cuando `gherkin_level = advanced`                                                               |
| Cronograma                  | `schedule`                                               | sprints + hitos                                                                                                            |
| Sprint                      | `sprint`                                                 | `{ name, start, end }`                                                                                                     |
| Hito                        | `milestone`                                              | `{ name, date }`                                                                                                           |
| Riesgo / Mitigación         | `risk` / `mitigation`                                    |                                                                                                                            |
| Correo electrónico          | `email`                                                  | almacenado en minúsculas, único                                                                                            |
| Hash de contraseña          | `password_hash`                                          | Argon2id                                                                                                                   |
| Rol                         | `role`                                                   | `test_manager`, `tester`, … (§3)                                                                                           |
| Token de acceso             | `access_token`                                           | JWT (HS256), corto                                                                                                         |
| Token de refresco           | `refresh_token`                                          | opaco; hash SHA-256 en BD, con rotación                                                                                    |
| Sesión                      | `session`                                                | `{ accessToken, refreshToken, user }`                                                                                      |
| Journal de cambios          | `oplog`                                                  | un delta por mutación local; `synced_at` NULL = pendiente (§9)                                                             |
| Delta                       | `delta` / `Delta`                                        | estado completo de una entidad (o tombstone) que se envía en el push                                                       |
| Reloj lógico híbrido (HLC)  | `hlc`                                                    | `<wall_ms:15>-<counter:5>-<device_id>`; orden de texto = orden del reloj (SYNC-01)                                         |
| Dispositivo                 | `device_id` / `deviceId`                                 | id de la instalación (o del navegador); desempate final del HLC                                                            |
| Revisión base               | `base_revision` / `baseRevision`, `base_hlc` / `baseHlc` | versión sobre la que se hizo el cambio local; el servidor la compara para detectar conflictos                              |
| Base de sincronización      | `sync_base`                                              | última versión de cada entidad que coincide con el servidor                                                                |
| Conflicto de sincronización | `sync_conflict` / `SyncConflict`                         | cambio local pendiente y cambio remoto divergentes desde la misma base (8C)                                                |
| Resolución                  | `resolution`                                             | `local` (conservar la mía) / `remote` (usar la del servidor); SYNC-02 podrá añadir `merged`                                |

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
