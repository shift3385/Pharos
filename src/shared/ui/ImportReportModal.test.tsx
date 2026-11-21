import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@test/utils";
import { ImportReportModal } from "./ImportReportModal";
import type { DetectionRow } from "@shared/import/xlsx";

const renderRows = (rows: DetectionRow[]) =>
  render(
    <ImportReportModal
      title="Importar plan desde .xlsx"
      parsing={false}
      done={rows.length}
      total={rows.length}
      rows={rows}
      onApply={() => {}}
      onCancel={() => {}}
    />,
  );

describe("ImportReportModal", () => {
  it("shows a detected list by its labels, not its stored keys (FIX-40)", () => {
    renderRows([
      {
        labelKey: "testPlan.testTypes",
        status: "filled",
        preview: "functional, performance, Pruebas de contrato",
        previewItems: [
          { key: "testPlan.typeLabel.functional", text: "functional" },
          { key: "testPlan.typeLabel.performance", text: "performance" },
          { text: "Pruebas de contrato" },
        ],
      },
    ]);
    expect(screen.getByText("Funcionales, Rendimiento, Pruebas de contrato")).toBeInTheDocument();
    expect(screen.queryByText(/functional/)).not.toBeInTheDocument();
  });

  it("shows a list whole (FIX-49: «Ciclos,…» hid what was detected)", () => {
    renderRows([
      {
        labelKey: "testPlan.testTypes",
        status: "filled",
        previewItems: Array.from({ length: 12 }, () => ({ key: "testPlan.typeLabel.performance", text: "performance" })),
      },
    ]);
    const value = screen.getByText(/^Rendimiento, Rendimiento/);
    expect(value.textContent?.split(", ")).toHaveLength(12);
    expect(value.textContent).not.toMatch(/…$/);
  });

  it("only a value longer than the report can hold ends in «…»", () => {
    renderRows([
      {
        labelKey: "testPlan.testTypes",
        status: "filled",
        previewItems: Array.from({ length: 80 }, () => ({
          key: "testPlan.typeLabel.performance",
          text: "performance",
        })),
      },
    ]);
    expect(
      screen.getByText(/^Rendimiento, Rendimiento.*…$/),
    ).toBeInTheDocument();
  });

  // FIX-46: a detected date as the app writes dates, and each value whole in
  // its tooltip (the list shows two lines of it).
  it("writes a detected date as the app does and keeps the whole value in the tooltip", () => {
    renderRows([
      { labelKey: "testPlan.date", status: "filled", preview: "2026-11-16" },
      { labelKey: "testPlan.fieldTitle", status: "filled", preview: "Plan de pruebas de la versión 0.6.0 de Pharos" },
    ]);
    const date = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, 16)));
    expect(screen.getByText(date)).toBeInTheDocument();
    expect(screen.queryByText("2026-11-16")).toBeNull();
    expect(screen.getByText(/^Plan de pruebas/)).toHaveAttribute("title", "Plan de pruebas de la versión 0.6.0 de Pharos");
  });

  it("wraps a value on as many lines as it needs, never clamped", () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "ImportReportModal.css"),
      "utf8",
    );
    const value = css.slice(
      css.indexOf(".imp__value {"),
      css.indexOf("}", css.indexOf(".imp__value {")),
    );
    expect(value).not.toMatch(/line-clamp/);
    expect(value).toMatch(/overflow-wrap:\s*break-word/);
  });
});
