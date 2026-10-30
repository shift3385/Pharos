import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, RouterProvider, createMemoryRouter, useLocation } from "react-router";
import { i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

function Editor() {
  const [text, setText] = useState("");
  const { dialog } = useUnsavedChangesGuard(text !== "");
  const { pathname } = useLocation();
  return (
    <>
      <output data-testid="path">{pathname}</output>
      <label>
        Nota
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <Link to="/otra">Otra sección</Link>
      {dialog}
    </>
  );
}

function setup() {
  const router = createMemoryRouter(
    [
      { path: "/inicio", element: <p>Inicio</p> },
      { path: "/editor", element: <Editor /> },
      { path: "/otra", element: <p>Otra sección abierta</p> },
    ],
    { initialEntries: ["/inicio", "/editor"], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  return router;
}

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
    await userEvent.type(screen.getByRole("textbox", { name: "Nota" }), "borrador");
    await userEvent.click(screen.getByRole("link", { name: "Otra sección" }));
    const dialog = screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" });
    await expectNoAxeViolations();
    await userEvent.click(within(dialog).getByRole("button", { name: "Seguir editando" }));
    expect(screen.getByRole("textbox", { name: "Nota" })).toHaveValue("borrador");
    expect(screen.getByTestId("path")).toHaveTextContent("/editor");

    await userEvent.click(screen.getByRole("link", { name: "Otra sección" }));
    await userEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(screen.getByText("Otra sección abierta")).toBeInTheDocument();
  });

  it("holds «Atrás» (a history pop) the same way", async () => {
    const router = setup();
    await userEvent.type(screen.getByRole("textbox", { name: "Nota" }), "borrador");
    await act(() => router.navigate(-1));
    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/editor");
    await userEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.getByRole("textbox", { name: "Nota" })).toHaveValue("borrador");
    await act(() => router.navigate(-1));
    await userEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(screen.getByText("Inicio")).toBeInTheDocument();
  });

  it("asks the browser before a reload or closing the window, only while dirty", async () => {
    setup();
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await userEvent.type(screen.getByRole("textbox", { name: "Nota" }), "x");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});
