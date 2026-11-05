# Ejecución manual (fuente del capítulo 13)

## Para qué sirve

La **ejecución manual** es donde se prueba a mano: un run con sus casos, y un
ejecutor que muestra los pasos de cada caso para marcarlos uno a uno (Pasa,
Falla, Bloqueado, Omitido), anotar lo obtenido y adjuntar evidencias. Cada
vez que guardas se registra un **intento** que no cambia; repetir la prueba
crea otro. Los resultados alimentan el progreso del run y del ciclo, «Inicio»
y la matriz de trazabilidad.

## Consejos

- Trabaja con el teclado: P / F / B / S marcan, J / K mueven, N escribe lo
  obtenido, T pone en marcha el cronómetro, Ctrl+Enter guarda y
  Ctrl+Shift+N pasa al siguiente elemento; «?» muestra la lista.
- El borrador se guarda solo mientras marcas: puedes cerrar y seguir después.
- Pega capturas con Ctrl+V sobre el paso o el resultado; se cifran en este
  equipo al adjuntarlas.
- Si el caso cambió después de añadirlo al run, se ejecuta la revisión que el
  run congeló: el resultado siempre apunta a lo que se probó.
- En la versión web se ejecuta igual, pero sin archivos: «Los adjuntos solo están disponibles en el
  escritorio». El borrador se queda en ese navegador; el intento guardado se ve
  en todos tus equipos.
- «Eliminar run» quita un run que sobra (uno de prueba, uno duplicado) de
  las listas y del progreso, también en los equipos que sincronicen. Sus resultados no se borran a mano: quedan ocultos y la
  purga se los lleva con el run pasada la retención de «Administración →
  General». Un run de un ciclo cerrado no se elimina: reabre antes el ciclo.
  Si solo quieres dejar de ejecutarlo, ciérralo como «Cancelado».

## Véase también

- Capítulo 7, «Ciclos y configuraciones» (los runs de un ciclo) y capítulo 9, «Defectos».
- [Glosario](../GLOSARIO.md), sección «Execution model identifiers»: run, elemento, objetivo, intento.
