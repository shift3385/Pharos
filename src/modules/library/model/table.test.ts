import { describe, expect, it } from "vitest";
import {
  addColumn,
  addRow,
  detectDelimiter,
  matrixOf,
  parseClipboardTable,
  parseCsv,
  parseDelimited,
  pasteAt,
  tableFromMatrix,
  tableIssues,
  toCsv,
} from "./table";

describe("CSV import (ADR-0055 §8)", () => {
  it("detects `;` (Excel in Spanish) and `,`", () => {
    expect(detectDelimiter("usuario;clave\nana;x")).toBe(";");
    expect(detectDelimiter("usuario,clave\nana,x")).toBe(",");
    // A delimiter inside quotes does not count.
    expect(detectDelimiter('"a;b;c",d,e\n')).toBe(",");
  });

  it("drops a UTF-8 BOM and keeps accents", () => {
    expect(parseCsv("﻿usuario;contraseña\nañá;x")).toEqual([
      ["usuario", "contraseña"],
      ["añá", "x"],
    ]);
  });

  it("reads quotes: escaped quotes, delimiters and line breaks inside", () => {
    expect(
      parseDelimited('a,b\n"x, y","he said ""hi"""\n"two\nlines",z\r\n', ","),
    ).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
      ["two\nlines", "z"],
    ]);
  });

  it("skips blank lines and keeps empty cells", () => {
    expect(parseCsv("a,b,c\n\n1,,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("exports with a BOM and quotes what needs them", () => {
    const csv = toCsv(
      [
        ["user", "note"],
        ["ana", "a;b"],
      ],
      ";",
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('user;note\r\nana;"a;b"\r\n');
    // Round trip.
    expect(parseCsv(csv)).toEqual([
      ["user", "note"],
      ["ana", "a;b"],
    ]);
  });
});

describe("paste from a spreadsheet", () => {
  it("reads tab-separated rows; a single value is not a table", () => {
    expect(parseClipboardTable("a\tb\r\n1\t2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseClipboardTable("just text")).toBeNull();
  });

  it("into an empty dataset the first row is the header", () => {
    const t = tableFromMatrix([
      ["usuario", "clave"],
      ["ana", "1"],
      ["luis", "2"],
    ]);
    expect(t.columns.map((c) => c.name)).toEqual(["usuario", "clave"]);
    expect(t.rows).toHaveLength(2);
    expect(matrixOf(t)).toEqual([
      ["usuario", "clave"],
      ["ana", "1"],
      ["luis", "2"],
    ]);
  });

  it("at a cell, fills from there and grows rows and columns", () => {
    const base = tableFromMatrix([["a"], ["1"]]);
    const next = pasteAt(
      base,
      [
        ["x", "y"],
        ["z", "w"],
      ],
      0,
      0,
      "col",
    );
    expect(matrixOf(next)).toEqual([
      ["a", "col 2"],
      ["x", "y"],
      ["z", "w"],
    ]);
    // The first row keeps its id.
    expect(next.rows[0].id).toBe(base.rows[0].id);
  });

  it("on the header, the first line renames the columns", () => {
    const base = tableFromMatrix([["a", "b"]]);
    const next = pasteAt(
      base,
      [
        ["u", "c"],
        ["ana", "1"],
      ],
      -1,
      0,
    );
    expect(matrixOf(next)).toEqual([
      ["u", "c"],
      ["ana", "1"],
    ]);
    expect(next.columns.map((c) => c.id)).toEqual(
      base.columns.map((c) => c.id),
    );
  });
});

describe("re-importing keeps ids", () => {
  it("columns by name and rows by position", () => {
    const first = tableFromMatrix([
      ["u", "c"],
      ["ana", "1"],
    ]);
    const again = tableFromMatrix(
      [
        ["c", "u", "new"],
        ["2", "ana", "x"],
        ["3", "luis", "y"],
      ],
      first,
    );
    expect(again.columns.find((c) => c.name === "u")?.id).toBe(
      first.columns.find((c) => c.name === "u")?.id,
    );
    expect(again.rows[0].id).toBe(first.rows[0].id);
    expect(new Set(again.rows.map((r) => r.id)).size).toBe(2);
  });

  it("names empty and repeated headers", () => {
    const t = tableFromMatrix([["", "a", "a"]], undefined, "columna");
    expect(t.columns.map((c) => c.name)).toEqual(["columna 1", "a", "a (2)"]);
  });
});

describe("limits (30 columns, 500 rows, 4 KB per cell)", () => {
  it("flags each problem", () => {
    const wide = tableFromMatrix([
      Array.from({ length: 31 }, (_, i) => `c${i}`),
    ]);
    expect(tableIssues(wide)).toContainEqual({
      kind: "tooManyColumns",
      max: 30,
    });
    let long = tableFromMatrix([["a"]]);
    for (let i = 0; i < 501; i++) long = addRow(long);
    expect(tableIssues(long)).toContainEqual({ kind: "tooManyRows", max: 500 });
    const big = tableFromMatrix([["a"], ["x".repeat(4097)]]);
    expect(tableIssues(big)).toContainEqual({
      kind: "cellTooLong",
      row: 1,
      column: "a",
    });
    const bad = tableFromMatrix([["a<b>"]]);
    expect(tableIssues(bad)).toContainEqual({
      kind: "badColumn",
      name: "a<b>",
    });
    expect(tableIssues({ columns: [], rows: [] })).toContainEqual({
      kind: "noColumns",
    });
    const ok = addColumn(tableFromMatrix([["a"], ["1"]]), "col");
    expect(tableIssues(ok)).toEqual([]);
  });
});
