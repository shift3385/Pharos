# CLI `pharos`

Referencia de la línea de comandos de Pharos (INT-01, [ADR-0054](adr/0054-cli-y-plantillas-de-github-actions.md)).

El plan completo y los bocetos están en [`design/l-int01-plan.md`](design/l-int01-plan.md). El capítulo del manual de usuario llega con «Conectar CI» (L6).

> **Estado (L1, L2, L4, L5).**
>
> - **Funciona:**
>   - `upload` en modo local (Pharos Run JSON y JUnit) y en modo remoto (cualquier formato que lea el servidor);
>   - `projects`, `doctor`, `login`, `logout` y `run close`.
> - **Llega más adelante:**
>   - `watch` (L3);
>   - las plantillas de GitHub Actions y «Conectar CI» (L6);
>   - los textos de `db-in-use` ya no piden cerrar Pharos (L7): desde SEC-05b el CLI escribe con la app abierta.
>
> Mientras tanto, esos comandos responden «llega en una versión próxima» y salen con el código 2.

## Instalarlo

- **Con la app:** el instalador de Pharos deja el CLI en `<carpeta de instalación>\bin\pharos.exe` y añade esa carpeta al PATH del usuario. Funciona en cualquier terminal que se abra después de instalar. Al desinstalar, la carpeta sale del PATH.
- **Si el PATH no se pudo tocar** (lo dice el detalle del instalador), el CLI se llama por su ruta completa. `pharos doctor` dice dónde está.
- **El MSI de las versiones estables** también lleva `bin\pharos.exe`, pero no toca el PATH: la ruta va a mano.
- **Sin la app:** la CI publica, junto al instalador, `pharos-cli-<versión>-windows-x64.zip` y `pharos-cli-<versión>-linux-x64.tar.gz`, cada uno con su `SHA256SUMS`.
  - Comprueba el hash antes de usarlo: `sha256sum -c SHA256SUMS`.
  - El de Linux es **solo remoto**: no lleva el modo local.

## Comando interno del instalador

`pharos setup-path add|remove <carpeta>` añade o quita una carpeta del PATH del usuario (`HKCU\Environment\Path`).

- Lo usan los *hooks* del instalador y no aparece en la ayuda.
- Lee el PATH sin expandir (`%USERPROFILE%\…` se queda así) y lo vuelve a escribir como `REG_EXPAND_SZ`. Solo toca esa entrada y avisa a Windows del cambio.
- El NSIS que usa Tauri trabaja con textos de 1024 caracteres como mucho, y muchos PATH son más largos: editarlo desde el instalador podría cortarlo.

## Compilarlo

El binario es `pharos-cli` en Cargo y `pharos.exe` una vez instalado. Desde `src-tauri/`:

```bash
cargo build --release -p pharos-cli
```

Con un directorio de target compartido, `CARGO_TARGET_DIR` decide dónde queda `pharos-cli.exe`.

## Comandos

| Comando | Qué hace |
|---|---|
| `pharos upload <fichero o patrón>… [opciones]` | Sube uno o más informes al mismo run. Los patrones (`reports/*.json`) los expande el CLI, porque PowerShell no lo hace. |
| `pharos projects` | Lista tus proyectos con su prefijo, que es lo que pide `--project`. |
| `pharos doctor` | Comprueba la versión, la configuración y el modo. En local, también la sesión y la base de datos; en remoto, el servidor y el token (dueño, permisos y caducidad). Sale con 0 si solo hay avisos. |
| `pharos login [--server URL] [--token-stdin]` | Pide el token (no se ve al escribirlo) o lo lee de la entrada estándar. Lo comprueba con el servidor, lo guarda en el Administrador de credenciales de Windows y deja ese servidor como el de por defecto. |
| `pharos logout [--server URL]` | Borra ese token del almacén de credenciales. |
| `pharos run close [RUN-n] [--external-id <id>] [--status completed\|aborted]` | Cierra un run del servidor. Sin clave, el de `--external-id` o, en GitHub Actions, el de este CI: es el último job de una matriz. |
| `pharos help [comando]` · `pharos --version` | Ayuda y versión. |

### Opciones de `upload`

| Opción | Qué hace |
|---|---|
| `-p, --project <prefijo\|id>` | El proyecto, por su prefijo de ids de caso (`PAG` o `PAG-`, sin distinguir mayúsculas si solo hay uno) o su id. También vale `project` en `pharos.toml` o `PHAROS_PROJECT`. |
| `--run <RUN-n>` | Un run abierto que ya existe. |
| `--run-name <texto>` | Nombre del run nuevo. |
| `--cycle <CYC-n>` | Ciclo (abierto) del run nuevo. |
| `--config <nombre>` | Configuración de los resultados que no traen una. |
| `--case <TC-n>` | Vincula a ese caso los resultados que no traen uno. |
| `--allow-duplicate` | Importa como run nuevo un fichero que el proyecto ya tiene. |
| `--dry-run` | Muestra qué haría, sin escribir nada. |
| `--local` · `--server <URL>` | Fuerza el modo. |
| `--external-id <id>` | Remoto: el run de ese id, creado una vez y encontrado después, para que varios jobs suban al mismo. En GitHub Actions es `github:<repo>:<run_id>:<intento>` sin decir nada. |
| `--close` | Remoto: cierra el run al terminar. |
| `-f, --format <formato>` | Remoto: solo comprueba. El servidor detecta el formato por el contenido y, si no coincide, responde `format_mismatch`. |
| `--token-stdin` | Remoto: lee el token de la entrada estándar. |
| `--data-dir <ruta>` | Otra carpeta de datos (también `PHAROS_DATA_DIR`). |
| `--json` | Una línea JSON por fichero y un resumen, con claves en inglés y estables. |
| `--lang es\|en` · `--quiet` · `--no-color` | Idioma, solo errores, sin color. |

- **No existe `--token`:** quedaría en el historial del shell y en la lista de procesos. El token va en `PHAROS_TOKEN`, `--token-stdin` o `pharos login`.
- **Varios ficheros** van a un único run nuevo, que queda cerrado como completado al terminar. En remoto, el CLI crea antes el run vacío (`createRun`), porque el servidor cierra al momento el run que crea una subida.
- **Repetir un fichero** que ya está en el proyecto no escribe nada y no es un error («ya estaba importado en RUN-n»).

## Modo local

El CLI escribe en la base de datos de Pharos de este equipo, con el mismo código que «Importar informe» de la app.

- **Como quién:** como la cuenta que tiene la sesión iniciada en la app. La lee de su sesión en el Administrador de credenciales de Windows, sin los tokens. Sin sesión, sale con el código 3.
- **Qué lee:**
  - Pharos Run JSON 1.x, validado como lo valida la app (`parsePharosRun`);
  - JUnit XML, convertido como lo convierte la app: Playwright, Surefire, pytest, cucumber-js… con los reintentos (`flakyFailure`, `rerunFailure`), las propiedades `test_id`, `tag` y `requirement`, y los adjuntos `[[ATTACHMENT|ruta]]` relativos a la carpeta del informe. Un `<!DOCTYPE>` en el prólogo se rechaza.

  Hasta 50 MB por informe.
- **Qué rechaza:** SARIF, k6, axe, CTRF, Playwright JSON, Cucumber Messages, Allure y TRX, con el código 5 y la indicación de subirlos al servidor o usar «Importar informe».
- **Con la app abierta:** falla con `db-in-use` (código 6) hasta SEC-05b.
- **Sin datos:** en una carpeta sin datos de Pharos no crea nada; sale con el código 4.
- **En CI** (`CI=true`) está prohibido, con el código 2: allí no hay un Pharos de escritorio.

## Modo remoto

El CLI sube cada informe tal cual a la API v1 del servidor (`POST /api/v1/projects/{proyecto}/results`, [ADR-0052](adr/0052-api-v1-tokens-y-webhooks.md)).

- **Formatos:** no los detecta ni los lee el CLI, sino el servidor: JUnit, CTRF, Playwright JSON, Cucumber Messages, SARIF, k6, axe y Pharos Run JSON.
- **Envío:** los ficheros de más de 64 KB van comprimidos con gzip.
- **Reintentos:** solo ante errores de red, 429 (respetando `Retry-After`), 502, 503 y 504, con tres intentos como mucho. Subir dos veces el mismo fichero no duplica nada.
- **Token:**
  - de `--token-stdin`, si no de `PHAROS_TOKEN` y si no del que guardó `pharos login` para ese servidor;
  - nunca se imprime: solo su prefijo (`phr_prj_Ab3k…`);
  - nunca va en la URL.
- **HTTPS:** `http://` solo para `localhost`. Una CA propia se indica con `PHAROS_CA_CERT=<fichero.pem>`. No se siguen redirecciones.
- **GitHub Actions:**
  - el run se llama `<workflow> · <rama> · <sha7>` y su `externalId` es el del CI, así que los jobs de una matriz convergen;
  - la tabla de resultados va a `$GITHUB_STEP_SUMMARY`;
  - `run-key`, `run-url`, `uploaded` y `failed` van a `$GITHUB_OUTPUT`;
  - los avisos y errores salen como anotaciones (`::warning`, `::error`);
  - el run queda abierto hasta `pharos run close`.

## Cómo elige el modo

1. `--local` o `--server`.
2. `PHAROS_URL` o `PHAROS_TOKEN` en el entorno: remoto.
3. `server` en `pharos.toml` o en la configuración de usuario: remoto.
4. Si no: local.

La primera línea de la salida siempre dice el modo, la carpeta o el servidor, el proyecto y la cuenta.

## Configuración

**Precedencia:** opción > variable de entorno > `pharos.toml` del proyecto (buscado hacia arriba desde la carpeta actual) > `%APPDATA%\Pharos\cli\config.toml` (`~/.config/pharos/config.toml` en Linux).

| Clave | Para qué |
|---|---|
| `project` | Proyecto por defecto |
| `server` | Servidor (pasa a modo remoto) |
| `format` | Formato por defecto |
| `report` | Patrones de informes para `watch` (L3) |
| `cycle` | Ciclo por defecto |
| `config` | Configuración por defecto |
| `lang` | Idioma |

**Ningún fichero guarda un token.** Una clave que contenga `token` es un error (código 2, `token-in-file`).

## Idioma

`--lang`, `PHAROS_LANG`, `lang` en la configuración, o el idioma del sistema: español para `es*` y, si no, inglés.

El código de error entre corchetes (`[db-in-use]`) es el mismo en los dos idiomas.

## Códigos de salida

Son estables: cambiar el significado de uno es un cambio incompatible (VERSIONING §6.6).

| Código | Significado |
|---|---|
| 0 | Todo subido (o `doctor` sin errores) |
| 1 | Error interno inesperado |
| 2 | Uso: opción mala, fichero que no existe, patrón sin coincidencias, modo local en CI, comando que aún no está |
| 3 | Autenticación: nadie ha iniciado sesión en la app (local), token inválido o sin permiso (remoto) |
| 4 | No encontrado: proyecto, run, ciclo, o carpeta sin datos de Pharos |
| 5 | Informe no válido o formato no admitido en este modo |
| 6 | La base de datos local está en uso (la app está abierta) o no se puede abrir con la clave de este equipo |
| 7 | Servidor inalcanzable, o sigue respondiendo 429 o 5xx tras los reintentos |
| 8 | Parcial: algunos ficheros se importaron y otros fallaron |

## Códigos de error frecuentes

| Código | Qué hacer |
|---|---|
| `db-in-use` | Cierra Pharos y repite, o usa el modo remoto. |
| `not-signed-in` | Abre Pharos e inicia sesión. |
| `no-data` | La carpeta no tiene datos de Pharos. Abre la app una vez o revisa `--data-dir`. |
| `project-not-found` | Mira tus proyectos con `pharos projects`. |
| `format-not-local` | Ese formato se sube al servidor (`--server`) o con «Importar informe». |
| `no-server` · `no-token` | Indica el servidor (`--server`, `PHAROS_URL`) y el token (`PHAROS_TOKEN`, `pharos login`). |
| `token_expired` · `token_revoked` · `token_inactive` | Crea o renueva el token en Pharos (Integraciones o Mi perfil). |
| `insufficient_scope` · `forbidden` | El token o su dueño no tienen permiso: para subir, `runs:write`. |
| `run_closed` | Sube a un run nuevo (sin `--run`). |
| `format_mismatch` · `invalid_report` | El informe no es lo que dice `--format`, o el servidor no lo puede leer: el detalle trae el motivo. |
| `unreachable` | Revisa la dirección, la red, la VPN o `PHAROS_CA_CERT`. |
| `invalid-report` | El detalle dice qué campo falla (`results.3.status`). |
| `token-in-file` · `token-flag` | Usa `PHAROS_TOKEN`, `--token-stdin` o `pharos login`. |
