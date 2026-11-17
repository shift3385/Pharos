// Shared option catalogs for the test plan (spec §5.1). Kept in one place so the
// wizard UI and the export mapping stay in sync (e.g. adding a tool).

/** Test types by group (step «Niveles y tipos de prueba», UX-31). A plan
 *  stores the keys; anything else is a type the team typed. «Confirmación y
 *  regresión» follows ISTQB CTFL v4 §2.2.3 (change-related testing):
 *  `retest` (confirmation testing) is the stable key of «Confirmación». */
export const TYPE_GROUPS: { id: "functional" | "nonFunctional" | "changeRelated"; keys: string[] }[] = [
  { id: "functional", keys: ["functional", "exploratory", "uat"] },
  {
    id: "nonFunctional",
    keys: ["performance", "load", "stress", "security", "usability", "compatibility", "accessibility"],
  },
  { id: "changeRelated", keys: ["retest", "regression", "smoke", "sanity"] },
];
/** Every catalog type, in the order of its groups (the order of the exports). */
export const TEST_TYPES = TYPE_GROUPS.flatMap((g) => g.keys);
/** Types with a one-line explanation in their tooltip. */
export const EXPLAINED_TYPES = ["retest", "regression", "smoke", "sanity"];

export const TEST_LEVELS = ["unit", "integration", "system", "acceptance"];
export const CEREMONIES = ["daily", "review", "retrospective", "planning"];
/** How often a ceremony is held (spec §5.1 step 8, PLN-01). */
export const CEREMONY_FREQUENCIES = [
  "daily",
  "twiceWeekly",
  "weekly",
  "biweekly",
  "perSprint",
  "monthly",
];
/** Industry defaults (Scrum Guide): the daily every day, the rest once per sprint. */
export const DEFAULT_CEREMONY_FREQUENCY: Record<string, string> = {
  daily: "daily",
  review: "perSprint",
  retrospective: "perSprint",
  planning: "perSprint",
};
export const ROLE_KEYS = ["testManager", "tester", "automation", "productOwner"];

/** Test deliverables of ISO/IEC/IEEE 29119-3 by group (step 8, RED-V2). A
 *  plan stores the keys; anything else is the team's own deliverable. The
 *  first eight keys predate the groups (plans may hold them as labels, see
 *  `normalizeDeliverables`). */
export const DELIVERABLE_GROUPS: { id: string; keys: string[] }[] = [
  { id: "management", keys: ["testPlan", "statusReports", "summaryReports"] },
  { id: "specification", keys: ["testDesignSpec", "testCasesScripts", "testProcedures"] },
  {
    id: "dataEnvironment",
    keys: ["testData", "testDataReadiness", "testEnvRequirements", "testEnvReadiness"],
  },
  { id: "execution", keys: ["executionLog", "defectReports", "incidentReports"] },
  { id: "acceptance", keys: ["uatSignoff", "traceabilityMatrix"] },
];
export const DELIVERABLE_KEYS = DELIVERABLE_GROUPS.flatMap((g) => g.keys);
/** What a new plan starts with checked. */
export const DEFAULT_DELIVERABLES = [
  "testPlan",
  "testCasesScripts",
  "statusReports",
  "summaryReports",
  "defectReports",
  "uatSignoff",
  "testData",
  "incidentReports",
];

/** Tool names (brands: never translated). A plan stores the key; anything
 *  else is a tool the team typed. */
export const TOOL_NAMES: Record<string, string> = {
  playwright: "Playwright",
  selenium: "Selenium",
  cypress: "Cypress",
  appium: "Appium",
  postman: "Postman",
  jmeter: "JMeter",
  k6: "k6",
  cucumber: "Cucumber",
  jira: "JIRA",
  "github-actions": "GitHub Actions",
  webdriverio: "WebdriverIO",
  puppeteer: "Puppeteer",
  testcafe: "TestCafe",
  "robot-framework": "Robot Framework",
  katalon: "Katalon Studio",
  nightwatch: "Nightwatch.js",
  espresso: "Espresso",
  xcuitest: "XCUITest",
  detox: "Detox",
  maestro: "Maestro",
  "rest-assured": "REST Assured",
  insomnia: "Insomnia",
  soapui: "SoapUI / ReadyAPI",
  karate: "Karate",
  pact: "Pact",
  bruno: "Bruno",
  gatling: "Gatling",
  locust: "Locust",
  artillery: "Artillery",
  loadrunner: "LoadRunner",
  blazemeter: "BlazeMeter",
  "owasp-zap": "OWASP ZAP",
  "burp-suite": "Burp Suite",
  snyk: "Snyk",
  sonarqube: "SonarQube",
  "axe-devtools": "axe DevTools",
  lighthouse: "Lighthouse",
  wave: "WAVE",
  pa11y: "Pa11y",
  jest: "Jest",
  vitest: "Vitest",
  junit: "JUnit",
  pytest: "pytest",
  nunit: "NUnit / xUnit",
  mocha: "Mocha",
  specflow: "SpecFlow / Reqnroll",
  behave: "Behave",
  gauge: "Gauge",
  percy: "Percy",
  applitools: "Applitools",
  chromatic: "Chromatic",
  backstopjs: "BackstopJS",
  browserstack: "BrowserStack",
  "sauce-labs": "Sauce Labs",
  lambdatest: "LambdaTest",
  "aws-device-farm": "AWS Device Farm",
  testrail: "TestRail",
  xray: "Xray",
  zephyr: "Zephyr",
  qtest: "qTest",
  "azure-test-plans": "Azure Test Plans",
  "azure-devops": "Azure DevOps",
  youtrack: "YouTrack",
  linear: "Linear",
  redmine: "Redmine",
  bugzilla: "Bugzilla",
  jenkins: "Jenkins",
  "gitlab-ci": "GitLab CI",
  "azure-pipelines": "Azure Pipelines",
  circleci: "CircleCI",
  bitrise: "Bitrise",
  mockoon: "Mockoon",
  wiremock: "WireMock",
  faker: "Faker",
  testcontainers: "Testcontainers",
};

/** The ten most used in QA, always shown (step 10). */
export const TOP_TOOLS = [
  "playwright",
  "selenium",
  "cypress",
  "appium",
  "postman",
  "jmeter",
  "k6",
  "cucumber",
  "jira",
  "github-actions",
];

/** «Más herramientas»: the rest of the catalog by category. */
export const MORE_TOOL_GROUPS: { id: string; tools: string[] }[] = [
  { id: "web", tools: ["webdriverio", "puppeteer", "testcafe", "robot-framework", "katalon", "nightwatch"] },
  { id: "mobile", tools: ["espresso", "xcuitest", "detox", "maestro"] },
  { id: "api", tools: ["rest-assured", "insomnia", "soapui", "karate", "pact", "bruno"] },
  { id: "performance", tools: ["gatling", "locust", "artillery", "loadrunner", "blazemeter"] },
  { id: "security", tools: ["owasp-zap", "burp-suite", "snyk", "sonarqube"] },
  { id: "accessibility", tools: ["axe-devtools", "lighthouse", "wave", "pa11y"] },
  { id: "unit", tools: ["jest", "vitest", "junit", "pytest", "nunit", "mocha"] },
  { id: "bdd", tools: ["specflow", "behave", "gauge"] },
  { id: "visual", tools: ["percy", "applitools", "chromatic", "backstopjs"] },
  { id: "devices", tools: ["browserstack", "sauce-labs", "lambdatest", "aws-device-farm"] },
  { id: "management", tools: ["testrail", "xray", "zephyr", "qtest", "azure-test-plans"] },
  { id: "tracking", tools: ["azure-devops", "youtrack", "linear", "redmine", "bugzilla"] },
  { id: "cicd", tools: ["jenkins", "gitlab-ci", "azure-pipelines", "circleci", "bitrise"] },
  { id: "data", tools: ["mockoon", "wiremock", "faker", "testcontainers"] },
];
export const MORE_TOOLS = MORE_TOOL_GROUPS.flatMap((g) => g.tools);
export const TOOLS = Object.keys(TOOL_NAMES);

/** A tool's name: the catalog brand, or the text the team typed. */
export const toolName = (key: string) => TOOL_NAMES[key] ?? key;

/** Test techniques by group (step «Técnicas de prueba», PLN-06; ISTQB CTFL
 *  v4 chapter 4). A plan stores the keys; anything else is the team's own. */
export const TECHNIQUE_GROUPS: { id: "blackBox" | "whiteBox" | "experience" | "collaborative"; keys: string[] }[] = [
  { id: "blackBox", keys: ["equivalencePartitioning", "boundaryValues", "decisionTables", "stateTransition"] },
  { id: "whiteBox", keys: ["statement", "branch"] },
  { id: "experience", keys: ["errorGuessing", "exploratory", "checklist"] },
  { id: "collaborative", keys: ["userStories", "acceptanceCriteria", "atdd"] },
];
export const TECHNIQUE_KEYS = TECHNIQUE_GROUPS.flatMap((g) => g.keys);

/** Levels of independence of testing, least to most (CTFL v4 §1.5.3). */
export const INDEPENDENCE_LEVELS = ["author", "peer", "team", "organization", "external"] as const;

/** Estimation techniques (CTFL v4 §5.1.4) plus expert judgement. */
export const ESTIMATION_TECHNIQUES = ["ratio", "extrapolation", "wideband", "threePoint", "expert"] as const;
