import type { ReactNode } from "react";
import "./pills.css";

/** The colour of a state (SPEC §4): Pasa/Aprobado success, Falla error,
 *  Bloqueado warning, Revisado info, No ejecutado/Borrador/Obsoleto neutral. */
export type PillTone = "success" | "error" | "warning" | "info" | "neutral";

/**
 * A state pill (SPEC §4): background `color-mix(tone 14%, transparent)` and
 * text in the tone's `-text` variant. It only knows tones: each module maps
 * its own states to one. `dot` adds the leading dot of execution results;
 * `strike` crosses out a retired state (Obsoleto).
 */
export function StatusPill({
  tone,
  dot,
  strike,
  title,
  className = "",
  children,
}: {
  tone: PillTone;
  dot?: boolean;
  strike?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`pill ${className}`.trim()}
      data-tone={tone}
      data-strike={strike || undefined}
      title={title}
    >
      {dot && <span className="pill__dot" aria-hidden="true" />}
      <span className="pill__text">{children}</span>
    </span>
  );
}
