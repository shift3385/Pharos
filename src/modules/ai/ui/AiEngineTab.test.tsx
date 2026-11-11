// Administración → Motor de IA (SPEC §8, ADR-0031): parameters come from the
// capabilities table (unsupported ones locked with a reason), «Compatible»
// makes the temperature optional, reasoning is «Próximamente», and provider,
// model and parameters are a draft saved with «Guardar».
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { setViewportWidth } from "@test/viewport";

const api = vi.hoisted(() => ({
  desktop: true,
  status: vi.fn(async () => ({ onlineKeySet: true, online: true, ollamaReachable: false, ollamaModelReady: false })),
  chat: vi.fn(async () => "OK"),
  testKey: vi.fn(async (): Promise<string> => "OK"),
  listModels: vi.fn(async (): Promise<string[]> => []),
  keySet: vi.fn(async () => {}),
  keyStored: vi.fn(async () => false),
}));
vi.mock("@shared/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/platform")>()),
  isTauri: () => api.desktop,
}));
vi.mock("../api/aiApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/aiApi")>()),
  aiStatus: api.status,
  aiChat: api.chat,
  aiTestKey: api.testKey,
  onlineConfigured: async (cfg: unknown) => (await (api.status as (c: unknown) => Promise<{ onlineKeySet: boolean }>)(cfg)).onlineKeySet,
  aiListModels: api.listModels,
  aiKeys: { set: api.keySet, status: api.keyStored, clear: async () => {} },
}));

const { AiEngineTab } = await import("./AiEngineTab");
const { loadConfig } = await import("../api/aiApi");

beforeEach(async () => {
  await i18n.changeLanguage("es");
  localStorage.clear();
  api.desktop = true;
  api.status.mockReset();
  api.status.mockResolvedValue({ onlineKeySet: true, online: true, ollamaReachable: false, ollamaModelReady: false });
  api.keySet.mockClear();
  api.chat.mockClear();
  api.testKey.mockReset();
  api.testKey.mockResolvedValue("OK");
  api.keyStored.mockReset();
  api.keyStored.mockResolvedValue(false);
  vi.restoreAllMocks();
});

const testButton = () => screen.getByRole("button", { name: /Probar conexión/ });
/** The card or section that carries the «En uso» mark. */
const inUseCard = async () => (await screen.findByTestId("ai-in-use")).closest("label, h2");

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
    for (const radio of within(level).getAllByRole("radio")) {
      expect(radio).toBeDisabled();
      expect(radio).toHaveAttribute("title", expect.stringContaining("Próximamente"));
    }
    // Never listed as accepted while it is not sent.
    const chips = screen.getByText("Parámetros que admite este modelo:").nextElementSibling as HTMLElement;
    expect(within(chips).getByText("Nivel de razonamiento").closest(".pill")).toHaveAttribute("data-tone", "neutral");
    expect(within(chips).getByText("Temperatura").closest(".pill")).toHaveAttribute("data-tone", "success");
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
    await user.click(screen.getByRole("radio", { name: /^Compatible/ }));
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
    expect(await screen.findByText(/Respuesta en \d+ ms/)).toBeInTheDocument();
  });

  it("a typed key is unsaved work: «Guardar» stores it with the rest", async () => {
    const { user, onDirty } = await renderTab();
    await user.type(screen.getByLabelText(/Clave de API/), "sk-test");
    expect(onDirty).toHaveBeenLastCalledWith(true);
    expect(screen.getByTestId("ai-save")).toBeEnabled();
    const model = screen.getByRole("combobox", { name: "Modelo" });
    await user.clear(model);
    await user.type(model, "gemini-2.5-pro");
    await user.click(screen.getByTestId("ai-save"));
    await waitFor(() => expect(api.keySet).toHaveBeenCalledWith("gemini", "sk-test"));
    expect(loadConfig().onlineModels.gemini).toBe("gemini-2.5-pro");
    expect(screen.getByLabelText(/Clave de API/)).toHaveValue("");
    expect(onDirty).toHaveBeenLastCalledWith(false);
  });

  it("changing provider with a typed key asks first and can keep it", async () => {
    const { user } = await renderTab();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.type(screen.getByLabelText(/Clave de API/), "sk-test");
    await user.click(screen.getByRole("radio", { name: /^OpenAI/ }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("radio", { name: /^Gemini/ })).toBeChecked();
    expect(screen.getByLabelText(/Clave de API/)).toHaveValue("sk-test");
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("radio", { name: /^OpenAI/ }));
    expect(screen.getByRole("radio", { name: /^OpenAI/ })).toBeChecked();
    expect(screen.getByLabelText(/Clave de API/)).toHaveValue("");
    expect(api.keySet).not.toHaveBeenCalled();
  });

  it("«Guardar clave» makes its provider the active one, so it can be tested", async () => {
    const { user, onDirty } = await renderTab();
    await user.click(screen.getByRole("radio", { name: /^Claude/ }));
    await user.type(screen.getByLabelText(/Clave de API/), "sk-ant-test");
    await user.click(screen.getByRole("button", { name: "Guardar clave" }));

    await waitFor(() => expect(api.keySet).toHaveBeenCalledWith("anthropic", "sk-ant-test"));
    await waitFor(() => expect(loadConfig().onlineProvider).toBe("anthropic"));
    await waitFor(async () => expect(await inUseCard()).toHaveTextContent("Claude"));
    expect(onDirty).toHaveBeenLastCalledWith(false);
    expect(testButton()).toBeEnabled();
    await user.click(testButton());
    expect(api.chat).toHaveBeenCalledOnce();
    expect(await screen.findByText(/Respuesta en \d+ ms/)).toBeInTheDocument();
  });

  it("«Guardar clave» leaves the rest of the draft waiting for «Guardar»", async () => {
    const { user } = await renderTab();
    await user.click(screen.getByRole("radio", { name: /^Claude/ }));
    const model = screen.getByRole("combobox", { name: "Modelo" });
    await user.clear(model);
    await user.type(model, "claude-sonnet-5-5");
    await user.type(screen.getByLabelText(/Clave de API/), "sk-ant-test");
    await user.click(screen.getByRole("button", { name: "Guardar clave" }));

    await waitFor(() => expect(loadConfig().onlineProvider).toBe("anthropic"));
    expect(loadConfig().onlineModels.anthropic).toBe("claude-opus-5-5");
    expect(screen.getByTestId("ai-save")).toBeEnabled();
    expect(model).toHaveValue("claude-sonnet-5-5");
    expect(await screen.findByText("Guarda los cambios para probarlos.")).toBeInTheDocument();
  });

  it("«Compatible» saves its key only with its URL, and then both", async () => {
    const { user } = await renderTab();
    await user.click(screen.getByRole("radio", { name: /^Compatible/ }));
    await user.type(screen.getByLabelText(/Clave de API/), "k");
    await user.click(screen.getByRole("button", { name: "Guardar clave" }));
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(api.keySet).not.toHaveBeenCalled();
    expect(loadConfig().onlineProvider).toBe("gemini");

    await user.type(screen.getByRole("textbox", { name: "URL base" }), "https://llm.example.com/v1");
    await user.click(screen.getByRole("button", { name: "Guardar clave" }));
    await waitFor(() => expect(loadConfig()).toMatchObject({ onlineProvider: "custom", customBaseUrl: "https://llm.example.com/v1" }));
  });

  it("the save bar says what is pending, and that nothing is once saved or undone", async () => {
    const { user } = await renderTab();
    const bar = () => document.querySelector(".adm-savebar__state");
    expect(bar()).toHaveTextContent(/^Sin cambios$/);
    expect(screen.getByTestId("ai-save")).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /^Claude/ }));
    expect(bar()).toHaveTextContent("Por guardar: proveedor (Claude). Pulsa «Guardar» para aplicar los cambios.");
    await user.type(screen.getByLabelText(/Clave de API/), "sk-x");
    expect(bar()).toHaveTextContent("Por guardar: proveedor (Claude) y clave.");

    await user.clear(screen.getByLabelText(/Clave de API/));
    await user.click(screen.getByRole("radio", { name: /^Gemini/ }));
    expect(bar()).toHaveTextContent(/^Sin cambios$/);

    await user.click(screen.getByRole("radio", { name: /^Claude/ }));
    await user.click(screen.getByTestId("ai-save"));
    await waitFor(() => expect(bar()).toHaveTextContent(/^Sin cambios$/));
  });

  it("marks the card in use: it moves when saved, not when selected", async () => {
    const { user } = await renderTab();
    const mark = async (id: string) => within(screen.getByTestId(`ai-provider-${id}`)).findByRole("img", { name: "En uso" });
    await mark("gemini");
    await user.click(screen.getByRole("radio", { name: /^Claude/ }));
    await screen.findByText("Guarda los cambios para probarlos.");
    await mark("gemini");
    expect(within(screen.getByTestId("ai-provider-anthropic")).queryByRole("img", { name: "En uso" })).not.toBeInTheDocument();

    await user.click(screen.getByTestId("ai-save"));
    await mark("anthropic");
    expect(screen.getAllByTestId("ai-in-use")).toHaveLength(1);
  });

  it("marks Ollama when it is the one in use, and no online card", async () => {
    localStorage.setItem("pharos.ai.config", JSON.stringify({ mode: "offline" }));
    api.status.mockResolvedValue({ onlineKeySet: true, online: true, ollamaReachable: true, ollamaModelReady: true });
    await renderTab();
    expect(await inUseCard()).toHaveTextContent("Ollama");
  });

  describe("a provider without its key", () => {
    /** Gemini and Claude have a key; the rest do not. */
    function onlyTheseHaveKeys() {
      (api.status as unknown as { mockImplementation: (f: (c: { onlineProvider: string }) => unknown) => void }).mockImplementation(
        async (c) => ({
          onlineKeySet: ["gemini", "anthropic"].includes(c.onlineProvider),
          online: true,
          ollamaReachable: false,
          ollamaModelReady: false,
        }),
      );
    }

    it("cannot become the active one until its key is written", async () => {
      onlyTheseHaveKeys();
      const { user } = await renderTab();
      await user.click(screen.getByRole("radio", { name: /^OpenRouter/ }));

      const save = screen.getByTestId("ai-save");
      expect(await screen.findByText("Para usar OpenRouter, pega su clave de API.")).toBeInTheDocument();
      expect(save).toBeDisabled();
      expect(testButton()).toBeDisabled();
      expect(screen.getByText(/Falta la clave de OpenRouter/)).toBeInTheDocument();
      expect(loadConfig().onlineProvider).toBe("gemini");

      await user.type(screen.getByLabelText(/Clave de API/), "sk-or");
      expect(save).toBeEnabled();
      await user.type(screen.getByRole("combobox", { name: "Modelo" }), "vendor/model");
      await user.click(save);
      await waitFor(() => expect(api.keySet).toHaveBeenCalledWith("openrouter", "sk-or"));
      await waitFor(() => expect(loadConfig().onlineProvider).toBe("openrouter"));
    });

    it("does not stop switching between providers that have one", async () => {
      onlyTheseHaveKeys();
      const { user } = await renderTab();
      await user.click(screen.getByRole("radio", { name: /^Claude/ }));
      const save = screen.getByTestId("ai-save");
      await waitFor(() => expect(save).toBeEnabled());
      await user.click(save);
      await waitFor(() => expect(loadConfig().onlineProvider).toBe("anthropic"));
    });

    it("does not stop saving other settings of the active provider", async () => {
      api.status.mockResolvedValue({ onlineKeySet: false, online: true, ollamaReachable: false, ollamaModelReady: false });
      const user = userEvent.setup();
      renderWithProviders(<AiEngineTab />);
      await screen.findByText("Sin configurar");
      await user.click(screen.getByRole("radio", { name: "Solo local" }));
      await user.click(screen.getByTestId("ai-save"));
      expect(loadConfig().mode).toBe("offline");
    });

    it("«Compatible» needs its URL, not a key", async () => {
      onlyTheseHaveKeys();
      const { user } = await renderTab();
      await user.click(screen.getByRole("radio", { name: /^Compatible/ }));
      expect(screen.getByTestId("ai-save")).toBeEnabled();
      expect(screen.queryByText(/pega su clave/)).not.toBeInTheDocument();
    });
  });

  it("marks nothing when no AI is available", async () => {
    api.desktop = false;
    await renderTab();
    await new Promise((settled) => setTimeout(settled, 50));
    expect(screen.queryByTestId("ai-in-use")).not.toBeInTheDocument();
    expect(screen.queryByText(/^En uso/)).not.toBeInTheDocument();
  });

  it("tests a typed key with the form on screen, storing nothing", async () => {
    const { user } = await renderTab();
    await user.click(screen.getByRole("radio", { name: /^Claude/ }));
    await user.type(screen.getByLabelText(/Clave de API/), "sk-new");
    expect(testButton()).toBeEnabled();
    await user.click(testButton());

    expect(await screen.findByText(/Respuesta en \d+ ms/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar clave" })).toBeEnabled();
    expect(api.testKey).toHaveBeenCalledWith(
      expect.objectContaining({ onlineProvider: "anthropic" }),
      "sk-new",
      [expect.objectContaining({ role: "user" })],
    );
    expect(api.chat).not.toHaveBeenCalled();
    expect(api.keySet).not.toHaveBeenCalled();
    expect(loadConfig().onlineProvider).toBe("gemini");
    expect(screen.getByLabelText(/Clave de API/)).toHaveValue("sk-new");
  });

  it("shows it is working while the provider has not answered", async () => {
    let answer: (reply: string) => void = () => {};
    api.testKey.mockReturnValueOnce(new Promise<string>((resolve) => (answer = resolve)));
    const { user } = await renderTab();
    await user.type(screen.getByLabelText(/Clave de API/), "sk-a");
    await user.click(testButton());

    const busy = screen.getByRole("button", { name: /Probando/ });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy.querySelector(".ai-spin")).toBeInTheDocument();

    answer("OK");
    await screen.findByText(/Respuesta en \d+ ms/);
    expect(testButton()).toHaveAttribute("aria-busy", "false");
    expect(testButton().querySelector(".ai-spin")).not.toBeInTheDocument();
  });

  it("a typed key that fails says why and stays unsaved", async () => {
    api.testKey.mockRejectedValue("Incorrect API key");
    const { user } = await renderTab();
    await user.type(screen.getByLabelText(/Clave de API/), "sk-bad");
    await user.click(testButton());

    expect(await screen.findByText("El proveedor rechazó la clave: Incorrect API key")).toBeInTheDocument();
    expect(api.keySet).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Clave de API/)).toHaveValue("sk-bad");
  });

  it("«Listar modelos» opens every model found, and choosing one is a change to save", async () => {
    const found = Array.from({ length: 13 }, (_, i) => `gemini-${i}`);
    api.listModels.mockResolvedValueOnce(found);
    const { user, onDirty } = await renderTab();
    await user.click(screen.getByRole("button", { name: "Listar modelos" }));
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(13);
    await user.click(options[3]);
    expect(screen.getByRole("combobox", { name: "Modelo" })).toHaveValue("gemini-3");
    expect(onDirty).toHaveBeenLastCalledWith(true);
    expect(loadConfig().onlineModels.gemini).toBe("gemini-2.0-flash");
  });

  it("each provider's help is behind its [?], and asking for it does not choose the provider", async () => {
    const { user, onDirty } = await renderTab();
    const help = screen.getByRole("button", { name: /Claude/ });
    await user.click(help);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Modelos Claude de Anthropic. Consigue tu clave en console.anthropic.com/settings/keys");
    expect(screen.getByRole("radio", { name: /^Gemini/ })).toBeChecked();
    expect(onDirty).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("radio", { name: /^Claude/ })).toHaveAccessibleDescription(/console\.anthropic\.com/);
    // No key URL for an own endpoint, only what it is.
    expect(screen.getByRole("radio", { name: /^Compatible/ })).toHaveAccessibleDescription(/compatible con la API de OpenAI/);
  });

  it("a failure that is not about the key does not blame it", async () => {
    api.testKey.mockRejectedValue(new Error("The model `nope` does not exist"));
    const { user } = await renderTab();
    await user.type(screen.getByLabelText(/Clave de API/), "sk-ok");
    await user.click(testButton());
    expect(await screen.findByText(/Falló la conexión con la IA: The model `nope` does not exist/)).toBeInTheDocument();
  });

  it("with no key anywhere, says it is the key that is missing", async () => {
    api.status.mockResolvedValue({ onlineKeySet: false, online: true, ollamaReachable: false, ollamaModelReady: false });
    api.chat.mockRejectedValueOnce(new Error("no-provider"));
    const user = userEvent.setup();
    renderWithProviders(<AiEngineTab />);
    await screen.findByText("Sin configurar");
    await user.click(testButton());
    expect(await screen.findByText("Falta la clave de Gemini: escríbela arriba para probarla.")).toBeInTheDocument();
  });

  describe("on the web", () => {
    it("tests a typed key and shows why the provider rejected it", async () => {
      api.desktop = false;
      api.testKey.mockRejectedValue(new Error("API key not valid."));
      const { user } = await renderTab();
      await user.type(screen.getByLabelText(/Clave de API/), "asdasd");
      await user.click(testButton());
      expect(await screen.findByText("El proveedor rechazó la clave: API key not valid.")).toBeInTheDocument();
      expect(api.testKey).toHaveBeenCalledWith(expect.objectContaining({ onlineProvider: "gemini" }), "asdasd", expect.anything());
    });

    it("says the key is not saved, and never claims it was", async () => {
      api.desktop = false;
      const { user, onDirty } = await renderTab();
      await user.type(screen.getByLabelText(/Clave de API/), "asdasd");
      expect(screen.getByText("«Guardar clave» solo está disponible en la app de escritorio.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Guardar clave" })).toBeDisabled();
      expect(screen.getByTestId("ai-save")).toBeDisabled();
      expect(onDirty).toHaveBeenLastCalledWith(false);

      await user.click(screen.getByRole("radio", { name: /^Claude/ }));
      await user.click(screen.getByTestId("ai-save"));
      await waitFor(() => expect(loadConfig().onlineProvider).toBe("anthropic"));
      expect(api.keySet).not.toHaveBeenCalled();
    });
  });

  it("a late answer about a key that changed meanwhile is dropped", async () => {
    let answer: (reply: string) => void = () => {};
    api.testKey.mockReturnValueOnce(new Promise<string>((resolve) => (answer = resolve)));
    const { user } = await renderTab();
    await user.type(screen.getByLabelText(/Clave de API/), "sk-a");
    await user.click(testButton());
    await user.type(screen.getByLabelText(/Clave de API/), "b");
    answer("OK");
    await waitFor(() => expect(testButton()).toBeEnabled());
    expect(screen.queryByText(/Respuesta en \d+ ms/)).not.toBeInTheDocument();
  });

  it("says on screen why a typed key cannot be tested yet", async () => {
    const { user } = await renderTab();
    await user.click(screen.getByRole("radio", { name: /^OpenAI/ }));
    await user.type(screen.getByLabelText(/Clave de API/), "sk-x");
    expect(testButton()).toBeDisabled();
    expect(screen.getByText(/Escribe un modelo para probar la clave/)).toBeInTheDocument();

    vi.spyOn(window, "confirm").mockReturnValue(true); // Discards the typed key.
    await user.click(screen.getByRole("radio", { name: /^Compatible/ }));
    await user.type(screen.getByLabelText(/Clave de API/), "k");
    expect(screen.getByText("Escribe la URL base para probar la clave.")).toBeInTheDocument();
  });

  it.each([
    ["Guardar clave", () => screen.getByRole("button", { name: "Guardar clave" })],
    ["Guardar", () => screen.getByTestId("ai-save")],
  ])("«%s» asks before replacing a stored key that was not tested", async (_name, button) => {
    api.keyStored.mockResolvedValue(true);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user } = await renderTab();
    await user.type(screen.getByLabelText(/Clave de API/), "sk-new");
    await user.click(button());
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(api.keySet).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Clave de API/)).toHaveValue("sk-new");

    confirm.mockReturnValue(true);
    await user.click(button());
    await waitFor(() => expect(api.keySet).toHaveBeenCalledWith("gemini", "sk-new"));
  });

  it("a key that just answered replaces the stored one without asking; editing it asks again", async () => {
    api.keyStored.mockResolvedValue(true);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user } = await renderTab();
    const field = screen.getByLabelText(/Clave de API/);
    await user.type(field, "sk-new");
    await user.click(testButton());
    await screen.findByText(/Respuesta en \d+ ms/);

    await user.type(field, "2");
    await user.click(screen.getByRole("button", { name: "Guardar clave" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(api.keySet).not.toHaveBeenCalled();

    await user.click(testButton());
    await screen.findByText(/Respuesta en \d+ ms/);
    await user.click(screen.getByRole("button", { name: "Guardar clave" }));
    await waitFor(() => expect(api.keySet).toHaveBeenCalledWith("gemini", "sk-new2"));
    expect(confirm).toHaveBeenCalledOnce();
  });

  it.each([390, 1440])("passes axe at %i px", async (width) => {
    setViewportWidth(width);
    await renderTab();
    await expectNoAxeViolations();
  });
});
