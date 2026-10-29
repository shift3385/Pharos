# ADR-0001 · Línea base: tres compuertas antes de construir encima del MVP

- **Estado:** Aceptado (decisión D1 del usuario, 2026-10-28)
- **Contexto:** cuatro auditorías independientes del 2026-10-28 (código,
  documentos, brechas frente al estudio del arte e ingeniería) encontraron que
  el MVP `0.1.0-alpha.1` cubre bien la autoría de pruebas, pero:
  - tiene fallos verificados en la sincronización y en los datos (contador de
    pendientes, paginación, ediciones perdidas en la web, datos no separados
    por usuario, campos de auditoría erróneos, IDs que se duplican entre
    equipos);
  - no tiene CI, ni pruebas E2E, ni logs;
  - todavía no decide el esquema que la ejecución (0.2.0) va a usar durante
    años.
- **Decisión:** se adoptan tres compuertas y la reordenación de hitos de
  `docs/ROADMAP.md` §3:
  - **A · Corrección** (FIX-xx, SYNC-04a, DAT-01, SYNC-06) y **B · Ingeniería**
    (BASE-xx) bloquean publicar `0.1.0`.
  - **C · Decisiones de modelo** (DAT-02, DAT-03, AUD-01, KND-01, RUN-00,
    DEF-01, CYC-01, FLD-01, TEN-01) bloquea empezar `0.2.0`. Cada una se cierra
    con su propio ADR.
- **Alternativas:** corregir solo los fallos (A); A y B sin reordenar. Se
  descartaron porque dejan para tarde cambios de esquema que salen caros cuando
  ya hay datos reales.
- **Consecuencias:** `0.1.0` se publica más tarde. Desde 0.2.0 nada se apoya en
  datos que puedan cruzarse, perderse o duplicarse, y ninguna regresión entra
  en `main` sin que falle un check.
