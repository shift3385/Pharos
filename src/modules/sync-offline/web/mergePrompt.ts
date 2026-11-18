// Asking the person which version stays in each field that collides, when a
// web save meets a newer version (SYNC-02, ADR-0051; boceto 3). `serverApi`
// is not React: it asks through an event, and `WebMergeDialog` (mounted once
// by the app shell on the web) answers. Without a dialog mounted, nobody is
// asked and the save is reported as before.

import type { MergeConflictKey } from "../domain/conflict";

export type FieldChoices = Record<string, "local" | "remote">;

export interface MergeAsk {
  conflicts: MergeConflictKey[];
  origins: Record<string, string>;
  /** The person's choices, or null when they cancel. */
  answer: (choices: FieldChoices | null) => void;
}

export const MERGE_ASK_EVENT = "pharos:web-merge-ask";

let listeners = 0;

/** Called by the dialog while it is mounted. */
export function listenForMergeAsks(): () => void {
  listeners += 1;
  return () => {
    listeners -= 1;
  };
}

/** Asks for one choice per key; null when nobody can ask or they cancel. */
export function askFieldChoices(
  conflicts: MergeConflictKey[],
  origins: Record<string, string>,
): Promise<FieldChoices | null> {
  if (listeners === 0 || typeof window === "undefined")
    return Promise.resolve(null);
  return new Promise((resolve) => {
    const detail: MergeAsk = { conflicts, origins, answer: resolve };
    window.dispatchEvent(
      new CustomEvent<MergeAsk>(MERGE_ASK_EVENT, { detail }),
    );
  });
}
