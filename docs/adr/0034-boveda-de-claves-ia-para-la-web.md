# ADR-0034 · Bóveda en el servidor para usar en la web la clave de escritorio

- **Estado:** Aceptado (elegido por el usuario el 2026-11-06; IA-12). Implementado
  el 2026-11-17 en la pista I de 0.5.0: ver «Enmienda IA-12» al final. Enmienda
  [ADR-0006](0006-claves-ia-y-tls.md), que limita las claves de IA al keychain.
- **Contexto:** una persona con su clave de IA en la app de escritorio inicia sesión
  en la web con la misma cuenta y no puede usar «Asistir con IA»: la clave solo está
  en el keychain de ese Windows, el proveedor y el modelo en el `localStorage` de ese
  equipo, y el servidor no tiene código de IA.
- **Decisión:**
  - **Interruptor en escritorio**, en Motor de IA: «Usar esta clave también en la web».
    Por defecto, desactivado. Al activarlo, Rust lee la clave del keychain y la envía
    al servidor, sin pasar por el frontend. Al desactivarlo, la copia se **borra**.
  - **Bóveda:** una clave por usuario, cifrada con AES-256-GCM y una clave maestra
    `AI_VAULT_KEY` fuera de la base de datos. Ninguna ruta la devuelve. Sin esa
    variable la función queda desactivada, sin impedir que arranque el servidor.
  - **Web → servidor → proveedor:** `POST /ai/chat` por `aiChatWithProvenance`, el
    único punto por el que pasa la IA; `PUT`, `GET` y `DELETE /ai/web-access` para la
    configuración.
  - **Protecciones:** solo HTTPS en producción, límite de uso por usuario y ni la
    clave ni el contenido de las peticiones en los registros.
  - **«Compatible» queda fuera** de la primera versión: el servidor no alcanza un
    servidor local y una URL arbitraria permitiría atacar redes internas.
- **Alternativas:**
  - Cifrado con una frase del usuario: el servidor no podría leerla, pero pide la frase
    en cada sesión, expone la clave en el navegador y depende de CORS.
  - Clave por navegador: sin custodia, pero no reutiliza la configuración de escritorio.
  - Escritorio como puente: la clave no sale del equipo, pero solo funciona con el
    escritorio encendido y conectado.
- **Consecuencias:**
  - Pharos custodia claves: quien tenga a la vez la base de datos y `AI_VAULT_KEY` puede
    leerlas, incluido el administrador de una instalación propia. El aviso al activar
    debe decirlo.
  - El uso desde la web se cobra a la clave del usuario.
  - Reserva la migración del servidor `0016`. Exige una revisión de seguridad
    independiente antes de fusionar.

## Enmienda IA-12 (2026-11-17)

Implementación aprobada por el usuario con los bocetos de la pista I de 0.5.0.
No cambia la decisión. Concreta lo siguiente:

- **La clave es por usuario, también con workspaces** (ADR-0042). El uso desde
  cualquier workspace se cobra a la clave de quien hace la petición. El
  «interruptor de administración» es `AI_VAULT_KEY` en el servidor: no hay
  política por workspace.
- **Bóveda** (`server/src/modules/ai/`, migración `0016_ai_vault.sql`):
  - una fila por usuario, `ON DELETE CASCADE` sobre `users`;
  - AES-256-GCM con un nonce aleatorio de 96 bits en cada escritura y la
    etiqueta de 128 bits al final del texto cifrado;
  - los datos asociados atan cada copia a su usuario y a su proveedor: una fila
    copiada a otra cuenta no se descifra;
  - `kek_id` (64 bits de un SHA-256 con dominio propio) distingue las filas de
    otra `AI_VAULT_KEY`. Esas filas se muestran como «Hay que volver a
    subirla» y nunca se intentan descifrar;
  - una `AI_VAULT_KEY` mal formada impide arrancar, sin repetir su valor; sin
    ella, la función queda apagada.
- **Rutas:** `GET`, `PUT` y `DELETE /ai/web-access`, y `POST /ai/chat`.
  - Solo actúan sobre la cuenta de la sesión; ninguna recibe un id de usuario.
  - La web lee el estado y borra la copia, pero nunca la sube.
  - Las rutas tienen su propio manejador de errores, que nunca repite lo
    recibido; los errores del proveedor se devuelven sin la clave.
  - El servidor llama solo a las cuatro URL fijas, sin seguir redirecciones.
- **Escritorio:** `ai_web_access_upload` lee el keychain y envía la clave con
  el mismo cliente y las mismas reglas que `server_request`:
  - https salvo a este equipo, y sin redirecciones;
  - la clave no pasa por la vista web;
  - `ServerRequest` deja de implementar `Debug`.
- **Consentimiento:** un diálogo con casilla nombra el servidor y dice lo que
  el ADR pide. Con el interruptor activo:
  - una clave nueva del mismo proveedor se vuelve a subir sola, como avisa el
    diálogo;
  - cambiar el modelo pregunta antes;
  - cambiar de proveedor vuelve a pedir el consentimiento;
  - quitar la clave del escritorio borra la copia.
- **Límites por cuenta** (configurables):
  - 30 peticiones de IA por minuto;
  - 10 subidas o borrados por hora;
  - 3 peticiones de IA esperando al proveedor a la vez;
  - un cuerpo de hasta 20 MiB solo en `/ai/chat`, por las imágenes (IA-18).

### Revisión de seguridad independiente

La exige este ADR. La hizo un agente aparte con otro modelo (Claude Sonnet)
sobre el diff y este ADR, sin las conclusiones del autor. No encontró nada
crítico ni alto. Confirmó:

- el cifrado y dónde vive la KEK;
- que la clave no aparece en logs, errores ni respuestas;
- el control de acceso;
- https;
- el borrado en cascada.

Hallazgos y lo que se hizo con cada uno:

1. **Medio: `/ai/chat` leía hasta 20 MiB antes de comprobar la sesión.**
   Corregido: la autenticación, la versión y los límites corren en
   `onRequest`, antes de leer el cuerpo. Sin sesión o por encima del límite, el
   cuerpo no se lee. Hay prueba.
2. **Medio-bajo: el comando de Rust aceptaba el token de la vista web.** Un
   script inyectado podía subir la clave a otra cuenta del mismo servidor.
   Corregido: Rust usa la sesión que guarda para el servidor elegido y fija las
   cabeceras. La vista web solo nombra el proveedor y el modelo.
   - Riesgo que se acepta: un script inyectado en la vista web todavía podría
     subir la clave a la cuenta propia sin pasar por el diálogo. Un registro de
     consentimiento en Rust no lo impediría, porque el mismo script podría
     escribirlo. La defensa es la CSP de la vista web (ADR-0046), que no deja
     conectar con ningún otro sitio.
3. **Bajo: qué borra la copia.** La borran `DELETE`, quitar la clave en el
   escritorio y el borrado de la cuenta (cascada). Hoy el servidor no tiene una
   ruta para borrar cuentas.
   - Si se añade una baja que no borre la fila de `users`, debe borrar la de
     `ai_vault`.
   - Si se añade un restablecimiento de contraseña (SEC-08/09), debe valorar
     borrarla.
   - Los tokens de acceso no se comprueban contra la base de datos: una sesión
     cerrada puede usar `/ai/chat` hasta que caduque su token, 15 minutos por
     defecto. Está documentado en `docs/despliegue.md`.
   - Las filas de una `AI_VAULT_KEY` anterior no se borran solas, para que
     volver a la clave anterior las recupere. La guía da la consulta para
     purgarlas.
4. **Bajo: concurrencia y abuso de salida.** Corregido: como mucho 3
   peticiones de IA por cuenta esperando a la vez. No se comprueba la clave con
   el proveedor al subirla: el destino son cuatro URL fijas y el límite es por
   cuenta.
5. **Informativos:** no hay varias KEK a la vez, así que rotar obliga a volver a
   subir (documentado); `kek_id` no revela la KEK; los errores del proveedor
   vuelven, sin la clave, solo a su dueño.

