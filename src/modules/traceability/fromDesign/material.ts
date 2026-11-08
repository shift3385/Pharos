// The material of one analysis (IA-18, ADR-0037): what the person drops, pastes
// or picks (images, PDF, an Excalidraw sketch, a Claude Design folder or ZIP)
// turned into numbered items. Images are reduced here; text is read without
// running anything. Nothing is stored: only the name and the SHA-256 of each
// file travel with the requirements that come from it.

import JSZip from "jszip";
import type { AiImage } from "@modules/ai";
import type { DesignTool } from "./contract";
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BASE64,
  MAX_FOLDER_FILES,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  MAX_SOURCE_BYTES,
  MAX_TEXT_TOTAL,
  imageTokens,
  pdfPageCount,
  pdfTokens,
  textTokens,
} from "./limits";
import { capText, excalidrawTexts, htmlOutline, markdownText } from "./outline";
import type { ReducedImage } from "./imageReduce";

export type MaterialKind = "image" | "pdf" | "text";

export interface MaterialItem {
  id: string;
  kind: MaterialKind;
  /** File name or path in its folder, as the person sees it. */
  name: string;
  tool: DesignTool | null;
  /** A Claude Design screen (`Login` for `Login.dc.html`). */
  frame?: string;
  /** What the person adds about it («flujo de alta, paso 2»). */
  note: string;
  /** Sent in this analysis; the person can turn each item off. */
  included: boolean;
  sha256: string;
  tokens: number;
  attachment?: AiImage;
  width?: number;
  height?: number;
  pages?: number;
  text?: string;
  truncated?: boolean;
}

export type IssueReason = "unsupported" | "too-large" | "unreadable" | "too-many-pages" | "too-many-files";

export interface MaterialIssue {
  name: string;
  reason: IssueReason;
}

export interface MaterialRead {
  items: MaterialItem[];
  issues: MaterialIssue[];
}

/** A file to read: dropped, pasted, picked alone or found in a folder or ZIP. */
export interface MaterialFile {
  path: string;
  blob: Blob;
  /** Found inside a folder or ZIP: files of other types are skipped quietly. */
  nested?: boolean;
}

export interface ReadDeps {
  reduce: (blob: Blob) => Promise<ReducedImage>;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;
const IMAGE_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};
/** Folders of a design export that hold code, styles or fonts, not screens. */
const SKIPPED_DIR = /(^|\/)(node_modules|\.git|ds|fonts|gen)\//i;

const baseName = (path: string) => path.split("/").pop() ?? path;

export function classify(path: string): "image" | "pdf" | "excalidraw" | "screen" | "html" | "markdown" | "zip" | "thumbnail" | null {
  const name = baseName(path).toLowerCase();
  if (name === ".thumbnail") return "thumbnail";
  if (name.endsWith(".excalidraw")) return "excalidraw";
  if (name.endsWith(".dc.html")) return "screen";
  if (IMAGE_EXT.test(name)) return "image";
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".html") || name.endsWith(".htm")) return "html";
  if (name.endsWith(".md")) return "markdown";
  if (name.endsWith(".zip")) return "zip";
  return null;
}

/** Hex SHA-256 of the original bytes. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Blob bytes (jsdom's Blob has no `arrayBuffer`; FileReader works everywhere). */
function bytesOf(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("unreadable"));
    reader.readAsArrayBuffer(blob);
  });
}

/** The files of a ZIP, as nested material. */
export async function unzip(path: string, blob: Blob): Promise<MaterialFile[]> {
  const zip = await JSZip.loadAsync(await bytesOf(blob));
  const out: MaterialFile[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    out.push({ path: `${baseName(path)}/${entry.name}`, blob: new Blob([await entry.async("arraybuffer")]), nested: true });
  }
  return out;
}

/** Docs (README, SPEC…) first, then screens; inside each, by path. */
const textOrder = (a: MaterialItem, b: MaterialItem) =>
  Number(!!a.frame) - Number(!!b.frame) || a.name.localeCompare(b.name);

/** Reads every file into items, in order: attachments, then text. Repeated
 *  files (same bytes) are read once. Beyond the limits, items start turned
 *  off so the person chooses; nothing is sent until they press «Analizar». */
export async function readMaterial(files: MaterialFile[], deps: ReadDeps): Promise<MaterialRead> {
  const issues: MaterialIssue[] = [];
  const expanded: MaterialFile[] = [];
  for (const f of files) {
    if (classify(f.path) === "zip") {
      try {
        expanded.push(...(await unzip(f.path, f.blob)));
      } catch {
        issues.push({ name: f.path, reason: "unreadable" });
      }
    } else expanded.push(f);
  }
  const relevant = expanded.filter((f) => !(f.nested && SKIPPED_DIR.test(f.path)) && (classify(f.path) || !f.nested));
  if (relevant.length > MAX_FOLDER_FILES) issues.push({ name: "", reason: "too-many-files" });
  const isClaudeDesign = relevant.some((f) => classify(f.path) === "screen");

  const seen = new Set<string>();
  const attachments: MaterialItem[] = [];
  const texts: MaterialItem[] = [];
  let n = 0;
  for (const f of relevant.slice(0, MAX_FOLDER_FILES)) {
    const kind = classify(f.path);
    if (!kind || kind === "zip" || (kind === "thumbnail" && !isClaudeDesign)) {
      if (!f.nested) issues.push({ name: f.path, reason: "unsupported" });
      continue;
    }
    if (f.blob.size > MAX_SOURCE_BYTES) {
      issues.push({ name: f.path, reason: "too-large" });
      continue;
    }
    const bytes = await bytesOf(f.blob);
    const sha256 = await sha256Hex(bytes);
    if (seen.has(sha256)) continue;
    seen.add(sha256);
    const base = { id: `m${++n}`, name: f.path, note: "", included: true, sha256 };
    const tool: DesignTool | null = isClaudeDesign
      ? "claude-design"
      : /\.excalidraw(\.\w+)?$/i.test(f.path)
        ? "excalidraw"
        : null;
    try {
      if (kind === "image" || kind === "thumbnail") {
        const ext = baseName(f.path).split(".").pop()?.toLowerCase() ?? "";
        // Files from a folder or ZIP have no type; a `.thumbnail` is a WebP.
        const type = f.blob.type || IMAGE_TYPE[ext] || "image/webp";
        const img = await deps.reduce(f.blob.type ? f.blob : new Blob([bytes], { type }));
        attachments.push({
          ...base,
          kind: "image",
          tool,
          // Assets of a Claude Design export are photos and logos, not screens.
          included: !(isClaudeDesign && /(^|\/)assets\//i.test(f.path)),
          attachment: { mediaType: img.mediaType, data: img.data, name: baseName(f.path) },
          width: img.width,
          height: img.height,
          tokens: imageTokens(img.width, img.height),
        });
      } else if (kind === "pdf") {
        const pages = pdfPageCount(new Uint8Array(bytes));
        if (f.blob.size > MAX_PDF_BYTES) issues.push({ name: f.path, reason: "too-large" });
        else if (pages > MAX_PDF_PAGES) issues.push({ name: f.path, reason: "too-many-pages" });
        else
          attachments.push({
            ...base,
            kind: "pdf",
            tool,
            attachment: { mediaType: "application/pdf", data: toBase64(new Uint8Array(bytes)), name: baseName(f.path) },
            pages,
            tokens: pdfTokens(pages),
          });
      } else {
        const raw = new TextDecoder().decode(bytes);
        const read =
          kind === "excalidraw" ? excalidrawTexts(raw) : kind === "markdown" ? markdownText(raw) : htmlOutline(raw);
        const { text, truncated } = capText(read);
        if (!text) continue;
        texts.push({
          ...base,
          kind: "text",
          tool: tool ?? (kind === "html" ? "other" : null),
          ...(kind === "screen" ? { frame: baseName(f.path).replace(/\.dc\.html$/i, "") } : {}),
          text,
          truncated,
          tokens: textTokens(text.length),
        });
      }
    } catch {
      issues.push({ name: f.path, reason: "unreadable" });
    }
  }
  return { items: withinLimits([...attachments, ...texts.sort(textOrder)]), issues };
}

/** Turns off what goes beyond the limits, in order: the first attachments and
 *  the first text fit; the rest start off (pure — testable). */
export function withinLimits(items: MaterialItem[]): MaterialItem[] {
  let count = 0;
  let base64 = 0;
  let chars = 0;
  return items.map((item) => {
    if (!item.included) return item;
    if (item.attachment) {
      const size = item.attachment.data.length;
      if (count + 1 > MAX_ATTACHMENTS || base64 + size > MAX_ATTACHMENT_BASE64) return { ...item, included: false };
      count += 1;
      base64 += size;
      return item;
    }
    const length = item.text?.length ?? 0;
    if (chars + length > MAX_TEXT_TOTAL) return { ...item, included: false };
    chars += length;
    return item;
  });
}

export interface MaterialSummary {
  attachments: number;
  base64: number;
  chars: number;
  tokens: number;
  /** What breaks a limit: the analysis cannot start. */
  over: ("attachments" | "size" | "text")[];
  empty: boolean;
}

/** What one analysis would send (pure — testable). */
export function summarize(items: MaterialItem[]): MaterialSummary {
  const on = items.filter((i) => i.included);
  const attachments = on.filter((i) => i.attachment).length;
  const base64 = on.reduce((s, i) => s + (i.attachment?.data.length ?? 0), 0);
  const chars = on.reduce((s, i) => s + (i.text?.length ?? 0), 0);
  const over: MaterialSummary["over"] = [];
  if (attachments > MAX_ATTACHMENTS) over.push("attachments");
  if (base64 > MAX_ATTACHMENT_BASE64) over.push("size");
  if (chars > MAX_TEXT_TOTAL) over.push("text");
  return {
    attachments,
    base64,
    chars,
    tokens: on.reduce((s, i) => s + i.tokens, 0),
    over,
    empty: on.length === 0,
  };
}
