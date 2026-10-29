// Shared option catalogs for the test plan (spec §5.1). Kept in one place so the
// wizard UI and the export mapping stay in sync (e.g. adding a tool).

export const TEST_TYPES = [
  "functional",
  "performance",
  "load",
  "stress",
  "security",
  "usability",
  "compatibility",
  "accessibility",
  "regression",
  "smoke",
  "sanity",
  "exploratory",
  "uat",
];

// Test types split into functional vs non-functional coverage (visual grouping).
export const FUNCTIONAL_TYPES = [
  "functional",
  "usability",
  "compatibility",
  "accessibility",
  "uat",
  "exploratory",
  "sanity",
];
export const NON_FUNCTIONAL_TYPES = [
  "performance",
  "load",
  "stress",
  "security",
  "regression",
  "smoke",
];

export const TEST_LEVELS = ["unit", "integration", "system", "acceptance"];
export const TOOLS = [
  "selenium",
  "playwright",
  "cypress",
  "appium",
  "postman",
  "jmeter",
  "jira",
];
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
export const DELIVERABLE_KEYS = [
  "testPlan",
  "testCasesScripts",
  "statusReports",
  "summaryReports",
  "defectReports",
  "uatSignoff",
  "testData",
  "incidentReports",
];
export const ROLE_KEYS = ["testManager", "tester", "automation", "productOwner"];
