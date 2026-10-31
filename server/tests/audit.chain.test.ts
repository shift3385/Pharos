import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashOf, jcs, sha256Hex, verifyChain, type AuditEvent } from "../src/modules/audit/audit.chain";
import { diff, location } from "../src/modules/audit/audit.diff";
import { buildEvent, type NewWebEvent } from "../src/modules/audit/audit.store";

// The audit vectors shared with the desktop (AUD-01b, ADR-0015):
// `src-tauri/src/audit_tests.rs` asserts the same file, so the server's chain
// and `audit::verify_chain` can never disagree. The web chain in it is built
// by `buildEvent` below; `UPDATE_AUDIT_FIXTURE=1` rewrites it (only together
// with the desktop test).
const FIXTURE = new URL("../../src/shared/contracts/fixtures/audit/chain.json", import.meta.url);

interface Fixture {
  jcs: { value: unknown; canonical: string }[];
  refused: unknown[];
  jcsText: { json: string; canonical: string }[];
  refusedText: string[];
  userId: string;
  docs: { entity: string; entityId: string; payload: AuditEvent; revision: number; author: string; deleted: boolean; hlc: string; seq: number }[];
}

const USER = "6f1c2a9e-0d3b-4c5e-9a7f-1b2c3d4e5f60";
const PROJECT = "a0000000-0000-4000-8000-000000000001";
const CASE = "c0000000-0000-4000-8000-000000000002";

/** The web chain of the fixture: a create (with non-ASCII and control
 *  characters), an update, an import and a project delete with its cascade. */
function webChain(): AuditEvent[] {
  const caseBefore = {
    id: CASE,
    projectId: PROJECT,
    scenarioId: "ATS_001",
    title: "Iniciar sesión «café» 中文 😀\n\t\"q\"",
    data: { steps: ["a"], gherkinLevel: "basic" },
    revision: 1,
    deleted: false,
  };
  const caseAfter = { ...caseBefore, title: "Cerrar sesión", data: { steps: ["a", "b"], gherkinLevel: "basic" }, revision: 2 };
  const project = { id: PROJECT, name: "Pagos", caseIdPrefix: "ATS_", caseIdDigits: 3, revision: 1, deleted: false };
  const events: Omit<NewWebEvent, "userId">[] = [
    { action: "create", entity: "test_case", entityId: CASE, ...location("test_case", CASE, null, caseBefore), changes: diff(null, caseBefore), summary: null },
    { action: "update", entity: "test_case", entityId: CASE, ...location("test_case", CASE, caseBefore, caseAfter), changes: diff(caseBefore, caseAfter), summary: null },
    {
      action: "import",
      entity: "project",
      entityId: PROJECT,
      ...location("project", PROJECT, project, null),
      changes: {},
      summary: { entity: "requirement", format: "csv", rows: 3, created: 2, updated: 1, skipped: 0 },
    },
    {
      action: "delete",
      entity: "project",
      entityId: PROJECT,
      ...location("project", PROJECT, project, null),
      changes: diff(project, null),
      summary: { cascade: { planner_cards: 0, requirements: 2, test_cases: 1, test_plans: 0 } },
    },
  ];
  const chain: AuditEvent[] = [];
  for (const [i, ev] of events.entries()) {
    const prev = chain.at(-1);
    chain.push(
      buildEvent({ userId: USER, ...ev }, prev ? { seq: prev.chainSeq, hash: prev.hash } : null, {
        id: `e000000${i}-0000-4000-8000-00000000000${i}`,
        at: `2026-10-31T12:00:0${i}.${i}00Z`,
        hlc: `00173000000000${i}-00000-server`,
      }),
    );
  }
  return chain;
}

if (process.env.UPDATE_AUDIT_FIXTURE === "1") {
  const old = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;
  const docs = webChain().map((e, i) => ({
    entity: "audit_event",
    entityId: e.id,
    payload: e,
    revision: 1,
    author: e.actor,
    deleted: false,
    hlc: e.hlc,
    seq: i + 1,
  }));
  writeFileSync(FIXTURE, `${JSON.stringify({ ...old, userId: USER, docs }, null, 2)}\n`);
}

const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;
const chain = () => fixture.docs.map((d) => ({ ...d.payload }));

describe("audit chain (shared vectors)", () => {
  it("canonicalizes like the desktop", () => {
    for (const { value, canonical } of fixture.jcs) expect(jcs(value)).toBe(canonical);
  });

  it("refuses what is outside the subset", () => {
    for (const value of fixture.refused) expect(() => jcs(value)).toThrow(/outside the audit subset/);
  });

  it("reads the integer boundary and integral numbers like the desktop", () => {
    for (const { json, canonical } of fixture.jcsText) expect(jcs(JSON.parse(json))).toBe(canonical);
    for (const json of fixture.refusedText) expect(() => jcs(JSON.parse(json)), json).toThrow(/outside the audit subset/);
  });

  it("the web chain of the fixture is what the server builds, and it verifies", () => {
    expect(chain()).toEqual(webChain());
    for (const e of chain()) {
      expect(hashOf(e)).toBe(e.hash);
      expect(sha256Hex(e.changes!)).toBe(e.changesSha256);
    }
    expect(verifyChain(chain())).toEqual({ ok: true, count: 4 });
  });

  it("detects an edited field, edited changes, a removed link and a broken link", () => {
    const edited = chain();
    edited[1].actor = "user:someone-else";
    expect(verifyChain(edited)).toEqual({ ok: false, break: { kind: "hash", seq: 2 } });

    const content = chain();
    content[0].changes = content[0].changes!.replace("Iniciar", "Borrar");
    expect(verifyChain(content)).toEqual({ ok: false, break: { kind: "changes", seq: 1 } });

    const removed = chain().filter((e) => e.chainSeq !== 2);
    expect(verifyChain(removed)).toEqual({ ok: false, break: { kind: "gap", expected: 2, found: 3 } });

    const relinked = chain();
    relinked[2].prevHash = relinked[0].hash;
    expect(verifyChain(relinked)).toEqual({ ok: false, break: { kind: "link", seq: 3 } });
  });

  it("a redacted event still verifies", () => {
    const redacted = chain();
    redacted[0].changes = null;
    redacted[0].redactedAt = "2026-11-01T00:00:00.000Z";
    expect(verifyChain(redacted)).toEqual({ ok: true, count: 4 });
  });

  it("diffs like the journal: data one level down, bookkeeping ignored", () => {
    const before = { title: "a", revision: 1, updatedAt: "x", status: "draft", data: { steps: [1], custom: { k: 1 }, gone: true } };
    const after = { title: "b", revision: 2, updatedAt: "y", status: "draft", data: { steps: [1], custom: { k: 2 }, new: "n" } };
    expect(diff(before, after)).toEqual({
      title: ["a", "b"],
      "data.custom": [{ k: 1 }, { k: 2 }],
      "data.gone": [true, null],
      "data.new": [null, "n"],
    });
    expect(diff(before, { ...before, data: { custom: { k: 1 }, gone: true, steps: [1] } })).toEqual({});
    expect(diff({ data: "x" }, { data: { a: 1 } })).toEqual({ data: ["x", { a: 1 }] });
  });

  it("a __proto__ or constructor field is data, never inherited", () => {
    const before = JSON.parse('{"title":"a","data":{"__proto__":{"x":1}}}') as Record<string, unknown>;
    const after = JSON.parse('{"title":"a","__proto__":"p","data":{"constructor":2}}') as Record<string, unknown>;
    const d = diff(before, after);
    expect(Object.getPrototypeOf(d)).toBe(Object.prototype);
    expect(Object.keys(d).sort()).toEqual(["__proto__", "data.__proto__", "data.constructor"]);
    expect(JSON.parse(JSON.stringify(d))).toEqual(
      JSON.parse('{"__proto__":[null,"p"],"data.__proto__":[{"x":1},null],"data.constructor":[null,2]}'),
    );
    expect(diff(before, before)).toEqual({});
  });
});
