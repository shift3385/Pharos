import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { LoadError } from "./LoadError";

describe("LoadError", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("announces the message and «Reintentar» calls back", async () => {
    const onRetry = vi.fn();
    renderWithProviders(<LoadError message="No se pudo cargar." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar.");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledOnce();
    await expectNoAxeViolations();
  });
});
