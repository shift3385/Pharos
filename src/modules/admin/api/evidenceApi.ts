// The evidence store's usage and «Verificar evidencias» (DAT-03b, ADR-0014).
// Desktop only: the store is the encrypted `evidence/` folder of this device,
// and nothing of it reaches the server yet (SYNC-04b).

import type {
  EvidenceDeleted,
  EvidenceProgress,
  EvidenceReport,
  EvidenceUsage,
} from "../model/evidence";
import { invoke } from "@shared/platform";

/** Error prefix while another check or repair runs (evidence/check.rs). */
export const EVIDENCE_CHECK_BUSY = "evidence-check-busy";

export const evidenceApi = {
  usage: (): Promise<EvidenceUsage> => invoke("evidence_usage"),
  progress: (): Promise<EvidenceProgress> => invoke("evidence_check_progress"),
  /** Reads every content back; marks what is missing or damaged. */
  check: (userId?: string): Promise<EvidenceReport> =>
    invoke("evidence_check", { userId: userId ?? null }),
  /** Deletes the orphans the user confirmed; recent or open ones are skipped. */
  deleteOrphans: (files: string[], userId?: string): Promise<EvidenceDeleted> =>
    invoke("evidence_orphans_delete", { files, userId: userId ?? null }),
};
