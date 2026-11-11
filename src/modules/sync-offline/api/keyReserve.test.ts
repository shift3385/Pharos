// DAT-04: with a connection, the desktop leases exactly the numbers a new key
// needs, right before creating it; it never blocks creating.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ desktop: true, invoke: vi.fn() }));
vi.mock("@shared/platform", async (orig) => ({
  ...(await orig<typeof import("@shared/platform")>()),
  isTauri: () => platform.desktop,
  invoke: platform.invoke,
}));
const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@modules/auth", () => ({ getSession: auth.getSession }));
const transport = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./sessionRequest", () => ({ sessionRequester: () => transport.request }));

import { reserveKeys } from "./keyReserve";

const lease = { projectId: "p1", kind: "requirement", prefix: "REQ-", floor: 3, size: 1 };
const block = { projectId: "p1", kind: "requirement", start: 3, end: 3 };

beforeEach(() => {
  platform.desktop = true;
  platform.invoke.mockReset();
  auth.getSession.mockResolvedValue({ accessToken: "t", userId: "u1" });
  transport.request.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("reserveKeys (DAT-04)", () => {
  it("leases what the desktop asks for and stores it", async () => {
    platform.invoke.mockImplementation(async (cmd: string) => (cmd === "key_lease_for" ? lease : 0));
    transport.request.mockResolvedValue({ blocks: [block] });
    await reserveKeys("p1", "requirement");
    expect(platform.invoke).toHaveBeenCalledWith("key_lease_for", {
      userId: "u1",
      projectId: "p1",
      kind: "requirement",
      count: 1,
    });
    expect(transport.request).toHaveBeenCalledWith("/sync/key-blocks", {
      method: "POST",
      body: { requests: [lease] },
    });
    expect(platform.invoke).toHaveBeenCalledWith("key_blocks_apply", { userId: "u1", blocks: [block] });
  });

  it("asks nothing when the desktop still has numbers, on the web or signed out", async () => {
    platform.invoke.mockResolvedValue(null);
    await reserveKeys("p1", "case");
    expect(transport.request).not.toHaveBeenCalled();

    platform.invoke.mockClear();
    auth.getSession.mockResolvedValue(null);
    await reserveKeys("p1", "case");
    expect(platform.invoke).not.toHaveBeenCalled();

    platform.desktop = false;
    await reserveKeys("p1", "case");
    expect(platform.invoke).not.toHaveBeenCalled();
  });

  it("never stops the creation: a failed or slow server leaves the key provisional", async () => {
    platform.invoke.mockImplementation(async (cmd: string) => (cmd === "key_lease_for" ? lease : 0));
    transport.request.mockRejectedValue(new Error("offline"));
    await expect(reserveKeys("p1", "requirement")).resolves.toBeUndefined();
    expect(platform.invoke).not.toHaveBeenCalledWith("key_blocks_apply", expect.anything());

    vi.useFakeTimers();
    transport.request.mockReturnValue(new Promise(() => undefined));
    const pending = reserveKeys("p1", "requirement");
    await vi.advanceTimersByTimeAsync(4000);
    await expect(pending).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
