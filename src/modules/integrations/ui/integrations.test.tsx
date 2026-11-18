import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { WorkspaceMembersPage, WorkspaceProvider } from "@modules/workspaces";
import type { ApiToken } from "../api/tokensApi";
import { PersonalTokensSection } from "./PersonalTokensSection";
import { AdminRevokeTokensButton } from "./AdminRevokeTokens";

// API tokens in the app (INT-02, ADR-0052; bocetos 1-3, 7-9), on the web:
// every request goes to the server.

const ME = "test-user";
const SECRET = "phr_prj_example-not-a-real-token";
const team = (role: string) => ({
  id: "ws-t",
  name: "QA Pagos",
  kind: "shared",
  role,
  members: [{ userId: ME, email: "ana@pharos.dev", displayName: "Ana", firstName: "Ana", lastName: "", role, addedAt: null }],
});
const token = (over: Partial<ApiToken> = {}): ApiToken => ({
  id: "t1",
  kind: "project",
  name: "CI GitHub · pagos-web",
  displayPrefix: "phr_prj_Ab3k",
  workspaceId: "ws-t",
  workspaceName: "QA Pagos",
  projectId: "p1",
  projectName: "Pagos Web",
  scopes: ["projects:read", "runs:read", "runs:write"],
  owner: { id: ME, name: "Ana" },
  createdAt: "2026-11-18T10:00:00.000Z",
  expiresAt: "2027-02-16T10:00:00.000Z",
  lastUsedAt: null,
  lastUsedIp: null,
  status: "active",
  inactiveReason: null,
  expiringSoon: false,
  revokedAt: null,
  revokeReason: null,
  ...over,
});

type Answer = { status?: number; body?: unknown };
let requests: { method: string; path: string; body: unknown }[] = [];

function serve(routes: Record<string, Answer | ((body: unknown) => Answer)>) {
  localStorage.setItem("pharos.session", JSON.stringify({ accessToken: "tok", refreshToken: "r", user: { id: ME } }));
  localStorage.setItem(`pharos.workspace.${ME}`, "ws-t");
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const method = init.method ?? "GET";
      const path = String(url).replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "");
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

const integrationsTab = () =>
  renderWithProviders(
    <WorkspaceProvider>
      <Routes>
        <Route path="/workspaces/members" element={<WorkspaceMembersPage />} />
      </Routes>
    </WorkspaceProvider>,
    { route: "/workspaces/members?id=ws-t&tab=integrations" },
  );

describe("Workspace › Integraciones › Tokens de proyecto", () => {
  it("a Test Manager creates a token and sees it once, with its CI example", async () => {
    serve({
      "GET /workspaces": { body: { workspaces: [team("test_manager")] } },
      "GET /workspaces/ws-t/tokens": { body: { tokens: [token()], projects: [{ id: "p1", name: "Pagos Web" }] } },
      "POST /workspaces/ws-t/tokens": (body) => ({
        status: 201,
        body: { token: SECRET, view: token({ id: "t2", name: (body as { name: string }).name }) },
      }),
    });
    const { container } = integrationsTab();
    const table = await screen.findByTestId("project-tokens-table");
    expect(within(table).getByText("CI GitHub · pagos-web")).toBeInTheDocument();
    expect(within(table).getByText("Activo")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Integraciones" })).toHaveAttribute("aria-selected", "true");
    await expectNoAxeViolations(container);

    await userEvent.click(screen.getByTestId("project-token-new"));
    await userEvent.click(screen.getByTestId("token-create"));
    expect(requests.some((r) => r.method === "POST")).toBe(false);
    await userEvent.type(screen.getByTestId("token-name"), "k6 nocturno");
    await userEvent.click(screen.getByTestId("token-create"));

    const post = await waitFor(() => {
      const r = requests.find((x) => x.method === "POST");
      expect(r).toBeDefined();
      return r!;
    });
    expect(post.body).toMatchObject({ name: "k6 nocturno", projectId: "p1", scopes: ["projects:read", "runs:read", "runs:write"] });
    const days = (new Date((post.body as { expiresAt: string }).expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(90);

    expect(await screen.findByTestId("token-secret")).toHaveTextContent(SECRET);
    expect(screen.getByText(/PHAROS_TOKEN/)).toBeInTheDocument();
    const done = screen.getByTestId("token-done");
    expect(done).toBeDisabled();
    await userEvent.click(screen.getByTestId("token-saved"));
    await userEvent.click(done);
    expect(screen.queryByTestId("token-secret")).toBeNull();
  });

  it("a Test Manager revokes after confirming", async () => {
    serve({
      "GET /workspaces": { body: { workspaces: [team("test_manager")] } },
      "GET /workspaces/ws-t/tokens": { body: { tokens: [token()], projects: [{ id: "p1", name: "Pagos Web" }] } },
      "DELETE /workspaces/ws-t/tokens/t1": { status: 204 },
    });
    integrationsTab();
    await userEvent.click(await screen.findByTestId("token-revoke-t1"));
    await screen.findByText(/Deja de funcionar ahora mismo y los CI/);
    // The confirmation's button, after the row's own «Revocar».
    await userEvent.click(screen.getAllByRole("button", { name: "Revocar" }).at(-1)!);
    await waitFor(() => expect(requests.some((r) => r.method === "DELETE" && r.path === "/workspaces/ws-t/tokens/t1")).toBe(true));
  });

  it("an inactive token says why and offers to reassign it", async () => {
    serve({
      "GET /workspaces": { body: { workspaces: [team("test_manager")] } },
      "GET /workspaces/ws-t/tokens": {
        body: { tokens: [token({ status: "inactive", inactiveReason: "owner_left", owner: { id: "carlos", name: "Carlos" } })], projects: [] },
      },
    });
    integrationsTab();
    const table = await screen.findByTestId("project-tokens-table");
    expect(within(table).getByText("Inactivo")).toBeInTheDocument();
    expect(within(table).getByText("Carlos ya no es miembro")).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Reasignar a mí" })).toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: "Rotar" })).toBeNull();
  });

  it("other roles read the list without actions", async () => {
    serve({
      "GET /workspaces": { body: { workspaces: [team("automation_engineer")] } },
      "GET /workspaces/ws-t/tokens": { body: { tokens: [token()], projects: [{ id: "p1", name: "Pagos Web" }] } },
    });
    integrationsTab();
    const table = await screen.findByTestId("project-tokens-table");
    expect(screen.getByText(/Solo un Test Manager del workspace crea/)).toBeInTheDocument();
    expect(screen.queryByTestId("project-token-new")).toBeNull();
    expect(within(table).queryByRole("button")).toBeNull();
  });
});

describe("Mi perfil › Tokens personales", () => {
  it("creates a token for all of the person's workspaces", async () => {
    serve({
      "GET /me/tokens": { body: { tokens: [] } },
      "POST /me/tokens": { status: 201, body: { token: "phr_pat_x", view: token({ kind: "personal", id: "t9" }) } },
    });
    const { container } = renderWithProviders(<PersonalTokensSection workspaces={[{ id: "ws-t", name: "QA Pagos" }]} />);
    expect(await screen.findByText("Todavía no tienes tokens personales.")).toBeInTheDocument();
    await expectNoAxeViolations(container);
    await userEvent.click(screen.getByTestId("personal-token-new"));
    await userEvent.type(screen.getByTestId("token-name"), "Portátil");
    await userEvent.click(screen.getByTestId("token-create"));
    await waitFor(() => expect(requests.find((r) => r.method === "POST")?.body).toMatchObject({ name: "Portátil", workspaceId: null }));
    expect(await screen.findByTestId("token-secret")).toHaveTextContent("phr_pat_x");
  });
});

describe("Administración › Usuarios", () => {
  it("revokes every live token of an account after saying which", async () => {
    serve({
      "GET /admin/users/u2/tokens": {
        body: { tokens: [token(), token({ id: "t3", kind: "personal", name: "Portátil", workspaceName: null }), token({ id: "t4", status: "revoked" })] },
      },
      "POST /admin/users/u2/tokens/revoke": { body: { revoked: 2 } },
    });
    renderWithProviders(<AdminRevokeTokensButton userId="u2" name="Carlos" />);
    await userEvent.click(screen.getByTestId("admin-revoke-tokens-u2"));
    const dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"));
    expect(dialog).toHaveTextContent("Vas a revocar 2 tokens de Carlos");
    expect(dialog).toHaveTextContent("«CI GitHub · pagos-web» (QA Pagos)");
    await userEvent.click(within(dialog).getByRole("button", { name: "Revocar 2 tokens" }));
    await waitFor(() => expect(requests.some((r) => r.path === "/admin/users/u2/tokens/revoke")).toBe(true));
  });
});
