// Leaving the old web store behind (BASE-10). Before 0.1.0 the browser kept
// the domain in localStorage and pushed it through an outbox. The web is now a
// client of the server, so on each account's first sync with this version:
//
// 1. the changes still in that account's outbox are pushed one last time;
// 2. whatever cannot reach the server is set aside for that account under
//    `pharos.legacy.unsent:<userId>`: changes it refuses, open web conflicts,
//    and the attachments, imported templates and revision history that only
//    ever lived in this browser. The topbar shows a notice
//    (`ui/LegacyUnsentNotice.tsx`) to download it as a JSON file; it is
//    removed only when the user says so, never on a download the page cannot
//    confirm (a blocked or cancelled download must not lose anything);
// 3. the old caches, outbox, conflicts, cursor and clock are removed.
//
// The browser-only data was kept per browser, not per account. An account
// takes the attachments of the cards in its own outbox, and everything else
// only if the old caches were its own (`pharos.sync.cacheOwner`), or nobody's
// (data from before FIX-07, adopted by the first account, as that version
// did). The rest stays for its owner. A network failure changes nothing; it
// is tried again on the next sync. Other accounts' outboxes wait until those
// accounts sign in.

import i18n from "i18next";
import { getSession } from "@modules/auth";
import { saveFile } from "@shared/export/saveFile";
import { notify } from "@shared/ui/notify";
import { batchDeltas, sendIsolating, syncRequest, withRetry } from "../api/transport";

/** A change of the old web outbox. */
interface LegacyDelta {
  entity: string;
  entityId: string;
  op: "upsert" | "delete";
  payload: object;
  revision: number;
  author: string;
  hlc: string;
  refused?: boolean;
}

/** Caches of server data: safe to drop, the server has it all. */
const CACHE_KEYS = [
  "pharos.projects",
  "pharos.testPlans",
  "pharos.testCases",
  "pharos.testCaseCounters",
  "pharos.requirements",
  "pharos.plannerCards",
  "pharos.profile",
  "pharos.deviceId",
  "pharos.hlc",
];
/** Data that only ever lived in this browser, kept per browser. */
const ATTACHMENTS = "pharos.plannerAttachments";
const TEMPLATES = "pharos.templates";
const REVISION_KEYS = ["pharos.testCaseRevisions", "pharos.testPlanRevisions"];
const CACHE_OWNER = "pharos.sync.cacheOwner";

const outboxKey = (userId: string) => `pharos.sync.outbox:${userId}`;
const conflictsKey = (userId: string) => `pharos.sync.conflicts:${userId}`;
const cursorKey = (userId: string) => `pharos.sync.cursor:${userId}`;
/** What the account still has to download (BASE-10). */
export const unsentKey = (userId: string) => `pharos.legacy.unsent:${userId}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function present(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

/** Writes `list` to `key`, or removes the key when nothing is left. */
function keep(key: string, list: unknown[]) {
  if (list.length > 0) localStorage.setItem(key, JSON.stringify(list));
  else localStorage.removeItem(key);
}

const entityKey = (d: { entity: string; entityId: string }) => `${d.entity}:${d.entityId}`;

/** What an account had in the old store and could not reach the server. */
export interface LegacyLeftovers {
  refusedChanges: LegacyDelta[];
  conflicts: unknown[];
  attachments: unknown[];
  templates: unknown[];
  revisions: unknown[];
  /** When the user last downloaded it from the notice (not proof it saved). */
  downloadedAt?: string;
}

/** Items waiting in the leftovers. */
export const leftoverCount = (l: LegacyLeftovers) =>
  l.refusedChanges.length + l.conflicts.length + l.attachments.length + l.templates.length + l.revisions.length;

/** Pushes the old outbox and tells which changes the server did not take. */
async function pushOutbox(token: string, outbox: LegacyDelta[]): Promise<LegacyDelta[]> {
  const left: LegacyDelta[] = outbox.filter((d) => d.refused);
  const send = (part: LegacyDelta[]) =>
    withRetry(() =>
      syncRequest<{ conflicts?: { entity: string; entityId: string }[]; keyConflicts?: { entity: string; entityId: string }[] }>(
        "/sync/push",
        token,
        { method: "POST", body: { deltas: part.map(({ refused: _r, ...d }) => d) } },
      ),
    );
  for (const batch of batchDeltas(outbox.filter((d) => !d.refused))) {
    const refused = await sendIsolating(batch, send, (part, body) => {
      const rejected = new Set([...(body.conflicts ?? []), ...(body.keyConflicts ?? [])].map(entityKey));
      left.push(...part.filter((d) => rejected.has(entityKey(d))));
    });
    left.push(...refused);
  }
  return left;
}

/** Splits the browser-only data into this account's share and the rest. */
function claimBrowserData(userId: string, outbox: LegacyDelta[]) {
  const owner = localStorage.getItem(CACHE_OWNER);
  const ownsCaches = owner === null || owner === userId;
  const myCards = new Set(outbox.filter((d) => d.entity === "planner_card").map((d) => d.entityId));
  if (ownsCaches) for (const c of read<{ id: string }[]>("pharos.plannerCards", [])) myCards.add(c.id);

  const attachments = read<{ cardId?: string }[]>(ATTACHMENTS, []);
  const mine = (a: { cardId?: string }) => ownsCaches || (a.cardId !== undefined && myCards.has(a.cardId));
  const templates = read<{ isBuiltin?: boolean }[]>(TEMPLATES, []).filter((t) => !t.isBuiltin);
  const revisions = REVISION_KEYS.flatMap((k) => read<unknown[]>(k, []));
  return {
    take: {
      attachments: attachments.filter(mine),
      templates: ownsCaches ? templates : [],
      revisions: ownsCaches ? revisions : [],
    },
    leave: {
      attachments: attachments.filter((a) => !mine(a)),
      templates: ownsCaches ? [] : templates,
      /** Revision history of another account stays in the browser. */
      revisions: !ownsCaches && revisions.length > 0,
    },
  };
}

/** Runs the hand-over for the signed-in account; afterwards it finds nothing
 *  of that account and returns at once. Returns how many old changes reached
 *  the server and how many items wait in the account's leftovers. */
export async function drainLegacyWebData(): Promise<{ pushed: number; leftovers: number }> {
  const session = await getSession();
  if (!session) return { pushed: 0, leftovers: 0 };
  const { userId, accessToken } = session;
  const own = [outboxKey(userId), conflictsKey(userId), cursorKey(userId)];
  const shared = [...CACHE_KEYS, ATTACHMENTS, TEMPLATES, ...REVISION_KEYS, CACHE_OWNER];
  const waiting = read<LegacyLeftovers | null>(unsentKey(userId), null);
  if (![...own, ...shared].some(present)) return { pushed: 0, leftovers: waiting ? leftoverCount(waiting) : 0 };

  const outbox = read<LegacyDelta[]>(outboxKey(userId), []);
  const refusedChanges = await pushOutbox(accessToken, outbox);
  const { take, leave } = claimBrowserData(userId, outbox);
  const found: LegacyLeftovers = {
    refusedChanges,
    conflicts: read<unknown[]>(conflictsKey(userId), []),
    ...take,
  };
  const leftovers: LegacyLeftovers = waiting
    ? {
        refusedChanges: [...waiting.refusedChanges, ...found.refusedChanges],
        conflicts: [...waiting.conflicts, ...found.conflicts],
        attachments: [...waiting.attachments, ...found.attachments],
        templates: [...waiting.templates, ...found.templates],
        revisions: [...(waiting.revisions ?? []), ...found.revisions],
      }
    : found;
  const count = leftoverCount(found);
  // Set aside first, then remove: nothing is lost if the page closes between.
  if (leftoverCount(leftovers) > 0) localStorage.setItem(unsentKey(userId), JSON.stringify(leftovers));
  for (const key of [...own, ...CACHE_KEYS]) localStorage.removeItem(key);
  keep(ATTACHMENTS, leave.attachments);
  keep(TEMPLATES, leave.templates);
  if (!leave.revisions) for (const key of REVISION_KEYS) localStorage.removeItem(key);
  const othersLeft = leave.attachments.length > 0 || leave.templates.length > 0 || leave.revisions;
  if (!othersLeft) localStorage.removeItem(CACHE_OWNER);
  if (count > 0) {
    notify(i18n.t("sync.web.legacyLeftovers", { count }), "warning");
    window.dispatchEvent(new CustomEvent("pharos:legacy-unsent"));
  }
  return { pushed: outbox.length - refusedChanges.length, leftovers: leftoverCount(leftovers) };
}

/** The signed-in account's leftovers waiting to be downloaded, if any. */
export async function legacyLeftovers(): Promise<LegacyLeftovers | null> {
  const session = await getSession();
  return session ? read<LegacyLeftovers | null>(unsentKey(session.userId), null) : null;
}

/** Hands the leftovers to the user as a JSON file. They stay until
 *  `discardLegacyLeftovers`: a browser download cannot tell it was saved. */
export async function downloadLegacyLeftovers(): Promise<void> {
  const session = await getSession();
  const leftovers = session ? read<LegacyLeftovers | null>(unsentKey(session.userId), null) : null;
  if (!session || !leftovers) return;
  const { downloadedAt: _d, ...content } = leftovers;
  const day = new Date().toISOString().slice(0, 10);
  await saveFile(`pharos-web-unsent-${day}.json`, JSON.stringify(content, null, 2), "application/json");
  localStorage.setItem(unsentKey(session.userId), JSON.stringify({ ...leftovers, downloadedAt: new Date().toISOString() }));
  window.dispatchEvent(new CustomEvent("pharos:legacy-unsent"));
}

/** Removes the leftovers, on the user's word. */
export async function discardLegacyLeftovers(): Promise<void> {
  const session = await getSession();
  if (session) localStorage.removeItem(unsentKey(session.userId));
  window.dispatchEvent(new CustomEvent("pharos:legacy-unsent"));
}
