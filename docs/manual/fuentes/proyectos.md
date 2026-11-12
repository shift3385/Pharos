# Proyectos (fuente del capítulo 4)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/04-proyectos.tour.ts`. Los ajustes de cada proyecto
(numeración, campos personalizados y configuraciones) tienen su propio
capítulo, el 14.

## Para qué sirve

Un **proyecto** es el producto, o la versión de un producto, que pruebas. Todo
lo demás vive dentro de él:

- su plan de pruebas;
- su tablero de tareas;
- sus requisitos y sus casos;
- los ciclos, las ejecuciones y los defectos;
- la matriz de trazabilidad.

Lo primero es crear el proyecto. Después, Pharos te lleva de la mano: un
proyecto nuevo se abre en su **plan de pruebas**, el punto de partida natural.
Uno que ya existe se abre en su **Tablero**, donde está el trabajo del día a
día.

En este manual, Liomar crea dos proyectos:

- **Pharos** (prefijo `PH`): la propia aplicación.
- **API de sincronización** (prefijo `API`): el servidor con el que Pharos
  sincroniza.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| ← → (o ↑ ↓) | «Cómo empezar», en «Nuevo proyecto» | Cambian entre «Proyecto en blanco» y «A partir de uno existente» |
| Intro | «Cómo empezar» | Pasa al paso siguiente, como «Siguiente» |
| Intro | «Nombre del proyecto» o «Prefijo de ID de caso», en «Datos generales» | Crea el proyecto, como «Crear proyecto» |
| Esc | El asistente «Nuevo proyecto» | Lo cierra sin crear nada; si ya habías escrito o elegido algo, antes pregunta |
| Tab | Lista | Recorre las tarjetas de «Recientes», el buscador, el orden y las filas de la tabla |
| Intro | El nombre de un proyecto | Lo abre |
| ↑ ↓ e Intro | Menú «⋯» de una fila y menú de orden | Recorren y eligen una opción |
| Esc | Un menú abierto | Lo cierra |

## Si algo no sale

- **«Este campo es obligatorio.»** Escribe un nombre antes de pulsar «Crear
  proyecto».
- **«No se pudo crear el proyecto. Inténtalo de nuevo.»** El asistente sigue
  abierto con lo que escribiste: pulsa otra vez «Crear proyecto». En la versión
  web, comprueba la conexión.
- **«A partir de uno existente» está desactivado.** Aún no tienes proyectos de
  los que copiar: crea el primero en blanco.
- **«El proyecto se creó, pero no se copió: …».** Al crear a partir de otro
  proyecto, alguna parte no se pudo copiar. El proyecto ya existe: no lo
  crees otra vez. Ajusta a mano lo que dice el aviso, los campos y los dígitos
  en «Ajustes del proyecto» (capítulo 14) o la retención en «Administración ›
  Evidencias»; los campos también se pueden traer con «Copiar de otro
  proyecto».
- **La retención de evidencias aparece desactivada en «Qué copiar».** Estás
  en la web: la retención es un ajuste de la app de escritorio y allí no se
  copia.
- **«No se pudo cargar la lista de proyectos.»** Pulsa «Reintentar».
- **«Ningún proyecto coincide con «…».»** El buscador busca en el nombre y en
  el prefijo. Borra el texto para volver a ver todos.
- **«Ejecutado» dice «—».** El proyecto aún no tiene casos o ninguno tiene
  un resultado. Al pasar el cursor se ve el recuento («3 de 4 casos con
  resultado»); es la misma cifra que «Ejecución por proyecto» del Inicio
  (capítulo 3).
- **Los filtros «En curso» y «Cerrados», y el orden «Defectos abiertos», no se
  pueden elegir.** Llegan en una próxima versión: los proyectos aún no tienen
  estado abierto o cerrado.
- **«No se pudo exportar «…».»** Pulsa «Reintentar». Si el aviso dice que
  algún PDF no se pudo generar, el ZIP se guarda igualmente sin ese archivo.
- **«Sí, eliminar todo» no se activa.** Escribe exactamente la palabra que
  pide el diálogo: el prefijo del proyecto sin su separador (por ejemplo, `PH`)
  o, si no tiene prefijo, su nombre.
- **El proyecto que buscaba ha desaparecido.** Si se eliminó en otro equipo, al
  sincronizar desaparece también aquí. Si abres un enlace a un proyecto que ya
  no existe, Pharos te lleva a la lista.

## En el móvil

- La lista muestra cada proyecto como una tarjeta: su insignia, su nombre y una
  línea con el plan, la ejecución y el último acceso.
- El menú de orden no aparece; el buscador sí.
- El menú «⋯» de cada proyecto se abre como una hoja desde abajo.
- «Nuevo proyecto» ocupa toda la pantalla, con los botones del paso abajo.
- Dentro de un proyecto, la cabecera se reduce a los botones de la sección, y
  el nombre del proyecto pasa a la barra superior.

## Consejos

- Crea un proyecto por producto o por versión importante que pruebes por
  separado (por ejemplo, «Pharos 0.3» y «Pharos 0.4»), no uno por ciclo de
  pruebas: los ciclos van dentro del proyecto (capítulo 9).
- Al crear un proyecto, Pharos sugiere un prefijo sacado del nombre y libre
  entre tus proyectos («Pharos» → `PHA-`). Ajústalo antes de crear casos, ahí
  mismo o en «Ajustes del proyecto» (capítulo 14): la clave de un caso no
  cambia una vez asignada, porque viaja como tag (por ejemplo, `@PH-001`) en
  la automatización.
- Dos prefijos se solapan si son iguales (sin contar el separador final ni
  las mayúsculas) o si uno empieza por el otro, como `PH-` y `PHA-`: Pharos no
  lo permite, porque una búsqueda o una importación por `PH` encontraría los
  casos de los dos proyectos.
- Para un proyecto parecido a otro (la versión siguiente del mismo producto,
  por ejemplo), créalo «A partir de uno existente» con ese proyecto: nace con sus
  campos personalizados, sus dígitos, su historial del plan exportado, sus
  bandas de riesgo y, en
  el escritorio, su retención de evidencias. Solo se copian ajustes, nunca el
  nombre, el prefijo ni los datos, y una sola vez: después, cada proyecto
  cambia por su cuenta. Como los proyectos se sincronizan entre tus equipos,
  no hace falta exportar los ajustes para usarlos en otro equipo.
- Exporta el ZIP antes de eliminar un proyecto, o como copia periódica fuera de
  Pharos.

## Véase también

- Capítulo 3, «Inicio»: el resumen de todos tus proyectos.
- Capítulo 5, «Plan de pruebas»: lo primero que se escribe en un proyecto
  nuevo.
- Capítulo 14, «Ajustes del proyecto».
- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.3 «Plan, casos y
  exportaciones».
- [Glosario](../GLOSARIO.md): «Proyecto», «Prefijo de ID de caso», «Recientes».
