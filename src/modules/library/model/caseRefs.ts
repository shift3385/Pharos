// A case's calls of shared steps and its dataset binding, as the editor
// handles them (ADR-0055 §2). The core rebuilds the copies on every save and
// on `library_preview`; here the editor only adds, changes and removes refs,
// and splits a step list into own steps and read-only blocks.

import {
  columnsOfItem,
  newId,
  type DatasetRef,
  type LibraryImpact,
  type LibraryItem,
  type SharedRef,
} from "./types";

interface StepLike {
  id: string;
  text: string;
}

export type Segment<S extends StepLike> =
  | { kind: "own"; steps: S[]; start: number }
  | { kind: "block"; ref: SharedRef; steps: S[]; start: number };

/** The list split into runs of own steps and blocks of copied steps, in
 *  order. A call whose copy is not in the list (not materialized yet, or its
 *  version is missing here) gets an empty block at the end, so it can still
 *  be unlinked. The list always ends with an own run (maybe empty): that is
 *  where «Añadir paso» adds. */
export function segmentsOf<S extends StepLike>(
  steps: readonly S[],
  refs: readonly SharedRef[],
  list: SharedRef["list"],
): Segment<S>[] {
  const mine = refs.filter((r) => (r.list ?? "steps") === list);
  const owner = new Map<string, SharedRef>();
  for (const r of mine) for (const id of r.stepIds ?? []) owner.set(id, r);
  const out: Segment<S>[] = [];
  steps.forEach((s, i) => {
    const ref = owner.get(s.id);
    const last = out[out.length - 1];
    if (ref) {
      if (last?.kind === "block" && last.ref.id === ref.id) last.steps.push(s);
      else out.push({ kind: "block", ref, steps: [s], start: i });
    } else if (last?.kind === "own") last.steps.push(s);
    else out.push({ kind: "own", steps: [s], start: i });
  });
  const shown = new Set(
    out.flatMap((s) => (s.kind === "block" ? [s.ref.id] : [])),
  );
  for (const r of mine)
    if (!shown.has(r.id))
      out.push({ kind: "block", ref: r, steps: [], start: steps.length });
  if (out[out.length - 1]?.kind !== "own")
    out.push({ kind: "own", steps: [], start: steps.length });
  return out;
}

/** The whole list again after segment `index` changed to `next`. */
export function joinSegments<S extends StepLike>(
  segments: readonly Segment<S>[],
  index: number,
  next: S[],
): S[] {
  return segments.flatMap((s, i) => (i === index ? next : s.steps));
}

/** A new call of a shared step (its copy is made by the preview or the save). */
export function newSharedRef(
  refs: readonly SharedRef[],
  item: { id: string; name: string; version: number },
  args: Record<string, string>,
  list: SharedRef["list"],
  usedIds: Iterable<string> = [],
): SharedRef {
  const used = new Set([...usedIds, ...refs.map((r) => r.id)]);
  return {
    id: newId(used),
    sharedStepId: item.id,
    version: item.version,
    follow: true,
    list,
    stepIds: [],
    args: cleanArgs(args),
    name: item.name,
  };
}

/** Arguments without the empty ones (empty passes `<name>` on to the case). */
export function cleanArgs(
  args: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(args)) if (v.trim()) out[k] = v.trim();
  return out;
}

/** «Desvincular»: the copied steps stay in the list as the case's own; only
 *  the call goes. */
export const withoutRef = (refs: readonly SharedRef[], refId: string) =>
  refs.filter((r) => r.id !== refId);

export const withRef = (refs: readonly SharedRef[], ref: SharedRef) =>
  refs.map((r) => (r.id === ref.id ? ref : r));

/** The binding of the case's Examples table to a dataset (follows it). */
export function newDatasetRef(item: {
  id: string;
  name: string;
  version: number;
}): DatasetRef {
  return {
    id: "case",
    datasetId: item.id,
    version: item.version,
    follow: true,
    name: item.name,
  };
}

/** Whether a Gherkin edit changed a line of a block: a copied step is gone
 *  or its text differs. Saving restores it from the library. */
export function blockEdited(
  before: readonly StepLike[],
  after: readonly StepLike[],
  refs: readonly SharedRef[],
): boolean {
  const old = new Map(before.map((s) => [s.id, s.text]));
  const now = new Map(after.map((s) => [s.id, s.text]));
  return refs.some((r) =>
    (r.stepIds ?? []).some((id) => old.has(id) && now.get(id) !== old.get(id)),
  );
}

/** The impact notice's numbers (boceto 3): cases that follow the item, by
 *  status, and the pinned ones. */
export function impactSummary(impact: LibraryImpact) {
  const following = impact.cases.filter((c) => c.follow);
  const pinned = impact.cases.filter((c) => !c.follow);
  const n = (s: string) =>
    impact.byStatus[s] ?? following.filter((c) => c.status === s).length;
  return {
    following,
    pinned,
    draft: n("draft"),
    reviewed: n("reviewed"),
    approved: n("approved"),
    total: following.length,
  };
}

/** The case's parameters with no column in the bound dataset (by name or by
 *  `columnMap`): the «Falta la columna» warning. */
export function missingColumns(
  params: readonly string[],
  binding: DatasetRef,
  dataset: LibraryItem | null,
): string[] {
  if (!dataset) return [];
  const names = new Set(columnsOfItem(dataset.definition).map((c) => c.name));
  return params.filter(
    (p) => !names.has(binding.columnMap?.[p] ?? p) && !names.has(p),
  );
}
