import ExcelJS from "exceljs";
import templateEs from "../assets/plan-template-es.xlsx?url";
import templateEn from "../assets/plan-template-en.xlsx?url";

export interface ExportablePlan {
  filenameBase: string;
  version: string;
  planDate: string;
  author: string;
  status: string; // localized
  summary: string;
  purpose: string;
  scopeIn: string[];
  scopeOut: string[];
  testTypes: string[]; // localized
  methodology: string; // composed text
  testLevels: string[]; // localized
  deliverables: string[];
  environmentConfig: string;
  environmentRequirements: string;
  tools: string[]; // localized
  automationStrategy: string;
  testDataManagement: string;
  defectManagement: string;
  communicationPlan: string;
  conclusion: string;
  roles: { role: string; responsibility: string }[];
  sprints: { name: string; range: string }[];
  risks: { risk: string; mitigation: string }[];
  closureCriteria: { criterion: string; metric: string }[];
}

function triggerDownload(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const list = (a: string[]) => a.map((s) => s.trim()).filter(Boolean).join("\n");

function visualLines(text: string, cpl: number): number {
  return text
    .split("\n")
    .reduce((n, ln) => n + Math.max(1, Math.ceil((ln.length || 1) / cpl)), 0);
}
function growRow(ws: ExcelJS.Worksheet, rowNum: number, text: string, cpl = 90) {
  if (!text) return;
  const h = visualLines(text, cpl) * 15 + 6;
  const row = ws.getRow(rowNum);
  if (!row.height || row.height < h) row.height = h;
}

const safeMerge = (ws: ExcelJS.Worksheet, range: string) => {
  try {
    ws.mergeCells(range);
  } catch {
    // already merged (template rows) — ignore
  }
};

interface TableSpec {
  startRow: number;
  reserved: number;
  /** Column ranges to (re)merge on each row, e.g. ["B{r}:C{r}", "D{r}:F{r}"]. */
  merges: (r: number) => string[];
  fill: (ws: ExcelJS.Worksheet, r: number, item: unknown) => void;
}

/** Fills a fixed-position table, inserting styled rows when there are more items
 *  than the template reserved. Must be called bottom-to-top so row indices of
 *  not-yet-filled tables stay stable. */
function fillTable(ws: ExcelJS.Worksheet, spec: TableSpec, items: unknown[]) {
  const { startRow, reserved } = spec;
  if (items.length > reserved) {
    // Duplicate the last reserved row (keeps styling) for the overflow.
    ws.duplicateRow(startRow + reserved - 1, items.length - reserved, true);
  }
  items.forEach((item, i) => {
    const r = startRow + i;
    for (const range of spec.merges(r)) safeMerge(ws, range);
    spec.fill(ws, r, item);
  });
  // Clear any unused reserved rows (template defaults).
  for (let i = items.length; i < reserved; i += 1) {
    const r = startRow + i;
    ws.getCell(`B${r}`).value = "";
    ws.getCell(`C${r}`).value = "";
    ws.getCell(`D${r}`).value = "";
    ws.getCell(`E${r}`).value = "";
  }
}

/** Fills the PHAROS test-plan template (by language) preserving its formatting
 *  (spec §5.4 / §16). Returns the downloaded file name. */
export async function exportPlanXlsx(p: ExportablePlan, lang: string): Promise<string> {
  const url = lang.startsWith("en") ? templateEn : templateEs;
  const buffer = await fetch(url).then((r) => r.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];

  const set = (addr: string, value: string, cpl = 90) => {
    if (value) {
      ws.getCell(addr).value = value;
      growRow(ws, Number(addr.replace(/\D/g, "")), value, cpl);
    }
  };

  // Header.
  set("C4", p.version);
  set("C5", p.planDate);
  set("C6", p.author);
  set("C7", p.status);

  // Single-value sections.
  set("B11", p.summary);
  set("B13", p.purpose);
  set("B16", list(p.scopeIn));
  set("B18", list(p.scopeOut));
  set("B21", list(p.testTypes));
  set("B23", p.methodology);
  set("B25", list(p.testLevels));
  set("B27", list(p.deliverables));
  set("B30", p.environmentConfig);
  set("B32", p.environmentRequirements);
  set("B35", list(p.tools));
  set("B37", p.automationStrategy);
  set("B40", p.testDataManagement);
  set("B45", p.defectManagement);
  set("B66", p.communicationPlan);
  set("B77", p.conclusion);

  // Tables — bottom to top so insertions don't shift pending row indices.
  fillTable(
    ws,
    {
      startRow: 73,
      reserved: 3,
      merges: (r) => [`B${r}:C${r}`, `D${r}:F${r}`],
      fill: (s, r, it) => {
        const c = it as { criterion: string; metric: string };
        s.getCell(`B${r}`).value = c.criterion;
        s.getCell(`D${r}`).value = c.metric;
      },
    },
    p.closureCriteria,
  );
  fillTable(
    ws,
    {
      startRow: 61,
      reserved: 3,
      merges: (r) => [`B${r}:C${r}`, `D${r}:F${r}`],
      fill: (s, r, it) => {
        const c = it as { risk: string; mitigation: string };
        s.getCell(`B${r}`).value = c.risk;
        s.getCell(`D${r}`).value = c.mitigation;
      },
    },
    p.risks,
  );
  fillTable(
    ws,
    {
      startRow: 56,
      reserved: 3,
      merges: (r) => [`B${r}:D${r}`, `E${r}:F${r}`],
      fill: (s, r, it) => {
        const c = it as { name: string; range: string };
        s.getCell(`B${r}`).value = c.name;
        s.getCell(`E${r}`).value = c.range;
      },
    },
    p.sprints,
  );
  fillTable(
    ws,
    {
      startRow: 50,
      reserved: 4,
      merges: (r) => [`C${r}:F${r}`],
      fill: (s, r, it) => {
        const c = it as { role: string; responsibility: string };
        s.getCell(`B${r}`).value = c.role;
        s.getCell(`C${r}`).value = c.responsibility;
      },
    },
    p.roles,
  );

  const filename = `${p.filenameBase || "plan"}.xlsx`;
  const out = await wb.xlsx.writeBuffer();
  triggerDownload(out as ArrayBuffer, filename);
  return filename;
}
