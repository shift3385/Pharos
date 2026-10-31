---
section: Añadido
---

- **Campos personalizados por proyecto.** En Ajustes del proyecto, «Campos personalizados» crea campos propios para los casos (texto, número, fecha, sí/no, selección, selección múltiple, usuario, URL), con orden, obligatoriedad, valor por defecto y a qué tipo de caso aplican. Se archivan en lugar de borrarse, y sus valores se conservan. «Copiar de otro proyecto» trae los campos de otro proyecto. Se sincronizan entre equipos y con la web.
- **Tipo de caso y estado de automatización.** Cada caso puede ser «Estándar» o «Checklist» (una lista de comprobaciones, sin Gherkin) y estar «Manual», «Por automatizar» o «Automatizado». La lista de casos muestra la automatización y filtra por tipo, automatización y campos de selección o sí/no. Los casos que ya tenías quedan como estándar y manual, sin cambiar sus revisiones.
- **Exportación.** El `.xlsx` de un caso con tipo, automatización o campos añade la hoja «Campos personalizados», que la importación vuelve a leer; la plantilla no cambia y un caso sin estos datos se exporta igual que antes. El `.feature` no cambia, y la exportación en lote deja fuera las checklists (lo indica el aviso).
- **«Exportar diagnóstico»** dice cuántos campos esperan a enviarse porque el servidor aún no está actualizado.
