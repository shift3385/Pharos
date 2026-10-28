import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CsvImportResult } from "../import/requirementCsv";
import "@shared/ui/ConfirmDialog.css";
import "./Traceability.css";

const PREVIEW_ROWS = 8;

/** Preview of a requirements CSV before importing: detected columns, the first
 *  rows, how many update an existing key, and the rows that will be skipped.
 *  Nothing is written until the user confirms. */
export function RequirementImportModal({
  fileName,
  result,
  existingKeys,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  result: CsvImportResult;
  existingKeys: string[];
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [importing, setImporting] = useState(false);
  const updates = result.rows.filter(
    (r) => r.requirementKey && existingKeys.includes(r.requirementKey),
  ).length;
  const creates = result.rows.length - updates;
  const columns = Object.entries(result.columns);

  async function confirm() {
    setImporting(true);
    try {
      await onConfirm();
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="cd-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="cd tr-modal tr-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="cd__title">{t("traceability.import.title")}</h3>
        <p className="cd__msg">
          <span className="tr-mono">{fileName}</span>
        </p>

        {result.columns.title === undefined ? (
          <p className="tr-error">{t("traceability.import.noTitleColumn")}</p>
        ) : (
          <>
            <p className="tp-field__hint">
              {t("traceability.import.columns")}:{" "}
              {columns
                .map(([col, header]) => `${t(`traceability.import.column.${col}`)} ← «${header}»`)
                .join(" · ")}
            </p>

            <div className="tr-table-wrap">
              <table className="tr-table">
                <thead>
                  <tr>
                    <th>{t("traceability.requirement.key")}</th>
                    <th>{t("traceability.requirement.title")}</th>
                    <th>{t("traceability.requirement.priority")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                    <tr key={i}>
                      <td className="tr-mono">
                        {r.requirementKey ?? (
                          <span className="tp-field__hint">{t("traceability.requirement.keyAuto")}</span>
                        )}
                      </td>
                      <td>{r.title}</td>
                      <td>{t(`traceability.priorityLabel.${r.priority ?? "medium"}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.rows.length > PREVIEW_ROWS && (
              <p className="tp-field__hint">
                {t("traceability.import.more", { count: result.rows.length - PREVIEW_ROWS })}
              </p>
            )}

            <p className="cd__msg">{t("traceability.import.summary", { creates, updates })}</p>

            {result.issues.length > 0 && (
              <ul className="tr-issues">
                {result.issues.map((issue, i) => (
                  <li key={i} className="tr-warn">
                    {t(`traceability.import.issue.${issue.reason}`, {
                      line: issue.line,
                      value: issue.value ?? "",
                    })}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="cd__actions">
          <button type="button" className="cd__cancel" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="cd__confirm"
            disabled={importing || result.rows.length === 0}
            onClick={() => void confirm()}
          >
            {importing
              ? t("traceability.import.importing")
              : t("traceability.import.confirm", { count: result.rows.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
