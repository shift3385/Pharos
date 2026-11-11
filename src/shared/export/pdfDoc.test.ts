import { describe, expect, it } from "vitest";
import {
  baseDoc,
  dataTable,
  field,
  fontSafe,
  keepHeadingsWithContent,
  lines,
  pdfBytes,
  SECTION_LEVEL,
  section,
  itemList,
  sectionHeader,
  type PageNode,
} from "./pdfDoc";

describe("pdfBytes", () => {
  it("renders a real PDF with the bundled fonts (EXP-02)", async () => {
    const bytes = await pdfBytes(baseDoc("Plan", [sectionHeader("Resumen"), field("Ñandú")]));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  }, 30_000);

  it("rejects when rendering takes longer than the timeout", async () => {
    const long = Array.from({ length: 400 }, (_, i) => field(`Línea ${i}`));
    await expect(pdfBytes(baseDoc("Plan", long), 1)).rejects.toThrow(/timed out/);
  }, 30_000);
});

describe("headings stay with their content (PLN-05)", () => {
  const bar = { headlineLevel: SECTION_LEVEL, startPosition: { verticalRatio: 0.95 } };
  const runningHeaderAndFooter: PageNode[] = [{}, {}, {}];

  it("breaks before a bar followed on the page only by headings", () => {
    expect(keepHeadingsWithContent(bar, [])).toBe(true);
    expect(
      keepHeadingsWithContent(bar, [{ style: "sectionBar" }, { style: "th" }, ...runningHeaderAndFooter]),
    ).toBe(true);
    for (const style of ["paragraph", "value", "td", "tdMuted"]) {
      expect(keepHeadingsWithContent(bar, [{ style: "sectionBar" }, { style }])).toBe(false);
    }
    // Not a bar, or a bar already at the top of its page: left alone.
    expect(keepHeadingsWithContent({ startPosition: { verticalRatio: 0.95 } }, [])).toBe(false);
    expect(keepHeadingsWithContent({ ...bar, startPosition: { verticalRatio: 0 } }, [])).toBe(false);
  });

  it("moves a bar that would end a page to the next one, with its content", async () => {
    let moved = 0;
    // Filler of every length that puts the bar near the foot of page 1.
    for (let n = 44; n <= 52; n += 1) {
      const filler = Array.from({ length: n }, (_, i) => ({ text: `Línea ${i}` }));
      const dd = baseDoc("Plan", [...filler, sectionHeader("Alcance"), field("Contenido")]);
      const fct = dd.pageBreakBefore as unknown as typeof keepHeadingsWithContent;
      const pass: Record<string, number> = {};
      (dd as { pageBreakBefore: unknown }).pageBreakBefore = (
        node: PageNode & { pageNumbers?: number[] },
        following: PageNode[],
      ) => {
        const page = node.pageNumbers?.[0] ?? 0;
        if (node.headlineLevel === SECTION_LEVEL) pass.bar = page;
        if (node.style === "paragraph") pass.text = page;
        const broke = fct(node, following);
        if (broke) {
          // pdfmake lays the document out again and does not ask about this
          // bar a second time: it now opens the next page.
          moved += 1;
          pass.bar = page + 1;
        }
        return broke;
      };
      await pdfBytes(dd);
      expect(pass.bar, `filler of ${n} lines`).toBe(pass.text);
    }
    expect(moved).toBeGreaterThan(0);
  }, 60_000);

  it("keeps a table's header row with its first data row", () => {
    const table = dataTable(["A", "B"], [["1", "2"]], "—") as { table: { keepWithHeaderRows?: number } };
    expect(table.table.keepWithHeaderRows).toBe(1);
  });
});

describe("text layout (PLN-05)", () => {
  it("justifies each line of a field as a paragraph of its own", () => {
    const f = field("Primera línea\n\nSegunda línea\r\nTercera") as { stack: { text: string; style?: string }[] };
    expect(f.stack.map((p) => p.text)).toEqual(["Primera línea", " ", "Segunda línea", "Tercera"]);
    expect(baseDoc("Plan", []).styles?.paragraph).toMatchObject({ alignment: "justify" });
  });

  it("prints one entry per line, not justified", () => {
    const l = lines(["Ágil", " ", "Duración de sprint: 2 semanas"]) as { stack: { text: string }[] };
    expect(l.stack).toEqual([
      { text: "Ágil", style: "value" },
      { text: "Duración de sprint: 2 semanas", style: "value" },
    ]);
    expect(lines([])).toEqual(field(""));
  });
});

describe("glyphs the bundled font lacks (PLN-05)", () => {
  it("swaps arrows for an en dash everywhere in the document", () => {
    expect(fontSafe("2026-11-09 → 2026-11-22")).toBe("2026-11-09 – 2026-11-22");
    const dd = baseDoc("Plan → PDF", [{ text: "a → b" }, dataTable(["R"], [["x → y"]], "—")]);
    const json = JSON.stringify(dd.content);
    expect(json).not.toContain("→");
    expect(json).toContain("x – y");
  });
});

describe("section keeps its bar with the start of its content (PLN-05)", () => {
  type Block = { stack?: unknown[]; unbreakable?: boolean; ul?: string[]; ol?: string[]; start?: number };

  it("puts the bar and the first paragraph of a field in one unbreakable block", () => {
    const [head, rest] = section("Resumen", field("Uno\n\nDos\nTres")) as Block[];
    expect(head.unbreakable).toBe(true);
    expect(JSON.stringify(head)).toContain("Resumen");
    expect(JSON.stringify(head)).toContain("Uno");
    expect(JSON.stringify(head)).not.toContain("Dos");
    expect(JSON.stringify(rest)).toContain("Dos");
    expect(JSON.stringify(rest)).toContain("Tres");
  });

  it("keeps a short list, a `lines` block or an empty field whole with the bar", () => {
    for (const body of [itemList(["a", "b", "c"]), lines(["Ágil", "Fases: x"]), field("")]) {
      const parts = section("S", body) as Block[];
      expect(parts).toHaveLength(1);
      expect(parts[0].unbreakable).toBe(true);
    }
  });

  it("takes the first items of a long list and numbers the rest on", () => {
    const [head, rest] = section("S", itemList(["1", "2", "3", "4", "5", "6"], true)) as Block[];
    expect((head.stack?.[1] as Block).ol).toEqual(["1", "2"]);
    expect(rest.ol).toEqual(["3", "4", "5", "6"]);
    expect(rest.start).toBe(3);
  });

  it("heads a table with the bar as one more header row", () => {
    const parts = section("Cronograma", dataTable(["Sprint", "Rango"], [["1", "a → b"]], "—")) as {
      table: { headerRows: number; keepWithHeaderRows: number; body: { text?: string; style?: string; colSpan?: number }[][] };
    }[];
    expect(parts).toHaveLength(1);
    const { table } = parts[0];
    expect(table.headerRows).toBe(2);
    expect(table.keepWithHeaderRows).toBe(1);
    expect(table.body[0][0]).toMatchObject({ text: "Cronograma", style: "sectionBar", colSpan: 2 });
    expect(table.body[1][0]).toMatchObject({ text: "Sprint", style: "th" });
  });

  it("renders a document built from sections", async () => {
    const bytes = await pdfBytes(
      baseDoc("Plan", [
        ...section("Resumen", field("Uno\n\nDos")),
        ...section("Lista", itemList(["a", "b", "c", "d", "e"])),
        ...section("Tabla", dataTable(["A", "B"], [["1", "2"]], "—")),
      ]),
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  }, 30_000);
});
