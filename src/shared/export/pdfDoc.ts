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

/** Headline level of the section bars: `keepHeadingsWithContent` breaks the
 *  page before a bar that would end a page without its content. */
export const SECTION_LEVEL = 1;

/** The navy bar itself. */
function bar(text: string): Content {
  return {
    table: { widths: ["*"], body: [[{ text, style: "sectionBar" }]] },
    layout: "noBorders",
    margin: [0, 12, 0, 4],
  };
}

/** A navy section bar (mirrors the xlsx section rows) on its own. Prefer
 *  `section`, which keeps the bar with its content; a bar on its own relies
 *  on `keepHeadingsWithContent`, which cannot see a table that pdfmake moves
 *  to the next page. */
export function sectionHeader(text: string): Content {
  return { ...(bar(text) as object), headlineLevel: SECTION_LEVEL } as Content;
}

type Node = Record<string, unknown>;

/** How many items of a list go with its bar: a short list all of them. */
const LIST_HEAD = 2;
const SHORT_LIST = 4;

/** The first piece of a block, which goes with its bar, and the rest. */
function splitHead(body: Content): [Content, Content | undefined] {
  const b = body as unknown as Node;
  if (!b || typeof b !== "object" || b.unbreakable) return [body, undefined];
  if (Array.isArray(b.stack) && b.stack.length > 1) {
    const { stack, ...rest } = b as Node & { stack: Content[] };
    return [{ stack: stack.slice(0, 1) }, { ...rest, stack: stack.slice(1) }];
  }
  for (const key of ["ul", "ol"] as const) {
    const items = b[key];
    if (Array.isArray(items) && items.length > SHORT_LIST) {
      const tail: Node = { ...b, [key]: items.slice(LIST_HEAD) };
      if (key === "ol") tail.start = ((b.start as number | undefined) ?? 1) + LIST_HEAD;
      return [
        { ...b, [key]: items.slice(0, LIST_HEAD) } as unknown as Content,
        tail as unknown as Content,
      ];
    }
  }
  return [body, undefined];
}

/** A table of `dataTable` with the bar as its first header row: pdfmake keeps
 *  the header rows with the first row of data (and repeats them on the next
 *  page when the table goes on), so the bar never ends a page alone. A white
 *  rule of the old gap's height separates the bar from the column titles. */
function withTitleRow(t: Node & { table: Node }, title: string): Content {
  const body = t.table.body as unknown[][];
  const cols = body[0]?.length ?? 1;
  const layout = t.layout as Record<string, (i: number, node: unknown) => unknown>;
  return {
    ...t,
    margin: [0, 12, 0, 4],
    table: {
      ...t.table,
      headerRows: ((t.table.headerRows as number | undefined) ?? 0) + 1,
      body: [
        [
          { text: title, style: "sectionBar", colSpan: cols, margin: [0, 2, 0, 2] },
          ...Array.from({ length: cols - 1 }, () => ({})),
        ],
        ...body,
      ],
    },
    layout: {
      ...layout,
      hLineWidth: (i: number, node: unknown) => (i === 0 ? 0 : i === 1 ? 4 : layout.hLineWidth(i, node)),
      hLineColor: (i: number, node: unknown) => (i === 1 ? BRAND.white : layout.hLineColor(i, node)),
    },
  } as Content;
}

/** A section: its bar and its content, and the bar never ends a page without
 *  at least the start of the content (PLN-05). The bar goes in one unbreakable
 *  block with the first paragraph of a field, the first items of a list or
 *  all of a short one, the whole of a `lines` block; it heads a table as one
 *  more header row. The rest flows across pages as usual. */
export function section(title: string, body: Content): Content[] {
  const b = body as unknown as Node;
  if (b && typeof b === "object" && b.table && Array.isArray((b.table as Node).body)) {
    return [withTitleRow(b as Node & { table: Node }, title)];
  }
  const [head, rest] = splitHead(body);
  return [
    { stack: [bar(title), head], unbreakable: true },
    ...(rest ? [rest] : []),
  ];
}

/** Styles that belong to a heading rather than to its content: a section bar
 *  and the header row of a table. */
const HEADING_STYLES = new Set(["sectionBar", "th"]);

/** What pdfmake 0.2 tells `pageBreakBefore` about a laid-out node. */
export interface PageNode {
  headlineLevel?: number;
  style?: unknown;
  /** Share of the page content area above the node (0 = at its top). */
  startPosition?: { verticalRatio?: number };
}

/** pdfmake's `pageBreakBefore` (0.2 signature): a section bar starts a new
 *  page when none of its content would follow it on this one, so a heading
 *  never ends a page alone. Content is any node with a style of its own
 *  (paragraph, list, table cell…) other than a heading's: the bar's text, a
 *  table header row, or the running header and footer of the page, which
 *  pdfmake also lists among the following nodes and which carry no style. A
 *  bar already at the top of a page stays where it is. */
export function keepHeadingsWithContent(
  node: PageNode,
  followingNodesOnPage: PageNode[],
): boolean {
  if (node.headlineLevel !== SECTION_LEVEL) return false;
  if ((node.startPosition?.verticalRatio ?? 0) < 0.05) return false;
  return !followingNodesOnPage.some(
    (n) =>
      n.headlineLevel !== SECTION_LEVEL &&
      typeof n.style === "string" &&
      !HEADING_STYLES.has(n.style),
  );
}

/** Characters the bundled Roboto has no glyph for (they print as a box),
 *  mapped to one it has. Arrows separate ranges («2026-11-09 → 2026-11-22»),
 *  so they become an en dash. */
const FONT_FALLBACKS: Record<string, string> = {
  "→": "–",
  "←": "–",
  "↔": "–",
  "⇒": "–",
  "⟶": "–",
  "➔": "–",
  "➜": "–",
  "✓": "•",
  "✔": "•",
};
const MISSING_GLYPHS = new RegExp(`[${Object.keys(FONT_FALLBACKS).join("")}]`, "gu");

/** A text the bundled font can print (see FONT_FALLBACKS). */
export function fontSafe(text: string): string {
  return text.replace(MISSING_GLYPHS, (ch) => FONT_FALLBACKS[ch] ?? ch);
}

/** A copy of a document tree with every string passed through `fontSafe`. */
function fontSafeTree<T>(value: T): T {
  if (typeof value === "string") return fontSafe(value) as T;
  if (Array.isArray(value)) return value.map(fontSafeTree) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, fontSafeTree(v)]),
    ) as T;
  }
  return value;
}

/** A field value: one justified paragraph per line of the text (a blank line
 *  leaves a gap). Each line is a paragraph of its own, so its last line is
 *  never stretched. Falls back to an em dash when empty. */
export function field(value: string): Content {
  if (!value?.trim()) return { text: "—", style: "value", margin: [0, 0, 0, 2] };
  const stack: Content[] = [];
  for (const line of value.replace(/\r\n?/g, "\n").trim().split("\n")) {
    if (line.trim()) stack.push({ text: line.trimEnd(), style: "paragraph" });
    else if (stack.length > 0) stack.push({ text: " ", fontSize: 5 });
  }
  return { stack, margin: [0, 0, 0, 2] };
}

/** One entry per line, not justified (e.g. the methodology: «Ágil»,
 *  «Duración de sprint: 2 semanas», …). Empty → an em dash. */
export function lines(entries: readonly string[]): Content {
  const clean = entries.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return field("");
  // Short: kept on one page.
  return {
    stack: clean.map((text) => ({ text, style: "value" })),
    margin: [0, 0, 0, 2],
    unbreakable: true,
  };
}

/** A bulleted or numbered list; falls back to an em dash when empty. */
export function itemList(items: string[], ordered = false): Content {
  const clean = items.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return field("");
  // Justified like the paragraphs; an item of one line is not stretched.
  return ordered
    ? { ol: clean, style: "value", alignment: "justify" }
    : { ul: clean, style: "value", alignment: "justify" };
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
    table: {
      headerRows: 1,
      // The header row never ends a page without a row of data under it.
      keepWithHeaderRows: 1,
      dontBreakRows: true,
      widths: widths ?? headers.map(() => "*"),
      body: [headerRow, ...body],
    },
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
    header: () => brandHeader(fontSafe(kind)),
    footer: (page, total) => pageFooter(page, total),
    content: fontSafeTree(content),
    // pdfmake 0.2 calls it as (node, followingNodesOnPage, …); the bundled
    // types describe 0.3's (node, nodeQueries).
    pageBreakBefore: keepHeadingsWithContent as unknown as TDocumentDefinitions["pageBreakBefore"],
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
      paragraph: { fontSize: 10, color: BRAND.textPrimary, alignment: "justify", margin: [0, 0, 0, 2] },
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
