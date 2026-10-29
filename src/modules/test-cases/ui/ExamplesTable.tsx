import { useId } from "react";
import { useTranslation } from "react-i18next";
import { FieldMessage } from "@shared/ui/FormField";
import { duplicateRow, duplicateRows } from "@shared/validation";
import type { ExampleTable } from "../model/types";

/** Editable data table for a Scenario Outline's Examples block (spec §5.3
 *  amendment). Column headers become the <placeholder> names used in steps.
 *  A repeated column name or data row gets a warning listed under the table
 *  and linked to its cells (UX-01). */
export function ExamplesTable({
  value,
  onChange,
}: {
  value: ExampleTable;
  onChange: (next: ExampleTable) => void;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const { headers, rows } = value;
  const dupHeaders = duplicateRows(headers, (h) => h);
  const dupRows = duplicateRows(rows, (r) => (r.some((c) => c.trim()) ? r.map((c) => c.trim()).join(" | ") : ""));
  const columnName = (i: number) => headers[i]?.trim() || t("testCase.examples.columnN", { n: i + 1 });
  const rowName = (i: number) => t("a11y.row", { n: i + 1 });
  const headerMsg = (i: number) => `${baseId}-h${i}-msg`;
  const rowMsg = (i: number) => `${baseId}-r${i}-msg`;

  const setHeader = (i: number, v: string) =>
    onChange({ headers: headers.map((h, idx) => (idx === i ? v : h)), rows });

  const setCell = (r: number, c: number, v: string) =>
    onChange({
      headers,
      rows: rows.map((row, ri) =>
        ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row,
      ),
    });

  const addColumn = () =>
    onChange({ headers: [...headers, ""], rows: rows.map((r) => [...r, ""]) });

  const removeColumn = (i: number) =>
    onChange({
      headers: headers.filter((_, idx) => idx !== i),
      rows: rows.map((r) => r.filter((_, ci) => ci !== i)),
    });

  const addRow = () => onChange({ headers, rows: [...rows, headers.map(() => "")] });

  const removeRow = (i: number) =>
    onChange({ headers, rows: rows.filter((_, ri) => ri !== i) });

  if (headers.length === 0) {
    return (
      <div className="tc-examples">
        <p className="tp-field__hint">{t("testCase.examples.emptyHint")}</p>
        <button type="button" className="tp-list-field__add" onClick={addColumn}>
          {t("testCase.examples.addColumn")}
        </button>
      </div>
    );
  }

  return (
    <div className="tc-examples">
      <table className="tc-examples__table" aria-label={t("testCase.examples.title")}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>
                <div className="tc-examples__head">
                  <input
                    aria-label={t("testCase.examples.columnN", { n: i + 1 })}
                    aria-describedby={dupHeaders.has(i) ? headerMsg(i) : undefined}
                    value={h}
                    placeholder={t("testCase.examples.columnName")}
                    onChange={(e) => setHeader(i, e.target.value)}
                  />
                  <button
                    type="button"
                    className="tc-examples__delcol"
                    title={t("testCase.examples.removeColumn")}
                    aria-label={`${t("testCase.examples.removeColumn")}: ${columnName(i)}`}
                    onClick={() => removeColumn(i)}
                  >
                    ×
                  </button>
                </div>
              </th>
            ))}
            <th className="tc-examples__spacer">
              <span className="sr-only">{t("testCase.examples.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {headers.map((_, ci) => (
                <td key={ci}>
                  <input
                    aria-label={`${columnName(ci)} · ${rowName(ri)}`}
                    aria-describedby={dupRows.has(ri) ? rowMsg(ri) : undefined}
                    value={row[ci] ?? ""}
                    onChange={(e) => setCell(ri, ci, e.target.value)}
                  />
                </td>
              ))}
              <td className="tc-examples__spacer">
                <button
                  type="button"
                  className="tc-examples__delrow"
                  title={t("testCase.examples.removeRow")}
                  aria-label={`${t("testCase.examples.removeRow")}: ${rowName(ri)}`}
                  onClick={() => removeRow(ri)}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(dupHeaders.size > 0 || dupRows.size > 0) && (
        <ul className="tc-examples__issues">
          {headers.map((_, i) => {
            const issue = duplicateRow(dupHeaders, i);
            return issue ? (
              <li key={`h${i}`}>
                {columnName(i)}: <FieldMessage id={headerMsg(i)} issue={issue} />
              </li>
            ) : null;
          })}
          {rows.map((_, i) => {
            const issue = duplicateRow(dupRows, i);
            return issue ? (
              <li key={`r${i}`}>
                {rowName(i)}: <FieldMessage id={rowMsg(i)} issue={issue} />
              </li>
            ) : null;
          })}
        </ul>
      )}
      <div className="tc-examples__actions">
        <button type="button" className="tp-list-field__add" onClick={addColumn}>
          {t("testCase.examples.addColumn")}
        </button>
        <button type="button" className="tp-list-field__add" onClick={addRow}>
          {t("testCase.examples.addRow")}
        </button>
      </div>
    </div>
  );
}
