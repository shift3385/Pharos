// Administración → General: the background previews while it is a draft, the save
// bar says what is pending, and the notice what was saved.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { GeneralTab } from "./GeneralTab";
import { loadSettings } from "../../model/settings";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@shared/ui/Toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/ui/Toast")>()),
  useToast: () => toast,
}));

const folder = vi.hoisted(() => ({
  pick: vi.fn(async () => ({ path: "D:\\Exports", custom: true, missing: false })),
}));
vi.mock("@shared/export/saveFile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/export/saveFile")>()),
  downloadDir: {
    available: () => true,
    get: async () => ({ path: "C:\\Downloads", custom: false, missing: false }),
    pick: folder.pick,
    reset: folder.pick,
  },
}));

const opacityVar = () => document.documentElement.style.getPropertyValue("--app-bg-opacity");
const bar = () => document.querySelector(".adm-savebar__state");
const slider = () => screen.getByRole("slider", { name: "Opacidad del fondo" });
const save = () => screen.getByRole("button", { name: "Guardar ajustes" });

beforeEach(async () => {
  await i18n.changeLanguage("es");
  localStorage.clear();
  toast.mockClear();
});

describe("GeneralTab", () => {
  it("starts at 40 % with nothing to save, and says what saves at once", async () => {
    renderWithProviders(<GeneralTab />);
    await screen.findByTestId("download-dir");
    expect(slider()).toHaveValue("40");
    expect(bar()).toHaveTextContent("Sin cambios. El tema, el idioma y la carpeta de descarga se guardan al momento.");
    expect(save()).toBeDisabled();
  });

  it("moving the opacity shows it at once, and only «Guardar ajustes» keeps it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralTab />);
    await waitFor(() => expect(opacityVar()).toBe("0.4"));

    fireEvent.change(slider(), { target: { value: "75" } });
    expect(opacityVar()).toBe("0.75");
    expect(loadSettings().backgroundOpacity).toBe(40);
    expect(bar()).toHaveTextContent("Por guardar: opacidad. Pulsa «Guardar ajustes» para aplicar los cambios.");

    await user.click(save());
    expect(loadSettings().backgroundOpacity).toBe(75);
    expect(opacityVar()).toBe("0.75");
    expect(toast).toHaveBeenCalledWith("Guardado: opacidad");
    expect(bar()).toHaveTextContent(/^Sin cambios/);
  });

  it("leaving without saving brings back what is saved", async () => {
    const { unmount } = renderWithProviders(<GeneralTab />);
    fireEvent.change(slider(), { target: { value: "90" } });
    expect(opacityVar()).toBe("0.9");
    unmount();
    expect(opacityVar()).toBe("0.4");
    expect(loadSettings().backgroundOpacity).toBe(40);
  });

  it("the card shadow is on by default, previews at once and only «Guardar ajustes» keeps it", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<GeneralTab />);
    const toggle = screen.getByRole("switch", { name: "Sombra en las tarjetas" });
    const root = document.documentElement;
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(root).toHaveAttribute("data-card-shadow"));

    await user.click(toggle);
    expect(root).not.toHaveAttribute("data-card-shadow");
    expect(loadSettings().cardShadow).toBe(true);
    expect(bar()).toHaveTextContent("Por guardar: sombra en las tarjetas.");

    unmount();
    expect(root).toHaveAttribute("data-card-shadow");

    renderWithProviders(<GeneralTab />);
    await user.click(screen.getByRole("switch", { name: "Sombra en las tarjetas" }));
    await user.click(save());
    expect(loadSettings().cardShadow).toBe(false);
    expect(root).not.toHaveAttribute("data-card-shadow");
    expect(toast).toHaveBeenCalledWith("Guardado: sombra en las tarjetas");
  });

  it("names every pending change, and undoing one drops it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralTab />);
    await user.click(screen.getByRole("button", { name: "Quitar" }));
    fireEvent.change(slider(), { target: { value: "50" } });
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "60" } });
    expect(bar()).toHaveTextContent("Por guardar: fondo, opacidad y retención.");

    await user.click(screen.getByRole("button", { name: "Usar el predeterminado" }));
    fireEvent.change(slider(), { target: { value: "40" } });
    expect(bar()).toHaveTextContent("Por guardar: retención.");
  });

  it("a removed background stays removed, and the default can come back", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralTab />);
    await user.click(screen.getByRole("button", { name: "Quitar" }));
    expect(document.documentElement.style.getPropertyValue("--app-bg-image")).toBe("none");
    await user.click(save());
    expect(loadSettings().backgroundImage).toBe("");
    expect(screen.queryByRole("button", { name: "Quitar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usar el predeterminado" })).toBeEnabled();
  });

  it("the download folder says it was saved, and where", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralTab />);
    await screen.findByText(/C:\\Downloads/);
    await user.click(screen.getByRole("button", { name: /Elegir carpeta/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Carpeta de descarga guardada: D:\\Exports"));
    expect(bar()).toHaveTextContent("Carpeta de descarga guardada.");
    expect(save()).toBeDisabled();
  });
});
