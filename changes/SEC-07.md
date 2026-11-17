---
section: Seguridad
---

- **El servidor solo atiende por https en producción.** Rechaza la conexión sin cifrar que no venga del propio equipo; el certificado lo pone un proxy (Caddy). Hay una guía de despliegue para compartir el servidor con tu equipo (`docs/despliegue.md`).
- **La app de escritorio ya no abre conexiones al servidor desde la ventana**: las hace su núcleo, solo al servidor elegido y validando su certificado con Windows.
