// A list reviewed by the AI (IA-16): what to add, reword and remove. The model
// points at the numbered list it was sent, so its answer is checked here, and
// what the user accepts is applied here, by the pure functions below.

import type { RawListProposal } from "./schemas";

/** A listed item a proposal points at: where it was, and its text then. */
export interface ListItemRef {
  index: number;
  target: string;
}

export type ListProposal =
  | {
      action: "add";
      text: string;
      reason: string;
      /** Where it goes; at the end when the model did not say. */
      position?: "start" | ListItemRef;
    }
  | ({ action: "rewrite"; text: string; reason: string } & ListItemRef)
  | ({ action: "remove"; reason: string } & ListItemRef);

const norm = (text: string) => text.trim().toLocaleLowerCase();

/** The proposals that can be applied: each points at a listed item that exists,
 *  at most one per item, and none writes a text the list already has. The model
 *  is asked for that, but cannot be trusted to. Changes to listed items come
 *  first, in list order. (Pure — testable.) */
export function usableProposals(
  raw: readonly RawListProposal[],
  existing: readonly string[],
  clean: (text: string) => string = (text) => text,
): ListProposal[] {
  const items = existing.map((text) => text.trim()).filter(Boolean);
  const known = new Set(items.map(norm));
  const claimed = new Set<number>();
  const isNew = (text: string) => {
    if (known.has(norm(text))) return false;
    known.add(norm(text));
    return true;
  };
  const changes: (ListProposal & ListItemRef)[] = [];
  const additions: ListProposal[] = [];
  for (const p of raw) {
    if (p.action === "add") {
      const text = clean(p.text);
      if (!isNew(text)) continue;
      const anchor = p.after == null ? undefined : items[p.after - 1];
      const position =
        p.after === 0 ? ("start" as const) : anchor !== undefined ? { index: p.after! - 1, target: anchor } : undefined;
      additions.push({ action: "add", text, reason: p.reason, ...(position ? { position } : {}) });
      continue;
    }
    const index = p.item - 1;
    if (index >= items.length || claimed.has(index)) continue;
    const ref = { index, target: items[index] };
    if (p.action === "remove") {
      claimed.add(index);
      changes.push({ action: "remove", reason: p.reason, ...ref });
      continue;
    }
    const text = clean(p.text);
    if (!isNew(text)) continue;
    claimed.add(index);
    changes.push({ action: "rewrite", text, reason: p.reason, ...ref });
  }
  return [...changes.sort((a, b) => a.index - b.index), ...additions];
}

/** How to read and build the rows of a list, whatever they are. */
export interface ListProposalOps<T> {
  textOf: (row: T) => string;
  /** The same row with another text: a step keeps its id here (DAT-02). */
  withText: (row: T, text: string) => T;
  create: (text: string) => T;
}

/** The list once the accepted proposals are applied. Rows left blank go away,
 *  as they do on saving. A proposal whose row the user has edited or removed
 *  since the answer is skipped: it was about a text that is no longer there.
 *  Every other row stays as it is. (Pure — testable.) */
export function applyProposals<T>(
  list: readonly T[],
  accepted: readonly ListProposal[],
  { textOf, withText, create }: ListProposalOps<T>,
): T[] {
  const rows = list.filter((row) => textOf(row).trim());
  const locate = ({ index, target }: ListItemRef) =>
    rows[index] !== undefined && textOf(rows[index]).trim() === target
      ? index
      : rows.findIndex((row) => textOf(row).trim() === target);

  const removed = new Set<number>();
  const rewritten = new Map<number, string>();
  const first: T[] = [];
  const last: T[] = [];
  const following = new Map<number, T[]>();
  for (const p of accepted) {
    if (p.action === "add") {
      const anchor = p.position && p.position !== "start" ? locate(p.position) : -1;
      if (p.position === "start") first.push(create(p.text));
      else if (anchor >= 0) following.set(anchor, [...(following.get(anchor) ?? []), create(p.text)]);
      else last.push(create(p.text));
      continue;
    }
    const at = locate(p);
    if (at < 0) continue;
    if (p.action === "remove") removed.add(at);
    else rewritten.set(at, p.text);
  }
  return [
    ...first,
    ...rows.flatMap((row, i) => {
      const text = rewritten.get(i);
      const kept = removed.has(i) ? [] : [text === undefined ? row : withText(row, text)];
      return [...kept, ...(following.get(i) ?? [])];
    }),
    ...last,
  ];
}
