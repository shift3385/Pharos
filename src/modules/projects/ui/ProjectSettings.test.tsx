import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import { projectApi } from "../api/projectApi";
import { deleteConfirmWord } from "../model/projectTable";
import type { Project } from "../model/types";
import { ProjectSettings } from "./ProjectSettings";

vi.mock("@modules/test-cases", () => ({ projectCaseCount: async () => 240 }));
vi.mock("@modules/test-plan", () => ({ projectHasPlan: async () => true }));
vi.mock("@modules/planner", () => ({ projectCardCount: async () => 12 }));
vi.mock("@modules/traceability", () => ({
  requirementApi: { list: async () => Array.from({ length: 48 }, (_, i) => ({ id: String(i) })) },
}));
vi.mock("../api/projectApi", () => ({
  projectApi: { update: vi.fn(async () => null), remove: vi.fn(async () => undefined), get: vi.fn() },
}));

const PROJECT: Project = {
  id: "p1",
  workspaceId: "w",
  ownerId: "test-user",
  name: "Portal Clientes v3",
  caseIdPrefix: "PCL-",
  caseIdDigits: 4,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  revision: 1,
};

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function renderSettings(project = PROJECT) {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/projects/:id/settings" element={<ProjectSettings project={project} onSaved={() => {}} />} />
        <Route path="/projects" element={<p>lista</p>} />
      </Routes>
      <Where />
    </>,
    { route: "/projects/p1/settings" },
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("es");
  vi.mocked(projectApi.update).mockClear();
  vi.mocked(projectApi.remove).mockClear();
});

describe("Ajustes del proyecto (SPEC §6/§8)", () => {
  it("previews the numbering and saves name, prefix and digits", async () => {
    setViewportWidth(1440);
    renderSettings();
    expect(screen.getByText("PCL-0001")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Dígitos del número"), "3");
    expect(screen.getByText("PCL-001")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(projectApi.update).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ name: "Portal Clientes v3", caseIdPrefix: "PCL-", caseIdDigits: 3 }),
    );
    await expectNoAxeViolations();
  });

  it("a blank name blocks saving and is explained", async () => {
    setViewportWidth(1440);
    renderSettings();
    await userEvent.clear(screen.getByRole("textbox", { name: /Nombre del proyecto/ }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(projectApi.update).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: /Nombre del proyecto/ })).toHaveAttribute("aria-invalid", "true");
  });

  it("deleting shows what is lost, needs the prefix typed and closes only with «Cancelar»", async () => {
    setViewportWidth(1440);
    renderSettings();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar proyecto" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Eliminar proyecto" });
    const loss = within(dialog).getByRole("list", { name: "Se eliminará" });
    expect(loss).toHaveTextContent("1 plan");
    expect(loss).toHaveTextContent("240 casos");
    expect(loss).toHaveTextContent("48 requisitos");
    expect(loss).toHaveTextContent("12 tarjetas");
    const confirm = within(dialog).getByRole("button", { name: "Sí, eliminar todo" });
    expect(confirm).toBeDisabled();
    await expectNoAxeViolations();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Escribe «PCL» para confirmar" }), "PCL");
    await userEvent.click(confirm);
    expect(projectApi.remove).toHaveBeenCalledWith("p1", "test-user");
    expect(await screen.findByText("lista")).toBeInTheDocument();
  });

  it("«Cancelar» closes the dialog without deleting", async () => {
    setViewportWidth(390);
    renderSettings();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar proyecto" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(projectApi.remove).not.toHaveBeenCalled();
  });

  it("the word to type is the prefix without its separator, or the name without a prefix", () => {
    expect(deleteConfirmWord({ name: "X", caseIdPrefix: "ATS_" })).toBe("ATS");
    expect(deleteConfirmWord({ name: " Mi proyecto ", caseIdPrefix: "" })).toBe("Mi proyecto");
  });
});
