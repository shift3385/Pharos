---
section: Corregido
---

- **Sincronización.** Cuando una sincronización combina solos los cambios hechos a la vez en otro equipo, las listas abiertas los muestran al momento: en «Requisitos» ya aparece la descripción que llegó del otro equipo, sin tener que salir y volver. Lo mismo en «Trazabilidad», el plan (si no lo estás editando), el tablero, «Ejecuciones» y el detalle de un run.
- **Inicio.** «Criterios de salida» dice «Fin del plan: 6 dic», como la cabecera del proyecto, en lugar de «Cierre: 6 dic»; su lista de proyectos se ordena «Por fin del plan», y la tarjeta de proyectos dice «1 plan termina este mes».
- **Informes de estado y de cierre.** En «Hallazgos y rendimiento», el umbral se escribe como su valor («< 1 %» junto a «1,02 %», «< 500 ms»), no como la expresión de k6 («rate<0.01»), que sigue en la pestaña «Métricas» del run. La línea de hallazgos dice qué es cada cifra: «nuevos desde el run anterior» (o «sin run anterior con el que comparar» en la primera importación de una herramienta, en vez de «0 nuevos») y «a revisar (la herramienta no pudo decidir)», que no son hallazgos abiertos. La tabla por herramienta añade «A revisar» y pone «—» en «Nuevos» cuando no hay run anterior. Igual en el PDF y en el .xlsx.
