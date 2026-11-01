import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ReportError,
  parseReportText,
} from "@shared/contracts/pharos-run/importers";
import type { ReportImportOutcome } from "@shared/contracts/contract";
import {
  attachAll,
  buildRequest,
  inlineBlob,
  matchAttachment,
  type ReadReport,
} from "./importFlow";
import { importErrorKey } from "./importErrors";

const attach = vi.fn();
vi.mock("../api/runsApi", () => ({
  runsApi: { attach: (...a: unknown[]) => attach(...a) },
}));

const FIX = resolve(
  process.cwd(),
  "src/shared/contracts/pharos-run/fixtures/ing01",
);
const report = (p: string): ReadReport => ({
  file: new File(["x"], p.split("/").pop()!),
  parsed: parseReportText(readFileSync(resolve(FIX, p), "utf8")),
  sha256: "ab".repeat(32),
});
const inFolder = (rel: string) => {
  const f = new File(["data"], rel.split("/").pop()!);
  Object.defineProperty(f, "webkitRelativePath", { value: rel });
  return f;
};

beforeEach(() => attach.mockReset().mockResolvedValue("att"));

describe("import flow", () => {
  it("builds the request for a new or an open run", () => {
    const r = report("single/ctrf.json");
    const req = buildRequest("p", "u", r, {
      kind: "new",
      run: { title: "CI" },
    });
    expect(req).toMatchObject({
      projectId: "p",
      userId: "u",
      newRun: { title: "CI" },
    });
    // The shard travels in the document only (immutable, ADR-0013).
    expect(req).not.toHaveProperty("shardIndex");
    expect(req.fileName).toBe("ctrf.json");
    expect(req).not.toHaveProperty("runId");
    const open = buildRequest(
      "p",
      "u",
      r,
      { kind: "existing", runId: "r1" },
      true,
    );
    expect(open).toMatchObject({ runId: "r1", allowDuplicate: true });
  });

  it("finds an attachment by the longest tail of its path", () => {
    const folder = [
      inFolder("test-results/a/error-context.md"),
      inFolder("test-results/b-retry1/error-context.md"),
      inFolder("test-results/b/error-context.md"),
    ];
    expect(
      matchAttachment(
        "C:\\work\\ing01\\test-results\\b\\error-context.md",
        folder,
      ),
    ).toBe(folder[2]);
    expect(
      matchAttachment(
        "..\\..\\test-results\\b-retry1\\error-context.md",
        folder,
      ),
    ).toBe(folder[1]);
    expect(matchAttachment("other.png", folder)).toBeUndefined();
  });

  it("decodes embedded attachments", async () => {
    const b = inlineBlob(
      { data: btoa("hola"), encoding: "base64" },
      "text/markdown",
    );
    expect(b.type).toBe("text/markdown");
    expect(b.size).toBe(4);
    expect(inlineBlob({ data: "plain", encoding: "text" }).size).toBe(5);
  });

  it("sends every attachment to its owner and counts what is missing", async () => {
    const msg = report("single/cucumber-messages.ndjson");
    const outcome: ReportImportOutcome = {
      runId: "r",
      runKey: "RUN-001",
      shardId: "s",
      alreadyImported: false,
      results: 6,
      linked: 6,
      unlinked: 0,
      warnings: [],
      attachments: [...msg.parsed.inline.keys()].map((ref) => ({
        ref,
        ownerEntity: "result",
        ownerId: `o-${ref}`,
      })),
    };
    const progress: number[] = [];
    const done = await attachAll(msg, outcome, [], "u", (d) =>
      progress.push(d),
    );
    expect(done).toEqual({ attached: 3, missing: [], failed: 0 });
    expect(attach).toHaveBeenCalledWith(
      "result",
      "o-a1",
      expect.any(Blob),
      "error-context",
      "text/markdown",
      "evidence",
      "u",
    );
    expect(progress).toEqual([1, 2, 3]);
    // CTRF names files by path: without the folder they are missing.
    const ctrf = report("single/ctrf.json");
    const paths: ReportImportOutcome = {
      ...outcome,
      attachments: ctrf.parsed.doc.attachments.map((a) => ({
        ref: a.ref,
        ownerEntity: "result",
        ownerId: "x",
      })),
    };
    attach.mockClear();
    const none = await attachAll(ctrf, paths, [], "u");
    expect(none.missing).toHaveLength(ctrf.parsed.doc.attachments.length);
    expect(attach).not.toHaveBeenCalled();
    attach.mockRejectedValueOnce(new Error("disk"));
    const folder = [
      inFolder(
        "test-results/features-auth.feature-Aute-01b4c-n-Login-rechazado-Example-2/error-context.md",
      ),
    ];
    const some = await attachAll(ctrf, paths, folder, "u");
    expect(some.failed + some.attached).toBeGreaterThan(0);
  });

  it("names the errors the desktop and the parsers give", () => {
    expect(importErrorKey(new ReportError("cucumber-json"))).toEqual({
      key: "runs.import.error.cucumber-json",
    });
    expect(importErrorKey("already-imported: RUN-004")).toEqual({
      key: "runs.import.error.already-imported",
      detail: "RUN-004",
    });
    expect(importErrorKey(new Error("run-closed"))).toEqual({
      key: "runs.import.error.run-closed",
      detail: undefined,
    });
    expect(importErrorKey("boom")).toEqual({
      key: "runs.import.error.generic",
      detail: "boom",
    });
  });
});
