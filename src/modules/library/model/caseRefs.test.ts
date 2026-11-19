import { describe, expect, it } from "vitest";
import {
  blockEdited,
  cleanArgs,
  impactSummary,
  joinSegments,
  missingColumns,
  newSharedRef,
  segmentsOf,
  withoutRef,
} from "./caseRefs";
import { libraryErrorCode } from "./errors";
import { paramRows } from "./sharedStep";
import { placeholdersOf, type LibraryItem, type SharedRef } from "./types";

const s = (id: string, text = id) => ({ id, text });
const ref = (
  id: string,
  stepIds: string[],
  list: SharedRef["list"] = "steps",
): SharedRef => ({
  id,
  sharedStepId: `item-${id}`,
  version: 1,
  follow: true,
  list,
  stepIds,
  args: {},
  name: `Item ${id}`,
});

describe("a case's step list with shared steps (boceto 4)", () => {
  it("splits own steps and blocks in order, ending with an own run", () => {
    const steps = [s("a"), s("x1"), s("x2"), s("b")];
    const segs = segmentsOf(steps, [ref("R", ["x1", "x2"])], "steps");
    expect(
      segs.map((g) => [g.kind, g.steps.map((x) => x.id), g.start]),
    ).toEqual([
      ["own", ["a"], 0],
      ["block", ["x1", "x2"], 1],
      ["own", ["b"], 3],
    ]);
  });

  it("adds an empty own run after a final block, and shows a call with no copy", () => {
    const segs = segmentsOf(
      [s("x1")],
      [ref("R", ["x1"]), ref("N", [])],
      "steps",
    );
    expect(segs.map((g) => g.kind)).toEqual(["block", "block", "own"]);
    expect(segs[1].steps).toEqual([]);
  });

  it("only takes the calls of its own list", () => {
    const segs = segmentsOf(
      [s("p1")],
      [ref("R", ["p1"], "preconditions")],
      "steps",
    );
    expect(segs.map((g) => g.kind)).toEqual(["own"]);
  });

  it("an edit of an own run keeps the blocks in place", () => {
    const steps = [s("a"), s("x1"), s("b")];
    const segs = segmentsOf(steps, [ref("R", ["x1"])], "steps");
    const next = joinSegments(segs, 2, [s("b", "edited"), s("c")]);
    expect(next.map((x) => x.text)).toEqual(["a", "x1", "edited", "c"]);
  });

  it("«Desvincular» keeps the copied steps: only the call goes", () => {
    const refs = [ref("R", ["x1"]), ref("S", ["y1"])];
    expect(withoutRef(refs, "R").map((r) => r.id)).toEqual(["S"]);
  });

  it("a new call follows the latest, has no copy yet and drops empty arguments", () => {
    const r = newSharedRef(
      [],
      { id: "item", name: "Login", version: 4 },
      { usuario: " ", clave: "x" },
      "preconditions",
    );
    expect(r).toMatchObject({
      sharedStepId: "item",
      version: 4,
      follow: true,
      list: "preconditions",
      stepIds: [],
      args: { clave: "x" },
    });
    expect(r.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(cleanArgs({ a: "", b: " v " })).toEqual({ b: "v" });
  });

  it("knows when a Gherkin edit touched a block", () => {
    const refs = [ref("R", ["x1"])];
    expect(
      blockEdited([s("a"), s("x1")], [s("a", "changed"), s("x1")], refs),
    ).toBe(false);
    expect(
      blockEdited([s("a"), s("x1")], [s("a"), s("x1", "changed")], refs),
    ).toBe(true);
    expect(blockEdited([s("a"), s("x1")], [s("a")], refs)).toBe(true);
  });
});

describe("impact notice (boceto 3)", () => {
  it("counts following cases by status and lists the pinned apart", () => {
    const c = (id: string, status: string, follow = true) => ({
      id,
      scenarioId: id,
      title: id,
      status,
      follow,
      version: 3,
    });
    const sum = impactSummary({
      cases: [
        c("1", "draft"),
        c("2", "approved"),
        c("3", "approved"),
        c("4", "reviewed"),
        c("5", "approved", false),
      ],
      byStatus: { draft: 1, approved: 2, reviewed: 1 },
    });
    expect(sum).toMatchObject({ draft: 1, reviewed: 1, approved: 2, total: 4 });
    expect(sum.pinned.map((x) => x.id)).toEqual(["5"]);
  });
});

describe("parameters and columns", () => {
  it("finds <params> as the core does", () => {
    expect(
      placeholdersOf(["escribo <usuario> y < no> y <clave >", "<usuario>"]),
    ).toEqual(["usuario", "clave"]);
  });

  it("lists the used parameters first and flags the unused ones", () => {
    const rows = paramRows({
      steps: [{ id: "1", text: "con <b>", expected: "ve <a>" }],
      params: [{ name: "a", default: "x" }, { name: "z" }],
    });
    expect(rows.map((r) => [r.name, r.unused, r.default])).toEqual([
      ["b", false, undefined],
      ["a", false, "x"],
      ["z", true, undefined],
    ]);
  });

  it("a parameter with no column is missing unless mapped", () => {
    const dataset = {
      definition: [
        { id: "c1", name: "usuario" },
        { id: "c2", name: "pass" },
      ],
    } as unknown as LibraryItem;
    const binding = { id: "case", datasetId: "d", follow: true };
    expect(missingColumns(["usuario", "clave"], binding, dataset)).toEqual([
      "clave",
    ]);
    expect(
      missingColumns(
        ["usuario", "clave"],
        { ...binding, columnMap: { clave: "pass" } },
        dataset,
      ),
    ).toEqual([]);
  });

  it("reads the error code of the desktop and of the web", () => {
    expect(libraryErrorCode("shared_library.in_use")).toBe("in_use");
    expect(
      libraryErrorCode({ code: "shared_library.too_many:rows", message: "x" }),
    ).toBe("too_many:rows");
    expect(libraryErrorCode(new Error("boom"))).toBeNull();
  });
});
