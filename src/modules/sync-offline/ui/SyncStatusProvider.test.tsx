// The hybrid sync (NC-025, MAN-03): off by default; on, automatic every few
// minutes counted from the last sync, never two at once and none offline.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderWithProviders, i18n } from "@test/utils";
import { SYNC_SETTINGS_EVENT } from "@modules/admin";
import { SyncStatusProvider } from "./SyncIndicator";
import { useSyncStatus } from "./syncStatusContext";

const syncAny = vi.fn();
vi.mock("../api/syncApi", async (orig) => ({
  ...(await orig<typeof import("../api/syncApi")>()),
  syncAny: () => syncAny(),
  syncLocalState: () => Promise.resolve({ pending: 0, conflicts: 0 }),
}));
vi.mock("../api/purgeApi", () => ({ purgeDeleted: () => Promise.resolve() }));

const MIN = 60_000;
let manual: (() => void) | undefined;
function Probe() {
  manual = useSyncStatus()?.runSync;
  return null;
}

function setSync(autoSync: boolean, autoSyncMinutes: number) {
  localStorage.setItem("pharos.admin.settings", JSON.stringify({ autoSync, autoSyncMinutes }));
}
const online = (value: boolean) => Object.defineProperty(navigator, "onLine", { value, configurable: true });

async function start() {
  renderWithProviders(
    <SyncStatusProvider>
      <Probe />
    </SyncStatusProvider>,
  );
  // The sign-in sync runs first, whatever the setting.
  await act(() => vi.advanceTimersByTimeAsync(10));
  expect(syncAny).toHaveBeenCalledTimes(1);
}
const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("SyncStatusProvider · hybrid sync (NC-025)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    vi.useFakeTimers();
    localStorage.clear();
    online(true);
    syncAny.mockReset().mockResolvedValue({ pushed: 0, pulled: 0, conflicts: 0 });
  });
  afterEach(() => {
    vi.useRealTimers();
    online(true);
  });

  it("is off by default: only the sign-in sync and «Sincronizar ahora» run", async () => {
    await start();
    await wait(30 * MIN);
    expect(syncAny).toHaveBeenCalledTimes(1);
    await act(async () => manual?.());
    expect(syncAny).toHaveBeenCalledTimes(2);
  });

  it("switched on, syncs on its own every N minutes", async () => {
    setSync(true, 5);
    await start();
    await wait(4 * MIN);
    expect(syncAny).toHaveBeenCalledTimes(1);
    await wait(1 * MIN);
    expect(syncAny).toHaveBeenCalledTimes(2);
  });

  it("«Sincronizar ahora» restarts the timer: the next automatic one is N minutes after it", async () => {
    setSync(true, 5);
    await start();
    await wait(3 * MIN);
    await act(async () => manual?.());
    expect(syncAny).toHaveBeenCalledTimes(2);
    // Minute 5 since sign-in, 2 since the manual sync: nothing yet.
    await wait(2 * MIN);
    expect(syncAny).toHaveBeenCalledTimes(2);
    await wait(3 * MIN);
    expect(syncAny).toHaveBeenCalledTimes(3);
  });

  it("the sync on reconnect restarts the timer too", async () => {
    setSync(true, 5);
    await start();
    await wait(3 * MIN);
    await act(async () => window.dispatchEvent(new Event("online")));
    await wait(10);
    expect(syncAny).toHaveBeenCalledTimes(2);
    await wait(4 * MIN);
    expect(syncAny).toHaveBeenCalledTimes(2);
    await wait(1 * MIN);
    expect(syncAny).toHaveBeenCalledTimes(3);
  });

  it("skips the rounds while offline", async () => {
    setSync(true, 1);
    await start();
    online(false);
    await wait(3 * MIN);
    expect(syncAny).toHaveBeenCalledTimes(1);
  });

  it("never runs two at once: a tick or the button during a sync does nothing", async () => {
    setSync(true, 1);
    await start();
    syncAny.mockReturnValue(new Promise(() => {}));
    await wait(1 * MIN);
    expect(syncAny).toHaveBeenCalledTimes(2);
    await wait(3 * MIN);
    await act(async () => manual?.());
    expect(syncAny).toHaveBeenCalledTimes(2);
  });

  it("turning it on applies at once, without reloading", async () => {
    await start();
    setSync(true, 1);
    await act(async () => window.dispatchEvent(new Event(SYNC_SETTINGS_EVENT)));
    await wait(1 * MIN);
    expect(syncAny).toHaveBeenCalledTimes(2);
  });
});
