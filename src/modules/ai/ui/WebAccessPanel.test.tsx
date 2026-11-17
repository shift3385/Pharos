// «Usar esta clave también en la web» (IA-12, ADR-0034): off by default, the
// key leaves only after an explicit consent, turning it off deletes the copy,
// and the web shows what it uses without being able to change it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";

const OFF = { available: true, enabled: false, provider: null, model: null, updatedAt: null, needsReupload: false };
const ON = { ...OFF, enabled: true, provider: "anthropic", model: "claude-opus-5-5", updatedAt: "2026-11-17T10:42:00.000Z" };

const m = vi.hoisted(() => ({
  fetch: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(async () => {}),
  keySet: vi.fn(async () => true),
}));
vi.mock("../api/webAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/webAccess")>()),
  fetchWebAccess: m.fetch,
  uploadWebAccess: m.upload,
  removeWebAccess: m.remove,
}));
vi.mock("../api/aiApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/aiApi")>()),
  aiKeys: { status: m.keySet, set: async () => {}, clear: async () => {} },
}));
vi.mock("@shared/platform/serverUrl", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/platform/serverUrl")>()),
  getServer: async () => ({ origin: "https://pharos.miempresa.com", local: false, recent: [] }),
}));

const { WebAccessSummary, WebAccessSwitch } = await import("./WebAccessPanel");

beforeEach(async () => {
  await i18n.changeLanguage("es");
  m.fetch.mockReset();
  m.upload.mockReset();
  m.remove.mockClear();
  m.keySet.mockReset();
  m.keySet.mockResolvedValue(true);
});

const theSwitch = () => screen.getByRole("switch", { name: "Usar esta clave también en la web" });

describe("WebAccessSwitch (desktop)", () => {
  it("is off by default and uploads only after the consent is ticked", async () => {
    const user = userEvent.setup();
    m.fetch.mockResolvedValue(OFF);
    m.upload.mockResolvedValue(ON);
    renderWithProviders(<WebAccessSwitch provider="anthropic" model="claude-opus-5-5" refresh={0} />);
    await waitFor(() => expect(theSwitch()).toBeEnabled());
    expect(theSwitch()).toHaveAttribute("aria-checked", "false");

    await user.click(theSwitch());
    const dialog = await screen.findByRole("dialog", { name: "¿Usar tu clave de Claude en la web?" });
    expect(dialog).toHaveTextContent("pharos.miempresa.com");
    expect(dialog).toHaveTextContent("podría leerla");
    await expectNoAxeViolations(dialog);
    const upload = screen.getByRole("button", { name: "Subir la clave" });
    expect(upload).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    await user.click(upload);
    expect(m.upload).toHaveBeenCalledWith("anthropic", "claude-opus-5-5");
    await waitFor(() => expect(theSwitch()).toHaveAttribute("aria-checked", "true"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancelling the consent uploads nothing", async () => {
    const user = userEvent.setup();
    m.fetch.mockResolvedValue(OFF);
    renderWithProviders(<WebAccessSwitch provider="openai" model="gpt-5" refresh={0} />);
    await waitFor(() => expect(theSwitch()).toBeEnabled());
    await user.click(theSwitch());
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(m.upload).not.toHaveBeenCalled();
    expect(theSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("a refusal stays in the dialog and the switch stays off", async () => {
    const user = userEvent.setup();
    m.fetch.mockResolvedValue(OFF);
    const { WebAccessError } = await import("../api/webAccess");
    m.upload.mockRejectedValue(new WebAccessError("rate_limited"));
    renderWithProviders(<WebAccessSwitch provider="openai" model="gpt-5" refresh={0} />);
    await waitFor(() => expect(theSwitch()).toBeEnabled());
    await user.click(theSwitch());
    await user.click(await screen.findByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Subir la clave" }));
    expect(await screen.findByText(/muchas peticiones/)).toBeInTheDocument();
    expect(theSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("says why it cannot be turned on", async () => {
    m.fetch.mockResolvedValue(OFF);
    const { unmount } = renderWithProviders(<WebAccessSwitch provider="custom" model="m" refresh={0} />);
    expect(await screen.findByText(/No está disponible con «Compatible»/)).toBeInTheDocument();
    expect(theSwitch()).toBeDisabled();
    unmount();

    m.fetch.mockResolvedValue({ ...OFF, available: false });
    renderWithProviders(<WebAccessSwitch provider="openai" model="gpt-5" refresh={1} />);
    expect(await screen.findByText(/AI_VAULT_KEY/)).toBeInTheDocument();
    expect(theSwitch()).toBeDisabled();
  });

  it("turning it off asks, then deletes the copy", async () => {
    const user = userEvent.setup();
    m.fetch.mockResolvedValue(ON);
    renderWithProviders(<WebAccessSwitch provider="anthropic" model="claude-opus-5-5" refresh={0} />);
    await waitFor(() => expect(theSwitch()).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByText("pharos.miempresa.com")).toBeInTheDocument();
    await user.click(theSwitch());
    await user.click(await screen.findByRole("button", { name: "Borrar la copia" }));
    expect(m.remove).toHaveBeenCalledOnce();
    await waitFor(() => expect(theSwitch()).toHaveAttribute("aria-checked", "false"));
  });

  it("a new model asks before the web uses it", async () => {
    const user = userEvent.setup();
    m.fetch.mockResolvedValue(ON);
    m.upload.mockResolvedValue({ ...ON, model: "claude-sonnet-5-5" });
    renderWithProviders(<WebAccessSwitch provider="anthropic" model="claude-sonnet-5-5" refresh={0} />);
    expect(await screen.findByText(/La web sigue con claude-opus-5-5/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Usar el nuevo modelo en la web" }));
    expect(m.upload).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Usar en la web" }));
    expect(m.upload).toHaveBeenCalledWith("anthropic", "claude-sonnet-5-5");
  });

  it("another provider asks for the consent again", async () => {
    const user = userEvent.setup();
    m.fetch.mockResolvedValue(ON);
    renderWithProviders(<WebAccessSwitch provider="openai" model="gpt-5" refresh={0} />);
    await user.click(await screen.findByRole("button", { name: "Usar OpenAI en la web" }));
    expect(await screen.findByRole("dialog", { name: "¿Usar tu clave de OpenAI en la web?" })).toBeInTheDocument();
  });
});

describe("WebAccessSummary (web)", () => {
  it("shows what the web uses, read-only, and can stop using it", async () => {
    const user = userEvent.setup();
    m.fetch.mockResolvedValue(ON);
    const { container } = renderWithProviders(<WebAccessSummary />);
    expect(await screen.findByText("IA disponible")).toBeInTheDocument();
    expect(screen.getByText("claude-opus-5-5")).toBeInTheDocument();
    expect(screen.getByText(/hazlo en Pharos de escritorio/)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Dejar de usarla en la web" }));
    await user.click(await screen.findByRole("button", { name: "Borrar la copia" }));
    expect(m.remove).toHaveBeenCalledOnce();
    expect(await screen.findByText("IA en línea no activada")).toBeInTheDocument();
  });

  it("explains each state without a usable key", async () => {
    for (const [state, text] of [
      [OFF, /activa Ajustes › Motor de IA/],
      [{ ...OFF, available: false }, /no tiene activada la IA en la web/],
      [{ ...ON, needsReupload: true }, /Vuelve a subirla desde el escritorio/],
    ] as const) {
      m.fetch.mockResolvedValue(state);
      const { unmount } = renderWithProviders(<WebAccessSummary />);
      expect(await screen.findByText(text)).toBeInTheDocument();
      unmount();
    }
  });
});
