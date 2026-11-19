# Pista L · 0.6.0 · INT-01 (CLI `pharos upload` / `watch`) e INT-04 (plantillas de GitHub Actions) · plan APROBADO (2026-11-18)

Estado: **aprobado por el usuario el 2026-11-18**, con las siete respuestas recomendadas de §8.
Bocetos: https://claude.ai/artifact/VfgNzL4nDDH9oUGVieuAef (fuente: `l-int01-bocetos.html` en esta carpeta).
ADR: [ADR-0054](../adr/0054-cli-y-plantillas-de-github-actions.md) (aceptado).

## 0. Lo que encontré (y condiciona el diseño)

- **N2 da lo justo para importar en local.** `pharos_core::api::{open, import_preview, import_report, import_attach}` y `paths::default_data_dir()`. Pero `ReportImportRequest.doc` es un **Pharos Run JSON ya parseado**: los parsers (JUnit, CTRF, Playwright…) son TS en `@pharos/formats` y Rust nunca los tuvo. La validación de `parsePharosRun` también es TS: Rust confía en que el `doc` ya viene validado.
- **El CLI necesita además, del core:** la cuenta con sesión en la app (los proyectos son de cada cuenta: `owner_id`), buscar un proyecto por prefijo o id, un run por `RUN-n` y un ciclo por clave. Son lecturas pequeñas que van a `api.rs`. Las escribo yo en L1 con revisión de N (§9).
- **Cerrojo `pharos.lock` (D4):** con la app abierta, `api::open` falla con `db-in-use`. Hasta N5, el modo local solo funciona con la app cerrada. Es lo esperado; el CLI lo explica y propone el modo remoto.
- **Contrato remoto (ADR-0052 §2, rama de A):** `POST /api/v1/projects/{p}/results?format=…` con el fichero tal cual (gzip opcional), un informe por petición. Admite `junit`, `ctrf`, `playwright_json`, `cucumber_messages`, `sarif`, `k6`, `axe`, `trx`, `allure` (zip) y Pharos Run JSON. `run.externalId` hace converger una matriz y el shard es idempotente (200 en vez de 201). Así que **en remoto el CLI no parsea nada**: solo detecta el formato, comprime y envía. Los detalles que faltan se los he preguntado a A (§5.2).
- **Colisión de nombres.** El escritorio ya compila un binario `pharos` (`src-tauri/src/main.rs`), que la instalación deja como `Pharos.exe`. Otro bin `pharos` en el mismo workspace choca en `target/release`, y en Windows `pharos.exe` = `Pharos.exe` en la misma carpeta. Por eso el bin de Cargo se llama **`pharos-cli`** y el instalador lo deja como **`bin\pharos.exe`**. El usuario siempre escribe `pharos`.
- **El keychain ya existe:** `pharos_core::keychain::{read, write, delete}` sobre el Credential Manager, serializado y con el límite de 1280 caracteres. Un token `phr_…` mide unos 50.
- **Instalador:** `installer.yml` hace `npm run build:installer` (NSIS en las pre-releases) y sube un artifact de CI, sin release de GitHub. Todas las acciones están fijadas por SHA, con Dependabot y `zizmor` en CI.
- **Disco:** D: tiene 32 GB libres. Usaré `CARGO_TARGET_DIR=D:/MI_AREA_DE_QA/pharos_target`, sin carpetas de target nuevas.

## 1. UX del CLI

### 1.1 Comandos

| Comando | Qué hace |
|---|---|
| `pharos upload <fichero o glob>… [opciones]` | Sube uno o más informes al mismo run. |
| `pharos watch [opciones] --report <glob>… -- <cmd> [args…]` | Ejecuta el comando, muestra su salida tal cual y, al terminar, sube los informes que el comando **escribió o cambió durante esa ejecución**. Sale con el código del comando. |
| `pharos run close <RUN-n> [--status completed\|aborted]` | Cierra un run (remoto). Es el último job de una matriz. También acepta `--external-id`. |
| `pharos login [--server URL]` | Pide el token (entrada oculta, o `--token-stdin`), lo comprueba con `GET /api/v1/me` y lo guarda en el Credential Manager. |
| `pharos logout [--server URL]` | Borra ese token del keychain. |
| `pharos doctor` | Diagnóstico de todo (boceto 6): versión, modo, carpeta de datos, la BD (libre o `db-in-use`), keychain, servidor, token (dueño, scopes, caducidad) y proyecto por defecto. Sale con 0 si todo está bien. |
| `pharos projects` | Lista los proyectos al alcance (local o remoto), con clave y nombre. |
| `pharos --version` · `pharos help [cmd]` | Versión del CLI y del formato. Ayuda en el idioma elegido. |

### 1.2 Opciones de `upload` y `watch`

| Opción | Notas |
|---|---|
| `-p, --project <prefijo\|id>` | Prefijo de ids de caso (`PAG`) o UUID, igual que la API v1 (§5.2). Obligatoria si no hay proyecto por defecto en la config. |
| `-f, --format <fmt>` | `auto` por defecto. **En remoto, el CLI no detecta:** envía el fichero sin `format` y lo detecta el servidor con `@pharos/formats`, siempre por contenido y nunca por extensión. Con `--format`, el servidor lo contrasta (`format_mismatch`, código 5). En local, la detección es trivial: XML, o JSON entero con `schemaVersion`. El resto se rechaza (§1.3, §5.3). |
| `--run <RUN-n>` · `--run-name <texto>` · `--external-id <id>` | Destino: un run existente, uno nuevo con ese nombre, o uno idempotente. **En GitHub Actions, `--external-id` se rellena solo** con `github:<repo>:<run_id>:<run_attempt>`, y `--run-name` con `<workflow> · <rama> · <sha7>`. |
| `--cycle <clave>` · `--config <nombre>` | Ciclo y configuración (ADR-0017). |
| `--case <TC-n>` | Vincula todo el shard a un caso (ADR-0053 §5). |
| `--local` · `--server <URL>` | Fuerza el modo (§1.3). |
| `--data-dir <ruta>` | Modo local: otra carpeta de datos (perfiles E2E). También `PHAROS_DATA_DIR`. |
| `--dry-run` | Local: `import_preview`. Remoto: detecta, valida tamaño y comprueba el token, sin subir. |
| `--allow-duplicate` | Local: importa como run nuevo un fichero que el proyecto ya tiene. En remoto es idempotente y no hace falta. |
| `--json` | Una línea JSON por fichero más un resumen. Claves en inglés y estables, para scripts. |
| `--lang es\|en` · `--quiet` · `--no-color` | Idioma, solo errores, sin color. |
| `watch`: `--report <glob>` (repetible) | Obligatorio, o `report` en `pharos.toml`. Solo se suben los ficheros con mtime ≥ inicio del comando: un informe viejo de otra ejecución no se sube por error. |
| `watch`: `--require-upload` | Si la subida falla, sale con el código de la subida en vez del del comando. Por defecto avisa y conserva el código del comando, para no tapar el resultado de los tests. |

**Fuera de 0.6.0 a propósito:** `--fail-on` (gate del quality gate; el gate en servidor es 0.7.0, ADR-0052 decisión 7), crear defectos, descargar casos y `pharos run start`. Con `externalId`, el run se crea solo en la primera subida.

### 1.3 Modo local o remoto

Regla, en este orden:

1. `--local` o `--server`, si se dan;
2. si hay `PHAROS_URL` (o `PHAROS_TOKEN`) en el entorno, **remoto**;
3. si `pharos login` guardó un servidor por defecto, **remoto**;
4. si no, **local**.

- Con `CI=true` el modo local está prohibido: en un runner no hay app ni BD que valga, y escribir en una BD temporal sería perder los resultados en silencio. Sale con el código 2 y un mensaje claro.
- La primera línea de la salida siempre dice el modo y el destino («Modo remoto · pharos.empresa.com · proyecto PAGOS» o «Modo local · Pharos de este equipo · proyecto PAGOS»).

**Modo local** (escribe en la BD del escritorio por `pharos-core`):

- Solo **Pharos Run JSON** y **JUnit XML** (decisión 2). JUnit es un port a Rust (`quick-xml`, sin DTD ni entidades) que tiene que reproducir byte a byte los snapshots `normalized/` de `@pharos/formats`: es el contrato de ADR-0053 §1.
- SARIF, k6, axe, Allure, TRX, CTRF, Playwright JSON y Cucumber se **rechazan en local** con el código 5 y la pista «usa el modo remoto (`--server`) o la ventana Importar informe de la app». Se portan en 0.7.0 si hace falta.
- **Validación del Pharos Run JSON en Rust:** no existe ninguna; el persistente solo hace `parse_doc` con serde. L1 añade:
  - una deserialización estricta con `serde` (sin el crate `jsonschema`, que trae muchas dependencias);
  - a mano, las comprobaciones cruzadas del `superRefine` de `schema.ts`: las referencias a adjuntos y shards existen.

  Se comprueba con `fixtures/schema-vectors.json` de F (válidos e inválidos, F2).
- **JUnit con `<!DOCTYPE>` en el prólogo** se rechaza como `invalid-xml` (detalle `doctype`), igual que F3. Un DOCTYPE dentro de un CDATA de `system-out` es contenido y no cuenta. Los casos son los de `xml.test.ts`.
- **Usuario:** la cuenta con sesión en la app, leída de su sesión en el Credential Manager (`api::signed_in_user`, sin los tokens). Los proyectos son de cada cuenta (`owner_id`), así que el CLI escribe como la app. Sin sesión, sale con el código 3 (`not-signed-in`). Sin datos de Pharos en la carpeta, sale con el código 4 (`no-data`) y no crea nada.
- **Errores de apertura:**
  - `db-in-use` sale con el código 6 y el texto «Pharos está abierto en este equipo. Ciérralo y repite, o usa el modo remoto». Desde N5 ese error desaparece y el CLI escribe con la app abierta: la app ve el cambio por `db://external-change`.
  - El resto de errores de apertura (clave, migración pendiente de una versión más nueva) los traduce el CLI con el mismo texto que `DbErrorScreen`.
- Lo escrito se audita como import del usuario local con `Actor::System { component: "cli" }`, si N lo deja en N2, o con `summary.via = "cli"` (§9).

**Modo remoto:**

- Cada fichero es un `POST …/results?format=…` con gzip si pesa más de 64 KB.
- Reintentos solo en 429 (con `Retry-After`), 502, 503, 504 y errores de red: 3 intentos con espera exponencial y algo de azar, como mucho 30 s en total. Un shard repetido es un no-op, así que reintentar es seguro.
- Varios ficheros se envían en serie al mismo destino. El primero crea el run (o lo encuentra por `externalId`) y los demás usan su `runKey`.
- TLS con `rustls` (sin OpenSSL, como `reqwest` en el core).
- `--insecure` no existe. Para un servidor con CA propia está `PHAROS_CA_CERT=<ruta.pem>`.

### 1.4 Códigos de salida (estables, documentados en el manual)

| Código | Significado |
|---|---|
| 0 | Todo subido (o `watch`: el comando salió con 0 y la subida fue bien) |
| *n* | `watch`: el código del comando, si no fue 0 y no hay `--require-upload` |
| 1 | Error interno inesperado (con la ruta del log) |
| 2 | Uso: opción mala, fichero que no existe, glob vacío, local en CI |
| 3 | Autenticación o permisos: sin token, `token_revoked/expired/inactive`, `insufficient_scope`, `forbidden` |
| 4 | No encontrado: proyecto, run, ciclo o caso; sin datos de Pharos en la carpeta |
| 5 | Informe no válido: `invalid_report`, `report_timeout`, formato no admitido (o no admitido en local), 413 demasiado grande |
| 6 | La BD local está en uso (la app está abierta; hasta N5) o no se puede abrir |
| 7 | Servidor inalcanzable o 5xx después de los reintentos |
| 8 | Parcial: alguno de varios ficheros falló; los demás se subieron |

- En `watch`, los códigos 2 y 3 se comprueban **antes** de lanzar el comando (proyecto, token, servidor), para no descubrir al final de 20 minutos de tests que el token caducó.
- En `watch`, `Ctrl+C` se reenvía al hijo. Si el hijo muere por la señal, se suben los informes que haya.

### 1.5 Salida en español e inglés

- El idioma es `--lang`, o `PHAROS_LANG`, o el locale del sistema (`es*` da español); si no, inglés. Los textos van en una tabla en el binario (`i18n/es.rs`, `i18n/en.rs`), con un test que exige las mismas claves en los dos.
- El **código de error** (`db-in-use`, `token_expired`…) aparece siempre, igual en los dos idiomas, para poder buscarlo en el manual.
- Color solo si stdout es una TTY y no hay `NO_COLOR`. En GitHub Actions, sin color y con anotaciones `::error::` / `::warning::` para los avisos.
- En GitHub Actions, `upload` y `watch` añaden una tabla a `$GITHUB_STEP_SUMMARY` (boceto 4) y escriben `run-url` y `run-key` en `$GITHUB_OUTPUT`.
- **Nunca se imprime un token**: solo su prefijo visible (`phr_prj_Ab3k…`). Hay un test que lo comprueba en la salida, en `--json` y en el log.
- Ejemplos completos en los bocetos 1–3 y 6.

### 1.6 Configuración y tokens

**Precedencia:** opción > entorno > `pharos.toml` del proyecto (subiendo desde la carpeta actual) > config de usuario > valores por defecto.

| Dónde | Qué guarda | Qué no guarda nunca |
|---|---|---|
| `pharos.toml` en el repo | `project`, `server`, `format`, `report = ["test-results/*.xml"]`, `cycle`, `config` | Tokens. Si encuentra una clave `token`, falla con el código 2: «los tokens no van en ficheros; usa PHAROS_TOKEN o `pharos login`». |
| Config de usuario `%APPDATA%\Pharos\cli\config.toml` (`$XDG_CONFIG_HOME/pharos` en Linux) | Servidor por defecto, proyecto por defecto, idioma | Tokens |
| **Credential Manager** (servicio `Pharos CLI`, cuenta = origen del servidor, p. ej. `https://pharos.empresa.com`) | El token de `pharos login`: PAT de la persona o token de proyecto | — |
| Entorno | `PHAROS_TOKEN`, `PHAROS_URL`, `PHAROS_PROJECT`, `PHAROS_LANG`, `PHAROS_DATA_DIR`, `PHAROS_CA_CERT` | — |

**Reglas de los tokens:**

- **No hay `--token <valor>`**: quedaría en el historial del shell y en la lista de procesos. Las vías son `PHAROS_TOKEN` (CI), `--token-stdin` y `pharos login`.
- Si no hay keychain (Linux sin servicio de secretos, un contenedor), `pharos login` **se niega a guardar** y explica cómo usar `PHAROS_TOKEN`. No hay alternativa en fichero plano (decisión 3).
- `pharos login` comprueba el CRC del token antes de ir a la red y luego `GET /api/v1/me`. Muestra dueño, tipo, scopes y caducidad. Si caduca en menos de 7 días, lo avisa.
- Un `http://` que no sea `localhost` o `127.0.0.1` se rechaza con el código 2: el token viajaría en claro.

## 2. Arquitectura del código

- Paquete nuevo **`src-tauri/cli/`** (`pharos-cli`, bin `pharos-cli`), miembro del workspace de Cargo.
- Depende de `pharos-core` **sin** la feature `tauri`.
- Features:
  - `local` (por defecto): trae `pharos-core`;
  - sin `local`: el binario solo remoto, para Linux y macOS sin SQLite ni keychain de Windows (§3).
- Módulos:
  - `cli.rs`: argumentos con `clap` derive;
  - `config.rs`;
  - `secrets.rs`: el keychain del core, o `keyring` directo en el build sin `local`;
  - `detect.rs`;
  - `local.rs`;
  - `remote.rs`: `reqwest` blocking con rustls, ya en el árbol, más la feature `blocking`;
  - `watch.rs`;
  - `junit.rs`: el port;
  - `runjson.rs`: la validación;
  - `output.rs`: texto, JSON y resumen de GitHub;
  - `i18n/`.
- **Dependencias nuevas:** `clap` (MIT/Apache), `quick-xml` (MIT), `flate2` (MIT/Apache; si ya está en el árbol, se reutiliza), `toml` (MIT/Apache) y `globset` (dentro de `ignore`, que ya está). Todas pasan `cargo deny` (`deny.toml`). No se añade ninguna acción de terceros nueva.
- **Tests:**
  - unitarios por módulo;
  - de integración del binario con `assert_cmd`-like hecho a mano (`std::process::Command` sobre el bin compilado, sin crate nuevo);
  - un servidor HTTP falso en el propio test (`std::net::TcpListener`) para los códigos de salida y los reintentos;
  - local: una carpeta de datos temporal, con un test que importa un JUnit y lo lee con el core, y otro que con un `Db` abierto en el mismo proceso da `db-in-use` y el código 6;
  - **vectores de F:** detección (fichero → formato), JUnit (`fixtures/**/*.xml` → `normalized/*.json`, igualdad exacta) y validación del Run JSON (válidos e inválidos).

## 3. Distribución

1. **Con el instalador (Windows, lo principal):**
   - `installer.yml` compila `cargo build --release -p pharos-cli` antes de `tauri build`;
   - `tauri.conf.json` › `bundle.resources` lleva `target/release/pharos-cli.exe` a `bin/pharos.exe`;
   - un hook de NSIS (`installerHooks`, `NSIS_HOOK_POSTINSTALL` / `PREUNINSTALL`) **añade `<instalación>\bin` al PATH del usuario** y lo quita al desinstalar (decisión 4);
   - la página final del instalador lo menciona.

   Así `pharos` está en cualquier terminal nueva tras instalar.

2. **Binario suelto, para CI y para quien no instala la app:**
   - el mismo workflow sube un artifact `pharos-cli-<ver>-windows-x64.zip` con `SHA256SUMS`;
   - con la decisión 5 se añade un job `ubuntu-latest` que compila `--no-default-features` (solo remoto) y sube `pharos-cli-<ver>-linux-x64.tar.gz`. Cuesta minutos de Actions solo cuando corre el instalador: en `main` y en tags.
   - Cuando haya releases de GitHub (no las hay hoy), los mismos ficheros se adjuntan al tag.

3. **Versión:**
   - el CLI lleva la versión de la app (`version:set` la escribe también en `cli/Cargo.toml`) y `pharos --version` la imprime con la del formato;
   - contra el servidor, `doctor` compara con `info.version` del OpenAPI y avisa si el servidor es más antiguo que el CLI en un menor;
   - el script de comprobación de versiones (`check:version` o equivalente) cubre el manifiesto nuevo.

4. **Firma de código:** el instalador no está firmado hoy, y el CLI tampoco lo estará. SmartScreen no actúa sobre un `.exe` lanzado desde una terminal, pero un antivirus corporativo puede. Lo documento como limitación conocida, junto a la del instalador.

## 4. INT-04 · GitHub Actions

### 4.1 Qué se entrega

1. **Acción compuesta `.github/actions/pharos-report/action.yml`**:
   - solo `bash` + `curl`, sin binario ni acciones de terceros, en runners Linux, macOS y Windows (Git Bash);
   - entradas: `server`, `token`, `project`, `files` (uno por línea, con globs), `format` (`auto`), `run-name`, `external-id` (por defecto el de la matriz), `cycle`, `config`, `case`, `close` (`false`);
   - salidas: `run-key`, `run-url`, `uploaded`, `failed`.
   - **Seguridad:**
     - el token va por `env:`, nunca por argumento;
     - la cabecera se pasa a curl por stdin (`-H @-`) para que no aparezca en la lista de procesos;
     - `::add-mask::` del token;
     - `curl --fail-with-body --proto =https` (salvo localhost) y `--retry 3 --retry-all-errors` acotado.
   - **PRs desde forks:** no hay secretos, así que la acción **se salta con un aviso** y no rompe el PR.
   - Escribe la tabla en `$GITHUB_STEP_SUMMARY`.
   - Sin detección en bash: el servidor detecta. `format:` es opcional y solo sirve de comprobación.

2. **Plantillas en `docs/integraciones/github-actions/`** (copiables, comentadas en español):
   - `pharos-pr.yml`: un job que ejecuta los tests y sube **JUnit, SARIF, k6 y axe** en el mismo run. Es la plantilla del criterio de salida (boceto 5).
   - `pharos-matriz.yml`: una matriz de SO/navegador y un job final `needs:` que cierra el run.
   - `pharos-cli-windows.yml`: un runner Windows con `pharos watch -- npm test`, usando el artifact del CLI.
   - **Reglas en todas:**
     - `permissions: contents: read`;
     - `on: pull_request`, nunca `pull_request_target`;
     - `persist-credentials: false`;
     - **toda acción fijada por SHA de 40 caracteres** con la versión en un comentario (`actions/checkout`, `actions/setup-node`; k6 vía `grafana/setup-k6-action` fijado, o la imagen `grafana/k6@sha256:…` por digest);
     - herramientas npm con versión exacta (`@axe-core/cli@x.y.z`, `@microsoft/eslint-formatter-sarif@x.y.z`).
   - Un test del repo (`scripts/check-actions-pinned.mjs`, ya cubierto por `zizmor` en CI) recorre `.github/` y `docs/integraciones/` y falla si algún `uses:` no está fijado por SHA.

3. **«Conectar CI» en la app** (bocetos 7 y 8):
   - en «Workspace › Integraciones», junto a los tokens de A, un generador: proyecto, formatos (JUnit, SARIF, k6, axe, Allure, TRX…), runner (Linux/Windows) y «acción» o «CLI»;
   - produce el YAML listo para copiar, con el servidor y la clave del proyecto ya puestos, y los dos pasos en GitHub: el secreto `PHAROS_TOKEN` y la variable `PHAROS_URL`;
   - el diálogo «Token creado» de A (su boceto 3) usa este mismo YAML en lugar del provisional;
   - en «Mi perfil › Tokens personales», cada token ofrece «Usar en el CLI», con el comando `pharos login --server …` para copiar;
   - es solo UI: ni datos nuevos ni migración;
   - el YAML sale de una función pura, `buildCiSnippet()`, con tests de snapshot, y uno de ellos comprueba que no contiene un token.

### 4.2 Cómo se demuestra de punta a punta

- **En local (puerto 3100, BD `pharos_test_db_trackl`):**
  - `scripts/int04-smoke.mjs` levanta el servidor en 3100, crea usuario, workspace, proyecto y token de proyecto por la API de sesión;
  - ejecuta **el mismo `action.yml`** (sus pasos `run:` con las entradas como entorno) contra 3100 con los fixtures de F de JUnit, SARIF, k6 y axe;
  - comprueba por `GET /api/v1/projects/{p}/runs/{key}/results` (y por las tablas de F para hallazgos y métricas) que los cuatro están en el mismo run;
  - lo mismo con `pharos upload` y `pharos watch`.
- **En un PR real de GitHub** (decisión 6):
  - un workflow `pharos-selftest.yml`, con filtro de rutas (`.github/actions/pharos-report/**`, `server/src/modules/api/**`, `docs/integraciones/**`);
  - levanta Postgres como `service`, arranca el servidor en el runner, crea un token y usa la plantilla `pharos-pr.yml` contra `localhost`;
  - es un PR de verdad reportando JUnit, SARIF, k6 y axe a un Pharos de verdad, sin exponer ningún servidor;
  - mientras el repo sea público no cuesta minutos; si pasa a privado, el filtro de rutas lo mantiene raro.
- La parte «el CLI escribe con la app abierta» del criterio se prueba en L7, después de N5: un test de dos procesos (la app de E2E abierta en 3100 + `pharos upload --local`) y la app muestra el run sin recargar.

## 5. Acuerdos con otras pistas

### 5.1 N (núcleo)

- En `api.rs` añado (L1, revisión de N): `signed_in_user`, `list_projects`, `find_run(RUN-n)`, `find_cycle(clave)`, `close_run` y `has_database` (hecho en L1). Cada una delega en el repositorio que ya existe; elegir el proyecto por prefijo es lógica del CLI. N pide no tocar `db.rs` (N4 y N5 lo reescriben). `--case` no necesita búsqueda: el persistente avisa con `unknown-case`. Son lecturas sobre los repos existentes, sin cambiar el esquema.
- Le pido a N que confirme `Actor::System { component: "cli" }` o la forma que prefiera para auditar «vía CLI».
- **N5:** cuando caiga, L7 quita el texto «cierra Pharos», añade el reintento acotado ante `SQLITE_BUSY` si el core no lo hace ya, y el test de dos procesos.

### 5.2 A (API v1) — acordado el 2026-11-18

**Petición**

- **Content-Type:** `application/xml` para junit y trx, `application/zip` para allure y `application/json` para el resto. También vale `application/octet-stream`. Se admite `Content-Encoding: gzip`.
- **Formato:**
  - `?format=` se contrasta con lo que detecta `@pharos/formats`; si no coinciden, 400 `format_mismatch`;
  - sin `format`, el servidor usa el que detecta. El CLI siempre lo envía (su detección + `--format`), así que el código 5 cubre un desacuerdo.
- **Metadatos en query params, codificados en URL:** `runKey`, `externalId`, `runName`, `cycleKey`, `configuration`, `caseKey` y `fileName`.
  - `runKey` y `externalId` son excluyentes.
  - Sin ninguno de los dos, se crea un run nuevo.
- **`{projectId}`** es el UUID o el **prefijo de ids de caso** (`PAG`), si es único al alcance del token. Si no lo es, 409 `ambiguous_project` con los candidatos.
  - El servidor no acepta nombres. Por coherencia, **`--project` acepta prefijo o UUID en los dos modos**; el nombre solo aparece en `pharos projects` y en los mensajes.

**Respuesta**

- 201 (shard nuevo) o 200 (mismo fichero), con esta forma:

      { run:{id,key,url}, shard:{id,created},
        counts:{results,linked,unlinked,byStatus:{passed,failed,blocked,skipped,other},findings,metrics},
        warnings[] }

- `findings` y `metrics` valen 0 hasta F2. Los bocetos 1, 3 y 5 se llenan de aquí.

**Errores → código de salida del CLI**

| Código de salida | Errores del servidor |
|---|---|
| 2 | `validation_error` (muestra los `issues`), `token_in_url` (no debería ocurrir nunca: es un bug del CLI), `ambiguous_project` (lista los candidatos) |
| 3 | `token_*`, `insufficient_scope`, `forbidden`, `account_disabled` |
| 4 | `not_found`, `run_not_found`, `run_closed` (con el texto «el run RUN-n está cerrado; sube a uno nuevo») |
| 5 | `invalid_report`, `report_timeout`, `format_mismatch`, `unsupported_format`, `payload_too_large` |

**Reintentos y matriz**

- Solo se reintentan los errores de red, 429 (respetando `Retry-After`), 502, 503 y 504.
- Reintentar un POST es seguro incluso tras un timeout: el shard sale del contenido.
- Ningún otro 4xx se reintenta.
- `GET /api/v1/me` devuelve `{ token:{id,kind,name,prefix,scopes,expiresAt,workspaceId,projectId}, owner:{id,name} }`.
- **Matriz:** cada job sube con `externalId`, y un job final hace `POST …/runs/{runKey}/close`. Cierra con la clave que devuelve la subida; necesita `runs:write` y que el rol del dueño tenga `run.execute`.
- **Contrato:** las rutas son `paths["/projects/{projectId}/results"]` y `paths["/projects/{projectId}/runs/{runKey}/close"]` en `docs/formats/openapi-v1.json` (PR #109). A avisa cuando se congele.

**Puerto 3100**

- Otra sesión (`compassionate-hopper`) lo tiene ocupado y A trabaja en 3110 con `PHAROS_TOURS_PORT`.
- L usará **3120** con la misma variable, salvo que el coordinador asigne turnos.

### 5.2b (Lo que se le preguntó a A, para referencia)

Le he pedido:

- el `Content-Type` por formato;
- cómo van `runKey`, `externalId`, `runName`, `cycleKey`, `configuration`, `caseKey` y `fileName` con el cuerpo crudo: propongo query params;
- si `{projectId}` acepta la clave del proyecto;
- recuentos por estado y de hallazgos/métricas en la respuesta;
- la lista de códigos de error y cuáles se pueden reintentar;
- `GET /me`;
- el cierre del run de una matriz por `externalId`.

El CLI genera sus tipos desde `docs/formats/openapi-v1.json` cuando A2 lo congele. Lo que A responda se recoge aquí antes de la aprobación, o en L2 si llega después sin cambiar la UX.

### 5.3 F (formatos) — acordado el 2026-11-18

**Detección**

- `@pharos/formats` detecta **solo por contenido** (`importers.md` › «Detección», `parseReportText`).
- Un vistazo a los primeros 4 KB falla con k6: en sus dos formas reales, `metrics` o `root_group` están mucho más allá. Por eso, **en remoto el CLI no detecta** y el servidor decide.
- La respuesta de la subida incluye el formato detectado en `shard.format` (acordado con A): la salida y el resumen de GitHub lo muestran por fichero.
- `detection-vectors.json` (F2) lo usa L4 solo para el JUnit y el Run JSON locales.

**Port de JUnit**

- Seguro: no hay ningún cambio de `NORMALIZER_VERSION` previsto para JUnit en 0.6.0, y JUnit sigue emitiendo `schemaVersion` 1.0.0 cuando el formato pase a 1.1.0.
- Los snapshots son `fixtures/ing01/normalized/*junit*`. Cubren:
  - la relativización de rutas de CI y de usuario;
  - `path::titles`;
  - flaky/rerun;
  - `[[ATTACHMENT|…]]`;
  - `test_id`;
  - `Example #n`.
- Más el rechazo del DOCTYPE (F3).

**Vectores del validador**

- `fixtures/schema-vectors.json` llega en F2, igual que los de detección.
- Si F2 no ha llegado cuando empiece L1, L1 valida contra los fixtures que ya existen y añade los vectores al llegar.

### 5.3b (Lo que se le preguntó a F, para referencia)

Le he pedido:

- vectores de detección (fichero → formato) para que el CLI y la app no discrepen;
- si algún `NORMALIZER_VERSION` de 0.6.0 mueve los snapshots de JUnit (el port los persigue);
- los vectores del validador de Pharos Run JSON en JSON.

## 6. PRs

| PR | Contenido | Tamaño | Depende de |
|---|---|---|---|
| **L1 · CLI local** | Crate `pharos-cli`, i18n, config, `doctor`, `projects`, `upload --local` (Pharos Run JSON), validador Rust con vectores de F, lecturas nuevas en `api.rs`, códigos de salida, ADR-0054 (Aceptado) | M | N2 (está) |
| **L2 · Remoto** | `login`/`logout` (keychain), `upload` remoto con detección, gzip y reintentos, `run close`, resumen de GitHub, servidor falso en tests | M | Contrato de A2 congelado (puede abrirse contra la rama de A) |
| **L3 · watch** | `watch -- <cmd>`, mtime ≥ inicio, comprobaciones previas, señales, `--require-upload` | S | L2 |
| **L4 · JUnit en Rust** | Port de JUnit para el modo local, idéntico a los snapshots `normalized/` | S–M | L1; vectores de F |
| **L5 · Distribución** | `installer.yml` (CLI + zip + `SHA256SUMS`, y Linux si la decisión 5 dice que sí), `bundle.resources`, hook NSIS del PATH, `version:set` | S | L1 |
| **L6 · INT-04** | `action.yml`, plantillas, comprobación de SHA, `int04-smoke.mjs` en 3100, «Conectar CI» y «Usar en el CLI» en la app, `pharos-selftest.yml` (decisión 6) | M | L2, A1 (UI de tokens) y A2 en `main` |
| **L7 · Con la app abierta** | Quitar el «cierra Pharos», reintento ante `SQLITE_BUSY`, test de dos procesos y app que refresca | S | N5 |

- **Orden:** L1 → L2 → L3 → L6, con L4 y L5 en paralelo desde L1, y L7 cuando llegue N5.
- **Cada PR lleva su documentación:**
  - ADR-0054 (§ «Implementación»);
  - `ARCHITECTURE.md` (crate `pharos-cli`);
  - la referencia de comandos en `docs/cli.md` (desde L1);
  - el manual: capítulo nuevo **«20 · Línea de comandos e integración continua»** con L6. El manual se genera de recorridos por la app, y el capítulo necesita la pantalla «Conectar CI»;
  - `docs/formats/` si toca;
  - fragmento en `changes/`;
  - estado en `ROADMAP.md`;
  - `VERSIONING.md` (el CLI sigue la versión de la app);
  - `despliegue.md` (`PHAROS_CA_CERT`).
- **Migraciones:** ninguna, ni local ni de servidor.

## 7. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | El contrato de A2 cambia después de L2 | Tipos generados desde `openapi-v1.json` y un test del CLI contra el `openapi.json` congelado |
| R2 | El port JUnit diverge del TS | Igualdad exacta con los snapshots `normalized/`, y el `NORMALIZER_VERSION` que reproduce queda escrito en el binario: si F lo sube, el test falla |
| R3 | Un antivirus bloquea un `pharos.exe` sin firmar | Documentado. Firmar entra con la firma del instalador (fuera de 0.6.0) |
| R4 | El PATH del usuario supera su límite o lo gestiona una GPO | El hook comprueba la longitud y, si no cabe, no toca nada y lo dice. Siempre se puede llamar a `"<carpeta de instalación>\bin\pharos.exe"`; `doctor` y el manual dicen cuál es |
| R5 | Detección de formato equivocada | En remoto detecta solo el servidor (una única implementación). En local solo hay dos formatos triviales, comprobados con los vectores de F |
| R6 | Un token en un log de CI | Máscara en la acción, sin `--token`, prefijo visible únicamente y un test sobre toda la salida |
| R7 | Minutos de Actions si el repo pasa a privado | `pharos-selftest.yml` con filtro de rutas, y el job de Linux del CLI solo en `main` y en tags |

## 8. Decisiones para el usuario

1. **Dos modos** (local por `pharos-core`, remoto por la API v1), con la regla de §1.3: remoto si hay servidor configurado y prohibido el local en CI. **(Recomendado.)** Alternativa: solo remoto en 0.6.0.
2. **Formatos en modo local:** Pharos Run JSON + JUnit (port a Rust con los vectores de F); el resto, solo en remoto y portado en 0.7.0 si hace falta. **(Recomendado.)** Alternativas: solo Pharos Run JSON en local (más barato), o portar todo ahora (más caro que la pista entera).
3. **Tokens:** solo `PHAROS_TOKEN`, `--token-stdin` o el Credential Manager; sin fichero plano aunque no haya keychain. **(Recomendado.)** Alternativa: permitir un fichero con permisos 600 tras un aviso.
4. **Instalador:** el CLI va dentro, en `bin\pharos.exe`, y se **añade al PATH del usuario** al instalar. **(Recomendado.)** Alternativa: dentro pero sin tocar el PATH (con la ruta en el manual).
5. **Binario de Linux (solo remoto)** como artifact de `installer.yml` en `main` y en tags. **(Recomendado: sí, sirve a `watch` en runners Linux.)** Alternativa: solo Windows en 0.6.0; en Linux, la acción con `curl`.
6. **Prueba en un PR real:** `pharos-selftest.yml` con servidor y Postgres dentro del runner y filtro de rutas. **(Recomendado.)** Alternativa: solo la prueba local en 3100.
7. **«Conectar CI» en la app** (generador del YAML en «Workspace › Integraciones» + «Usar en el CLI» en los tokens personales). **(Recomendado.)** Alternativa: solo el manual.
