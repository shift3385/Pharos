import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MatrixView } from "./MatrixView";
import { RequirementsPanel } from "./RequirementsPanel";
import "./Traceability.css";

type View = "requirements" | "matrix";
const VIEWS: View[] = ["requirements", "matrix"];

/** Traceability tab of a project (v0.0.2): its requirements (TRZ-01) and the
 *  requirement ↔ case ↔ defect matrix (TRZ-02). */
export function TraceabilityPage({
  projectId,
  projectName,
  caseIdPrefix,
  caseIdDigits,
}: {
  projectId: string;
  projectName: string;
  /** Numbering of the cases generated from a requirement (browser fallback). */
  caseIdPrefix?: string;
  caseIdDigits?: number;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("requirements");

  return (
    <div className="tr-page">
      <nav className="tr-subnav" role="tablist" aria-label={t("traceability.title")}>
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className="tr-subnav__tab"
            data-active={view === v}
            onClick={() => setView(v)}
          >
            {t(`traceability.view.${v}`)}
          </button>
        ))}
      </nav>
      {view === "requirements" ? (
        <RequirementsPanel projectId={projectId} caseIdPrefix={caseIdPrefix} caseIdDigits={caseIdDigits} />
      ) : (
        <MatrixView projectId={projectId} projectName={projectName} />
      )}
    </div>
  );
}
