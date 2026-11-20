---
section: Corregido
---

- **Textos que ya no decían la verdad**:
  - «Administración › Evidencias › Almacén de evidencias» ya no dice que los adjuntos «no se sincronizan todavía»: se sincronizan con tu workspace desde la 0.5.0.
  - La clave de recuperación y la pantalla de la clave de la base de datos nombran los archivos de la 0.6: la copia de seguridad son `pharos.db` (con Pharos cerrado) y la carpeta `evidence`, y la copia que puede abrirse con la clave es `pharos.db.bak-…`, no `pharos.db.enc`.
  - Eliminar una plantilla dice que pasa a la papelera y que puedes restaurarla, en lugar de «no se puede deshacer».
  - El aviso de cambios combinados al sincronizar (y el de la web al guardar) ya no atribuye siempre el otro cambio a «otra persona»: puede venir de otro equipo tuyo.
- **«Administración › Auditoría» dice cómo se resolvió un conflicto de sincronización**: la lista muestra «Se quedó: Combinado» (o «La mía», «La del servidor») junto a los campos, y el detalle lo indica con «Sin preguntar» cuando Pharos lo combinó solo. La etiqueta «Conflicto resuelto» ya no se corta en la lista.
