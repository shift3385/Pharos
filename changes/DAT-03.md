---
section: Cambiado
---

- **Adjuntos del planificador de hasta 200 MB** (antes, 10 MB). Ahora se guardan cifrados en la carpeta `evidence` junto a la base de datos, en lugar de dentro de ella: guardar ya no se hace más lento con cada adjunto, y la actualización a esta versión reduce el tamaño de `pharos.db.enc`. Añadir, descargar y borrar funcionan igual.
- **La copia de seguridad completa son `pharos.db.enc` y la carpeta `evidence`.** Para llevar los datos a otro equipo hay que copiar las dos; sin `evidence`, los adjuntos indican que no están en este equipo.
- Los adjuntos de tarjetas que ya no existían (no se veían en la app) no se trasladan; siguen en la copia `pharos.db.enc.bak-…` que se guarda antes de actualizar.
- **«Exportar diagnóstico»** incluye cuántas evidencias hay por estado y cuántos archivos de `evidence` no reconoce la base de datos (solo recuentos; nunca nombres ni contenido).
