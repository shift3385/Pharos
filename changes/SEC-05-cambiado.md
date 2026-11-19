---
section: Cambiado
---

- **Tus datos se guardan al instante y ocupan menos memoria.** La base de datos local pasa a un archivo en disco, `pharos.db`, cifrado página a página. Antes, cada cambio volvía a cifrar y escribir la base entera.
  - **El primer arranque de esta versión la convierte** y muestra «Actualizando el formato de tus datos» si tarda algo. Antes guarda una copia del archivo de siempre (`pharos.db.enc.bak-…`). Si no hay espacio en disco, lo dice y no cambia nada.
  - **La copia de seguridad completa** son ahora `pharos.db` (con Pharos cerrado), la carpeta `evidence` y tu clave de recuperación.
  - **Tu clave de recuperación sigue valiendo.**
  - **Volver a la versión 0.5:** restaura la copia `pharos.db.enc.bak-…` (README → «Local data backups»). Lo que cambiaste aquí sin sincronizar no viaja con ella. Una 0.5 que abra la carpeta convertida dice que los datos son de una versión más nueva y no los toca.
