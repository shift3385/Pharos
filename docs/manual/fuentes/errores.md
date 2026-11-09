# Si algo sale mal (fuente del capítulo 19)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/19-errores.tour.ts`, que provoca los fallos de verdad en el
perfil aislado de los tours. Los errores propios de cada pantalla están en el
apartado «Si algo no sale» de su capítulo.

## Para qué sirve

Este capítulo enseña las pantallas que aparecen cuando algo falla de verdad,
para que las reconozcas y sepas qué hacer. En ninguna de ellas Pharos borra ni
modifica tus datos.

- **La base de datos local no abre.** Al arrancar, en lugar de la
  aplicación, una pantalla dice por qué:
  - **«No se pudo abrir la base de datos local»:** el archivo está dañado o
    hay otro problema. Cierra la app y vuelve a intentarlo; si sigue, comparte
    el detalle con soporte.
  - **«Estos datos son de una versión más nueva de Pharos»:** los guardó una
    versión más reciente. Instala esa versión o una posterior; esta no los
    abre para no estropearlos.
  - **«Falta la clave de la base de datos local»** o **«La clave guardada no
    abre la base de datos local»:** pasa en un equipo nuevo o tras reinstalar
    Windows. Escribe la clave de recuperación (56 caracteres en grupos de 4;
    dan igual mayúsculas, espacios o guiones) y pulsa «Abrir con la clave».
- **«Algo salió mal».** Una vista ha fallado, pero la aplicación sigue
  abierta y tus datos, a salvo. Ofrece «Reintentar», «Recargar» y «Exportar
  diagnóstico»; «Detalles técnicos» enseña el error para el informe.

En este manual, el tour daña a propósito una copia de la base de datos de
Liomar y simula un fallo de una vista; después todo vuelve a la normalidad.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Tab, Intro | Botones de «Algo salió mal» | Llegan a «Reintentar», «Recargar» o «Exportar diagnóstico» y los pulsan |
| Intro | Campo «Clave de recuperación» | Abre los datos con la clave |

## Si algo no sale

- **«La clave tiene un error de escritura…».** Revisa cada grupo de 4
  caracteres y vuelve a intentarlo.
- **«La clave es válida, pero no abre esta base de datos…».** Es la clave de
  otro equipo, o el archivo está dañado. Comprueba que sea la de este equipo;
  si lo es, prueba con una copia `pharos.db.enc.bak-…`.
- **«Algo salió mal» vuelve a salir tras «Reintentar».** Pulsa «Recargar»; si
  se repite, exporta el diagnóstico e informa del fallo.

## Consejos

- En «Algo salió mal», prueba primero «Reintentar»; si se repite, exporta el
  diagnóstico y adjúntalo al informe del fallo, con la versión que aparece en
  la pantalla de entrada o al pie del menú lateral.
- Guarda la clave de recuperación el primer día (capítulo 15) y haz copias de
  `pharos.db.enc` y de su carpeta `evidence`: son lo único que devuelve tus
  datos en otro equipo.
- Nunca adjuntes a un informe `pharos.db.enc`, tu clave de recuperación ni
  claves de IA. El diagnóstico ya los excluye.

## Véase también

- Capítulo 15, «Administración»: la clave de recuperación y el diagnóstico.
- Capítulo 16, «Evidencias»: verificar los archivos tras restaurar una copia.
- [Guía de pruebas de la beta](../guia-beta.md), apartados 5 «Cómo informar
  de un problema» y 6 «Si algo sale mal con los datos».
