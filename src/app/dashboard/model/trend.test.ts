// FIX-46: «Tendencia de ciclos» opened on a project with no cycle («API de
// sincronización»), beside «Criterios de salida» showing Pharos.
import { describe, expect, it } from "vitest";
import type { CycleTrendPoint } from "@shared/contracts/contract";
import { trendProject } from "./trend";

const projects = [{ id: "api" }, { id: "ph" }, { id: "web" }];
const point = (status: string) => ({ status }) as unknown as CycleTrendPoint;

describe("trendProject", () => {
  it("opens on a project with closed cycles, then on one with any cycle", () => {
    const trend: Record<string, CycleTrendPoint[]> = { web: [point("closed")], ph: [point("active")] };
    expect(trendProject(projects, null, (id) => trend[id] ?? [])?.id).toBe("web");
    delete trend.web;
    expect(trendProject(projects, null, (id) => trend[id] ?? [], "api")?.id).toBe("ph");
  });

  it("without any cycle, opens on the project «Criterios de salida» shows", () => {
    expect(trendProject(projects, null, () => [], "ph")?.id).toBe("ph");
    expect(trendProject(projects, null, () => [])?.id).toBe("api");
    expect(trendProject(projects, "web", () => [], "ph")?.id).toBe("web");
  });
});
