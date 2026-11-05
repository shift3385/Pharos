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
- «Eliminar run» quita un run que sobra (uno de prueba, uno duplicado) de
  las listas y del progreso, también en los equipos que sincronicen. Sus resultados no se borran a mano: quedan ocultos y la
  purga se los lleva con el run pasada la retención de «Administración →
  General». Un run de un ciclo cerrado no se elimina: reabre antes el ciclo.
  Si solo quieres dejar de ejecutarlo, ciérralo como «Cancelado».
- En la matriz de trazabilidad gana siempre el último resultado final, sea de
  un run manual o de un informe importado: repetir la prueba a mano después de
  un informe de Playwright cambia lo que muestra la matriz.
- El **informe de estado** (ISO/IEC/IEEE 29119-3) sale de las ejecuciones: el
  resumen se rellena con las cifras y las recomendaciones las escribes tú. Los
  dos textos se guardan solo en este equipo y van en el Excel y el PDF; los
  defectos se cuentan «a fecha de hoy», no por el periodo elegido.

## Véase también

- Capítulo 7, «Ciclos y configuraciones» (los runs de un ciclo) y capítulo 9, «Defectos».
- [Glosario](../GLOSARIO.md), sección «Execution model identifiers»: run, elemento, objetivo, intento, último resultado, informe de estado, criterio de salida evaluado.
