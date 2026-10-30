import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { useToast } from "@shared/ui/Toast";
import { unlessReported } from "@shared/ui/notify";
import type { Project } from "../model/types";
import type { ExportProgress } from "../export/exportAll";
import { ExportProgressModal, type ExportPhase } from "./ExportProgressModal";

interface ProgressState {
  title: string;
  phase: ExportPhase;
  done: number;
  total: number;
  label: string;
  percent: number;
}

/** «Exportar todo» and «Exportar ZIP» of one project, with the progress
 *  dialog and the toasts (Proyectos and Ajustes del proyecto). Render
 *  `progressModal` once. */
export function useProjectExport() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const ownerId = user?.id ?? "";
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const lang = () => i18n.resolvedLanguage ?? "es";

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

  function start(title: string) {
    setProgress({ title, phase: "building", done: 0, total: 0, label: "", percent: 0 });
  }

  async function exportAll() {
    const title = t("projects.exportAll");
    start(title);
    try {
      const { exportAllProjects } = await import("../export/exportAll");
      const result = await unlessReported(
        exportAllProjects(ownerId, t, lang(), onProgress(title)),
      );
      if (result) {
        toast(t("projects.exportedAllToast", { count: result.files, path: result.path }));
        reportSkipped(result.skipped);
      }
    } finally {
      setProgress(null);
    }
  }

  async function exportProject(project: Project) {
    const title = t("projects.exportProject");
    start(title);
    try {
      const { exportProjectZip } = await import("../export/exportAll");
      const result = await unlessReported(
        exportProjectZip(project, ownerId, t, lang(), onProgress(title)),
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
      setProgress(null);
    }
  }

  const progressModal = progress && (
    <ExportProgressModal
      title={progress.title}
      phase={progress.phase}
      done={progress.done}
      total={progress.total}
      label={progress.label}
      percent={progress.percent}
    />
  );

  return { exportAll, exportProject, busy: progress !== null, progressModal };
}
