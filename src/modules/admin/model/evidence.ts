// The evidence store's usage and «Verificar evidencias» report (DAT-03b). The
// shapes are the Rust ones as generated (evidence/check.rs): the UI only reads
// them, so it takes them as they are.

import type { Contract } from "@shared/contracts";
import { formatBytes as sharedFormatBytes } from "@shared/i18n/numbers";

export type EvidenceUsage = Contract.EvidenceUsage;
export type EvidenceReport = Contract.EvidenceReport;
export type EvidenceProgress = Contract.EvidenceProgress;
export type EvidenceDeleted = Contract.EvidenceDeleted;
export type EvidenceOrphan = Contract.EvidenceOrphan;
export type EvidenceProblem = Contract.EvidenceProblem;

/** `1,2 MB` in the UI language (base 1024, as the 200 MB limit): the app's
 *  one size format (FIX-46). */
export function formatBytes(bytes: number, lang: string): string {
  return sharedFormatBytes(bytes, { lang });
}
