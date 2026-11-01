import type { FlagTone } from "@shared/ui/PriorityFlag";
import type { PillTone } from "@shared/ui/StatusPill";
import type { DefectPriority, DefectSeverity, DefectStatus } from "../model/types";

/** Colours of a defect's states (SPEC §4 tones; the text always says it). */
export const STATUS_TONE: Record<DefectStatus, PillTone> = {
  new: "info",
  open: "warning",
  in_progress: "info",
  fixed: "success",
  retest: "warning",
  closed: "success",
  rejected: "neutral",
  deferred: "neutral",
};

export const SEVERITY_TONE: Record<DefectSeverity, PillTone> = {
  critical: "error",
  major: "warning",
  minor: "info",
  trivial: "neutral",
};

export const PRIORITY_TONE: Record<DefectPriority, FlagTone> = {
  critical: "error",
  high: "warning",
  medium: "info",
  low: "muted",
};
