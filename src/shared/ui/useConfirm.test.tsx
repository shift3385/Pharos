import { describe, it, expect, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { i18n } from "@test/utils";
import { useConfirm, type ConfirmOptions } from "./useConfirm";

/** A button that asks and writes the answer on screen. */
function Asker({ options }: { options: Partial<ConfirmOptions> }) {
  const { confirm, dialog } = useConfirm();
  const [answer, setAnswer] = useState("—");
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void confirm({ title: "¿Restaurar esta revisión?", message: "Reemplaza lo escrito.", confirmLabel: "Restaurar", ...options }).then(
            (yes) => setAnswer(yes ? "sí" : "no"),
          )
        }
      >
        Preguntar
      </button>
      <output>{answer}</output>
      {dialog}
    </>
  );
}

describe("useConfirm (NC-017, NC-014)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("asks with a Pharos dialog and resolves to the button pressed", async () => {
    const user = userEvent.setup();
    render(<Asker options={{}} />);
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    expect(screen.getByRole("alertdialog", { name: "¿Restaurar esta revisión?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restaurar" }));
    expect(screen.getByText("sí")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("no")).toBeInTheDocument();
  });

  it("a normal confirmation: Escape answers «no», like Cancelar", async () => {
    const user = userEvent.setup();
    render(<Asker options={{}} />);
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("no")).toBeInTheDocument();
  });

  it("a critical confirmation: Escape does nothing, only the buttons answer", async () => {
    const user = userEvent.setup();
    render(<Asker options={{ variant: "destructive", confirmLabel: "Eliminar" }} />);
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(screen.getByText("sí")).toBeInTheDocument();
  });
});

/** Every file of the app, tests aside. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("dialogs policy (NC-017)", () => {
  it("the app never uses the browser's confirm, alert or prompt", () => {
    const offenders = sources(join(process.cwd(), "src")).filter((file) =>
      /\bwindow\.(confirm|alert|prompt)\s*\(|(^|[^.\w])(confirm|alert|prompt)\s*\(\s*["'`t]/m.test(
        readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
