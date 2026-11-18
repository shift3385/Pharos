# Desplegar el servidor de Pharos para un equipo

Esta guía es para quien instala el servidor de Pharos y lo comparte con su
equipo (SEC-07 y SEC-10, [ADR-0046](adr/0046-despliegue-tls-y-servidor-configurable.md)).
Cada persona instala la app de escritorio, escribe la dirección del servidor
en la pantalla de inicio de sesión («Servidor: … · Cambiar») y trabaja con él.

## Lo que exige Pharos

- **https.** La app solo se conecta con https a un servidor que no esté en el
  mismo equipo. Con `NODE_ENV=production`, el servidor responde
  `403 https_required` a toda petición http que no venga del propio equipo.
- **Un certificado en el que confíe Windows.** La app valida el certificado
  con el almacén de Windows y no deja seguir si falla. Ningún botón permite
  saltarse un certificado caducado, de otro nombre o autofirmado.
- **Un proxy inverso que termine el TLS.** El servidor de Pharos no carga
  certificados. Delante va un proxy (esta guía usa [Caddy](https://caddyserver.com)).
  El proxy le pasa `X-Forwarded-Proto` y `X-Forwarded-For`, y el servidor
  confía en esas cabeceras con `TRUST_PROXY=true`.

```
App de escritorio ──https──► Caddy :443 ──http──► API de Pharos 127.0.0.1:3000 ──► PostgreSQL
```

## Opción 1 · Docker Compose (recomendada)

El `docker-compose.yml` de la raíz trae tres servicios:

- `db`: PostgreSQL;
- `api`: el servidor, en producción y con `TRUST_PROXY=true`. Su puerto no se
  publica fuera de la red de Docker;
- `caddy`: escucha en los puertos 80 y 443, y redirige 80 a 443.

1. Copia `.env.example` a `.env` y fija estas variables:
   - `JWT_ACCESS_SECRET`: un valor aleatorio de 32 caracteres o más.
   - `CORS_ORIGIN`: la URL de la web, si la usas. La app de escritorio no
     necesita CORS porque sus peticiones salen del núcleo Rust, no del
     navegador.
   - `PHAROS_DOMAIN`: el nombre con el que se llega al servidor, por ejemplo
     `pharos.miempresa.com`.
   - `POSTGRES_PASSWORD`: una contraseña propia.
2. Arranca todo:

   ```bash
   docker compose up -d --build
   ```

3. En la app, en el inicio de sesión, pulsa «Cambiar» junto a «Servidor» y
   escribe `https://pharos.miempresa.com`.

Con un **dominio público**, con los puertos 80 y 443 abiertos y el DNS
apuntando a esta máquina, Caddy obtiene y renueva solo el certificado de
Let's Encrypt.

Con un **nombre interno** (`pharos.miempresa.lan`) o una IP, quita el `#` de
`tls internal` en `deploy/Caddyfile` y sigue «Certificado interno» más abajo.

## Opción 2 · Un servidor sin Docker

1. Instala Node.js 20 o superior y PostgreSQL. Arranca la API con estas
   variables:

   ```
   NODE_ENV=production
   HOST=127.0.0.1
   PORT=3000
   TRUST_PROXY=true
   DATABASE_URL=postgres://…
   JWT_ACCESS_SECRET=…
   CORS_ORIGIN=https://pharos.miempresa.com
   ```

   Con `HOST=127.0.0.1` la API solo escucha en esta máquina, y la única
   forma de llegar a ella desde fuera es el proxy.

2. Instala Caddy y usa este `Caddyfile`:

   ```
   pharos.miempresa.com {
   	encode zstd gzip
   	reverse_proxy 127.0.0.1:3000
   }
   ```

   Caddy envía `X-Forwarded-Proto` y `X-Forwarded-For` sin configurar nada
   más.

Si usas otro proxy (nginx, IIS, un balanceador), tiene que:

- terminar TLS;
- enviar `X-Forwarded-Proto: https` y `X-Forwarded-For`;
- redirigir http a https.

## Correo para restablecer contraseñas (opcional)

Sin correo, cada persona recupera su cuenta con los códigos de recuperación
que Pharos le enseña al crearla ([ADR-0045](adr/0045-recuperacion-de-la-cuenta.md)).
Si el servidor puede enviar correo, «¿Olvidaste tu contraseña?» › «Por correo»
manda además un enlace que caduca a los 30 minutos y sirve una vez.

Está apagado por defecto. Para encenderlo, fija en `.env`:

- `SMTP_HOST`, y `SMTP_PORT` si no es 587. Con el puerto 465, pon también
  `SMTP_SECURE=true`. En los demás, el servidor exige STARTTLS.
- `SMTP_USER` y `SMTP_PASS`, si tu servidor de correo pide credenciales.
- `SMTP_FROM`, el remitente, por ejemplo `Pharos <no-reply@miempresa.com>`.
- `APP_PUBLIC_URL`: la dirección https de la versión web, que es la que abre
  el enlace (`…/#/restablecer?token=…`). Sin versión web, pon la del servidor:
  en la app de escritorio, el enlace se pega en «¿Ya tienes el enlace?».

Si falta `SMTP_FROM` o `APP_PUBLIC_URL`, o si la dirección no es https, el
servidor no arranca y dice por qué. El enlace se construye siempre con
`APP_PUBLIC_URL`, nunca con la dirección que llega en la petición.

## Administradores del servidor

La primera cuenta que se registra en el servidor es su administradora; en un
servidor que ya tenía cuentas, lo es la más antigua
([ADR-0045](adr/0045-recuperacion-de-la-cuenta.md), SEC-11). Un administrador
ve «Administración › Usuarios»: todas las cuentas, restablecer contraseñas con
un enlace de un solo uso y nombrar o quitar administradores. Siempre queda uno.

- `PHAROS_ADMINS`: correos separados por comas. Esas cuentas pasan a ser
  administradoras al arrancar el servidor y al registrarse. Nunca quita a
  nadie. Es la forma de recuperar el acceso si se pierden todos los
  administradores: añade el correo, reinicia la API y entra con esa cuenta.
- `ADMIN_RESET_TTL`: cuánto dura un enlace generado por un administrador
  (24 horas por defecto; un solo uso).

## Certificado interno

Para un nombre interno o una IP, Caddy crea su propia autoridad (CA). La app
confía en ella solo si Windows confía. Lo hace quien administra los equipos,
no la app.

1. Copia el certificado raíz de Caddy:
   - con Docker: `docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt`;
   - sin Docker: `%APPDATA%\Caddy\pki\authorities\local\root.crt` en Windows, o
     `~/.local/share/caddy/pki/authorities/local/root.crt` en Linux.
2. En cada equipo, impórtalo en «Entidades de certificación raíz de
   confianza». Puedes hacerlo con `certmgr.msc`, con
   `certutil -addstore -f Root caddy-root.crt` (como administrador) o, en un
   dominio, por directiva de grupo.

Si tu empresa ya tiene una CA interna, puedes darle a Caddy un certificado
emitido por ella (`tls cert.pem key.pem`). Los equipos ya confían en esa CA.

## Comprobar el despliegue

Desde otro equipo:

```bash
curl https://pharos.miempresa.com/health
```

Debe responder algo como
`{"status":"ok","service":"pharos","version":"0.5.0","accepted":["0.5","0.4"]}`.

Al arrancar, la API avisa en el log de dos errores típicos de despliegue:
`TRUST_PROXY` apagado y una API que escucha fuera de `127.0.0.1`.

## IA en la web (opcional)

Quien tiene su clave de IA en la app de escritorio puede usarla también en la
web: activa «Usar esta clave también en la web» en Motor de IA y la app sube
una copia al servidor (IA-12, [ADR-0034](adr/0034-boveda-de-claves-ia-para-la-web.md)).
Para que el servidor lo permita:

1. Genera una clave maestra de 32 bytes:

   ```bash
   openssl rand -base64 32
   ```

2. Ponla en `AI_VAULT_KEY` (en el `.env` de Docker Compose o en el entorno de
   la API) y reinicia la API.

Sin `AI_VAULT_KEY` la función queda apagada y el servidor arranca igual: la
app dice «Tu servidor no tiene activada la IA en la web».

- **Guarda `AI_VAULT_KEY` fuera de las copias de la base de datos.** Quien
  tenga las dos puede leer las claves de IA guardadas. Tú, como administrador,
  también: el aviso que acepta cada persona lo dice.
- **Si la cambias**, las copias guardadas dejan de poder leerse. Cada persona
  ve «Hay que volver a subirla» y la sube otra vez desde su escritorio. No hace
  falta borrar nada.
- **Límites por cuenta:**
  - 30 peticiones de IA por minuto (`AI_CHAT_RATE_LIMIT_MAX`);
  - como mucho 3 a la vez;
  - 10 subidas o borrados de la clave por hora (`AI_VAULT_RATE_LIMIT_MAX`).

  El uso se cobra a la clave de cada persona.
- El servidor llama a Gemini, OpenAI, Claude y OpenRouter, así que necesita
  salida a internet hacia ellos. «Compatible» no está disponible en la web.
- **Copias de una clave maestra anterior.** No se borran solas: si vuelves a
  la clave anterior, se pueden leer otra vez. Para borrarlas, ejecuta
  `DELETE FROM ai_vault WHERE kek_id <> '<id>';` con el `kek_id` de una fila
  que se haya subido después del cambio.
- **Sesiones cerradas.** El servidor no comprueba los tokens de acceso contra
  la base de datos. Una sesión cerrada puede seguir usando la IA de la web
  hasta que caduque su token (`ACCESS_TOKEN_TTL`, 15 minutos por defecto).
  Para cortarlo antes, borra la copia: la persona puede hacerlo desde la web o
  el escritorio, y tú con `DELETE FROM ai_vault WHERE user_id = '…';`.
- **Recuperar una cuenta borra su copia.** Con un código de recuperación, un
  enlace por correo o un enlace que des tú, la clave guardada se borra, porque
  quien recupera la cuenta puede no ser su dueño. El dueño la vuelve a subir
  desde su escritorio. Cambiar la contraseña desde «Mi perfil» no la borra.

## Si algo no sale

| Lo que dice la app | Causa probable | Qué hacer |
| --- | --- | --- |
| «Pharos solo se conecta con https:// a otro equipo» | Se escribió `http://` con un nombre o una IP de otra máquina | Usa la dirección `https://` del proxy |
| «… no responde» | DNS, cortafuegos, puertos 80/443 cerrados o falta la VPN | Prueba `curl https://…/health` desde ese equipo |
| «No se puede comprobar la identidad de …» | Certificado caducado, de otro nombre o de una CA en la que Windows no confía | Revisa el nombre de `PHAROS_DOMAIN` y sigue «Certificado interno» |
| «Esa dirección responde, pero no es un servidor de Pharos» | El proxy apunta a otra aplicación o devuelve una redirección | Revisa `reverse_proxy` en el `Caddyfile` |
| «El servidor rechazó la conexión por no estar cifrada» (`https_required`) | La API no sabe que la conexión era https: falta `TRUST_PROXY=true` o el proxy no envía `X-Forwarded-Proto` | Activa `TRUST_PROXY=true` y revisa el proxy |
| «Este servidor necesita una versión más nueva de Pharos» o «Este servidor tiene una versión anterior» | La app y el servidor son de MENOR distintas (VERSIONING §6.5) | Actualiza la app o el servidor |

## Desarrollo

Nada de esto afecta al desarrollo. Con `NODE_ENV=development` (el valor por
defecto) la API sirve http, y la app usa `http://localhost:3000` («Este
equipo») mientras nadie elija otro servidor.
