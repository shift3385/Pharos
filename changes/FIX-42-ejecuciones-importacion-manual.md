---
section: Corregido
---

- **La pantalla de un run importado muestra sus resultados.** Antes decía «Este run no tiene casos. Añádelos con «Añadir casos».» y «0/0 ejecutados» aunque el informe trajera resultados vinculados (por ejemplo, un JUnit con filas de un dataset). Ahora lista «Resultados importados»: cada test con su caso (clave y título) y su fila, o «Sin vincular», su estado y sus intentos; el progreso los cuenta como ejecutados. Un run importado ya no ofrece «Añadir casos»; «Reabrir» sigue, para importar más informes en él con «Run abierto». Un run cerrado sin casos ni resultados dice «Este run no tiene casos ni resultados.».
- El aviso de la pantalla del run ya no dice que las evidencias «aún no se sincronizan»: «Las evidencias se guardan cifradas en este equipo y se sincronizan como el resto de los datos.».
- «Importar informe» nombra lo que de verdad importa: una frase corta con un ejemplo neutro (@PRJ-001) y, tras el «?» del campo «Informe», la lista completa (JUnit XML, CTRF, Playwright, Cucumber Messages, Pharos Run JSON, TRX, Allure en .zip y Xcode; SARIF y axe; k6).
- Importar un informe sin elegir la carpeta de adjuntos ya no dice que los adjuntos «no se encontraron en la carpeta elegida»: dice que no se guardaron porque no elegiste la carpeta.
- La vista previa de una importación cuenta en la misma unidad lo que trae y lo que se vincula: «2 tests en 3 intentos. Intentos que se vinculan a un caso: 3; sin vincular: 0.».
- Un run importado de un informe que solo dice cuándo terminó (un SARIF con `endTimeUtc`) ya no empieza después de terminar: empieza a esa hora, no a la de la importación. Igual en el escritorio y al subirlo al servidor.
- «Desde un resultado» y «Vincular a un resultado» nombran un resultado vinculado por su caso (clave y título), también si se vinculó a mano desde «Sin vincular», en lugar de la ruta del test; el buscador también encuentra el título del caso.
- Un defecto creado desde un intento fallido rellena «Resultado esperado» con el resultado esperado del caso (o del flujo) cuando el paso que falló no tiene uno propio.
- «Triados» en lugar de «Triajados» en el filtro de hallazgos, como en el informe de estado.
- La columna «Comentarios» de la matriz de trazabilidad ya no corta las notas en «Defect…»: tiene un ancho mínimo y las notas saltan de línea.
- Un caso exportado a .xlsx e importado de nuevo conserva sus requisitos: las claves de «Trazabilidad» que son requisitos del proyecto vuelven como vínculos, no como texto libre.
