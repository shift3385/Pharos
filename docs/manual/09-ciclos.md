<!-- Generado por `npm run manual` desde e2e/tours/09-ciclos.tour.ts y docs/manual/fuentes/ciclos.md. No lo edites a mano: edita la fuente. -->

# 9. Ciclos de prueba

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

## Paso a paso

### 9.1. Ciclos de prueba

Un ciclo agrupa lo que se va a probar en una ronda concreta (una regresión, una versión candidata), dónde y contra qué build. Ejecutarlo crea un run por configuración, donde se registran los resultados (capítulos 10 y 11). Pulsa «Ciclos de prueba» en el menú lateral. Arriba, «Nuevo ciclo» y los filtros por estado; sin ciclos, la lista dice «Aún no hay ciclos…».

![Ciclos de prueba](img/ciclos/01-vacio.png)

### 9.2. Nuevo ciclo

«Nuevo ciclo» pide el título (obligatorio), la build y el entorno contra los que se prueba, el hito y el sprint del plan, las fechas (se escriben dd/mm/aaaa o se eligen en el calendario de Pharos, capítulo 5; el de «Termina» abre en el mes de «Empieza» y no deja elegir un día anterior) y las configuraciones en las que se ejecutará (las de «Ajustes del proyecto», capítulo 14). En este ejemplo, «Regresión 0.3.0» de la build 0.3.0-rc1 en staging, del 9 al 20 de noviembre, en Chrome y en Edge sobre Windows 11. Sin configuraciones, el ciclo se ejecuta como un único run. Intro en un campo crea el ciclo.

![Nuevo ciclo](img/ciclos/02-nuevo-ciclo.png)

### 9.3. El ciclo, recién creado

«Crear ciclo» lo crea con su clave y abre su detalle: arriba, el estado, la build, el entorno, las fechas y el sprint; los botones «Ejecutar», «Informe de estado», «Editar» y el menú «⋯»; el resumen de resultados (pasa, falla, bloqueado, omitido, sin ejecutar) y las pestañas «Elementos», lo que hay que probar, y «Runs», las ejecuciones lanzadas. «← Ciclos» vuelve a la lista. Un ciclo vacío no se puede ejecutar todavía.

![El ciclo, recién creado](img/ciclos/03-detalle.png)

### 9.4. Añadir casos al ciclo

«Añadir casos» lista los casos del proyecto con buscador: marca los que entran en esta ronda, asígnalos a alguien si quieres (en este ejemplo, Liomar se los asigna a sí mismo) y confirma. Los que ya están en el ciclo salen marcados y bloqueados («Ya en el ciclo»). Pharos avisa si alguno no está aprobado («No aprobado»), para que no pruebes un caso aún en borrador sin saberlo; se añade igualmente.

![Añadir casos al ciclo](img/ciclos/04-anadir-casos.png)

### 9.5. Añadir por filtro

Para no marcar caso por caso, «Añadir por filtro» los elige por etiquetas, prioridad, estado del caso, requisitos o riesgo mínimo de sus requisitos (por ejemplo, «Alto (≥ 13)»). El recuento («N casos coinciden») se actualiza mientras marcas. Se añaden los que coinciden en ese momento: si después cambian, el ciclo no cambia.

![Añadir por filtro](img/ciclos/05-por-filtro.png)

### 9.6. Los elementos del ciclo

Cada elemento muestra el caso, a quién está asignado y su resultado en cada configuración. El asignado se edita en la propia fila: Intro o salir del campo lo guarda (en este ejemplo, los dos casos ya están asignados a Liomar). El menú de la fila, «Acciones de PH-…», lo sube, lo baja o lo quita del ciclo. «Quitar del ciclo» pregunta antes; quitarlo no borra el caso ni sus resultados, y puedes volver a añadirlo.

![Los elementos del ciclo](img/ciclos/06-elementos.png)

### 9.7. Quitar un elemento del ciclo

«Quitar del ciclo» pregunta antes de hacerlo. El caso deja de formar parte del ciclo, pero sus resultados ya registrados se conservan y puedes volver a añadirlo cuando quieras. Es una confirmación normal: Esc, un clic fuera o «Cancelar» lo dejan como estaba (en este ejemplo, Liomar cancela).

![Quitar un elemento del ciclo](img/ciclos/07-quitar-elemento.png)

### 9.8. Ejecutar el ciclo

«Ejecutar» crea un run por configuración con todos los elementos: así cada navegador o equipo lleva su propio registro de resultados. Cada caso se congela en su revisión actual: si después cambia, el run ejecuta la versión que había. Elige configuraciones, build y entorno (vienen del ciclo) y pulsa «Crear N runs». En la web también se puede ejecutar.

![Ejecutar el ciclo](img/ciclos/08-ejecutar.png)

### 9.9. Los runs del ciclo

Los runs creados aparecen en la pestaña «Runs» (con su configuración, su estado y su inicio) y en «Ejecuciones» (capítulo 10), listos para registrar resultados. Un clic en su clave abre el run para ejecutarlo paso a paso (capítulo 11).

![Los runs del ciclo](img/ciclos/09-runs.png)

### 9.10. Informe de estado de un ciclo

«Informe de estado» en la cabecera del ciclo abre el informe con el alcance ya puesto en ese ciclo: el progreso cuenta cada caso en cada configuración, como la pestaña «Elementos». El informe completo, con sus exportaciones a Excel y PDF, se explica en el capítulo 11.

![Informe de estado de un ciclo](img/ciclos/10-informe-ciclo.png)

### 9.11. Cerrar el ciclo: el quality gate

Un ciclo se cierra con «Cerrar ciclo…», nunca desde «Editar». Pharos evalúa los criterios de salida del plan sobre los resultados del ciclo. Cada criterio obligatorio que no se cumple, o que no tiene datos, pide una justificación de al menos 20 caracteres: por qué se acepta el riesgo, quién lo asume y cuándo se resuelve. Los criterios manuales («Visto bueno del PO») se marcan a mano y los orientativos solo se muestran. Si algún obligatorio falla, eliges «Go con riesgos» (la versión puede salir) o «No-go» (no sale). Al pie se ve quién firma y cuándo: queda en Auditoría.

![Cerrar el ciclo: el quality gate](img/ciclos/11-cerrar-ciclo.png)

### 9.12. Salir del cierre sin cerrar

Si sales con Esc o «Cancelar» después de escribir una justificación o marcar un criterio, Pharos pregunta antes de descartarlo: «Seguir editando» vuelve al cierre tal como estaba.

![Salir del cierre sin cerrar](img/ciclos/12-cierre-sin-guardar.png)

### 9.13. El veredicto del ciclo

«Cerrar ciclo» guarda la decisión con las cifras de ese momento, congeladas: el ciclo queda «Cerrado», con su veredicto al lado, y ya no admite casos ni ejecuciones hasta que lo reabras desde «Editar». Su informe de estado empieza ahora por «Decisión de salida», con cada criterio, su justificación y las métricas frente al ciclo anterior, también en Excel y PDF. Inicio lo suma a «Tendencia de ciclos».

![El veredicto del ciclo](img/ciclos/13-ciclo-cerrado.png)

### 9.14. El informe de cierre

En un ciclo cerrado, «Cerrar ciclo…» deja paso a «Informe de cierre»: el informe final de la ronda según ISO/IEC/IEEE 29119-3, con su ID (TCR-…). Pharos rellena lo que sabe del cierre: las desviaciones respecto al plan (fecha de fin, casos sin ejecutar, criterios que no se cumplen), la «Decisión de salida» con sus justificaciones, lo que bloqueó el avance, las métricas frente al ciclo anterior y al objetivo del plan, los defectos abiertos y los requisitos sin cubrir o sin pasar por riesgo, los entregables y los activos reutilizables. Tú escribes el resumen, las lecciones aprendidas y los comentarios de cada apartado, marcas los entregables del plan y pulsas «Guardar»: queda en el ciclo, se sincroniza y sale en Excel y PDF.

![El informe de cierre](img/ciclos/14-informe-cierre.png)

### 9.15. Aprobar el informe de cierre

Con todo guardado, «Aprobar informe» pide confirmación y deja tu nombre y la fecha en el apartado «Aprobación», en la cabecera del PDF y en el Excel. Si después cambias un texto, el informe pierde la aprobación al guardar. Si reabres el ciclo y lo vuelves a cerrar, el informe sigue al cierre nuevo: conserva los textos, pero hay que aprobarlo otra vez.

![Aprobar el informe de cierre](img/ciclos/15-aprobar-informe-cierre.png)

### 9.16. Clonar y eliminar un ciclo

El menú «⋯» del ciclo lo clona, con sus elementos y sin resultados, útil para repetir una regresión en la siguiente versión (el clon se abre solo); también lo elimina, tras confirmar.

![Clonar y eliminar un ciclo](img/ciclos/16-clonar.png)

### 9.17. Confirmar la eliminación

Eliminar un ciclo pide confirmación, con cuántos runs tiene. Los resultados no se pierden: sus runs se conservan, sin ciclo, en «Ejecuciones». Esc no cierra este aviso: solo «Cancelar».

![Confirmar la eliminación](img/ciclos/17-eliminar.png)

### 9.18. La lista de ciclos

La lista muestra cada ciclo con su clave, su título con la build y el entorno, su estado, sus fechas, sus configuraciones, su progreso y sus runs. Filtra por «Planificados», «Activos» o «Cerrados» (← → también cambian de filtro) para ver de un vistazo lo que está en curso; si ningún ciclo coincide, la lista lo dice.

![La lista de ciclos](img/ciclos/18-lista.png)

### 9.19. Los ciclos en el móvil

En el móvil, cada ciclo es una tarjeta con su clave, su estado, su título, sus fechas y su progreso. Dentro de un ciclo, cada elemento es una tarjeta con su caso, su asignado y una pastilla por configuración; su menú «⋯» lo sube, lo baja o lo quita. El asignado se cambia en la propia tarjeta.

<img src="img/ciclos/19-movil.png" alt="Los ciclos en el móvil" width="280">

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
  versión no sale: abre otro ciclo para repetir la prueba).

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

---

← [Casos de prueba](08-casos.md) · [Índice](README.md) · [Ejecuciones e importación de resultados](10-ejecuciones.md) →
