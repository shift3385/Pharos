import type { Delta } from "./sync.schemas";

/** What the server holds for one entity, as far as merging is concerned. */
export interface StoredVersion {
  revision: number;
  hlc: string;
}

/** write: store the delta · noop: already stored (retried push) · conflict:
 *  reject it and send the stored version back to the client. */
export type Decision = "write" | "noop" | "conflict";

type Versioned = Pick<Delta, "revision" | "hlc">;

/** Deterministic last-write-wins: by HLC (fixed-width text, so string order is
 *  clock order); a change with an HLC beats a legacy one without; between two
 *  legacy changes the higher revision wins (the Phase 8B rule). */
export function isNewer(a: Versioned, b: StoredVersion): boolean {
  if (a.hlc && b.hlc) return a.hlc > b.hlc;
  if (a.hlc || b.hlc) return Boolean(a.hlc);
  return a.revision >= b.revision;
}

/** Merge rule for one pushed delta (spec §9, SYNC-01/03). A delta that names
 *  its base fast-forwards only if the server still holds exactly that base;
 *  otherwise both sides changed since then and it is a conflict for the user.
 *  A delta without a base (web client, or pending before the upgrade) falls
 *  back to last-write-wins. */
export function decide(current: StoredVersion | null, d: Delta): Decision {
  if (!current) return "write";
  if (d.hlc && current.hlc === d.hlc) return "noop";
  if (d.baseRevision != null) {
    const baseHlc = d.baseHlc ?? "";
    return current.revision === d.baseRevision && current.hlc === baseHlc ? "write" : "conflict";
  }
  return isNewer(d, current) ? "write" : "conflict";
}
