import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PHAROS_RUN_SCHEMA_VERSION,
  parsePharosRun,
  pharosRunJsonSchema,
  resultSchema,
} from "./schema";
import full from "./fixtures/full.json";
import ctrf from "./fixtures/ctrf-playwright-shard.json";

const SCHEMA_FILE = resolve(process.cwd(), "docs/formats/pharos-run-1.schema.json");

const issuesOf = (input: unknown) => {
  const r = parsePharosRun(input);
  return r.ok ? [] : r.issues;
};

describe("Pharos Run JSON", () => {
  it("accepts a full document with findings, metrics and a session, filling the defaults", () => {
    const r = parsePharosRun(full);
    expect(r.ok, JSON.stringify(issuesOf(full))).toBe(true);
    if (!r.ok) return;
    expect(r.value.results).toHaveLength(2);
    expect(r.value.findings[0].severity).toBe("medium");
    expect(r.value.metrics[1].passed).toBeNull();
    expect(r.value.exploratorySession?.notes[0].kind).toBe("bug");
    // Unknown keys pass through, for the persister's `attributes`.
    expect((r.value.results[1] as Record<string, unknown>).toolSpecific).toEqual({ worker: 3 });
  });

  it("needs only the version: the rest defaults to empty", () => {
    const r = parsePharosRun({ schemaVersion: PHAROS_RUN_SCHEMA_VERSION });
    expect(r.ok).toBe(true);
    if (r.ok) expect([r.value.results, r.value.findings, r.value.metrics, r.value.attachments]).toEqual([[], [], [], []]);
  });

  it("takes every CTRF test of a real report as a result (superset of CTRF)", () => {
    const tests = ctrf.results.tests;
    expect(tests.length).toBeGreaterThan(1);
    for (const t of tests) {
      const parsed = resultSchema.safeParse(t);
      expect(parsed.success, `${t.name}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
    // Retries and flaky as CTRF sends them.
    expect(tests.some((t) => t.flaky === true)).toBe(true);
    expect(parsePharosRun({ schemaVersion: "1.0.0", results: tests }).ok).toBe(true);
  });

  it("refuses a missing or newer major version, bad statuses and dangling refs", () => {
    expect(issuesOf({ results: [] }).map((i) => i.path)).toContain("schemaVersion");
    expect(issuesOf({ schemaVersion: "2.0.0" })[0].message).toMatch(/newer major/);
    expect(issuesOf({ schemaVersion: "1.0" })[0].path).toBe("schemaVersion");
    expect(issuesOf({ schemaVersion: "1.3.7" })).toEqual([]);
    expect(issuesOf({ schemaVersion: "1.0.0", results: [{ name: "t", status: "green" }] })[0].path).toBe(
      "results.0.status",
    );
    expect(
      issuesOf({ schemaVersion: "1.0.0", results: [{ name: "t", status: "passed", steps: [{ status: "passed" }] }] })[0]
        .path,
    ).toBe("results.0.steps.0.text");
    expect(issuesOf({ schemaVersion: "1.0.0", findings: [{ ruleId: "r", severity: "serious", message: "m" }] })[0].path).toBe(
      "findings.0.severity",
    );
    expect(
      issuesOf({ schemaVersion: "1.0.0", results: [{ name: "t", status: "passed", attachments: ["nope"], shardRef: "x" }] }),
    ).toEqual([
      { path: "results.0.attachments.0", message: "Unknown attachment ref: nope" },
      { path: "results.0.shardRef", message: "Unknown shard ref: x" },
    ]);
  });

  it("matches the JSON Schema committed in docs/formats", () => {
    const generated = `${JSON.stringify(pharosRunJsonSchema(), null, 2)}\n`;
    if (process.env.PHAROS_WRITE_SCHEMA === "1") writeFileSync(SCHEMA_FILE, generated);
    expect(readFileSync(SCHEMA_FILE, "utf8").replace(/\r\n/g, "\n")).toBe(generated);
  });
});
