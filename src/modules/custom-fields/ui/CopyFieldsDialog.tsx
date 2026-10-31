import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@shared/ui/Dialog";
import { FormField } from "@shared/ui/FormField";
import { useToast } from "@shared/ui/Toast";
import { customFieldApi } from "../api/customFieldApi";
import "@shared/ui/ConfirmDialog.css";
import "./CustomFields.css";

export interface ProjectOption {
  id: string;
  name: string;
}

/** «Copiar de otro proyecto» (ADR-0018 decision 3): the fields of another
 *  project that this one does not have yet, keys already here are skipped and
 *  named in the result. */
export function CopyFieldsDialog({
  projectId,
  userId,
  loadProjects,
  onDone,
  onCancel,
}: {
  projectId: string;
  userId: string;
  loadProjects: () => Promise<ProjectOption[]>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const id = useId();
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadProjects()
      .then((all) => {
        const others = all.filter((p) => p.id !== projectId);
        setProjects(others);
        setSource(others[0]?.id ?? "");
      })
      .catch(() => setProjects([]));
  }, [loadProjects, projectId]);

  async function copy() {
    setBusy(true);
    try {
      const summary = await customFieldApi.copy(source, projectId, userId);
      toast(
        [
          t("customFields.copyDialog.copiedToast", { count: summary.copied }),
          summary.skipped.length
            ? t("customFields.copyDialog.skipped", {
                keys: summary.skipped.join(", "),
              })
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
      onDone();
    } catch {
      toast(t("customFields.saveFailed"), "error");
      setBusy(false);
    }
  }

  return (
    <Dialog
      className="cd cf-dialog"
      labelledBy={`${id}-title`}
      onClose={onCancel}
      dismissable={!busy}
    >
      <h3 id={`${id}-title`} className="cd__title">
        {t("customFields.copyDialog.title")}
      </h3>
      <p className="cd__msg">{t("customFields.copyDialog.hint")}</p>
      {projects === null ? (
        <p className="tp__muted">{t("common.loading")}</p>
      ) : projects.length === 0 ? (
        <p className="tp__muted">{t("customFields.copyDialog.none")}</p>
      ) : (
        <FormField label={t("customFields.copyDialog.source")}>
          {(p) => (
            <select
              {...p}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {projects.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
      )}
      <div className="cd__actions">
        <button
          type="button"
          className="cd__cancel"
          onClick={onCancel}
          disabled={busy}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          disabled={busy || !source}
          onClick={() => void copy()}
        >
          {busy
            ? t("customFields.copyDialog.copying")
            : t("customFields.copyDialog.confirm")}
        </button>
      </div>
    </Dialog>
  );
}
