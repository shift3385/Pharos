import { saveFile } from "@shared/export/saveFile";
import {
  AUDIT_EXPORT_CAP,
  AUDIT_MAX_LIMIT,
  diffRows,
  elementName,
  summaryEntries,
  valueLines,
  type AuditPage,
  type AuditQuery,
  type AuditRow,
  type AuditVerify,
} from "../model/audit";

// Export of Administración › Auditoría (AUD-01): what the filters show, every
// page, as .xlsx or CSV. One row per changed field, so «antes» and «después»
// can be filtered in a spreadsheet; an event without a diff (import, cascade,
// execution, redacted) is one row with its summary. The .xlsx adds a sheet
// with the result of the integrity check.

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** What the rows need from the screen (translated labels). */
export interface AuditExportLabels {
  headers: string[];
  actor: (actor: string) => string;
  action: (action: string) => string;
  entity: (entity: string) => string;
  device: (deviceId: string) => string;
  field: (field: string) => string;
  redacted: string;
  integrity: { sheet: string; headers: string[]; ok: string; broken: (c: AuditVerify["chains"][number]) => string; checkedAt: string };
  sheet: string;
}

/** Every event the query matches, page by page, up to the cap. */
export async function fetchAll(
  list: (q: AuditQuery) => Promise<AuditPage>,
  query: AuditQuery,
): Promise<{ events: AuditRow[]; total: number; capped: boolean }> {
  const events: AuditRow[] = [];
  let total = 0;
  for (let offset = 0; offset < AUDIT_EXPORT_CAP; offset += AUDIT_MAX_LIMIT) {
    const page = await list({ ...query, offset, limit: AUDIT_MAX_LIMIT });
    total = page.total;
    events.push(...page.events);
    if (page.events.length < AUDIT_MAX_LIMIT || events.length >= total) break;
  }
  return { events: events.slice(0, AUDIT_EXPORT_CAP), total, capped: total > AUDIT_EXPORT_CAP };
}

const text = (v: unknown) => valueLines(v).join("\n");

/** The table: a header row, then one row per changed field. */
export function exportRows(events: AuditRow[], l: AuditExportLabels): string[][] {
  const rows: string[][] = [l.headers];
  for (const e of events) {
    const base = [
      e.at,
      l.actor(e.actor),
      e.onBehalfOf ? l.actor(e.onBehalfOf) : "",
      l.action(e.action),
      l.entity(e.entity),
      elementName(e) ?? e.entityId,
      e.projectName ?? e.projectId ?? "",
    ];
    const tail = [l.device(e.deviceId), String(e.chainSeq), e.hash];
    const diff = diffRows(e.changes);
    if (diff.length === 0) {
      const summary = e.redactedAt
        ? l.redacted
        : summaryEntries(e.summary)
            .map(([k, v]) => `${k}: ${text(v)}`)
            .join("; ");
      rows.push([...base, "", "", summary, ...tail]);
      continue;
    }
    for (const d of diff) rows.push([...base, l.field(d.field), text(d.before), text(d.after), ...tail]);
  }
  return rows;
}

/** RFC 4180, with a BOM so Excel reads the accents. */
export function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export async function saveAuditCsv(name: string, rows: string[][]): Promise<string> {
  return saveFile(name, toCsv(rows), "text/csv");
}

export async function saveAuditXlsx(
  name: string,
  rows: string[][],
  verify: AuditVerify | null,
  l: AuditExportLabels,
  now: Date,
): Promise<string> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(l.sheet);
  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.columns.forEach((c, i) => {
    c.width = [24, 22, 18, 14, 16, 16, 18, 18, 30, 30, 14, 8, 20][i] ?? 16;
    c.alignment = { vertical: "top", wrapText: true };
  });
  if (rows.length > 1) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: rows[0].length } };

  const integrity = wb.addWorksheet(l.integrity.sheet);
  integrity.addRow([l.integrity.checkedAt, now.toISOString()]);
  integrity.addRow([]);
  integrity.addRow(l.integrity.headers).font = { bold: true };
  for (const c of verify?.chains ?? []) {
    integrity.addRow([l.device(c.deviceId), c.chainOwner, c.count, c.lastAt ?? "", c.broken ? l.integrity.broken(c) : l.integrity.ok]);
  }
  integrity.columns.forEach((c) => (c.width = 28));
  const buffer = await wb.xlsx.writeBuffer();
  return saveFile(name, new Uint8Array(buffer as ArrayBuffer), XLSX_MIME);
}
