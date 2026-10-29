import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import i18n from "i18next";
import { notify, ReportedError } from "../ui/notify";
import { saveFile } from "./saveFile";

/** Brand palette for generated documents. Values mirror the Faro Nocturno
 *  light-theme tokens in `shared/theme/tokens.css` (a PDF is content, not
 *  themable UI, so the hex lives here rather than as a CSS variable). */
export const BRAND = {
  navy900: "#0b1f33",
  navy500: "#1f4e79",
  navy300: "#6fa3cc",
  navy100: "#e3eef7",
  accent: "#f2a33c",
  textPrimary: "#1c2530",
  textSecondary: "#5f6b7a",
  border: "#e2e6eb",
  surface2: "#f1f4f8",
  white: "#ffffff",
} as const;

/** Pharos beacon mark as inline SVG (mirrors shared/ui/Logo.tsx). */
function beaconSvg(): string {
  return [
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">',
    `<path d="M16 5 L7 12 M16 5 L25 12" stroke="${BRAND.accent}" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>`,
    `<path d="M12 27 L13 13 H19 L20 27 Z" fill="${BRAND.navy100}" stroke="${BRAND.navy300}" stroke-width="1"/>`,
    `<rect x="13" y="8" width="6" height="5" rx="1" fill="${BRAND.accent}"/>`,
    "</svg>",
  ].join("");
}

/** Running page header: beacon + PHAROS wordmark on the left, document kind on
 *  the right, above a thin navy rule. */
export function brandHeader(kind: string) {
  return {
    margin: [40, 24, 40, 0] as [number, number, number, number],
    stack: [
      {
        columns: [
          {
            width: "auto",
            columns: [
              { svg: beaconSvg(), width: 20, height: 20 },
              { text: "PHAROS", bold: true, color: BRAND.navy900, margin: [6, 3, 0, 0] },
            ],
            columnGap: 0,
          },
          { text: kind, alignment: "right", color: BRAND.textSecondary, margin: [0, 4, 0, 0] },
        ],
      },
      {
        canvas: [
          { type: "line", x1: 0, y1: 6, x2: 515, y2: 6, lineWidth: 1, lineColor: BRAND.navy500 },
        ],
      },
    ],
  } as Content;
}

/** Page footer with a centered page counter. */
export function pageFooter(page: number, total: number): Content {
  return {
    text: `${page} / ${total}`,
    alignment: "center",
    fontSize: 8,
    color: BRAND.textSecondary,
    margin: [0, 16, 0, 0],
  };
}

/** A navy section bar (mirrors the xlsx section rows). */
export function sectionHeader(text: string): Content {
  return {
    table: { widths: ["*"], body: [[{ text, style: "sectionBar" }]] },
    layout: "noBorders",
    margin: [0, 12, 0, 4],
  };
}

/** A field value block; falls back to an em dash when empty. */
export function field(value: string): Content {
  return { text: value?.trim() ? value : "—", style: "value", margin: [0, 0, 0, 2] };
}

/** A bulleted or numbered list; falls back to an em dash when empty. */
export function itemList(items: string[], ordered = false): Content {
  const clean = items.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return field("");
  return ordered ? { ol: clean, style: "value" } : { ul: clean, style: "value" };
}

/** A two-or-more column table with a navy header row. Empty body renders a
 *  single muted "no data" row so the section still reads. */
export function dataTable(
  headers: string[],
  rows: string[][],
  emptyLabel: string,
  widths?: (string | number)[],
): Content {
  const headerRow = headers.map((h) => ({ text: h, style: "th" }));
  const body =
    rows.length > 0
      ? rows.map((r) => r.map((c) => ({ text: c || "", style: "td" })))
      : [[{ text: emptyLabel, colSpan: headers.length, style: "tdMuted" }, ...Array(headers.length - 1).fill({})]];
  return {
    table: { headerRows: 1, widths: widths ?? headers.map(() => "*"), body: [headerRow, ...body] },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => BRAND.border,
      vLineColor: () => BRAND.border,
      paddingTop: () => 4,
      paddingBottom: () => 4,
      paddingLeft: () => 6,
      paddingRight: () => 6,
    },
    margin: [0, 0, 0, 4],
  };
}

/** Shared style dictionary + page setup for every Pharos document. */
export function baseDoc(kind: string, content: Content[]): TDocumentDefinitions {
  return {
    pageSize: "A4",
    pageMargins: [40, 70, 40, 50],
    header: () => brandHeader(kind),
    footer: (page, total) => pageFooter(page, total),
    content,
    defaultStyle: { fontSize: 10, color: BRAND.textPrimary, lineHeight: 1.2 },
    styles: {
      docTitle: { fontSize: 18, bold: true, color: BRAND.navy900 },
      meta: { fontSize: 9, color: BRAND.textSecondary },
      sectionBar: {
        fontSize: 11,
        bold: true,
        color: BRAND.white,
        fillColor: BRAND.navy500,
        margin: [6, 4, 6, 4],
      },
      value: { fontSize: 10, color: BRAND.textPrimary },
      th: { fontSize: 9, bold: true, color: BRAND.white, fillColor: BRAND.navy500 },
      td: { fontSize: 9, color: BRAND.textPrimary },
      tdMuted: { fontSize: 9, italics: true, color: BRAND.textSecondary },
      mono: { fontSize: 9, color: BRAND.navy500 },
    },
  };
}

// Memoized pdfmake instance (the library + its font VFS are ~1 MB, so this
// module is meant to be imported dynamically to stay out of the main bundle).
let cached: Promise<{ pdfMake: PdfMake; vfs?: Vfs }> | null = null;

type Vfs = Record<string, string>;

interface PdfMake {
  createPdf: (
    dd: TDocumentDefinitions,
    tableLayouts?: unknown,
    fonts?: unknown,
    vfs?: Vfs,
  ) => { getBuffer: (cb: (buffer: Uint8Array) => void) => void };
}

/** The font VFS in any of the shapes `vfs_fonts` has been published with:
 *  `{ pdfMake: { vfs } }`, `{ vfs }` or (0.2.x) the file map itself. */
function vfsOf(mod: unknown): Vfs | undefined {
  const m = mod as Record<string, unknown> | undefined;
  if (!m || typeof m !== "object") return undefined;
  const nested =
    (m.pdfMake as { vfs?: Vfs } | undefined)?.vfs ?? (m.vfs as Vfs | undefined);
  if (nested && typeof nested === "object") return nested;
  return typeof m["Roboto-Regular.ttf"] === "string" ? (m as Vfs) : undefined;
}

async function getPdfMake(): Promise<{ pdfMake: PdfMake; vfs?: Vfs }> {
  if (!cached) {
    cached = (async () => {
      const [pdfMakeMod, fontsMod] = await Promise.all([
        import("pdfmake/build/pdfmake"),
        import("pdfmake/build/vfs_fonts"),
      ]);
      const pdfMake = ((pdfMakeMod as { default?: unknown }).default ??
        pdfMakeMod) as unknown as PdfMake;
      // Passed to every createPdf: under an ESM bundler pdfmake does not set
      // `window.pdfMake`, so vfs_fonts cannot register itself, and without the
      // fonts pdfmake fails asynchronously ("Roboto-Medium.ttf not found").
      const vfs =
        vfsOf(fontsMod) ?? vfsOf((fontsMod as { default?: unknown }).default);
      return { pdfMake, vfs };
    })();
  }
  return cached;
}

/** Longest a single document may take to render before it counts as failed. */
export const PDF_TIMEOUT_MS = 60_000;

/** pdfmake 0.2 reports some failures only as an unhandled rejection of its own
 *  (a string such as "File 'x.ttf' not found…", or an error from its code),
 *  never through the `getBuffer` callback. */
function isPdfmakeFailure(reason: unknown): boolean {
  if (typeof reason === "string") return true;
  return reason instanceof Error && /pdfmake|pdfkit/i.test(reason.stack ?? "");
}

/** Renders the document to PDF bytes (for a ZIP or for saveFile). Rejects
 *  instead of hanging when pdfmake fails asynchronously or takes longer than
 *  `timeoutMs`. Documents are rendered one at a time by the callers. */
export async function pdfBytes(
  dd: TDocumentDefinitions,
  timeoutMs = PDF_TIMEOUT_MS,
): Promise<Uint8Array> {
  const { pdfMake, vfs } = await getPdfMake();
  return new Promise<Uint8Array>((resolve, reject) => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (!isPdfmakeFailure(e.reason)) return;
      e.preventDefault();
      done();
      reject(e.reason instanceof Error ? e.reason : new Error(String(e.reason)));
    };
    const timer = window.setTimeout(() => {
      done();
      reject(new Error("PDF rendering timed out"));
    }, timeoutMs);
    const done = () => {
      window.clearTimeout(timer);
      window.removeEventListener("unhandledrejection", onRejection);
    };
    window.addEventListener("unhandledrejection", onRejection);
    try {
      pdfMake.createPdf(dd, undefined, undefined, vfs).getBuffer((buffer) => {
        done();
        resolve(buffer);
      });
    } catch (e) {
      done();
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** Renders the document and saves it; returns where (see saveFile). A PDF that
 *  cannot be rendered shows an error toast and rejects with `ReportedError`. */
export async function savePdf(
  dd: TDocumentDefinitions,
  filename: string,
): Promise<string> {
  let bytes: Uint8Array;
  try {
    bytes = await pdfBytes(dd);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    notify(i18n.t("downloads.pdfFailed", { name: filename, reason }), "error");
    throw new ReportedError(reason);
  }
  return saveFile(filename, bytes, "application/pdf");
}
