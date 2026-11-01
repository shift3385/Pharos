import { isOpenDefect } from "./lifecycle";
import type { Defect } from "./types";

/** The status chips of the defects list. */
export type StatusFilter = "open" | "all" | "closed";

const fold = (v: string) =>
  v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** A defect matches the status chip, the severities chosen (none = any) and
 *  the search (key, title, labels, external key). */
export function matches(d: Defect, status: StatusFilter, severities: ReadonlySet<string>, query: string): boolean {
  const q = fold(query.trim());
  const open = isOpenDefect(d.status);
  return (
    (status === "all" || (status === "open" ? open : !open)) &&
    (severities.size === 0 || severities.has(d.severity)) &&
    (!q || [d.defectKey, d.title, d.externalKey ?? "", ...(d.data.labels ?? [])].some((v) => fold(v).includes(q)))
  );
}
