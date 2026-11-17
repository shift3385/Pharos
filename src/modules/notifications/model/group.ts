// The panel's order (RED-W2): newest first, in days («Hoy», «Ayer», then the
// date), and what each notification's direct action does.
import type { AppNotification } from "./types";

export interface DayGroup {
  /** `today`, `yesterday`, or the local date `YYYY-MM-DD`. */
  id: string;
  /** Local midnight of that day. */
  day: Date;
  items: AppNotification[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Groups by the reader's local day, newest first. */
export function groupByDay(items: readonly AppNotification[], now: Date = new Date()): DayGroup[] {
  const today = localDay(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday = localDay(y);
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const groups: DayGroup[] = [];
  for (const n of sorted) {
    const at = new Date(n.createdAt);
    const key = localDay(at);
    const id = key === today ? "today" : key === yesterday ? "yesterday" : key;
    let group = groups[groups.length - 1];
    if (!group || group.id !== id) {
      group = { id, day: new Date(at.getFullYear(), at.getMonth(), at.getDate()), items: [] };
      groups.push(group);
    }
    group.items.push(n);
  }
  return groups;
}

export const unreadCount = (items: readonly AppNotification[]) => items.filter((n) => !n.readAt).length;

/** The bell's badge: the number up to 9, then «9+». */
export const badgeText = (unread: number) => (unread <= 0 ? "" : unread > 9 ? "9+" : String(unread));

/** What a notification's direct action does: go to an app path, or open the
 *  sync conflicts. Null when it has nowhere to go. */
export type Target = { kind: "path"; path: string; label: string } | { kind: "conflicts"; label: string };

const projectPath = (n: AppNotification, section: string, param: string) =>
  n.projectId
    ? `/projects/${encodeURIComponent(n.projectId)}/${section}?${param}=${encodeURIComponent(n.subject.id)}`
    : null;

export function targetOf(n: AppNotification): Target | null {
  const custom = n.data?.path;
  if (typeof custom === "string" && custom.startsWith("/") && !custom.startsWith("//")) {
    return { kind: "path", path: custom, label: labelOf(n.kind) };
  }
  let path: string | null = null;
  switch (n.kind) {
    case "sync.conflict":
      return { kind: "conflicts", label: labelOf(n.kind) };
    case "invitation.received":
      path = "/";
      break;
    case "case.review_requested":
    case "case.approved":
    case "case.changes_requested":
      path = projectPath(n, "cases", "case");
      break;
    case "defect.assigned":
      path = projectPath(n, "defects", "defect");
      break;
    case "cycle.closed":
      path = projectPath(n, "cycles", "cycle");
      break;
    // W's events go where W says (`data.path`), handled above; without it,
    // there is nothing to open.
  }
  return path ? { kind: "path", path, label: labelOf(n.kind) } : null;
}

/** i18n key of the direct action's label. */
export function labelOf(kind: string): string {
  switch (kind) {
    case "invitation.received":
      return "notifications.action.invitation";
    case "case.review_requested":
      return "notifications.action.review";
    case "case.approved":
    case "case.changes_requested":
      return "notifications.action.openCase";
    case "defect.assigned":
      return "notifications.action.defect";
    case "cycle.closed":
      return "notifications.action.report";
    case "sync.conflict":
      return "notifications.action.resolve";
    case "member.joined":
      return "notifications.action.members";
    default:
      return "notifications.action.open";
  }
}

/** True for the kinds whose action is the next step (filled button). */
export const isPrimary = (kind: string) => kind === "invitation.received" || kind === "case.review_requested";
