import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, RouterProvider, createMemoryRouter, useLocation, useNavigate, useSearchParams } from "react-router";
import { i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { useUnsavedChangesGuard, type UnsavedChangesOptions } from "./useUnsavedChangesGuard";

function Editor({ options }: { options?: UnsavedChangesOptions }) {
  const [text, setText] = useState("");
  const { dialog, bypass } = useUnsavedChangesGuard(text !== "", options);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  return (
    <>
      <output data-testid="where">{pathname + search}</output>
      <label>
        Nota
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <Link to="/otra">Otra sección</Link>
      <button type="button" onClick={() => setParams({ filtro: "x" }, { replace: true })}>
        Filtrar
      </button>
      <button type="button" onClick={() => setText("")}>
        Guardar
      </button>
      <button type="button" onClick={() => void bypass(() => navigate("/otra"))}>
        Guardar y salir
      </button>
      <button
        type="button"
        onClick={() =>
          void bypass(async () => {
            await Promise.resolve();
            navigate(-1);
          })
        }
      >
        Guardar y volver
      </button>
      {dialog}
    </>
  );
}

function setup(options?: UnsavedChangesOptions) {
  const router = createMemoryRouter(
    [
      { path: "/inicio", element: <p>Inicio</p> },
      { path: "/editor", element: <Editor options={options} /> },
      { path: "/otra", element: <p>Otra sección abierta</p> },
    ],
    { initialEntries: ["/inicio", "/editor"], initialIndex: 1 },
  );
  const view = render(<RouterProvider router={router} />);
  return { router, view };
}
const type = (text: string) => userEvent.type(screen.getByRole("textbox", { name: "Nota" }), text);

beforeEach(async () => {
  await i18n.changeLanguage("es");
});

describe("useUnsavedChangesGuard (RED-V3k)", () => {
  it("lets the user leave without asking when nothing changed", async () => {
    setup();
    await userEvent.click(screen.getByRole("link", { name: "Otra sección" }));
    expect(screen.getByText("Otra sección abierta")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("holds an in-app navigation until the user discards or keeps editing", async () => {
    setup();
    await type("borrador");
    await userEvent.click(screen.getByRole("link", { name: "Otra sección" }));
    const dialog = screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" });
    await expectNoAxeViolations();
    await userEvent.click(within(dialog).getByRole("button", { name: "Seguir editando" }));
    expect(screen.getByRole("textbox", { name: "Nota" })).toHaveValue("borrador");
    expect(screen.getByTestId("where")).toHaveTextContent("/editor");

    await userEvent.click(screen.getByRole("link", { name: "Otra sección" }));
    await userEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(screen.getByText("Otra sección abierta")).toBeInTheDocument();
  });

  it("holds «Atrás» (a history pop) the same way", async () => {
    const { router } = setup();
    await type("borrador");
    await act(() => router.navigate(-1));
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/editor");
    await userEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.getByRole("textbox", { name: "Nota" })).toHaveValue("borrador");
    await act(() => router.navigate(-1));
    await userEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(screen.getByText("Inicio")).toBeInTheDocument();
  });

  it("a query-string change asks by default, and not with `ignore: true`", async () => {
    setup();
    await type("x");
    await userEvent.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
  });

  it("with `ignore: true` only the path asks", async () => {
    setup({ ignore: true });
    await type("x");
    await userEvent.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/editor?filtro=x");
    await userEvent.click(screen.getByRole("link", { name: "Otra sección" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("bypass lets one navigation through, sync or after an await (navigate(-1) included)", async () => {
    setup();
    await type("x");
    await userEvent.click(screen.getByRole("button", { name: "Guardar y salir" }));
    expect(screen.getByText("Otra sección abierta")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    setup();
    await type("y");
    await userEvent.click(screen.getAllByRole("button", { name: "Guardar y volver" })[0]);
    expect(await screen.findByText("Inicio")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("a held navigation proceeds by itself when the screen turns clean", async () => {
    const { router } = setup();
    await type("x");
    await userEvent.click(screen.getByRole("link", { name: "Otra sección" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    // The form is saved while the dialog shows (e.g. an autosave finishing).
    await act(async () => {
      screen.getByRole("button", { name: "Guardar", hidden: true }).click();
    });
    expect(router.state.location.pathname).toBe("/otra");
  });

  it("asks the browser before a reload only while dirty, and stops after unmount", async () => {
    const { view } = setup();
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await type("x");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    view.unmount();
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it("warns in development when two guards are mounted at once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const router = createMemoryRouter(
      [
        {
          path: "*",
          element: (
            <>
              <Editor />
              <Editor />
            </>
          ),
        },
      ],
      { initialEntries: ["/editor"] },
    );
    render(<RouterProvider router={router} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("more than one guard"));
    warn.mockRestore();
  });
});
