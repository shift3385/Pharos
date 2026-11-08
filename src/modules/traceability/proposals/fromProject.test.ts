// IA-17: which files of a project go by default (reading order within a
// budget), how they become batches, and which of the model's citations hold.

import { describe, expect, it } from "vitest";
import type { RawRequirementCandidate } from "@modules/ai";
import {
  batchesOf,
  defaultSelection,
  estimateTokens,
  fileSourceLabel,
  moduleOf,
  selectionTokens,
  sendable,
  usableCandidates,
  type ScanContent,
  type ScanFile,
} from "./fromProject";

const file = (path: string, category: ScanFile["category"], tokens: number, excluded?: ScanFile["excluded"]): ScanFile => ({
  path,
  size: tokens * 3.5,
  tokens,
  category,
  excluded,
});

const files = [
  file("src/util.ts", "other", 100),
  file("README.md", "docs", 300),
  file("src/routes/users.ts", "routes", 200),
  file("tests/users.test.ts", "tests", 150),
  file(".env", "other", 10, "secret"),
  file("docs/big.md", "docs", 5_000),
];

describe("selection", () => {
  it("never offers excluded files and reads docs first", () => {
    expect(sendable(files).map((f) => f.path)).toEqual([
      "docs/big.md",
      "README.md",
      "src/routes/users.ts",
      "tests/users.test.ts",
      "src/util.ts",
    ]);
  });

  it("ticks files in reading order while they fit, skipping one that does not", () => {
    const chosen = defaultSelection(files, 1_000);
    expect([...chosen].sort()).toEqual(["README.md", "src/routes/users.ts", "src/util.ts", "tests/users.test.ts"]);
    expect(selectionTokens(files, chosen)).toBe(750);
  });
});

const content = (path: string, lines: number, width = 20): ScanContent => ({
  path,
  text: Array.from({ length: lines }, (_, i) => `${i + 1}| ${"x".repeat(width)}\n`).join(""),
  redacted: [],
  lines,
});

describe("batchesOf", () => {
  it("groups by module and keeps each batch under the limit", () => {
    const batches = batchesOf(
      [content("api/a.ts", 10), content("web/b.tsx", 10), content("api/c.ts", 10), { ...content("x.md", 1), error: "gone" }],
      10_000,
    );
    expect(batches).toHaveLength(1);
    expect(batches[0].map((f) => f.path)).toEqual(["api/a.ts", "api/c.ts", "web/b.tsx"]);
  });

  it("starts a new module in a new batch once half full, and cuts a big file between lines", () => {
    const small = batchesOf([content("api/a.ts", 40), content("web/b.ts", 40)], 400);
    expect(small.map((b) => b.map((f) => f.path))).toEqual([["api/a.ts"], ["web/b.ts"]]);

    const big = batchesOf([content("docs/huge.md", 200)], 500);
    expect(big.length).toBeGreaterThan(1);
    for (const b of big) expect(estimateTokens(b[0].text)).toBeLessThanOrEqual(500);
    // Line numbers are the file's own, so citations still hold.
    expect(big[1][0].text).toMatch(/^\d+\| /);
    expect(big.flatMap((b) => b.map((f) => f.text)).join("")).toBe(content("docs/huge.md", 200).text);
  });

  it("names the module by its first two folders", () => {
    expect(moduleOf("src/modules/ai/x.ts")).toBe("src/modules");
    expect(moduleOf("README.md")).toBe(".");
  });
});

describe("usableCandidates", () => {
  const batch = [{ path: "docs/spec.md", text: "" }];
  const lines = new Map([["docs/spec.md", 30]]);
  const raw = (sources: RawRequirementCandidate["sources"]): RawRequirementCandidate => ({
    title: "T",
    description: "D",
    priority: "high",
    basis: "stated",
    acceptance: [],
    sources,
  });

  it("keeps sources of sent files, drops lines out of the file and candidates left without source", () => {
    const out = usableCandidates(
      [
        raw([
          { path: "./docs/spec.md", startLine: 3, endLine: 9 },
          { path: "docs/other.md", startLine: 1 },
        ]),
        raw([{ path: "docs/spec.md", startLine: 40, endLine: 50 }]),
        raw([{ path: "src/invented.ts", startLine: 1 }]),
      ],
      batch,
      lines,
    );
    expect(out).toHaveLength(2);
    expect(out[0].sources).toEqual([{ kind: "file", path: "docs/spec.md", startLine: 3, endLine: 9 }]);
    expect(out[1].sources).toEqual([{ kind: "file", path: "docs/spec.md" }]);
    expect(out[0]).toMatchObject({ priority: "high", basis: "stated" });
    expect(out[0]).not.toHaveProperty("acceptance");
  });

  it("labels a file source with its lines", () => {
    expect(fileSourceLabel("a.md")).toBe("a.md");
    expect(fileSourceLabel("a.md", 3)).toBe("a.md:3");
    expect(fileSourceLabel("a.md", 3, 9)).toBe("a.md:3-9");
  });
});
