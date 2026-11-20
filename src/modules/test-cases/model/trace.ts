import type { TestCaseData } from "./types";

/** Text of the case's "Traceability" field in official documents: the linked
 *  requirement keys first, then the free-text other references. */
export function traceabilityText(d: TestCaseData): string {
  const keys = (d.requirementKeys ?? []).join(", ");
  const free = (d.traceability ?? "").trim();
  return [keys, free].filter(Boolean).join(" · ");
}

/** The reverse of `traceabilityText` for an imported case (FIX-42): every
 *  comma- or «·»-separated entry of the free text that is the key of one of
 *  the project's requirements (`keys`, case-insensitive) becomes a link, so
 *  a case exported and imported again keeps its requirements. Anything else
 *  stays as free text, as written. */
export function linkTracedRequirements(d: TestCaseData, keys: readonly string[]): TestCaseData {
  const text = (d.traceability ?? "").trim();
  if (!text || keys.length === 0) return d;
  const byLower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  const linked = [...(d.requirementKeys ?? [])];
  const rest = text
    .split(/\s+·\s+/)
    .map((part) =>
      part
        .split(/\s*[,;]\s*/)
        .filter((piece) => {
          const key = byLower.get(piece.trim().toLowerCase());
          if (!key) return true;
          if (!linked.includes(key)) linked.push(key);
          return false;
        })
        .join(", "),
    )
    .filter((part) => part.trim())
    .join(" · ");
  if (linked.length === (d.requirementKeys ?? []).length) return d;
  return { ...d, requirementKeys: linked, traceability: rest };
}
