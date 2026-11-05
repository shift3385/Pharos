import type { RemoteDoc } from "../sync/sync.repository";

/** The one predicate of a run that can still be read and written (EJE-07):
 *  not a tombstone. Its results and shards count only while it is live. The
 *  runs API (`runs.ts`) and cycle progress (`cycles.ts`) read runs through it.
 *  A defect's link to a result of a deleted run is kept, with its label and
 *  its case (ADR-0016 «Nota (EJE-07)»), so `defects.ts` deliberately does not. */
export function isLiveRun(doc: RemoteDoc | null | undefined): doc is RemoteDoc {
  return !!doc && !doc.deleted;
}
