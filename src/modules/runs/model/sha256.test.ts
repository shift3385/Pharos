import { Blob as NodeBlob } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Sha256, sha256OfBlob } from "./sha256";

const node = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("incremental sha256", () => {
  it("matches the reference for every length around the block size and in chunks", () => {
    for (const len of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 70_001]) {
      const data = Uint8Array.from(
        { length: len },
        (_, i) => (i * 31 + len) & 0xff,
      );
      expect(new Sha256().update(data).hex(), `len ${len}`).toBe(node(data));
      const h = new Sha256();
      for (let i = 0; i < len; i += 37) h.update(data.subarray(i, i + 37));
      expect(h.hex(), `chunks of ${len}`).toBe(node(data));
    }
  });

  it("hashes a Blob as a stream", async () => {
    const data = new TextEncoder().encode("ñandú ".repeat(50_000));
    // Node's Blob: jsdom's has no stream().
    expect(await sha256OfBlob(new NodeBlob([data]) as unknown as Blob)).toBe(
      node(data),
    );
  });
});
