# CLI `pharos`

Referencia de la línea de comandos de Pharos (INT-01, [ADR-0054](adr/0054-cli-y-plantillas-de-github-actions.md)).

El plan completo y los bocetos están en [`design/l-int01-plan.md`](design/l-int01-plan.md). El capítulo del manual de usuario llega con «Conectar CI» (L6).

> **Estado (L1).**
>
> - **Funciona:** `upload` en modo local (Pharos Run JSON), `projects` y `doctor`.
> - **Llega más adelante:**
>   - el modo remoto y `login`/`logout`/`run close` (L2);
>   - `watch` (L3);
>   - JUnit en modo local (L4);
>   - el CLI dentro del instalador (L5);
>   - escribir con la app abierta (L7, tras SEC-05b).
>
> Mientras tanto, esos comandos responden «llega en una versión próxima» y salen con el código 2.

## Compilarlo

El binario es `pharos-cli` en Cargo y `pharos.exe` una vez instalado (L5). Desde `src-tauri/`:

```bash
cargo build --release -p pharos-cli
```

Con un directorio de target compartido, `CARGO_TARGET_DIR` decide dónde queda `pharos-cli.exe`.

## Comandos

| Comando | Qué hace |
|---|---|
| `pharos upload <fichero o patrón>… [opciones]` | Sube uno o más informes al mismo run. Los patrones (`reports/*.json`) los expande el CLI, porque PowerShell no lo hace. |
| `pharos projects` | Lista tus proyectos con su prefijo, que es lo que pide `--project`. |
| `pharos doctor` | Comprueba la versión, la configuración, el modo, la sesión y la base de datos local. Sale con 0 si solo hay avisos. |
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
| `--data-dir <ruta>` | Otra carpeta de datos (también `PHAROS_DATA_DIR`). |
| `--json` | Una línea JSON por fichero y un resumen, con claves en inglés y estables. |
| `--lang es\|en` · `--quiet` · `--no-color` | Idioma, solo errores, sin color. |

- **No existe `--token`:** quedaría en el historial del shell y en la lista de procesos. El token irá en `PHAROS_TOKEN`, `--token-stdin` o `pharos login` (L2).
- **Varios ficheros** van a un único run nuevo, que queda cerrado como completado al terminar.
- **Repetir un fichero** que ya está en el proyecto no escribe nada y no es un error («ya estaba importado en RUN-n»).

## Modo local

El CLI escribe en la base de datos de Pharos de este equipo, con el mismo código que «Importar informe» de la app.

- **Como quién:** como la cuenta que tiene la sesión iniciada en la app. La lee de su sesión en el Administrador de credenciales de Windows, sin los tokens. Sin sesión, sale con el código 3.
- **Qué lee:** Pharos Run JSON 1.x, validado como lo valida la app (`parsePharosRun`).
- **Qué rechaza:** JUnit, SARIF, k6, axe, CTRF, Playwright, Allure y TRX, con el código 5 y la indicación de subirlos al servidor o usar «Importar informe».
- **Con la app abierta:** falla con `db-in-use` (código 6) hasta SEC-05b.
- **Sin datos:** en una carpeta sin datos de Pharos no crea nada; sale con el código 4.
- **En CI** (`CI=true`) está prohibido, con el código 2: allí no hay un Pharos de escritorio.

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
| 7 | Servidor inalcanzable (L2) |
| 8 | Parcial: algunos ficheros se importaron y otros fallaron |

## Códigos de error frecuentes

| Código | Qué hacer |
|---|---|
| `db-in-use` | Cierra Pharos y repite, o usa el modo remoto. |
| `not-signed-in` | Abre Pharos e inicia sesión. |
| `no-data` | La carpeta no tiene datos de Pharos. Abre la app una vez o revisa `--data-dir`. |
| `project-not-found` | Mira tus proyectos con `pharos projects`. |
| `format-not-local` | Ese formato se sube al servidor (L2) o con «Importar informe». |
| `invalid-report` | El detalle dice qué campo falla (`results.3.status`). |
| `token-in-file` · `token-flag` | Usa `PHAROS_TOKEN`, `--token-stdin` o `pharos login`. |
