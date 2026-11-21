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

En este manual, Liomar prepara la «Regresión 0.6.0» de Pharos, la del plan
«Plan de pruebas de Pharos 0.6.0» (capítulo 5):

- **Build y entorno:** 0.6.0-beta.1, en staging.
- **Fechas:** las del Sprint 1 del plan.
- **Configuraciones:** Chrome y Edge.
- **Casos:** PH-001 y PH-002, añadidos a mano. El filtro de prioridad alta
  solo encuentra PH-001, que ya está en el ciclo, así que no añade nada.

El capítulo sigue el ciclo de principio a fin: lo crea, lo ejecuta y, más
adelante en la historia, lo cierra.

## Cerrar un ciclo: el quality gate

Los pasos del final del capítulo muestran el cierre. Además:

- **Un criterio orientativo** se muestra y queda en el informe, pero no
  bloquea.
- **Go con riesgos** cierra el ciclo y deja salir la versión con los riesgos
  justificados; **No-go** lo cierra sin que la versión salga: abre otro ciclo
  para repetir la prueba.
- La decisión queda con las cifras de ese momento, congeladas, y quién la
  tomó y cuándo (Auditoría). Sale también en la hoja «Decisión» del Excel y
  en el PDF del informe de estado, que compara las métricas del ciclo
  (tasa de éxito, densidad de defectos, escapes, tiempo de corrección,
  reapertura y flaky) con las del ciclo cerrado anterior.
- Si reabres un ciclo y lo vuelves a cerrar, se guarda un cierre nuevo; los
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
7. **Riesgos residuales:** los defectos del ciclo que siguen abiertos hoy,
   los hallazgos abiertos y los umbrales de rendimiento incumplidos de los
   runs del ciclo (capítulo 10), y los requisitos sin cubrir o que fallan en
   el ciclo, del riesgo más alto al más bajo.
8. **Entregables:** los que guarda Pharos y los del plan, que marcas como
   entregados.
9. **Activos reutilizables:** casos, configuraciones y datos de prueba.
10. **Lecciones aprendidas.**
11. **Aprobación.**

«Exportar PDF» y «Exportar .xlsx» lo guardan en Descargas. El Excel trae el
informe completo y las hojas «Decisión», «Medidas», «Riesgos residuales»,
«Entregables» y «Casos».

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
- **«No aprobado» en un elemento.** El caso está en borrador o en revisión. Se
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
- Un ciclo eliminado va a la Papelera (Administración › General, capítulo
  15) y se restaura mientras dure la retención; sus runs siguen en
  «Ejecuciones».
- Cerrar un ciclo avisa en las notificaciones del equipo y a los webhooks
  del proyecto (capítulo 21).
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

### Antes del paso ciclo-ejecutado

**Más adelante en la historia.** Los pasos siguientes, desde «El ciclo,
ejecutado», ocurren después de los capítulos 10 a 13: un ciclo se cierra
cuando ya se ha ejecutado. Para entonces, Liomar ha importado el informe de la
automatización en el ciclo (capítulo 10), ha registrado los resultados de
Chrome y Edge como en el capítulo 11, ha abierto el defecto crítico del acceso
(capítulo 12) y ha vinculado REQ-006 a PH-004 (capítulo 13), un requisito más
que cuenta como cubierto. Con esas cifras, las que muestran las capturas,
cierra el ciclo con **No-go**: la versión no sale hasta corregir el acceso.
