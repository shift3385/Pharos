import type { ExampleTable, GherkinLevel, TestCaseData } from "../model/types";

const INDENT_STEP = "    ";
const INDENT_TABLE = "      ";

/** Renders one Gherkin table row: `| a | b |`. */
function renderRow(cells: string[]): string {
  return `${INDENT_TABLE}| ${cells.map((c) => c.trim()).join(" | ")} |`;
}

/** Renders the Examples block of a Scenario Outline. */
function renderExamples(ex: ExampleTable): string[] {
  const headers = ex.headers.filter((h) => h.trim());
  if (!headers.length) return [];
  const lines = ["", `${INDENT_STEP}Examples:`, renderRow(headers)];
  for (const row of ex.rows) {
    if (row.every((c) => !c.trim())) continue;
    const padded = headers.map((_, i) => row[i] ?? "");
    lines.push(renderRow(padded));
  }
  return lines;
}

/** Scaffolds a starter feature for the advanced level from the basic fields. */
function scaffoldAdvanced(title: string, data: TestCaseData): string {
  const lines = [`Feature: ${title || "Untitled"}`, "", `  Scenario: ${title || "Scenario"}`];
  const step = (kw: string, first: boolean, text: string) =>
    lines.push(`${INDENT_STEP}${first ? kw : "And"} ${text}`);
  (data.preconditions ?? []).filter((s) => s.trim()).forEach((p, i) => step("Given", i === 0, p.trim()));
  (data.steps ?? []).filter((s) => s.trim()).forEach((s, i) => step("When", i === 0, s.trim()));
  (data.expectedResult ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((t, i) => step("Then", i === 0, t));
  return lines.join("\n") + "\n";
}

/** Renders the structured case as Gherkin. The scenario keyword and the
 *  Examples block depend on the authoring level (spec §5.3 amendment):
 *  precondiciones → Given, pasos → When, resultado esperado → Then. */
export function toGherkin(title: string, data: TestCaseData): string {
  const level: GherkinLevel = data.gherkinLevel ?? "basic";

  if (level === "advanced") {
    return data.featureSource && data.featureSource.trim()
      ? data.featureSource
      : scaffoldAdvanced(title, data);
  }

  const isOutline = level === "outline";
  const lines: string[] = [];
  lines.push(`Feature: ${title || "Untitled"}`);
  lines.push(`  ${isOutline ? "Scenario Outline" : "Scenario"}: ${title || "Scenario"}`);

  const step = (kw: string, first: boolean, text: string) =>
    lines.push(`${INDENT_STEP}${first ? kw : "And"} ${text}`);

  (data.preconditions ?? [])
    .filter((s) => s.trim())
    .forEach((p, i) => step("Given", i === 0, p.trim()));
  (data.steps ?? [])
    .filter((s) => s.trim())
    .forEach((s, i) => step("When", i === 0, s.trim()));
  (data.expectedResult ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((t, i) => step("Then", i === 0, t));

  if (isOutline && data.examples) {
    lines.push(...renderExamples(data.examples));
  }

  return lines.join("\n") + "\n";
}

const LEVEL_RANK: Record<GherkinLevel, number> = {
  basic: 0,
  outline: 1,
  advanced: 2,
};

/** Ordinal of a level, so callers can compare "at least" requirements. */
export function levelRank(level: GherkinLevel): number {
  return LEVEL_RANK[level];
}

/** Minimum level that can represent the given Gherkin, so the UI can auto-place
 *  the case and forbid downgrading below what the content needs (proposal 2):
 *  Background / Rule / multiple scenarios → advanced; a data table or
 *  `<placeholders>` → outline; otherwise basic. */
export function detectLevel(text: string): GherkinLevel {
  const s = summarizeFeature(text);
  if (s.background || s.rules.length > 0 || s.scenarios.length > 1) {
    return "advanced";
  }
  const parsed = fromGherkin(text);
  const hasExamples = !!parsed.examples?.headers.some((h) => h.trim());
  const hasPlaceholder = /<[^>\s][^>]*>/.test(text);
  if (hasExamples || hasPlaceholder) return "outline";
  return "basic";
}

/** Unique `<placeholder>` names found in the given texts, in order of first use
 *  (proposal 3b: each placeholder maps to an Examples column). */
export function placeholdersIn(texts: string[]): string[] {
  const out: string[] = [];
  for (const text of texts) {
    for (const m of text.matchAll(/<([^>\s][^>]*)>/g)) {
      const name = m[1].trim();
      if (name && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

/** Comment lines (`# ...`) of a feature, without the leading marker. */
export function extractComments(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("#"))
    .map((l) => l.replace(/^#\s?/, ""));
}

export interface NamedExampleTable {
  name: string;
  table: ExampleTable;
}

/** Every Examples table in a feature, tagged with its scenario name (proposal
 *  3a: shown read-only / as JSON in the advanced view). */
export function extractExamples(text: string): NamedExampleTable[] {
  const out: NamedExampleTable[] = [];
  let scenarioName = "";
  let collecting = false;
  let rows: string[][] = [];
  const flush = () => {
    if (rows.length) {
      out.push({
        name: scenarioName,
        table: { headers: rows[0], rows: rows.slice(1) },
      });
    }
    rows = [];
    collecting = false;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const scenario = line.match(/^Scenario(?:\s+Outline)?:\s*(.*)$/i);
    if (scenario) {
      flush();
      scenarioName = scenario[1].trim();
      continue;
    }
    if (/^Examples:/i.test(line)) {
      flush();
      collecting = true;
      continue;
    }
    if (collecting) {
      if (line.startsWith("|")) rows.push(parseRow(line));
      else if (line) flush();
    }
  }
  flush();
  return out;
}

export interface FeatureSummary {
  feature?: string;
  background: boolean;
  scenarios: { type: "scenario" | "outline"; name: string }[];
  rules: string[];
}

/** Structured, read-only overview of an advanced feature (for the Editor tab). */
export function summarizeFeature(text: string): FeatureSummary {
  const summary: FeatureSummary = { background: false, scenarios: [], rules: [] };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const feature = line.match(/^Feature:\s*(.*)$/i);
    if (feature) {
      summary.feature = feature[1].trim();
      continue;
    }
    if (/^Background:/i.test(line)) {
      summary.background = true;
      continue;
    }
    const rule = line.match(/^Rule:\s*(.*)$/i);
    if (rule) {
      summary.rules.push(rule[1].trim());
      continue;
    }
    const outline = line.match(/^Scenario\s+Outline:\s*(.*)$/i);
    if (outline) {
      summary.scenarios.push({ type: "outline", name: outline[1].trim() });
      continue;
    }
    const scenario = line.match(/^Scenario:\s*(.*)$/i);
    if (scenario) {
      summary.scenarios.push({ type: "scenario", name: scenario[1].trim() });
    }
  }
  return summary;
}

export interface ParsedGherkin {
  title?: string;
  preconditions: string[];
  steps: string[];
  expectedResult: string;
  examples?: ExampleTable;
  isOutline: boolean;
}

/** Splits a `| a | b |` table row into trimmed cells. */
function parseRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Parses the constrained Gherkin back into the structured fields, including a
 *  Scenario Outline's Examples table when present. */
export function fromGherkin(text: string): ParsedGherkin {
  const preconditions: string[] = [];
  const steps: string[] = [];
  const then: string[] = [];
  let title: string | undefined;
  let isOutline = false;
  let section: "given" | "when" | "then" | "examples" | null = null;
  const tableRows: string[][] = [];

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const feature = line.match(/^Feature:\s*(.*)$/i);
    if (feature) {
      title = feature[1].trim();
      continue;
    }
    const scenario = line.match(/^Scenario(\s+Outline)?:/i);
    if (scenario) {
      if (scenario[1]) isOutline = true;
      continue;
    }
    if (/^Examples:/i.test(line)) {
      section = "examples";
      continue;
    }
    if (section === "examples") {
      if (line.startsWith("|")) tableRows.push(parseRow(line));
      continue;
    }

    const kw = line.match(/^(Given|When|Then|And|But|\*)\s+(.*)$/i);
    if (!kw) continue;
    const keyword = kw[1].toLowerCase();
    const content = kw[2].trim();
    if (keyword === "given") section = "given";
    else if (keyword === "when") section = "when";
    else if (keyword === "then") section = "then";

    if (section === "given") preconditions.push(content);
    else if (section === "when") steps.push(content);
    else if (section === "then") then.push(content);
  }

  let examples: ExampleTable | undefined;
  if (tableRows.length) {
    examples = { headers: tableRows[0], rows: tableRows.slice(1) };
    isOutline = true;
  }

  return {
    title,
    preconditions,
    steps,
    expectedResult: then.join("\n"),
    examples,
    isOutline,
  };
}
