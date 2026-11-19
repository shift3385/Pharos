// Manifest of the guided tours and the user manual (MAN-01).
//
// - CHAPTERS: one per area of the app, in RUN order: the tours share one app
//   session and each reads the data the earlier ones made (`needs`). The
//   manual prints them in `number` order instead (MANUAL_ORDER), the order of
//   the app's menu and of the test process (manual v2, MAN-03); a tour file
//   starts with its chapter's number. Each chapter names the routes / project
//   sections / admin tabs / plan steps it covers.
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
  | "navegacion"
  | "inicio"
  | "proyectos"
  | "plan"
  | "tablero"
  | "requisitos"
  | "casos"
  | "trazabilidad"
  | "ajustes"
  | "ciclos"
  | "defectos"
  | "ejecuciones"
  | "administracion"
  | "ia"
  | "movil"
  | "ejecucion-manual"
  | "evidencias"
  | "errores"
  | "integraciones";

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
  /** In every run, also a partial one: chapter 1 creates the account every
   *  other chapter signs in with (NC-052). */
  always?: boolean;
  /** Chapters whose data this one reads (direct ones; they run first). A
   *  partial run (`--spec`) adds them, see selectTours. Each must come earlier
   *  in CHAPTERS. */
  needs?: ChapterId[];
}

export const CHAPTERS: Chapter[] = [
  { id: "preparacion", number: 0, title: "Preparación de los datos", file: "00-preparacion.tour.ts", status: "active", inManual: false },
  // Creates the tour account on screen (NC-052): every run includes it.
  { id: "acceso", number: 1, title: "Acceso y cuenta", file: "01-acceso.tour.ts", status: "active", always: true },
  { id: "proyectos", number: 4, title: "Proyectos", file: "04-proyectos.tour.ts", status: "active" },
  { id: "ajustes", number: 14, title: "Ajustes del proyecto", file: "14-ajustes.tour.ts", status: "active", needs: ["proyectos"] },
  { id: "navegacion", number: 2, title: "La aplicación de un vistazo", file: "02-navegacion.tour.ts", status: "active", needs: ["proyectos", "ajustes"] },
  { id: "plan", number: 5, title: "Plan de pruebas", file: "05-plan.tour.ts", status: "active", needs: ["acceso", "proyectos", "ajustes"] },
  { id: "requisitos", number: 7, title: "Requisitos", file: "07-requisitos.tour.ts", status: "active", needs: ["proyectos"] },
  { id: "casos", number: 8, title: "Casos de prueba", file: "08-casos.tour.ts", status: "active", needs: ["proyectos", "ajustes", "requisitos"] },
  { id: "tablero", number: 6, title: "Tablero", file: "06-tablero.tour.ts", status: "active", needs: ["proyectos"] },
  { id: "ciclos", number: 9, title: "Ciclos de prueba", file: "09-ciclos.tour.ts", status: "active", needs: ["proyectos", "casos", "ajustes"] },
  { id: "ejecuciones", number: 10, title: "Ejecuciones e importación de resultados", file: "10-ejecuciones.tour.ts", status: "active", needs: ["casos", "ciclos"] },
  { id: "defectos", number: 12, title: "Defectos", file: "12-defectos.tour.ts", status: "active", needs: ["ejecuciones"] },
  { id: "ejecucion-manual", number: 11, title: "Ejecución manual", file: "11-ejecucion-manual.tour.ts", status: "active", needs: ["proyectos", "casos"] },
  // After the runs, the imports and the defects: the matrix shows their
  // results and defects (MAN-03).
  { id: "trazabilidad", number: 13, title: "Trazabilidad", file: "13-trazabilidad.tour.ts", status: "active", needs: ["casos", "requisitos", "defectos", "ejecucion-manual"] },
  { id: "administracion", number: 15, title: "Administración", file: "15-administracion.tour.ts", status: "active", needs: ["plan", "trazabilidad"] },
  { id: "ia", number: 17, title: "Asistente de IA", file: "17-ia.tour.ts", status: "active", needs: ["plan", "trazabilidad"] },
  { id: "movil", number: 18, title: "Pantallas estrechas y móvil", file: "18-movil.tour.ts", status: "active", needs: ["plan", "casos"] },
  { id: "inicio", number: 3, title: "Inicio", file: "03-inicio.tour.ts", status: "active", needs: ["plan", "defectos", "ejecucion-manual"] },
  { id: "evidencias", number: 16, title: "Evidencias", file: "16-evidencias.tour.ts", status: "active" },
  { id: "errores", number: 19, title: "Si algo sale mal", file: "19-errores.tour.ts", status: "active" },
  // INT-02/INT-03/INT-04 (ADR-0052): tokens, Conectar CI, webhooks.
  { id: "integraciones", number: 20, title: "Integraciones", file: "20-integraciones.tour.ts", status: "active" },
];

/** The chapters as the manual prints them (by `number`), without the preparation. */
export const MANUAL_ORDER: Chapter[] = CHAPTERS.filter((c) => c.inManual !== false).sort((x, y) => x.number - y.number);

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
  const chosen = new Set<ChapterId>([first.id, ...withFile.filter((c) => c.always).map((c) => c.id)]);
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

const WORKSPACES_PENDING =
  "necesita una segunda cuenta y un servidor con workspaces: lo cubre la validación de 0.5.0 con dos personas (SYNC-07); el flujo lo prueban los tests de la UI y del servidor";

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
  I("acceso", "platform", "platform:mobile-login", "La entrada en una pantalla estrecha (hoja inferior)"),
  // Account recovery (SEC-08, SEC-09 by email; ADR-0045).
  I("acceso", "screen", "screen:signup-recovery-codes", "Códigos de recuperación al crear la cuenta"),
  I("acceso", "screen", "screen:recover", "«¿Olvidaste tu contraseña?»: «Recupera el acceso»"),
  I("acceso", "tab", "tabs:src/modules/auth/ui/AccountRecovery.tsx", "Pestañas de «Recupera el acceso» (Con un código / Por correo)"),
  I("acceso", "state", "state:email-reset-off", "Servidor sin correo: el enlace por correo no está disponible"),
  I("acceso", "screen", "screen:reset-link", "Pegar el enlace del correo en la app de escritorio"),
  I("acceso", "action", "action:recover-with-code", "Cambiar la contraseña con un código de recuperación", {
    skip: "Cambiaría la contraseña y cerraría la sesión de la cuenta que usan todos los capítulos siguientes. Lo cubren server/tests/account.test.ts (el código se gasta, se cierran las sesiones, queda en auditoría) y src/modules/auth/recovery.test.tsx.",
  }),
  I("acceso", "screen", "screen:reset-page", "Página «Elige una contraseña nueva» del enlace del correo", {
    skip: "Necesita un servidor con SMTP y abrir el enlace de un correo real; el tour usa una API sin correo (el valor por defecto). Lo cubren server/tests/account.test.ts con un buzón en memoria, src/modules/auth/recovery.test.tsx y la revisión manual de la versión web (docs/manual/REVIEW.md).",
  }),
  I("acceso", "screen", "screen:account-security", "«Mi perfil» › Seguridad de la cuenta"),
  I("acceso", "action", "action:change-password", "Cambiar la contraseña desde el perfil", {
    skip: "Cerraría las demás sesiones y cambiaría la contraseña que usan los capítulos siguientes. Lo cubren server/tests/account.test.ts y src/modules/profile/accountSecurity.test.tsx.",
  }),
  I("acceso", "action", "action:regenerate-recovery-codes", "Generar códigos de recuperación nuevos"),
  I("acceso", "dialog", "dialogs:src/modules/profile/ui/AccountSecuritySection.tsx", "Generar códigos nuevos: contraseña y códigos mostrados una vez"),
  I("acceso", "state", "state:session-expired", "Sesión caducada («Tu sesión ha caducado…»)", {
    skip: "Necesita que el servidor rechace la renovación de la sesión de la app, algo que el tour no provoca sin trucar la app. Lo cubren AuthProvider.test.tsx y sessionRenewal.test.ts; el capítulo lo explica en «Si algo no sale».",
  }),
  I("acceso", "state", "state:offline", "Sin conexión al abrir la app (pastilla «Sin conexión»)", {
    skip: "Necesita parar la API del tour a mitad de la sesión, y las demás pruebas guiadas dependen de ella. Lo cubren las pruebas de AuthProvider.test.tsx; el capítulo lo explica en «Si algo no sale».",
  }),

  // ---- 2 · La aplicación de un vistazo (manual v2) ---------------------------------
  I("navegacion", "screen", "screen:shell", "Estructura de la pantalla: menú lateral, barra superior y contenido"),
  I("navegacion", "action", "action:project-nav", "Secciones del proyecto en el orden del proceso de prueba (UX-21)"),
  I("navegacion", "action", "action:project-switcher", "Cambiar de proyecto desde el menú lateral"),
  I("navegacion", "action", "action:breadcrumbs", "Migas de pan de la barra superior"),
  I("navegacion", "dialog", "dialogs:src/app/layout/TopbarControls.tsx", "Búsqueda, panel de notificaciones y su hoja en el móvil"),
  I("navegacion", "keyboard", "keyboard:ctrl-k", "Ctrl+K abre la búsqueda"),
  I("navegacion", "action", "action:theme-toggle", "Cambio rápido de tema claro u oscuro"),
  I("navegacion", "action", "action:sync-indicator", "Indicador de sincronización y «Sincronizar ahora»"),
  I("navegacion", "action", "action:sidebar-collapse", "Contraer y expandir el menú lateral con la pestaña del borde (UX-26)"),
  I("navegacion", "dialog", "dialogs:src/app/layout/AboutDialog.tsx", "«Acerca de Pharos»: versión, compilación, plataforma, tecnologías y responsables (UX-26)"),
  I("navegacion", "platform", "platform:tablet-icon-strip", "Menú de iconos en pantallas medianas"),

  I("inicio", "screen", "screen:home-exec", "Inicio: ejecución por proyecto"),
  I("inicio", "action", "action:home-daily-table", "Inicio: «Ver los datos» de las ejecuciones diarias"),

  // ---- 2 · Inicio, proyectos y ajustes --------------------------------------------
  I("inicio", "route", "route:/", "Inicio (panel)"),
  I("inicio", "state", "state:home-empty", "Inicio sin proyectos"),
  I("inicio", "action", "action:home-period", "Periodo del panel de Inicio"),
  I("inicio", "action", "action:home-compare", "Comparar con el periodo anterior: diferencias en la tasa de éxito y en las ejecuciones diarias (RED-W4)"),
  I("inicio", "action", "action:home-exit-criteria", "Criterios de salida: elegir proyecto"),
  I("inicio", "action", "action:home-kpi", "Tarjetas KPI de Inicio"),
  I("inicio", "state", "state:home-metrics", "Inicio con ejecuciones: tasa de éxito, ejecución por proyecto, ejecuciones diarias (RED-W6)"),
  I("inicio", "action", "action:home-exit-filter", "Criterios de salida: filtros Todos / En riesgo / Cumplen"),
  I("inicio", "action", "action:home-upcoming-filter", "Próximas pruebas: selector No ejecutadas / Bloqueadas / Por confirmar (UX-32, UX-34)"),
  I("inicio", "action", "action:home-daily-tooltip", "Ejecuciones diarias: línea y burbuja del día con el ratón, el tacto o el teclado (UX-32)"),
  I("inicio", "action", "action:home-daily-legend", "Ejecuciones diarias: la leyenda muestra u oculta cada estado (UX-32)"),
  I("inicio", "state", "state:home-metrics-error", "Inicio: las ejecuciones no se pudieron cargar («Reintentar»)", {
    skip: "Necesita que falle la lectura de métricas con el resto de la app en pie, algo que el tour aislado no provoca sin trucar la app. Lo cubren las pruebas de DashboardPage.test.tsx y loadHomeMetrics.test.ts (estado de error, «Reintentar» y la caché que se mantiene) y la revisión manual (docs/manual/REVIEW.md).",
  }),
  I("inicio", "tab", "tabs:src/app/dashboard/DashboardPage.tsx", "Pestañas de Inicio (Resumen / Ejecución / Pruebas)"),
  I("inicio", "platform", "platform:home-no-scroll", "Inicio sin desplazamiento de página ni de panel en el escritorio (UX-27, UX-28)"),
  I("inicio", "action", "action:home-customize", "Personalizar Inicio: mover y cambiar el tamaño de los gadgets (UX-27)"),
  I("inicio", "keyboard", "keyboard:home-board", "Personalizar Inicio con el teclado: flechas y Mayús + flechas (UX-27)"),
  I("inicio", "action", "action:home-gadget-hide", "Ocultar un gadget y volver a mostrarlo desde «Gadgets ocultos» (UX-27)"),
  I("inicio", "action", "action:home-board-reset", "Restablecer la distribución de Inicio, con confirmación (UX-27)"),
  I("inicio", "action", "action:home-gadget-help", "Ayuda «?» del título de cada panel de Inicio (UX-28)"),
  I("inicio", "action", "action:home-trend", "Tendencia de ciclos: una métrica en los últimos ciclos, su objetivo y el aviso al empeorar (DOC-06)"),
  I("inicio", "dialog", "dialogs:src/app/dashboard/DailyExecutionsChart.tsx", "Inicio: «Ver los datos» de las ejecuciones diarias en una ventana (UX-28)"),
  I("inicio", "dialog", "dialogs:src/app/dashboard/DashboardPage.tsx", "Inicio: confirmar «Restablecer» o descartar los cambios al personalizar (UX-27)"),
  I("proyectos", "route", "route:/projects", "Lista de proyectos"),
  I("proyectos", "state", "state:projects-empty", "Lista de proyectos vacía"),
  I("proyectos", "action", "action:project-create", "Crear un proyecto (se abre en su Plan, UX-22)"),
  I("proyectos", "screen", "screen:project-header", "Cabecera del proyecto (prefijo, plan, casos, requisitos, cierre)"),
  I("proyectos", "action", "action:project-open", "Abrir un proyecto existente (se abre en su Tablero, UX-22)"),
  I("proyectos", "action", "action:projects-export-all", "Exportar todos los proyectos (ZIP)"),
  I("proyectos", "state", "state:project-create-required", "Nombre obligatorio al crear un proyecto"),
  I("proyectos", "keyboard", "keyboard:project-create-enter", "Enter crea el proyecto"),
  I("proyectos", "dialog", "dialogs:src/modules/projects/ui/NewProjectWizard.tsx", "Asistente «Nuevo proyecto»: cómo empezar, qué copiar y datos generales (UX-29)"),
  I("proyectos", "action", "action:project-create-copy-settings", "Crear a partir de otro proyecto: qué copiar, con su valor (UX-25, UX-29)"),
  I("proyectos", "action", "action:projects-search", "Buscar proyectos"),
  I("proyectos", "action", "action:projects-sort", "Ordenar la lista de proyectos"),
  I("proyectos", "action", "action:projects-row-menu", "Menú de fila de un proyecto"),
  I("proyectos", "dialog", "dialogs:src/modules/projects/ui/ExportProgressModal.tsx", "Exportar todo / exportar proyecto (ZIP) con progreso"),
  I("ajustes", "section", "section:settings", "Ajustes del proyecto"),
  I("ajustes", "action", "action:project-settings-save", "Cambiar nombre, prefijo y dígitos de los IDs"),
  I("ajustes", "action", "action:plan-export-history", "Historial en el plan exportado (vigente o con revisiones)"),
  I("ajustes", "action", "action:risk-bands", "Bandas de riesgo del proyecto y su mapa 5×5 (TRZ-04)"),
  I("proyectos", "dialog", "dialogs:src/modules/projects/ui/ProjectSettings.tsx", "Eliminar proyecto (confirmación escribiendo el prefijo)"),
  I("ajustes", "action", "action:custom-field-create", "Crear un campo personalizado"),
  I("ajustes", "dialog", "dialogs:src/modules/custom-fields/ui/CustomFieldDialog.tsx", "Diálogo de campo personalizado"),
  I("ajustes", "action", "action:custom-field-archive", "Archivar y restaurar un campo personalizado"),
  I("ajustes", "action", "action:custom-field-defect", "Campos personalizados de defectos (selector Casos / Defectos)"),
  I("ajustes", "dialog", "dialogs:src/modules/custom-fields/ui/CopyFieldsDialog.tsx", "Copiar campos de otro proyecto"),
  I("ajustes", "action", "action:configuration-create", "Crear una configuración"),
  I("ajustes", "dialog", "dialogs:src/modules/cycles/ui/ConfigurationDialog.tsx", "Diálogo de configuración (etiquetas de importación)"),
  I("ajustes", "keyboard", "keyboard:config-labels", "Enter o coma añaden una etiqueta de importación"),
  I("ajustes", "action", "action:configuration-archive", "Archivar una configuración"),

  // ---- 3 · Plan de pruebas ----------------------------------------------------------
  I("plan", "section", "section:plan", "Plan de pruebas (asistente)"),
  I("plan", "wizard-step", "wizard:identification", "Paso 1 · Identificación del plan (título, estado, ID de documento, versión, fecha y autor)"),
  I("plan", "wizard-step", "wizard:summary", "Paso 2 · Resumen"),
  I("plan", "wizard-step", "wizard:scope", "Paso 3 · Alcance"),
  I("plan", "wizard-step", "wizard:assumptions", "Paso 4 · Supuestos y restricciones (PLN-06)"),
  I("plan", "wizard-step", "wizard:levelsTypes", "Paso 5 · Niveles y tipos de prueba"),
  I("plan", "wizard-step", "wizard:techniques", "Paso 6 · Técnicas de prueba (PLN-06)"),
  I("plan", "wizard-step", "wizard:methodology", "Paso 7 · Metodología"),
  I("plan", "wizard-step", "wizard:deliverables", "Paso 8 · Entregables"),
  I("plan", "wizard-step", "wizard:environment", "Paso 9 · Entorno de pruebas"),
  I("plan", "wizard-step", "wizard:tools", "Paso 10 · Herramientas y automatización"),
  I("plan", "wizard-step", "wizard:testData", "Paso 11 · Datos de prueba"),
  I("plan", "wizard-step", "wizard:defects", "Paso 12 · Gestión de defectos"),
  I("plan", "wizard-step", "wizard:roles", "Paso 13 · Roles, independencia y formación"),
  I("plan", "wizard-step", "wizard:estimation", "Paso 14 · Estimación y presupuesto (PLN-06)"),
  I("plan", "wizard-step", "wizard:schedule", "Paso 15 · Cronograma"),
  I("plan", "wizard-step", "wizard:risks", "Paso 16 · Riesgos y mitigación"),
  I("plan", "wizard-step", "wizard:communication", "Paso 17 · Plan de comunicación"),
  I("plan", "wizard-step", "wizard:entry", "Paso 18 · Entrada, suspensión y reanudación (PLN-06)"),
  I("plan", "wizard-step", "wizard:metrics", "Paso 19 · Métricas y objetivos medibles (PLN-06)"),
  I("plan", "wizard-step", "wizard:closure", "Paso 20 · Criterios de cierre"),
  I("plan", "wizard-step", "wizard:purpose", "Paso 21 · Propósito"),
  I("plan", "wizard-step", "wizard:conclusion", "Paso 22 · Conclusión y «Antes de terminar»"),
  I("plan", "action", "action:pharos-select", "Listas desplegables de Pharos: ✓ en la elegida, teclado y hoja inferior en el móvil (UX-30)"),
  I("plan", "action", "action:date-picker", "Selector de fechas de Pharos: dd/mm/aaaa, calendario, teclado, Hoy y Borrar, hoja en el móvil (UX-36)"),
  I("plan", "action", "action:plan-save", "Guardar el plan"),
  I("plan", "action", "action:plan-approve", "Enviar el plan a revisión y aprobarlo (botones y confirmación, PLN-07, PLN-08)"),
  I("plan", "action", "action:plan-approved", "Plan aprobado: quién y cuándo en «Estado del plan» (PLN-07)"),
  I("plan", "action", "action:plan-step-nav", "Navegar entre pasos (carril de pasos, Anterior/Siguiente)"),
  I("plan", "keyboard", "keyboard:schedule-calendar", "Teclado del calendario del cronograma (flechas, Enter)"),
  I("plan", "action", "action:schedule-milestone", "Añadir un hito en el cronograma"),
  I("plan", "dialog", "dialogs:src/modules/test-plan/ui/TestPlanWizard.tsx", "Salir con cambios sin guardar (confirmación)"),
  I("plan", "dialog", "dialogs:src/modules/test-plan/ui/wizard/PlanSidePanels.tsx", "Revisiones del plan y restaurar una"),
  // PLN-08 (ADR-0049): the plan's review flow, as a case's.
  I("plan", "dialog", "dialogs:src/modules/test-plan/ui/wizard/PlanReviewControls.tsx", "Enviar el plan a revisión, aprobar, pedir cambios, marcar obsoleto y reactivar (confirmaciones)"),
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
  I("casos", "action", "action:case-meta", "Prioridad, tipo y automatización del caso"),
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
  I("casos", "platform", "platform:mobile-gherkin", "El Gherkin en el móvil (lectura, «Editar» a pantalla completa con barra de teclas)"),
  I("casos", "dialog", "dialogs:src/modules/test-cases/ui/TestCaseEditor.tsx", "Restaurar una revisión de un caso (confirmación)"),
  // CAS-02 (ADR-0047): the review flow and suite baselines.
  I("casos", "dialog", "dialogs:src/modules/test-cases/ui/CaseReviewPanel.tsx", "Enviar a revisión, aprobar, pedir cambios, marcar obsoleto y reactivar (confirmaciones)"),
  I("casos", "action", "action:case-review-send", "Enviar un caso a revisión con una nota"),
  I("casos", "action", "action:case-review-approve", "Aprobar un caso: quién, cuándo y aprobación propia"),
  I("casos", "action", "action:case-review-return", "Pedir cambios en un caso con un comentario (sigue en revisión)"),
  I("casos", "action", "action:case-obsolete", "Marcar un caso como obsoleto y reactivarlo"),
  I("casos", "dialog", "dialogs:src/modules/test-cases/ui/BaselinesView.tsx", "Nueva baseline de suite"),
  I("casos", "action", "action:case-baseline-create", "Congelar una baseline (todos, filtro o selección; solo aprobados)"),
  I("casos", "action", "action:case-baseline-compare", "Comparar una baseline con el estado actual o con otra"),

  // CAS-01 (ADR-0055): the library section and its use in a case, toured at
  // the end of 08-casos.tour.ts (prose: fuentes/casos.md).
  I("casos", "section", "section:library", "Biblioteca del proyecto: pasos compartidos y datasets"),
  I("casos", "tab", "tabs:src/modules/library/ui/LibraryPage.tsx", "Pestañas de la Biblioteca (Pasos compartidos / Datasets)"),
  I("casos", "tab", "tabs:src/modules/library/ui/ItemEditorFrame.tsx", "Pestañas de un elemento (Pasos o Datos / Usado en / Versiones)"),
  I("casos", "dialog", "dialogs:src/modules/library/ui/useItemEditor.tsx", "Eliminar un elemento de la biblioteca y descartar cambios"),
  I("casos", "dialog", "dialogs:src/modules/library/ui/ImpactDialog.tsx", "Aviso de impacto antes de guardar un cambio"),
  I("casos", "dialog", "dialogs:src/modules/library/ui/DatasetEditor.tsx", "Reemplazar los datos de un dataset al importar"),
  I("casos", "upload", "upload:src/modules/library/ui/DatasetEditor.tsx", "Importar un dataset desde CSV o xlsx"),
  I("casos", "dialog", "dialogs:src/modules/library/ui/case/InsertSharedStepDialog.tsx", "Insertar un paso compartido en un caso y editar sus argumentos"),
  I("casos", "dialog", "dialogs:src/modules/library/ui/case/DatasetDialogs.tsx", "Vincular un dataset al caso y elegir sus filas"),

  // ---- 5 · Requisitos y trazabilidad (UX-21: two sections) -----------------------------
  I("requisitos", "section", "section:requirements", "Requisitos"),
  I("trazabilidad", "section", "section:traceability", "Trazabilidad (matriz)"),
  I("requisitos", "state", "state:requirements-empty", "Sin requisitos todavía"),
  I("requisitos", "dialog", "dialogs:src/modules/traceability/ui/RequirementFormModal.tsx", "Nuevo / editar requisito"),
  I("requisitos", "action", "action:requirement-edit", "Editar un requisito"),
  I("requisitos", "upload", "upload:src/modules/traceability/ui/TraceabilityPage.tsx", "Importar requisitos desde CSV"),
  I("requisitos", "dialog", "dialogs:src/modules/traceability/ui/RequirementImportModal.tsx", "Vista previa de la importación CSV"),
  I("requisitos", "dialog", "dialogs:src/modules/traceability/ui/TraceabilityPage.tsx", "Eliminar un requisito (confirmación)"),
  I("trazabilidad", "screen", "screen:matrix", "Matriz de trazabilidad"),
  I("trazabilidad", "action", "action:matrix-gaps", "Mostrar solo huecos"),
  I("trazabilidad", "action", "action:matrix-export", "Exportar la matriz (.xlsx)"),
  I("trazabilidad", "dialog", "dialogs:src/modules/traceability/ui/MigrateTraceabilityModal.tsx", "Migrar referencias escritas a mano a vínculos"),
  I("requisitos", "action", "action:requirement-risk", "Riesgo del requisito (probabilidad × impacto)"),
  I("requisitos", "action", "action:requirements-import-menu", "Menú «Importar»: CSV, desde un proyecto y desde diseños (IA)"),
  I("requisitos", "platform", "platform:mobile-requirements", "Los requisitos en el móvil (tarjetas)"),
  I("trazabilidad", "action", "action:matrix-sort", "Ordenar la matriz por riesgo o por ID"),
  I("trazabilidad", "action", "action:matrix-weighted", "Cobertura ponderada por riesgo y cobertura por banda (TRZ-04)"),
  I("trazabilidad", "action", "action:matrix-filters", "Filtrar los resultados de la matriz (ciclo, configuración, build, entorno)"),
  I("trazabilidad", "action", "action:matrix-run-link", "Último resultado en la matriz: abrir su run"),

  // ---- 6 · Tablero -----------------------------------------------------------------------
  I("tablero", "section", "section:planner", "Tablero (kanban)"),
  I("tablero", "action", "action:card-create", "Crear una tarjeta"),
  I("tablero", "upload", "upload:src/modules/planner/ui/CardEditor.tsx", "Adjuntar un archivo a una tarjeta"),
  I("tablero", "dialog", "dialogs:src/modules/planner/ui/CardEditor.tsx", "Aviso de archivo demasiado grande y salir con cambios sin guardar"),
  I("tablero", "action", "action:card-move", "Mover una tarjeta de columna (teclado)"),
  I("tablero", "action", "action:planner-filter", "Filtrar y buscar tarjetas"),
  I("tablero", "dialog", "dialogs:src/modules/planner/ui/PlannerBoard.tsx", "Eliminar una tarjeta (confirmación)"),
  I("tablero", "platform", "platform:mobile-planner", "El tablero en el móvil (filtro de prioridad incluido, NC-020)"),
  I("tablero", "state", "state:planner-load-error", "El tablero no se pudo cargar («Reintentar», NC-016)", {
    skip: "Necesita que falle la lectura del tablero con el resto de la app en pie, algo que el tour no provoca sin trucar la app. Lo cubre PlannerBoard.test.tsx; el capítulo lo explica en «Si algo no sale».",
  }),

  // ---- 7 · Ciclos y configuraciones ------------------------------------------------------
  I("ciclos", "section", "section:cycles", "Ciclos de prueba"),
  I("ciclos", "state", "state:cycles-empty", "Sin ciclos todavía"),
  I("ciclos", "dialog", "dialogs:src/modules/cycles/ui/CycleDialog.tsx", "Nuevo / editar ciclo"),
  I("ciclos", "dialog", "dialogs:src/modules/cycles/ui/ItemDialogs.tsx", "Añadir casos y añadir por filtro"),
  I("ciclos", "action", "action:cycle-assignee", "Asignar un elemento del ciclo"),
  I("ciclos", "action", "action:cycle-item-menu", "Subir, bajar y quitar elementos del ciclo"),
  I("ciclos", "dialog", "dialogs:src/modules/cycles/ui/ExecuteDialog.tsx", "Ejecutar un ciclo (crear runs)"),
  I("ciclos", "dialog", "dialogs:src/modules/cycles/ui/CycleDetail.tsx", "Clonar y eliminar un ciclo, quitar un elemento (confirmación)"),
  I("ciclos", "action", "action:cycles-filter", "Filtrar ciclos por estado"),
  I("ciclos", "tab", "tabs:src/modules/cycles/ui/CycleDetail.tsx", "Pestañas del ciclo (Elementos / Runs)"),
  I("ciclos", "action", "action:cycle-report", "Informe de estado de un ciclo"),
  I("ciclos", "dialog", "dialogs:src/modules/runs/gate/CloseCycleDialog.tsx", "Cerrar un ciclo con su quality gate: justificación y veredicto (DOC-02)"),
  I("ciclos", "action", "action:cycle-verdict", "El veredicto de un ciclo cerrado y su decisión en el informe (DOC-02)"),
  I("ciclos", "dialog", "dialogs:src/modules/runs/report/completion/CompletionReportDialog.tsx", "Informe de cierre 29119-3 de un ciclo cerrado: textos, entregables y aprobación (DOC-01)"),
  I("ciclos", "platform", "platform:mobile-cycles", "Los ciclos en el móvil (tarjetas)"),
  I("ciclos", "state", "state:cycles-load-error", "Los ciclos no se pudieron cargar («Reintentar», NC-008)", {
    skip: "Necesita que falle la lectura de los ciclos con el resto de la app en pie, algo que el tour no provoca sin trucar la app. Lo cubre Cycles.test.tsx; el capítulo lo explica en «Si algo no sale».",
  }),

  // ---- 8 · Ejecuciones ------------------------------------------------------------------
  I("ejecuciones", "section", "section:runs", "Ejecuciones (lista de runs)"),
  I("ejecuciones", "state", "state:runs-empty", "Sin runs todavía"),
  I("ejecuciones", "dialog", "dialogs:src/modules/runs/ui/ImportReportDialog.tsx", "Importar un informe de resultados"),
  I("ejecuciones", "upload", "upload:src/modules/runs/ui/ImportReportDialog.tsx", "Elegir el informe (y la carpeta de adjuntos)"),
  I("ejecuciones", "action", "action:runs-filter", "Filtrar runs por origen"),
  I("ejecuciones", "screen", "screen:unlinked-tray", "Bandeja «Sin vincular»"),
  I("ejecuciones", "tab", "tabs:src/modules/runs/ui/RunsPage.tsx", "Pestañas de Ejecuciones (Runs / Sin vincular)"),
  I("ejecuciones", "tab", "tabs:src/modules/runs/ui/RunDetail.tsx", "Pestañas de un run: Casos / Hallazgos / Métricas (ING-06)"),
  I("ejecuciones", "dialog", "dialogs:src/modules/runs/ui/TriageDialog.tsx", "Triaje de un hallazgo (ING-06)"),
  I("ejecuciones", "dialog", "dialogs:src/modules/runs/ui/LinkCaseDialog.tsx", "Vincular un test a un caso"),
  I("ejecuciones", "action", "action:tray-unlink", "Desvincular un test"),
  I("ejecuciones", "action", "action:tray-filter", "Filtrar la bandeja"),
  I("ejecuciones", "action", "action:import-attachments-folder", "Carpeta de adjuntos del informe"),
  I("ejecuciones", "action", "action:import-into-cycle", "Importar un informe en un ciclo"),
  I("ejecuciones", "platform", "platform:mobile-runs", "Las ejecuciones en el móvil (tarjetas)"),
  I("ejecuciones", "dialog", "dialogs:src/modules/runs/report/StatusReportDialog.tsx", "Informe de estado (ISO 29119-3): alcance, periodo, resumen y recomendaciones"),
  I("ejecuciones", "action", "action:report-export-xlsx", "Exportar el informe de estado (.xlsx)"),
  I("ejecuciones", "action", "action:report-export-pdf", "Exportar el informe de estado (PDF)"),
  I("ejecuciones", "dialog", "dialogs:src/modules/runs/ui/UnlinkedTray.tsx", "Desvincular un test (confirmación)"),

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
  I("defectos", "dialog", "dialogs:src/modules/defects/ui/DefectEditor.tsx", "Quitar un vínculo o una evidencia de un defecto (confirmación)"),

  // ---- 10 · Administración --------------------------------------------------------------
  I("administracion", "route", "route:/admin", "Administración"),
  // Workspaces with roles (SYNC-07, ADR-0042). The tours run one account
  // against a server they start themselves; members, invitations and a
  // shared project need a second account, which the 0.5.0 validation with
  // two people and two computers covers (ROADMAP §6).
  I("administracion", "route", "route:/workspaces/members", "Miembros y roles de un workspace", { pending: WORKSPACES_PENDING }),
  I("administracion", "route", "route:/workspaces/join", "Unirse a un workspace con un código", { pending: WORKSPACES_PENDING }),
  I("integraciones", "dialog", "dialogs:src/modules/workspaces/ui/CreateWorkspaceDialog.tsx", "Crear workspace"),
  I("administracion", "dialog", "dialogs:src/modules/workspaces/ui/InviteDialog.tsx", "Invitar a un workspace (código de un solo uso)", { pending: WORKSPACES_PENDING }),
  I("integraciones", "dialog", "dialogs:src/modules/workspaces/ui/ShareProjectDialog.tsx", "Compartir un proyecto con un workspace"),
  I("administracion", "dialog", "dialogs:src/modules/workspaces/ui/WorkspaceMembersPage.tsx", "Quitar a un miembro o salir de un workspace", { pending: WORKSPACES_PENDING }),
  // INT-02 (ADR-0052): API tokens. The manual chapter «Integraciones» comes
  // with track A's A4, together with the upload and its curl examples.
  I("integraciones", "tab", "tabs:src/modules/workspaces/ui/WorkspaceMembersPage.tsx", "Pestañas del workspace (Miembros / Integraciones)"),
  I("integraciones", "dialog", "dialogs:src/modules/integrations/ui/ProjectTokensSection.tsx", "Revocar o reasignar un token de proyecto", {
    skip: "«Reasignar» solo aparece en el token de otra persona o en uno inactivo, y el manual solo muestra a su persona (NC-052); la tabla y «Revocar» salen en el capítulo 20. Lo cubren server/tests/api.tokens.test.ts y src/modules/integrations/ui/integrations.test.tsx.",
  }),
  I("integraciones", "dialog", "dialogs:src/modules/integrations/ui/TokenDialogs.tsx", "Nuevo token, token creado (una sola vez) y rotar"),
  I("integraciones", "dialog", "dialogs:src/modules/integrations/ui/PersonalTokensSection.tsx", "Revocar un token personal"),
  I("integraciones", "section", "section:connect-ci", "Conectar CI: el paso de GitHub Actions (INT-04)"),
  I("integraciones", "dialog", "dialogs:src/modules/integrations/ui/WebhooksSection.tsx", "Nuevo y editar webhook, su secreto, entregas, rotar y borrar (INT-03)"),
  I("integraciones", "dialog", "dialogs:src/modules/integrations/ui/AdminRevokeTokens.tsx", "Revocar todos los tokens de una cuenta (administrador)", {
    skip: "Necesita una segunda cuenta con tokens, y el manual solo muestra a su persona (NC-052). Lo cubren server/tests/api.tokens.test.ts y src/modules/integrations/ui/integrations.test.tsx.",
  }),
  // PLN-08 (ADR-0049): «Aprobación independiente», seen from one account.
  I("administracion", "action", "action:workspace-rules", "«Reglas»: aprobación independiente del workspace (PLN-08)"),
  I("administracion", "tab", "admin:ai", "Motor de IA"),
  I("administracion", "tab", "tabs:src/modules/admin/ui/AdminTabs.tsx", "Pestañas de Administración"),
  I("administracion", "dialog", "dialogs:src/modules/ai/ui/AiEngineTab.tsx", "Descartar o reemplazar la clave de IA (confirmaciones)"),
  I("administracion", "dialog", "dialogs:src/modules/ai/ui/clearWebCopy.ts", "Quitar una clave de IA que la web también usa (IA-12)"),
  I("administracion", "dialog", "dialogs:src/modules/ai/ui/WebAccessPanel.tsx", "Usar la clave de IA también en la web: consentimiento, cambiar el modelo, desactivar (IA-12)", {
    // Covered by the tour except one dialog: the web's «Dejar de usarla en la web».
    skip: `La confirmación de «Dejar de usarla en la web» solo existe en la versión web; los tours recorren la app de escritorio. La cubren WebAccessPanel.test.tsx y la revisión manual (docs/manual/REVIEW.md).`,
  }),
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
  I("administracion", "dialog", "dialogs:src/modules/admin/ui/TrashSection.tsx", "Papelera: vaciar o eliminar para siempre (confirmación)"),
  I("administracion", "action", "action:download-folder", "Elegir carpeta de descarga / «Usar Descargas»", {
    skip: "«Elegir carpeta…» abre el selector de carpetas nativo de Windows (rfd, desde Rust), fuera de la WebView que WebDriver maneja; y «Usar Descargas» apuntaría las exportaciones a la carpeta real del usuario, que los tours nunca tocan. El campo se muestra en la captura de «General»; la lógica la cubren los tests de Rust de downloads.rs y la revisión manual (docs/manual/REVIEW.md, «Fuera de los tours»).",
  }),
  // The server administrator (SEC-11) and reset by an administrator (SEC-09); ADR-0045.
  I("administracion", "tab", "admin:users", "Usuarios del servidor (solo administradores)"),
  I("administracion", "dialog", "dialogs:src/modules/admin/ui/tabs/UsersTab.tsx", "Restablecer la contraseña de otra cuenta; nombrar o quitar administradores", {
    skip: "Necesita una segunda cuenta en la lista, y el manual solo muestra a su persona (NC-052). Lo cubren server/tests/admin.test.ts y src/modules/admin/ui/tabs/UsersTab.test.tsx, y la revisión manual (docs/manual/REVIEW.md).",
  }),
  I("administracion", "action", "action:admin-reset", "Restablecer la contraseña de otra cuenta (enlace de un solo uso)", {
    skip: "Necesita una segunda cuenta en la lista, y el manual solo muestra a su persona (NC-052). Lo cubren server/tests/admin.test.ts y src/modules/admin/ui/tabs/UsersTab.test.tsx, y la revisión manual (docs/manual/REVIEW.md).",
  }),
  I("administracion", "action", "action:admin-reset-email", "Enviar el enlace por correo (el administrador no lo ve)", {
    skip: "Necesita un servidor con SMTP; la API del tour no envía correo (el valor por defecto). Lo cubren server/tests/admin.test.ts con un buzón en memoria y src/modules/admin/ui/tabs/UsersTab.test.tsx.",
  }),
  I("administracion", "action", "action:admin-grant", "Nombrar a otro administrador", {
    skip: "Necesita una segunda cuenta en la lista, y el manual solo muestra a su persona (NC-052). Lo cubren server/tests/admin.test.ts y src/modules/admin/ui/tabs/UsersTab.test.tsx, y la revisión manual (docs/manual/REVIEW.md).",
  }),
  I("administracion", "action", "action:admin-revoke", "Quitar el rol de administrador", {
    skip: "Necesita una segunda cuenta en la lista, y el manual solo muestra a su persona (NC-052). Lo cubren server/tests/admin.test.ts y src/modules/admin/ui/tabs/UsersTab.test.tsx, y la revisión manual (docs/manual/REVIEW.md).",
  }),
  // Disabling an account (SEC-12; ADR-0045 amendment B).
  I("administracion", "dialog", "dialogs:src/modules/admin/ui/tabs/DisableAccountDialog.tsx", "Desactivar una cuenta: motivo, sucesor del último Test Manager y confirmación", {
    skip: "Necesita una segunda cuenta en la lista, y el manual solo muestra a su persona (NC-052). Lo cubren server/tests/account-disable.test.ts y src/modules/admin/ui/tabs/UsersTab.test.tsx, y la revisión manual (docs/manual/REVIEW.md).",
  }),
  I("administracion", "action", "action:admin-disable", "Desactivar una cuenta", {
    skip: "Necesita una segunda cuenta en la lista, y el manual solo muestra a su persona (NC-052). Lo cubren server/tests/account-disable.test.ts y src/modules/admin/ui/tabs/UsersTab.test.tsx, y la revisión manual (docs/manual/REVIEW.md).",
  }),
  I("administracion", "action", "action:admin-enable", "Reactivar una cuenta desactivada", {
    skip: "Necesita una segunda cuenta en la lista, y el manual solo muestra a su persona (NC-052). Lo cubren server/tests/account-disable.test.ts y src/modules/admin/ui/tabs/UsersTab.test.tsx, y la revisión manual (docs/manual/REVIEW.md).",
  }),
  I("administracion", "tab", "admin:sync", "Sincronización"),
  I("administracion", "action", "action:sync-now", "Sincronizar ahora"),
  I("administracion", "action", "action:sync-auto", "Sincronización automática y su intervalo"),
  I("administracion", "dialog", "dialogs:src/modules/sync-offline/ui/ConflictPanel.tsx", "Conflictos de sincronización (con un segundo equipo simulado por la API del tour)"),
  // SYNC-02 (ADR-0051): a web save that collides field by field.
  I("administracion", "dialog", "dialogs:src/modules/sync-offline/ui/WebMergeDialog.tsx", "Web: elegir qué queda en cada campo cuando alguien cambió los mismos campos al guardar", {
    skip: "Solo existe en la versión web; los tours recorren la app de escritorio. Lo cubren src/modules/sync-offline/web/serverApi.test.ts, src/modules/sync-offline/ui/FieldMerge.test.tsx y la revisión manual de la versión web (docs/manual/REVIEW.md).",
  }),
  I("administracion", "dialog", "dialogs:src/modules/sync-offline/ui/LegacyUnsentNotice.tsx", "Aviso de cambios antiguos sin enviar", {
    skip: `${WEB_ONLY} Lo cubren sus pruebas unitarias (Vitest) y la revisión manual de la versión web (docs/manual/REVIEW.md).`,
  }),
  I("administracion", "tab", "admin:security", "Seguridad (clave de recuperación)"),
  I("administracion", "dialog", "dialogs:src/modules/profile/ui/RecoveryKeySection.tsx", "Mostrar la clave de recuperación"),
  I("administracion", "tab", "admin:diagnostics", "Diagnóstico"),
  I("administracion", "action", "action:diagnostics-export", "Exportar diagnóstico"),
  I("administracion", "tab", "admin:audit", "Auditoría (registro de cambios)"),
  I("administracion", "action", "action:audit-verify", "Comprobar la cadena de auditoría"),
  I("administracion", "dialog", "dialogs:src/modules/admin/ui/audit/AuditDetail.tsx", "Detalle de un evento: antes y después"),
  I("administracion", "action", "action:audit-export", "Exportar la auditoría (.xlsx o CSV)"),


  // ---- 11 · Asistente de IA ---------------------------------------------------------------
  I("ia", "action", "ai:configure", "Configurar el proveedor y la clave de IA"),
  I("ia", "action", "ai:test-connection", "Probar la conexión con la IA"),
  I("ia", "action", "ai:assist-field", "«Asistir con IA» en un campo del plan"),
  I("ia", "action", "ai:suggest-risks", "Sugerir riesgos con IA"),
  I("ia", "dialog", "dialogs:src/modules/traceability/ui/GenerateCasesModal.tsx", "Generar casos desde un requisito con IA"),
  I("ia", "dialog", "dialogs:src/modules/test-cases/ui/SuggestTestsModal.tsx", "Sugerir casos con IA"),
  I("ia", "dialog", "dialogs:src/modules/traceability/ui/ProjectRequirementsModal.tsx", "Requisitos desde un proyecto con IA (IA-17)"),
  I("ia", "dialog", "dialogs:src/modules/traceability/ui/RequirementProposalsReview.tsx", "Revisar las propuestas de requisitos de la IA (IA-17, IA-18)"),
  I("ia", "action", "ai:suggest-preconditions", "Sugerir y revisar las listas del caso con IA"),
  I("ia", "dialog", "dialogs:src/modules/traceability/ui/RequirementsFromDesignModal.tsx", "Requisitos desde diseños: material"),
  I("ia", "action", "action:requirements-import-menu-ai", "Menú «Importar» de Requisitos con las tres opciones activas (con IA)"),
  I("ia", "dialog", "dialogs:src/modules/traceability/ui/RequirementSources.tsx", "Fuente de un requisito: la imagen guardada a tamaño completo (IA-19)"),
  I("ia", "upload", "upload:src/modules/traceability/ui/RequirementsFromDesignModal.tsx", "Requisitos desde diseños: archivos, carpeta y Ctrl+V"),
  I("ia", "state", "ai:disabled-without-key", "Botones de IA deshabilitados sin configurar"),

  // ---- 12 · Móvil -------------------------------------------------------------------------
  I("movil", "platform", "platform:mobile-bottom-nav", "Barra inferior en móvil"),
  I("movil", "platform", "platform:mobile-project-pills", "Secciones del proyecto en móvil"),
  I("movil", "platform", "platform:mobile-search", "Búsqueda en móvil"),
  I("movil", "platform", "platform:mobile-filters", "Filtros en una hoja inferior"),
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
  I("ejecucion-manual", "dialog", "dialogs:src/modules/runs/ui/ExecutionPanel.tsx", "Descartar un borrador y quitar una evidencia (confirmación)"),
  I("ejecucion-manual", "dialog", "dialogs:src/modules/runs/ui/RunDetail.tsx", "Cerrar y reabrir el run"),
  I("ejecucion-manual", "action", "action:exec-paste", "Pegar una captura (Ctrl+V)"),
  I("ejecucion-manual", "platform", "platform:mobile-run", "El run en el móvil (el ejecutor a pantalla completa)"),
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
