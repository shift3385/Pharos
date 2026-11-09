# Módulo `traceability` — «Requisitos» y «Trazabilidad»

Requisitos de un proyecto (TRZ-01) y la matriz requisito ↔ caso ↔ último
resultado ↔ defecto (TRZ-02, ampliada por EJE-04 en el paso 10). Desde UX-21
son dos secciones del proyecto: `RequirementsPage` (`/requirements`, antes de
«Casos») y `TraceabilityPage` (`/traceability`, al final del menú). Las dos
usan el mismo componente con `view`.

## Pantallas

| Sección | Componente | Qué hace |
| --- | --- | --- |
| «Requisitos» | `RequirementsPanel` | Lista con prioridad y casos que cubren cada requisito; nuevo, editar (con su riesgo), eliminar, generar casos con IA. Cabecera: «Importar» (CSV, desde un proyecto, desde diseños) y «Nuevo requisito» |
| «Trazabilidad» | `MatrixView` | Los cuatro indicadores, la matriz de 9 columnas del SPEC (§8), «Mostrar solo huecos», tarjetas en móvil y los huecos de la cadena. Cabecera: «Exportar matriz (.xlsx)». Sin requisitos, enlaza a «Requisitos» |
| Diálogos | `RequirementFormModal`, `RequirementImportModal`, `GenerateCasesModal`, `MigrateTraceabilityModal` | Requisito (con riesgo, marca de IA y fuentes), importar CSV, IA, migrar referencias escritas a mano |
| «Requisitos desde un proyecto (IA)» | `ProjectRequirementsModal` → `RequirementProposalsReview` | IA-17: carpeta → inventario → aviso de envío → lotes → propuestas (solo escritorio) |
| «Requisitos desde diseños» | `RequirementsFromDesignModal` → `RequirementProposalsReview` | IA-18: material (imágenes, PDF, `.excalidraw`, Claude Design) → aviso → lectura con visión → síntesis común → propuestas con su imagen |

`TraceabilityPage` carga requisitos, casos y defectos (la lista también los
necesita: casos por requisito y cobertura). Solo la matriz pide, desde EJE-04, el resumen de ejecución (`executionApi.summary`
de `@modules/runs`) con los filtros de la dirección de la página
(`?cycle=&configuration=&build=&environment=&sort=key`), más los ciclos y
configuraciones de `@modules/cycles` para los filtros.

## Modelo

- `buildMatrix(requirements, cases, defects, execution?, sort = "risk")`
  (`model/matrix.ts`) es la única fuente de la vista, del `.xlsx` y de
  `projectTraceFacts` (casos y cobertura de cada fila de Proyectos). Sin `execution`, cada caso es «No ejecutado» (como antes de
  0.2.0). Con él, cada fila trae el estado del caso (`passed`, `failed`,
  `retest`, `blocked`, `skipped`, `other` o `not_run`), su último resultado
  (`last`: run, fecha, origen, flaky, desactualizado), el riesgo del requisito
  (`riskLevel`, `riskBand`) y las notas `retest`, `flaky` y `stale`. Las reglas
  del último resultado son las de la derivación (ADR-0013, «Implementación,
  paso 10»).
- **Orden:** por riesgo (banda alta primero, luego nivel, sin evaluar al final)
  o por ID. Bandas por defecto: hasta 4 bajo, hasta 12 medio, más alto.
- **Cobertura:** un requisito está cubierto si tiene al menos un caso vivo no
  obsoleto (sin cambios desde TRZ-02); es la cobertura del criterio de salida.
- Los defectos de una fila: los que alcanzan el caso (directamente o por un
  resultado), abiertos primero, con su severidad.

## Exportación

`export/matrixXlsx.ts` rellena la plantilla real
(`docs/referencias/PHAROS_Matriz_Trazabilidad_*.xlsx`): la hoja «Matriz» usa
las palabras de sus desplegables (re-test → Falla; omitido y otro → No
ejecutado, con el estado real en Comentarios). La hoja nueva «Resultados»
trae, por cada caso, el riesgo, el estado real, el run, la fecha, la
configuración, el origen, flaky, desactualizado y los defectos con severidad,
con los filtros activos arriba.

## Requisitos propuestos por la IA (IA-17, ADR-0036)

- **Leer la carpeta** es de Rust (`src-tauri/src/project_scan.rs`): selector
  nativo, recorrido con `.gitignore`, exclusiones fijas (dependencias, builds,
  ocultos, binarios, lockfiles, secretos) y líneas con aspecto de secreto
  sustituidas. El webview recibe un inventario sin contenido y luego el texto
  numerado de lo elegido (`api/projectScanApi.ts`).
- **Modelo puro** en `proposals/`:
  - `fromProject.ts`: selección por presupuesto en orden de lectura, lotes
    por módulo y validación de las citas `ruta:línea`.
  - `proposals.ts`: `usableRequirementProposals` comprueba la respuesta
    de `req-synthesis@1` contra lo enviado; parecido léxico y bloqueo por
    casos vinculados.
  - `types.ts`: el contrato común con IA-18 (imágenes y diseños):
    `CandidateRequirement`, `RequirementProposal`, `ApplyResult`.
- **Aplicar** (`api/applyProposals.ts`): crear con clave automática, mejorar
  solo si la revisión no cambió, fusionar o eliminar solo sin casos
  vinculados; lo creado o cambiado lleva `data.aiProvenance.requirement` (con
  la versión del prompt) y `data.sources`.
- **`requirements.data`** (migración 0038, feature de sync
  `requirement-data`): objeto JSON libre; un cliente sin la feature lo conserva.
- Prompts versionados en `@modules/ai` (`api/requirementPrompts.ts`):
  `req-extract@1` (un lote de archivos) y `req-synthesis@1` (común).

## Requisitos desde diseños (IA-18, ADR-0037)

- **Material** en `fromDesign/` (puro salvo `imageReduce.ts`):
  - `material.ts`: lee archivos sueltos, una carpeta (`webkitdirectory`) o un ZIP
    (`jszip`). Lee una vez cada archivo repetido (SHA-256) y deja desmarcado lo que
    pasa de los límites.
  - `outline.ts`: el esquema textual de un HTML con `DOMParser`, sin ejecutar
    nada; los textos de un `.excalidraw` y el Markdown.
  - `imageReduce.ts`: canvas con 1568 px de lado largo, en WebP o JPEG y sin
    metadatos.
  - `limits.ts`: los límites y las estimaciones de tokens, iguales que en `ai.rs`.
  - `candidates.ts`: numera lo enviado y escribe las fuentes de cada candidato
    a partir del material, nunca del modelo.
- **Dos llamadas:** `requirements-from-design@1` (`@modules/ai`, con las
  imágenes) y `req-synthesis@1` con `partialMaterial: true`. Un fallo de la
  síntesis se reintenta sin volver a enviar las imágenes. La procedencia guarda
  los dos prompts.
- **Fuente en la revisión:** `ui/DesignSourceLabel.tsx` pinta la miniatura con la
  región. La imagen solo vive en el diálogo; en `data.sources` quedan el nombre,
  el índice y el SHA-256.
- **Guardar la imagen (IA-19, enmienda de ADR-0037):** la revisión ofrece
  «Guardar las imágenes como adjunto de los requisitos» (desmarcada) cuando recibe
  `keepImages`. Marcada, `applyRequirementProposals({ afterSave })` guarda tras cada
  requisito creado o mejorado la imagen reducida como adjunto del requisito
  (`api/requirementAttachments.ts` → `requirement_attachment_add`, solo
  escritorio). Un fallo se cuenta en `attachFailed` y no deshace el requisito.
- **Fuente del requisito guardado:** `ui/RequirementSources.tsx` busca el adjunto por
  el nombre de la fuente y pinta la miniatura con la región y el visor a tamaño
  completo; sin adjunto, dice por qué no se ve.

## Riesgo del requisito (TRZ-04, parcial)

El formulario pide Probabilidad e Impacto (1–5, o «Sin evaluar»). En el
escritorio se guardan con `requirement_risk_set` después de crear o editar; en
la web van como claves opcionales (`riskLikelihood`, `riskImpact`: si faltan
se conservan, `null` las borra). Las bandas por proyecto y la cobertura
ponderada siguen en TRZ-04.

## `data-testid` estables (recorridos de MAN-01)

| testid | Dónde |
| --- | --- |
| `trace-filter-cycle`, `trace-filter-configuration`, `trace-filter-build`, `trace-filter-environment` | Filtros de resultados de la matriz |
| `trace-sort`, `trace-filters-clear` | Orden de la matriz y «Quitar filtros» |
| `trace-result-<ID del caso>`, `trace-run-link` | Celda «Estado de prueba» y enlace al run |
| `requirement-risk-likelihood`, `requirement-risk-impact` | Riesgo en el formulario del requisito |
| `req-proposals`, `req-proposal-<n>`, `req-proposals-apply`, `req-scan-send`, `ai-send-notice` | Propuestas de requisitos de la IA (IA-17) |
| `requirement-ai-<ID>`, `requirement-sources` | Marca de IA en la lista y fuentes en el formulario |

Sin diseño en `docs/rediseno/` para los filtros, el último resultado y el
riesgo: selects nativos y las pastillas compartidas (`StatusPill`).
