---
section: Añadido
---

- **Un script o un CI puede leer casos, ciclos, defectos y requisitos** con un token, sin abrir la app.
  - Cada lista devuelve solo lo que cambió desde la última lectura, borrados incluidos, así que sirve para mantener una copia al día.
  - Los ciclos llevan su progreso, como en la web.
  - La guía `docs/api-v1.md` trae ejemplos con `curl` y cómo comprobar la firma de un webhook.
- **Avisos de tokens:** tu token te avisa 7 días antes de caducar. Si un token de proyecto deja de funcionar porque su dueño salió del workspace o se desactivó su cuenta, se avisa a los Test Manager para que lo reasignen o lo revoquen.
