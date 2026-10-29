# ADR-0022 · Observabilidad local: logs, diagnóstico sin datos de usuario y perfil E2E

- **Estado:** Aceptado (plan de la pista B2 aprobado por el usuario el 2026-10-28;
  BASE-08, BASE-14)
- **Contexto:** la 0.1.0-alpha.1 no tenía logs, ni `ErrorBoundary`, ni forma de
  reunir datos para informar de un fallo; los errores de Rust eran `String`
  sueltos. Pharos es local-first y guarda datos de clientes, así que cualquier
  diagnóstico debe poder enviarse sin filtrar nada de eso. Además, el smoke E2E
  del binario real (BASE-14) no puede usar la base de datos ni la sesión del
  usuario.
- **Decisión:**
  - **Logs estructurados en Rust** con `tracing` + `tracing-subscriber` (JSON
    por línea) + `tracing-appender`:
    - un archivo por día, `pharos.YYYY-MM-DD.log`, se guardan 7;
    - en el directorio de logs de la app
      (`%LOCALAPPDATA%\com.pharos.desktop\logs`);
    - filtro `info`, o la directiva de `PHAROS_LOG` (sintaxis `EnvFilter`);
    - los registros del crate `log` (Tauri, wry) entran por el mismo canal;
    - un panic se escribe además de forma síncrona en `pharos.panic.log`,
      porque el escritor no bloqueante puede no vaciarse antes de que el
      proceso termine;
    - sin directorio de logs resoluble o escribible, la app arranca igual, sin
      archivo de log.
  - **Regla de contenido:** un log nunca interpola contenido del usuario. Solo
    ids, nombres de comando, conteos y tipos de error. Lo que viene de fuera de
    esa regla (errores del frontend, textos de error) pasa por `redact`. Del
    frontend solo se guarda el nombre, mensaje y pila de un `Error`; de
    cualquier otro valor lanzado o rechazado, solo su tipo. `diag_log` admite
    como mucho 20 mensajes cada 10 s.
  - **Redacción** (`diag::redact` en Rust y su espejo en
    `@shared/diagnostics`): enmascara correos, JWT, `Bearer`, claves `sk-…` y
    `AIza…`, secretos en forma `clave=valor`, cadenas opacas largas que mezclan
    letras y dígitos (salvo UUID) y el usuario de Windows en las rutas. Se
    aplica al escribir los errores del frontend y otra vez al exportar. Los dos
    redactores comparten los casos de prueba
    (`src/shared/diagnostics/redaction-fixture.json`).
  - **Paquete de diagnóstico** ("Exportar diagnóstico", en Administración y en
    la pantalla de error): un `.zip` con `diagnostic.json` y `logs/`.
    - **Incluye:** versión de la app, perfil de compilación, versión de Tauri,
      sistema operativo, WebView2, idioma y tema de la interfaz, migraciones
      aplicadas y las últimas 2.000 líneas de los 3 logs más recientes (leídas
      del último MiB de cada uno).
    - **Sin base de datos:** si la base local no abrió, el paquete se exporta
      igual, sin migraciones y con el motivo redactado (`openError`): es
      cuando más falta hace.
    - **Nunca incluye:** la base de datos ni su clave, el keychain (sesión,
      claves de IA), el perfil, el contenido de ninguna entidad, los ajustes
      (fondo, carpeta), las variables de entorno ni conteos de entidades.
  - **`ErrorBoundary`** en dos niveles: uno que cubre toda la app (en
    `main.tsx`) y otro por página dentro del shell, que se limpia al navegar.
    Los errores no capturados (`error`, `unhandledrejection`) también se
    registran.
  - **Perfil E2E** (`PHAROS_E2E_PROFILE=<nombre>`, solo en compilaciones
    debug): datos en `…/e2e/<nombre>` y logs en `logs/e2e/<nombre>`. Toda cuenta
    del keychain pasa por `instance::account(base)`, que la convierte en
    `<base>-e2e-<nombre>`: la sesión y las claves de IA. Solo la clave de la
    base local (`db-key`, de `db.rs`) se comparte con la app normal. El smoke
    borra al terminar las credenciales de su ejecución. Una compilación
    release ignora la variable.
- **Alternativas:**
  - `tauri-plugin-log` (crate `log` + fern): da API para el frontend, pero no
    ofrece campos estructurados como `tracing`, y el backlog pedía `tracing`.
  - Telemetría remota (Sentry, OpenTelemetry): queda fuera de 1.0
    (ROADMAP §1, "observabilidad remota"); el paquete local cubre el soporte
    sin enviar nada.
  - Aislar el E2E sin tocar el código, con otro usuario de Windows o una VM:
    es lento y no sirve en CI.
- **Consecuencias:**
  - Cada pista registra sus errores con `tracing::warn!`/`error!` siguiendo la
    regla de contenido; esta pista no instrumenta los módulos de otras.
  - Un test (`diag::tests::bundle_excludes_user_data`) es el criterio de
    aceptación de BASE-08: si un cambio filtra datos al paquete, falla.
  - La redacción es una red de seguridad, no un permiso: un nombre propio en
    texto libre no se detecta, por eso la regla de contenido es la primera
    defensa.
- **Actualización (pista Q1, BASE-08):** los fallos de sincronización van al
  log con `logSyncFailure` (`src/modules/sync-offline/api/syncFailure.ts`),
  con el contexto `sync: <acción>`. Aplica la regla de contenido así:
  - un error HTTP de sync (`SyncHttpError`) se escribe solo como
    `HTTP <estado> <código>`; su mensaje, que escribe el servidor (un error de
    parseo puede citar el cuerpo de la petición), no se guarda, y tampoco su
    pila, que empieza por ese mensaje;
  - un rechazo de un comando nativo (texto de Rust) guarda solo su tipo, como
    cualquier valor que no sea `Error`;
  - los cambios que el servidor rechaza se anotan en una línea por envío, con
    el tipo de entidad y el id;
  - los pasos en segundo plano (sincronización automática, recuento cada 5 s,
    envío de la web) anotan un fallo repetido una sola vez, hasta que cambia o
    el paso vuelve a funcionar, para no gastar el límite de `diag_log`.
