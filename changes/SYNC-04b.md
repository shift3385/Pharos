---
section: Añadido
---

- **Los adjuntos y las plantillas se sincronizan con tu workspace**
  (SYNC-04b, [ADR-0042](../docs/adr/0042-revision-workspaces-sync-v2.md)):
  - las evidencias de tarjetas, defectos, resultados e informes importados, y
    tus plantillas de plan y de casos, llegan a los demás equipos de tu
    workspace;
  - el archivo viaja aparte, una sola vez por contenido: el equipo lo sube
    antes de enviar el cambio que lo usa y los demás lo bajan después de
    sincronizar, cifrado como cualquier evidencia;
  - un archivo que aún no ha llegado lo dice al abrirlo; se intenta otra vez
    en la siguiente sincronización;
  - añadir adjuntos requiere un rol que lo permita (Viewer no puede), y
    editar plantillas, Test Manager o Test Analyst;
  - los adjuntos de una ejecución manual en curso se quedan en este equipo
    hasta que guardas el resultado.

  Tus plantillas pasan al almacén de evidencias al actualizar; la copia de
  seguridad previa a la migración las conserva como estaban.
