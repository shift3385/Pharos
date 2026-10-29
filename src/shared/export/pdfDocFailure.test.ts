import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "@shared/i18n";
import {
  ReportedError,
  TOAST_EVENT,
  type ToastDetail,
} from "@shared/ui/notify";

// pdfmake 0.2 reports some failures only as an unhandled rejection of its own
// promise chain; the browser turns that into a window "unhandledrejection"
// event (jsdom does not, so the fake library raises the event itself).
let mode: "async-failure" | "hang" = "async-failure";
vi.mock("pdfmake/build/pdfmake", () => ({
  default: {
    createPdf: () => ({
      getBuffer: () => {
        if (mode === "hang") return;
        setTimeout(() => {
          const event = Object.assign(
            new Event("unhandledrejection", { cancelable: true }),
            {
              reason:
                "File 'Roboto-Medium.ttf' not found in virtual file system",
            },
          );
          window.dispatchEvent(event);
        }, 0);
      },
    }),
  },
}));
vi.mock("pdfmake/build/vfs_fonts", () => ({
  default: { "Roboto-Regular.ttf": "AAAA" },
  pdfMake: undefined,
  vfs: undefined,
  "Roboto-Regular.ttf": undefined,
}));

const { baseDoc, pdfBytes, savePdf } = await import("./pdfDoc");

afterEach(() => {
  mode = "async-failure";
});

describe("pdfBytes never hangs (EXP-02)", () => {
  it("rejects with pdfmake's own asynchronous failure", async () => {
    await expect(pdfBytes(baseDoc("Plan", []))).rejects.toThrow(
      /Roboto-Medium\.ttf/,
    );
  });

  it("rejects after the timeout when pdfmake never answers", async () => {
    mode = "hang";
    await expect(pdfBytes(baseDoc("Plan", []), 20)).rejects.toThrow(
      /timed out/,
    );
  });

  it("savePdf shows the failure and rejects as already reported", async () => {
    await i18n.changeLanguage("es");
    const toasts: ToastDetail[] = [];
    const onToast = (e: Event) =>
      toasts.push((e as CustomEvent<ToastDetail>).detail);
    window.addEventListener(TOAST_EVENT, onToast);
    await expect(
      savePdf(baseDoc("Plan", []), "Plan.pdf"),
    ).rejects.toBeInstanceOf(ReportedError);
    window.removeEventListener(TOAST_EVENT, onToast);
    expect(toasts).toHaveLength(1);
    expect(toasts[0].kind).toBe("error");
    expect(toasts[0].message).toContain("No se pudo generar el PDF «Plan.pdf»");
  });
});
