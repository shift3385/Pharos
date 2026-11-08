// Requirements from an existing project (IA-17, ADR-0036): which files go,
// how they are grouped into batches, and which of the model's citations hold.
// Pure — testable. Reading the folder is Rust's (`project_scan.rs`).

import type { ProjectFileText, RawRequirementCandidate } from "@modules/ai";
import type { Assert, Contract, Covers } from "@shared/contracts";
import type { RequirementPriority } from "../model/types";
import type { CandidateRequirement } from "./types";

export type ScanCategory =
  "docs" | "routes" | "models" | "tests" | "ui" | "config" | "other";
export type ScanExclusion =
  "secret" | "lockfile" | "minified" | "binary" | "large";

/** One file of the inventory (mirrors `project_scan.rs`). */
export interface ScanFile {
  path: string;
  size: number;
  tokens: number;
  category: ScanCategory;
  excluded?: ScanExclusion | null;
}

export interface ScanInventory {
  scanId: string;
  rootName: string;
  files: ScanFile[];
  truncated: boolean;
}

/** A file as read for sending (mirrors `project_scan.rs`). */
export interface ScanContent {
  path: string;
  /** Numbered lines, secrets replaced. */
  text: string;
  redacted: number[];
  lines: number;
  error?: string | null;
}

/** The reading order: documentation first (it states what the product must
 *  do), then routes and entry points, models, tests (their names are often
 *  acceptance criteria), interface, configuration, the rest. */
export const CATEGORY_ORDER: ScanCategory[] = [
  "docs",
  "routes",
  "models",
  "tests",
  "ui",
  "config",
  "other",
];

/** Default input budget of one analysis, in estimated tokens. */
export const DEFAULT_BUDGET = 300_000;
/** Tokens of one batch: cloud models take far more; a local model holds
 *  what `ollamaContext` grants, minus room for the answer. */
export const BATCH_TOKENS = { cloud: 60_000, local: 12_000 } as const;

export const estimateTokens = (text: string) => Math.ceil(text.length / 3.5);

const rank = (f: ScanFile) => CATEGORY_ORDER.indexOf(f.category);
const byPriority = (a: ScanFile, b: ScanFile) =>
  rank(a) - rank(b) || a.path.localeCompare(b.path);

/** The files that may be sent, in reading order. */
export function sendable(files: readonly ScanFile[]): ScanFile[] {
  return files.filter((f) => !f.excluded && f.tokens > 0).sort(byPriority);
}

/** What goes by default: the sendable files in reading order while they fit in
 *  the budget (a file that does not fit is skipped, a smaller later one may). */
export function defaultSelection(
  files: readonly ScanFile[],
  budget = DEFAULT_BUDGET,
): Set<string> {
  const chosen = new Set<string>();
  let total = 0;
  for (const f of sendable(files)) {
    if (total + f.tokens > budget) continue;
    chosen.add(f.path);
    total += f.tokens;
  }
  return chosen;
}

export function selectionTokens(
  files: readonly ScanFile[],
  selected: ReadonlySet<string>,
): number {
  return files.reduce((n, f) => (selected.has(f.path) ? n + f.tokens : n), 0);
}

/** The module a file belongs to, for grouping: its first two folders. */
export const moduleOf = (path: string) =>
  path.split("/").slice(0, -1).slice(0, 2).join("/") || ".";

/** Pieces of a numbered text of at most `maxTokens` each, cut between lines:
 *  the line numbers stay those of the file, so citations still hold. */
function pieces(text: string, maxTokens: number): string[] {
  if (estimateTokens(text) <= maxTokens) return [text];
  const out: string[] = [];
  let current = "";
  for (const line of text.split(/(?<=\n)/)) {
    if (current && estimateTokens(current + line) > maxTokens) {
      out.push(current);
      current = "";
    }
    current += line;
  }
  if (current) out.push(current);
  return out;
}

/** Batches of files, module by module, of at most `maxTokens` each. A file
 *  larger than a batch is cut into pieces of its own. */
export function batchesOf(
  contents: readonly ScanContent[],
  maxTokens: number,
): ProjectFileText[][] {
  const readable = contents.filter((c) => !c.error && c.text);
  const ordered = [...readable].sort(
    (a, b) =>
      moduleOf(a.path).localeCompare(moduleOf(b.path)) ||
      a.path.localeCompare(b.path),
  );
  const batches: ProjectFileText[][] = [];
  let current: ProjectFileText[] = [];
  let size = 0;
  let module = "";
  const flush = () => {
    if (current.length) batches.push(current);
    current = [];
    size = 0;
  };
  for (const c of ordered) {
    for (const text of pieces(c.text, maxTokens)) {
      const tokens = estimateTokens(text) + estimateTokens(c.path) + 4;
      // A new module starts a new batch once the current one is half full,
      // so a batch mostly holds one part of the product.
      const otherModule =
        current.length > 0 &&
        moduleOf(c.path) !== module &&
        size > maxTokens / 2;
      if (current.length && (size + tokens > maxTokens || otherModule)) flush();
      current.push({ path: c.path, text });
      size += tokens;
      module = moduleOf(c.path);
    }
  }
  flush();
  return batches;
}

/** The candidates of one batch whose citations hold: each source must name a
 *  file of the batch; lines outside the file are dropped (the source stays,
 *  without lines); a candidate left with no source goes. */
export function usableCandidates(
  raw: readonly RawRequirementCandidate[],
  batch: readonly ProjectFileText[],
  linesOf: ReadonlyMap<string, number>,
): CandidateRequirement[] {
  const sent = new Set(batch.map((f) => f.path));
  return raw.flatMap((c) => {
    const sources = c.sources.flatMap((s) => {
      const path = s.path.replace(/^\.?\//, "");
      if (!sent.has(path)) return [];
      const last = linesOf.get(path) ?? 0;
      const start =
        s.startLine && s.startLine <= last ? s.startLine : undefined;
      const end =
        start && s.endLine && s.endLine >= start && s.endLine <= last
          ? s.endLine
          : undefined;
      return [
        {
          kind: "file" as const,
          path,
          ...(start ? { startLine: start } : {}),
          ...(end ? { endLine: end } : {}),
        },
      ];
    });
    if (!sources.length) return [];
    const candidate: CandidateRequirement = {
      title: c.title,
      description: c.description,
      basis: c.basis,
      sources,
    };
    if (c.priority) candidate.priority = c.priority as RequirementPriority;
    if (c.kind) candidate.kind = c.kind;
    if (c.acceptance.length) candidate.acceptance = c.acceptance;
    if (c.evidence) candidate.evidence = c.evidence;
    return [candidate];
  });
}

/** «docs/spec.md:12-20» for a file source. */
export function fileSourceLabel(
  path: string,
  startLine?: number,
  endLine?: number,
): string {
  if (!startLine) return path;
  return endLine && endLine !== startLine
    ? `${path}:${startLine}-${endLine}`
    : `${path}:${startLine}`;
}

// What Rust sends covers what this model reads (BASE-05, ADR-0026).
export type _RustContract = [
  Assert<Covers<Contract.ScanFile, ScanFile>>,
  Assert<Covers<Contract.ScanInventory, ScanInventory>>,
  Assert<Covers<Contract.ScanContent, ScanContent>>,
];
