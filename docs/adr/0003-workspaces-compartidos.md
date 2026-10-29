# ADR-0003 · Equipo en workspaces compartidos desde 0.3.0

- **Estado:** Aceptado (decisión D3 del usuario, 2026-10-28). Detalle técnico pendiente en TEN-01.
- **Contexto:** hoy hay dos modelos de pertenencia que no encajan:
  - el cliente filtra por `owner_id` y tiene `workspace_id` y `project_members`
    sin uso;
  - el servidor guarda documentos **por usuario** (`documents` con clave
    `user_id, entity, entity_id`).

  Compartir un proyecto exigiría rediseñar el protocolo de sync. Además, en el
  mismo equipo los datos de dos cuentas no están separados (FIX-07).

- **Decisión:** la colaboración se basa en **workspaces compartidos con roles**
  (Test Manager, Test Analyst, Automation Engineer, Product Owner, Viewer;
  spec §3). El servidor indexará por workspace y no por usuario. Se diseña en
  la compuerta C (TEN-01) y se implementa en **0.3.0** (SYNC-07 sube de 0.5.0),
  antes del móvil.
- **Alternativas:** mantener el modelo por usuario hasta 0.5.0. Es menos trabajo
  ahora y más caro de migrar con datos reales.
- **Consecuencias:**
  - El esquema del sync y las migraciones del servidor cambian en 0.3.0, con la
    actualización desde 0.2.0 probada (VERSIONING §6).
  - FIX-07 (separar datos por usuario en el equipo) se resuelve ya en 0.1.0,
    sin esperar a los workspaces.
