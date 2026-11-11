# Tablero (fuente del capítulo 6)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/06-tablero.tour.ts`. Antes se llamaba «Planificador»; desde
UX-21 es «Tablero», como en Jira, para no confundirlo con el plan de pruebas.

## Para qué sirve

El **Tablero** es un kanban por proyecto para el trabajo del equipo de QA que
no es un caso ni un defecto: preparar datos de prueba, revisar casos,
automatizar una regresión. Cada tarjeta avanza de «Backlog» a «Hecho», con su
prioridad, sus etiquetas y sus adjuntos.

Es la sección en la que se abre un proyecto que ya existe: el sitio donde el
equipo mira cada día qué hay pendiente.

En este manual, el tablero de «Pharos» tiene las cuentas de prueba del
equipo, la revisión de los casos de sincronización y la automatización de la
regresión de acceso.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Tab | Tablero | Recorre los filtros, el buscador y, en cada tarjeta, su asa, su título y su papelera |
| Espacio o Intro | Asa de una tarjeta (⠿) | Coge la tarjeta para moverla; otra vez, la suelta |
| ← → | Tarjeta cogida | La lleva a la columna anterior o a la siguiente |
| ↑ ↓ | Tarjeta cogida | La sube o la baja dentro de su columna |
| Esc | Tarjeta cogida | Cancela el movimiento: vuelve a su sitio |
| Intro | Título de una tarjeta | La abre en el editor |
| ↑ ↓ e Intro | Menú «Prioridad» | Marcan o desmarcan cada prioridad |

## Si algo no sale

- **«No se pudo cargar el tablero.»** Pulsa «Reintentar». Si sigue, en la web
  comprueba la conexión.
- **«Guardar» no se activa.** Falta el título: es lo único obligatorio.
- **«No se pudo guardar la tarjeta. Inténtalo de nuevo.»** El cambio no se
  guardó y sigue en el editor. Vuelve a pulsar «Guardar».
- **«Guarda la tarjeta para poder añadir adjuntos.»** Los adjuntos se añaden a
  una tarjeta ya guardada: guárdala y vuelve a abrirla.
- **«… supera el límite de 200 MB.»** Ese archivo no se adjunta. Comprímelo o
  enlaza dónde está en la descripción.
- **«Por ahora solo está disponible en la app de escritorio.»** En la versión
  web, las tarjetas no admiten adjuntos.
- **No encuentro una tarjeta.** Revisa los filtros: el tipo, la prioridad y el
  buscador solo cambian lo que ves. Elige «Todas», desmarca las prioridades y
  borra la búsqueda.
- **¿Y los defectos?** Tienen su propio módulo (capítulo 12), con su ciclo de
  vida y sus vínculos a casos y requisitos. El tablero es para tareas y datos
  de prueba.

## En el móvil

- Las cuatro columnas se recorren deslizando de lado.
- Los filtros (tipo, búsqueda y prioridad) quedan arriba; el menú de prioridad
  se abre como una hoja desde abajo.
- «Nueva tarjeta» está en la fila de botones de la sección.
- El editor de una tarjeta ocupa toda la pantalla, con «← Volver» arriba.

## Consejos

- Usa las **etiquetas** para agrupar tarjetas de una misma versión o área
  (por ejemplo, «0.3.0» o «sincronización»): el buscador también busca en
  ellas.
- Pon los **datos de prueba** en tarjetas de tipo «Datos de prueba» con su
  archivo adjunto: así el equipo sabe dónde están y quién los preparó.
- Los adjuntos se guardan cifrados en el equipo, junto con los datos de
  Pharos: inclúyelos en tus copias (capítulo 16, «Evidencias»).

## Véase también

- Capítulo 4, «Proyectos»: un proyecto existente se abre en su Tablero.
- Capítulo 12, «Defectos».
- [Glosario](../GLOSARIO.md): «Tablero», «Tarjeta del tablero», «Columna del
  kanban», «Adjunto».
