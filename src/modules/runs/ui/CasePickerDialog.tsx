import { useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@shared/ui/Dialog";
import { FormField } from "@shared/ui/FormField";
import type { LinkableCase } from "../model/types";
import "@shared/ui/ConfirmDialog.css";
import "./Runs.css";

const SHOWN = 100;

/** Picks several cases (search by key or title) for a manual run: «Nuevo run
 *  manual» puts its run fields in `children`; «Añadir casos» uses it alone.
 *  A failure keeps the dialog open and says so. */
export function CasePickerDialog({
  title,
  confirmLabel,
  cases,
  exclude,
  canConfirm = true,
  requireCases = true,
  children,
  onConfirm,
  onCancel,
}: {
  title: string;
  confirmLabel: string;
  cases: LinkableCase[];
  /** Cases already in the run (shown checked and disabled). */
  exclude?: ReadonlySet<string>;
  canConfirm?: boolean;
  requireCases?: boolean;
  children?: ReactNode;
  onConfirm: (caseIds: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? cases.filter(
          (c) =>
            c.scenarioId.toLowerCase().includes(q) ||
            c.title.toLowerCase().includes(q),
        )
      : cases;
    return list.slice(0, SHOWN);
  }, [cases, query]);

  async function confirm() {
    setSaving(true);
    setFailed(null);
    try {
      await onConfirm([...chosen]);
    } catch (e) {
      const raw = String(e instanceof Error ? e.message : e);
      setFailed(
        raw.startsWith("item-overlap")
          ? t("execution.error.overlap")
          : t("execution.error.generic"),
      );
    } finally {
      setSaving(false);
    }
  }

  const toggle = (caseId: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });

  return (
    <Dialog
      className="cd rn-modal"
      labelledBy={`${id}-title`}
      onClose={onCancel}
      dismissable={!saving}
    >
      <h3 id={`${id}-title`} className="cd__title">
        {title}
      </h3>
      {children}
      <FormField label={t("execution.picker.search")}>
        {(p) => (
          <input
            {...p}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="run-cases-search"
          />
        )}
      </FormField>
      <fieldset className="rn-cases">
        <legend className="sr-only">{t("execution.picker.cases")}</legend>
        {shown.length === 0 && (
          <p className="tp-field__hint">{t("runs.tray.noCases")}</p>
        )}
        {shown.map((c) => {
          const already = exclude?.has(c.id) ?? false;
          return (
            <label key={c.id} className="rn-case" data-disabled={already || undefined}>
              <input
                type="checkbox"
                checked={already || chosen.has(c.id)}
                disabled={already}
                onChange={() => toggle(c.id)}
                data-testid={`run-case-${c.scenarioId}`}
              />
              <span className="rn-mono rn-key">{c.scenarioId}</span>
              <span>{c.title}</span>
              {already && <span className="tp-field__hint">{t("execution.picker.inRun")}</span>}
            </label>
          );
        })}
      </fieldset>
      <p className="tp-field__hint" aria-live="polite">
        {t("execution.picker.chosen", { count: chosen.size })}
      </p>
      {failed && (
        <p className="rn-error" role="alert">
          {failed}
        </p>
      )}
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel} disabled={saving}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          disabled={saving || !canConfirm || (requireCases && chosen.size === 0)}
          onClick={() => void confirm()}
          data-testid="run-cases-confirm"
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
