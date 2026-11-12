# Plan de pruebas (fuente del capítulo 5)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/05-plan.tour.ts`. Los botones de IA del plan se recorren en el
capítulo 17, porque necesitan una clave real.

## Para qué sirve

El **plan de pruebas** es el documento que dice qué se prueba, cómo, con qué
medios, quién y cuándo. Hay un plan por proyecto. Pharos lo redacta con un
asistente de **22 pasos** que sigue la norma ISO/IEC/IEEE 29119-3 y el apartado
5.1.1 de ISTQB CTFL v4:

| Pasos | Qué decides |
| --- | --- |
| 1–2 | Identificación del plan (título, estado, ID de documento, versión y fecha; el autor es tu nombre del perfil y lo ves en «Estado del plan») y resumen |
| 3–8 | Alcance, supuestos y restricciones, niveles y tipos de prueba, técnicas de prueba, metodología y entregables |
| 9–12 | Entorno, herramientas y automatización, datos de prueba y gestión de defectos |
| 13–16 | Roles, independencia y formación; estimación y presupuesto; cronograma (sprints e hitos) y riesgos con su mitigación |
| 17–20 | Comunicación; entrada, suspensión y reanudación; métricas y objetivos medibles; criterios de cierre |
| 21–22 | Propósito y conclusión |

Hasta la versión 0.2 el asistente tenía 19 pasos: «Título» y «Versión, fecha y
autor» son ahora el paso 1, y «Tipos de prueba» y «Niveles de prueba» el
paso 5. En la 0.3 tenía 17: los pasos 4, 6, 14, 18 y 19 son nuevos en la 0.4.
Un plan guardado entonces se abre con todos sus datos y los pasos nuevos por
completar.

**Niveles y tipos de prueba** (paso 5) responde, como propone ISTQB, a qué se
prueba, en qué nivel y con qué tipo. Los niveles dicen dónde: unitarias (un
componente), integración (sus interfaces), sistema (de extremo a extremo) y
aceptación (usuario y negocio). Los tipos dicen qué característica se
comprueba, en tres grupos: funcionales; no funcionales (rendimiento, carga,
estrés, seguridad, usabilidad, compatibilidad, accesibilidad); y
**confirmación y regresión**, las pruebas que siguen a un cambio:

- **Confirmación:** volver a probar lo que falló, una vez arreglado.
- **Regresión:** comprobar que lo que funcionaba sigue funcionando.
- **Humo:** una pasada rápida por lo básico de una versión nueva.
- **Sanidad:** una comprobación corta de lo que se acaba de cambiar.

Las casillas van en columnas por grupo. Lo que el equipo añade queda en la
columna **«Propios»**, con una ✕ para quitarlo y, al pie, el campo para añadir
otro; las **Técnicas de prueba** (paso 6) y los **Entregables** (paso 8) siguen
el mismo diseño. Las técnicas son las de CTFL v4: de caja negra (particiones de
equivalencia, valores límite, tablas de decisión, transición de estados), de
caja blanca (sentencias y ramas), basadas en la experiencia (predicción de
errores, exploratoria, listas de comprobación) y colaborativas (historias de
usuario, criterios de aceptación, ATDD).

**Supuestos y restricciones** (paso 4) separa lo que se da por hecho al
planificar (un entorno disponible, que las historias lleguen con criterios de
aceptación) de los límites que el equipo no puede cambiar (plazos, personas,
normas). **Entrada, suspensión y reanudación** (paso 18) dice cuándo puede
empezar un ciclo, cuándo se detiene la prueba y qué tiene que pasar para
retomarla. En los dos pasos, «Sugerir con IA» propone elementos de cada lista.

**Roles, independencia y formación** (paso 13) añade, bajo la tabla de roles,
la **independencia de las pruebas** en una escala de cinco (de quien escribe el
código a un equipo externo) con cómo se garantiza, y las **necesidades de
formación** del equipo con su plazo.

**Estimación y presupuesto** (paso 14) recoge la técnica (por proporciones, por
extrapolación, Wideband Delphi, tres puntos o juicio experto), el esfuerzo en
persona-días y el presupuesto. Con la de tres puntos escribes el optimista, el
más probable y el pesimista, y Pharos calcula E = (O + 4·M + P) / 6 y su
desviación.

**Métricas y objetivos medibles** (paso 19) es una fila por métrica con su
comparador y su objetivo. Las del catálogo las mide Pharos y su unidad es fija:
casos ejecutados, tasa de éxito, cobertura, reapertura e inestables en %;
defectos críticos abiertos y defectos escapados en número; la densidad de
defectos por cada 100 casos ejecutados, y el tiempo de corrección en días (la
mediana hasta «Corregido»). Las **propias** llevan nombre y unidad y se valoran
a mano. Marcar **«Criterio de salida»** lleva la métrica a «Criterios de
cierre» (paso 20), donde cada criterio dice **«Medido por»** qué métrica lo mide
y si es **«Bloqueante»** (por defecto) u **«Orientativo»**. El texto de un
criterio medido se escribe desde su métrica y se actualiza si la cambias. Un
plan nuevo empieza con cuatro métricas y los tres criterios de siempre
enlazados.

**Metodología** (paso 7) va en dos columnas con ese mismo aspecto. En **«Método
de trabajo»**, la metodología y, si es ágil, la duración del sprint («2
semanas»). En **«Reuniones del equipo»**, una fila por reunión (diaria,
revisión, retrospectiva y planificación) con su casilla, su nombre y su
frecuencia; la frecuencia de una reunión sin marcar se ve en gris hasta que la
marcas. «Tradicional / V-model» no trabaja por sprints: en lugar de la duración
y las reuniones, pide las fases del proyecto.

**Las fechas** (la del plan, las de los ciclos, el periodo del informe de
estado y los campos personalizados de tipo fecha) usan el selector de fechas de
Pharos: se escriben dd/mm/aaaa o se eligen en un calendario con el mismo
aspecto que el del cronograma, que se abre con el botón del calendario al final
del campo (en el móvil, como una hoja desde abajo). Al pie, «Hoy» y «Borrar».
En un rango, el calendario del fin abre en el mes del inicio y no deja elegir
un día anterior.

El plan alimenta otras pantallas:

- Los **criterios de cierre** (paso 20) son los criterios de salida que evalúa
  el Inicio (capítulo 3) y el informe de estado (capítulo 11); los medidos por
  una métrica se evalúan con ella.
- El **cronograma** da la fecha de cierre que se ve en la cabecera del
  proyecto y en «Criterios de salida».
- Los **tipos y niveles** guían las sugerencias de casos con IA (capítulo 17).

Cada guardado **con cambios** crea una revisión y sube la versión (1.3 → 1.4);
guardar sin cambios avisa de que no hay nada que guardar, y cambiar solo el
estado no sube la versión. El plan se exporta en PDF (listo para firmar) o en
Excel, con su **ID de documento** (por defecto `TP-<prefijo del proyecto>-<6
caracteres>`, editable en el paso 1).

**Aprobar el plan.** «Aprobado» no se elige en el estado: con el plan guardado y
en «Revisado», pulsa **«Aprobar versión N»** en «Estado del plan» y confirma.
Queda quién lo aprobó y cuándo, en el panel y en la cabecera del PDF y del
Excel; aprobar no sube la versión. Si después cambias el contenido, un aviso lo
dice antes de guardar y el plan vuelve a «Revisado» con una versión nueva. El
panel **«Historial»** muestra los últimos cambios de estado y versión, quién
los hizo y qué pasos tocó, con «pierde la aprobación» cuando toca; «Revisiones»
abre la lista para restaurar una.

En este manual, Liomar escribe el «Plan de pruebas de Pharos 0.3.0»: qué se
prueba de la propia aplicación en esta versión.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Tab / Mayús+Tab | Cualquier paso | Recorre los campos; al cambiar de paso, el foco va a su título |
| Intro | «Otro tipo de prueba…», «Otro entregable…», «¿No está en la lista?» (herramientas) | Añade lo escrito |
| ↑ ↓ / Inicio / Fin | Una lista desplegable abierta (estado, metodología, frecuencia…) | Recorre las opciones; una letra salta a la que empieza por ella |
| Intro o Espacio | Una lista desplegable | La abre; abierta, elige la opción marcada |
| Esc | Una lista desplegable abierta | La cierra sin cambiar nada; el foco vuelve al campo |
| Intro | Fecha de un sprint o un hito (dd/mm/aaaa) | Aplica la fecha; salir del campo también la aplica |
| Alt+↓ | Un campo de fecha (la del plan, un ciclo, el informe…) | Abre el calendario |
| ← → / ↑ ↓ | Calendario de un campo de fecha | Día anterior o siguiente / semana anterior o siguiente |
| Inicio / Fin | Calendario de un campo de fecha | Primer o último día de la semana |
| RePág / AvPág | Calendario de un campo de fecha | Mes anterior o siguiente |
| Intro o Espacio | Calendario de un campo de fecha | Elige el día enfocado y cierra |
| Esc | Calendario de un campo de fecha | Lo cierra sin cambiar nada; el foco vuelve al botón del calendario |
| ← → | Calendario del cronograma | Día anterior o siguiente |
| ↑ ↓ | Calendario del cronograma | Semana anterior o siguiente |
| Inicio / Fin | Calendario del cronograma | Primer o último día de la semana |
| RePág / AvPág | Calendario del cronograma | Mes anterior o siguiente |
| Intro o Espacio | Calendario del cronograma | Marca el día enfocado (inicio o fin del sprint, o un hito) |
| Esc | Calendario del cronograma | Cancela el sprint que estás marcando |

## Si algo no sale

- **«Aprobar versión N» está en gris.** Debajo dice por qué: guarda antes de
  aprobar, o pon el plan en «Revisado» y guárdalo.
- **«Sin cambios: no hay nada que guardar».** El plan no ha cambiado desde el
  último guardado; no se crea versión ni revisión.
- **Un criterio de cierre no se deja editar.** Lo mide una métrica: su texto
  sale de ella. Cambia la métrica en el paso 19, o elige «Sin métrica» en
  «Medido por».
- **«No se puede guardar: revisa 1 campo».** Falta el título (paso 1, «Identificación del plan»): es lo
  único obligatorio. Pharos te lleva a ese paso.
- **«Guardado con N avisos por revisar».** El plan se guardó, pero hay filas
  repetidas o fechas del cronograma que revisar.
- **«Niveles y tipos de prueba» no queda completo.** Marca al menos un nivel
  y un tipo.
- **«Metodología» (paso 7) no queda completa.** La línea bajo el paso dice qué falta: la
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
- El menú «Importar / Exportar» y las listas desplegables (estado,
  metodología, frecuencia…) se abren como una hoja, con la opción elegida
  marcada.
- El calendario de un campo de fecha también se abre como una hoja desde
  abajo, con días más grandes para el dedo.
- En el cronograma, las fechas se editan en las filas: en pantallas táctiles no
  se arrastran los extremos de los sprints.

## Consejos

- No hace falta rellenar los 22 pasos de una vez: la lista marca los completos
  y «Antes de terminar» (paso 22) enlaza a los que faltan.
- Marca como «Orientativo» un criterio que quieres ver en el cierre sin que lo
  frene, por ejemplo una métrica propia que todavía se mide a mano.
- Un .xlsx importado nunca llega aprobado: entra como «Revisado», para que
  alguien lo apruebe aquí.
- La duración del sprint (paso 7) se usa en el cronograma: si un sprint dura
  otra cosa, Pharos lo avisa en su fila.
- Para empezar un plan desde Excel, descarga una plantilla en «Administración ›
  Plantillas», rellénala e impórtala con «Importar .xlsx».
- «Restaurar» una revisión no guarda nada hasta que pulses «Guardar».
- El plan en PDF mantiene cada título de sección junto al inicio de su
  contenido; si una tabla sigue en otra página, su título y sus columnas se
  repiten arriba. Los niveles de prueba van antes que los tipos, y los tipos, por grupo
  («Funcionales: …», «Confirmación y regresión: …», «Propios: …»), antes de la
  Metodología, que muestra una entrada por línea y los rangos del
  cronograma se leen «2026-11-09 – 2026-11-22». Los hitos aparecen bajo el
  cronograma y los ciclos, al final. Los apartados nuevos de la 0.4 van donde
  los pide el asistente; en el Excel, en las hojas «Estrategia 29119-3»,
  «Métricas» y «Criterios de salida», que «Importar .xlsx» vuelve a leer.
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
  responsabilidades, criterios, supuestos y restricciones.
- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.3.
- [Glosario](../GLOSARIO.md): «Plan de pruebas», «Identificación del plan», «Prueba de confirmación», «Entregable», «Paso completado», «Cierre del ciclo».

### Paso cronograma

Cómo se marca un sprint o un hito está en la ayuda «?» del título del paso,
como en los demás; el calendario queda justo debajo de la barra «Sprint /
Hito / Siguiente sprint». Un sprint seleccionado se puede alargar o acortar arrastrando sus extremos en
el calendario, o editando sus fechas en la fila (dd/mm/aaaa e Intro).
