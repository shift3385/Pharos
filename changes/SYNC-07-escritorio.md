---
section: Añadido
---

- **El escritorio sincroniza por workspace** (SYNC-07, [ADR-0042](../docs/adr/0042-revision-workspaces-sync-v2.md)):
  - con un servidor que tiene workspaces compartidos, cada proyecto viaja
    a su workspace;
  - en la primera sincronización, tus proyectos de este equipo pasan a tu
    workspace personal. Antes se guarda una copia de seguridad,
    `pharos.db.enc.bak-…-workspaces`;
  - lo que tu rol no permite no se guarda, y se te explica por qué;
  - un cambio que el servidor rechaza por permisos espera a que lo
    descartes;
  - si te quitan de un workspace, su copia en este equipo no se borra hasta
    que lo confirmes.

  La pantalla de workspaces y miembros llega en la siguiente entrega.
