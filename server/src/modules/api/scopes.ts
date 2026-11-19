// Scopes of an API token (INT-02, ADR-0052 §3) and the workspace capability
// each one needs from the token's owner. A token never does more than its
// owner may do today: the request needs the scope AND the owner's current
// role must have the capability.
import type { Capability } from "../workspaces/roles.js";

export const API_SCOPES = [
  "projects:read",
  "runs:read",
  "runs:write",
  "cases:read",
  "cycles:read",
  "defects:read",
  "requirements:read",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const isScope = (v: unknown): v is ApiScope => typeof v === "string" && (API_SCOPES as readonly string[]).includes(v);

/** The capability the owner needs for a request with this scope. Writing
 *  runs is importing results (`result.import`); closing a run also needs
 *  `run.execute`, which the route checks on top. */
export const SCOPE_CAPABILITY: Record<ApiScope, Capability> = {
  "projects:read": "read",
  "runs:read": "read",
  "runs:write": "result.import",
  "cases:read": "read",
  "cycles:read": "read",
  "defects:read": "read",
  "requirements:read": "read",
};
