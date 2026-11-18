import { describe, expect, it } from "vitest";
import vectors from "@shared/contracts/fixtures/sync/merge-vectors.json";
import {
  canonical,
  fieldOf,
  merge,
  type MergeOutcome,
  type Payload,
  type Side,
} from "./merge";

// SYNC-02 (ADR-0051): the shared vectors, which the Rust engine also passes.

interface Vector {
  name: string;
  entity: string;
  base: Payload;
  local: Payload;
  remote: Payload;
  choices?: Record<string, Side>;
  expect: {
    kind: MergeOutcome["kind"];
    merged?: Payload;
    origins?: Record<string, string>;
    conflicts?: string[];
    guard?: string;
  };
}

describe("field-level merge (shared vectors)", () => {
  for (const v of (vectors as unknown as { vectors: Vector[] }).vectors) {
    it(v.name, () => {
      const out = merge(v.entity, v.base, v.local, v.remote, v.choices ?? {});
      expect(out.kind).toBe(v.expect.kind);
      if (out.kind === "entity") {
        expect(out.guard).toBe(v.expect.guard);
        return;
      }
      // Compared as canonical JSON: key order is not part of the contract.
      expect(canonical(out.merged)).toBe(canonical(v.expect.merged));
      expect(out.origins).toEqual(v.expect.origins);
      expect(
        out.kind === "conflict" ? out.conflicts.map((c) => c.key) : [],
      ).toEqual(v.expect.conflicts ?? []);
    });
  }
});

describe("merge details", () => {
  it("resolving every conflict with the keys it reported gives a merged result", () => {
    const base = {
      id: "c1",
      title: "A",
      data: { steps: [{ id: "S1", text: "a" }] },
    };
    const local = {
      id: "c1",
      title: "B",
      data: { steps: [{ id: "S1", text: "a1" }] },
    };
    const remote = {
      id: "c1",
      title: "C",
      data: { steps: [{ id: "S1", text: "a2" }] },
    };
    const first = merge("test_case", base, local, remote);
    expect(first.kind).toBe("conflict");
    const keys =
      first.kind === "conflict" ? first.conflicts.map((c) => c.key) : [];
    const choices = Object.fromEntries(keys.map((k) => [k, "local" as const]));
    const out = merge("test_case", base, local, remote, choices);
    expect(out).toMatchObject({ kind: "merged", merged: local });
  });

  it("names the field a conflict key belongs to", () => {
    expect(fieldOf("title")).toBe("title");
    expect(fieldOf("data.steps#S1.text")).toBe("data.steps");
    expect(fieldOf("data.steps@order")).toBe("data.steps");
    expect(fieldOf("data.examples.rows#R1")).toBe("data.examples");
    expect(fieldOf("group:risk")).toBe("group:risk");
  });

  it("a list without unique ids falls back to a scalar", () => {
    const out = merge(
      "test_case",
      { id: "c1", data: { steps: ["a"] } },
      { id: "c1", data: { steps: ["b"] } },
      { id: "c1", data: { steps: ["c"] } },
    );
    expect(out.kind === "conflict" && out.conflicts.map((c) => c.key)).toEqual([
      "data.steps",
    ]);
  });
});
