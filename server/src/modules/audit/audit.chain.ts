import { createHash } from "node:crypto";

// The audit hash chain (AUD-01, ADR-0015), as the desktop computes it
// (`audit.rs`). The server writes the web's own chain (AUD-01b) and desktops
// verify it with `audit::verify_chain`, so both sides must produce the same
// bytes: the shared vectors in `src/shared/contracts/fixtures/audit/` hold
// `cargo test` and the server tests to it.
//
// hash = sha256(prevHash ‖ JCS(header) ‖ changesSha256), hex. The header is
// the event without `changes`, its location, its owner bucket, the links and
// the redaction mark (see `header`).

/** One `audit_event` document, as it syncs (camelCase, `audit.rs::payload`).
 *  `changes` and `summary` are JSON text: every copy hashes the same bytes. */
export interface AuditEvent {
  id: string;
  workspaceId: string;
  projectId: string | null;
  at: string;
  hlc: string;
  deviceId: string;
  actor: string;
  onBehalfOf: string | null;
  action: string;
  entity: string;
  entityId: string;
  entityKey: string | null;
  changes: string | null;
  changesSha256: string;
  summary: string | null;
  origin: string;
  chainWorkspaceId: string;
  chainOwner: string;
  chainSeq: number;
  prevHash: string | null;
  hash: string;
  redactedAt: string | null;
}

export const sha256Hex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/** RFC 8785 (JCS) for the subset audit headers use: objects with ASCII keys,
 *  strings, integers within ±(2^53 - 1), booleans and null (`audit.rs::jcs`).
 *  A number parsed from `1.0` is the integer 1 on both sides. Anything else
 *  throws instead of producing a canonical form the desktop would not. */
export function jcs(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    // JSON.stringify escapes exactly what JCS requires (", \, controls as
    // \b \f \n \r \t or lowercase \u00xx) and nothing else, like serde_json.
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`jcs: number ${value} is outside the audit subset`);
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value as object);
    const bad = keys.find((k) => [...k].some((ch) => ch.charCodeAt(0) > 0x7f));
    if (bad !== undefined) throw new Error(`jcs: non-ASCII key ${JSON.stringify(bad)} is outside the audit subset`);
    // ASCII keys: code unit order is byte order (RFC 8785 §3.2.3).
    keys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const obj = value as Record<string, unknown>;
    return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(obj[k])}`).join(",")}}`;
  }
  throw new Error(`jcs: ${typeof value} is outside the audit subset`);
}

/** What is hashed besides `changesSha256` and the previous hash
 *  (`audit.rs::header`). */
export function header(e: AuditEvent): Record<string, unknown> {
  return {
    id: e.id,
    at: e.at,
    hlc: e.hlc,
    deviceId: e.deviceId,
    actor: e.actor,
    onBehalfOf: e.onBehalfOf,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    entityKey: e.entityKey,
    summary: e.summary,
    origin: e.origin,
    chainWorkspaceId: e.chainWorkspaceId,
    chainOwner: e.chainOwner,
    chainSeq: e.chainSeq,
  };
}

/** The hash of an event given its previous link. */
export const hashOf = (e: AuditEvent): string => sha256Hex(`${e.prevHash ?? ""}${jcs(header(e))}${e.changesSha256}`);

/** Where a chain stops being valid (`audit.rs::ChainBreak`). */
export type ChainBreak =
  | { kind: "gap"; expected: number; found: number }
  | { kind: "link"; seq: number }
  | { kind: "hash"; seq: number }
  | { kind: "changes"; seq: number };

/** Checks one chain from its first link; events in any order. A redacted
 *  event (changes null) still verifies. Returns how many links were checked. */
export function verifyChain(events: AuditEvent[]): { ok: true; count: number } | { ok: false; break: ChainBreak } {
  const sorted = [...events].sort((a, b) => a.chainSeq - b.chainSeq);
  let prev: string | null = null;
  for (const [i, e] of sorted.entries()) {
    const expected = i + 1;
    if (e.chainSeq !== expected) return { ok: false, break: { kind: "gap", expected, found: e.chainSeq } };
    if ((e.prevHash ?? null) !== prev) return { ok: false, break: { kind: "link", seq: e.chainSeq } };
    if (e.changes !== null && sha256Hex(e.changes) !== e.changesSha256) {
      return { ok: false, break: { kind: "changes", seq: e.chainSeq } };
    }
    if (hashOf(e) !== e.hash) return { ok: false, break: { kind: "hash", seq: e.chainSeq } };
    prev = e.hash;
  }
  return { ok: true, count: sorted.length };
}
