import type ExcelJS from "exceljs";
import type { Content } from "pdfmake/interfaces";
import { dataTable, sectionHeader } from "./pdfDoc";

/** A table an export adds after its template's own content (EXP-03): one
 *  sheet of its own in the `.xlsx` (after the template's sheets, which stay
 *  as they are) and one section at the end of the PDF. `pdf` narrows a wide
 *  table for the page; without it the PDF shows the same columns. */
export interface ExportTable {
  /** Sheet name and PDF section title (≤ 31 characters, Excel's limit). */
  name: string;
  headers: string[];
  rows: (string | number)[][];
  /** Column widths of the sheet, in characters. */
  widths?: number[];
  pdf?: {
    headers: string[];
    rows: string[][];
    widths?: (string | number)[];
  };
}

const EXCEL_NAME = /[[\]:*?/\\]/g;

/** A name Excel accepts, unique in the workbook. */
function sheetName(wb: ExcelJS.Workbook, name: string): string {
  const base = name.replace(EXCEL_NAME, " ").trim().slice(0, 31) || "Sheet";
  let out = base;
  for (let n = 2; wb.getWorksheet(out); n += 1) {
    const suffix = ` (${n})`;
    out = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  return out;
}

/** Appends one sheet per table that has rows: bold header, wrapped cells. */
export function addTableSheets(
  wb: ExcelJS.Workbook,
  tables: readonly ExportTable[] | undefined,
): void {
  for (const table of tables ?? []) {
    if (table.rows.length === 0) continue;
    const sheet = wb.addWorksheet(sheetName(wb, table.name));
    sheet.columns = table.headers.map((_, i) => ({
      width: table.widths?.[i] ?? 18,
    }));
    sheet.addRow(table.headers).font = { bold: true };
    for (const r of table.rows) {
      const row = sheet.addRow(r);
      row.alignment = { wrapText: true, vertical: "top" };
    }
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }
}

/** The PDF sections of the tables that have rows. */
export function tableSections(
  tables: readonly ExportTable[] | undefined,
  emptyLabel: string,
): Content[] {
  return (tables ?? [])
    .filter((table) => table.rows.length > 0)
    .flatMap((table) => [
      sectionHeader(table.name),
      table.pdf
        ? dataTable(
            table.pdf.headers,
            table.pdf.rows,
            emptyLabel,
            table.pdf.widths,
          )
        : dataTable(
            table.headers,
            table.rows.map((r) => r.map(String)),
            emptyLabel,
          ),
    ]);
}
