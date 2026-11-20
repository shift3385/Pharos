// The case study of the manual (MAN-03, ADR-0039): Liomar Rodríguez, QA lead,
// tests Pharos 0.6.0 itself; his teammate Jorge L. Meneses Yero appears only
// in the team features. Every name, key and value the chapters type, and
// that the prerequisite loaders (prepare.ts) and the fixture generator
// (scripts/manual/fixtures/) bring in, comes from here: the data a subject
// chapter makes on screen and the data a loader imports are the same by
// construction.
//
// Plain data, no imports from the app: the tours (WebdriverIO), the fixture
// generator (Vitest) and the scripts (Node's type stripping) all read it.

/** The release under test. */
export const RELEASE = { version: "0.6.0", build: "0.6.0-beta.1", environment: "staging" };

/** The two projects of chapter 4. Liomar shortens the prefix Pharos suggests
 *  for «Pharos» («PHA-») to «PH-» when he creates it; «API-» is the one
 *  suggested for the second. */
export const PROJECT_A = { name: "Pharos", prefix: "PH", suggestedPrefix: "PHA" };
export const PROJECT_B = { name: "API de sincronización", prefix: "API" };
/** The project chapter 4 creates from the settings of «Pharos» and deletes
 *  (never a prerequisite): the next version, made too early. */
/** No «Pharos» in its name: the tours find «Pharos» by a partial match. */
export const TEMP_PROJECT = { name: "Versión 0.7.0", prefix: "V07" };

/** Custom fields of chapter 14 (`fieldKey` as the app derives it from the
 *  label: keyFromLabel in src/modules/custom-fields/model/validate.ts). */
export const CUSTOM_FIELDS = {
  browser: { label: "Navegador", fieldKey: "navegador", fieldType: "select", options: ["Chrome", "Edge", "Firefox"], entity: "test_case" },
  criticalRegression: { label: "Regresión crítica", fieldKey: "regresion_critica", fieldType: "boolean", options: [], entity: "test_case" },
  os: { label: "Sistema operativo", fieldKey: "sistema_operativo", fieldType: "text", options: [], entity: "defect" },
} as const;

/** Active configurations of chapter 14 (a third one, «Safari · macOS», is
 *  made and archived on screen; it is not a prerequisite). */
export const CONFIGURATIONS = [
  { name: "Chrome · Windows 11", attributes: { browser: "Chrome", os: "Windows 11", device: "Escritorio", locale: "es-ES" }, matchLabels: ["chromium", "Desktop Chrome"] },
  { name: "Edge · Windows 11", attributes: { browser: "Edge", os: "Windows 11", device: "Escritorio", locale: "es-ES" }, matchLabels: ["msedge"] },
];

/** Requirements of chapter 7: REQ-001 typed by hand, the rest from
 *  fixtures/pharos/requisitos-pharos.csv (generated from this list: see
 *  scripts/manual/fixtures/). `deletedOnScreen`: chapter 7 deletes it (out
 *  of the release), so it is not part of the prerequisite. */
export const REQUIREMENTS: { key: string; title: string; description: string; priority: "Alta" | "Media" | "Baja"; deletedOnScreen?: boolean }[] = [
  {
    key: "REQ-001",
    title: "Iniciar sesión con correo y contraseña",
    description: "Quien tiene cuenta entra con su correo y su contraseña; con datos incorrectos, Pharos no dice cuál de los dos falla.",
    priority: "Alta",
  },
  { key: "REQ-002", title: "Crear un proyecto con su prefijo", description: "Quien prueba crea un proyecto y elige el prefijo con el que se numeran sus casos.", priority: "Alta" },
  { key: "REQ-003", title: "Guardar el plan con historial de revisiones", description: "Cada guardado del plan de pruebas crea una revisión que se puede consultar y restaurar.", priority: "Media" },
  { key: "REQ-004", title: "Importar resultados JUnit", description: "Un informe JUnit se importa como ejecución y vincula cada test a su caso por la propiedad test_id.", priority: "Alta" },
  { key: "REQ-005", title: "Exportar la matriz de trazabilidad a .xlsx", description: "La matriz se exporta con requisitos, casos, estados y defectos.", priority: "Media" },
  { key: "REQ-006", title: "Trabajar sin conexión y sincronizar", description: "Los cambios hechos sin conexión se envían al servidor cuando vuelve la conexión; si dos personas cambian campos distintos, se combinan sin preguntar.", priority: "Alta" },
  { key: "REQ-007", title: "Imprimir el plan desde el navegador", description: "La versión web imprime el plan con el diálogo de impresión del navegador.", priority: "Baja", deletedOnScreen: true },
  { key: "REQ-008", title: "Ejecutar un caso paso a paso con evidencias", description: "En una ejecución manual, cada paso se marca como pasa, falla, bloqueado u omitido y el intento guarda sus capturas cifradas.", priority: "Alta" },
  { key: "REQ-009", title: "Registrar un defecto desde un resultado fallido", description: "Desde un intento fallido se crea un defecto ya vinculado a su caso, con los pasos y el resultado obtenido.", priority: "Media" },
  { key: "REQ-010", title: "Aprobación independiente de casos y planes", description: "En un workspace con aprobación independiente, aprueba quien tiene el rol y no es el autor.", priority: "Media" },
  { key: "REQ-011", title: "Recuperar la cuenta con un código", description: "Quien olvida su contraseña entra con uno de sus códigos de recuperación, que solo vale una vez.", priority: "Alta" },
  { key: "REQ-012", title: "Tokens de CI con permisos y caducidad", description: "Un token de proyecto sube resultados desde un CI con los permisos elegidos y caduca en la fecha fijada.", priority: "Media" },
];
/** The requirements every later chapter can rely on. */
export const LIVE_REQUIREMENTS = REQUIREMENTS.filter((r) => !r.deletedOnScreen);
/** The risk chapter 7 gives REQ-005 (likelihood × impact): the matrix's
 *  weighted coverage needs at least one assessed requirement. The CSV has no
 *  risk column. */
export const REQUIREMENT_RISK = { key: "REQ-005", likelihood: 4, impact: 5 };

/** The four base cases of chapter 8, in creation order (PH-001…PH-004).
 *  fixtures/pharos/casos/*.xlsx are these, exported by Pharos's own case
 *  exporter. `requirementKeys` are linked on import (the .xlsx carries them
 *  only as text). */
export const BASE_CASES = [
  {
    key: "PH-001",
    file: "PH-001-iniciar-sesion.xlsx",
    title: "Iniciar sesión con credenciales válidas",
    level: "basic",
    priority: "high",
    preconditions: ["La cuenta de prueba existe en el servidor de staging"],
    steps: ["Abrir Pharos sin una sesión iniciada", "Escribir el correo y la contraseña de una cuenta de prueba", "Pulsar «Entrar»"],
    expectedResult: "Se abre «Inicio» con el saludo «Hola» y el nombre de la cuenta.",
    requirementKeys: ["REQ-001"],
    custom: { navegador: "Chrome", regresion_critica: true },
  },
  {
    key: "PH-002",
    file: "PH-002-rechazar-credenciales.xlsx",
    title: "Rechazar credenciales no válidas",
    level: "outline",
    priority: "medium",
    steps: ["Abrir la pantalla de entrada", "Escribir <correo> y <contraseña> y pulsar «Entrar»"],
    expectedResult: "Se muestra «Correo o contraseña incorrectos.» y no se entra.",
    // A real account with a wrong password, and an address with no account.
    examples: [
      ["liomar.qa@pharos.test", "contraseña-mala"],
      ["nadie@pharos.test", "Clave-de-prueba-1"],
    ],
    requirementKeys: ["REQ-001"],
    custom: {},
  },
  {
    key: "PH-003",
    file: "PH-003-crear-proyecto.xlsx",
    title: "Crear un proyecto",
    level: "advanced",
    priority: "medium",
    /** Shared preconditions (the Background of the scenarios). */
    background: ["Hay una sesión iniciada en Pharos"],
    mainFlow: ["Abrir «Proyectos» y pulsar «Nuevo proyecto»", "Escribir el nombre y pulsar «Crear»"],
    mainExpected: "El proyecto se crea y se abre en su «Plan de pruebas».",
    altFlow: {
      name: "Nombre vacío",
      steps: ["Pulsar «Crear» sin escribir el nombre", "Leer el aviso bajo el campo"],
      expected: "Aparece «Este campo es obligatorio.» y no se crea ningún proyecto.",
    },
    requirementKeys: ["REQ-002"],
    custom: {},
  },
  {
    key: "PH-004",
    file: "PH-004-humo.xlsx",
    title: "Humo de la versión 0.6.0",
    level: "basic",
    caseType: "checklist",
    priority: "medium",
    checklist: ["La app arranca sin errores", "Se puede iniciar sesión", "El Inicio muestra los proyectos"],
    // Free text on purpose: chapter 13 turns it into a link («Migrar trazabilidad»).
    otherReferences: "Relacionado con REQ-006",
    requirementKeys: [],
    custom: {},
  },
] as const;

/** The project library of chapter 8 (CAS-01) and the case that uses it,
 *  PH-005 (made right after the four base cases). The shared step ends at v2
 *  (chapter 8 completes its last expected result); the dataset is
 *  fixtures/usuarios-validos.csv (three test accounts). */
export const LIBRARY = {
  step: {
    name: "Iniciar sesión",
    description: "Entrar en Pharos con una cuenta de prueba.",
    steps: ["Escribir <usuario> en «Correo electrónico»", "Escribir <clave> en «Contraseña»", "Pulsar «Entrar»"],
    lastExpected: "Se abre «Inicio»",
    /** What chapter 8 adds to the last expected result (v1 → v2). */
    lastExpectedAdded: " con el nombre de la cuenta",
  },
  dataset: { name: "Usuarios válidos", file: "usuarios-validos.csv", rows: 3, columns: 2 },
  case: {
    key: "PH-005",
    title: "Acceso con usuarios de prueba",
    firstStep: "Abrir Pharos sin una sesión iniciada",
    expectedResult: "Se abre «Inicio» con el nombre de la cuenta.",
    requirementKeys: ["REQ-001"],
    /** The row that fails in chapter 11 and in the JUnit of chapter 10. */
    failedRow: 3,
  },
};

/** The cycle of chapter 9 and its runs (one per configuration). */
export const CYCLE = {
  title: "Regresión 0.6.0",
  build: RELEASE.build,
  environment: RELEASE.environment,
  sprint: "Sprint 1",
  /** The first two base cases, assigned to Liomar. */
  caseKeys: ["PH-001", "PH-002"],
  assignee: "Liomar Rodríguez",
  /** How Liomar closes it (chapter 9, after the results of chapters 10 and 11
   *  and the defects of chapter 12): PH-001 fails in every run and the login
   *  defect is critical and open, so the version does not go out. */
  gate: {
    verdict: "noGo" as const,
    justifications: [
      {
        match: /crític/i,
        text: "No se acepta: el defecto crítico del acceso impide entrar con credenciales válidas. Se corrige para la beta.2 y se repite la regresión; lo sigue Liomar, responsable de QA.",
      },
      {
        match: /cobertura/i,
        text: "REQ-003 a REQ-012 se cubren en el Sprint 2, hasta el 6 de diciembre; lo asume Liomar, responsable de QA.",
      },
    ],
    otherJustification: "Se repite en la regresión de la beta.2, del 23 de noviembre; lo sigue Liomar, responsable de QA.",
    /** The manual criteria: PH-001, the critical case, was run (and failed);
     *  the demo was not held with the access broken. */
    manual: [
      { match: /Casos críticos ejecutados/i, met: true },
      { match: /Satisfacción/i, met: false },
    ],
    lessons:
      "Pedir al equipo de plataforma el entorno de staging una semana antes de la regresión, y una prueba de humo del acceso antes de abrir el ciclo.",
  },
};

/** The report chapter 10 imports into the cycle, with its captures
 *  (fixtures/informe-adjuntos/: PH-001 fails, PH-002 passes). */
export const RESULTS = { title: "Tests de acceso · con capturas", build: RELEASE.build, environment: RELEASE.environment };

/** The manual run of chapter 11 (PH-001 fails at step 3, PH-002 passes,
 *  PH-005 runs once per dataset row and its third row fails). */
export const MANUAL_RUN = {
  title: `Regresión manual · ${RELEASE.build}`,
  build: RELEASE.build,
  environment: RELEASE.environment,
  failed: { caseKey: "PH-001", step: 3, actual: "Se queda en la entrada con «Correo o contraseña incorrectos.»" },
  passed: { caseKey: "PH-002" },
  dataset: { caseKey: LIBRARY.case.key, failedRow: LIBRARY.case.failedRow },
};

/** The scans chapter 10 imports besides the test reports (ING-06), all in
 *  fixtures/pharos/informes/ except the axe audit, a real one of Pharos's own
 *  «Nuevo requisito» dialog (packages/formats/src/fixtures/axe/). */
export const SCANS = {
  /** Two findings: one tagged @PH-002 (the case gets the matrix badge), one
   *  triaged as a false positive on screen. */
  sarif: {
    file: "semgrep-servidor.sarif",
    title: "Análisis Semgrep · servidor",
    linkedCase: "PH-002",
    triagedRule: "unsafe-formatstring",
    triageReason: "La cadena de formato es una constante del módulo; no viene de la petición.",
  },
  axe: { title: "Accesibilidad · diálogo «Nuevo requisito»" },
  /** One threshold fails (failed requests over 1 %); the login sub-metric is
   *  linked to PH-001 and passes. */
  k6: { file: "k6-api-pharos.json", title: "Carga · API de Pharos, 5 usuarios" },
  /** A JUnit with `example_row`: PH-005 row by row (row 3 fails). */
  datasetJunit: { file: "acceso-por-fila.junit.xml", title: "Acceso por fila · usuarios de prueba" },
  allure: { file: "allure-acceso.zip", title: "Tests de acceso · Allure" },
  trx: { file: "api-v1-dotnet.trx" },
};

/** The defects of chapter 12 that later chapters read. */
export const DEFECTS = {
  prefix: {
    title: "El menú lateral sigue mostrando el prefijo anterior",
    severity: "major",
    priority: "medium",
    steps: "1. Abrir «Ajustes del proyecto» de «Pharos».\n2. Cambiar el prefijo de «PHA-» a «PH-» y pulsar «Guardar».\n3. Mirar el selector de proyecto del menú lateral.",
    expected: "El selector muestra «PH» al momento.",
    actual: "Sigue mostrando «PHA» hasta cambiar de sección.",
    os: "Windows 11",
    caseKey: "PH-003",
    requirementKey: "REQ-002",
  },
  login: {
    title: "Entrar con credenciales válidas muestra «Correo o contraseña incorrectos»",
    severity: "critical",
    priority: "critical",
    caseKey: "PH-001",
  },
};

/** The plan of chapter 5. fixtures/pharos/«Plan de pruebas de Pharos 0.6.0.xlsx»
 *  is this plan, exported by Pharos's own plan exporter (scripts/manual/fixtures/).
 *  Lists of catalog keys use the app's keys (src/modules/test-plan/model/catalogs.ts). */
export const PLAN = {
  title: `Plan de pruebas de Pharos ${RELEASE.version}`,
  /** The fixture's name is the plan's title, as Pharos names the export: the
   *  plan import takes the title from the file name. */
  file: `Plan de pruebas de Pharos ${RELEASE.version}.xlsx`,
  version: "0.6",
  planDate: "2026-11-16",
  summary:
    "Plan de pruebas de la versión 0.6.0 de Pharos, la app de gestión de pruebas que funciona sin conexión y se sincroniza con su servidor. Cubre la biblioteca del proyecto, la importación de informes (Allure, TRX, SARIF, axe y k6), las integraciones (tokens, webhooks y el CLI pharos) y la nueva base de datos local cifrada.",
  scopeIn: [
    "Acceso y cuentas",
    "Plan, requisitos, casos y la biblioteca del proyecto",
    "Ciclos, ejecuciones e importación de informes",
    "Sincronización entre equipos y workspaces",
    "Integraciones: tokens, webhooks y el CLI",
  ],
  scopeOut: ["Integración con Jira", "App móvil nativa"],
  assumptions: ["El servidor de staging está disponible de 8 a 20 h"],
  constraints: ["Un equipo de QA de dos personas", "La versión sale el 30/11/2026"],
  testLevels: ["integration", "system", "acceptance"],
  testTypes: ["functional", "security", "usability", "performance", "retest", "regression", "Pruebas de sincronización"],
  techniques: ["equivalencePartitioning", "boundaryValues", "stateTransition", "exploratory"],
  methodology: { type: "agile" as const, sprintWeeks: 2, ceremonies: ["daily", "review", "retrospective"], frequency: { review: "biweekly" } },
  deliverables: ["testPlan", "statusReports", "summaryReports", "testCasesScripts", "defectReports", "traceabilityMatrix", "Informe de accesibilidad WCAG 2.2"],
  environmentConfig:
    "App de escritorio en Windows 11 y versión web en Chrome y Edge actuales, contra el servidor de staging (API y PostgreSQL) con una cuenta de prueba por persona.",
  environmentRequirements: "PC con Windows 11 y 8 GB de RAM, WebView2 actualizado y acceso al servidor de staging.",
  tools: ["playwright", "webdriverio", "k6", "github-actions"],
  automationStrategy:
    "Regresión de escritorio con WebdriverIO y tauri-driver en cada PR; la web con Playwright cada noche; los informes se suben a Pharos con «pharos upload»; humo manual de cada versión.",
  testDataManagement: "Cuentas y proyectos de prueba creados por script en staging; ningún dato real de clientes.",
  defectManagement: "Defectos en el propio Pharos, con severidad y prioridad; triaje diario del equipo de QA.",
  roles: [
    ["Responsable de QA", "Planifica, prioriza y aprueba el cierre"],
    ["Analista de pruebas", "Diseña y ejecuta los casos; revisa y aprueba los del compañero"],
  ] as [string, string][],
  independence: "team" as const,
  independenceNote: "Quien prueba una función no la ha programado, y cada caso lo aprueba otra persona.",
  training: [["Importar informes de Allure y TRX", "Antes del primer ciclo"]] as [string, string][],
  estimation: {
    technique: "threePoint" as const,
    optimistic: 12,
    likely: 18,
    pessimistic: 30,
    budget: "Horas de QA de la versión; sin licencias de pago.",
    notes: "La regresión de la 0.5.0 llevó 17 persona-días; se suman la biblioteca del proyecto y la conversión de los datos locales.",
  },
  sprints: [
    { name: "Sprint 1", start: "2026-11-09", end: "2026-11-22" },
    { name: "Sprint 2", start: "2026-11-23", end: "2026-12-06" },
  ],
  milestones: [
    { name: "Congelación de código", date: "2026-11-25" },
    { name: `Publicación de la ${RELEASE.version}`, date: "2026-11-30" },
  ],
  risks: [
    ["Una actualización de WebView2 rompe la automatización de escritorio", "Fijar la versión del controlador y revisarla en cada actualización"],
    ["Conflictos de sincronización difíciles de reproducir", "Escenarios con dos equipos contra la API de pruebas y la combinación campo a campo"],
    ["La conversión de los datos locales al formato de la 0.6 falla en equipos con poco espacio", "Probar la conversión con datos reales de la 0.5 y con el disco casi lleno"],
  ] as [string, string][],
  communicationPlan:
    "Informe semanal de avance al equipo de producto; aviso inmediato de cada defecto crítico en el canal del equipo.",
  entryCriteria: ["Versión instalada en staging y prueba de humo en verde"],
  suspensionCriteria: ["Falla el acceso a la aplicación"],
  resumptionCriteria: ["Hay una versión con el bloqueo corregido"],
  ownMetric: { name: "Satisfacción del producto en la demo", target: 4 },
  closure: [["Casos críticos ejecutados", "100 %"]] as [string, string][],
  purpose: `Asegurar que Pharos ${RELEASE.version} cumple sus requisitos antes de publicarse.`,
  conclusion: `Pendiente de la regresión del ciclo «Regresión ${RELEASE.version}».`,
};

/** What chapter 5 changes on screen in the imported plan (the fixture and
 *  the `plan` loader do not have it): a scope row the 0.6.0 risks call for,
 *  and a milestone marked with the keyboard (from the day before). */
export const PLAN_ON_SCREEN = {
  scopeIn: "Conversión de los datos locales de la 0.5 a la 0.6",
  milestone: { name: "Versión candidata", date: "2026-11-27", from: "2026-11-26" },
  reviewNote: `Primera versión del plan de la ${RELEASE.version}, importada de Excel.`,
};

/** The workspace of chapters 21 and 20. Chapter 21 (it runs before 20)
 *  creates it, shares «Pharos» into it and invites Jorge; chapter 20 gives
 *  its CI a token. */
export const TEAM = {
  workspace: "Equipo QA",
  sharedProject: PROJECT_A.name,
  /** Jorge's role: a Test Analyst may review and approve cases (case.approve)
   *  but not plans (plan.approve is Test Manager only: server/src/modules/
   *  workspaces/roles.ts). A plan approval by Jorge needs «Cambiar el rol». */
  jorgeRole: "test_analyst" as const,
  /** Chapter 21 raises him to Test Manager for the plan's review and leaves
   *  him there (two Test Managers): chapter 20 needs his project token. */
  jorgeFinalRole: "test_manager" as const,
  /** «Para quién» of the invitation (a note, never sent). */
  inviteNote: "Jorge, compañero de QA",
  /** The case Liomar sends to Jorge's review, his request and the change. */
  reviewCase: {
    key: "PH-004",
    sendNote: "Lista para revisar: la checklist de humo de la 0.6.0.",
    changes: "Añade una comprobación de la campana de notificaciones.",
    newItem: "La campana muestra las notificaciones del workspace",
  },
  /** Jorge's request on the plan, and the row Liomar adds to answer it. */
  planChanges: "Falta en «Roles» quién aprueba el plan en el equipo.",
  planRole: ["Test Manager del workspace", "Aprueba el plan; con la aprobación independiente, nunca el que lo escribió"] as [string, string],
  /** The note of «Enviar a revisión» when the plan is still a draft. */
  planNote: "Plan para el equipo: lo aprueba un Test Manager que no sea su autor.",
  /** The defect Liomar assigns to Jorge (DEFECTS.prefix). */
  assignedDefect: "prefix" as const,
  /** Jorge's project token in chapter 20 («Reasignar a mí»). */
  jorgeToken: "CI nocturno de Pharos",
};

/** The material of «Requisitos desde un proyecto» and «Requisitos desde
 *  diseños» (chapter 17), all about Pharos. */
export const AI_MATERIAL = {
  folder: "proyecto-api-sincronizacion",
  folderProject: PROJECT_B.name,
  sketch: "boceto-notificaciones.png",
  sketchContext: "App de escritorio Pharos (gestión de pruebas); los usuarios se nombran por su rol, como el responsable de QA",
  /** The context of «Requisitos desde un proyecto» (the AI must not invent
   *  people: the persona check fails on any other name). */
  folderContext: "API de sincronización de Pharos (gestión de pruebas sin conexión); los usuarios se nombran por su rol",
  /** The requirements «API de sincronización» already has before the AI
   *  proposes more (fixtures/pharos/requisitos-api-sincronizacion.csv). */
  requirementsCsv: "requisitos-api-sincronizacion.csv",
};
