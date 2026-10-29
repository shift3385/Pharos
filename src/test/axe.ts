import axe from "axe-core";
import { expect } from "vitest";

// Automated WCAG 2.1 A/AA checks for component tests (UX-05, ADR-0027).
// jsdom has no layout or CSS, so `color-contrast` is off here: the token
// contrast test (shared/theme/contrast.test.ts) covers it instead. `region`
// is off because components render outside the app's landmarks.
const OPTIONS: axe.RunOptions = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
  rules: {
    "color-contrast": { enabled: false },
    region: { enabled: false },
  },
};

/** axe violations under `node`, one readable line per rule. */
export async function axeViolations(node: Element = document.body): Promise<string[]> {
  const result = await axe.run(node, OPTIONS);
  return result.violations.map(
    (v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
  );
}

/** Fails the test with the list of violations, if any. */
export async function expectNoAxeViolations(node?: Element): Promise<void> {
  expect(await axeViolations(node)).toEqual([]);
}
