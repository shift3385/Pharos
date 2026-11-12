import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { projectApi } from "../api/projectApi";
import type { Project } from "../model/types";
import { cellsPerBand } from "@shared/risk/bands";
import { RiskBandsCard } from "./RiskBandsCard";

vi.mock("../api/projectApi", () => ({
  projectApi: { update: vi.fn(async () => null) },
}));

const PROJECT: Project = {
  id: "p1",
  workspaceId: "w",
  ownerId: "test-user",
  name: "Portal",
  caseIdPrefix: "PCL-",
  caseIdDigits: 4,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  revision: 1,
};

beforeEach(async () => {
  await i18n.changeLanguage("es");
  vi.mocked(projectApi.update).mockClear();
});

describe("«Bandas de riesgo» in Ajustes del proyecto (TRZ-04)", () => {
  it("counts the 5×5 cells of each band", () => {
    expect(cellsPerBand({ low: 4, medium: 12 })).toEqual({ low: 8, medium: 11, high: 6 });
    expect(cellsPerBand({ low: 6, medium: 14 })).toEqual({ low: 12, medium: 7, high: 6 });
  });

  it("starts at 4 and 12, repaints the grid as one types and saves both thresholds", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    renderWithProviders(<RiskBandsCard project={PROJECT} onSaved={onSaved} />);
    const low = screen.getByRole("spinbutton", { name: /Bajo: hasta/ });
    const medium = screen.getByRole("spinbutton", { name: /Medio: hasta/ });
    expect(low).toHaveValue(4);
    expect(medium).toHaveValue(12);
    expect(screen.getByTestId("risk-band-high")).toHaveTextContent("13 a 25");
    // Nothing changed: nothing to save, and the defaults are already there.
    expect(screen.getByTestId("risk-bands-save")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restablecer (4 y 12)" })).toBeDisabled();

    await user.clear(low);
    await user.type(low, "6");
    await user.clear(medium);
    await user.type(medium, "14");
    expect(screen.getByTestId("risk-band-cells")).toHaveTextContent("12 celdas bajas, 7 medias y 6 altas");
    expect(screen.getByTestId("risk-band-high")).toHaveTextContent("15 a 25");
    await expectNoAxeViolations();
    await user.click(screen.getByTestId("risk-bands-save"));
    expect(projectApi.update).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ name: "Portal", riskBandLow: 6, riskBandMedium: 14 }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("explains a pair that leaves a band empty and does not save it", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RiskBandsCard project={{ ...PROJECT, riskBandLow: 6, riskBandMedium: 14 }} onSaved={() => {}} />,
    );
    const low = screen.getByRole("spinbutton", { name: /Bajo: hasta/ });
    await user.clear(low);
    await user.type(low, "15");
    expect(low).toHaveAccessibleDescription(/El bajo tiene que ser menor que el medio/);
    expect(screen.getByTestId("risk-bands-save")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Restablecer (4 y 12)" }));
    expect(low).toHaveValue(4);
    expect(screen.getByRole("spinbutton", { name: /Medio: hasta/ })).toHaveValue(12);
    expect(screen.getByTestId("risk-bands-save")).toBeEnabled();
  });
});
