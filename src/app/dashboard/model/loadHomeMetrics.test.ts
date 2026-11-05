import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { homeMetrics } from "./metricsFixture";
import type { HomeMetrics } from "./metrics";

const platform = vi.hoisted(() => ({ tauri: false, invoke: vi.fn() }));
vi.mock("@shared/platform", () => ({
  isTauri: () => platform.tauri,
  invoke: platform.invoke,
}));
const get = vi.hoisted(() => vi.fn());
vi.mock("@modules/sync-offline", () => ({ serverApi: { get } }));
vi.mock("@shared/diagnostics", () => ({ logClientError: vi.fn() }));

import {
  clearHomeMetricsCache,
  fetchHomeMetrics,
  useHomeMetrics,
} from "./loadHomeMetrics";

/** The `now` and the last day start of the n-th web request. */
const sent = (n: number) => {
  const q = new URLSearchParams(String(get.mock.calls[n][0]).split("?")[1]);
  return { now: Number(q.get("now")), lastDay: Number(q.get("dayStarts")!.split(",").at(-1)) };
};
const synced = () =>
  act(() => {
    window.dispatchEvent(new Event("pharos:synced"));
  });
/** A promise the test settles by hand. */
function deferred() {
  let resolve!: (v: HomeMetrics) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<HomeMetrics>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("home metrics loading (RED-W6)", () => {
  beforeEach(() => {
    platform.tauri = false;
    platform.invoke.mockReset();
    get.mockReset();
    clearHomeMetricsCache();
    vi.useFakeTimers({ now: new Date(2026, 9, 29, 10, 0), toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls the desktop command or the web route with the same request", async () => {
    const request = { dayStarts: [1, 2], now: 3, windows: [{ id: "today", fromIndex: 1 }] };
    platform.tauri = true;
    platform.invoke.mockResolvedValue(homeMetrics({}, 2));
    await fetchHomeMetrics("u1", request);
    expect(platform.invoke).toHaveBeenCalledWith("home_metrics", { userId: "u1", request });

    platform.tauri = false;
    get.mockResolvedValue(homeMetrics({}, 2));
    await fetchHomeMetrics("u1", request);
    expect(get).toHaveBeenCalledWith("/api/home/metrics?dayStarts=1%2C2&now=3&windows=today%3A1");
  });

  it("refuses a payload that is not contract v1", async () => {
    const request = { dayStarts: [1, 2], now: 3, windows: [] };
    for (const bad of [null, [], {}, { ...homeMetrics(), contractVersion: 2 }, homeMetrics({}, 5)]) {
      get.mockResolvedValueOnce(bad);
      await expect(fetchHomeMetrics("u1", request)).rejects.toThrow(/contract v1/);
    }
    get.mockResolvedValueOnce(homeMetrics({}, 2));
    await expect(fetchHomeMetrics("u1", request)).resolves.toBeTruthy();
  });

  it("builds each request when it is sent: a sync later asks up to its own now", async () => {
    get.mockResolvedValue(homeMetrics());
    const { result } = renderHook(() => useHomeMetrics("u1"));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const first = sent(0).now;

    vi.setSystemTime(new Date(2026, 9, 29, 15, 30));
    await synced();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(sent(1).now).toBe(new Date(2026, 9, 29, 15, 30).getTime());
    expect(sent(1).now).toBeGreaterThan(first);
    expect(sent(1).lastDay).toBe(sent(0).lastDay); // same local day
  });

  it("moves to the new local day when a reload finds one, with its own days and key", async () => {
    get.mockResolvedValue(homeMetrics());
    const { result } = renderHook(() => useHomeMetrics("u1"));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current.today.getDate()).toBe(29);

    vi.setSystemTime(new Date(2026, 9, 30, 0, 5));
    await synced();
    await waitFor(() => expect(result.current.today.getDate()).toBe(30));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(sent(1).lastDay).toBe(new Date(2026, 9, 30).getTime());
    // The 29th's payload is not shown as the 30th's: a new key starts empty.
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
  });

  it("moves at midnight on its own (a timer), without waiting for a sync", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ now: new Date(2026, 9, 29, 23, 59, 30) });
    get.mockResolvedValue(homeMetrics());
    const { result } = renderHook(() => useHomeMetrics("u1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(result.current.state.status).toBe("ready");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    expect(result.current.today.getDate()).toBe(30);
    expect(get).toHaveBeenCalledTimes(2);
    expect(sent(1).lastDay).toBe(new Date(2026, 9, 30).getTime());
  });

  it("ignores a response that arrives after a newer one", async () => {
    const slow = deferred();
    const fast = deferred();
    get.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const { result } = renderHook(() => useHomeMetrics("u1"));
    await synced(); // a second request before the first answers
    const newer = homeMetrics({ undated: 2 });
    const older = homeMetrics({ undated: 1 });
    await act(async () => {
      fast.resolve(newer);
      await fast.promise;
    });
    await act(async () => {
      slow.resolve(older);
      await slow.promise;
    });
    expect(result.current.state.data).toBe(newer);
  });

  it("paints the cached payload when coming back, flagged as refreshing", async () => {
    const first = homeMetrics({ undated: 1 });
    get.mockResolvedValueOnce(first);
    const { result, unmount } = renderHook(() => useHomeMetrics("u1"));
    await waitFor(() => expect(result.current.state.data).toBe(first));
    unmount();

    get.mockReturnValueOnce(new Promise(() => {}));
    const again = renderHook(() => useHomeMetrics("u1"));
    expect(again.result.current.state).toMatchObject({ status: "ready", data: first, refreshing: true, stale: false });
  });

  it("keeps the last payload after a failed refresh, with its time", async () => {
    const ok = homeMetrics();
    get.mockResolvedValueOnce(ok);
    const { result } = renderHook(() => useHomeMetrics("u1"));
    await waitFor(() => expect(result.current.state.data).toBe(ok));

    vi.setSystemTime(new Date(2026, 9, 29, 12, 0));
    get.mockRejectedValueOnce(new Error("offline"));
    await synced();
    await waitFor(() => expect(result.current.state).toMatchObject({ stale: true, refreshing: false }));
    expect(result.current.state).toMatchObject({
      status: "ready",
      data: ok,
      at: new Date(2026, 9, 29, 10, 0).getTime(),
    });
  });

  it("starts over for another user: never the previous user's numbers", async () => {
    const mine = homeMetrics({ undated: 7 });
    get.mockResolvedValueOnce(mine).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(({ id }) => useHomeMetrics(id), { initialProps: { id: "u1" } });
    await waitFor(() => expect(result.current.state.data).toBe(mine));
    rerender({ id: "u2" });
    expect(result.current.state).toEqual({ status: "loading", data: null });
  });

  it("reports an error and retries", async () => {
    get.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useHomeMetrics("u1"));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    const ok = homeMetrics();
    get.mockResolvedValueOnce(ok);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.data).toBe(ok));
  });
});
