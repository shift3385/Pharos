# Defectos (fuente del capítulo 12)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/12-defectos.tour.ts`. Los campos propios de los defectos se
crean en «Ajustes del proyecto» (capítulo 14).

## Para qué sirve

Un **defecto** registra algo que no funciona como se esperaba, para que se
corrija y se pueda volver a probar. Cada defecto lleva:

- **Severidad:** el impacto en el sistema (crítica, mayor, menor, trivial).
- **Prioridad:** la urgencia del arreglo (crítica, alta, media, baja). Un
  defecto puede ser de severidad menor y prioridad alta, por ejemplo una
  errata en la pantalla de entrada justo antes de una demostración.
- **Reproducción:** pasos, resultado esperado y resultado obtenido, con la
  build y el entorno en que se encontró.
- **Vínculos** con los casos, los requisitos y los resultados de los que nace.
  La matriz de trazabilidad (capítulo 13), el informe de estado (capítulo 11)
  y el Inicio (capítulo 3) los cuentan.
- **Evidencias:** capturas, vídeos o registros, guardados cifrados en este
  equipo.

Su **ciclo de vida**: Nuevo → Abierto → En curso → Corregido → Por confirmar →
Cerrado, y además Rechazado (con su resolución) o Aplazado. Rechazado y
Cerrado piden siempre una **resolución**. Un defecto aplazado sigue contando
como abierto.

Cuando el último resultado de un caso es un fallo y uno de sus defectos llega
a «Corregido» o «Por confirmar» (y ninguno sigue nuevo, abierto o en curso), el
caso pasa a **Por confirmar** en la matriz y en el Inicio: toca volver a probarlo.

En este manual, Liomar registra dos defectos de Pharos:

- **«El menú lateral sigue mostrando el prefijo anterior»** (mayor, media),
  escrito a mano, con su captura y vinculado al caso PH-003 y al requisito
  REQ-002. Lo aplaza a la 0.4.0.
- **«Entrar con credenciales válidas muestra “Correo o contraseña
  incorrectos”»** (crítico), creado desde el resultado fallido de la prueba
  automática de acceso que importó en el capítulo 10.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| ← → | Filtro de estado (Abiertos · Todos · Cerrados) y «Lista / Tablero» | Cambian de opción |
| Espacio o Intro | Asa de una tarjeta del tablero | La coge para moverla; otra vez, la suelta |
| ← → | Tarjeta cogida | La lleva a la columna anterior o siguiente |
| Esc | Tarjeta cogida | Cancela el movimiento; la tarjeta vuelve a su sitio |
| Esc | Quitar el vínculo con un resultado | Equivale a «Cancelar» |
| Esc | Quitar una evidencia o eliminar un defecto | No la cierra: usa «Cancelar» |

## Si algo no sale

- **«El título es obligatorio.»** Escribe el título antes de guardar.
- **No veo «Evidencias» o dice «Guarda el defecto para poder añadir
  evidencias.»** Los archivos se adjuntan a un defecto ya guardado: guárdalo y
  vuelve a abrirlo.
- **«Los adjuntos solo están disponibles en el escritorio.»** En la versión
  web no se adjuntan archivos; usa la app de escritorio.
- **«“nombre” supera el límite de 200 MB.»** Recorta el vídeo o comprime el
  registro.
- **«Este archivo no está en este equipo…»** El archivo caducó o se copió la
  carpeta de datos sin su carpeta de evidencias.
- **«Un defecto “Nuevo” no puede pasar a “Cerrado”.»** El tablero solo admite
  los cambios del ciclo de vida. Avánzalo paso a paso o usa el campo
  «Estado» del editor, que solo ofrece los estados siguientes.
- **«Aplicar» está en gris al rechazar o cerrar.** Falta elegir la
  resolución.
- **«No hay resultados fallidos en los runs de este proyecto.»** Todo pasó, o
  aún no hay runs. Crea el defecto con «Nuevo defecto».
- **«No se pudo vincular el resultado.» o «No se pudo quitar el
  vínculo.»** El defecto se queda como estaba; vuelve a intentarlo.
- **«No se pudieron cargar los defectos.»** Pulsa «Reintentar».
- **«Ningún defecto coincide con los filtros.»** Pulsa «Quitar filtros».

## En el móvil

- La lista es una pila de tarjetas con la clave, la severidad, el estado y el
  título; un toque abre el defecto.
- El tablero enseña una columna cada vez: desliza a los lados para pasar de
  un estado a otro.
- Eliminar un defecto, por ahora, solo se puede desde la tabla en escritorio
  o tableta.

## Consejos

- Crea el defecto **desde el resultado** fallido siempre que puedas: hereda
  los pasos de la revisión ejecutada, lo obtenido, la build, el entorno y las
  evidencias, y queda vinculado al intento concreto.
- Un buen título describe el síntoma, no la causa supuesta: «El menú lateral
  sigue mostrando el prefijo anterior», no «Falla la caché del menú».
- Vincula los requisitos afectados: la matriz mostrará qué requisitos tienen
  defectos abiertos antes de una entrega.
- Cierra o rechaza en vez de eliminar: el historial dice qué pasó. La clave de
  un defecto eliminado (`DEF-003`) no se reutiliza.
- Para seguirlo también en otra herramienta, anota su clave y su enlace en
  «Seguimiento externo».

## Véase también

- Capítulo 10, «Ejecuciones e importación de resultados»: de dónde salen los
  resultados fallidos.
- Capítulo 11, «Ejecución manual»: «Crear defecto» desde un intento.
- Capítulo 13, «Trazabilidad»: los defectos en la matriz.
- Capítulo 14, «Ajustes del proyecto»: los campos de los defectos.
- [Glosario](../GLOSARIO.md): «Por confirmar», y la sección «Execution model
  identifiers».
