// Test cycles and configurations (CYC-01, ADR-0017). The shapes are the Rust
// types of `cycles.rs` (generated contracts); the web's API returns the same.

import type { Contract } from "@shared/contracts";
import type { PillTone } from "@shared/ui/StatusPill";

export type Configuration = Contract.Configuration;
export type ConfigurationInput = Contract.ConfigurationInput;
export type LabelClash = Contract.LabelClash;
export type TestCycle = Contract.TestCycle;
export type TestCycleInput = Contract.TestCycleInput;
export type CycleSummary = Contract.CycleSummary;
export type CycleItem = Contract.CycleItem;
export type CycleItemInput = Contract.CycleItemInput;
export type CycleFilter = Contract.CycleFilter;
export type AddOutcome = Contract.AddOutcome;
export type ExecuteInput = Contract.ExecuteInput;
export type CycleProgress = Contract.CycleProgress;
export type ProgressCell = Contract.ProgressCell;
export type ProgressSummary = Contract.ProgressSummary;
/** A run of the cycle as the runs tab shows it (EJE-01's `Run`). */
export type CycleRun = Pick<
  Contract.Run,
  "id" | "runKey" | "title" | "status" | "configurationId" | "startedAt" | "finishedAt" | "build" | "environment"
>;

export const CYCLE_STATUSES = ["planned", "active", "closed"] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export const ATTRIBUTE_KEYS = ["browser", "os", "device", "locale"] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

/** A case the cycle can take, as the composing page loads it. */
export interface CaseOption {
  id: string;
  scenarioId: string;
  title: string;
  status: string;
  priority: string;
}

/** Statuses of a progress cell: a result status, or `not_run`. */
export type CellStatus = "passed" | "failed" | "blocked" | "skipped" | "other" | "not_run";

/** The pill tone of a cycle status (SPEC §4). */
export function cycleTone(status: string): PillTone {
  if (status === "active") return "info";
  if (status === "closed") return "success";
  return "neutral";
}

/** The pill tone of a cell (SPEC §4: Pasa success, Falla error, Bloqueado
 *  warning, No ejecutado neutral). */
export function cellTone(status: string): PillTone {
  switch (status) {
    case "passed":
      return "success";
    case "failed":
      return "error";
    case "blocked":
      return "warning";
    case "not_run":
      return "neutral";
    default:
      return "info";
  }
}

/** Known cell statuses; anything else reads as «Otro». */
export function cellStatus(status: string): CellStatus {
  return (["passed", "failed", "blocked", "skipped", "not_run"] as const).includes(status as never)
    ? (status as CellStatus)
    : "other";
}

/** Percentages of a progress summary, rounded down so 99.6 % never shows as
 *  100 %. */
export function percents(s: ProgressSummary): { executed: number; passed: number } {
  if (s.total === 0) return { executed: 0, passed: 0 };
  return {
    executed: Math.floor((s.executed * 100) / s.total),
    passed: Math.floor((s.passed * 100) / s.total),
  };
}

/** «Chrome · Windows 11 · es-ES»: the non-empty attributes of a configuration. */
export function attributesLine(attributes: Record<string, string>): string {
  return ATTRIBUTE_KEYS.map((k) => attributes[k])
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .join(" · ");
}

/** The repository's error code at the start of a message (`match-label-taken:
 *  …`, `cycle-closed`), or null. */
export function errorCode(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const m = /^([a-z]+(?:-[a-z]+)+)/.exec(msg.trim());
  return m ? m[1] : null;
}
