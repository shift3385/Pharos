// Hybrid Logical Clock (SYNC-01, spec §9). Orders changes across devices whose
// wall clocks disagree: wall-clock ms + a logical counter + the device id as the
// final tie-break. The Rust side (`src-tauri/src/hlc.rs`) implements the same
// algorithm and the same text encoding, so both sides compare HLCs as strings.

export interface Hlc {
  wallMs: number;
  counter: number;
  deviceId: string;
}

const WALL_DIGITS = 15;
const COUNTER_DIGITS = 5;
const COUNTER_MAX = 10 ** COUNTER_DIGITS - 1;

/** Fixed-width text form: `<wallMs:15>-<counter:5>-<deviceId>`. Sorting the
 *  strings byte-wise (ASCII) is the same as `compareHlc`. */
export function encodeHlc(h: Hlc): string {
  return `${String(h.wallMs).padStart(WALL_DIGITS, "0")}-${String(
    h.counter,
  ).padStart(COUNTER_DIGITS, "0")}-${h.deviceId}`;
}

export function parseHlc(s: string): Hlc | null {
  const m = /^(\d{15})-(\d{5})-(.+)$/.exec(s);
  if (!m) return null;
  return { wallMs: Number(m[1]), counter: Number(m[2]), deviceId: m[3] };
}

/** Total order: wall time, then counter, then device id. */
export function compareHlc(a: Hlc, b: Hlc): number {
  if (a.wallMs !== b.wallMs) return a.wallMs < b.wallMs ? -1 : 1;
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
  if (a.deviceId === b.deviceId) return 0;
  return a.deviceId < b.deviceId ? -1 : 1;
}

/** Keeps the counter inside its fixed width: on overflow the clock moves one
 *  millisecond forward instead (order is preserved). */
function normalize(wallMs: number, counter: number, deviceId: string): Hlc {
  return counter > COUNTER_MAX
    ? { wallMs: wallMs + 1, counter: 0, deviceId }
    : { wallMs, counter, deviceId };
}

/** Next timestamp for a local change (send event). */
export function tickHlc(
  prev: Hlc | null,
  nowMs: number,
  deviceId: string,
): Hlc {
  const last = prev?.wallMs ?? 0;
  const wall = Math.max(last, nowMs);
  const counter = prev && wall === last ? prev.counter + 1 : 0;
  return normalize(wall, counter, deviceId);
}

/** Merges a timestamp seen from another device (receive event), so the local
 *  clock never issues a value at or below what it has already observed. */
export function recvHlc(
  prev: Hlc | null,
  remote: Hlc,
  nowMs: number,
  deviceId: string,
): Hlc {
  const last = prev?.wallMs ?? 0;
  const wall = Math.max(last, remote.wallMs, nowMs);
  let counter: number;
  if (prev && wall === last && wall === remote.wallMs) {
    counter = Math.max(prev.counter, remote.counter) + 1;
  } else if (prev && wall === last) {
    counter = prev.counter + 1;
  } else if (wall === remote.wallMs) {
    counter = remote.counter + 1;
  } else {
    counter = 0;
  }
  return normalize(wall, counter, deviceId);
}
