# ADR-0034 · Bóveda en el servidor para usar en la web la clave de escritorio

- **Estado:** Aceptado (elegido por el usuario el 2026-11-06; IA-12). **Sin
  implementar.** Enmienda [ADR-0006](0006-claves-ia-y-tls.md), que limita las claves
  de IA al keychain.
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
