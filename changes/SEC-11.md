---
section: Añadido
---

- **Administrador del servidor y «Administración › Usuarios»**: la primera cuenta que se registra en un servidor es su administradora (en un servidor que ya existía, la más antigua). Un administrador ve todas las cuentas del servidor, restablece contraseñas y nombra o quita administradores; siempre queda uno. No es un rol de workspace: un Test Manager no lo es por serlo. Quien gestiona el servidor puede nombrar o recuperar administradores con `PHAROS_ADMINS`.
- **Restablecer la contraseña de otra persona** (SEC-09): el administrador genera un enlace de un solo uso que dura 24 horas. Si el servidor envía correo, le llega a la persona y el administrador no lo ve; si no, se muestra una vez para entregarlo. Al usarlo se cierran todas las sesiones de la persona; ella recibe un aviso y queda en la auditoría de los dos.
