import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { useAuth } from "@modules/auth";
import { ImportReportModal } from "@shared/ui/ImportReportModal";
import { useToast } from "@shared/ui/Toast";
import { saveFile } from "@shared/export/saveFile";
import { unlessReported } from "@shared/ui/notify";
import { aiAvailable, type AiProvenance, type TestSuggestion } from "@modules/ai";
import { projectHasPlan } from "@modules/test-plan";
import { testCaseApi } from "../api/testCaseApi";
import { projectTraceableCases } from "../api/traceLinks";
import { CASE_PARAM } from "../model/caseLink";
import {
  CASE_PAGE_SIZES,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  filterCases,
  sortCases,
  type CaseFilters,
  type CaseSort,
  type ListedCase,
} from "../model/caseList";
import { TestCaseList } from "./TestCaseList";
import { TestCaseEditor, type CaseNav } from "./TestCaseEditor";
import { SuggestTestsModal } from "./SuggestTestsModal";
import type { CaseImportResult, DetectionRow } from "../import/caseImport";
import type { RequirementOption } from "../model/types";

/** `?case=new` opens a new case; `?case=<id>` opens that case. */
const NEW_CASE = "new";

/** Test cases of a project (spec §5.3, RED-V3). Numbering uses the project's
 *  configured prefix/width; the list and editor are scoped to `projectId`. The
 *  open case lives in the URL (`?case=`), so «Atrás» returns to the list and a
 *  link (`caseLink`) opens a case directly. */
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
  const [params, setParams] = useSearchParams();
  const open = params.get(CASE_PARAM);
  const [seed, setSeed] = useState<CaseImportResult["input"] | null>(null);
  const [canSuggest, setCanSuggest] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [cases, setCases] = useState<ListedCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<CaseFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<CaseSort>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(CASE_PAGE_SIZES[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const latest = useRef(0);

  /** Loads the cases, then their requirement links (one read per case), so
   *  the table shows first and the Requisito column fills in after. */
  async function refresh() {
    const request = ++latest.current;
    const summaries = await testCaseApi.list(projectId, userId);
    if (request !== latest.current) return;
    setCases((prev) => {
      const keys = new Map(prev.map((c) => [c.id, c.requirementKeys]));
      return summaries.map((s) => ({ ...s, requirementKeys: keys.get(s.id) ?? [] }));
    });
    setLoading(false);
    const traced = await projectTraceableCases(projectId, userId);
    if (request !== latest.current) return;
    const keys = new Map(traced.map((c) => [c.id, c.requirementKeys]));
    setCases(summaries.map((s) => ({ ...s, requirementKeys: keys.get(s.id) ?? [] })));
  }

  useEffect(() => {
    void refresh();
    let cancelled = false;
    void Promise.all([aiAvailable(), projectHasPlan(projectId, userId)]).then(([ai, plan]) => {
      if (!cancelled) setCanSuggest(ai && plan);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId]);

  const ordered = useMemo(() => sortCases(filterCases(cases, filters), sort), [cases, filters, sort]);
  const pages = Math.max(1, Math.ceil(ordered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = ordered.slice((current - 1) * pageSize, current * pageSize);

  const openCase = (id: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id === null) next.delete(CASE_PARAM);
        else next.set(CASE_PARAM, id);
        return next;
      },
      // Moving between cases or closing one replaces the entry, so «Atrás»
      // from the editor or after it goes back to what was before the list.
      { replace: open !== null },
    );

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
    void refresh();
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
   *  requirement tags, zipped under `features/`. `ids` limits it to the
   *  selected cases. */
  async function exportFeatures(ids?: ReadonlySet<string>) {
    const [{ projectFeatureFiles }, { default: JSZip }] = await Promise.all([
      import("../export/batch"),
      import("jszip"),
    ]);
    const files = await projectFeatureFiles(projectId, userId, t, ids);
    const zip = new JSZip();
    for (const f of files) zip.file(`features/${f.name}`, f.content);
    const blob = await zip.generateAsync({ type: "blob" });
    const path = await unlessReported(saveFile("features.zip", blob, "application/zip"));
    if (!path) return;
    // A provisional key (DAT-01) is never written as a tag: say so.
    const provisional = files.filter((f) => f.provisional).length;
    const done = t("testCase.exportFeaturesToast", { count: files.length, path });
    toast(
      provisional > 0
        ? `${done}. ${t("testCase.exportProvisionalToast", { count: provisional })}`
        : done,
    );
  }

  async function removeCases(ids: ReadonlySet<string>) {
    for (const id of ids) await testCaseApi.remove(id, userId);
    toast(t("testCase.list.deletedToast", { count: ids.size }));
    await refresh();
  }

  function applyImport() {
    if (!importState?.result) return;
    setSeed(importState.result.input);
    setImportState(null);
    openCase(NEW_CASE);
  }

  if (open !== null) {
    const isNew = open === NEW_CASE;
    const at = ordered.findIndex((c) => c.id === open);
    const nav: CaseNav | undefined =
      !isNew && at >= 0
        ? {
            position: at + 1,
            total: ordered.length,
            prev: ordered[at - 1],
            next: ordered[at + 1],
            filtered: ordered.length !== cases.length,
            cases: ordered,
            onGo: (id) => openCase(id),
          }
        : undefined;
    return (
      <TestCaseEditor
        key={open}
        projectId={projectId}
        caseIdPrefix={caseIdPrefix}
        caseIdDigits={caseIdDigits}
        caseId={isNew ? null : open}
        seed={isNew ? seed : null}
        requirements={requirements}
        nav={nav}
        onSaved={(saved) => {
          void refresh();
          if (isNew && saved) openCase(saved.id);
        }}
        onClose={() => {
          setSeed(null);
          openCase(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <>
      <TestCaseList
        projectId={projectId}
        cases={cases}
        loading={loading}
        visible={visible}
        total={ordered.length}
        filters={filters}
        onFiltersChange={(f) => {
          setFilters(f);
          setPage(1);
        }}
        sort={sort}
        onSortChange={setSort}
        page={current}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        canSuggest={canSuggest}
        onSuggest={() => setSuggesting(true)}
        onNew={() => {
          setSeed(null);
          openCase(NEW_CASE);
        }}
        onImport={() => fileInputRef.current?.click()}
        onExportFeatures={(ids) => void exportFeatures(ids)}
        onDelete={removeCases}
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
