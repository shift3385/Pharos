import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, i18n } from "@test/utils";
import { FileInput } from "./FileInput";

describe("FileInput", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("says no file is chosen yet", () => {
    renderWithProviders(<FileInput aria-label="Informe" />);
    expect(screen.getByText("Elegir archivo…")).toBeInTheDocument();
    expect(screen.getByText("Ningún archivo elegido")).toBeInTheDocument();
  });

  it("a folder picker says no folder is chosen (FIX-51)", () => {
    renderWithProviders(<FileInput aria-label="Carpeta" folder />);
    expect(screen.getByText("Elegir carpeta…")).toBeInTheDocument();
    expect(screen.getByText("Ninguna carpeta elegida")).toBeInTheDocument();
    expect(screen.queryByText("Ningún archivo elegido")).toBeNull();
  });
});
