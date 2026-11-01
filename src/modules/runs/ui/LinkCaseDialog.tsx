import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { UnlinkedTest } from "@shared/contracts/contract";
import { Dialog } from "@shared/ui/Dialog";
import { FormField } from "@shared/ui/FormField";
import type { LinkableCase } from "../model/types";
import "@shared/ui/ConfirmDialog.css";
import "./Runs.css";

const SHOWN = 50;

/** Links one test of the tray to a case (ING-05): every past and future
 *  result with that `test_key`, without touching the results. Search by key
 *  or title; a case the report's tag named is offered first. */
export function LinkCaseDialog({
  test,
  cases,
  onLink,
  onClose,
}: {
  test: UnlinkedTest;
  cases: LinkableCase[];
  onLink: (caseId: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
    if (!chosen) return;
    setSaving(true);
    try {
      await onLink(chosen);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      className="cd rn-modal"
      labelledBy={`${id}-title`}
      onClose={onClose}
      dismissable={!saving}
    >
      <h3 id={`${id}-title`} className="cd__title">
        {t("runs.tray.linkTitle")}
      </h3>
      <p className="cd__msg">
        {test.name} <span className="rn-mono rn-key">{test.testKey}</span>
      </p>
      <FormField label={t("runs.tray.search")}>
        {(p) => (
          <input
            {...p}
            type="search"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </FormField>
      <fieldset className="rn-cases">
        <legend className="sr-only">{t("runs.tray.cases")}</legend>
        {shown.length === 0 && (
          <p className="tp-field__hint">{t("runs.tray.noCases")}</p>
        )}
        {shown.map((c) => (
          <label key={c.id} className="rn-case">
            <input
              type="radio"
              name={`${id}-case`}
              value={c.id}
              checked={chosen === c.id}
              onChange={() => setChosen(c.id)}
            />
            <span className="rn-mono rn-key">{c.scenarioId}</span>
            <span>{c.title}</span>
          </label>
        ))}
      </fieldset>
      <div className="cd__actions">
        <button
          type="button"
          className="cd__cancel"
          onClick={onClose}
          disabled={saving}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          disabled={!chosen || saving}
          onClick={() => void confirm()}
        >
          {t("runs.tray.link")}
        </button>
      </div>
    </Dialog>
  );
}
