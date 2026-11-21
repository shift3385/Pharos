# Evidencias (fuente del capítulo 16)

Texto escrito a mano del capítulo. Los pasos (pie y captura) los genera el
tour `e2e/tours/16-evidencias.tour.ts`. Las evidencias se adjuntan en el
Tablero (capítulo 6), en la ejecución manual (capítulo 11), en los defectos
(capítulo 12) y al importar informes (capítulo 10).

## Para qué sirve

Las **evidencias** son los archivos que adjuntas: capturas, vídeos, registros
y trazas de las tarjetas del Tablero, de los defectos, de los resultados y de
los informes importados. Pharos los guarda **cifrados** en la carpeta
`evidence`, junto a la base de datos, y, con un servidor, los comparte con tu
workspace: cada archivo viaja una sola vez por su contenido y llega cifrado a
tus otros equipos y a los de tus compañeros. Los informes que sube un CI o el
CLI `pharos` se guardan también como evidencia de su run.

«Administración › Evidencias» (solo en la app de escritorio) tiene tres
partes:

- **Almacén de evidencias:** cuánto ocupan, cuántos adjuntos hay de cada tipo,
  cuántos han caducado y la retención de los reportes importados. Un contenido
  idéntico se guarda una sola vez, así que puede haber menos archivos que
  adjuntos: «6 archivos para 8 adjuntos» significa que dos adjuntos comparten
  archivo (por ejemplo, un defecto creado desde un resultado usa sus mismas
  evidencias).
- **Retención por proyecto:** cuánto se conserva cada tipo de evidencia de un
  proyecto (trazas, vídeos, reportes crudos, registros, capturas y otras)
  antes de que caduque su archivo. Caducar borra el archivo, nunca el
  resultado: el registro de que existió se conserva.
- **Verificar evidencias:** comprueba que cada archivo sigue ahí y se
  descifra, y busca **huérfanos**, archivos que ya ningún elemento usa.

Nunca caducan la evidencia de la ejecución manual, la de un resultado final
fallido o bloqueado, la de un resultado vinculado a un defecto abierto, ni los
adjuntos del Tablero, de los defectos o de los borradores.

En este manual, Liomar guarda más tiempo las trazas y los vídeos de Pharos,
acorta los registros y limpia un archivo huérfano.

## Atajos de teclado

| Tecla | Dónde | Qué hace |
| --- | --- | --- |
| Tab | Retención por proyecto | Recorre los tipos y su plazo |
| ↑ ↓ | Selector de plazo de un tipo | Cambian entre «Por defecto», «Siempre» y «Número de días» |
| Esc | Confirmación de acortar la retención o de borrar huérfanos | No la cierra: usa «Cancelar» |

## Si algo no sale

- **«Las evidencias se guardan cifradas en este equipo: su uso y su
  verificación solo están en la app de escritorio.»** Estás en la web: abre la
  app de escritorio.
- **«No se pudo leer el almacén de evidencias…».** Comprueba que la carpeta de
  datos está en su sitio y vuelve a abrir la pestaña.
- **Un adjunto dice «Este archivo no está en este equipo…».** Caducó por
  retención, la carpeta de datos se copió sin su carpeta `evidence`, o aún
  no ha llegado de otro equipo de tu workspace: se descarga en la siguiente
  sincronización. «Verificar evidencias» dice qué falta y dónde se usa.
- **Un huérfano sigue ahí tras «Borrar seleccionados».** Otro programa lo
  tiene abierto (por ejemplo, otra ventana de Pharos con los mismos datos):
  ciérralo y vuelve a verificar.
- **Un huérfano no se puede marcar.** Tiene menos de 24 horas: puede ser un
  archivo que se está guardando. Vuelve a verificar mañana.
- **«Por guardar: …».** Hay plazos cambiados sin guardar: pulsa «Guardar».

## En el móvil

- La pestaña «Evidencias» es de la app de escritorio; en el móvil no está.

## Consejos

- Verifica las evidencias después de restaurar una copia o de mover la carpeta
  de datos: el informe dice qué falta o está dañado y dónde se usa.
- Tu copia de seguridad completa es `pharos.db` (copiada con Pharos cerrado),
  la carpeta `evidence` y tu clave de recuperación: guárdalas juntas. Con un
  servidor, las evidencias también viajan a él, pero la copia local te
  protege de lo que aún no se ha sincronizado.
- Antes de acortar un plazo, mira cuántos archivos caducarían: la confirmación
  lo dice, y los caducados no se recuperan.
- La retención es un ajuste de cada equipo: si trabajas en varios,
  configúrala en cada uno.

## Véase también

- Capítulo 15, «Administración».
- Capítulo 19, «Si algo sale mal»: restaurar una copia.
- [Guía de pruebas de la beta](../guia-beta.md), apartado 6 «Si algo sale mal
  con los datos».
