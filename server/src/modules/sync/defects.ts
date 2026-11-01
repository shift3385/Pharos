// Defects on the server (DEF-01, ADR-0016): the deterministic link id, the
// conversion of a planner defect card and the data step of migration 0010
// that converts the cards this server stores. The same code as the desktop's
// `src-tauri/src/defects/{ids,convert}.rs`; all of them check
// `src-tauri/tests/fixtures/defect-vectors.json`.

import type { PoolClient } from "pg";
import { jcs, uuidV5 } from "./stable-steps";

/** UUIDv5 namespace of defect link ids. Never changes. */
export const NS_DEFECT_LINK = "21d4651e-667c-5993-bf7d-4d2f8399f56e";

export const DEFECT_STATUSES = [
  "new",
  "open",
  "in_progress",
  "fixed",
  "retest",
  "closed",
  "rejected",
  "deferred",
] as const;
export const DEFECT_SEVERITIES = ["critical", "major", "minor", "trivial"] as const;
export const DEFECT_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const DEFECT_RESOLUTIONS = ["fixed", "duplicate", "not_reproducible", "wont_fix", "by_design"] as const;
export const LINK_TARGET_KINDS = ["result", "test_case", "requirement", "finding", "session_note"] as const;

/** `UUIDv5(NS_DEFECT_LINK, JCS([defectId, targetKind, targetId]))`. */
export const linkId = (defectId: string, targetKind: string, targetId: string): string =>
  uuidV5(NS_DEFECT_LINK, jcs([defectId, targetKind, targetId]));

/** The fixed lifecycle (ADR-0016, «Implementación»): the statuses each one
 *  may move to. */
export const NEXT_STATUSES: Record<string, readonly string[]> = {
  new: ["open", "rejected", "deferred"],
  open: ["in_progress", "rejected", "deferred"],
  in_progress: ["fixed"],
  fixed: ["retest"],
  retest: ["closed", "open"],
  closed: ["open"],
  rejected: ["open"],
  deferred: ["open"],
};

export const transitionAllowed = (from: string, to: string): boolean =>
  from === to || (NEXT_STATUSES[from] ?? []).includes(to);

export const needsResolution = (status: string): boolean => status === "closed" || status === "rejected";

type Json = Record<string, unknown>;
const str = (p: Json, k: string): string => (typeof p[k] === "string" ? (p[k] as string) : "");

const STATUS_OF: Record<string, [string, string | null]> = {
  in_progress: ["in_progress", null],
  in_review: ["retest", null],
  done: ["closed", "fixed"],
};

/** A planner defect card payload as a defect payload and its link payloads
 *  (`convert.rs::from_card`). */
export function fromCard(card: Json): { defect: Json; links: Json[] } {
  const id = str(card, "id");
  const data: Json =
    card.data && typeof card.data === "object" && !Array.isArray(card.data) ? { ...(card.data as Json) } : {};
  const description = typeof data.description === "string" ? data.description : "";
  const caseIds = Array.isArray(data.testCaseIds) ? data.testCaseIds : [];
  delete data.description;
  delete data.testCaseIds;
  const [status, resolution] = STATUS_OF[str(card, "status")] ?? ["new", null];
  const priority = (DEFECT_PRIORITIES as readonly string[]).includes(str(card, "priority"))
    ? str(card, "priority")
    : "medium";
  const at = (k: string) => (card[k] === undefined ? null : card[k]);
  const defect: Json = {
    id,
    workspaceId: str(card, "workspaceId"),
    projectId: str(card, "projectId"),
    defectKey: str(card, "cardKey"),
    title: str(card, "title"),
    description,
    stepsToReproduce: "",
    expected: null,
    actual: null,
    severity: "major",
    priority,
    status,
    resolution,
    foundInRunId: null,
    foundInBuild: null,
    foundInEnvironment: null,
    fixedInBuild: null,
    reporter: str(card, "ownerId"),
    assignee: null,
    externalSystem: null,
    externalKey: null,
    externalUrl: null,
    externalSyncedAt: null,
    data,
    createdAt: at("createdAt"),
    updatedAt: at("updatedAt"),
  };
  const seen = new Set<string>();
  const links = caseIds
    .filter((c): c is string => typeof c === "string" && c !== "" && !seen.has(c) && Boolean(seen.add(c)))
    .map((caseId) => ({
      id: linkId(id, "test_case", caseId),
      workspaceId: str(card, "workspaceId"),
      projectId: str(card, "projectId"),
      defectId: id,
      targetKind: "test_case",
      targetId: caseId,
      createdAt: at("createdAt"),
      updatedAt: at("updatedAt"),
    }));
  return { defect, links };
}

/** Data step of migration `0010_defects.sql`, in its transaction: every
 *  planner card document of kind `defect` (live or deleted, any account)
 *  becomes a `defect` document with the card's revision, HLC and author, plus
 *  its `defect_link` documents (revision 1, the card's HLC); a live card
 *  becomes a tombstone (revision + 1, payload kept). Every written document
 *  gets a new seq, so devices pull them. A desktop that converted its own copy
 *  (same function, same ids) holds the card's base, so it converges without a
 *  push or a conflict. Idempotent: a defect already stored is left alone. */
export async function convertPlannerDefects(client: PoolClient): Promise<{ defects: number; links: number }> {
  const { rows } = await client.query<{
    user_id: string;
    entity_id: string;
    payload: Json;
    revision: number;
    author: string;
    deleted: boolean;
    hlc: string;
  }>(
    `SELECT user_id, entity_id, payload, revision, author, deleted, hlc FROM documents
      WHERE entity = 'planner_card' AND payload->>'kind' = 'defect'
      ORDER BY user_id, seq`,
  );
  let defects = 0;
  let links = 0;
  for (const card of rows) {
    const taken = await client.query(
      `SELECT 1 FROM documents WHERE user_id = $1 AND entity = 'defect' AND entity_id = $2`,
      [card.user_id, card.entity_id],
    );
    if (taken.rowCount) continue;
    const { defect, links: cardLinks } = fromCard({ ...card.payload, id: card.entity_id });
    await client.query(
      `INSERT INTO documents (user_id, entity, entity_id, payload, revision, author, deleted, hlc, updated_at, seq)
       VALUES ($1, 'defect', $2, $3, $4, $5, $6, $7, now(), nextval('documents_seq'))`,
      [card.user_id, card.entity_id, defect, card.revision, card.author, card.deleted, card.hlc],
    );
    defects++;
    for (const link of cardLinks) {
      await client.query(
        `INSERT INTO documents (user_id, entity, entity_id, payload, revision, author, deleted, hlc, updated_at, seq)
         VALUES ($1, 'defect_link', $2, $3, 1, $4, false, $5, now(), nextval('documents_seq'))
         ON CONFLICT (user_id, entity, entity_id) DO NOTHING`,
        [card.user_id, link.id, link, card.author, card.hlc],
      );
      links++;
    }
    if (!card.deleted) {
      await client.query(
        `UPDATE documents SET deleted = true, revision = revision + 1, updated_at = now(),
                seq = nextval('documents_seq')
          WHERE user_id = $1 AND entity = 'planner_card' AND entity_id = $2`,
        [card.user_id, card.entity_id],
      );
    }
  }
  return { defects, links };
}
