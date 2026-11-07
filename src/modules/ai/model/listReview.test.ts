// IA-16: what the model answers is checked against the list it was sent, and what
// the user accepts changes only the rows it names.

import { describe, expect, it } from "vitest";
import { applyProposals, usableProposals, type ListProposal, type ListProposalOps } from "./listReview";
import { listReviewSchema } from "./schemas";

const reason = "why";

describe("usableProposals", () => {
  it("resolves the numbers to the listed items, ignoring blank rows", () => {
    expect(
      usableProposals(
        [
          { action: "remove", item: 2, reason },
          { action: "rewrite", item: 1, text: "A better", reason },
        ],
        ["A", "  ", "B"],
      ),
    ).toEqual([
      { action: "rewrite", index: 0, target: "A", text: "A better", reason },
      { action: "remove", index: 1, target: "B", reason },
    ]);
  });

  it("drops a number that is not in the list and a second proposal for an item", () => {
    expect(
      usableProposals(
        [
          { action: "remove", item: 9, reason },
          { action: "remove", item: 1, reason },
          { action: "rewrite", item: 1, text: "Other", reason },
        ],
        ["A"],
      ),
    ).toEqual([{ action: "remove", index: 0, target: "A", reason }]);
  });

  it("drops text the list already has, whatever its case, and repeats in the answer", () => {
    expect(
      usableProposals(
        [
          { action: "add", text: " a ", reason },
          { action: "rewrite", item: 1, text: "B", reason },
          { action: "add", text: "New", reason },
          { action: "add", text: "new", reason },
        ],
        ["A", "B"],
      ),
    ).toEqual([{ action: "add", text: "New", reason }]);
  });

  it("places an addition: at the start, after an item, or at the end when unknown", () => {
    const placed = usableProposals(
      [
        { action: "add", text: "First", after: 0, reason },
        { action: "add", text: "Middle", after: 1, reason },
        { action: "add", text: "Lost", after: 7, reason },
        { action: "add", text: "Last", reason },
      ],
      ["A", "B"],
    );
    expect(placed.map((p) => (p.action === "add" ? p.position : null))).toEqual([
      "start",
      { index: 0, target: "A" },
      undefined,
      undefined,
    ]);
  });

  it("applies the clean-up to the text the model writes", () => {
    const strip = (s: string) => s.replace(/^Dado que /, "");
    expect(usableProposals([{ action: "add", text: "Dado que hay stock", reason }], [], strip)).toEqual([
      { action: "add", text: "hay stock", reason },
    ]);
  });
});

describe("listReviewSchema", () => {
  it("requires a reason, and tolerates a number written as text or a null position", () => {
    const parsed = listReviewSchema.parse({
      proposals: [
        { action: "remove", item: "2", reason },
        { action: "add", text: "New", after: null, reason },
      ],
    });
    expect(parsed.proposals[0]).toEqual({ action: "remove", item: 2, reason });
    expect(parsed.proposals[1]).toEqual({ action: "add", text: "New", after: null, reason });
    expect(listReviewSchema.safeParse({ proposals: [{ action: "remove", item: 1 }] }).success).toBe(false);
    expect(listReviewSchema.safeParse({ proposals: [{ action: "merge", item: 1, reason }] }).success).toBe(false);
  });
});

interface Row {
  id: string;
  text: string;
  expected?: string;
}
let created = 0;
const ops: ListProposalOps<Row> = {
  textOf: (r) => r.text,
  withText: (r, text) => ({ ...r, text }),
  create: (text) => ({ id: `new${++created}`, text }),
};
const rows = (): Row[] => [
  { id: "a", text: "A", expected: "kept" },
  { id: "b", text: "B" },
  { id: "c", text: "C" },
];
const rewrite = (index: number, target: string, text: string): ListProposal => ({
  action: "rewrite",
  index,
  target,
  text,
  reason,
});
const remove = (index: number, target: string): ListProposal => ({ action: "remove", index, target, reason });

describe("applyProposals", () => {
  it("rewords in place keeping the row's id and fields, and removes only what was accepted", () => {
    expect(applyProposals(rows(), [rewrite(0, "A", "A2"), remove(1, "B")], ops)).toEqual([
      { id: "a", text: "A2", expected: "kept" },
      { id: "c", text: "C" },
    ]);
  });

  it("nothing accepted leaves the same rows", () => {
    expect(applyProposals(rows(), [], ops)).toEqual(rows());
  });

  it("places additions, even after a row removed at the same time", () => {
    created = 0;
    const result = applyProposals(
      rows(),
      [
        { action: "add", text: "start", reason, position: "start" },
        { action: "add", text: "afterB", reason, position: { index: 1, target: "B" } },
        { action: "add", text: "end", reason },
        remove(1, "B"),
      ],
      ops,
    );
    expect(result.map((r) => r.text)).toEqual(["start", "A", "afterB", "C", "end"]);
  });

  it("finds a row the user moved, and skips one the user edited since the answer", () => {
    const moved = [rows()[2], rows()[0], rows()[1]];
    expect(applyProposals(moved, [remove(0, "A")], ops).map((r) => r.id)).toEqual(["c", "b"]);
    const edited = [{ id: "a", text: "A edited" }, rows()[1]];
    expect(applyProposals(edited, [rewrite(0, "A", "From the AI"), remove(0, "A")], ops)).toEqual(edited);
  });

  it("of two equal rows, removes the one the model pointed at", () => {
    const twins = [
      { id: "x", text: "Same" },
      { id: "y", text: "Other" },
      { id: "z", text: "Same" },
    ];
    expect(applyProposals(twins, [remove(2, "Same")], ops).map((r) => r.id)).toEqual(["x", "y"]);
  });

  it("drops blank rows, so the indexes match the list the model saw", () => {
    const withBlank = [{ id: "e", text: " " }, ...rows()];
    expect(applyProposals(withBlank, [remove(1, "B")], ops).map((r) => r.id)).toEqual(["a", "c"]);
  });
});
