// Manifest of the guided tours and the user manual (MAN-01).
//
// - CHAPTERS: one per area of the app, in manual order; each names its tour
//   file and the routes / project sections / admin tabs / plan steps it covers.
// - INVENTORY: every screen, tab, dialog and main action (create, edit, delete
//   with confirmation, import, export, filter, sort, keyboard, empty and error
//   states, desktop vs web). Each item must be exercised by a tour step
//   (`covers: [...]` in e2e/tours/*.tour.ts) or say why not (`pending` /
//   `skip`). `npm run check:manual` (scripts/check-manual.mjs) fails otherwise,
//   and also when the app gains a route, project section, admin tab or plan
//   step that has no inventory item: a new screen cannot ship without its page
//   in the manual.
//
// Only erasable TypeScript here: scripts/*.mjs import this file with Node's
// type stripping.

export type ChapterId =
  | "preparacion"
  | "acceso"
  | "proyectos"
  | "plan"
  | "casos"
  | "trazabilidad"
  | "planificador"
  | "ciclos"
  | "defectos"
  | "ejecuciones"
  | "administracion"
  | "ia"
  | "movil"
  | "ejecucion-manual"
  | "evidencias"
  | "errores";

export interface Chapter {
  id: ChapterId;
  number: number;
  title: string;
  /** Tour spec in e2e/tours/ (none while pending). */
  file: string | null;
  status: "active" | "pending";
  /** Why the chapter has no tour yet (shown in the manual and by the check). */
  pending?: string;
  /** False for the preparation tour (seed data), which is not a chapter. */
  inManual?: boolean;
  /** Chapters whose data this one reads (direct ones; they run first). A
   *  partial run (`--spec`) adds them, see selectTours. Each must come earlier
   *  in CHAPTERS. */
  needs?: ChapterId[];
}

export const CHAPTERS: Chapter[] = [
  { id: "preparacion", number: 0, title: "Preparación de los datos", file: "00-preparacion.tour.ts", status: "active", inManual: false },
  { id: "acceso", number: 1, title: "Acceso y cuenta", file: "01-acceso.tour.ts", status: "active" },
  { id: "proyectos", number: 2, title: "Inicio, proyectos y ajustes", file: "02-proyectos.tour.ts", status: "active" },
  { id: "plan", number: 3, title: "Plan de pruebas", file: "03-plan.tour.ts", status: "active", needs: ["proyectos"] },
  { id: "casos", number: 4, title: "Casos de prueba", file: "04-casos.tour.ts", status: "active", needs: ["proyectos"] },
  { id: "trazabilidad", number: 5, title: "Trazabilidad y requisitos", file: "05-trazabilidad.tour.ts", status: "active", needs: ["casos"] },
  { id: "planificador", number: 6, title: "Planificador", file: "06-planificador.tour.ts", status: "active", needs: ["proyectos"] },
  { id: "ciclos", number: 7, title: "Ciclos y configuraciones", file: "07-ciclos.tour.ts", status: "active", needs: ["proyectos", "casos"] },
  { id: "ejecuciones", number: 8, title: "Ejecuciones e importación de resultados", file: "08-ejecuciones.tour.ts", status: "active", needs: ["casos"] },
  { id: "defectos", number: 9, title: "Defectos", file: "09-defectos.tour.ts", status: "active", needs: ["ejecuciones"] },
  { id: "administracion", number: 10, title: "Administración", file: "10-administracion.tour.ts", status: "active", needs: ["plan", "trazabilidad"] },
  { id: "ia", number: 11, title: "Asistente de IA", file: "11-ia.tour.ts", status: "active", needs: ["plan", "trazabilidad"] },
  { id: "movil", number: 12, title: "Pantallas estrechas y móvil", file: "12-movil.tour.ts", status: "active", needs: ["plan", "casos"] },
  {
    id: "ejecucion-manual",
    number: 13,
    title: "Ejecución manual",
    file: "13-ejecucion-manual.tour.ts",
    status: "active",
    needs: ["proyectos", "casos"],
  },
  {
    id: "evidencias",
    number: 14,
    title: "Evidencias",
    file: "14-evidencias.tour.ts",
    status: "active",
  },
  { id: "errores", number: 15, title: "Si algo sale mal", file: "15-errores.tour.ts", status: "active" },
];

/** Tour files in run order (one WebdriverIO group, one app session). */
export const TOUR_FILES: string[] = CHAPTERS.filter((c) => c.file).map((c) => c.file as string);

/**
 * The tours of a partial run (`npm run manual -- --spec <regex on file names>`),
 * in run order: the preparation tour, the matching ones and, transitively, the
 * chapters they read data from (`needs`). `added` lists those prerequisites.
 * No filter: every tour. Throws on an invalid expression or one matching nothing.
 */
export function selectTours(only?: string | null, chapters: Chapter[] = CHAPTERS): { files: string[]; added: string[] } {
  const withFile = chapters.filter((c) => c.file);
  if (!only) return { files: withFile.map((c) => c.file as string), added: [] };
  let filter: RegExp;
  try {
    filter = new RegExp(only);
  } catch {
    throw new Error(`--spec «${only}» is not a valid regular expression`);
  }
  const first = withFile[0];
  const asked = withFile.filter((c) => c !== first && filter.test(c.file as string));
  if (asked.length === 0) throw new Error(`--spec «${only}» matches no tour file`);
  const chosen = new Set<ChapterId>([first.id]);
  const visit = (c: Chapter) => {
    if (chosen.has(c.id)) return;
    chosen.add(c.id);
    for (const id of c.needs ?? []) {
      const dep = withFile.find((d) => d.id === id);
      if (!dep) throw new Error(`chapter ${c.id} needs ${id}, which has no tour`);
      visit(dep);
    }
  };
  asked.forEach(visit);
  const files = withFile.filter((c) => chosen.has(c.id));
  return {
    files: files.map((c) => c.file as string),
    added: files.filter((c) => c !== first && !asked.includes(c)).map((c) => c.file as string),
  };
}

export type ItemKind = "route" | "section" | "tab" | "wizard-step" | "screen" | "dialog" | "upload" | "action" | "keyboard" | "state" | "platform";

export interface Item {
  /** Stable id used by `covers` in the tours. Routes, sections, admin tabs and
   *  plan steps use the ids check:manual derives from the code:
   *  `route:/projects`, `section:plan`, `admin:ai`, `wizard:schedule`. */
  id: string;
  chapter: ChapterId;
  kind: ItemKind;
  label: string;
  /** Not covered yet, with the reason (E5, needs data the tours cannot make…). */
  pending?: string;
  /** Deliberately not toured, with the reason (web-only, destructive…). */
  skip?: string;
}

const I = (chapter: ChapterId, kind: ItemKind, id: string, label: string, extra: Partial<Item> = {}): Item => ({
  id,
  chapter,
  kind,
  label,
  ...extra,
});

const WEB_ONLY = "Solo existe en la versión web; los tours recorren la app de escritorio.";

export const INVENTORY: Item[] = [
  // ---- 1 · Acceso y cuenta ------------------------------------------------------
  I("acceso", "screen", "screen:login", "Pantalla «Iniciar sesión»"),
  I("acceso", "state", "state:login-error", "Error de credenciales al entrar"),
  I("acceso", "action", "action:show-password", "Mostrar u ocultar la contraseña"),
  I("acceso", "action", "action:login-language", "Idioma desde la entrada"),
  I("acceso", "screen", "screen:register", "Formulario «Crear cuenta»"),
  I("acceso", "action", "action:register", "Registrarse"),
  I("acceso", "action", "action:login", "Iniciar sesión"),
  I("acceso", "action", "action:logout", "Cerrar sesión"),
  I("acceso", "screen", "screen:user-menu", "Menú de usuario"),
  I("acceso", "action", "action:user-menu-language", "Cambiar de idioma desde el menú de usuario"),
  I("acceso", "route", "route:/profile", "Perfil"),
  I("acceso", "action", "action:profile-save", "Guardar alias y nombre del perfil"),
  I("acceso", "action", "action:profile-preferences", "Preferencias de idioma y tema en el perfil"),
  I("acceso", "state", "action:login-google", "«Continuar con Google» deshabilitado («Próximamente»)"),

  // ---- 2 · Inicio, proyectos y ajustes --------------------------------------------
  I("proyectos", "route", "route:/", "Inicio (panel)"),
  I("proyectos", "state", "state:home-empty", "Inicio sin proyectos"),
  I("proyectos", "action", "action:home-period", "Periodo del panel de Inicio"),
  I("proyectos", "action", "action:home-exit-criteria", "Criterios de salida: elegir proyecto"),
  I("proyectos", "action", "action:home-kpi", "Tarjetas KPI de Inicio"),
  I("proyectos", "state", "state:home-metrics", "Inicio con ejecuciones: tasa de éxito, ejecución por proyecto, ejecuciones diarias (RED-W6)"),
  I("proyectos", "action", "action:home-exit-filter", "Criterios de salida: filtros Todos / En riesgo / Cumplen"),
  I("proyectos", "tab", "tabs:src/app/dashboard/UpcomingTests.tsx", "Próximas pruebas: pestañas No ejecutadas / Bloqueadas / Re-test"),
  I("proyectos", "state", "state:home-metrics-error", "Inicio: las ejecuciones no se pudieron cargar («Reintentar»)", {
    skip: "Necesita que falle la lectura de métricas con el resto de la app en pie, algo que el tour aislado no provoca sin trucar la app. Lo cubren las pruebas de DashboardPage.test.tsx y loadHomeMetrics.test.ts (estado de error, «Reintentar» y la caché que se mantiene) y la revisión manual (docs/manual/REVIEW.md).",
  }),
  I("movil", "tab", "tabs:src/app/dashboard/DashboardPage.tsx", "Pestañas de Inicio (Resumen / Ejecución / Pruebas)"),
  I("proyectos", "dialog", "dialogs:src/app/layout/TopbarControls.tsx", "Búsqueda y notificaciones (avisos «próximamente»)"),
  I("proyectos", "keyboard", "keyboard:ctrl-k", "Ctrl+K abre la búsqueda"),
  I("proyectos", "action", "action:sidebar-collapse", "Contraer y expandir el menú lateral"),
  I("proyectos", "action", "action:project-switcher", "Cambiar de proyecto desde el menú lateral"),
  I("proyectos", "route", "route:/projects", "Lista de proyectos"),
  I("proyectos", "state", "state:projects-empty", "Lista de proyectos vacía"),
  I("proyectos", "action", "action:project-create", "Crear un proyecto"),
  I("proyectos", "state", "state:project-create-required", "Nombre obligatorio al crear un proyecto"),
  I("proyectos", "keyboard", "keyboard:project-create-enter", "Enter crea el proyecto"),
  I("proyectos", "action", "action:projects-search", "Buscar proyectos"),
  I("proyectos", "action", "action:projects-sort", "Ordenar la lista de proyectos"),
  I("proyectos", "action", "action:projects-row-menu", "Menú de fila de un proyecto"),
  I("proyectos", "dialog", "dialogs:src/modules/projects/ui/ExportProgressModal.tsx", "Exportar todo / exportar proyecto (ZIP) con progreso"),
  I("proyectos", "section", "section:settings", "Ajustes del proyecto"),
  I("proyectos", "action", "action:project-settings-save", "Cambiar nombre, prefijo y dígitos de los IDs"),
  I("proyectos", "dialog", "dialogs:src/modules/projects/ui/ProjectSettings.tsx", "Eliminar proyecto (confirmación escribiendo el prefijo)"),
  I("proyectos", "action", "action:custom-field-create", "Crear un campo personalizado"),
  I("proyectos", "dialog", "dialogs:src/modules/custom-fields/ui/CustomFieldDialog.tsx", "Diálogo de campo personalizado"),
  I("proyectos", "action", "action:custom-field-archive", "Archivar y restaurar un campo personalizado"),
  I("proyectos", "action", "action:custom-field-defect", "Campos personalizados de defectos (selector Casos / Defectos)"),
  I("proyectos", "dialog", "dialogs:src/modules/custom-fields/ui/CopyFieldsDialog.tsx", "Copiar campos de otro proyecto"),
  I("proyectos", "action", "action:configuration-create", "Crear una configuración"),
  I("proyectos", "dialog", "dialogs:src/modules/cycles/ui/ConfigurationDialog.tsx", "Diálogo de configuración (etiquetas de importación)"),
  I("proyectos", "keyboard", "keyboard:config-labels", "Enter o coma añaden una etiqueta de importación"),
  I("proyectos", "action", "action:configuration-archive", "Archivar una configuración"),

  // ---- 3 · Plan de pruebas ----------------------------------------------------------
  I("plan", "section", "section:plan", "Plan de pruebas (asistente)"),
  I("plan", "wizard-step", "wizard:title", "Paso 1 · Título"),
  I("plan", "wizard-step", "wizard:meta", "Paso 2 · Versión, fecha y autor"),
  I("plan", "wizard-step", "wizard:summary", "Paso 3 · Resumen"),
  I("plan", "wizard-step", "wizard:scope", "Paso 4 · Alcance"),
  I("plan", "wizard-step", "wizard:types", "Paso 5 · Tipos de prueba"),
  I("plan", "wizard-step", "wizard:methodology", "Paso 6 · Metodología"),
  I("plan", "wizard-step", "wizard:levels", "Paso 7 · Niveles de prueba"),
  I("plan", "wizard-step", "wizard:deliverables", "Paso 8 · Entregables"),
  I("plan", "wizard-step", "wizard:environment", "Paso 9 · Entorno de pruebas"),
  I("plan", "wizard-step", "wizard:tools", "Paso 10 · Herramientas y automatización"),
  I("plan", "wizard-step", "wizard:testData", "Paso 11 · Datos de prueba"),
  I("plan", "wizard-step", "wizard:defects", "Paso 12 · Gestión de defectos"),
  I("plan", "wizard-step", "wizard:roles", "Paso 13 · Roles y responsabilidades"),
  I("plan", "wizard-step", "wizard:schedule", "Paso 14 · Cronograma"),
  I("plan", "wizard-step", "wizard:risks", "Paso 15 · Riesgos y mitigación"),
  I("plan", "wizard-step", "wizard:communication", "Paso 16 · Plan de comunicación"),
  I("plan", "wizard-step", "wizard:closure", "Paso 17 · Criterios de cierre"),
  I("plan", "wizard-step", "wizard:purpose", "Paso 18 · Propósito"),
  I("plan", "wizard-step", "wizard:conclusion", "Paso 19 · Conclusión y «Antes de terminar»"),
  I("plan", "action", "action:plan-save", "Guardar el plan"),
  I("plan", "action", "action:plan-step-nav", "Navegar entre pasos (carril de pasos, Anterior/Siguiente)"),
  I("plan", "keyboard", "keyboard:schedule-calendar", "Teclado del calendario del cronograma (flechas, Enter)"),
  I("plan", "action", "action:schedule-milestone", "Añadir un hito en el cronograma"),
  I("plan", "dialog", "dialogs:src/modules/test-plan/ui/TestPlanWizard.tsx", "Salir con cambios sin guardar (confirmación)"),
  I("plan", "dialog", "dialogs:src/modules/test-plan/ui/wizard/PlanSidePanels.tsx", "Revisiones del plan y restaurar una"),
  I("plan", "action", "action:plan-export", "Exportar el plan (.pdf y .xlsx)"),
  I("plan", "upload", "upload:src/modules/test-plan/ui/TestPlanWizard.tsx", "Importar un plan desde .xlsx"),
  I("plan", "dialog", "dialogs:src/modules/test-plan/ui/wizard/StepNav.tsx", "«Pasos del plan» en pantallas estrechas"),

  // ---- 4 · Casos de prueba ------------------------------------------------------------
  I("casos", "section", "section:cases", "Lista de casos"),
  I("casos", "state", "state:cases-empty", "Lista de casos vacía"),
  I("casos", "screen", "screen:level-picker", "Elegir el tipo de escenario (Básico, Outline, Avanzado)"),
  I("casos", "action", "action:case-create-basic", "Crear un caso básico con pasos"),
  I("casos", "state", "state:case-title-required", "Título obligatorio al guardar un caso"),
  I("casos", "action", "action:case-outline", "Caso Outline con tabla de ejemplos"),
  I("casos", "action", "action:case-flows", "Caso avanzado con flujos alternos"),
  I("casos", "action", "action:case-checklist", "Caso de tipo checklist"),
  I("casos", "action", "action:case-gherkin", "Vista Gherkin y vista dividida"),
  I("casos", "tab", "views:src/modules/test-cases/ui/TestCaseEditor.tsx", "Vista del caso (Editor / Gherkin / dividida)"),
  I("casos", "action", "action:case-gherkin-copy", "Copiar el Gherkin"),
  I("casos", "action", "action:case-custom-fields", "Rellenar campos personalizados en un caso"),
  I("casos", "action", "action:case-requirement-link", "Vincular un requisito a un caso"),
  I("casos", "action", "action:case-meta", "Prioridad, estado y automatización del caso"),
  I("casos", "action", "action:case-edit", "Editar un caso existente"),
  I("casos", "action", "action:case-walk", "Recorrer los casos (anterior/siguiente)"),
  I("casos", "dialog", "dialogs:src/modules/test-cases/ui/GoToCaseDialog.tsx", "«Ir a un caso…»"),
  I("casos", "keyboard", "keyboard:ctrl-p", "Ctrl+P abre «Ir a un caso»"),
  I("casos", "action", "action:case-revisions", "Revisiones de un caso"),
  I("casos", "action", "action:case-export", "Exportar un caso (.xlsx, .pdf, .feature)"),
  I("casos", "action", "action:cases-export-features", "Exportar todos los .feature"),
  I("casos", "upload", "upload:src/modules/test-cases/ui/TestCasesPage.tsx", "Importar un caso desde .xlsx"),
  I("casos", "dialog", "dialogs:src/modules/test-cases/ui/TestCasesPage.tsx", "Informe de importación del caso .xlsx"),
  I("casos", "action", "action:cases-search", "Buscar casos"),
  I("casos", "action", "action:cases-filter", "Filtrar casos (estado, prioridad, nivel…)"),
  I("casos", "action", "action:cases-sort", "Ordenar casos por columna"),
  I("casos", "state", "state:cases-no-match", "Ningún caso coincide con los filtros"),
  I("casos", "dialog", "dialogs:src/modules/test-cases/ui/TestCaseList.tsx", "Eliminar casos seleccionados (confirmación)"),
  I("casos", "action", "action:cases-bulk", "Acciones con varios casos seleccionados"),
  I("casos", "keyboard", "keyboard:steps-reorder", "Reordenar pasos con el teclado (asa de arrastre)"),

  // ---- 5 · Trazabilidad ----------------------------------------------------------------
  I("trazabilidad", "section", "section:traceability", "Trazabilidad"),
  I("trazabilidad", "state", "state:requirements-empty", "Sin requisitos todavía"),
  I("trazabilidad", "dialog", "dialogs:src/modules/traceability/ui/RequirementFormModal.tsx", "Nuevo / editar requisito"),
  I("trazabilidad", "action", "action:requirement-edit", "Editar un requisito"),
  I("trazabilidad", "upload", "upload:src/modules/traceability/ui/TraceabilityPage.tsx", "Importar requisitos desde CSV"),
  I("trazabilidad", "dialog", "dialogs:src/modules/traceability/ui/RequirementImportModal.tsx", "Vista previa de la importación CSV"),
  I("trazabilidad", "dialog", "dialogs:src/modules/traceability/ui/TraceabilityPage.tsx", "Eliminar un requisito (confirmación)"),
  I("trazabilidad", "screen", "screen:matrix", "Matriz de trazabilidad"),
  I("trazabilidad", "action", "action:matrix-gaps", "Mostrar solo huecos"),
  I("trazabilidad", "action", "action:matrix-export", "Exportar la matriz (.xlsx)"),
  I("trazabilidad", "dialog", "dialogs:src/modules/traceability/ui/MigrateTraceabilityModal.tsx", "Migrar referencias escritas a mano a vínculos"),
  I("trazabilidad", "action", "action:requirement-risk", "Riesgo del requisito (probabilidad × impacto)"),
  I("trazabilidad", "action", "action:matrix-sort", "Ordenar la matriz por riesgo o por ID"),
  I("trazabilidad", "action", "action:matrix-filters", "Filtrar los resultados de la matriz (ciclo, configuración, build, entorno)"),
  I("trazabilidad", "action", "action:matrix-run-link", "Último resultado en la matriz: abrir su run"),

  // ---- 6 · Planificador ----------------------------------------------------------------
  I("planificador", "section", "section:planner", "Planificador (tablero)"),
  I("planificador", "action", "action:card-create", "Crear una tarjeta"),
  I("planificador", "upload", "upload:src/modules/planner/ui/CardEditor.tsx", "Adjuntar un archivo a una tarjeta"),
  I("planificador", "dialog", "dialogs:src/modules/planner/ui/CardEditor.tsx", "Aviso de archivo demasiado grande"),
  I("planificador", "action", "action:card-move", "Mover una tarjeta de columna (teclado)"),
  I("planificador", "action", "action:planner-filter", "Filtrar y buscar tarjetas"),
  I("planificador", "dialog", "dialogs:src/modules/planner/ui/PlannerBoard.tsx", "Eliminar una tarjeta (confirmación)"),

  // ---- 7 · Ciclos y configuraciones ------------------------------------------------------
  I("ciclos", "section", "section:cycles", "Ciclos de prueba"),
  I("ciclos", "state", "state:cycles-empty", "Sin ciclos todavía"),
  I("ciclos", "dialog", "dialogs:src/modules/cycles/ui/CycleDialog.tsx", "Nuevo / editar ciclo"),
  I("ciclos", "dialog", "dialogs:src/modules/cycles/ui/ItemDialogs.tsx", "Añadir casos y añadir por filtro"),
  I("ciclos", "action", "action:cycle-assignee", "Asignar un elemento del ciclo"),
  I("ciclos", "action", "action:cycle-item-menu", "Subir, bajar y quitar elementos del ciclo"),
  I("ciclos", "dialog", "dialogs:src/modules/cycles/ui/ExecuteDialog.tsx", "Ejecutar un ciclo (crear runs)"),
  I("ciclos", "dialog", "dialogs:src/modules/cycles/ui/CycleDetail.tsx", "Clonar y eliminar un ciclo (confirmación)"),
  I("ciclos", "action", "action:cycles-filter", "Filtrar ciclos por estado"),
  I("ciclos", "tab", "tabs:src/modules/cycles/ui/CycleDetail.tsx", "Pestañas del ciclo (Elementos / Runs)"),
  I("ciclos", "action", "action:cycle-report", "Informe de estado de un ciclo"),

  // ---- 8 · Ejecuciones ------------------------------------------------------------------
  I("ejecuciones", "section", "section:runs", "Ejecuciones (lista de runs)"),
  I("ejecuciones", "state", "state:runs-empty", "Sin runs todavía"),
  I("ejecuciones", "dialog", "dialogs:src/modules/runs/ui/ImportReportDialog.tsx", "Importar un informe de resultados"),
  I("ejecuciones", "upload", "upload:src/modules/runs/ui/ImportReportDialog.tsx", "Elegir el informe (y la carpeta de adjuntos)"),
  I("ejecuciones", "action", "action:runs-filter", "Filtrar runs por origen"),
  I("ejecuciones", "screen", "screen:unlinked-tray", "Bandeja «Sin vincular»"),
  I("ejecuciones", "tab", "tabs:src/modules/runs/ui/RunsPage.tsx", "Pestañas de Ejecuciones (Runs / Sin vincular)"),
  I("ejecuciones", "dialog", "dialogs:src/modules/runs/ui/LinkCaseDialog.tsx", "Vincular un test a un caso"),
  I("ejecuciones", "action", "action:tray-unlink", "Desvincular un test"),
  I("ejecuciones", "action", "action:tray-filter", "Filtrar la bandeja"),
  I("ejecuciones", "action", "action:import-attachments-folder", "Carpeta de adjuntos del informe"),
  I("ejecuciones", "action", "action:import-into-cycle", "Importar un informe en un ciclo"),
  I("ejecuciones", "dialog", "dialogs:src/modules/runs/report/StatusReportDialog.tsx", "Informe de estado (ISO 29119-3): alcance, periodo, resumen y recomendaciones"),
  I("ejecuciones", "action", "action:report-export-xlsx", "Exportar el informe de estado (.xlsx)"),
  I("ejecuciones", "action", "action:report-export-pdf", "Exportar el informe de estado (PDF)"),

  // ---- 9 · Defectos ----------------------------------------------------------------------
  I("defectos", "section", "section:defects", "Defectos (lista)"),
  I("defectos", "state", "state:defects-empty", "Sin defectos todavía"),
  I("defectos", "action", "action:defect-create", "Crear un defecto"),
  I("defectos", "state", "state:defect-title-required", "Título obligatorio en un defecto"),
  I("defectos", "upload", "upload:src/modules/defects/ui/DefectEditor.tsx", "Adjuntar evidencias a un defecto"),
  I("defectos", "action", "action:defect-links", "Vincular un defecto a casos y requisitos"),
  I("defectos", "action", "action:defect-custom-fields", "Rellenar campos personalizados en un defecto"),
  I("defectos", "dialog", "dialogs:src/modules/defects/ui/ResultPickerDialog.tsx", "Crear un defecto desde un resultado fallido"),
  I("defectos", "screen", "screen:defect-board", "Tablero de defectos"),
  I("defectos", "tab", "views:src/modules/defects/ui/DefectsPage.tsx", "Vista de defectos (Lista / Tablero)"),
  I("defectos", "action", "action:defect-move", "Mover un defecto de estado en el tablero"),
  I("defectos", "dialog", "dialogs:src/modules/defects/ui/TransitionDialog.tsx", "Cerrar o rechazar un defecto (resolución)"),
  I("defectos", "action", "action:defects-filter", "Filtrar y buscar defectos"),
  I("defectos", "dialog", "dialogs:src/modules/defects/ui/DefectsPage.tsx", "Eliminar un defecto (confirmación)"),

  // ---- 10 · Administración --------------------------------------------------------------
  I("administracion", "route", "route:/admin", "Administración"),
  I("administracion", "tab", "admin:ai", "Motor de IA"),
  I("administracion", "tab", "tabs:src/modules/admin/ui/AdminTabs.tsx", "Pestañas de Administración"),
  I("administracion", "dialog", "dialogs:src/modules/ai/ui/AiEngineTab.tsx", "Descartar o reemplazar la clave de IA (confirmaciones)"),
  I("administracion", "state", "state:ollama-offline", "Ollama no detectado (tarjeta del motor local)"),
  I("administracion", "action", "action:ai-ollama", "Descargar y usar un modelo de Ollama", {
    skip: "Necesita Ollama instalado y en marcha en el equipo, y descargar un modelo de varios GB: un servicio externo que el tour aislado no instala. Se recorre el estado «No detectado»; la descarga y el uso local se revisan a mano (docs/manual/REVIEW.md, «Fuera de los tours»).",
  }),
  I("administracion", "tab", "admin:templates", "Plantillas"),
  I("administracion", "action", "action:template-download", "Descargar una plantilla (.xlsx)"),
  I("administracion", "upload", "upload:src/modules/templates/ui/TemplatesTab.tsx", "Importar una plantilla"),
  I("administracion", "dialog", "dialogs:src/modules/templates/ui/TemplateFormModal.tsx", "Datos de la plantilla importada / editar"),
  I("administracion", "dialog", "dialogs:src/modules/templates/ui/TemplatesTab.tsx", "Eliminar una plantilla (confirmación)"),
  I("administracion", "tab", "admin:general", "General (tema, idioma, fondo, carpeta de descarga)"),
  I("administracion", "upload", "upload:src/modules/admin/ui/tabs/GeneralTab.tsx", "Imagen de fondo"),
  I("administracion", "dialog", "dialogs:src/modules/admin/ui/AdminPage.tsx", "Cambiar de pestaña con cambios sin guardar"),
  I("administracion", "action", "action:download-folder", "Elegir carpeta de descarga / «Usar Descargas»", {
    skip: "«Elegir carpeta…» abre el selector de carpetas nativo de Windows (rfd, desde Rust), fuera de la WebView que WebDriver maneja; y «Usar Descargas» apuntaría las exportaciones a la carpeta real del usuario, que los tours nunca tocan. El campo se muestra en la captura de «General»; la lógica la cubren los tests de Rust de downloads.rs y la revisión manual (docs/manual/REVIEW.md, «Fuera de los tours»).",
  }),
  I("administracion", "tab", "admin:sync", "Sincronización"),
  I("administracion", "action", "action:sync-now", "Sincronizar ahora"),
  I("administracion", "dialog", "dialogs:src/modules/sync-offline/ui/ConflictPanel.tsx", "Conflictos de sincronización (con un segundo equipo simulado por la API del tour)"),
  I("administracion", "dialog", "dialogs:src/modules/sync-offline/ui/LegacyUnsentNotice.tsx", "Aviso de cambios antiguos sin enviar", {
    skip: `${WEB_ONLY} Lo cubren sus pruebas unitarias (Vitest) y la revisión manual de la versión web (docs/manual/REVIEW.md).`,
  }),
  I("administracion", "tab", "admin:security", "Seguridad (clave de recuperación)"),
  I("administracion", "dialog", "dialogs:src/modules/profile/ui/RecoveryKeySection.tsx", "Mostrar la clave de recuperación"),
  I("administracion", "tab", "admin:diagnostics", "Diagnóstico"),
  I("administracion", "action", "action:diagnostics-export", "Exportar diagnóstico"),


  // ---- 11 · Asistente de IA ---------------------------------------------------------------
  I("ia", "action", "ai:configure", "Configurar el proveedor y la clave de IA"),
  I("ia", "action", "ai:test-connection", "Probar la conexión con la IA"),
  I("ia", "action", "ai:assist-field", "«Asistir con IA» en un campo del plan"),
  I("ia", "action", "ai:suggest-risks", "Sugerir riesgos con IA"),
  I("ia", "dialog", "dialogs:src/modules/traceability/ui/GenerateCasesModal.tsx", "Generar casos desde un requisito con IA"),
  I("ia", "dialog", "dialogs:src/modules/test-cases/ui/SuggestTestsModal.tsx", "Sugerir casos con IA"),
  I("ia", "dialog", "dialogs:src/modules/traceability/ui/ProjectRequirementsModal.tsx", "Requisitos desde un proyecto con IA (IA-17)", {
    skip: "«Elegir carpeta…» abre el selector de carpetas nativo de Windows (rfd, desde Rust), fuera de la WebView que WebDriver maneja, y el análisis necesita una clave de IA real. Lo cubren ProjectRequirementsModal.test.tsx (inventario, aviso de envío, lotes, propuestas y aplicar), los tests de Rust de project_scan.rs y la revisión manual (docs/manual/REVIEW.md, «Fuera de los tours»).",
  }),
  I("ia", "dialog", "dialogs:src/modules/traceability/ui/RequirementProposalsReview.tsx", "Revisar las propuestas de requisitos de la IA (IA-17, IA-18)", {
    skip: "Solo se llega desde «Requisitos desde un proyecto» (selector nativo y clave de IA real, arriba) o desde las imágenes de IA-18. Lo cubren ProjectRequirementsModal.test.tsx, applyProposals.test.ts y la revisión manual (docs/manual/REVIEW.md, «Fuera de los tours»).",
  }),
  I("ia", "action", "ai:suggest-preconditions", "Sugerir y revisar las listas del caso con IA"),
  I("ia", "state", "ai:disabled-without-key", "Botones de IA deshabilitados sin configurar"),

  // ---- 12 · Móvil -------------------------------------------------------------------------
  I("movil", "platform", "platform:mobile-bottom-nav", "Barra inferior en móvil"),
  I("movil", "platform", "platform:mobile-project-pills", "Secciones del proyecto en móvil"),
  I("movil", "platform", "platform:mobile-search", "Búsqueda en móvil"),
  I("movil", "platform", "platform:mobile-filters", "Filtros en una hoja inferior"),
  I("movil", "platform", "platform:tablet-icon-strip", "Menú de iconos en pantallas medianas"),
  I("movil", "platform", "platform:desktop-only-gates", "Funciones solo de escritorio en la versión web", {
    skip: `${WEB_ONLY} Lo cubren las pruebas unitarias de cada módulo con isTauri() = false y la revisión manual de la versión web (docs/manual/REVIEW.md).`,
  }),

  // ---- 13 · Ejecución manual (E5, EJE-02) -------------------------------------------------------
  I("ejecucion-manual", "route", "route:/projects/:projectId/runs/:runId", "Pantalla de un run"),
  I("ejecucion-manual", "screen", "screen:manual-run", "Cabecera, progreso y elementos del run"),
  I("ejecucion-manual", "dialog", "dialogs:src/modules/runs/ui/CasePickerDialog.tsx", "Nuevo run manual / añadir casos"),
  I("ejecucion-manual", "action", "action:manual-run-result", "Marcar cada paso y guardar el intento"),
  I("ejecucion-manual", "keyboard", "keyboard:exec-keys", "Teclado del ejecutor (P/F/B/S, J/K, Ctrl+Enter)"),
  I("ejecucion-manual", "upload", "upload:src/modules/runs/ui/ExecutionPanel.tsx", "Adjuntar evidencias a un intento"),
  I("ejecucion-manual", "dialog", "dialogs:src/modules/runs/ui/ExecutionPanel.tsx", "Descartar un borrador (confirmación)"),
  I("ejecucion-manual", "dialog", "dialogs:src/modules/runs/ui/RunDetail.tsx", "Cerrar y reabrir el run"),
  I("ejecucion-manual", "action", "action:exec-paste", "Pegar una captura (Ctrl+V)"),
  I("ejecucion-manual", "dialog", "dialogs:src/modules/runs/ui/DeleteRunDialog.tsx", "Eliminar un run (confirmación, EJE-07)"),

  // ---- 14 · Evidencias (E5, DAT-03b) ---------------------------------------------------------------
  I("evidencias", "tab", "admin:evidence", "Administración › Evidencias"),
  I("evidencias", "screen", "screen:evidence-admin", "Almacén, verificación e informe"),
  I("evidencias", "dialog", "dialogs:src/modules/admin/ui/tabs/EvidenceTab.tsx", "Borrar huérfanos (confirmación)"),
  I("evidencias", "action", "action:evidence-retention", "Retención por proyecto (DAT-03c)"),
  I("evidencias", "dialog", "dialogs:src/modules/admin/ui/tabs/EvidenceRetentionSection.tsx", "Acortar la retención (confirmación)"),

  // ---- 15 · Si algo sale mal ----------------------------------------------------------------------
  I("errores", "state", "state:db-error", "Pantalla de error de la base de datos local"),
  I("errores", "state", "state:error-boundary", "Pantalla «Algo salió mal»"),
];
