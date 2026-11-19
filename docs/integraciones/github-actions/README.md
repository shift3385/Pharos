# Pharos en GitHub Actions

Plantillas para que cada PR reporte sus pruebas a Pharos (INT-04, [ADR-0054](../../adr/0054-cli-y-plantillas-de-github-actions.md) §5).

Usan la acción [`pharos-report`](../../../.github/actions/pharos-report/action.yml) de este repositorio. La acción:

- sube cada informe tal cual a la API v1 del servidor, que detecta el formato: JUnit, SARIF, k6, axe, CTRF, Playwright JSON, Cucumber Messages y Pharos Run JSON;
- solo necesita `bash` y `curl`, más `jq` o `node`; todos los runners de GitHub los tienen.

| Plantilla | Para qué |
|---|---|
| [`pharos-pr.yml`](pharos-pr.yml) | Un job que ejecuta las pruebas y sube **JUnit, SARIF, k6 y axe** al mismo run. Es el criterio de salida de 0.6.0. |
| [`pharos-matriz.yml`](pharos-matriz.yml) | Una matriz de navegadores. Cada job sube su informe y todos convergen en un run; un último job lo cierra. |
| [`pharos-cli-windows.yml`](pharos-cli-windows.yml) | Un runner Windows con el CLI: `pharos watch` comprueba el token, ejecuta las pruebas, sube sus informes y sale con el código de las pruebas. |

## Antes de usarlas, en GitHub

En **Settings › Secrets and variables › Actions** de tu repositorio:

1. **Secreto `PHAROS_TOKEN`:** un token de proyecto de Pharos (Workspace › Integraciones › Tokens de proyecto) con `runs:write`. Solo se ve al crearlo.
2. **Variable `PHAROS_URL`:** la dirección de tu servidor, `https://…`.

Después, cambia en la plantilla:

- `@<SHA-de-40-caracteres>` por el SHA completo del commit (o la etiqueta de versión) de este repositorio que quieras usar;
- `project: PAG` por el prefijo de tu proyecto;
- las rutas de los informes y los comandos de tus pruebas.

## La acción

| Entrada | Qué es |
|---|---|
| `server` | El servidor: `https://…` (`http://` solo para `localhost`). |
| `token` | El token, siempre desde un secreto. |
| `project` | El prefijo de ids de caso del proyecto (`PAG`) o su id. |
| `files` | Los informes, uno por línea. Admite patrones con `*` y `**`. |
| `format` | Opcional. El servidor detecta el formato; si se indica, solo lo comprueba. |
| `run-name` | Opcional. Por defecto, `<workflow> · <rama> · <sha7>`. |
| `external-id` | Opcional. Por defecto, `github:<repo>:<run_id>:<intento>`, así que todos los jobs de un workflow van a un run. |
| `cycle`, `configuration`, `case` | Opcionales. Ciclo del run nuevo, configuración y caso de los resultados que no los traen. |
| `close` | `true` cierra el run al terminar: el último job de una matriz. |
| `fail-on-error` | `true` por defecto: si una subida falla, falla el paso. |

| Salida | Qué es |
|---|---|
| `run-key`, `run-url` | El run (`RUN-n`) y su enlace, si el servidor lo da. |
| `uploaded`, `failed` | Ficheros subidos y fallidos. |

**Qué hace en el job:**

- la página del job muestra una tabla con lo subido (`$GITHUB_STEP_SUMMARY`);
- los tests sin caso salen como un aviso;
- cada fichero que falla sale como un error, con el código y el motivo del servidor.

## Seguridad

- **Acciones fijadas por SHA:** toda acción va fijada por el SHA completo de un commit, con la versión en un comentario, y las herramientas de npm van a una versión exacta. Una etiqueta se puede mover; un SHA no.
  - En este repositorio lo comprueba `scripts/actions-pinned.test.mjs`, tanto en `.github/` como en estas plantillas.
  - Dependabot mantiene al día las de `.github/`.
- **El token:**
  - entra por `env` y llega a `curl` por la entrada estándar, nunca como argumento;
  - la acción lo enmascara en el log.
- **Disparadores:** solo `pull_request`, nunca `pull_request_target`.
  - Un PR desde un fork no recibe secretos: la acción lo dice y no hace nada, sin romper el job.
  - Con `pull_request_target`, el código del fork correría con tus secretos.
- **Permisos:** `permissions: contents: read`. El token de Pharos va aparte.
- **Sin redirecciones:** la acción no las sigue, porque el token iría detrás.

## Cómo se prueba

- `node scripts/int04-smoke.mjs` levanta un servidor en el puerto 3120 con su propia base de datos y ejecuta el script de la acción contra él:
  - los cuatro formatos en un run;
  - una matriz que converge y se cierra;
  - un token malo;
  - un PR desde un fork;
  - un informe que no existe.
- En cada PR que toca la acción, la subida de la API o los parsers, el workflow [`pharos-selftest.yml`](../../../.github/workflows/pharos-selftest.yml) hace lo mismo dentro del runner, con la acción de esa rama. Es el criterio de salida de 0.6.0 cumplido en un PR de verdad.
