# Ciclos de prueba (fuente del capítulo 9)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/09-ciclos.tour.ts`. Las configuraciones se crean en «Ajustes
del proyecto» (capítulo 14).

## Para qué sirve

Un **ciclo de prueba** reúne los casos que se van a ejecutar en una ronda
concreta (una regresión, un sprint, una versión candidata), contra una
**build** y un **entorno**, y en unas **configuraciones** (por ejemplo, Chrome
y Edge en Windows 11).

**Ejecutar** el ciclo crea un **run** por configuración con todos sus
elementos. Cada caso queda congelado en su revisión de ese momento, así que
cambiarlo después no altera lo que se está probando.

Los resultados de esos runs, manuales (capítulo 11) o importados de la
automatización (capítulo 10), alimentan varias pantallas:

- el progreso del ciclo;
- el informe de estado (capítulo 11) y, al cerrar, el informe de cierre;
- el Inicio (capítulo 3);
- la matriz de trazabilidad (capítulo 13).

Un ciclo pasa por tres estados: **Planificado**, **Activo** y **Cerrado**. Un
ciclo cerrado no admite cambios ni ejecuciones hasta que se reabre (editarlo y
cambiar su estado).

## Cerrar un ciclo: el quality gate

Un ciclo se cierra con **«Cerrar ciclo…»**, nunca desde «Editar». Cerrar es
una decisión: ¿la versión puede salir? Pharos evalúa los **criterios de
salida** del plan (capítulo 5) con los resultados del ciclo y te pide lo que
falte:

- **Un criterio obligatorio que no se cumple**, o que no tiene datos para
  medirse, pide una **justificación** de al menos 20 caracteres: por qué se
  acepta el riesgo, quién lo asume y cuándo se resuelve.
- **Un criterio manual** (por ejemplo, «Visto bueno del PO») se marca a mano:
  «Cumple» o «No cumple».
- **Un criterio orientativo** se muestra y queda en el informe, pero no
  bloquea.
- **El veredicto.** Si todo lo obligatorio se cumple, es **Go**. Si algo
  falla, eliges **Go con riesgos** (el ciclo se cierra y la versión puede
  salir, con los riesgos justificados) o **No-go** (el ciclo se cierra, pero la
  versión no sale: abre otro ciclo para el re-test).

Al cerrar, Pharos guarda la decisión con las cifras de ese momento,
congeladas, y quién la tomó y cuándo (queda en Auditoría). El ciclo muestra su
veredicto junto al estado. Su **informe de estado** empieza por «Decisión de
salida»: cada criterio con su valor y su justificación, y las métricas del
ciclo frente al ciclo cerrado anterior (tasa de éxito, densidad de defectos,
escapes, tiempo de corrección, reapertura y flaky). También sale en la hoja
«Decisión» del Excel y en el PDF. Inicio lo suma a «Tendencia de ciclos»
(capítulo 3).

Si reabres un ciclo y lo vuelves a cerrar, se guarda un cierre nuevo; los
anteriores no se pierden.

## El informe de cierre

Un ciclo cerrado muestra **«Informe de cierre»** en su cabecera, donde estaba
«Cerrar ciclo…». Es el informe final de la ronda según ISO/IEC/IEEE 29119-3
(*Test Completion Report*), con su propio ID (`TCR-` seguido del prefijo del
proyecto y la clave del ciclo). Tiene once apartados:

1. **Identificación:** proyecto, ciclo, plan, periodo planificado, cierre,
   build, entorno y ejecuciones.
2. **Resumen:** empieza con las cifras y el veredicto; puedes reescribirlo.
3. **Desviaciones respecto al plan:** la fecha de fin planificada frente al
   cierre, los casos sin ejecutar y los criterios obligatorios que no se
   cumplen, más tus comentarios.
4. **Evaluación frente a los criterios de salida:** la «Decisión de salida»
   del cierre, con cada justificación.
5. **Factores que bloquearon el avance:** casos bloqueados, por confirmar,
   flaky o de una revisión anterior, más tus comentarios.
6. **Medidas de prueba:** las métricas congeladas al cerrar, frente al ciclo
   anterior y al objetivo del plan (capítulo 5), y si se alcanza.
7. **Riesgos residuales:** los defectos del ciclo que siguen abiertos hoy y
   los requisitos sin cubrir o sin pasar, del riesgo más alto al más bajo.
8. **Entregables:** los que guarda Pharos y los del plan, que marcas como
   entregados.
9. **Activos reutilizables:** casos, configuraciones y datos de prueba.
10. **Lecciones aprendidas.**
11. **Aprobación.**

«Guardar» deja los textos y las marcas en el ciclo: se sincronizan con los
demás equipos y quedan en Auditoría. Con todo guardado, **«Aprobar
informe»** pide confirmación y registra tu nombre y la fecha. Si después
cambias un texto y guardas, el informe pierde la aprobación. Si reabres el
ciclo y lo vuelves a cerrar, el informe sigue al cierre nuevo: conserva los
textos, pero hay que guardarlo y aprobarlo otra vez.

«Exportar PDF» y «Exportar .xlsx» lo guardan en Descargas. El Excel trae el
informe completo y las hojas «Decisión», «Medidas», «Riesgos residuales»,
«Entregables» y «Casos».

En este manual, Liomar prepara la «Regresión 0.3.0» de Pharos:

- **Build y entorno:** 0.3.0-rc1, en staging.
- **Fechas:** del 9 al 20 de noviembre.
- **Configuraciones:** Chrome y Edge.
- **Casos:** dos añadidos a mano y los de prioridad alta, añadidos por
  filtro.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| ← → | Filtro de estado (Todos · Planificados · Activos · Cerrados) | Cambia de filtro |
| ← → | Pestañas «Elementos» y «Runs» | Cambian de pestaña |
| Intro | Diálogo «Nuevo ciclo» / «Editar» | Guarda el ciclo |
| Alt+↓ | «Empieza» o «Termina» | Abre el calendario (flechas, RePág/AvPág, Inicio/Fin, Intro elige, Esc cierra; capítulo 5) |
| Intro | Campo «Asignado» de un elemento | Guarda el asignado (salir del campo también) |
| ↑ ↓ e Intro | Menú de un elemento («Subir», «Bajar», «Quitar del ciclo») y menú «⋯» del ciclo | Recorren y eligen |
| Esc | Confirmación de eliminar | No la cierra: usa «Cancelar» |

## Si algo no sale

- **«Ejecutar» está en gris.** Pasa en tres casos; el aviso del botón dice cuál:
  - el ciclo está cerrado: reábrelo;
  - no tiene elementos: añade casos;
  - tiene casos eliminados: quítalos del ciclo (los nombra el aviso).
- **«El ciclo termina antes de empezar.»** La fecha de fin es anterior a la de
  inicio. El calendario de «Termina» ya no deja elegir esos días, pero una
  fecha escrita a mano sí puede serlo.
- **«El proyecto no tiene configuraciones. Créalas en Ajustes del
  proyecto.»** Sin configuraciones, el ciclo se ejecuta como un único run.
  Créalas en el capítulo 14 si necesitas separar navegadores o equipos.
- **«Todas las configuraciones del ciclo están archivadas.»** Restaura alguna
  en «Ajustes del proyecto» o edita el ciclo.
- **«Elige al menos una configuración.»** Marca alguna en el diálogo
  «Ejecutar».
- **«N configuraciones aún no han llegado a este equipo y se saltaron.»**
  Sincroniza y vuelve a ejecutar para crear sus runs.
- **«No aprobado» en un elemento.** El caso está en borrador o revisado. Se
  ejecuta igual, pero conviene aprobarlo antes (capítulo 8).
- **«No se pudieron cargar los ciclos.»** Pulsa «Reintentar».
- **«Este ciclo ya no existe.»** Se eliminó, quizá en otro equipo. Vuelve a la
  lista con «← Ciclos».
- **«Cerrar ciclo» no cierra y dice «Falta marcar algún criterio manual o
  justificar…».** Escribe la justificación de cada criterio obligatorio en rojo
  (20 caracteres como mínimo) y marca los manuales.
- **«Elige «Go con riesgos» o «No-go».»** Algún criterio obligatorio no se
  cumple: decide si la versión sale.
- **«Un ciclo se cierra con «Cerrar ciclo…»…».** Desde «Editar» ya no se
  puede elegir «Cerrado»: usa el botón de la cabecera del ciclo.

## En el móvil

- Cada ciclo es una tarjeta con su clave, su estado, su título, sus fechas y su
  progreso.
- Dentro de un ciclo, cada elemento es una tarjeta con su caso, el campo «Asignado»
  (se edita igual que en el escritorio) y una pastilla de resultado por
  configuración. Su menú «⋯» lo sube, lo baja o
  lo quita.
- En pantallas estrechas se ocultan las columnas menos importantes (fechas,
  configuraciones, runs); el asignado pasa bajo el título del caso y se sigue
  editando.

## Consejos

- Crea las configuraciones antes, en «Ajustes del proyecto».
- «Añadir por filtro» es la forma rápida de montar una regresión: por
  prioridad, estado, requisitos o riesgo de sus requisitos.
- Aprueba los casos antes de añadirlos: el ciclo avisa de los que no lo están.
- «Clonar» prepara la siguiente ronda con los mismos elementos y sin
  resultados.
- Al importar un informe de la automatización (capítulo 10), elige el ciclo:
  sus resultados cuentan en el progreso sin editar nada después.
- «Informe de estado», en la cabecera del ciclo, resume esa ronda (progreso
  por caso y configuración, defectos, cobertura y criterios de salida) para
  enviarla en Excel o PDF.

## Véase también

- Capítulo 10, «Ejecuciones e importación de resultados».
- Capítulo 11, «Ejecución manual» y el informe de estado.
- Capítulo 14, «Ajustes del proyecto»: las configuraciones.
- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.4c.
- [Glosario](../GLOSARIO.md), sección «Execution model identifiers»: ciclo,
  elemento de ciclo, run, configuración.
