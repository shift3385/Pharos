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

/** A stored time as an instant: RFC 3339, SQLite's `YYYY-MM-DD HH:MM:SS`,
 *  and a time without a zone (JUnit's `timestamp`) all read as UTC, as the
 *  desktop compares them (`runs/derive.rs`). */
export function instantOf(s: string): Date | undefined {
  const t = s.trim().replace(" ", "T");
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(t);
  const d = new Date(zoned ? t : `${t}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
