import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, RouterProvider, createMemoryRouter, useLocation, useNavigate, useSearchParams } from "react-router";
import { i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { ErrorBoundary } from "./ErrorBoundary";
import { RethrowRouteError } from "./RethrowRouteError";
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
      <button type="button" onClick={() => void bypass(() => navigate("/editor?case=1"))}>
        Guardar y abrir por id
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
      <button
        type="button"
        onClick={() =>
          void Promise.resolve(
            bypass(async () => {
              await Promise.resolve();
              throw new Error("save failed");
            }),
          ).catch(() => {})
        }
      >
        Guardar con error
      </button>
      <button
        type="button"
        onClick={() => {
          try {
            void bypass(() => {
              throw new Error("save failed");
            });
          } catch {
            // the screen shows its own error
          }
        }}
      >
        Guardar con error inmediato
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

/** The same screens wired like `main.tsx`: a crash reaches the app's boundary. */
function setupLikeTheApp() {
  const router = createMemoryRouter(
    [
      { path: "/editor", element: <Editor />, ErrorBoundary: RethrowRouteError },
      { path: "/otra", element: <p>Otra sección abierta</p>, ErrorBoundary: RethrowRouteError },
    ],
    { initialEntries: ["/editor"] },
  );
  render(
    <ErrorBoundary variant="app">
      <RouterProvider router={router} />
    </ErrorBoundary>,
  );
  return router;
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

  it("a bypass whose go fails (sync or async) leaves the guard armed", async () => {
    setup();
    await type("x");
    await userEvent.click(screen.getByRole("button", { name: "Guardar con error" }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await userEvent.click(screen.getByRole("link", { name: "Otra sección" }));
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Seguir editando" }));

    await userEvent.click(screen.getByRole("button", { name: "Guardar con error inmediato" }));
    await userEvent.click(screen.getByRole("link", { name: "Otra sección" }));
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeInTheDocument();
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

  // The router publishes its state to React in a transition, so a render can
  // still read `blocked` after the router has already released the navigation.
  describe("when React has not caught up with the router", () => {
    const click = (name: string) => screen.getByRole("button", { name, hidden: true }).click();
    const settle = () => new Promise((r) => setTimeout(r, 0));

    // Pages can look right even after the throw (the router's error boundary
    // recovers on the next location), so the throw itself is what is checked.
    const invalidTransitions: string[] = [];
    const collect = (text: unknown) => {
      if (String(text).includes("Invalid blocker state transition")) invalidTransitions.push(String(text));
    };
    const onWindowError = (e: ErrorEvent) => {
      collect(e.error);
      e.preventDefault();
    };
    beforeEach(() => {
      invalidTransitions.length = 0;
      vi.spyOn(console, "error").mockImplementation((...args) => args.forEach(collect));
      window.addEventListener("error", onWindowError);
    });
    afterEach(() => {
      window.removeEventListener("error", onWindowError);
      vi.restoreAllMocks();
      cleanup(); // A failed check below must not leave this screen for the next test.
      expect(invalidTransitions).toEqual([]);
    });

    async function held() {
      const { router } = setup();
      await type("x");
      await userEvent.click(screen.getByRole("link", { name: "Otra sección" }));
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      return router;
    }

    it("a save that turns clean after «Descartar» does not release the navigation again", async () => {
      const router = await held();
      await act(async () => {
        click("Descartar cambios");
        await Promise.resolve();
        await Promise.resolve();
        click("Guardar");
      });
      await act(settle);
      expect(router.state.location.pathname).toBe("/otra");
      expect(screen.getByText("Otra sección abierta")).toBeInTheDocument();
    });

    it("a save that navigates by itself while a navigation is held does not release it", async () => {
      const router = await held();
      await act(async () => {
        click("Guardar");
        click("Guardar y salir");
        await settle();
      });
      await act(settle);
      expect(router.state.location.pathname).toBe("/otra");
      expect(screen.getByText("Otra sección abierta")).toBeInTheDocument();
    });

    it("the click that was held still opens its section when a save navigates elsewhere meanwhile", async () => {
      const router = await held();
      await act(async () => {
        click("Guardar");
        click("Guardar y abrir por id");
        await settle();
      });
      await act(settle);
      expect(router.state.location.pathname + router.state.location.search).toBe("/otra");
      expect(screen.getByText("Otra sección abierta")).toBeInTheDocument();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("wired like the app, the screen survives (the error does not reach the app's boundary)", async () => {
      const router = setupLikeTheApp();
      await type("x");
      await userEvent.click(screen.getByRole("link", { name: "Otra sección" }));
      await act(async () => {
        click("Seguir editando");
        click("Guardar");
      });
      await act(settle);
      expect(router.state.location.pathname).toBe("/editor");
      expect(screen.getByRole("textbox", { name: "Nota" })).toHaveValue("");
    });

    it("«Seguir editando» followed by a save keeps the user on the screen", async () => {
      const router = await held();
      await act(async () => {
        click("Seguir editando");
        click("Guardar");
      });
      await act(settle);
      expect(router.state.location.pathname).toBe("/editor");
      expect(screen.getByRole("textbox", { name: "Nota" })).toHaveValue("");
    });

    it("a double click on «Descartar cambios» only releases once", async () => {
      const router = await held();
      await act(async () => {
        click("Descartar cambios");
        await Promise.resolve();
        await Promise.resolve();
        click("Descartar cambios");
      });
      await act(settle);
      expect(router.state.location.pathname).toBe("/otra");
    });
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
