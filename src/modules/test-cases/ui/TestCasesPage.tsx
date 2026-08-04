import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { ImportReportModal } from "@shared/ui/ImportReportModal";
import { TestCaseList } from "./TestCaseList";
import { TestCaseEditor } from "./TestCaseEditor";
import type { CaseImportResult, DetectionRow } from "../import/caseImport";

type View = { kind: "list" } | { kind: "edit"; id: string | null };

/** Test cases of a project (spec §5.3). Numbering uses the project's configured
 *  prefix/width; the list and editor are scoped to `projectId`. */
export function TestCasesPage({
  projectId,
  caseIdPrefix = "ATS_",
  caseIdDigits = 3,
}: {
  projectId: string;
  caseIdPrefix?: string;
  caseIdDigits?: number;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [view, setView] = useState<View>({ kind: "list" });
  const [seed, setSeed] = useState<CaseImportResult["input"] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<{
    parsing: boolean;
    done: number;
    total: number;
    rows: DetectionRow[];
    result: CaseImportResult | null;
  } | null>(null);

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const author = user ? `${user.firstName} ${user.lastName}` : "";
    setImportState({ parsing: true, done: 0, total: 0, rows: [], result: null });
    try {
      const { parseCaseXlsx } = await import("../import/caseImport");
      const buffer = await file.arrayBuffer();
      const result = await parseCaseXlsx(buffer, file.name, author, (p) =>
        setImportState((prev) =>
          prev ? { ...prev, done: p.done, total: p.total, rows: [...prev.rows, p.row] } : prev,
        ),
      );
      setImportState((prev) => (prev ? { ...prev, parsing: false, result } : prev));
    } catch {
      setImportState(null);
    }
  }

  function applyImport() {
    if (!importState?.result) return;
    setSeed(importState.result.input);
    setImportState(null);
    setView({ kind: "edit", id: null });
  }

  if (view.kind === "edit") {
    return (
      <TestCaseEditor
        projectId={projectId}
        caseIdPrefix={caseIdPrefix}
        caseIdDigits={caseIdDigits}
        caseId={view.id}
        seed={view.id === null ? seed : null}
        onClose={() => {
          setSeed(null);
          setView({ kind: "list" });
        }}
      />
    );
  }

  return (
    <>
      <TestCaseList
        projectId={projectId}
        onNew={() => {
          setSeed(null);
          setView({ kind: "edit", id: null });
        }}
        onImport={() => fileInputRef.current?.click()}
        onOpen={(id) => setView({ kind: "edit", id })}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => void onImportFile(e)}
      />
      {importState && (
        <ImportReportModal
          title={t("testCase.import.title")}
          parsing={importState.parsing}
          done={importState.done}
          total={importState.total}
          rows={importState.rows}
          onApply={applyImport}
          onCancel={() => setImportState(null)}
        />
      )}
    </>
  );
}
