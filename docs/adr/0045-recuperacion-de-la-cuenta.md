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
      localhost en producción (ADR-0046, pista D).
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
      transacción y con el bloqueo de escritura del usuario: `entity:
"account"`, `action: "update"`, `changes: {}` y un `summary` con
      `event` y `method`.
      - `event` puede ser `password_changed`, `recovery_codes_generated` o
        `password_reset_requested`.
      - `method` puede ser `profile`, `recovery_code`, `email_link` o, en la
        ola 2, `admin`.
      - Con `sessionsClosed` y `codesRemaining` cuando aplican.
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
- **Diseño para la ola 2 (restablecer por un administrador):**
  - **Quién puede hacerlo (regla aprobada por el usuario el 2026-11-17):** un
    Test Manager puede restablecer solo a personas con las que comparte un
    workspace y que no sean Test Manager en ningún otro workspace. Así un Test
    Manager no puede tomar la cuenta de otro.
  - La comprobación usa lo que expone la pista W (ADR-0042) en
    `server/src/modules/workspaces/`: `managedMembers(q, managerId)` para la
    lista de personas que puede restablecer y `requireCapability(cap, { from })`
    en la ruta.
  - El Test Manager genera para la persona un **enlace de un solo uso** en
    `password_reset_tokens`, con `issued_by` igual a su id (migración 0022),
    y se lo hace llegar por su canal. Nunca ve ni fija la contraseña.
  - Al usarlo, el evento de auditoría lleva `method: "admin"`. Generar el
    enlace deja además un evento en la cadena del Test Manager.
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
  - La guía de despliegue (ADR-0046) explica las variables `SMTP_*` y
    `APP_PUBLIC_URL`. Mientras no exista, las explica el README, en
    «Production configuration».
