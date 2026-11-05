import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StatusIcon, type StatusKind } from "./StatusIcon";
import "./alert.css";

/**
 * An inline alert or banner (UX-10, SPEC §4): the same status colours and
 * icons as the toasts. Errors and warnings are `role="alert"`; success and
 * info are `role="status"` (polite). The kind is spelled out for screen
 * readers, so it never depends on colour alone (1.4.1).
 */
export function Alert({
  kind,
  children,
  className,
  role,
}: {
  kind: StatusKind;
  children: ReactNode;
  className?: string;
  /** Overrides the default live-region role (e.g. "note" for static text). */
  role?: "alert" | "status" | "note";
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`ui-alert ui-alert--${kind}${className ? ` ${className}` : ""}`}
      role={role ?? (kind === "error" || kind === "warning" ? "alert" : "status")}
    >
      <StatusIcon kind={kind} size={16} className="ui-alert__icon" />
      <div className="ui-alert__body">
        <span className="sr-only">{t(`common.status.${kind}`)}: </span>
        {children}
      </div>
    </div>
  );
}
