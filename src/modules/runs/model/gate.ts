import type { CycleCloseInput, ExitCriterion } from "@shared/contracts/contract";

// The quality gate at closing a cycle (DOC-02, ADR-0041), as the screens
// check it before asking the core: the same rules as `derive.rs::close_record`
// and its server twin, which decide (a client is never trusted).

/** The shortest justification a failing mandatory criterion takes. */
export const MIN_JUSTIFICATION = 20;
export const MAX_JUSTIFICATION = 2000;

export type GateVerdict = "go" | "goWithRisks" | "noGo";

export interface GateDecision {
  /** A manual criterion's mark; null until the person sets it. */
  manualMet: boolean | null;
  justification: string;
}

export interface GateRow {
  position: number;
  criterion: ExitCriterion;
  state: "met" | "notMet" | "noData" | "manual";
  /** Fails the gate: «No cumple», «Sin datos» (D3) or marked as not met. */
  failing: boolean;
  /** Mandatory and failing: it asks for a justification. */
  needsJustification: boolean;
  /** Manual and still unmarked. */
  needsMark: boolean;
  /** The justification is long enough (or not needed). */
  justified: boolean;
}

export interface GateState {
  rows: GateRow[];
  /** Failing mandatory criteria. */
  failing: number;
  /** Every mark and justification is there. */
  complete: boolean;
  /** The verdict the gate gives on its own: `go` when nothing mandatory
   *  fails; otherwise the person closing chooses. */
  verdict: GateVerdict | null;
}

export function criterionState(c: ExitCriterion): GateRow["state"] {
  if (c.kind === null || c.op === null) return "manual";
  return c.met === null ? "noData" : c.met ? "met" : "notMet";
}

const length = (s: string) => [...s.trim()].length;

export function gateState(
  criteria: ExitCriterion[],
  decisions: Record<number, GateDecision>,
): GateState {
  const rows = criteria.map((criterion, position): GateRow => {
    const d = decisions[position];
    const state = criterionState(criterion);
    const manualMet = d?.manualMet ?? null;
    const failing =
      state === "met" ? false : state === "manual" ? manualMet === false : true;
    const needsJustification = failing && criterion.blocking;
    const n = length(d?.justification ?? "");
    return {
      position,
      criterion,
      state,
      failing,
      needsJustification,
      needsMark: state === "manual" && manualMet === null,
      justified:
        n <= MAX_JUSTIFICATION && (!needsJustification || n >= MIN_JUSTIFICATION),
    };
  });
  const failing = rows.filter((r) => r.needsJustification).length;
  return {
    rows,
    failing,
    complete: rows.every((r) => !r.needsMark && r.justified),
    verdict: failing === 0 ? "go" : null,
  };
}

/** What «Cerrar ciclo» sends. */
export function closeInput(
  criteria: ExitCriterion[],
  decisions: Record<number, GateDecision>,
  verdict: GateVerdict | null,
): CycleCloseInput {
  return {
    ...(verdict && verdict !== "go" ? { verdict } : {}),
    decisions: criteria.map((_, position) => {
      const d = decisions[position];
      const justification = d?.justification.trim();
      return {
        position,
        ...(typeof d?.manualMet === "boolean" ? { manualMet: d.manualMet } : {}),
        ...(justification ? { justification } : {}),
      };
    }),
  };
}

/** The pill tone of a verdict (SPEC §4). */
export function verdictTone(v: string | null | undefined): "success" | "warning" | "error" | "neutral" {
  if (v === "go") return "success";
  if (v === "goWithRisks") return "warning";
  if (v === "noGo") return "error";
  return "neutral";
}

/** A refused closing's message key: `gate-justification-required:2` →
 *  `gate.error.justificationRequired`. */
export function gateErrorKey(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const code = /(gate-[a-z-]+|cycle-closed)/.exec(msg)?.[1] ?? "";
  const map: Record<string, string> = {
    "gate-justification-required": "gate.error.justificationRequired",
    "gate-justification-too-long": "gate.error.justificationTooLong",
    "gate-manual-unset": "gate.error.manualUnset",
    "gate-verdict-required": "gate.error.verdictRequired",
    "cycle-closed": "gate.error.closed",
  };
  return map[code] ?? "gate.error.generic";
}
