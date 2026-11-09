import { describe, expect, it } from "vitest";
import { isLocked, missingFields } from "../src/login";

describe("acceso", () => {
  it("pide el usuario y la contraseña", () => {
    expect(missingFields({ user: "", password: "", rememberMe: false })).toEqual(["user", "password"]);
  });
  it("bloquea la cuenta al quinto intento fallido", () => {
    expect(isLocked(4)).toBe(false);
    expect(isLocked(5)).toBe(true);
  });
});
