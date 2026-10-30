import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight, Download, Plus, Upload } from "lucide-react";
import { aiAvailable } from "@modules/ai";
import { useAuth } from "@modules/auth";
import { projectDefects } from "@modules/planner";
import { projectTraceableCases, setCaseRequirementKeys, type TraceableCase } from "@modules/test-cases";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { FilterChips } from "@shared/ui/FilterChips";
import { MenuItem, MenuLabel, MenuSeparator, ResponsiveMenu } from "@shared/ui/Menu";
import { usePopover } from "@shared/ui/usePopover";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { useToast } from "@shared/ui/Toast";
import { unlessReported } from "@shared/ui/notify";
import { requirementApi } from "../api/requirementApi";
import type { CsvImportResult } from "../import/requirementCsv";
import { buildMatrix, type MatrixDefect } from "../model/matrix";
import { proposeMigration, type MigrationProposal } from "../model/migration";
import type { Requirement } from "../model/types";
import { GenerateCasesModal } from "./GenerateCasesModal";
import { MatrixView } from "./MatrixView";
import { MigrateTraceabilityModal } from "./MigrateTraceabilityModal";
import { RequirementFormModal, type RequirementDraft } from "./RequirementFormModal";
import { RequirementImportModal } from "./RequirementImportModal";
import { RequirementsPanel } from "./RequirementsPanel";
import "@shared/ui/buttons.css";
import "./Traceability.css";

type View = "requirements" | "matrix";

interface Data {
  requirements: Requirement[];
  cases: TraceableCase[];
  defects: MatrixDefect[];
}

const byKey = (a: Requirement, b: Requirement) =>
  a.requirementKey.localeCompare(b.requirementKey, undefined, { numeric: true });

/** Traceability section of a project (v0.0.2, RED-V3): its requirements
 *  (TRZ-01) and the requirement ↔ case ↔ defect matrix (TRZ-02). The page
 *  loads the data once for both views and owns their dialogs: requirement
 *  form, CSV import, delete, AI generation (IA-05) and the free-text
 *  migration (D2). */
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
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const toast = useToast();
  const [view, setView] = useState<View>("matrix");
  const [data, setData] = useState<Data | null>(null);
  const [aiReady, setAiReady] = useState(false);
  const [editing, setEditing] = useState<Requirement | "new" | null>(null);
  const [deleting, setDeleting] = useState<Requirement | null>(null);
  const [importing, setImporting] = useState<{ fileName: string; result: CsvImportResult } | null>(null);
  const [generating, setGenerating] = useState<Requirement | null>(null);
  const [migrating, setMigrating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const [requirements, cases, cards] = await Promise.all([
      requirementApi.list(projectId, userId),
      projectTraceableCases(projectId, userId),
      projectDefects(projectId, userId),
    ]);
    setData({
      requirements: requirements.sort(byKey),
      cases,
      defects: cards.map((c) => ({
        id: c.id,
        cardKey: c.cardKey,
        title: c.title,
        status: c.status,
        testCaseIds: c.data.testCaseIds ?? [],
      })),
    });
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId]);
  useEffect(() => {
    void aiAvailable()
      .then(setAiReady)
      .catch(() => setAiReady(false));
  }, []);

  const matrix = useMemo(
    () => (data ? buildMatrix(data.requirements, data.cases, data.defects) : null),
    [data],
  );
  const proposals = useMemo(
    () => (data ? proposeMigration(data.cases, data.requirements.map((r) => r.requirementKey)) : []),
    [data],
  );
  const keys = data?.requirements.map((r) => r.requirementKey) ?? [];
  const generate = (key: string) => {
    const r = data?.requirements.find((x) => x.requirementKey === key);
    if (r) setGenerating(r);
  };

  async function save(draft: RequirementDraft) {
    const input = {
      projectId,
      userId,
      requirementKey: draft.requirementKey || undefined,
      title: draft.title,
      description: draft.description,
      priority: draft.priority,
    };
    try {
      if (editing && editing !== "new") await requirementApi.update(editing.id, input);
      else await requirementApi.create(input);
      toast(t("traceability.requirement.savedToast"));
      setEditing(null);
      await refresh();
    } catch {
      toast(t("traceability.requirement.saveError"));
    }
  }

  async function remove(r: Requirement) {
    await requirementApi.remove(r.id, userId);
    setDeleting(null);
    toast(t("traceability.requirement.deletedToast", { key: r.requirementKey }));
    await refresh();
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const { parseRequirementCsv } = await import("../import/requirementCsv");
    setImporting({ fileName: file.name, result: parseRequirementCsv(await file.text()) });
  }

  async function confirmImport() {
    if (!importing) return;
    try {
      const summary = await requirementApi.importRows(projectId, userId, importing.result.rows);
      toast(t("traceability.import.doneToast", { created: summary.created, updated: summary.updated }));
      if (summary.skipped.length) {
        toast(t("traceability.import.skippedToast", { keys: summary.skipped.join(", ") }));
      }
      setImporting(null);
      await refresh();
    } catch {
      toast(t("traceability.import.error"));
    }
  }

  async function applyMigration(selected: MigrationProposal[]) {
    const toCreate = [...new Set(selected.filter((p) => p.createsRequirement).map((p) => p.requirementKey))];
    if (toCreate.length) {
      await requirementApi.importRows(
        projectId,
        userId,
        toCreate.map((key) => ({ requirementKey: key, title: key })),
      );
    }
    const byCase = new Map<string, string[]>();
    for (const p of selected) byCase.set(p.caseId, [...(byCase.get(p.caseId) ?? []), p.requirementKey]);
    for (const [caseId, linked] of byCase) {
      const current = data?.cases.find((c) => c.id === caseId)?.requirementKeys ?? [];
      await setCaseRequirementKeys(caseId, [...current, ...linked], userId);
    }
    toast(t("traceability.migrate.doneToast", { links: selected.length, creates: toCreate.length }));
    setMigrating(false);
    await refresh();
  }

  async function exportXlsx() {
    if (!matrix) return;
    const { exportMatrixXlsx } = await import("../export/matrixXlsx");
    const name = await unlessReported(
      exportMatrixXlsx(matrix, projectId, userId, projectName, i18n.resolvedLanguage ?? "es", t),
    );
    if (name) toast(t("traceability.matrix.exportedToast", { name }));
  }

  return (
    <div className="tz">
      <header className="tz-head">
        <h2 className="sr-only">{t("traceability.title")}</h2>
        <div className="tz-actions">
          <ImportExportMenu
            onImport={() => fileInputRef.current?.click()}
            onExport={() => void exportXlsx()}
            canExport={Boolean(matrix && matrix.rows.length)}
          />
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setEditing("new")}>
            <Plus size={16} aria-hidden="true" />
            <span className="ui-btn__text">{t("traceability.requirement.new")}</span>
          </button>
        </div>
      </header>

      <FilterChips
        label={t("traceability.title")}
        options={[
          { value: "requirements", label: t("traceability.view.requirements"), count: data?.requirements.length },
          { value: "matrix", label: t("traceability.view.matrix") },
        ]}
        value={view}
        onChange={(v) => setView(v as View)}
        className="tz-views"
      />

      {!data || !matrix ? (
        <p className="tr__muted">{t("common.loading")}</p>
      ) : view === "requirements" ? (
        <RequirementsPanel
          requirements={data.requirements}
          matrix={matrix}
          aiReady={aiReady}
          onEdit={setEditing}
          onDelete={setDeleting}
          onGenerate={generate}
        />
      ) : (
        <MatrixView
          matrix={matrix}
          requirements={data.requirements}
          aiReady={aiReady}
          proposals={proposals.length}
          onGenerate={generate}
          onMigrate={() => setMigrating(true)}
        />
      )}

      <input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => void onImportFile(e)} />

      {editing && (
        <RequirementFormModal
          requirement={editing === "new" ? null : editing}
          existingKeys={keys}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
      {importing && (
        <RequirementImportModal
          fileName={importing.fileName}
          result={importing.result}
          existingKeys={keys}
          onConfirm={confirmImport}
          onCancel={() => setImporting(null)}
        />
      )}
      {generating && (
        <GenerateCasesModal
          requirement={generating}
          projectId={projectId}
          caseIdPrefix={caseIdPrefix}
          caseIdDigits={caseIdDigits}
          onCreated={({ created, failed }) => {
            if (created) {
              toast(t("traceability.generate.doneToast", { count: created, key: generating.requirementKey }));
              void refresh();
            }
            // Failed ones stay in the modal for a retry (it says so itself).
            if (!failed) setGenerating(null);
          }}
          onClose={() => setGenerating(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          variant="destructive"
          title={t("traceability.requirement.deleteTitle")}
          message={t("traceability.requirement.deleteWarning", { key: deleting.requirementKey })}
          confirmLabel={t("traceability.requirement.deleteConfirm")}
          onConfirm={() => void remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
      {migrating && (
        <MigrateTraceabilityModal
          proposals={proposals}
          onApply={applyMigration}
          onCancel={() => setMigrating(false)}
        />
      )}
    </div>
  );
}

/** «Importar / Exportar» (SPEC §8): requirements from CSV, the matrix to .xlsx. */
function ImportExportMenu({
  onImport,
  onExport,
  canExport,
}: {
  onImport: () => void;
  onExport: () => void;
  canExport: boolean;
}) {
  const { t } = useTranslation();
  const mobile = useBreakpoint() === "mobile";
  const menu = usePopover(mobile ? "dialog" : "menu");
  const label = t("traceability.io.label");
  return (
    <>
      <button type="button" className="ui-btn ui-btn--io" {...menu.triggerProps}>
        <ArrowLeftRight size={16} aria-hidden="true" />
        {label}
      </button>
      <ResponsiveMenu
        open={menu.open}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={label}
        title={label}
        className="cl-io"
      >
        <MenuLabel>{t("traceability.io.import")}</MenuLabel>
        <MenuItem icon={Upload} onSelect={onImport} description={t("traceability.io.importHint")}>
          {t("traceability.io.importCsv")}
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>{t("traceability.io.export")}</MenuLabel>
        <MenuItem
          icon={Download}
          onSelect={onExport}
          disabled={!canExport}
          title={canExport ? undefined : t("traceability.matrix.empty")}
          description={t("traceability.io.exportHint")}
        >
          {t("traceability.io.exportXlsx")}
        </MenuItem>
      </ResponsiveMenu>
    </>
  );
}
