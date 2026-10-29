import { describe, expect, it } from "vitest";
import { baseDoc, field, pdfBytes, sectionHeader } from "./pdfDoc";

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
