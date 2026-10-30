// Requirement priorities → the shared flag tones (SPEC §4).
import type { FlagTone } from "@shared/ui/PriorityFlag";

const PRIORITY_TONE: Record<string, FlagTone> = { high: "warning", medium: "info", low: "muted" };

export const priorityTone = (priority: string): FlagTone => PRIORITY_TONE[priority] ?? "muted";
