import { describe, expect, it, vi } from "vitest";
import type { AuditRow } from "../model/audit";
import { exportRows, fetchAll, toCsv, type AuditExportLabels } from "./auditExport";

const row = (over: Partial<AuditRow>): AuditRow => ({
  id: "e1",
  at: "2026-11-12T10:42:07.000Z",
  actor: "agent:planner-01",
  onBehalfOf: "user:u1",
  action: "update",
  entity: "test_case",
  entityId: "c1",
  entityKey: "ATS_014",
  projectId: "p1",
  projectName: "Portal",
  deviceId: "d1",
  changes: '{"status":["draft","ready"],"steps":[["a"],["a","b"]]}',
  summary: null,
  chainWorkspaceId: "w",
  chainOwner: "u1",
  chainSeq: 7,
  prevHash: "p",
  hash: "h7",
  redactedAt: null,
  ...over,
});

const labels: AuditExportLabels = {
  headers: ["at", "who", "for", "action", "type", "key", "project", "field", "before", "after", "origin", "seq", "hash"],
  actor: (a) => a.toUpperCase(),
  action: (a) => `A:${a}`,
  entity: (e) => `E:${e}`,
  device: (d) => `D:${d}`,
  field: (f) => `F:${f}`,
  redacted: "REDACTED",
  sheet: "Audit",
  integrity: { sheet: "I", headers: [], ok: "ok", broken: () => "bad", checkedAt: "c" },
};

describe("audit export (AUD-01)", () => {
  it("writes one row per changed field, and one for an event without a diff", () => {
    const rows = exportRows(
      [
        row({}),
        row({ id: "e2", action: "import", changes: "{}", summary: '{"created":42}', actor: "user:u1", onBehalfOf: null }),
        row({ id: "e3", changes: null, redactedAt: "2026-11-12" }),
      ],
      labels,
    );
    expect(rows[0]).toEqual(labels.headers);
    expect(rows[1]).toEqual([
      "2026-11-12T10:42:07.000Z",
      "AGENT:PLANNER-01",
      "USER:U1",
      "A:update",
      "E:test_case",
      "ATS_014",
      "Portal",
      "F:status",
      "draft",
      "ready",
      "D:d1",
      "7",
      "h7",
    ]);
    expect(rows[2].slice(7, 10)).toEqual(["F:steps", "a", "a\nb"]);
    expect(rows[3].slice(2, 10)).toEqual(["", "A:import", "E:test_case", "ATS_014", "Portal", "", "", "created: 42"]);
    expect(rows[4][9]).toBe("REDACTED");
    expect(rows).toHaveLength(5);
  });

  it("quotes CSV cells and starts with a BOM", () => {
    const csv = toCsv([
      ["a", "b,c"],
      ['say "hi"', "x\ny"],
    ]);
    expect(csv).toBe('﻿a,"b,c"\r\n"say ""hi""","x\ny"\r\n');
  });

  it("pages through everything the filters match", async () => {
    const all = Array.from({ length: 1100 }, (_, i) => row({ id: `e${i}` }));
    const list = vi.fn(async (q: { offset: number; limit: number }) => ({
      total: all.length,
      events: all.slice(q.offset, q.offset + q.limit),
    }));
    const out = await fetchAll(list, { offset: 0, limit: 50 });
    expect(out.events).toHaveLength(1100);
    expect(out.capped).toBe(false);
    expect(list.mock.calls.map(([q]) => q.offset)).toEqual([0, 500, 1000]);
  });
});
