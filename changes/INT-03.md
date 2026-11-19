---
section: Añadido
---

- **Webhooks: Pharos avisa a otras herramientas.** En la pestaña «Integraciones» del workspace, un Test Manager crea webhooks que reciben eventos firmados cuando:
  - se crea un run, se suben resultados o se cierra un run;
  - se cierra un ciclo;
  - se crea un defecto o cambia de estado;
  - se aprueba o se devuelve un caso o un plan.
- Los avisos salen también por lo que se hace en el escritorio, al sincronizar.
- «Entregas» enseña qué se envió y qué respondió el destino, y permite reintentar.
- Si un destino falla 50 veces seguidas, el webhook se desactiva y los Test Manager reciben un aviso.
- Quien administra el servidor activa los webhooks con `WEBHOOK_SECRETS_KEY`.
