# Pharos — Hoja de ruta y backlog

> **Replanificación del 2026-10-26**, basada en el estudio `Pharos QA estado del arte.md`
> (carpeta superior al repo) y aprobada el 2026-10-27. **Línea base del 2026-10-28**:
> cuatro auditorías del MVP y las decisiones D1–D6 del usuario
> ([ADR-0001](adr/0001-linea-base-tres-compuertas.md) a [ADR-0006](adr/0006-claves-ia-y-tls.md)).
> Enmienda §13 y §16 de `PROMPT_PHAROS_v0.3.md`. Este archivo es la fuente del backlog; el
> seguimiento fino de cada fase sigue en `files/PROGRESO.md`. Las versiones siguen SemVer
> ([`VERSIONING.md`](VERSIONING.md)); los hitos antiguos `v0.0.N` se renumeraron
> (v0.0.1 + v0.0.2 → 0.1.0, v0.0.3 → 0.2.0, v0.0.3.x → 0.3.0, v0.0.4…v0.0.7 → 0.4.0…0.7.0,
> v0.1.0 → 0.8.0). La documentación al día es ley del proyecto ([`CONTRIBUTING.md`](../CONTRIBUTING.md)).

## 1. Qué cambia y por qué

1. **Pharos es el plano de control, no un motor de ejecución.** Planifica, dispara, recibe y
   traza resultados de Playwright, Karate, Bruno, Appium, Maestro, k6, axe o ZAP. Nunca tendrá
   un runner ni un grid propios.
2. **Lo construido es un MVP; antes de crecer se fija una línea base.** Tres compuertas
   (§4): corregir los fallos verificados, montar la ingeniería que impide regresiones y
   decidir el modelo de datos de la ejecución antes de escribirla.
3. **Mínimos de mercado como P0:** requisitos y matriz de trazabilidad (hecho), modelo de
   ejecución Run/Result inspirado en CTRF e importación local de JUnit, Cucumber Messages,
   CTRF y JSON de Playwright.
4. **"Cualquier tipo de QA" con tipos de resultado genéricos** (Result, Finding, Metric,
   Session) y pocos formatos, no con un adaptador por herramienta ([ADR-0005](adr/0005-alcance-hasta-1-0.md)).
5. **IDs estables como tags de Gherkin** (`@TC-001`, `@REQ-014`), nunca el nombre del escenario.
6. **Equipo antes que móvil:** workspaces compartidos en 0.3.0 ([ADR-0003](adr/0003-workspaces-compartidos.md)),
   móvil en 0.4.0.
7. **El trabajo se hace en pistas paralelas** coordinadas como un equipo pequeño de agentes (§7).

## 2. Estado real (2026-10-29, tercera ola cerrada; `0.1.0-beta.1`)

| Área                                                                            | Estado                                                                           | Commits                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------- |
| Fases 0–7: base, cuentas, BD cifrada, plan, casos, planificador, plantillas, IA | Implementado                                                                     | `369d335`…`79a0185`             |
| Fase 8: sync con oplog, HLC y panel de conflictos                               | Implementado, con 6 fallos verificados (compuerta A)                             | `bf96ad6`, `fb70768`, `4fdd6a5` |
| Fase 9A: administración                                                         | Implementado                                                                     | `2de8e8e`                       |
| Trazabilidad: requisitos, matriz, tags                                          | Implementado                                                                     | `484e941`                       |
| BD sin texto plano y guardado atómico (SEC-01/02)                               | Hecho                                                                            | `54f1dde`                       |
| Varios proveedores de IA (IA-08) y cuenta de test (BASE-17)                     | Hecho                                                                            | `91f0b9a`                       |
| Tests                                                                           | Cliente 473 · Rust 244 · servidor 90 · scripts 40. CI con 8 checks obligatorios, E2E incluido | —                   |
| Segunda ola: compuerta A cerrada, SEC-03, IA-05/IA-10, Inicio real, carpeta de descarga, PDFs en ZIPs, logs de sync, zod 4 | Hecho (A3, S1, Q1, I1, U1) | `b969824`, `b75e757`, `c000a53`, `24535c4`, `0eab0a1` |
| Tercera ola: compuerta B cerrada, WCAG 2.1 AA y validación común de formularios (UX-05/UX-01), web como cliente puro del servidor y contratos generados (BASE-10/BASE-05), react-router 7 y cobertura en cada PR (BASE-20/BASE-13), E2E obligatorio | Hecho (X1, W1, D1, Q1) | `f1cac23`, `1f93e15`, `446dd7e`, `95958e6` |
| Fase 9: documentación final, guía de la beta y release `0.1.0-beta.1` (UX-06) | Hecho (R1); falta la validación nativa (§6) | — |
| Cuarta ola (4a): fundamentos del rediseño — logo, Lucide, tipografía, primitivas y shell (RED-F1, [ADR-0028](adr/0028-rediseno-de-la-interfaz.md)) | Hecho (F1); falta la revisión visual del usuario (§6) | — |

Las validaciones nativas pendientes están en §6.

## 3. Hitos

| Versión                         | Tema                     | Contenido                                                                                                                    | Criterio de salida                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0.1.0** (hoy `0.1.0-beta.1`: beta.1 en `main`; se publica al etiquetar; pendiente validación nativa) | MVP consolidado          | Compuertas A y B; SEC-03, SEC-06, SYNC-08, IA-05; Fase 9 (UX-05/06); huecos de la spec (§5)                                  | Compuertas A y B cerradas con evidencia; `cargo test`, `verify` y tests del servidor en CI; conflicto simulado visible; matriz exportable; `.feature` filtrable por `@TC-xxx`; instalador NSIS limpio en Windows 11; validaciones nativas (§6) hechas |
| **0.2.0**                       | Ejecución                | Compuerta C cerrada (ADRs); EJE-01..04, RUN-00, AUD-01, DAT-02/03, CYC-01 y FLD-01 (recortables a 0.3.0), DEF-01; ING-02..05 | Un run manual y uno de Playwright aparecen en la misma matriz; editar un caso ejecutado no altera sus resultados                                                                                                                                      |
| **0.3.0**                       | Núcleo y equipo          | CORE-01, SEC-04/05, SYNC-05, SYNC-07, TEN-01, CAS-01/02                                                                      | Dos usuarios trabajan en el mismo workspace con roles; el CLI escribe con la app abierta                                                                                                                                                              |
| **0.4.0**                       | Campo                    | MOB-01, EXP-01, SYNC-04b, SYNC-09                                                                                            | Un caso ejecutado en el móvil aparece en el escritorio; una sesión exploratoria genera un Run                                                                                                                                                         |
| **0.5.0**                       | Automatización conectada | INT-01..04, ING-06, SYNC-02, SEC-07, DEU-01                                                                                  | Un PR en GitHub reporta resultados (incluidos SARIF, k6 y axe) a Pharos                                                                                                                                                                               |
| **0.6.0**                       | Runner local             | RUN-01..03, ING-07                                                                                                           | Botón "Ejecutar @TC-001" en local con resultado vinculado                                                                                                                                                                                             |
| **0.7.0**                       | IA de calidad            | IA-02/03/06/09                                                                                                               | Claude Code lee casos vía MCP local; duplicados detectados offline                                                                                                                                                                                    |
| **0.8.0**                       | Ecosistema               | INT-05..07, IA-04, DOC-06                                                                                                    | Ciclo plan → CI → resultado → defecto en Jira                                                                                                                                                                                                         |
| **0.9.x → 1.0.0**               | Normativo y escala       | RUN-04, DOC-01..05                                                                                                           | Quality gates y paquetes normativos; decisión explícita de 1.0 (VERSIONING §1)                                                                                                                                                                        |

Fuera de alcance hasta 1.0 ([ADR-0005](adr/0005-alcance-hasta-1-0.md)): SaaS multi-tenant, MCP
remoto (IA-07), CRDT de texto, auto-updater, observabilidad remota, iOS local.

## 4. Línea base: tres compuertas

Las compuertas A y B bloquean publicar 0.1.0; la C bloquea empezar 0.2.0 y cada ítem se cierra
con un ADR ([ADR-0001](adr/0001-linea-base-tres-compuertas.md)). Prioridad: **P0** bloquea el
hito · **P1** paridad de mercado · **P2** diferenciador · **P3** escala.

### A · Corrección (bloquea publicar 0.1.0)

| ID       | Ítem                                                                                                                             | P   | Estado                                                                                 | Criterio de aceptación                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| FIX-01   | El contador de pendientes solo cuenta lo que el sync envía                                                                       | P0  | Hecho (A1, en main `50525bf`)                                                          | Editar un requisito y sincronizar deja el indicador en "Sincronizado"                                |
| FIX-02   | Pull paginado: el escritorio repite hasta agotar; la web usa el cursor                                                           | P0  | Hecho (A1, en main `50525bf`)                                                          | 1.200 documentos llegan completos al escritorio y a la web                                           |
| FIX-03   | Push por lotes con reintento                                                                                                     | P0  | Hecho (A1, en main `50525bf`)                                                          | 2.000 cambios pendientes se envían sin error 413                                                     |
| FIX-04   | La web avisa al perder un conflicto, conserva la edición y reintenta un push fallido                                             | P0  | Hecho (A1, en main `50525bf`)                                                          | Conflicto simulado en la web: aviso visible y ningún texto perdido                                   |
| FIX-05   | El borrado en cascada de un proyecto se sincroniza                                                                               | P0  | Hecho (A1, en main `50525bf`)                                                          | Borrar un proyecto en A lo borra con sus planes, casos y requisitos en B                             |
| FIX-06   | `created_by`/`updated_by` guardan el usuario, no el id de la entidad                                                             | P0  | Hecho: escrituras locales (A2) y datos recibidos por sync (A1)                         | Test de repositorio comprueba el autor en proyectos, planes y casos                                  |
| FIX-07   | Oplog, cursor y `sync_base` separados por usuario en el mismo equipo                                                             | P0  | Hecho (A1, en main `50525bf`)                                                          | Tras cambiar de cuenta, B no envía cambios pendientes de A                                           |
| FIX-08   | Casos, planes, requisitos, tarjetas y adjuntos comprueban el dueño (plantillas: FIX-08b; conflictos, oplog y cursor: FIX-07)     | P0  | Hecho (A2, en main `8ee8731`)                                                          | Test: otro usuario no lee ni modifica ninguna de esas entidades                                      |
| FIX-08b  | Plantillas por usuario; actualizar o borrar un id inexistente no escribe oplog (tras fusionar B2, que refactoriza `template.rs`) | P0  | Hecho (A3, en main `b969824`; migración 0018)                                            | Test: otro usuario no lista, lee ni borra plantillas ajenas; un id inexistente no deja fila de oplog |
| FIX-09   | Clave de Gemini en cabecera, timeout y errores sin URL                                                                           | P0  | Hecho con IA-08 (`91f0b9a`)                                                            | Test de `ai.rs`: la clave nunca aparece en la URL ni en el error                                     |
| SYNC-04a | Sincronizar requisitos y tarjetas/defectos                                                                                       | P0  | Hecho (A1, en main `50525bf`)                                                          | Un requisito creado en A aparece en B y los vínculos de los casos resuelven                          |
| DAT-01   | IDs de caso, requisito y defecto únicos entre equipos                                                                            | P0  | Hecho (A3, en main; ADR-0010 enmendado; migraciones local 0017, servidor 0005-0006)    | Dos equipos sin conexión crean casos y tras sincronizar no hay claves duplicadas                     |
| SYNC-06  | Purga real de eliminados (o quitar el texto de Admin que la promete)                                                             | P1  | Hecho (A3, en main; migración 0017)                                                   | Tras N días el registro desaparece y no resucita tras un pull                                        |

También bloquean 0.1.0: SEC-03, SEC-06, SYNC-08, IA-05, UX-05, UX-06 y las validaciones de §6.

Límites conocidos de FIX-08 (rama A2):

- El id del usuario lo envía la UI al núcleo Rust. La comprobación separa las cuentas de un mismo equipo; no protege de una UI manipulada.
- En la web el dueño ya no lo envía la UI: el servidor lo toma de la sesión (BASE-10).
- Un plan sin proyecto (posible por un pull antiguo) no se muestra a nadie: el dueño se deduce del proyecto, y la UI solo llega al plan desde su proyecto.

### B · Ingeniería (bloquea publicar 0.1.0)

| ID      | Ítem                                                                                                                                                         | P   | Estado                                | Criterio de aceptación                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ------------------------------------- | -------------------------------------------------------------------------- |
| BASE-01 | CI en GitHub Actions (`windows-latest`): `npm run verify`, `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`, servidor con Postgres              | P0  | Hecho (B1, `2f1b30d`); ver BASE-19    | Un PR con un test roto queda en rojo                                       |
| BASE-02 | `main` protegida: solo por PR con los checks de BASE-01                                                                                                      | P0  | Hecho (2026-10-29); `e2e` obligatorio | Un push directo a `main` se rechaza                                        |
| BASE-03 | Auditoría de dependencias npm y Cargo (`cargo deny`, licencias Rust incluidas) y Dependabot; revisa las 5 vulnerabilidades de tooling                        | P1  | Hecho (B1); zod 4 hecho (BASE-18)     | El gate de licencias cubre npm y Cargo; 0 vulnerabilidades altas           |
| BASE-04 | Test de actualización desde una BD 0.1.0 guardada como fixture                                                                                               | P0  | Hecho (A2, en main)                   | Abrir el fixture con HEAD conserva todos los datos                         |
| BASE-05 | Contratos TS ↔ Rust ↔ servidor generados (`ts-rs`/`specta`) y fixtures de sync compartidas                                                                   | P1  | Hecho (W1, [ADR-0026](adr/0026-contratos-generados.md)) | CI falla si un tipo generado difiere del commiteado                        |
| BASE-06 | Servidor endurecido: secreto obligatorio de 32+ en producción, CORS explícito, límite de intentos de login y de tamaño de petición                           | P0  | Hecho (B1, en main)                   | El servidor no arranca en producción con el secreto por defecto o CORS `*` |
| BASE-08 | Logs estructurados (`tracing`), `ErrorBoundary` y "Exportar diagnóstico" con la versión (absorbe UX-07)                                                      | P1  | Hecho (B2, Q1); falta validación nativa | El diagnóstico exportado no contiene datos de usuario                      |
| BASE-09 | Instalador NSIS en pre-versiones (MSI solo en estables), construido en CI                                                                                    | P0  | Hecho (B1); falta QA en Win 11 limpio | El artefacto de CI se instala en un Windows 11 limpio                      |
| BASE-10 | Una sola capa de plataforma (`@shared/platform`); la web como cliente del servidor, sin dominio duplicado ([ADR-0004](adr/0004-web-cliente-del-servidor.md)) | P1  | Hecho (W1)                            | No queda ninguna implementación de dominio sobre `localStorage`            |
| BASE-11 | ADRs y reglas de trabajo dentro del repo                                                                                                                     | P1  | Hecho: `docs/adr/`, `CONTRIBUTING.md` | —                                                                          |
| BASE-12 | Registro de números de migración con test de duplicados y huecos                                                                                             | P1  | Hecho (B1, en main)                   | CI falla si dos migraciones comparten número                               |
| BASE-13 | Cobertura medida como informe (`@vitest/coverage-v8`, `cargo llvm-cov`) y tests de `oplog.rs` y `template.rs`                                                | P2  | Hecho (D1, tests de oplog y plantillas en A3): informe del cliente en cada PR; Rust en local | El informe de cobertura se publica en cada PR                              |
| BASE-14 | Smoke E2E del binario real (WDIO + tauri-driver): arrancar, login, crear proyecto, reabrir                                                                   | P0  | Hecho (Q1): smoke en CI y en local    | El smoke corre en CI y en local                                            |
| BASE-16 | Pre-commit ligero (`lint-staged`, `commitlint`)                                                                                                              | P2  | Hecho (B1, en main)                   | Un commit fuera de Conventional Commits se rechaza                         |
| BASE-17 | Cuenta local de test reproducible (`npm run seed:test-user`)                                                                                                 | P1  | Hecho (`91f0b9a`)                     | Idempotente y bloqueada en producción                                      |
| BASE-18 | Zod 4 en el servidor (aviso alto GHSA-mrhx-c7xc-m3w5), tras fusionar A1; excepción en la auditoría hasta el 2026-12-15                                       | P1  | Hecho (Q1)                            | `npm run check:audit` pasa sin excepciones en `server/`                    |
| BASE-19 | `cargo fmt` y clippy limpios en los archivos de A1/A2; vaciar `scripts/rust-gates.allowlist.json`                                                            | P1  | Hecho: project.rs (A3) y planner.rs (U1); allowlist vacía | La allowlist queda vacía y la CI sigue en verde                            |
| BASE-20 | Avisos moderados: react-router 6 (redirección abierta, arreglado solo en v7) y `uuid` vía exceljs                                                            | P2  | Hecho (D1): react-router 7, `uuid` 11 (el bundle de exceljs aún trae uuid 8, solo usa `v4()`: aviso no aplicable) | `npm audit` de la raíz sin avisos moderados                                |

### C · Decisiones de modelo (bloquea empezar 0.2.0; cada una cierra con un ADR)

Cerrada el 2026-10-28: el usuario aceptó los ADR 0011–0019. La revisión
independiente introdujo tres cambios, que el usuario también confirmó (§7 del
diseño). Cómo encajan y en qué orden se
implementan: [`docs/design/0.2.0-modelo-ejecucion.md`](design/0.2.0-modelo-ejecucion.md).

| ID      | Decisión                                                                                                                      | P   | Estado                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| DAT-02  | Un resultado apunta a la revisión del caso y a pasos con ID estable                                                           | P0  | Aceptado: [ADR-0011](adr/0011-revision-del-caso-y-pasos-estables.md)                                                                        |
| DAT-03  | Evidencias cifradas fuera de la BD, direccionadas por hash                                                                    | P0  | Aceptado: [ADR-0014](adr/0014-evidencias-cifradas-por-hash.md)                                                                              |
| AUD-01  | Registro de auditoría append-only (antes/después, actor, `agent:<id>`) desde 0.2.0                                            | P0  | Aceptado: [ADR-0015](adr/0015-registro-de-auditoria.md)                                                                                     |
| KND-01  | Tipos de resultado genéricos: Result, Finding, Metric, Session                                                                | P0  | Aceptado: [ADR-0012](adr/0012-tipos-de-resultado-genericos.md)                                                                              |
| RUN-00  | Entorno, build, commit, dataset y riesgo del requisito dentro del Run desde el inicio (absorbe EJE-05 y los campos de TRZ-04) | P0  | Aceptado: [ADR-0013](adr/0013-campos-del-run.md)                                                                                            |
| DEF-01  | El defecto como entidad propia (severidad, estado, clave externa, enlace a Result)                                            | P1  | Aceptado: [ADR-0016](adr/0016-defecto-como-entidad.md)                                                                                      |
| CYC-01  | Ciclo o conjunto de pruebas y matriz de configuración                                                                         | P1  | Aceptado: [ADR-0017](adr/0017-ciclos-y-configuraciones.md)                                                                                  |
| FLD-01  | Campos personalizados tipados por proyecto y tipo de caso                                                                     | P1  | Aceptado: [ADR-0018](adr/0018-campos-personalizados.md)                                                                                     |
| TEN-01  | Diseño de workspaces compartidos ([ADR-0003](adr/0003-workspaces-compartidos.md))                                             | P0  | Aceptado: modelo en [ADR-0003](adr/0003-workspaces-compartidos.md), diseño técnico en [ADR-0019](adr/0019-diseno-workspaces-compartidos.md) |
| SYNC-02 | Conflictos por entidad hasta 0.5.0 ([ADR-0002](adr/0002-conflictos-por-entidad.md))                                           | —   | Decidido                                                                                                                                    |

## 5. Backlog por área

### Seguridad y núcleo

| ID      | Ítem                                                                                                                 | P   | Versión | Estado            | Depende de      | Criterio de aceptación                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------- | --- | ------- | ----------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| SEC-01  | BD en memoria (`serialize`/`deserialize`), sin `pharos.db.tmp`                                                       | P0  | 0.1.0   | Hecho (`54f1dde`) | —               | Nunca aparece un SQLite en claro en el directorio de datos                                           |
| SEC-02  | Escritura atómica: `.enc.new` + `sync_all` + `rename`                                                                | P0  | 0.1.0   | Hecho (`54f1dde`) | —               | Matar el proceso a mitad del guardado no corrompe `pharos.db.enc`                                    |
| SEC-03  | Clave de recuperación exportable e importable ([ADR-0024](adr/0024-clave-de-recuperacion.md))                        | P0  | 0.1.0   | Hecho (S1)        | SEC-01          | En otro PC, con el `.enc` y la clave, se recuperan los datos                                         |
| SEC-06  | Copia `pharos.db.enc.bak-<versión>` antes de migrar; una versión antigua no abre una BD con migraciones desconocidas | P0  | 0.1.0   | Hecho (A2)        | SEC-01          | Test: migrar crea la copia; abrir con menos migraciones falla con mensaje claro sin tocar el archivo |
| CORE-02 | Test automatizado del keychain                                                                                       | P2  | 0.1.0   | Hecho (Q1)        | —               | Test en verde                                                                                        |
| SEC-04  | Spike de cifrado por página: sqlite3mc frente a SQLCipher                                                            | P1  | 0.3.0   | Pendiente         | —               | Informe con una opción que compila y su licencia                                                     |
| SEC-05  | SQLite en disco con cifrado por página + WAL                                                                         | P1  | 0.3.0   | Pendiente         | SEC-04, CORE-01 | Guardar no es O(tamaño de la BD); otro proceso escribe con la app abierta                            |
| CORE-01 | `pharos-core` sin dependencia de Tauri (db, migraciones, repos, oplog)                                               | P1  | 0.3.0   | Pendiente         | Compuerta A     | El CLI y el escritorio usan el mismo crate                                                           |
| SEC-07  | TLS obligatorio en despliegue autoalojado ([ADR-0006](adr/0006-claves-ia-y-tls.md))                                  | P1  | 0.5.0   | Pendiente         | —               | El servidor rechaza http fuera de localhost en producción                                            |

### Sincronización

| ID       | Ítem                                                                                                      | P   | Versión | Estado                                     | Depende de | Criterio de aceptación                                            |
| -------- | --------------------------------------------------------------------------------------------------------- | --- | ------- | ------------------------------------------ | ---------- | ----------------------------------------------------------------- |
| SYNC-01  | HLC en el oplog                                                                                           | P1  | 0.1.0   | Hecho (`4fdd6a5`)                          | —          | LWW determinista con relojes desfasados                           |
| SYNC-03  | Panel de conflictos (Fase 8C)                                                                             | P0  | 0.1.0   | Hecho (`4fdd6a5`); falta validación nativa | —          | Un conflicto simulado aparece y se resuelve a mano                |
| SYNC-08  | Cada petición de sync lleva la versión de la app; el servidor rechaza las no soportadas sin escribir      | P1  | 0.1.0   | Hecho (A1, revisado y en main)             | —          | Un cliente de una MENOR no soportada recibe un error claro        |
| SYNC-04a | Ver compuerta A                                                                                           | P0  | 0.1.0   | Hecho (A1, revisado y en main)             | —          | —                                                                 |
| SYNC-06  | Ver compuerta A                                                                                           | P1  | 0.1.0   | Hecho (A3, en main)                        | —          | —                                                                 |
| SYNC-05  | Paquetes de oplog firmados `.pharos-bundle` (modo aislado)                                                | P2  | 0.3.0   | Pendiente                                  | SYNC-01    | Exportar e importar por USB entre dos PCs sin servidor            |
| SYNC-07  | Workspaces con roles, `project_members` activo ([ADR-0003](adr/0003-workspaces-compartidos.md))           | P1  | 0.3.0   | Pendiente                                  | TEN-01     | Un auditor ve el proyecto y no puede editarlo                     |
| SYNC-04b | Sincronizar plantillas; adjuntos por hash fuera del oplog (las tarjetas del planificador van en SYNC-04a) | P1  | 0.4.0   | Pendiente                                  | DAT-03     | Una tarjeta con adjunto creada en escritorio se ve en otro equipo |
| SYNC-09  | Perfil, idioma y preferencias sincronizados (spec §10.3)                                                  | P2  | 0.4.0   | Pendiente                                  | FIX-07     | Cambiar el idioma en un equipo se refleja en otro                 |
| SYNC-02  | Fusión de conflictos por campo ([ADR-0002](adr/0002-conflictos-por-entidad.md))                           | P1  | 0.5.0   | Decidido: por entidad hasta 0.5.0          | SYNC-01    | Dos ediciones de campos distintos se fusionan sin preguntar       |

### Trazabilidad

| ID     | Ítem                                                                                             | P   | Versión                            | Estado                                                           | Criterio de aceptación                                    |
| ------ | ------------------------------------------------------------------------------------------------ | --- | ---------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| TRZ-01 | Requisitos `REQ-xxx` con CRUD e importación CSV                                                  | P0  | 0.1.0                              | Hecho (`484e941`)                                                | CRUD + import; registrado en GLOSARIO                     |
| TRZ-02 | Matriz requisito ↔ caso ↔ defecto, exportable a la plantilla `PHAROS_Matriz_Trazabilidad_*.xlsx` | P0  | 0.1.0                              | Hecho (`484e941`)                                                | XLSX fiel a `docs/referencias/`                           |
| TRZ-03 | Tags estables en el `.feature` (`@TC-xxx`, `@REQ-xxx`)                                           | P0  | 0.1.0                              | Hecho (`484e941`); probado con cucumber-js, falta playwright-bdd | `cucumber-js --tags` y playwright-bdd `--grep` lo filtran |
| TRZ-04 | Riesgo ISTQB por requisito → prioridad y cobertura ponderada                                     | P2  | 0.8.0 (campos en 0.2.0 con RUN-00) | Pendiente                                                        | Matriz ordenable por riesgo                               |

### Ejecución e ingesta (0.2.0)

| ID         | Ítem                                                                                                                     | P   | Estado                                                         | Depende de     | Criterio de aceptación                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ | --- | -------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------- |
| ING-01     | Spike de formatos de resultados                                                                                          | P0  | Hecho (`570ce29`, `docs/spikes/ING-01-formatos-resultados.md`) | —              | Muestras reales + mapeo documentado                                        |
| EJE-01     | Modelo Run / Shard / Result / StepResult / Attachment, append-only                                                       | P0  | Pendiente                                                      | Compuerta C    | Esquema + GLOSARIO; los resultados nunca se sobrescriben                   |
| EJE-02     | Ejecución manual por pasos con evidencias                                                                                | P0  | Pendiente                                                      | EJE-01, DAT-03 | Pasa/falla por paso, adjunto por paso                                      |
| ING-02..04 | Importación local de JUnit XML, Cucumber Messages, CTRF y JSON de Playwright ([ADR-0005](adr/0005-alcance-hasta-1-0.md)) | P0  | Pendiente                                                      | EJE-01         | Importar el informe de Playwright vincula los resultados por `@TC-xxx`     |
| ING-05     | Resultados "no vinculados" y enlace posterior                                                                            | P0  | Pendiente                                                      | ING-02         | Un test sin ID queda en la bandeja y se enlaza a mano                      |
| EJE-04     | Matriz extendida a resultados y defectos                                                                                 | P0  | Pendiente                                                      | TRZ-02, EJE-02 | Requisito → caso → último resultado → defecto                              |
| EJE-03     | Informe de estado (29119-3) generado desde los runs                                                                      | P1  | Pendiente                                                      | EJE-02         | Export XLSX/PDF                                                            |
| ING-06     | SARIF, k6 summary y axe JSON → Finding/Metric                                                                            | P1  | 0.5.0                                                          | KND-01         | Un SARIF y un k6 summary se guardan sin cambiar el formato Pharos Run JSON |
| ING-07     | Allure, TRX y `.xcresult`                                                                                                | P2  | 0.6.0                                                          | KND-01         | Cada formato pasa tests de contrato con muestras reales                    |

### Calidad de casos y sesiones

| ID     | Ítem                                                                        | P   | Versión | Criterio de aceptación                                                              |
| ------ | --------------------------------------------------------------------------- | --- | ------- | ----------------------------------------------------------------------------------- |
| CAS-01 | Pasos compartidos, parámetros y datasets                                    | P1  | 0.3.0   | Cambiar un paso compartido actualiza N casos; un dataset de 3 filas da 3 resultados |
| CAS-02 | Flujo borrador → revisión → aprobado y baselines de suite                   | P1  | 0.3.0   | Editar un caso aprobado lo devuelve a borrador; una baseline queda congelada        |
| EXP-01 | Sesiones exploratorias (charter, timebox, notas, evidencias desde el móvil) | P2  | 0.4.0   | Una sesión genera un Run con notas y un defecto vinculado                           |

### Integraciones, CLI y runners

| ID     | Ítem                                                                                          | P   | Versión | Depende de       |
| ------ | --------------------------------------------------------------------------------------------- | --- | ------- | ---------------- |
| MOB-01 | Móvil Android: ejecución manual con cámara (sin automatización: el sandbox no lanza procesos) | P0  | 0.4.0   | EJE-02, SYNC-04b |
| INT-01 | CLI `pharos upload` y `pharos watch -- <cmd>` (mismo crate)                                   | P1  | 0.5.0   | CORE-01, ING-02  |
| INT-02 | API REST `/api/v1` (OpenAPI), tokens de proyecto y PAT con scopes                             | P1  | 0.5.0   | SYNC-07          |
| INT-03 | Webhooks salientes firmados con HMAC                                                          | P1  | 0.5.0   | INT-02           |
| INT-04 | Plantillas de GitHub Actions con acciones fijadas por SHA                                     | P1  | 0.5.0   | INT-01           |
| RUN-01 | Runner local (procesos hijo) con "doctor"                                                     | P2  | 0.6.0   | CORE-01          |
| RUN-02 | Gherkin de ida y vuelta con playwright-bdd y Karate                                           | P1  | 0.6.0   | TRZ-03, ING-03   |
| RUN-03 | Suite E2E completa de Pharos gestionada dentro de Pharos (el smoke va antes: BASE-14)         | P1  | 0.6.0   | BASE-14, ING-02  |
| INT-05 | Jira bidireccional (módulo `integrations`)                                                    | P1  | 0.8.0   | TRZ-01, DEF-01   |
| INT-06 | Disparo de CI desde un plan                                                                   | P2  | 0.8.0   | INT-02           |
| INT-07 | Importación desde TestRail y CSV                                                              | P1  | 0.8.0   | —                |
| RUN-04 | `pharos-agent` headless (Mac para iOS) + nubes de dispositivos                                | P2  | 0.9.x   | INT-02           |

### IA y MCP

| ID    | Ítem                                                                                                                     | P   | Versión                                                    | Estado                                                       | Depende de    |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | --- | ---------------------------------------------------------- | ------------------------------------------------------------ | ------------- |
| IA-01 | Procedencia visible "IA · pendiente de revisión"                                                                         | P1  | 0.1.0                                                      | Hecho (`484e941`)                                            | —             |
| IA-08 | Varios proveedores online con clave propia, uno activo, "Listar modelos" ([ADR-0007](adr/0007-varios-proveedores-ia.md)) | P1  | 0.1.0                                                      | Hecho (`91f0b9a`); falta validación nativa con claves reales | —             |
| IA-05 | Gherkin y casos desde un requisito (salida JSON con esquema, [ADR-0023](adr/0023-salida-estructurada-ia.md))             | P1  | 0.1.0                                                      | Hecho (I1, en main); falta validación con claves reales      | TRZ-01, IA-01 |
| IA-10 | Ayudas de IA que pide la spec §5.1/§5.3: riesgos, estrategia de automatización, precondiciones                           | P2  | 0.1.0                                                      | Hecho (I1, en main); falta validación con claves reales      | —             |
| IA-02 | Detección de duplicados con embeddings locales                                                                           | P1  | 0.7.0                                                      | Pendiente                                                    | —             |
| IA-03 | _Lint_ de oráculo (resultados esperados débiles)                                                                         | P1  | 0.7.0                                                      | Pendiente                                                    | —             |
| IA-06 | Servidor MCP local (stdio)                                                                                               | P1  | 0.7.0                                                      | Pendiente                                                    | SEC-05        |
| IA-09 | Proveedor y modelo por tarea                                                                                             | P2  | 0.7.0                                                      | Pendiente                                                    | IA-08         |
| IA-04 | Triage de fallos (flaky por historial + explicación)                                                                     | P1  | 0.8.0                                                      | Pendiente                                                    | EJE-01        |
| IA-07 | MCP remoto (HTTP + OAuth)                                                                                                | P2  | Después de 1.0 ([ADR-0005](adr/0005-alcance-hasta-1-0.md)) | Aplazado                                                     | INT-02        |

### Estrategia y documentación normativa

| ID     | Ítem                                                               | P   | Versión |
| ------ | ------------------------------------------------------------------ | --- | ------- |
| DOC-06 | Dashboards: pass rate, flakiness, cobertura por riesgo, tendencia  | P1  | 0.8.0   |
| DOC-02 | Criterios de salida como quality gates + informe go/no-go          | P2  | 0.9.x   |
| DOC-01 | Informe de cierre de pruebas 29119-3                               | P2  | 0.9.x   |
| DOC-03 | Paquetes de evidencia EAA/WCAG 2.2/EN 301 549 y ASVS 5.0/MASVS 2.1 | P2  | 0.9.x   |
| DOC-04 | Modo aprendizaje ISTQB CTFL 4.0.1 (sin reproducir el syllabus)     | P2  | 0.9.x   |
| DOC-05 | Modo portafolio: exportar el trabajo anonimizado                   | P2  | 0.9.x   |

### UX, spec pendiente y deuda

| ID     | Ítem                                                                                                | P   | Versión |
| ------ | --------------------------------------------------------------------------------------------------- | --- | ------- |
| UX-05  | Verificación WCAG 2.1 AA, incluido teclado y `aria` en los asistentes (Fase 9)                      | P0  | 0.1.0 · Hecho (X1) |
| UX-06  | Instalador Windows limpio + documentación final (Fase 9; requiere BASE-09)                          | P0  | 0.1.0 · Hecho (R1); falta QA del instalador en Win 11 limpio (§6) |
| UX-01  | Validaciones transversales de formularios (números, requeridos, formatos, filas duplicadas)         | P1  | 0.1.0 · Hecho (X1) |
| UX-08  | Inicio real: búsqueda, último acceso y progreso de proyectos (spec §5); sin el texto de la "Fase 0" | P2  | 0.1.0 · Hecho (U1) |
| UX-02  | Carpeta de descarga con selector nativo                                                             | P2  | 0.1.0 · Hecho (U1) |
| PLN-01 | Frecuencia configurable de las ceremonias del plan (spec §5.1 paso 8)                               | P2  | 0.1.0 · Hecho (U1) |
| EXP-02 | ZIP de proyecto y global también con PDF (spec §5.4)                                                | P2  | 0.1.0 · Hecho (U1) |
| TPL-01 | La IA usa el "prompt de uso" de las plantillas para sugerirlas (spec §6)                            | P2  | 0.2.0   |
| UX-03  | Undo/redo por paso en el asistente                                                                  | P3  | —       |
| UX-04  | Revisión UI/UX (pendiente de ejemplos del usuario)                                                  | P2  | Absorbido por el rediseño (RED-*) |
| UX-09  | "Exportar diagnóstico" también en la pantalla de BD que no abre (`DbErrorScreen`); hoy solo queda el log (R1) | P2  | 0.1.x   |
| DEU-01 | Backend compilado con `tsc` para producción                                                         | P2  | 0.5.0   |

### Rediseño de la interfaz

Paquete en [`docs/rediseno/`](rediseno/README.md); la SPEC manda
([ADR-0028](adr/0028-rediseno-de-la-interfaz.md)). Ola 4a = F1; ola 4b = V1–V4 en paralelo
sobre los fundamentos de F1; ola 5 = funciones que necesitan datos de 0.2.0 (hasta entonces
el shell solo pinta sus disparadores con un aviso de "próximamente"). La versión en que sale
el rediseño (no es un PARCHE según [`VERSIONING.md`](VERSIONING.md)) la decide el usuario.

| ID     | Ítem                                                                                                         | P   | Versión |
| ------ | ------------------------------------------------------------------------------------------------------------ | --- | ------- |
| RED-F1 | Fundamentos: paquete en `docs/rediseno/`, logo nuevo (favicon e iconos nativos), Lucide, tipografía y ajuste de texto (SPEC §3), movimiento reducido (§9), `Popover`/`Menu`/`BottomSheet`/confirmación destructiva, shell con vista por el ancho del contenedor (< 600 / 600–1279 / ≥ 1280 px, enmienda CAMBIO-vista-adaptativa), menú lateral contraíble, barra superior e inferior, menú del usuario, secciones del proyecto en la URL ([ADR-0029](adr/0029-secciones-del-proyecto-en-la-url.md)) | P1  | Por decidir · Hecho (F1); falta la revisión visual del usuario |
| RED-V1 | Pantallas Login, Inicio (dashboard) y Perfil. Incluye, de la actualización 2026-10-30 ([`ACTUALIZACION-para-Claude-Code.md`](rediseno/cambios/ACTUALIZACION-para-Claude-Code.md) §2–3): maquetación de «Ejecuciones diarias» (cabecera con `flex-wrap` y «+18 % vs. anterior», etiqueta de día bajo su barra, un día sí y otro no en tablet y móvil con hoy en negrita, barras de 28 px como máximo, raya gris de 2 px en días sin datos, leyenda Pasa · Falla · Sin ejecuciones con el mes) y leyenda de «Ejecución por proyecto» (`gap: 6px 14px`, `nowrap`, cuadritos `flex: none`, título con `min-width: 0`) | P1  | Por decidir |
| RED-V2 | Pantallas Proyectos, Ajustes del proyecto (eliminar escribiendo el prefijo) y Plan de pruebas. Incluye la navegación de los 19 pasos del Plan (actualización 2026-10-30 11:31, SPEC §8 y [`ACTUALIZACION-para-Claude-Code.md`](rediseno/cambios/ACTUALIZACION-para-Claude-Code.md) §5): desde 1360 px de contenedor, lista vertical `sticky` con `z-index: 2` y scroll propio; de 600 a 1359 px, stepper horizontal sobre el formulario con el paso actual centrado; por debajo de 600 px, barra compacta con «Ver pasos»; el panel Estado/Revisiones baja debajo del formulario si no cabe. También quitar la cabecera «← Proyectos <nombre>» que repite la barra superior | P1  | Por decidir |
| RED-V3 | Pantallas Casos (lista y editor), Planificador y Trazabilidad. Lista: tabla con búsqueda (ID, título o requisito), estados con contador, filtros Prioridad / Nivel (Ejecución «Próximamente»), selección múltiple (exportar .feature, eliminar) y paginación; tarjetas en móvil. Editor: abre con `?case=` (`caseLink`), «‹ anterior · N de M · siguiente ›» sobre los filtros de la lista, «Ir a un caso… Ctrl P», Prioridad y Estado con explicación (hoja en móvil), Editor / Gherkin / Vista dividida (móvil: Editor o Gherkin), edición Gherkin en móvil con barra de palabras clave sobre el teclado y sin barra inferior. Trazabilidad: matriz de 9 columnas, «Mostrar solo huecos» con contador, tarjetas etiquetadas en móvil, «Generar casos con IA» en requisitos sin cubrir. Planificador: kanban con filtros por tipo, búsqueda y prioridad. Piezas comunes en `src/shared/ui` (tabla, paginación, filtros, pastillas, botones) | P1  | Por decidir · Hecho (V3); falta la revisión visual del usuario |
| RED-V3c | Unificar el botón secundario: `.pj-action` (cabecera del proyecto, V2) y `.ui-btn` (`@shared/ui/buttons.css`, V3) dibujan lo mismo. Dejar una sola clase y migrar los usos | P3  | Por decidir |
| FIX-10 | La API web rechaza las tarjetas «Datos de prueba» del Planificador: `server/src/modules/domain/domain.schemas.ts` solo admite `kind` `task` o `defect`, mientras el escritorio y la interfaz admiten `test_data`. Añadir `test_data` al esquema (y un test de la API) | P2  | Por decidir |
| RED-V3b | Contador de adjuntos en las tarjetas del Planificador (clip con número, como en el prototipo): el listado de tarjetas aún no trae cuántos adjuntos tiene cada una y pedirlos por tarjeta serían N lecturas. Añadir `attachmentCount` al listado (Rust y API) y pintarlo | P3  | Por decidir |
| RED-V4 | Administración por grupos (Motor de IA por defecto, Plantillas, General, Sincronización, Seguridad, Diagnóstico); sustituye al `AdminSectionNav` temporal de F1 y lleva Plantillas y Motor de IA dentro de sus pestañas | P1  | Por decidir |
| RED-W1 | Búsqueda global (Ctrl K; en móvil, resultados agrupados en Casos, Requisitos y Proyectos)                   | P2  | 0.2.0   |
| RED-W2 | Panel de notificaciones (por día, sin leer, acción directa, «Marcar todo como leído»)                       | P2  | 0.2.0   |
| RED-W3 | Papelera con contador, desglose, restaurar y vaciar                                                          | P2  | 0.2.0   |
| RED-W4 | Inicio: periodo y «Comparar con el periodo anterior»                                                         | P2  | 0.2.0   |
| RED-W5 | Plan, paso 14: generar sprints desde un rango                                                                | P2  | 0.2.0   |
| RED-W6 | Métricas de ejecución en Inicio (tasa de éxito, ejecuciones diarias, criterios de salida): los datos reales de la gráfica «Ejecuciones diarias» y de «Ejecución por proyecto», cuya maquetación hace RED-V1; requiere la ingesta de 0.2.0 | P2  | 0.2.0   |

## 6. Validaciones del usuario pendientes

Bloquean el cierre formal de fases (regla 1 de `files/CLAUDE.md`):

- **Fase 4:** edición bidireccional y `.feature` válido en la app nativa.
- **Fase 6:** PDF nativo, importación de plan y casos, plantillas.
- **Fase 7:** asistencia sin internet vía Ollama.
- **Fase 8:** 8B y 8C (conflicto simulado) en la app nativa.
- **Fase 9A:** panel de administración.
- **Trazabilidad:** requisitos, matriz y tags en la app nativa; filtrado con playwright-bdd.
- **SEC-01/02:** guardar desde la app y comprobar que no quedan `.tmp` ni `.new`.
- **SEC-03:** en la app nativa, exportar la clave de recuperación desde Perfil; después
  copiar `pharos.db.enc` a otro equipo (o borrar la entrada `db-key` del Administrador de
  credenciales tras guardar una copia del `.enc`), abrir Pharos y recuperar los datos con
  la clave. Probar también una errata y una clave de otro equipo.
- **IA-08:** probar con claves reales cada proveedor que vayas a usar (Gemini, OpenAI, Claude,
  OpenRouter o un endpoint compatible).
- **IA-05 / IA-10:** con claves reales (y con Ollama), generar casos desde un requisito y
  aceptar algunos (quedan vinculados en la matriz); sugerir riesgos, estrategia de
  automatización y precondiciones. Anotar qué modelos devuelven JSON inválido a menudo.
- **Primera ola (A1, A2, B1, B2):** en la app nativa, sync entre dos cuentas en el mismo
  equipo (FIX-07), borrado de proyecto en cascada en otro equipo (FIX-05), copia
  `.bak-<versión>` al migrar (SEC-06), "Exportar diagnóstico" sin datos de usuario
  (BASE-08) y el instalador NSIS del CI en un Windows 11 limpio (BASE-09).
- **Segunda ola (A3, S1, I1, U1):** sync entre dos equipos sin conexión creando casos (sin
  claves duplicadas, DAT-01); purga tras el plazo de retención (SYNC-06); plantillas con dos
  cuentas (FIX-08b); elegir la carpeta de descarga y exportar el ZIP con PDFs (UX-02, EXP-02).
- **Tercera ola (X1, UX-05/UX-01):** en la app nativa, solo con teclado y con NVDA o el
  Narrador de Windows, recorrer el asistente del plan, el editor de casos (reordenar pasos
  con Espacio y flechas), un diálogo de IA, el panel de conflictos y la clave de
  recuperación, y guardar un plan con avisos y otro sin título. Los puntos abiertos están en
  `docs/accesibilidad/auditoria-wcag-0.1.0.md`.
- **Rediseño F1 (RED-F1):** revisar las capturas del shell a 320, 390, 599, 600, 820, 1180,
  1279, 1280 y 1440 px en claro y oscuro, y en la app nativa: estrechar la ventana (menú lateral
  a iconos por debajo de 1280 px y vista móvil por debajo de 600 px, sin recargar), contraer el menú lateral y reabrir la app (se
  recuerda), entrar en un proyecto (grupo «Proyecto activo»), menú del usuario (idioma y
  cerrar sesión), y el icono nuevo en la barra de tareas y el instalador.
- **Rediseño V3 (RED-V3):** revisar las capturas de Casos (lista, editor en las tres vistas,
  menús de Prioridad y Estado, edición Gherkin en móvil), Planificador y Trazabilidad (todo y
  solo huecos) a 320, 390, 599, 600, 820, 1180, 1279, 1280 y 1440 px en claro y oscuro. En la
  app nativa: Ctrl P en el editor, «Atrás» del sistema desde un caso, y en un móvil o tableta
  que la barra de palabras clave queda sobre el teclado.
- **Beta 0.1.0-beta.1 (R1, UX-06):** recorrer [`guia-beta.md`](guia-beta.md), que convierte
  esta lista en casillas, con el instalador NSIS del CI en un Windows 11 limpio: instalar
  (aviso de SmartScreen: el instalador no está firmado), primer arranque y WebView2, versión
  visible, carpeta de datos, desinstalar y reinstalar, y actualizar encima de `0.1.0-alpha.1`.
  La firma de código queda fuera de 0.1.0 (limitación conocida).
- **E2E (BASE-14):** `npm run e2e` en verde con la API de `main` en el puerto 3000 (la CSP
  del escritorio solo admite ese puerto).

## 7. Modelo de trabajo: un equipo pequeño de agentes

Recomendación del usuario (2026-10-28): al empezar a desarrollar, el trabajo se orquesta como
un grupo de desarrollo pequeño. Funciona así:

- **Coordinación (sesión principal):** reparte el trabajo en pistas, resuelve dependencias y
  choques de archivos, revisa cada entrega contra el código antes de aceptarla, fusiona en
  `main` y mantiene este ROADMAP, PROGRESO y los ADR.
- **Desarrollo (una sesión por pista, en su propio worktree):** plan aprobado antes de
  código, implementación, tests y documentación según `CONTRIBUTING.md`. Dos pistas que
  tocan los mismos archivos van en serie.
- **Revisión (agente independiente):** revisa cada rama antes de fusionarla; corrección,
  seguridad y cumplimiento de la ley de documentación.
- **QA (agente independiente):** prueba en la app o el navegador lo que la pista dice haber
  hecho, con la cuenta de test (`npm run seed:test-user`), y reporta evidencias.

Primeras pistas propuestas para la línea base:

| Pista                   | Ítems                                    | Toca                                                              | Choques                     |
| ----------------------- | ---------------------------------------- | ----------------------------------------------------------------- | --------------------------- |
| A1 · Sync               | FIX-01..05, FIX-07, SYNC-04a, SYNC-08    | `oplog.rs`, `sync.rs`, `sync-offline/`, `server/src/modules/sync` | Serie con A2 en `sync.rs`   |
| A2 · Datos y permisos   | FIX-06, FIX-08, DAT-01, SEC-06, SYNC-06  | repos Rust, migraciones (números reservados en el plan)           | Reservar migraciones con A1 |
| B1 · CI y seguridad     | BASE-01..03, 06, 09, 12, 16              | `.github/`, `scripts/`, `server/src/config`, `tauri.conf.json`    | Ninguno                     |
| B2 · Diagnóstico y E2E  | BASE-08, BASE-14, BASE-13                | `src-tauri` (logging), `src/app`, nuevo `e2e/`                    | Ninguno                     |
| C · Modelo de ejecución | ADRs de la compuerta C (solo documentos) | `docs/adr/`                                                       | Ninguno                     |

Segunda ola (2026-10-29), fusionada en `main` por PR con revisión independiente, QA y CI en
verde: A3 (#5), S1 (#4), Q1 (#2), I1 (#3) y U1 (#6). El E2E en CI (BASE-14) sigue en el PR #7.
Desde esta ola, antes de cada compilación se comprueba el espacio en D: y se pide confirmación
para borrar la compilación anterior (cada pista reutiliza su carpeta de compilación).

Pistas del 2026-10-27, ya fusionadas en `main`: seguridad de `db.rs`, cierre de sync (8C +
HLC), trazabilidad y spike de ingesta.

## 8. Reglas de diseño que se adoptan

- El ID de un caso viaja como tag (`@TC-xxx`), nunca como nombre de escenario.
- Los resultados de ejecución y el audit log son append-only.
- Los resultados ingeridos se normalizan a un único "Pharos Run JSON" (superconjunto de CTRF) en
  `pharos-core`; el servidor solo valida el esquema.
- Lo que genera la IA lleva procedencia visible hasta que una persona lo revisa. Lo que se
  escribe por MCP pasa por el oplog como `agent:<id>`.
- Las claves (BD, sesión, IA) viven solo en el keychain del sistema; nunca en URLs, logs ni
  sync ([ADR-0006](adr/0006-claves-ia-y-tls.md)).
- La web es un cliente del servidor; el trabajo sin conexión es del escritorio
  ([ADR-0004](adr/0004-web-cliente-del-servidor.md)).
- Licencias: solo se empaqueta software MIT/Apache/BSD/ISC/OFL. k6 (AGPL) y otras herramientas
  se invocan como procesos que instala el usuario. PowerSync (FSL) queda descartado.
- La documentación se actualiza en el mismo cambio que el código ([`CONTRIBUTING.md`](../CONTRIBUTING.md)).
