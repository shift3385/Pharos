// Visual emphasis of the manual (MAN-02), apart from build-manual.mjs so
// scripts/manual.test.mjs can test it. A tour step names the control it is
// about (`focus`); the tour records its box in image pixels; the generator
// draws an outline into the capture (png.mjs `drawFocus`) and, in the PDF,
// adds a magnified inset cropped by CSS from the same file, so the repository
// never stores a second image.

/** Faro Nocturno's beacon amber (`--color-accent`), the outline's colour. */
export const FOCUS_COLOR = [242, 163, 60];

/** The PDF's text width (A4 minus 16 mm margins each side). */
export const CONTENT_MM = 178;

const PAD = 28; // image px of context around the control in the inset
const MIN_W = 240;
const MIN_H = 130;

/**
 * Where a step's capture and its inset go, in millimetres of the page, or
 * `null` when no inset is worth it (the control already fills much of the
 * capture, or magnifying would barely enlarge it).
 *
 *  - `crop`: the inset's area in image pixels, `{x, y, w, h}`;
 *  - `mode`: "beside" (capture left, inset right) or "below" (wide strips:
 *    a toolbar, a tab bar);
 *  - `imageMm`, `insetMm`: widths; `insetHmm`: the inset's height.
 */
export function focusLayout(imageW, imageH, focus) {
  if (!focus || !(focus.w > 0) || !(focus.h > 0)) return null;
  let w = Math.max(MIN_W, focus.w + 2 * PAD);
  let h = Math.max(MIN_H, focus.h + 2 * PAD);
  w = Math.min(w, imageW);
  h = Math.min(h, imageH);
  const cx = focus.x + focus.w / 2;
  const cy = focus.y + focus.h / 2;
  const x = Math.round(Math.min(Math.max(0, cx - w / 2), imageW - w));
  const y = Math.round(Math.min(Math.max(0, cy - h / 2), imageH - h));
  const crop = { x, y, w: Math.round(w), h: Math.round(h) };
  // Big controls (a whole panel, a dialog) read fine in the capture itself.
  if (crop.w > imageW * 0.5 || crop.h > imageH * 0.55) return null;
  const wide = crop.w / crop.h > 2.6;
  if (wide) {
    // The same width as a capture without an inset (.shot in build-manual.mjs).
    const imageMm = Math.round(CONTENT_MM * 0.76);
    // At most 30 mm tall: a tall inset would push the step onto a page of its own.
    const insetMm = Math.min(CONTENT_MM, Math.round((imageMm * crop.w * 2.2) / imageW), Math.round((30 * crop.w) / crop.h));
    const insetHmm = round1((insetMm * crop.h) / crop.w);
    const mag = (insetMm / crop.w) / (imageMm / imageW);
    return mag < 1.4 ? null : { mode: "below", crop, imageMm, insetMm, insetHmm, mag: round1(mag) };
  }
  const imageMm = Math.round(CONTENT_MM * 0.6);
  const imageHmm = (imageMm * imageH) / imageW;
  let insetMm = Math.round(CONTENT_MM * 0.36);
  let insetHmm = (insetMm * crop.h) / crop.w;
  if (insetHmm > imageHmm) {
    insetHmm = imageHmm;
    insetMm = Math.round((insetHmm * crop.w) / crop.h);
  }
  const mag = (insetMm / crop.w) / (imageMm / imageW);
  if (mag < 1.4) return null;
  return { mode: "beside", crop, imageMm, insetMm, insetHmm: round1(insetHmm), mag: round1(mag) };
}

const round1 = (v) => Math.round(v * 10) / 10;

/** The inset of a step in a side-by-side `group`: under its capture, as wide as
 *  the column. A half-width capture is too small to read a control, so the
 *  inset is kept even for a control that would need none at full width. */
export function groupInset(imageW, imageH, focus, columnMm) {
  if (!focus || !(focus.w > 0) || !(focus.h > 0)) return null;
  const w = Math.min(imageW, Math.max(MIN_W, focus.w + 2 * PAD));
  const h = Math.min(imageH, Math.max(MIN_H, focus.h + 2 * PAD));
  const x = Math.round(Math.min(Math.max(0, focus.x + focus.w / 2 - w / 2), imageW - w));
  const y = Math.round(Math.min(Math.max(0, focus.y + focus.h / 2 - h / 2), imageH - h));
  const crop = { x, y, w: Math.round(w), h: Math.round(h) };
  return { mode: "below", crop, imageMm: columnMm, insetMm: columnMm, insetHmm: round1((columnMm * crop.h) / crop.w), mag: round1(imageW / crop.w) };
}

/** The CSS of an inset: the capture as a background, scaled and shifted so
 *  only `crop` shows in a box of `insetMm` × `insetHmm`. */
export function insetStyle(imageW, imageH, layout) {
  const { crop, insetMm, insetHmm } = layout;
  const size = (imageW / crop.w) * 100;
  const px = imageW === crop.w ? 0 : (crop.x / (imageW - crop.w)) * 100;
  const py = imageH === crop.h ? 0 : (crop.y / (imageH - crop.h)) * 100;
  return `width:${insetMm}mm;height:${insetHmm}mm;background-size:${size.toFixed(3)}% auto;background-position:${px.toFixed(3)}% ${py.toFixed(3)}%`;
}
