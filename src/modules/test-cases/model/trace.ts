import type { TestCaseData } from "./types";

/** Text of the case's "Traceability" field in official documents: the linked
 *  requirement keys first, then the free-text other references. */
export function traceabilityText(d: TestCaseData): string {
  const keys = (d.requirementKeys ?? []).join(", ");
  const free = (d.traceability ?? "").trim();
  return [keys, free].filter(Boolean).join(" · ");
}
