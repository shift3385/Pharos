# Módulo `runs` — «Ejecuciones»

Runs de un proyecto: importación de informes (ING-02..05), la bandeja «Sin
vincular» (ING-05), la **ejecución manual paso a paso** (EJE-02), la
**derivación de ejecución** (paso 10, contrato v1) y el **informe de estado**
(EJE-03). La ejecución funciona también en la web (EJE-06) con la API de runs
del servidor (`server/src/modules/domain/runs.ts`), y la derivación y el
informe con `GET /api/execution/summary`; la importación, la bandeja «Sin
vincular» y los adjuntos siguen solo en el escritorio (SYNC-04b).

No hay diseño en `docs/rediseno/` para estas pantallas: usan las piezas de
`src/shared/ui` (DataTable con tarjetas en móvil, FilterChips, StatusPill,
Tabs, Dialog, FormField).

## Pantallas

| Ruta | Componente | Qué hace |
| --- | --- | --- |
| `/projects/:id/runs` | `RunsPage` → `RunsList` | Runs (todos / importados), «Nuevo run manual», «Importar informe», bandeja «Sin vincular» |
| `/projects/:id/runs/:runId` | `RunDetail` | Cabecera (clave, título, entorno, build, configuración, ciclo, estado), progreso por objetivo, elementos, cerrar / reabrir, editar, añadir casos, eliminar (`DeleteRunDialog`, EJE-07) |
| `…/runs/:runId?item=<runItemId>` | `ExecutionPanel` | El ejecutor de un elemento: al lado de la lista desde 1280 px, en su lugar por debajo |

`ProjectDetail` pasa `runId`, `projectName` y la lista de casos (`cases`); el
módulo depende de `@modules/auth`, `@modules/sync-offline`, `@modules/defects`
(`DefectEditor`, `createDefectFromResult`), `@modules/admin` (`loadSettings`,
para los días de la purga en el diálogo de borrar), `@modules/cycles`
(`cycleApi`, para el alcance del informe) y `@modules/test-plan`
(`projectPlanRef`), por su API pública.

## Eliminar un run (EJE-07)

«Eliminar run» (`run_delete_preview` → `DeleteRunDialog` → `run_delete`) pone
lápida al run y a sus elementos y descarta sus borradores; sus resultados no
se tocan: se ocultan porque su run está borrado, y la purga se los lleva con
el run. Un run de un ciclo cerrado no se borra (`cycle-closed`); escribir en
un run borrado da `run-deleted`. Quien lea runs o resultados aplica
`runs.deleted_at IS NULL` (resultados y shards, por `JOIN` con su run).

## Derivación de ejecución (paso 10, contrato v1)

Lo que leen la matriz (EJE-04), el informe de estado (EJE-03) y el Inicio
(RED-W6). Una sola implementación: `src-tauri/src/execution/derive.rs` y su
gemelo `server/src/modules/domain/execution-summary.ts`, comprobados con
`src-tauri/tests/fixtures/execution-vectors.json`; reglas R1–R12 en ADR-0013
(«Implementación, paso 10»). Desde `@modules/runs`:

- `executionApi.summary(filter, userId)` → `ExecutionSummary | null`
  (`execution_summary` en escritorio, `GET /api/execution/summary` en la web).
  El filtro: `projectId`, y opcionales `cycleId`, `testPlanId`,
  `configurationId`, `build`, `environment`, `from` / `to` (ms, `[from, to)`) y
  `dayStarts` (medianoches locales en ms, para `daily`).
- `periodOf(fromDay, toDay)` y `localDayStart(day)`: días locales → instantes;
  el núcleo nunca maneja zonas horarias.
- `evaluateExitCriteria(summary, t)`: solo lee los criterios ya evaluados y
  traduce los de por defecto (`index: null`).
- Los tipos generados (`ExecutionSummary`, `CaseExecution`, `LastResult`,
  `RequirementExecution`, `ExitCriterion`, `HomeMetrics`, `HomeRequest`).

## Informe de estado (EJE-03)

`report/`: `statusReport.ts` (modelo puro de las nueve secciones de 29119-3),
`reportXlsx.ts` (ExcelJS sin plantilla: hojas Resumen, Resultados, Defectos y
Cobertura), `reportPdf.ts` (ayudantes de `pdfDoc`), `StatusReportDialog` y
`StatusReportButton` («Informe de estado» en Ejecuciones; en un ciclo, a través
de `CyclesPage.cycleActions`). Alcance Proyecto / Ciclo / Plan y periodo; los
defectos van «a fecha de hoy». El resumen (rellenado con las cifras) y las
recomendaciones se guardan en `localStorage` (`pharos:status-report:<proyecto>:<alcance>`)
y solo en ese equipo. Las exportaciones van a la carpeta de descargas
(`saveFile` / `savePdf`). Sin diseño en `docs/rediseno/`: diálogo, campos y
pastillas compartidos.

## Ejecución manual (EJE-02)

- **Objetivos.** Un elemento del run se expande en `(flujo, fila de Outline)`
  (`run_item_detail` → `targets`); cada uno recibe sus propios intentos.
- **Borrador** (`model/execution.ts`, `TargetDraft`): marcas por paso, «obtenido
  / notas», estado elegido a mano, notas, cronómetro. Se guarda solo
  (`execution_draft_save`, 600 ms) y vive en `execution_drafts` (local).
- **Una sola vez:** cada borrador lleva un `attemptId` que será el id del
  resultado; un segundo Ctrl+Enter o un reintento no duplica, y un borrador
  caducado (otra ventana) se rechaza y se recarga.
- **Guardar resultado** (`execution_record`): un intento inmutable; los
  adjuntos del borrador pasan al resultado o a su paso. Un paso sin marcar se
  guarda como Omitido.
- **Evidencias:** archivos, imágenes pegadas (Ctrl+V sobre el paso o el
  resultado, o «Pegar captura») y capturas del sistema. Se cifran en
  `evidence/` al adjuntarlas y no se sincronizan (SYNC-04b).
- **«Crear defecto»:** en un paso fallido del borrador guarda primero el
  intento; en un intento fallido abre `DefectEditor` relleno en lugar del
  ejecutor.
- **Teclado** (`commandOf`): P / F / B / S marcan, J / K o ↑ / ↓ mueven, N lo
  obtenido, T cronómetro, Ctrl+Enter guarda, Ctrl+Shift+N siguiente elemento,
  ? la lista. Las letras no actúan dentro de un campo.

## En la web (EJE-06)

- **API:** `runsApi` llama a `/api/runs`, `/api/run-items/:id`,
  `/api/results` y `/api/configurations`; `cycleApi.execute` a
  `/api/cycles/:id/execute`; `createDefectFromResult` a
  `/api/results/:id/defect-draft` (sin evidencias).
- **Borrador del navegador** (`model/webDrafts.ts`): una entrada de
  `localStorage` por cuenta y elemento, sin adjuntos, con las reglas del
  escritorio (`draft-stale`, `attemptId` por objetivo, 1 MB). La pestaña
  que registra deja una lista de intentos registrados para las demás, y el
  ejecutor recarga el elemento cuando otra pestaña lo cambia (evento
  `storage`). Cerrar sesión los borra todos; un run leído como cancelado o
  inexistente se lleva los suyos. Si el navegador no guarda nada, se registra
  igual y se avisa.
- **Sin archivos:** no hay botones de adjuntar ni «Pegar captura», Ctrl+V
  avisa y no figura en los atajos; la interfaz dice «Los adjuntos solo están disponibles en el
  escritorio».
- **Cobertura:** los recorridos de MAN-01 usan la app de escritorio; lo propio
  de la web lo cubren `RunDetail.test.tsx` («run screen on the web»),
  `api/runsApi.web.test.ts` y los tests del servidor
  (`server/tests/runs.test.ts`, con los vectores compartidos).

## `data-testid` estables (recorridos de MAN-01)

| testid | Dónde |
| --- | --- |
| `run-new` | «Nuevo run manual» en Ejecuciones |
| `run-new-title`, `run-cases-search`, `run-case-<clave>`, `run-cases-confirm` | Diálogo de nuevo run / añadir casos |
| `run-row-<RUN-xxx>` | Clave de un run en la lista (enlace a su pantalla) |
| `cycle-run-<RUN-xxx>` | Clave de un run en la pestaña Runs de un ciclo |
| `run-item-execute` (con `data-case-key`) | Abrir el ejecutor de un elemento |
| `run-execute-next` | «Ejecutar el siguiente» |
| `run-add-cases`, `run-edit` | Acciones del run abierto |
| `run-close`, `run-close-discard`, `run-close-confirm`, `run-reopen` | Cerrar (con «Descartar borradores») / reabrir el run |
| `run-delete`, `run-delete-hidden`, `run-delete-confirm`, `run-delete-cycle-closed` | Eliminar el run: botón, lo que se oculta, confirmar, aviso de ciclo cerrado |
| `run-deleted-notice` | La pantalla de un run eliminado (aquí o en otro equipo) |
| `exec-panel` | El ejecutor |
| `exec-step-<n>-pass`, `-fail`, `-blocked`, `-skip` | Marcar el paso n (desde 1) |
| `exec-step-<n>-notes`, `exec-step-<n>-attach`, `exec-step-<n>-defect` | Lo obtenido, adjuntar y «Guardar y crear defecto» del paso n |
| `exec-status`, `exec-notes`, `exec-timer` | Estado del intento, notas, cronómetro |
| `exec-result-attach`, `exec-paste` | Adjuntar al resultado, pegar captura |
| `exec-save`, `exec-discard` | Guardar resultado, descartar borrador |
| `exec-create-defect` | «Crear defecto» de un intento fallido |
| `exec-next-item` | Siguiente elemento |
| `exec-attach-desktop-only` | Web: «Los adjuntos solo están disponibles en el escritorio» en lugar de adjuntar |
| `runs-unlinked-desktop-only` | Web: nota de la pestaña «Sin vincular» |
| `runs-report`, `cycle-report` | «Informe de estado» en Ejecuciones / en un ciclo |
| `status-report` | El diálogo del informe |
| `report-scope`, `report-cycle`, `report-from`, `report-to` | Alcance, ciclo y periodo del informe |
| `report-exit`, `report-summary`, `report-recommendations` | Criterios de salida, resumen y recomendaciones |
| `report-export-xlsx`, `report-export-pdf` | Exportar el informe |

## Comandos de escritorio

`run_list`, `run_counts_list`, `results_list`, `unlinked_tests_list`,
`unlinked_mapping_set`, `run_import_preview`, `run_import`,
`run_import_attach` (importación) y, para la ejecución manual, `run_create`,
`run_create_manual`, `run_items_add`, `run_update` (también reabre), `run_close`, `run_overview`,
`run_item_detail`, `execution_draft_save`, `execution_draft_discard`,
`execution_record`, `execution_attach`, `execution_attachment_delete`,
`execution_attachment_save`, `execution_attachment_preview`,
`configuration_list`; y `execution_summary` (la derivación). Ver `src-tauri/src/runs.rs`, `runs/import.rs` y
`runs/manual.rs`, y ADR-0013 / ADR-0014 («Implementación»).
