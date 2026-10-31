---
section: Cambiado
---

- **Servidor de sincronización: la migración `0008` reconstruye el índice de claves de `documents`** (para incluir las claves `RUN-` de los runs) sin `CONCURRENTLY`. Mientras dura, las escrituras de sincronización esperan; en un servidor con muchos documentos, conviene aplicar la actualización en un momento de poco uso.
