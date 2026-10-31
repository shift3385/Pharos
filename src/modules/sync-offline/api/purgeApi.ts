// Purge of soft-deleted rows (SYNC-06). The desktop removes for good what was
// deleted more than `retentionDays` days ago (Administration → retention),
// for the signed-in account only. The server keeps a tombstone of each, so a
// later pull never brings a purged record back. The browser keeps no local
// copy of deleted rows, so there is nothing to purge there.

import type { Assert, Contract, Covers } from "@shared/contracts";
import { getSession } from "@modules/auth";
import { isTauri } from "@shared/platform";

/** Rows removed by one purge, per kind (`purge::PurgeSummary`). */
export interface PurgeSummary {
  projects: number;
  testPlans: number;
  testCases: number;
  requirements: number;
  plannerCards: number;
  /** Runs, run items and unlinked mappings (EJE-01). */
  runs: number;
  templates: number;
}

/** Runs the purge on the desktop; null in the browser or without a session. */
export async function purgeDeleted(retentionDays: number): Promise<PurgeSummary | null> {
  if (!isTauri()) return null;
  const session = await getSession();
  if (!session) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<PurgeSummary>("purge_deleted", {
    userId: session.userId,
    retentionDays,
  });
}

// The Rust contract (BASE-05, ADR-0026): `tsc` fails if these stop matching
// the Rust types they are read from or sent to.
export type _RustContract = [Assert<Covers<Contract.PurgeSummary, PurgeSummary>>];
