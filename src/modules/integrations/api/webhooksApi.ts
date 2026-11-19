// Outgoing webhooks of a workspace (INT-03, ADR-0052 §4). Always against the
// server; the secret comes back once, from `create` and `rotate`.

import { serverApi } from "@modules/sync-offline";

export const WEBHOOK_EVENTS = [
  "run.created",
  "run.results_uploaded",
  "run.completed",
  "cycle.closed",
  "defect.created",
  "defect.status_changed",
  "review.decided",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** What a CI bot usually wants: the run's results and its end. */
export const DEFAULT_EVENTS: WebhookEvent[] = ["run.results_uploaded", "run.completed"];

export interface Webhook {
  id: string;
  workspaceId: string;
  name: string;
  /** The whole URL for a Test Manager; only its host for the others. */
  url: string;
  projectId: string | null;
  projectName: string | null;
  events: WebhookEvent[];
  active: boolean;
  disabledReason: "manual" | "failures" | null;
  consecutiveFailures: number;
  rotating: boolean;
  lastDelivery: { status: string; httpStatus: number | null; at: string } | null;
  createdAt: string;
}

export interface Delivery {
  id: string;
  eventType: string;
  status: "pending" | "delivered" | "failed" | "abandoned";
  attempt: number;
  nextAttemptAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
  lastDurationMs: number | null;
  lastResponse: string | null;
  createdAt: string;
  deliveredAt: string | null;
  payload: Record<string, unknown>;
}

export interface WebhookInput {
  name: string;
  url: string;
  projectId: string | null;
  events: WebhookEvent[];
}

const base = (workspaceId: string) => `/workspaces/${workspaceId}/webhooks`;

export const webhooksApi = {
  list: (workspaceId: string) => serverApi.get<{ webhooks: Webhook[]; enabled: boolean }>(base(workspaceId)),
  create: (workspaceId: string, input: WebhookInput) =>
    serverApi.post<{ secret: string; view: Webhook }>(base(workspaceId), input),
  update: (workspaceId: string, id: string, input: Partial<WebhookInput> & { active?: boolean }) =>
    serverApi.patch<Webhook>(`${base(workspaceId)}/${id}`, input),
  remove: (workspaceId: string, id: string) => serverApi.remove(`${base(workspaceId)}/${id}`, id),
  rotate: (workspaceId: string, id: string) =>
    serverApi.post<{ secret: string; view: Webhook }>(`${base(workspaceId)}/${id}/rotate-secret`, {}),
  test: (workspaceId: string, id: string) => serverApi.post<{ deliveryId: string }>(`${base(workspaceId)}/${id}/test`, {}),
  deliveries: async (workspaceId: string, id: string) =>
    (await serverApi.get<{ deliveries: Delivery[] }>(`${base(workspaceId)}/${id}/deliveries`)).deliveries,
  redeliver: (workspaceId: string, id: string, deliveryId: string) =>
    serverApi.post<{ queued: boolean }>(`${base(workspaceId)}/${id}/deliveries/${deliveryId}/redeliver`, {}),
};
