---
section: Cambios incompatibles
---

- **Una app 0.4 queda en solo lectura frente a un servidor 0.5** (SYNC-07,
  [ADR-0042](../docs/adr/0042-revision-workspaces-sync-v2.md)):
  - recibe los datos de todos sus workspaces, pero no puede enviar cambios
    hasta que se actualiza;
  - sus cambios pendientes se conservan y se envían al actualizar;
  - la migración 0019 del servidor reordena el almacén de documentos en una
    transacción, y el sync espera mientras dura (unos 3 minutos por millón de
    documentos en un equipo de desarrollo). Conviene hacer una copia de
    seguridad de la base de datos antes de actualizar.
