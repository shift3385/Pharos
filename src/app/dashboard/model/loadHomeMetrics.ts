import { useCallback, useEffect, useState } from "react";
import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import { logClientError } from "@shared/diagnostics";
import {
  metricsKey,
  metricsRequest,
  type HomeMetrics,
  type HomeMetricsRequest,
} from "./metrics";

/** One read of every execution number of the Home (RED-W6): the desktop's
 *  `home_metrics` command or the server's `GET /api/home/metrics`. Both only
 *  run the shared derivation (step 10). */
export async function fetchHomeMetrics(
  userId: string,
  request: HomeMetricsRequest,
): Promise<HomeMetrics> {
  let payload: unknown;
  if (isTauri()) {
    payload = await invoke<unknown>("home_metrics", { userId, request });
  } else {
    const q = new URLSearchParams({
      dayStarts: request.dayStarts.join(","),
      now: String(request.now),
      windows: request.windows.map((w) => `${w.id}:${w.fromIndex}`).join(","),
    });
    payload = await serverApi.get<unknown>(`/api/home/metrics?${q}`);
  }
  if (!isHomeMetrics(payload, request)) {
    throw new Error("home metrics: not a contract v1 payload");
  }
  return payload;
}

/** The shape the widgets read: an older or newer server, or a proxy page,
 *  shows the error state instead of breaking the page. */
function isHomeMetrics(v: unknown, r: HomeMetricsRequest): v is HomeMetrics {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Partial<HomeMetrics>;
  return (
    m.contractVersion === 1 &&
    Array.isArray(m.daily) &&
    m.daily.length === r.dayStarts.length &&
    typeof m.windows === "object" &&
    m.windows !== null &&
    Array.isArray(m.projects)
  );
}

// Last payload per (user, local day): coming back to Inicio paints it at once
// and refreshes behind it (stale-while-revalidate). Memory only.
const cache = new Map<string, HomeMetrics>();

/** Forgets the cached metrics (tests; and on sign-out). */
export function clearHomeMetricsCache() {
  cache.clear();
}
if (typeof window !== "undefined") {
  window.addEventListener("pharos:signed-out", clearHomeMetricsCache);
}

export type MetricsState =
  | { status: "loading"; data: null }
  | { status: "error"; data: null }
  | { status: "ready"; data: HomeMetrics; refreshing: boolean };

/** The Home's metrics for `ownerId` as of `now` (fixed for the page's life).
 *  Refetches on `pharos:synced`; `retry` after an error. A failed refresh of
 *  a cached payload keeps showing it. */
export function useHomeMetrics(ownerId: string, now: Date) {
  const key = metricsKey(ownerId, now);
  const [state, setState] = useState<MetricsState>(() => {
    const hit = cache.get(key);
    return hit
      ? { status: "ready", data: hit, refreshing: true }
      : { status: "loading", data: null };
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ownerId) return;
    let alive = true;
    const load = () => {
      fetchHomeMetrics(ownerId, metricsRequest(now)).then(
        (data) => {
          cache.set(key, data);
          if (alive) setState({ status: "ready", data, refreshing: false });
        },
        (e: unknown) => {
          logClientError(e, "home metrics");
          if (!alive) return;
          setState((s) =>
            s.status === "ready"
              ? { ...s, refreshing: false }
              : { status: "error", data: null },
          );
        },
      );
    };
    load();
    window.addEventListener("pharos:synced", load);
    return () => {
      alive = false;
      window.removeEventListener("pharos:synced", load);
    };
  }, [ownerId, key, now, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading", data: null });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
