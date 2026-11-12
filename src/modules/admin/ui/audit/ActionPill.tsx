import { StatusPill, type PillTone } from "@shared/ui/StatusPill";

/** The colour of an audit action: what adds, what changes, what removes. */
const TONE: Record<string, PillTone> = {
  create: "success",
  restore: "success",
  link: "success",
  update: "info",
  resolve_conflict: "info",
  delete: "error",
  unlink: "error",
  redact: "error",
  import: "warning",
  execute: "warning",
};

export function ActionPill({ action, label }: { action: string; label: string }) {
  return <StatusPill tone={TONE[action] ?? "neutral"}>{label}</StatusPill>;
}
