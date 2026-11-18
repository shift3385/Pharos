# ADR-0045 · Recuperación de la cuenta: cambiar la contraseña, códigos de recuperación y restablecer por correo

- **Estado:** Aceptado. El usuario aprobó el plan, los bocetos y las cuatro
  recomendaciones el 2026-11-17: «Sí, apruebo los cuatro». Cubre SEC-08 y
  la parte por correo de SEC-09, en el hito 0.5.0 «Equipo». El
  restablecimiento por un administrador del workspace queda para la ola 2 de
  0.5.0 y necesita los roles de ADR-0042 (pista W, revisión de los workspaces).
  Esta ADR deja preparado su diseño.
- **Contexto:**
  - Hasta 0.4.0 una cuenta no podía cambiar su contraseña ni recuperarla. Si
    alguien la olvidaba, perdía el acceso al servidor: sus proyectos ya
    sincronizados quedaban fuera de su alcance en cualquier equipo nuevo.
  - Pharos es autoalojado. Muchos servidores de equipo no tienen correo
    saliente, así que la recuperación no puede depender solo del correo.
    [ADR-0019](0019-diseno-workspaces-compartidos.md) dejó el SMTP «para el
    despliegue (0.5.0)».
  - No hay que confundirlo con SEC-03
    ([ADR-0024](0024-clave-de-recuperacion.md)). La clave de recuperación de
    la base local abre los datos cifrados de un equipo y vive en
    «Administración › Seguridad». Lo de esta ADR es la contraseña de la
    cuenta del servidor, y no toca los datos locales.
- **Decisión:**
  - **D1 · Cambiar la contraseña en «Mi perfil».** La tarjeta «Seguridad de
    la cuenta» pide la contraseña actual, la nueva y su repetición. La nueva
    sigue la regla del registro: al menos 8 caracteres y no puede ser igual a
    la actual.
    - Al guardarla, el servidor revoca las demás sesiones (sus refresh
      tokens) y mantiene la sesión desde la que se cambia.
    - También anula los enlaces de restablecimiento que hubiera abiertos.
    - Sin conexión, la tarjeta lo dice y no hace nada.
  - **D2 · Códigos de recuperación.**
    - Se generan **diez** al crear la cuenta. Llevan 10 símbolos de Crockford
      base32 (50 bits aleatorios), con el formato `XXXXX-XXXXX` y sin las
      letras I, L, O ni U.
    - La respuesta de `POST /auth/register` los trae **una sola vez**. La app
      los muestra antes de entrar, con «Copiar», «Descargar .txt» y la
      casilla «He guardado los códigos…», que habilita «Continuar». La sesión
      empieza al continuar.
    - El servidor solo guarda su hash Argon2id (migración 0021), con un coste
      menor que el de la contraseña: 4 MiB y 1 pasada. Con 50 bits de azar,
      un hash robado sigue sin poder recorrerse, y verificar hasta diez
      códigos en un intento sigue siendo rápido.
    - Cada código sirve una vez. Al comparar dan igual las mayúsculas, los
      espacios y los guiones, y O se lee como 0 e I o L como 1.
    - «Generar códigos nuevos», en «Mi perfil», pide la contraseña actual,
      anula los anteriores y muestra los nuevos una vez, en un diálogo que
      solo se cierra con «He guardado…».
    - Las cuentas creadas antes de 0.5.0 no tienen códigos. «Mi perfil» les
      avisa para que los generen, sin obligarlas.
  - **D3 · Recuperar con un código.** Se entra por «¿Olvidaste tu
    contraseña?» › «Con un código»: correo, código y contraseña nueva dos
    veces.
    - Si sale bien, el código se gasta y la contraseña cambia.
    - Se cierran **todas** las sesiones y se abre una nueva en ese
      dispositivo.
    - Si quedan 3 códigos o menos, la app avisa.
  - **D4 · Restablecer por correo (SEC-09).**
    - Es **opcional y está apagado por defecto**. Se enciende con `SMTP_HOST`
      y además exige `SMTP_FROM` y `APP_PUBLIC_URL`; las otras variables son
      `SMTP_PORT` (587), `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` y
      `RESET_TOKEN_TTL` (30 minutos).
    - Sin SMTP, `GET /auth/capabilities` responde `emailReset: false`. La
      pestaña «Por correo» lo explica, y quedan los códigos y, en la ola 2,
      el administrador.
    - El enlace es `APP_PUBLIC_URL/#/restablecer?token=…`. Se construye
      siempre con `APP_PUBLIC_URL` y **nunca** con la cabecera `Host` de la
      petición, para que no se pueda envenenar.
    - `APP_PUBLIC_URL` tiene que ser https (http solo en localhost), porque
      el enlace lleva un secreto y el servidor rechaza http fuera de
      localhost en producción ([ADR-0046](0046-despliegue-tls-y-servidor-configurable.md)).
      El servidor no arranca con un valor que no cumpla esto.
    - El token va detrás de `#`, así que no llega a los logs de ningún
      servidor. La página lo quita de la dirección en cuanto lo lee.
    - El token tiene 32 bytes aleatorios y en la tabla solo se guarda su
      SHA-256 (migración 0022).
    - **Caduca** a los 30 minutos y **sirve una vez**: la misma sentencia que
      lo comprueba lo gasta
      (`UPDATE … WHERE used_at IS NULL AND expires_at > now()`).
    - Pedir otro enlace o cambiar la contraseña anula los que hubiera
      abiertos.
    - Como mucho sale un correo por minuto y cuenta.
    - El correo, en el idioma de la app, nombra la cuenta y el servidor,
      dice cuánto dura el enlace y aclara que ignorarlo no cambia nada.
      También trae el enlace como texto, para pegarlo en la app de
      escritorio («¿Ya tienes el enlace?»).
    - La conexión exige STARTTLS cuando no empieza en TLS.
  - **D5 · Respuestas que no revelan cuentas.**
    - Un correo que no existe y un código equivocado dan el mismo error
      (`invalid_recovery`). Para que tarden lo mismo, el servidor verifica
      igualmente contra un hash señuelo.
    - Pedir un enlace responde siempre `202 sent_if_registered`, y el envío no
      se espera.
    - El único dato que se filtra es que una cuenta con cinco intentos
      fallidos queda bloqueada: es un `429` que solo aparece tras cinco
      fallos.
  - **D6 · Límites.**
    - Los POST de `/auth/password`, `/auth/recovery-codes`, `/auth/recover` y
      `/auth/reset/*` entran en el límite por IP de BASE-06
      (`LOGIN_RATE_LIMIT_*`).
    - Además, **por cuenta**: 5 códigos equivocados en 15 minutos bloquean la
      recuperación por código de esa cuenta durante 15 minutos, aunque el
      siguiente código sea bueno.
  - **D7 · Auditoría.**
    - Cada cambio deja un evento en la cadena web de la propia cuenta
      (AUD-01b, [ADR-0015](0015-registro-de-auditoria.md)), en la misma
      transacción. Va en el **workspace personal** de la cuenta (ADR-0042),
      con su bloqueo de escritura, porque la contraseña es de la persona y
      no de un proyecto compartido: los demás miembros de un workspace no
      ven estos eventos. Lleva `entity: "account"`, `action: "update"`,
      `changes: {}` y un `summary` con `event` y `method`.
      - `event` puede ser `password_changed`, `recovery_codes_generated` o
        `password_reset_requested`.
      - `method` puede ser `profile`, `recovery_code`, `email_link` o, en la
        ola 2, `admin`.
      - Con `sessionsClosed` y `codesRemaining` cuando aplican.
      - Con `aiWebKeyRemoved: true` cuando la recuperación (código, enlace o
        administrador) borró la clave de IA guardada para la web (IA-12,
        [ADR-0034](0034-boveda-de-claves-ia-para-la-web.md)).
    - Los escritorios lo reciben y lo verifican como cualquier evento web, y
      «Administración › Auditoría» lo muestra en palabras («Contraseña
      cambiada · Con un código de recuperación»).
    - Ningún evento lleva la contraseña, un código, un token ni sus hashes.
      Los intentos fallidos no se auditan, para no inundar la cadena; quedan
      contados en `account_recovery_attempts`.
    - Los primeros códigos, al crear la cuenta, **no** dejan evento. Crear la
      cuenta tampoco lo deja, y ese evento sería el único documento que una
      cuenta recién creada sincronizaría.
  - **D8 · Sesiones abiertas: hasta 15 minutos más (aceptado).**
    - Cambiar o restablecer la contraseña revoca los refresh tokens. Un token
      de acceso ya emitido sigue valiendo hasta que caduca
      (`ACCESS_TOKEN_TTL`, 15 minutos), porque los JWT no se consultan en la
      BD en cada petición.
    - Comprobar `users.password_changed_at` en cada petición quitaría ese
      margen, pero costaría una consulta por llamada. Se queda como opción si
      algún día hace falta. La columna ya existe (migración 0021).
  - **D9 · Nunca se muestra ni se registra una contraseña.**
    - Las contraseñas, los códigos y los tokens solo viajan en el cuerpo de
      las peticiones, nunca en una URL.
    - Fastify no registra cuerpos, y el log de un correo que falla solo
      guarda el id de la cuenta y el error.
    - La app no los guarda: los códigos salen de la memoria al continuar.
- **Enmienda 2026-11-18 · Administrador del servidor y restablecer por un
  administrador (SEC-11, SEC-09; ola 2).** Sustituye el diseño anterior de la
  ola 2, que daba el restablecimiento al Test Manager de un workspace. El
  usuario lo rechazó: «el administrador no puede ser el Test Manager»; aprobó
  esta versión ese mismo día («Sí, las 5»).
  - **A1 · Un rol de instancia.** El administrador del servidor es una
    columna `users.is_admin` (migración del servidor 0026), separada de los
    roles de workspace y de la matriz `workspace-roles.json`. La columna
    antigua `users.role` siempre vale `test_manager` y no autoriza nada; no se
    reutiliza. Ninguna migración local: el escritorio lo sabe por `/auth/me`.
  - **A2 · Quién lo es.**
    - La **primera cuenta** que se registra en un servidor sin
      administradores, en la misma transacción y con un bloqueo, así que dos
      registros a la vez no dan dos «primeros».
    - Las cuentas de `PHAROS_ADMINS` (correos separados por comas), al
      arrancar y al registrarse. Nunca quita el rol: es la vía para recuperar
      el acceso si se pierden todos los administradores.
    - Las que nombre otro administrador. **No se puede quitar al último**, ni
      otro administrador ni él mismo.
    - En un servidor que ya tenía cuentas, la migración nombra **la más
      antigua**: en un servidor de equipo suele ser la de quien lo instaló, y
      `PHAROS_ADMINS` corrige el caso que no encaje.
  - **A3 · Se comprueba en cada petición.** Las rutas `/admin/*` leen
    `is_admin` de la base de datos; el rol no va en el JWT, así que quitarlo
    tiene efecto al momento, aunque el token siga vivo. `/auth/me` y la sesión
    exponen `isAdmin` solo para que la app muestre u oculte la pestaña.
  - **A4 · Administración › Usuarios.** Pestaña del grupo «Aplicación» que
    solo ve un administrador. Lista **todas las cuentas** del servidor
    (nombre, correo, alta, códigos de recuperación; aprobado), con búsqueda.
    No da acceso a sus proyectos.
  - **A5 · Restablecer por un administrador (SEC-09).**
    - `POST /admin/users/:id/password-reset` genera un **enlace de un solo
      uso** en `password_reset_tokens` con `issued_by` = el administrador.
    - Dura **24 horas** (`ADMIN_RESET_TTL`), porque se entrega a mano, y
      anula los enlaces abiertos de la persona, también los del correo.
    - Con SMTP, la opción principal es **enviarlo por correo**: el
      administrador no ve el enlace. Sin SMTP, o si elige «Prefiero entregarlo
      yo», se muestra **una sola vez** para copiarlo. Sin `APP_PUBLIC_URL`,
      se muestra el código, que la persona pega en «¿Ya tienes el enlace?».
    - **No se restablece uno mismo** (eso va por «Mi perfil»). **Sí se puede
      restablecer a otro administrador**, con auditoría y aviso: podría
      quitarle el rol y restablecerlo igualmente, así que prohibirlo solo
      añadiría un paso.
    - Al usar el enlace pasa lo de siempre: se cierran todas las sesiones y
      se borra la clave de IA de la web (#88). La página de restablecer dice
      qué administrador lo generó, y el correo también.
  - **A6 · Rastro.** No hay un «workspace del servidor», así que cada acción
    deja un evento en la cadena web personal de **quien actúa** y en la de
    **la persona afectada**: `password_reset_issued` (con `delivery`),
    `admin_granted` y `admin_revoked`; al usar el enlace,
    `password_changed` con `method: "admin"` e `issuedBy`. Nunca guarda el
    enlace ni su hash. La persona recibe una notificación (RED-W2):
    `account.reset_issued`, `account.admin_granted` o
    `account.admin_revoked`.
  - **A7 · Fuera de esta enmienda.** Desactivar una cuenta es otro ítem,
    SEC-12: hay que decidir qué pasa con sus sesiones, con sus workspaces
    (sobre todo si es el último Test Manager de uno) y con su auditoría.
- **Alternativas descartadas:**
  - **Preguntas de seguridad.** Son adivinables y no las recomienda ningún
    estándar actual (NIST SP 800-63B).
  - **Correo obligatorio.** Un servidor autoalojado sin correo dejaría a sus
    usuarios sin recuperación.
  - **Un administrador que fija una contraseña temporal.** Vería la
    contraseña. El enlace de un solo uso da el mismo resultado sin que nadie
    la vea.
  - **Hash SHA-256 con pimienta para los códigos.** Con 50 bits, un servidor
    comprometido junto con su secreto permitiría recorrerlos. Argon2id cuesta
    poco aquí y no depende de un secreto.
  - **El token en la query de la URL.** Acabaría en los logs del servidor web
    y del proxy. Detrás de `#` no sale del navegador.
- **Consecuencias:**
  - El registro tiene un paso más: los códigos. El tour del capítulo 1 lo
    recorre.
  - Hay dos migraciones del servidor, aditivas y sin datos que convertir:
    - 0021: `account_recovery_codes`, `account_recovery_attempts` y
      `users.password_changed_at`;
    - 0022: `password_reset_tokens`.
  - Una app 0.4 contra un servidor 0.5 sigue funcionando: ignora
    `recoveryCodes` y no conoce las rutas nuevas.
  - Hay una dependencia nueva en el servidor, `nodemailer` (MIT-0), que solo
    se usa con SMTP configurado.
  - «Mi perfil» muestra en la web y en el escritorio una tarjeta que necesita
    conexión.
  - (Enmienda 2026-11-18) Migración del servidor 0026 (`users.is_admin`) y
    las variables `PHAROS_ADMINS` y `ADMIN_RESET_TTL`. Tres tipos de
    notificación nuevos. La lista de cuentas solo la ve un administrador, y
    sus rutas responden `403 admin_required` a cualquier otra persona.
  - La guía de despliegue ([`docs/despliegue.md`](../despliegue.md),
    apartado «Correo para restablecer contraseñas»;
    [ADR-0046](0046-despliegue-tls-y-servidor-configurable.md)) explica las
    variables `SMTP_*` y `APP_PUBLIC_URL`. El README las recoge en
    «Production configuration», y `docker-compose.yml` se las pasa a la API,
    vacías (correo apagado) por defecto.
