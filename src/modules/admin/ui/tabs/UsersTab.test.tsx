import { describe, it, expect, vi, beforeEach } from "vitest";
import "@test/slow";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import { AdminPage } from "../AdminPage";
import { UsersTab } from "./UsersTab";

// Administración › Usuarios (SEC-11, SEC-09 by an administrator; ADR-0045).

vi.mock("@modules/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@modules/auth")>();
  return {
    ...actual,
    accountApi: {
      ...actual.accountApi,
      capabilities: vi.fn(),
      adminUsers: vi.fn(),
      adminReset: vi.fn(),
      setAdmin: vi.fn(),
      disableImpact: vi.fn(),
      setDisabled: vi.fn(),
    },
  };
});

import { accountApi, ApiError, type AdminUser } from "@modules/auth";

const person = (over: Partial<AdminUser>): AdminUser => ({
  id: "u",
  email: "x@pharos.dev",
  displayName: "X",
  firstName: "X",
  lastName: "Y",
  isAdmin: false,
  createdAt: "2026-11-05T10:00:00Z",
  recoveryCodes: { total: 10, remaining: 10 },
  workspaces: 1,
  disabled: null,
  ...over,
});
const ME = person({
  id: "test-user",
  email: "qa@pharos.dev",
  displayName: "QA",
  isAdmin: true,
});
const ANA = person({
  id: "ana",
  email: "ana.perez@pharos.dev",
  displayName: "Ana Pérez",
  recoveryCodes: { total: 0, remaining: 0 },
});

beforeEach(async () => {
  await i18n.changeLanguage("es");
  vi.clearAllMocks();
  setViewportWidth(1440);
  vi.mocked(accountApi.capabilities).mockResolvedValue({ emailReset: false });
  vi.mocked(accountApi.adminUsers).mockResolvedValue({
    users: [ME, ANA],
    total: 2,
    admins: 1,
  });
});

describe("the Usuarios tab", () => {
  it("is shown only to a server administrator", async () => {
    const { unmount } = renderWithProviders(<AdminPage />, {
      route: "/admin?tab=users",
    });
    expect(screen.queryByRole("tab", { name: /Usuarios/ })).toBeNull();
    // An administrator's tab in the URL of someone who is not one: the default.
    expect(screen.getByRole("tab", { name: /Motor de IA/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    unmount();
    renderWithProviders(<AdminPage />, {
      route: "/admin?tab=users",
      admin: true,
    });
    expect(screen.getByRole("tab", { name: /Usuarios/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByText("ana.perez@pharos.dev")).toBeInTheDocument();
  });

  it("lists the accounts; no reset for oneself; the last administrator stays", async () => {
    renderWithProviders(<UsersTab />, { admin: true });
    const mine = await screen.findByTestId("user-test-user");
    expect(
      within(mine).queryByRole("button", { name: "Restablecer contraseña…" }),
    ).toBeNull();
    expect(
      within(mine).getByRole("button", { name: "Quitar administrador" }),
    ).toBeDisabled();
    const ana = screen.getByTestId("user-ana");
    expect(within(ana).getByText("Sin códigos")).toBeInTheDocument();
    expect(
      within(ana).getByRole("button", { name: "Restablecer contraseña…" }),
    ).toBeEnabled();
    expect(screen.getByTestId("admins-count")).toHaveTextContent(
      "1 administrador",
    );
    await expectNoAxeViolations();
  });

  it("makes a link to hand over, shown once, when the server sends no email", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.adminReset).mockResolvedValue({
      delivery: "link",
      expiresAt: "2026-11-19T10:42:00Z",
      token: "tok123",
      link: "https://pharos.example.com/#/restablecer?token=tok123",
    });
    renderWithProviders(<UsersTab />, { admin: true });
    await user.click(
      within(await screen.findByTestId("user-ana")).getByRole("button", {
        name: "Restablecer contraseña…",
      }),
    );
    const confirm = screen.getByRole("dialog", {
      name: "¿Restablecer la contraseña de Ana Pérez?",
    });
    expect(confirm).toHaveTextContent("24 horas");
    await user.click(
      within(confirm).getByRole("button", { name: "Generar enlace" }),
    );
    const shown = await screen.findByRole("dialog", {
      name: "Enlace para Ana Pérez",
    });
    expect(within(shown).getByTestId("admin-reset-link")).toHaveTextContent(
      "https://pharos.example.com/#/restablecer?token=tok123",
    );
    expect(shown).toHaveTextContent("Solo se muestra ahora");
    expect(accountApi.adminReset).toHaveBeenCalledWith("ana", "link", "es");
    await user.click(within(shown).getByRole("button", { name: "Listo" }));
    await waitFor(() => expect(screen.queryByText(/tok123/)).toBeNull());
  });

  it("emails the link when the server can: the administrator never sees it", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.capabilities).mockResolvedValue({ emailReset: true });
    vi.mocked(accountApi.adminReset).mockResolvedValue({
      delivery: "email",
      expiresAt: "2026-11-19T10:42:00Z",
    });
    renderWithProviders(<UsersTab />, { admin: true });
    await user.click(
      within(await screen.findByTestId("user-ana")).getByRole("button", {
        name: "Restablecer contraseña…",
      }),
    );
    await waitFor(() => expect(accountApi.capabilities).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Generar enlace" }));
    const deliver = screen.getByRole("dialog", {
      name: "Enviar el enlace a Ana Pérez",
    });
    await user.click(
      within(deliver).getByRole("button", { name: "Enviar por correo" }),
    );
    expect(
      await screen.findByText(/Enlace enviado a ana.perez@pharos.dev/),
    ).toBeInTheDocument();
    expect(accountApi.adminReset).toHaveBeenCalledWith("ana", "email", "es");
    expect(screen.queryByTestId("admin-reset-link")).toBeNull();
  });

  it("names an administrator after confirming", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.setAdmin).mockResolvedValue({
      isAdmin: true,
      changed: true,
    });
    renderWithProviders(<UsersTab />, { admin: true });
    await user.click(
      within(await screen.findByTestId("user-ana")).getByRole("button", {
        name: "Hacer administrador",
      }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "¿Hacer administrador a Ana Pérez?",
    });
    expect(dialog).toHaveTextContent("No le da acceso a los proyectos");
    await user.click(
      within(dialog).getByRole("button", { name: "Hacer administrador" }),
    );
    await waitFor(() =>
      expect(accountApi.setAdmin).toHaveBeenCalledWith("ana", true),
    );
    expect(accountApi.adminUsers).toHaveBeenCalledTimes(2);
  });

  it("says so when the role was removed meanwhile", async () => {
    vi.mocked(accountApi.adminUsers).mockRejectedValue(
      new ApiError(403, "admin_required", "x"),
    );
    renderWithProviders(<UsersTab />, { admin: true });
    expect(
      await screen.findByText("Ya no eres administrador de este servidor."),
    ).toBeInTheDocument();
  });

  // SEC-12: disabling and re-enabling an account.
  it("disables an account: a successor per workspace and the email typed first", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.disableImpact).mockResolvedValue({
      lastAdmin: false,
      managedAlone: [
        {
          workspaceId: "w1",
          name: "QA Móvil",
          members: 2,
          candidates: [
            { userId: "bea", displayName: "Bea", role: "test_analyst" },
          ],
        },
        { workspaceId: "w2", name: "Prototipos", members: 1, candidates: [] },
      ],
    });
    vi.mocked(accountApi.setDisabled).mockResolvedValue({
      disabled: true,
      changed: true,
    });
    renderWithProviders(<UsersTab />, { admin: true });
    expect(
      within(await screen.findByTestId("user-test-user")).queryByRole(
        "button",
        { name: "Desactivar cuenta…" },
      ),
    ).toBeNull();
    await user.click(
      within(screen.getByTestId("user-ana")).getByRole("button", {
        name: "Desactivar cuenta…",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Desactivar la cuenta de Ana Pérez",
    });
    expect(
      await within(dialog).findByText(
        /Es el único Test Manager activo de 2 workspaces/,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByTestId("managed-w2")).toHaveTextContent(
      "Sin otros miembros activos",
    );
    const go = within(dialog).getByRole("button", {
      name: "Desactivar cuenta",
    });
    expect(go).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Motivo/), "dejó el equipo");
    await user.type(
      within(dialog).getByLabelText(/para confirmar/),
      "ana.perez@pharos.dev",
    );
    expect(go).toBeDisabled();
    await user.click(
      within(dialog).getByRole("combobox", { name: "Nuevo Test Manager" }),
    );
    await user.click(await screen.findByRole("option", { name: /Bea/ }));
    expect(go).toBeEnabled();
    await expectNoAxeViolations();
    await user.click(go);
    await waitFor(() =>
      expect(accountApi.setDisabled).toHaveBeenCalledWith("ana", {
        disabled: true,
        reason: "dejó el equipo",
        successors: [{ workspaceId: "w1", userId: "bea" }],
      }),
    );
  });

  it("shows a disabled account and enables it again", async () => {
    const user = userEvent.setup();
    const off = person({
      id: "marcos",
      email: "marcos@pharos.dev",
      displayName: "Marcos",
      disabled: { at: "2026-11-18T10:00:00Z", byName: "QA", reason: "baja" },
    });
    vi.mocked(accountApi.adminUsers).mockResolvedValue({
      users: [ME, off],
      total: 2,
      admins: 1,
      disabled: 1,
    });
    vi.mocked(accountApi.setDisabled).mockResolvedValue({
      disabled: false,
      changed: true,
    });
    renderWithProviders(<UsersTab />, { admin: true });
    const row = await screen.findByTestId("user-marcos");
    expect(within(row).getByText(/Desactivada/)).toHaveAttribute(
      "title",
      "Por QA · Motivo: baja",
    );
    expect(
      within(row).queryByRole("button", { name: "Restablecer contraseña…" }),
    ).toBeNull();
    await user.click(
      within(row).getByRole("button", { name: "Reactivar cuenta" }),
    );
    await user.click(
      within(
        screen.getByRole("alertdialog", {
          name: "¿Reactivar la cuenta de Marcos?",
        }),
      ).getByRole("button", {
        name: "Reactivar",
      }),
    );
    await waitFor(() =>
      expect(accountApi.setDisabled).toHaveBeenCalledWith("marcos", {
        disabled: false,
      }),
    );
  });

  it("lists active accounts by default and filters by state", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersTab />, { admin: true });
    await screen.findByTestId("user-ana");
    expect(accountApi.adminUsers).toHaveBeenLastCalledWith("", 0, 50, "active");
    await user.click(screen.getByRole("radio", { name: "Desactivadas" }));
    await waitFor(() =>
      expect(accountApi.adminUsers).toHaveBeenLastCalledWith(
        "",
        0,
        50,
        "disabled",
      ),
    );
  });
});
