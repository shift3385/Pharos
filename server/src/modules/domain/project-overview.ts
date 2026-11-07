// `GET /api/projects/overview` (FIX-17, ADR-0035): the web's one read behind
// the project lists of Proyectos and Inicio, whatever the number of projects
// and cases. One lock-free read per entity kind, as the execution derivation,
// so a slow read never blocks a device push or a web write.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { makeRequireAuth } from "../auth/middleware";
import type { TokenService } from "../auth/tokens";
import type { RemoteDoc } from "../sync/sync.repository";
import { requireSupportedVersion } from "../sync/sync.version";
import { newestFirst } from "./domain.service";
import type { DomainReader, DomainStore } from "./domain.store";

type Payload = Record<string, unknown>;

const text = (p: Payload, k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");

const byProject = (docs: RemoteDoc[]) => {
  const groups = new Map<string, RemoteDoc[]>();
  for (const d of docs) {
    const id = text(d.payload, "projectId");
    const group = groups.get(id);
    if (group) group.push(d);
    else groups.set(id, [d]);
  }
  return groups;
};

/** Share (0..1) of requirements with at least one linked case that is not
 *  obsolete, the rule of the matrix (`buildMatrix`) and of the execution
 *  derivation; null when there is nothing to cover. */
export function coverageOf(requirements: RemoteDoc[], cases: RemoteDoc[]): number | null {
  if (requirements.length === 0) return null;
  const linked = new Set<unknown>();
  for (const c of cases) {
    if (c.payload.status === "obsolete") continue;
    const keys = (c.payload.data as Payload | null | undefined)?.requirementKeys;
    if (Array.isArray(keys)) keys.forEach((k) => linked.add(k));
  }
  return requirements.filter((r) => linked.has(r.payload.requirementKey)).length / requirements.length;
}

async function readOverview(r: DomainReader) {
  const projects = await r.projects();
  if (projects.length === 0) return [];
  const ids = projects.map((p) => p.entityId);
  const plans = byProject(await r.list("test_plan", ids));
  const cases = byProject(await r.list("test_case", ids));
  const requirements = byProject(await r.list("requirement", ids));
  return projects
    .map((d) => d.payload)
    .sort((a, b) => text(a, "name").localeCompare(text(b, "name"), undefined, { sensitivity: "accent" }))
    .map((p) => {
      const id = p.id as string;
      const projectCases = cases.get(id) ?? [];
      // A project's plan is its newest, as `testPlans.byProject`.
      const plan = (plans.get(id) ?? []).sort(newestFirst)[0]?.payload;
      const data = (plan?.data ?? {}) as Payload;
      return {
        id,
        name: p.name,
        caseIdPrefix: p.caseIdPrefix,
        caseIdDigits: p.caseIdDigits,
        updatedAt: p.updatedAt,
        revision: p.revision,
        // Only what the closing date and the exit criteria are read from: the
        // client derives them with the same `planClosure` as the desktop.
        plan: plan
          ? {
              status: plan.status,
              data: { sprints: data.sprints, milestones: data.milestones, closureCriteria: data.closureCriteria },
            }
          : null,
        cases: projectCases.length,
        coverage: coverageOf(requirements.get(id) ?? [], projectCases),
      };
    });
}

export function projectOverviewRoutes(app: FastifyInstance, deps: { store: DomainStore; tokens: TokenService }) {
  const preHandler = [makeRequireAuth(deps.tokens), requireSupportedVersion];
  app.get("/api/projects/overview", { preHandler }, (req: FastifyRequest) =>
    deps.store.read(req.userId as string, readOverview),
  );
}
