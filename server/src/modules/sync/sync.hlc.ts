// Hybrid Logical Clock of the server (SYNC-01, spec §9). The web writes
// through the server (ADR-0004, BASE-10), so the server stamps those changes
// itself. Same algorithm and text encoding as the desktop (`hlc.rs`) and the
// client (`hlc.ts`); the shared fixtures in `fixtures/sync/` hold all three to
// it.

export interface Hlc {
  wallMs: number;
  counter: number;
  deviceId: string;
}

const WALL_DIGITS = 15;
const COUNTER_DIGITS = 5;
const COUNTER_MAX = 10 ** COUNTER_DIGITS - 1;

/** Fixed-width text form: `<wallMs:15>-<counter:5>-<deviceId>`. */
export function encodeHlc(h: Hlc): string {
  return `${String(h.wallMs).padStart(WALL_DIGITS, "0")}-${String(h.counter).padStart(COUNTER_DIGITS, "0")}-${h.deviceId}`;
}

export function parseHlc(s: string): Hlc | null {
  const m = /^(\d{15})-(\d{5})-(.+)$/.exec(s);
  if (!m) return null;
  return { wallMs: Number(m[1]), counter: Number(m[2]), deviceId: m[3] };
}

function normalize(wallMs: number, counter: number, deviceId: string): Hlc {
  return counter > COUNTER_MAX ? { wallMs: wallMs + 1, counter: 0, deviceId } : { wallMs, counter, deviceId };
}

/** Next timestamp for a local change (send event). */
export function tickHlc(prev: Hlc | null, nowMs: number, deviceId: string): Hlc {
  const last = prev?.wallMs ?? 0;
  const wall = Math.max(last, nowMs);
  const counter = prev && wall === last ? prev.counter + 1 : 0;
  return normalize(wall, counter, deviceId);
}

/** Merges a timestamp seen from another device (receive event). */
export function recvHlc(prev: Hlc | null, remote: Hlc, nowMs: number, deviceId: string): Hlc {
  const last = prev?.wallMs ?? 0;
  const wall = Math.max(last, remote.wallMs, nowMs);
  let counter: number;
  if (prev && wall === last && wall === remote.wallMs) counter = Math.max(prev.counter, remote.counter) + 1;
  else if (prev && wall === last) counter = prev.counter + 1;
  else if (wall === remote.wallMs) counter = remote.counter + 1;
  else counter = 0;
  return normalize(wall, counter, deviceId);
}

/** The server's clock: each stamp is newer than the last one it issued and
 *  than `after` (the HLC of the version being replaced), so a web change
 *  always wins last-write-wins against what it was based on. */
export function createServerClock(deviceId = "server", now: () => number = Date.now) {
  let last: Hlc | null = null;
  return {
    stamp(after?: string): string {
      const seen = after ? parseHlc(after) : null;
      last = seen ? recvHlc(last, seen, now(), deviceId) : tickHlc(last, now(), deviceId);
      return encodeHlc(last);
    },
  };
}

export type ServerClock = ReturnType<typeof createServerClock>;
