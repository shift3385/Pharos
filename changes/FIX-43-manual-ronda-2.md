---
section: Corregido
---

- **El selector de workspace aparece siempre tras registrarte.** Al pulsar «Continuar» en los códigos de recuperación, la app se abría antes de terminar de guardar la sesión en el llavero del sistema; la primera sincronización no encontraba la sesión («not-authenticated»), el indicador decía «Sincronizado» y el selector no salía hasta cerrar sesión y volver a entrar. Ahora la sesión se guarda antes de abrir la app, y una lista de workspaces pedida antes que otra ya no la tapa al llegar tarde.
- Un run importado de un informe que dice cuándo empezó y cuánto duró cada test (un JUnit) termina a esa hora más lo que duraron, o a la hora de fin de su último resultado, y no a la de la importación. Un informe con inicio y fin los conserva. Igual en el escritorio y al subirlo al servidor.
- La columna «Comentarios» de la matriz de trazabilidad se lee entera a 1440 px: las columnas ya no suman más que el panel, y la última no queda cortada en su borde.
- «Desde un resultado» muestra el título del caso entero (salta de línea) y el aviso «Prerrellenado desde…» nombra el resultado como el selector: «RUN-003 · PH-001 · Iniciar sesión con credenciales válidas», no la ruta del test. También al crear el defecto desde la ejecución.
- Los porcentajes se escriben como el idioma: «33,3 %» en español y «33.3 %» en inglés, en las pantallas, el informe de estado y sus exportaciones. Una clave («RUN-001») ya no se parte en dos líneas en los informes.
- Auditoría nombra en palabras todos los campos que puede listar un cambio («Encontrado fuera de las pruebas», «Etiquetas», «Roles y responsabilidades», «Workspace» y el resto de los campos de proyectos, planes, casos, requisitos, defectos, ciclos, runs y resultados).
- Quien hizo un plan recibe un aviso cuando otra persona lo aprueba («… aprobó el plan …») o pide cambios («… pidió cambios en el plan …»), en la web y, tras sincronizar, en el escritorio, como con los casos.
- El nombre de una persona en lo que hace o firma es su nombre oficial (nombre y apellidos), como pide el glosario: autor y «Elaborado por», quien revisa o aprueba, la auditoría, los informes y exportaciones, «Asignado a», «Miembros», los avisos, quién desactivó una cuenta y el dueño de un token. El nombre visible queda en el menú de usuario, en el perfil (con el oficial debajo) y como segunda línea en «Miembros».
