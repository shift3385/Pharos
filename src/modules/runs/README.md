# Módulo `runs` — «Ejecuciones»

Runs de un proyecto: importación de informes (ING-02..05), la bandeja «Sin
vincular» (ING-05) y la **ejecución manual paso a paso** (EJE-02). Escritorio
solamente: el servidor guarda los documentos, pero no tiene API de runs hasta
EJE-06 / INT-02, así que la web no lista nada y la pantalla del run lo avisa.

No hay diseño en `docs/rediseno/` para estas pantallas: usan las piezas de
`src/shared/ui` (DataTable con tarjetas en móvil, FilterChips, StatusPill,
Tabs, Dialog, FormField).

## Pantallas

| Ruta | Componente | Qué hace |
| --- | --- | --- |
| `/projects/:id/runs` | `RunsPage` → `RunsList` | Runs (todos / importados), «Nuevo run manual», «Importar informe», bandeja «Sin vincular» |
| `/projects/:id/runs/:runId` | `RunDetail` | Cabecera (clave, título, entorno, build, configuración, ciclo, estado), progreso por objetivo, elementos, cerrar / reabrir, editar, añadir casos |
| `…/runs/:runId?item=<runItemId>` | `ExecutionPanel` | El ejecutor de un elemento: al lado de la lista desde 1280 px, en su lugar por debajo |

`ProjectDetail` pasa `runId` y la lista de casos (`cases`); el módulo solo
depende de `@modules/auth`, `@modules/sync-offline` y `@modules/defects`
(`DefectEditor`, `createDefectFromResult`), por su API pública.

## Ejecución manual (EJE-02)

- **Objetivos.** Un elemento del run se expande en `(flujo, fila de Outline)`
  (`run_item_detail` → `targets`); cada uno recibe sus propios intentos.
- **Borrador** (`model/execution.ts`, `TargetDraft`): marcas por paso, «obtenido
  / notas», estado elegido a mano, notas, cronómetro. Se guarda solo
  (`execution_draft_save`, 600 ms) y vive en `execution_drafts` (local).
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
| `run-close`, `run-close-confirm`, `run-reopen` | Cerrar / reabrir el run |
| `exec-panel` | El ejecutor |
| `exec-step-<n>-pass`, `-fail`, `-blocked`, `-skip` | Marcar el paso n (desde 1) |
| `exec-step-<n>-notes`, `exec-step-<n>-attach`, `exec-step-<n>-defect` | Lo obtenido, adjuntar y «Guardar y crear defecto» del paso n |
| `exec-status`, `exec-notes`, `exec-timer` | Estado del intento, notas, cronómetro |
| `exec-result-attach`, `exec-paste` | Adjuntar al resultado, pegar captura |
| `exec-save`, `exec-discard` | Guardar resultado, descartar borrador |
| `exec-create-defect` | «Crear defecto» de un intento fallido |
| `exec-next-item` | Siguiente elemento |

## Comandos de escritorio

`run_list`, `run_counts_list`, `results_list`, `unlinked_tests_list`,
`unlinked_mapping_set`, `run_import_preview`, `run_import`,
`run_import_attach` (importación) y, para la ejecución manual, `run_create`,
`run_items_add`, `run_update` (también reabre), `run_overview`,
`run_item_detail`, `execution_draft_save`, `execution_draft_discard`,
`execution_record`, `execution_attach`, `execution_attachment_delete`,
`execution_attachment_save`, `execution_attachment_preview`,
`configuration_list`. Ver `src-tauri/src/runs.rs`, `runs/import.rs` y
`runs/manual.rs`, y ADR-0013 / ADR-0014 («Implementación»).
