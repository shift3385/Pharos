// «Importar CSV o xlsx…» of a dataset (ADR-0055 §8): the file as a matrix
// whose first row is the header. The .xlsx is read with the same ExcelJS
// helpers as the case import (`@shared/import/xlsx`): first sheet only.

import { cellText } from "@shared/import/xlsx";
import { parseCsv } from "./table";

/** The rows of the first sheet of an .xlsx, as text. */
export async function readXlsxMatrix(buffer: ArrayBuffer): Promise<string[][]> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++)
      cells.push(cellText(row.getCell(c)).trim());
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    if (cells.length > 0) rows.push(cells);
  });
  return rows;
}

/** A dropped or picked file as a matrix: .xlsx by extension, else CSV text. */
export async function readTableFile(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name))
    return readXlsxMatrix(await file.arrayBuffer());
  return parseCsv(await file.text());
}
