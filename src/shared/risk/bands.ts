// Risk bands (TRZ-04, ADR-0043): a requirement's risk level is likelihood ×
// impact (1–25, ISTQB); a project splits it into low / medium / high with two
// thresholds. The same rule as `runs::derive::RiskBands` (Rust) and the
// server's `checkedBands`: valid when `1 ≤ low < medium ≤ 24`, the ADR-0013
// defaults (4 and 12) otherwise.

export type RiskBandName = "high" | "medium" | "low";

export interface RiskBands {
  low: number;
  medium: number;
}

export const DEFAULT_RISK_BANDS: RiskBands = { low: 4, medium: 12 };
export const RISK_LEVEL_MAX = 25;

/** Why a pair is not valid, or null when it is. */
export function riskBandsError(
  low: number,
  medium: number,
): "integer" | "lowRange" | "order" | "mediumRange" | null {
  if (!Number.isInteger(low) || !Number.isInteger(medium)) return "integer";
  if (low < 1) return "lowRange";
  if (medium > RISK_LEVEL_MAX - 1) return "mediumRange";
  if (low >= medium) return "order";
  return null;
}

/** The pair when valid, else null. */
export function checkedRiskBands(low: unknown, medium: unknown): RiskBands | null {
  return typeof low === "number" && typeof medium === "number" && riskBandsError(low, medium) === null
    ? { low, medium }
    : null;
}

/** A project's bands (its fields `riskBandLow` / `riskBandMedium`), or the
 *  defaults when it has none or they are not valid. */
export function projectRiskBands(p: { riskBandLow?: number | null; riskBandMedium?: number | null } | null | undefined): RiskBands {
  return checkedRiskBands(p?.riskBandLow, p?.riskBandMedium) ?? DEFAULT_RISK_BANDS;
}

export function riskBandOf(level: number, bands: RiskBands = DEFAULT_RISK_BANDS): RiskBandName {
  return level <= bands.low ? "low" : level <= bands.medium ? "medium" : "high";
}

export const sameBands = (a: RiskBands, b: RiskBands) => a.low === b.low && a.medium === b.medium;

/** The five values of each risk factor. */
export const RISK_LEVELS = [1, 2, 3, 4, 5];

/** How many cells of the 5×5 grid (likelihood × impact) fall in each band. */
export function cellsPerBand(bands: RiskBands): Record<RiskBandName, number> {
  const out: Record<RiskBandName, number> = { low: 0, medium: 0, high: 0 };
  for (const l of RISK_LEVELS) for (const i of RISK_LEVELS) out[riskBandOf(l * i, bands)]++;
  return out;
}
