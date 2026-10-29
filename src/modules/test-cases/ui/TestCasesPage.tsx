import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { ImportReportModal } from "@shared/ui/ImportReportModal";
import { useToast } from "@shared/ui/Toast";
import { saveFile } from "@shared/export/saveFile";
import { aiAvailable, type AiProvenance, type TestSuggestion } from "@modules/ai";
import { projectHasPlan } from "@modules/test-plan";
import { testCaseApi } from "../api/testCaseApi";
import { TestCaseList } from "./TestCaseList";
import { TestCaseEditor } from "./TestCaseEditor";
import { SuggestTestsModal } from "./SuggestTestsModal";
import type { CaseImportResult, DetectionRow } from "../import/caseImport";
import type { RequirementOption } from "../model/types";

type View = { kind: "list" } | { kind: "edit"; id: string | null };

/** Test cases of a project (spec §5.3). Numbering uses the project's configured
 *  prefix/width; the list and editor are scoped to `projectId`. */
export function TestCasesPage({
  projectId,
  caseIdPrefix = "ATS_",
  caseIdDigits = 3,
  requirements = [],
}: {
  projectId: string;
  caseIdPrefix?: string;
  caseIdDigits?: number;
  /** The project's requirements (from the traceability module, via projects). */
  requirements?: RequirementOption[];
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const toast = useToast();
  const [view, setView] = useState<View>({ kind: "list" });
  const [seed, setSeed] = useState<CaseImportResult["input"] | null>(null);
  const [canSuggest, setCanSuggest] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([aiAvailable(), projectHasPlan(projectId, userId)]).then(([ai, plan]) => {
      if (!cancelled) setCanSuggest(ai && plan);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, userId]);

  async function createSuggested(items: TestSuggestion[], provenance: AiProvenance) {
    const author = user ? `${user.firstName} ${user.lastName}` : "";
    for (const s of items) {
      await testCaseApi.create({
        projectId,
        title: s.title,
        author,
        caseIdPrefix,
        caseIdDigits,
        userId,
        // The whole case (title + description) came from the AI (IA-01).
        data: { description: s.description, gherkinLevel: "basic", aiProvenance: { case: provenance } },
      });
    }
    setRefreshKey((k) => k + 1);
  }
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

  /** Batch .feature export (spec §5.3): one file per case, with its ID and
   *  requirement tags, zipped under `features/`. */
  async function exportFeatures() {
    const [{ projectFeatureFiles }, { default: JSZip }] = await Promise.all([
      import("../export/batch"),
      import("jszip"),
    ]);
    const files = await projectFeatureFiles(projectId, userId, t);
    const zip = new JSZip();
    for (const f of files) zip.file(`features/${f.name}`, f.content);
    const blob = await zip.generateAsync({ type: "blob" });
    const path = await saveFile("features.zip", blob, "application/zip");
    toast(t("testCase.exportFeaturesToast", { count: files.length, path }));
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
        requirements={requirements}
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
        key={refreshKey}
        projectId={projectId}
        canSuggest={canSuggest}
        onSuggest={() => setSuggesting(true)}
        onNew={() => {
          setSeed(null);
          setView({ kind: "edit", id: null });
        }}
        onImport={() => fileInputRef.current?.click()}
        onExportFeatures={() => void exportFeatures()}
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
      {suggesting && (
        <SuggestTestsModal
          projectId={projectId}
          onCreate={createSuggested}
          onClose={() => setSuggesting(false)}
        />
      )}
    </>
  );
}
