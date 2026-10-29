// The HLC fixture shared with the desktop and the server (BASE-05, ADR-0026):
// all three give exactly these answers.
import { describe, expect, it } from "vitest";
import fixture from "@shared/contracts/fixtures/sync/hlc.json";
import { compareHlc, encodeHlc, parseHlc, recvHlc, tickHlc } from "./hlc";

describe("HLC (shared fixture)", () => {
  it("encodes, parses and refuses invalid text", () => {
    for (const { hlc, text } of fixture.encode) {
      expect(encodeHlc(hlc)).toBe(text);
      expect(parseHlc(text)).toEqual(hlc);
    }
    for (const text of fixture.invalid) expect(parseHlc(text), text).toBeNull();
  });

  it("orders like the text", () => {
    for (let i = 1; i < fixture.sorted.length; i++) {
      const [a, b] = [fixture.sorted[i - 1], fixture.sorted[i]];
      expect(a < b).toBe(true);
      expect(compareHlc(parseHlc(a)!, parseHlc(b)!)).toBe(-1);
    }
  });

  it("ticks and receives", () => {
    for (const c of fixture.tick) expect(tickHlc(c.prev, c.nowMs, c.deviceId)).toEqual(c.next);
    for (const c of fixture.recv) expect(recvHlc(c.prev, c.remote, c.nowMs, c.deviceId)).toEqual(c.next);
  });
});
