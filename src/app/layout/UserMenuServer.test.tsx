// FIX-46: the menu label «CONECTADO A LOCALHOST:3146» upper-cased the server
// address. The label keeps its capitals; the address shows as typed.
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";

vi.mock("@shared/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/platform")>();
  return { ...actual, isTauri: () => true, invoke: vi.fn(async () => null) };
});

vi.mock("@modules/server-picker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@modules/server-picker")>();
  return { ...actual, useServerInfo: () => ({ info: { origin: "http://localhost:3146" } }) };
});

const { UserMenu } = await import("./UserMenu");

describe("UserMenu: the server line (FIX-46)", () => {
  it("keeps the server address out of the label's capitals", async () => {
    await i18n.changeLanguage("es");
    renderWithProviders(<UserMenu variant="sidebar" />);
    await userEvent.click(screen.getByTestId("user-menu-trigger"));
    const host = await screen.findByTestId("connected-host");
    expect(host).toHaveClass("menu__label-value");
    expect(host).toHaveTextContent("localhost:3146");
    expect(host.parentElement).toHaveTextContent(/^Conectado a localhost:3146$/);
  });
});
