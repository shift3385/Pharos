import { useTranslation } from "react-i18next";
import { AlertTriangle, X } from "lucide-react";
import { controlProps, issueKey } from "@shared/ui/fieldProps";
import type { Issue } from "@shared/validation";

/** The message under a schedule row. An overlap is drawn in the error colors
 *  of the prototype, but it is a warning (the plan still saves): it says so in
 *  words and with an icon, never by color alone. */
export function RowMessage({ id, issue }: { id: string; issue: Issue }) {
  const { t } = useTranslation();
  const tone = issue.code === "testPlan.schedule.overlap" ? "overlap" : issue.severity;
  return (
    <span id={id} className="tps-msg" data-tone={tone}>
      <AlertTriangle size={14} aria-hidden="true" className="tps-msg__icon" />
      <span className="sr-only">{t(`validation.severity.${issue.severity}`)}: </span>
      <span>{t(issueKey(issue), issue.params)}</span>
    </span>
  );
}

/** A dd/mm/aaaa date field: the text is a draft until blur or Enter.
 *  `onCommit` gets where the focus goes next: the next control on blur, the
 *  same field on Enter. */
export function DateField({
  id,
  label,
  value,
  issue,
  describedBy,
  onDraft,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  issue: Issue | null;
  describedBy?: string;
  onDraft: (v: string) => void;
  onCommit: (v: string, focusId: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <input
      {...controlProps(id, null, describedBy)}
      className="tps-date"
      aria-label={label}
      placeholder={t("testPlan.schedule.datePlaceholder")}
      inputMode="numeric"
      autoComplete="off"
      data-invalid={issue ? true : undefined}
      value={value}
      onChange={(e) => onDraft(e.target.value)}
      onBlur={(e) => onCommit(e.target.value, (e.relatedTarget as HTMLElement | null)?.id || null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(e.currentTarget.value, id);
        }
      }}
    />
  );
}

export function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="tps-del" aria-label={label} title={label} onClick={onClick}>
      <X size={16} aria-hidden="true" />
    </button>
  );
}
