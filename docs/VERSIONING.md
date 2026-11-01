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
| v0.0.1 + v0.0.2        | Planificación y diseño + trazabilidad                                    | **0.1.0** (`v0.1.0-beta.1`; `main` pasó a `0.2.0-alpha.1` el 2026-10-30) |
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
  backend), comprobado por la CI. Cada pista trabaja en su rama/worktree y
  entra en `main` con un merge commit (`merge --no-ff`); con `main` protegida
  (BASE-02), eso se hace mediante un PR con la CI en verde. El `commit-msg` hook
  y el check `commits` de la CI exigen Conventional Commits. Los arreglos sobre una versión publicada van en
  `hotfix/X.Y.Z`.
- **Etiquetas:** anotadas, con el formato `vX.Y.Z` o `vX.Y.Z-beta.N`, sobre
  `main`. Una etiqueta publicada (con push) **no se mueve ni se borra nunca**;
  si hay un error, se publica la versión siguiente.

## 5. Proceso de release

1. **Cierre del hito.** Todas sus pistas están fusionadas y `main` está en verde.
   Se ejecuta `npm run version:set -- X.Y.Z-beta.1` y `npm run changelog:collect`
   (pasa los fragmentos de `changes/` a `[Sin publicar]`, ADR-0032), y se pasan
   las entradas de `[Sin publicar]` del `CHANGELOG.md` a la nueva versión. Commit:
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
numéricas. Se confirmó el 2026-10-28 con `0.1.0-alpha.1`: "optional
pre-release identifier in app version must be numeric-only". Por eso:

- las alfas, betas y rc se distribuyen con el instalador NSIS;
- el MSI se genera solo para versiones estables.

`npm run build:installer` (`scripts/build-installer.mjs`) elige los formatos a
partir de la versión, y la CI publica el instalador como artefacto (BASE-09).

## 6. Compatibilidad de datos (obligatoria para cambios grandes)

Los cambios que vienen tocan el formato de los datos, así que estas reglas son
**bloqueantes** en la revisión de cada pista:

1. **Las migraciones solo avanzan** (local `src-tauri/migrations/`, servidor
   `server/migrations/`):
   - una migración fusionada en `main` no se edita jamás;
   - los arreglos van en una migración nueva;
   - los números se reservan en el plan de la pista antes de empezar, para que
     dos pistas no elijan el mismo. La reserva se escribe en
     `scripts/migration-registry.json`;
   - `npm run check:migrations` (parte de `verify` y de la CI) falla si dos
     migraciones comparten número, si falta un número sin reservar ni retirar,
     o si una migración local no está registrada en `db.rs`.
2. **Actualización desde la versión anterior.** Cada MENOR debe abrir sin
   pérdida una base de datos de la MENOR publicada anterior. El plan de la
   pista que añade migraciones incluye una prueba de esa actualización.
3. **Copia de seguridad antes de migrar (SEC-06).** Antes de aplicar
   migraciones pendientes, la app guarda la base cifrada como
   `pharos.db.enc.bak-<versión>-<última migración>`. Conserva las 3 más
   recientes. Si no puede guardarla, no migra.
4. **Sin vuelta atrás silenciosa (SEC-06).** Una versión antigua que encuentra
   migraciones desconocidas en la base se niega a abrirla y lo explica. Nunca la
   modifica. Rige desde la primera versión posterior a `0.1.0-alpha.1`, que no
   tiene esa comprobación: para volver a ella hay que restaurar la copia `.bak`.
5. **Compatibilidad entre app y servidor (SYNC-08).** Cada petición de sync
   lleva la versión de la app. El servidor declara qué versiones acepta (como
   mínimo, su misma MENOR y la anterior) y rechaza las demás con un mensaje
   claro, sin escribir datos.
   - **Excepción: la anterior solo en lectura** (decisión del usuario,
     2026-10-28; ADR-0011). Una MENOR que cambia la forma de entidades
     existentes acepta la MENOR anterior **solo en lectura**:
     - el pull funciona;
     - todo push se rechaza antes de escribir nada, con un mensaje claro
       ("actualiza para enviar cambios");
     - los cambios pendientes del cliente se conservan y se envían al
       actualizar.

     Así un cliente antiguo no puede reescribir una entidad perdiendo campos
     que no conoce. La primera MENOR que lo aplica es 0.2 (casos con pasos con
     id, campos personalizados, defectos como entidad).

     **Cómo se aplica en 0.2 (DAT-02, aceptado por el usuario el
     2026-10-31).** En cuanto el servidor tiene el paso 2 de 0.2.0, las apps
     **0.1.x y 0.2.0-alpha.1 quedan en solo lectura**: pueden leer, pero no
     enviar cambios hasta que se actualicen.
     - La puerta es la funcionalidad `stable-steps`, no la versión: un
       0.2.0-alpha.1 envía la misma MENOR que el servidor. Todo push de un
       cliente sin ella recibe `426 read_only_client_version` antes de
       escribir nada, con el mensaje «Actualiza Pharos para enviar cambios;
       tus cambios pendientes se conservan».
     - En su pull, los casos llegan con los pasos como texto (la forma que
       conocen); nunca ven un objeto donde esperaban un texto. Las listas
       estables viajan en `data.__stableSteps`, que guardan sin tocar: al
       actualizar recuperan los mismos ids, el resultado esperado y el mismo
       hash de revisión que el servidor (DAT-02, revisión B1). Del mismo modo,
       el tipo de caso y el estado de automatización, para los que no tienen
       columna, viajan en `data.__caseFields` (FLD-01, migración 0027).
     - **Límite conocido:** las apps publicadas tratan cualquier 426 como
       fatal y hacen el push antes del pull. Mientras no tengan cambios
       pendientes leen con normalidad; en cuanto tienen uno, cada sync se
       detiene en el push con ese mensaje y no recibe novedades hasta
       actualizar. Nada se pierde: al actualizar, sus cambios se envían.

   - **Un campo que falta en un documento recibido conserva el valor local**, y
     el cursor de pull vuelve a 0 en el primer sync de una MENOR que añade
     entidades al conjunto que se aplica. Lo aplica el servidor a los push de
     los clientes que no envían la funcionalidad `complete-payload` (los
     anteriores a ella); los clientes actuales envían el estado completo y
     pueden vaciar un campo omitiéndolo. Enviar `null` para vaciarlo es la
     práctica recomendada, no un requisito.
   - **Dentro de una MENOR**, la versión no distingue un build de otro: lo
     hace la cabecera `x-pharos-sync-features` (`key-conflicts`, `append-only`,
     `complete-payload`, `stable-steps`, `runs`, `custom-fields`, `cycles`). Un cliente que
     aún no ha visto `stable-steps` en las respuestas del servidor no le envía
     casos ni revisiones (los retiene y el diagnóstico los cuenta). Del mismo
     modo, sin `runs` no le envía runs, elementos, reglas de enlace, shards ni
     resultados, ni le pide bloques de claves `run` (EJE-01); sin
     `custom-fields` no le envía definiciones de campos (FLD-01), y sin
     `cycles` no le envía configuraciones, ciclos ni elementos, ni le pide
     bloques de claves `cycle` (CYC-01). El servidor valida
     `test_cycle.status` con una lista cerrada (`planned`, `active`,
     `closed`): un estado nuevo exige desplegar **antes** el servidor que lo
     admite, porque un servidor anterior rechazaría con 400 todo el push que
     lo lleve (el escritorio ya lee un estado desconocido como `planned`).
   - **Una funcionalidad que añade campos a una entidad existente** los
     protege de quien no la conoce: el push de un cliente sin ella conserva
     esos campos aunque envíe su estado completo (`FEATURE_KEYS` del servidor,
     y `FEATURE_DATA_KEYS` para claves dentro de `data`; hoy,
     `riskLikelihood`/`riskImpact` del requisito con `runs`, y `caseType`,
     `automationStatus` y `data.custom` del caso con `custom-fields`). Las
     entidades nuevas solo llegan en el pull a quien la envía. Como el push del
     cliente antiguo no lleva esos campos, la revisión que calcula puede no
     coincidir con el estado que guarda el servidor: dos revisiones con el
     mismo número y distinto contenido, sin pérdida de datos (ADR-0018).
     Un cambio de protocolo dentro de una MENOR añade una funcionalidad ahí y
     el servidor responde lo de antes a quien no la envía.
   - **Una clave nueva dentro de un blob opaco no necesita puerta** si se
     cumplen las tres: el escritorio y el servidor guardan el blob tal cual sin
     leer esa parte; todo cliente que aún puede hacer push la conoce; y el
     lector nuevo tolera su ausencia. Es el caso de los ids de sprints e hitos
     dentro de `data` del plan (RED-W5): desde `stable-steps` todo cliente
     publicado anterior está en solo lectura, en su pull guarda `data` sin
     tocar (los ids siguen en su disco) y la app actual da ids deterministas a
     los planes que no los tienen al leerlos.
6. **Formatos exportados** (`.feature`, `.xlsx`, Pharos Run JSON): solo cambian
   de forma incompatible en una MENOR, con nota en el CHANGELOG.
   - **Pharos Run JSON** lleva `schemaVersion` SemVer propio (hoy `1.0.0`,
     `src/shared/contracts/pharos-run/`, JSON Schema en
     `docs/formats/pharos-run-1.schema.json`). Un campo nuevo opcional sube la
     MENOR del formato; un cambio incompatible sube su MAYOR, y un lector
     rechaza una MAYOR que no conoce con un mensaje claro.

## 7. CHANGELOG

`CHANGELOG.md` sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Cada pista escribe sus entradas en un fragmento propio en `changes/`
(`changes/README.md`, ADR-0032); la release los pasa a `[Sin publicar]` con
`npm run changelog:collect`. Las secciones son:

- Añadido
- Cambiado
- Corregido
- Seguridad
- Cambios incompatibles

Las entradas describen lo que nota quien usa la app, no el detalle de los
commits.
