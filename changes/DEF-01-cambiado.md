---
section: Cambiado
---

- **Los defectos salen del planificador.** Al actualizar, cada tarjeta «Defecto» pasa al módulo Defectos con la misma clave, título, prioridad, casos vinculados y adjuntos; su columna se convierte en estado (Backlog → Nuevo, En progreso → En curso, En revisión → En retest, Hecho → Cerrado como corregido) y su severidad queda en «Mayor». El planificador queda para tareas y datos de prueba, y avisa de dónde están ahora los defectos.
- **Trazabilidad e Inicio cuentan los defectos nuevos.** Un defecto está abierto si no está Cerrado ni Rechazado (un defecto Aplazado sigue abierto), y «críticos» en Inicio son los de severidad crítica, no los de prioridad crítica.
- **Sincronización:** una versión anterior de Pharos ya no puede crear ni cambiar defectos en un servidor actualizado; en solo lectura conserva la copia del planificador que tenía hasta que se actualiza.
