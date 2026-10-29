import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { useAuth } from "@modules/auth";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { useToast } from "@shared/ui/Toast";
import { unlessReported } from "@shared/ui/notify";
import { projectApi } from "../api/projectApi";
import type { ProjectSummary } from "../model/types";
import { recordProjectAccess } from "../model/lastAccess";
import type { ExportProgress } from "../export/exportAll";
import { ProjectDetail } from "./ProjectDetail";
import { ExportProgressModal, type ExportPhase } from "./ExportProgressModal";
import "./Projects.css";

interface ProgressState {
  title: string;
  phase: ExportPhase;
  done: number;
  total: number;
  label: string;
  percent: number;
}

type View = { kind: "list" } | { kind: "detail"; id: string };

export function ProjectsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const ownerId = user?.id ?? "";
  // Home links here with ?open=<id> (continue a project) or ?new=1 (start one).
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>(() => {
    const id = params.get("open");
    if (id) recordProjectAccess(ownerId, id);
    return id ? { kind: "detail", id } : { kind: "list" };
  });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(() => params.get("new") === "1");
  const [exporting, setExporting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);

  function onProgress(title: string) {
    return (p: ExportProgress) =>
      setProgress((prev) => {
        const base: ProgressState =
          prev ?? { title, phase: "building", done: 0, total: 0, label: "", percent: 0 };
        return p.phase === "zipping"
          ? { ...base, title, phase: "zipping", percent: p.percent }
          : { ...base, title, phase: "building", done: p.done, total: p.total, label: p.label };
      });
  }

  /** PDFs that could not be rendered were left out of the ZIP: say which. */
  function reportSkipped(skipped: string[]) {
    if (!skipped.length) return;
    toast(
      t("projects.pdfSkippedToast", { count: skipped.length, names: skipped.join(", ") }),
      "warning",
    );
  }

  async function exportAll() {
    setExporting(true);
    setProgress({ title: t("projects.exportAll"), phase: "building", done: 0, total: 0, label: "", percent: 0 });
    try {
      const { exportAllProjects } = await import("../export/exportAll");
      const result = await unlessReported(
        exportAllProjects(
          ownerId,
          t,
          i18n.resolvedLanguage ?? "es",
          onProgress(t("projects.exportAll")),
        ),
      );
      if (result) {
        toast(t("projects.exportedAllToast", { count: result.files, path: result.path }));
        reportSkipped(result.skipped);
      }
    } finally {
      setExporting(false);
      setProgress(null);
    }
  }

  async function exportProject(project: ProjectSummary) {
    setExportingId(project.id);
    const title = t("projects.exportProject");
    setProgress({ title, phase: "building", done: 0, total: 0, label: "", percent: 0 });
    try {
      const { exportProjectZip } = await import("../export/exportAll");
      const result = await unlessReported(
        exportProjectZip(project, ownerId, t, i18n.resolvedLanguage ?? "es", onProgress(title)),
      );
      if (result) {
        toast(
          t("projects.exportedProjectToast", {
            name: project.name,
            count: result.files,
            path: result.path,
          }),
        );
        reportSkipped(result.skipped);
      }
    } finally {
      setExportingId(null);
      setProgress(null);
    }
  }

  // The link did its job; drop it so a reload or "back" shows the list.
  useEffect(() => {
    if (params.has("open") || params.has("new")) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openProject(id: string) {
    recordProjectAccess(ownerId, id);
    setView({ kind: "detail", id });
  }

  async function refresh() {
    setProjects(await projectApi.list(ownerId));
    setLoading(false);
  }
  useEffect(() => {
    void refresh();
    // Reload the list when a sync pulls remote changes.
    const onSynced = () => void refresh();
    window.addEventListener("pharos:synced", onSynced);
    return () => window.removeEventListener("pharos:synced", onSynced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const project = await projectApi.create({ name: trimmed, ownerId });
    setName("");
    setCreating(false);
    await refresh();
    if (project) openProject(project.id);
  }

  async function remove(id: string) {
    await projectApi.remove(id, ownerId);
    void refresh();
  }

  if (view.kind === "detail") {
    return (
      <ProjectDetail projectId={view.id} onClose={() => setView({ kind: "list" })} />
    );
  }

  return (
    <section className="tp">
      <header className="tp__header">
        <div>
          <h1>{t("projects.title")}</h1>
          <p className="tp__subtitle">{t("projects.subtitle")}</p>
        </div>
        <div className="pj-header-actions">
          {projects.length > 0 && (
            <button
              type="button"
              className="pj-export"
              onClick={() => void exportAll()}
              disabled={exporting}
            >
              {exporting ? t("projects.exporting") : t("projects.exportAll")}
            </button>
          )}
          <button className="tp__new" type="button" onClick={() => setCreating(true)}>
            {t("projects.new")}
          </button>
        </div>
      </header>

      {creating && (
        <div className="pj-create">
          <input
            autoFocus
            value={name}
            placeholder={t("projects.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button type="button" className="tp__new" onClick={create} disabled={!name.trim()}>
            {t("projects.create")}
          </button>
          <button
            type="button"
            className="pj-create__cancel"
            onClick={() => {
              setCreating(false);
              setName("");
            }}
          >
            {t("common.cancel")}
          </button>
        </div>
      )}

      {loading ? (
        <p className="tp__muted">{t("common.loading")}</p>
      ) : projects.length === 0 && !creating ? (
        <p className="tp__muted">{t("projects.empty")}</p>
      ) : (
        <ul className="tp__list">
          {projects.map((p) => (
            <li key={p.id} className="tp__item">
              <button
                type="button"
                className="tp__item-open"
                onClick={() => openProject(p.id)}
              >
                <span className="tp__item-title">
                  <span className="pj-folder" aria-hidden="true">
                    ▸
                  </span>{" "}
                  {p.name}
                </span>
                <span className="tp__item-meta">
                  {t("projects.prefixMeta")}: {p.caseIdPrefix}
                  {"1".padStart(p.caseIdDigits, "0")}
                </span>
              </button>
              <button
                type="button"
                className="pj-export-row"
                aria-label={t("projects.exportProject")}
                title={t("projects.exportProject")}
                disabled={exportingId === p.id}
                onClick={() => void exportProject(p)}
              >
                ⬇
              </button>
              <button
                type="button"
                className="tp-list-field__del"
                aria-label={t("common.delete")}
                onClick={() => setPendingDelete(p)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {progress && (
        <ExportProgressModal
          title={progress.title}
          phase={progress.phase}
          done={progress.done}
          total={progress.total}
          label={progress.label}
          percent={progress.percent}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t("projects.deleteTitle")}
          message={t("projects.deleteWarning", { name: pendingDelete.name })}
          confirmLabel={t("projects.deleteConfirm")}
          danger
          onConfirm={() => {
            void remove(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
