import { describe, expect, it } from "vitest";
import { withLinks, type LinkContext } from "../src/modules/domain/defects.js";
import type { RemoteDoc } from "../src/modules/sync/sync.repository.js";

const doc = (entity: string, entityId: string, payload: Record<string, unknown>): RemoteDoc => ({
  entity,
  entityId,
  payload,
  revision: 1,
  author: "t",
  deleted: false,
  hlc: "0",
  seq: 1,
});

describe("a defect's link to a result (FIX-38)", () => {
  it("names a retry as the run does and the first attempt without «#0»", () => {
    const run = doc("run", "r1", { runKey: "RUN-1" });
    const first = doc("result", "x1", { runId: "r1", caseKey: "PH-002", attempt: 0, testCaseId: "c1" });
    const retry = doc("result", "x2", { runId: "r1", caseKey: "PH-002", attempt: 1, testCaseId: "c1" });
    const link = (id: string, target: string) =>
      doc("defect_link", id, { defectId: "d1", targetKind: "result", targetId: target });
    const ctx: LinkContext = {
      links: [link("l1", "x1"), link("l2", "x2")],
      byId: new Map([run, first, retry].map((d) => [`${d.entity}:${d.entityId}`, d])),
      derive: null,
    };
    const out = withLinks(ctx, doc("defect", "d1", {})) as { links: { label: string | null }[] };
    expect(out.links.map((l) => l.label)).toEqual(["RUN-1 · PH-002", "RUN-1 · PH-002 #2"]);
  });

  it("names an imported result by the case it reaches, not by its test path (FIX-49)", () => {
    const run = doc("run", "r4", { runKey: "RUN-004" });
    const tc = doc("test_case", "c1", {
      scenarioId: "PH-001",
      title: "Iniciar sesión con credenciales válidas",
    });
    const imported = doc("result", "x9", {
      runId: "r4",
      shardId: "s1",
      testKey: "specs/acceso.spec.ts::Acceso › entra",
      attempt: 0,
    });
    const ctx: LinkContext = {
      links: [
        doc("defect_link", "l9", {
          defectId: "d1",
          targetKind: "result",
          targetId: "x9",
        }),
      ],
      byId: new Map(
        [run, tc, imported].map((d) => [`${d.entity}:${d.entityId}`, d]),
      ),
      derive: () => ({ caseId: "c1" }) as never,
    };
    const out = withLinks(ctx, doc("defect", "d1", {})) as {
      links: { label: string | null }[];
    };
    expect(out.links[0].label).toBe(
      "RUN-004 · PH-001 · Iniciar sesión con credenciales válidas",
    );
  });
});
