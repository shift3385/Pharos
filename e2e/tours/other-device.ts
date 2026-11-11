// A "second device" for the sync-conflict tour (MAN-01): it signs in to the
// tour's own API (localhost:3100, never the user's), pulls the account's
// documents and pushes a newer version of one of them, exactly as another
// Pharos would. When the desktop app then syncs its own edit of the same
// document, the server answers with a conflict and the app shows its panel.
import { readFileSync } from "node:fs";
import { PERSONA } from "../../scripts/manual/persona.mjs";

const API = process.env.PHAROS_TOURS_API ?? "";
const FEATURES = "stable-steps,append-only,runs,cycles,defects,key-conflicts";
const VERSION = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

interface RemoteDoc {
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  revision: number;
  author: string;
  deleted: boolean;
  hlc: string;
}

async function call(path: string, init: RequestInit & { token?: string } = {}) {
  if (new URL(API).port === "3000") throw new Error("the second device never talks to the user's API on port 3000");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-pharos-sync-features": FEATURES,
      // The server only syncs with app versions it supports: say ours.
      "x-pharos-version": VERSION,
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

/** Edits, from another device, the first live `entity` whose payload matches. */
export async function editOnOtherDevice(
  entity: string,
  match: (payload: Record<string, unknown>) => boolean,
  change: (payload: Record<string, unknown>) => Record<string, unknown>,
) {
  if (!API) throw new Error("PHAROS_TOURS_API is not set (run the tours with npm run manual)");
  // The tour account (NC-052): run-tours passes it; the default is the same.
  const email = process.env.TEST_USER_EMAIL ?? PERSONA.email;
  const password = process.env.TEST_USER_PASSWORD ?? "supersecret1";
  const { accessToken } = (await call("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })) as {
    accessToken: string;
  };
  let since = 0;
  let found: RemoteDoc | undefined;
  for (;;) {
    const page = (await call(`/sync/pull?since=${since}`, { token: accessToken })) as {
      docs: (RemoteDoc & { seq: number })[];
      cursor: number;
      hasMore: boolean;
    };
    found ??= page.docs.find((d) => d.entity === entity && !d.deleted && match(d.payload));
    since = page.cursor;
    if (!page.hasMore) break;
  }
  if (!found) throw new Error(`no ${entity} matched on the server (has the app synced it?)`);
  const wall = String(Date.now() + 60_000).padStart(15, "0");
  const answer = (await call("/sync/push", {
    method: "POST",
    token: accessToken,
    body: JSON.stringify({
      deltas: [
        {
          entity,
          entityId: found.entityId,
          op: "upsert",
          payload: change(found.payload),
          revision: found.revision + 1,
          author: found.author,
          hlc: `${wall}-00000-tour-second-device`,
          baseRevision: found.revision,
          baseHlc: found.hlc,
        },
      ],
    }),
  })) as { conflicts?: unknown[] };
  if (answer.conflicts?.length) throw new Error("the second device's own push conflicted");
}
