# ADR-0006 · Claves de IA en el keychain; TLS al desplegar

- **Estado:** Aceptado (decisión D6 del usuario, 2026-10-28). Enmienda la spec §4.
- **Contexto:** la spec §4 pide cifrar las claves de IA con AES-256-GCM y una
  clave derivada de la sesión, y exige TLS en tránsito. Hoy cada clave va solo
  al Administrador de credenciales de Windows, que ya la cifra con la cuenta
  del usuario, y la API local corre en `http://localhost:3000`.
- **Decisión:**
  - Las claves de IA se guardan **solo en el keychain del sistema**, una por
    proveedor. Nunca pasan por la interfaz ni por los logs, nunca van en una
    URL y nunca se sincronizan.
  - **TLS** se exige cuando haya despliegue autoalojado (SEC-07, 0.5.0).
  - En desarrollo, http solo en localhost.
- **Alternativas:** añadir el cifrado derivado de la sesión sobre el keychain.
  Se descartó porque añade complejidad sin una amenaza real que cubrir: el
  keychain ya está ligado a la cuenta del usuario.
- **Consecuencias:**
  - El endpoint compatible con OpenAI personalizado debe ser https (http solo
    en localhost), para que una clave no viaje sin cifrar (implementado en
    IA-08).
  - SEC-07 entra en el backlog para 0.5.0.
- **Ver también:** [ADR-0024](0024-clave-de-recuperacion.md) aplica la misma
  regla a la clave de la base de datos local y añade su clave de recuperación.
