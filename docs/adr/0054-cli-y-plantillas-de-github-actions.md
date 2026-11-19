# ADR-0054 · CLI `pharos` (upload, watch) y plantillas de GitHub Actions (INT-01, INT-04)

- **Estado:** Aceptado (decisión del usuario, 2026-11-18: las siete respuestas recomendadas; ver «Decisiones del usuario»).
- **Relacionados:**
  - [ADR-0050](0050-pharos-core-y-sqlite-en-disco-cifrado.md) (pharos-core, cerrojo D4, SEC-05b);
  - [ADR-0052](0052-api-v1-tokens-y-webhooks.md) (API v1, tokens, subida de resultados);
  - [ADR-0053](0053-hallazgos-metricas-y-paquete-de-formatos.md) (`@pharos/formats`, snapshots `normalized/` como contrato de un port);
  - [ADR-0021](0021-ci-y-cadena-de-suministro.md) (CI y cadena de suministro: acciones fijadas por SHA);
  - ADR-0006 (secretos en el keychain);
  - VERSIONING §5–6.
- **Plan:** [`docs/design/l-int01-plan.md`](../design/l-int01-plan.md); bocetos en [`l-int01-bocetos.html`](../design/l-int01-bocetos.html).

## Contexto

- El criterio de salida de 0.6.0 es que **un PR de GitHub reporte JUnit, SARIF, k6 y axe a Pharos**, y que **el CLI escriba con la app abierta**.
- Hay dos destinos posibles:
  - la BD local del escritorio, a través de `pharos-core` (N2), que hoy solo un proceso puede abrir;
  - el servidor, a través de `/api/v1` (ADR-0052), que acepta los informes en su formato original.
- Los parsers son TS (ADR-0053). Rust solo importa un Pharos Run JSON ya parseado.
- El escritorio ya compila un binario llamado `pharos`.

## Decisión

### 1. Un binario, dos modos

- **Crate `pharos-cli`** en `src-tauri/cli/`, del workspace de Cargo.
  - Depende de `pharos-core` sin Tauri, con la feature `local`, que va por defecto.
  - Sin `local`, el build solo remoto sirve para Linux y macOS.
- El bin de Cargo es `pharos-cli`, para no chocar con el del escritorio. Se instala como `bin\pharos.exe`.
- **Modo remoto:** sube el fichero tal cual a `POST /api/v1/projects/{p}/results?format=…`. No parsea ni detecta: el servidor detecta por contenido con `@pharos/formats`, y `--format` es solo una comprobación (`format_mismatch`).
- **Modo local:** escribe por `pharos_core::api` como la cuenta con sesión en la app (los proyectos son de cada cuenta). Nunca crea una base de datos. Solo admite **Pharos Run JSON** y **JUnit**:
  - JUnit es un port en Rust que reproduce exactamente los snapshots `normalized/`;
  - el Run JSON se valida con `serde` estricto y las comprobaciones cruzadas de `schema.ts` a mano, con `schema-vectors.json` de F;
  - un `<!DOCTYPE>` en el prólogo XML se rechaza, como en F3;
  - los demás formatos se rechazan en local y se indica el modo remoto.
- **Elección del modo:**
  1. `--local` o `--server`;
  2. `PHAROS_URL` o `PHAROS_TOKEN` en el entorno;
  3. el servidor guardado por `pharos login`;
  4. si no, local.

  Con `CI=true`, el modo local está prohibido.
- **Hasta N5**, el modo local con la app abierta falla con `db-in-use` (código 6). Desde N5, escribe y la app lo ve por `db://external-change`.

### 2. Comandos y contrato de salida

- **Comandos:**
  - `upload`;
  - `watch -- <cmd>`: sube los informes escritos durante el comando y sale con el código del comando;
  - `run close`;
  - `login` y `logout`;
  - `doctor`;
  - `projects`.
- **Códigos de salida estables:**

  | Código | Significado |
  |---|---|
  | 0 | Todo bien |
  | 1 | Error interno |
  | 2 | Uso |
  | 3 | Autenticación o permisos |
  | 4 | No encontrado |
  | 5 | Informe no válido o formato no admitido |
  | 6 | BD local en uso |
  | 7 | Servidor inalcanzable |
  | 8 | Parcial |

  Un cambio de significado es incompatible (VERSIONING §6.6).
- **Idioma:** español o inglés según `--lang`, `PHAROS_LANG` o el locale. El código de error se imprime igual en los dos.
- `--json` es una interfaz estable con claves en inglés.
- En GitHub Actions: anotaciones, `$GITHUB_STEP_SUMMARY` y `$GITHUB_OUTPUT`.
- Con `externalId` automático `github:<repo>:<run_id>:<run_attempt>`, los jobs de una matriz convergen en un run.

### 3. Tokens y configuración

- **Sin `--token <valor>`.** Las vías son `PHAROS_TOKEN`, `--token-stdin` y `pharos login`, que guarda en el Credential Manager (servicio `Pharos CLI`, cuenta = origen del servidor) con `pharos_core::keychain`.
- **Nunca en un fichero.** Un `pharos.toml` con `token` es un error. Sin keychain, `login` se niega a guardar y remite a `PHAROS_TOKEN`.
- `http://` solo para loopback. Una CA propia se indica con `PHAROS_CA_CERT`; no existe `--insecure`.
- El token nunca se imprime ni va al log: solo su prefijo visible.

### 4. Distribución

- El instalador lleva el CLI en `bin\pharos.exe` (`bundle.resources`).
- Un hook de NSIS añade `bin` al PATH del usuario y lo quita al desinstalar.
- `installer.yml` publica además `pharos-cli-<ver>-windows-x64.zip` y, si se aprueba, `linux-x64` (solo remoto), con `SHA256SUMS`.
- El CLI lleva la versión de la app.

### 5. GitHub Actions (INT-04)

- **Acción compuesta** `.github/actions/pharos-report`:
  - `bash` + `curl`, sin acciones de terceros;
  - el token por `env` y por stdin a curl, enmascarado;
  - se salta con un aviso en los PRs desde forks.
- **Plantillas** en `docs/integraciones/github-actions/`:
  - **todo `uses:` fijado por SHA de 40 caracteres** con la versión en un comentario;
  - `permissions: contents: read`;
  - `pull_request`, nunca `pull_request_target`;
  - herramientas npm con versión exacta.

  Un script del repo lo comprueba en `.github/` y en `docs/integraciones/`.
- La app genera la plantilla en «Workspace › Integraciones › Conectar CI» (sin datos nuevos).
- **Prueba de punta a punta:**
  - en local, en el puerto 3100;
  - en un PR real, con `pharos-selftest.yml`: servidor y Postgres dentro del runner, filtro de rutas.

## Alternativas descartadas

- **Solo remoto.** El escritorio es el uso principal y N2 ya da la API local. El criterio pide que el CLI escriba con la app abierta.
- **CLI que habla con la app por IPC.** No funcionaría con la app cerrada. ADR-0050 lo descartó como base.
- **Que el CLI lance Node para usar `@pharos/formats` en local.** Un binario que depende de Node instalado y de un paquete del repo no es distribuible.
- **Port de todos los parsers a Rust en 0.6.0.** Cuesta más que la pista entera, y el remoto ya cubre el criterio. Se porta bajo demanda, con los snapshots como contrato.
- **Bin `pharos` en Cargo.** Choca con el binario del escritorio en `target/` y en la carpeta de instalación.
- **Token en un fichero de config.** Termina en repos y en copias de seguridad. El keychain ya existe.
- **Descargar el CLI en la acción de GitHub.** Necesita releases publicadas y verificar checksums. `curl` está en todos los runners.

## Consecuencias

- Un miembro más en el workspace de Cargo. Las dependencias nuevas (`clap`, `quick-xml`, `toml`, `flate2` si no está) pasan `cargo deny`.
- La detección de formato y el JUnit de Rust siguen a F por vectores. Un cambio de `NORMALIZER_VERSION` en JUnit obliga a actualizar el port.
- El manual gana el capítulo 20 («Línea de comandos e integración continua»).
- Sin migraciones ni cambios de formato.
- **Auditoría.** Lo que importa el CLI queda auditado como un `import` de la cuenta que lo ejecutó (`Actor::user`), igual que en la app. El evento no dice «vía CLI»: añadirlo sería pasar `Actor::System { component: "cli", on_behalf_of }` al persistente, un cambio del formato de auditoría (ADR-0015) que queda como propuesta aparte. La procedencia va en el run (herramienta, CI, rama, commit).

## Decisiones del usuario (2026-11-18)

1. Dos modos (local por `pharos-core`, remoto por la API v1), con la regla de elección de §1 y el modo local prohibido en CI.
2. En local, Pharos Run JSON y un port de JUnit a Rust con los snapshots de F como contrato. El resto de formatos solo en remoto.
3. Tokens solo por `PHAROS_TOKEN`, `--token-stdin` o el Credential Manager. Nunca en un fichero, aunque no haya keychain.
4. El instalador lleva el CLI y añade `bin` al PATH del usuario.
5. Un binario de Linux solo remoto como artifact de `installer.yml`, en `main` y en tags.
6. Un workflow de prueba en un PR real, con filtro de rutas.
7. «Conectar CI» en la app.

## Implementación

- **L1 · CLI local** (este PR):
  - crate `src-tauri/cli` (`pharos-cli`, feature `local` por defecto);
  - `upload` en modo local (Pharos Run JSON), `projects` y `doctor`, con códigos de salida, textos en español e inglés y `--json`;
  - el validador de Pharos Run JSON en Rust (`runjson.rs`), comprobado con todos los snapshots `normalized/`;
  - lecturas nuevas en `pharos_core::api`: `signed_in_user`, `list_projects`, `find_run`, `find_cycle`, `close_run` y `has_database` (el CLI nunca crea una base de datos). Cada una delega en una función de repositorio que ya existe. La elección del proyecto por prefijo o id está en el CLI;
  - un error final «database is locked» del core sale como `db-busy` (código 6), sin reintentos propios del CLI: los reintentos los hace el core desde N5;
  - la feature `test-support` del core: los tests del CLI abren con su propia clave, nunca con la `db-key` del usuario.

  El CLI escribe como la cuenta con sesión en la app (la de su sesión en el Credential Manager): los proyectos son de cada cuenta. Remoto, `watch` y `login` responden «llega en una versión próxima» (código 2).
- **L4 · JUnit en modo local:**
  - `cli/src/junit.rs` es un port de `importers/junit.ts` y de lo que usa de `common.ts` y `xml.ts`. Lee XML con `quick-xml`, sin DTD y con la normalización de XML 1.0 de un DOM;
  - el contrato son los siete snapshots `normalized/*junit*` de `@pharos/formats`: un test compara el documento entero con cada uno;
  - escribe `normalizerVersion` 1, el que reproduce;
  - el modo local lee JUnit e informes de hasta 50 MB (`MAX_WHOLE_REPORT_BYTES`).
- **L5 · Distribución:**
  - `build:installer` compila el CLI y lo deja en `src-tauri/bin/pharos.exe`. `tauri.installer.conf.json` (fusionado con `--config`) lo declara como recurso `bin/pharos.exe` y añade los *hooks* de NSIS. En `tauri.conf.json` no puede ir, porque tauri-build copia los recursos en cada `cargo build`;
  - **cambio respecto del plan:** los *hooks* no editan el PATH en NSIS, porque su NSIS trabaja con textos de 1024 caracteres y muchos PATH son más largos. Llaman a `pharos setup-path add|remove`, que lo edita en Rust (`HKCUEnvironmentPath` sin expandir, `REG_EXPAND_SZ`, solo esa entrada, aviso `WM_SETTINGCHANGE`). Si falla, el instalador sigue y lo anota;
  - el MSI de las versiones estables lleva el CLI, pero no toca el PATH;
  - `installer.yml` publica `pharos-cli-<versión>-windows-x64.zip` y, en un job de `ubuntu-latest` (solo en `main` y en tags), `pharos-cli-<versión>-linux-x64.tar.gz` solo remoto, cada uno con `SHA256SUMS`;
  - `version:set` ya escribe la versión del CLI (L1).
- **L2, L3, L6, L7:** pendientes.
