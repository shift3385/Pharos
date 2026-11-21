# Integraciones (fuente del capítulo 21)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/21-integraciones.tour.ts`. Las integraciones necesitan el
servidor y un workspace compartido ([ADR-0052](../../adr/0052-api-v1-tokens-y-webhooks.md)).

Este texto se copia tal cual a `docs/manual/21-integraciones.md`: sus enlaces
se escriben como desde `docs/manual/` (`../api-v1.md`), no desde `fuentes/`.

## Para qué sirve

Las **integraciones** dejan que otras herramientas hablen con Pharos sin abrir
la app:

- **Tokens de proyecto:** un CI (GitHub Actions, Jenkins…) sube los
  resultados de sus pruebas a un proyecto, crea y cierra sus runs y lee casos,
  ciclos, defectos y requisitos. Los crea un Test Manager en
  «Integraciones».
- **Conectar CI:** el paso de GitHub Actions que sube los informes de cada
  pull request a un proyecto, listo para copiar, con los secretos que hay que
  crear en GitHub.
- **Tokens personales:** tu propia línea de comandos (el CLI `pharos`) actúa
  en tu nombre, en todos tus workspaces o en uno. Se crean en «Mi perfil».
- **Webhooks:** Pharos avisa a otra herramienta (Slack, un bot de PRs,
  Jenkins) cuando pasa algo en el workspace, con cada envío firmado. Los
  avisos salen también por lo que se hace en la app de escritorio, cuando
  llega al servidor al sincronizar.

**Antes de empezar:** todo esto vive en un workspace compartido. En este
manual es «Equipo QA», donde Liomar llevó el proyecto «Pharos» y al que se
unió su compañero Jorge L. Meneses Yero (capítulo 20, «Trabajo en equipo»).
Si trabajas solo, crea antes un workspace compartido y lleva a él el proyecto.

Un token actúa siempre **en nombre de su dueño** y nunca puede más que su rol
actual. Pharos lo enseña **una sola vez**, al crearlo; después solo guarda una
huella. Caduca en el plazo que elijas (como mucho un año) y su dueño recibe un
aviso 7 días antes.

La guía de la API, [api-v1.md](../api-v1.md), explica con ejemplos de
`curl` cómo subir resultados, leer datos y comprobar la firma de un webhook.

## La línea de comandos «pharos»

La app instala también el programa `pharos`, que se usa desde una terminal
(PowerShell o el Símbolo del sistema). La referencia completa, con todas las
opciones y los códigos de salida, está en [cli.md](../cli.md); aquí van los
trabajos de cada día.

**Instalarlo.** El instalador de Pharos deja `pharos.exe` en la carpeta `bin`
de la instalación y añade esa carpeta al PATH de tu usuario: funciona en
cualquier terminal que abras **después** de instalar. Si el instalador no pudo
tocar el PATH, o usas el MSI, llámalo por su ruta completa. Para un CI sin la
app, cada versión publica también el CLI suelto para Windows y Linux, con su
`SHA256SUMS` para comprobarlo.

**Comprobar que todo está bien.** `pharos doctor` dice qué versión tienes,
dónde está el CLI, en qué modo trabaja y qué falta: en este equipo, la sesión
de la app y la base de datos; con un servidor, si responde y de quién es el
token, con sus permisos y su caducidad. `pharos projects` lista tus proyectos
con su prefijo (en este ejemplo, `PH` de «Pharos»), que es lo que pide
`--project`.

**Local o remoto.** El CLI trabaja de dos maneras:

- **Local**, sin servidor: escribe en el Pharos de este equipo, como la cuenta
  que tiene la sesión iniciada en la app, también con la app abierta (el run
  aparece en ella en unos segundos, sin recargar). Lee **Pharos Run JSON y
  JUnit**; para otros formatos dice que los subas al servidor o uses
  «Importar informe». No funciona en un CI.
- **Remoto**, con `--server https://…`, con la variable `PHAROS_URL` o con un
  servidor guardado: sube el informe tal cual a tu servidor, que es quien lo
  lee. El servidor acepta **JUnit, CTRF, Playwright JSON, Cucumber Messages,
  SARIF, k6, axe, Pharos Run JSON, Allure** (la carpeta `allure-results`
  comprimida en un `.zip`), **TRX** de .NET y el JSON de un **`.xcresult`**
  de Xcode (el que saca `xcrun xcresulttool`).

La primera línea de cada comando dice el modo, el proyecto y la cuenta.

**Entrar y salir.** `pharos login --server https://…` pide tu token personal
(no se ve al escribirlo), lo comprueba con el servidor y lo guarda en el
Administrador de credenciales de Windows; ese servidor queda como el de por
defecto. «Mi perfil» › «Tokens personales» › «Usar en el CLI» da el comando
listo para copiar. `pharos logout` borra ese token del equipo. El token nunca
se escribe en el comando: en un CI va en la variable `PHAROS_TOKEN`.

**Subir un informe.** `pharos upload test-results/junit.xml --project PH`
crea un run con el informe. Acepta varios ficheros o un patrón
(`"reports/*.xml"`), que van todos al mismo run; `--run-name` le da nombre y
`--cycle` lo mete en un ciclo abierto. Subir dos veces el mismo fichero no
duplica nada. Con `--dry-run` ves qué haría sin escribir nada.

**Ejecutar y subir de una vez.** `pharos watch -p PH --report
"test-results/*.xml" -- npm test` comprueba antes el proyecto y el token (un
token caducado se descubre en segundos, no al final), ejecuta tus pruebas en
la misma terminal, sube solo los informes que escribieron o cambiaron y sale
con el código de las pruebas: tu CI sigue fallando cuando fallan.

**Cerrar el run de un CI.** En remoto, los jobs de una matriz de GitHub
Actions suben al mismo run, que queda abierto. `pharos run close`, en el
último job, lo cierra; `--close` cierra el run al terminar una subida suelta.

`pharos help` lo explica todo. Los mensajes salen en español o en inglés,
según el idioma de Windows (o `--lang es`).

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Tab | Formulario de un token o de un webhook | Recorre el nombre, el proyecto, los permisos y la caducidad |
| Espacio | Permisos y eventos | Marca o desmarca la casilla |
| Esc | Token o secreto recién creado | No lo cierra: marca «Lo he guardado en un sitio seguro» y pulsa «Hecho» |

## Si algo no sale

- **No veo la pestaña «Integraciones».** Solo existe en un workspace
  compartido y con conexión al servidor. En tu workspace personal no hay
  integraciones: crea uno compartido desde el selector de workspace
  (capítulo 20).
- **«Solo un Test Manager del workspace crea, rota o revoca tokens».** Pide
  a uno que cree el token de CI, o crea un token personal en «Mi perfil»
  para tu CLI.
- **El proyecto no aparece al crear un token.** Sigue en tu workspace
  personal: llévalo al workspace con «Compartir con un workspace…» (menú «⋯»
  de su fila en «Proyectos», capítulo 20).
- **El CI responde 401 `token_inactive`.** El dueño del token salió del
  workspace o se desactivó su cuenta. Un Test Manager puede «Reasignar a mí»
  el token: el secreto del CI no cambia.
- **El CI responde 403 `insufficient_scope`.** Al token le falta ese permiso.
  Crea otro con el permiso que necesita: los permisos no se editan.
- **«Los webhooks no están disponibles en este servidor».** Falta
  `WEBHOOK_SECRETS_KEY`: quien administra el servidor la configura
  ([despliegue](../despliegue.md)).
- **«Usa una dirección https»** o **«Este servidor no permite enviar a
  direcciones de la red privada…».** Un webhook solo envía a `https` y fuera
  de la red privada, salvo que el servidor lo permita
  (`WEBHOOK_ALLOW_PRIVATE` o `WEBHOOK_ALLOW_HOSTS`).
- **El paso de GitHub dice «No token (a pull request from a fork…)».** Es un
  PR desde un fork, que no tiene acceso a los secretos. No se sube nada y el
  job no falla.
- **`HTTP 401 [token_expired]` o `[token_revoked]`, en GitHub o en el CLI.**
  Crea un token nuevo en «Tokens de proyecto» y cambia el secreto
  `PHAROS_TOKEN`.
- **La terminal no encuentra `pharos`.** Abre una terminal nueva después de
  instalar. Si sigue sin encontrarlo, `pharos.exe` está en la carpeta `bin`
  de la instalación de Pharos.
- **`[project-not-found]`.** El prefijo no es el de ninguno de tus proyectos:
  mira cuáles tienes con `pharos projects`.
- **`[no-server]` o `[no-token]`.** Falta el servidor (`--server`,
  `PHAROS_URL`) o el token (`pharos login` o `PHAROS_TOKEN`).
- **`[format-not-local]`.** Ese formato solo lo lee el servidor: súbelo con
  `--server` o usa «Importar informe» en la app.
- **`[not-signed-in]`.** En modo local, el CLI usa la sesión de la app: abre
  Pharos e inicia sesión.
- **`[db-in-use]` o `[db-busy]`.** Otro Pharos está actualizando tus datos o
  escribiendo mucho a la vez (una sincronización grande). Espera unos segundos
  y repite.
- **Las entregas fallan.** «Entregas» enseña la respuesta del destino. Corrige
  el destino y pulsa «Reintentar ahora». Tras 50 fallos seguidos Pharos
  desactiva el webhook y avisa a los Test Manager: «Activar» lo enciende otra
  vez.

## En el móvil

- Los tokens y los webhooks se gestionan igual en una pantalla estrecha: las
  tablas se desplazan de lado y los formularios ocupan toda la pantalla.

## Consejos

- Un token por CI y por proyecto, con el nombre de dónde se usa: si se filtra,
  revocas solo ese.
- Da a cada token solo los permisos que necesita. Para subir resultados basta
  «Subir resultados y cerrar ejecuciones».
- Guarda el token como secreto del CI (`PHAROS_TOKEN`), nunca en el
  repositorio ni en la URL: Pharos rechaza un token en la URL, y el CLI no
  tiene opción `--token` para que no quede en el historial de la terminal.
- Antes de que caduque, «Rotar» da uno nuevo y deja el antiguo 24 h para
  cambiar el CI sin cortes.
- Con dos Test Manager en el workspace, un token de CI no se queda huérfano si
  su dueño se va: el otro lo reasigna.
- En el destino de un webhook, comprueba siempre la firma y descarta los
  envíos repetidos por su `webhook-id`.

## Véase también

- Capítulo 20, «Trabajo en equipo»: el workspace compartido, sus miembros y
  sus roles.
- Capítulo 10, «Ejecuciones e importación de resultados»: lo que sube un CI
  aparece ahí, como una importación.
- Capítulo 15, «Administración»: «Usuarios» › «Revocar sus tokens…», si un
  token se filtra.
- [Guía de la API v1](../api-v1.md), [referencia del CLI](../cli.md) y
  [despliegue](../despliegue.md).
