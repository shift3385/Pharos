// Stable step and row ids in the UI (DAT-02, ADR-0011): edits keep ids, the
// Gherkin round-trip keeps them (rule 9), and the UI never rewrites what the
// backend stored (shared vectors with the desktop and the server).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  flowsToGherkin,
  fromGherkin,
  parseFeatureFlows,
  toGherkin,
} from "../ui/gherkin";
import type { Flow, Step, TestCaseData } from "./types";
import {
  align,
  editStepTexts,
  newStepId,
  reconcileFlows,
  reconcileRows,
  reconcileSteps,
  stepsOf,
  texts,
  toSteps,
  withStableSteps,
} from "./steps";

const ids = (steps: readonly Step[]) => steps.map((s) => s.id);

describe("ids", () => {
  it("are 8 Crockford base32 characters, unique against the case", () => {
    const used = new Set<string>();
    for (let i = 0; i < 500; i++) newStepId(used);
    expect(used.size).toBe(500);
    for (const id of used) expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });
});

describe("align", () => {
  it("matches equal texts in order and pairs what was edited in place", () => {
    expect(align(["a", "b", "c"], ["a", "B", "c"])).toEqual([0, 1, 2]);
    expect(align(["a", "b", "c"], ["a", "x", "b", "c"])).toEqual([0, -1, 1, 2]);
    expect(align(["a", "b", "c"], ["a", "c"])).toEqual([0, 2]);
    expect(align(["a", "b", "c"], ["c", "a", "b"])).toEqual([-1, 0, 1]);
    expect(align(["x", "x"], ["x", "x", "x"])).toEqual([0, 1, -1]);
    expect(align([], ["a"])).toEqual([-1]);
    expect(align(["a"], [])).toEqual([]);
  });
});

describe("reconcileSteps", () => {
  const before = stepsOf(["open", "pay", "confirm"]);
  const [open, pay, confirm] = before;

  it("keeps the id of a step edited in place, and its expected result", () => {
    const withExpected = [open, { ...pay, expected: "paid" }, confirm];
    const after = reconcileSteps(withExpected, [
      "open",
      "pay by card",
      "confirm",
    ]);
    expect(ids(after)).toEqual(ids(before));
    expect(after[1]).toEqual({
      id: pay.id,
      text: "pay by card",
      expected: "paid",
    });
  });

  it("gives an inserted step a new id and keeps the others", () => {
    const after = reconcileSteps(before, [
      "open",
      "add coupon",
      "pay",
      "confirm",
    ]);
    expect([after[0].id, after[2].id, after[3].id]).toEqual(ids(before));
    expect(ids(before)).not.toContain(after[1].id);
  });

  it("drops the id of a deleted step and never hands it out again", () => {
    const after = reconcileSteps(before, ["open", "confirm"]);
    expect(ids(after)).toEqual([open.id, confirm.id]);
    const again = reconcileSteps(after, ["open", "new", "confirm"]);
    expect(again[1].id).not.toBe(pay.id);
  });
});

describe("reconcileRows", () => {
  it("keeps row ids by values, a changed cell keeps its row", () => {
    const rows = reconcileRows(undefined, [
      ["ana", "ok"],
      ["bob", "no"],
    ]);
    const after = reconcileRows(rows, [
      ["bob", "no"],
      ["ana", "OK"],
    ]);
    expect(after[0].id).toBe(rows[1].id);
    expect(after[1].id).not.toBe(rows[1].id);
  });
});

describe("Gherkin round-trip keeps every id (ADR-0011 rule 9)", () => {
  it("basic and outline: render → edit the text → parse → same ids", () => {
    const data: TestCaseData = withStableSteps({
      gherkinLevel: "outline",
      preconditions: stepsOf(["a user <user>"]),
      steps: stepsOf(["I log in as <user>", "I open the cart"]),
      expectedResult: "I see <result>",
      examples: {
        headers: ["user", "result"],
        rows: reconcileRows(undefined, [
          ["ana", "ok"],
          ["bob", "no"],
        ]),
      },
    });
    const text = toGherkin("Login", data, "ATS_001")
      .replace("I open the cart", "I open the basket")
      .replace(
        "    When I log in as <user>\n",
        "    When I log in as <user>\n    And I accept cookies\n",
      );
    const parsed = fromGherkin(text);
    const steps = reconcileSteps(data.steps, parsed.steps);
    expect(texts(steps)).toEqual([
      "I log in as <user>",
      "I accept cookies",
      "I open the basket",
    ]);
    expect(steps[0].id).toBe(data.steps![0].id);
    expect(steps[2].id).toBe(data.steps![1].id);
    expect(ids(data.steps!)).not.toContain(steps[1].id);
    expect(reconcileSteps(data.preconditions, parsed.preconditions)[0].id).toBe(
      data.preconditions![0].id,
    );
    const rows = reconcileRows(data.examples!.rows, parsed.examples!.rows);
    expect(rows.map((r) => r.id)).toEqual(data.examples!.rows.map((r) => r.id));
  });

  it("advanced: scenarios are matched by name, then steps by position and text", () => {
    const prev: Flow[] = reconcileFlows(undefined, [
      {
        name: "Pay",
        preconditions: ["a cart"],
        steps: ["I pay", "I confirm"],
        expectedResult: "paid",
      },
      {
        name: "Declined",
        steps: ["I pay with <card>"],
        expectedResult: "declined",
        examples: { headers: ["card"], rows: [["expired"], ["stolen"]] },
      },
    ]);
    const background = stepsOf(["the shop is open"]);
    const text = flowsToGherkin("Checkout", background, prev, {
      scenarioId: "ATS_003",
    });
    // The user swaps the scenarios in the raw Gherkin, edits a step in place
    // and inserts a new one.
    const [head, pay, declined] = text.split(/\n(?= {2}@ATS_003\n)/);
    const edited = [
      head,
      declined,
      pay
        .replace("I confirm", "I confirm the order")
        .replace("    When I pay\n", "    When I pay\n    And I wait\n"),
    ].join("\n");
    const parsed = parseFeatureFlows(edited);
    const flows = reconcileFlows(prev, parsed.flows);
    expect(flows.map((f) => f.id)).toEqual([prev[1].id, prev[0].id]);
    expect(texts(flows[1].steps)).toEqual([
      "I pay",
      "I wait",
      "I confirm the order",
    ]);
    expect(flows[1].steps[0].id).toBe(prev[0].steps[0].id);
    expect(flows[1].steps[2].id).toBe(prev[0].steps[1].id);
    expect(flows[1].preconditions![0].id).toBe(prev[0].preconditions![0].id);
    expect(flows[0].examples!.rows.map((r) => r.id)).toEqual(
      prev[1].examples!.rows.map((r) => r.id),
    );
    expect(reconcileSteps(background, parsed.background)[0].id).toBe(
      background[0].id,
    );
  });

  it("a renamed scenario in the same place keeps its flow id", () => {
    const prev = reconcileFlows(undefined, [
      { name: "Old name", steps: ["s"], expectedResult: "" },
    ]);
    const flows = reconcileFlows(prev, [
      { name: "New name", steps: ["s"], expectedResult: "" },
    ]);
    expect(flows[0].id).toBe(prev[0].id);
    expect(flows[0].steps[0].id).toBe(prev[0].steps[0].id);
  });
});

describe("tolerant readers", () => {
  it("keep an id that is not a string as legacyId", () => {
    const [s] = toSteps([{ id: 3, text: "three" }]);
    expect(s).toMatchObject({ text: "three", legacyId: 3 });
    expect(s.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("never print an object as a step", () => {
    expect(texts(["a", { id: "X", text: "b" }, { given: "g" }, null])).toEqual([
      "a",
      "b",
      '{"given":"g"}',
      "",
    ]);
    const steps = toSteps(["a", { id: "X", text: "b" }]);
    expect(steps[1]).toEqual({ id: "X", text: "b" });
    expect(steps[0].text).toBe("a");
  });

  it("leave untouched what the backend stored (shared vectors)", () => {
    const vectors = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          "../../../../src-tauri/tests/fixtures/stable-steps-vectors.json",
        ),
        "utf8",
      ),
    ) as { normalize: { name: string; output: unknown }[] };
    for (const v of vectors.normalize) {
      if (!v.output || typeof v.output !== "object") continue;
      const data = v.output as TestCaseData;
      const read = withStableSteps(data);
      // Lists the backend made stable are read exactly as stored.
      for (const key of ["preconditions", "background", "steps"] as const)
        if (Array.isArray(data[key]))
          expect(read[key], `${v.name} ${key}`).toEqual(data[key]);
      if (data.examples?.rows)
        expect(read.examples?.rows, v.name).toEqual(data.examples.rows);
    }
  });
});

describe("typing in a list field keeps each step's id (review S1)", () => {
  const A: Step = { id: "AAAAAAAA", text: "Open cart", expected: "e" };
  const B: Step = { id: "BBBBBBBB", text: "" };

  it("clearing a step, or making two equal, never moves an id", () => {
    expect(editStepTexts([A, B], ["", ""])).toEqual([
      { ...A, text: "" },
      { ...B, text: "" },
    ]);
    expect(ids(editStepTexts([A, B], ["Open cart", "Open cart"]))).toEqual([A.id, B.id]);
    // Typing a character at a time.
    let steps: Step[] = [A, B];
    for (const t of ["O", "Op", "Ope"]) steps = editStepTexts(steps, ["Open cart", t]);
    expect(ids(steps)).toEqual([A.id, B.id]);
  });

  it("an insert or a delete aligns the texts", () => {
    expect(ids(editStepTexts([A, B], ["Open cart"]))).toEqual([A.id]);
    expect(ids(editStepTexts([A, B], [""]))).toEqual([B.id]);
    const added = editStepTexts([A, B], ["Open cart", "", "new"]);
    expect(ids(added).slice(0, 2)).toEqual([A.id, B.id]);
  });

  it("two flows renamed to the same name keep their own ids", () => {
    const prev = reconcileFlows(undefined, [
      { name: "One", steps: ["a"], expectedResult: "" },
      { name: "Two", steps: ["b"], expectedResult: "" },
    ]);
    const same = reconcileFlows(prev, [
      { name: "Same", steps: ["a"], expectedResult: "" },
      { name: "Same", steps: ["b"], expectedResult: "" },
    ]);
    expect(same.map((f) => f.id)).toEqual(prev.map((f) => f.id));
    const again = reconcileFlows(same, [
      { name: "Same", steps: ["a"], expectedResult: "" },
      { name: "Same", steps: ["b"], expectedResult: "" },
    ]);
    expect(again.map((f) => f.id)).toEqual(prev.map((f) => f.id));
    expect(again[1].steps[0].id).toBe(prev[1].steps[0].id);
  });

  it("a flow keeps the keys the parser does not know", () => {
    const prev = [{ ...reconcileFlows(undefined, [{ name: "F", steps: ["a"], expectedResult: "" }])[0], custom: { k: 1 } }];
    expect(reconcileFlows(prev as Flow[], [{ name: "F", steps: ["a"], expectedResult: "" }])[0]).toMatchObject({ custom: { k: 1 } });
  });

  it("removing Examples, tags or preconditions in the Gherkin removes them from the flow", () => {
    const prev = reconcileFlows(undefined, [
      {
        name: "F",
        preconditions: ["a cart"],
        steps: ["I pay with <card>"],
        expectedResult: "",
        examples: { headers: ["card"], rows: [["visa"]] },
        tags: ["smoke"],
      },
    ]);
    const [flow] = reconcileFlows(prev, [{ name: "F", steps: ["I pay"], expectedResult: "" }]);
    expect(flow.id).toBe(prev[0].id);
    expect(flow.examples).toBeUndefined();
    expect(flow.tags).toBeUndefined();
    expect(flow.preconditions).toEqual([]);
    expect("examples" in flow || "tags" in flow).toBe(false);
    // Rendered again, it is a plain Scenario.
    expect(flowsToGherkin("T", [], [flow])).not.toContain("Scenario Outline");
  });

  it("a line replaced wholesale next to an insert gets a new id", () => {
    expect(align(["Open the cart"], ["Close the window", "Delete everything"])).toEqual([-1, -1]);
  });
});

describe("align is the same on the desktop and the server (shared vectors)", () => {
  it("holds every vector", () => {
    const vectors = JSON.parse(
      readFileSync(resolve(__dirname, "../../../../src-tauri/tests/fixtures/stable-steps-vectors.json"), "utf8"),
    ) as { align: { prev: string[]; next: string[]; out: number[] }[] };
    for (const v of vectors.align) expect(align(v.prev, v.next)).toEqual(v.out);
  });
});
