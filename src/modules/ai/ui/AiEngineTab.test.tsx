// Administración → Motor de IA (SPEC §8, ADR-0031): parameters come from the
// capabilities table (unsupported ones locked with a reason), «Compatible»
// makes the temperature optional, reasoning is «Próximamente», and provider,
// model and parameters are a draft saved with «Guardar».
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { setViewportWidth } from "@test/viewport";

const api = vi.hoisted(() => ({
  status: vi.fn(async () => ({ onlineKeySet: true, online: true, ollamaReachable: false, ollamaModelReady: false })),
  chat: vi.fn(async () => "OK"),
}));
vi.mock("../api/aiApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/aiApi")>()),
  aiStatus: api.status,
  aiChat: api.chat,
}));

const { AiEngineTab } = await import("./AiEngineTab");
const { loadConfig } = await import("../api/aiApi");

beforeEach(async () => {
  await i18n.changeLanguage("es");
  localStorage.clear();
});

async function renderTab() {
  const user = userEvent.setup();
  const onDirty = vi.fn();
  renderWithProviders(<AiEngineTab onDirtyChange={onDirty} />);
  await screen.findByText("Conectado");
  return { user, onDirty };
}

describe("AiEngineTab", () => {
  it("Gemini 2.5 takes temperature; its reasoning level is locked as «Próximamente»", async () => {
    const { user } = await renderTab();
    const model = screen.getByRole("combobox", { name: "Modelo" });
    await user.clear(model);
    await user.type(model, "gemini-2.5-pro");
    expect(screen.getByRole("slider", { name: "Temperatura" })).toBeEnabled();
    const level = screen.getByRole("radiogroup", { name: "Nivel de razonamiento" });
    expect(level).toHaveAttribute("title", expect.stringContaining("Próximamente"));
    for (const radio of within(level).getAllByRole("radio")) expect(radio).toBeDisabled();
    // Never listed as accepted while it is not sent.
    expect(screen.getByText("Nivel de razonamiento", { selector: "li" })).toHaveAttribute("data-ok", "false");
  });

  it("Claude locks the temperature with the reason in title and text", async () => {
    const { user } = await renderTab();
    await user.click(screen.getByRole("radio", { name: /^Claude/ }));
    const slider = screen.getByRole("slider", { name: "Temperatura" });
    expect(slider).toBeDisabled();
    expect(slider).toHaveAttribute("title", expect.stringContaining("La API de Claude no admite"));
    expect(slider).toHaveAccessibleDescription(expect.stringContaining("no se envía"));
  });

  it("«Compatible» makes the temperature optional with «Enviar» and needs its URL to save", async () => {
    const { user } = await renderTab();
    await user.click(screen.getByRole("radio", { name: /^Compatible con OpenAI/ }));
    const slider = screen.getByRole("slider", { name: "Temperatura" });
    expect(slider).toBeDisabled();
    await user.click(screen.getByRole("switch", { name: "Enviar" }));
    expect(slider).toBeEnabled();

    await user.click(screen.getByTestId("ai-save"));
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(loadConfig().onlineProvider).toBe("gemini"); // nothing saved yet

    await user.type(screen.getByRole("textbox", { name: "URL base" }), "https://llm.example.com/v1");
    await user.click(screen.getByTestId("ai-save"));
    expect(loadConfig()).toMatchObject({ onlineProvider: "custom", customSendTemperature: true });
  });

  it("changes are a draft: dirty until «Guardar», and the test waits for it", async () => {
    const { user, onDirty } = await renderTab();
    const save = screen.getByTestId("ai-save");
    expect(save).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Solo local" }));
    expect(onDirty).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: /Probar conexión/ })).toHaveAttribute(
      "title",
      "Guarda los cambios para probarlos.",
    );
    await user.click(save);
    expect(loadConfig().mode).toBe("offline");
    expect(onDirty).toHaveBeenLastCalledWith(false);
  });

  it("«Probar conexión» shows how long the answer took", async () => {
    const { user } = await renderTab();
    await user.click(screen.getByRole("button", { name: /Probar conexión/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Respuesta en \d+ ms/));
  });

  it.each([390, 1440])("passes axe at %i px", async (width) => {
    setViewportWidth(width);
    await renderTab();
    await expectNoAxeViolations();
  });
});
