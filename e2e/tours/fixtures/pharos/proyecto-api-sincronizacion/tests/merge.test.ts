import { describe, expect, it } from "vitest";
import { mergeFields } from "../src/merge";

describe("mergeFields", () => {
  const base = { title: "Importar resultados JUnit", priority: "Media" };

  it("combina dos cambios de campos distintos sin preguntar", () => {
    const r = mergeFields(base, { ...base, title: "Importar resultados JUnit y TRX" }, { ...base, priority: "Alta" });
    expect(r.conflicts).toEqual([]);
    expect(r.merged).toEqual({ title: "Importar resultados JUnit y TRX", priority: "Alta" });
  });

  it("pregunta solo por el campo que cambiaron los dos", () => {
    const r = mergeFields(base, { ...base, priority: "Baja" }, { ...base, priority: "Alta" });
    expect(r.conflicts).toEqual(["priority"]);
  });
});
