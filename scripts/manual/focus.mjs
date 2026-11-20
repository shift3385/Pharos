// Visual emphasis of the manual (MAN-02), apart from build-manual.mjs so
// scripts/manual.test.mjs can test it.
//
// A tour step names the control it is about (`focus`); the tour records its
// box in capture pixels. At build time:
//
//  1. `focusZone` turns that box into the *zone*: the box plus some context,
//     snapped so its edges run through quiet pixels (no word or card is cut
//     in half where a quiet line is near) and clamped to the capture.
//  2. png.mjs `drawFocus` draws the zone's outline into the PNG: the single
//     marker the Markdown chapters and the PDF both show.
//  3. In the PDF only, `focusLayout`/`groupInset` add a «Detalle» cut-out:
//     an inline SVG that shows the same PNG through a clip *inside* that
//     outline (`cutout`), framed by one amber border of its own. The burnt-in
//     outline never enters the clip (a fixed safety margin of capture pixels
//     keeps even the image smoothing away from it), so the cut-out has exactly
//     one line at any zoom, and the repository still stores one image.
//
// The zone is stored in docs/manual/pasos.json, so a rebuild without the run's
// clean captures crops exactly where the outline was drawn.

/** Faro Nocturno's beacon amber (`--color-accent`), the outline's colour. */
export const FOCUS_COLOR = [242, 163, 60];
/** The outline's width and outer corner radius, in capture pixels. */
export const FOCUS_STROKE = 4;
export const FOCUS_RADIUS = 10;
/** Capture pixels between the outline's inner edge and the cut-out's edge. */
const SAFE = 2;

/** The PDF's text width (A4 minus 16 mm margins each side). */
export const CONTENT_MM = 178;
/** The cut-out's own frame and corner radius, in mm of the page. */
export const CUTOUT_BORDER_MM = 0.5;
export const CUTOUT_RADIUS_MM = 1.5;
/** The «Detalle» label's line above the cut-out (height + gap), in mm. */
export const LABEL_MM = 4.5;

/** Magnification of the cut-out against the capture on the page: below the
 *  minimum it adds nothing; above the maximum the pixels show. */
const MIN_MAG = 1.4;
const MAX_MAG = 3;

const round1 = (v) => Math.round(v * 10) / 10;
const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Context around the control, by kind (capture px, before snapping). The
 * cut-out starts `FOCUS_STROKE + SAFE` (6) px inside the outline, so what it
 * shows around the control is the margin minus 6.
 *  - a small control (an icon button, a short field: both sides ≤ 48 px, or
 *    one ≤ 48 and the other ≤ 240) grows to at least `MIN_ZONE` so the cut-out
 *    shows what it sits in;
 *  - a big area (a panel, a menu or popover with its trigger: either side
 *    ≥ 160 px and the other ≥ 100) gets a tight margin: it has its own border
 *    and shadow, and
 *    what lies under or beside it is not the subject;
 *  - the rest (fields, rows, toolbars) a medium one.
 */
const MIN_ZONE = { w: 150, h: 72 };
/** The smallest margin snapping may leave: the cut-out keeps 3 px of air. */
const MIN_PAD = FOCUS_STROKE + SAFE + 3;
export function contextPad(focus) {
  const lo = Math.min(focus.w, focus.h);
  const hi = Math.max(focus.w, focus.h);
  if (lo <= 48 && hi <= 240) {
    const x = Math.max(16, Math.ceil((MIN_ZONE.w - focus.w) / 2));
    const y = Math.max(16, Math.ceil((MIN_ZONE.h - focus.h) / 2));
    return { top: y, right: x, bottom: y, left: x };
  }
  const p = hi >= 160 && lo >= 100 ? 12 : 14;
  return { top: p, right: p, bottom: p, left: p };
}

/** True when the pixels of `img` in [x0, x1) × [y0, y1) are one flat colour,
 *  give or take antialiasing and a line or two crossing it (a card border):
 *  at most 2 % of them stray from the most common colour. */
export function quietBand(img, x0, y0, x1, y1) {
  return bandInk(img, x0, y0, x1, y1) <= 0.02;
}

/** The share of pixels of `img` in [x0, x1) × [y0, y1) that stray from its
 *  most common colour (text, icons, edges); Infinity for a band that leaves
 *  the image (an outline cannot go there). */
export function bandInk(img, x0, y0, x1, y1) {
  if (x0 < 0 || y0 < 0 || x1 > img.width || y1 > img.height) return Infinity;
  if (x1 <= x0 || y1 <= y0) return 0;
  const counts = new Map();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      // 5-bit buckets: a gradient or JPEG-ish noise still has one mode.
      const key = ((img.data[i] >> 3) << 10) | ((img.data[i + 1] >> 3) << 5) | (img.data[i + 2] >> 3);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let mode = 0;
  let best = -1;
  for (const [k, n] of counts) if (n > best) [mode, best] = [k, n];
  const ref = [((mode >> 10) & 31) * 8 + 4, ((mode >> 5) & 31) * 8 + 4, (mode & 31) * 8 + 4];
  let stray = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      const d = Math.abs(img.data[i] - ref[0]) + Math.abs(img.data[i + 1] - ref[1]) + Math.abs(img.data[i + 2] - ref[2]);
      if (d > 36) stray++;
    }
  }
  return stray <= 2 ? 0 : stray / ((x1 - x0) * (y1 - y0));
}

/**
 * One zone: the rectangle an outline is drawn around (outer edge), in capture
 * pixels, `{x, y, w, h}`, inside the capture. `pad` is the margin around the
 * box (`contextPad` by default). With the capture's pixels (`img`), each side
 * moves (up to 6 px in, 14 px out unless `grow` is false) to the nearest position where the band
 * under the outline and the cut-out's edge is quiet, so neither cuts a word
 * or a card in half when a quiet line is near; otherwise to the position
 * whose band holds the least ink.
 */
export function focusZone(imageW, imageH, focus, img = null, margin = null, { grow = true } = {}) {
  if (!focus || !(focus.w > 0) || !(focus.h > 0)) return null;
  const pad = { ...(margin ?? contextPad(focus)) };
  const fx0 = Math.round(focus.x);
  const fy0 = Math.round(focus.y);
  const fx1 = Math.round(focus.x + focus.w);
  const fy1 = Math.round(focus.y + focus.h);
  // A control near an edge of the capture: the margin it cannot have there
  // goes to the other side, so the zone keeps its size.
  const shift = (a, b, lo, hi, limit) => {
    if (lo - pad[a] < 0) {
      pad[b] += pad[a] - lo;
      pad[a] = lo;
    }
    if (hi + pad[b] > limit) {
      pad[a] = Math.min(lo, pad[a] + hi + pad[b] - limit);
      pad[b] = limit - hi;
    }
  };
  shift("left", "right", fx0, fx1, imageW);
  shift("top", "bottom", fy0, fy1, imageH);
  if (img) {
    const band = FOCUS_STROKE + SAFE + 1;
    const candidates = (p) => {
      const list = [p];
      for (let d = 1; d <= 14; d++) {
        if (grow) list.push(p + d);
        if (d <= 6 && p - d >= MIN_PAD) list.push(p - d);
      }
      return list;
    };
    const x0 = fx0 - pad.left;
    const x1 = fx1 + pad.right;
    const y0 = fy0 - pad.top;
    const y1 = fy1 + pad.bottom;
    // The nearest quiet position (on a tie the larger margin: more air);
    // with none, the one that cuts least ink (a popover over text).
    const pick = (p, inkAt) => {
      let best = p;
      let least = Infinity;
      for (const c of candidates(p)) {
        const ink = inkAt(c);
        if (ink <= 0.02) return c;
        if (ink < least) [best, least] = [c, ink];
      }
      return best;
    };
    // The band never reaches into the control itself (its own border).
    const b = (p) => Math.min(band, p);
    pad.top = pick(pad.top, (p) => bandInk(img, x0, fy0 - p, x1, fy0 - p + b(p)));
    pad.bottom = pick(pad.bottom, (p) => bandInk(img, x0, fy1 + p - b(p), x1, fy1 + p));
    pad.left = pick(pad.left, (p) => bandInk(img, fx0 - p, y0, fx0 - p + b(p), y1));
    pad.right = pick(pad.right, (p) => bandInk(img, fx1 + p - b(p), y0, fx1 + p, y1));
  }
  const x = Math.max(0, fx0 - pad.left);
  const y = Math.max(0, fy0 - pad.top);
  const x1 = Math.min(imageW, fx1 + pad.right);
  const y1 = Math.min(imageH, fy1 + pad.bottom);
  return { x, y, w: x1 - x, h: y1 - y };
}

/** Margin of each element of a step with several (a trigger and its menu, a
 *  field and its button): tight, so what lies between or under them stays
 *  out of the outline and of the cut-out. */
const PART_PAD = 11;

/**
 * The zones of a step: one per focused element when the tour recorded
 * several (`parts`), else one around the union box (`focus`). The outline is
 * drawn around their union and the cut-out shows that union, so a menu and
 * its trigger read as one shape without the cards around them.
 */
export function focusZones(imageW, imageH, focus, parts = null, img = null) {
  if (Array.isArray(parts) && parts.length > 1) {
    const pad = { top: PART_PAD, right: PART_PAD, bottom: PART_PAD, left: PART_PAD };
    // Never wider than the margin: growing past the text under a popover
    // would only take in more of what it covers.
    const zones = parts.map((p) => focusZone(imageW, imageH, p, img, pad, { grow: false })).filter(Boolean);
    if (zones.length > 0) return bridge(zones);
  }
  const one = focusZone(imageW, imageH, focus, img);
  return one ? [one] : [];
}

/** Two zones a few px apart (a menu just above its trigger) would show two
 *  frames side by side: a double line. The smaller one reaches into the
 *  other, well past its rounded corner, so the outline goes round one shape
 *  and the cut-out's pieces overlap. */
const BRIDGE_GAP = 24;
function bridge(zones) {
  const out = zones.map((z) => ({ ...z }));
  const area = (z) => z.w * z.h;
  // Deep enough that the two cut-out pieces (each 6 px inside its outline,
  // then inside their frame) still overlap: one clip, one frame.
  const reach = 2 * (FOCUS_STROKE + SAFE) + 12;
  for (let i = 0; i < out.length; i++) {
    for (let j = 0; j < out.length; j++) {
      const a = out[i];
      const b = out[j];
      if (i === j || area(a) > area(b)) continue;
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (overlapX > 2 * FOCUS_RADIUS) {
        const under = a.y - (b.y + b.h);
        const over = b.y - (a.y + a.h);
        if (under > -reach && under < BRIDGE_GAP) {
          const top = b.y + b.h - reach;
          a.h += a.y - top;
          a.y = top;
          align(a, b, "x", "w");
        } else if (over > -reach && over < BRIDGE_GAP) {
          a.h = b.y + reach - a.y;
          align(a, b, "x", "w");
        }
      } else if (overlapY > 2 * FOCUS_RADIUS) {
        const right = a.x - (b.x + b.w);
        const left = b.x - (a.x + a.w);
        if (right > -reach && right < BRIDGE_GAP) {
          const x0 = b.x + b.w - reach;
          a.w += a.x - x0;
          a.x = x0;
          align(a, b, "y", "h");
        } else if (left > -reach && left < BRIDGE_GAP) {
          a.w = b.x + reach - a.x;
          align(a, b, "y", "h");
        }
      }
    }
  }
  return out;
}

/** Joined zones whose sides almost line up (a menu a few px narrower than
 *  its trigger) share that side: no notch of a few px in the outline. */
function align(a, b, pos, size) {
  const near = 2 * FOCUS_RADIUS + 4;
  if (Math.abs(a[pos] - b[pos]) <= near) {
    const lo = Math.min(a[pos], b[pos]);
    a[size] += a[pos] - lo;
    b[size] += b[pos] - lo;
    a[pos] = b[pos] = lo;
  }
  const hiA = a[pos] + a[size];
  const hiB = b[pos] + b[size];
  if (Math.abs(hiA - hiB) <= near) {
    const hi = Math.max(hiA, hiB);
    a[size] = hi - a[pos];
    b[size] = hi - b[pos];
  }
}

/** The box around several zones. */
export function unionBox(zones) {
  const x = Math.min(...zones.map((z) => z.x));
  const y = Math.min(...zones.map((z) => z.y));
  return { x, y, w: Math.max(...zones.map((z) => z.x + z.w)) - x, h: Math.max(...zones.map((z) => z.y + z.h)) - y };
}

/** What the cut-out shows of one zone: the inside of its outline, `SAFE` px
 *  clear of it, in capture pixels (`r`: the smallest corner radius that keeps
 *  the outline's rounded corners out; any larger one does too). */
export function cutout(zone) {
  const inset = FOCUS_STROKE + SAFE;
  return {
    x: zone.x + inset,
    y: zone.y + inset,
    w: Math.max(1, zone.w - 2 * inset),
    h: Math.max(1, zone.h - 2 * inset),
    r: Math.max(0, FOCUS_RADIUS - inset),
  };
}

/** The pieces of a cut-out (one per zone) and the box around them. */
function cutouts(zones) {
  const pieces = zones.map(cutout);
  return { pieces, crop: unionBox(pieces) };
}

/**
 * Where a step's capture and its cut-out go, in millimetres of the page, or
 * `null` when no cut-out is worth it (the zones already fill much of the
 * capture, or magnifying would barely enlarge them).
 *
 *  - `crop`: the box the cut-out shows, in capture pixels; `pieces`: the
 *    clip, one rounded rectangle per zone (`cutout`);
 *  - `mode`: "beside" (capture left, cut-out right) or "below" (wide strips:
 *    a toolbar, a tab bar);
 *  - `imageMm`, `insetMm`: widths; `insetHmm`: the cut-out's height;
 *  - `topMm` ("beside"): how far down the capture the «Detalle» block starts,
 *    so the cut-out sits level with its zone.
 */
export function focusLayout(imageW, imageH, zones) {
  if (!zones?.length) return null;
  const zone = unionBox(zones);
  // Big areas (a whole panel, a dialog) read fine in the capture itself.
  if (zone.w > imageW * 0.5 || zone.h > imageH * 0.55) return null;
  const { pieces, crop } = cutouts(zones);
  if (crop.w / crop.h > 2.6) {
    // The same width as a capture without a cut-out (.shot in build-manual.mjs).
    const imageMm = Math.round(CONTENT_MM * 0.76);
    const pxMm = imageMm / imageW;
    // At most 30 mm tall: a tall cut-out would push the step onto a page of its own.
    const insetMm = Math.min(CONTENT_MM, crop.w * pxMm * 2.4, (30 * crop.w) / crop.h);
    const mag = insetMm / crop.w / pxMm;
    if (mag < MIN_MAG) return null;
    return { mode: "below", crop, pieces, imageMm, insetMm: round3(insetMm), insetHmm: round3((insetMm * crop.h) / crop.w), mag: round1(mag) };
  }
  const imageMm = Math.round(CONTENT_MM * 0.6);
  const pxMm = imageMm / imageW;
  const imageHmm = imageH * pxMm;
  let insetMm = Math.min(Math.round(CONTENT_MM * 0.36), crop.w * pxMm * MAX_MAG);
  let insetHmm = (insetMm * crop.h) / crop.w;
  if (insetHmm > imageHmm - LABEL_MM) {
    insetHmm = imageHmm - LABEL_MM;
    insetMm = (insetHmm * crop.w) / crop.h;
  }
  const mag = insetMm / crop.w / pxMm;
  if (mag < MIN_MAG) return null;
  const centre = (crop.y + crop.h / 2) * pxMm;
  const topMm = Math.min(Math.max(0, centre - LABEL_MM - insetHmm / 2), imageHmm - LABEL_MM - insetHmm);
  return { mode: "beside", crop, pieces, imageMm, insetMm: round3(insetMm), insetHmm: round3(insetHmm), topMm: round1(topMm), mag: round1(mag) };
}

/** The cut-out of a step in a side-by-side `group`: under its capture, at most
 *  as wide as the column. A half-width capture is too small to read a
 *  control, so the cut-out is kept even for a zone that would need none at
 *  full width. */
export function groupInset(imageW, imageH, zones, columnMm) {
  if (!zones?.length) return null;
  const { pieces, crop } = cutouts(zones);
  const pxMm = columnMm / imageW;
  let insetMm = Math.min(columnMm, crop.w * pxMm * MAX_MAG);
  // Never taller than 60 mm: the pair must fit on one page.
  if ((insetMm * crop.h) / crop.w > 60) insetMm = (60 * crop.w) / crop.h;
  return {
    mode: "below",
    crop,
    pieces,
    imageMm: columnMm,
    insetMm: round3(insetMm),
    insetHmm: round3((insetMm * crop.h) / crop.w),
    mag: round1(insetMm / crop.w / pxMm),
  };
}

/**
 * The cut-out as inline SVG, all in capture pixels (the viewBox), so nothing
 * can drift apart at any zoom: each piece is filled amber, then the capture
 * (`url`, `imageW` × `imageH`) is drawn through the union of the pieces
 * shrunk by the frame's width. What stays amber is one frame along the outer
 * edge of the union: a single line, even where two pieces meet.
 */
export function cutoutSvg(url, imageW, imageH, layout, { id, label }) {
  const { crop, pieces, insetMm, insetHmm } = layout;
  const unit = crop.w / insetMm; // capture px per mm of the page
  const sw = CUTOUT_BORDER_MM * unit;
  const n = (v) => round3(v);
  const color = `rgb(${FOCUS_COLOR.join(",")})`;
  const rect = (p, inset, extra = "") => {
    const r = Math.max(p.r, CUTOUT_RADIUS_MM * unit) - inset;
    return `<rect x="${n(p.x + inset)}" y="${n(p.y + inset)}" width="${n(p.w - 2 * inset)}" height="${n(p.h - 2 * inset)}" rx="${n(Math.max(0, r))}"${extra}/>`;
  };
  return (
    `<svg class="cutout" role="img" aria-label="${label}" width="${n(insetMm)}mm" height="${n(insetHmm)}mm" ` +
    `viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><clipPath id="${id}">${pieces.map((p) => rect(p, sw)).join("")}</clipPath></defs>` +
    `<g fill="${color}">${pieces.map((p) => rect(p, 0)).join("")}</g>` +
    `<image href="${url}" x="0" y="0" width="${imageW}" height="${imageH}" preserveAspectRatio="none" clip-path="url(#${id})"/>` +
    `</svg>`
  );
}

/** True when two images have the focus colour at exactly the same pixels: a
 *  committed capture whose outline moved is not «unchanged» even when the move
 *  is a tiny share of its pixels. */
export function sameFocusPixels(a, b, color = FOCUS_COLOR) {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i += 4) {
    const inA = a.data[i] === color[0] && a.data[i + 1] === color[1] && a.data[i + 2] === color[2];
    const inB = b.data[i] === color[0] && b.data[i + 1] === color[1] && b.data[i + 2] === color[2];
    if (inA !== inB) return false;
  }
  return true;
}
