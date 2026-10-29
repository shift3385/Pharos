import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { useToast } from "@shared/ui/Toast";
import { useAuth } from "@modules/auth";
import { templateApi } from "../api/templateApi";
import { builtinSeeds, toBase64 } from "../model/builtins";
import type { TemplateKind, TemplateSummary } from "../model/types";
import { TemplateFormModal, type TemplateFormValues } from "./TemplateFormModal";
import "./Templates.css";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type FormState =
  | { mode: "create"; dataBase64: string; fileName: string }
  | { mode: "edit"; template: TemplateSummary };

/** Template repository (spec §6): the bundled PHAROS templates plus imported
 *  ones, grouped by kind. Supports import (.xlsx), metadata edit and delete. */
export function TemplatesPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TemplateSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setTemplates(await templateApi.list(userId));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await templateApi.seed(await builtinSeeds());
      } catch {
        /* seeding is best-effort; listing still works */
      }
      const list = await templateApi.list(userId);
      if (!cancelled) {
        setTemplates(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function download(tpl: TemplateSummary) {
    setBusy(tpl.id);
    try {
      const full = await templateApi.get(tpl.id, userId);
      if (!full) return;
      const bin = atob(full.dataBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tpl.name}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const dataBase64 = toBase64(await file.arrayBuffer());
    setForm({ mode: "create", dataBase64, fileName: file.name });
  }

  async function submitForm(values: TemplateFormValues) {
    if (!form) return;
    if (form.mode === "create") {
      await templateApi.create({
        kind: values.kind,
        language: values.language,
        name: values.name,
        description: values.description,
        usagePrompt: values.usagePrompt,
        version: values.version,
        dataBase64: form.dataBase64,
      }, userId);
      toast(t("templates.importedToast", { name: values.name }));
    } else {
      await templateApi.update(form.template.id, {
        name: values.name,
        description: values.description,
        usagePrompt: values.usagePrompt,
        version: values.version,
      }, userId);
      toast(t("templates.updatedToast"));
    }
    setForm(null);
    await refresh();
  }

  async function remove(tpl: TemplateSummary) {
    await templateApi.remove(tpl.id, userId);
    await refresh();
  }

  const kinds: TemplateKind[] = ["plan", "case"];

  return (
    <section className="tpl">
      <header className="tpl__header">
        <div>
          <h1>{t("templates.title")}</h1>
          <p className="tpl__subtitle">{t("templates.subtitle")}</p>
        </div>
        <button type="button" className="tpl__import" onClick={() => fileInputRef.current?.click()}>
          {t("templates.import")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => void onImportFile(e)}
        />
      </header>

      {loading ? (
        <p className="tpl__muted">{t("common.loading")}</p>
      ) : (
        kinds.map((kind) => {
          const group = templates.filter((tpl) => tpl.kind === kind);
          if (group.length === 0) return null;
          return (
            <div key={kind} className="tpl__group">
              <h2 className="tpl__group-title">{t(`templates.kind.${kind}`)}</h2>
              <ul className="tpl__list">
                {group.map((tpl) => (
                  <li key={tpl.id} className="tpl__card">
                    <div className="tpl__card-main">
                      <span className="tpl__name">{tpl.name}</span>
                      <span className="tpl__meta">
                        <span className="tpl__badge">{tpl.language.toUpperCase()}</span>
                        <span className="tpl__ver">v{tpl.version}</span>
                        {tpl.isBuiltin && (
                          <span className="tpl__badge tpl__badge--builtin">
                            {t("templates.builtin")}
                          </span>
                        )}
                      </span>
                      {tpl.description && <p className="tpl__desc">{tpl.description}</p>}
                    </div>
                    <div className="tpl__actions">
                      <button
                        type="button"
                        className="tpl__btn"
                        disabled={busy === tpl.id}
                        onClick={() => void download(tpl)}
                      >
                        {t("templates.download")}
                      </button>
                      <button
                        type="button"
                        className="tpl__btn"
                        onClick={() => setForm({ mode: "edit", template: tpl })}
                      >
                        {t("common.edit")}
                      </button>
                      {!tpl.isBuiltin && (
                        <button
                          type="button"
                          className="tpl__del"
                          aria-label={t("common.delete")}
                          onClick={() => setPendingDelete(tpl)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}

      {form && (
        <TemplateFormModal
          mode={form.mode}
          initial={form.mode === "edit" ? form.template : undefined}
          fileName={form.mode === "create" ? form.fileName : undefined}
          onSubmit={(v) => void submitForm(v)}
          onCancel={() => setForm(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t("templates.deleteTitle")}
          message={t("templates.deleteWarning", { name: pendingDelete.name })}
          confirmLabel={t("common.confirmDelete")}
          danger
          onConfirm={() => {
            void remove(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
