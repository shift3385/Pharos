# ADR-0002 · Conflictos de sincronización por entidad hasta 0.5.0

- **Estado:** Aceptado (decisión D2 del usuario, 2026-10-28). Enmienda la spec §9.
- **Contexto:** la spec §9 pide "last-write-wins por campo". El sync se
  implementó por entidad (decisión del 2026-08-13): HLC por cambio y un panel
  de conflictos (Fase 8C) donde se conserva una versión entera.
- **Decisión:** se mantiene la resolución **por entidad** hasta 0.5.0. La
  fusión por campo (SYNC-02) llega en 0.5.0, junto con RBAC y la API.
- **Alternativas:** fusión por campo ya. Es más fiel a la spec, pero supone un
  trabajo grande en el protocolo antes de 0.2.0, con un solo usuario y pocos
  equipos.
- **Consecuencias:**
  - El panel de conflictos ya guarda las dos versiones completas, así que la
    fusión por campo se podrá añadir sin cambiar el esquema (`sync_conflicts`).
  - Con dos equipos editando el mismo caso, se elige una versión entera.
  - La web deja de descartar ediciones sin avisar (FIX-04).
