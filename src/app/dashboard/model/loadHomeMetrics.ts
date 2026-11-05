import { useCallback, useEffect, useRef, useState } from "react";
import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import { logClientError } from "@shared/diagnostics";
import { isoDay } from "./homeData";
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


interface Cached {
  data: HomeMetrics;
  /** When the request was built (epoch ms): «datos de las hh:mm». */
  at: number;
}

// Last payload per (user, local day): coming back to Inicio paints it at once
// and refreshes behind it (stale-while-revalidate). Memory only.
const cache = new Map<string, Cached>();

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
  | {
      status: "ready";
      data: HomeMetrics;
      /** A newer read is on its way («Actualizando…»). */
      refreshing: boolean;
      /** The last refresh failed: this is the payload of `at`. */
      stale: boolean;
      at: number;
    };

const initial = (key: string): MetricsState => {
  const hit = cache.get(key);
  return hit
    ? { status: "ready", data: hit.data, at: hit.at, refreshing: true, stale: false }
    : { status: "loading", data: null };
};

/** Milliseconds from `d` to the next local midnight (DST-safe). */
function untilMidnight(d: Date): number {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return Math.max(1_000, next.getTime() - d.getTime());
}

/** The Home's metrics for `ownerId`, and the local day they belong to.
 *  Each read builds its request at that moment (`now`, the day starts), so a
 *  refresh after a sync covers what happened since. When the local day
 *  changes (a timer at midnight, or any reload that notices) `today` moves,
 *  which changes the cache key and the days of the request. Responses that
 *  arrive after a newer request are ignored. A failed refresh keeps the
 *  last payload, flagged `stale`. A new key (another user, another day)
 *  starts from its own cache entry, never from the previous user's data. */
export function useHomeMetrics(ownerId: string) {
  const [today, setToday] = useState(() => new Date());
  const key = metricsKey(ownerId, today);
  const [state, setState] = useState<MetricsState>(() => initial(key));
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    // Reset during render (no frame with the previous key's numbers).
    setShownKey(key);
    setState(initial(key));
  }
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!ownerId) return;
    let alive = true;
    const load = () => {
      const now = new Date();
      if (isoDay(now) !== isoDay(today)) {
        // A new local day: new key and days; this effect reruns.
        setToday(now);
        return;
      }
      const mine = ++seq.current;
      setState((s) => (s.status === "ready" ? { ...s, refreshing: true } : s));
      fetchHomeMetrics(ownerId, metricsRequest(now)).then(
        (data) => {
          if (!alive || mine !== seq.current) return;
          cache.set(key, { data, at: now.getTime() });
          setState({ status: "ready", data, at: now.getTime(), refreshing: false, stale: false });
        },
        (e: unknown) => {
          logClientError(e, "home metrics");
          if (!alive || mine !== seq.current) return;
          setState((s) =>
            s.status === "ready"
              ? { ...s, refreshing: false, stale: true }
              : { status: "error", data: null },
          );
        },
      );
    };
    load();
    window.addEventListener("pharos:synced", load);
    const midnight = window.setTimeout(() => setToday(new Date()), untilMidnight(new Date()));
    return () => {
      alive = false;
      window.removeEventListener("pharos:synced", load);
      window.clearTimeout(midnight);
    };
  }, [ownerId, key, today, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading", data: null });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry, today };
}
