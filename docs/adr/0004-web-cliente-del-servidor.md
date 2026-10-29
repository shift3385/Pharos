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
