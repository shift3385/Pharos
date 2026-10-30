import { Flag } from "lucide-react";
import "./pills.css";

/** Flag colours (SPEC §4): Crítica error, Alta warning, Media info, Baja muted. */
export type FlagTone = "error" | "warning" | "info" | "muted";

/**
 * A priority flag (SPEC §4). The label is always in the accessible name; it
 * is visible with `showLabel` and otherwise the flag's tooltip.
 */
export function PriorityFlag({
  tone,
  label,
  showLabel,
  className = "",
}: {
  tone: FlagTone;
  label: string;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`flag ${className}`.trim()}
      data-tone={tone}
      title={showLabel ? undefined : label}
    >
      <Flag className="flag__icon" size={14} aria-hidden="true" />
      <span className={showLabel ? "flag__label" : "sr-only"}>{label}</span>
    </span>
  );
}
