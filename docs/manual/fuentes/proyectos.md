# Inicio, proyectos y ajustes (fuente del capítulo 2)

## Para qué sirve

Un **proyecto** es la carpeta de un producto o una versión que pruebas: tiene
un plan de pruebas, sus casos, requisitos, ciclos, ejecuciones, defectos y un
planificador. «Inicio» resume todos tus proyectos de un vistazo, y en los
**ajustes** de cada proyecto se decide cómo se numeran sus casos, qué campos
propios tienen y en qué configuraciones (navegadores, dispositivos) se
ejecutan.

## Consejos

- Elige el **prefijo** de los casos al principio (por ejemplo `BM-`): el ID de
  un caso no cambia una vez asignado, porque viaja como tag (por ejemplo, `@BM-001`) en la
  automatización.
- Los **campos personalizados** nunca se borran, se archivan: así los valores
  que ya tienen los casos no se pierden.
- Las **etiquetas de importación** de una configuración deben coincidir con
  los nombres que usa tu herramienta (por ejemplo, el nombre del proyecto de
  Playwright, `chromium`). Así un informe importado sabe en qué configuración
  se ejecutó.
- «Historial en el plan exportado» decide si el .pdf y el .xlsx del plan
  llevan solo la versión vigente (como siempre) o también la tabla «Historial
  de revisiones» (capítulo 3). Se guarda al elegirlo y vale para el asistente
  y para el ZIP.
- Eliminar un proyecto borra todo su contenido: exporta antes un ZIP si
  quieres conservarlo.

## Véase también

- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.3 «Plan, casos y exportaciones».
- [Glosario](../GLOSARIO.md): «Proyecto», «Prefijo de ID de caso», «Recientes».
