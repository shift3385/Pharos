# Ejecución manual (fuente del capítulo 11)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/11-ejecucion-manual.tour.ts`.

## Para qué sirve

La **ejecución manual** es donde se prueba a mano. Un run reúne los casos que
hay que ejecutar: los de un ciclo (capítulo 9) o los que eliges con «Nuevo
run manual». El **ejecutor** muestra los pasos de cada caso para que puedas:

- marcarlos uno a uno: Pasa, Falla, Bloqueado u Omitido;
- anotar lo obtenido;
- adjuntar evidencias;
- medir el tiempo.

Cada vez que guardas se registra un **intento**, que ya no cambia: repetir la
prueba crea otro, así que el historial de lo que pasó se conserva. Los
resultados alimentan:

- el progreso del run y del ciclo;
- el Inicio (capítulo 3);
- el informe de estado;
- la matriz de trazabilidad (capítulo 13).

Desde aquí se sale también el **informe de estado** (ISO/IEC/IEEE 29119-3), el
documento que resume una ronda de pruebas para quien decide.

En este manual, Liomar repite a mano los dos casos de acceso de Pharos. PH-001
falla en el paso 3: Pharos se queda en la entrada con «Correo o contraseña
incorrectos.». De ese fallo saca un defecto, que sigue en el capítulo 12.

## Atajos de teclado

| Tecla | Qué hace | Dentro de un campo |
| --- | --- | --- |
| P | Marca el paso enfocado como Pasa y salta al siguiente sin marcar | No |
| F | Lo marca como Falla, se queda en él y abre «Obtenido / notas» | No |
| B | Lo marca como Bloqueado, se queda en él y abre las notas | No |
| S | Lo marca como Omitido y pasa al siguiente | No |
| J o ↓ / K o ↑ | Paso siguiente / anterior | No |
| N | Abre «Obtenido / notas» del paso | No |
| T | Pone en marcha o pausa el cronómetro | No |
| ? | Muestra la lista de atajos | No |
| Ctrl+Enter (⌘+Enter) | Guarda el resultado | Sí |
| Ctrl+Mayús+N | Pasa al siguiente elemento del run | Sí |
| Ctrl+V | Pega la captura del portapapeles en el paso enfocado o en el resultado | Sí |

Las letras no hacen nada mientras escribes en un campo, con Ctrl o Alt
pulsado, con un diálogo abierto o en un run cerrado. En un run cerrado solo
funcionan «?» y Ctrl+Mayús+N.

## Si algo no sale

- **«El run está cerrado: puedes ver sus intentos, pero para ejecutar hay que
  reabrirlo.»** Pulsa «Reabrir» en la cabecera. Si dice que el ciclo está
  cerrado, reabre antes el ciclo (capítulo 9).
- **«El caso cambió después de añadirlo al run: se ejecuta la revisión N…».**
  Es lo esperado: el run ejecuta la versión del caso que tenía al crearlo. Si
  quieres la nueva, añade el caso a otro run.
- **«La revisión ejecutada no tiene pasos.»** Marca directamente el resultado
  global, abajo.
- **«Los adjuntos solo están disponibles en el escritorio.»** En la web se
  ejecuta igual, pero sin archivos; el borrador se queda en ese navegador.
- **«El portapapeles no tiene ninguna imagen…».** Haz la captura (Win+Mayús+S
  o ⌘⇧4) y vuelve a pegar. Si dice que no se pudo leer el portapapeles, pulsa
  Ctrl+V sobre el paso o el resultado.
- **«El archivo supera los 200 MB.»** Ese adjunto no se guarda.
- **«Este intento ya se guardó o lo cambió otra ventana…».** El mismo
  elemento estaba abierto en otra ventana o pestaña. Pharos recarga lo
  guardado.
- **«No se pudo guardar el borrador. Lo que marcaste sigue en pantalla.»**
  Sigue: lo marcado se guarda al registrar el resultado.
- **«Eliminar run» no se puede pulsar o está en gris.** Solo existe en la app
  de escritorio, y un run de un ciclo cerrado no se puede eliminar.
- **El informe de estado no ofrece «Ciclo» o «Plan».** El proyecto no tiene
  ciclos o no tiene plan; con el plan ausente, se usan los criterios de salida
  por defecto.

## En el móvil

- El ejecutor ocupa toda la pantalla en lugar de la lista. Al tocar un caso se
  abre, y «Cerrar la ejecución» (✕) vuelve.
- Desde 1280 px de ancho, en cambio, la lista y el ejecutor van uno junto al
  otro.
- Los adjuntos y «Pegar captura» son de la app de escritorio.

## Consejos

- Trabaja con el teclado: es mucho más rápido marcar con P, F, B y S y guardar
  con Ctrl+Enter.
- El borrador se guarda solo mientras marcas: puedes cerrar y seguir después.
- Escribe siempre lo obtenido en un paso que falla: es lo primero que leerá
  quien tenga que corregirlo, y pasa al defecto.
- Si solo quieres dejar de ejecutar un run, ciérralo como «Cancelado» en vez
  de eliminarlo.
- En la matriz de trazabilidad gana siempre el último resultado final, sea de
  un run manual o de un informe importado: repetir la prueba a mano después de
  un informe de Playwright cambia lo que muestra la matriz.
- En el informe de estado, los defectos se cuentan «a fecha de hoy», no por el
  periodo elegido. El resumen y las recomendaciones se guardan solo en este
  equipo, pero van en el Excel y en el PDF.

## Véase también

- Capítulo 9, «Ciclos de prueba»: los runs de un ciclo.
- Capítulo 10, «Ejecuciones e importación de resultados».
- Capítulo 12, «Defectos».
- Capítulo 13, «Trazabilidad»: el último resultado de cada caso.
- [Glosario](../GLOSARIO.md), sección «Execution model identifiers»: run,
  elemento, objetivo, intento, último resultado, informe de estado, criterio de
  salida evaluado.
