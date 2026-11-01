---
section: Cambiado
---

- **Servidor de sincronización: la migración `0010` reconstruye el índice de claves de `documents`** (para incluir las claves `DEF-` de los defectos, conservando las `CYC-` de `0009`) sin `CONCURRENTLY` y, en la misma transacción, convierte una a una las tarjetas «Defecto» guardadas en defectos. Mientras dura (unos segundos por cada mil tarjetas de defecto), las escrituras de sincronización esperan; en un servidor con muchos documentos, conviene aplicar la actualización en un momento de poco uso. La `0009` (ciclos) se aplica antes que la `0010`.
