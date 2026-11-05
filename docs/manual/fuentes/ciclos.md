# Ciclos y configuraciones (fuente del capítulo 7)

## Para qué sirve

Un **ciclo de prueba** reúne los casos que se van a ejecutar en una ronda
concreta (una regresión, un sprint), contra una build y en unas
**configuraciones** (por ejemplo, Chrome en Windows y Edge en Windows).
«Ejecutar» crea un run por configuración con todos los elementos del ciclo;
los resultados de esos runs alimentan el progreso del ciclo, «Inicio» y la
matriz de trazabilidad.

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
