import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Download, Upload } from "lucide-react";
import { useAuth } from "@modules/auth";
import { saveFile } from "@shared/export/saveFile";
import { InfoTip } from "@shared/ui/InfoTip";
import { LoadError } from "@shared/ui/LoadError";
import { unlessReported } from "@shared/ui/notify";
import { FormSkeleton } from "@shared/ui/Skeleton";
import { useToast } from "@shared/ui/Toast";
import { useConfirm } from "@shared/ui/useConfirm";
import { readTableFile } from "../model/importFile";
import {
  addColumn,
  addRow,
  matrixOf,
  tableFromMatrix,
  tableIssues,
  toCsv,
  type DatasetTable,
  type TableIssue,
} from "../model/table";
import {
  LIMITS,
  columnsOfItem,
  rowsOfItem,
  type LibraryItem,
} from "../model/types";
import { DatasetGrid } from "./DatasetGrid";
import { ItemEditorFrame } from "./ItemEditorFrame";
import { useItemEditor } from "./useItemEditor";

interface DatasetForm extends DatasetTable {
  name: string;
  description: string;
}

const emptyForm = (): DatasetForm => ({
  name: "",
  description: "",
  columns: [],
  rows: [],
});

const fromItem = (item: LibraryItem): DatasetForm => ({
  name: item.name,
  description: item.description,
  columns: columnsOfItem(item.definition),
  rows: rowsOfItem(item.body),
});

const toBody = (f: DatasetForm) => ({
  definition: f.columns.map((c) => ({ id: c.id, name: c.name.trim() })),
  body: f.rows.map((r) => ({
    id: r.id,
    values: Object.fromEntries(
      f.columns.map((c) => [c.id, r.values[c.id] ?? ""]),
    ),
  })),
});

const contentKey = (f: DatasetForm) =>
  JSON.stringify([f.name.trim(), toBody(f)]);

function issueText(i: TableIssue, t: TFunction): string {
  switch (i.kind) {
    case "noColumns":
      return t("library.error.no_columns");
    case "tooManyColumns":
      return t("library.error.too_many_columns");
    case "tooManyRows":
      return t("library.error.too_many_rows");
    case "emptyColumn":
      return t("library.dataset.emptyColumn", { n: i.column });
    case "badColumn":
      return t("library.dataset.badColumn", { name: i.name });
    case "duplicateColumn":
      return t("library.dataset.duplicateColumn", { name: i.name });
    case "cellTooLong":
      return t("library.dataset.cellTooLong", { row: i.row, column: i.column });
  }
}

/** Editing a dataset (boceto 5): an editable grid with stable row and column
 *  ids, paste from a spreadsheet, import from CSV or .xlsx, export to CSV,
 *  and the limits of ADR-0055 §1 (30 columns, 500 rows, 4 KB per cell). */
export function DatasetEditor({
  projectId,
  itemId,
  when,
  onSaved,
  onClose,
}: {
  projectId: string;
  itemId: string | null;
  when: (s: string) => string;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const ed = useItemEditor<DatasetForm>({
    projectId,
    itemId,
    kind: "dataset",
    userId,
    empty: emptyForm,
    fromItem,
    toBody,
    contentKey,
    onSaved,
    onClose,
  });
  if (ed.loading) return <FormSkeleton />;
  if (ed.failed)
    return (
      <LoadError message={t("library.loadItemFailed")} onRetry={ed.retry} />
    );

  const form = ed.content;
  const prefix = t("library.dataset.columnPrefix");
  const setTable = (next: DatasetTable) =>
    ed.setContent({ ...form, columns: next.columns, rows: next.rows });
  const issues = [
    ...(form.name.trim() ? [] : [t("library.error.empty_name")]),
    ...tableIssues(form).map((i) => issueText(i, t)),
  ];

  async function importFile(file: File) {
    let matrix: string[][];
    try {
      matrix = await readTableFile(file);
    } catch {
      toast(t("library.dataset.importFailed", { name: file.name }), "error");
      return;
    }
    if (matrix.length === 0) {
      toast(t("library.dataset.importEmpty", { name: file.name }), "error");
      return;
    }
    if (form.rows.length > 0) {
      const ok = await confirm({
        title: t("library.dataset.replaceTitle"),
        message: t("library.dataset.replaceMessage", { name: file.name }),
        confirmLabel: t("library.dataset.replaceConfirm"),
      });
      if (!ok) return;
    }
    const next = tableFromMatrix(matrix, form, prefix);
    setTable(next);
    toast(
      t("library.dataset.imported", {
        rows: next.rows.length,
        columns: next.columns.length,
      }),
    );
  }

  async function exportCsv() {
    const delimiter = i18n.resolvedLanguage === "en" ? "," : ";";
    const name = `${(form.name.trim() || "dataset").replace(/[\\/:*?"<>|]+/g, "_")}.csv`;
    const saved = await unlessReported(
      saveFile(
        name,
        toCsv(matrixOf(form), delimiter),
        "text/csv;charset=utf-8",
      ),
    );
    if (saved) toast(t("library.dataset.exported", { name: saved }));
  }

  return (
    <>
      <ItemEditorFrame
        item={ed.item}
        title={
          form.name.trim() || ed.item?.name || t("library.dataset.newTitle")
        }
        contentLabel={t("library.editor.data")}
        userId={userId}
        saving={ed.saving}
        canSave={issues.length === 0}
        onBack={() => void ed.back()}
        onSave={() => void ed.save()}
        onToggleStatus={() => void ed.toggleStatus()}
        onDelete={() => void ed.remove()}
        when={when}
      >
        <div className="lb-form">
          <label className="lb-field">
            <span>{t("library.field.name")}</span>
            <input
              value={form.name}
              maxLength={LIMITS.name}
              onChange={(e) => ed.setContent({ ...form, name: e.target.value })}
            />
          </label>
          <label className="lb-field">
            <span>{t("library.field.description")}</span>
            <textarea
              rows={2}
              value={form.description}
              maxLength={LIMITS.description}
              onChange={(e) =>
                ed.setContent({ ...form, description: e.target.value })
              }
            />
          </label>
        </div>
        <div className="lb-row lb-toolbar">
          <button
            type="button"
            className="ui-btn ui-btn--small"
            disabled={
              form.columns.length === 0 || form.rows.length >= LIMITS.rows
            }
            onClick={() => setTable(addRow(form))}
          >
            + {t("library.dataset.addRow")}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--small"
            disabled={form.columns.length >= LIMITS.columns}
            onClick={() => setTable(addColumn(form, prefix))}
          >
            + {t("library.dataset.addColumn")}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--small"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={15} aria-hidden="true" />
            <span className="ui-btn__text">{t("library.dataset.import")}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,text/csv"
            className="sr-only"
            tabIndex={-1}
            aria-label={t("library.dataset.import")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importFile(file);
            }}
          />
          <button
            type="button"
            className="ui-btn ui-btn--small"
            disabled={form.columns.length === 0}
            onClick={() => void exportCsv()}
          >
            <Download size={15} aria-hidden="true" />
            <span className="ui-btn__text">{t("library.dataset.export")}</span>
          </button>
          <span className="lb-muted lb-toolbar__count">
            {t("library.dataset.counts", {
              rows: form.rows.length,
              columns: form.columns.length,
            })}
          </span>
          <InfoTip id="lb-dataset-paste-help" label={t("library.dataset.gridLabel")}>
            {t("library.dataset.pasteTip")}
          </InfoTip>
        </div>
        <DatasetGrid
          value={form}
          onChange={setTable}
          label={t("library.dataset.gridLabel")}
        />
        {issues.length > 0 && ed.dirty && (
          <ul className="lb-issues" aria-label={t("library.editor.issues")}>
            {issues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {/* One short line; the why sits behind its «?» (FIX-44). */}
        <div className="lb-callout lb-callout--line" role="note">
          <b>{t("library.dataset.secretsTitle")}</b>
          <InfoTip id="lb-dataset-secrets-help" label={t("library.dataset.secretsTitle")}>
            {t("library.dataset.secretsHelp")}
          </InfoTip>
        </div>
      </ItemEditorFrame>
      {ed.dialogs}
      {confirmDialog}
    </>
  );
}
