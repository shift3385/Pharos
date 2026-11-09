import { describe, expect, it } from "vitest";
import { criterionLines, criterionText, stepText } from "./stepText";

describe("stepText (NC-039)", () => {
  it("lowers articles, pronouns and infinitives", () => {
    expect(stepText("El usuario abre la pantalla")).toBe(
      "el usuario abre la pantalla",
    );
    expect(stepText("Se muestra la pantalla de login")).toBe(
      "se muestra la pantalla de login",
    );
    expect(stepText("Abrir la pantalla de entrada")).toBe(
      "abrir la pantalla de entrada",
    );
    expect(stepText("Existe un campo")).toBe("existe un campo");
    expect(stepText("The user signs in")).toBe("the user signs in");
    expect(stepText("Introduce el email válido")).toBe(
      "introduce el email válido",
    );
    expect(stepText("Pulsa «INGRESAR»")).toBe("pulsa «INGRESAR»");
  });

  it("keeps names, keys and acronyms", () => {
    expect(stepText("Pharos muestra el aviso")).toBe("Pharos muestra el aviso");
    expect(stepText("María abre la sesión")).toBe("María abre la sesión");
    expect(stepText("API devuelve 200")).toBe("API devuelve 200");
    expect(stepText("PH-001 está pasado")).toBe("PH-001 está pasado");
    expect(stepText('"Ingresar" está activo')).toBe('"Ingresar" está activo');
  });
});

describe("criterionLines", () => {
  it("splits one sentence into a line per keyword", () => {
    expect(
      criterionLines(
        'Given la pantalla de login, when se muestra, then existe un campo "Email / Usuario".',
      ),
    ).toEqual([
      { keyword: "Given", text: "la pantalla de login" },
      { keyword: "When", text: "se muestra" },
      { keyword: "Then", text: 'existe un campo "Email / Usuario".' },
    ]);
  });

  it("splits And and But only after a comma", () => {
    expect(
      criterionLines(
        "Given usuario and contraseña, when pulsa Ingresar, then entra, and ve su saldo",
      ),
    ).toEqual([
      { keyword: "Given", text: "usuario and contraseña" },
      { keyword: "When", text: "pulsa Ingresar" },
      { keyword: "Then", text: "entra" },
      { keyword: "And", text: "ve su saldo" },
    ]);
  });

  it("is null for a criterion that is not Gherkin", () => {
    expect(criterionLines("El botón está visible")).toBeNull();
    expect(criterionText("El botón está visible")).toBe(
      "El botón está visible",
    );
  });

  it("criterionText puts each keyword at the start of its line", () => {
    expect(
      criterionText("Given El campo vacío, When pulsa Ingresar, Then No entra"),
    ).toBe("Given el campo vacío\n  When pulsa Ingresar\n  Then no entra");
  });
});
