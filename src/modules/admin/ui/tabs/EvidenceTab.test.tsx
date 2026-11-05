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
  deleteOrphans: vi.fn(),
}));
vi.mock("../../api/evidenceApi", () => ({ EVIDENCE_CHECK_BUSY: "evidence-check-busy", evidenceApi: api }));

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
    bytes: 12 * MB,
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
  api.progress.mockResolvedValue({ running: true, filesDone: 1, filesTotal: 3, bytesDone: MB, bytesTotal: 12 * MB });
  api.check.mockResolvedValue(report());
  api.deleteOrphans.mockResolvedValue({ deleted: 1, bytes: 2048, skipped: [] });
});

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
    api.deleteOrphans.mockResolvedValue({ deleted: 0, bytes: 0, skipped: [{ file: ORPHAN, reason: "in_use" }] });
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByTestId("evidence-verify"));
    const orphans = await screen.findByTestId("evidence-orphans");
    await user.click(within(orphans).getByRole("checkbox", { name: "Seleccionar Archivo ab1111111111" }));
    await user.click(screen.getByTestId("evidence-repair"));
    await user.click(screen.getByTestId("evidence-confirm"));
    expect(await screen.findByText("1 se omitió: abierto por otro programa.", { exact: false })).toBeInTheDocument();
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
});
