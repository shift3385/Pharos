// Administración › Auditoría (AUD-01): the account's log with its filters,
// the detail of an event (before and after), the check of the hash chains,
// and the history of one element.
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@test/slow";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { setViewportWidth } from "@test/viewport";
import { ToastProvider } from "@shared/ui/Toast";
import type { AuditRow, AuditVerify } from "../../model/audit";
import { WorkspaceContext } from "@modules/workspaces";
import { AuditTab } from "./AuditTab";

const api = vi.hoisted(() => ({ list: vi.fn(), facets: vi.fn(), verify: vi.fn() }));
vi.mock("../../api/auditApi", () => ({ auditApi: api }));

const ME = "test-user";
const row = (over: Partial<AuditRow>): AuditRow => ({
  id: "e1",
  at: "2026-11-12T10:42:07.000Z",
  actor: "agent:planner-01",
  onBehalfOf: `user:${ME}`,
  action: "update",
  entity: "test_case",
  entityId: "c1",
  entityKey: "ATS_014",
  projectId: "p1",
  projectName: "Portal clientes",
  deviceId: "dev-1",
  changes: '{"status":["draft","ready"],"steps":[["Pulsa Entrar"],["Pulsa Entrar con SSO","Acepta"]]}',
  summary: null,
  chainWorkspaceId: "w",
  chainOwner: ME,
  chainSeq: 7,
  prevHash: "aaaaaaaaaaaaaaaa",
  hash: "bbbbbbbbbbbbbbbb",
  redactedAt: null,
  ...over,
});

const EVENTS = [
  row({}),
  row({
    id: "e2",
    actor: `user:${ME}`,
    onBehalfOf: null,
    action: "import",
    entity: "requirement",
    entityId: "imp",
    entityKey: null,
    changes: "{}",
    summary: '{"created":42,"updated":3}',
    deviceId: "web",
    chainSeq: 6,
  }),
];

const OK: AuditVerify = {
  thisDevice: "dev-1",
  chains: [{ deviceId: "dev-1", chainWorkspaceId: "w", chainOwner: ME, count: 7, lastAt: EVENTS[0].at, broken: null }],
};

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{`${pathname}${search}`}</output>;
}

function render() {
  return renderWithProviders(
    <ToastProvider>
      <AuditTab />
      <Where />
    </ToastProvider>,
    { route: "/admin?tab=audit" },
  );
}

describe("Administración › Auditoría (AUD-01)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    api.list.mockReset().mockResolvedValue({ total: 2, events: EVENTS });
    api.facets.mockReset().mockResolvedValue({
      actors: ["agent:planner-01", `user:${ME}`],
      entities: ["requirement", "test_case"],
      actions: ["import", "update"],
      projects: [{ id: "p1", name: "Portal clientes" }],
      thisDevice: "dev-1",
    });
    api.verify.mockReset().mockResolvedValue(OK);
  });

  it("lists the account's events of the last 30 days and says the chain is intact", async () => {
    render();
    expect(await screen.findByText("ATS_014")).toBeInTheDocument();
    expect(screen.getByText("Agente planner-01")).toBeInTheDocument();
    expect(screen.getByText("en nombre de Quality Analyst")).toBeInTheDocument();
    expect(screen.getByText("Editado")).toBeInTheDocument();
    expect(screen.getByText("Importado")).toBeInTheDocument();
    expect(screen.getAllByText("Este equipo").length).toBeGreaterThan(0);
    expect(within(screen.getByTestId("audit-integrity")).getByText("Registro íntegro.")).toBeInTheDocument();
    expect(within(screen.getByTestId("audit-integrity")).getByText(/^1 cadena, 7 eventos comprobados/)).toBeInTheDocument();
    const [userId, query] = api.list.mock.calls[0];
    expect(userId).toBe(ME);
    expect(query.from).toBeTruthy();
    expect(query).toMatchObject({ offset: 0, limit: 50 });
    await expectNoAxeViolations();
  });

  it("opens an event and shows before and after field by field", async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByTestId("audit-row-e1"));
    const dialog = await screen.findByRole("dialog");
    const diff = within(dialog).getByRole("table", { name: "Cambios campo a campo" });
    expect(within(diff).getByText("draft").tagName).toBe("S");
    expect(within(diff).getByText("ready")).toBeInTheDocument();
    expect(within(diff).getByText("Pulsa Entrar con SSO")).toBeInTheDocument();
    expect(within(dialog).getByText("✓ Eslabón válido")).toBeInTheDocument();
    await expectNoAxeViolations();

    // Its whole history: the list asks for that element, any date.
    await user.click(within(dialog).getByRole("button", { name: "Ver todo su historial" }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(ME, expect.objectContaining({ entityId: "c1" })));
    expect(api.list.mock.lastCall?.[1].from).toBeUndefined();
    expect(screen.getByTestId("where")).toHaveTextContent("/admin?tab=audit&period=all&element=c1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Historial de un elemento")).toBeInTheDocument();
  });

  it("shows the counts of an import instead of a diff", async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByTestId("audit-row-e2"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Creados")).toBeInTheDocument();
    expect(within(dialog).getByText("42")).toBeInTheDocument();
  });

  it("says a sync conflict was combined without asking, in the list and in the detail (ADR-0051)", async () => {
    const merged = row({
      id: "e3",
      actor: `user:${ME}`,
      onBehalfOf: null,
      action: "resolve_conflict",
      entity: "requirement",
      entityKey: "REQ-006",
      changes: '{"description":["Antes","Después"]}',
      summary: '{"resolution":"merged","auto":true,"fields":{"description":"remote"},"remoteRevision":4}',
    });
    api.list.mockResolvedValue({ total: 1, events: [merged] });
    setViewportWidth(1440);
    const user = userEvent.setup();
    render();
    const open = await screen.findByTestId("audit-row-e3");
    const listed = open.closest(".dt__row") as HTMLElement;
    expect(within(listed).getByText("Conflicto resuelto")).toBeInTheDocument();
    expect(within(listed).getByText("Se quedó: Combinado · Descripción")).toBeInTheDocument();
    await user.click(open);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("audit-resolution")).toHaveTextContent("Combinado · Sin preguntar");
    expect(within(dialog).getByRole("table", { name: "Cambios campo a campo" })).toBeInTheDocument();
  });

  it("gives the action column room for its longest label, «Conflicto resuelto» (FIX-39)", async () => {
    render();
    await screen.findByText("ATS_014");
    const table = screen.getByRole("table", { name: "Registro de auditoría" });
    expect(table.style.getPropertyValue("--dt-cols")).toContain("minmax(140px, 0.8fr)");
  });

  it("names the broken chain, the event and why, and marks its row", async () => {
    const user = userEvent.setup();
    api.verify.mockResolvedValue({
      thisDevice: "dev-1",
      chains: [
        { ...OK.chains[0], broken: { kind: "hash", seq: 7, expected: null, eventId: "e1", entityId: "c1" } },
        { deviceId: "web", chainWorkspaceId: "web", chainOwner: ME, count: 6, lastAt: null, broken: null },
      ],
    });
    render();
    const banner = await screen.findByTestId("audit-integrity");
    expect(await within(banner).findByText("La cadena de «Este equipo» está rota en el evento n.º 7.")).toBeInTheDocument();
    expect(within(banner).getByText(/Los datos del evento n.º 7 se modificaron fuera de Pharos/)).toBeInTheDocument();
    expect(await screen.findByText("⚠")).toBeInTheDocument();

    await user.click(within(banner).getByRole("button", { name: "Ver cadenas" }));
    const chains = within(banner).getByRole("table", { name: "Cadenas del registro" });
    expect(within(chains).getByText("Web")).toBeInTheDocument();
    expect(within(chains).getByText("Íntegra")).toBeInTheDocument();

    await user.click(within(banner).getByRole("button", { name: "Ver evento" }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(ME, expect.objectContaining({ entityId: "c1" })));

    await user.click(within(banner).getByRole("button", { name: "Comprobar de nuevo" }));
    await waitFor(() => expect(api.verify).toHaveBeenCalledTimes(2));
  });

  it("filters by element type through the URL", async () => {
    const user = userEvent.setup();
    render();
    await screen.findByText("ATS_014");
    await user.click(screen.getByRole("button", { name: "Elemento" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Requisito" }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(ME, expect.objectContaining({ entities: ["requirement"] })));
  });

  it("says when nothing matches", async () => {
    api.list.mockResolvedValue({ total: 0, events: [] });
    render();
    expect(await screen.findByText(/Ningún evento coincide con los filtros/)).toBeInTheDocument();
    expect(screen.getByTestId("audit-export")).toBeDisabled();
  });

  it("names a teammate, his review step and its fields (FIX-41)", async () => {
    const jorge = "db071500-0000-4000-8000-000000000000";
    const review = { state: "pending", sentBy: ME, sentAt: "2026-11-19T23:27:00Z", revision: 2, version: "1.0" };
    api.list.mockResolvedValue({
      total: 1,
      events: [
        row({
          actor: `user:${jorge}`,
          onBehalfOf: null,
          deviceId: "web",
          entityKey: "PH-004",
          changes: JSON.stringify({
            "data.approval": [null, { by: jorge, at: "2026-11-19T23:29:00Z", version: "1.0" }],
            "data.review": [review, { ...review, state: "approved" }],
            status: ["reviewed", "approved"],
          }),
        }),
      ],
    });
    const team = {
      id: "ws-t",
      name: "Equipo QA",
      kind: "shared" as const,
      role: "test_manager" as const,
      members: [
        { userId: jorge, email: "jorge@pharos.test", displayName: "", firstName: "Jorge L.", lastName: "Meneses Yero", role: "test_analyst" as const, addedAt: null },
      ],
    };
    renderWithProviders(
      <WorkspaceContext.Provider
        value={{ available: true, workspaces: [team], current: team, setCurrent: () => {}, role: "test_manager", can: () => true, reload: async () => {} }}
      >
        <ToastProvider>
          <AuditTab />
        </ToastProvider>
      </WorkspaceContext.Provider>,
      { route: "/admin?tab=audit" },
    );
    expect(await screen.findByText("PH-004")).toBeInTheDocument();
    expect(screen.getByText("Jorge L. Meneses Yero")).toBeInTheDocument();
    expect(screen.queryByText(/^Usuario /)).toBeNull();
    expect(screen.getByText("Aprobado")).toBeInTheDocument();
    expect(screen.queryByText("Editado")).toBeNull();
    // The fields by their names, never «approval, review».
    await userEvent.click(screen.getByTestId("audit-row-e1"));
    const diff = within(await screen.findByRole("dialog")).getByRole("table", { name: "Cambios campo a campo" });
    for (const name of ["Aprobación", "Revisión", "Estado"]) expect(within(diff).getByText(name)).toBeInTheDocument();
    expect(within(diff).queryByText(/^(approval|review)$/)).toBeNull();
  });
});
