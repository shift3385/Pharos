import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { notify, ReportedError, unlessReported } from "./notify";

describe("toasts from outside React", () => {
  it("notify() shows a toast; warnings and errors are announced as alerts", () => {
    render(<ToastProvider>{null}</ToastProvider>);
    act(() => {
      notify("Guardado en D:\\x.pdf");
      notify("No se pudo guardar «x.pdf»", "error");
    });
    expect(screen.getByText(/Guardado en/)).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No se pudo guardar «x.pdf»");
    expect(alert.querySelector(".toast--error")).not.toBeNull();
  });

  it("unlessReported swallows only failures that were already shown", async () => {
    await expect(
      unlessReported(Promise.reject(new ReportedError("x"))),
    ).resolves.toBeUndefined();
    await expect(unlessReported(Promise.resolve(3))).resolves.toBe(3);
    await expect(
      unlessReported(Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
  });
});
