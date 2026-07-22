import type { TestCaseData } from "../model/types";

/** Renders the structured case as Gherkin (Feature/Scenario/Given/When/Then).
 *  Precondiciones → Given, pasos → When, resultado esperado → Then (spec §5.3). */
export function toGherkin(title: string, data: TestCaseData): string {
  const lines: string[] = [];
  lines.push(`Feature: ${title || "Untitled"}`);
  lines.push(`  Scenario: ${title || "Scenario"}`);

  const step = (kw: string, first: boolean, text: string) =>
    lines.push(`    ${first ? kw : "And"} ${text}`);

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

  return lines.join("\n") + "\n";
}

export interface ParsedGherkin {
  title?: string;
  preconditions: string[];
  steps: string[];
  expectedResult: string;
}

/** Parses the constrained Gherkin back into the structured fields. */
export function fromGherkin(text: string): ParsedGherkin {
  const preconditions: string[] = [];
  const steps: string[] = [];
  const then: string[] = [];
  let title: string | undefined;
  let section: "given" | "when" | "then" | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const feature = line.match(/^Feature:\s*(.*)$/i);
    if (feature) {
      title = feature[1].trim();
      continue;
    }
    if (/^Scenario:/i.test(line)) continue;

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

  return { title, preconditions, steps, expectedResult: then.join("\n") };
}
