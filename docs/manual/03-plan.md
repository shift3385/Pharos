<!-- Generado por `npm run manual` desde e2e/tours/03-plan.tour.ts y docs/manual/fuentes/plan.md. No lo edites a mano: edita la fuente. -->

# 3. Plan de pruebas

## Para qué sirve

El **plan de pruebas** es el documento que dice qué se prueba, cómo, con qué
medios, quién y cuándo. Pharos lo guía en 19 pasos que siguen la norma
ISO/IEC/IEEE 29119-3, guarda cada versión como una revisión y lo exporta en
PDF (listo para firmar) o en Excel. El cronograma y los criterios de cierre
del plan alimentan otras pantallas: «Inicio» muestra los criterios de salida
y la cabecera del proyecto, la fecha de cierre del ciclo.

## Paso a paso

### 3.1. El asistente del plan

Entra en el proyecto y pulsa «Plan de pruebas» en el menú lateral. A la izquierda, los 19 pasos con su progreso; en el centro, el paso actual (aquí, el título y su estado); a la derecha, «Estado del plan».

![El asistente del plan](img/plan/01-asistente.png)

### 3.2. Paso 2 · Versión, fecha y autor

«Siguiente» avanza al paso 2: versión y fecha del plan. El autor es tu nombre oficial del perfil.

![Paso 2 · Versión, fecha y autor](img/plan/02-meta.png)

### 3.3. Paso 3 · Resumen

El resumen presenta el plan. Con la IA configurada, «✨ Asistir con IA» propone un texto que puedes usar o descartar (capítulo 11).

![Paso 3 · Resumen](img/plan/03-resumen.png)

### 3.4. Paso 4 · Alcance

Qué entra y qué queda fuera. «+ Añadir» crea una fila; la papelera la quita (pide confirmar si tiene texto).

![Paso 4 · Alcance](img/plan/04-alcance.png)

### 3.5. Paso 5 · Tipos de prueba

Marca los tipos de prueba, agrupados en cobertura funcional y no funcional. «Otro» añade uno propio.

![Paso 5 · Tipos de prueba](img/plan/05-tipos.png)

### 3.6. Paso 6 · Metodología

Ágil (duración del sprint y reuniones con su frecuencia) o tradicional (fases). La duración del sprint se usa luego en el cronograma.

![Paso 6 · Metodología](img/plan/06-metodologia.png)

### 3.7. Paso 7 · Niveles de prueba

Unitarias, integración, sistema y aceptación: marca los que cubre el plan.

![Paso 7 · Niveles de prueba](img/plan/07-niveles.png)

### 3.8. Paso 8 · Entregables

La lista sigue la documentación de ISO/IEC/IEEE 29119-3. «Otro entregable» añade uno propio, marcado como «Propio».

![Paso 8 · Entregables](img/plan/08-entregables.png)

### 3.9. Paso 9 · Entorno de pruebas

Cómo es el entorno y qué hardware y software necesita.

![Paso 9 · Entorno de pruebas](img/plan/09-entorno.png)

### 3.10. Paso 10 · Herramientas y automatización

Elige herramientas de la lista (las más usadas arriba; «Más herramientas» abre el resto con buscador) o añade una propia, y describe la estrategia de automatización.

![Paso 10 · Herramientas y automatización](img/plan/10-herramientas.png)

### 3.11. Pasos 11 y 12 · Datos y defectos

Cómo se gestionan los datos de prueba y los defectos (este segundo, en el paso 12).

![Pasos 11 y 12 · Datos y defectos](img/plan/11-datos.png)

### 3.12. Paso 13 · Roles y responsabilidades

Cada fila es un rol y su responsabilidad.

![Paso 13 · Roles y responsabilidades](img/plan/12-roles.png)

### 3.13. Paso 14 · Cronograma

Con «Sprint» marcado, haz clic en el día de inicio y en el de fin para crear un sprint; «Siguiente sprint» añade el siguiente con la duración del paso 6. Cada sprint aparece también en su fila, con fechas editables.

![Paso 14 · Cronograma](img/plan/13-cronograma.png)

Un sprint seleccionado se puede alargar o acortar arrastrando sus extremos en
el calendario, o editando sus fechas en la fila (dd/mm/aaaa e Intro).

### 3.14. Cronograma: hitos con el teclado

Con «Hito», un clic en un día añade un hito. También con el teclado: las flechas mueven el foco por el calendario e Intro marca el día.

![Cronograma: hitos con el teclado](img/plan/14-cronograma-hito.png)

### 3.15. Paso 15 · Riesgos y mitigación

Cada riesgo con su mitigación. Con IA, «✨ Sugerir riesgos con IA» propone una lista para añadir (capítulo 11).

![Paso 15 · Riesgos y mitigación](img/plan/15-riesgos.png)

### 3.16. Pasos 16 a 18 · Comunicación, cierre y propósito

El plan de comunicación, los criterios de cierre (criterio y métrica, que «Inicio» muestra como criterios de salida) y el propósito del documento.

![Pasos 16 a 18 · Comunicación, cierre y propósito](img/plan/16-comunicacion.png)

### 3.17. Paso 19 · Conclusión y «Antes de terminar»

El último paso resume qué falta: «Antes de terminar» lista los pasos incompletos con un enlace a cada uno.

![Paso 19 · Conclusión y «Antes de terminar»](img/plan/17-conclusion.png)

### 3.18. Guardar el plan

«Finalizar plan» (o «Guardar», arriba) guarda el plan: aparece «Plan de pruebas guardado» y la cabecera del proyecto pasa a «Plan borrador».

![Guardar el plan](img/plan/18-guardar.png)

### 3.19. Salir con cambios sin guardar

Si cambias algo y sales sin guardar, Pharos pregunta antes de descartar los cambios. «Seguir editando» te devuelve al plan.

![Salir con cambios sin guardar](img/plan/19-salir-sin-guardar.png)

### 3.20. Revisiones del plan

Cada guardado crea una revisión. «Revisiones» las lista y «Restaurar» recupera el contenido de una (pide confirmación; después guarda para conservarla).

![Revisiones del plan](img/plan/20-revisiones.png)

### 3.21. Restaurar una revisión

Al confirmar, el plan vuelve al contenido de esa revisión, sin guardar todavía.

### 3.22. Exportar el plan

«Importar / Exportar» genera el plan en .pdf (listo para firmar) o .xlsx (editable en Excel) en tu carpeta de descarga.

![Exportar el plan](img/plan/22-exportar.png)

### 3.23. Importar un plan desde .xlsx

«Importar .xlsx» rellena el plan desde una plantilla o un plan exportado. El informe muestra qué campos se reconocieron antes de aplicarlos al formulario.

![Importar un plan desde .xlsx](img/plan/23-importar.png)

### 3.24. Plan importado

«Aplicar al formulario» carga los datos en el asistente; revisa y guarda.

## Consejos

- No hace falta rellenar los 19 pasos de una vez: el carril de la izquierda
  marca los completos y «Antes de terminar» lista lo que falta.
- La duración del sprint (paso 6) se usa en el cronograma: si un sprint dura
  otra cosa, Pharos lo avisa en su fila.
- Para empezar un plan desde Excel, descarga una plantilla en
  «Administración → Plantillas», rellénala e impórtala con «Importar .xlsx».
- «Restaurar» una revisión no guarda nada hasta que pulses «Guardar».

## Véase también

- [Guía de pruebas de la beta](../guia-beta.md), apartado 4.3.
- [Glosario](../GLOSARIO.md): «Plan de pruebas», «Entregable», «Paso completado», «Cierre del ciclo».

---

← [Inicio, proyectos y ajustes](02-proyectos.md) · [Índice](README.md) · [Casos de prueba](04-casos.md) →
