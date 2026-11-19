// Shared pieces of the finding and metric importers (ING-06, ADR-0053):
// the common severity scale, the location keys a derived fingerprint is
// built from, and the standard references (WCAG, CWE…) in one notation.

import { derivedFingerprint } from "../ids.js";
import type { PharosFinding } from "../schema.js";

export type Severity = PharosFinding["severity"];

/** Worst first: the order the UI sorts and counts by. */
export const SEVERITIES: readonly Severity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

/** axe `impact` → Pharos severity (`null`: axe could not tell). */
export function severityOfImpact(impact: string | null | undefined): Severity {
  switch (impact) {
    case "critical":
      return "critical";
    case "serious":
      return "high";
    case "moderate":
      return "medium";
    case "minor":
      return "low";
    default:
      return "info";
  }
}

/** A URL without query or fragment: the same page whatever the session. */
export function pageOf(url: string | undefined): string {
  if (!url) return "";
  const cut = url.search(/[?#]/);
  return cut < 0 ? url : url.slice(0, cut);
}

/** Location key of a web finding (axe, ZAP): the page and the selector. */
export const webLocationKey = (
  url: string | undefined,
  selector: string | undefined,
) => `${pageOf(url)} ${selector ?? ""}`.trim();

/** Location key of a code finding (SARIF): the relative path and the region
 *  start. Line numbers move with edits; that is why a tool's own fingerprint
 *  is preferred when it gives one. */
export const codeLocationKey = (
  uri: string | undefined,
  line: number | undefined,
  column: number | undefined,
) => `${uri ?? ""}:${line ?? ""}:${column ?? ""}`;

/** axe and SARIF tags → standard references (`WCAG2:1.4.3`, `CWE:79`…), in
 *  tag order, without duplicates. Tags that are not references are skipped. */
export function standardRefsOf(tags: Iterable<string>): string[] {
  const out: string[] = [];
  const add = (r: string) => {
    if (!out.includes(r)) out.push(r);
  };
  for (const raw of tags) {
    const t = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = /^wcag(\d)(\d)(\d+)$/i.exec(t)))
      add(`WCAG2:${m[1]}.${m[2]}.${m[3]}`);
    else if ((m = /^EN-(\d+(?:\.\d+)+)$/i.exec(t))) add(`EN301549:${m[1]}`);
    else if ((m = /^section508\.(.+)$/i.exec(t))) add(`S508:${m[1]}`);
    else if (
      (m = /^(?:external\/)?cwe\/cwe-0*(\d+)$/i.exec(t)) ||
      (m = /^CWE-0*(\d+)(?::|$)/i.exec(t))
    )
      add(`CWE:${m[1]}`);
    else if (
      (m =
        /^(?:external\/)?owasp[-/:]?(?:top10[-:]?\d{4}[-:/])?(A\d{1,2})\b/i.exec(
          t,
        ))
    )
      add(`OWASP:${m[1].toUpperCase()}`);
  }
  return out;
}

/** The WCAG conformance level an axe rule belongs to (`wcag21aa` → AA). */
export function wcagLevelOf(tags: Iterable<string>): string | undefined {
  for (const t of tags) {
    const m = /^wcag2\d?(a{1,3})$/i.exec(t);
    if (m) return m[1].toUpperCase();
  }
  return undefined;
}

/** The fingerprint of a finding: its own, or one derived from the tool, the
 *  rule and its location (a web location if it has a URL or a selector, else
 *  a code location). Both persisters need one (ADR-0053). */
export function fingerprintOf(f: PharosFinding, tool: string): string {
  if (f.fingerprint?.trim()) return f.fingerprint;
  const loc = (f.location ?? {}) as Record<string, unknown>;
  const str = (k: string) =>
    typeof loc[k] === "string" ? (loc[k] as string) : undefined;
  const num = (k: string) =>
    typeof loc[k] === "number" ? (loc[k] as number) : undefined;
  const key =
    str("url") !== undefined || str("selector") !== undefined
      ? webLocationKey(str("url"), str("selector"))
      : codeLocationKey(str("uri"), num("line"), num("column"));
  return derivedFingerprint(tool, f.ruleId, key);
}
