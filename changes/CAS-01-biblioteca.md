---
section: Añadido
---

- **Biblioteca del proyecto: pasos compartidos y datasets.** Una sección nueva, «Biblioteca», guarda los pasos que se repiten en muchos casos (por ejemplo «Iniciar sesión») y las tablas de datos de prueba. Cada cambio crea una versión nueva, y antes de guardarlo se ve cuántos casos se actualizarán y cuáles aprobados volverán a «En revisión».
- **Pasos compartidos en un caso.** Con «Insertar paso compartido…» el paso entra en el caso como un bloque que no se edita allí. Se puede fijar en una versión, seguir la última, cambiar sus argumentos o desvincularlo para quedarse con los pasos. Los parámetros se escriben como en un Scenario Outline: `<usuario>`.
- **Datasets en la tabla de datos.** Un dataset se crea pegando desde Excel o importando un CSV o un `.xlsx`, y se exporta a CSV. Con «Vincular dataset…» sus filas pasan a ser la tabla de datos del caso: una fila, un resultado. Si falta una columna para un parámetro, el caso lo dice y deja elegir otra.
- Por ahora no está disponible en los casos con varios flujos.
