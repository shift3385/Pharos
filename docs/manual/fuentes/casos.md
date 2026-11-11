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
- su prioridad, su estado (borrador, revisado, aprobado u obsoleto), su estado
  de automatización y su versión;
- los **requisitos** que comprueba (capítulo 7), que viajan como tags
  (`@REQ-001`) y alimentan la matriz de trazabilidad (capítulo 13).

En este manual, Liomar escribe los casos de acceso y de proyectos de Pharos:

- «Iniciar sesión con credenciales válidas» (PH-001, básico);
- «Rechazar credenciales no válidas» (PH-002, Outline con dos ejemplos);
- «Crear un proyecto» (PH-003, avanzado, con el flujo alterno «Nombre
  vacío»);
- la checklist «Humo de la versión 0.3.0» (PH-004).

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
| ↑ ↓ e Intro | Menús de prioridad, estado y automatización, y «⋯» | Recorren y eligen una opción |

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
- Pasa a «Aprobado» los casos revisados: los ciclos avisan cuando añades
  casos sin aprobar (capítulo 9).
- Exporta los .feature para tu proyecto de automatización: cada escenario
  lleva el tag de su caso, y los resultados importados se vinculan solos por
  ese tag o por la propiedad `test_id` (capítulo 10).

## Véase también

- Capítulo 7, «Requisitos».
- Capítulo 9, «Ciclos de prueba»: añadir casos a un ciclo.
- Capítulo 13, «Trazabilidad».
- Capítulo 17, «Asistente de IA»: sugerir casos y revisar las listas de un
  caso.
- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.3.
- [Glosario](../GLOSARIO.md): «Caso de prueba», «ID de escenario», «Pasos de
  prueba», «Prioridad», «Estado (del caso)».
