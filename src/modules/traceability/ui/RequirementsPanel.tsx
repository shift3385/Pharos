import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { useToast } from "@shared/ui/Toast";
import { requirementApi } from "../api/requirementApi";
import type { CsvImportResult } from "../import/requirementCsv";
import type { Requirement } from "../model/types";
import { RequirementFormModal, type RequirementDraft } from "./RequirementFormModal";
import { RequirementImportModal } from "./RequirementImportModal";
import "./Traceability.css";

const byKey = (a: Requirement, b: Requirement) =>
  a.requirementKey.localeCompare(b.requirementKey, undefined, { numeric: true });

/** Requirements of a project (TRZ-01): list, create/edit, delete and CSV import. */
export function RequirementsPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const toast = useToast();
  const [items, setItems] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Requirement | "new" | null>(null);
  const [deleting, setDeleting] = useState<Requirement | null>(null);
  const [importing, setImporting] = useState<{ fileName: string; result: CsvImportResult } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setItems((await requirementApi.list(projectId)).sort(byKey));
    setLoading(false);
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const keys = items.map((r) => r.requirementKey);

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
      setImporting(null);
      await refresh();
    } catch {
      toast(t("traceability.import.error"));
    }
  }

  return (
    <section className="tr">
      <header className="tr__header">
        <div>
          <h2>{t("traceability.requirement.listTitle")}</h2>
          <p className="tr__subtitle">{t("traceability.requirement.listSubtitle")}</p>
        </div>
        <div className="tr__actions">
          <button className="tr__secondary" type="button" onClick={() => fileInputRef.current?.click()}>
            {t("traceability.import.button")}
          </button>
          <button className="tr__primary" type="button" onClick={() => setEditing("new")}>
            {t("traceability.requirement.new")}
          </button>
        </div>
      </header>

      {loading ? (
        <p className="tr__muted">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <p className="tr__muted">{t("traceability.requirement.empty")}</p>
      ) : (
        <ul className="tr__list">
          {items.map((r) => (
            <li key={r.id} className="tr__item">
              <button type="button" className="tr__item-open" onClick={() => setEditing(r)}>
                <span className="tr__item-title">
                  <span className="tr-key">{r.requirementKey}</span> {r.title}
                  <span className={`tr-priority tr-priority--${r.priority}`}>
                    {t(`traceability.priorityLabel.${r.priority}`)}
                  </span>
                </span>
                {r.description && <span className="tr__item-meta">{r.description}</span>}
              </button>
              <button
                type="button"
                className="tr__delete"
                aria-label={t("traceability.requirement.delete", { key: r.requirementKey })}
                title={t("traceability.requirement.delete", { key: r.requirementKey })}
                onClick={() => setDeleting(r)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
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
      {deleting && (
        <ConfirmDialog
          title={t("traceability.requirement.deleteTitle")}
          message={t("traceability.requirement.deleteWarning", { key: deleting.requirementKey })}
          confirmLabel={t("traceability.requirement.deleteConfirm")}
          danger
          onConfirm={() => void remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}
