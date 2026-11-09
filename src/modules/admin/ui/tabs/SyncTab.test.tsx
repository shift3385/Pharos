import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { SYNC_SETTINGS_EVENT, loadSettings } from "../../model/settings";
import { SyncTab } from "./SyncTab";

describe("Administración › Sincronización (NC-025)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    localStorage.clear();
  });

  it("starts off, with no interval selector; turning it on shows it with 5 min chosen", async () => {
    const user = userEvent.setup();
    let told = 0;
    window.addEventListener(SYNC_SETTINGS_EVENT, () => told++);
    renderWithProviders(<SyncTab />);
    const auto = screen.getByRole("switch", { name: "Sincronización automática" });
    expect(auto).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("radiogroup", { name: "Cada" })).not.toBeInTheDocument();
    // Manual sync is always there.
    expect(screen.getByRole("button", { name: /Sincronizar ahora/ })).toBeInTheDocument();

    await user.click(auto);
    expect(loadSettings().autoSync).toBe(true);
    expect(screen.getByRole("radiogroup", { name: "Cada" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "5 min" })).toHaveAttribute("aria-checked", "true");
    await expectNoAxeViolations();

    await user.click(screen.getByRole("radio", { name: "15 min" }));
    expect(loadSettings().autoSyncMinutes).toBe(15);
    await user.click(auto);
    expect(loadSettings().autoSync).toBe(false);
    expect(screen.queryByRole("radiogroup", { name: "Cada" })).not.toBeInTheDocument();
    expect(told).toBe(3);
  });
});
