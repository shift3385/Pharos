import { useEffect, useRef, useState } from "react";
import type { Issue } from "@shared/validation";

// Non-component helpers of the shared form pattern (FormField.tsx, UX-01).

/** The i18n key of an issue's message. */
export function issueKey(issue: Issue): string {
  return issue.code.includes(".") ? issue.code : `validation.${issue.code}`;
}

/** Props a control receives from `FormField` so it is labelled, described and
 *  marked invalid the same way in every form (WCAG 1.3.1, 3.3.1, 4.1.2). */
export interface ControlProps {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  "aria-required"?: true;
}

/** Ids for a control and its message, for rows that render their own markup
 *  (table cells, list rows) instead of a `FormField`. */
export function controlProps(id: string, issue: Issue | null | undefined, describedBy?: string): ControlProps {
  const ids = [describedBy, issue ? `${id}-msg` : undefined].filter(Boolean).join(" ");
  return {
    id,
    ...(issue?.severity === "error" ? { "aria-invalid": true as const } : {}),
    ...(ids ? { "aria-describedby": ids } : {}),
  };
}

/** Save gate for the draft rule: `guard(save)` runs `save` unless something
 *  blocks it; then it shows the summary and moves the focus there. Warnings
 *  never reach this hook, so they never block. */
export function useSaveGuard(blocking: boolean) {
  const [attempt, setAttempt] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (attempt > 0) summaryRef.current?.focus();
  }, [attempt]);

  return {
    showSummary: attempt > 0 && blocking,
    summaryRef,
    guard(save: () => void) {
      if (blocking) setAttempt((n) => n + 1);
      else {
        setAttempt(0);
        save();
      }
    },
  };
}
