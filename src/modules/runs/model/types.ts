import type { PillTone } from "@shared/ui/StatusPill";

/** A case the tray can link a test to (loaded by the composing module, so
 *  this module never depends on test-cases). */
export interface LinkableCase {
  id: string;
  scenarioId: string;
  title: string;
}

/** The pill tone of a result status (SPEC §4). */
export function statusTone(status: string): PillTone {
  if (status === "passed") return "success";
  if (status === "failed") return "error";
  if (status === "blocked") return "warning";
  return "neutral";
}
