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
