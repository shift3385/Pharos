import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShellChromeProvider } from "./ShellChrome";
import { useHideMobileChrome, useShellChrome } from "./useShellChrome";

function Bar() {
  const { mobileChromeHidden } = useShellChrome();
  return mobileChromeHidden ? null : <nav aria-label="Barra inferior" />;
}
function Screen() {
  const [editing, setEditing] = useState(false);
  useHideMobileChrome(editing);
  return (
    <button type="button" onClick={() => setEditing((e) => !e)}>
      {editing ? "Listo" : "Editar"}
    </button>
  );
}

describe("ShellChrome (SPEC §7)", () => {
  it("a screen hides the mobile chrome while it asks to, and it comes back after", async () => {
    const { unmount } = render(
      <ShellChromeProvider>
        <Screen />
        <Bar />
      </ShellChromeProvider>,
    );
    expect(screen.getByRole("navigation", { name: "Barra inferior" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(screen.getByRole("navigation", { name: "Barra inferior" })).toBeInTheDocument();
    unmount();
  });

  it("does nothing outside a provider", () => {
    render(
      <>
        <Screen />
        <Bar />
      </>,
    );
    expect(screen.getByRole("navigation", { name: "Barra inferior" })).toBeInTheDocument();
  });
});
