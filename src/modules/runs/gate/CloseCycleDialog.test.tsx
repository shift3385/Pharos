import "@test/slow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import type { ExitCriterion } from "@shared/contracts/contract";
import { SUMMARY } from "../report/__fixtures__/summary";
import { closeInput, gateErrorKey, gateState } from "../model/gate";
import { CloseCycleDialog } from "./CloseCycleDialog";

const summary = vi.fn();
const closeCycle = vi.fn();
vi.mock("../api/executionApi", async (orig) => ({
  ...(await orig<typeof import("../api/executionApi")>()),
  executionApi: {
    summary: (...a: unknown[]) => summary(...a),
    closeCycle: (...a: unknown[]) => closeCycle(...a),
  },
}));

const crit = (over: Partial<ExitCriterion>): ExitCriterion => ({
  index: 0,
  criterion: "c",
  metric: "≥ 90%",
  kind: "passRate",
  op: ">=",
  target: 90,
  value: 95,
  met: true,
  blocking: true,
  ...over,
});

beforeEach(async () => {
  await i18n.changeLanguage("es");
  summary.mockReset();
  closeCycle.mockReset();
  summary.mockResolvedValue(SUMMARY);
  closeCycle.mockResolvedValue({ verdict: "goWithRisks" });
});

describe("the gate's rules (DOC-02)", () => {
  it("asks only failing mandatory criteria for a justification and manual ones for a mark", () => {
    const criteria = [
      crit({}),
      crit({ met: false, value: 80 }),
      crit({ met: null, value: null }),
      crit({ met: false, blocking: false }),
      crit({ kind: null, op: null, met: null }),
    ];
    const g = gateState(criteria, {});
    expect(g.rows.map((r) => r.state)).toEqual(["met", "notMet", "noData", "notMet", "manual"]);
    expect(g.rows.map((r) => r.needsJustification)).toEqual([false, true, true, false, false]);
    expect(g.failing).toBe(2);
    expect(g.complete).toBe(false);
    expect(g.verdict).toBeNull();
    const why = "Aceptado: se corrige en el siguiente sprint.";
    const done = gateState(criteria, {
      1: { manualMet: null, justification: why },
      2: { manualMet: null, justification: why },
      4: { manualMet: false, justification: "" },
    });
    // A manual criterion marked as not met fails too and needs its own.
    expect(done.rows[4].needsJustification).toBe(true);
    expect(done.complete).toBe(false);
    expect(gateState([crit({}), crit({ kind: null, op: null })], { 1: { manualMet: true, justification: "" } }).verdict).toBe("go");
  });

  it("sends only what was decided, and names the core's refusals", () => {
    const criteria = [crit({}), crit({ met: false })];
    expect(closeInput(criteria, { 1: { manualMet: null, justification: "  bastante texto para valer aquí " } }, "noGo")).toEqual({
      verdict: "noGo",
      decisions: [{ position: 0 }, { position: 1, justification: "bastante texto para valer aquí" }],
    });
    expect(closeInput(criteria, {}, "go").verdict).toBeUndefined();
    expect(gateErrorKey(new Error("gate-justification-required:1"))).toBe("gate.error.justificationRequired");
    expect(gateErrorKey("cycle-closed")).toBe("gate.error.closed");
    expect(gateErrorKey("boom")).toBe("gate.error.generic");
  });
});

describe("«Cerrar ciclo» (DOC-02, boceto A)", () => {
  it("does not close until every failing mandatory criterion is justified and a verdict is chosen", async () => {
    const user = userEvent.setup();
    const onClosed = vi.fn();
    renderWithProviders(
      <CloseCycleDialog projectId="p1" cycleId="y1" cycleLabel="CYC-007 · Regresión" onClose={() => {}} onClosed={onClosed} />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Cerrar CYC-007 · Regresión" });
    const banner = await within(dialog).findByTestId("gate-banner");
    expect(banner).toHaveTextContent("No-go 2 criterios obligatorios no se cumplen");
    expect(summary).toHaveBeenCalledWith({ projectId: "p1", cycleId: "y1" }, expect.any(String));

    await user.click(within(dialog).getByTestId("gate-close"));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Falta marcar algún criterio manual o justificar");
    expect(closeCycle).not.toHaveBeenCalled();

    const fields = within(dialog).getAllByRole("textbox");
    expect(fields).toHaveLength(2);
    const why = "Los fallos son de facturas, detrás de un flag apagado.";
    for (const f of fields) await user.type(f, why);
    await user.click(within(dialog).getByTestId("gate-close"));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Elige «Go con riesgos» o «No-go».");
    await user.click(within(dialog).getByTestId("gate-verdict-goWithRisks"));
    await expectNoAxeViolations();
    await user.click(within(dialog).getByTestId("gate-close"));
    await waitFor(() => expect(onClosed).toHaveBeenCalled());
    expect(closeCycle).toHaveBeenCalledWith(
      "y1",
      {
        verdict: "goWithRisks",
        decisions: [
          { position: 0, justification: why },
          { position: 1, justification: why },
          { position: 2 },
        ],
      },
      expect.any(String),
    );
  });

  it("says why the core refused a closing", async () => {
    const user = userEvent.setup();
    summary.mockResolvedValue({ ...SUMMARY, exitCriteria: [crit({})] });
    closeCycle.mockRejectedValue(new Error("cycle-closed"));
    renderWithProviders(
      <CloseCycleDialog projectId="p1" cycleId="y1" cycleLabel="CYC-007" onClose={() => {}} onClosed={() => {}} />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Cerrar CYC-007" });
    expect(await within(dialog).findByTestId("gate-banner")).toHaveTextContent("Todos los criterios obligatorios se cumplen.");
    await user.click(within(dialog).getByTestId("gate-close"));
    expect(await within(dialog).findByText("El ciclo ya estaba cerrado.")).toBeInTheDocument();
  });
});
