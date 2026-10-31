# ADR-0018 · Campos personalizados tipados por proyecto y tipo de caso (FLD-01)

- **Estado:** Aceptado (decisión del usuario, 2026-10-28: la opción y las
  respuestas recomendadas). Revisado el 2026-10-28 tras la revisión
  independiente (ver "Revisión"): precisiones, sin cambio de decisión.
  **Recortable de 0.2.0** (decisión del usuario, 2026-10-28): si el hito se alarga, pasa a 0.3.0; `case_type` y `automation_status` entran en 0.2.0 en cualquier caso.
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
CREATE TABLE custom_fields (               -- LWW; id = UUIDv5(project_id ‖ entity ‖ field_key)
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
CREATE INDEX custom_fields_key_idx ON custom_fields (project_id, entity, field_key);   -- no único: el id determinista ya lo garantiza

ALTER TABLE test_cases ADD COLUMN case_type TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE test_cases ADD COLUMN automation_status TEXT NOT NULL DEFAULT 'manual';
```

Servidor: documentos `custom_field` (LWW). Los valores van dentro del documento
de cada entidad.

## Impacto en sync y migraciones

- `custom_field` es LWW, con id determinista
  `UUIDv5(NS_CUSTOM_FIELD, project_id ‖ entity ‖ field_key)`. Dos equipos que
  crean la misma clave escriben la misma entidad y gana el último cambio, así
  que no hace falta un índice `UNIQUE`, que haría fallar el pull (ADR-0011).
- Que un valor llegue antes que su definición se tolera: se muestra como
  "campo desconocido" hasta que llega.
- **Dueño** (regla 1 de [ADR-0020](0020-sync-por-usuario-cascada-y-version.md),
  hasta 0.3.0): el dueño de `project_id`.
- `case_type` y `automation_status` son columnas con valor por defecto
  (migración aditiva) y pasan a formar parte del payload del caso.
- Un documento que no trae `case_type`, `automation_status` o `data.custom`
  (de un cliente 0.1.x o de la web) **conserva el valor local** al aplicarse;
  no se ponen los valores por defecto (ADR-0011, compatibilidad). Solo una
  entidad nueva, sin valor local, recibe los valores por defecto.
- El valor inicial de `automation_status` no se deduce de los tags del caso:
  empieza siempre en `manual`.

## Decisiones del usuario (2026-10-28)

1. `case_type` (`standard | checklist`) y `automation_status`
   (`manual | to_automate | automated`) son dos atributos separados.
   - El modelo entra en 0.2.0.
   - La UI de checklist entra en 0.2.0 solo si cabe; si no, en 0.3.0.
   - Una checklist es una lista de comprobaciones sin pasos ni Gherkin, que se
     ejecuta marcando cada punto.
2. En el `.xlsx`, los campos personalizados van en una hoja aparte, "Campos
   personalizados". Así la plantilla sigue idéntica a la de `docs/referencias/`.
3. Las definiciones son por proyecto, con "copiar de otro proyecto". Las de nivel
   de workspace llegarán con los workspaces compartidos (0.3.0).

## Revisión (2026-10-28, tras la revisión independiente)

- **Precisiones, sin cambio de decisión:**
  - `custom_fields` usa un id determinista y deja de tener índice `UNIQUE`;
  - un campo que falta en el payload conserva el valor local, en lugar de
    recibir el valor por defecto;
  - el dueño se deriva de `project_id`;
  - las preguntas se reescriben como decisiones.
- **Simplificación aceptada (decisión del usuario, 2026-10-28):** los campos personalizados son
  recortables de 0.2.0. `case_type` y `automation_status` entran en
  cualquier caso, porque las revisiones de ADR-0011 los incluyen en su
  contenido. `data.custom` se reserva desde 0.2.0 aunque no haya definiciones.

## Nota de implementación (E3, paso 5, 2026-10-31)

Hecho en el paso 5 del diseño 0.2.0, **con los campos personalizados dentro de
0.2.0** (decisión del usuario: 0.2.0 sale sin recortes). Precisiones sobre lo
aceptado, aprobadas por el coordinador a partir de las decisiones Q1–Q7 del
plan (contrastadas con Jira, Xray, Zephyr, TestRail y Azure Test Plans):

- **`case_type` y `automation_status` admiten NULL (Q1).** El boceto decía
  `NOT NULL DEFAULT`. Con un valor por defecto, cada caso existente habría
  cambiado de contenido y su revisión vigente habría dejado de casar con su
  hash: una segunda «revisión N» por caso y por equipo. NULL significa «nunca
  se fijó» y se lee como `standard` / `manual` en todas partes; el hash cubre
  el valor guardado, así que **ninguna revisión anterior cambia** (lo
  comprueban los tests de actualización desde los dos fixtures). Un caso nuevo
  (escritorio, web, importación, IA) guarda los valores explícitos, y el editor
  devuelve el valor guardado si el usuario no lo toca. Sin `CHECK`: un pull
  nunca falla por un valor que esta versión no conoce.
- **Obligatorio = bloquea solo en el editor (Q2).** Como en Jira, TestRail y
  Azure, el editor no guarda un caso sin un campo obligatorio que aplique a su
  tipo y lo nombra en el resumen de errores accesible. El repositorio Rust, la
  importación, la IA, la finalización de claves y el sync no lo exigen (si no,
  añadir un campo obligatorio bloquearía todos esos caminos). Un valor de tipo
  incorrecto sí es un error en todas partes (Rust, servidor y editor).
- **Clave y tipo inmutables; se archiva, no se borra (Q6).** Cambiar el tipo
  invalidaría los valores; borrar un campo y volver a crear su clave revivirían
  el mismo id determinista con valores antiguos. Las opciones tampoco se
  borran: se archivan (no se ofrecen para valores nuevos, pero un caso que ya
  la tiene la conserva y la puede guardar). Solo la cascada del borrado del
  proyecto pone `deleted_at`. Los valores de un campo archivado se conservan
  en el caso, en sus revisiones y en las exportaciones.
- **Tipos y valores.** `text` ≤ 500, `long_text` ≤ 10 000, `user` ≤ 200
  (texto libre con el usuario actual como sugerencia hasta TEN-01) y `url`
  (`http(s)` absoluta, ≤ 2 000), en unidades UTF-16; `number` finito;
  `integer` dentro de ±(2^53 − 1); `date` `AAAA-MM-DD` real; `boolean`;
  `select` (id de opción) y `multi_select` (ids sin repetir). Tres
  implementaciones del mismo validador (`custom_fields.rs`, el servidor y el
  cliente) se comprueban contra
  `src-tauri/tests/fixtures/custom-field-vectors.json`. Un valor `null` se
  quita al guardar; un `custom` vacío desaparece. Un guardado cuyo `data` no
  trae `custom` conserva el guardado (`{}` lo vacía): la importación y la IA
  no lo conocen.
- **Sync.** `custom_field` es `lww` y es hijo del proyecto (la cascada lo
  borra); `APPLIED_SET_VERSION = 4` (el 3 es del paso 4, fusionado antes). Funcionalidad nueva
  **`custom-fields`** (las claves que protege están en `FEATURE_KEYS` y
  `FEATURE_DATA_KEYS` del servidor, el mecanismo general del paso 4):
  - el escritorio retiene las definiciones hasta que el servidor de la cuenta
    la lista (un servidor anterior rechazaría todo el lote por una entidad que
    no conoce); el diagnóstico las cuenta (`heldBackFields`);
  - el servidor **conserva `caseType`, `automationStatus` y `data.custom`**
    de un `test_case` que envía un cliente sin ella (los builds entre DAT-02
    y este paso mandan su estado completo, pero no conocen estos tres);
  - **límite conocido (revisión 8):** cuando un build sin `custom-fields`
    guarda un caso, la revisión N que envía no lleva el tipo, la
    automatización ni `data.custom` (no los conoce), mientras que el servidor
    los conserva en el caso. Los equipos con FLD-01 calculan entonces su propia
    revisión N con esos campos: dos filas «revisión N» con distinto contenido,
    como dos ediciones sin conexión (ADR-0011). No se pierde nada y cada
    resultado apunta a la que se ejecutó. Solo afecta a builds de desarrollo
    entre DAT-02 y este paso: las versiones publicadas anteriores son de solo
    lectura;
  - a un cliente en solo lectura (0.1.x, 0.2.0-alpha.1), que no tiene columnas
    para ellos, el pull le manda el tipo y el estado de automatización en
    `data.__caseFields`. Clave reservada, como `__stableSteps`: todo guardado
    la quita.
- **Migraciones.** 0026 (aditiva: las dos columnas y `custom_fields`) y 0027
  (paso en Rust, mismo savepoint): devuelve a las columnas lo que traía
  `__caseFields`; a un caso editado en solo lectura, cuyo editor antiguo
  reconstruyó `data` sin `custom`, le devuelve `custom` desde su estado en la
  base de sync (la fila de historial que copió el `update_case` antiguo); y si
  eso cambió el contenido, sustituye la fila de revisión que 0021 había dejado
  en cola en esa misma actualización por la buena. No sube `revision`.
  Idempotente. El servidor no necesita migración (0009 liberado).
- **La web** gestiona las definiciones (`/api/custom-fields`, auditado como
  el resto del dominio), valida los valores con el mismo validador y calcula
  la revisión con el tipo y el estado de automatización del caso (antes,
  `null` fijo): el mismo id que el escritorio.
- **UI.** Ajustes del proyecto → «Campos personalizados» (crear, editar,
  reordenar arrastrando o desde el menú de la fila, archivar, «Mostrar
  archivados», «Copiar de otro proyecto»). Editor: «Tipo de caso» (Estándar /
  Checklist), «Automatización» y la sección «Campos personalizados», con los
  valores de campos archivados o desconocidos en «Otros valores» (solo
  lectura, nunca se pierden). **Checklist mínima (Q3):** una checklist muestra
  una lista de «Comprobaciones» (`data.steps`, con id estable para los
  resultados del paso 7) y oculta, sin borrarlos, los pasos y el Gherkin.
  Lista: columna «Automatización», marca de checklist y filtros por tipo,
  automatización y, para los campos de selección y sí/no, «Campos» (Q4; el
  selector de columnas queda en el backlog, FLD-02).
- **Exportación (decisión 2).** El `.xlsx` añade la hoja «Campos
  personalizados» (Campo | Clave | Valor), después de las de la plantilla,
  **solo si** el caso no es estándar y manual o tiene algún valor; un caso sin
  nada que decir se exporta igual que antes. El tipo y la automatización van
  con las claves `pharos.case_type` y `pharos.automation_status` (un punto
  nunca aparece en una clave de campo). La importación lee esa hoja contra los
  campos del proyecto: un valor que no encaja se omite y se avisa; una clave
  desconocida se conserva. El PDF añade el bloque si hay filas. El `.feature`
  no cambia (los tags siguen siendo del usuario) y el lote no exporta las
  checklists (lo dice el aviso). La IA no rellena campos en 0.2.0.
