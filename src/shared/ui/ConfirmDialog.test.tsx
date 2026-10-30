import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { i18n } from "@test/utils";
import { ConfirmDialog } from "./ConfirmDialog";

function renderDialog(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="¿Eliminar el proyecto?"
      message="Se pierden el plan y los casos."
      confirmLabel="Sí, eliminar todo"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

const backdrop = () => document.querySelector(".cd-overlay") as Element;

describe("ConfirmDialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("by default starts on Cancel, and Escape or the backdrop cancel it", async () => {
    const { onCancel } = renderDialog();
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    fireEvent.mouseDown(backdrop());
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("destructive: only «Cancelar» closes it (SPEC §6/§10)", async () => {
    const { onCancel, onConfirm } = renderDialog({ variant: "destructive" });
    expect(screen.getByRole("alertdialog", { name: "¿Eliminar el proyecto?" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    fireEvent.mouseDown(backdrop());
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sí, eliminar todo" })).toHaveClass(
      "cd__confirm--danger",
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirmText keeps the confirm button disabled until the text matches", async () => {
    const { onConfirm } = renderDialog({ variant: "destructive", confirmText: "PCL" });
    const field = screen.getByRole("textbox", { name: "Escribe «PCL» para confirmar" });
    expect(field).toHaveFocus();
    const confirm = screen.getByRole("button", { name: "Sí, eliminar todo" });
    expect(confirm).toBeDisabled();
    await userEvent.type(field, "PC");
    expect(confirm).toBeDisabled();
    await userEvent.type(field, "L");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
