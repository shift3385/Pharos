import { CircleCheck, CircleX, Info, TriangleAlert, type LucideIcon } from "lucide-react";

/** The status kinds of notifications and alerts (UX-10, SPEC §4). */
export type StatusKind = "success" | "error" | "warning" | "info";

/** One icon per kind, the same in toasts, alerts, banners and field messages. */
const ICONS: Record<StatusKind, LucideIcon> = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
};

/** Decorative: the kind is always also given as text (sr-only or visible). */
export function StatusIcon({
  kind,
  size = 18,
  className,
}: {
  kind: StatusKind;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[kind];
  return <Icon size={size} className={className} aria-hidden="true" />;
}
