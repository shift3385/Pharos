/**
 * Cross-cutting form validation (UX-01, ADR-0027).
 *
 * Pure rules return an `Issue` or `null`; forms collect them and render them
 * through `FormField` / `ErrorSummary` (shared/ui/FormField.tsx). Messages are
 * i18n keys under `validation.*`, so every form words the same problem the
 * same way.
 *
 * Severity is the draft rule: an `error` blocks saving and is reserved for data
 * integrity (an empty title, an invalid or duplicated stable key, a setting
 * outside its range). Everything else is a `warning`: the work saves anyway,
 * and the warning stays visible, so drafts are never blocked silently.
 */

export type Severity = "error" | "warning";

export interface Issue {
  /** i18n key under `validation.` (e.g. "required", "duplicateRow"). */
  code: string;
  severity: Severity;
  /** Interpolation values for the message. */
  params?: Record<string, string | number>;
}

const issue = (code: string, severity: Severity, params?: Issue["params"]): Issue => ({
  code,
  severity,
  ...(params ? { params } : {}),
});

/** A value that must not be blank. */
export function required(value: string | null | undefined, severity: Severity = "error"): Issue | null {
  return (value ?? "").trim() === "" ? issue("required", severity) : null;
}

/** A number typed into a field: must parse, be an integer when asked, and stay
 *  within [min, max]. Takes the raw input so "" and "abc" are caught too. */
export function numberInRange(
  raw: string | number,
  { min, max, integer = false }: { min?: number; max?: number; integer?: boolean },
  severity: Severity = "error",
): Issue | null {
  const text = String(raw).trim();
  const n = Number(text);
  if (text === "" || !Number.isFinite(n)) return issue("number", severity);
  if (integer && !Number.isInteger(n)) return issue("integer", severity);
  if (min !== undefined && n < min) return issue("min", severity, { min });
  if (max !== undefined && n > max) return issue("max", severity, { max });
  return null;
}

/** An end date (ISO yyyy-mm-dd) that comes before its start. Blank dates are
 *  not compared: they are a separate `required` concern. */
export function dateOrder(start: string, end: string, severity: Severity = "warning"): Issue | null {
  return start && end && end < start ? issue("dateOrder", severity) : null;
}

/** A value that must match a format; `example` shows the expected shape. */
export function format(
  value: string,
  pattern: RegExp,
  example: string,
  severity: Severity = "error",
): Issue | null {
  const v = value.trim();
  return v !== "" && !pattern.test(v) ? issue("format", severity, { example }) : null;
}

/** Indexes of the rows that repeat an earlier row. Keys are compared trimmed
 *  and case-insensitively; rows with an empty key are never duplicates. */
export function duplicateRows<T>(rows: readonly T[], keyOf: (row: T) => string): Set<number> {
  const seen = new Set<string>();
  const dupes = new Set<number>();
  rows.forEach((row, i) => {
    const key = keyOf(row).trim().toLocaleLowerCase();
    if (key === "") return;
    if (seen.has(key)) dupes.add(i);
    else seen.add(key);
  });
  return dupes;
}

/** The issue for a duplicated row, or null. */
export function duplicateRow(dupes: Set<number>, index: number, severity: Severity = "warning"): Issue | null {
  return dupes.has(index) ? issue("duplicateRow", severity) : null;
}

/** True when any issue blocks saving. */
export function hasBlocking(issues: readonly (Issue | null | undefined)[]): boolean {
  return issues.some((i) => i?.severity === "error");
}

/** Drops the nulls of a list of rule results. */
export function compact(issues: readonly (Issue | null | undefined)[]): Issue[] {
  return issues.filter((i): i is Issue => i != null);
}
