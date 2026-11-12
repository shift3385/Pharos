import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import type { CycleClosure, ExecutionSummary } from "@shared/contracts/contract";
import { Dialog } from "@shared/ui/Dialog";
import { StatusPill } from "@shared/ui/StatusPill";
import { TextArea } from "@shared/ui/TextArea";
import { discardOptions, useConfirm } from "@shared/ui/useConfirm";
import { executionApi } from "../api/executionApi";
import { criterionValue, evaluateExitCriteria } from "../model/exitCriteria";
import {
  MIN_JUSTIFICATION,
  closeInput,
  gateErrorKey,
  gateState,
  type GateDecision,
  type GateVerdict,
} from "../model/gate";
import "@shared/ui/ConfirmDialog.css";
import "./Gate.css";

const STATE_TONE = { met: "success", notMet: "error", noData: "neutral", manual: "info" } as const;

/** «Cerrar ciclo» (DOC-02, boceto A): the quality gate over the cycle's own
 *  summary. A failing mandatory criterion («No cumple» or «Sin datos», D3)
 *  asks for a justification of at least `MIN_JUSTIFICATION` characters; a
 *  criterion judged by hand asks for its mark; with a failing mandatory one
 *  the person chooses «Go con riesgos» or «No-go» (D1). Advisory criteria
 *  (D2) are shown and recorded, never asked for. The core checks everything
 *  again and stores the closing (`executionApi.closeCycle`). */
export function CloseCycleDialog({
  projectId,
  cycleId,
  cycleLabel,
  onClose,
  onClosed,
}: {
  projectId: string;
  cycleId: string;
  /** «CYC-007 · Regresión sprint 12». */
  cycleLabel: string;
  onClose: () => void;
  onClosed: (closure: CycleClosure) => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const id = useId();
  const [summary, setSummary] = useState<ExecutionSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [decisions, setDecisions] = useState<Record<number, GateDecision>>({});
  const [verdict, setVerdict] = useState<GateVerdict | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    if (!userId) return;
    let live = true;
    executionApi
      .summary({ projectId, cycleId }, userId)
      .then((s) => live && (s ? setSummary(s) : setFailed(true)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [projectId, cycleId, userId]);

  const criteria = useMemo(() => summary?.exitCriteria ?? [], [summary]);
  const shown = useMemo(() => (summary ? evaluateExitCriteria(summary, t) : []), [summary, t]);
  const gate = gateState(criteria, decisions);
  const chosen = gate.verdict ?? verdict;
  const ready = !!summary && gate.complete && chosen !== null;
  const dirty = Object.values(decisions).some((d) => d.justification.trim() || d.manualMet !== null);

  const decide = (position: number, patch: Partial<GateDecision>) =>
    setDecisions((all) => ({
      ...all,
      [position]: { ...{ manualMet: null, justification: "" }, ...all[position], ...patch },
    }));

  async function submit() {
    setTried(true);
    if (!summary || !ready) return;
    setBusy(true);
    setError("");
    try {
      const closure = await executionApi.closeCycle(cycleId, closeInput(criteria, decisions, chosen), userId);
      if (closure) onClosed(closure);
      else setError(t("gate.error.generic"));
    } catch (e) {
      setError(t(gateErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  const banner =
    gate.failing === 0
      ? { tone: "ok", head: t("gate.verdict.go"), text: t("gate.banner.go") }
      : { tone: "err", head: t("gate.verdict.noGo"), text: t("gate.banner.failing", { count: gate.failing }) };

  return (
    <Dialog
      className="cd gate-dialog"
      labelledBy={`${id}-title`}
      onClose={onClose}
      dismissable={!busy}
      confirmClose={dirty ? () => confirm(discardOptions(t)) : undefined}
    >
      <h3 id={`${id}-title`} className="cd__title">
        {t("gate.title", { cycle: cycleLabel })}
      </h3>
      {failed && (
        <p className="gate-error" role="alert">
          {t("gate.loadFailed")}
        </p>
      )}
      {!summary && !failed && <p className="cd__msg">{t("gate.loading")}</p>}
      {summary && (
        <>
          <p className={`gate-banner gate-banner--${banner.tone}`} role="status" data-testid="gate-banner">
            <strong>{banner.head}</strong> {banner.text}
          </p>
          <div className="gate-table" role="list" aria-label={t("gate.criteria")}>
            <div className="gate-row gate-row--head" aria-hidden="true">
              <span>{t("statusReport.col.criterion")}</span>
              <span>{t("statusReport.col.target")}</span>
              <span>{t("statusReport.col.actual")}</span>
              <span>{t("statusReport.col.result")}</span>
            </div>
            {gate.rows.map((r) => {
              const c = shown[r.position];
              const d = decisions[r.position];
              const tid = `${id}-just-${r.position}`;
              const short = tried && r.needsJustification && !r.justified;
              return (
                <div key={r.position} className="gate-item" role="listitem" data-testid={`gate-row-${r.position}`}>
                  <div className="gate-row">
                    <span className="gate-row__name">
                      {c.label}
                      {!r.criterion.blocking && <span className="gate-tag">{t("gate.advisory")}</span>}
                      {r.state === "manual" && <span className="gate-tag">{t("gate.manual")}</span>}
                    </span>
                    <span className="gate-num">
                      {r.criterion.metric || "—"}
                    </span>
                    <span className="gate-num">
                      {criterionValue(r.criterion)}
                    </span>
                    <span>
                      {r.state === "manual" ? (
                        <span className="gate-mark" role="group" aria-label={t("gate.markLabel", { criterion: c.label })}>
                          {([true, false] as const).map((v) => (
                            <button
                              key={String(v)}
                              type="button"
                              aria-pressed={d?.manualMet === v}
                              className={d?.manualMet === v ? "is-on" : ""}
                              onClick={() => decide(r.position, { manualMet: v })}
                            >
                              {t(v ? "gate.met" : "gate.notMet")}
                            </button>
                          ))}
                        </span>
                      ) : (
                        <StatusPill tone={r.criterion.blocking || r.state === "met" ? STATE_TONE[r.state] : "warning"} dot>
                          {t(`statusReport.exit.${r.state}`)}
                        </StatusPill>
                      )}
                    </span>
                  </div>
                  {r.needsJustification && (
                    <div className="gate-just">
                      <label htmlFor={tid} className="gate-just__label">
                        {t("gate.justification")}
                      </label>
                      <TextArea
                        id={tid}
                        size="short"
                        value={d?.justification ?? ""}
                        maxLength={2000}
                        placeholder={t("gate.justificationHint")}
                        aria-invalid={short || undefined}
                        aria-describedby={`${tid}-count`}
                        onChange={(e) => decide(r.position, { justification: e.target.value })}
                      />
                      <span id={`${tid}-count`} className={`gate-count${short ? " is-short" : ""}`}>
                        {t("gate.count", { n: [...(d?.justification ?? "").trim()].length, min: MIN_JUSTIFICATION })}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {gate.failing > 0 && (
            <fieldset className="gate-verdict">
              <legend>{t("gate.decision")}</legend>
              {(["goWithRisks", "noGo"] as const).map((v) => (
                <label key={v} className="gate-radio">
                  <input
                    type="radio"
                    name={`${id}-verdict`}
                    checked={verdict === v}
                    onChange={() => setVerdict(v)}
                    data-testid={`gate-verdict-${v}`}
                  />
                  <span>
                    {t(`gate.verdict.${v}`)}
                    <small>{t(`gate.verdictHelp.${v}`)}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {tried && !ready && (
            <p className="gate-error" role="alert">
              {t(gate.complete ? "gate.error.verdictRequired" : "gate.error.incomplete")}
            </p>
          )}
          {error && (
            <p className="gate-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
      <div className="cd__actions gate-actions">
        <span className="gate-who">
          {t("gate.signs", {
            name: user?.displayName || user?.email || "—",
            at: new Date().toLocaleString(i18n.resolvedLanguage, { dateStyle: "short", timeStyle: "short" }),
          })}
        </span>
        <button
          type="button"
          className="cd__cancel"
          onClick={async () => {
            if (!dirty || (await confirm(discardOptions(t)))) onClose();
          }}
          disabled={busy}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          disabled={busy || !summary}
          aria-disabled={!ready || undefined}
          onClick={() => void submit()}
          data-testid="gate-close"
        >
          {t("gate.close")}
        </button>
      </div>
      {confirmDialog}
    </Dialog>
  );
}
