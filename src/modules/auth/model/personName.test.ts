import { describe, expect, it } from "vitest";
import { personName } from "./personName";

describe("personName (FIX-41)", () => {
  it("is the display name the account chose", () => {
    expect(personName({ displayName: "Liomar QA", firstName: "Liomar", lastName: "Rodríguez", email: "l@x" })).toBe(
      "Liomar QA",
    );
  });
  it("falls back to the first and last name, then the email", () => {
    expect(personName({ displayName: " ", firstName: "Jorge L.", lastName: "Meneses Yero" })).toBe("Jorge L. Meneses Yero");
    expect(personName({ displayName: "", firstName: "", lastName: "", email: "jorge@x" })).toBe("jorge@x");
    expect(personName(null)).toBe("");
  });
});
