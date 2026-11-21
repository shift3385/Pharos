// Visual emphasis of the manual (MAN-02), apart from build-manual.mjs so
// scripts/manual.test.mjs can test it.
//
// A tour step names the control(s) it is about (`focus`); the tour records,
// in capture pixels, their union box (`focus`) and, with several elements,
// each one's box (`focusParts`). At build time:
//
//  1. `focusCuts` decides what the «Detalle» cut-out shows: one *piece* per
//     element. The rule (the owner's: an enlargement never looks as if it had
//     two borders):
//       - an element with a visible edge of its own (an input, a card, a
//         button, a menu or tooltip over other content) is cut exactly at its
//         box: the cut-out's single amber frame is laid over the element's own
//         border, so that border IS the one line, and nothing behind an
//         overlay shows at its edges (each side is looked for up to 10 px
//         out: a selector often names the list inside a menu; with three
//         sides found, the fourth, which runs through the element, moves to
//         a quiet line);
//       - an element without one (a panel of text, an icon, a row of values)
//         gets air around it, every edge snapped to a quiet line so no line
//         of text is sliced, and its frame lies just outside that air; with
//         no own border there is no line to double;
//       - a small control gets context around it (a 3× enlargement of a lone
//         34 px button says nothing), its own border then well inside.
//     Pieces a few px apart (a menu and its trigger) are joined into one shape.
//  2. png.mjs `drawFocus` draws one outline round the pieces, `GAP` px outside
//     them, into the PNG: the marker the Markdown chapters and the PDF show.
//  3. In the PDF, `focusLayout`/`groupInset` place the cut-out and `cutoutSvg`
//     draws it: an inline SVG in capture pixels that shows the PNG through
//     the pieces, with one amber frame along their edge. The burnt-in outline
//     lies `GAP` px outside the pieces, so it never enters the cut-out.
//
// The pieces are stored in docs/manual/pasos.json (`cuts`), so a rebuild
// without the run's clean captures crops exactly where the outline was drawn.

/** Faro Nocturno's beacon amber (`--color-accent`), the outline's colour. */
export const FOCUS_COLOR = [242, 163, 60];
/** The outline's width and outer corner radius, in capture pixels. */
export const FOCUS_STROKE = 4;
export const FOCUS_RADIUS = 10;
/** Capture px between a piece and the outline's outer edge: the stroke plus
 *  2 px that image smoothing never reads across. */
export const GAP = FOCUS_STROKE + 2;

/** The PDF's text width (A4 minus 16 mm margins each side). */
export const CONTENT_MM = 178;
/** The cut-out's frame (at least `MIN_FRAME_PX` capture px, so it covers a
 *  1 px border and its antialiasing) and the corner radius of a piece cut
 *  with air, in mm of the page. */
export const CUTOUT_BORDER_MM = 0.5;
export const MIN_FRAME_PX = 3;
export const CUTOUT_RADIUS_MM = 1.5;
/** The «Detalle» label's line above the cut-out (height + gap), in mm. */
export const LABEL_MM = 4.5;

/** Magnification of the cut-out against the capture on the page: below the
 *  minimum it adds nothing; above the maximum the pixels show. */
const MIN_MAG = 1.4;
const MAX_MAG = 3;

/** Air around an element without an edge of its own: alone, and as one of
 *  several (an icon that opened a tooltip). */
const AIR = 18;
const AIR_PART = 4;
/** A small control's piece grows to at least this (capture px). */
const MIN_PIECE = { w: 138, h: 60 };

const round1 = (v) => Math.round(v * 10) / 10;
const round3 = (v) => Math.round(v * 1000) / 1000;

const px = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/**
 * The share of one side of `box` that is a visible edge in `img`: the pixels
 * on the side's line (or the next one in) differ from those 3 px outside it,
 * a border line, or an overlay's background against what it covers. Corners
 * are left out. null when the side is outside the image or too short.
 */
function sideEdge(img, box, side) {
  const x0 = Math.round(box.x);
  const y0 = Math.round(box.y);
  const x1 = Math.round(box.x + box.w) - 1;
  const y1 = Math.round(box.y + box.h) - 1;
  if (x1 - x0 < 12 || y1 - y0 < 12) return null;
  const skip = Math.min(14, Math.floor((x1 - x0) / 3), Math.floor((y1 - y0) / 3));
  const [dx, dy] = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[side];
  const line = side === "top" ? y0 : side === "bottom" ? y1 : side === "left" ? x0 : x1;
  const along = dx === 0 ? [x0 + skip, x1 - skip] : [y0 + skip, y1 - skip];
  let seen = 0;
  let edged = 0;
  for (let t = along[0]; t <= along[1]; t++) {
    const [ix, iy] = dx === 0 ? [t, line] : [line, t];
    const ox = ix + 3 * dx;
    const oy = iy + 3 * dy;
    if (ox < 0 || oy < 0 || ox >= img.width || oy >= img.height || ix - dx < 0 || iy - dy < 0) return null;
    seen++;
    const out = px(img, ox, oy);
    if (Math.max(dist(px(img, ix, iy), out), dist(px(img, ix - dx, iy - dy), out)) > 40) edged++;
  }
  return seen < 6 ? null : edged / seen;
}

/** Offsets (px, outward positive) tried for each side: the selector often
 *  names the list inside a menu or the input inside its frame, so the edge
 *  the eye sees is up to 10 px further out; or 4 px in, for a box with a
 *  margin. */
const EDGE_OFFSETS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, 6, 7, 8, 9, 10];
const SIDES = ["top", "right", "bottom", "left"];

/**
 * The visible edges round the element at `box`: for each side, the nearest
 * offset whose line is an edge along at least 75 % of it. `{ box, sides, r }`
 * with `box` moved to the sides found and `sides` the names of those sides;
 * `r` is its corner radius, read from where its top edge starts (a pill gets
 * its full round end).
 */
export function findEdges(img, box) {
  const shifted = (side, d) => {
    const b = { ...box };
    if (side === "top") (b.y -= d), (b.h += d);
    if (side === "bottom") b.h += d;
    if (side === "left") (b.x -= d), (b.w += d);
    if (side === "right") b.w += d;
    return b;
  };
  const out = { ...box };
  const sides = [];
  for (const side of SIDES) {
    const d = EDGE_OFFSETS.find((o) => (sideEdge(img, shifted(side, o), side) ?? 0) >= 0.75);
    if (d === undefined) continue;
    sides.push(side);
    if (side === "top") (out.y -= d), (out.h += d);
    if (side === "bottom") out.h += d;
    if (side === "left") (out.x -= d), (out.w += d);
    if (side === "right") out.w += d;
  }
  const x0 = Math.round(out.x);
  const y0 = Math.round(out.y);
  const w = Math.round(out.w);
  const h = Math.round(out.h);
  let start = 0;
  if (sides.includes("top") && y0 >= 3) {
    const outside = px(img, x0 + Math.floor(w / 2), y0 - 3);
    while (start < w / 2 && dist(px(img, x0 + start, y0), outside) <= 40 && dist(px(img, x0 + start, y0 + 1), outside) <= 40) start++;
  }
  const r = Math.min(Math.floor(Math.min(w, h) / 2), Math.max(6, start + 3));
  return { box: { x: x0, y: y0, w, h }, sides, r };
}

/** Whether `box` has a visible edge on all four sides (see `findEdges`). */
export function visibleEdge(img, box) {
  const e = findEdges(img, box);
  return e.sides.length === 4 ? { r: e.r } : null;
}

/** The share of pixels of `img` in [x0, x1) × [y0, y1) that stray from its
 *  most common colour (text, icons, edges); Infinity for a band that leaves
 *  the image. A band at most 2 % stray (antialiasing, a line crossing it) is
 *  quiet. */
export function bandInk(img, x0, y0, x1, y1) {
  if (x0 < 0 || y0 < 0 || x1 > img.width || y1 > img.height) return Infinity;
  if (x1 <= x0 || y1 <= y0) return 0;
  const counts = new Map();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      const key = ((img.data[i] >> 3) << 10) | ((img.data[i + 1] >> 3) << 5) | (img.data[i + 2] >> 3);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let mode = 0;
  let best = -1;
  for (const [k, n] of counts) if (n > best) [mode, best] = [k, n];
  const ref = [((mode >> 10) & 31) * 8 + 4, ((mode >> 5) & 31) * 8 + 4, (mode & 31) * 8 + 4];
  let stray = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (dist(px(img, x, y), ref) > 36) stray++;
  return stray <= 2 ? 0 : stray / ((x1 - x0) * (y1 - y0));
}
/** Whether the strip [x0, x1) × [y0, y1) holds a line across it (a row, or
 *  a column when `vertical`, at least 60 % unlike the strip's most common
 *  colour): the border of a neighbour the cut-out would show a sliver of. */
export function hasLine(img, x0, y0, x1, y1, vertical = false) {
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(img.width, x1);
  y1 = Math.min(img.height, y1);
  if (x1 <= x0 || y1 <= y0) return false;
  const counts = new Map();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      const key = ((img.data[i] >> 3) << 10) | ((img.data[i + 1] >> 3) << 5) | (img.data[i + 2] >> 3);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let mode = 0;
  let best = -1;
  for (const [k, n] of counts) if (n > best) [mode, best] = [k, n];
  const ref = [((mode >> 10) & 31) * 8 + 4, ((mode >> 5) & 31) * 8 + 4, (mode & 31) * 8 + 4];
  const [a0, a1, b0, b1] = vertical ? [x0, x1, y0, y1] : [y0, y1, x0, x1];
  for (let a = a0; a < a1; a++) {
    let unlike = 0;
    for (let b = b0; b < b1; b++) if (dist(vertical ? px(img, a, b) : px(img, b, a), ref) > 36) unlike++;
    if (unlike >= 0.6 * (b1 - b0)) return true;
  }
  return false;
}

export const quietBand = (img, x0, y0, x1, y1) => bandInk(img, x0, y0, x1, y1) <= 0.02;

/**
 * A piece with air around `box`: margins `pad` (per side), each moved to the
 * nearest position (`min`..`max`, one range for all sides or one per side;
 * negative cuts into the box) where the band under the outline and the
 * piece's edge is quiet, so no line of text is sliced; with none, to the
 * one with the least ink. Clamped to the capture.
 */
function airPiece(imageW, imageH, box, pad, img, ranges) {
  const range = (side) => ranges[side] ?? ranges;
  pad = { ...pad };
  const fx0 = Math.round(box.x);
  const fy0 = Math.round(box.y);
  const fx1 = Math.round(box.x + box.w);
  const fy1 = Math.round(box.y + box.h);
  // Near an edge of the capture the margin goes to the other side.
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
    const candidates = (p, { min, max }) => {
      const list = [p];
      for (let d = 1; d <= Math.max(p - min, max - p); d++) {
        if (p + d <= max) list.push(p + d);
        if (p - d >= min) list.push(p - d);
      }
      return list;
    };
    // The nearest margin whose band is quiet under the outline too; else the
    // nearest whose cut-out edge alone is (between two lines of text closer
    // than the outline is wide); else the one with the least ink.
    // A margin whose strip (between the box and the cut-out's edge) holds a
    // neighbour's border line is never taken: it would show as a sliver.
    const strip = {
      top: (p) => hasLine(img, x0, fy0 - p, x1, fy0 - 1),
      bottom: (p) => hasLine(img, x0, fy1 + 1, x1, fy1 + p),
      left: (p) => hasLine(img, fx0 - p, y0, fx0 - 1, y1, true),
      right: (p) => hasLine(img, fx1 + 1, y0, fx1 + p, y1, true),
    };
    const pick = (side, wideInk, edgeInk) => {
      const p = pad[side];
      const list = candidates(p, range(side)).filter((c) => c <= 1 || !strip[side](c));
      if (list.length === 0) return Math.min(p, 1);
      const quiet = list.find((c) => wideInk(c) <= 0.02) ?? list.find((c) => edgeInk(c) <= 0.02);
      if (quiet !== undefined) return quiet;
      let best = p;
      let least = Infinity;
      for (const c of list) {
        const ink = edgeInk(c);
        if (ink < least) [best, least] = [c, ink];
      }
      return best;
    };
    const x0 = fx0 - pad.left;
    const x1 = fx1 + pad.right;
    const y0 = fy0 - pad.top;
    const y1 = fy1 + pad.bottom;
    // The wide band: the outline outside the edge and 2 px inside it; the
    // edge band: 1 px outside, 2 px inside (never into the element itself).
    const inner = (p) => (p > 0 ? Math.min(2, p) : 2);
    pad.top = pick(
      "top",
      (p) => bandInk(img, x0, fy0 - p - GAP, x1, fy0 - p + inner(p)),
      (p) => bandInk(img, x0, fy0 - p - 1, x1, fy0 - p + inner(p)),
    );
    pad.bottom = pick(
      "bottom",
      (p) => bandInk(img, x0, fy1 + p - inner(p), x1, fy1 + p + GAP),
      (p) => bandInk(img, x0, fy1 + p - inner(p), x1, fy1 + p + 1),
    );
    pad.left = pick(
      "left",
      (p) => bandInk(img, fx0 - p - GAP, y0, fx0 - p + inner(p), y1),
      (p) => bandInk(img, fx0 - p - 1, y0, fx0 - p + inner(p), y1),
    );
    pad.right = pick(
      "right",
      (p) => bandInk(img, fx1 + p - inner(p), y0, fx1 + p + GAP, y1),
      (p) => bandInk(img, fx1 + p - inner(p), y0, fx1 + p + 1, y1),
    );
  }
  const x = Math.max(0, fx0 - pad.left);
  const y = Math.max(0, fy0 - pad.top);
  const x1 = Math.min(imageW, fx1 + pad.right);
  const y1 = Math.min(imageH, fy1 + pad.bottom);
  return { x, y, w: x1 - x, h: y1 - y, r: 0, edge: false };
}

const isSmall = (b) => Math.min(b.w, b.h) <= 48 && Math.max(b.w, b.h) <= 240;

/** The piece of one element (see the rule at the top of this file). */
export function focusPiece(imageW, imageH, box, img = null, { part = false } = {}) {
  if (!box || !(box.w > 0) || !(box.h > 0)) return null;
  if (!part && isSmall(box)) {
    const x = Math.max(16, Math.ceil((MIN_PIECE.w - box.w) / 2));
    const y = Math.max(16, Math.ceil((MIN_PIECE.h - box.h) / 2));
    return airPiece(imageW, imageH, box, { top: y, right: x, bottom: y, left: x }, img, { min: 3, max: Math.max(x, y) + 16 });
  }
  // An icon (under 24 px) has no frame-like border to merge with: air.
  const edges = img && Math.min(box.w, box.h) >= 24 ? findEdges(img, box) : null;
  if (edges?.sides.length === 4) {
    const b = edges.box;
    const x = Math.max(0, b.x);
    const y = Math.max(0, b.y);
    const x1 = Math.min(imageW, b.x + b.w);
    const y1 = Math.min(imageH, b.y + b.h);
    return { x, y, w: x1 - x, h: y1 - y, r: edges.r, edge: true };
  }
  if (edges?.sides.length === 3) {
    // The list inside a popover: three sides are its edge; the fourth runs
    // through the popover itself, so it moves (up to 12 px either way) to a
    // quiet line, clear of a separator or a row of buttons.
    const fixed = { min: 0, max: 0 };
    const free = { min: -12, max: 12 };
    const ranges = Object.fromEntries(SIDES.map((sd) => [sd, edges.sides.includes(sd) ? fixed : free]));
    const zero = { top: 0, right: 0, bottom: 0, left: 0 };
    return { ...airPiece(imageW, imageH, edges.box, zero, img, ranges), r: edges.r, edge: true };
  }
  const a = part ? AIR_PART : AIR;
  return airPiece(imageW, imageH, box, { top: a, right: a, bottom: a, left: a }, img, part ? { min: 2, max: 10 } : { min: 3, max: AIR + 24 });
}

/**
 * The pieces of a step: one per focused element when the tour recorded
 * several (`parts`), else one for the union box (`focus`); pieces a few px
 * apart are joined (`bridge`).
 */
export function focusCuts(imageW, imageH, focus, parts = null, img = null) {
  if (Array.isArray(parts) && parts.length > 1) {
    // An element inside another (the eye button inside its password field)
    // is part of that one's piece: a frame of its own would be a line inside.
    const within = (a, b) => a !== b && a.x >= b.x - 4 && a.y >= b.y - 4 && a.x + a.w <= b.x + b.w + 4 && a.y + a.h <= b.y + b.h + 4;
    const outer = parts.filter((p) => !parts.some((q) => within(p, q) && !(within(q, p) && parts.indexOf(q) > parts.indexOf(p))));
    if (outer.length === 1) return [focusPiece(imageW, imageH, outer[0], img)].filter(Boolean);
    const pieces = outer.map((p) => focusPiece(imageW, imageH, p, img, { part: true })).filter(Boolean);
    if (pieces.length > 0) return bridge(pieces);
  }
  const one = focusPiece(imageW, imageH, focus, img);
  return one ? [one] : [];
}

/** Two pieces a few px apart (a menu just above its trigger) would get two
 *  frames side by side: a double line. The smaller one reaches into the
 *  other, deep enough that their insides (inside the frame) overlap, so one
 *  frame and one outline go round a single shape. */
const BRIDGE_GAP = 24;
const REACH = 2 * MIN_FRAME_PX + 2 * FOCUS_RADIUS;
function bridge(pieces) {
  const out = pieces.map((z) => ({ ...z }));
  const area = (z) => z.w * z.h;
  for (let i = 0; i < out.length; i++) {
    for (let j = 0; j < out.length; j++) {
      const a = out[i];
      const b = out[j];
      if (i === j || area(a) > area(b)) continue;
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      // Side by side along most of the smaller one (a 16 px «?» over its tooltip).
      const along = (len) => Math.min(2 * FOCUS_RADIUS, 0.6 * len);
      if (overlapX > along(a.w)) {
        const under = a.y - (b.y + b.h);
        const over = b.y - (a.y + a.h);
        if (under > -REACH && under < BRIDGE_GAP) {
          const top = Math.min(a.y, b.y + b.h - REACH);
          a.h += a.y - top;
          a.y = top;
          align(a, b, "x", "w");
        } else if (over > -REACH && over < BRIDGE_GAP) {
          a.h = Math.max(a.h, b.y + REACH - a.y);
          align(a, b, "x", "w");
        }
      } else if (overlapY > along(a.h)) {
        const right = a.x - (b.x + b.w);
        const left = b.x - (a.x + a.w);
        if (right > -REACH && right < BRIDGE_GAP) {
          const x0 = Math.min(a.x, b.x + b.w - REACH);
          a.w += a.x - x0;
          a.x = x0;
          align(a, b, "y", "h");
        } else if (left > -REACH && left < BRIDGE_GAP) {
          a.w = Math.max(a.w, b.x + REACH - a.x);
          align(a, b, "y", "h");
        }
      }
    }
  }
  return out;
}

/** Joined pieces whose sides miss each other by a pixel or three share that
 *  side: no hairline notch in the frame. An edged piece never moves (that
 *  would bare its border inside the frame): the other one takes its side;
 *  two edged pieces keep their real step. */
function align(a, b, pos, size) {
  const near = 6;
  const set = (p, lo, hi) => {
    p[pos] = lo;
    p[size] = hi - lo;
  };
  if (Math.abs(a[pos] - b[pos]) <= near && a[pos] !== b[pos]) {
    if (!a.edge) set(a, b[pos], a[pos] + a[size]);
    else if (!b.edge) set(b, a[pos], b[pos] + b[size]);
  }
  const hiA = a[pos] + a[size];
  const hiB = b[pos] + b[size];
  if (Math.abs(hiA - hiB) <= near && hiA !== hiB) {
    if (!a.edge) set(a, a[pos], hiB);
    else if (!b.edge) set(b, b[pos], hiA);
  }
}

/** The outline's rectangles (outer edge) round the pieces, for `drawFocus`. */
export function outlineZones(cuts) {
  return cuts.map((c) => ({ x: c.x - GAP, y: c.y - GAP, w: c.w + 2 * GAP, h: c.h + 2 * GAP }));
}

/** The box around several rectangles. */
export function unionBox(boxes) {
  const x = Math.min(...boxes.map((z) => z.x));
  const y = Math.min(...boxes.map((z) => z.y));
  return { x, y, w: Math.max(...boxes.map((z) => z.x + z.w)) - x, h: Math.max(...boxes.map((z) => z.y + z.h)) - y };
}

/** Room outside a piece with air for its frame (capture px): there the frame
 *  lies outside the piece, so it hides none of the air that keeps text whole.
 *  An edged piece's frame lies inside it, over the element's border. */
const FRAME_ROOM = 5;

/** The box the cut-out shows: the pieces, with room for their frames. */
function cropBox(cuts) {
  return unionBox(cuts.map((c) => (c.edge ? c : { x: c.x - FRAME_ROOM, y: c.y - FRAME_ROOM, w: c.w + 2 * FRAME_ROOM, h: c.h + 2 * FRAME_ROOM })));
}

/**
 * Where a step's capture and its cut-out go, in millimetres of the page, or
 * `null` when no cut-out is worth it (the pieces already fill much of the
 * capture, or magnifying would barely enlarge them).
 *
 *  - `crop`: the box the cut-out shows, in capture pixels; `pieces`: the clip;
 *  - `mode`: "beside" (capture left, cut-out right) or "below" (wide strips);
 *  - `imageMm`, `insetMm`: widths; `insetHmm`: the cut-out's height;
 *  - `topMm` ("beside"): how far down the capture the «Detalle» block starts,
 *    so the cut-out sits level with its zone.
 */
export function focusLayout(imageW, imageH, cuts) {
  if (!cuts?.length) return null;
  const crop = cropBox(cuts);
  // Big areas (a whole panel, a dialog) read fine in the capture itself.
  if (crop.w + 2 * GAP > imageW * 0.5 || crop.h + 2 * GAP > imageH * 0.55) return null;
  const pieces = cuts;
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
 *  control, so the cut-out is kept even when it would need none at full
 *  width. */
export function groupInset(imageW, imageH, cuts, columnMm) {
  if (!cuts?.length) return null;
  const crop = cropBox(cuts);
  const pxMm = columnMm / imageW;
  let insetMm = Math.min(columnMm, crop.w * pxMm * MAX_MAG);
  // Never taller than 60 mm: the pair must fit on one page.
  if ((insetMm * crop.h) / crop.w > 60) insetMm = (60 * crop.w) / crop.h;
  return {
    mode: "below",
    crop,
    pieces: cuts,
    imageMm: columnMm,
    insetMm: round3(insetMm),
    insetHmm: round3((insetMm * crop.h) / crop.w),
    mag: round1(insetMm / crop.w / pxMm),
  };
}

/** The frame's width and a piece's corner radius in capture px, for a cut-out
 *  shown `unit` capture px per mm. An edged piece keeps its element's radius
 *  (or more): the element's own rounded border then stays under the frame or
 *  outside the clip. */
export function frameGeometry(piece, unit) {
  const sw = Math.max(CUTOUT_BORDER_MM * unit, MIN_FRAME_PX);
  const r = piece.edge ? Math.max(piece.r, sw + 2) : Math.max(4, CUTOUT_RADIUS_MM * unit);
  return { sw, r: Math.min(r, piece.w / 2, piece.h / 2) };
}

/**
 * The cut-out as inline SVG, all in capture pixels (the viewBox), so nothing
 * can drift apart at any zoom: each piece is filled amber, then the capture
 * (`url`, `imageW` × `imageH`) is drawn through the union of the pieces shrunk
 * by the frame's width. What stays amber is one frame along the outer edge of
 * the union: on an edged piece, laid exactly over the element's own border.
 */
export function cutoutSvg(url, imageW, imageH, layout, { id, label }) {
  const { crop, pieces, insetMm, insetHmm } = layout;
  const unit = crop.w / insetMm; // capture px per mm of the page
  const n = (v) => round3(v);
  const color = `rgb(${FOCUS_COLOR.join(",")})`;
  // An edged piece: frame inside, over the element's border. A piece with
  // air: frame just outside, the whole piece shown.
  const rect = (p, clip) => {
    const { sw, r } = frameGeometry(p, unit);
    const inset = p.edge ? (clip ? sw : 0) : clip ? 0 : -Math.min(sw, FRAME_ROOM);
    return `<rect x="${n(p.x + inset)}" y="${n(p.y + inset)}" width="${n(p.w - 2 * inset)}" height="${n(p.h - 2 * inset)}" rx="${n(Math.max(0, r - inset))}"/>`;
  };
  return (
    `<svg class="cutout" role="img" aria-label="${label}" width="${n(insetMm)}mm" height="${n(insetHmm)}mm" ` +
    `viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><clipPath id="${id}">${pieces.map((p) => rect(p, true)).join("")}</clipPath></defs>` +
    `<g fill="${color}">${pieces.map((p) => rect(p, false)).join("")}</g>` +
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
