---
section: Añadido
---

- **Workspaces compartidos con roles en el servidor** (SYNC-07, [ADR-0042](../docs/adr/0042-revision-workspaces-sync-v2.md)):
  - cada cuenta tiene su workspace personal, y cualquiera puede crear uno
    compartido, en el que es Test Manager;
  - a un workspace compartido se invita con un código de un solo uso y se le
    da a cada persona un rol: Test Manager, Test Analyst, Automation
    Engineer, Product Owner o Viewer;
  - un proyecto se comparte moviéndolo a un workspace compartido, con todo lo
    que cuelga de él;
  - el servidor comprueba el rol en cada cambio, también en la web: un Viewer
    ve y exporta, pero no edita;
  - solo el Test Manager ve la auditoría del workspace.

  La pantalla de workspaces y miembros del escritorio y de la web llega en
  la siguiente entrega de 0.5.0.
