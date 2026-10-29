import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { ToastProvider } from "@shared/ui/Toast";
import { DownloadFolderField } from "./DownloadFolderField";

const api = vi.hoisted(() => ({
  available: () => true,
  get: vi.fn(),
  pick: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("@shared/export/saveFile", () => ({ downloadDir: api }));

function renderField() {
  return renderWithProviders(
    <ToastProvider>
      <DownloadFolderField />
    </ToastProvider>,
  );
}

describe("DownloadFolderField (UX-02)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    api.get.mockReset();
    api.pick.mockReset();
  });

  it("shows the folder and saves a picked one", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({
      path: "C:\\Users\\a\\Downloads",
      custom: false,
      missing: false,
    });
    api.pick.mockResolvedValue({
      path: "D:\\Exports",
      custom: true,
      missing: false,
    });
    renderField();
    // The field renders "—" first and fills in once `get` resolves: wait for
    // the text, not just for the element.
    await waitFor(() =>
      expect(screen.getByTestId("download-dir")).toHaveTextContent(
        "C:\\Users\\a\\Downloads (Descargas del sistema)",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Elegir carpeta…" }));
    await waitFor(() =>
      expect(screen.getByTestId("download-dir")).toHaveTextContent(
        "D:\\Exports",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Usar Descargas" }),
    ).toBeInTheDocument();
  });

  it("a failure to read or pick the folder is shown, not swallowed", async () => {
    const user = userEvent.setup();
    api.get.mockRejectedValue(new Error("ipc down"));
    api.pick.mockRejectedValue(new Error("dialog failed"));
    renderField();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo leer ni cambiar la carpeta de descarga.",
    );
    await user.click(screen.getByRole("button", { name: "Elegir carpeta…" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Elegir carpeta…" }),
      ).toBeEnabled(),
    );
  });
});
