# Casos de prueba (fuente del capítulo 8)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/08-casos.tour.ts`. La IA de los casos («Sugerir casos con IA»,
y sugerir o revisar las listas de un caso) se recorre en el capítulo 17.

## Para qué sirve

Un **caso de prueba** describe cómo comprobar un comportamiento:
precondiciones, pasos y resultado esperado. En Pharos cada caso es a la vez un
formulario («Editor») y su escenario **Gherkin**, sincronizados: lo que
escribes en uno aparece en el otro, listo para automatizar con playwright-bdd o
Cucumber.

| Tipo | Para qué | En Gherkin |
| --- | --- | --- |
| Básico | Un escenario con sus pasos | Feature · Scenario · Given/When/Then |
| Básico avanzado | El mismo escenario con varios datos | Scenario Outline · Examples |
| Avanzado | Precondiciones comunes y varios flujos (principal y alternos) | Background · Rule · varios Scenario |
| Checklist | Una lista de comprobaciones (humo, accesibilidad) | No tiene Gherkin |

Cada caso tiene:

- un **ID** con el prefijo del proyecto (`PH-001`), que no cambia y viaja como
  tag (`@PH-001`);
- su prioridad, su estado (borrador, en revisión, aprobado u obsoleto), su
  estado de automatización y su versión;
- los **requisitos** que comprueba (capítulo 7), que viajan como tags
  (`@REQ-001`) y alimentan la matriz de trazabilidad (capítulo 13).

En este manual, Liomar escribe los casos de acceso y de proyectos de Pharos:

- «Iniciar sesión con credenciales válidas» (PH-001, básico);
- «Rechazar credenciales no válidas» (PH-002, Outline con dos ejemplos);
- «Crear un proyecto» (PH-003, avanzado, con el flujo alterno «Nombre
  vacío»);
- la checklist «Humo de la versión 0.6.0» (PH-004);
- «Acceso con usuarios de prueba» (PH-005), que usa la biblioteca: el paso
  compartido «Iniciar sesión» y el dataset «Usuarios válidos».

Liomar envía PH-001 a revisión y, en su espacio personal, lo aprueba él mismo.
La revisión por otra persona, con Jorge, está en el capítulo 21.

## Revisión y aprobación

El estado de un caso ya no se elige en un menú: lo mueve el flujo de
revisión, con estas acciones bajo la cabecera del caso.

| Estado | Acción | Qué pasa |
| --- | --- | --- |
| Borrador | «Enviar a revisión» | Pide una nota opcional para quien revise. El caso pasa a «En revisión». |
| En revisión | «Aprobar versión N» | Pide confirmación. Queda quién aprobó, cuándo y qué versión. |
| En revisión | «Pedir cambios…» | Pide un comentario obligatorio. El caso sigue en revisión, con el aviso «Cambios pedidos por…». |
| Cualquiera | «Marcar obsoleto» | El caso se conserva, pero deja de usarse y pierde la aprobación. |
| Obsoleto | «Reactivar» | El caso vuelve a «En revisión» (a Borrador si nunca se envió). Hay que aprobarlo de nuevo. |

- Primero se guarda: con cambios sin guardar, las acciones esperan.
- Quien revisa ve «Cambios desde el …» (la fecha de la última revisión), con lo que cambió campo a
  campo desde la última versión aprobada o enviada. Lo quitado aparece
  tachado y lo añadido, resaltado.
- **Borrador es solo el principio**, como en el plan (capítulo 5): un caso
  se revisa las veces que haga falta hasta que se aprueba.
- Si se edita el título o el contenido de un caso aprobado, un aviso lo dice
  antes de guardar. Al guardar, el caso vuelve a «En revisión», pierde la
  aprobación y su versión sube. Un caso en revisión sigue en revisión; si
  alguien había pedido cambios, el aviso pasa a «Cambios guardados tras la
  petición de…». Cambiar la prioridad, la automatización o los campos
  personalizados no cuenta.
- **Quién aprueba** lo decide la regla «Aprobación independiente» del espacio
  de trabajo. Activada (lo normal en un espacio compartido): un Test Manager o
  un Test Analyst que no sea quien escribió el caso. Desactivada (siempre en
  tu espacio personal): cualquiera que pueda editar el caso, también el
  autor, y entonces queda como «aprobación propia» en el caso, en la lista y
  en el historial.
- En la lista, el filtro «Por revisar» reúne los casos en revisión que
  puedes aprobar. La ayuda emergente del estado dice quién lo envió o lo
  aprobó. Con varios casos seleccionados, «Enviar a revisión» envía los
  borradores de una vez.

## Baselines de suite

Una **baseline** congela un conjunto de casos tal como están: cada caso con
su revisión exacta y su estado. Sirve, por ejemplo, para fijar la regresión de
una versión.

- «Baselines», en la lista de casos, muestra las del proyecto. «Nueva
  baseline» pide un nombre y los casos: todos los del proyecto (sin los
  obsoletos), los del filtro de la lista o la selección («Congelar en
  baseline», con casos seleccionados).
- «Solo los casos aprobados» viene marcado. El diálogo dice cuántos casos
  entran y cuáles se quedan fuera.
- Una baseline no se edita ni se borra. Si hace falta otra, se crea otra.
- «Comparar» enfrenta una baseline con el «Estado actual» o con otra
  baseline. Arriba están los recuentos (añadidos, quitados, contenido
  cambiado, solo estado cambiado, sin cambios). Debajo, un caso por fila: al
  pulsar su título se ven los cambios campo a campo.

## Biblioteca: pasos compartidos y datasets

La sección **«Biblioteca»** del proyecto, después de «Casos», guarda lo que se
repite en muchos casos. Tiene dos pestañas:

- **Pasos compartidos:** unos pasos con nombre, por ejemplo «Iniciar sesión».
  Pueden llevar parámetros entre ángulos (`<usuario>`, `<clave>`), como un
  Outline.
- **Datasets:** una tabla de datos con nombre, por ejemplo «Usuarios
  válidos», con una columna por parámetro y una fila por cada juego de datos.
  Se escribe en la rejilla, se pega desde una hoja de cálculo o se importa
  desde CSV o `.xlsx`.

Cada cambio en el contenido sube la **versión** (v1, v2…). «Usado en» dice qué
casos lo usan, y «Versiones» guarda cada versión.

**Usarlos en un caso** (básico o «Básico avanzado»):

1. En los pasos o las precondiciones, pulsa «Insertar paso compartido…»,
   elige el paso y escribe sus argumentos. Un argumento vacío deja el
   parámetro tal cual: su valor sale de la tabla de datos.
2. En la tabla de ejemplos, pulsa «Vincular dataset…» y elige el dataset (y,
   si quieres, solo algunas filas con «Elegir filas…»).

El caso muestra los pasos insertados como un bloque, y la tabla vinculada, de
solo lectura. Para editarlos se abre el elemento en la biblioteca, o se pulsa
«Desvincular», que los convierte en pasos y filas propios del caso.

**Seguir o fijar una versión.** Un bloque nuevo **sigue la última versión**:
cuando alguien cambia el paso o el dataset en la biblioteca, el caso se
actualiza solo. Con «Fijar en vN» se queda en esa versión, y el caso avisa «Hay
una versión nueva» con el botón «Actualizar».

**Los casos aprobados vuelven a revisión.** Actualizar un caso cambia su
contenido, así que, como al editarlo a mano, un caso **Aprobado** pasa a **En
revisión** y sube su versión. Antes de guardar el cambio en la biblioteca, un
aviso dice cuántos casos se actualizan y cuántos aprobados volverán a revisión.
Si un caso no debe moverse, fíjalo en su versión antes.

**Un dataset de 3 filas da 3 resultados.** Al añadir el caso a un run
(capítulo 11), el diálogo muestra «3 filas · Usuarios válidos (v1)». En la ejecución, cada fila
es una ejecución propia («Flujo principal · Fila 2 de 3», con el primer valor
de la fila, qa.web@pharos.test), con sus valores resaltados en los pasos, y los
pasos insertados aparecen bajo «Paso compartido · Iniciar sesión · v2». Cada
fila guarda su resultado, que recuerda el dataset y la versión de cada paso
compartido. El progreso cuenta el caso una vez.

**Al exportar**, el `.feature`, el PDF y el `.xlsx` llevan los pasos y las
filas completos, y nombran su origen: «Paso compartido: Iniciar sesión (v2)» y
«Dataset: Usuarios válidos (v1)».

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Ctrl+P (⌘P en Mac) | Editor de un caso abierto desde la lista | Abre «Ir a un caso» |
| ↑ ↓, Intro, Esc | «Ir a un caso» | Se mueven por los resultados, abren el elegido, cierran |
| Espacio o Intro | Asa (⠿) de un paso o una comprobación | Coge el paso; otra vez, lo suelta |
| ↑ ↓ | Paso cogido | Lo sube o lo baja |
| Esc | Paso cogido | Cancela el movimiento |
| Tab | Editor Gherkin | Sangra la línea |
| Esc y después Tab | Editor Gherkin | Sale del editor con el teclado |
| ← → | Selector de vista (Editor · Gherkin · Vista dividida) | Cambia de vista |
| ↑ ↓ e Intro | Menús de prioridad y automatización, y «⋯» | Recorren y eligen una opción |

## Si algo no sale

- **«No se puede guardar: revisa 1 campo.»** Falta el título o un campo
  personalizado obligatorio. El enlace del aviso lleva al campo.
- **«Fila repetida: ya hay otra igual.»** Dos pasos o dos filas de ejemplos
  son iguales. El caso se guarda, pero conviene revisarlo.
- **«Columnas sin placeholder en los pasos».** Una columna de «Examples» no
  aparece como `<nombre>` en ningún paso: escribe el marcador o quita la
  columna.
- **No puedo bajar el «Nivel».** El Gherkin usa algo de un nivel superior
  (por ejemplo, un Outline). El aviso del selector dice cuál es el mínimo.
- **«Este proyecto aún no tiene requisitos (sección Requisitos).»** Crea o
  importa los requisitos antes (capítulo 7) para poder vincularlos.
- **«Requisito desconocido».** El caso enlaza un requisito eliminado. Quítalo
  con la ✕ de su etiqueta o vincula otro.
- **«Clave provisional: recibirá la definitiva al sincronizar.»** El caso se
  creó sin conexión. Su ID definitivo llega con la próxima sincronización, y
  mientras tanto su .feature se exporta sin tag de ID.
- **Ctrl+P no hace nada.** Solo funciona en un caso abierto desde la lista y
  sin otro diálogo abierto.
- **«Sugerir casos con IA» está en gris.** Necesita un motor de IA (capítulo
  15) y un plan de pruebas en el proyecto (capítulo 5).
- **«No se importaron estos valores…».** Al importar un .xlsx, los valores que
  no encajan con un campo personalizado (por ejemplo, una opción que no
  existe) se omiten.
- **«Aprobar versión N» está en gris.** Hay cambios sin guardar, o lo tiene
  que aprobar otra persona: el texto bajo el botón dice cuál de las dos.
- **«El caso cambió mientras tanto.»** Alguien lo editó o lo revisó a la
  vez. Vuelve a abrirlo y repite la acción.
- **«Ningún caso entra en la baseline.»** Ninguno de los elegidos está
  aprobado. Desmarca «Solo los casos aprobados» o elige otros casos.
- **El estado lleva ✨ y un borde discontinuo.** El caso tiene contenido
  sugerido por IA que nadie ha revisado. Ábrelo y pulsa «Marcar revisado» en
  cada marca de IA.

## En el móvil

- La lista muestra cada caso como una tarjeta. Un solo botón «Filtros», con el
  número de filtros activos, abre todos los filtros en una hoja desde abajo.
- El editor tiene dos vistas, «Editor» y «Gherkin»; no hay vista dividida.
- El Gherkin se lee sin editar. «Editar» lo abre a pantalla completa con una
  barra de teclas sobre el teclado del móvil, y «Listo» vuelve.
- Abajo, «‹ Anterior · N de M · Siguiente ›» recorre los casos.

## Consejos

- Vincula cada caso a su requisito al crearlo: es lo que hace útil la matriz
  de trazabilidad.
- Empieza en «Básico»: siempre puedes subir de nivel, pero no bajar por debajo
  de lo que ya usa el Gherkin.
- Usa marcadores entre ángulos (`<correo>`) y la tabla de ejemplos cuando el
  mismo escenario deba probarse con varios datos.
- Envía a revisión los casos que estén listos y apruébalos: los ciclos avisan
  cuando añades casos sin aprobar (capítulo 9).
- Antes de una versión, congela su regresión en una baseline. Después,
  «Comparar» con el estado actual dice qué casos cambiaron desde entonces.
- Un caso eliminado va a la Papelera (Administración › General, capítulo 15)
  y se restaura con su clave y su historial mientras dure la retención.
- Exporta los .feature para tu proyecto de automatización: cada escenario
  lleva el tag de su caso, y los resultados importados se vinculan solos por
  ese tag o por la propiedad `test_id` (capítulo 10).

## Véase también

- Capítulo 7, «Requisitos».
- Capítulo 9, «Ciclos de prueba»: añadir casos a un ciclo.
- Capítulo 11, «Ejecución manual»: ejecutar un caso fila por fila.
- Capítulo 13, «Trazabilidad».
- Capítulo 21, «Trabajo en equipo»: la revisión y la aprobación por otra
  persona.
- Capítulo 17, «Asistente de IA»: sugerir casos y revisar las listas de un
  caso.
- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.3.
- [Glosario](../GLOSARIO.md): «Caso de prueba», «ID de escenario», «Pasos de
  prueba», «Prioridad», «Estado (del caso)», «Baseline de suite».
