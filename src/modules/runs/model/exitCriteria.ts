import type { ExitCriterion } from "@shared/contracts/contract";

// Exit criteria (contract v1, R11) are evaluated by the derivation itself
// (`execution/derive.rs` and its server twin), the one implementation. This
// only reads them for the screens: a default criterion (no plan, or a plan
// without criteria: `index` null) is shown in the user's language.

export type ExitState = "met" | "notMet" | "noData";

export interface ShownCriterion extends ExitCriterion {
  /** The text to show: the plan's own, or the localized default. */
  label: string;
  state: ExitState;
}

const DEFAULT_KEY: Record<string, string> = {
  executed: "testPlan.closureDefault.executed",
  criticalDefects: "testPlan.closureDefault.defects",
  coverage: "testPlan.closureDefault.coverage",
};

export function evaluateExitCriteria(
  summary: { exitCriteria: ExitCriterion[] },
  t: (key: string) => string,
): ShownCriterion[] {
  return summary.exitCriteria.map((c) => ({
    ...c,
    label:
      c.index === null && c.kind && DEFAULT_KEY[c.kind]
        ? t(DEFAULT_KEY[c.kind])
        : c.criterion,
    state: c.met === null ? "noData" : c.met ? "met" : "notMet",
  }));
}

/** A criterion's value as text: `95 %` for ratios, a count otherwise. */
export function criterionValue(c: ExitCriterion): string {
  if (c.value === null) return "—";
  const n = Number.isInteger(c.value) ? String(c.value) : c.value.toFixed(1);
  return c.kind === "criticalDefects" ? n : `${n} %`;
}
