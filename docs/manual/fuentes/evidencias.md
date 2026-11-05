# Evidencias (fuente del capítulo 14)

## Para qué sirve

Las **evidencias** son los archivos que adjuntas: capturas, vídeos y
registros de defectos, tarjetas, resultados y reportes importados. Pharos los
guarda cifrados en la carpeta `evidence`, junto a la base de datos.
«Administración → Evidencias» dice cuánto ocupan y de qué tipo son, y
comprueba que todos siguen ahí y se pueden leer.

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
  de un resultado vinculado a un defecto abierto. Nada se guarda hasta pulsar
  «Guardar», y acortar un plazo pide confirmación con los archivos que
  caducarían. Es un ajuste de este equipo: en otro equipo, configúralo allí.

## Véase también

- Capítulo 10, «Administración», y la [guía de pruebas de la beta](../guia-beta.md), apartado 6 «Si algo sale mal con los datos».
