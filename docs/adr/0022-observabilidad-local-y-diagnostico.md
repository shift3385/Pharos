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
    - un panic se registra antes de terminar.
  - **Regla de contenido:** un log nunca interpola contenido del usuario. Solo
    ids, nombres de comando, conteos y tipos de error. Lo que viene de fuera de
    esa regla (errores del frontend, textos de error) pasa por `redact`.
  - **Redacción** (`diag::redact` en Rust y su espejo en
    `@shared/diagnostics`): enmascara correos, JWT, `Bearer`, claves `sk-…` y
    `AIza…`, secretos en forma `clave=valor`, cadenas opacas largas que mezclan
    letras y dígitos (salvo UUID) y el usuario de Windows en las rutas. Se
    aplica al escribir los errores del frontend y otra vez al exportar.
  - **Paquete de diagnóstico** ("Exportar diagnóstico", en Administración y en
    la pantalla de error): un `.zip` con `diagnostic.json` y `logs/`.
    - **Incluye:** versión de la app, perfil de compilación, versión de Tauri,
      sistema operativo, WebView2, idioma y tema de la interfaz, migraciones
      aplicadas y las últimas 2.000 líneas de los 3 logs más recientes.
    - **Nunca incluye:** la base de datos ni su clave, el keychain (sesión,
      claves de IA), el perfil, el contenido de ninguna entidad, los ajustes
      (fondo, carpeta), las variables de entorno ni conteos de entidades.
  - **`ErrorBoundary`** en dos niveles: uno que cubre toda la app (en
    `main.tsx`) y otro por página dentro del shell, que se limpia al navegar.
    Los errores no capturados (`error`, `unhandledrejection`) también se
    registran.
  - **Perfil E2E** (`PHAROS_E2E_PROFILE=<nombre>`, solo en compilaciones
    debug): datos en `…/e2e/<nombre>`, logs en `logs/e2e/<nombre>` y la sesión
    en la cuenta `session-e2e-<nombre>` del keychain. Una compilación release
    ignora la variable.
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
