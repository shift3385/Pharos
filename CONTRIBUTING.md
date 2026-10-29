# Cómo trabajar en Pharos

Estas reglas valen para cualquier persona o agente de IA que cambie el
repositorio, en cualquier rama o worktree. Las reglas de flujo completas
(una fase por pista, plan antes de código, validación del usuario) están en
`files/CLAUDE.md`, fuera del repo; este archivo es su parte versionada.

## Ley de documentación

**La documentación se mantiene siempre al día.** Es una ley del proyecto desde
el 2026-10-28, por decisión del responsable. Un cambio no está terminado, y no
se puede commitear ni fusionar, hasta que actualiza **en el mismo cambio** cada
documento al que afecta. Un documento que contradice al código es un defecto:
se corrige en ese cambio, o se avisa si la contradicción revela un fallo del
código.

| Si el cambio…                                              | Actualiza                                     |
| ---------------------------------------------------------- | --------------------------------------------- |
| Cambia cómo se instala, arranca, prueba o configura algo   | `README.md`                                   |
| Cambia módulos, capas, flujos de datos o el stack          | `docs/ARCHITECTURE.md`                        |
| Avanza, termina, añade o mueve trabajo del backlog         | `docs/ROADMAP.md` (estado e ID del ítem)      |
| Lo nota quien usa la app                                   | `CHANGELOG.md`, sección `[Sin publicar]`      |
| Introduce un identificador o concepto de dominio           | `docs/GLOSARIO.md` (antes de usarlo)          |
| Toma una decisión de arquitectura o de producto            | Un ADR nuevo en `docs/adr/`                   |
| Toca migraciones, formatos de datos o el protocolo de sync | Las reglas de `docs/VERSIONING.md` §6         |
| Se desvía de la especificación                             | Una enmienda en `files/PROMPT_PHAROS_v0.3.md` |
| Cierra o avanza una fase                                   | `files/PROGRESO.md`                           |

## Definición de hecho

Un cambio está hecho cuando se cumplen todas estas condiciones, con evidencia:

- [ ] `npm run verify` en verde: typecheck, lint sin warnings, licencias, versión y tests.
- [ ] `cargo test` en `src-tauri/` en verde, si se tocó Rust.
- [ ] `npm test` en `server/` en verde, si se tocó el backend.
- [ ] Lo visible se probó en la app o en el navegador, no solo con tests.
- [ ] La documentación de la tabla anterior está actualizada.
- [ ] El commit sigue Conventional Commits, en inglés, y no cambia la versión (eso solo ocurre en un commit de release).

## Decisiones

Cada decisión se registra como ADR en [`docs/adr/`](docs/adr/README.md), con
contexto, decisión, alternativas y consecuencias. Una decisión no escrita no
existe: los agentes en paralelo no pueden verla.
