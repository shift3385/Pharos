// DAT-03 (ADR-0014): attachments live in the evidence store; the editor shows
// the 200 MB limit, uploads through plannerApi and saves through Rust.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import type { PlannerCard } from "../model/types";
import { CardEditor } from "./CardEditor";

const attachmentAdd = vi.fn();
const attachmentSave = vi.fn();
vi.mock("../api/plannerApi", () => ({
  MAX_ATTACHMENT_MB: 200,
  plannerApi: {
    attachmentList: () => Promise.resolve([{ id: "a1", name: "log.txt", mime: null, size: 2048 }]),
    attachmentAdd: (...a: unknown[]) => attachmentAdd(...a),
    attachmentSave: (...a: unknown[]) => attachmentSave(...a),
    attachmentDelete: vi.fn(),
  },
}));
const notify = vi.fn();
vi.mock("@shared/ui/notify", async (actual) => ({
  ...(await actual<typeof import("@shared/ui/notify")>()),
  notify: (...a: unknown[]) => notify(...a),
}));

const card: PlannerCard = {
  id: "k1",
  projectId: "p1",
  kind: "task",
  title: "Bug",
  status: "backlog",
  priority: "medium",
  position: 0,
  data: {},
  createdAt: "",
  updatedAt: "",
  revision: 1,
};

function editor(onClose: () => void = () => {}) {
  renderWithProviders(
    <CardEditor projectId="p1" ownerId="u1" card={card} initialStatus="backlog" onClose={onClose} />,
  );
}

describe("CardEditor unsaved changes (NC-016, MAN-03)", () => {
  it("leaves at once when nothing changed", async () => {
    const onClose = vi.fn();
    editor(onClose);
    await userEvent.click(screen.getByRole("button", { name: /Volver/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it("asks before throwing away a change, and stays on «Seguir editando»", async () => {
    const onClose = vi.fn();
    editor(onClose);
    await userEvent.type(screen.getByRole("textbox", { name: "Título" }), " urgente");
    await userEvent.click(screen.getByRole("button", { name: /Volver/ }));
    const ask = await screen.findByRole("alertdialog", { name: "¿Descartar los cambios?" });
    await userEvent.click(within(ask).getByRole("button", { name: "Seguir editando" }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Volver/ }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Descartar cambios" }));
    expect(onClose).toHaveBeenCalled();
  });
});

beforeEach(async () => {
  await i18n.changeLanguage("es");
  attachmentAdd.mockReset().mockResolvedValue(null);
  attachmentSave.mockReset();
  notify.mockReset();
});

describe("CardEditor attachments", () => {
  it("says the 200 MB limit next to the file input", async () => {
    editor();
    expect(await screen.findByText("Hasta 200 MB por archivo. Se guardan cifrados en este equipo.")).toBeInTheDocument();
  });

  it("«Adjuntar archivos» is a Pharos button that opens the hidden picker (NC-037)", async () => {
    editor();
    const pick = await screen.findByRole("button", { name: "Adjuntar archivos" });
    const input = document.querySelector<HTMLInputElement>(".pl-attach__input")!;
    expect(input).not.toBeVisible();
    const click = vi.spyOn(input, "click");
    await userEvent.click(pick);
    expect(click).toHaveBeenCalledOnce();
  });

  it("refuses a file over 200 MB before uploading anything, with a toast (NC-017)", async () => {
    editor();
    const big = new File(["x"], "video.mp4");
    Object.defineProperty(big, "size", { value: 200 * 1024 * 1024 + 1 });
    const input = document.querySelector<HTMLInputElement>(".pl-attach__input")!;
    await userEvent.upload(input, big);
    expect(notify).toHaveBeenCalledWith("«video.mp4» supera el límite de 200 MB.", "error");
    expect(attachmentAdd).not.toHaveBeenCalled();
  });

  it("uploads the file itself and saves through Rust", async () => {
    attachmentSave.mockResolvedValue({ path: "C:\\Descargas\\log.txt", fallback: false });
    editor();
    const input = document.querySelector<HTMLInputElement>(".pl-attach__input")!;
    const file = new File(["hola"], "nota.txt", { type: "text/plain" });
    await userEvent.upload(input, file);
    await waitFor(() => expect(attachmentAdd).toHaveBeenCalledWith("k1", "u1", file));
    await userEvent.click(await screen.findByRole("button", { name: /^📎 log\.txt$/u }));
    await waitFor(() => expect(attachmentSave).toHaveBeenCalledWith("a1", "u1"));
  });

  it("explains a file that is not on this device", async () => {
    attachmentSave.mockRejectedValue(new Error("evidence-missing: the file is not on this device"));
    editor();
    await userEvent.click(await screen.findByRole("button", { name: /^📎 log\.txt$/u }));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.stringContaining("Este archivo no está en este equipo"),
        "error",
      ),
    );
  });
});
