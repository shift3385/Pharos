import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { WorkspaceProvider } from "./WorkspaceProvider";
import { WorkspaceMembersPage } from "./WorkspaceMembersPage";
import { JoinWorkspacePage } from "./JoinWorkspacePage";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { WorkspaceNotices } from "./WorkspaceNotices";
import type { Workspace } from "../api/workspacesApi";

// The workspaces UI (SYNC-07) on the web: every request goes to the server.

const ME = "test-user";
const member = (userId: string, role: Workspace["role"], name: string) => ({
  userId,
  email: `${name.toLowerCase()}@pharos.dev`,
  displayName: name,
  firstName: name,
  lastName: "",
  role,
  addedAt: "2026-11-18T10:00:00.000Z",
});
const PERSONAL: Workspace = { id: "ws-p", name: "Personal", kind: "personal", role: "test_manager", members: [member(ME, "test_manager", "Ana")] };
const team = (role: Workspace["role"]): Workspace => ({
  id: "ws-t",
  name: "Equipo QA",
  kind: "shared",
  role,
  members: [member(ME, role, "Ana"), member("luis", "test_analyst", "Luis"), member("marta", "viewer", "Marta")],
});

type Answer = { status?: number; body?: unknown };
let requests: { method: string; path: string; body: unknown }[] = [];

/** A fake server answering by method and path. */
function serve(routes: Record<string, Answer | ((body: unknown) => Answer)>) {
  localStorage.setItem("pharos.session", JSON.stringify({ accessToken: "tok", refreshToken: "r", user: { id: ME } }));
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const method = init.method ?? "GET";
      const path = String(url).replace(/^https?:\/\/[^/]+/, "");
      const body = init.body ? JSON.parse(init.body as string) : undefined;
      requests.push({ method, path, body });
      const route = routes[`${method} ${path}`];
      const answer = typeof route === "function" ? route(body) : (route ?? { status: 404, body: { code: "not_found" } });
      return answer.status === 204
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200 });
    }),
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("es");
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

const withWorkspaces = (ui: React.ReactElement, route = "/") =>
  renderWithProviders(<WorkspaceProvider>{ui}</WorkspaceProvider>, { route });

describe("workspace switcher", () => {
  it("stays hidden while the server has no workspaces", async () => {
    serve({});
    withWorkspaces(<WorkspaceSwitcher />);
    await waitFor(() => expect(requests.some((r) => r.path === "/workspaces")).toBe(true));
    expect(screen.queryByTestId("workspace-switcher")).toBeNull();
  });

  it("shows the role beside the workspace and switches", async () => {
    serve({ "GET /workspaces": { body: { workspaces: [PERSONAL, team("viewer")] } } });
    withWorkspaces(<WorkspaceSwitcher />);
    const button = await screen.findByTestId("workspace-switcher");
    expect(button).toHaveTextContent("Personal");
    expect(button).toHaveTextContent("Test Manager");
    await userEvent.click(button);
    await userEvent.click(await screen.findByTestId("workspace-ws-t"));
    expect(button).toHaveTextContent("Equipo QA");
    expect(button).toHaveTextContent("Viewer (solo lectura)");
    expect(localStorage.getItem(`pharos.workspace.${ME}`)).toBe("ws-t");
  });
});

describe("read-only notice (exit criterion: un auditor no edita)", () => {
  it("tells a Viewer they only read, and nobody else", async () => {
    serve({ "GET /workspaces": { body: { workspaces: [PERSONAL, team("viewer")] } } });
    localStorage.setItem(`pharos.workspace.${ME}`, "ws-t");
    withWorkspaces(<WorkspaceNotices />);
    expect(await screen.findByTestId("workspace-read-only")).toHaveTextContent("Solo lectura");
  });

  it("offers to drop the copy of a lost workspace, and keeps it until then", async () => {
    serve({ "GET /workspaces": { body: { workspaces: [PERSONAL] } } });
    withWorkspaces(<WorkspaceNotices />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent("pharos:workspaces-revoked", {
          detail: { workspaces: [{ id: "ws-t", name: "Equipo QA", projects: 2, pending: 1 }] },
        }),
      );
    });
    const card = await screen.findByTestId("revoked-ws-t");
    expect(card).toHaveTextContent("Ya no eres miembro de «Equipo QA».");
    await userEvent.click(within(card).getByRole("button", { name: "Más tarde" }));
    expect(screen.queryByTestId("revoked-ws-t")).toBeNull();
  });
});

describe("members and roles", () => {
  it("a Test Manager changes roles, removes people and invites", async () => {
    serve({
      "GET /workspaces": { body: { workspaces: [PERSONAL, team("test_manager")] } },
      "GET /workspaces/ws-t/invitations": {
        body: {
          invitations: [
            { id: "inv1", role: "viewer", note: "jorge@pharos.dev", createdAt: "2026-11-18T10:00:00Z", expiresAt: "2026-11-25T10:00:00Z", status: "pending" },
          ],
        },
      },
      "POST /workspaces/ws-t/invitations": (body) => ({
        status: 201,
        body: { id: "inv2", code: "PHX-ABCD-EFGH-JKMN", ...(body as object), createdAt: "2026-11-18T10:00:00Z", expiresAt: "2026-11-25T10:00:00Z", status: "pending" },
      }),
      "PATCH /workspaces/ws-t/members/marta": { body: { members: [] } },
    });
    withWorkspaces(<WorkspaceMembersPage />, "/workspaces/members?id=ws-t");
    expect(await screen.findByRole("heading", { name: "Miembros · Equipo QA" })).toBeInTheDocument();
    expect(await screen.findByTestId("member-luis")).toHaveTextContent("Luis");
    expect(await screen.findByText("jorge@pharos.dev")).toBeInTheDocument();
    // The only Test Manager cannot lose the role.
    const anaRow = screen.getByTestId(`member-${ME}`);
    expect(within(anaRow).getByRole("button", { name: "Salir" })).toBeDisabled();

    await userEvent.click(screen.getByTestId("members-invite"));
    const dialog = await screen.findByRole("dialog", { name: "Invitar a Equipo QA" });
    await userEvent.type(within(dialog).getByLabelText("Para quién (nota opcional, no se envía)"), "jorge@pharos.dev");
    await userEvent.click(within(dialog).getByTestId("invite-create"));
    expect(await screen.findByText("PHX-ABCD-EFGH-JKMN")).toBeInTheDocument();
    const sent = requests.find((r) => r.method === "POST" && r.path === "/workspaces/ws-t/invitations");
    expect(sent?.body).toEqual({ role: "test_analyst", note: "jorge@pharos.dev", expiresInDays: 7 });
  });

  it("everyone else only reads", async () => {
    serve({ "GET /workspaces": { body: { workspaces: [PERSONAL, team("test_analyst")] } } });
    withWorkspaces(<WorkspaceMembersPage />, "/workspaces/members?id=ws-t");
    expect(await screen.findByTestId("member-luis")).toBeInTheDocument();
    expect(screen.queryByTestId("members-invite")).toBeNull();
    expect(screen.getByText("Solo un Test Manager cambia miembros e invitaciones.")).toBeInTheDocument();
    expect(within(screen.getByTestId("member-luis")).queryByRole("button")).toBeNull();
    expect(requests.some((r) => r.path.endsWith("/invitations"))).toBe(false);
  });

  it("has no accessibility violations", async () => {
    await i18n.changeLanguage("en");
    serve({ "GET /workspaces": { body: { workspaces: [PERSONAL, team("test_manager")] } } });
    const { container } = withWorkspaces(<WorkspaceMembersPage />, "/workspaces/members?id=ws-t");
    await screen.findByTestId("member-luis");
    await expectNoAxeViolations(container);
  });
});

describe("join with a code", () => {
  it("shows what the code joins before using it", async () => {
    serve({
      "GET /workspaces": { body: { workspaces: [PERSONAL] } },
      "POST /invitations/preview": { body: { workspaceName: "Equipo QA", role: "automation_engineer", invitedBy: "Ana" } },
      "POST /invitations/accept": { body: team("automation_engineer") },
    });
    withWorkspaces(
      <Routes>
        <Route path="/workspaces/join" element={<JoinWorkspacePage />} />
        <Route path="/projects" element={<p>projects</p>} />
      </Routes>,
      "/workspaces/join?code=PHX-ABCD",
    );
    expect(screen.getByTestId("join-code")).toHaveValue("PHX-ABCD");
    await userEvent.click(screen.getByTestId("join-submit"));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Te unes a «Equipo QA» como Automation Engineer, invitado por Ana.",
    );
    expect(requests.some((r) => r.path === "/invitations/accept")).toBe(false);
    await userEvent.click(screen.getByTestId("join-submit"));
    expect(await screen.findByText("projects")).toBeInTheDocument();
    expect(requests.find((r) => r.path === "/invitations/accept")?.body).toEqual({ code: "PHX-ABCD" });
  });

  it("says when a code no longer works", async () => {
    serve({
      "GET /workspaces": { body: { workspaces: [PERSONAL] } },
      "POST /invitations/preview": { status: 410, body: { code: "invitation_invalid", message: "gone" } },
    });
    withWorkspaces(<JoinWorkspacePage />, "/workspaces/join");
    await userEvent.type(screen.getByTestId("join-code"), "PHX-OLD1");
    await userEvent.click(screen.getByTestId("join-submit"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Este código ya se usó o caducó");
  });
});

describe("share a project", () => {
  it("moves it to a shared workspace the person manages", async () => {
    const { ShareProjectDialog } = await import("./ShareProjectDialog");
    serve({
      "GET /workspaces": {
        body: { workspaces: [PERSONAL, team("test_manager"), { ...team("viewer"), id: "ws-v", name: "Auditoría" }] },
      },
      "POST /workspaces/ws-t/move-project": { body: { moved: 12, from: "ws-p", to: "ws-t" } },
    });
    const onDone = vi.fn();
    withWorkspaces(<ShareProjectDialog projectId="p1" projectName="Pagos" onDone={onDone} onCancel={() => {}} />);
    const dialog = await screen.findByRole("dialog", { name: "Compartir «Pagos»" });
    await waitFor(() => expect(within(dialog).getByTestId("share-submit")).toBeEnabled());
    await userEvent.click(within(dialog).getByTestId("share-submit"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(requests.find((r) => r.method === "POST")).toMatchObject({
      path: "/workspaces/ws-t/move-project",
      body: { projectId: "p1" },
    });
  });

  it("says why there is nowhere to share it", async () => {
    const { ShareProjectDialog } = await import("./ShareProjectDialog");
    serve({ "GET /workspaces": { body: { workspaces: [PERSONAL, team("test_analyst")] } } });
    withWorkspaces(<ShareProjectDialog projectId="p1" projectName="Pagos" onDone={() => {}} onCancel={() => {}} />);
    expect(await screen.findByText(/No eres Test Manager de ningún workspace compartido/)).toBeInTheDocument();
    expect(screen.queryByTestId("share-submit")).toBeNull();
  });
});
