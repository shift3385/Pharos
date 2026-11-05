<!-- Generado por `npm run manual` desde e2e/tours/07-ciclos.tour.ts y docs/manual/fuentes/ciclos.md. No lo edites a mano: edita la fuente. -->

# 7. Ciclos y configuraciones

## Para qué sirve

Un **ciclo de prueba** reúne los casos que se van a ejecutar en una ronda
concreta (una regresión, un sprint), contra una build y en unas
**configuraciones** (por ejemplo, Chrome en Windows y Edge en Windows).
«Ejecutar» crea un run por configuración con todos los elementos del ciclo;
los resultados de esos runs alimentan el progreso del ciclo, «Inicio» y la
matriz de trazabilidad.

## Paso a paso

### 7.1. Ciclos de prueba

Pulsa «Ciclos de prueba» en el menú lateral. Arriba, «Nuevo ciclo» y los filtros por estado; sin ciclos, la lista lo indica.

![Ciclos de prueba](img/ciclos/01-vacio.png)

### 7.2. Nuevo ciclo

«Nuevo ciclo» pide título, build, entorno, hito y sprint del plan, fechas y las configuraciones en las que se ejecutará.

![Nuevo ciclo](img/ciclos/02-nuevo-ciclo.png)

### 7.3. El ciclo, recién creado

«Crear ciclo» lo crea con su clave (CY-1) y abre su detalle: resumen de resultados y las pestañas «Elementos» y «Runs».

![El ciclo, recién creado](img/ciclos/03-detalle.png)

### 7.4. Añadir casos al ciclo

«Añadir casos» lista los casos del proyecto con buscador; marca los que quieras, asígnalos a alguien si quieres y confirma. Pharos avisa si alguno no está aprobado.

![Añadir casos al ciclo](img/ciclos/04-anadir-casos.png)

### 7.5. Añadir por filtro

«Añadir por filtro» elige los casos por etiquetas, prioridad, estado, requisitos o riesgo; el recuento se actualiza mientras marcas.

![Añadir por filtro](img/ciclos/05-por-filtro.png)

### 7.6. Los elementos del ciclo

Cada elemento muestra el caso, a quién está asignado (se edita en la propia fila; Intro guarda) y su resultado. El menú de la fila lo sube, lo baja o lo quita del ciclo.

![Los elementos del ciclo](img/ciclos/06-elementos.png)

### 7.7. Ejecutar el ciclo

«Ejecutar» crea un run por configuración con todos los elementos. Elige configuraciones, build y entorno y pulsa «Crear N runs».

![Ejecutar el ciclo](img/ciclos/07-ejecutar.png)

### 7.8. Los runs del ciclo

Los runs creados aparecen en la pestaña «Runs» y en «Ejecuciones» (capítulo 8), listos para registrar resultados.

![Los runs del ciclo](img/ciclos/08-runs.png)

### 7.9. Informe de estado de un ciclo

«Informe de estado» en la cabecera del ciclo abre el informe con el alcance ya puesto en ese ciclo: el progreso cuenta cada caso en cada configuración, como la pestaña «Elementos». El informe completo se explica en el capítulo 13.

![Informe de estado de un ciclo](img/ciclos/09-informe-ciclo.png)

### 7.10. Clonar y eliminar un ciclo

El menú «⋯» del ciclo lo clona (con sus elementos, sin resultados: útil para la siguiente regresión) o lo elimina tras confirmar.

![Clonar y eliminar un ciclo](img/ciclos/10-clonar.png)

### 7.11. Confirmar la eliminación

Eliminar un ciclo pide confirmación; sus runs se conservan en «Ejecuciones».

![Confirmar la eliminación](img/ciclos/11-eliminar.png)

### 7.12. La lista de ciclos

La lista muestra cada ciclo con su estado, fechas, configuraciones, progreso y runs; filtra por Planificados, Activos o Cerrados.

![La lista de ciclos](img/ciclos/12-lista.png)

## Consejos

- Crea las configuraciones antes, en «Ajustes del proyecto».
- «Añadir por filtro» es la forma rápida de montar una regresión: por
  prioridad, estado, requisitos o riesgo.
- «Clonar» prepara la siguiente ronda con los mismos elementos y sin
  resultados.
- «Informe de estado» en la cabecera del ciclo resume esa ronda (progreso por
  caso y configuración, defectos, cobertura y criterios de salida) para
  enviarla en Excel o PDF.

## Véase también

- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.4c.
- [Glosario](../GLOSARIO.md), sección «Execution model identifiers»: ciclo, elemento de ciclo, run, configuración.

---

← [Planificador](06-planificador.md) · [Índice](README.md) · [Ejecuciones e importación de resultados](08-ejecuciones.md) →
