import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@shared/ui/Dialog";
import type { MigrationProposal } from "../model/migration";
import "@shared/ui/ConfirmDialog.css";
import "./Traceability.css";

const proposalId = (p: MigrationProposal) => `${p.caseId}|${p.requirementKey}`;

/** Reviews the links proposed from the cases' free-text traceability (D2).
 *  Every proposal is selected by default; nothing is written until Apply, and
 *  the free text itself is kept. */
export function MigrateTraceabilityModal({
  proposals,
  onApply,
  onCancel,
}: {
  proposals: MigrationProposal[];
  onApply: (selected: MigrationProposal[]) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set(proposals.map(proposalId)));
  const [applying, setApplying] = useState(false);
  const id = useId();
  const chosen = proposals.filter((p) => selected.has(proposalId(p)));
  const creates = new Set(chosen.filter((p) => p.createsRequirement).map((p) => p.requirementKey)).size;

  function toggle(p: MigrationProposal) {
    setSelected((prev) => {
      const next = new Set(prev);
      const id = proposalId(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    setApplying(true);
    try {
      await onApply(chosen);
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog
      className="cd tr-modal tr-modal--wide"
      labelledBy={`${id}-title`}
      describedBy={`${id}-intro`}
      onClose={onCancel}
      dismissable={!applying}
    >
      <h3 id={`${id}-title`} className="cd__title">{t("traceability.migrate.title")}</h3>
      <p id={`${id}-intro`} className="cd__msg">{t("traceability.migrate.intro")}</p>
      <div className="tr-table-wrap">
        <table className="tr-table">
          <thead>
            <tr>
              <th>
                <span className="sr-only">{t("traceability.migrate.include")}</span>
              </th>
              <th>{t("traceability.matrix.col.case")}</th>
              <th>{t("traceability.migrate.found")}</th>
              <th>{t("traceability.matrix.col.requirement")}</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((p) => (
              <tr key={proposalId(p)}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(proposalId(p))}
                    aria-label={`${t("traceability.migrate.include")}: ${p.scenarioId} → ${p.requirementKey}`}
                    onChange={() => toggle(p)}
                  />
                </td>
                <td className="tr-mono">{p.scenarioId}</td>
                <td className="tr-mono">{p.token}</td>
                <td>
                  <span className="tr-key">{p.requirementKey}</span>{" "}
                  {p.createsRequirement && <span className="tr-warn">{t("traceability.migrate.willCreate")}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cd__msg" role="status">
        {t("traceability.migrate.summary", { links: chosen.length, creates })}
      </p>
      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          disabled={applying || chosen.length === 0}
          onClick={() => void apply()}
        >
          {applying ? t("traceability.migrate.applying") : t("traceability.migrate.apply")}
        </button>
      </div>
    </Dialog>
  );
}
