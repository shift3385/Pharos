---
section: Añadido
---

- **Módulo «Defectos».** Cada proyecto tiene su sección Defectos, con una lista (filtros por estado y severidad, búsqueda) y un tablero por estado. Un defecto tiene clave `DEF-001`, **severidad** (impacto: crítica, mayor, menor, trivial) aparte de la prioridad (urgencia), pasos para reproducir, resultado esperado y obtenido, build y entorno donde se encontró, la build que lo corrige, a quién está asignado y una clave o enlace externo. Se vincula a casos de prueba, requisitos y resultados de ejecución, y guarda evidencias cifradas en el equipo.
- **Ciclo de vida fijo**: Nuevo → Abierto → En curso → Corregido → En retest → Cerrado. Desde En retest vuelve a Abierto si el arreglo falla; Nuevo y Abierto pueden pasar a Rechazado o Aplazado, y Cerrado, Rechazado y Aplazado se reabren. Cerrar o rechazar pide la resolución (corregido, duplicado, no reproducible, no se corregirá, funciona según el diseño). En el tablero, arrastrar a una columna que el ciclo no admite muestra un aviso.
- **«Desde un resultado»** (app de escritorio): crea el defecto a partir de un intento fallido con los pasos de la revisión ejecutada, lo obtenido, la build y el entorno del run, lo vincula al resultado y a su caso, y le añade las evidencias del resultado sin copiar los archivos.
