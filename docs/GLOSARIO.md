# GLOSARIO — Ubiquitous language (spec §15)

One domain concept = one identifier, used identically across every module,
layer and table. No module may introduce synonyms. Register every new
identifier here **before** using it in code.

Code, comments and identifiers are in English; only UI strings live in the i18n
files (`es`/`en`).

## Domain concepts

| Concepto (ES)              | Identifier            | Notes |
| -------------------------- | --------------------- | ----- |
| Proyecto                   | `project`             | |
| Espacio de trabajo         | `workspace` / `workspace_id` | Multi-user from day 1 (spec §3) |
| Plan de pruebas            | `test_plan` / `TestPlan` | |
| Caso de prueba             | `test_case` / `TestCase` | |
| Plantilla                  | `template`            | |
| Planificador               | `planner`             | Local kanban (spec §7) |
| Título                     | `title`               | Same in plan AND test case — never `name` |
| Versión                    | `version`             | |
| Fecha                      | `date`                | |
| Elaborado por / Autor      | `author`              | Always official `first_name` + `last_name` (spec §3) |
| Resumen / Introducción     | `summary`             | |
| Alcance                    | `scope`               | in / out of scope |
| Tipo de prueba             | `test_type`           | |
| Nivel de prueba            | `test_level`          | unit / integration / system / acceptance |
| Entregable                 | `deliverable`         | |
| Riesgo                     | `risk`                | |
| ID de escenario            | `scenario_id`         | e.g. `ATS_001` |
| Caso de uso mapeado        | `mapped_use_case`     | |
| Descripción                | `description`         | |
| Precondiciones             | `preconditions`       | |
| Pasos de prueba            | `test_steps`          | ordered, reorderable |
| Resultado esperado         | `expected_result`     | |
| Postcondiciones            | `postconditions`      | |
| Criterios de aceptación    | `acceptance_criteria` | |
| Datos de prueba            | `test_data`           | |
| Notas                      | `notes`               | |
| Prioridad                  | `priority`            | ISTQB CTFL 5.1.5 |
| Trazabilidad               | `traceability`        | Basis for v0.0.2 matrix |
| Estado (del caso)          | `status`              | draft / reviewed / approved / obsolete |
| Perfil                     | `profile`             | |
| Alias / nombre para mostrar| `display_name`        | UI only, never in official documents |
| Nombre oficial             | `first_name`, `last_name` | Mandatory (spec §3) |
| Idioma                     | `language`            | `es` (default) / `en` |
| Tema                       | `theme`               | `light` / `dark` — "Faro Nocturno" |
| Usuario                    | `user` / `User`       | auth (spec §4) |
| Espacio de trabajo         | `workspace` / `Workspace` | contenedor multi-usuario (§3) |
| Perfil                     | `profile` / `Profile` | alias + nombre oficial (§3) |
| Revisión (snapshot)        | `test_plan_revision`  | historial de versiones del plan |
| Cronograma                 | `schedule`            | sprints + hitos |
| Sprint                     | `sprint`              | `{ name, start, end }` |
| Hito                       | `milestone`           | `{ name, date }` |
| Riesgo / Mitigación        | `risk` / `mitigation` | |
| Correo electrónico         | `email`               | almacenado en minúsculas, único |
| Hash de contraseña         | `password_hash`       | Argon2id |
| Rol                        | `role`                | `test_manager`, `tester`, … (§3) |
| Token de acceso            | `access_token`        | JWT (HS256), corto |
| Token de refresco          | `refresh_token`       | opaco; hash SHA-256 en BD, con rotación |
| Sesión                     | `session`             | `{ accessToken, refreshToken, user }` |

> API JSON usa camelCase (`accessToken`, `displayName`); las columnas de BD usan snake_case (`access_token`, `display_name`). Mismo concepto, misma raíz.

## Audit fields (every business entity — spec §3)

`workspace_id`, `created_by`, `updated_by`, `created_at`, `updated_at`,
`deleted_at` (soft delete), `revision` (sync).

## Module identifiers (spec §2)

Folder names in English, kebab-case: `projects`, `test-plan`, `test-cases`,
`planner`, `templates`, `integrations`, `ai`, `sync-offline`, `admin`, `auth`.

## Design token naming (spec §12.1)

`--color-*` (colors), `--font-*` / `--fs-*` / `--fw-*` (typography),
`--space-*` (spacing), `--radius-*` (radii), `--shadow-*` (elevation).
Only `src/shared/theme/tokens.css` declares raw color values.
