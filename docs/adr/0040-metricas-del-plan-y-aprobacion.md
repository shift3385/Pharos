# ADR-0040 · Métricas del plan, criterios de salida enlazados y aprobación con autor

- **Estado:** Aceptado (el usuario aprobó el plan y los bocetos de PLN-06/07 el
  2026-11-11: «Sí, apruebo todo»). El contrato de las métricas se acordó con la
  pista de DOC-02/DOC-06, que escribe el ADR-0041.
- **Contexto:**
  - El plan no tenía los apartados de ISO/IEC/IEEE 29119-3 y CTFL v4 §5.1.1
    que pide NC-023: criterios de entrada, suspensión y reanudación, supuestos
    y restricciones, técnicas, métricas, formación, independencia, presupuesto
    y estimación.
  - Los criterios de salida eran texto libre: la derivación los reconoce por
    palabras («ejecutad», «cobertura»…) y su objetivo por el número
    (`criterion_kind`, `parse_metric`). DOC-02 necesita criterios
    estructurados para el *quality gate* al cerrar un ciclo.
  - «Aprobado» era una opción más del estado: no registraba quién ni cuándo, y
    editar un plan aprobado lo dejaba aprobado (NC-032). Guardar sin cambios
    subía la versión y dejaba una copia de revisión (NC-031).
- **Decisión:**
  1. **Todo vive en `data` del plan** (JSON): sin migración, sin número de
     migración reservado, y se sincroniza como el resto del contenido.
  2. **Métricas del plan** (`data.metrics`, paso «Métricas y objetivos
     medibles»): `{ id, kind, name, op, target, unit, note? }`. `id` es único
     en el plan. Los tipos del catálogo son, como contrato con DOC-02/DOC-06:
     `executed`, `passRate`, `criticalDefects`, `coverage`, `defectDensity`,
     `escapedDefects`, `fixTime`, `reopenRate`, `flakyRate`. Su unidad es fija
     (porcentaje: los cuatro índices y `coverage`; número: `criticalDefects`,
     `escapedDefects`; `per100cases`: defectos por cada 100 casos ejecutados;
     `days`: mediana de días desde que se crea un defecto hasta «Corregido»)
     y el asistente la bloquea. `kind: null` es una métrica propia, con
     nombre y unidad propios, que se valora a mano. Los operadores son
     `>=`, `>`, `<=`, `<` y `=`. El plan declara estos literales en
     `src/modules/test-plan/model/metrics.ts`; la pista de métricas repite
     los mismos en `src/shared/metrics` y en Rust, sin dependencia entre PRs.
  3. **Criterios de salida enlazados:** cada criterio puede llevar `metricId`
     (la métrica que lo mide) y `blocking` (por defecto, `true`: bloqueante;
     `false`: orientativo). El texto `criterion`/`metric` se sigue escribiendo
     y se regenera desde la métrica cada vez que cambia, para los exportes y
     para la app 0.3, que sigue evaluándolo por texto. La derivación
     (DOC-02): con `metricId` de una métrica con tipo, evalúa la métrica; con
     `kind: null`, a mano; un `metricId` sin métrica cuenta como sin enlace y
     se lee el texto, como sin `metricId`.
  4. **Aprobación con autor** (`data.approval`: `{ by, byName, at, version }`):
     «Aprobado» sale del desplegable de estado y se da con «Aprobar versión N»
     en «Estado del plan», con confirmación, solo con el plan guardado y en
     «Revisado». Aprobar no sube la versión. Cambiar el título o el contenido
     de un plan aprobado lo devuelve a «Revisado», sube la versión y borra la
     aprobación; la auditoría guarda el cambio de estado, y el panel
     «Historial» y el historial exportado lo muestran («pierde la
     aprobación»). Un archivo importado nunca trae aprobación. Con roles
     (0.5.0), aprobará otra persona.
  5. **Versión solo con cambios (PLN-03):** guardar sin cambios no escribe
     nada; la versión sube solo si cambian el título o el contenido (no el
     estado, la fecha, el ID de documento, la aprobación ni las marcas de
     revisión de la IA). El escritorio deja copia de revisión solo en ese
     caso.
  6. **ID de documento por plan (PLN-04):** `data.documentId`, editable en
     «Identificación del plan», por defecto `TP-<prefijo del proyecto>-<6 hex
     del id del plan>`; el .xlsx lo escribe en C3 y el PDF en la cabecera.
  7. **Exportes:** el PDF pone cada apartado nuevo donde lo pide el asistente;
     el .xlsx conserva la hoja de la plantilla (C3 y «Aprobado por» en la fila
     8) y añade «Estrategia 29119-3», «Métricas» y «Criterios de salida», que
     la importación lee por sus cabeceras (es/en).
- **Alternativas:**
  - Copiar `kind/op/target` dentro de cada criterio (lo que propuso al
    principio la pista de métricas): duplica la métrica y deja que el
    criterio y su métrica digan cosas distintas. Se eligió el enlace.
  - Columnas nuevas o tabla de aprobaciones: piden migración local y del
    servidor, y la auditoría ya guarda quién y cuándo de cada cambio.
  - Ampliar la plantilla .xlsx con filas nuevas: cambia las celdas que lee la
    importación de 0.3 y de otros archivos; las hojas nuevas no tocan nada.
- **Consecuencias:**
  - El asistente pasa de 17 a 22 pasos; ningún id de paso cambia, así que los
    enlaces `?step=` y los planes guardados siguen valiendo. Un plan anterior
    abre con los pasos nuevos sin ✓.
  - Un plan nuevo empieza con cuatro métricas (las A3 y la tasa de éxito) y
    tres criterios bloqueantes enlazados a ellas.
  - La app 0.3 ignora los campos nuevos y sigue leyendo los criterios por su
    texto; la 0.4 lee los planes de 0.3 sin cambios.
