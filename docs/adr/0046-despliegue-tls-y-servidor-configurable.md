# ADR-0046 · Despliegue: TLS con proxy inverso y servidor configurable desde la app

- **Estado:** Aceptado. El usuario aprobó el plan, los bocetos y la opción A
  el 2026-11-17 («Sí, apruebo los cuatro»), dentro del hito 0.5.0 «Equipo»:
  - SEC-07: TLS obligatorio en un despliegue autoalojado.
  - SEC-10: servidor configurable desde la app.

  Desarrolla la regla de TLS de [ADR-0006](0006-claves-ia-y-tls.md).

- **Contexto:**
  - Para que dos personas trabajen en el mismo workspace (criterio de salida
    de 0.5.0), la app de escritorio tiene que hablar con un servidor que no
    está en el mismo equipo.
  - Hoy la dirección del servidor es `VITE_API_URL`, que se fija al compilar.
  - La CSP del escritorio solo permite `connect-src` a `localhost:3000` (y a
    Ollama en `:11434`). Abrirla a «cualquier https» dejaría que un script
    inyectado enviara datos a cualquier sitio.
  - El servidor ya tiene `TRUST_PROXY` (BASE-06), pero sirve http a
    cualquiera.

- **Decisión:**
  - **D1 · Dónde se elige: en el inicio de sesión.** Las pantallas de iniciar
    sesión y de crear cuenta muestran «Servidor: pharos.miempresa.com 🔒
    Cambiar». Al pulsar «Cambiar», la columna del formulario pasa a ser un
    panel con la dirección y la lista «Usados en este equipo».
    - «Conectar» comprueba el servidor antes de guardar nada:
      `GET /health`, que debe responder `status: "ok"`, y su versión.
    - Si falla, sigue elegido el servidor anterior. Ningún estado permite
      continuar después de un error: un certificado que no es de confianza no
      se puede saltar.
    - La dirección solo cambia con la sesión cerrada. Con la sesión abierta,
      el menú de la cuenta muestra «Conectado a …».
    - La web no muestra la línea, porque su servidor es el que la sirve.
  - **D2 · https obligatorio salvo localhost.**
    - Se guarda solo el origen (`https://host[:puerto]`). Una ruta, una
      consulta, un fragmento o unas credenciales en la dirección se rechazan.
    - Si se escribe un nombre sin esquema, se le añade `https://`.
    - Solo se acepta http con `localhost`, `127.0.0.0/8` y `[::1]`.
    - La regla se aplica en la interfaz y otra vez en Rust.
  - **D3 · CSP cerrada: las peticiones al servidor pasan por Rust (opción
    A).** La aplicación del escritorio no abre ninguna conexión al servidor
    desde la vista web.
    - Todas las peticiones pasan por `serverFetch(ruta)`
      (`@shared/platform/serverUrl`). En el escritorio, `serverFetch` llama
      al comando `server_request` (`src-tauri/src/server.rs`), que hace la
      petición con `reqwest`:
      - el origen lo guarda Rust (`server.json` en la carpeta de
        configuración de la instancia);
      - solo acepta una ruta que empiece por `/`, sin `//`, `..` ni `://`;
      - solo deja pasar las cabeceras `authorization`, `content-type`,
        `accept` y `x-pharos-*`;
      - no sigue redirecciones;
      - tiene un tiempo límite de 30 s (10 s para conectar).
    - Los certificados los valida rustls con el verificador de la
      plataforma, es decir, con el almacén de certificados de Windows. Una CA
      interna sirve en cuanto Windows confía en ella.
    - Un error de red llega a la interfaz como un `TypeError` con su tipo:
      `unreachable`, `timeout` o `tls`. Por eso el sync sigue reintentando
      igual que antes y el inicio de sesión sigue diciendo «no se puede
      conectar».
    - La CSP del escritorio **pierde** `localhost:3000` y `127.0.0.1:3000`:
      `connect-src` se queda con `ipc:` y Ollama. Es más restrictiva que
      antes.
  - **D4 · Datos locales separados por servidor y cuenta.**
    - Los datos locales ya van por cuenta (FIX-07,
      [ADR-0020](0020-sync-por-cuenta.md)), y los id de cuenta son UUID de
      cada servidor.
    - Además, cada cuenta queda atada al servidor en el que inició sesión, en
      `server.json`. Si una cuenta atada a otro servidor inicia sesión aquí,
      se rechaza (`account_other_server`) y su sesión nueva se cierra en el
      servidor. Así un servidor restaurado de una copia de otro, con los
      mismos id, nunca recibe los cambios locales del original.
    - La sesión guardada en el keychain lleva el servidor al que pertenece, y
      una sesión de otro servidor no se usa. Una sesión guardada antes de
      SEC-10 pertenece al servidor de la compilación.
    - Si al cambiar de servidor quedan cambios sin enviar al anterior, la app
      avisa y deja seguir. Los cambios se quedan en el equipo y se envían al
      volver a ese servidor con esa cuenta (estado E8).
  - **D5 · TLS lo termina un proxy inverso (Caddy); el servidor rechaza
    http (SEC-07).** Node no carga certificados. En `NODE_ENV=production`, un
    hook `onRequest` (`server/src/modules/security/httpsOnly.ts`):
    - sirve https: con `TRUST_PROXY=true`, el protocolo viene de
      `X-Forwarded-Proto`. Cada respuesta https lleva
      `Strict-Transport-Security: max-age=15552000`;
    - responde 403 `https_required` a todo http, salvo a una petición directa
      desde el propio equipo sin cabeceras de proxy (una comprobación de
      salud o un `curl` del administrador);
    - al arrancar, avisa si `TRUST_PROXY` está apagado o si `HOST` no es
      loopback. El despliegue documentado (`docs/despliegue.md`) es
      `HOST=127.0.0.1` y `TRUST_PROXY=true`, con Caddy delante.

    No se añade ninguna variable de entorno. `/health` dice además
    `service`, `version` y `accepted` (las MENOR que acepta), para que la app
    distinga un servidor incompatible (E6) antes de iniciar sesión.

- **Estados de error (bocetos E1–E8):**

  | Estado | Cuándo |
  | --- | --- |
  | E1 | Dirección no válida |
  | E2 | http a otro equipo |
  | E3 | No responde o tarda demasiado |
  | E4 | Certificado que no es de confianza |
  | E5 | Responde, pero no es Pharos (incluye una redirección) |
  | E6 | Versión no compatible: la app es demasiado antigua o el servidor lo es |
  | E7 | 403 `https_required` del servidor |
  | E8 | Cambios sin enviar al servidor anterior |

  Además, `account_other_server` se muestra en el inicio de sesión.

- **Alternativas:**
  - **B · CSP fijada al arrancar con el origen guardado.** Es igual de
    restrictiva, pero cambiar de servidor obliga a reiniciar la app, y un
    error de certificado no se distingue de «no responde».
  - **C · `connect-src https:`.** Se descartó: un XSS podría enviar datos a
    cualquier host.
  - **Que Node termine TLS con certificados en variables de entorno.** Se
    descartó: hay que renovar los certificados a mano, y Caddy lo hace solo
    (Let's Encrypt, o `tls internal` en una red interna).
  - **Elegir el servidor en Administración.** Se descartó: obliga a entrar
    antes de poder elegir dónde entrar.
  - **Fijar el certificado (pinning).** Queda fuera de alcance: complica la
    renovación y la confianza ya está en el almacén de Windows.

- **Consecuencias:**
  - Ya no se puede compilar una app que hable con varios servidores a la vez
    con sesiones abiertas: es un servidor por sesión.
  - Un script inyectado en la vista web puede llamar a `server_set` mientras
    no hay sesión. La línea «Servidor» muestra siempre a quién se envían las
    credenciales, y `server_set` se niega con la sesión abierta.
  - Las peticiones del escritorio solo llevan texto (JSON). Cuando haya
    adjuntos en el servidor (SYNC-04b), `server_request` tendrá que aceptar
    bytes.
  - Los tests que simulan el escritorio con un `fetch` falso hacen que
    `serverFetch` use ese `fetch`. El camino por Rust se prueba en
    `serverUrl.test.ts` y en `server.rs`.
  - El tour del manual fija el servidor del perfil aislado a su API
    (`server.json`), así que nunca puede llegar al puerto 3000.
  - IA-12 ([ADR-0034](0034-boveda-de-claves-ia-para-la-web.md)), que exige
    «solo HTTPS en producción», se apoya en D5.

- **Ver también:** la guía [`docs/despliegue.md`](../despliegue.md), el
  boceto de la pista D (sesión 2026-11-17) y
  [ADR-0004](0004-web-cliente-del-servidor.md) (una sola capa de plataforma).
