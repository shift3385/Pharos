import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@shared/ui/Dialog";
import {
  AiFailureNotice,
  aiDestination,
  describeAiFailure,
  generateCasesFromRequirement,
  type AiDestination,
  type AiFailure,
  type AiResult,
  type GeneratedCase,
} from "@modules/ai";
import { useAuth } from "@modules/auth";
import { createProposedCases, proposalGherkin, type CreateProposedCasesResult } from "@modules/test-cases";
import type { Requirement } from "../model/types";
import "@shared/ui/ConfirmDialog.css";
import "./Traceability.css";

type Phase = "ready" | "loading" | "review" | "failed" | "creating";

/** Gherkin scenarios and test cases from a requirement (IA-05). It says where
 *  the requirement goes before sending it, validates the whole answer (an
 *  invalid one is reported and nothing is created), and creates only the
 *  proposals the user accepts: draft cases linked to the requirement, marked
 *  "AI · pending review" with the provider and model that wrote them. If some
 *  cannot be saved, it stays open with only those selected, so "Create"
 *  retries them without duplicating the saved ones. */
export function GenerateCasesModal({
  requirement,
  projectId,
  caseIdPrefix,
  caseIdDigits,
  onCreated,
  onClose,
}: {
  requirement: Requirement;
  projectId: string;
  caseIdPrefix?: string;
  caseIdDigits?: number;
  /** After each save; the caller closes the modal when nothing failed. */
  onCreated: (summary: CreateProposedCasesResult) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("ready");
  const [destination, setDestination] = useState<AiDestination | null>(null);
  const [result, setResult] = useState<AiResult<GeneratedCase[]> | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [failure, setFailure] = useState<AiFailure | null>(null);
  const [saveFailed, setSaveFailed] = useState(0);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void aiDestination()
      .then(setDestination)
      .catch(() => setDestination(null));
  }, []);

  // The primary action of each phase takes the focus (Generate, Retry, Create).
  useEffect(() => {
    if (phase === "ready" || phase === "failed" || phase === "review") primaryRef.current?.focus();
  }, [phase]);

  const label = (d: AiDestination) => `${t(`ai.provenance.provider.${d.provider}`)} · ${d.model}`;
  const key = requirement.requirementKey;

  async function generate() {
    setPhase("loading");
    setFailure(null);
    setSaveFailed(0);
    setResult(null);
    try {
      const r = await generateCasesFromRequirement(
        {
          requirementKey: key,
          title: requirement.title,
          description: requirement.description,
          priority: requirement.priority,
        },
        i18n.resolvedLanguage ?? "es",
      );
      setResult(r);
      setSelected(new Set(r.value.map((_, i) => i)));
      setPhase("review");
    } catch (e) {
      setFailure(describeAiFailure(e));
      setPhase("failed");
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function accept() {
    if (!result) return;
    setPhase("creating");
    const chosen = result.value.map((_, i) => i).filter((i) => selected.has(i));
    const summary = await createProposedCases({
      projectId,
      userId: user?.id ?? "",
      author: user ? `${user.firstName} ${user.lastName}` : "",
      requirementKey: key,
      provenance: result.provenance,
      proposals: chosen.map((i) => result.value[i]),
      caseIdPrefix,
      caseIdDigits,
    });
    if (summary.failed) {
      // Saved proposals leave the list; the failed ones stay selected for a retry.
      const failedSet = new Set(summary.failedIndexes.map((j) => chosen[j]));
      const kept = result.value.map((_, i) => i).filter((i) => !selected.has(i) || failedSet.has(i));
      setResult({ ...result, value: kept.map((i) => result.value[i]) });
      setSelected(new Set(kept.flatMap((i, pos) => (failedSet.has(i) ? [pos] : []))));
      setSaveFailed(summary.failed);
      setPhase("review");
    }
    onCreated(summary);
  }

  const busy = phase === "loading" || phase === "creating";

  return (
    // Escape and the backdrop close it, except while cases are being saved.
    <Dialog
      className="cd tr-gen"
      labelledBy="tr-gen-title"
      onClose={onClose}
      dismissable={phase !== "creating"}
      initialFocus={primaryRef}
    >
      <h3 id="tr-gen-title" className="cd__title">
        {t("traceability.generate.title", { key })}
      </h3>
      <p className="cd__msg">
        <span className="tr-key">{key}</span> {requirement.title}
      </p>
      {destination && (
        <p className="tr-gen__hint">{t("ai.provenance.destination", { source: label(destination) })}</p>
      )}

      {phase === "ready" && <p className="tr-gen__hint">{t("traceability.generate.intro")}</p>}
      {/* Always present, so screen readers announce the change. */}
      <p className="cd__msg tr-gen__status" role="status" aria-live="polite">
        {phase === "loading"
          ? t("traceability.generate.loading")
          : phase === "creating"
            ? t("traceability.generate.creating")
            : ""}
      </p>
      {phase === "failed" && failure && <AiFailureNotice failure={failure} />}
      {phase === "review" && saveFailed > 0 && (
        <p className="tr-gen__failed" role="alert">
          <span aria-hidden="true">⚠ </span>
          {t("traceability.generate.saveFailed", { count: saveFailed })}
        </p>
      )}

      {result && (phase === "review" || phase === "creating") && (
        <>
          <p className="tr-gen__hint">
            {t("ai.provenance.pending")} · {label(result.provenance)}
          </p>
          <ul className="tr-gen__list">
            {result.value.map((c, i) => (
              <li key={i} className="tr-gen__row">
                <label className="tr-gen__check">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    disabled={phase === "creating"}
                    onChange={() => toggle(i)}
                  />
                  <span>
                    <span className="tr-gen__name">
                      {c.title}
                      <span className="tr-gen__priority">{t(`testCase.priorityLabel.${c.priority}`)}</span>
                    </span>
                    {c.description && <span className="tr-gen__desc">{c.description}</span>}
                  </span>
                </label>
                <details className="tr-gen__gherkin">
                  <summary>{t("traceability.generate.gherkin")}</summary>
                  <pre>{proposalGherkin(c, key)}</pre>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="cd__actions">
        <button type="button" className="cd__cancel" disabled={phase === "creating"} onClick={onClose}>
          {t("common.cancel")}
        </button>
        {(phase === "ready" || phase === "loading") && (
          <button
            ref={primaryRef}
            type="button"
            className="cd__confirm"
            disabled={busy}
            onClick={() => void generate()}
          >
            {phase === "loading" ? t("ai.structured.thinking") : t("traceability.generate.run")}
          </button>
        )}
        {phase === "failed" && (
          <button ref={primaryRef} type="button" className="cd__confirm" onClick={() => void generate()}>
            {t("traceability.generate.retry")}
          </button>
        )}
        {(phase === "review" || phase === "creating") && (
          <button
            ref={primaryRef}
            type="button"
            className="cd__confirm"
            disabled={busy || selected.size === 0}
            onClick={() => void accept()}
          >
            {phase === "creating"
              ? t("traceability.generate.creating")
              : t("traceability.generate.accept", { count: selected.size })}
          </button>
        )}
      </div>
    </Dialog>
  );
}
