// The defect editor's links and evidence (MAN-03): asking before removing
// (NC-012), saying when a link fails (NC-013) and the «Adjuntar archivos»
// button (NC-037).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import type { Defect } from "../model/types";
import { DefectEditor } from "./DefectEditor";

const link = vi.fn();
const attachmentList = vi.fn();
const attachmentDelete = vi.fn();
const remove = vi.fn();
vi.mock("../api/defectsApi", () => ({
  MAX_ATTACHMENT_MB: 200,
  defectsApi: {
    link: (...a: unknown[]) => link(...a),
    attachmentList: (...a: unknown[]) => attachmentList(...a),
    attachmentDelete: (...a: unknown[]) => attachmentDelete(...a),
    remove: (...a: unknown[]) => remove(...a),
    results: () => Promise.resolve([]),
  },
}));
vi.mock("@modules/custom-fields", async (orig) => ({
  ...(await orig<typeof import("@modules/custom-fields")>()),
  customFieldApi: { list: async () => [] },
}));
vi.mock("@shared/platform", async (orig) => {
  const real = await orig<typeof import("@shared/platform")>();
  return { ...real, capabilities: { ...real.capabilities, results: () => true, attachments: () => true } };
});
const notify = vi.fn();
vi.mock("@shared/ui/notify", async (orig) => ({
  ...(await orig<typeof import("@shared/ui/notify")>()),
  notify: (...a: unknown[]) => notify(...a),
}));

const DEFECT: Defect = {
  id: "d1",
  projectId: "p1",
  defectKey: "DEF-001",
  title: "Entrar falla con el correo en mayúsculas",
  description: "",
  stepsToReproduce: "",
  expected: null,
  actual: null,
  severity: "major",
  priority: "high",
  status: "open",
  resolution: null,
  foundInRunId: null,
  foundInBuild: "0.3.0-rc1",
  foundInEnvironment: null,
  fixedInBuild: null,
  reporter: "u1",
  assignee: null,
  externalSystem: null,
  externalKey: null,
  externalUrl: null,
  externalSyncedAt: null,
  data: {},
  createdAt: "2026-11-03 10:00:00",
  updatedAt: "2026-11-03 10:00:00",
  revision: 1,
  links: [{ targetKind: "result", targetId: "r1", label: "RUN-001 · PH-001" }],
  caseIds: [],
} as unknown as Defect;

const render = () =>
  renderWithProviders(<DefectEditor projectId="p1" userId="u1" defect={DEFECT} onClose={vi.fn()} />);

beforeEach(async () => {
  await i18n.changeLanguage("es");
  vi.clearAllMocks();
  link.mockResolvedValue({ ...DEFECT, links: [] });
  attachmentList.mockResolvedValue([{ id: "a1", name: "captura-fallo-acceso.png", size: 2048, purged: false }]);
  attachmentDelete.mockResolvedValue(undefined);
  remove.mockResolvedValue(undefined);
});

describe("DefectEditor · links and evidence (MAN-03)", () => {
  it("explains severity right under its own field (NC-051)", async () => {
    render();
    const severity = await screen.findByRole("combobox", { name: /Severidad/ });
    expect(severity).toHaveAccessibleDescription("Impacto en el sistema. La prioridad es la urgencia del arreglo.");
    expect(severity.closest("label")).toHaveTextContent("Impacto en el sistema");
  });

  it("asks before unlinking a result; Escape keeps it (NC-012)", async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: "Quitar el vínculo con RUN-001 · PH-001" }));
    expect(await screen.findByRole("alertdialog", { name: "¿Quitar el vínculo?" })).toHaveTextContent("RUN-001 · PH-001");
    await user.keyboard("{Escape}");
    expect(link).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Quitar el vínculo con RUN-001 · PH-001" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Quitar el vínculo" }));
    await waitFor(() => expect(link).toHaveBeenCalledWith("d1", "u1", { targetKind: "result", targetId: "r1" }, false));
  });

  it("says when unlinking fails, and keeps the link (NC-013)", async () => {
    const user = userEvent.setup();
    link.mockRejectedValue(new Error("db"));
    render();
    await user.click(await screen.findByRole("button", { name: "Quitar el vínculo con RUN-001 · PH-001" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Quitar el vínculo" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("No se pudo quitar el vínculo. Inténtalo de nuevo.", "error"));
    expect(screen.getByRole("button", { name: "Quitar el vínculo con RUN-001 · PH-001" })).toBeInTheDocument();
  });

  it("removing an evidence is critical: Escape does not answer (NC-012)", async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: "Quitar: captura-fallo-acceso.png" }));
    const ask = await screen.findByRole("alertdialog", { name: "¿Quitar esta evidencia?" });
    await user.keyboard("{Escape}");
    expect(ask).toBeInTheDocument();
    await user.click(within(ask).getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(attachmentDelete).toHaveBeenCalledWith("a1", "u1"));
  });

  it("deletes the defect from its editor after a critical confirmation, and goes back (NC-015)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<DefectEditor projectId="p1" userId="u1" defect={DEFECT} onClose={onClose} />);
    await user.click(await screen.findByRole("button", { name: "Eliminar defecto" }));
    const ask = await screen.findByRole("alertdialog", { name: "¿Eliminar el defecto?" });
    expect(ask).toHaveTextContent("DEF-001 Entrar falla con el correo en mayúsculas");
    await user.keyboard("{Escape}");
    expect(ask).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    await user.click(within(ask).getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("d1", "u1"));
    expect(onClose).toHaveBeenCalled();
  });

  it("a new defect has nothing to delete yet (NC-015)", async () => {
    renderWithProviders(<DefectEditor projectId="p1" userId="u1" defect={null} onClose={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar defecto" })).not.toBeInTheDocument();
  });

  it("«Adjuntar archivos» is a Pharos button that opens the hidden picker (NC-037)", async () => {
    const user = userEvent.setup();
    render();
    const pick = await screen.findByRole("button", { name: "Adjuntar archivos" });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input).not.toBeVisible();
    const click = vi.spyOn(input, "click");
    await user.click(pick);
    expect(click).toHaveBeenCalledOnce();
  });
});
