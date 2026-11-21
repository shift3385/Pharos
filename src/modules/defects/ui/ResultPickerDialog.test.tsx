import { beforeEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { defectsApi } from "../api/defectsApi";
import { ResultPickerDialog } from "./ResultPickerDialog";

vi.mock("../api/defectsApi", () => ({ defectsApi: { results: vi.fn() } }));

const RESULT = {
  resultId: "r1",
  runId: "run1",
  runKey: "RUN-004",
  runTitle: "Smoke",
  testCaseId: "c1",
  caseKey: "ATS_001",
  testKey: "manual:c1/-/-",
  attempt: 2,
  status: "failed",
  createdAt: "2026-10-31 09:00:00",
};

describe("ResultPickerDialog when the results fail to load", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    vi.mocked(defectsApi.results).mockReset();
  });

  it("shows the error inside the dialog, and «Reintentar» loads them", async () => {
    vi.mocked(defectsApi.results).mockRejectedValueOnce(new Error("down"));
    renderWithProviders(
      <ResultPickerDialog projectId="p1" userId="u1" purpose="create" onPick={vi.fn()} onClose={vi.fn()} />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los resultados.");
    expect(screen.queryByText("Cargando…")).not.toBeInTheDocument();
    await expectNoAxeViolations();

    vi.mocked(defectsApi.results).mockResolvedValueOnce([RESULT] as never);
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("RUN-004")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ResultPickerDialog dates an attempt by when it ran (FIX-51)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    vi.mocked(defectsApi.results).mockReset();
  });

  it("shows the report's time of an imported attempt, not the import's", async () => {
    vi.mocked(defectsApi.results).mockResolvedValueOnce([
      { ...RESULT, createdAt: "2026-11-20 23:53:00", executedAt: "2026-11-16T18:10:00" },
    ] as never);
    renderWithProviders(
      <ResultPickerDialog projectId="p1" userId="u1" purpose="create" onPick={vi.fn()} onClose={vi.fn()} />,
    );
    const line = await screen.findByText(/intento 3 ·/);
    expect(line).toHaveTextContent("16 nov 2026");
    expect(line).not.toHaveTextContent("20 nov");
    expect(line).toHaveClass("df-picker__when");
  });
});
