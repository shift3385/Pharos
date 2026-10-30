import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Ellipsis, FileText, Pencil, Search, Trash2, Upload } from "lucide-react";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { useToast } from "@shared/ui/Toast";
import { MenuItem, ResponsiveMenu } from "@shared/ui/Menu";
import { usePopover } from "@shared/ui/usePopover";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { useAuth } from "@modules/auth";
import { saveFile } from "@shared/export/saveFile";
import { unlessReported } from "@shared/ui/notify";
import { templateApi } from "../api/templateApi";
import { builtinSeeds, toBase64 } from "../model/builtins";
import type { TemplateKind, TemplateSummary } from "../model/types";
import { TemplateFormModal, type TemplateFormValues } from "./TemplateFormModal";
import "./Templates.css";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const KINDS: TemplateKind[] = ["plan", "case"];

type FormState =
  | { mode: "create"; dataBase64: string; fileName: string }
  | { mode: "edit"; template: TemplateSummary };

/** Template repository (spec §6) as Administración → Plantillas (SPEC §8):
 *  the bundled PHAROS templates plus imported ones, one kind at a time, with
 *  search. Import (.xlsx), download, and edit/delete of the user's own ones
 *  from each card's «Más acciones» menu. `onCount` reports how many there are
 *  for the tab's counter. */
export function TemplatesTab({ onCount }: { onCount?: (count: number) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const uid = useId();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<TemplateKind>("plan");
  const [query, setQuery] = useState("");
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

  useEffect(() => {
    if (!loading) onCount?.(templates.length);
  }, [loading, templates.length, onCount]);

  async function download(tpl: TemplateSummary) {
    setBusy(tpl.id);
    try {
      const full = await templateApi.get(tpl.id, userId);
      if (!full) return;
      const bin = atob(full.dataBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const path = await unlessReported(saveFile(`${tpl.name}.xlsx`, bytes, XLSX_MIME));
      if (path) toast(t("downloads.saved", { path }));
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

  const q = query.trim().toLocaleLowerCase();
  const ofKind = templates.filter((tpl) => tpl.kind === kind);
  const shown = q
    ? ofKind.filter((tpl) => `${tpl.name} ${tpl.description}`.toLocaleLowerCase().includes(q))
    : ofKind;

  return (
    <div className="tpl">
      <div className="tpl__bar">
        <div className="adm-seg" role="radiogroup" aria-label={t("templates.kindLabel")}>
          {KINDS.map((k) => (
            <label key={k} className="adm-seg__opt">
              <input
                type="radio"
                name={`${uid}-kind`}
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              <span>
                {t(`templates.kind.${k}`)}
                <span className="adm-seg__count u-num">
                  {templates.filter((tpl) => tpl.kind === k).length}
                </span>
              </span>
            </label>
          ))}
        </div>
        <span className="tpl__bar-spacer" />
        <div className="tpl__search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label={t("templates.search")}
            placeholder={t("templates.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="adm-btn adm-btn--secondary tpl__import"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={16} aria-hidden="true" />
          {t("templates.import")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => void onImportFile(e)}
        />
      </div>

      {loading ? (
        <p className="adm-hint">{t("common.loading")}</p>
      ) : shown.length === 0 ? (
        <p className="tpl__empty" role="status">
          {q ? t("templates.noResults", { query: query.trim() }) : t(`templates.empty.${kind}`)}
        </p>
      ) : (
        <ul className="tpl__grid" aria-label={t(`templates.kind.${kind}`)}>
          {shown.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              busy={busy === tpl.id}
              onDownload={() => void download(tpl)}
              onEdit={() => setForm({ mode: "edit", template: tpl })}
              onDelete={() => setPendingDelete(tpl)}
            />
          ))}
        </ul>
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
          variant="destructive"
          onConfirm={() => {
            void remove(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function TemplateCard({
  tpl,
  busy,
  onDownload,
  onEdit,
  onDelete,
}: {
  tpl: TemplateSummary;
  busy: boolean;
  onDownload: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const menu = usePopover(useBreakpoint() === "mobile" ? "dialog" : "menu");
  const readOnly = !tpl.isOwn;
  return (
    <li className="tpl-card" data-testid="template-card">
      <div className="tpl-card__top">
        <span className="tpl-card__icon" aria-hidden="true">
          <FileText size={18} />
        </span>
        <span className="tpl-card__spacer" />
        {tpl.isBuiltin && <span className="tpl-badge">{t("templates.builtin")}</span>}
        {!tpl.isBuiltin && !tpl.isOwn && (
          <span className="tpl-badge tpl-badge--shared" title={t("templates.sharedHint")}>
            {t("templates.shared")}
          </span>
        )}
        <button
          type="button"
          className="adm-icon-btn"
          aria-label={t("templates.moreActions", { name: tpl.name })}
          title={t("templates.moreActionsShort")}
          {...menu.triggerProps}
        >
          <Ellipsis size={18} aria-hidden="true" />
        </button>
        <ResponsiveMenu
          open={menu.open}
          onClose={menu.close}
          anchorRef={menu.anchorRef}
          id={menu.id}
          label={t("templates.moreActions", { name: tpl.name })}
          title={tpl.name}
          placement="bottom-end"
        >
          <MenuItem icon={Download} onSelect={onDownload} disabled={busy}>
            {t("templates.download")}
          </MenuItem>
          <MenuItem
            icon={Pencil}
            onSelect={onEdit}
            disabled={readOnly}
            title={readOnly ? t("templates.readOnlyHint") : undefined}
          >
            {t("common.edit")}
          </MenuItem>
          <MenuItem
            icon={Trash2}
            tone="danger"
            onSelect={onDelete}
            disabled={readOnly}
            title={readOnly ? t("templates.readOnlyHint") : undefined}
          >
            {t("common.delete")}
          </MenuItem>
        </ResponsiveMenu>
      </div>
      <div className="tpl-card__body">
        <h3 className="tpl-card__name">{tpl.name}</h3>
        {tpl.description && <p className="tpl-card__desc">{tpl.description}</p>}
      </div>
      <div className="tpl-card__foot">
        <span className="tpl-tag">
          {tpl.language.toUpperCase()}
        </span>
        <span className="tpl-card__ver t-id">v{tpl.version}</span>
        <span className="tpl-card__spacer" />
        <button
          type="button"
          className="adm-btn adm-btn--ghost adm-btn--sm"
          disabled={busy}
          onClick={onDownload}
        >
          <Download size={15} aria-hidden="true" />
          {t("templates.download")}
        </button>
      </div>
    </li>
  );
}
