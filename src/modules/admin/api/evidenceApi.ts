// The evidence store's usage and «Verificar evidencias» (DAT-03b, ADR-0014).
// Desktop only: the store is the encrypted `evidence/` folder of this device,
// and nothing of it reaches the server yet (SYNC-04b).

import type { EvidenceRetention, RetentionPolicy } from "@shared/contracts/contract";
import type {
  EvidenceDeleted,
  EvidenceProgress,
  EvidenceReport,
  EvidenceUsage,
} from "../model/evidence";
import { invoke } from "@shared/platform";

/** Error prefix while another check or repair runs (evidence/check.rs). */
export const EVIDENCE_CHECK_BUSY = "evidence-check-busy";
/** Error prefix when the database file changed on disk (another Pharos on
 *  the same data folder): orphans are not deleted then. */
export const EVIDENCE_DB_CHANGED = "evidence-db-changed";

export const evidenceApi = {
  usage: (): Promise<EvidenceUsage> => invoke("evidence_usage"),
  progress: (): Promise<EvidenceProgress> => invoke("evidence_check_progress"),
  /** Reads every content back; marks what is missing or damaged. */
  check: (userId?: string): Promise<EvidenceReport> =>
    invoke("evidence_check", { userId: userId ?? null }),
  /** Stops the check in course before its next file. */
  cancel: (): Promise<void> => invoke("evidence_check_cancel"),
  /** Deletes the orphans the user confirmed; recent or open ones are skipped. */
  deleteOrphans: (files: string[], userId?: string): Promise<EvidenceDeleted> =>
    invoke("evidence_orphans_delete", { files, userId: userId ?? null }),
  /** The user's projects, for the retention picker. The same `project_list`
   *  command as `@modules/projects`, called here so that admin does not
   *  import the projects module (that import closes a module cycle). */
  projects: (userId: string): Promise<{ id: string; name: string }[]> =>
    invoke("project_list", { ownerId: userId }),
  /** The retention of each kind of evidence in a project (DAT-03c). */
  retention: (projectId: string, userId: string): Promise<EvidenceRetention> =>
    invoke("evidence_retention_get", { projectId, userId }),
  /** Sets the retention of one kind in a project; a setting of this device. */
  setRetention: (
    projectId: string,
    kind: string,
    policy: RetentionPolicy,
    userId: string,
  ): Promise<EvidenceRetention> =>
    invoke("evidence_retention_set", { projectId, kind, policy, userId }),
};
