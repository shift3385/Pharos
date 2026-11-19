---
section: Seguridad
---

- **La imagen Docker del servidor ya no corre como root** y Docker sabe si la API está viva.
  - Arranca el servidor compilado, sin herramientas de desarrollo dentro.
  - `docker compose ps` muestra `healthy` cuando la API responde.
