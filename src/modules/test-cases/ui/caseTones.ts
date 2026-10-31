// Case states and priorities → the shared tones (SPEC §4).
import type { FlagTone } from "@shared/ui/PriorityFlag";
import type { PillTone } from "@shared/ui/StatusPill";
import { parseStamp } from "@shared/time/stamp";

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

/** Automation status (FLD-01): automated reads as done, «por automatizar» as
 *  pending work, manual as the neutral default. */
const AUTOMATION_TONE: Record<string, PillTone> = {
  manual: "neutral",
  to_automate: "warning",
  automated: "success",
};

export const statusTone = (status: string): PillTone => STATUS_TONE[status] ?? "neutral";
export const automationTone = (status: string): PillTone => AUTOMATION_TONE[status] ?? "neutral";
export const priorityTone = (priority: string): FlagTone => PRIORITY_TONE[priority] ?? "muted";

/** A stored stamp as local date and time («30 oct 2026, 14:05»); the raw value
 *  if it cannot be read. */
export function stampLabel(iso: string, lang: string): string {
  const when = parseStamp(iso);
  return Number.isNaN(when.getTime())
    ? iso
    : new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(when);
}

/** «Hoy», «Ayer» or the short date («27 oct.») of a change. Stored stamps
 *  are UTC without a zone (desktop SQLite, server): `parseStamp` reads them. */
export function editedLabel(iso: string, lang: string, today: string, yesterday: string, now = new Date()): string {
  const when = parseStamp(iso);
  if (Number.isNaN(when.getTime())) return "";
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(when)) / 86_400_000);
  if (diff === 0) return today;
  if (diff === 1) return yesterday;
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(when);
}
