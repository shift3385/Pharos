import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { factsOf, instantMs, linkResolver, type LinkData } from "../src/modules/domain/resultLink";

// The server twin of the desktop's link resolver (runs/link.rs) against the
// vectors both check.
const vectors = JSON.parse(
  readFileSync(new URL("../../src-tauri/tests/fixtures/link-vectors.json", import.meta.url), "utf8"),
);

type Raw = Record<string, unknown>;

function dataOf(v: Raw): LinkData {
  const list = (k: string) => v[k] as Raw[];
  return {
    caseIdPrefix: (v.project as Raw).caseIdPrefix as string,
    // The server lists live cases only: a deleted one is known by its revisions.
    cases: list("cases")
      .filter((c) => !c.deleted)
      .map((c) => ({ id: c.id as string, scenarioId: c.scenarioId as string })),
    revisions: list("revisions").map((r) => ({
      id: r.id as string,
      testCaseId: r.testCaseId as string,
      revision: r.revision as number,
      createdAt: r.createdAt as string,
      scenarioId: r.scenarioId as string,
      data: r.data as Raw,
    })),
    mappings: list("mappings").map((m) => ({
      testKey: m.testKey as string,
      testCaseId: m.testCaseId as string,
    })),
    runs: list("runs").map((r) => ({
      id: r.id as string,
      startedAt: r.startedAt as string,
      cycleId: (r.cycleId as string) ?? null,
    })),
    runItems: list("runItems") as unknown as LinkData["runItems"],
    configurations: list("configurations") as unknown as LinkData["configurations"],
    cycleItems: list("cycleItems") as unknown as LinkData["cycleItems"],
  };
}

describe("derived link of imported results (twin of runs/link.rs)", () => {
  it("resolves the shared vectors as written", () => {
    const resolve = linkResolver(dataOf(vectors));
    for (const x of vectors.results as Raw[]) {
      const link = resolve({
        runId: x.runId as string,
        testKey: x.testKey as string,
        tags: (x.tags as string[]) ?? [],
        caseKey: (x.caseKey as string) ?? null,
        name: (x.name as string) ?? "t",
        suite: (x.suite as string[]) ?? [],
        exampleRow: (x.exampleRow as number) ?? null,
        configurationLabel: (x.configurationLabel as string) ?? null,
      }) as unknown as Raw;
      for (const [k, want] of Object.entries(x.expect as Raw)) expect(link[k], `${x.id as string}.${k}`).toEqual(want);
    }
  });

  it("reads the facts as the desktop writes them and times as instants", () => {
    expect(
      factsOf({
        runId: "r",
        testKey: "k",
        shardId: "s",
        caseKey: null,
        exampleRow: 2,
        configurationLabel: "chromium",
        attributes: {
          tags: ["@TC-001"],
          name: "Example #3",
          suite: ["f", "Login"],
        },
      }),
    ).toEqual({
      runId: "r",
      testKey: "k",
      tags: ["@TC-001"],
      caseKey: null,
      name: "Example #3",
      suite: ["f", "Login"],
      exampleRow: 2,
      configurationLabel: "chromium",
    });
    const utc = Date.UTC(2026, 9, 27, 3, 52, 7);
    expect(instantMs("2026-10-27 03:52:07")).toBe(utc);
    expect(instantMs("2026-10-27T03:52:07")).toBe(utc);
    expect(instantMs("2026-10-27T05:52:07+02:00")).toBe(utc);
    expect(instantMs("nope")).toBeNull();
  });
});
