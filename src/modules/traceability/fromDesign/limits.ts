// Limits of one analysis of designs (IA-18, ADR-0037). The lowest common
// denominator of the providers: Gemini caps inline data at 20 MB per request,
// Claude reads at most 1568 px on the long edge on most models. The same caps
// are checked again in Rust (`ai.rs`) before anything leaves the machine.

/** Images and PDF files sent in one analysis. */
export const MAX_ATTACHMENTS = 8;
/** Long edge after reduction, in pixels. */
export const MAX_EDGE = 1568;
export const IMAGE_QUALITY = 0.85;
/** Base64 of every attachment together (≈ 12 MB of files). */
export const MAX_ATTACHMENT_BASE64 = 16_000_000;
/** A PDF goes as is: at most this size. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** A file read before reduction: anything larger is not a screenshot. */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
/** Text taken from one design file (a screen's outline, a document). */
export const MAX_TEXT_PER_ITEM = 8_000;
/** Text taken from every design file together. */
export const MAX_TEXT_TOTAL = 60_000;
/** Files read from one folder or ZIP. */
export const MAX_FOLDER_FILES = 400;

/** The size that fits within `max` on the long edge, never enlarged (pure). */
export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max || long <= 0) return { width: Math.round(width), height: Math.round(height) };
  const k = max / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** Rough input tokens of an image: providers differ (Claude counts 28 px
 *  patches, Gemini 768 px tiles, OpenAI 512 px tiles), so this is a guide shown
 *  before sending, not a price (pure). */
export function imageTokens(width: number, height: number): number {
  return Math.ceil(width / 28) * Math.ceil(height / 28);
}

/** Pages of one PDF: each page costs about as much as an image. */
export const MAX_PDF_PAGES = 20;

/** Rough tokens of a PDF: Claude and Gemini read each page as text and as an
 *  image, about 2 000 tokens a page. */
export function pdfTokens(pages: number): number {
  return Math.max(1, pages) * 2_000;
}

/** Pages of a PDF, counted from its page objects without a PDF library: a
 *  guide for the limit and the estimate (pure — testable). */
export function pdfPageCount(bytes: Uint8Array): number {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}

/** About four characters a token. */
export function textTokens(chars: number): number {
  return Math.ceil(chars / 4);
}
