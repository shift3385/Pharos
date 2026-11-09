# Plan de pruebas (fuente del capítulo 5)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/05-plan.tour.ts`. Los botones de IA del plan se recorren en el
capítulo 17, porque necesitan una clave real.

## Para qué sirve

El **plan de pruebas** es el documento que dice qué se prueba, cómo, con qué
medios, quién y cuándo. Hay un plan por proyecto. Pharos lo redacta con un
asistente de **19 pasos** que sigue la norma ISO/IEC/IEEE 29119-3:

| Pasos | Qué decides |
| --- | --- |
| 1–3 | Título y estado; versión, fecha y autor; resumen |
| 4–8 | Alcance, tipos y niveles de prueba, metodología y entregables |
| 9–12 | Entorno, herramientas y automatización, datos de prueba y gestión de defectos |
| 13–15 | Roles, cronograma (sprints e hitos) y riesgos con su mitigación |
| 16–19 | Comunicación, criterios de cierre, propósito y conclusión |

El plan alimenta otras pantallas:

- Los **criterios de cierre** (paso 17) son los criterios de salida que evalúa
  el Inicio (capítulo 3) y el informe de estado (capítulo 11).
- El **cronograma** da la fecha de cierre que se ve en la cabecera del
  proyecto y en «Criterios de salida».
- Los **tipos y niveles** guían las sugerencias de casos con IA (capítulo 17).

Cada guardado crea una **revisión**, y el plan se exporta en PDF (listo para
firmar) o en Excel.

En este manual, Liomar escribe el «Plan de pruebas de Pharos 0.3.0»: qué se
prueba de la propia aplicación en esta versión.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Tab / Mayús+Tab | Cualquier paso | Recorre los campos; al cambiar de paso, el foco va a su título |
| Intro | «Especifica otro…» (tipos), «Otro entregable», «¿No está en la lista?» (herramientas) | Añade lo escrito |
| Intro | Fecha de un sprint o un hito (dd/mm/aaaa) | Aplica la fecha; salir del campo también la aplica |
| ← → | Calendario del cronograma | Día anterior o siguiente |
| ↑ ↓ | Calendario del cronograma | Semana anterior o siguiente |
| Inicio / Fin | Calendario del cronograma | Primer o último día de la semana |
| RePág / AvPág | Calendario del cronograma | Mes anterior o siguiente |
| Intro o Espacio | Calendario del cronograma | Marca el día enfocado (inicio o fin del sprint, o un hito) |
| Esc | Calendario del cronograma | Cancela el sprint que estás marcando |

## Si algo no sale

- **«No se puede guardar: revisa 1 campo».** Falta el título (paso 1): es lo
  único obligatorio. Pharos te lleva a ese paso.
- **«Guardado con N avisos por revisar».** El plan se guardó, pero hay filas
  repetidas o fechas del cronograma que revisar.
- **El paso 6 no queda completo.** La línea bajo el paso dice qué falta: la
  duración del sprint, al menos una reunión o, en «Tradicional», al menos una
  fase.
- **Una fila del cronograma dice «Fecha no válida», «La fecha de fin es
  anterior a la de inicio», «Se solapa con…» o «Dura N días; la Metodología
  indica M».** Son avisos: el plan se guarda igualmente, pero conviene
  corregirlos.
- **No puedo arrastrar los extremos de un sprint.** Arrastrar solo funciona con
  ratón y en ventanas anchas. En pantallas táctiles o estrechas, edita las
  fechas en su fila.
- **«No se pudo leer el archivo. Prueba con un .xlsx sin comentarios de
  celda.»** Quita los comentarios del Excel y vuelve a importarlo.
- **«No se pudo cargar el plan de pruebas.»** Pulsa «Reintentar». Mientras no
  carga, Pharos no muestra el asistente, para no crear un segundo plan por
  error.
- **«Sin revisiones anteriores» en la versión web.** La web todavía no guarda
  revisiones del plan; la app de escritorio sí.
- **Los botones ✨ están en gris.** No hay un motor de IA configurado
  (Administración › Motor de IA, capítulo 15). El plan funciona igual sin IA.

## En el móvil

- La lista de pasos se sustituye por «Ver pasos», que la abre como una hoja
  desde abajo, con los pasos completos marcados.
- En pantallas medianas, los pasos se ven como una tira horizontal centrada en
  el paso actual.
- El menú «Importar / Exportar» se abre como una hoja.
- En el cronograma, las fechas se editan en las filas: en pantallas táctiles no
  se arrastran los extremos de los sprints.

## Consejos

- No hace falta rellenar los 19 pasos de una vez: la lista marca los completos
  y «Antes de terminar» (paso 19) enlaza a los que faltan.
- La duración del sprint (paso 6) se usa en el cronograma: si un sprint dura
  otra cosa, Pharos lo avisa en su fila.
- Para empezar un plan desde Excel, descarga una plantilla en «Administración ›
  Plantillas», rellénala e impórtala con «Importar .xlsx».
- «Restaurar» una revisión no guarda nada hasta que pulses «Guardar».
- El plan en PDF mantiene cada título de sección junto al inicio de su
  contenido; si una tabla sigue en otra página, su título y sus columnas se
  repiten arriba. La Metodología muestra una entrada por línea y los rangos del
  cronograma se leen «2026-11-09 – 2026-11-22». Los hitos aparecen bajo el
  cronograma y los ciclos, al final.
- Si el documento debe llevar su historial, elige «Historial de revisiones» en
  «Ajustes del proyecto › Historial en el plan exportado» (capítulo 14). El
  .pdf y el .xlsx (también los del ZIP del proyecto) añaden entonces la tabla
  «Historial de revisiones»:
  - **Dónde va:** tras la cabecera en el PDF, y en una hoja propia en el .xlsx.
  - **Qué filas tiene:** una por persona y día, que es su último guardado de
    ese día. Van de la más antigua (arriba) a la más reciente (abajo).
  - **Qué dice cada fila:** la versión, la fecha y hora, quién la hizo (nombre
    y apellidos del perfil), el estado y las secciones que cambió.
  - **Qué no entra:** los guardados sin cambios y lo que aún no has guardado.
    El día es el de tu zona horaria.
  - **En la web:** el historial empieza en los cambios hechos desde la versión
    0.2.0. Si de un guardado antiguo no se sabe la versión o el estado, la
    celda muestra «—».

## Véase también

- Capítulo 3, «Inicio»: los criterios de salida.
- Capítulo 14, «Ajustes del proyecto»: el historial en el plan exportado.
- Capítulo 17, «Asistente de IA»: asistir en un campo y sugerir riesgos,
  responsabilidades y criterios.
- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.3.
- [Glosario](../GLOSARIO.md): «Plan de pruebas», «Entregable», «Paso completado», «Cierre del ciclo».

### Paso cronograma

Un sprint seleccionado se puede alargar o acortar arrastrando sus extremos en
el calendario, o editando sus fechas en la fila (dd/mm/aaaa e Intro).
