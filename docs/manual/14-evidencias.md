<!-- Generado por `npm run manual` desde e2e/tours/14-evidencias.tour.ts y docs/manual/fuentes/evidencias.md. No lo edites a mano: edita la fuente. -->

# 14. Evidencias

## Para qué sirve

Las **evidencias** son los archivos que adjuntas: capturas, vídeos y
registros de defectos, tarjetas, resultados y reportes importados. Pharos los
guarda cifrados en la carpeta `evidence`, junto a la base de datos.
«Administración → Evidencias» dice cuánto ocupan y de qué tipo son, y
comprueba que todos siguen ahí y se pueden leer.

## Paso a paso

### 14.1. El almacén de evidencias

En «Administración», pulsa la pestaña «Evidencias». «Almacén de evidencias» da el espacio que ocupan, los adjuntos por tipo (planificador, defectos, reportes, resultados, borradores…) y la retención de los reportes importados.

![El almacén de evidencias](img/evidencias/01-almacen.png)

### 14.2. Retención por proyecto

«Retención por proyecto» fija, para cada tipo de evidencia de un proyecto, cuánto se conserva antes de que caduque su archivo: el valor por defecto (30 días las trazas y los vídeos, 90 los reportes y los registros), «Siempre» o un número de días. Nunca caduca la evidencia de la ejecución manual, la de un resultado final fallido o bloqueado ni la de un resultado vinculado a un defecto abierto. Es un ajuste solo de este equipo: no se sincroniza.

![Retención por proyecto](img/evidencias/02-retencion.png)

### 14.3. Verificar las evidencias

«Verificar evidencias» comprueba que cada archivo está y se descifra, y busca archivos que ninguna fila conoce (huérfanos). No borra nada por sí sola; puedes seguir trabajando mientras tanto.

![Verificar las evidencias](img/evidencias/03-verificar.png)

### 14.4. Borrar los huérfanos

Los huérfanos aparecen en su bloque con su tamaño; «Borrar seleccionados» pide confirmación antes de eliminarlos. Los que faltan o están dañados se listan con el elemento que los usa.

![Borrar los huérfanos](img/evidencias/04-reparar.png)

### 14.5. Huérfanos borrados

Al confirmar se borran y el informe se actualiza; cada borrado queda en el registro de auditoría.

## Consejos

- Verifica las evidencias después de restaurar una copia o de mover la
  carpeta de datos: el informe dice qué falta o está dañado y dónde se usa.
- Los huérfanos (archivos que ya nadie usa) solo se borran cuando tú lo
  confirmas, y nunca los de las últimas 24 horas.
- Las evidencias no se sincronizan todavía: inclúyelas en tus copias.
- «Retención por proyecto» decide cuánto se guarda cada tipo de evidencia de
  un proyecto (trazas, vídeos, reportes, registros, capturas, otras). Al
  caducar se borra el archivo, nunca el resultado. Nunca caduca la evidencia
  de la ejecución manual, la de un resultado final fallido o bloqueado ni la
  de un resultado vinculado a un defecto abierto. Es un ajuste de este
  equipo: en otro equipo, configúralo allí.

## Véase también

- Capítulo 10, «Administración», y la [guía de pruebas de la beta](../guia-beta.md), apartado 6 «Si algo sale mal con los datos».

---

← [Ejecución manual](13-ejecucion-manual.md) · [Índice](README.md) · [Si algo sale mal](15-errores.md) →
