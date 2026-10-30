// Case states and priorities → the shared tones (SPEC §4).
import type { FlagTone } from "@shared/ui/PriorityFlag";
import type { PillTone } from "@shared/ui/StatusPill";

const STATUS_TONE: Record<string, PillTone> = {
  draft: "neutral",
  reviewed: "info",
  approved: "success",
  obsolete: "neutral",
};

const PRIORITY_TONE: Record<string, FlagTone> = {
  critical: "error",
  high: "warning",
  medium: "info",
  low: "muted",
};

export const statusTone = (status: string): PillTone => STATUS_TONE[status] ?? "neutral";
export const priorityTone = (priority: string): FlagTone => PRIORITY_TONE[priority] ?? "muted";

/** «Hoy», «Ayer» or the short date («27 oct.») of a change. */
export function editedLabel(iso: string, lang: string, today: string, yesterday: string, now = new Date()): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(when)) / 86_400_000);
  if (diff === 0) return today;
  if (diff === 1) return yesterday;
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(when);
}
