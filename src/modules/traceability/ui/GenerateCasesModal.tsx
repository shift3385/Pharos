import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { createProposedCases, proposalGherkin } from "@modules/test-cases";
import type { Requirement } from "../model/types";
import "@shared/ui/ConfirmDialog.css";
import "./Traceability.css";

type Phase = "ready" | "loading" | "review" | "failed" | "creating";

/** Gherkin scenarios and test cases from a requirement (IA-05). It says where
 *  the requirement goes before sending it, validates the whole answer (an
 *  invalid one is reported and nothing is created), and creates only the
 *  proposals the user accepts: draft cases linked to the requirement, marked
 *  "AI · pending review" with the provider and model that wrote them. */
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
  onCreated: (summary: { created: number; failed: number }) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("ready");
  const [destination, setDestination] = useState<AiDestination | null>(null);
  const [result, setResult] = useState<AiResult<GeneratedCase[]> | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [failure, setFailure] = useState<AiFailure | null>(null);

  useEffect(() => {
    void aiDestination()
      .then(setDestination)
      .catch(() => setDestination(null));
  }, []);

  const label = (d: AiDestination) => `${t(`ai.provenance.provider.${d.provider}`)} · ${d.model}`;
  const key = requirement.requirementKey;

  async function generate() {
    setPhase("loading");
    setFailure(null);
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
    const summary = await createProposedCases({
      projectId,
      userId: user?.id ?? "",
      author: user ? `${user.firstName} ${user.lastName}` : "",
      requirementKey: key,
      provenance: result.provenance,
      proposals: result.value.filter((_, i) => selected.has(i)),
      caseIdPrefix,
      caseIdDigits,
    });
    onCreated(summary);
  }

  const busy = phase === "loading" || phase === "creating";

  return (
    <div className="cd-overlay" role="dialog" aria-modal="true" aria-labelledby="tr-gen-title">
      <div className="cd tr-gen">
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
        {phase === "loading" && <p className="cd__msg">{t("traceability.generate.loading")}</p>}
        {phase === "failed" && failure && <AiFailureNotice failure={failure} />}

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
            <button type="button" className="cd__confirm" disabled={busy} onClick={() => void generate()}>
              {phase === "loading" ? t("ai.structured.thinking") : t("traceability.generate.run")}
            </button>
          )}
          {phase === "failed" && (
            <button type="button" className="cd__confirm" onClick={() => void generate()}>
              {t("traceability.generate.retry")}
            </button>
          )}
          {(phase === "review" || phase === "creating") && (
            <button
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
      </div>
    </div>
  );
}
