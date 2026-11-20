// Labels the runs screens derive from the project, the report or the clock
// (FIX-45).

/** «2026-11-20-11-05-01»: the local time of a pasted capture, as the user's
 *  clock shows it, not UTC. */
export function localStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return [
    d.getFullYear(),
    p(d.getMonth() + 1),
    p(d.getDate()),
    p(d.getHours()),
    p(d.getMinutes()),
    p(d.getSeconds()),
  ].join("-");
}

/** A sample case key of this project, for the import help: «PH-001». */
export function exampleCaseKey(prefix: string, digits = 3): string {
  return `${prefix || "PH-"}${"1".padStart(Math.max(1, digits), "0")}`;
}

/** How the tools that write reports spell their own name. Reports carry a
 *  lowercase id («playwright», «mstest»); the run title shows the name. */
const TOOL_NAMES: Record<string, string> = {
  playwright: "Playwright",
  mstest: "MSTest",
  nunit: "NUnit",
  xunit: "xUnit",
  junit: "JUnit",
  jest: "Jest",
  vitest: "Vitest",
  cypress: "Cypress",
  cucumber: "Cucumber",
  "cucumber-js": "Cucumber",
  "cucumber-jvm": "Cucumber",
  pytest: "pytest",
  testng: "TestNG",
  mocha: "Mocha",
  webdriverio: "WebdriverIO",
  selenium: "Selenium",
  xcode: "Xcode",
  allure: "Allure",
  k6: "k6",
  "axe-core": "axe-core",
  semgrep: "Semgrep",
  codeql: "CodeQL",
};

/** The tool's display name: a known id by its own spelling, any other one
 *  with a capital first letter when it is all lowercase. */
export function toolName(tool: string): string {
  const known = TOOL_NAMES[tool.trim().toLowerCase()];
  if (known) return known;
  return tool === tool.toLowerCase() ? tool.charAt(0).toUpperCase() + tool.slice(1) : tool;
}

/** The title a new run gets from its report: «Playwright · allure-acceso.zip». */
export function runTitleOf(sourceTool: string | undefined, fileName: string): string {
  const tools = sourceTool
    ? sourceTool
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(toolName)
        .join(", ")
    : "";
  return [tools, fileName].filter(Boolean).join(" · ");
}
