import type {
  ExampleTable,
  Flow,
  GherkinLevel,
  TestCaseData,
} from "../model/types";

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `flow-${Math.random().toString(36).slice(2)}`;
}

/** Creates an empty flow (main or alternative) for the flows editor. */
export function newFlow(name: string): Flow {
  return { id: uid(), name, preconditions: [], steps: [], expectedResult: "" };
}

const INDENT_STEP = "    ";
const INDENT_TABLE = "      ";

// ---- Tags (TRZ-03) ----
// The case ID travels as a scenario tag (@TC-001) and linked requirements as
// feature tags (@REQ-014) — never as the scenario name, so renaming a scenario
// never breaks the link. In a Scenario Outline the ID goes at scenario level.
// Tags are stored without the leading "@".

/** Turns a value into a valid tag token: no "@" prefix duplicated, no spaces. */
function tagToken(value: string): string {
  return value.trim().replace(/^@+/, "").replace(/\s+/g, "_");
}

/** A provisional key (`ATS_?KQZD`, DAT-01): created offline without a key
 *  block, replaced by a definitive one on the next sync. It is never written
 *  as a tag, so no automation repository ever depends on it (ADR-0010). */
export function isProvisionalKey(key: string): boolean {
  return key.includes("?");
}

/** One tag line (`@a @b`) with the given indent, or nothing when empty.
 *  Provisional keys are left out. */
function tagLine(indent: string, tags: (string | undefined)[]): string[] {
  const tokens: string[] = [];
  for (const t of tags) {
    const token = t && !isProvisionalKey(t) ? tagToken(t) : "";
    if (token && !tokens.includes(token)) tokens.push(token);
  }
  return tokens.length ? [`${indent}${tokens.map((t) => `@${t}`).join(" ")}`] : [];
}

/** Tags of a tag line (`@a @b # comment`), or null when the line is not one. */
function tagsOf(line: string): string[] | null {
  if (!line.startsWith("@")) return null;
  return line
    .replace(/\s#.*$/, "")
    .split(/\s+/)
    .filter((t) => t.startsWith("@") && t.length > 1)
    .map((t) => t.slice(1));
}

/** What decides which parsed tags are managed by Pharos (the case ID and the
 *  requirement links) and which are the user's own (`@smoke`). */
export interface TagContext {
  scenarioId: string;
  /** Project case-ID prefix: any `<prefix><digits>` tag is treated as an ID tag. */
  caseIdPrefix: string;
  /** Keys of the project's requirements. */
  knownRequirementKeys: string[];
  /** Keys the case links today (kept while their tag stays, even if deleted). */
  linkedRequirementKeys: string[];
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A tag that is the case ID. It is always re-rendered from the ID field, so
 *  editing it in the Gherkin view never changes the ID (the field does). */
export function isCaseIdTag(tag: string, ctx: TagContext): boolean {
  if (ctx.scenarioId && tag === tagToken(ctx.scenarioId)) return true;
  return !!ctx.caseIdPrefix && new RegExp(`^${escapeRegExp(tagToken(ctx.caseIdPrefix))}\\d+$`).test(tag);
}

/** Splits parsed feature tags into requirement links and the user's own tags. */
export function splitFeatureTags(
  tags: string[],
  ctx: TagContext,
): { requirementKeys: string[]; featureTags: string[] } {
  const requirementKeys: string[] = [];
  const featureTags: string[] = [];
  for (const tag of tags) {
    const isRequirement =
      ctx.knownRequirementKeys.includes(tag) || ctx.linkedRequirementKeys.includes(tag);
    const target = isRequirement ? requirementKeys : featureTags;
    if (!target.includes(tag)) target.push(tag);
  }
  return { requirementKeys, featureTags };
}

/** The user's own scenario tags (the case ID tag is dropped). */
export function userScenarioTags(tags: string[], ctx: TagContext): string[] {
  return tags.filter((t, i) => !isCaseIdTag(t, ctx) && tags.indexOf(t) === i);
}

/** Feature-level tags of a case: its linked requirements, then the user's own. */
function featureTagLine(data: Pick<TestCaseData, "requirementKeys" | "featureTags">): string[] {
  return tagLine("", [...(data.requirementKeys ?? []), ...(data.featureTags ?? [])]);
}

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
 *  precondiciones → Given, pasos → When, resultado esperado → Then. The case ID
 *  (`scenarioId`) is the scenario tag and the linked requirements are feature
 *  tags (TRZ-03). */
export function toGherkin(title: string, data: TestCaseData, scenarioId = ""): string {
  const level: GherkinLevel = data.gherkinLevel ?? "basic";

  if (level === "advanced") {
    return data.featureSource && data.featureSource.trim()
      ? data.featureSource
      : scaffoldAdvanced(title, data);
  }

  const isOutline = level === "outline";
  const lines: string[] = [];
  lines.push(...featureTagLine(data));
  lines.push(`Feature: ${title || "Untitled"}`);
  lines.push(...tagLine("  ", [scenarioId, ...(data.scenarioTags ?? [])]));
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

// ---- Advanced level: flows (main + alternatives) <-> Gherkin ----

const step = (lines: string[], kw: string, first: boolean, text: string) =>
  lines.push(`${INDENT_STEP}${first ? kw : "And"} ${text}`);

/** Generates the Gherkin of an advanced case from its shared Background and its
 *  flows (each flow is a Scenario, or Scenario Outline when it has Examples).
 *  The case is the whole Feature, so every scenario carries the case ID tag. */
export function flowsToGherkin(
  title: string,
  background: string[],
  flows: Flow[],
  tags: { scenarioId?: string; requirementKeys?: string[]; featureTags?: string[] } = {},
): string {
  const lines: string[] = [...featureTagLine(tags), `Feature: ${title || "Untitled"}`];

  const bg = (background ?? []).map((s) => s.trim()).filter(Boolean);
  if (bg.length) {
    lines.push("", "  Background:");
    bg.forEach((p, i) => step(lines, "Given", i === 0, p));
  }

  for (const flow of flows) {
    const isOutline = !!flow.examples?.headers.some((h) => h.trim());
    lines.push("", ...tagLine("  ", [tags.scenarioId, ...(flow.tags ?? [])]));
    lines.push(`  ${isOutline ? "Scenario Outline" : "Scenario"}: ${flow.name || "Escenario"}`);
    (flow.preconditions ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((p, i) => step(lines, "Given", i === 0, p));
    (flow.steps ?? [])
      .filter((s) => s.trim())
      .forEach((s, i) => step(lines, "When", i === 0, s.trim()));
    (flow.expectedResult ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((t, i) => step(lines, "Then", i === 0, t));
    if (isOutline && flow.examples) lines.push(...renderExamples(flow.examples));
  }

  return lines.join("\n") + "\n";
}

export interface ParsedFlows {
  title?: string;
  /** Raw feature-level tags (see `splitFeatureTags`); each flow's raw scenario
   *  tags are in `flow.tags` (see `userScenarioTags`). */
  featureTags: string[];
  background: string[];
  flows: Flow[];
}

/** Parses a whole feature into shared Background + flows, so hand-edited Gherkin
 *  stays in sync with the structured flows editor (Rule lines are ignored — the
 *  flow model does not group). */
export function parseFeatureFlows(text: string): ParsedFlows {
  let title: string | undefined;
  const background: string[] = [];
  const flows: Flow[] = [];
  let cur:
    | (Omit<Flow, "expectedResult"> & { then: string[] })
    | null = null;
  let mode: "bg" | "given" | "when" | "then" | "examples" | null = null;
  let table: string[][] = [];
  let featureTags: string[] = [];
  let pendingTags: string[] = [];

  const closeFlow = () => {
    if (!cur) return;
    if (table.length) cur.examples = { headers: table[0], rows: table.slice(1) };
    table = [];
    flows.push({
      id: cur.id,
      name: cur.name,
      preconditions: cur.preconditions,
      steps: cur.steps,
      expectedResult: cur.then.join("\n"),
      examples: cur.examples,
      tags: cur.tags,
    });
    cur = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const tags = tagsOf(line);
    if (tags) {
      pendingTags.push(...tags);
      continue;
    }
    const feat = line.match(/^Feature:\s*(.*)$/i);
    if (feat) {
      title = feat[1].trim();
      featureTags = pendingTags;
      pendingTags = [];
      continue;
    }
    if (/^Background:/i.test(line)) {
      closeFlow();
      mode = "bg";
      pendingTags = [];
      continue;
    }
    // Rule and Examples tags are not modelled (the flow model has no rules and
    // one table per flow), so they are dropped rather than misattributed.
    if (/^Rule:/i.test(line)) {
      pendingTags = [];
      continue;
    }
    const sc = line.match(/^Scenario(?:\s+Outline)?:\s*(.*)$/i);
    if (sc) {
      closeFlow();
      cur = { id: uid(), name: sc[1].trim(), preconditions: [], steps: [], then: [], tags: pendingTags };
      pendingTags = [];
      mode = null;
      continue;
    }
    if (/^Examples:/i.test(line)) {
      mode = "examples";
      pendingTags = [];
      continue;
    }
    if (mode === "examples") {
      if (line.startsWith("|")) table.push(parseRow(line));
      continue;
    }

    const kw = line.match(/^(Given|When|Then|And|But|\*)\s+(.*)$/i);
    if (!kw) continue;
    const keyword = kw[1].toLowerCase();
    const content = kw[2].trim();
    if (keyword === "given") mode = mode === "bg" ? "bg" : "given";
    else if (keyword === "when") mode = "when";
    else if (keyword === "then") mode = "then";

    if (mode === "bg") background.push(content);
    else if (cur) {
      if (mode === "given") (cur.preconditions ??= []).push(content);
      else if (mode === "when") cur.steps.push(content);
      else if (mode === "then") cur.then.push(content);
    }
  }
  closeFlow();
  return { title, featureTags, background, flows };
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
  /** Raw feature-level tags (see `splitFeatureTags`). */
  featureTags: string[];
  /** Raw scenario-level tags (see `userScenarioTags`). */
  scenarioTags: string[];
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
  let featureTags: string[] = [];
  let scenarioTags: string[] = [];
  let pendingTags: string[] = [];

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const tags = tagsOf(line);
    if (tags) {
      pendingTags.push(...tags);
      continue;
    }
    const feature = line.match(/^Feature:\s*(.*)$/i);
    if (feature) {
      title = feature[1].trim();
      featureTags = pendingTags;
      pendingTags = [];
      continue;
    }
    const scenario = line.match(/^Scenario(\s+Outline)?:/i);
    if (scenario) {
      if (scenario[1]) isOutline = true;
      if (!scenarioTags.length) scenarioTags = pendingTags;
      pendingTags = [];
      continue;
    }
    if (/^Examples:/i.test(line)) {
      section = "examples";
      pendingTags = [];
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
    featureTags,
    scenarioTags,
    preconditions,
    steps,
    expectedResult: then.join("\n"),
    examples,
    isOutline,
  };
}
