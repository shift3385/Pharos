// The project library (CAS-01, ADR-0055): shared steps and datasets, and how
// a case refers to them. The core (`shared_library.rs`) and the server
// (`shared-library.ts`) own the rules; these are the shapes the UI reads.

import type { Contract } from "@shared/contracts";

export type LibraryImpact = Contract.LibraryImpact;
export type LibraryImpactCase = Contract.LibraryImpactCase;
export type LibraryItem = Contract.LibraryItem;
export type LibraryRefStatus = Contract.LibraryRefStatus;
export type LibrarySave = Contract.LibrarySave;
export type LibraryVersion = Contract.LibraryVersion;
export type LibraryInput = Contract.LibraryInput;

export type LibraryKind = "shared_step" | "dataset";
/** The tab in the URL (`?tab=steps|datasets`, ADR-0029). */
export type LibraryTab = "steps" | "datasets";

export const kindOfTab = (tab: LibraryTab): LibraryKind =>
  tab === "datasets" ? "dataset" : "shared_step";
export const tabOfKind = (kind: string): LibraryTab =>
  kind === "dataset" ? "datasets" : "steps";

/** A step of a shared step (`{id, text, expected?}`, like a case step). */
export interface LibraryStep {
  id: string;
  text: string;
  expected?: string;
}

/** A parameter of a shared step: `<name>` in its texts. `default` only fills
 *  the argument field when the step is inserted. */
export interface SharedParam {
  id?: string;
  name: string;
  default?: string;
}

export interface DatasetColumn {
  id: string;
  name: string;
}

/** A dataset row: one value per column id. */
export interface DatasetRow {
  id: string;
  values: Record<string, string>;
}

/** One insertion («call») of a shared step in a case (`data.sharedRefs`). */
export interface SharedRef {
  id: string;
  sharedStepId: string;
  version?: number;
  revisionId?: string;
  /** True: follows the latest version; false: pinned to `revisionId`. */
  follow: boolean;
  list: "steps" | "preconditions";
  /** Ids of the copied steps in the case, in order. */
  stepIds: string[];
  /** By parameter name: empty passes `<name>` on to the case. */
  args: Record<string, string>;
  name?: string;
}

/** The dataset bound to the case's Examples table (`data.datasetRefs`). */
export interface DatasetRef {
  /** "case" in 0.6.0. */
  id: string;
  datasetId: string;
  version?: number;
  revisionId?: string;
  follow: boolean;
  /** A subset of the dataset's rows; absent = all. */
  rowIds?: string[];
  /** Case parameter → column name, when they do not match by name. */
  columnMap?: Record<string, string>;
  name?: string;
}

/** Limits of ADR-0055 §1 (the core and the server check them too). */
export const LIMITS = {
  name: 200,
  description: 10_000,
  steps: 50,
  params: 20,
  stepText: 4_000,
  columns: 30,
  rows: 500,
  /** UTF-16 code units, as the core counts (`js_len`). */
  cell: 4_096,
  paramName: 40,
} as const;

/** The library section of a project, with a tab and maybe an item open
 *  (`/projects/:id/library?tab=…&item=…`). It repeats the shape of
 *  `projectPath(id, "library")` (the projects module depends on this one). */
export function libraryLink(
  projectId: string,
  tab: LibraryTab = "steps",
  itemId?: string,
): string {
  const q = new URLSearchParams({ tab });
  if (itemId) q.set("item", itemId);
  return `/projects/${encodeURIComponent(projectId)}/library?${q.toString()}`;
}

/** The Casos section with one case open (the shape of test-cases' `caseLink`). */
export const caseHref = (projectId: string, caseId: string) =>
  `/projects/${encodeURIComponent(projectId)}/cases?case=${encodeURIComponent(caseId)}`;

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** A shared step's steps (tolerant reader of `LibraryItem.body`). */
export function stepsOfItem(body: unknown): LibraryStep[] {
  if (!Array.isArray(body)) return [];
  return body.filter(isObject).map((s) => ({
    id: str(s.id),
    text: str(s.text),
    ...(str(s.expected) ? { expected: str(s.expected) } : {}),
  }));
}

/** A shared step's parameters (`LibraryItem.definition`). */
export function paramsOfItem(definition: unknown): SharedParam[] {
  if (!Array.isArray(definition)) return [];
  return definition.filter(isObject).map((p) => ({
    ...(str(p.id) ? { id: str(p.id) } : {}),
    name: str(p.name),
    ...(str(p.default) ? { default: str(p.default) } : {}),
  }));
}

/** A dataset's columns (`LibraryItem.definition`). */
export function columnsOfItem(definition: unknown): DatasetColumn[] {
  if (!Array.isArray(definition)) return [];
  return definition
    .filter(isObject)
    .map((c) => ({ id: str(c.id), name: str(c.name) }));
}

/** A dataset's rows (`LibraryItem.body`). */
export function rowsOfItem(body: unknown): DatasetRow[] {
  if (!Array.isArray(body)) return [];
  return body.filter(isObject).map((r) => {
    const values: Record<string, string> = {};
    if (isObject(r.values))
      for (const [k, v] of Object.entries(r.values)) values[k] = str(v);
    return { id: str(r.id), values };
  });
}

/** `<name>` placeholders of the texts, trimmed, in order of first use: the
 *  rule of `placeholdersIn` and of the core (`materialize::placeholders`). */
export function placeholdersOf(texts: readonly string[]): string[] {
  const out: string[] = [];
  for (const text of texts) {
    for (const m of text.matchAll(/<([^>\s][^>]*)>/g)) {
      const name = m[1].trim();
      if (name && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A fresh id of 8 Crockford base32 characters (as `steps.ts` `newStepId`),
 *  unique against `used` when given (then added to it). */
export function newId(used?: Set<string>): string {
  for (;;) {
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    let acc = 0n;
    for (const b of bytes) acc = (acc << 8n) | BigInt(b);
    let id = "";
    for (let i = 7; i >= 0; i--)
      id += ALPHABET[Number((acc >> BigInt(i * 5)) & 31n)];
    if (!used || !used.has(id)) {
      used?.add(id);
      return id;
    }
  }
}
