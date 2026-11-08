// IA-17: applying what the person accepted — new requirements get the AI mark
// and their sources, a requirement changed since the answer is not
// overwritten, nothing linked by cases is deleted, and one failure does not
// stop the rest.

import { describe, expect, it, vi } from "vitest";
import type { Requirement, RequirementInput } from "../model/types";
import type { RequirementProposal } from "../proposals/types";
import { applyRequirementProposals } from "./applyProposals";

const provenance = { provider: "ollama" as const, model: "m", generatedAt: "2026-11-07T00:00:00Z", prompt: "req-synthesis@1" };

const req = (key: string, revision = 2, extra: Partial<Requirement> = {}): Requirement => ({
  id: `id-${key}`,
  projectId: "p1",
  requirementKey: key,
  title: `Title ${key}`,
  description: "Old",
  priority: "medium",
  createdAt: "",
  updatedAt: "",
  revision,
  ...extra,
});

function fakeApi(stored: Requirement[]) {
  const byId = new Map(stored.map((r) => [r.id, r]));
  return {
    get: vi.fn(async (id: string) => byId.get(id) ?? null),
    create: vi.fn(async (input: RequirementInput) => ({ ...req("REQ-NEW"), ...input }) as Requirement),
    update: vi.fn(async (id: string, input: RequirementInput) => ({ ...byId.get(id)!, ...input }) as Requirement),
    remove: vi.fn(async (_id: string, _userId: string) => undefined),
  };
}

const base = {
  projectId: "p1",
  userId: "u1",
  provenance,
  linkedCases: { "REQ-004": 1 },
  acceptanceHeading: "Criterios de aceptación:",
};

describe("applyRequirementProposals", () => {
  it("creates new ones marked pending review, with sources and criteria", async () => {
    const api = fakeApi([]);
    const accepted: RequirementProposal[] = [
      {
        id: 0,
        action: "add",
        title: "Sign out",
        description: "The system shall sign out.",
        priority: "high",
        reason: "r",
        acceptance: ["Session ends"],
        sources: [{ kind: "file", path: "docs/a.md", startLine: 2 }],
      },
    ];
    const r = await applyRequirementProposals({ ...base, accepted, existing: [] }, api);
    expect(r).toEqual({ created: 1, updated: 0, removed: 0, skipped: [], failed: [] });
    expect(api.create).toHaveBeenCalledWith({
      projectId: "p1",
      userId: "u1",
      title: "Sign out",
      description: "The system shall sign out.\n\nCriterios de aceptación:\n- Session ends",
      priority: "high",
      data: { aiProvenance: { requirement: provenance }, sources: [{ kind: "file", path: "docs/a.md", startLine: 2 }] },
    });
  });

  it("improves a requirement still as seen, keeping its data and adding sources", async () => {
    const current = req("REQ-001", 2, {
      data: { sources: [{ kind: "file", path: "old.md" }], custom: 1 },
    });
    const api = fakeApi([current]);
    const accepted: RequirementProposal[] = [
      {
        id: 3,
        action: "improve",
        key: "REQ-001",
        revision: 2,
        description: "New",
        reason: "vague",
        sources: [{ kind: "file", path: "new.md" }],
      },
    ];
    const r = await applyRequirementProposals({ ...base, accepted, existing: [current] }, api);
    expect(r.updated).toBe(1);
    const [, input] = api.update.mock.calls[0];
    expect(input).toMatchObject({ title: "Title REQ-001", description: "New", priority: "medium" });
    expect(input.data).toEqual({
      custom: 1,
      aiProvenance: { requirement: provenance },
      sources: [
        { kind: "file", path: "old.md" },
        { kind: "file", path: "new.md" },
      ],
    });
  });

  it("skips what changed or went since the answer, and what cases link", async () => {
    const seen = [req("REQ-001", 2), req("REQ-002", 2), req("REQ-004", 2)];
    const api = fakeApi([req("REQ-001", 5), req("REQ-004", 2)]);
    const accepted: RequirementProposal[] = [
      { id: 1, action: "improve", key: "REQ-001", revision: 2, title: "X", reason: "r", sources: [] },
      { id: 2, action: "remove", key: "REQ-002", reason: "r" },
      { id: 3, action: "remove", key: "REQ-004", reason: "r" },
    ];
    const r = await applyRequirementProposals({ ...base, accepted, existing: seen }, api);
    expect(r.skipped).toEqual([
      { id: 1, why: "changed" },
      { id: 2, why: "missing" },
      { id: 3, why: "linked" },
    ]);
    expect(api.update).not.toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
  });

  it("merges into the kept one and deletes the rest; a failure is reported and the rest goes on", async () => {
    const seen = [req("REQ-001"), req("REQ-002"), req("REQ-003")];
    const api = fakeApi(seen);
    api.create.mockRejectedValueOnce(new Error("offline"));
    const accepted: RequirementProposal[] = [
      { id: 0, action: "add", title: "A", description: "D", priority: "low", reason: "r", sources: [] },
      { id: 1, action: "merge", keys: ["REQ-001", "REQ-002"], keep: "REQ-001", description: "Merged", reason: "r" },
      { id: 2, action: "remove", key: "REQ-003", reason: "r" },
    ];
    const r = await applyRequirementProposals({ ...base, accepted, existing: seen }, api);
    expect(r).toEqual({ created: 0, updated: 1, removed: 2, skipped: [], failed: [0] });
    expect(api.update.mock.calls[0][0]).toBe("id-REQ-001");
    expect(api.update.mock.calls[0][1]).toMatchObject({ description: "Merged" });
    expect(api.remove.mock.calls.map((c) => c[0])).toEqual(["id-REQ-002", "id-REQ-003"]);
  });
});
