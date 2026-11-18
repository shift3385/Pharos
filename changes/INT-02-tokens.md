---
section: Añadido
---

- **Tokens de la API para CI y para el CLI.**
  - En la página del workspace, la pestaña nueva «Integraciones» lista los tokens de proyecto. Un Test Manager los crea, rota, reasigna y revoca.
  - En «Mi perfil», «Tokens personales» deja crear y revocar los tuyos.
  - Cada token se enseña una sola vez, caduca como mucho en un año y nunca puede hacer más que la persona dueña de él.
  - En «Administración › Usuarios», el administrador del servidor puede revocar todos los tokens de una cuenta.
- **API pública `/api/v1`**, con su contrato OpenAPI en `/api/v1/openapi.json`. Por ahora dice quién es el token y lista los proyectos; la subida de resultados llega en el siguiente paso.
