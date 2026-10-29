import type { FastifyInstance, FastifyRequest } from "fastify";
import type { TokenService } from "../auth/tokens";
import { makeRequireAuth } from "../auth/middleware";
import { requireSupportedVersion } from "../sync/sync.version";
import type { DomainService } from "./domain.service";
import {
  deleteQuerySchema,
  plannerCardInputSchema,
  projectInputSchema,
  projectQuerySchema,
  reorderSchema,
  requirementImportSchema,
  requirementInputSchema,
  testCaseInputSchema,
  testPlanInputSchema,
  updateOf,
} from "./domain.schemas";

/** The web's domain API (BASE-10, ADR-0004): the browser reads and writes
 *  through these endpoints and holds no domain logic of its own. Everything
 *  is scoped to the authenticated user, and only supported client versions
 *  are served (SYNC-08), as on `/sync/*`. An update or delete names the
 *  revision the client read; if the item changed since, the answer is 409
 *  `stale_write` with the current version (FIX-04). */
export function domainRoutes(app: FastifyInstance, deps: { domain: DomainService; tokens: TokenService }) {
  const { domain, tokens } = deps;
  const preHandler = [makeRequireAuth(tokens), requireSupportedVersion];
  const user = (req: FastifyRequest) => req.userId as string;
  const id = (req: FastifyRequest) => (req.params as { id: string }).id;
  const revisionOf = (req: FastifyRequest) => deleteQuerySchema.parse(req.query).revision;

  app.get("/api/projects", { preHandler }, (req) => domain.projects.list(user(req)));
  app.get("/api/projects/:id", { preHandler }, (req) => domain.projects.get(user(req), id(req)));
  app.post("/api/projects", { preHandler }, (req) => domain.projects.create(user(req), projectInputSchema.parse(req.body)));
  app.put("/api/projects/:id", { preHandler }, (req) => {
    const { input, revision } = updateOf(projectInputSchema).parse(req.body);
    return domain.projects.update(user(req), id(req), input, revision);
  });
  app.delete("/api/projects/:id", { preHandler }, async (req, reply) => {
    await domain.projects.remove(user(req), id(req), revisionOf(req));
    return reply.code(204).send();
  });

  app.get("/api/test-plans", { preHandler }, (req) => {
    const { projectId } = req.query as { projectId?: string };
    return projectId
      ? domain.testPlans.byProject(user(req), projectQuerySchema.parse(req.query).projectId)
      : domain.testPlans.list(user(req));
  });
  app.get("/api/test-plans/:id", { preHandler }, (req) => domain.testPlans.get(user(req), id(req)));
  app.post("/api/test-plans", { preHandler }, (req) => domain.testPlans.create(user(req), testPlanInputSchema.parse(req.body)));
  app.put("/api/test-plans/:id", { preHandler }, (req) => {
    const { input, revision } = updateOf(testPlanInputSchema).parse(req.body);
    return domain.testPlans.update(user(req), id(req), input, revision);
  });
  app.delete("/api/test-plans/:id", { preHandler }, async (req, reply) => {
    await domain.testPlans.remove(user(req), id(req), revisionOf(req));
    return reply.code(204).send();
  });

  app.get("/api/test-cases", { preHandler }, (req) =>
    domain.testCases.list(user(req), projectQuerySchema.parse(req.query).projectId),
  );
  app.get("/api/test-cases/:id", { preHandler }, (req) => domain.testCases.get(user(req), id(req)));
  app.post("/api/test-cases", { preHandler }, (req) => domain.testCases.create(user(req), testCaseInputSchema.parse(req.body)));
  app.put("/api/test-cases/:id", { preHandler }, (req) => {
    const { input, revision } = updateOf(testCaseInputSchema).parse(req.body);
    return domain.testCases.update(user(req), id(req), input, revision);
  });
  app.delete("/api/test-cases/:id", { preHandler }, async (req, reply) => {
    await domain.testCases.remove(user(req), id(req), revisionOf(req));
    return reply.code(204).send();
  });

  app.get("/api/requirements", { preHandler }, (req) =>
    domain.requirements.list(user(req), projectQuerySchema.parse(req.query).projectId),
  );
  app.get("/api/requirements/:id", { preHandler }, (req) => domain.requirements.get(user(req), id(req)));
  app.post("/api/requirements", { preHandler }, (req) =>
    domain.requirements.create(user(req), requirementInputSchema.parse(req.body)),
  );
  app.post("/api/requirements/import", { preHandler }, (req) => {
    const { projectId } = projectQuerySchema.parse(req.query);
    return domain.requirements.importRows(user(req), projectId, requirementImportSchema.parse(req.body).rows);
  });
  app.put("/api/requirements/:id", { preHandler }, (req) => {
    const { input, revision } = updateOf(requirementInputSchema).parse(req.body);
    return domain.requirements.update(user(req), id(req), input, revision);
  });
  app.delete("/api/requirements/:id", { preHandler }, async (req, reply) => {
    await domain.requirements.remove(user(req), id(req), revisionOf(req));
    return reply.code(204).send();
  });

  app.get("/api/planner-cards", { preHandler }, (req) =>
    domain.plannerCards.list(user(req), projectQuerySchema.parse(req.query).projectId),
  );
  app.post("/api/planner-cards", { preHandler }, (req) =>
    domain.plannerCards.create(user(req), plannerCardInputSchema.parse(req.body)),
  );
  app.post("/api/planner-cards/reorder", { preHandler }, async (req, reply) => {
    const { status, ids } = reorderSchema.parse(req.body);
    await domain.plannerCards.reorder(user(req), status, ids);
    return reply.code(204).send();
  });
  app.put("/api/planner-cards/:id", { preHandler }, (req) => {
    const { input, revision } = updateOf(plannerCardInputSchema).parse(req.body);
    return domain.plannerCards.update(user(req), id(req), input, revision);
  });
  app.delete("/api/planner-cards/:id", { preHandler }, async (req, reply) => {
    await domain.plannerCards.remove(user(req), id(req), revisionOf(req));
    return reply.code(204).send();
  });
}
