// FIX-39: below 600 px there is no sidebar, so its workspace selector was out
// of reach. The mobile user sheet, which already holds the sidebar foot's
// controls (sync status), now offers the workspaces too.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { WorkspaceProvider } from "@modules/workspaces";
import { UserMenu } from "./UserMenu";

const ME = "test-user";
const member = { userId: ME, email: "ana@pharos.dev", displayName: "Ana", firstName: "Ana", lastName: "", role: "test_manager", addedAt: "2026-11-18T10:00:00.000Z" };
const WORKSPACES = [
  { id: "ws-p", name: "Personal", kind: "personal", role: "test_manager", members: [member] },
  { id: "ws-t", name: "Equipo QA", kind: "shared", role: "viewer", members: [{ ...member, role: "viewer" }] },
];

function serve(workspaces: unknown[]) {
  localStorage.setItem("pharos.session", JSON.stringify({ accessToken: "tok", refreshToken: "r", user: { id: ME } }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith("/workspaces")
        ? new Response(JSON.stringify({ workspaces }), { status: 200 })
        : new Response(JSON.stringify({ code: "not_found" }), { status: 404 }),
    ),
  );
}

function renderMenu(variant: "mobile" | "sidebar") {
  return renderWithProviders(
    <WorkspaceProvider>
      <UserMenu variant={variant} />
    </WorkspaceProvider>,
  );
}

describe("UserMenu: the workspace on mobile (FIX-39)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    localStorage.clear();
  });
  afterEach(() => localStorage.clear());

  it("the mobile sheet lists the workspaces with their role and switches", async () => {
    serve(WORKSPACES);
    setViewportWidth(390);
    renderMenu("mobile");
    const user = userEvent.setup();
    await user.click(screen.getByTestId("user-menu-trigger"));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Workspace")).toBeInTheDocument();
    const team = await within(sheet).findByTestId("workspace-ws-t");
    expect(within(sheet).getByTestId("workspace-ws-p")).toHaveAttribute("aria-pressed", "true");
    expect(team).toHaveTextContent("Viewer (solo lectura)");
    expect(within(sheet).getByTestId("workspace-members")).toBeInTheDocument();
    await user.click(team);
    await waitFor(() => expect(localStorage.getItem(`pharos.workspace.${ME}`)).toBe("ws-t"));
  });

  it("stays out of the desktop menu, where the sidebar has the selector", async () => {
    serve(WORKSPACES);
    setViewportWidth(1440);
    renderMenu("sidebar");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await userEvent.click(screen.getByTestId("user-menu-trigger"));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-ws-t")).not.toBeInTheDocument();
  });

  it("shows nothing about workspaces while the server has none", async () => {
    serve([]);
    setViewportWidth(390);
    renderMenu("mobile");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await userEvent.click(screen.getByTestId("user-menu-trigger"));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).queryByText("Workspace")).not.toBeInTheDocument();
  });
});
