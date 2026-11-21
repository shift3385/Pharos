# Protocolo de sincronización

## Envío (`POST /sync/push`)

- El equipo envía sus cambios en lotes. Cada delta lleva la entidad, su id,
  la operación (`upsert` o `delete`), el contenido, su revisión y una marca
  HLC (reloj lógico híbrido) que ordena los cambios aunque los relojes de los
  equipos no coincidan.
- Cada delta dice también sobre qué versión se hizo (`baseRevision`,
  `baseHlc`). Si en el servidor ya hay otra versión más nueva, el servidor no
  la pisa: responde con un conflicto para ese delta.
- Un lote se aplica entero o no se aplica.

## Recepción (`GET /sync/pull`)

- El equipo pide lo que cambió desde su cursor. La respuesta trae una página
  de documentos, el cursor nuevo y si quedan más (`hasMore`).
- Un borrado llega como una lápida: el documento marcado como borrado, para
  que los demás equipos lo borren también.

## Versiones

- El servidor solo sincroniza con las versiones de la app que admite; una app
  demasiado antigua recibe un aviso para actualizarse.
