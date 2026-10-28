# Pharos — Política de versionado

> Esquema SemVer `MAYOR.MENOR.PARCHE` elegido por el usuario el 2026-10-28; el
> resto de reglas está en vigor salvo que el usuario las cambie. Se aplica a todo
> el repositorio: app de escritorio, cliente web, núcleo Rust y backend comparten
> **una única versión**.

## 1. Esquema: SemVer `MAYOR.MENOR.PARCHE`

Pharos sigue [Semantic Versioning 2.0.0](https://semver.org/lang/es/), el
estándar internacional `MAYOR.MENOR.PARCHE` (más una etiqueta opcional de
pre-versión):

| Parte           | Sube cuando…                                                                                                                      | Ejemplo                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **MAYOR**       | Hay un cambio incompatible: formato de datos que exige migración manual, protocolo de sync incompatible, o se elimina una función | `1.4.2 → 2.0.0`                                 |
| **MENOR**       | Se añade funcionalidad compatible. Mientras estemos en `0.x`, **cada hito del roadmap es una MENOR**                              | `0.1.0 → 0.2.0`                                 |
| **PARCHE**      | Solo arreglos compatibles, sin funciones nuevas ni migraciones de esquema                                                         | `0.1.0 → 0.1.1`                                 |
| **Pre-versión** | Builds previas a la versión estable del hito                                                                                      | `0.2.0-alpha.1` → `-beta.1` → `-rc.1` → `0.2.0` |

**Etapa `0.x` (la actual).** SemVer permite cambios incompatibles en `0.x`. En
Pharos, una MENOR puede romper compatibilidad, pero siempre con migración
automática y entrada en "Cambios incompatibles" del CHANGELOG. Un PARCHE nunca
rompe nada.

**Pre-versiones:**

- `alpha.N`: el hito está en desarrollo en `main`.
- `beta.N`: el alcance del hito está completo y pendiente de tu validación (criterios de salida de `ROADMAP.md` §3).
- `rc.N`: candidata final; solo se aceptan arreglos.

**`1.0.0`** será la primera versión apta para producción. Se decide
explícitamente cuando haya:

- instalador limpio;
- actualización de una versión a otra con copia de seguridad (SEC-06);
- protocolo de sync versionado (SYNC-08);
- WCAG AA verificado;
- uso real validado.

## 2. Hitos del roadmap → versiones

La numeración anterior de los hitos (`v0.0.N`) queda sustituida:

| Hito (nombre anterior) | Contenido                                                                | Versión                                  |
| ---------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| v0.0.1 + v0.0.2        | Planificación y diseño + trazabilidad                                    | **0.1.0** (hoy `main` = `0.1.0-alpha.1`) |
| v0.0.3                 | Ejecución manual + modelo Run/Result + importación JUnit/Cucumber/CTRF   | **0.2.0**                                |
| v0.0.3.x               | `pharos-core`, SQLite en disco con cifrado por página, paquetes de oplog | **0.3.0**                                |
| v0.0.4                 | Móvil Android                                                            | **0.4.0**                                |
| v0.0.5                 | CLI, API REST, webhooks, RBAC                                            | **0.5.0**                                |
| v0.0.6                 | Gherkin de ida y vuelta, runner local                                    | **0.6.0**                                |
| v0.0.7                 | MCP, IA local de calidad                                                 | **0.7.0**                                |
| v0.1.0                 | Jira, dashboards, disparo de CI                                          | **0.8.0**                                |
| v0.2+                  | Agente, nubes, gates, paquetes normativos, SSO, SaaS                     | **0.9.x → 1.0.0**                        |

## 3. Una sola fuente de verdad

La versión vive en el `package.json` raíz. `scripts/version.mjs` la copia a los
otros seis manifiestos y comprueba que coincidan:

- `package-lock.json`
- `server/package.json`
- `server/package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`

```
npm run check:version            # forma parte de npm run verify
npm run version:set -- 0.2.0-alpha.1
```

**Nunca** se edita una versión a mano en un solo archivo. La versión solo
cambia en un commit de release (§5), nunca dentro de una pista o una
funcionalidad: así las pistas paralelas no chocan.

## 4. Commits, ramas y etiquetas

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/es/)
  (`feat`, `fix`, `docs`, `build`, `chore`, `refactor`, `test`…), en inglés.
  Un cambio incompatible se marca con `!` (`feat(sync)!: …`) o con un pie
  `BREAKING CHANGE: …`, y obliga a subir la MENOR mientras estemos en `0.x`.
- **Ramas:** `main` siempre en verde (`npm run verify`, `cargo test`, tests del
  backend). Cada pista trabaja en su rama/worktree y entra en `main` con
  `merge --no-ff`. Los arreglos sobre una versión publicada van en
  `hotfix/X.Y.Z`.
- **Etiquetas:** anotadas, con el formato `vX.Y.Z` o `vX.Y.Z-beta.N`, sobre
  `main`. Una etiqueta publicada (con push) **no se mueve ni se borra nunca**;
  si hay un error, se publica la versión siguiente.

## 5. Proceso de release

1. **Cierre del hito.** Todas sus pistas están fusionadas y `main` está en verde.
   Se ejecuta `npm run version:set -- X.Y.Z-beta.1` y se pasan las entradas de
   `[Sin publicar]` del `CHANGELOG.md` a la nueva versión. Commit:
   `chore(release): vX.Y.Z-beta.1`. Después, la etiqueta.
2. **Validación del usuario** con los criterios de salida del hito. Cada
   corrección es una nueva `beta.N` o `rc.N`.
3. **Publicación.** `npm run version:set -- X.Y.Z`, sección `[X.Y.Z] - fecha` en
   el CHANGELOG, commit `chore(release): vX.Y.Z`, etiqueta `vX.Y.Z` e
   instalador. El push y la publicación se hacen solo con tu autorización
   explícita.
4. **Siguiente ciclo.** `main` pasa a `X.(Y+1).0-alpha.1`.

**Hotfix:** rama `hotfix/X.Y.(Z+1)` desde la etiqueta `vX.Y.Z`, con el arreglo,
la versión subida, la etiqueta y la fusión de vuelta a `main`.

**Instalador MSI:** el bundler WiX de Tauri solo acepta pre-versiones
numéricas. Las alfas y betas se distribuyen con el instalador NSIS o sin
instalador, y el MSI se genera solo para versiones estables. Hay que
confirmarlo al construir el instalador (UX-06).

## 6. Compatibilidad de datos (obligatoria para cambios grandes)

Los cambios que vienen tocan el formato de los datos, así que estas reglas son
**bloqueantes** en la revisión de cada pista:

1. **Las migraciones solo avanzan** (local `src-tauri/migrations/`, servidor
   `server/migrations/`):
   - una migración fusionada en `main` no se edita jamás;
   - los arreglos van en una migración nueva;
   - los números se reservan en el plan de la pista antes de empezar, para que
     dos pistas no elijan el mismo.
2. **Actualización desde la versión anterior.** Cada MENOR debe abrir sin
   pérdida una base de datos de la MENOR publicada anterior. El plan de la
   pista que añade migraciones incluye una prueba de esa actualización.
3. **Copia de seguridad antes de migrar (SEC-06).** Antes de aplicar
   migraciones pendientes, la app guarda la base cifrada como
   `pharos.db.enc.bak-<versión>`.
4. **Sin vuelta atrás silenciosa (SEC-06).** Una versión antigua que encuentra
   migraciones desconocidas en la base se niega a abrirla y lo explica. Nunca la
   modifica.
5. **Compatibilidad entre app y servidor (SYNC-08).** Cada petición de sync
   lleva la versión de la app. El servidor declara qué versiones acepta (como
   mínimo, su misma MENOR y la anterior) y rechaza las demás con un mensaje
   claro, sin escribir datos.
6. **Formatos exportados** (`.feature`, `.xlsx`, Pharos Run JSON): solo cambian
   de forma incompatible en una MENOR, con nota en el CHANGELOG.

## 7. CHANGELOG

`CHANGELOG.md` sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Cada pista añade sus entradas en `[Sin publicar]`, agrupadas en:

- Añadido
- Cambiado
- Corregido
- Seguridad
- Cambios incompatibles

Las entradas describen lo que nota quien usa la app, no el detalle de los
commits.
