// Leaving the old web store behind (BASE-10). Before 0.1.0 the browser kept
// the domain in localStorage and pushed it through an outbox. The web is now a
// client of the server, so on the account's first sync with this version:
//
// 1. the changes still in that account's outbox are pushed one last time;
// 2. whatever cannot reach the server (changes it refuses, open web conflicts,
//    attachments and imported templates, which only lived in this browser) is
//    handed to the user as a JSON file, so nothing is lost silently;
// 3. the old caches, outbox, conflicts, cursor and clock are removed.
//
// A network failure stops before anything is removed; it is tried again on the
// next sync. Other accounts' outboxes wait until those accounts sign in.

import i18n from "i18next";
import { getSession } from "@modules/auth";
import { saveFile } from "@shared/export/saveFile";
import { notify } from "@shared/ui/notify";
import { batchDeltas, sendIsolating, syncRequest, withRetry, type RemoteDoc } from "../api/transport";

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

/** Old caches shared by every account of the browser. */
const SHARED_KEYS = [
  "pharos.projects",
  "pharos.testPlans",
  "pharos.testPlanRevisions",
  "pharos.testCases",
  "pharos.testCaseRevisions",
  "pharos.testCaseCounters",
  "pharos.requirements",
  "pharos.plannerCards",
  "pharos.plannerAttachments",
  "pharos.templates",
  "pharos.profile",
  "pharos.sync.cacheOwner",
  "pharos.deviceId",
  "pharos.hlc",
];
const outboxKey = (userId: string) => `pharos.sync.outbox:${userId}`;
const conflictsKey = (userId: string) => `pharos.sync.conflicts:${userId}`;
const cursorKey = (userId: string) => `pharos.sync.cursor:${userId}`;

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

const entityKey = (d: { entity: string; entityId: string }) => `${d.entity}:${d.entityId}`;

/** What the account still had in the old store and could not reach the
 *  server. Empty arrays when there was nothing. */
export interface LegacyLeftovers {
  refusedChanges: LegacyDelta[];
  conflicts: unknown[];
  attachments: unknown[];
  templates: unknown[];
}

/** Pushes the old outbox and tells which changes the server did not take. */
async function pushOutbox(token: string, outbox: LegacyDelta[]): Promise<LegacyDelta[]> {
  const left: LegacyDelta[] = outbox.filter((d) => d.refused);
  const send = (part: LegacyDelta[]) =>
    withRetry(() =>
      syncRequest<{ conflicts?: RemoteDoc[]; keyConflicts?: RemoteDoc[] }>("/sync/push", token, {
        method: "POST",
        body: { deltas: part.map(({ refused: _r, ...d }) => d) },
      }),
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

/** Runs the hand-over once for the signed-in account; afterwards it finds
 *  nothing and returns at once. Returns how many old changes reached the
 *  server and how many items went to the file. */
export async function drainLegacyWebData(): Promise<{ pushed: number; leftovers: number }> {
  const none = { pushed: 0, leftovers: 0 };
  const session = await getSession();
  if (!session) return none;
  const { userId, accessToken } = session;
  const keys = [...SHARED_KEYS, outboxKey(userId), conflictsKey(userId), cursorKey(userId)];
  if (!keys.some(present)) return none;

  const outbox = read<LegacyDelta[]>(outboxKey(userId), []);
  const leftovers: LegacyLeftovers = {
    refusedChanges: await pushOutbox(accessToken, outbox),
    conflicts: read<unknown[]>(conflictsKey(userId), []),
    attachments: read<unknown[]>("pharos.plannerAttachments", []),
    templates: read<{ isBuiltin?: boolean }[]>("pharos.templates", []).filter((t) => !t.isBuiltin),
  };
  const count = Object.values(leftovers).reduce((n, list) => n + list.length, 0);
  if (count > 0) {
    const day = new Date().toISOString().slice(0, 10);
    await saveFile(`pharos-web-unsent-${day}.json`, JSON.stringify(leftovers, null, 2), "application/json");
    notify(i18n.t("sync.web.legacyLeftovers", { count }), "warning");
  }
  for (const key of keys) localStorage.removeItem(key);
  return { pushed: outbox.length - leftovers.refusedChanges.length, leftovers: count };
}
