import { useTranslation } from "react-i18next";
import type { ExampleTable } from "../model/types";

/** Editable data table for a Scenario Outline's Examples block (spec §5.3
 *  amendment). Column headers become the <placeholder> names used in steps. */
export function ExamplesTable({
  value,
  onChange,
}: {
  value: ExampleTable;
  onChange: (next: ExampleTable) => void;
}) {
  const { t } = useTranslation();
  const { headers, rows } = value;

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
      <table className="tc-examples__table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>
                <div className="tc-examples__head">
                  <input
                    value={h}
                    placeholder={t("testCase.examples.columnName")}
                    onChange={(e) => setHeader(i, e.target.value)}
                  />
                  <button
                    type="button"
                    className="tc-examples__delcol"
                    title={t("testCase.examples.removeColumn")}
                    onClick={() => removeColumn(i)}
                  >
                    ×
                  </button>
                </div>
              </th>
            ))}
            <th className="tc-examples__spacer" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {headers.map((_, ci) => (
                <td key={ci}>
                  <input
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
                  onClick={() => removeRow(ri)}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
