// Minimal PNG codec for the manual's screenshots (MAN-01), on Node's zlib only.
// WebDriver returns 8-bit RGBA (or RGB), non-interlaced PNGs; that is all this
// reads. It writes deterministic files: only IHDR/IDAT/IEND (no timestamps or
// text chunks), RGB when every pixel is opaque, a fixed per-row filter choice
// and zlib level 9 — the same pixels always give the same bytes.
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decodes a PNG into `{ width, height, data }` (RGBA, 4 bytes per pixel). */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let palette = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      colorType = body[9];
      if (depth !== 8 || ![2, 3, 6].includes(colorType) || body[12] !== 0) {
        throw new Error(`unsupported PNG (depth ${depth}, color type ${colorType}, interlace ${body[12]})`);
      }
    } else if (type === "PLTE") palette = Buffer.from(body);
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 3 ? 1 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    const prev = out - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[out + x - bpp] : 0;
      const b = y > 0 ? px[prev + x] : 0;
      const c = x >= bpp && y > 0 ? px[prev + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      px[out + x] = v & 0xff;
    }
  }
  if (bpp === 4) return { width, height, data: px };
  if (colorType === 3) {
    if (!palette) throw new Error("indexed PNG without a palette");
    const data = Buffer.alloc(width * height * 4);
    for (let i = 0; i < px.length; i++) {
      const p = px[i] * 3;
      data[i * 4] = palette[p];
      data[i * 4 + 1] = palette[p + 1];
      data[i * 4 + 2] = palette[p + 2];
      data[i * 4 + 3] = 255;
    }
    return { width, height, data };
  }
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
    data[j] = px[i];
    data[j + 1] = px[i + 1];
    data[j + 2] = px[i + 2];
    data[j + 3] = 255;
  }
  return { width, height, data };
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/**
 * An opaque image reduced to at most 256 colours by median cut: a histogram
 * on 5 bits per channel, boxes split at the weighted median of their longest
 * axis (ties broken by box order, so the result is deterministic), each box's
 * colour the pixel-weighted mean of its real colours. Returns the palette
 * (RGB triples) and one index per pixel.
 */
export function quantize({ width, height, data }) {
  const bins = 32768;
  const count = new Uint32Array(bins);
  const sum = new Float64Array(bins * 3);
  const binOf = new Uint16Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const b = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    binOf[p] = b;
    count[b]++;
    sum[b * 3] += data[i];
    sum[b * 3 + 1] += data[i + 1];
    sum[b * 3 + 2] += data[i + 2];
  }
  const used = [];
  for (let b = 0; b < bins; b++) if (count[b]) used.push(b);
  const comp = (b, c) => (c === 0 ? b >> 10 : c === 1 ? (b >> 5) & 31 : b & 31);
  const boxOf = new Int16Array(bins).fill(-1);
  let boxes = [used];
  while (boxes.length < 256) {
    // The box with the most pixels that can still be split.
    let pick = -1;
    let best = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      let n = 0;
      for (const b of box) n += count[b];
      if (n > best) {
        best = n;
        pick = i;
      }
    });
    if (pick < 0) break;
    const box = boxes[pick];
    let axis = 0;
    let span = -1;
    for (let c = 0; c < 3; c++) {
      let lo = 31;
      let hi = 0;
      for (const b of box) {
        const v = comp(b, c);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > span) {
        span = hi - lo;
        axis = c;
      }
    }
    const sorted = [...box].sort((x, y) => comp(x, axis) - comp(y, axis) || x - y);
    let half = 0;
    for (const b of sorted) half += count[b];
    half /= 2;
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += count[sorted[i]];
      if (acc >= half) {
        cut = i + 1;
        break;
      }
      cut = i + 1;
    }
    boxes.splice(pick, 1, sorted.slice(0, cut), sorted.slice(cut));
  }
  const palette = Buffer.alloc(boxes.length * 3);
  boxes.forEach((box, i) => {
    let n = 0;
    let r = 0;
    let g = 0;
    let bl = 0;
    for (const b of box) {
      boxOf[b] = i;
      n += count[b];
      r += sum[b * 3];
      g += sum[b * 3 + 1];
      bl += sum[b * 3 + 2];
    }
    palette[i * 3] = Math.round(r / n);
    palette[i * 3 + 1] = Math.round(g / n);
    palette[i * 3 + 2] = Math.round(bl / n);
  });
  const indices = Buffer.alloc(width * height);
  for (let p = 0; p < indices.length; p++) indices[p] = boxOf[binOf[p]];
  return { palette, indices };
}

/** Encodes RGBA pixels as a deterministic, compact PNG: an 8-bit palette
 *  when the image is opaque (screenshots), RGBA otherwise. */
export function encodePng({ width, height, data }) {
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      opaque = false;
      break;
    }
  }
  if (opaque) {
    const { palette, indices } = quantize({ width, height, data });
    // Indexed rows: filter 0 (none), the usual choice for palette images.
    const raw = Buffer.alloc((width + 1) * height);
    for (let y = 0; y < height; y++) indices.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 3;
    return Buffer.concat([
      SIGNATURE,
      chunk("IHDR", ihdr),
      chunk("PLTE", palette),
      chunk("IDAT", deflateSync(raw, { level: 9, memLevel: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
  const bpp = 4;
  const stride = width * bpp;
  const px = Buffer.alloc(stride * height);
  if (opaque) {
    for (let i = 0, j = 0; j < data.length; i += 3, j += 4) {
      px[i] = data[j];
      px[i + 1] = data[j + 1];
      px[i + 2] = data[j + 2];
    }
  } else data.copy(px);

  // Per row, the filter with the smallest sum of absolute values (the usual
  // heuristic); ties go to the lowest filter number, so the choice is fixed.
  const raw = Buffer.alloc((stride + 1) * height);
  const candidate = Buffer.alloc(stride);
  const best = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const prev = row - stride;
    let bestSum = Infinity;
    let bestFilter = 0;
    for (let f = 0; f <= 4; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const v = px[row + x];
        const a = x >= bpp ? px[row + x - bpp] : 0;
        const b = y > 0 ? px[prev + x] : 0;
        const c = x >= bpp && y > 0 ? px[prev + x - bpp] : 0;
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const out = (v - pred) & 0xff;
        candidate[x] = out;
        sum += out < 128 ? out : 256 - out;
        if (sum >= bestSum) break;
      }
      if (sum < bestSum) {
        bestSum = sum;
        bestFilter = f;
        candidate.copy(best);
      }
    }
    raw[y * (stride + 1)] = bestFilter;
    best.copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9, memLevel: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Share of pixels (0–1) that differ by more than `tolerance` in any channel;
 *  1 when the sizes differ. */
export function changedShare(a, b, tolerance = 8) {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) > tolerance ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > tolerance ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > tolerance ||
      Math.abs(a.data[i + 3] - b.data[i + 3]) > tolerance
    ) {
      changed++;
    }
  }
  return changed / (a.width * a.height);
}
