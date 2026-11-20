import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SYNCED_EVENT, useOnSynced } from "./useSynced";

describe("useOnSynced (FIX-48)", () => {
  it("runs the latest reload on every sync and stops when unmounted", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(({ fn }) => useOnSynced(fn), { initialProps: { fn: first } });
    window.dispatchEvent(new CustomEvent(SYNCED_EVENT));
    expect(first).toHaveBeenCalledTimes(1);
    rerender({ fn: second });
    window.dispatchEvent(new CustomEvent(SYNCED_EVENT));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    unmount();
    window.dispatchEvent(new CustomEvent(SYNCED_EVENT));
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("every page that lists synced entities reloads after a sync", () => {
    // Requisitos and Trazabilidad, casos, ciclos, defectos (lista y tablero),
    // plan, tablero del planificador, ejecuciones y su detalle, biblioteca,
    // proyectos: none may keep showing what was there before a sync.
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "modules");
    const pages = [
      "traceability/ui/TraceabilityPage.tsx",
      "test-cases/ui/TestCasesPage.tsx",
      "cycles/ui/CyclesPage.tsx",
      "cycles/ui/CycleDetail.tsx",
      "defects/ui/DefectsPage.tsx",
      "test-plan/ui/TestPlanWizard.tsx",
      "planner/ui/PlannerBoard.tsx",
      "runs/ui/RunsPage.tsx",
      "runs/ui/RunDetail.tsx",
      "library/ui/LibraryPage.tsx",
      "projects/ui/ProjectsPage.tsx",
      "projects/ui/ProjectDetail.tsx",
    ];
    const missing = pages.filter((p) => {
      const src = readFileSync(join(root, p), "utf8");
      return !src.includes("useOnSynced(") && !src.includes('"pharos:synced"');
    });
    expect(missing).toEqual([]);
  });
});
