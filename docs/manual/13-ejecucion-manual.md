<!-- Generado por `npm run manual` desde e2e/tours/13-ejecucion-manual.tour.ts y docs/manual/fuentes/ejecucion-manual.md. No lo edites a mano: edita la fuente. -->

# 13. Ejecución manual

## Para qué sirve

La **ejecución manual** es donde se prueba a mano: un run con sus casos, y un
ejecutor que muestra los pasos de cada caso para marcarlos uno a uno (Pasa,
Falla, Bloqueado, Omitido), anotar lo obtenido y adjuntar evidencias. Cada
vez que guardas se registra un **intento** que no cambia; repetir la prueba
crea otro. Los resultados alimentan el progreso del run y del ciclo, «Inicio»
y la matriz de trazabilidad.

## Paso a paso

### 13.1. Nuevo run manual

En «Ejecuciones», «Nuevo run manual» crea un run para ejecutar a mano: título, entorno, build, configuración y los casos que entran (con su revisión vigente).

![Nuevo run manual](img/ejecucion-manual/01-nuevo-run.png)

### 13.2. La pantalla del run

El run abierto muestra su cabecera (clave, entorno, build, configuración, estado), el progreso por resultado y sus elementos. Cada caso Outline o con flujos se ejecuta una vez por fila o por flujo.

![La pantalla del run](img/ejecucion-manual/02-pantalla-run.png)

### 13.3. El ejecutor

«Ejecutar» abre el ejecutor junto a la lista: los pasos del caso con su resultado esperado. Marca cada paso como Pasa, Falla, Bloqueado u Omitido; con el teclado, P / F / B / S marcan y J / K (o las flechas) cambian de paso.

![El ejecutor](img/ejecucion-manual/03-ejecutor.png)

### 13.4. Los atajos de teclado

«Atajos» (o «?») muestra todas las teclas del ejecutor.

![Los atajos de teclado](img/ejecucion-manual/04-atajos.png)

### 13.5. Adjuntar evidencias

Cada paso y el resultado admiten archivos, una imagen pegada (Ctrl+V o «Pegar captura») o una captura del sistema. Se cifran en este equipo al adjuntarlas. El borrador se guarda solo: si cierras, lo encuentras al volver.

![Adjuntar evidencias](img/ejecucion-manual/05-evidencia.png)

### 13.6. Pegar una captura

Con el foco en un paso o en el resultado, Ctrl+V pega la imagen del portapapeles (una captura hecha con Win+Mayús+S) como evidencia, sin guardarla antes en un archivo.

![Pegar una captura](img/ejecucion-manual/06-pegar-captura.png)

### 13.7. Guardar el resultado

«Guardar resultado» (o Ctrl+Enter) registra el intento con el estado que resulta de los pasos (aquí, Falla). Un intento guardado no cambia: repetir la prueba crea otro intento.

![Guardar el resultado](img/ejecucion-manual/07-guardar.png)

### 13.8. Crear un defecto desde el intento fallido

En un intento fallido, «Crear defecto» abre el editor de defectos relleno con el caso, el paso y lo obtenido, ya vinculado al resultado.

![Crear un defecto desde el intento fallido](img/ejecucion-manual/08-crear-defecto.png)

### 13.9. Descartar un borrador

«Descartar» tira el borrador del elemento (y sus adjuntos) después de confirmarlo.

![Descartar un borrador](img/ejecucion-manual/09-descartar.png)

### 13.10. Editar los datos del run

«Editar datos» cambia el título, el entorno, la build o la configuración del run.

![Editar los datos del run](img/ejecucion-manual/10-editar-run.png)

### 13.11. Cerrar el run

«Cerrar run» avisa de lo que queda sin ejecutar y de los borradores pendientes (que se pueden descartar); un run cerrado no admite intentos nuevos. «Reabrir» lo vuelve a abrir.

![Cerrar el run](img/ejecucion-manual/11-cerrar-run.png)

### 13.12. Run cerrado y reabierto

Tras cerrar, el run queda en solo lectura; «Reabrir» permite volver a ejecutar.

### 13.13. Los resultados en la matriz

En «Trazabilidad → Matriz», cada caso muestra su último resultado final, venga de un run manual o de un informe importado (capítulo 8): el estado, la clave del run y la fecha, y avisos como «Flaky» o «Desactualizado» (se ejecutó una revisión anterior del caso). Los filtros de arriba limitan los resultados a un ciclo, una configuración, una build o un entorno.

![Los resultados en la matriz](img/ejecucion-manual/13-matriz-resultados.png)

### 13.14. Del resultado a su run

La clave del run (RUN-…) abre la pantalla de ese run. «Quitar filtros» devuelve todos los resultados.

### 13.15. Informe de estado

En «Ejecuciones», «Informe de estado» genera el informe de estado de pruebas (ISO/IEC/IEEE 29119-3) del proyecto, de un ciclo o del plan, en el periodo que elijas: progreso, resultados por estado, defectos (a fecha de hoy), cobertura y riesgos, los criterios de salida del plan (cumple / no cumple) y los bloqueos. El resumen se rellena con las cifras y, con las recomendaciones, se guarda solo en este equipo.

![Informe de estado](img/ejecucion-manual/15-informe-estado.png)

### 13.16. Exportar el informe a Excel

«Exportar .xlsx» guarda el informe en la carpeta de descargas: una hoja «Resumen» con las nueve secciones y hojas con los resultados por caso, los defectos y la cobertura por requisito.

### 13.17. Exportar el informe a PDF

«Exportar PDF» guarda el mismo informe como documento, listo para enviar.

## Consejos

- Trabaja con el teclado: P / F / B / S marcan, J / K mueven, N escribe lo
  obtenido, T pone en marcha el cronómetro, Ctrl+Enter guarda y
  Ctrl+Shift+N pasa al siguiente elemento; «?» muestra la lista.
- El borrador se guarda solo mientras marcas: puedes cerrar y seguir después.
- Pega capturas con Ctrl+V sobre el paso o el resultado; se cifran en este
  equipo al adjuntarlas.
- Si el caso cambió después de añadirlo al run, se ejecuta la revisión que el
  run congeló: el resultado siempre apunta a lo que se probó.
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

---

← [Pantallas estrechas y móvil](12-movil.md) · [Índice](README.md) · [Evidencias](14-evidencias.md) →
