import { describe, expect, it } from "vitest";
import type { ExecutionTarget } from "@shared/contracts/contract";
import {
  attemptsOf,
  commandOf,
  derivedStatus,
  elapsedAt,
  fill,
  formatElapsed,
  newDraft,
  nextUnmarked,
  parseDraft,
  rowLabel,
  stepsOf,
  toggleTimer,
  toResultInput,
} from "./execution";

const revision = {
  background: [{ id: "BG", text: "logged in" }],
  preconditions: [{ id: "PRE", text: "cart has <item>" }],
  steps: [
    { id: "S1", text: "pay with <card>", expected: "paid" },
    { id: "S2", text: "see receipt" },
  ],
  flows: [
    {
      id: "F1",
      name: "Refund",
      expectedResult: "refunded",
      steps: [{ id: "R1", text: "refund" }],
    },
  ],
};

const target = (over: Partial<ExecutionTarget> = {}): ExecutionTarget => ({
  key: "-/ROW",
  flowId: null,
  flowName: null,
  exampleRowId: "ROW",
  exampleRow: 0,
  values: { item: "book", card: "visa" },
  testKey: "manual:c/-/ROW",
  ...over,
});

const at = new Date("2026-11-04T10:00:00.000Z");

describe("steps of a target", () => {
  it("is the Background, then the flow's preconditions and steps", () => {
    expect(stepsOf(revision, null).map((s) => s.id)).toEqual(["BG", "PRE", "S1", "S2"]);
    expect(stepsOf(revision, "F1").map((s) => s.id)).toEqual(["BG", "R1"]);
    expect(stepsOf(revision, null)[2].expected).toBe("paid");
    expect(stepsOf(revision, "nope").map((s) => s.id)).toEqual(["BG"]);
  });

  it("fills <params> from the Outline row and names the row", () => {
    expect(fill("pay with <card> for <other>", { card: "visa" })).toBe(
      "pay with visa for <other>",
    );
    expect(fill("x <a>", ["1"])).toBe("x <a>");
    expect(rowLabel({ item: "book", card: "visa" })).toBe("item=book · card=visa");
    expect(rowLabel(["a", "b"])).toBe("a · b");
  });
});

describe("the draft", () => {
  it("derives the result from the steps, unmarked counting as skipped", () => {
    const steps = stepsOf(revision, null);
    const d = newDraft(at);
    expect(derivedStatus(steps, d)).toBe("skipped");
    d.steps.S1 = { status: "passed" };
    expect(derivedStatus(steps, d)).toBe("passed");
    d.steps.S2 = { status: "blocked" };
    expect(derivedStatus(steps, d)).toBe("blocked");
    d.steps.BG = { status: "failed" };
    expect(derivedStatus(steps, d)).toBe("failed");
    expect(nextUnmarked(steps, d, 0)).toBe(1);
  });

  it("comes back from storage with its timer paused", () => {
    const running = toggleTimer({ ...newDraft(at), elapsedMs: 5_000 }, at);
    expect(running.runningSince).toBeDefined();
    expect(elapsedAt(running, new Date(at.getTime() + 2_000))).toBe(7_000);
    // Saved 3 s after it started: those 3 s are kept, the timer is paused.
    const savedAt = new Date(at.getTime() + 3_000).toISOString();
    const back = parseDraft(JSON.parse(JSON.stringify(running)), at, savedAt);
    expect(back.runningSince).toBeUndefined();
    expect(back.elapsedMs).toBe(8_000);
    expect(back.attemptId).toBe(running.attemptId);
    expect(parseDraft(JSON.parse(JSON.stringify(running)), at).elapsedMs).toBe(5_000);
    expect(parseDraft("junk", at).steps).toEqual({});
    expect(parseDraft({ steps: { S1: { status: "weird" } } }, at).steps.S1.status).toBeUndefined();
    expect(formatElapsed(61_000)).toBe("01:01");
    expect(formatElapsed(3_661_000)).toBe("1:01:01");
  });

  it("becomes the attempt: target, filled texts, skipped defaults, notes and message", () => {
    const steps = stepsOf(revision, null);
    const d = {
      ...newDraft(new Date(at.getTime() - 60_000)),
      elapsedMs: 42_000,
      notes: " slow page ",
      steps: {
        S1: { status: "failed" as const, actual: " declined " },
        S2: { status: "passed" as const },
      },
    };
    const input = toResultInput("item-1", target(), steps, d, "u", at);
    expect(input).toMatchObject({
      runItemId: "item-1",
      exampleRowId: "ROW",
      attemptId: d.attemptId,
      status: "failed",
      durationMs: 42_000,
      finishedAt: at.toISOString(),
      errorMessage: "declined",
      attributes: { notes: "slow page" },
      userId: "u",
    });
    expect(input.flowId).toBeUndefined();
    expect(input.configurationLabel).toBeUndefined();
    expect(d.attemptId).toMatch(/^[0-9a-f-]{36}$/);
    expect(input.steps?.map((s) => [s.stepId, s.text, s.status, s.actual])).toEqual([
      ["BG", "logged in", "skipped", undefined],
      ["PRE", "cart has book", "skipped", undefined],
      ["S1", "pay with visa", "failed", "declined"],
      ["S2", "see receipt", "passed", undefined],
    ]);
    // A chosen status wins over the steps.
    expect(toResultInput("i", target(), steps, { ...d, status: "blocked" }, "u", at).status).toBe(
      "blocked",
    );
  });
});

describe("keyboard", () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  });
  it("letters mark and move outside fields; Ctrl+Enter saves anywhere", () => {
    expect(commandOf(key("p"), false)).toEqual({ kind: "mark", status: "passed" });
    expect(commandOf(key("F"), false)).toEqual({ kind: "mark", status: "failed" });
    expect(commandOf(key("p"), true)).toBeNull();
    expect(commandOf(key("ArrowDown"), false)).toEqual({ kind: "move", by: 1 });
    expect(commandOf(key("k"), false)).toEqual({ kind: "move", by: -1 });
    expect(commandOf(key("Enter", { ctrlKey: true }), true)).toEqual({ kind: "save" });
    expect(commandOf(key("N", { ctrlKey: true, shiftKey: true }), true)).toEqual({
      kind: "nextItem",
    });
    expect(commandOf(key("p", { ctrlKey: true }), false)).toBeNull();
    expect(commandOf(key("?"), false)).toEqual({ kind: "help" });
  });
});

it("finds the attempts of one target", () => {
  const r = (flow: string | null, row: string | null) => ({
    effectiveFlowId: flow,
    effectiveExampleRowId: row,
  });
  const all = [r(null, "ROW"), r(null, "OTHER"), r("F1", null), r(null, "ROW")];
  expect(attemptsOf(all, target())).toHaveLength(2);
  expect(attemptsOf(all, target({ flowId: "F1", exampleRowId: null }))).toHaveLength(1);
});
