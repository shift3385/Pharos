# ADR-0018 · Campos personalizados tipados por proyecto y tipo de caso (FLD-01)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las respuestas recomendadas).
- **Diseño de conjunto:** [`docs/design/0.2.0-modelo-ejecucion.md`](../design/0.2.0-modelo-ejecucion.md).

## Contexto

- **El JSON `data` ya crece sin migraciones,** pero sin tipos ni definiciones.
  Los comentarios de `0002_test_plans.sql` y `0003_test_cases.sql` lo describen
  así: los escalares van en columnas y el resto en `data`. Cada atributo nuevo
  (por ejemplo `requirementKeys`, TRZ-01) exige cambiar el código.
- **No existe un "tipo de caso".**
  - `gherkin_level` (`basic | outline | advanced`) indica la forma del Gherkin,
    no si el caso es manual, automatizado o una checklist.
  - La petición de FLD-01 habla de campos "por tipo de caso (manual /
    automatizado / checklist)".
- **El mercado** (TestRail, Xray, Zephyr) permite campos por proyecto y por
  plantilla o tipo, y filtrar y exportar por ellos.
- **Exportación fiel.** La exportación `.xlsx` tiene que seguir siendo fiel a
  las plantillas reales de `docs/referencias/` (regla de `files/CLAUDE.md`).
- **Campos en ejecución.** Los Run, los defectos y los ciclos (ADR-0013,
  ADR-0016, ADR-0017) ya reservan `data.custom`.

## Opciones

| Opción                                                                         | A favor                                                                                                                                         | En contra                                                                                                                                |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **A. EAV**: tabla `custom_field_values (entity, entity_id, field_id, value_*)` | Columnas tipadas; consultas SQL directas                                                                                                        | Los valores quedan fuera de la revisión del caso (DAT-02) y del documento de sync; una entidad de sync por valor; joins por todas partes |
| **B. Definiciones como entidad; valores en `data.custom` del propio registro** | Los valores viajan con la entidad: revisionados, sincronizados y auditados con ella; consultas con `json_extract` (SQLite) y `jsonb` (Postgres) | La validación de tipos va en el código del repositorio; la clave del campo no se puede renombrar (la etiqueta sí)                        |
| **C. Columnas fijas** (`custom_1` … `custom_10`)                               | Trivial                                                                                                                                         | Sin tipos, límite arbitrario, nombres sin significado                                                                                    |

## Decisión: B

- **Definición** por proyecto y entidad (`test_case`, `requirement`, `defect`,
  `run`, `test_cycle`):
  - **clave inmutable** (`field_key`, snake_case, única por proyecto y entidad);
  - etiqueta y descripción editables;
  - tipo: `text | long_text | number | integer | date | boolean | select |
multi_select | user | url`;
  - obligatoriedad, valor por defecto, orden;
  - tipos de caso a los que aplica.
- **Opciones de `select`** con id propio. El valor guarda el id, así que
  renombrar una opción no rompe datos.
- **Valores** en `data.custom = { field_key: valor }`. Entran en la revisión del
  caso (ADR-0011) y en las diferencias de la auditoría (ADR-0015).
- **Validación en el repositorio Rust al guardar,** con los errores traducidos
  en la UI.
  - Una clave desconocida se conserva: el campo puede venir de otro equipo antes
    que su definición.
  - Archivar un campo lo oculta, pero mantiene sus valores.
- **Tipo de caso,** como dos columnas nuevas en `test_cases` (pregunta 1):
  - `case_type`, la forma: `standard` (pasos / Gherkin) | `checklist`;
  - `automation_status`, el estado de automatización: `manual | to_automate | automated`.

  Las separo porque un caso Gherkin puede ejecutarse a mano y también con
  playwright-bdd.

- **Consultas:** los listados filtran y ordenan por campo personalizado con
  `json_extract(data, '$.custom.<key>')`. Si hace falta, se crean índices de
  expresión.
- **Exportación:**
  - CSV y JSON incluyen todos los campos;
  - para `.xlsx`, ver la pregunta 2.

## Esquema (boceto)

SQLite local:

```sql
CREATE TABLE custom_fields (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
  entity TEXT NOT NULL,                     -- test_case | requirement | defect | run | test_cycle
  field_key TEXT NOT NULL,                  -- inmutable
  label TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  field_type TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '[]',       -- [{ id, label, archived }]
  required INTEGER NOT NULL DEFAULT 0, default_value TEXT,
  applies_to_case_types TEXT,               -- NULL = todos; ["checklist"]
  position INTEGER NOT NULL DEFAULT 0, archived_at TEXT,
  created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX custom_fields_key_idx ON custom_fields (project_id, entity, field_key) WHERE deleted_at IS NULL;

ALTER TABLE test_cases ADD COLUMN case_type TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE test_cases ADD COLUMN automation_status TEXT NOT NULL DEFAULT 'manual';
```

Servidor: documentos `custom_field` (LWW). Los valores van dentro del documento
de cada entidad.

## Impacto en sync y migraciones

- `custom_field` es LWW. Que un valor llegue antes que su definición se tolera
  (se muestra como "campo desconocido" hasta que llega).
- `case_type` y `automation_status` son columnas con valor por defecto
  (migración aditiva). Pasan a formar parte del payload del caso. Un documento
  de un cliente 0.1.x que no las trae se aplica con los valores por defecto.
- Si el caso tiene tags de automatización, el valor inicial de
  `automation_status` podría deducirse de ellos. Recomendación: no deducir nada
  y dejar `manual`.

## Preguntas resueltas (2026-10-28)

El usuario aceptó la recomendación de cada pregunta; lo que sigue queda decidido.

1. **Tipo de caso.** ¿Te vale separar `case_type` (`standard | checklist`) de
   `automation_status` (`manual | to_automate | automated`)? ¿La checklist entra
   en 0.2.0? Una checklist es una lista de comprobaciones sin pasos ni Gherkin, y
   se ejecuta marcando cada punto. Recomendación: el modelo en 0.2.0 y la UI de
   checklist en 0.2.0 solo si cabe; si no, en 0.3.0.
2. **Campos personalizados en el `.xlsx`.** ¿Columnas añadidas a la derecha de
   la plantilla o una hoja aparte, "Campos personalizados"? Recomendación: hoja
   aparte, para que la plantilla siga idéntica a la de `docs/referencias/`.
3. **¿Definiciones por proyecto,** con "copiar de otro proyecto", o también a
   nivel de workspace? Recomendación: por proyecto en 0.2.0; a nivel de
   workspace cuando lleguen los workspaces compartidos (0.3.0).
