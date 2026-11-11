// IA-17: the synthesis answer is checked against what was sent before anyone
// sees it — keys and candidates must exist, one proposal per requirement,
// no repeated titles, no empty improvements — and deleting never reaches a
// requirement that test cases link.

import { describe, expect, it } from "vitest";
import type { RawRequirementProposal } from "@modules/ai";
import type { Requirement } from "../model/types";
import {
  blockedByLinks,
  deletedKeys,
  describedWithAcceptance,
  mostSimilar,
  similarity,
  supportOf,
  usableRequirementProposals,
} from "./proposals";
import type { CandidateRequirement } from "./types";

const req = (key: string, title: string, extra: Partial<Requirement> = {}): Requirement => ({
  id: `id-${key}`,
  projectId: "p1",
  requirementKey: key,
  title,
  description: "",
  priority: "medium",
  createdAt: "",
  updatedAt: "",
  revision: 3,
  ...extra,
});

const existing = [
  req("REQ-001", "Sign in with email and password"),
  req("REQ-002", "Export the matrix to Excel"),
  req("REQ-003", "Fast pages"),
];

const cand = (title: string, extra: Partial<CandidateRequirement> = {}): CandidateRequirement => ({
  title,
  description: `The system shall ${title.toLowerCase()}.`,
  basis: "inferred",
  sources: [{ kind: "file", path: `docs/${title}.md`, startLine: 1 }],
  ...extra,
});
const candidates = [
  cand("Sign out", { basis: "stated", priority: "low", acceptance: ["Session ends"] }),
  cand("Sign out everywhere", { priority: "high", acceptance: ["Session ends", "All devices"] }),
  cand("Page load", { questions: ["How fast?"] }),
];

const add = (over: Partial<Extract<RawRequirementProposal, { action: "add" }>> = {}): RawRequirementProposal => ({
  action: "add",
  from: [1],
  title: "Sign out",
  description: "The system shall sign the user out.",
  reason: "C1 documents it",
  ...over,
});

describe("usableRequirementProposals", () => {
  it("keeps a new one with the sources, basis and criteria of its candidates", () => {
    const [p] = usableRequirementProposals([add({ from: [1, 2, 2, 9] })], candidates, existing);
    expect(p).toMatchObject({ id: 0, action: "add", priority: "high", basis: "stated" });
    if (p.action !== "add") throw new Error();
    expect(p.sources.map((s) => (s.kind === "file" ? s.path : ""))).toEqual([
      "docs/Sign out.md",
      "docs/Sign out everywhere.md",
    ]);
    expect(p.acceptance).toEqual(["Session ends", "All devices"]);
  });

  it("drops a new one without valid candidates or whose title already exists", () => {
    const out = usableRequirementProposals(
      [
        add({ from: [7] }),
        add({ title: "export the matrix to EXCEL" }),
        add({ title: "Sign out" }),
        add({ title: "Sign out", description: "again" }),
      ],
      candidates,
      existing,
    );
    expect(out.map((p) => p.id)).toEqual([2]);
  });

  it("flags a new one alike to an existing requirement, or keeps the model's own valid key", () => {
    const [alike, named, unknown] = usableRequirementProposals(
      [
        add({ title: "Sign in with email" }),
        add({ title: "Login page", similarTo: "REQ-001" }),
        add({ title: "Audit log", similarTo: "REQ-404" }),
      ],
      candidates,
      existing,
    );
    expect(alike).toMatchObject({ similarTo: "REQ-001" });
    expect(named).toMatchObject({ similarTo: "REQ-001" });
    expect(unknown).not.toHaveProperty("similarTo");
  });

  it("keeps one change per requirement, with its revision, and drops empty improvements", () => {
    const out = usableRequirementProposals(
      [
        { action: "improve", key: "REQ-003", from: [3], description: "Pages load in under 2 s.", reason: "vague" },
        { action: "remove", key: "REQ-003", reason: "claimed already" },
        { action: "improve", key: "REQ-002", from: [], title: "Export the matrix to Excel", reason: "same" },
        { action: "improve", key: "REQ-999", from: [], title: "X", reason: "unknown" },
      ],
      candidates,
      existing,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ action: "improve", key: "REQ-003", revision: 3, questions: ["How fast?"] });
  });

  it("a merge needs two existing keys and keeps one of them; remove points at a real cover", () => {
    const out = usableRequirementProposals(
      [
        { action: "merge", keys: ["REQ-001", "REQ-404"], keep: "REQ-001", reason: "one key" },
        { action: "merge", keys: ["REQ-001", "REQ-002"], keep: "REQ-003", reason: "keep outside" },
        { action: "merge", keys: ["REQ-001", "REQ-002", "REQ-001"], keep: "REQ-001", reason: "ok" },
        { action: "remove", key: "REQ-003", coveredBy: "REQ-003", reason: "self" },
      ],
      candidates,
      existing,
    );
    expect(out.map((p) => p.action)).toEqual(["merge", "remove"]);
    expect(out[0]).toMatchObject({ keys: ["REQ-001", "REQ-002"], keep: "REQ-001" });
    expect(out[1]).not.toHaveProperty("coveredBy");
  });
});

describe("helpers", () => {
  it("similarity ignores accents, case and filler words", () => {
    expect(similarity("Iniciar sesión con correo", "iniciar SESION con el correo")).toBe(1);
    expect(similarity("Sign in", "Export")).toBe(0);
    expect(mostSimilar("Export matrix Excel", existing)).toBe("REQ-002");
  });

  it("support of no candidates has no basis", () => {
    expect(supportOf([])).toEqual({ sources: [] });
  });

  it("knows what a proposal deletes and blocks it while cases link it", () => {
    const merge = { id: 1, action: "merge" as const, keys: ["REQ-001", "REQ-002"], keep: "REQ-001", reason: "" };
    expect(deletedKeys(merge)).toEqual(["REQ-002"]);
    expect(blockedByLinks(merge, { "REQ-002": 2 })).toEqual(["REQ-002"]);
    expect(blockedByLinks(merge, { "REQ-001": 5 })).toEqual([]);
  });

  it("appends acceptance criteria under a heading", () => {
    expect(describedWithAcceptance("Do it.", ["A", "B"], "Criterios de aceptación:")).toBe(
      "Do it.\n\nCriterios de aceptación:\n- A\n- B",
    );
    expect(describedWithAcceptance("Do it.", [], "x")).toBe("Do it.");
  });

  it("writes a Gherkin criterion one keyword per line (UX-23)", () => {
    expect(describedWithAcceptance("Do it.", ["Given El campo vacío, when pulsa Ingresar, then no entra"], "Criterios:")).toBe(
      "Do it.\n\nCriterios:\n- Given el campo vacío\n  When pulsa Ingresar\n  Then no entra",
    );
  });
});
