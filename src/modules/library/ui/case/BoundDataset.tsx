import "../Library.css";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  columnsOfItem,
  libraryLink,
  type DatasetRef,
  type LibraryItem,
  type LibraryRefStatus,
} from "../../model/types";
import { missingColumns } from "../../model/caseRefs";
import { ParamChip } from "../StepText";

export interface CaseTable {
  headers: string[];
  rows: { id: string; values: string[] }[];
}

/** The case's Examples table when it is bound to a dataset (boceto 6): the
 *  materialized table, read-only, under «Dataset · Name (vN)». Columns that
 *  are parameters of the case show as `<param>`; the others are greyed (they
 *  are exported too). A parameter with no column says so, and can be mapped
 *  to a column. */
export function BoundDataset({
  projectId,
  binding,
  table,
  params,
  dataset,
  status,
  onChooseRows,
  onToggleFollow,
  onUnlink,
  onMap,
  onRefresh,
}: {
  projectId: string;
  binding: DatasetRef;
  table: CaseTable;
  params: string[];
  dataset: LibraryItem | null;
  status?: LibraryRefStatus;
  onChooseRows: () => void;
  onToggleFollow: () => void;
  onUnlink: () => void;
  onMap: (param: string, column: string) => void;
  onRefresh: (how: "update" | "restore") => void;
}) {
  const { t } = useTranslation();
  const name =
    binding.name || dataset?.name || status?.name || t("library.ref.unnamed");
  const version = binding.version ?? status?.version ?? 0;
  const missing = dataset
    ? missingColumns(params, binding, dataset)
    : (status?.missingColumns ?? []);
  const columns = dataset ? columnsOfItem(dataset.definition) : [];
  return (
    <div
      className="lb-bound"
      role="group"
      aria-label={t("library.bind.label", { name, version })}
    >
      <div className="lb-block__head">
        <span className="lb-tag">{t("library.bind.tag")}</span>
        <b className="lb-block__name">{name}</b>
        <span className="lb-pill-muted">
          {binding.follow
            ? t("library.ref.follows", { version })
            : t("library.ref.pinned", { version })}
        </span>
        <span className="lb-block__actions">
          <Link
            className="ui-btn ui-btn--small ui-btn--ghost"
            to={libraryLink(projectId, "datasets", binding.datasetId)}
          >
            {t("library.ref.open")}
            <span className="sr-only"> · {name}</span>
          </Link>
          <button
            type="button"
            className="ui-btn ui-btn--small ui-btn--ghost"
            onClick={onChooseRows}
            disabled={!dataset}
          >
            {t("library.bind.chooseRows")}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--small ui-btn--ghost"
            onClick={onToggleFollow}
          >
            {binding.follow
              ? t("library.ref.pin", { version })
              : t("library.ref.follow")}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--small ui-btn--ghost"
            onClick={onUnlink}
          >
            {t("library.bind.unlink")}
          </button>
        </span>
      </div>
      {status && status.state !== "ok" && (
        <div className="lb-block__state" data-state={status.state} role="note">
          {status.state === "outdated" && (
            <>
              <span>
                {t("library.ref.outdated", {
                  version: status.latestVersion ?? version,
                })}
              </span>
              <button
                type="button"
                className="ui-btn ui-btn--small"
                onClick={() => onRefresh("update")}
              >
                {t("library.ref.update")}
              </button>
            </>
          )}
          {status.state === "modified" && (
            <>
              <span>{t("library.ref.modified")}</span>
              <button
                type="button"
                className="ui-btn ui-btn--small"
                onClick={() => onRefresh("restore")}
              >
                {t("library.ref.restore")}
              </button>
            </>
          )}
          {status.state === "deleted" && (
            <span>{t("library.bind.deleted")}</span>
          )}
          {status.state === "missing" && (
            <span>{t("library.ref.missing")}</span>
          )}
        </div>
      )}
      <div className="lb-scroll">
        <table
          className="lb-readonly-table"
          aria-label={t("library.bind.tableLabel", { name, version })}
        >
          <thead>
            <tr>
              <th scope="col" className="lb-grid__rid">
                {t("library.bind.row")}
              </th>
              {table.headers.map((h, i) => (
                <th
                  key={i}
                  scope="col"
                  data-extra={!params.includes(h) || undefined}
                >
                  {params.includes(h) ? <ParamChip name={h} /> : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, ri) => (
              <tr key={r.id}>
                <th scope="row" className="lb-grid__rid">
                  {ri + 1}
                </th>
                {table.headers.map((h, ci) => (
                  <td key={ci} data-extra={!params.includes(h) || undefined}>
                    {r.values[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {missing.map((p) => (
        <div key={p} className="lb-callout" role="note">
          <b>{t("library.bind.missing", { param: `<${p}>`, name })}</b>
          {columns.length > 0 && (
            <label className="lb-field lb-field--inline">
              <span>{t("library.bind.mapTo", { param: `<${p}>` })}</span>
              <select
                value={binding.columnMap?.[p] ?? ""}
                onChange={(e) => onMap(p, e.target.value)}
              >
                <option value="">{t("library.bind.noColumn")}</option>
                {columns.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      ))}
      {params.length > 0 && (
        <p className="lb-muted">
          {t("library.bind.matchHelp")}{" "}
          {params.map((p) => (
            <ParamChip key={p} name={p} />
          ))}
        </p>
      )}
    </div>
  );
}
