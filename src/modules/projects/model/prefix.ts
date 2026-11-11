// Case-key prefixes that never overlap (NC-030, MAN-03). Two projects'
// prefixes overlap when, without the separator at the end and ignoring case,
// they are equal or one starts with the other: «PH-» and «ph_» are the same
// prefix, and «PH-» and «PHA-» overlap because «PHA-001» starts with «PH».
// Keys are read back by their prefix (imports, the matrix, a search), so an
// overlap would make «PH» find the cases of both projects.
import type { Issue } from "@shared/validation";

/** The prefix without its trailing separator(s), upper case: «ph-» → «PH». */
export const prefixCore = (prefix: string): string =>
  prefix
    .trim()
    .replace(/[^\p{L}\p{N}]+$/u, "")
    .toLocaleUpperCase("en");

/** True when `a` and `b` are equal or one starts with the other (see above).
 *  An empty prefix overlaps nothing: the form asks for one first. */
export function prefixesOverlap(a: string, b: string): boolean {
  const x = prefixCore(a);
  const y = prefixCore(b);
  if (!x || !y) return false;
  return x.startsWith(y) || y.startsWith(x);
}

export interface PrefixOwner {
  id: string;
  name: string;
  caseIdPrefix: string;
}

/** The first other project whose prefix overlaps `prefix`, if any. */
export function overlappingProject<T extends PrefixOwner>(
  prefix: string,
  projects: readonly T[],
  selfId?: string,
): T | undefined {
  return projects.find((p) => p.id !== selfId && prefixesOverlap(prefix, p.caseIdPrefix));
}

/** The field's issue: an empty prefix, or one that overlaps another project's. */
export function prefixIssue(prefix: string, projects: readonly PrefixOwner[], selfId?: string): Issue | null {
  if (!prefixCore(prefix)) return { code: "projects.prefix.required", severity: "error" };
  const other = overlappingProject(prefix, projects, selfId);
  return other
    ? { code: "projects.prefix.overlap", severity: "error", params: { prefix: other.caseIdPrefix, name: other.name } }
    : null;
}

const STOP = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "o", "u", "a", "en", "para", "con", "por", "the", "of", "and", "for", "to"]);

/** The letters and digits of a word, without accents, upper case. */
const clean = (word: string) =>
  word
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLocaleUpperCase("en");

const SEPARATOR = "-";

/**
 * A free prefix for a new project called `name`: the first candidate that
 * overlaps no other project's, with «-» after it. In order:
 *  1. the first three letters of the first word («Pharos» → «PHA-»);
 *  2. the initials of its words, without «de», «la»… («API de
 *     sincronización» → «AS-»), when there are two or more;
 *  3. the first two, four and five letters of the first word;
 *  4. the first letter followed by every pair of letters A–Z («PAA-»,
 *     «PAB-»…), which always ends with a free one.
 * A name with no letters or digits starts from «P».
 */
export function suggestPrefix(name: string, projects: readonly PrefixOwner[]): string {
  const words = name.split(/\s+/).map(clean).filter(Boolean);
  const significant = name
    .split(/\s+/)
    .filter((w) => !STOP.has(w.toLocaleLowerCase()))
    .map(clean)
    .filter(Boolean);
  const first = words[0] ?? "P";
  const initials = significant.map((w) => w[0]).join("");
  const candidates = [
    first.slice(0, 3),
    ...(significant.length >= 2 ? [initials.slice(0, 4)] : []),
    first.slice(0, 2),
    first.slice(0, 4),
    first.slice(0, 5),
  ];
  const taken = (core: string) => projects.some((p) => prefixesOverlap(core, p.caseIdPrefix));
  for (const core of candidates) if (core.length >= 2 && !taken(core)) return core + SEPARATOR;
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const b of letters)
    for (const c of letters) {
      const core = first[0] + b + c;
      if (!taken(core)) return core + SEPARATOR;
    }
  return first.slice(0, 3) + SEPARATOR;
}
