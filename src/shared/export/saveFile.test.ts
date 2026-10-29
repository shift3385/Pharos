import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import i18n from "@shared/i18n";
import { ReportedError, TOAST_EVENT, type ToastDetail } from "@shared/ui/notify";
import { downloadDir, saveFile } from "./saveFile";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);
const toasts: ToastDetail[] = [];
const onToast = (e: Event) => toasts.push((e as CustomEvent<ToastDetail>).detail);

function asDesktop() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

beforeEach(async () => {
  await i18n.changeLanguage("es");
  toasts.length = 0;
  window.addEventListener(TOAST_EVENT, onToast);
});

afterEach(() => {
  window.removeEventListener(TOAST_EVENT, onToast);
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  mockedInvoke.mockReset();
  vi.restoreAllMocks();
});

describe("saveFile (UX-02)", () => {
  it("desktop: sends the raw bytes and the encoded name to download_save", async () => {
    asDesktop();
    mockedInvoke.mockResolvedValue({ path: "D:\\Exports\\Plan de pruebas ñ (2).pdf", fallback: false });
    const path = await saveFile("Plan de pruebas ñ.pdf", new Uint8Array([37, 80, 68, 70]));
    expect(path).toBe("D:\\Exports\\Plan de pruebas ñ (2).pdf");
    const [cmd, body, options] = mockedInvoke.mock.calls[0];
    expect(cmd).toBe("download_save");
    expect(Array.from(body as Uint8Array)).toEqual([37, 80, 68, 70]);
    expect(options).toEqual({
      headers: { "x-pharos-filename": "Plan%20de%20pruebas%20%C3%B1.pdf" },
    });
    expect(toasts).toEqual([]);
  });

  it("desktop: encodes text and reads blobs and array buffers", async () => {
    asDesktop();
    mockedInvoke.mockResolvedValue({ path: "x", fallback: false });
    await saveFile("a.feature", "Feature: ñ");
    expect(new TextDecoder().decode(mockedInvoke.mock.calls[0][1] as Uint8Array)).toBe(
      "Feature: ñ",
    );

    await saveFile("b.xlsx", new Uint8Array([1, 2]).buffer);
    expect(Array.from(mockedInvoke.mock.calls[1][1] as Uint8Array)).toEqual([1, 2]);

    // jsdom's Blob lacks arrayBuffer(); the WebView2 one has it.
    const blob = new Blob(["zip"]);
    Object.defineProperty(blob, "arrayBuffer", {
      value: async () => new TextEncoder().encode("zip").buffer,
    });
    await saveFile("c.zip", blob);
    expect(new TextDecoder().decode(mockedInvoke.mock.calls[2][1] as Uint8Array)).toBe("zip");
  });

  it("asks for Mark-of-the-Web on untrusted content", async () => {
    asDesktop();
    mockedInvoke.mockResolvedValue({ path: "x", fallback: false });
    await saveFile("setup.exe", new Uint8Array([1]), { untrusted: true });
    expect(mockedInvoke.mock.calls[0][2]).toEqual({
      headers: { "x-pharos-filename": "setup.exe", "x-pharos-untrusted": "1" },
    });
  });

  it("says so when the file had to go to Downloads", async () => {
    asDesktop();
    mockedInvoke.mockResolvedValue({ path: "C:\\Users\\a\\Downloads\\p.pdf", fallback: true });
    expect(await saveFile("p.pdf", new Uint8Array([1]))).toBe("C:\\Users\\a\\Downloads\\p.pdf");
    expect(toasts).toHaveLength(1);
    expect(toasts[0].kind).toBe("warning");
    expect(toasts[0].message).toContain("Descargas");
    expect(toasts[0].message).toContain("C:\\Users\\a\\Downloads\\p.pdf");
  });

  it("a failed save shows an error toast and rejects as already reported", async () => {
    asDesktop();
    mockedInvoke.mockRejectedValue("Acceso denegado. (os error 5)");
    const result = saveFile("plan.xlsx", new Uint8Array([1]));
    await expect(result).rejects.toBeInstanceOf(ReportedError);
    expect(toasts).toEqual([
      {
        kind: "error",
        message: "No se pudo guardar «plan.xlsx»: Acceso denegado. (os error 5)",
      },
    ]);
  });

  it("web preview: falls back to a browser download and returns the name", async () => {
    const create = vi.fn(() => "blob:x");
    URL.createObjectURL = create;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const name = await saveFile("matrix.xlsx", new Uint8Array([1]));
    expect(name).toBe("matrix.xlsx");
    expect(click).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("folder settings exist only in the desktop app", async () => {
    expect(downloadDir.available()).toBe(false);
    asDesktop();
    expect(downloadDir.available()).toBe(true);
    mockedInvoke.mockResolvedValue(null);
    expect(await downloadDir.pick()).toBeNull();
    expect(mockedInvoke).toHaveBeenCalledWith("download_dir_pick");
  });
});
