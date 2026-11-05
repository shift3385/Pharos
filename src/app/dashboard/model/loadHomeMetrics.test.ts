import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { homeMetrics } from "./metricsFixture";

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

const now = new Date(2026, 9, 29, 10);

describe("home metrics loading (RED-W6)", () => {
  beforeEach(() => {
    platform.tauri = false;
    platform.invoke.mockReset();
    get.mockReset();
    clearHomeMetricsCache();
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
    expect(get).toHaveBeenCalledWith(
      "/api/home/metrics?dayStarts=1%2C2&now=3&windows=today%3A1",
    );
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

  it("loads, refreshes on sync and paints the cached payload when coming back", async () => {
    const first = homeMetrics({ undated: 1 });
    const second = homeMetrics({ undated: 2 });
    get.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { result, unmount } = renderHook(() => useHomeMetrics("u1", now));
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state.data).toBe(first));

    act(() => {
      window.dispatchEvent(new Event("pharos:synced"));
    });
    await waitFor(() => expect(result.current.state.data).toBe(second));
    unmount();

    // Back to Inicio: the last payload at once, refreshed behind it.
    get.mockReturnValueOnce(new Promise(() => {}));
    const again = renderHook(() => useHomeMetrics("u1", now));
    expect(again.result.current.state).toEqual({
      status: "ready",
      data: second,
      refreshing: true,
    });
  });

  it("reports an error, retries, and keeps a cached payload when a refresh fails", async () => {
    get.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useHomeMetrics("u1", now));
    await waitFor(() => expect(result.current.state.status).toBe("error"));

    const ok = homeMetrics();
    get.mockResolvedValueOnce(ok);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.data).toBe(ok));

    get.mockRejectedValueOnce(new Error("offline"));
    act(() => {
      window.dispatchEvent(new Event("pharos:synced"));
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
    expect(result.current.state).toMatchObject({ status: "ready", data: ok });
  });
});
