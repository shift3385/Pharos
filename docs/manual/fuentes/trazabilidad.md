# Trazabilidad (fuente del capítulo 13)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/13-trazabilidad.tour.ts`. Los requisitos se crean en el
capítulo 7 y se enlazan a los casos en el capítulo 8.

## Para qué sirve

La **matriz de trazabilidad** responde a «¿está probado este requisito?».
Cruza cuatro cosas que se hacen en otros capítulos:

- los **requisitos** (capítulo 7), con su prioridad y su riesgo;
- los **casos** que los verifican (capítulo 8), enlazados por la clave del
  requisito (`@REQ-001` en su Gherkin);
- el **último resultado** de cada caso, de los runs manuales (capítulo 11) o
  de los informes importados (capítulo 10);
- los **defectos** de cada caso (capítulo 12).

Un requisito está **cubierto** si tiene al menos un caso vivo que no esté
obsoleto. La **cobertura** es el porcentaje de requisitos cubiertos; los que
no tienen ningún caso salen en rojo.

El **estado de prueba** de un caso es el último resultado final de sus
ejecuciones, con la clave del run y la fecha. Gana siempre el más reciente,
sea manual o importado: repetir a mano una prueba después de un informe de
Playwright cambia lo que muestra la matriz. Lo matizan tres avisos:

- **Flaky:** el test pasó después de fallar.
- **Desactualizado:** se ejecutó una revisión anterior del caso.
- **Re-test:** el caso falló y su defecto ya está corregido; toca repetirlo.

El **riesgo** del requisito (probabilidad × impacto) ordena la matriz: lo más
arriesgado, primero.

En este manual, Liomar revisa qué está probado de Pharos 0.3.0 cuando ya
tiene la importación de JUnit, la ejecución manual y los dos defectos.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Tab | Filtros, orden e interruptor «Mostrar solo huecos» | Recorre los controles |
| Espacio | Interruptor «Mostrar solo huecos» | Lo activa o lo desactiva |
| ↑ ↓ | Selectores de filtro y de orden | Cambian la opción |
| Esc | Diálogo «Migrar trazabilidad» | Lo cierra sin aplicar nada |

## Si algo no sale

- **«Aún no hay requisitos…».** La matriz se llena con los requisitos del
  proyecto. «Ir a Requisitos» lleva al capítulo 7.
- **Un requisito sale en rojo.** No tiene ningún caso. Enlázale uno desde el
  editor del caso (capítulo 8) o genera casos desde él.
- **Un caso enlazado no cuenta.** Está obsoleto: un caso obsoleto no cubre
  (la columna «Comentarios» lo dice).
- **Todo dice «No ejecutado».** No hay resultados con los filtros elegidos.
  Pulsa «Quitar filtros».
- **«No se pudieron leer los resultados: la matriz muestra los casos como no
  ejecutados.»** Los requisitos y los casos se ven igual; recarga la sección.
- **El caso menciona el requisito pero la matriz no lo cuenta.** La mención
  está en «Otras referencias (texto libre)». Usa «Migrar trazabilidad».
- **«Todos los requisitos tienen al menos un caso. No hay huecos.»** Con
  «Mostrar solo huecos» activo, es buena señal.

## En el móvil

- La matriz pasa a una lista: cada requisito es una tarjeta con sus casos,
  sus estados y sus defectos, cada dato con su etiqueta.

## Consejos

- «Mostrar solo huecos» es la vista de trabajo antes de cerrar un ciclo.
- Evalúa el riesgo de los requisitos importantes: sin probabilidad e impacto,
  quedan «Sin evaluar» al final de la matriz.
- Filtra por ciclo o por build para ver la foto de una ronda concreta. Los
  filtros quedan en la dirección de la página: guárdala o compártela.
- «Exportar matriz (.xlsx)» trae la hoja «Resultados» con el run, la fecha y
  los defectos de cada caso, y los filtros activos anotados, para revisarla
  fuera de la app o adjuntarla a una auditoría.

## Véase también

- Capítulo 7, «Requisitos»: crear, importar y evaluar el riesgo.
- Capítulo 8, «Casos de prueba»: enlazar requisitos.
- Capítulo 11, «Ejecución manual»: el informe de estado, que resume la misma
  información por ronda.
- [Glosario](../GLOSARIO.md): «Último resultado», «Desactualizado»,
  «Re-test», «Banda de riesgo».
