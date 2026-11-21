// The accounts of the manual as API clients of the tour server (MAN-03,
// NC-052 amended). Liomar's session here is «Pharos Web» or «another Pharos
// of his»: the prerequisite loaders (prepare.ts) use it for data that has no
// importer (decision D-3), and chapter 15 uses it to play a second device.
// Jorge L. Meneses Yero exists only here: he registers, joins the team and
// reviews from his own computer, and never signs in to the app the tours
// drive. «Administrador», the server administrator (the first account,
// registered by run-tours.mjs), prepares admin state here when the screen is
// not the point; chapter 15 signs the app in with it for its administration
// block (account-switch.ts).
//
// Every call goes to the tour API (PHAROS_TOURS_API, never port 3000) with
// the headers a Pharos client sends; the domain rules are the server's own.
import { readFileSync } from "node:fs";
import { ADMIN, PERSONA, TEAMMATE, type Person } from "../../scripts/manual/persona.mjs";
import { TEAM } from "./data/pharos";

const API = process.env.PHAROS_TOURS_API ?? "";
const FEATURES = "stable-steps,append-only,runs,cycles,defects,key-conflicts";
const VERSION = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

/** Throwaway passwords for the tour database (dropped after the run):
 *  run-tours.mjs passes them; these defaults are the same values. */
export const LIOMAR_PASSWORD = process.env.TEST_USER_PASSWORD ?? "faro-liomar-2026";
export const JORGE_PASSWORD = process.env.TEAMMATE_PASSWORD ?? "faro-jorge-2026";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "faro-admin-2026";

export class ApiError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`${path}: HTTP ${status} ${body.slice(0, 300)}`);
  }
}

type Json = Record<string, unknown>;
type Doc = Json & { id: string; revision?: number };

interface RemoteDoc {
  entity: string;
  entityId: string;
  payload: Json;
  revision: number;
  author: string;
  deleted: boolean;
  hlc: string;
}

/** One person's session against the tour API. */
export class Session {
  private token = "";
  /** The account's user id once signed in. */
  userId = "";

  constructor(
    readonly person: Person,
    private readonly password: string,
  ) {}

  private async raw(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
    if (!API) throw new Error("PHAROS_TOURS_API is not set (run the tours with npm run manual)");
    if (new URL(API).port === "3000") throw new Error("the tours never talk to the user's API on port 3000");
    return fetch(`${API}${path}`, {
      ...init,
      headers: {
        // Fastify refuses a JSON content type without a body (a DELETE).
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        "x-pharos-sync-features": FEATURES,
        // The server only answers app versions it supports: say ours.
        "x-pharos-version": VERSION,
        ...(auth && this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
    });
  }

  /** A JSON call; signs in first, and again once if the access token expired. */
  async call<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.token) await this.signIn();
    let res = await this.raw(path, init);
    if (res.status === 401) {
      await this.signIn();
      res = await this.raw(path, init);
    }
    const text = await res.text();
    if (!res.ok) throw new ApiError(path, res.status, text);
    return (text ? JSON.parse(text) : null) as T;
  }

  get = <T = unknown>(path: string) => this.call<T>(path);
  post = <T = unknown>(path: string, body: unknown = {}) => this.call<T>(path, { method: "POST", body: JSON.stringify(body) });
  put = <T = unknown>(path: string, body: unknown) => this.call<T>(path, { method: "PUT", body: JSON.stringify(body) });
  patch = <T = unknown>(path: string, body: unknown) => this.call<T>(path, { method: "PATCH", body: JSON.stringify(body) });
  del = (path: string) => this.call(path, { method: "DELETE" });

  /** Signs in; false when the account does not exist (or the password is wrong). */
  async tryLogin(): Promise<boolean> {
    const res = await this.raw("/auth/login", { method: "POST", body: JSON.stringify({ email: this.person.email, password: this.password }) }, false);
    if (res.status === 401 || res.status === 400 || res.status === 404) return false;
    if (!res.ok) throw new ApiError("/auth/login", res.status, await res.text());
    const session = (await res.json()) as { accessToken: string; user: { id: string } };
    this.token = session.accessToken;
    this.userId = session.user.id;
    return true;
  }

  private async signIn() {
    if (!(await this.tryLogin())) throw new Error(`${this.person.email} cannot sign in to the tour API (not registered yet?)`);
  }

  /** Registers the account as the person would (`/auth/register`). */
  async register() {
    const res = await this.raw(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({
          email: this.person.email,
          password: this.password,
          displayName: this.person.alias,
          firstName: this.person.first,
          lastName: this.person.last,
        }),
      },
      false,
    );
    if (!res.ok) throw new ApiError("/auth/register", res.status, await res.text());
    const session = (await res.json()) as { accessToken: string; user: { id: string } };
    this.token = session.accessToken;
    this.userId = session.user.id;
  }

  /** Signs in, registering the account first if it does not exist. Idempotent. */
  async ensureAccount(): Promise<"existed" | "registered"> {
    if (await this.tryLogin()) return "existed";
    await this.register();
    return "registered";
  }

  // ---- Reads (what this person sees: personal and shared workspaces) --------

  projects = () => this.get<Doc[]>("/api/projects");

  async project(name: string): Promise<Doc> {
    const p = (await this.projects()).find((x) => x.name === name);
    if (!p) throw new Error(`${this.person.alias} sees no project «${name}»`);
    return p;
  }

  async projectOrNull(name: string): Promise<Doc | null> {
    return (await this.projects()).find((x) => x.name === name) ?? null;
  }

  requirements = (projectId: string) => this.get<Doc[]>(`/api/requirements?projectId=${encodeURIComponent(projectId)}`);
  cases = (projectId: string) => this.get<Doc[]>(`/api/test-cases?projectId=${encodeURIComponent(projectId)}`);
  /** A project's plan (one per project), or null. */
  plan = async (projectId: string) => (await this.get<Doc | null>(`/api/test-plans?projectId=${encodeURIComponent(projectId)}`)) ?? null;
  cycles = (projectId: string) => this.get<Doc[]>(`/api/cycles?projectId=${encodeURIComponent(projectId)}`);
  runs = (projectId: string) => this.get<Doc[]>(`/api/runs?projectId=${encodeURIComponent(projectId)}`);
  defects = (projectId: string) => this.get<Doc[]>(`/api/defects?projectId=${encodeURIComponent(projectId)}`);
  configurations = (projectId: string) =>
    this.get<Doc[]>(`/api/configurations?projectId=${encodeURIComponent(projectId)}`);
  customFields = (projectId: string, entity: string) =>
    this.get<Doc[]>(`/api/custom-fields?projectId=${encodeURIComponent(projectId)}&entity=${entity}`);
  workspaces = async () => (await this.get<{ workspaces: WorkspaceView[] }>("/workspaces")).workspaces;

  async workspace(name: string): Promise<WorkspaceView> {
    const ws = (await this.workspaces()).find((w) => w.name === name && w.kind === "shared");
    if (!ws) throw new Error(`${this.person.alias} is in no workspace «${name}»`);
    return ws;
  }

  /** A case of a project by its key (PH-002). */
  async caseByKey(projectName: string, key: string): Promise<Doc> {
    const p = await this.project(projectName);
    const c = (await this.cases(p.id)).find((x) => x.scenarioId === key);
    if (!c) throw new Error(`${this.person.alias} sees no case ${key} in «${projectName}»`);
    return c;
  }

  // ---- Sync: another Pharos of this person ----------------------------------

  /** Edits, from another device of this person, the first live `entity`
   *  whose payload matches, exactly as another Pharos would push it. When the
   *  desktop then syncs its own edit of the same fields, the server answers
   *  with a conflict; of other fields, it merges them (SYNC-02). */
  async pushEdit(entity: string, match: (payload: Json) => boolean, change: (payload: Json) => Json) {
    let since = 0;
    let found: RemoteDoc | undefined;
    for (;;) {
      const page = await this.get<{ docs: (RemoteDoc & { seq: number })[]; cursor: number; hasMore: boolean }>(`/sync/pull?since=${since}`);
      found ??= page.docs.find((d) => d.entity === entity && !d.deleted && match(d.payload));
      since = page.cursor;
      if (!page.hasMore) break;
    }
    if (!found) throw new Error(`no ${entity} matched on the server (has the app synced it?)`);
    const wall = String(Date.now() + 60_000).padStart(15, "0");
    const answer = await this.post<{ conflicts?: unknown[] }>("/sync/push", {
      deltas: [
        {
          entity,
          entityId: found.entityId,
          op: "upsert",
          payload: change(found.payload),
          revision: found.revision + 1,
          author: found.author,
          hlc: `${wall}-00000-tour-${this === jorge ? "jorge" : "second-device"}`,
          baseRevision: found.revision,
          baseHlc: found.hlc,
        },
      ],
    });
    if (answer.conflicts?.length) throw new Error("the other device's own push conflicted");
  }
}

export interface MemberView {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  disabled: boolean;
}
export interface WorkspaceView {
  id: string;
  name: string;
  kind: "personal" | "shared";
  role: string;
  independentApproval: boolean;
  members: MemberView[];
}

/** Liomar, through the web API («Pharos Web») or as another device of his. */
export const liomar = new Session(PERSONA, LIOMAR_PASSWORD);
/** Jorge, from his own computer. */
export const jorge = new Session(TEAMMATE, JORGE_PASSWORD);
/** The server administrator. */
export const admin = new Session(ADMIN, ADMIN_PASSWORD);

/** Chapter 15's second device (kept for its call site): Liomar's own account. */
export const editOnOtherDevice = (entity: string, match: (p: Json) => boolean, change: (p: Json) => Json) =>
  liomar.pushEdit(entity, match, change);

// ---- Liomar's side: the team ----------------------------------------------------

/** Creates a shared workspace (Liomar becomes its Test Manager), or returns it. */
export async function ensureWorkspace(name: string = TEAM.workspace): Promise<WorkspaceView> {
  const found = (await liomar.workspaces()).find((w) => w.name === name && w.kind === "shared");
  if (found) return found;
  return liomar.post<WorkspaceView>("/workspaces", { name });
}

/** Moves a project into a shared workspace («Compartir con un workspace…»).
 *  Keys never change. */
export async function shareProject(projectName: string, workspaceName: string = TEAM.workspace) {
  const ws = await liomar.workspace(workspaceName);
  const p = await liomar.project(projectName);
  await liomar.post(`/workspaces/${ws.id}/move-project`, { projectId: p.id });
}

/** An invitation code, as «Invitar» shows it once. */
export async function inviteCode(role: string = TEAM.jorgeRole, workspaceName: string = TEAM.workspace): Promise<string> {
  const ws = await liomar.workspace(workspaceName);
  const inv = await liomar.post<{ code: string }>(`/workspaces/${ws.id}/invitations`, { role, expiresInDays: 7 });
  return inv.code;
}

/** «Aprobación independiente» of a shared workspace. */
export async function setIndependentApproval(on: boolean, workspaceName: string = TEAM.workspace) {
  const ws = await liomar.workspace(workspaceName);
  await liomar.patch(`/workspaces/${ws.id}/policy`, { independentApproval: on });
}

/** Changes a member's role (Test Manager only). */
export async function setMemberRole(person: Person, role: string, workspaceName: string = TEAM.workspace) {
  const ws = await liomar.workspace(workspaceName);
  const m = ws.members.find((x) => x.email === person.email);
  if (!m) throw new Error(`${person.alias} is not a member of «${workspaceName}»`);
  await liomar.patch(`/workspaces/${ws.id}/members/${m.userId}`, { role });
}

/** Jorge's membership of the team workspace, or null. */
export async function jorgeMembership(workspaceName: string = TEAM.workspace): Promise<MemberView | null> {
  const ws = (await liomar.workspaces()).find((w) => w.name === workspaceName && w.kind === "shared");
  return ws?.members.find((m) => m.email === TEAMMATE.email) ?? null;
}

/** Assigns a cycle item to someone (the assignee is the name the cycle shows). */
export async function assignCycleItem(projectName: string, cycleTitle: string, caseKey: string, assignee: string = TEAMMATE.alias) {
  const p = await liomar.project(projectName);
  const cycle = (await liomar.cycles(p.id)).find((c) => c.title === cycleTitle);
  if (!cycle) throw new Error(`no cycle «${cycleTitle}» in «${projectName}»`);
  const tc = await liomar.caseByKey(projectName, caseKey);
  const items = await liomar.get<Doc[]>(`/api/cycles/${cycle.id}/items`);
  const item = items.find((i) => i.testCaseId === tc.id);
  if (!item) throw new Error(`${caseKey} is not in the cycle «${cycleTitle}»`);
  await liomar.put(`/api/cycle-items/${item.id}`, { assignee });
}

/** Assigns a defect (its «Asignado a»). */
export async function assignDefect(projectName: string, defectTitle: string, assignee: string = TEAMMATE.alias) {
  const p = await liomar.project(projectName);
  const d = (await liomar.defects(p.id)).find((x) => x.title === defectTitle);
  if (!d) throw new Error(`no defect «${defectTitle}» in «${projectName}»`);
  await liomar.put(`/api/defects/${d.id}`, { input: { ...defectInputOf(d), assignee }, revision: d.revision });
}

/** The fields of a stored defect that its update input takes. */
function defectInputOf(d: Doc): Json {
  const keys = [
    "projectId", "title", "description", "stepsToReproduce", "expected", "actual", "severity", "priority", "status",
    "resolution", "foundInRunId", "foundInBuild", "foundInEnvironment", "fixedInBuild", "assignee", "data",
  ];
  return Object.fromEntries(keys.filter((k) => d[k] !== undefined && d[k] !== null).map((k) => [k, d[k]]));
}

// ---- Jorge's side -------------------------------------------------------------------

/** Jorge creates his account on the tour server (never the first one: the
 *  loader of `cuenta-jorge` runs after Liomar's). Idempotent. */
export const registerJorge = () => jorge.ensureAccount();

/** Jorge pastes the code in «Unirse con un código…»: preview, then join. */
export async function jorgeAcceptsInvitation(code: string) {
  await jorge.post("/invitations/preview", { code });
  return jorge.post<WorkspaceView>("/invitations/accept", { code });
}

type ReviewAction = "send" | "approve" | "return" | "obsolete" | "reactivate";

/** Jorge's review of a case of a project he can see (a Test Analyst may
 *  approve cases; never his own, with «Aprobación independiente»). */
export async function jorgeReviewsCase(projectName: string, key: string, action: ReviewAction, comment?: string) {
  const c = await jorge.caseByKey(projectName, key);
  const saved = await jorge.post<Doc>(`/api/test-cases/${c.id}/review`, { action, comment, userName: TEAMMATE.alias, revision: c.revision });
  // The author as the list reports it (its first revision): the review answer
  // gives the reviewer as `createdBy`, which his desktop would not (it keeps
  // the case's own author).
  if (saved) await jorgeNotifiesCaseReview({ ...saved, createdBy: c.createdBy }, action, String((await jorge.get<Doc>(`/api/projects/${(await jorge.project(projectName)).id}`)).workspaceId ?? ""));
  return saved;
}

/** What Jorge's Pharos does after a review it made: tell the case's author
 *  (src/modules/test-cases/api/testCaseApi.ts `announceReview` →
 *  notifications/model/caseReview.ts `notificationOfReview`). The server
 *  does not notify a case review by itself. */
async function jorgeNotifiesCaseReview(saved: Doc, action: ReviewAction, workspaceId: string) {
  const kind = action === "approve" ? "case.approved" : action === "return" ? "case.changes_requested" : null;
  const author = typeof saved.createdBy === "string" ? saved.createdBy : "";
  if (!kind) return;
  if (!author || author === jorge.userId) throw new Error(`the case's author is unknown or is Jorge (${author || "none"}): nobody to notify`);
  const data = (saved.data ?? {}) as { review?: { comment?: string; returnedAt?: string }; approval?: { at?: string } };
  const at = (kind === "case.approved" ? data.approval?.at : data.review?.returnedAt) ?? new Date().toISOString();
  const sent = await jorge.post<{ delivered: number }>("/api/notifications", {
    input: {
      kind,
      to: { userIds: [author] },
      // The project's workspace on the server (the one membership is checked in).
      workspaceId: workspaceId || null,
      projectId: saved.projectId ?? null,
      subject: { entity: "test_case", id: saved.id, key: saved.scenarioId, title: saved.title },
      data: { version: saved.version, at, ...(kind === "case.changes_requested" && data.review?.comment ? { comment: data.review.comment } : {}) },
      dedupeKey: `${saved.id}:${saved.revision}:${kind}`,
    },
  });
  if (!sent?.delivered) throw new Error(`the server delivered Jorge's ${kind} notification to nobody (author ${author}, workspace ${workspaceId || "none"})`);
}
export const jorgeApprovesCase = (projectName: string, key: string, comment?: string) => jorgeReviewsCase(projectName, key, "approve", comment);
export const jorgeRequestsChangesOnCase = (projectName: string, key: string, comment: string) =>
  jorgeReviewsCase(projectName, key, "return", comment);

/** Jorge's review of a project's plan. Approving a plan needs the Test
 *  Manager role (plan.approve): change his role first (setMemberRole). */
export async function jorgeReviewsPlan(projectName: string, action: ReviewAction, comment?: string) {
  const p = await jorge.project(projectName);
  const plan = await jorge.plan(p.id);
  if (!plan) throw new Error(`«${projectName}» has no plan`);
  const saved = await jorge.post<Doc>(`/api/test-plans/${plan.id}/review`, { action, comment, userName: TEAMMATE.alias, revision: plan.revision });
  // The author as the plan reads before the review (as for a case: the
  // review answer may carry the reviewer as `createdBy`, which his desktop's
  // stored plan would not).
  if (saved) {
    const author = typeof plan.createdBy === "string" && plan.createdBy !== jorge.userId ? plan.createdBy : saved.createdBy;
    const workspaceId = String((await jorge.get<Doc>(`/api/projects/${p.id}`)).workspaceId ?? "");
    await jorgeNotifiesPlanReview({ ...saved, createdBy: author }, action, workspaceId);
  }
  return saved;
}

/** What Jorge's Pharos does after a plan review it made: tell the plan's
 *  author (src/modules/test-plan/api/testPlanApi.ts `announcePlanReview` →
 *  notifications/model/planReview.ts `notificationOfPlanReview`). As for a
 *  case, the server does not notify a plan review by itself. */
async function jorgeNotifiesPlanReview(saved: Doc, action: ReviewAction, workspaceId: string) {
  const kind = action === "approve" ? "plan.approved" : action === "return" ? "plan.changes_requested" : null;
  if (!kind) return;
  const author = typeof saved.createdBy === "string" ? saved.createdBy : "";
  if (!author || author === jorge.userId) throw new Error(`the plan's author is unknown or is Jorge (${author || "none"}): nobody to notify`);
  const data = (saved.data ?? {}) as { review?: { comment?: string; returnedAt?: string }; approval?: { at?: string } };
  const at = (kind === "plan.approved" ? data.approval?.at : data.review?.returnedAt) ?? new Date().toISOString();
  const comment = kind === "plan.changes_requested" && data.review?.comment ? { comment: data.review.comment.slice(0, 1000) } : {};
  const sent = await jorge.post<{ delivered: number }>("/api/notifications", {
    input: {
      kind,
      to: { userIds: [author] },
      // The project's workspace on the server (the one membership is checked in).
      workspaceId: workspaceId || null,
      projectId: saved.projectId ?? null,
      subject: { entity: "test_plan", id: saved.id, title: saved.title },
      data: { version: saved.version, at, ...comment },
      dedupeKey: `${saved.id}:${saved.revision}:${kind}`,
    },
  });
  if (!sent?.delivered) throw new Error(`the server delivered Jorge's ${kind} notification to nobody (author ${author}, workspace ${workspaceId || "none"})`);
}
export const jorgeApprovesPlan = (projectName: string, comment?: string) => jorgeReviewsPlan(projectName, "approve", comment);
export const jorgeRequestsChangesOnPlan = (projectName: string, comment: string) => jorgeReviewsPlan(projectName, "return", comment);

/** What is assigned to Jorge in a project: cycle items and defects. */
export async function jorgeAssignments(projectName: string) {
  const p = await jorge.project(projectName);
  const defects = (await jorge.defects(p.id)).filter((d) => d.assignee === TEAMMATE.alias);
  const items: Doc[] = [];
  for (const c of await jorge.cycles(p.id)) {
    for (const i of await jorge.get<Doc[]>(`/api/cycles/${c.id}/items`)) if (i.assignee === TEAMMATE.alias) items.push(i);
  }
  return { defects, cycleItems: items };
}

/** Jorge's own token for the CLI («Tokens personales»). */
export async function jorgeCreatesPersonalToken(name: string, scopes: string[] = ["projects:read", "runs:write"]) {
  const expiresAt = new Date(Date.now() + 90 * 86_400_000).toISOString();
  return jorge.post<{ token: string }>("/me/tokens", { name, scopes, expiresAt });
}

/** A project token Jorge creates in the team workspace (he must be its Test
 *  Manager: token.manage), e.g. for «Reasignar». */
export async function jorgeCreatesProjectToken(name: string, projectName: string, workspaceName: string = TEAM.workspace) {
  const ws = await jorge.workspace(workspaceName);
  const p = await jorge.project(projectName);
  const expiresAt = new Date(Date.now() + 90 * 86_400_000).toISOString();
  return jorge.post<{ token: string }>(`/workspaces/${ws.id}/tokens`, { name, projectId: p.id, scopes: ["runs:write"], expiresAt });
}

/** Jorge changes something from his computer (a requirement's priority, say):
 *  Liomar's next sync merges it (different fields) or asks (same field). */
export const jorgeEdits = (entity: string, match: (p: Json) => boolean, change: (p: Json) => Json) => jorge.pushEdit(entity, match, change);

// ---- The server administrator (API, when the screen is not the point) ---------------

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  disabled?: boolean;
}

/** An account of the server by its e-mail, as «Administración › Usuarios» lists it. */
export async function adminFindUser(person: Person): Promise<AdminUser> {
  const page = await admin.get<{ users: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(person.email)}&status=all`);
  const u = page.users.find((x) => x.email === person.email);
  if (!u) throw new Error(`the server has no account ${person.email}`);
  return u;
}

/** «Hacer administrador» / «Quitar administrador». */
export async function adminSetAdmin(person: Person, isAdmin: boolean) {
  return admin.put(`/admin/users/${(await adminFindUser(person)).id}/admin`, { isAdmin });
}

/** «Desactivar cuenta…» / «Reactivar cuenta» (successors: the last Test
 *  Manager's workspaces, see /admin/users/:id/disable-impact). */
export async function adminSetDisabled(person: Person, disabled: boolean, reason?: string) {
  return admin.put(`/admin/users/${(await adminFindUser(person)).id}/disabled`, { disabled, reason: reason ?? null });
}

/** «Restablecer contraseña…» with «Prefiero entregarlo yo»: the one-time link. */
export async function adminResetLink(person: Person) {
  return admin.post<{ link?: string; url?: string }>(`/admin/users/${(await adminFindUser(person)).id}/password-reset`, { delivery: "link", locale: "es" });
}

/** «Revocar sus tokens…». */
export async function adminRevokeTokens(person: Person) {
  return admin.post(`/admin/users/${(await adminFindUser(person)).id}/tokens/revoke`, {});
}
