# IA-17 · Requisitos desde un proyecto existente — borrador de diseño

Estado: **aprobado e implementado** el 2026-11-07 (ver [ADR-0036](../adr/0036-requisitos-desde-un-proyecto.md)).

## 1. Flujo

Trazabilidad → Requisitos → botón **«Desde un proyecto (IA)»**, junto a «Importar CSV».

| # | Paso | Qué ve la persona | Qué pasa por dentro |
|---|---|---|---|
| 1 | Elegir carpeta | Diálogo con una explicación breve y el botón «Elegir carpeta…» | `project_scan_pick` abre el selector nativo y recorre la carpeta en Rust |
| 2 | Inventario | Árbol de archivos con casillas, agrupados por categoría (Documentación, Rutas, Modelos, Tests, Interfaz, Otros). Por cada archivo: tamaño, tokens ≈ y una marca si está excluido o redactado. Abajo: total incluido, el presupuesto (300 000 por defecto, editable) y el número de llamadas | Nada sale del equipo |
| 3 | Confirmar envío | Resumen: «Se enviarán N archivos (≈ T tokens) en L llamadas. El contenido **sale de este equipo** hacia el proveedor de IA configurado», o «**no sale de este equipo** (Ollama)». También dice qué se excluye siempre y qué se ha redactado. Botones «Enviar y analizar» y «Volver» | — |
| 4 | Análisis | Barra de progreso «Lote 3 de 8 · docs/, src/api/» y «Cancelar». Al terminar los lotes, «Sintetizando y comparando con los N requisitos actuales…» | Fases map y reduce |
| 5 | Revisión | La vista común de propuestas (§3) | — |
| 6 | Aplicar | «Aplicar 12 cambios», con un resumen de cuántos se crean, se mejoran, se fusionan y se eliminan. Eliminar pide una confirmación aparte | `applyRequirementProposals` |
| 7 | Resultado | Aviso: «Creados 9 · mejorados 2 · eliminados 1». Lo nuevo y lo mejorado aparece con «IA · pendiente de revisión» | Recarga la lista |

## 2. Estados y errores

| Estado | Mensaje / comportamiento |
|---|---|
| Sin IA configurada | Botón deshabilitado: «Configura un modelo de IA en Administración → Motor de IA» |
| En la web | El botón no aparece en v1 (no hay IA en línea en la web hasta IA-12) |
| Carpeta vacía o sin archivos útiles | «No hay documentación ni código legible en esta carpeta» |
| Carpeta enorme (> 20 000 entradas) | El recorrido se detiene y avisa; se puede elegir una subcarpeta |
| Presupuesto superado | Los archivos de menor prioridad quedan desmarcados, con el motivo «fuera del presupuesto» |
| Un lote falla (red, tiempo, JSON inválido) | El lote queda marcado y se ofrece «Reintentar lote». Los demás se conservan y se puede seguir sin él, con un aviso de cobertura parcial |
| El modelo se niega o no encuentra requisitos | Lo dice con su motivo, como `AiFailureNotice` |
| Cancelar | Se detienen los lotes pendientes. Lo ya extraído se puede revisar o descartar |
| Requisito modificado mientras se revisa | Su propuesta se salta al aplicar: «REQ-004 cambió desde la propuesta» |
| Error al guardar uno | Se reintenta solo ese, sin duplicar los ya guardados, como en `createProposedCases` |

## 3. Vista común de propuestas (`RequirementProposalsReview`)

Diálogo amplio con pestañas o secciones por tipo y un contador:

```
Propuestas de la IA · 14                                    [Marcar todo] [Ninguno]
── Nuevos (9) ───────────────────────────────────────────────────────────────────
[x] (Nuevo)  Exportar la matriz de trazabilidad a Excel                 Prioridad: media
             El sistema debe exportar la matriz a .xlsx con la plantilla del proyecto.
             Motivo: documentado y con test; no figura en la lista.
             Fuente: docs/manual/trazabilidad.md:40-52 · src/.../matrixXlsx.ts:12   [Escrito en la fuente]
             ⚠ Se parece a REQ-007 «Exportar resultados»
── Mejoras (2) ──────────────────────────────────────────────────────────────────
[x] (Mejora) REQ-003  ~~El sistema debe ser rápido~~
                      El listado de casos debe cargar 1 000 casos en menos de 2 s.
             Motivo: «rápido» no es verificable; el test fija el límite.  Fuente: …
── Posibles duplicados (1) ──────────────────────────────────────────────────────
[ ] (Duplicado) REQ-009 y REQ-012 → conservar REQ-009 con el texto fusionado
             Motivo: los dos piden el inicio de sesión con usuario y contraseña.
── Eliminar por redundante (2) ──────────────────────────────────────────────────
[ ] (Eliminar) REQ-015  Lo cubre REQ-002.  Motivo: …
[—] (Eliminar) REQ-018  Tiene 3 casos vinculados: desvincúlalos antes de eliminarlo.
                                                      [Cancelar] [Aplicar 11 cambios]
```

- Pastillas `StatusPill` con los tonos de IA-16: el nuevo en éxito, la mejora en aviso,
  el duplicado en información y eliminar en error.
- Por defecto se marcan los nuevos y las mejoras. Los duplicados y las eliminaciones
  empiezan desmarcados.
- Cada propuesta nueva o mejorada se puede **editar antes de aplicar** (título,
  descripción y prioridad), con un lápiz que abre el texto en línea.
- Fuente: `sourceLabel(source)`, que pone cada pista. En esta, `ruta:línea-línea`,
  copiable. En la de imágenes, una miniatura o el nombre del frame.
- Base: «Escrito en la fuente» (`stated`) o «Inferido» (`inferred`). Lo inferido del código se avisa:
  «Deducido del código: confirma que es el comportamiento esperado y no un defecto».
- Accesibilidad: lista con `role="group"` por sección y casillas con etiqueta
  completa. El foco va a «Aplicar». Lleva `data-testid` estables (`req-proposal-<n>`,
  `req-proposals-apply`).

## 4. Prompts versionados (la «skill»)

Viven en `src/modules/ai/api/requirementPrompts.ts`, con la versión en una
constante. Comparten `systemRules()` y `asData()` con los demás generadores.

### `req-extract@1` (un lote)

- **Rol:** «Eres un analista de requisitos sénior (ISO/IEC/IEEE 29148, ISTQB)».
- **Material:** `<data>`, con cada archivo como `=== ruta ===` y sus líneas numeradas
  (`12| …`).
- **Instrucciones, en resumen:**
  - Extrae las capacidades y restricciones que el sistema debe cumplir y que este
    material muestra.
  - Cada requisito es necesario, singular, inequívoco y verificable. Prohíbe palabras
    como «rápido», «fácil» o «etc.».
  - Usa EARS cuando encaje («Cuando…, el sistema debe…»).
  - Granularidad de usuario o sistema: no conviertas cada función en un requisito.
  - Cita la fuente con su ruta y sus líneas exactas, con una cita de 15 palabras como
    máximo.
  - Marca `stated` lo que está escrito en la documentación o la especificación, e
    `inferred` lo que solo se deduce del código o de los tests.
  - No inventes comportamiento.
  - Como máximo, 40 candidatos.
- **Esquema (zod):**

```json
{"candidates":[{"title":"…","description":"…","priority":"low|medium|high",
  "kind":"functional|non-functional|constraint","basis":"stated|inferred",
  "sources":[{"path":"src/a.ts","startLine":10,"endLine":24}],"evidence":"cita breve"}],
 "reason":"si no hay ninguno, por qué"}
```

### `req-synthesis@1` (común con la pista de imágenes)

- **Material:**
  - Los candidatos numerados (`C1…Cn`) con su base.
  - Los requisitos existentes con su clave, título, descripción (hasta 600 caracteres)
    y prioridad.
  - Un contexto opcional.
- **Instrucciones:**
  - Fusiona los candidatos que dicen lo mismo.
  - Compara cada uno con los existentes. Si uno existente ya lo cubre, no lo propongas.
    Si lo cubre mal, propón una mejora.
  - Revisa los existentes entre sí: duplicados y redundantes.
  - Cada propuesta lleva un motivo de 20 palabras como máximo, que nombre el defecto o
    la evidencia.
  - No pongas claves nuevas.
- **Esquema (zod):**

```json
{"proposals":[
  {"action":"add","from":["C1","C4"],"title":"…","description":"…","priority":"medium","reason":"…","similarTo":"REQ-007"},
  {"action":"improve","key":"REQ-003","from":["C2"],"title":"…","description":"…","priority":"high","reason":"…"},
  {"action":"merge","keys":["REQ-009","REQ-012"],"keep":"REQ-009","title":"…","description":"…","reason":"…"},
  {"action":"remove","key":"REQ-015","coveredBy":"REQ-002","reason":"…"}],
 "reason":"si no propone nada, por qué"}
```

Las fuentes y la base de cada propuesta se calculan a partir de `from`. El modelo
no escribe rutas en esta fase.

### Límites

| Límite | Valor |
|---|---|
| Archivos en el inventario | 20 000 entradas recorridas, 3 000 archivos legibles |
| Tamaño por archivo | 256 KB |
| Presupuesto de entrada | 300 000 tokens por defecto (≈ 3,5 caracteres por token) |
| Lote | ≈ 60 000 tokens en la nube; con Ollama, `num_ctx` − 4 000 |
| Candidatos por lote | 40 |
| Propuestas por análisis | 100 |
| Requisitos existentes enviados | Todos, con la descripción recortada a 600 caracteres. Por encima de 400, por lotes |
| Concurrencia | 2 llamadas a la vez |
| Tiempo por llamada | 120 s (el de siempre) |

## 5. Modelo y datos

Contrato común con IA-18 (tipos, filtro, vista, aplicar y `AiSendNotice`): la nota
`contrato-propuestas-requisitos.md` (v2). Lo que sigue es lo que guarda IA-17.

- `requirements.data` (JSON), con este contenido:
  - `aiProvenance`: `{ requirement: AiProvenance & { prompt?: "req-synthesis@1" } }`;
  - `sources`: `RequirementSource[]`.
- La revisión humana usa `markReviewed`, como en los casos: con «Marcar revisado» en
  el formulario y después «Guardar».
- La marca aparece en la lista de requisitos y en el formulario, sin proveedor ni
  modelo en el texto; esos datos van en el tooltip (UX-18).
- El formulario muestra «Fuentes» como una lista de solo lectura.
- La importación CSV no cambia. Las fuentes no se exportan en v1.

## 6. Pruebas previstas

- **Rust** (`project_scan`): exclusiones fijas y `.gitignore`, rutas fuera de la raíz
  rechazadas (`..` y enlaces simbólicos), redacción de secretos, binarios y archivos
  minificados, presupuesto y orden por prioridad.
- **TS puro:**
  - lotes por módulo;
  - `usableRequirementProposals`: claves inexistentes, una propuesta por clave,
    títulos repetidos, `from` inválidos y citas fuera de lo enviado;
  - `applyRequirementProposals` con fallos parciales y requisitos cambiados;
  - el filtro léxico de parecidos.
- **Prompts:** forma de los mensajes, `asData` y versión.
- **UI:** los estados de §2 y la vista de propuestas, con su accesibilidad (axe).
- **Migración y sincronización** de `requirements.data`, ida y vuelta escritorio ↔
  servidor.
- **Validación manual** con claves reales y con Ollama, sobre el propio repositorio de
  Pharos.
