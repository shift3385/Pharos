import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type { AuditFacets, AuditPage, AuditQuery, AuditVerify } from "../model/audit";

// Administración › Auditoría (AUD-01): the desktop reads its local
// `audit_log` (`audit_read.rs`); the web reads the account's `audit_event`
// documents on the server (`/api/audit-events`). Both answer the same shapes.

function queryString(q: AuditQuery): string {
  const p = new URLSearchParams();
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  q.actors?.forEach((v) => p.append("actors", v));
  q.entities?.forEach((v) => p.append("entities", v));
  q.actions?.forEach((v) => p.append("actions", v));
  q.projectIds?.forEach((v) => p.append("projectIds", v));
  if (q.entityId) p.set("entityId", q.entityId);
  if (q.search) p.set("search", q.search);
  p.set("offset", String(q.offset));
  p.set("limit", String(q.limit));
  return p.toString();
}

export const auditApi = {
  list: (userId: string, query: AuditQuery): Promise<AuditPage> =>
    isTauri()
      ? invoke("audit_list", { userId, query })
      : serverApi.get(`/api/audit-events?${queryString(query)}`),
  facets: (userId: string): Promise<AuditFacets> =>
    isTauri() ? invoke("audit_facets", { userId }) : serverApi.get("/api/audit-events/facets"),
  verify: (userId: string): Promise<AuditVerify> =>
    isTauri() ? invoke("audit_verify", { userId }) : serverApi.get("/api/audit-events/verify"),
};

export { queryString as auditQueryString };
