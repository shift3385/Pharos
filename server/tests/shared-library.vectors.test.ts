import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  derivedRowId,
  derivedStepId,
  materialize,
  normalizeShared,
  placeholders,
  substitute,
  type DatasetVersion,
  type Library,
  type SharedVersion,
} from "../src/modules/domain/shared-library";

// The copy of the library in a case (CAS-01, ADR-0055): the same vectors the
// desktop's `shared_library/tests.rs` checks.

const file = JSON.parse(
  readFileSync(
    new URL(
      "../../src-tauri/tests/fixtures/shared-steps-vectors.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

type Lib = { shared?: SharedVersion[]; datasets?: DatasetVersion[] };

function mem(lib: Lib): Library {
  const pick = <
    T extends { itemId: string; version: number; revisionId: string },
  >(
    all: T[] | undefined,
    itemId: string,
    revisionId?: string,
  ) => {
    const of = (all ?? [])
      .filter((v) => v.itemId === itemId)
      .sort((a, b) => a.version - b.version);
    return revisionId
      ? of.find((v) => v.revisionId === revisionId)
      : of[of.length - 1];
  };
  return {
    shared: (id, rev) => pick(lib.shared, id, rev),
    dataset: (id, rev) => pick(lib.datasets, id, rev),
  };
}

describe("shared steps vectors (the desktop checks the same file)", () => {
  for (const v of file.vectors) {
    it(v.name, () => {
      const data = structuredClone(v.data);
      if (v.error) {
        expect(() => materialize(v.caseId, data, mem(v.library))).toThrow(
          v.error,
        );
        return;
      }
      const out = materialize(v.caseId, data, mem(v.library));
      expect(data).toEqual(v.expected);
      expect(out.missing).toEqual(v.missing);
      expect(out.missingColumns).toEqual(v.missingColumns);
    });
  }

  it("derived ids", () => {
    for (const d of file.derivedIds) {
      const got =
        d.kind === "step"
          ? derivedStepId(d.caseId, d.refId, d.itemId)
          : derivedRowId(d.caseId, d.refId, d.itemId);
      expect(got).toBe(d.id);
    }
  });
});

describe("parameters", () => {
  it("follow the Outline syntax", () => {
    expect(
      placeholders("Escribo <usuario > y <clave> y <clave>, no < x> ni <>"),
    ).toEqual(["usuario", "clave"]);
    expect(
      substitute("<usuario>/<clave>/<otro>/< nada>", {
        usuario: "ana@acme.test",
        clave: "  ",
        otro: "<cliente>",
      }),
    ).toBe("ana@acme.test/<clave>/<cliente>/< nada>");
  });

  it("a shared step declares its placeholders with ids derived from their names", () => {
    const [a] = normalizeShared([], ["Escribo <usuario>"]);
    const [b] = normalizeShared([], ["Escribo <usuario> otra vez"]);
    expect(a).toEqual(b);
    expect(() => normalizeShared([], [])).toThrow("shared_library.no_steps");
  });
});
