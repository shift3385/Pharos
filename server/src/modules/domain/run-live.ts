import type { RemoteDoc } from "../sync/sync.repository";

/** The one predicate of a run that can still be read and written (EJE-07):
 *  not a tombstone. Its results and shards count only while it is live. The
 *  runs API (`runs.ts`), cycle progress (`cycles.ts`) and the result links of
 *  defects (`defects.ts`) all read runs through it. */
export function isLiveRun(doc: RemoteDoc | null | undefined): doc is RemoteDoc {
  return !!doc && !doc.deleted;
}

/** The ids of the live runs among `runs`. */
export const liveRunIds = (runs: RemoteDoc[]) => new Set(runs.filter(isLiveRun).map((d) => d.entityId));
