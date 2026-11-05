// `GET /api/home/metrics` (RED-W6): the web's one read behind the execution
// numbers of Inicio, the twin of the desktop's `home_metrics` command. A thin
// entry point only: the rules live in the shared execution derivation of
// step 10 (`createExecutionService(store).homeMetrics`, contract v1 §2.4),
// which `app.ts` passes in as `core`.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { makeRequireAuth } from "../auth/middleware";
import type { TokenService } from "../auth/tokens";
import { requireSupportedVersion } from "../sync/sync.version";

const MAX_DAYS = 400;
const MAX_WINDOWS = 16;
const MAX_PROJECTS = 200;

/** Contract v1 `HomeRequest`. */
export interface HomeRequest {
  projectIds: string[] | null;
  dayStarts: number[];
  now: number;
  windows: { id: string; fromIndex: number }[];
  queueLimit: number | null;
}

export type HomeCore = (userId: string, request: HomeRequest) => Promise<unknown>;

const int = z.coerce.number().int().safe();
const list = (s: string) => (s.trim() ? s.split(",").map((x) => x.trim()) : []);

/** The query: `dayStarts=1,2,…&now=…&windows=today:29,7d:23&projectIds=a,b&queueLimit=5`. */
export const homeQuerySchema = z
  .object({
    dayStarts: z.string().max(MAX_DAYS * 16),
    now: int,
    windows: z.string().max(MAX_WINDOWS * 32).default(""),
    projectIds: z.string().max(200 * 64).optional(),
    queueLimit: int.min(1).max(50).optional(),
  })
  .transform((q, ctx): HomeRequest => {
    const fail = (message: string) => {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    };
    const dayStarts = list(q.dayStarts).map(Number);
    if (dayStarts.length === 0 || dayStarts.length > MAX_DAYS || dayStarts.some((d) => !Number.isSafeInteger(d)))
      return fail(`dayStarts must hold 1 to ${MAX_DAYS} integers`);
    if (dayStarts.some((d, i) => i > 0 && d <= dayStarts[i - 1])) return fail("dayStarts must be strictly ascending");
    if (q.now < dayStarts[0]) return fail("now is before the first day");
    // `id:fromIndex`, exactly: anything else is refused (as the desktop does).
    const pairs = list(q.windows).map((w) => w.split(":"));
    if (pairs.some((p) => p.length !== 2 || !/^\d+$/.test(p[1])))
      return fail("windows must be id:fromIndex pairs");
    const windows = pairs.map(([id, from]) => ({ id, fromIndex: Number(from) }));
    if (windows.length > MAX_WINDOWS) return fail(`at most ${MAX_WINDOWS} windows`);
    if (windows.some((w) => !w.id || !Number.isInteger(w.fromIndex) || w.fromIndex < 0 || w.fromIndex >= dayStarts.length))
      return fail("a window starts outside dayStarts");
    // Same rules as the desktop entry: at most 200 ids, none blank.
    const projectIds = q.projectIds === undefined ? null : q.projectIds.split(",").map((x) => x.trim());
    if (projectIds && (projectIds.length > MAX_PROJECTS || projectIds.some((x) => !x)))
      return fail(`projectIds must hold at most ${MAX_PROJECTS} non-blank ids`);
    return { projectIds, dayStarts, now: q.now, windows, queueLimit: q.queueLimit ?? null };
  });

export function homeMetricsRoutes(app: FastifyInstance, deps: { tokens: TokenService; core: HomeCore }) {
  const preHandler = [makeRequireAuth(deps.tokens), requireSupportedVersion];
  const { core } = deps;
  app.get("/api/home/metrics", { preHandler }, (req: FastifyRequest) =>
    core(req.userId as string, homeQuerySchema.parse(req.query)),
  );
}
