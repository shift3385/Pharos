---
section: Cambiado
---

- **Servidor de sincronización: la migración `0010` reconstruye el índice de claves de `documents`** (para incluir las claves `DEF-` de los defectos) sin `CONCURRENTLY` y, en la misma transacción, convierte las tarjetas «Defecto» guardadas en defectos. Mientras dura, las escrituras de sincronización esperan; en un servidor con muchos documentos, conviene aplicar la actualización en un momento de poco uso.
