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

- [ ] `npm run verify` en verde: typecheck, lint sin warnings, licencias, versión, migraciones, tests de `scripts/` y tests.
- [ ] `cargo test` en `src-tauri/` y `npm run check:rust` (fmt + clippy) en verde, si se tocó Rust.
- [ ] `npm test` en `server/` en verde, si se tocó el backend.
- [ ] Lo visible se probó en la app o en el navegador, no solo con tests.
- [ ] La documentación de la tabla anterior está actualizada.
- [ ] El commit sigue Conventional Commits, en inglés, y no cambia la versión (eso solo ocurre en un commit de release).
- [ ] La CI del PR está en verde (los checks de `.github/workflows/ci.yml`).

## Integración continua y ramas

- Cada PR y cada push a `main` pasan los checks de CI: `client`, `rust`,
  `server`, `audit`, `cargo-deny`, `workflows` y `commits` (README,
  "Continuous integration"). Ningún check se desactiva para fusionar.
- Con `main` protegida (BASE-02) **todo entra por PR**: las pistas, los
  arreglos y los commits de release. El PR se fusiona con merge commit (el
  equivalente de `merge --no-ff`), con todos los checks en verde y sin push
  directo, tampoco de administradores.
- Los hooks de git (husky) se instalan con `npm install`: el script `prepare`
  apunta `core.hooksPath` a `.husky/_`, también en un clon nuevo. Ese ajuste
  vive en el `.git/config` compartido por todos los worktrees; un worktree
  creado antes de fusionar B1 no tiene `.husky/` hasta que hace rebase sobre
  `main`. **Tras cada rebase sobre `main`, ejecuta `npm install`.** `commit-msg`
  rechaza un mensaje fuera de Conventional Commits y `pre-commit` pasa ESLint
  a los `.ts`/`.tsx` preparados. No uses `--no-verify`: la CI comprueba lo
  mismo.
- **Excepciones temporales**, siempre con dueño y salida (ADR-0021):
  - `scripts/rust-gates.allowlist.json`: formato y lints de Rust de una pista
    en curso.
  - `scripts/audit-allowlist.json`: avisos npm altos, con fecha de caducidad.
- **Números de migración:** se reservan en `scripts/migration-registry.json`
  en el mismo cambio que el plan de la pista (VERSIONING §6).
- **Una dependencia nueva** debe pasar el gate de licencias (npm) o
  `cargo deny` (Rust). Una licencia nueva, aunque sea permisiva, se añade a
  `deny.toml` de forma explícita. El copyleft débil (MPL, LGPL…) solo se
  acepta por nombre: en `deny.toml` (`exceptions`) para Cargo y en
  `scripts/license-exceptions.json` para npm.

## Decisiones

Cada decisión se registra como ADR en [`docs/adr/`](docs/adr/README.md), con
contexto, decisión, alternativas y consecuencias. Una decisión no escrita no
existe: los agentes en paralelo no pueden verla.
