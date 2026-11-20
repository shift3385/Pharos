# API de sincronización de Pharos

Extracto pequeño y congelado del repositorio de Pharos para el manual de
usuario (capítulo 17, «Requisitos desde un proyecto»). Pharos es una app de
gestión de pruebas que funciona sin conexión: cada equipo guarda sus datos en
local y los sincroniza con su servidor cuando hay red.

La API de sincronización tiene dos llamadas:

- `POST /sync/push`: el equipo envía sus cambios pendientes (deltas).
- `GET /sync/pull?since=<cursor>`: el equipo trae lo que cambió en el servidor
  desde su último cursor, página a página.

Detalles en `docs/protocolo.md` y en `docs/conflictos.md`. La fusión campo a
campo vive en `src/merge.ts` y sus pruebas en `tests/merge.test.ts`.
