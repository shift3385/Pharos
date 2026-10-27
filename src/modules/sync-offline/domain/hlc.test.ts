import { describe, expect, it } from "vitest";
import {
  compareHlc,
  encodeHlc,
  parseHlc,
  recvHlc,
  tickHlc,
  type Hlc,
} from "./hlc";

const A = "aaaaaaaa-0000-0000-0000-000000000000";
const B = "bbbbbbbb-0000-0000-0000-000000000000";

describe("HLC", () => {
  it("is monotonic even when the wall clock goes backwards", () => {
    let h: Hlc | null = null;
    const seen: Hlc[] = [];
    for (const now of [1000, 1000, 1001, 900, 900, 1001, 2000]) {
      h = tickHlc(h, now, A);
      seen.push(h);
    }
    for (let i = 1; i < seen.length; i++)
      expect(compareHlc(seen[i - 1], seen[i])).toBe(-1);
    // Clock went back to 900: the HLC keeps the last wall time and bumps the counter.
    expect(seen[3]).toEqual({ wallMs: 1001, counter: 1, deviceId: A });
  });

  it("orders causally across devices with skewed clocks", () => {
    // Device A's clock runs 1h ahead; B's is correct but "behind".
    const fromA = tickHlc(null, 3_600_000 + 5_000, A);
    // B receives A's change, then edits: its change must sort after A's,
    // although B's wall clock (5_100) is far below A's timestamp.
    const bAfterRecv = recvHlc(null, fromA, 5_100, B);
    const bEdit = tickHlc(bAfterRecv, 5_200, B);
    expect(compareHlc(fromA, bEdit)).toBe(-1);
    expect(bEdit.wallMs).toBe(fromA.wallMs);
  });

  it("is deterministic: the same events give the same winner on every device", () => {
    const a = tickHlc(null, 1000, A);
    const b = tickHlc(null, 1000, B);
    // Equal wall time and counter: the device id breaks the tie, both ways round.
    expect(compareHlc(a, b)).toBe(-1);
    expect(compareHlc(b, a)).toBe(1);
    expect(compareHlc(a, { ...a })).toBe(0);
  });

  it("recv merges counters when all clocks agree", () => {
    const prev: Hlc = { wallMs: 1000, counter: 3, deviceId: A };
    const remote: Hlc = { wallMs: 1000, counter: 7, deviceId: B };
    expect(recvHlc(prev, remote, 999, A)).toEqual({
      wallMs: 1000,
      counter: 8,
      deviceId: A,
    });
    // The local physical clock is ahead of both: the counter resets.
    expect(recvHlc(prev, remote, 2000, A)).toEqual({
      wallMs: 2000,
      counter: 0,
      deviceId: A,
    });
  });

  it("encodes to fixed-width text whose string order matches compareHlc", () => {
    const hs: Hlc[] = [
      { wallMs: 9, counter: 0, deviceId: B },
      { wallMs: 10, counter: 0, deviceId: A },
      { wallMs: 10, counter: 2, deviceId: A },
      { wallMs: 10, counter: 2, deviceId: B },
      { wallMs: 1_730_000_000_000, counter: 99_999, deviceId: A },
    ];
    const enc = hs.map(encodeHlc);
    expect([...enc].sort()).toEqual(enc);
    expect(enc[0]).toBe(`000000000000009-00000-${B}`);
    expect(parseHlc(enc[4])).toEqual(hs[4]);
    expect(parseHlc("garbage")).toBeNull();
  });

  it("rolls the counter overflow into the next millisecond", () => {
    const h = tickHlc({ wallMs: 50, counter: 99_999, deviceId: A }, 10, A);
    expect(h).toEqual({ wallMs: 51, counter: 0, deviceId: A });
  });
});
