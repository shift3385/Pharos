import { describe, it, expect } from "vitest";
import {
  coverageTone,
  filterProjects,
  formatAccess,
  paginate,
  prefixBadge,
  recentProjects,
  sortProjects,
  type ProjectRow,
} from "./projectTable";

const row = (over: Partial<ProjectRow>): ProjectRow => ({
  id: over.name ?? "x",
  name: "x",
  caseIdPrefix: "X_",
  caseIdDigits: 3,
  updatedAt: "2026-10-01T10:00:00.000Z",
  lastAccess: null,
  planStatus: null,
  cases: 0,
  coverage: null,
  closeDate: null,
  ...over,
});

const ROWS = [
  row({ name: "Pasarela de Pagos", caseIdPrefix: "PGW-", lastAccess: "2026-10-27T09:00:00.000Z", coverage: 1 }),
  row({ name: "App Móvil Banca", caseIdPrefix: "AMB_", lastAccess: "2026-10-29T18:10:00.000Z", coverage: 0.78 }),
  row({ name: "Migración ERP", caseIdPrefix: "ERP", updatedAt: "2026-10-20T10:00:00.000Z" }),
  row({ name: "Portal Clientes v3", caseIdPrefix: "PCL-", lastAccess: "2026-10-30T09:42:00.000Z", coverage: 0.92 }),
];
const names = (rows: ProjectRow[]) => rows.map((r) => r.name);

describe("Proyectos table model", () => {
  it("recent: only opened projects, most recent first, at most 4", () => {
    expect(names(recentProjects(ROWS))).toEqual([
      "Portal Clientes v3",
      "App Móvil Banca",
      "Pasarela de Pagos",
    ]);
    expect(recentProjects(ROWS, 1)).toHaveLength(1);
  });

  it("search matches the name or the prefix, ignoring case and accents", () => {
    expect(names(filterProjects(ROWS, "movil"))).toEqual(["App Móvil Banca"]);
    expect(names(filterProjects(ROWS, "pgw"))).toEqual(["Pasarela de Pagos"]);
    expect(filterProjects(ROWS, "  ")).toHaveLength(4);
  });

  it("sorts by last access (else the update) and by name, in both directions", () => {
    expect(names(sortProjects(ROWS, "access", "desc"))).toEqual([
      "Portal Clientes v3",
      "App Móvil Banca",
      "Pasarela de Pagos",
      "Migración ERP",
    ]);
    expect(names(sortProjects(ROWS, "name", "asc"))[0]).toBe("App Móvil Banca");
    expect(names(sortProjects(ROWS, "name", "desc"))[0]).toBe("Portal Clientes v3");
  });

  it("an unknown value (no requirements, no dates) sorts last in either direction", () => {
    expect(names(sortProjects(ROWS, "coverage", "asc")).at(-1)).toBe("Migración ERP");
    expect(names(sortProjects(ROWS, "coverage", "desc"))).toEqual([
      "Pasarela de Pagos",
      "Portal Clientes v3",
      "App Móvil Banca",
      "Migración ERP",
    ]);
  });

  it("sorts by cycle close (from the plan schedule), unknown dates last", () => {
    const rows = [
      row({ name: "B", closeDate: "2026-12-01" }),
      row({ name: "A", closeDate: null }),
      row({ name: "C", closeDate: "2026-11-07" }),
    ];
    expect(names(sortProjects(rows, "closure", "asc"))).toEqual(["C", "B", "A"]);
    expect(names(sortProjects(rows, "closure", "desc"))).toEqual(["B", "C", "A"]);
  });

  it("paginates, clamping a page past the end to the last one", () => {
    const many = Array.from({ length: 30 }, (_, i) => i);
    expect(paginate(many, 1, 12).rows).toHaveLength(12);
    expect(paginate(many, 3, 12)).toEqual({ page: 3, rows: [24, 25, 26, 27, 28, 29] });
    expect(paginate(many, 9, 12).page).toBe(3);
    expect(paginate([], 2, 12)).toEqual({ page: 1, rows: [] });
  });

  it("formats the last access as Hoy / Ayer / a short date", () => {
    const now = new Date(2026, 9, 30, 12, 0);
    const w = { today: "Hoy", yesterday: "Ayer" };
    expect(formatAccess(new Date(2026, 9, 30, 9, 42).toISOString(), "es", w, now)).toBe("Hoy, 09:42");
    expect(formatAccess(new Date(2026, 9, 29, 18, 10).toISOString(), "es", w, now)).toBe("Ayer, 18:10");
    expect(formatAccess(new Date(2026, 9, 27, 8, 0).toISOString(), "es", w, now)).toBe("27 oct");
    expect(formatAccess(new Date(2025, 0, 3, 8, 0).toISOString(), "es", w, now)).toMatch(/2025/);
  });

  it("badge and coverage colour", () => {
    expect(prefixBadge("ATS_")).toBe("ATS");
    expect(prefixBadge("TC-")).toBe("TC");
    expect(prefixBadge("")).toBe("");
    expect(coverageTone(0.92)).toBe("success");
    expect(coverageTone(0.78)).toBe("warning");
    expect(coverageTone(0.61)).toBe("error");
  });
});
