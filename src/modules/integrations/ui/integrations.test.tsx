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
    const created = screen.getByRole("dialog");
    expect(within(created).getByText(/PHAROS_TOKEN/)).toBeInTheDocument();
    // The full step is in «Conectar CI», not repeated in the dialog.
    expect(within(created).getByText(/Conectar CI/)).toBeInTheDocument();
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
    // The command for the CLI, without the token.
    expect(screen.getByTestId("use-in-cli")).toHaveTextContent(/pharos login --server /);
    expect(screen.getByTestId("use-in-cli")).not.toHaveTextContent("phr_pat_x");
  });
});

describe("Workspace › Integraciones › Conectar CI", () => {
  it("builds the GitHub Actions step for a project and the formats chosen, without a token", async () => {
    serve({
      "GET /workspaces": { body: { workspaces: [team("viewer")] } },
      "GET /workspaces/ws-t/tokens": {
        body: { tokens: [token()], projects: [{ id: "p1", name: "Pagos Web" }, { id: "p2", name: "Móvil" }] },
      },
      "GET /workspaces/ws-t/webhooks": { body: { webhooks: [], available: true } },
    });
    const { container } = integrationsTab();
    const yaml = await screen.findByTestId("ci-yaml");
    expect(yaml).toHaveTextContent("uses: shift3385/Pharos/.github/actions/pharos-report@");
    expect(yaml).toHaveTextContent("project: p1 # Pagos Web");
    for (const path of ["test-results/*.xml", "reports/*.sarif", "reports/k6-summary.json", "reports/axe.json"]) {
      expect(yaml).toHaveTextContent(path);
    }
    expect(yaml).not.toHaveTextContent("phr_");
    expect(yaml).toHaveTextContent("${{ secrets.PHAROS_TOKEN }}");
    await expectNoAxeViolations(container);

    // Fewer formats, more formats.
    await userEvent.click(screen.getByTestId("ci-format-k6"));
    await userEvent.click(screen.getByTestId("ci-format-ctrf"));
    expect(yaml).not.toHaveTextContent("reports/k6-summary.json");
    expect(yaml).toHaveTextContent("ctrf/*.json");

    // A viewer is told who creates the token.
    expect(screen.getByTestId("connect-ci")).toHaveTextContent("Pídeselo a un Test Manager");

    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await userEvent.click(screen.getByTestId("ci-copy"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("- name: Subir a Pharos"));
    // FIX-41: what is shown is exactly what is copied, and each line wraps
    // under its own text (hanging indent), never at column 0.
    const copied = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(yaml.textContent).toBe(copied);
    const lines = [...yaml.querySelectorAll<HTMLElement>(".int-snippet__line")];
    expect(lines).toHaveLength(copied.split("\n").length);
    const uses = lines.find((l) => l.textContent?.trimStart().startsWith("uses:"));
    const indent = uses!.textContent!.length - uses!.textContent!.trimStart().length;
    expect(uses!.style.paddingLeft).toBe(`${indent + 2}ch`);
    expect(uses!.style.textIndent).toBe(`-${indent + 2}ch`);
    // FIX-49: the address and the SHA placeholder are code, whole on one line.
    expect(screen.getByTestId("ci-url")).toHaveClass("int-code");
    const sha = /<[^>]*SHA[^>]*>/.exec(copied)?.[0];
    if (sha) {
      const codes = [
        ...screen.getByTestId("connect-ci").querySelectorAll(".int-code"),
      ].map((c) => c.textContent);
      expect(codes).toContain(sha);
    }
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

// ---- webhooks (INT-03, bocetos 4-6) ------------------------------------------

const hook = (over: Record<string, unknown> = {}) => ({
  id: "h1",
  workspaceId: "ws-t",
  name: "Bot de PRs",
  url: "https://ci.empresa.com/pharos",
  projectId: null,
  projectName: null,
  events: ["run.results_uploaded", "run.completed"],
  active: true,
  disabledReason: null,
  consecutiveFailures: 0,
  rotating: false,
  lastDelivery: { status: "delivered", httpStatus: 200, at: "2026-11-18T10:00:00.000Z" },
  createdAt: "2026-11-18T09:00:00.000Z",
  ...over,
});

describe("Workspace › Integraciones › Webhooks", () => {
  it("a Test Manager creates a webhook and sees its secret once", async () => {
    serve({
      "GET /workspaces": { body: { workspaces: [team("test_manager")] } },
      "GET /workspaces/ws-t/tokens": { body: { tokens: [], projects: [{ id: "p1", name: "Pagos Web" }] } },
      "GET /workspaces/ws-t/webhooks": { body: { webhooks: [hook()], enabled: true } },
      "POST /workspaces/ws-t/webhooks": (body) => ({ status: 201, body: { secret: "whsec_c2VjcmV0", view: hook({ id: "h2", ...(body as object) }) } }),
    });
    const { container } = integrationsTab();
    const table = await screen.findByTestId("webhooks-table");
    expect(within(table).getByText("Bot de PRs")).toBeInTheDocument();
    expect(within(table).getByText("200")).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await userEvent.click(screen.getByTestId("webhook-new"));
    await userEvent.type(screen.getByTestId("webhook-name"), "Slack");
    await userEvent.type(screen.getByTestId("webhook-url"), "https://hooks.slack.com/x");
    await userEvent.click(screen.getByTestId("webhook-event-defect.created"));
    await userEvent.click(screen.getByTestId("webhook-save"));
    await waitFor(() =>
      expect(requests.find((r) => r.method === "POST" && r.path === "/workspaces/ws-t/webhooks")?.body).toMatchObject({
        name: "Slack",
        url: "https://hooks.slack.com/x",
        projectId: null,
        events: ["run.results_uploaded", "run.completed", "defect.created"],
      }),
    );
    expect(await screen.findByTestId("webhook-secret")).toHaveTextContent("whsec_c2VjcmV0");
    expect(screen.getByTestId("webhook-secret-done")).toBeDisabled();
  });

  it("says why a target is refused", async () => {
    serve({
      "GET /workspaces": { body: { workspaces: [team("test_manager")] } },
      "GET /workspaces/ws-t/tokens": { body: { tokens: [], projects: [] } },
      "GET /workspaces/ws-t/webhooks": { body: { webhooks: [], enabled: true } },
      "POST /workspaces/ws-t/webhooks": { status: 400, body: { code: "webhook_url", reason: "private", message: "x" } },
    });
    integrationsTab();
    await userEvent.click(await screen.findByTestId("webhook-new"));
    await userEvent.type(screen.getByTestId("webhook-name"), "Jenkins");
    await userEvent.type(screen.getByTestId("webhook-url"), "https://10.0.0.5/hook");
    await userEvent.click(screen.getByTestId("webhook-save"));
    expect(await screen.findByText(/no permite enviar a direcciones de la red privada/)).toBeInTheDocument();
  });

  it("shows a webhook disabled after failures and turns it on again", async () => {
    serve({
      "GET /workspaces": { body: { workspaces: [team("test_manager")] } },
      "GET /workspaces/ws-t/tokens": { body: { tokens: [], projects: [] } },
      "GET /workspaces/ws-t/webhooks": { body: { webhooks: [hook({ active: false, disabledReason: "failures", consecutiveFailures: 50 })], enabled: true } },
      "PATCH /workspaces/ws-t/webhooks/h1": { body: hook() },
    });
    integrationsTab();
    const table = await screen.findByTestId("webhooks-table");
    expect(within(table).getByText("Desactivado tras 50 fallos")).toBeInTheDocument();
    await userEvent.click(within(table).getByRole("button", { name: "Activar" }));
    await waitFor(() => expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ active: true }));
  });

  it("lists the deliveries with the target's answer and retries one", async () => {
    serve({
      "GET /workspaces": { body: { workspaces: [team("test_manager")] } },
      "GET /workspaces/ws-t/tokens": { body: { tokens: [], projects: [] } },
      "GET /workspaces/ws-t/webhooks": { body: { webhooks: [hook()], enabled: true } },
      "GET /workspaces/ws-t/webhooks/h1/deliveries": {
        body: {
          deliveries: [
            {
              id: "d1",
              eventType: "run.completed",
              status: "failed",
              attempt: 3,
              nextAttemptAt: "2026-11-18T10:10:00.000Z",
              lastStatus: 503,
              lastError: null,
              lastDurationMs: 10000,
              lastResponse: "upstream unavailable",
              createdAt: "2026-11-18T10:00:00.000Z",
              deliveredAt: null,
              payload: { type: "run.completed", data: { run: { key: "RUN-042" } } },
            },
          ],
        },
      },
      "POST /workspaces/ws-t/webhooks/h1/deliveries/d1/redeliver": { status: 202, body: { queued: true } },
    });
    integrationsTab();
    const table = await screen.findByTestId("webhooks-table");
    await userEvent.click(within(table).getByRole("button", { name: "Entregas" }));
    const detail = await screen.findByTestId("delivery-detail");
    expect(detail).toHaveTextContent("upstream unavailable");
    expect(detail).toHaveTextContent("RUN-042");
    await userEvent.click(screen.getByTestId("delivery-redeliver"));
    await waitFor(() => expect(requests.some((r) => r.path.endsWith("/d1/redeliver"))).toBe(true));
  });

  it("others read the list without actions; a server without the key says so", async () => {
    serve({
      "GET /workspaces": { body: { workspaces: [team("automation_engineer")] } },
      "GET /workspaces/ws-t/tokens": { body: { tokens: [], projects: [] } },
      "GET /workspaces/ws-t/webhooks": { body: { webhooks: [hook({ url: "ci.empresa.com" })], enabled: false } },
    });
    integrationsTab();
    const table = await screen.findByTestId("webhooks-table");
    expect(within(table).getByText("ci.empresa.com")).toBeInTheDocument();
    expect(within(table).queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("webhook-new")).toBeNull();
    expect(screen.getByText(/no están disponibles en este servidor/)).toBeInTheDocument();
  });
});
