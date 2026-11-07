import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { testPlanApi } from "../api/testPlanApi";
import { TestPlanPage } from "./TestPlanPage";

vi.mock("../api/testPlanApi", () => ({ testPlanApi: { byProject: vi.fn() } }));
vi.mock("./TestPlanWizard", () => ({
  TestPlanWizard: ({ planId }: { planId: string | null }) => <p>asistente {planId ?? "nuevo"}</p>,
}));

describe("TestPlanPage when the plan fails to load", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    vi.mocked(testPlanApi.byProject).mockReset();
  });

  it("shows the error, never the wizard that would create a second plan, and «Reintentar» loads it", async () => {
    vi.mocked(testPlanApi.byProject).mockRejectedValueOnce(new Error("down"));
    renderWithProviders(<TestPlanPage projectId="p1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el plan de pruebas.");
    expect(screen.queryByText(/asistente/)).not.toBeInTheDocument();
    expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();

    vi.mocked(testPlanApi.byProject).mockResolvedValueOnce({ id: "plan1" } as never);
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("asistente plan1")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
