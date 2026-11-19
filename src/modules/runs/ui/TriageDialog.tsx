import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FindingView, TriageEvent } from "@shared/contracts/contract";
import { Dialog } from "@shared/ui/Dialog";
import { TextArea } from "@shared/ui/TextArea";
import { runsApi } from "../api/runsApi";
import { TRIAGE_STATES, type TriageState, whereOf } from "../model/findings";
import "@shared/ui/ConfirmDialog.css";
import "./Findings.css";

/** «Triaje» of a finding (ADR-0012; ADR-0053 as amended): one more decision
 *  on its fingerprint, so it holds in every run of the project. A reason is
 *  required unless the finding is reopened. The decisions so far are listed,
 *  newest first. */
export function TriageDialog({
  finding,
  projectId,
  userId,
  onCancel,
  onSaved,
}: {
  finding: FindingView;
  projectId: string;
  userId: string;
  onCancel: () => void;
  onSaved: (event: TriageEvent) => void;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const current = (finding.triage?.state ?? "open") as TriageState;
  const [state, setState] = useState<TriageState>(
    current === "open" ? "false_positive" : current,
  );
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<TriageEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsReason = state !== "open";
  const ready = !busy && (!needsReason || reason.trim() !== "");

  useEffect(() => {
    let live = true;
    runsApi
      .triageHistory(projectId, userId, finding.fingerprint)
      .then((h) => live && setHistory(h))
      .catch(() => live && setHistory([]));
    return () => {
      live = false;
    };
  }, [projectId, userId, finding.fingerprint]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const event = await runsApi.triage({
        projectId,
        userId,
        fingerprint: finding.fingerprint,
        state,
        reason: needsReason ? reason.trim() : reason.trim() || null,
      });
      onSaved(event);
    } catch {
      setError(t("findings.triage.error"));
      setBusy(false);
    }
  }

  const when = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(i18n.language);
  };

  return (
    <Dialog
      labelledBy={`${id}-t`}
      describedBy={`${id}-where`}
      onClose={onCancel}
      className="cd fd-triage"
    >
      <h3 id={`${id}-t`} className="cd__title">
        {t("findings.triage.title", {
          rule: finding.ruleName ?? finding.ruleId,
        })}
      </h3>
      <p id={`${id}-where`} className="tp-field__hint fd-mono">
        {whereOf(finding)}
      </p>
      <fieldset className="fd-triage__choice">
        <legend className="fd-triage__legend">
          {t("findings.triage.state")}
        </legend>
        {TRIAGE_STATES.map((s) => (
          <label
            key={s}
            className="fd-triage__option"
            data-testid={`triage-${s}`}
          >
            <input
              type="radio"
              name={`${id}-state`}
              checked={state === s}
              onChange={() => setState(s)}
            />
            <span>
              {t(`findings.triageState.${s}`)}
              <small>{t(`findings.triage.help.${s}`)}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="tp-field" htmlFor={`${id}-reason`}>
        <span>
          {t("findings.triage.reason")}
          {needsReason && <span aria-hidden="true"> *</span>}
        </span>
        <TextArea
          size="short"
          id={`${id}-reason`}
          value={reason}
          maxLength={2000}
          aria-required={needsReason}
          onChange={(e) => setReason(e.target.value)}
          data-testid="triage-reason"
        />
      </label>
      <p className="tp-field__hint">{t("findings.triage.scope")}</p>
      {history && history.length > 0 && (
        <section
          className="fd-triage__history"
          aria-label={t("findings.triage.history")}
        >
          <h4>{t("findings.triage.history")}</h4>
          <ol>
            {history.map((h) => (
              <li key={h.id}>
                <strong>{t(`findings.triageState.${h.state}`, h.state)}</strong>
                {" · "}
                {when(h.createdAt)}
                {h.reason ? ` · ${h.reason}` : ""}
              </li>
            ))}
          </ol>
        </section>
      )}
      {error && (
        <p className="cd__msg rn-warn" role="alert">
          {error}
        </p>
      )}
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          disabled={!ready}
          onClick={() => void save()}
          data-testid="triage-save"
        >
          {t("findings.triage.save")}
        </button>
      </div>
    </Dialog>
  );
}
