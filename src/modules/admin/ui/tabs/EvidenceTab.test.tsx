// Administración → Evidencias (DAT-03b): the store's usage, «Verificar
// evidencias» and its report, and deleting files without a record only after
// picking them and confirming. Desktop only: the web shows a note.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { setViewportWidth } from "@test/viewport";
import { ToastProvider } from "@shared/ui/Toast";
import { formatBytes, type EvidenceReport, type EvidenceUsage } from "../../model/evidence";
import { EvidenceTab } from "./EvidenceTab";

const desktop = vi.hoisted(() => ({ on: true }));
vi.mock("@shared/platform", async (orig) => {
  const real = await orig<typeof import("@shared/platform")>();
  return { ...real, capabilities: { ...real.capabilities, localStore: () => desktop.on } };
});

const api = vi.hoisted(() => ({
  usage: vi.fn(),
  progress: vi.fn(),
  check: vi.fn(),
  cancel: vi.fn(),
  deleteOrphans: vi.fn(),
  retention: vi.fn(),
  setRetention: vi.fn(),
  projects: vi.fn(),
}));
vi.mock("../../api/evidenceApi", () => ({
  EVIDENCE_CHECK_BUSY: "evidence-check-busy",
  EVIDENCE_DB_CHANGED: "evidence-db-changed",
  evidenceApi: api,
}));

const MB = 1024 * 1024;
const ORPHAN = `ab/ab${"1".repeat(62)}.pev`;
const RECENT = `cd/cd${"2".repeat(62)}.pev`;

function usage(over: Partial<EvidenceUsage> = {}): EvidenceUsage {
  return {
    blobs: 3,
    bytes: 12 * MB,
    byState: [{ state: "present", blobs: 3, bytes: 12 * MB }],
    byOwner: [
      { ownerEntity: "defect", attachments: 2, bytes: 2 * MB },
      { ownerEntity: "run_shard", attachments: 1, bytes: 10 * MB },
    ],
    expired: 4,
    rawReportDays: 90,
    rawReportOverrides: [{ projectId: "p1", projectName: "Tienda", days: 30 }],
    rawReports: 1,
    rawReportsExpired: 4,
    last: null,
    ...over,
  };
}

const use = {
  attachmentId: "a1",
  name: "captura.png",
  kind: "evidence",
  ownerEntity: "defect",
  ownerId: "d1",
  ownerLabel: "DEF-001 · Falla el pago",
  projectId: "p1",
  projectName: "Tienda",
};

function report(over: Partial<EvidenceReport> = {}): EvidenceReport {
  return {
    checkedAt: "2026-11-04T10:00:00Z",
    checked: 3,
    total: 3,
    bytes: 12 * MB,
    cancelled: false,
    orphans: [
      { file: ORPHAN, size: 2048, modified: "2026-10-01T10:00:00Z", recent: false },
      { file: RECENT, size: 100, modified: "2026-11-04T09:00:00Z", recent: true },
    ],
    missing: [{ file: `ef/ef${"3".repeat(62)}.pev`, size: 10, uses: [use] }],
    damaged: [{ file: `01/01${"4".repeat(62)}.pev`, size: 20, uses: [] }],
    newer: [],
    unreadable: [],
    marked: 2,
    restored: 0,
    ...over,
  };
}

function renderTab() {
  return renderWithProviders(
    <ToastProvider>
      <EvidenceTab />
    </ToastProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("es");
  desktop.on = true;
  vi.clearAllMocks();
  api.usage.mockResolvedValue(usage());
  // No check running when the tab opens.
  api.progress.mockResolvedValue({ running: false, filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0 });
  api.check.mockResolvedValue(report());
  api.cancel.mockResolvedValue(undefined);
  api.deleteOrphans.mockResolvedValue({ deleted: 1, bytes: 2048, skipped: [], saved: true });
  api.projects.mockResolvedValue([
    { id: "p1", name: "Tienda" },
    { id: "p2", name: "Pagos" },
  ]);
  api.retention.mockImplementation((projectId: string) => Promise.resolve(retention(projectId)));
  api.setRetention.mockImplementation((projectId: string, kind: string, policy: { mode: string; days?: number }) =>
    Promise.resolve(
      retention(projectId, {
        [kind]: policy.mode === "default" ? undefined : policy.mode === "always" ? null : (policy.days ?? null),
      }),
    ),
  );
});

const DEFAULTS: [string, number | null][] = [
  ["trace", 30],
  ["video", 30],
  ["raw_report", 90],
  ["log", 90],
  ["screenshot", null],
  ["evidence", null],
];

/** The retention of a project; `custom` maps a kind to its own days
 *  (null = always). */
function retention(projectId: string, custom: Record<string, number | null | undefined> = {}) {
  return {
    projectId,
    kinds: DEFAULTS.map(([kind, defaultDays]) => {
      const own = custom[kind];
      return {
        kind,
        defaultDays,
        days: own === undefined ? defaultDays : own,
        custom: own !== undefined,
      };
    }),
  };
}

describe("Administración → Evidencias", () => {
  it("on the web only says it is a desktop feature", () => {
    desktop.on = false;
    renderTab();
    expect(screen.getByTestId("evidence-desktop-only")).toHaveTextContent("solo están en la app de escritorio");
    expect(screen.queryByTestId("evidence-verify")).not.toBeInTheDocument();
    expect(api.usage).not.toHaveBeenCalled();
  });

  it("shows the usage by owner and the raw report retention", async () => {
    renderTab();
    expect(await screen.findByTestId("evidence-usage-total")).toHaveTextContent("12 MB · 3 archivos");
    const table = screen.getByRole("table", { name: "Adjuntos por tipo" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(["Defectos22 MB", "Reportes de ejecución110 MB"]);
    const usageCard = screen.getByTestId("evidence-usage");
    expect(usageCard).toHaveTextContent("Por defecto: 90 días");
    expect(usageCard).toHaveTextContent("Tienda: 30 días");
    expect(usageCard).toHaveTextContent("1 guardados · 4 caducados");
  });

  it("verifies on demand and lists what it found, with where it is used", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByTestId("evidence-verify"));
    expect(api.check).toHaveBeenCalledWith("test-user");
    const found = await screen.findByTestId("evidence-report");
    expect(found).toHaveTextContent("3 archivos, 12 MB");
    expect(found).toHaveTextContent("Marcados ahora: 2");
    const missing = screen.getByTestId("evidence-missing");
    expect(missing).toHaveTextContent("Faltan (1)");
    expect(missing).toHaveTextContent("captura.png");
    expect(missing).toHaveTextContent("Defectos · DEF-001 · Falla el pago");
    expect(within(missing).getByRole("link", { name: "Abrir Defectos" })).toHaveAttribute(
      "href",
      "/projects/p1/defects",
    );
    expect(screen.getByTestId("evidence-damaged")).toHaveTextContent("Sin adjuntos vigentes.");
    // A recent orphan cannot be picked.
    const orphans = screen.getByTestId("evidence-orphans");
    expect(within(orphans).getByRole("checkbox", { name: "Seleccionar Archivo cd2222222222" })).toBeDisabled();
    expect(within(orphans).getByText("Reciente")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-repair")).toBeDisabled();
  });

  it("deletes only the orphans picked, after confirming", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByTestId("evidence-verify"));
    const orphans = await screen.findByTestId("evidence-orphans");
    await user.click(within(orphans).getByRole("checkbox", { name: "Seleccionar Archivo ab1111111111" }));
    await user.click(screen.getByTestId("evidence-repair"));
    const dialog = screen.getByRole("alertdialog", { name: "¿Borrar 1 archivo sin registro?" });
    expect(dialog).toHaveTextContent("no se pueden recuperar");
    // Cancelling deletes nothing.
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(api.deleteOrphans).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("evidence-repair"));
    await user.click(screen.getByTestId("evidence-confirm"));
    expect(api.deleteOrphans).toHaveBeenCalledWith([ORPHAN], "test-user");
    expect(await screen.findByText("Se borró 1 archivo (2 KB).", { exact: false })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("evidence-orphans")).toHaveTextContent("Archivos sin registro (1)"),
    );
  });

  it("says why an orphan was skipped", async () => {
    api.deleteOrphans.mockResolvedValue({
      deleted: 0,
      bytes: 0,
      skipped: [{ file: ORPHAN, reason: "in_use" }],
      saved: true,
    });
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByTestId("evidence-verify"));
    const orphans = await screen.findByTestId("evidence-orphans");
    await user.click(within(orphans).getByRole("checkbox", { name: "Seleccionar Archivo ab1111111111" }));
    await user.click(screen.getByTestId("evidence-repair"));
    await user.click(screen.getByTestId("evidence-confirm"));
    expect(
      await screen.findByText("1 se omitió: abierto por otro programa (solo se detecta en Windows).", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("evidence-orphans")).toHaveTextContent("Archivos sin registro (2)");
  });

  it("says when another check is running", async () => {
    api.check.mockRejectedValue("evidence-check-busy: a check or a repair of the evidence is running");
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByTestId("evidence-verify"));
    expect(await screen.findByText("Ya hay una verificación o una reparación en curso.", { exact: false })).toBeInTheDocument();
  });

  it("shows the last check of the session and «Todo en orden» when clean", async () => {
    api.usage.mockResolvedValue(
      usage({ last: report({ orphans: [], missing: [], damaged: [], marked: 0 }) }),
    );
    renderTab();
    expect(await screen.findByTestId("evidence-report")).toHaveTextContent("Todo en orden");
  });

  it("shows the counts the last check marked, also after a restart", async () => {
    api.usage.mockResolvedValue(
      usage({
        byState: [
          { state: "present", blobs: 3, bytes: 12 * MB },
          { state: "missing", blobs: 2, bytes: 10 },
          { state: "damaged", blobs: 1, bytes: 20 },
        ],
      }),
    );
    renderTab();
    const marked = await screen.findByTestId("evidence-marked");
    await waitFor(() => expect(marked).toHaveTextContent("2 faltan"));
    expect(marked).toHaveTextContent("1 dañado");
  });

  it("says why the usage could not be read", async () => {
    api.usage.mockRejectedValue("evidence store locked");
    renderTab();
    expect(await screen.findByTestId("evidence-usage-error")).toHaveTextContent(
      "No se pudo leer el almacén de evidencias: evidence store locked",
    );
  });

  it("says why a check failed", async () => {
    api.check.mockRejectedValue("disk error");
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByTestId("evidence-verify"));
    expect(
      await screen.findByText("No se pudo verificar las evidencias: disk error", { exact: false }),
    ).toBeInTheDocument();
  });

  it("announces only the start and the end of a check", async () => {
    let finish: (r: EvidenceReport) => void = () => {};
    api.check.mockReturnValue(new Promise((r) => (finish = r)));
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByTestId("evidence-verify"));
    const live = screen.getByTestId("evidence-announce");
    expect(live).toHaveAttribute("role", "status");
    expect(live).toHaveTextContent("Verificación de evidencias en curso.");
    // The progress line is outside the live region.
    expect(live).not.toHaveTextContent("archivos");
    finish(report());
    await waitFor(() => expect(live).toHaveTextContent("Verificación de evidencias terminada."));
  });

  it("cancels a check and says how far it got", async () => {
    let finish: (r: EvidenceReport) => void = () => {};
    api.check.mockReturnValue(new Promise((r) => (finish = r)));
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByTestId("evidence-verify"));
    await user.click(screen.getByTestId("evidence-cancel"));
    expect(api.cancel).toHaveBeenCalled();
    expect(screen.getByTestId("evidence-cancel")).toBeDisabled();
    finish(report({ cancelled: true, checked: 1, total: 3 }));
    expect(await screen.findByTestId("evidence-cancelled")).toHaveTextContent(
      "se comprobaron 1 de 3 archivos",
    );
    expect(screen.queryByTestId("evidence-cancel")).not.toBeInTheDocument();
    expect(screen.getByTestId("evidence-report")).not.toHaveTextContent("Todo en orden");
  });

  it("follows a check that was already running when the tab opened", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.progress
        .mockResolvedValueOnce({ running: true, filesDone: 1, filesTotal: 4, bytesDone: MB, bytesTotal: 4 * MB })
        .mockResolvedValueOnce({ running: true, filesDone: 2, filesTotal: 4, bytesDone: 2 * MB, bytesTotal: 4 * MB })
        .mockResolvedValue({ running: false, filesDone: 4, filesTotal: 4, bytesDone: 4 * MB, bytesTotal: 4 * MB });
      renderTab();
      expect(await screen.findByTestId("evidence-cancel")).toBeInTheDocument();
      expect(screen.getByTestId("evidence-verify")).toBeDisabled();
      // When it ends, its report comes with the usage.
      api.usage.mockResolvedValue(usage({ last: report() }));
      await vi.advanceTimersByTimeAsync(1600);
      expect(await screen.findByTestId("evidence-report")).toBeInTheDocument();
      expect(screen.queryByTestId("evidence-cancel")).not.toBeInTheDocument();
      expect(api.check).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says when deleted files could not be saved in the audit yet", async () => {
    api.deleteOrphans.mockResolvedValue({ deleted: 1, bytes: 2048, skipped: [], saved: false });
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByTestId("evidence-verify"));
    const orphans = await screen.findByTestId("evidence-orphans");
    await user.click(within(orphans).getByRole("checkbox", { name: "Seleccionar Archivo ab1111111111" }));
    await user.click(screen.getByTestId("evidence-repair"));
    await user.click(screen.getByTestId("evidence-confirm"));
    expect(await screen.findByText("Se borró 1 archivo (2 KB).", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Los archivos se borraron, pero", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("No se pudieron borrar", { exact: false })).not.toBeInTheDocument();
  });

  it("deletes nothing when another Pharos changed the database", async () => {
    api.deleteOrphans.mockRejectedValue("evidence-db-changed: the database file changed on disk");
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByTestId("evidence-verify"));
    const orphans = await screen.findByTestId("evidence-orphans");
    await user.click(within(orphans).getByRole("checkbox", { name: "Seleccionar Archivo ab1111111111" }));
    await user.click(screen.getByTestId("evidence-repair"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("solo en Windows");
    await user.click(screen.getByTestId("evidence-confirm"));
    expect(
      await screen.findByText("No se borró nada: la base de datos cambió en disco", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("evidence-orphans")).toHaveTextContent("Archivos sin registro (2)");
  });

  it("formats sizes in the UI language", () => {
    expect(formatBytes(1536, "es")).toBe("1,5 KB");
    expect(formatBytes(1536, "en")).toBe("1.5 KB");
    expect(formatBytes(12, "es")).toBe("12 B");
  });

  for (const width of [390, 600, 1280]) {
    it(`passes axe with a report at ${width} px`, async () => {
      setViewportWidth(width);
      const user = userEvent.setup();
      renderTab();
      await user.click(await screen.findByTestId("evidence-verify"));
      await screen.findByTestId("evidence-report");
      await expectNoAxeViolations();
    });
  }

  it("reads in English", async () => {
    await i18n.changeLanguage("en");
    renderTab();
    expect(await screen.findByTestId("evidence-usage-total")).toHaveTextContent("12 MB · 3 files");
    expect(screen.getByTestId("evidence-verify")).toHaveTextContent("Verify evidence");
  });

  it("sets the retention of each kind per project, on this device only", async () => {
    const user = userEvent.setup();
    renderTab();
    const card = await screen.findByTestId("evidence-retention");
    expect(within(card).getByTestId("evidence-retention-device")).toHaveTextContent("solo de este equipo");
    expect(within(card).getByTestId("evidence-retention-exceptions")).toHaveTextContent(
      "resultado final fallido o bloqueado",
    );
    const trace = await within(card).findByTestId("evidence-retention-trace");
    expect(trace).toHaveValue("default");
    expect(within(trace).getByRole("option", { name: "Por defecto (30 días)" })).toBeInTheDocument();
    await waitFor(() => expect(api.retention).toHaveBeenCalledWith("p1", expect.any(String)));

    await user.selectOptions(within(card).getByTestId("evidence-retention-video"), "always");
    expect(api.setRetention).toHaveBeenCalledWith("p1", "video", { mode: "always" }, expect.any(String));
    expect(await screen.findByText("Retención guardada en este equipo.", { exact: false })).toBeInTheDocument();

    await user.selectOptions(trace, "days");
    const days = within(card).getByTestId("evidence-retention-trace-days");
    await user.clear(days);
    await user.type(days, "10");
    await user.tab();
    expect(api.setRetention).toHaveBeenLastCalledWith("p1", "trace", { mode: "days", days: 10 }, expect.any(String));

    // Another project shows its own settings.
    await user.selectOptions(within(card).getByTestId("evidence-retention-project"), "p2");
    await waitFor(() => expect(api.retention).toHaveBeenCalledWith("p2", expect.any(String)));
  });

  it("does not save an out-of-range number of days", async () => {
    const user = userEvent.setup();
    renderTab();
    const card = await screen.findByTestId("evidence-retention");
    await user.selectOptions(await within(card).findByTestId("evidence-retention-log"), "days");
    api.setRetention.mockClear();
    const days = within(card).getByTestId("evidence-retention-log-days");
    await user.clear(days);
    await user.type(days, "0");
    await user.tab();
    expect(days).toHaveAttribute("aria-invalid", "true");
    expect(api.setRetention).not.toHaveBeenCalled();
    await expectNoAxeViolations(card);
  });
});
