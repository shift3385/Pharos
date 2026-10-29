# ADR-0004 · La web es un cliente del servidor

- **Estado:** Aceptado (decisión D4 del usuario, 2026-10-28)
- **Contexto:** en el navegador no existe el núcleo Rust, así que cada `*Api.ts`
  reimplementa el dominio sobre `localStorage`, con `isTauri()` copiado en unos
  10 archivos. Esa segunda implementación ya difiere del núcleo:
  - borra sin cascada;
  - reutiliza claves de defecto;
  - guarda revisiones solo con el título;
  - no comprueba el dueño.

  Además, si la web pierde un conflicto descarta la edición sin avisar.

- **Decisión:** la web es un **cliente del servidor**. Lee y escribe a través
  del backend, sin una segunda implementación del dominio. El acceso a la
  plataforma se centraliza en una sola capa (`@shared/platform`, BASE-10).
- **Alternativas:**
  - Web solo de demostración, sin garantías.
  - Mantener las dos implementaciones con tests de paridad. Se descartó porque
    duplica el coste de cada funcionalidad.
- **Consecuencias:**
  - Sin conexión, la web no funciona; el modo offline es solo de escritorio.
  - El backend necesitará endpoints de dominio a medida que la web los use.
  - FIX-04 (avisar del conflicto y no perder la edición) se resuelve en este
    marco.
- **Implementación (BASE-10, 2026-10-29):**
  - `@shared/platform` (`isTauri`, `invoke`, `capabilities`) sustituye las
    copias de `isTauri()`.
  - El servidor expone una API de dominio (`/api/*`, módulo `domain`) que
    aplica las reglas del núcleo sobre el mismo almacén de documentos: cada
    escritura web es un documento con revisión, `seq` y HLC del servidor, y los
    escritorios la reciben en el pull.
  - Cada actualización o borrado web lleva la revisión que leyó; si cambió, el
    servidor responde 409 `stale_write` con su versión: se avisa, la edición
    sigue en el formulario y guardar de nuevo la reemplaza (FIX-04).
  - Desaparecen la bandeja de salida, los conflictos y las cachés web. Lo que
    dejó una versión anterior se envía una vez y lo que no entra se descarga
    en un archivo.
  - Hasta SYNC-04b, adjuntos, plantillas propias e historial de revisiones son
    solo de escritorio; la web muestra las plantillas incluidas.
