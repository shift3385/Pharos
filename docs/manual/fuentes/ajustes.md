# Ajustes del proyecto (fuente del capítulo 14)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/14-ajustes.tour.ts`, que se ejecuta justo después del
capítulo 4: la numeración, los campos y las configuraciones que define son los
que usan los capítulos siguientes.

## Para qué sirve

En «Ajustes del proyecto», la última sección del menú del proyecto, se decide:

- cómo se llama el proyecto y cómo se numeran sus casos: el **prefijo** y los
  **dígitos** del número (con `PH-` y 3 dígitos, PH-001, PH-002…);
- qué historial llevan el .pdf y el .xlsx del **plan exportado**;
- qué **campos personalizados** tienen sus casos y sus defectos;
- en qué **configuraciones** (navegadores, sistemas, dispositivos) se ejecutan
  sus ciclos;
- cómo **exportar** el proyecto entero en un ZIP o **eliminarlo** (capítulo 4).

Dos proyectos no pueden tener prefijos que se **solapen**: iguales, sin
contar el guion o el guion bajo final ni las mayúsculas, o uno que empiece por
el otro (`PH-` y `PHA-`), porque una búsqueda o una importación por `PH`
encontraría los casos de los dos.

Los **campos personalizados** añaden lo que tu equipo necesite y Pharos no trae
de serie (un campo de tipo fecha se rellena en el caso con el selector de
fechas de Pharos, capítulo 5): texto, texto largo, número, número entero, fecha, sí/no, selección,
selección múltiple, usuario o URL. Cada campo tiene un nombre, una clave fija
(minúsculas, números y guion bajo), si es obligatorio y, opcionalmente, un
valor por defecto para los casos nuevos. Los de los casos y los de los
defectos se definen por separado, con el selector «Casos / Defectos».

Una **configuración** describe dónde se ejecuta una prueba: navegador,
sistema, dispositivo e idioma. Sus **etiquetas de importación** son los nombres
con los que un informe de la automatización la reconoce (por ejemplo,
`chromium` o `msedge` en Playwright).

En este manual, Liomar ajusta «Pharos» antes de escribir nada: el prefijo
`PH-` con 3 dígitos, el historial de revisiones en el plan exportado, un
campo «Navegador» para los casos y otro «Sistema operativo» para los defectos,
y las configuraciones Chrome y Edge en Windows 11.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Intro o coma | Campo «Etiquetas de importación» de una configuración | Añade la etiqueta escrita |
| Retroceso | Campo de etiquetas vacío | Quita la última etiqueta |
| Espacio o Intro, flechas | Asa de un campo personalizado | Lo coge, lo mueve arriba o abajo y lo suelta; Esc cancela |
| Esc | Diálogo de un campo o de una configuración | Lo cierra; con cambios, pregunta antes |

## Si algo no sale

- **«Se solapa con «PH-» de Pharos…».** Otro proyecto ya usa ese prefijo o uno
  que empieza igual. Elige otro.
- **«Escribe un prefijo, por ejemplo «PHA-».»** El prefijo no puede quedar
  vacío.
- **«Clave no válida…».** La clave de un campo empieza por una letra minúscula
  y solo admite minúsculas, números y guion bajo (hasta 40).
- **«Ya hay un campo con esta clave en el proyecto (puede estar
  archivado).»** Las claves no se reutilizan: restaura el archivado o usa otra.
- **«Añade al menos una opción.» o «Hay dos opciones con el mismo nombre.»**
  Una selección necesita opciones distintas.
- **«La etiqueta ya la usa otra configuración…».** Cada etiqueta de importación
  pertenece a una sola configuración del proyecto.
- **No encuentro una configuración en un ciclo nuevo.** Está archivada: márcala
  con «Mostrar archivadas» y restáurala desde su menú.
- **«No se pudo guardar el ajuste del historial.»** Vuelve a elegir la opción.

## En el móvil

- Las tarjetas de ajustes van una debajo de otra, a todo el ancho.

## Consejos

- Elige el **prefijo** al principio: la clave de un caso no cambia una vez
  asignada, porque viaja como tag (`@PH-001`) en la automatización.
- Los **campos personalizados** nunca se borran, se archivan: así no se pierden
  los valores que ya tienen los casos y los defectos.
- Escribe las **etiquetas de importación** exactamente como las nombra tu
  herramienta (el nombre del proyecto de Playwright, `chromium`): así cada
  resultado importado cae en su configuración.
- Al crear un segundo proyecto, «Copiar de otro proyecto» trae los campos del
  primero en un paso.

## Véase también

- Capítulo 4, «Proyectos»: crear, exportar y eliminar proyectos.
- Capítulo 5, «Plan de pruebas»: el historial en el plan exportado.
- Capítulo 9, «Ciclos de prueba»: las configuraciones de un ciclo.
- [Glosario](../GLOSARIO.md): «Prefijo de ID de caso», «Campo personalizado»,
  «Configuración».
