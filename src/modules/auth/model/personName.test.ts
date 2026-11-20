import { describe, expect, it } from "vitest";
import { aliasOf, officialName, personName } from "./personName";

const liomar = { displayName: "Liomar QA", firstName: "Liomar", lastName: "Rodríguez", email: "l@x" };

describe("personName (GLOSARIO: «Elaborado por / Autor», FIX-43)", () => {
  it("is the official first and last name, not the alias", () => {
    expect(personName(liomar)).toBe("Liomar Rodríguez");
    expect(officialName({ firstName: " Jorge L. ", lastName: "Meneses Yero" })).toBe("Jorge L. Meneses Yero");
  });
  it("falls back to the alias, then the email", () => {
    expect(personName({ displayName: "Liomar QA", firstName: " ", lastName: "" })).toBe("Liomar QA");
    expect(personName({ displayName: "", firstName: "", lastName: "", email: "jorge@x" })).toBe("jorge@x");
    expect(personName(null)).toBe("");
  });
  it("gives the alias as a second line only when it adds something", () => {
    expect(aliasOf(liomar)).toBe("Liomar QA");
    expect(aliasOf({ displayName: "Ana Pérez", firstName: "Ana", lastName: "Pérez" })).toBeNull();
    expect(aliasOf({ displayName: "Liomar QA" })).toBeNull();
  });
});
